from django.contrib import admin
from django.utils.html import format_html

from . import services
from .models import Category, Order, OrderItem, Product, ProductImage, Seller


def _thumb(fieldfile):
    from .media import signed_url
    url = signed_url(fieldfile)
    return format_html('<img src="{}" style="height:48px;border-radius:6px">', url) if url else "-"


@admin.register(Seller)
class SellerAdmin(admin.ModelAdmin):
    list_display = ("store_name", "user", "is_verified", "is_active")
    list_filter = ("is_verified", "is_active")
    search_fields = ("store_name", "user__email")
    autocomplete_fields = ()


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug")
    prepopulated_fields = {}


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1
    readonly_fields = ("preview",)

    @admin.display(description="Preview")
    def preview(self, obj):
        return _thumb(obj.image_key) if obj.pk else "-"


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("thumb", "name", "seller", "category", "price", "stock", "in_stock", "is_active", "featured")
    list_filter = ("category", "is_active", "in_stock", "featured", "seller")
    search_fields = ("name", "sku", "tags")
    list_editable = ("price", "stock", "is_active", "featured")
    readonly_fields = ("slug", "sku", "thumb")
    inlines = [ProductImageInline]

    @admin.display(description="Image")
    def thumb(self, obj):
        return _thumb(obj.image_key)


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    can_delete = False
    readonly_fields = ("product", "name", "unit_price", "qty")

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ("reference", "buyer", "seller", "status", "total", "created_at")
    list_filter = ("status", "seller")
    search_fields = ("reference", "buyer__email", "seller__store_name")
    readonly_fields = [f.name for f in Order._meta.fields]
    inlines = [OrderItemInline]
    actions = ["mark_shipped", "release_funds", "refund_buyer"]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def _each(self, request, queryset, fn, verb, **kw):
        ok = 0
        for order in queryset:
            try:
                fn(order, **kw)
                ok += 1
            except services.MarketError as exc:
                self.message_user(request, f"{order.reference}: {exc}", level="error")
        self.message_user(request, f"{verb} {ok} order(s).")

    @admin.action(description="Mark as shipped")
    def mark_shipped(self, request, queryset):
        self._each(request, queryset, services.mark_shipped, "Shipped")

    @admin.action(description="Release escrow to seller (order completed)")
    def release_funds(self, request, queryset):
        self._each(request, queryset, services.release_to_seller, "Paid out")

    @admin.action(description="Refund buyer from escrow + restock")
    def refund_buyer(self, request, queryset):
        self._each(request, queryset, services.cancel_and_refund, "Refunded", allow_shipped=True)
