"""Upload a photo from the Django admin straight to the bucket, instead of pasting an image key or URL.

Add PhotoUploadForm as the admin's `form`, call save_uploaded_photo() after the object is saved. Files are checked by their
first bytes (not the name the browser gave), limited to 8 MB, stored under a fresh random key in the same
"<prefix>/<32 hex>.<ext>" shape the apps' own uploads use, and the replaced photo is deleted."""
import uuid

from django import forms
from django.contrib import messages
from django.utils.html import format_html

from . import storage

EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


class PhotoUploadForm(forms.ModelForm):
    photo = forms.FileField(
        required=False, label="Upload photo", widget=forms.ClearableFileInput(attrs={"accept": "image/jpeg,image/png,image/webp"}),
        help_text="JPEG, PNG or WebP, up to 8 MB. Sent straight to the bucket; replaces the current photo.",
    )
    remove_photo = forms.BooleanField(required=False, label="Remove current photo")

    def clean_photo(self):
        upload = self.cleaned_data.get("photo")
        if not upload:
            return None
        if upload.size > storage.MAX_IMAGE_BYTES:
            raise forms.ValidationError("The image must be no larger than 8 MB.")
        content_type = storage.detect_image_type(upload.read(16))
        upload.seek(0)
        if content_type is None:
            raise forms.ValidationError("That file is not a valid JPEG, PNG, or WebP image.")
        upload.detected_type = content_type
        return upload


def save_uploaded_photo(request, obj, form, prefix):
    """Apply the form's photo / remove_photo choice to a saved `obj` (which needs an id for its prefix)."""
    if not (form.cleaned_data.get("photo") or form.cleaned_data.get("remove_photo")):
        return
    previous = obj.image_key
    upload = form.cleaned_data.get("photo")
    if upload:
        key = f"{prefix}/{uuid.uuid4().hex}.{EXTENSIONS[upload.detected_type]}"
        try:
            storage.put_object(key, upload.read(), upload.detected_type)
        except storage.S3ImageStorageError as exc:
            messages.error(request, f"{obj}: photo not uploaded ({exc}) Check the bucket settings.")
            return
    else:
        key = ""
    obj.image_key = key
    obj.save(update_fields=["image_key"])
    if previous and previous != key:
        storage.delete_object(previous)
    messages.success(request, f"{obj}: photo {'uploaded' if key else 'removed'}.")


def photo_preview(obj):
    url = storage.image_url_for(obj.image_key) if obj and obj.pk else None
    return format_html('<img src="{}" alt="" style="max-height:140px;border-radius:8px">', url) if url else "No photo yet"
