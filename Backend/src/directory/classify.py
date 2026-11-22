import re

# Order matters: the first match wins.
_RULES = (
    ("buka", re.compile(r"\b(buka|bukateria)\b")),
    ("bakery", re.compile(r"\b(bakery|bakeries)\b")),
    ("grill", re.compile(r"\b(grill|grills|suya|barbecue|bbq)\b")),
    ("fine", re.compile(r"\bfine dining\b")),
)


def classify_restaurant(name, description="", services=()):
    """'buka' | 'bakery' | 'grill' | 'fine' | '' (a plain restaurant) from the words a listing uses.

    Stored on Listing.subtype so the food page can filter it in the database. It is a text heuristic over what OpenStreetMap
    contributors wrote, so expect some misses; staff can correct it in the admin."""
    text = " ".join([name or "", description or "", *(services or [])]).casefold().replace("_", " ").replace("-", " ")
    for subtype, pattern in _RULES:
        if pattern.search(text):
            return subtype
    return ""
