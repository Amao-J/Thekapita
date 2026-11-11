/**
 * Leaflet helpers. Leaflet itself is loaded by a <script> tag in the page (window.L).
 *
 * TILES: tile.openstreetmap.org is a donated community service whose usage policy forbids heavy
 * or commercial use and may block you without notice. Set VITE_MAP_TILE_URL (+ VITE_MAP_ATTRIBUTION)
 * to a commercial raster-tile provider (MapTiler, Stadia, Mapbox, Geoapify...) before launch.
 * The OSM default below is for development only.
 */
const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION =
  import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Abuja city centre: sensible default until we know where the user is.
export const DEFAULT_CENTER = [9.0765, 7.3986];

export function createMap(elementId, { center = DEFAULT_CENTER, zoom = 13 } = {}) {
  const L = window.L;
  if (!L || !document.getElementById(elementId)) return null;
  const map = L.map(elementId, { zoomControl: false }).setView(center, zoom);
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION, referrerPolicy: 'strict-origin-when-cross-origin' }).addTo(map);
  L.control.zoom({ position: 'topright' }).addTo(map);
  return map;
}

export function pin(emoji, bg = '#008a57') {
  return window.L.divIcon({
    className: 'kapita-pin',
    html: `<div style="background:${bg};color:#fff;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 6px rgba(0,0,0,.35)">${emoji}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

/** Move an existing marker or create it. Returns the marker. */
export function upsertMarker(map, marker, latlng, options) {
  if (marker) {
    marker.setLatLng(latlng);
    return marker;
  }
  return window.L.marker(latlng, options).addTo(map);
}

export function hasCoords(lat, lng) {
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng);
}

/**
 * Forward-geocode a free-text address. Defaults to Nominatim, which is fine for a handful of
 * lookups (1 request/second max, no autocomplete, identify your app). For launch use a paid
 * geocoder (Geoapify, Mapbox, Google Places) via VITE_GEOCODER_URL. Best-effort: resolves null on failure.
 */
const GEOCODER_URL = import.meta.env.VITE_GEOCODER_URL || 'https://nominatim.openstreetmap.org/search';
const REVERSE_URL = import.meta.env.VITE_REVERSE_GEOCODER_URL || 'https://nominatim.openstreetmap.org/reverse';
// Nominatim allows at most 1 request/second. Every lookup below waits its turn; set to 0 for a paid provider.
const MIN_GAP_MS = Number(import.meta.env.VITE_GEOCODER_MIN_GAP_MS ?? 1100);

let nextSlot = 0;
async function waitForSlot() {
  const now = Date.now();
  const start = Math.max(now, nextSlot);
  nextSlot = start + MIN_GAP_MS;
  if (start > now) await new Promise((resolve) => setTimeout(resolve, start - now));
}

async function lookup(url, timeoutMs) {
  await waitForSlot();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** "Road, Neighbourhood, City" from a Nominatim hit (falls back to the first parts of display_name). */
export function shortLabel(hit) {
  if (!hit) return '';
  const a = hit.address || {};
  const street = a.road || a.pedestrian || a.footway || a.path || hit.name || '';
  const area = a.neighbourhood || a.suburb || a.quarter || a.residential || '';
  const city = a.city || a.town || a.village || a.municipality || a.state_district || a.state || '';
  const seen = new Set();
  const parts = [street, area, city].filter((p) => p && !seen.has(p.toLowerCase()) && seen.add(p.toLowerCase()));
  if (parts.length) return parts.join(', ');
  return String(hit.display_name || '').split(',').slice(0, 3).map((s) => s.trim()).filter(Boolean).join(', ');
}

export async function geocode(address, { country = 'ng', timeoutMs = 4000 } = {}) {
  const query = String(address || '').trim();
  if (!query) return null;
  const url = `${GEOCODER_URL}?format=jsonv2&limit=1&countrycodes=${country}&q=${encodeURIComponent(query)}`;
  const hits = await lookup(url, timeoutMs);
  const hit = Array.isArray(hits) ? hits[0] : null;
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
}

/** Up to 5 places matching a typed query, nearest to `near` {lat,lng} first when given. Call on submit, not per keystroke. */
export async function searchPlaces(query, { near = null, country = 'ng', timeoutMs = 5000 } = {}) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  let url = `${GEOCODER_URL}?format=jsonv2&addressdetails=1&limit=5&countrycodes=${country}&q=${encodeURIComponent(q)}`;
  if (near && hasCoords(near.lat, near.lng)) {
    const d = 0.5; // ~55 km box: a bias toward the user's area, not a hard limit
    url += `&viewbox=${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`;
  }
  const hits = await lookup(url, timeoutMs);
  if (!Array.isArray(hits)) return [];
  return hits
    .map((h) => ({ label: shortLabel(h), lat: Number(h.lat), lng: Number(h.lon) }))
    .filter((p) => p.label && hasCoords(p.lat, p.lng));
}

/** A readable address for a map point, or null if the lookup fails (callers fall back to the coordinates). */
export async function reverseGeocode(lat, lng, { timeoutMs = 5000 } = {}) {
  if (!hasCoords(lat, lng)) return null;
  const hit = await lookup(`${REVERSE_URL}?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`, timeoutMs);
  if (!hit || hit.error) return null;
  return shortLabel(hit) || null;
}

/** True when the browser has already been allowed to read location (so we can use it without a surprise prompt). */
export async function locationAlreadyGranted() {
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' });
    return status?.state === 'granted';
  } catch {
    return false;
  }
}

export function currentPosition(timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15000 },
    );
  });
}
