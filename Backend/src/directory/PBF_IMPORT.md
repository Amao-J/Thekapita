# Directory PBF import and photo storage

## What the importer does

`import_osm_places` reads a local OpenStreetMap PBF file with PyOsmium. It selects named map features inside the Abuja and Lagos bounding boxes and maps OSM tags to the Directory's existing categories: restaurants, businesses, healthcare, schools, and government. Nodes, ways, and relations are normalized to the same `elements` format as an Overpass JSON response. Imported rows are approved, marked as OpenStreetMap-sourced, and keyed by their OSM type and ID, so rerunning an import updates rather than duplicates them. Listings claimed by an owner are not overwritten.

The PBF is an input only; it is not required by the API at runtime and is intentionally excluded from the source bundle. No OSRM or map-tile server is needed to import or serve directory records.

## Produce and import the small JSON snapshot

Install the backend requirements, including PyOsmium, and place a Geofabrik Nigeria extract at a local path. From `Backend/src`:

```powershell
python manage.py import_osm_places --pbf C:\data\nigeria-latest.osm.pbf --cities Abuja,Lagos --categories all --export-json directory\exports\abuja-lagos.json --dry-run
```

Review the dry-run counts, then import the snapshot without the PBF:

```powershell
python manage.py import_osm_places --file directory\exports\abuja-lagos.json --categories all --dry-run
python manage.py import_osm_places --file directory\exports\abuja-lagos.json --categories all
```

Alternatively, run the first command again without `--dry-run` to read and import directly from the PBF. The JSON snapshot contains only the selected city features and import metadata; it is reusable without the original PBF. The `elements` records preserve the OSM tags used by the importer.

The bounding boxes and supported tag mappings live in `importers.py`; category and city parsing is in `management/commands/import_osm_places.py`. Use the models and migration alongside those files to understand the persisted record structure.

The source bundle also retains `Backend/src/products.json` unchanged. That product catalogue is separate from the PBF-derived Directory snapshot.

## OSM attribution

Show `© OpenStreetMap contributors` wherever imported records are displayed. OpenStreetMap data is made available under the Open Database License (ODbL); retain the attribution and review ODbL obligations before redistributing a derived database.

## Private S3 listing photos

Directory photos are stored by S3 object key in `Listing.image_key`, not as files on the Django server. The authenticated API creates a short-lived presigned S3 POST policy, the browser uploads directly to the private bucket, and the API stores the issued key after checking the stored object's type and size. Photo URLs are short-lived presigned GET URLs.

Configure the same private S3-compatible credentials used by the app's default storage. Credentials alone do not enable browser uploads: the bucket itself must allow browser POSTs from each exact web-app origin. This is separate from Django's `CORS_ALLOWED_ORIGINS`. Add the production domain, local Vite origin when needed, and the exact Railway-generated web origin if using one; a suitable bucket CORS rule is:

