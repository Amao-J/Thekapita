import hashlib
import json

from django.db import models


class IdempotencyKey(models.Model):
    key = models.CharField(max_length=64, unique=True)
    user_id = models.IntegerField()
    request_hash = models.CharField(max_length=64)  # detects key reuse on a *different* body
    response_body = models.JSONField()
    response_status = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)


def request_fingerprint(body: dict) -> str:
    return hashlib.sha256(json.dumps(body, sort_keys=True, default=str).encode()).hexdigest()


class IdempotencyConflict(Exception):
    """Same Idempotency-Key reused with a different request body."""


def get_or_create_idempotent_response(*, key: str, user_id: int, body: dict, compute):

    fingerprint = request_fingerprint(body)
    existing = IdempotencyKey.objects.filter(key=key, user_id=user_id).first()
    if existing:
        if existing.request_hash != fingerprint:
            raise IdempotencyConflict(
                "This Idempotency-Key was already used with a different request."
            )
        return existing.response_status, existing.response_body

    status_code, response_body = compute()
    IdempotencyKey.objects.create(
        key=key,
        user_id=user_id,
        request_hash=fingerprint,
        response_body=response_body,
        response_status=status_code,
    )
    return status_code, response_body
