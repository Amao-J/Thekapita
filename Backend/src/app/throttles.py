"""Ninja throttles share ONE cache counter per `scope` (all AnonRateThrottle instances use
"anon", all UserRateThrottle instances use "user"), so two endpoints with different rates
silently count each other's requests. Give every endpoint its own scope."""
from ninja.throttling import AnonRateThrottle, UserRateThrottle


def user_throttle(scope: str, rate: str) -> UserRateThrottle:
    return type(f"UserThrottle_{scope}", (UserRateThrottle,), {"scope": scope})(rate)


def anon_throttle(scope: str, rate: str) -> AnonRateThrottle:
    return type(f"AnonThrottle_{scope}", (AnonRateThrottle,), {"scope": scope})(rate)
