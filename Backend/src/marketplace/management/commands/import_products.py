import json
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from marketplace.models import Category, Product, ProductImage, Seller


class Command(BaseCommand):
    help = "Import marketplace products from a JSON file."

    def add_arguments(self, parser):
        parser.add_argument("file", help="Path to a JSON file containing products.")
        parser.add_argument("--seller-email", required=True)
        parser.add_argument("--store-name", default="Afrimart")

    def handle(self, *args, **options):
        try:
            with open(options["file"], encoding="utf-8") as source:
                products = json.load(source, parse_float=Decimal)
        except OSError as exc:
            raise CommandError(f"Could not read {options['file']}: {exc}") from exc
        except json.JSONDecodeError as exc:
            raise CommandError(f"Invalid JSON in {options['file']}: {exc}") from exc

        if not isinstance(products, list):
            raise CommandError("The JSON file must contain a list of products.")

        try:
            user = get_user_model().objects.get(email=options["seller_email"])
        except get_user_model().DoesNotExist as exc:
            raise CommandError(
                f"No user found with email {options['seller_email']}."
            ) from exc

        seller, _ = Seller.objects.get_or_create(
            user=user, defaults={"store_name": options["store_name"]}
        )

        for index, data in enumerate(products, start=1):
            try:
                category, _ = Category.objects.get_or_create(name=data["category"])
                price = Decimal(data["price"])
                discount = Decimal(data["discount"])
                final_price = (
                    price - price * discount / 100 if discount > 0 else price
                )
                images = data["images"]

                with transaction.atomic():
                    product, _ = Product.objects.update_or_create(
                        sku=f"AFR-{data['id']}",
                        defaults={
                            "seller": seller,
                            "name": data["name"],
                            "category": category,
                            "description": data["description"],
                            "short_description": data["description"][:300],
                            "price": final_price,
                            "compare_price": price if discount > 0 else None,
                            "stock": data["stock"],
                            "featured": data["featured"],
                            "badge": "sale" if discount > 0 else "",
                            "image_key": images[0] if images else None,
                        },
                    )
                    product.gallery_images.all().delete()
                    ProductImage.objects.bulk_create(
                        [
                            ProductImage(product=product, image_key=key, order=image_order)
                            for image_order, key in enumerate(images[1:])
                        ]
                    )
            except (KeyError, TypeError, ValueError, ArithmeticError) as exc:
                raise CommandError(
                    f"Invalid product data at item {index}: {exc}"
                ) from exc

        self.stdout.write(f"Imported {len(products)}")
