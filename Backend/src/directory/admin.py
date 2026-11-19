from django.contrib import admin

from .models import Bookmark, Listing, Report, Review


@admin.register(Listing)
class ListingAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "tier", "status", "is_verified", "owner", "has_image", "created_at")
    list_filter = ("status", "category", "tier", "is_verified", "source")
    search_fields = ("name", "address", "phone", "owner__email")
    fields = (
        "name", "category", "description", "image_key", "address", "city", "phone", "hours", "services",
        "tier", "latitude", "longitude", "owner", "status", "is_verified", "source", "source_id",
    )
    actions = ["approve", "reject"]
    raw_id_fields = ("owner",)

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
