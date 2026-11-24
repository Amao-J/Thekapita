"""Turn a raw photo file into a web-ready one. Used by the staff bulk importer (import_listing_photos).

Same promises as the browser upload path: the file must really be a JPEG/PNG/WebP (judged by its bytes, not its name),
it is shrunk, and it is re-encoded, which drops hidden metadata such as the GPS position phones write into photos."""
import io

from PIL import Image, ImageOps, UnidentifiedImageError

from . import storage

MAX_INPUT_BYTES = 25 * 1024 * 1024   # a raw phone photo can be big; the OUTPUT is what must stay small
MAX_EDGE = 1600
QUALITY = 82
MAX_PIXELS = 60_000_000              # refuse "decompression bombs": tiny files that unpack to enormous images
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


class PhotoError(Exception):
    """The file can't be used as a listing photo. The message says why, in words a staff member can act on."""


def prepare_photo(data: bytes) -> bytes:
    if not data:
        raise PhotoError("the file is empty")
    if len(data) > MAX_INPUT_BYTES:
        raise PhotoError("the file is larger than 25 MB")
    if storage.detect_image_type(data[:16]) is None:
        raise PhotoError("not a JPEG, PNG or WebP image (whatever the file name says)")
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    try:
        with Image.open(io.BytesIO(data)) as source:
            image = ImageOps.exif_transpose(source)  # turn it the way the phone showed it, before the tag is dropped
            image.load()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError, ValueError) as exc:
        raise PhotoError(f"the image could not be read ({exc.__class__.__name__})") from exc
    if image.mode in ("RGBA", "LA", "P"):
        image = image.convert("RGBA")
        flat = Image.new("RGB", image.size, (255, 255, 255))  # JPEG has no transparency: flatten onto white
        flat.paste(image, mask=image.getchannel("A"))
        image = flat
    else:
        image = image.convert("RGB")
    image.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)      # only ever shrinks
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=QUALITY, optimize=True)  # no exif= argument: nothing is carried over
    return out.getvalue()
