"""Photo uploads straight from the browser to private storage, shared by the directory and the food apps.

Flow (nothing is trusted until confirmed):
  1. issue_upload()  -> a one-use signed POST for a NEW random key under the caller's prefix.
  2. the browser uploads the file to storage directly.
  3. verify_upload() -> checks the key belongs to this prefix, the object exists, its size/type are allowed AND its
     first bytes really are that image type. Only then does the caller save the key on the record.
Because every upload gets a fresh key, a file that fails verification never becomes the live photo, and replacing a
photo can never show a half-checked file or a stale cached copy."""
import re
import uuid

from ninja.errors import HttpError

from . import storage

ALLOWED_TYPES = {
    "image/jpeg": {"jpg", "jpeg"},
    "image/png": {"png"},
    "image/webp": {"webp"},
}
MAX_IMAGE_BYTES = storage.MAX_IMAGE_BYTES


def issue_upload(prefix, filename, content_type, size):
    extensions = ALLOWED_TYPES.get(content_type)
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extensions is None or extension not in extensions:
        raise HttpError(422, "Upload a JPEG, PNG, or WebP image with a matching file extension.")
    if not 0 < size <= MAX_IMAGE_BYTES:
        raise HttpError(422, "The image must be no larger than 8 MB.")
    key = f"{prefix}/{uuid.uuid4().hex}.{extension}"
    try:
        upload = storage.generate_presigned_upload(key, content_type)
    except storage.S3ImageStorageError as exc:
        raise HttpError(503, str(exc)) from exc
    return {"key": key, "upload_url": upload["url"], "fields": upload["fields"], "max_bytes": MAX_IMAGE_BYTES}


def verify_upload(prefix, key):
    """Return the key if it is a real, allowed image that was issued under `prefix`; otherwise raise HttpError."""
    if not re.fullmatch(rf"{re.escape(prefix)}/[0-9a-f]{{32}}\.(jpg|jpeg|png|webp)", key or ""):
        raise HttpError(422, "That image key was not issued for this item.")
    try:
        image = storage.inspect_uploaded_image(key)
        if image is None:
            raise HttpError(422, "Upload the image before saving it.")
        if image["content_type"] not in ALLOWED_TYPES or not 0 < image["size"] <= MAX_IMAGE_BYTES:
            storage.delete_object(key)
            raise HttpError(422, "The stored image must be a JPEG, PNG, or WebP no larger than 8 MB.")
        real_type = storage.sniff_uploaded_image(key)
    except storage.S3ImageStorageError as exc:
        raise HttpError(503, str(exc)) from exc
    if real_type is None or real_type != image["content_type"]:
        storage.delete_object(key)  # not what it claimed to be: throw it away
        raise HttpError(422, "That file is not a valid JPEG, PNG, or WebP image.")
    return key
