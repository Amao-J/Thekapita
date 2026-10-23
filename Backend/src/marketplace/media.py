"""Presigned media for the PRIVATE Railway bucket.

* signed_url(file)            - for ImageField/FileField values. django-storages presigns via .url;
                                the result is cached for ~80% of its lifetime so the same URL is
                                returned across requests (browsers can then cache the image).
* generate_presigned_url(key) - for a plain string key (used by the /marketplace/presign endpoint).
"""
import logging

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

# Only keys under these prefixes may be signed through the public presign endpoint.
PUBLIC_PREFIXES = ("marketplace/products/", "marketplace/categories/")


def signed_url(fieldfile, request=None):
    if not fieldfile:
        return None
    ttl = int(getattr(settings, "AWS_QUERYSTRING_EXPIRE", 3600) * 0.8)
    cache_key = f"mkt:url:{fieldfile.name}"
    url = cache.get(cache_key)
    if url is None:
        url = fieldfile.url
        cache.set(cache_key, url, ttl)
    if request is not None and url.startswith("/"):  # local-dev FileSystemStorage
        url = request.build_absolute_uri(url)
    return url


def generate_presigned_url(s3_key: str, expiration: int | None = None) -> str | None:
    if not getattr(settings, "AWS_STORAGE_BUCKET_NAME", None) or not settings.AWS_ACCESS_KEY_ID:
        return None
    expiration = expiration or getattr(settings, "AWS_QUERYSTRING_EXPIRE", 3600)
    try:
        client = boto3.client(
            "s3",
            region_name=settings.AWS_S3_REGION_NAME,
            endpoint_url=settings.AWS_S3_ENDPOINT_URL,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            config=Config(signature_version="s3v4", s3={"addressing_style": settings.AWS_S3_ADDRESSING_STYLE}),
        )
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.AWS_STORAGE_BUCKET_NAME, "Key": s3_key},
            ExpiresIn=expiration,
        )
    except ClientError as exc:
        logger.error("S3 presign failed for key '%s': %s", s3_key, exc)
        return None
