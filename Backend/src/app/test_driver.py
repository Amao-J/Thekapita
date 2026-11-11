import json
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from . import ledger
from .auth import issue_token_pair
from .models import LedgerEntry, RideBooking, RideDriver, Wallet

User = get_user_model()

TRIP = {"ride_type": RideBooking.RideType.GO, "pickup": "Wuse 2, Abuja", "destination": "Garki, Abuja"}


def bearer(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {issue_token_pair(user)['access_token']}"}


@override_settings(DRIVER_AUTO_APPROVE=True)
class DriverRideLinkTests(TestCase):
    def setUp(self):
        self.rider = User.objects.create_user("rider", "rider@example.com", "pw-12345", first_name="Rita")
        self.driver_user = User.objects.create_user("drv", "drv@example.com", "pw-12345", first_name="Dayo")
        self.other_user = User.objects.create_user("drv2", "drv2@example.com", "pw-12345", first_name="Femi")
        Wallet.objects.create(user=self.rider)
        ledger.credit(self.rider, Decimal("10000.00"), "TEST-FUND")
        self.rider_auth, self.drv_auth = bearer(self.rider), bearer(self.driver_user)

    # -- helpers
    def post(self, path, data=None, auth=None, **extra):
        return self.client.post(
            path, data=json.dumps(data if data is not None else {}), content_type="application/json",
            **(auth if auth is not None else self.drv_auth), **extra,
        )

    def get(self, path, auth=None):
        return self.client.get(path, **(auth if auth is not None else self.drv_auth))

    def register(self, auth=None, plate="ABC 123 XY"):
        return self.post("/api/driver/register", {
            "phone": "+2348012345678", "vehicle": "Toyota Corolla", "plate_number": plate,
            "ride_types": [RideBooking.RideType.GO],
        }, auth=auth)

    def go_online(self, auth=None):
        return self.post("/api/driver/status", {"online": True}, auth=auth)

    def book(self, key="k1", payload=None):
        return self.post("/api/rides/book", payload or TRIP, auth=self.rider_auth, HTTP_IDEMPOTENCY_KEY=key)

    # -- registration / redirect contract
    def test_non_driver_gets_403_so_the_portal_redirects_to_signup(self):
        self.assertEqual(self.get("/api/driver/me").status_code, 403)
        self.assertEqual(self.get("/api/driver/active").status_code, 403)
        self.assertEqual(self.get("/api/driver/me", auth={}).status_code, 401)

    def test_register_creates_offline_driver_and_me_returns_it(self):
        res = self.register()
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertEqual(body["name"], "Dayo")
        self.assertEqual(body["plate_number"], "ABC 123 XY")
        self.assertFalse(body["is_online"])
        self.assertTrue(body["is_active"])  # DEBUG-like default: DRIVER_AUTO_APPROVE is on under tests
        self.assertEqual(self.get("/api/driver/me").status_code, 200)
        self.assertEqual(self.register().status_code, 409)  # already a driver

    def test_driver_can_edit_contact_details_but_not_plate(self):
        self.register()
        res = self.client.patch("/api/driver/me", data=json.dumps({
            "phone": " +2348099999999 ", "vehicle": "Honda Accord", "plate_number": "HACK 1", "ride_types": [],
        }), content_type="application/json", **self.drv_auth)
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual((body["phone"], body["vehicle"], body["plate_number"]), ("+2348099999999", "Honda Accord", "ABC 123 XY"))
        self.assertEqual(body["ride_types"], [RideBooking.RideType.GO])
        blank = self.client.patch("/api/driver/me", data=json.dumps({"vehicle": "   "}),
                                  content_type="application/json", **self.drv_auth)
        self.assertEqual(blank.status_code, 422)
        nondriver = self.client.patch("/api/driver/me", data=json.dumps({"vehicle": "Kia"}),
                                      content_type="application/json", **self.rider_auth)
        self.assertEqual(nondriver.status_code, 403)
        # not while a trip is running
        self.go_online()
        self.book()
        busy = self.client.patch("/api/driver/me", data=json.dumps({"vehicle": "Kia"}),
                                 content_type="application/json", **self.drv_auth)
        self.assertEqual(busy.status_code, 409)

    def test_register_validates_input_and_plate_is_unique(self):
        bad = self.post("/api/driver/register", {
            "phone": "+2348012345678", "vehicle": "Corolla", "plate_number": "ABC 123 XY",
            "ride_types": ["spaceship"],
        })
        self.assertEqual(bad.status_code, 422)
        self.assertEqual(self.register().status_code, 201)
        clash = self.register(auth=bearer(self.other_user), plate="abc  123 xy")
        self.assertEqual(clash.status_code, 409, clash.content)

    @override_settings(DRIVER_AUTO_APPROVE=False)
    def test_unapproved_driver_cannot_go_online(self):
        res = self.register()
        self.assertFalse(res.json()["is_active"])
        self.assertEqual(self.go_online().status_code, 409)

    # -- dispatch linkage
    def test_queued_ride_is_assigned_when_a_driver_goes_online(self):
        self.register()
        queued = self.book()
        self.assertEqual(queued.json()["status"], RideBooking.Status.REQUESTED)
        self.assertEqual(self.get("/api/driver/active").json(), None)

        self.assertEqual(self.go_online().status_code, 200)

        ride = self.get("/api/driver/active").json()
        self.assertEqual(ride["reference"], queued.json()["reference"])
        self.assertEqual(ride["status"], "assigned")
        self.assertEqual(ride["rider_name"], "Rita")
        self.assertNotIn("pickup_otp", ride)
        rider_view = self.get(f"/api/rides/{ride['reference']}", auth=self.rider_auth).json()
        self.assertEqual(rider_view["status"], "assigned")
        self.assertEqual(rider_view["driver"]["plate_number"], "ABC 123 XY")
        self.assertEqual(len(rider_view["pickup_otp"]), 4)

    def test_full_trip_pays_driver_and_frees_them(self):
        self.register()
        self.go_online()
        ref = self.book().json()["reference"]
        otp = self.get(f"/api/rides/{ref}", auth=self.rider_auth).json()["pickup_otp"]

        # can't skip steps
        self.assertEqual(self.post(f"/api/driver/rides/{ref}/start", {"otp": otp}).status_code, 409)
        self.assertEqual(self.post(f"/api/driver/rides/{ref}/complete").status_code, 409)

        self.assertEqual(self.post(f"/api/driver/rides/{ref}/arrived").json()["status"], "arrived")
        wrong = "0000" if otp != "0000" else "1111"
        self.assertEqual(self.post(f"/api/driver/rides/{ref}/start", {"otp": wrong}).status_code, 422)
        self.assertEqual(self.post(f"/api/driver/rides/{ref}/start", {"otp": "12ab"}).status_code, 422)
        self.assertEqual(self.post(f"/api/driver/rides/{ref}/start", {"otp": otp}).json()["status"], "in_progress")

        # going offline mid-trip is refused; rider can no longer cancel; PIN hidden
        self.assertEqual(self.post("/api/driver/status", {"online": False}).status_code, 409)
        self.assertEqual(self.post(f"/api/rides/{ref}/cancel", auth=self.rider_auth).status_code, 409)
        self.assertIsNone(self.get(f"/api/rides/{ref}", auth=self.rider_auth).json()["pickup_otp"])

        done = self.post(f"/api/driver/rides/{ref}/complete")
        self.assertEqual(done.status_code, 200, done.content)
        self.assertEqual(done.json()["status"], "completed")
        self.assertEqual(Decimal(done.json()["payout"]), Decimal("1925.00"))  # 2200 less 12.5%

        driver = RideDriver.objects.get(user=self.driver_user)
        self.assertTrue(driver.is_available)
        self.assertEqual(Wallet.objects.get(user=self.driver_user).balance, Decimal("1925.00"))
        self.assertEqual(LedgerEntry.objects.filter(kind=LedgerEntry.Kind.RIDE_PAYOUT).count(), 1)
        self.assertEqual(self.get("/api/driver/active").json(), None)

        summary = self.get("/api/driver/summary").json()
        self.assertEqual(Decimal(summary["today_earnings"]), Decimal("1925.00"))
        self.assertEqual(summary["completed_today"], 1)
        self.assertEqual(Decimal(summary["balance"]), Decimal("1925.00"))
        self.assertEqual(len(summary["week"]), 7)
        self.assertEqual(len(self.get("/api/driver/rides").json()), 1)

    def test_completing_twice_does_not_pay_twice(self):
        from .ride_service import RideServiceError, complete_ride
        self.register()
        self.go_online()
        ref = self.book().json()["reference"]
        booking = RideBooking.objects.get(reference=ref)
        complete_ride(booking.pk)
        with self.assertRaises(RideServiceError):
            complete_ride(booking.pk)
        self.assertEqual(Wallet.objects.get(user=self.driver_user).balance, Decimal("1925.00"))

    def test_rider_can_cancel_after_driver_arrived_and_gets_refund(self):
        self.register()
        self.go_online()
        ref = self.book().json()["reference"]
        self.post(f"/api/driver/rides/{ref}/arrived")
        res = self.post(f"/api/rides/{ref}/cancel", auth=self.rider_auth)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["status"], "cancelled")
        self.assertEqual(Wallet.objects.get(user=self.rider).balance, Decimal("10000.00"))
        self.assertTrue(RideDriver.objects.get(user=self.driver_user).is_available)
        self.assertEqual(Wallet.objects.get(user=self.driver_user).balance, Decimal("0.00"))

    def test_driver_cannot_touch_another_drivers_ride(self):
        self.register()
        self.go_online()
        ref = self.book().json()["reference"]
        self.register(auth=bearer(self.other_user), plate="LAG 999 ZZ")
        res = self.post(f"/api/driver/rides/{ref}/arrived", auth=bearer(self.other_user))
        self.assertEqual(res.status_code, 404)

    def test_location_is_visible_to_the_rider_and_validated(self):
        self.register()
        self.go_online()
        ref = self.book(payload={**TRIP, "pickup_lat": 9.0765, "pickup_lng": 7.3986}).json()["reference"]
        self.assertEqual(self.post("/api/driver/location", {"latitude": 91, "longitude": 7}).status_code, 422)
        self.assertEqual(self.post("/api/driver/location", {"latitude": 9.07, "longitude": 7.40}).status_code, 204)
        ride = self.get(f"/api/rides/{ref}", auth=self.rider_auth).json()
        self.assertAlmostEqual(ride["driver"]["latitude"], 9.07)
        self.assertAlmostEqual(ride["pickup_lat"], 9.0765)
        self.assertIsNotNone(ride["driver"]["location_updated_at"])

    def test_queued_ride_goes_to_driver_who_finishes_a_trip(self):
        second = User.objects.create_user("rider2", "rider2@example.com", "pw-12345", first_name="Rola")
        Wallet.objects.create(user=second)
        ledger.credit(second, Decimal("5000.00"), "TEST-FUND-2")
        self.register()
        self.go_online()
        first = self.book(key="a").json()["reference"]
        queued = self.post("/api/rides/book", TRIP, auth=bearer(second), HTTP_IDEMPOTENCY_KEY="b").json()
        self.assertEqual(queued["status"], "requested")

        from .ride_service import complete_ride
        complete_ride(RideBooking.objects.get(reference=first).pk)

        self.assertEqual(RideBooking.objects.get(reference=queued["reference"]).status, "assigned")
        self.assertEqual(self.get("/api/driver/active").json()["reference"], queued["reference"])

    def test_driver_offline_is_not_dispatched(self):
        self.register()  # registered but offline
        self.assertEqual(self.book().json()["status"], "requested")
