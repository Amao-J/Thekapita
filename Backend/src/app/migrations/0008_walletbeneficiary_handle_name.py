from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0007_walletbeneficiary"),
    ]

    operations = [
        migrations.AddField(
            model_name="walletbeneficiary",
            name="handle",
            field=models.CharField(default="", max_length=254),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="walletbeneficiary",
            name="name",
            field=models.CharField(default="", max_length=80),
            preserve_default=False,
        ),
    ]