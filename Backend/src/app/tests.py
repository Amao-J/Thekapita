import json

from django.contrib.auth import get_user_model
from django.test import TestCase

from .auth import issue_token_pair
from .models import Profile, UserSettings, WalletBeneficiary


User = get_user_model()


class WalletBeneficiaryTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="beneficiary-owner",
            email="owner@example.com",
            password="test-password-123",
        )
        self.recipient = User.objects.create_user(
            username="beneficiary-recipient",
            email="recipient@example.com",
            password="test-password-123",
            first_name="Test Recipient",
        )
        Profile.objects.create(
            user=self.recipient,
            kapita_id="KPT-ABC123",
            handle="test_recipient",
        )
        UserSettings.objects.create(user=self.recipient)
        access_token = issue_token_pair(self.owner)["access_token"]
        self.authorization = {"HTTP_AUTHORIZATION": f"Bearer {access_token}"}

    def add_beneficiary(self, recipient):
        return self.client.post(
            "/api/wallet/beneficiaries",
            data=json.dumps({"name": "Recipient", "recipient": recipient}),
            content_type="application/json",
            **self.authorization,
        )

    def test_add_beneficiary_by_kapita_id(self):
        response = self.add_beneficiary("KPT-ABC123")

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["kapita_id"], "KPT-ABC123")
        self.assertEqual(WalletBeneficiary.objects.count(), 1)
        self.assertEqual(
            WalletBeneficiary.objects.get().beneficiary_id,
            self.recipient.pk,
        )

    def test_add_beneficiary_by_handle(self):
        response = self.add_beneficiary("@test_recipient")

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["kapita_id"], "KPT-ABC123")
        self.assertEqual(response.json()["handle"], "@test_recipient")
        self.assertEqual(WalletBeneficiary.objects.count(), 1)
        self.assertEqual(
            WalletBeneficiary.objects.get().beneficiary_id,
            self.recipient.pk,
        )
