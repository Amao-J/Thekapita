import logging
from functools import lru_cache

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from django.conf import settings

logger = logging.getLogger(__name__)

UPLOAD_URL_TTL_SECONDS = 900
MAX_IMAGE_BYTES = 8 * 1024 * 1024


class S3ImageStorageError(Exception):
    pass


@lru_cache(maxsize=4)
def _client(region_name, endpoint_url, access_key, secret_key, addressing_style):
    return boto3.client(
        "s3",
        region_name=region_name,
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": addressing_style},
        ),
    )


def _configured_client():
    bucket_name = getattr(settings, "AWS_STORAGE_BUCKET_NAME", None)
    access_key = getattr(settings, "AWS_ACCESS_KEY_ID", None)
    secret_key = getattr(settings, "AWS_SECRET_ACCESS_KEY", None)
    if not all((bucket_name, access_key, secret_key)):
        raise S3ImageStorageError("Private S3 image storage is not configured.")

    return _client(
        region_name=getattr(settings, "AWS_S3_REGION_NAME", "auto"),
        endpoint_url=getattr(settings, "AWS_S3_ENDPOINT_URL", None),
        access_key=access_key,
        secret_key=secret_key,
        addressing_style=getattr(settings, "AWS_S3_ADDRESSING_STYLE", "virtual"),
    )


def generate_presigned_url(s3_key, expiration=None):
    if not s3_key:
        return None
    try:
        return _configured_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.AWS_STORAGE_BUCKET_NAME, "Key": s3_key},
            ExpiresIn=expiration or getattr(settings, "AWS_QUERYSTRING_EXPIRE", 3600),
        )
    except (BotoCoreError, ClientError) as exc:
        logger.exception("Could not generate a presigned listing image URL.")
        raise S3ImageStorageError("Could not generate a private listing image URL.") from exc


def generate_presigned_upload(s3_key, content_type):
    try:
        return _configured_client().generate_presigned_post(
            Bucket=settings.AWS_STORAGE_BUCKET_NAME,
            Key=s3_key,
            Fields={"Content-Type": content_type},
            Conditions=[
                {"Content-Type": content_type},
                ["content-length-range", 1, MAX_IMAGE_BYTES],
            ],
            ExpiresIn=UPLOAD_URL_TTL_SECONDS,
        )
    except (BotoCoreError, ClientError) as exc:
        logger.exception("Could not generate a presigned listing image upload.")
        raise S3ImageStorageError("Could not prepare the private listing image upload.") from exc


def inspect_uploaded_image(s3_key):
    try:
        result = _configured_client().head_object(Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=s3_key)
    except ClientError as exc:
        if exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode") == 404:
            return None
        logger.exception("Could not inspect a listing image in private storage.")
        raise S3ImageStorageError("Could not verify the uploaded listing image.") from exc
    except BotoCoreError as exc:
        logger.exception("Could not inspect a listing image in private storage.")
        raise S3ImageStorageError("Could not verify the uploaded listing image.") from exc

    return {
        "content_type": result.get("ContentType", ""),
        "size": result.get("ContentLength", 0),
    }
