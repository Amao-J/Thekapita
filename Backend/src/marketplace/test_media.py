from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from .models import Category, Product, ProductImage, Seller

User = get_user_model()


class MarketplaceVideoApiTests(TestCase):
    def setUp(self):
        user = User.objects.create_user("seller", "seller@example.com", "pw-12345")
        self.seller = Seller.objects.create(user=user, store_name="Market Seller", is_active=True)
        self.category = Category.objects.create(name="Electronics test", slug="electronics-test")
        self.product = Product.objects.create(
            seller=self.seller, name="Camera", category=self.category, price=50000, stock=1,
        )
        Product.objects.filter(pk=self.product.pk).update(video_file="marketplace/products/videos/camera.mp4")
        self.gallery = ProductImage.objects.create(product=self.product, image_key="gallery.jpg")
        ProductImage.objects.filter(pk=self.gallery.pk).update(video_file="marketplace/products/gallery/videos/camera.webm")
        Category.objects.filter(pk=self.category.pk).update(video_file="marketplace/categories/videos/electronics.mp4")

    def test_video_urls_are_exposed_for_products_categories_and_gallery_items(self):
        def media_url(field, request):
            return f"https://media/{field.name}" if field else None

        with patch("marketplace.api.stored_file_url", side_effect=media_url):
            product = self.client.get(f"/api/marketplace/products/{self.product.id}")
            category = self.client.get("/api/marketplace/categories")

        self.assertEqual(product.status_code, 200, product.content)
        self.assertEqual(product.json()["video_url"], "https://media/marketplace/products/videos/camera.mp4")
        self.assertEqual(product.json()["gallery_videos"], ["https://media/marketplace/products/gallery/videos/camera.webm"])
        self.assertEqual(category.status_code, 200, category.content)
        electronics = next(row for row in category.json() if row["slug"] == "electronics-test")
        self.assertEqual(electronics["video_url"], "https://media/marketplace/categories/videos/electronics.mp4")
