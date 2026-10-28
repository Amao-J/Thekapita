from django.db import migrations

CATEGORIES = [
    ("electronics", "Computing & Tech"), ("fashion", "Apparel & Fashion"), ("home", "Home & Living"),
    ("automotive", "Automotive & Parts"), ("beauty", "Beauty & Care"), ("gaming", "Gaming & Consoles"),
    ("supermarket", "Supermarket & Groceries"),
]


def seed(apps, schema_editor):
    Category = apps.get_model("marketplace", "Category")
    for slug, name in CATEGORIES:
        Category.objects.get_or_create(slug=slug, defaults={"name": name})


class Migration(migrations.Migration):
    dependencies = [("marketplace", "0001_initial")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
