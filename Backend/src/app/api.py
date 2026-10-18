
import re
import uuid

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from ninja import NinjaAPI, Router
from ninja.errors import HttpError
from ninja.throttling import AnonRateThrottle

from .auth import JWTAuth, decode_token, issue_token_pair
from .idempotency import IdempotencyConflict, get_or_create_idempotent_response
from . import ledger
from .models import LedgerEntry, Profile, UsedRefreshToken, Wallet
from .schemas import (
    TransactionOut,
    FundWalletIn, LoginIn, ProfileOut, ProfileUpdateIn, RefreshIn,
    RegisterIn, SendMoneyIn, TokenOut, WalletBalanceOut,
)

User = get_user_model()

api = NinjaAPI(title="theKapita API", version="1.0.0")

# Brute-force / spam-signup protection (per client IP).
login_throttle = AnonRateThrottle("10/m")
register_throttle = AnonRateThrottle("5/m")

auth_router = Router()
profile_router = Router()
wallet_router = Router()


def new_handle(seed: str) -> str:
    """Unique lowercase handle from a name/email seed: a-z, 0-9, underscore; 3-20 chars."""
    base = re.sub(r"[^a-z0-9_]", "", seed.split("@")[0].lower())[:14] or "user"
    base = base.ljust(3, "0")
    handle, n = base, 0
    while Profile.objects.filter(handle=handle).exists():
        n += 1
        handle = f"{base}{n}"
    return handle


def resolve_recipient(raw: str):
    """Email (a@b.com), @handle, or KPT-... id -> active User or None."""
    raw = raw.strip()
    if "@" in raw[1:]:
        return User.objects.filter(email__iexact=raw, is_active=True).first()
    key = raw.lstrip("@")
    if key.upper().startswith("KPT-"):
        return User.objects.filter(profile__kapita_id__iexact=key, is_active=True).first()
    return User.objects.filter(profile__handle=key.lower(), is_active=True).first()


# ---- auth ---------------------------------------------------------------

@auth_router.post("/register", response=TokenOut, throttle=[register_throttle])
@transaction.atomic
def register(request, payload: RegisterIn):
    email = payload.email.strip().lower()
    if User.objects.filter(email__iexact=email).exists():
        raise HttpError(409, "An account with this email already exists.")
    user = User.objects.create_user(
        username=email,
        email=email,
        password=payload.password,
        first_name=payload.full_name,
    )
    Profile.objects.create(
        user=user,
        phone=payload.phone,
        kapita_id=f"KPT-{uuid.uuid4().hex[:6].upper()}",
        handle=new_handle(email),
    )
    Wallet.objects.create(user=user)
    return issue_token_pair(user)


def _find_user(identifier: str):
    """Look a user up by email or kapita_id. kapita_id lives on Profile, not User."""
    identifier = identifier.strip()
    if "@" in identifier:
        return User.objects.filter(email__iexact=identifier).first()
    profile = Profile.objects.select_related("user").filter(kapita_id__iexact=identifier).first()
    return profile.user if profile else None


@auth_router.post("/login", response=TokenOut, throttle=[login_throttle])
def login(request, payload: LoginIn):
    user = _find_user(payload.identifier)
    # Same message for "no such user", "wrong password" and "disabled account"
    # so the endpoint can't be used to discover which emails are registered.
    if user is None or not user.is_active or not user.check_password(payload.password):
        raise HttpError(401, "Incorrect email/ID or password.")
    return issue_token_pair(user)


@auth_router.post("/refresh", response=TokenOut)
def refresh(request, payload: RefreshIn):
    try:
        data = decode_token(payload.refresh_token, expected_type="refresh")
    except Exception:
        raise HttpError(401, "Refresh token is invalid or expired.")
    user = User.objects.filter(pk=int(data["sub"]), is_active=True).first()
    if user is None:
        raise HttpError(401, "Refresh token is invalid or expired.")
    # Single-use: the unique jti means a second redemption fails.
    try:
        with transaction.atomic():
            UsedRefreshToken.objects.create(jti=data["jti"], user=user)
    except IntegrityError:
        raise HttpError(401, "Refresh token is invalid or expired.")
    return issue_token_pair(user)


@auth_router.post("/logout", response={204: None})
def logout(request, payload: RefreshIn):
    """Revoke the refresh token. Always 204 so it can't be probed."""
    try:
        data = decode_token(payload.refresh_token, expected_type="refresh")
        UsedRefreshToken.objects.get_or_create(
            jti=data["jti"], defaults={"user_id": int(data["sub"])}
        )
    except Exception:
        pass
    return 204, None


# ---- profile (requires auth) --------------------------------------------

def _profile(user):
    """Users made via createsuperuser/admin have no Profile or Wallet; create on demand."""
    profile, _ = Profile.objects.get_or_create(
        user=user,
        defaults={"kapita_id": f"KPT-{uuid.uuid4().hex[:6].upper()}", "handle": new_handle(user.email or user.username)},
    )
    if not profile.handle:
        profile.handle = new_handle(user.email or user.username)
        profile.save(update_fields=["handle"])
    Wallet.objects.get_or_create(user=user)
    return profile


