"""Gold answer record and the context a rule function reads."""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from .charts import is_gold_eligible
from .constants import NEEDS_REVIEW
from .guides import load_rules


@dataclass
class Ctx:
    """What a rule function may read: the firm (its true policies), the merchant use and item facts."""

    firm: dict
    facts: dict = field(default_factory=dict)
    merchant: dict | None = None
    use: dict | None = None
    amount: Decimal = Decimal("0.00")

    def f(self, key, default=None):
        return self.facts.get(key, default)


@dataclass(frozen=True)
class Gold:
    label: str
    acceptable_labels: tuple[str, ...]
    gold_action: str
    solvable_with: str
    rule_id: str
    rule_basis: str
    rule_source: str
    review_reason: str | None = None
    policy_keys: tuple[str, ...] = ()

    def as_tuple(self):
        return (
            self.label,
            list(self.acceptable_labels),
            self.gold_action,
            self.solvable_with,
            self.rule_id,
            self.rule_basis,
            self.rule_source,
        )


class RuleNotApplicable(ValueError):
    """Raised when a rule is asked about a firm or fact pattern it does not cover."""


def make(
    ctx: Ctx,
    rule_id: str,
    label: str,
    solvable: str,
    *,
    also: str | None = None,
    reason: str | None = None,
    policy: tuple[str, ...] | str = (),
) -> Gold:
    meta = load_rules()[rule_id]
    if isinstance(policy, str):
        policy = (policy,)
    # A fact the record states outright makes the item line-solvable.
    if solvable == "line+history" and ctx.f("stated"):
        solvable = "line"
    # A policy the firm's history never shows can only be learnt from the profile.
    if solvable == "line+history" and any(p in ctx.firm.get("policy_gaps", ()) for p in policy):
        solvable = "line+profile"
    if label == NEEDS_REVIEW:
        solvable = "none"
        acceptable: tuple[str, ...] = ()
        action = "review"
        if reason is None:
            raise ValueError(f"{rule_id}: NEEDS_REVIEW needs a review reason")
    else:
        acceptable = (label,) if also is None else (label, also)
        action = "post"
    for code in (label,) + acceptable:
        if not is_gold_eligible(ctx.firm, code):
            raise RuleNotApplicable(f"{rule_id}: {code} is not a gold-eligible account for {ctx.firm['firm_id']}")
    return Gold(
        label=label,
        acceptable_labels=acceptable,
        gold_action=action,
        solvable_with=solvable,
        rule_id=rule_id,
        rule_basis=meta.rule_basis,
        rule_source=meta.rule_source,
        review_reason=reason,
        policy_keys=tuple(policy),
    )


def is_st(firm: dict) -> bool:
    return firm["entity_type"] in ("sole_trader", "partnership")


def is_co(firm: dict) -> bool:
    return firm["entity_type"] == "limited_company"


def is_scorp(firm: dict) -> bool:
    return firm["entity_type"] == "s_corp"


def owner_account_uk(firm: dict) -> str:
    """Owner withdrawals: drawings for a sole trader or partnership, director's loan account for a company."""
    return "980" if is_st(firm) else "835"
