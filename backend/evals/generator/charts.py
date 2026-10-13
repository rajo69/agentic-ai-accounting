"""Chart access: account names per firm (the S corp overlay renames three US accounts and adds 696)."""

from __future__ import annotations

import json
from functools import lru_cache

from .constants import CHART_ID, DRAFT_DIR, NEEDS_REVIEW


@lru_cache(maxsize=None)
def _raw(jurisdiction: str) -> dict:
    name = "chart_uk.json" if jurisdiction == "UK" else "chart_us.json"
    return json.loads((DRAFT_DIR / name).read_text(encoding="utf-8"))


@lru_cache(maxsize=None)
def accounts(jurisdiction: str, s_corp: bool = False) -> dict[str, dict]:
    raw = _raw(jurisdiction)
    out: dict[str, dict] = {}
    for a in raw["accounts"] + raw.get("dataset_added_accounts", []):
        out[a["code"]] = {
            "code": a["code"],
            "name": a["name"],
            "type": a["type"],
            "bank_hit": a["bank_hit"],
            "class_family": a["class_family"],
        }
    if jurisdiction == "US" and s_corp:
        overlay = raw["entity_variants"]["s_corp"]
        for code, ren in overlay["rename"].items():
            out[code] = dict(out[code], name=ren["name"])
        for add in overlay["add"]:
            out[add["code"]] = {
                "code": add["code"],
                "name": add["name"],
                "type": add["type"],
                "bank_hit": add["bank_hit"],
                "class_family": add["class_family"],
            }
    return out


def chart_id_for(firm: dict) -> str:
    if firm["jurisdiction"] == "UK":
        return CHART_ID["UK"]
    return CHART_ID["US_S_CORP"] if firm["entity_type"] == "s_corp" else CHART_ID["US"]


def firm_accounts(firm: dict) -> dict[str, dict]:
    return accounts(firm["jurisdiction"], firm["entity_type"] == "s_corp")


def account_name(firm: dict, code: str) -> str:
    if code == NEEDS_REVIEW:
        return "needs review (send to a person)"
    return firm_accounts(firm)[code]["name"]


def class_family(firm: dict, code: str) -> str:
    if code == NEEDS_REVIEW:
        return "needs_review"
    return firm_accounts(firm)[code]["class_family"]


def is_gold_eligible(firm: dict, code: str) -> bool:
    if code == NEEDS_REVIEW:
        return True
    acct = firm_accounts(firm).get(code)
    return bool(acct and acct["bank_hit"])
