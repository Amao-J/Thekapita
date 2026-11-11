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

export async function geocode(address, { country = 'ng', timeoutMs = 4000 } = {}) {
  const query = String(address || '').trim();
  if (!query) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `${GEOCODER_URL}?format=jsonv2&limit=1&countrycodes=${country}&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const [hit] = await res.json();
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
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
