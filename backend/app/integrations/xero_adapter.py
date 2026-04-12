"""Xero OAuth2 adapter — all Xero API interactions live here."""
import asyncio
import logging
import re
import urllib.parse
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.config import settings
from app.core.encryption import encrypt, decrypt
from app.models.database import Organisation, Account, Transaction, BankStatement
from app.models.schemas import SyncResponse

logger = logging.getLogger(__name__)

XERO_AUTH_URL = "https://login.xero.com/identity/connect/authorize"
XERO_TOKEN_URL = "https://identity.xero.com/connect/token"
XERO_CONNECTIONS_URL = "https://api.xero.com/connections"
XERO_API_BASE = "https://api.xero.com/api.xro/2.0"
XERO_SCOPES = (
    "openid profile email offline_access "
    "accounting.banktransactions.read "
    "accounting.banktransactions "
    "accounting.invoices.read "
    "accounting.invoices "
    "accounting.contacts.read "
    "accounting.contacts "
    "accounting.settings.read "
    "accounting.transactions.read"
)


def _parse_xero_date(date_str: Optional[str]):
    """Parse Xero's /Date(ms+offset)/ format or ISO 8601 → Python date."""
    if not date_str:
        return None
    match = re.match(r"/Date\((\d+)([+-]\d+)?\)/", date_str)
    if match:
        ms = int(match.group(1))
        return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).date()
    try:
        return datetime.fromisoformat(date_str.rstrip("Z")).date()
    except ValueError:
        return None


