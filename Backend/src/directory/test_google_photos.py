from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from . import google_places
from .models import Listing

SETTINGS = dict(GOOGLE_PLACES_API_KEY="test-key", PUBLIC_API_URL="https://api.example/api")
FOUND = {"place_id": "P1", "photo_name": "places/P1/photos/AbC", "author": "Jane Doe"}


def make_listing(**over):
    fields = dict(name="Iya Bisi Bukateria", category="restaurants", address="Wuse, Abuja", city="Abuja", phone="0",
                  status=Listing.Status.APPROVED, latitude=9.07, longitude=7.49)
    fields.update(over)
    return Listing.objects.create(**fields)


@override_settings(**SETTINGS)
class GooglePhotoCredit(TestCase):
    def test_google_photo_is_labelled_as_googles(self):
        listing = make_listing(google_photo_name=FOUND["photo_name"], google_photo_author="Jane Doe")
        self.assertEqual(listing.image_url, f"https://api.example/api/directory/listings/{listing.id}/google-photo")
        self.assertEqual(listing.image_credit, "Photo © Google · by Jane Doe")

    def test_credit_without_a_photographer_name_still_says_google(self):
        self.assertEqual(make_listing(google_photo_name=FOUND["photo_name"]).image_credit, "Photo © Google")

    def test_listing_without_a_google_photo_has_no_credit(self):
        listing = make_listing()
        self.assertIsNone(listing.image_url)
        self.assertIsNone(listing.image_credit)

    def test_an_uploaded_photo_beats_the_google_one_and_carries_no_google_credit(self):
        listing = make_listing(image_key="directory/listings/1/x.jpg", google_photo_name=FOUND["photo_name"])
        self.assertIsNone(listing.image_credit)
        self.assertNotIn("google-photo", listing.image_url or "")

    def test_api_returns_the_credit(self):
        listing = make_listing(google_photo_name=FOUND["photo_name"], google_photo_author="Jane Doe")
        body = self.client.get(f"/api/directory/listings/{listing.id}").json()
        self.assertEqual(body["image_credit"], "Photo © Google · by Jane Doe")


@override_settings(**SETTINGS)
class FetchCommand(TestCase):
    def run_command(self, *args):
        out = StringIO()
        call_command("fetch_google_photos", *args, pause=0, stdout=out)
        return out.getvalue()

    def test_saves_references_only(self):
        listing = make_listing()
        with patch.object(google_places, "find_place", return_value=FOUND):
            self.assertIn("Attached 1 Google photo", self.run_command())
        listing.refresh_from_db()
        self.assertEqual((listing.google_place_id, listing.google_photo_name, listing.google_photo_author),
                         ("P1", "places/P1/photos/AbC", "Jane Doe"))
        self.assertEqual(listing.image_key, "")  # nothing was downloaded into our storage
        self.assertIsNotNone(listing.google_checked_at)

    def test_dry_run_saves_nothing(self):
        listing = make_listing()
        with patch.object(google_places, "find_place", return_value=FOUND):
            self.run_command("--dry-run")
        listing.refresh_from_db()
        self.assertEqual(listing.google_photo_name, "")
        self.assertIsNone(listing.google_checked_at)

    def test_skips_places_with_photos_and_places_already_checked(self):
        make_listing(name="Has photo", image_key="k.jpg")
        make_listing(name="Checked", google_checked_at="2026-11-01T00:00:00Z")
        with patch.object(google_places, "find_place", return_value=FOUND) as find:
            self.run_command()
        find.assert_not_called()

    def test_no_confident_match_is_marked_checked_and_left_without_a_photo(self):
        listing = make_listing()
        with patch.object(google_places, "find_place", return_value=None):
            self.assertIn("1 had no confident match", self.run_command())
        listing.refresh_from_db()
        self.assertEqual(listing.google_photo_name, "")
        self.assertIsNotNone(listing.google_checked_at)

    def test_stops_on_a_key_or_quota_error(self):
        make_listing()
        with patch.object(google_places, "find_place", side_effect=google_places.GooglePlacesError("denied", 403)):
            with self.assertRaises(CommandError):
                self.run_command()

    @override_settings(GOOGLE_PLACES_API_KEY="")
    def test_needs_a_key(self):
        with self.assertRaises(CommandError):
            self.run_command()


@override_settings(**SETTINGS)
class PhotoEndpoint(TestCase):
    def setUp(self):
        self.listing = make_listing(google_place_id="P1", google_photo_name=FOUND["photo_name"], google_photo_author="Jane Doe")
        self.url = f"/api/directory/listings/{self.listing.id}/google-photo"

    def test_redirects_to_google_without_needing_a_login(self):
        with patch.object(google_places, "photo_uri", return_value="https://lh3.googleusercontent.com/x"):
            response = self.client.get(self.url)
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "https://lh3.googleusercontent.com/x")
        self.assertNotIn("test-key", response["Location"])

    def test_refreshes_an_expired_photo_reference(self):
        calls = [google_places.GooglePlacesError("gone", 404), "https://lh3.googleusercontent.com/new"]
        with patch.object(google_places, "photo_uri", side_effect=calls), \
                patch.object(google_places, "refresh_photo", return_value=("places/P1/photos/New", "John")):
            response = self.client.get(self.url)
        self.assertEqual(response.status_code, 302)
        self.listing.refresh_from_db()
        self.assertEqual((self.listing.google_photo_name, self.listing.google_photo_author), ("places/P1/photos/New", "John"))

    def test_forgets_the_photo_when_google_has_none_any_more(self):
        with patch.object(google_places, "photo_uri", side_effect=google_places.GooglePlacesError("gone", 404)), \
                patch.object(google_places, "refresh_photo", return_value=("", "")):
            self.assertEqual(self.client.get(self.url).status_code, 404)
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.google_photo_name, "")

    def test_google_being_down_is_a_502_and_keeps_the_reference(self):
        with patch.object(google_places, "photo_uri", side_effect=google_places.GooglePlacesError("down", 0)):
            self.assertEqual(self.client.get(self.url).status_code, 502)
        self.listing.refresh_from_db()
        self.assertNotEqual(self.listing.google_photo_name, "")

    def test_unknown_or_unapproved_listing_is_404(self):
        self.listing.status = Listing.Status.PENDING
        self.listing.save()
        self.assertEqual(self.client.get(self.url).status_code, 404)