```json
[
  {
    "AllowedOrigins": [
      "https://thekapita.com",
      "https://www.thekapita.com",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["POST"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

Keep the bucket private. Owners can upload photos to their own listings; staff can add photos to unclaimed map listings. A map `image` tag is not copied automatically because its reuse rights may differ from the OSM data license.

## Running imports for production

- Read the `.pbf` and build a snapshot on **your own computer** (`pip install -r requirements-import.txt`, then
  `import_osm_places --pbf nigeria-latest.osm.pbf --cities Abuja,Lagos --categories all --export-json snapshot.json`). This
  needs pyosmium and a few GB of RAM, which a small web service should not carry.
- Load the snapshot into the production database with the normal requirements: `railway run python manage.py
  import_osm_places --file snapshot.json --categories all`. Run it with `--dry-run` first. Re-running is safe.
- After importing, restaurants get a `subtype` (buka / grill / bakery / fine dining) so the Eats page can filter them in
  the database. Rows imported before that field existed are classified by migration `0004`.

## Photos

OpenStreetMap does not supply photos, and its `image` tag is not copied automatically because reuse rights vary. Photos come
from the people who own the places:

- Directory listings: the owner (or staff, for unclaimed map listings) uploads from the listing page.
- Restaurants on Eats: the vendor uploads a store photo and dish photos from the vendor dashboard.

Uploads go straight from the browser to the private bucket, are resized on the device first (which also removes the GPS
position phones hide inside photos), and are checked on the server by their real bytes, not just their label, before
they are saved. By default the bucket stays private and photos are shown through short-lived signed links, which a browser
cannot cache. If you want fast, cacheable images, put a CDN in front of a public-read bucket and set
`LISTING_IMAGE_PUBLIC_BASE_URL` to its address; photo URLs then become stable.

## Verification

The "Verified listing" badge appears only on listings with `is_verified` set. Imported map data is **not** verified: do not
set the flag in bulk.

## Getting photos for the places you already imported

There is no free, legal, bulk source of restaurant photos: Google, Foursquare and most websites do not allow copying their
pictures into your database. The reliable sources are people who have the right to give you a photo:

1. **The place itself.** Restaurants usually have good photos on WhatsApp. Ask for one and load it (below).
2. **Your own team / field agents.** Photograph places with the owner's permission.
3. **Owners and staff in the app.** Owners upload from the listing page; staff can upload for unclaimed places.

Staff workflow for a batch:

```
python manage.py export_photo_worklist --city Abuja --limit 200 --out worklist.csv   # who still needs a photo
# collect photos, save each as <id>.jpg in a folder (the id is the first column), then:
python manage.py import_listing_photos --folder photos/ --dry-run                     # check first
python manage.py import_listing_photos --folder photos/                               # load them
```

The importer checks every file by its real bytes, resizes it, removes hidden GPS data, stores it in the private bucket, and
reports any file it could not use. Places that already have a photo are skipped unless you add `--replace`.

To make a review pack of openly licensed Commons candidates for approved listings that still need photos, run this from
`Backend/src`, choosing a new, empty output folder (the command will not overwrite an existing pack):

```powershell
python manage.py collect_commons_photos --city Abuja --category all --limit 100 --output-dir commons-review-ready
```

The command searches Commons by listing name, downloads up to two candidates per listing into
`commons-review-ready/<listing-id>/`, and writes `commons-review-ready/manifest.csv` with the Commons page, license,
creator, and credit information. It also creates `commons-review-ready/import-map.csv`, selecting the first downloaded candidate for each
listing. Review the images and Commons pages, and edit that map's `file` value if you prefer another candidate. Then
attach the selected photos using the existing bulk importer:

```powershell
python manage.py import_listing_photos --folder commons-review-ready --map commons-review-ready/import-map.csv --dry-run
python manage.py import_listing_photos --folder commons-review-ready --map commons-review-ready/import-map.csv
```

The collector accepts CC0, public-domain-mark, CC BY, and CC BY-SA licenses; it excludes non-commercial and
no-derivatives licenses. Results are suggestions, not verified matches: inspect each image and its Commons page before
use, and keep the manifest with the review pack. The current app has no listing-photo attribution field, so do not
upload these candidates to production until the required attribution can be shown alongside the image.

The collector uses a descriptive User-Agent, asks Commons to defer when servers are busy, and retries temporary
rate-limit/server errors. If a listing still fails, its error includes the HTTP status and a short response body. Wait
before rerunning and increase `--delay` (for example, `--delay 3`). Each run needs a new, empty output folder; partial
results are preserved and are not overwritten. A Commons search with no matching files is counted as no match; thumbnails
served from `thumb.wikimedia.org` are accepted as well as originals from `upload.wikimedia.org`.

To see whether OpenStreetMap volunteers already tagged any places with a picture or a Wikimedia Commons file (Commons
files have clear licences; the plain `image` tag does not, so check the licence before using one), count the tags in your
snapshot (`--export-json`). Notable buildings (hospitals, universities, ministries) are far more likely to have a Commons
photo than restaurants.

```
python - <<'PY'
import json, collections
els = [e for e in json.load(open('snapshot.json'))['elements'] if (e.get('tags') or {}).get('name')]
keys = ['image', 'wikimedia_commons', 'wikidata', 'website', 'contact:website', 'contact:facebook', 'contact:instagram']
count = collections.Counter(k for e in els for k in keys if k in e['tags'])
print(f"{len(els)} named places")
for k in keys: print(f"  {k:20s} {count[k]}")
PY
```