class XeroAdapter:
    def __init__(self, organisation: Organisation):
        self.organisation = organisation

    # ------------------------------------------------------------------
    # OAuth2
    # ------------------------------------------------------------------

    @classmethod
    def get_auth_url(cls) -> str:
        params = {
            "response_type": "code",
            "client_id": settings.xero_client_id,
            "redirect_uri": settings.xero_redirect_uri,
            "scope": XERO_SCOPES,
            "state": "xero_auth",
        }
        return f"{XERO_AUTH_URL}?{urllib.parse.urlencode(params)}"

    @classmethod
    async def handle_callback(cls, code: str, db: AsyncSession) -> "Organisation":
        """Exchange auth code for tokens, upsert Organisation in DB."""
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                XERO_TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": settings.xero_redirect_uri,
                },
                auth=(settings.xero_client_id, settings.xero_client_secret),
            )
            resp.raise_for_status()
            token_data = resp.json()

        access_token = token_data["access_token"]
        refresh_token = token_data["refresh_token"]
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=token_data["expires_in"])

        # Fetch connected tenants
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                XERO_CONNECTIONS_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            resp.raise_for_status()
            connections = resp.json()

        if not connections:
            raise ValueError("No Xero organisations found for this account")

        tenant = connections[0]
        tenant_id = tenant["tenantId"]
        tenant_name = tenant.get("tenantName", "Unknown Organisation")

        result = await db.execute(
            select(Organisation).where(Organisation.xero_tenant_id == tenant_id)
        )
        org = result.scalar_one_or_none()

        if org is None:
            org = Organisation(
                name=tenant_name,
                xero_tenant_id=tenant_id,
                xero_access_token=encrypt(access_token),
                xero_refresh_token=encrypt(refresh_token),
                xero_token_expires_at=expires_at,
            )
            db.add(org)
        else:
            org.xero_access_token = encrypt(access_token)
            org.xero_refresh_token = encrypt(refresh_token)
            org.xero_token_expires_at = expires_at
            org.name = tenant_name

        await db.commit()
        await db.refresh(org)
        return org

    # ------------------------------------------------------------------
    # Token management
    # ------------------------------------------------------------------

    async def _ensure_valid_token(self, db: AsyncSession) -> str:
        """Return a valid access token, refreshing if it's about to expire."""
        org = self.organisation
        now = datetime.now(timezone.utc)

        if (
            org.xero_token_expires_at
            and org.xero_token_expires_at > now + timedelta(seconds=60)
        ):
            return decrypt(org.xero_access_token)

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                XERO_TOKEN_URL,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": decrypt(org.xero_refresh_token),
                },
                auth=(settings.xero_client_id, settings.xero_client_secret),
            )
            resp.raise_for_status()
            token_data = resp.json()

        new_access = token_data["access_token"]
        new_refresh = token_data.get("refresh_token")
        org.xero_access_token = encrypt(new_access)
        org.xero_refresh_token = encrypt(new_refresh) if new_refresh else org.xero_refresh_token
        org.xero_token_expires_at = (
            datetime.now(timezone.utc) + timedelta(seconds=token_data["expires_in"])
        )
        await db.commit()
        await db.refresh(org)
        return new_access

    def _api_headers(self, access_token: str, since: Optional[datetime] = None) -> dict:
        """Build request headers, optionally including If-Modified-Since for incremental sync.

        Xero honours this header on all accounting endpoints: it returns only
        records modified since the given UTC timestamp, dramatically reducing
        payload size on subsequent syncs.
        """
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Xero-tenant-id": self.organisation.xero_tenant_id,
            "Accept": "application/json",
        }
        if since is not None:
            # RFC 1123 in UTC — Xero expects "Tue, 01 Apr 2025 10:00:00 GMT"
            if since.tzinfo is None:
                since = since.replace(tzinfo=timezone.utc)
            headers["If-Modified-Since"] = since.astimezone(timezone.utc).strftime(
                "%a, %d %b %Y %H:%M:%S GMT"
            )
        return headers

    async def _get_with_retry(
        self,
        client: httpx.AsyncClient,
        url: str,
        headers: dict,
        params: Optional[dict] = None,
    ) -> dict:
        """GET with rate-limit (429) back-off, up to 3 attempts.

        Returns an empty dict for 304 Not Modified so callers can safely
        `.get("Accounts", [])` etc. without special-casing incremental sync.
        """
        for attempt in range(3):
            resp = await client.get(url, headers=headers, params=params)
            if resp.status_code == 429:
                logger.warning("Xero rate limit hit, waiting 60 s (attempt %d)", attempt + 1)
                await asyncio.sleep(60)
                continue
            if resp.status_code == 304:
                return {}
            resp.raise_for_status()
            return resp.json()
        raise RuntimeError(f"Xero API failed after 3 attempts: {url}")

    # ------------------------------------------------------------------
    # Sync methods
    # ------------------------------------------------------------------

    async def sync_accounts(self, db: AsyncSession, since: Optional[datetime] = None) -> int:
        token = await self._ensure_valid_token(db)
        headers = self._api_headers(token, since=since)

        async with httpx.AsyncClient(timeout=30.0) as client:
            data = await self._get_with_retry(client, f"{XERO_API_BASE}/Accounts", headers)

        count = 0
        for item in data.get("Accounts", []):
            result = await db.execute(
                select(Account).where(Account.xero_id == item["AccountID"])
            )
            acc = result.scalar_one_or_none()
            if acc is None:
                acc = Account(
                    organisation_id=self.organisation.id,
                    xero_id=item["AccountID"],
                    code=item.get("Code"),
                    name=item["Name"],
                    type=item.get("Type", ""),
                    tax_type=item.get("TaxType"),
                )
                db.add(acc)
            else:
                acc.code = item.get("Code")
                acc.name = item["Name"]
                acc.type = item.get("Type", "")
                acc.tax_type = item.get("TaxType")
            count += 1

        await db.commit()
        logger.info("Synced %d accounts for org %s", count, self.organisation.id)
        return count

    async def sync_transactions(self, db: AsyncSession, since: Optional[datetime] = None) -> int:
        token = await self._ensure_valid_token(db)
        headers = self._api_headers(token, since=since)

        count = 0
        page = 1

        async with httpx.AsyncClient(timeout=60.0) as client:
            while True:
                data = await self._get_with_retry(
                    client,
                    f"{XERO_API_BASE}/BankTransactions",
                    headers,
                    params={"page": page},
                )
                items = data.get("BankTransactions", [])
                if not items:
                    break

                for item in items:
                    if item.get("Status") == "DELETED":
                        continue

                    xero_id = item["BankTransactionID"]
                    tx_date = _parse_xero_date(item.get("Date"))
                    if tx_date is None:
                        continue

                    # Resolve account
                    bank_account_xero_id = item.get("BankAccount", {}).get("AccountID")
                    account_id = None
                    if bank_account_xero_id:
                        acc_result = await db.execute(
                            select(Account).where(Account.xero_id == bank_account_xero_id)
                        )
                        acc = acc_result.scalar_one_or_none()
                        if acc:
                            account_id = acc.id

                    # Build description
                    line_items = item.get("LineItems", [])
                    description = (
                        line_items[0].get("Description", "")
                        if line_items
                        else ""
                    )
                    if not description:
                        description = (
                            item.get("Contact", {}).get("Name")
                            or item.get("Reference")
                            or "Unknown"
                        )

                    # SPEND transactions are negative
                    amount = Decimal(str(item.get("Total", 0)))
                    if item.get("Type") == "SPEND":
                        amount = -abs(amount)

                    result = await db.execute(
                        select(Transaction).where(Transaction.xero_id == xero_id)
                    )
                    tx = result.scalar_one_or_none()
                    if tx is None:
                        tx = Transaction(
                            organisation_id=self.organisation.id,
                            account_id=account_id,
                            xero_id=xero_id,
                            date=tx_date,
                            amount=amount,
                            description=description,
                            reference=item.get("Reference"),
                        )
                        db.add(tx)
                    else:
                        tx.date = tx_date
                        tx.amount = amount
                        tx.description = description
                        tx.reference = item.get("Reference")
                    count += 1

                await db.commit()

                if len(items) < 100:
                    break
                page += 1

        # Also pull paid invoices and bills as transactions
        page = 1
        async with httpx.AsyncClient(timeout=60.0) as client:
            while True:
                data = await self._get_with_retry(
                    client,
                    f"{XERO_API_BASE}/Invoices",
                    headers,
                    params={"page": page, "Statuses": "PAID,AUTHORISED"},
                )
                items = data.get("Invoices", [])
                if not items:
                    break

                for item in items:
                    xero_id = "inv-" + item["InvoiceID"]
                    tx_date = _parse_xero_date(item.get("Date") or item.get("DateString"))
                    if tx_date is None:
                        continue

                    contact_name = item.get("Contact", {}).get("Name", "Unknown")
                    invoice_number = item.get("InvoiceNumber", "")
                    description = f"{contact_name} — {invoice_number}" if invoice_number else contact_name

                    # ACCPAY = bill (money out), ACCREC = invoice (money in)
                    amount = Decimal(str(item.get("Total", 0)))
                    if item.get("Type") == "ACCPAY":
                        amount = -abs(amount)

                    result = await db.execute(
                        select(Transaction).where(Transaction.xero_id == xero_id)
                    )
                    tx = result.scalar_one_or_none()
                    if tx is None:
                        tx = Transaction(
                            organisation_id=self.organisation.id,
                            xero_id=xero_id,
                            date=tx_date,
                            amount=amount,
                            description=description,
                            reference=invoice_number or None,
                        )
                        db.add(tx)
                    else:
                        tx.date = tx_date
                        tx.amount = amount
                        tx.description = description
                    count += 1

                await db.commit()

                if len(items) < 100:
                    break
                page += 1

        # Also pull Payments (captures bank-feed payment records not in BankTransactions)
        page = 1
        async with httpx.AsyncClient(timeout=60.0) as client:
            while True:
                data = await self._get_with_retry(
                    client,
                    f"{XERO_API_BASE}/Payments",
                    headers,
                    params={"page": page},
                )
                items = data.get("Payments", [])
                if not items:
                    break

                for item in items:
                    if item.get("Status") == "DELETED":
                        continue

                    xero_id = f"pay-{item['PaymentID']}"
                    pay_date = _parse_xero_date(item.get("Date"))
                    if pay_date is None:
                        continue

                    # Already synced via invoices? Skip duplicates.
                    invoice_id = item.get("Invoice", {}).get("InvoiceID")
                    if invoice_id:
                        existing = await db.execute(
                            select(Transaction).where(Transaction.xero_id == f"inv-{invoice_id}")
                        )
                        if existing.scalar_one_or_none():
                            continue

                    # Already synced this payment?
                    existing = await db.execute(
                        select(Transaction).where(Transaction.xero_id == xero_id)
                    )
                    if existing.scalar_one_or_none():
                        continue

                    contact_name = (
                        item.get("Invoice", {}).get("Contact", {}).get("Name")
                        or "Unknown"
                    )
                    reference = item.get("Reference") or ""
                    description = f"Payment: {contact_name}"
                    if reference:
                        description = f"Payment: {contact_name} — {reference}"

                    amount = Decimal(str(item.get("Amount", 0)))
                    pay_type = item.get("PaymentType", "")
                    invoice_type = item.get("Invoice", {}).get("Type", "")
                    if invoice_type == "ACCPAY" or pay_type == "ACCPAYPAYMENT":
                        amount = -abs(amount)

                    tx = Transaction(
                        organisation_id=self.organisation.id,
                        xero_id=xero_id,
                        date=pay_date,
                        amount=amount,
                        description=description,
                        reference=reference or None,
                    )
                    db.add(tx)
                    count += 1

                await db.commit()

                if len(items) < 100:
                    break
                page += 1

        logger.info("Synced %d transactions for org %s", count, self.organisation.id)
        return count

    async def sync_bank_statements(self, db: AsyncSession, since: Optional[datetime] = None) -> int:
        """Sync unreconciled bank transactions as statement lines."""
        token = await self._ensure_valid_token(db)
        headers = self._api_headers(token, since=since)

        count = 0
        page = 1

        async with httpx.AsyncClient(timeout=60.0) as client:
            while True:
                data = await self._get_with_retry(
                    client,
                    f"{XERO_API_BASE}/BankTransactions",
                    headers,
                    params={"page": page, "where": "IsReconciled=false"},
                )
                items = data.get("BankTransactions", [])
                if not items:
                    break

                for item in items:
                    if item.get("Status") == "DELETED":
                        continue

                    xero_id = f"stmt_{item['BankTransactionID']}"
                    stmt_date = _parse_xero_date(item.get("Date"))
                    if stmt_date is None:
                        continue

                    description = (
                        item.get("Reference")
                        or item.get("Contact", {}).get("Name")
                        or "Unknown"
                    )
                    amount = Decimal(str(item.get("Total", 0)))
                    if item.get("Type") == "SPEND":
                        amount = -abs(amount)

                    result = await db.execute(
                        select(BankStatement).where(BankStatement.xero_id == xero_id)
                    )
                    stmt = result.scalar_one_or_none()
                    if stmt is None:
                        stmt = BankStatement(
                            organisation_id=self.organisation.id,
                            xero_id=xero_id,
                            date=stmt_date,
                            amount=amount,
                            description=description,
                            reference=item.get("Reference"),
                        )
                        db.add(stmt)
                    count += 1

                await db.commit()

                if len(items) < 100:
                    break
                page += 1

        logger.info("Synced %d bank statements for org %s", count, self.organisation.id)
        return count

    async def full_sync(self, db: AsyncSession, incremental: bool = True) -> SyncResponse:
        """Run accounts + transactions + bank statements sync.

        If `incremental` is True (default) and `last_sync_at` is set, only
        records modified since the last successful sync are fetched. The first
        sync for an organisation always pulls everything.

        Pass `incremental=False` to force a full re-pull (useful for recovery
        or after schema changes). `last_sync_at` is only updated on success,
        so an interrupted sync safely re-syncs from the previous checkpoint.
        """
        # Use the PREVIOUS last_sync_at as the incremental cutoff; don't
        # update the org record until all syncs succeed.
        since = self.organisation.last_sync_at if incremental else None
        if since:
            logger.info("Incremental sync for org %s since %s", self.organisation.id, since.isoformat())
        else:
            logger.info("Full sync for org %s (first run or forced)", self.organisation.id)

        accounts = await self.sync_accounts(db, since=since)
        transactions = await self.sync_transactions(db, since=since)
        bank_statements = await self.sync_bank_statements(db, since=since)

        self.organisation.last_sync_at = datetime.now(timezone.utc)
        await db.commit()

        return SyncResponse(
            status="ok",
            synced_accounts=accounts,
            synced_transactions=transactions,
            synced_bank_statements=bank_statements,
        )
