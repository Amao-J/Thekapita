import time
import uuid

import jwt
from django.conf import settings
from django.contrib.auth import get_user_model
from ninja.security import HttpBearer

User = get_user_model()
JWT_SIGNING_KEY = getattr(settings, "JWT_SIGNING_KEY", settings.SECRET_KEY)

ACCESS_TOKEN_TTL_SECONDS = 15 * 60          # short-lived: 15 minutes
REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60  # 30 days, rotated on use


def _issue_token(user_id: int, token_type: str, ttl: int) -> str:
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "type": token_type,
        "iat": now,
        "exp": now + ttl,
        "jti": uuid.uuid4().hex,  # lets you build a revocation/blacklist table later
    }
    return jwt.encode(payload, JWT_SIGNING_KEY, algorithm="HS256")


def issue_token_pair(user) -> dict:
    return {
        "access_token": _issue_token(user.id, "access", ACCESS_TOKEN_TTL_SECONDS),
        "refresh_token": _issue_token(user.id, "refresh", REFRESH_TOKEN_TTL_SECONDS),
        "token_type": "Bearer",
        "expires_in": ACCESS_TOKEN_TTL_SECONDS,
    }


def decode_token(token: str, expected_type: str) -> dict:
    payload = jwt.decode(token, JWT_SIGNING_KEY, algorithms=["HS256"])
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError(f"expected a {expected_type} token")
    return payload


class JWTAuth(HttpBearer):


    def authenticate(self, request, token: str):
        try:
            payload = decode_token(token, expected_type="access")
        except jwt.PyJWTError:
            return None  
        try:
            return User.objects.get(pk=int(payload["sub"]), is_active=True)
        except User.DoesNotExist:
            return None
