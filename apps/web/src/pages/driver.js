/* ==========================================================================
   THEKAPITA DRIVER PORTAL
   - signed out            -> auth.html?next=driver.html
   - signed in, not driver -> driver-signup.html   (API answers 403 on /driver/me)
   - driver                -> dashboard wired to /api/driver/* (same rides the rider app books)
   ========================================================================== */
import { authorizedRequest, getCurrentUser, hydrateProfile, isAuthenticated } from '../state/session.js';
import { ApiError } from '../api/client.js';
import { ENDPOINTS } from '@thekapita/shared/endpoints';
import { $, closeModal, errorMessage, h, money, moneyShort, openModal, setText, toast } from '../ui/dom.js';
import { createMap, currentPosition, DEFAULT_CENTER, geocode, hasCoords, pin, upsertMarker } from '../ui/map.js';

const POLL_MS = 5000;           // how often we ask "do I have a ride?"
const LOCATION_PUSH_MS = 6000;  // how often we tell the server where we are (while online)
const ACK_KEY = 'kapita.driver.ack';

const state = {
  driver: null,
  ride: null,          // the active ride from /driver/active, or null
  pos: null,           // {lat, lng} from the browser's GPS
  watchId: null,
  lastPush: 0,
  pollTimer: null,
  map: null,
  me: null,            // my marker
  pickupMarker: null,
  dropMarker: null,
  route: null,
  geocodeCache: new Map(),
  busy: false,
};

/* ---------- boot ---------- */

async function boot() {
  if (!isAuthenticated()) {
    window.location.replace('auth.html?next=driver.html');
    return;
  }
  try {
    state.driver = await authorizedRequest(ENDPOINTS.driver.me);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      window.location.replace('driver-signup.html'); // not registered as a driver: go sign up
      return;
    }
    showBootError(err);
    return;
  }

  if (!getCurrentUser()) await hydrateProfile().catch(() => {});
  state.map = createMap('driverMap', { center: DEFAULT_CENTER });
  renderDriver();
  await Promise.all([refreshSummary(), refreshHistory(), pollActive()]);
  if (state.driver.is_online) startTracking();
  startPolling();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pollActive();
  });
}

function showBootError(err) {
  setText('statusBannerTitle', 'Could not load the driver portal');
  setText('statusBannerSub', errorMessage(err, 'Check your connection and refresh the page.'));
}

/* ---------- header / status ---------- */

function renderDriver() {
  const d = state.driver;
  const user = getCurrentUser();
  const online = d.is_online && d.is_active;
  $('driverOnlineToggle').classList.toggle('online', online);
  $('driverOnlineToggle').classList.toggle('offline', !online);
  $('driverOnlineToggle').disabled = !d.is_active;
  setText('statusLabel', online ? 'ONLINE' : 'OFFLINE');
  $('statusBanner').classList.toggle('online', online);
  $('statusBanner').classList.toggle('offline', !online);

  if (!d.is_active) {
    setText('statusBannerTitle', 'Awaiting approval');
    setText('statusBannerSub', 'We are reviewing your details. You can go online as soon as you are approved.');
  } else if (online) {
    setText('statusBannerTitle', 'You are Online & Visible');
    setText('statusBannerSub', 'Ready to receive nearby ride requests');
  } else {
    setText('statusBannerTitle', 'You are Offline');
    setText('statusBannerSub', 'Go online to start receiving ride requests');
  }

  setText('statPlate', d.plate_number);
  setText('statVehicle', d.vehicle);
  setText('profileName', d.name);
  setText('profileApproval', d.is_active ? 'Verified Partner' : 'Pending approval');
  $('pfName').value = d.name;
  $('pfPhone').value = d.phone;
  $('pfEmail').value = user?.email || '';
  $('pfVehicle').value = d.vehicle;
  $('pfPlate').value = d.plate_number;
}

async function toggleOnlineState() {
  if (state.busy) return;
  const goOnline = !state.driver.is_online;
  state.busy = true;
  try {
    state.driver = await authorizedRequest(ENDPOINTS.driver.status, { method: 'POST', body: { online: goOnline } });
    renderDriver();
    if (state.driver.is_online) {
      startTracking();
      toast('You are online', 'success');
    } else {
      stopTracking();
      toast('You are offline');
    }
    pollActive();
  } catch (err) {
    toast(errorMessage(err), 'error');
  } finally {
    state.busy = false;
  }
}

/* ---------- GPS ---------- */

