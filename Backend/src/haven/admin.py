from django.contrib import admin
from django.utils.html import format_html

from directory.admin_upload import (
    MediaUploadForm, delete_replaced_file, delete_replaced_video,
    saved_file_name, saved_video_name, video_preview,
)
from .models import Property, PropertyBookmark


@admin.register(Property)
class PropertyAdmin(admin.ModelAdmin):
    form = MediaUploadForm
    list_display = ("title", "intent", "category", "price", "city", "status", "title_verified", "agent_verified", "owner", "created_at")
    list_filter = ("status", "intent", "category", "title_verified", "agent_verified", "featured")
    search_fields = ("title", "address", "city", "owner__email")
    raw_id_fields = ("owner",)
    actions = ["approve", "reject"]
    readonly_fields = ("image_preview", "video_preview")

    @admin.display(description="Current image")
    def image_preview(self, property):
        if not property or not property.pk or not property.image_file:
            return "No image yet"
        return format_html(
            '<img src="{}" alt="" style="max-width:320px;max-height:180px">',
            property.image_file.url,
        )

    @admin.display(description="Current video")
    def video_preview(self, property):
        return video_preview(property)

    def save_model(self, request, obj, form, change):
        previous_image = saved_file_name(obj, "image_file")
        previous_video = saved_video_name(obj)
        super().save_model(request, obj, form, change)
        delete_replaced_file(obj, "image_file", previous_image)
        delete_replaced_video(obj, previous_video)

    @admin.action(description="Approve selected properties (go live)")
    def approve(self, request, queryset):
        self.message_user(request, f"Approved {queryset.update(status=Property.Status.APPROVED)} property(ies).")

    @admin.action(description="Reject selected properties")
    def reject(self, request, queryset):
        self.message_user(request, f"Rejected {queryset.update(status=Property.Status.REJECTED)} property(ies).")


admin.site.register(PropertyBookmark)
