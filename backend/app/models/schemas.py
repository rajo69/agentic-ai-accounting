import uuid
from datetime import datetime, date
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


class OrganisationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    xero_tenant_id: str
    xero_token_expires_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class AccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organisation_id: uuid.UUID
    xero_id: str
    code: Optional[str] = None
    name: str
    type: str
    tax_type: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organisation_id: uuid.UUID
    account_id: Optional[uuid.UUID] = None
    xero_id: str
    date: date
    amount: Decimal
    description: str
    reference: Optional[str] = None
    category: Optional[str] = None
    category_confidence: Optional[Decimal] = None
    categorisation_status: str
    is_reconciled: bool
    created_at: datetime
    updated_at: datetime


class TransactionUpdate(BaseModel):
    category: Optional[str] = None
    category_confidence: Optional[Decimal] = None
    categorisation_status: Optional[str] = None
    is_reconciled: Optional[bool] = None


class BankStatementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organisation_id: uuid.UUID
    xero_id: str
    date: date
    amount: Decimal
    description: str
    reference: Optional[str] = None
    matched_transaction_id: Optional[uuid.UUID] = None
    match_confidence: Optional[Decimal] = None
    match_status: str
    created_at: datetime
    updated_at: datetime


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organisation_id: uuid.UUID
    action: str
    entity_type: str
    entity_id: uuid.UUID
    old_value: Optional[dict] = None
    new_value: Optional[dict] = None
    ai_model: Optional[str] = None
    ai_confidence: Optional[Decimal] = None
    ai_explanation: Optional[str] = None
    ai_decision_data: Optional[dict] = None
    created_at: datetime


class SyncResponse(BaseModel):
    status: str
    synced_accounts: int = 0
    synced_transactions: int = 0
    synced_bank_statements: int = 0
    message: Optional[str] = None


class CategoriseResponse(BaseModel):
    transaction_id: uuid.UUID
    category: str
    confidence: Decimal
    explanation: str
    status: str


class ReconcileResponse(BaseModel):
    bank_statement_id: uuid.UUID
    matched_transaction_id: Optional[uuid.UUID] = None
    confidence: Optional[Decimal] = None
    status: str
    explanation: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    version: str
