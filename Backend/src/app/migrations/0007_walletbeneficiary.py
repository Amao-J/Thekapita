from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("app", "0006_walletfundingrequest"),
    ]

    operations = [
        migrations.CreateModel(
            name="WalletBeneficiary",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("beneficiary", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="saved_by_wallet_users", to=settings.AUTH_USER_MODEL)),
                ("owner", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="saved_beneficiaries", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddConstraint(
            model_name="walletbeneficiary",
            constraint=models.UniqueConstraint(fields=("owner", "beneficiary"), name="uniq_wallet_beneficiary"),
        ),
    ]