
import uuid

from django.contrib.auth import get_user_model
from django.db import transaction
from django.shortcuts import get_object_or_404
from ninja import NinjaAPI, Router
from ninja.errors import HttpError

from .auth import JWTAuth, decode_token, issue_token_pair
from .idempotency import IdempotencyConflict, get_or_create_idempotent_response
from .models import Profile, Wallet
from .schemas import (
    FundWalletIn, LoginIn, ProfileOut, ProfileUpdateIn, RefreshIn,
    RegisterIn, SendMoneyIn, TokenOut, WalletBalanceOut,
)

User = get_user_model()

api = NinjaAPI(title="theKapita API", version="1.0.0")

auth_router = Router()
profile_router = Router()
wallet_router = Router()


# ---- auth ---------------------------------------------------------------

@auth_router.post("/register", response=TokenOut)
@transaction.atomic
def register(request, payload: RegisterIn):
    if User.objects.filter(email=payload.email).exists():
        raise HttpError(409, "An account with this email already exists.")
    user = User.objects.create_user(
        username=payload.email,
        email=payload.email,
        password=payload.password,
        first_name=payload.full_name,
    )
    Profile.objects.create(
        user=user,
        phone=payload.phone,
        kapita_id=f"KPT-{uuid.uuid4().hex[:6].upper()}",
    )
    Wallet.objects.create(user=user)
    return issue_token_pair(user)


@auth_router.post("/login", response=TokenOut)
def login(request, payload: LoginIn):
    user = User.objects.filter(email=payload.identifier).first() \
        or User.objects.filter(kapita_id=payload.identifier).first()  # adapt to your lookup
    if user is None or not user.check_password(payload.password):
     
        raise HttpError(401, "Incorrect email/ID or password.")
    return issue_token_pair(user)


@auth_router.post("/refresh", response=TokenOut)
def refresh(request, payload: RefreshIn):
    try:
        data = decode_token(payload.refresh_token, expected_type="refresh")
    except Exception:
        raise HttpError(401, "Refresh token is invalid or expired.")
    user = get_object_or_404(User, pk=int(data["sub"]), is_active=True)
    return issue_token_pair(user)  # rotates the refresh token too


# ---- profile (requires auth) --------------------------------------------

@profile_router.get("/me", response=ProfileOut, auth=JWTAuth())
def get_profile(request):
    user = request.auth
    return {
        "full_name": user.first_name,
        "bio": getattr(user.profile, "bio", ""),
        "email": user.email,
        "phone": getattr(user.profile, "phone", ""),
        "kyc_tier": getattr(user.profile, "kyc_tier", 1),
        "kapita_id": getattr(user.profile, "kapita_id", ""),
    }


@profile_router.patch("/me", response=ProfileOut, auth=JWTAuth())
def update_profile(request, payload: ProfileUpdateIn):
    user = request.auth
    if payload.full_name is not None:
        user.first_name = payload.full_name
    user.save()
    if payload.bio is not None:
        user.profile.bio = payload.bio
        user.profile.save()
    return get_profile(request)


# ---- wallet (requires auth) ----------------------------------------------

@wallet_router.get("/balance", response=WalletBalanceOut, auth=JWTAuth())
def get_balance(request):
    wallet = request.auth.wallet  # adapt to  actual relation
    return {
        "balance": wallet.balance,
        "daily_limit": wallet.daily_limit,
        "monthly_limit": wallet.monthly_limit,
    }


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
        # Real work: look up recipient by kapita_id, open a DB transaction,
        # debit sender / credit recipient as two ledger rows, never a
        # balance field update. Reject if amount > wallet.daily_limit etc.
        return 200, {"status": "success", "message": "Transfer complete."}

    try:
        status_code, body = get_or_create_idempotent_response(
            key=idempotency_key,
            user_id=request.auth.id,
            body=payload.dict(),
            compute=do_send,
        )
    except IdempotencyConflict as exc:
        raise HttpError(409, str(exc))
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