def _profile_out(user):
    p = _profile(user)
    return {
        "full_name": user.first_name,
        "bio": p.bio,
        "email": user.email,
        "phone": p.phone,
        "kyc_tier": p.kyc_tier,
        "kapita_id": p.kapita_id,
        "handle": p.handle or "",
    }


@profile_router.get("/me", response=ProfileOut, auth=JWTAuth())
def get_profile(request):
    return _profile_out(request.auth)


@profile_router.patch("/me", response=ProfileOut, auth=JWTAuth())
@transaction.atomic
def update_profile(request, payload: ProfileUpdateIn):
    user, profile = request.auth, _profile(request.auth)
    if payload.full_name is not None:
        name = payload.full_name.strip()
        if not name:
            raise HttpError(422, "Name can't be empty.")
        user.first_name = name
        user.save(update_fields=["first_name"])
    if payload.bio is not None:
        profile.bio = payload.bio.strip()[:200]
    if payload.phone is not None:
        profile.phone = payload.phone
    profile.save()
    return _profile_out(user)


# ---- wallet (requires auth) ----------------------------------------------

@wallet_router.get("/balance", response=WalletBalanceOut, auth=JWTAuth())
def get_balance(request):
    _profile(request.auth)
    wallet = request.auth.wallet
    return {
        "balance": wallet.balance,
        "daily_limit": wallet.daily_limit,
        "monthly_limit": wallet.monthly_limit,
    }


@wallet_router.get("/transactions", response=list[TransactionOut], auth=JWTAuth())
def list_transactions(request, limit: int = 30, offset: int = 0):
    _profile(request.auth)
    limit = max(1, min(limit, 100))
    entries = (
        request.auth.wallet.entries.select_related("counterparty__profile")
        [max(offset, 0): max(offset, 0) + limit]
    )
    out = []
    for e in entries:
        cp = e.counterparty
        name = (cp.first_name or cp.email) if cp else e.get_kind_display().replace("Funding", "Wallet funding")
        out.append({
            "id": e.reference,
            "kind": "credit" if e.amount > 0 else "debit",
            "amount": abs(e.amount),
            "counterparty": name,
            "status": "success",
            "created_at": e.created_at.isoformat(),
        })
    return out


@wallet_router.post("/dev-credit", auth=JWTAuth())
def dev_credit(request, payload: FundWalletIn):
    """Local testing only: pretend a funding webhook confirmed. 404 when DEBUG is off."""
    from django.conf import settings
    if not settings.DEBUG:
        raise HttpError(404, "Not found.")
    _profile(request.auth)
    bal = ledger.credit(request.auth, payload.amount, f"DEV-{uuid.uuid4().hex[:10].upper()}")
    return {"balance": str(bal)}


@wallet_router.post("/fund", auth=JWTAuth())
def fund_wallet(request, payload: FundWalletIn):
    idempotency_key = request.headers.get("Idempotency-Key")
    if not idempotency_key:
        raise HttpError(400, "Idempotency-Key header is required for this endpoint.")

    def do_fund():
        # Real work goes here: create a virtual account charge / initiate
        # the Paystack or Monnify collection, then credit the ledger only
        # from a confirmed webhook — never directly from this request.
        # This function must be the ONLY place that touches the ledger for
        # this action, so retries can't double-credit.
        return 202, {"status": "pending", "message": "Funding initiated."}

    try:
        status_code, body = get_or_create_idempotent_response(
            key=idempotency_key,
            user_id=request.auth.id,
            body=payload.dict(),
            compute=do_fund,
        )
    except IdempotencyConflict as exc:
        raise HttpError(409, str(exc))
    return api.create_response(request, body, status=status_code)


@wallet_router.post("/send", auth=JWTAuth())
def send_money(request, payload: SendMoneyIn):
    idempotency_key = request.headers.get("Idempotency-Key")
    if not idempotency_key:
        raise HttpError(400, "Idempotency-Key header is required for this endpoint.")

    def do_send():
        recipient = resolve_recipient(payload.recipient_kapita_id)
        if recipient is None:
            return 404, {"detail": "No theKapita account found for that email, @handle or ID."}
        _profile(request.auth)
        try:
            ref, balance = ledger.transfer(request.auth, recipient, payload.amount)
        except ledger.LedgerError as exc:
            return 422, {"detail": str(exc)}
        return 200, {"status": "success", "message": "Transfer complete.",
                     "reference": ref, "balance": str(balance)}

    try:
        # One transaction: if two requests race on the same key, the loser's
        # ledger writes roll back with its failed idempotency insert.
        with transaction.atomic():
            status_code, body = get_or_create_idempotent_response(
                key=idempotency_key,
                user_id=request.auth.id,
                body=payload.dict(),
                compute=do_send,
            )
    except IdempotencyConflict as exc:
        raise HttpError(409, str(exc))
    except IntegrityError:
        raise HttpError(409, "Duplicate request in progress. Retry in a moment.")
    return api.create_response(request, body, status=status_code)


api.add_router("/auth/", auth_router)
api.add_router("/profile/", profile_router)
api.add_router("/wallet/", wallet_router)

# urls.py:
#   from django.urls import path
#   from backend_integration.api import api
#   urlpatterns = [..., path("api/", api.urls)]
#
# Swagger/OpenAPI UI then appears for free at /api/docs — worth bookmarking,
# it's the fastest way to check a request shape without reading this file.
