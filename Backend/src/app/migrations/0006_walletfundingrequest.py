from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0005_profile_address_profile_date_of_birth_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="WalletFundingRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("amount", models.DecimalField(decimal_places=2, max_digits=14)),
                ("channel", models.CharField(choices=[("bank_transfer", "Bank Transfer"), ("card", "Card"), ("ussd", "Ussd")], max_length=20)),
                ("status", models.CharField(choices=[("pending", "Pending"), ("confirmed", "Confirmed"), ("failed", "Failed")], default="pending", max_length=20)),
                ("reference", models.CharField(max_length=40, unique=True)),
                ("idempotency_key", models.CharField(max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("wallet", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="funding_requests", to="app.wallet")),
            ],
        ),
        migrations.AddConstraint(
            model_name="walletfundingrequest",
            constraint=models.UniqueConstraint(fields=("wallet", "idempotency_key"), name="uniq_wallet_funding_idem"),
        ),
    ]