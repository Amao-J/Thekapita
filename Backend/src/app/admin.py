"""Admin for testing the wallet: credit wallets, confirm funding requests, inspect the ledger.

Balances are never edited by hand (that would desync them from the ledger). Every credit
goes through ledger.credit(), so it shows up in /wallet/transactions like real money.
"""
import uuid
from decimal import Decimal

from django.contrib import admin, messages
from django.db import transaction
from django.db.models import Sum

from . import ledger
from .ride_service import RideServiceError, complete_ride, dispatch_requested_ride
from .models import (
    LedgerEntry, Profile, RideBooking, RideDriver, ServicePreference, UserSettings, Wallet,
    WalletBeneficiary, WalletFundingRequest,
)

admin.site.site_header = "theKapita admin"


def _ledger_total(wallet):
    return wallet.entries.aggregate(s=Sum("amount"))["s"] or Decimal("0")


class _ReadOnly(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


def _make_credit_action(amount):
    @admin.action(description=f"Test credit: add ₦{amount:,} to selected wallets")
    def action(modeladmin, request, queryset):
        for wallet in queryset:
            balance = ledger.credit(wallet.user, Decimal(amount), f"ADMIN-{uuid.uuid4().hex[:10].upper()}")
            modeladmin.message_user(request, f"{wallet.user.email or wallet.user.username}: balance is now ₦{balance:,.2f}")
    action.__name__ = f"credit_{amount}"
    return action


@admin.register(Wallet)
class WalletAdmin(admin.ModelAdmin):
    list_display = ("user", "balance", "ledger_total", "in_sync", "daily_limit", "monthly_limit")
    search_fields = ("user__email", "user__username", "user__profile__kapita_id", "user__profile__handle")
    readonly_fields = ("user", "balance", "ledger_total")
    fields = ("user", "balance", "ledger_total", "daily_limit", "monthly_limit")
    actions = [_make_credit_action(1_000), _make_credit_action(10_000), _make_credit_action(100_000), "verify_ledger"]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.display(description="Sum of ledger entries")
    def ledger_total(self, wallet):
        return _ledger_total(wallet)

    @admin.display(boolean=True, description="Balance = ledger?")
    def in_sync(self, wallet):
        return _ledger_total(wallet) == wallet.balance

    @admin.action(description="Verify balance matches the ledger")
    def verify_ledger(self, request, queryset):
        bad = [w for w in queryset if _ledger_total(w) != w.balance]
        if bad:
            self.message_user(request, "OUT OF SYNC: " + ", ".join(str(w.user) for w in bad), messages.ERROR)
        else:
            self.message_user(request, f"All {queryset.count()} selected wallets match their ledger.")


@admin.register(LedgerEntry)
class LedgerEntryAdmin(_ReadOnly):
    list_display = ("created_at", "wallet", "kind", "amount", "counterparty", "reference")
    list_filter = ("kind", "created_at")
    search_fields = ("reference", "wallet__user__email", "counterparty__email")
    date_hierarchy = "created_at"


@admin.register(WalletFundingRequest)
class WalletFundingRequestAdmin(_ReadOnly):
    list_display = ("created_at", "wallet", "amount", "channel", "status", "reference")
    list_filter = ("status", "channel")
    search_fields = ("reference", "wallet__user__email")
    actions = ["confirm_funding", "mark_failed"]

    @admin.action(description="Confirm payment: credit the wallet (simulates the provider webhook)")
    def confirm_funding(self, request, queryset):
        done = 0
        for req in queryset.filter(status=WalletFundingRequest.Status.PENDING):
            with transaction.atomic():
                ledger.credit(req.wallet.user, req.amount, req.reference)  # idempotent per reference
                req.status = WalletFundingRequest.Status.CONFIRMED
                req.save(update_fields=["status"])
            done += 1
        self.message_user(request, f"Confirmed and credited {done} funding request(s).")

    @admin.action(description="Mark as failed (no credit)")
    def mark_failed(self, request, queryset):
        n = queryset.filter(status=WalletFundingRequest.Status.PENDING).update(status=WalletFundingRequest.Status.FAILED)
        self.message_user(request, f"Marked {n} request(s) failed.")


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "kapita_id", "handle", "phone", "kyc_tier")
    search_fields = ("user__email", "kapita_id", "handle", "phone")
    readonly_fields = ("user", "kapita_id")


@admin.register(WalletBeneficiary)
class WalletBeneficiaryAdmin(_ReadOnly):
    list_display = ("owner", "beneficiary", "name", "handle", "created_at")


admin.site.register(ServicePreference)
admin.site.register(UserSettings)


@admin.register(RideBooking)
class RideBookingAdmin(admin.ModelAdmin):
    list_display = ("created_at", "reference", "user", "ride_type", "fare", "status")
    list_filter = ("status", "ride_type", "created_at")
    search_fields = ("reference", "user__email", "pickup", "destination")
    readonly_fields = (
        "user", "reference", "ride_type", "pickup", "destination", "fare", "status",
        "driver", "assigned_at", "started_at", "completed_at", "charged_at", "refunded_at",
        "driver_payout", "pickup_lat", "pickup_lng", "dest_lat", "dest_lng", "pickup_otp",
        "idempotency_key", "created_at", "updated_at",
    )
    actions = ["dispatch_rides", "complete_rides"]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.action(description="Dispatch selected requests to available drivers and charge riders")
    def dispatch_rides(self, request, queryset):
        assigned, unavailable, failed = 0, 0, 0
        for booking in queryset.filter(status=RideBooking.Status.REQUESTED):
            try:
                updated = dispatch_requested_ride(booking.pk)
            except RideServiceError as exc:
                failed += 1
                self.message_user(request, f"{booking.reference}: {exc}", messages.ERROR)
                continue
            if updated.status == RideBooking.Status.ASSIGNED:
                assigned += 1
            else:
                unavailable += 1
        self.message_user(
            request,
            f"Assigned {assigned} ride(s); {unavailable} remain queued without an available driver; {failed} failed.",
        )

    @admin.action(description="Complete selected assigned rides and release drivers")
    def complete_rides(self, request, queryset):
        completed = 0
        live = [RideBooking.Status.ASSIGNED, RideBooking.Status.ARRIVED, RideBooking.Status.IN_PROGRESS]
        for booking in queryset.filter(status__in=live):
            complete_ride(booking.pk)
            completed += 1
        self.message_user(request, f"Completed {completed} ride(s) and released their drivers.")


@admin.register(RideDriver)
class RideDriverAdmin(admin.ModelAdmin):
    list_display = ("name", "phone", "vehicle", "plate_number", "user", "is_active", "is_online", "is_available")
    list_filter = ("is_active", "is_online", "is_available")
    search_fields = ("name", "phone", "plate_number", "user__email")
    readonly_fields = ("latitude", "longitude", "location_updated_at")
    raw_id_fields = ("user",)
    fieldsets = (
        (None, {"fields": ("user", "name", "phone", "vehicle", "plate_number")}),
        ("Dispatch", {"fields": ("ride_types", "is_active", "is_online", "is_available")}),
        ("Last known location", {"fields": ("latitude", "longitude", "location_updated_at")}),
    )
