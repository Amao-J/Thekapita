"""
Request/response schemas for the endpoints js/api.js calls.
`ninja.Schema` is a thin wrapper over Pydantic — anything Pydantic can do
(validators, computed fields) works here.
"""
import re
from datetime import date
from decimal import Decimal

from ninja import Schema
from pydantic import EmailStr, Field, field_validator


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
    identifier: str  
    password: str


class TokenOut(Schema):
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int


class RefreshIn(Schema):
    refresh_token: str


# ---- profile ------------------------------------------------------------

class PreferencesOut(Schema):
    dietary_preference: str = ""
    favorite_cuisine: str = ""
    default_address: str = ""
    preferred_ride: str = ""
    quiet_mode: bool = False
    default_payment: str = ""
    primary_skill: str = ""
    experience_level: str = ""
    blood_group: str = ""
    emergency_contact: str = ""
    health_insurance_id: str = ""


class SettingsOut(Schema):
    public_visibility: bool = True
    location_services: bool = True
    personalization: bool = True
    marketing: bool = False
    push: bool = True
    messages: bool = True
    updates: bool = True
    offers: bool = False


class ProfileOut(Schema):
    full_name: str
    bio: str = ""
    email: str
    phone: str = ""
    kyc_tier: int
    kapita_id: str
    handle: str = ""
    date_of_birth: date | None = None
    location: str = ""
    address: str = ""
    language: str = "English"
    preferences: PreferencesOut
    settings: SettingsOut


class ProfileUpdateIn(Schema):
    full_name: str | None = None
    bio: str | None = None
    phone: str | None = None
    date_of_birth: date | None = None
    location: str | None = Field(None, max_length=100)
    address: str | None = Field(None, max_length=200)
    language: str | None = Field(None, max_length=30)

    @field_validator("date_of_birth")
    @classmethod
    def dob_sane(cls, v):
        if v is not None and not (date(1900, 1, 1) <= v <= date.today()):
            raise ValueError("Enter a valid date of birth.")
        return v

    @field_validator("phone")
    @classmethod
    def phone_format(cls, v):
        if v is None:
            return v
        v = v.strip().replace(" ", "")
        if not re.fullmatch(r"\+?\d{7,15}", v):
            raise ValueError("Enter a valid phone number.")
        return v


# ---- wallet ---------------------------------------------------------------
# Amounts are Decimal end-to-end. Never float — this is exactly the class of
# bug the Building Plan's "ledger is append-only, never derived from a
# client-supplied float" rule exists to prevent.

class WalletBalanceOut(Schema):
    balance: Decimal
    currency: str = "NGN"
    daily_limit: Decimal
    monthly_limit: Decimal


class WalletMonthOut(Schema):
    month: str
    inflow: Decimal
    outflow: Decimal


class WalletAnalyticsOut(Schema):
    months: list[WalletMonthOut]
    current_month_inflow: Decimal
    current_month_outflow: Decimal


class FundWalletIn(Schema):
    amount: Decimal
    channel: str  # "card" | "bank_transfer" | "ussd"

    @field_validator("channel")
    @classmethod
    def channel_supported(cls, v: str) -> str:
        if v not in {"card", "bank_transfer", "ussd"}:
            raise ValueError("Choose a supported funding channel.")
        return v

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Amount must be greater than zero.")
        if v != v.quantize(Decimal("0.01")) or v >= Decimal("10") ** 12:
            raise ValueError("Amount must have at most 2 decimal places.")
        return v


class SendMoneyIn(Schema):
    recipient_kapita_id: str
    amount: Decimal

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Amount must be greater than zero.")
        if v != v.quantize(Decimal("0.01")) or v >= Decimal("10") ** 12:
            raise ValueError("Amount must have at most 2 decimal places.")
        return v


class WalletBeneficiaryIn(Schema):
    name: str = Field(min_length=1, max_length=80)
    recipient: str = Field(min_length=1, max_length=254)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        value = v.strip()
        if not value:
            raise ValueError("Enter a beneficiary name.")
        return value

    @field_validator("recipient")
    @classmethod
    def recipient_not_blank(cls, v: str) -> str:
        value = v.strip()
        if not value:
            raise ValueError("Enter a Kapita ID, @handle or email.")
        return value


class WalletBeneficiaryOut(Schema):
    id: int
    full_name: str
    kapita_id: str
    handle: str


class TransactionOut(Schema):
    id: str
    kind: str  # "credit" | "debit"
    amount: Decimal
    counterparty: str
    counterparty_kapita_id: str | None = None
    counterparty_handle: str | None = None
    status: str  # "pending" | "success" | "failed"
    created_at: str


BLOOD_GROUPS = {"", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}


class PreferencesIn(Schema):
    dietary_preference: str | None = Field(None, max_length=120)
    favorite_cuisine: str | None = Field(None, max_length=120)
    default_address: str | None = Field(None, max_length=200)
    preferred_ride: str | None = Field(None, max_length=60)
    quiet_mode: bool | None = None
    default_payment: str | None = Field(None, max_length=60)
    primary_skill: str | None = Field(None, max_length=100)
    experience_level: str | None = Field(None, max_length=60)
    blood_group: str | None = None
    emergency_contact: str | None = Field(None, max_length=30)
    health_insurance_id: str | None = Field(None, max_length=40)

    @field_validator("blood_group")
    @classmethod
    def blood_ok(cls, v):
        if v is not None and v not in BLOOD_GROUPS:
            raise ValueError("Blood group must be one of A+, A-, B+, B-, AB+, AB-, O+, O-.")
        return v


class SettingsIn(Schema):
    public_visibility: bool | None = None
    location_services: bool | None = None
    personalization: bool | None = None
    marketing: bool | None = None
    push: bool | None = None
    messages: bool | None = None
    updates: bool | None = None
    offers: bool | None = None
