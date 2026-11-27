from django.contrib import admin

from .admin_upload import (
    PhotoUploadForm, delete_replaced_video, photo_preview, saved_video_name,
    save_uploaded_photo, video_preview,
)
from .models import Bookmark, Listing, Report, Review


@admin.register(Listing)
class ListingAdmin(admin.ModelAdmin):
    form = PhotoUploadForm
    list_display = ("name", "category", "tier", "status", "is_verified", "owner", "has_image", "created_at")
    list_filter = ("status", "category", "tier", "is_verified", "source")
    search_fields = ("name", "address", "phone", "owner__email")
    fields = (
        "name", "category", "description", "photo_now", "photo", "remove_photo", "video_file", "video_preview",
        "address", "city", "phone", "hours", "services",
        "subtype", "tier", "latitude", "longitude", "owner", "status", "is_verified", "source", "source_id",
    )
    actions = ["approve", "reject"]
    raw_id_fields = ("owner",)
    readonly_fields = ("photo_now", "video_preview")

    @admin.display(description="Current photo")
    def photo_now(self, listing):
        return photo_preview(listing)

    def save_model(self, request, obj, form, change):
        previous_video = saved_video_name(obj)
        super().save_model(request, obj, form, change)
        delete_replaced_video(obj, previous_video)
        save_uploaded_photo(request, obj, form, f"directory/listings/{obj.id}")

    @admin.display(description="Current video")
    def video_preview(self, listing):
        return video_preview(listing)

    @admin.display(boolean=True, description="Photo")
    def has_image(self, listing):
        return bool(listing.image_key)

    @admin.action(description="Approve selected listings")
    def approve(self, request, queryset):
        self.message_user(request, f"Approved {queryset.update(status=Listing.Status.APPROVED)} listing(s).")

    @admin.action(description="Reject selected listings")
    def reject(self, request, queryset):
        self.message_user(request, f"Rejected {queryset.update(status=Listing.Status.REJECTED)} listing(s).")


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ("created_at", "listing", "issue_type", "status", "user")
    list_filter = ("status", "issue_type")
    actions = ["resolve"]

    @admin.action(description="Mark selected reports resolved")
    def resolve(self, request, queryset):
        queryset.update(status=Report.Status.RESOLVED)


admin.site.register(Review)
admin.site.register(Bookmark)
