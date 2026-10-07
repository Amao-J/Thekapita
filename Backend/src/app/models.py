from django.conf import settings
from django.db import models


class Profile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile')
    bio = models.CharField(max_length=200, blank=True, default='')
    phone = models.CharField(max_length=20, blank=True, default='')
    kyc_tier = models.PositiveSmallIntegerField(default=1)
    kapita_id = models.CharField(max_length=20, unique=True)


class Wallet(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='wallet')
    balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    daily_limit = models.DecimalField(max_digits=14, decimal_places=2, default=500000)
    monthly_limit = models.DecimalField(max_digits=14, decimal_places=2, default=5000000)
