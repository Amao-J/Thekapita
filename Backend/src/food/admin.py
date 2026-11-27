from django.contrib import admin, messages

from app import ledger
from directory.admin_upload import (
    PhotoUploadForm, delete_replaced_video, photo_preview, saved_video_name,
    save_uploaded_photo, video_preview,
)

from . import services
from .models import FoodOrder, MenuItem, Reservation, Restaurant


class MenuItemInline(admin.TabularInline):
    model = MenuItem
    form = PhotoUploadForm
    extra = 0
    exclude = ("image_key",)
    readonly_fields = ("photo_now", "video_preview")

    @admin.display(description="Current photo")
    def photo_now(self, item):
        return photo_preview(item)

    @admin.display(description="Current video")
    def video_preview(self, item):
        return video_preview(item)


@admin.register(Restaurant)
class RestaurantAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "owner", "is_open", "is_active", "created_at")
    list_filter = ("is_active", "is_open", "category")
    search_fields = ("name", "address", "owner__email")
    prepopulated_fields = {"slug": ("name",)}
    raw_id_fields = ("owner",)
    inlines = [MenuItemInline]
    form = PhotoUploadForm
    exclude = ("image_key",)
    readonly_fields = ("photo_now", "video_preview")

    @admin.display(description="Current photo")
    def photo_now(self, restaurant):
        return photo_preview(restaurant)

    def save_model(self, request, obj, form, change):
        previous_video = saved_video_name(obj)
        super().save_model(request, obj, form, change)
        delete_replaced_video(obj, previous_video)
        save_uploaded_photo(request, obj, form, f"food/restaurants/{obj.id}")

    @admin.display(description="Current video")
    def video_preview(self, restaurant):
        return video_preview(restaurant)

    def save_formset(self, request, form, formset, change):
        previous_videos = {
            item_form.instance.pk: saved_video_name(item_form.instance)
            for item_form in formset.forms if item_form.instance.pk
        }
        super().save_formset(request, form, formset, change)  # saves the dishes, so new ones have an id now
        if formset.model is MenuItem:
            for item_form in formset.forms:
                if item_form.instance.pk and item_form.cleaned_data:
                    delete_replaced_video(
                        item_form.instance, previous_videos.get(item_form.instance.pk, ""),
                    )
                    save_uploaded_photo(request, item_form.instance, item_form, f"food/menu/{item_form.instance.pk}")


@admin.register(FoodOrder)
class FoodOrderAdmin(admin.ModelAdmin):
    list_display = ("created_at", "reference", "restaurant", "customer", "total", "status")
    list_filter = ("status", "restaurant")
    search_fields = ("reference", "customer__email")
    actions = ["force_release", "force_refund"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False  # money-bearing records change only through the actions below

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.action(description="Release escrow to the restaurant (customer received the food)")
    def force_release(self, request, queryset):
        for order in queryset:
            try:
                services.customer_confirm(order.pk)
            except (services.FoodError, ledger.LedgerError) as exc:
                self.message_user(request, f"{order.reference}: {exc}", messages.ERROR)

    @admin.action(description="Refund the customer (cancel before it is handed over)")
    def force_refund(self, request, queryset):
        for order in queryset.filter(status__in=[FoodOrder.Status.INCOMING, FoodOrder.Status.PREPARING,
                                                 FoodOrder.Status.DISPATCH]):
            try:
                ledger.escrow_refund(order.customer, order.total, order.reference)
                order.status = FoodOrder.Status.CANCELLED
                order.save(update_fields=["status", "updated_at"])
            except ledger.LedgerError as exc:
                self.message_user(request, f"{order.reference}: {exc}", messages.ERROR)


admin.site.register(Reservation)
