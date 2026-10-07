"""
Request/response schemas for the endpoints js/api.js calls.
`ninja.Schema` is a thin wrapper over Pydantic — anything Pydantic can do
(validators, computed fields) works here.
"""
from decimal import Decimal

from ninja import Schema
from pydantic import EmailStr, field_validator


# ---- auth -------------------------------------------------------------

class RegisterIn(Schema):
    full_name: str
    email: EmailStr
    phone: str
    password: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        return v


class LoginIn(Schema):
    identifier: str  # email or theKapita ID — matches the form field as-is
    password: str


class TokenOut(Schema):
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int


class RefreshIn(Schema):
    refresh_token: str


# ---- profile ------------------------------------------------------------

class ProfileOut(Schema):
    full_name: str
    bio: str = ""
    email: EmailStr
    phone: str
    kyc_tier: int
    kapita_id: str


class ProfileUpdateIn(Schema):
    full_name: str | None = None
    bio: str | None = None


# ---- wallet ---------------------------------------------------------------
# Amounts are Decimal end-to-end. Never float — this is exactly the class of
# bug the Building Plan's "ledger is append-only, never derived from a
# client-supplied float" rule exists to prevent.

class WalletBalanceOut(Schema):
    balance: Decimal
    currency: str = "NGN"
    daily_limit: Decimal
    monthly_limit: Decimal


class FundWalletIn(Schema):
    amount: Decimal
    channel: str  # "card" | "bank_transfer" | "ussd"

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Amount must be greater than zero.")
        return v


class SendMoneyIn(Schema):
    recipient_kapita_id: str
    amount: Decimal

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Amount must be greater than zero.")
        return v


class TransactionOut(Schema):
    id: str
    kind: str  # "credit" | "debit"
    amount: Decimal
    counterparty: str
    status: str  # "pending" | "success" | "failed"
    created_at: str