function startTracking() {
  if (!navigator.geolocation) {
    toast('This device has no GPS, so riders cannot see you on the map.', 'error');
    return;
  }
  if (state.watchId !== null) return;
  state.watchId = navigator.geolocation.watchPosition(
    (p) => onPosition({ lat: p.coords.latitude, lng: p.coords.longitude }),
    () => toast('Location is off. Riders will not see you on their map.', 'error'),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
  );
}

function stopTracking() {
  if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = null;
}

function onPosition(pos) {
  const first = !state.pos;
  state.pos = pos;
  if (state.map) {
    const icon = pin('\uD83D\uDE97', '#0f172a');
    state.me = upsertMarker(state.map, state.me, [pos.lat, pos.lng], { icon });
    if (first && !state.ride) state.map.setView([pos.lat, pos.lng], 15);
  }
  const now = Date.now();
  if (state.driver?.is_online && now - state.lastPush >= LOCATION_PUSH_MS) {
    state.lastPush = now;
    authorizedRequest(ENDPOINTS.driver.location, {
      method: 'POST',
      body: { latitude: pos.lat, longitude: pos.lng },
    }).catch(() => {}); // a missed ping is fine; the next one follows in a few seconds
  }
}

async function recenterMap() {
  const pos = state.pos || (await currentPosition());
  if (pos && state.map) state.map.setView([pos.lat, pos.lng], 16);
  else toast('Could not get your location. Check browser permissions.', 'error');
}

/* ---------- polling the active ride ---------- */

function startPolling() {
  clearInterval(state.pollTimer);
  state.pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') pollActive();
  }, POLL_MS);
}

async function pollActive() {
  try {
    const ride = await authorizedRequest(ENDPOINTS.driver.active);
    const previous = state.ride;
    state.ride = ride;
    renderRide(ride, previous);
  } catch (err) {
    if (!(err instanceof ApiError)) return;
    if (err.status === 403) window.location.replace('driver-signup.html');
  }
}

async function handleRideEnded(previous) {
  // The ride vanished from /active without us completing it: the rider cancelled.
  try {
    const [latest] = await authorizedRequest(`${ENDPOINTS.driver.rides}?limit=1`);
    if (latest?.reference === previous.reference && latest.status === 'cancelled') {
      toast('The rider cancelled this ride.', 'error');
    }
  } catch {
    /* ignore */
  }
  state.driver = await authorizedRequest(ENDPOINTS.driver.me).catch(() => state.driver);
  renderDriver();
  refreshSummary();
  refreshHistory();
}

const STEP = {
  assigned: { pill: 'NAVIGATING TO PICKUP', button: 'I Have Arrived at Pickup', icon: 'navigation' },
  arrived: { pill: 'WAITING FOR RIDER PIN', button: null, icon: 'lock' },
  in_progress: { pill: 'TRIP IN PROGRESS', button: 'Complete Trip', icon: 'flag' },
};

function renderRide(ride, previous) {
  const card = $('activeTripCard');
  if (!ride) {
    card.style.display = 'none';
    clearRouteMarkers();
    if (previous) handleRideEnded(previous);
    return;
  }

  // First time we see this ride: announce it.
  if (sessionStorage.getItem(ACK_KEY) !== ride.reference && ride.status === 'assigned') showIncoming(ride);

  const step = STEP[ride.status] || STEP.assigned;
  card.style.display = 'block';
  setText('activeTripTypePill', step.pill);
  setText('activeTripFare', money(ride.fare));
  setText('customerName', ride.rider_name);
  setText('customerMeta', `You earn ${money(ride.payout)} \u2022 Paid via Kapita Wallet`);
  const call = $('customerCall');
  call.href = ride.rider_phone ? `tel:${ride.rider_phone}` : '#';
  call.style.display = ride.rider_phone ? '' : 'none';
  renderPlace('tripPickupText', ride.pickup, ride.pickup_lat, ride.pickup_lng);
  renderPlace('tripDropText', ride.destination, ride.destination_lat, ride.destination_lng);

  $('otpVerifyBox').classList.toggle('hidden', ride.status !== 'arrived');
  $('otpVerifyBox').style.display = ride.status === 'arrived' ? 'block' : 'none';
  const btn = $('tripMainActionBtn');
  btn.style.display = step.button ? '' : 'none';
  if (step.button) {
    setText('tripBtnText', step.button);
    btn.querySelector('.material-symbols-outlined').textContent = step.icon;
  }
  drawRideOnMap(ride);
}

