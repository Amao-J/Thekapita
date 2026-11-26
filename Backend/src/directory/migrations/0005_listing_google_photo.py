from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("directory", "0004_restaurant_subtype"),
    ]

    operations = [
        migrations.AddField(model_name="listing", name="google_place_id", field=models.CharField(blank=True, default="", max_length=255)),
        migrations.AddField(model_name="listing", name="google_photo_name", field=models.CharField(blank=True, default="", max_length=512)),
        migrations.AddField(model_name="listing", name="google_photo_author", field=models.CharField(blank=True, default="", max_length=255)),
        migrations.AddField(model_name="listing", name="google_checked_at", field=models.DateTimeField(blank=True, null=True)),
    ]
