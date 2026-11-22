/**
 * Road routes: distance + arrival time from the backend (/routing/route -> TomTom with live traffic, or OSRM
 * without). Everything here fails soft: when no road route is available callers get null and can show the
 * clearly-labelled straight-line estimate instead, so booking and tracking never depend on a routing provider.
 */
import { authorizedRequest, isAuthenticated } from '../state/session.js';
import { ENDPOINTS } from '@thekapita/shared/endpoints';
import { hasCoords } from './map.js';

const CACHE_MS = 60_000;
const cache = new Map();     // key -> { at, route }
const inflight = new Map();  // key -> Promise (two callers asking for the same leg share one request)

export function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const x = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(x));
}

const cell = (n, places) => n.toFixed(places);
const keyFor = (from, to, places = 4) => `${cell(from.lat, places)},${cell(from.lng, places)}>${cell(to.lat, places)},${cell(to.lng, places)}`;

function valid(r) {
  return r && Number.isFinite(r.distance_km) && Number.isFinite(r.duration_min) && Array.isArray(r.geometry);
}

/** Road route between two {lat,lng} points, or null (signed out, offline, provider down, bad data). Never throws. */
export async function getRoadRoute(from, to) {
  if (!from || !to || !hasCoords(from.lat, from.lng) || !hasCoords(to.lat, to.lng) || !isAuthenticated()) return null;
  const key = keyFor(from, to);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.route;
  if (inflight.has(key)) return inflight.get(key);

  const params = new URLSearchParams({ from_lat: from.lat, from_lng: from.lng, to_lat: to.lat, to_lng: to.lng });
  const pending = authorizedRequest(`${ENDPOINTS.routing.route}?${params}`)
    .then((r) => {
      if (!valid(r)) return null;
      const route = {
        distanceKm: r.distance_km,
        minutes: Math.max(r.distance_km > 0 ? 1 : 0, Math.round(r.duration_min)),
        minutesNoTraffic: Math.round(r.duration_no_traffic_min ?? r.duration_min),
        delayMinutes: Math.round(r.traffic_delay_min ?? 0),
        traffic: Boolean(r.traffic),
        provider: r.provider,
        geometry: r.geometry,
        source: 'road',
      };
      cache.set(key, { at: Date.now(), route });
      return route;
    })
    .catch(() => null)
    .finally(() => inflight.delete(key));
  inflight.set(key, pending);
  return pending;
}

// Straight-line distance, road distance is typically ~30% longer, at ~30 km/h in town. Only a fallback.
const ROAD_FACTOR = 1.3;
const CITY_SPEED_KMH = 30;

export function estimateRoute(from, to) {
  const km = haversineKm(from, to);
  return {
    distanceKm: km,
    minutes: Math.max(1, Math.round(((km * ROAD_FACTOR) / CITY_SPEED_KMH) * 60)),
    traffic: false, delayMinutes: 0, geometry: null, source: 'estimate',
  };
}

const fmtKm = (km) => (km < 10 ? km.toFixed(1) : String(Math.round(km)));

/** One honest sentence: says whether it is a road route, whether live traffic is included, or just an estimate. */
export function describeRoute(route) {
  if (route.source !== 'road') {
    return `${fmtKm(route.distanceKm)} km in a straight line \u2022 roughly ${route.minutes} min by road (estimate)`;
  }
  let note = ' (no live traffic)';
  if (route.traffic) note = route.delayMinutes >= 2 ? ` (includes ${route.delayMinutes} min of traffic delay)` : ' (live traffic, clear roads)';
  return `${fmtKm(route.distanceKm)} km by road \u2022 about ${route.minutes} min${note}`;
}

/* ---- live ride tracking: which leg to show, and when it is worth asking again ---- */

const pos = (lat, lng) => (hasCoords(lat, lng) ? { lat, lng } : null);

/**
 * assigned -> driver to pickup; in_progress -> driver to destination; otherwise the planned trip pickup -> destination.
 * Returns { kind, from, to } or null when the needed coordinates are missing.
 */
export function pickLeg(booking, driverPos) {
  const pickup = pos(booking.pickup_lat, booking.pickup_lng);
  const dest = pos(booking.destination_lat, booking.destination_lng);
  const driver = driverPos && pos(driverPos.lat, driverPos.lng);
  if (booking.status === 'assigned' && driver && pickup) return { kind: 'to_pickup', from: driver, to: pickup };
  if (booking.status === 'in_progress' && driver && dest) return { kind: 'to_destination', from: driver, to: dest };
  if (['requested', 'assigned', 'arrived'].includes(booking.status) && pickup && dest) return { kind: 'trip', from: pickup, to: dest };
  return null;
}

/** Driver positions arrive every few seconds; re-route only if the leg changed or they moved ~100 m and 20 s passed. */
export function shouldRecalculate(prev, leg, now = Date.now(), minGapMs = 20_000) {
  if (!leg) return false;
  if (!prev || prev.kind !== leg.kind) return true;
  return keyFor(leg.from, leg.to, 3) !== prev.key && now - prev.at >= minGapMs;
}

export const legKey = (leg) => keyFor(leg.from, leg.to, 3);

/** Status line for a leg once its road route is known (null for the planned trip: that line stays as it was). */
export function legMessage(leg, route) {
  if (!leg || !route || route.source !== 'road') return null;
  const mins = route.minutes;
  const away = `${fmtKm(route.distanceKm)} km by road`;
  const traffic = route.traffic && route.delayMinutes >= 2 ? `, ${route.delayMinutes} min of it traffic` : '';
  if (leg.kind === 'to_pickup') return `Your driver is about ${mins} min away (${away}${traffic}).`;
  if (leg.kind === 'to_destination') return `About ${mins} min to your destination (${away}${traffic}).`;
  return null;
}
