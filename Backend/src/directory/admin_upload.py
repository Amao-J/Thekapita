"""Shared Django admin forms and previews for validated photo and video uploads.

Directory and Food photos use the existing private-storage upload helper. Video uploads are validated by their
content signature and size, then saved through each model's configured FileField storage."""
import uuid

from django import forms
from django.contrib import messages
from django.core.files.uploadedfile import UploadedFile
from django.utils.html import format_html

from . import storage

EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
VIDEO_TYPES = {"video/mp4": "mp4", "video/webm": "webm"}
MAX_VIDEO_BYTES = 100 * 1024 * 1024


def detect_video_type(head):
    if len(head) >= 8 and head[4:8] == b"ftyp":
        return "video/mp4"
    if head.startswith(b"\x1a\x45\xdf\xa3"):
        return "video/webm"
    return None


def validate_video_upload(upload):
    if upload.size > MAX_VIDEO_BYTES:
        raise forms.ValidationError("The video must be no larger than 100 MB.")
    content_type = detect_video_type(upload.read(16))
    upload.seek(0)
    if content_type is None:
        raise forms.ValidationError("Upload an MP4 or WebM video file.")
    upload.detected_type = content_type
    upload.name = f"{uuid.uuid4().hex}.{VIDEO_TYPES[content_type]}"
    return upload


class MediaUploadForm(forms.ModelForm):
    video_file = forms.FileField(
        required=False,
        label="Upload video",
        widget=forms.ClearableFileInput(attrs={"accept": "video/mp4,video/webm"}),
        help_text="MP4 or WebM, up to 100 MB. Replaces the current video.",
    )

    def clean_video_file(self):
        upload = self.cleaned_data.get("video_file")
        if isinstance(upload, UploadedFile):
            return validate_video_upload(upload)
        return upload


class PhotoUploadForm(MediaUploadForm):
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


def video_preview(obj):
    if not obj or not obj.pk or not obj.video_file:
        return "No video yet"
    return format_html(
        '<video src="{}" controls preload="metadata" style="max-width:320px;max-height:180px"></video>',
        obj.video_file.url,
    )


def saved_video_name(obj):
    if not obj or not obj.pk:
        return ""
    return type(obj).objects.filter(pk=obj.pk).values_list("video_file", flat=True).first() or ""


def delete_replaced_video(obj, previous_name):
    current_name = obj.video_file.name if obj.video_file else ""
    if previous_name and previous_name != current_name:
        obj.video_file.storage.delete(previous_name)


def saved_file_name(obj, field_name):
    if not obj or not obj.pk:
        return ""
    return type(obj).objects.filter(pk=obj.pk).values_list(field_name, flat=True).first() or ""


def delete_replaced_file(obj, field_name, previous_name):
    field_file = getattr(obj, field_name)
    current_name = field_file.name if field_file else ""
    if previous_name and previous_name != current_name:
        field_file.storage.delete(previous_name)
