from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings

from . import routing
from .auth import issue_token_pair

User = get_user_model()
SECRET = "SECRET-TOMTOM-KEY"
URL = "/api/routing/route?from_lat=9.9&from_lng=8.9&to_lat=9.95&to_lng=8.95"

TOMTOM_OK = {"routes": [{
    "summary": {"lengthInMeters": 12400, "travelTimeInSeconds": 1680, "trafficDelayInSeconds": 360,
                "noTrafficTravelTimeInSeconds": 1320},
    "legs": [{"points": [{"latitude": 9.9 + i * 0.0001, "longitude": 8.9 + i * 0.0001} for i in range(1000)]}],
}]}
OSRM_OK = {"routes": [{"distance": 9800.0, "duration": 900.0,
                       "geometry": {"coordinates": [[8.9, 9.9], [8.92, 9.92], [8.95, 9.95]]}}]}


def bearer(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {issue_token_pair(user)['access_token']}"}


@override_settings(ROUTING_PROVIDER="tomtom", TOMTOM_API_KEY=SECRET)
class RoutingTests(TestCase):
    def setUp(self):
        cache.clear()
        self.auth = bearer(User.objects.create_user("r", "r@example.com", "pw-12345"))

    def get(self, url=URL, auth=None):
        return self.client.get(url, **(self.auth if auth is None else auth))

    def test_tomtom_gives_road_distance_and_traffic_aware_eta(self):
        with mock.patch("app.routing._http_json", return_value=TOMTOM_OK) as call:
            res = self.get()
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["provider"], "tomtom")
        self.assertTrue(body["traffic"])
        self.assertEqual(body["distance_km"], 12.4)
        self.assertEqual(body["duration_min"], 28.0)             # 1680 s, includes the delay
        self.assertEqual(body["duration_no_traffic_min"], 22.0)  # 1320 s
        self.assertEqual(body["traffic_delay_min"], 6.0)
        self.assertLessEqual(len(body["geometry"]), routing.MAX_POINTS + 1)
        self.assertEqual(body["geometry"][-1], [TOMTOM_OK["routes"][0]["legs"][0]["points"][-1]["latitude"],
                                                TOMTOM_OK["routes"][0]["legs"][0]["points"][-1]["longitude"]])
        url = call.call_args[0][0]
        self.assertIn("traffic=true", url)
        self.assertIn("9.9,8.9:9.95,8.95", url)  # TomTom takes lat,lng
        self.assertNotIn(SECRET, res.content.decode())

    def test_falls_back_to_osrm_when_tomtom_fails_and_says_so(self):
        def fake(url):
            if "tomtom" in url:
                raise routing.RoutingError("routing provider answered HTTP 429")
            return OSRM_OK
        with mock.patch("app.routing._http_json", side_effect=fake) as call:
            body = self.get().json()
        self.assertEqual(call.call_count, 2)
        self.assertEqual(body["provider"], "osrm")
        self.assertFalse(body["traffic"])
        self.assertEqual(body["distance_km"], 9.8)
        self.assertEqual(body["duration_min"], 15.0)
        self.assertEqual(body["traffic_delay_min"], 0.0)
        self.assertEqual(body["geometry"][0], [9.9, 8.9])  # OSRM sends lng,lat; we return lat,lng
        self.assertIn("8.9,9.9;8.95,9.95", call.call_args[0][0])  # OSRM takes lng,lat

    @override_settings(TOMTOM_API_KEY="")
    def test_missing_tomtom_key_uses_osrm_without_calling_tomtom(self):
        with mock.patch("app.routing._http_json", return_value=OSRM_OK) as call:
            body = self.get().json()
        self.assertEqual(body["provider"], "osrm")
        self.assertEqual(call.call_count, 1)

    def test_all_providers_down_is_a_clean_502_that_leaks_nothing(self):
        with mock.patch("app.routing._http_json", side_effect=routing.RoutingError("boom")):
            res = self.get()
        self.assertEqual(res.status_code, 502)
        self.assertNotIn(SECRET, res.content.decode())

    def test_garbage_provider_payload_is_handled(self):
        with mock.patch("app.routing._http_json", return_value={"routes": []}):
            self.assertEqual(self.get().status_code, 502)

    def test_http_layer_never_puts_the_key_in_an_error(self):
        import urllib.error
        err = urllib.error.HTTPError(f"https://api.tomtom.com/x?key={SECRET}", 403, "Forbidden", {}, None)
        with mock.patch("urllib.request.urlopen", side_effect=err):
            with self.assertRaises(routing.RoutingError) as ctx:
                routing._http_json(f"https://api.tomtom.com/x?key={SECRET}")
        self.assertNotIn(SECRET, str(ctx.exception))
        with mock.patch("urllib.request.urlopen", side_effect=TimeoutError()):
            with self.assertRaises(routing.RoutingError):
                routing._http_json("https://example.test")

    def test_identical_requests_are_cached(self):
        with mock.patch("app.routing._http_json", return_value=TOMTOM_OK) as call:
            self.get()
            self.get(URL.replace("9.9&", "9.90001&"))  # ~1 m away: same cache cell
        self.assertEqual(call.call_count, 1)

    def test_same_spot_needs_no_provider_call(self):
        with mock.patch("app.routing._http_json") as call:
            body = self.get("/api/routing/route?from_lat=9.9&from_lng=8.9&to_lat=9.90001&to_lng=8.9").json()
        call.assert_not_called()
        self.assertEqual((body["distance_km"], body["duration_min"], body["geometry"]), (0.0, 0.0, []))

    def test_validation_and_auth(self):
        self.assertEqual(self.client.get(URL).status_code, 401)
        self.assertEqual(self.get(URL.replace("from_lat=9.9", "from_lat=91")).status_code, 422)
        self.assertEqual(self.get("/api/routing/route?from_lat=9.9&from_lng=8.9").status_code, 422)
        far = "/api/routing/route?from_lat=9.9&from_lng=8.9&to_lat=51.5&to_lng=-0.12"  # Jos -> London
        with mock.patch("app.routing._http_json") as call:
            self.assertEqual(self.get(far).status_code, 422)
        call.assert_not_called()

    def test_unknown_provider_name_falls_back_instead_of_crashing(self):
        with override_settings(ROUTING_PROVIDER="mapquest"), mock.patch("app.routing._http_json", return_value=OSRM_OK):
            self.assertEqual(self.get().json()["provider"], "osrm")
