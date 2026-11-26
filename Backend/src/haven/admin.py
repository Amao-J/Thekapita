from django.contrib import admin

from .models import Property, PropertyBookmark


@admin.register(Property)
class PropertyAdmin(admin.ModelAdmin):
    list_display = ("title", "intent", "category", "price", "city", "status", "title_verified", "agent_verified", "owner", "created_at")
    list_filter = ("status", "intent", "category", "title_verified", "agent_verified", "featured")
    search_fields = ("title", "address", "city", "owner__email")
    raw_id_fields = ("owner",)
    actions = ["approve", "reject"]

    @admin.action(description="Approve selected properties (go live)")
    def approve(self, request, queryset):
        self.message_user(request, f"Approved {queryset.update(status=Property.Status.APPROVED)} property(ies).")

    @admin.action(description="Reject selected properties")
    def reject(self, request, queryset):
        self.message_user(request, f"Rejected {queryset.update(status=Property.Status.REJECTED)} property(ies).")


admin.site.register(PropertyBookmark)