function renderPlace(id, text, lat, lng) {
  const node = $(id);
  node.textContent = text;
  if (hasCoords(lat, lng)) {
    node.append(' ', h('a', {
      href: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
      target: '_blank', rel: 'noopener', style: 'font-size:11px;color:#008a57;font-weight:700;',
    }, 'Navigate'));
  }
}

/* ---------- map ---------- */

async function coordsFor(ride) {
  // Prefer coordinates the rider's app sent; otherwise geocode the typed address once and remember it.
  const out = {};
  for (const [key, text, lat, lng] of [
    ['pickup', ride.pickup, ride.pickup_lat, ride.pickup_lng],
    ['drop', ride.destination, ride.destination_lat, ride.destination_lng],
  ]) {
    if (hasCoords(lat, lng)) { out[key] = { lat, lng }; continue; }
    const cacheKey = `${ride.reference}:${key}`;
    if (!state.geocodeCache.has(cacheKey)) state.geocodeCache.set(cacheKey, geocode(text));
    out[key] = await state.geocodeCache.get(cacheKey);
  }
  return out;
}

async function drawRideOnMap(ride) {
  if (!state.map) return;
  const { pickup, drop } = await coordsFor(ride);
  if (state.ride?.reference !== ride.reference) return; // ride changed while we were geocoding
  const L = window.L;
  if (pickup) state.pickupMarker = upsertMarker(state.map, state.pickupMarker, [pickup.lat, pickup.lng], { icon: pin('\uD83D\uDCCD') });
  if (drop) state.dropMarker = upsertMarker(state.map, state.dropMarker, [drop.lat, drop.lng], { icon: pin('\uD83C\uDFC1', '#ef4444') });
  const points = [state.pos, pickup, drop].filter(Boolean).map((p) => [p.lat, p.lng]);
  if (state.route) state.route.remove();
  if (points.length > 1) {
    // Straight lines only; swap in a routing API (OSRM / Mapbox Directions) for real road geometry + ETA.
    state.route = L.polyline(points, { color: '#00d084', weight: 4, opacity: 0.8, dashArray: '8 8' }).addTo(state.map);
    if (state.lastFitted !== `${ride.reference}:${ride.status}`) {
      state.map.fitBounds(state.route.getBounds(), { padding: [30, 30] });
      state.lastFitted = `${ride.reference}:${ride.status}`;
    }
  }
}

function clearRouteMarkers() {
  for (const key of ['pickupMarker', 'dropMarker', 'route']) {
    state[key]?.remove();
    state[key] = null;
  }
  state.lastFitted = null;
}

/* ---------- trip actions ---------- */

function showIncoming(ride) {
  setText('incomingFare', money(ride.fare));
  setText('incomingPayoutNote', `You earn ${money(ride.payout)} after the platform fee`);
  setText('incomingRider', ride.rider_name);
  setText('incomingType', ride.ride_type.replaceAll('_', ' '));
  setText('incomingPickup', ride.pickup);
  setText('incomingDrop', ride.destination);
  openModal('incomingRequestModal');
}

