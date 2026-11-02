import json
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from .auth import issue_token_pair
from . import ledger
from .models import LedgerEntry, RideBooking, RideDriver, Wallet


User = get_user_model()


class RideBookingTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="ride-user",
            email="ride-user@example.com",
            password="test-pass-123",
        )
        self.other_user = User.objects.create_user(
            username="other-ride-user",
            email="other-ride-user@example.com",
            password="test-pass-123",
        )
        self.wallet = Wallet.objects.create(user=self.user)
        ledger.credit(self.user, Decimal("10000.00"), "TEST-RIDE-WALLET")
        self.wallet.refresh_from_db()
        self.authorization = {
            "HTTP_AUTHORIZATION": f"Bearer {issue_token_pair(self.user)['access_token']}",
        }

    def book(self, *, idempotency_key="ride-request-1", payload=None, authorization=None):
        return self.client.post(
            "/api/rides/book",
            data=json.dumps(payload or {
                "ride_type": RideBooking.RideType.GO,
                "pickup": "Victoria Island, Lagos",
                "destination": "Lekki Phase 1, Lagos",
            }),
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=idempotency_key,
            **(authorization if authorization is not None else self.authorization),
        )

    def test_booking_uses_server_fare_and_returns_request(self):
        response = self.book(payload={
            "ride_type": RideBooking.RideType.COMFORT,
            "pickup": "  Victoria Island, Lagos ",
            "destination": "Lekki Phase 1, Lagos",
            "amount": 1,
        })

        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["fare"], "3500.00")
        self.assertEqual(body["status"], RideBooking.Status.REQUESTED)
        self.assertEqual(body["pickup"], "Victoria Island, Lagos")
        self.assertEqual(RideBooking.objects.count(), 1)
        self.assertEqual(self.wallet.balance, Decimal("10000.00"))

    def test_available_driver_assignment_charges_wallet_once(self):
        RideDriver.objects.create(
            name="Ada Driver",
            phone="+2348012345678",
            vehicle="Toyota Corolla",
            plate_number="LAG-123-XY",
            ride_types=[RideBooking.RideType.GO],
        )
        first = self.book()
        replay = self.book()

        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(replay.status_code, 200, replay.content)
        self.assertEqual(first.json()["status"], RideBooking.Status.ASSIGNED)
        self.assertEqual(first.json()["driver"]["name"], "Ada Driver")
        self.assertEqual(first.json()["wallet_balance"], "7800.00")
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal("7800.00"))
        self.assertEqual(
            LedgerEntry.objects.filter(kind=LedgerEntry.Kind.RIDE_CHARGE).count(),
            1,
        )
        self.assertFalse(RideDriver.objects.get().is_available)

    def test_insufficient_balance_does_not_assign_or_create_a_ride(self):
        self.wallet.balance = Decimal("100.00")
        self.wallet.save(update_fields=["balance"])
        driver = RideDriver.objects.create(
            name="Ada Driver",
            phone="+2348012345678",
            vehicle="Toyota Corolla",
            plate_number="LAG-123-XY",
            ride_types=[RideBooking.RideType.GO],
        )

        response = self.book()

        self.assertEqual(response.status_code, 402, response.content)
        self.assertEqual(RideBooking.objects.count(), 0)
        self.assertEqual(LedgerEntry.objects.filter(kind=LedgerEntry.Kind.RIDE_CHARGE).count(), 0)
        driver.refresh_from_db()
        self.assertTrue(driver.is_available)

    def test_assigned_cancellation_refunds_once_and_releases_driver(self):
        driver = RideDriver.objects.create(
            name="Ada Driver",
            phone="+2348012345678",
            vehicle="Toyota Corolla",
            plate_number="LAG-123-XY",
            ride_types=[RideBooking.RideType.GO],
        )
        booking = self.book().json()
        cancelled = self.client.post(
            f"/api/rides/{booking['reference']}/cancel",
            **self.authorization,
        )
        replay = self.client.post(
            f"/api/rides/{booking['reference']}/cancel",
            **self.authorization,
        )

        self.assertEqual(cancelled.status_code, 200, cancelled.content)
        self.assertEqual(replay.status_code, 409)
        self.wallet.refresh_from_db()
        driver.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal("10000.00"))
        self.assertTrue(driver.is_available)
        self.assertEqual(
            LedgerEntry.objects.filter(kind=LedgerEntry.Kind.RIDE_REFUND).count(),
            1,
        )

    def test_unavailable_driver_leaves_request_queued_without_charge(self):
        RideDriver.objects.create(
            name="Busy Driver",
            phone="+2348012345678",
            vehicle="Toyota Corolla",
            plate_number="LAG-123-XY",
            ride_types=[RideBooking.RideType.GO],
            is_available=False,
        )

        response = self.book()

        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["status"], RideBooking.Status.REQUESTED)
        self.assertIsNone(response.json()["driver"])
        self.assertEqual(response.json()["wallet_balance"], "10000.00")
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal("10000.00"))

    def test_queued_request_is_assigned_when_same_request_is_retried(self):
        queued = self.book()
        RideDriver.objects.create(
            name="Ada Driver",
            phone="+2348012345678",
            vehicle="Toyota Corolla",
            plate_number="LAG-123-XY",
            ride_types=[RideBooking.RideType.GO],
        )

        assigned = self.book()

        self.assertEqual(queued.status_code, 201)
        self.assertEqual(queued.json()["status"], RideBooking.Status.REQUESTED)
        self.assertEqual(assigned.status_code, 200, assigned.content)
        self.assertEqual(assigned.json()["status"], RideBooking.Status.ASSIGNED)
        self.assertEqual(assigned.json()["reference"], queued.json()["reference"])

    def test_completing_a_ride_releases_its_driver(self):
        from .ride_service import complete_ride

        driver = RideDriver.objects.create(
            name="Ada Driver",
            phone="+2348012345678",
            vehicle="Toyota Corolla",
            plate_number="LAG-123-XY",
            ride_types=[RideBooking.RideType.GO],
        )
        response = self.book()
        ride = RideBooking.objects.get(reference=response.json()["reference"])

        completed = complete_ride(ride.pk)

        self.assertEqual(completed.status, RideBooking.Status.COMPLETED)
        driver.refresh_from_db()
        self.assertTrue(driver.is_available)
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal("7800.00"))

    def test_same_idempotency_key_returns_same_booking(self):
        first = self.book()
        replay = self.book()

        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(replay.status_code, 200, replay.content)
        self.assertEqual(first.json()["reference"], replay.json()["reference"])
        self.assertEqual(RideBooking.objects.count(), 1)

    def test_idempotency_key_cannot_be_reused_for_another_trip(self):
        self.book()
        response = self.book(payload={
            "ride_type": RideBooking.RideType.GO,
            "pickup": "Yaba, Lagos",
            "destination": "Lekki Phase 1, Lagos",
        })

        self.assertEqual(response.status_code, 409, response.content)

    def test_booking_requires_authentication_and_supported_ride_type(self):
        unauthenticated = self.book(authorization={})
        missing_key = self.client.post(
            "/api/rides/book",
            data=json.dumps({
                "ride_type": RideBooking.RideType.GO,
                "pickup": "Victoria Island, Lagos",
                "destination": "Lekki Phase 1, Lagos",
            }),
            content_type="application/json",
            **self.authorization,
        )
        unsupported = self.book(payload={
            "ride_type": "spaceship",
            "pickup": "Victoria Island, Lagos",
            "destination": "Lekki Phase 1, Lagos",
        })

        self.assertEqual(unauthenticated.status_code, 401)
        self.assertEqual(missing_key.status_code, 400)
        self.assertEqual(unsupported.status_code, 422)

    def test_users_can_only_list_and_cancel_their_own_rides(self):
        booking = self.book().json()
        other_auth = {
            "HTTP_AUTHORIZATION": f"Bearer {issue_token_pair(self.other_user)['access_token']}",
        }

        hidden = self.client.get(
            f"/api/rides/{booking['reference']}",
            **other_auth,
        )
        cancelled = self.client.post(
            f"/api/rides/{booking['reference']}/cancel",
            **self.authorization,
        )
        own_rides = self.client.get("/api/rides/", **self.authorization)

        self.assertEqual(hidden.status_code, 404)
        self.assertEqual(cancelled.status_code, 200, cancelled.content)
        self.assertEqual(cancelled.json()["status"], RideBooking.Status.CANCELLED)
        self.assertEqual(own_rides.status_code, 200, own_rides.content)
        self.assertEqual(len(own_rides.json()), 1)
