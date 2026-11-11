from django.contrib import admin, messages

from app import ledger

from . import services
from .models import FoodOrder, MenuItem, Reservation, Restaurant


class MenuItemInline(admin.TabularInline):
    model = MenuItem
    extra = 0


@admin.register(Restaurant)
class RestaurantAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "owner", "is_open", "is_active", "created_at")
    list_filter = ("is_active", "is_open", "category")
    search_fields = ("name", "address", "owner__email")
    prepopulated_fields = {"slug": ("name",)}
    raw_id_fields = ("owner",)
    inlines = [MenuItemInline]


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