function acceptRequest() {
  if (state.ride) sessionStorage.setItem(ACK_KEY, state.ride.reference);
  closeModal('incomingRequestModal');
  $('activeTripCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function runRideAction(path, body) {
  if (state.busy || !state.ride) return null;
  state.busy = true;
  try {
    const ride = await authorizedRequest(path, { method: 'POST', body });
    state.ride = ride;
    return ride;
  } catch (err) {
    toast(errorMessage(err), 'error');
    if (err instanceof ApiError && (err.status === 404 || err.status === 409)) pollActive(); // state changed under us: resync
    return null;
  } finally {
    state.busy = false;
  }
}

async function advanceTripState() {
  const ride = state.ride;
  if (!ride) return;
  if (ride.status === 'assigned') {
    const next = await runRideAction(ENDPOINTS.driver.arrived(ride.reference));
    if (next) renderRide(next, ride);
  } else if (ride.status === 'in_progress') {
    const done = await runRideAction(ENDPOINTS.driver.complete(ride.reference));
    if (!done) return;
    state.ride = null;
    renderRide(null, null);
    showSummary(done);
  }
}

async function verifyOTP() {
  const ride = state.ride;
  const otp = $('otpCodeInput').value.trim();
  if (!ride) return;
  if (!/^\d{4}$/.test(otp)) return toast('Enter the rider\u2019s 4-digit PIN.', 'error');
  const next = await runRideAction(ENDPOINTS.driver.start(ride.reference), { otp });
  if (next) {
    $('otpCodeInput').value = '';
    renderRide(next, ride);
    toast('Trip started', 'success');
  }
}

function showSummary(ride) {
  const pct = Number(state.summary?.platform_fee_percent ?? 12.5);
  setText('sumGross', money(ride.fare));
  setText('sumFeeLabel', `Platform Fee (${pct}%)`);
  setText('sumFee', `-${money(Number(ride.fare) - Number(ride.payout))}`);
  setText('sumNet', money(ride.payout));
  openModal('tripSummaryModal');
}

async function finishTripWorkflow() {
  closeModal('tripSummaryModal');
  state.driver = await authorizedRequest(ENDPOINTS.driver.me).catch(() => state.driver);
  renderDriver();
  refreshSummary();
  refreshHistory();
  pollActive();
}

/* ---------- earnings & history ---------- */

async function refreshSummary() {
  try {
    const s = await authorizedRequest(ENDPOINTS.driver.summary);
    state.summary = s;
    setText('statEarnings', moneyShort(s.today_earnings));
    setText('statTripsToday', String(s.completed_today));
    setText('statTripsTotal', `${s.total_trips} trip${s.total_trips === 1 ? '' : 's'} total`);
    setText('statBalance', moneyShort(s.balance));
    setText('earnBalance', money(s.balance));
    setText('statFeeNote', `After ${Number(s.platform_fee_percent)}% platform fee`);
    renderWeek(s.week);
  } catch {
    /* keep placeholders */
  }
}

function renderWeek(week) {
  const chart = $('weeklyChart');
  if (!chart) return;
  const max = Math.max(...week.map((d) => Number(d.earnings)), 1);
  chart.replaceChildren(...week.map((d, i) => h('div', { class: 'chart-bar-group', title: `${d.label}: ${money(d.earnings)}` },
    h('div', { class: `bar-pill${i === week.length - 1 ? ' active' : ''}`, style: `height:${Math.max(4, (Number(d.earnings) / max) * 100)}%;` }),
    h('span', { class: 'bar-label' }, d.label),
  )));
}

async function refreshHistory() {
  const list = $('tripHistoryList');
  try {
    const rides = await authorizedRequest(`${ENDPOINTS.driver.rides}?limit=20`);
    if (!rides.length) return;
    list.replaceChildren(...rides.map((r) => h('div', { class: 'log-item' },
      h('div', { class: 'log-item-left' },
        h('div', { class: 'log-icon-box' }, h('span', { class: 'material-symbols-outlined' }, 'electric_car')),
        h('div', {},
          h('h4', { class: 'log-title' }, `${r.ride_type.replaceAll('_', ' ')} \u2022 ${r.status_label}`),
          h('p', { class: 'log-sub' }, `${r.pickup} \u2794 ${r.destination}`),
        ),
      ),
      h('div', {},
        h('p', { class: 'log-price' }, moneyShort(r.status === 'completed' ? r.payout : r.fare)),
        h('p', { class: 'log-status' }, new Date(r.created_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })),
      ),
    )));
  } catch {
    /* keep placeholder */
  }
}

/* ---------- profile ---------- */

async function saveProfileSettings(event) {
  event.preventDefault();
  const button = $('pfSave');
  button.disabled = true;
  try {
    state.driver = await authorizedRequest(ENDPOINTS.driver.me, {
      method: 'PATCH',
      body: { phone: $('pfPhone').value.trim(), vehicle: $('pfVehicle').value.trim() },
    });
    renderDriver();
    toast('Profile saved', 'success');
  } catch (err) {
    toast(errorMessage(err), 'error');
  } finally {
    button.disabled = false;
  }
}

/* ---------- tabs ---------- */

function switchTab(tabId, btn) {
  document.querySelectorAll('.tab-content').forEach((tab) => tab.classList.add('hidden-tab'));
  $(tabId)?.classList.remove('hidden-tab');
  document.querySelectorAll('.market-nav-btn').forEach((b) => {
    const matches = btn ? b === btn : b.getAttribute('onclick')?.includes(`'${tabId}'`);
    b.classList.toggle('active', Boolean(matches));
  });
  if (tabId === 'dashboardTab') setTimeout(() => state.map?.invalidateSize(), 50);
}

/* The page's inline onclick="..." handlers call these by name. */
Object.assign(window, {
  toggleOnlineState, acceptRequest, advanceTripState, verifyOTP, finishTripWorkflow,
  recenterMap, saveProfileSettings, switchTab,
  openModal, closeModal,
});

boot();
