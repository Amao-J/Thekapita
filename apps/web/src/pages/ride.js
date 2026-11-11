/* ==========================================
   THEKAPITA RIDE & LOGISTICS ENGINE (LIVE API + ACCESSIBILITY + LEAFLET MAP)
   ========================================== */

import { authorizedRequest, isAuthenticated } from '../state/session.js';
import { ApiError, newIdempotencyKey } from '../api/client.js';
import { ENDPOINTS } from '@thekapita/shared/endpoints';
import { createMap, geocode, hasCoords, pin, upsertMarker } from '../ui/map.js';

const ACTIVE_KEY = 'kapita.ride.active.v1';
const TERMINAL_STATUSES = ['cancelled', 'completed'];
const RIDE_POLL_MS = 5000;

let currentMainService = 'ride';
let selectedRideType = 'Kapita Go';
let selectedRidePrice = 2200;
let selectedPackageType = 'Document / Envelope';
let selectedPackagePrice = 1500;
let deliverySpeedTier = 'standard';
let splitCoRidersCount = 1;
let isOnline = navigator.onLine;
let lastFailedAction = null;
let rideRequestKey = null;

// Leaflet Map Global Handles
let trackingMap = null;
let driverMarker = null;
let routePolyline = null;

document.addEventListener('DOMContentLoaded', function () {
  initNetworkListeners();
  if (document.getElementById('rideOriginInput')) {
    fetchWalletBalance();
    setupCoRiderButtons();
  } else {
    initActiveRidePage();
  }
});

/* ==========================================================================
   ACTIVE RIDE PAGE (ride-active.html): live status + driver tracking
   ========================================================================== */
let activeBooking = null;
let ridePollTimer = null;
let rideMap = null;
const rideMarkers = { pickup: null, drop: null, driver: null };
let fittedToDriver = false;

function readStoredBooking() {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null');
  } catch {
    return null;
  }
}

function storeBooking(booking) {
  activeBooking = booking;
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(booking));
}

function initActiveRidePage() {
  rideMap = createMap('rideMap');
  renderActiveRideRequest();
  if (!isAuthenticated()) {
    window.location.replace('auth.html?next=ride-active.html');
    return;
  }
  refreshActiveRideRequest();
  clearInterval(ridePollTimer);
  ridePollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') refreshActiveRideRequest();
  }, RIDE_POLL_MS);
}

function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(x));
}

const RIDE_COPY = {
  requested: ['WAITING FOR DRIVER', 'Your request is queued until a compatible driver is available.'],
  assigned: ['DRIVER ASSIGNED', 'A driver accepted your request and is on the way. Your wallet has been charged.'],
  arrived: ['DRIVER HAS ARRIVED', 'Your driver is at the pickup point. Share your PIN to start the trip.'],
  in_progress: ['TRIP IN PROGRESS', 'Enjoy your ride. We will let you know when you arrive.'],
  cancelled: ['CANCELLED', 'Ride request cancelled.'],
  completed: ['COMPLETED', 'This ride has been completed. Thanks for riding with theKapita!'],
};

function renderActiveRideRequest() {
  const status = document.getElementById('rideRequestStatus');
  const booking = activeBooking || readStoredBooking();
  const cancelButton = document.getElementById('cancelRideRequestBtn');
  if (!booking) {
    if (status) status.textContent = 'No ride request was found. Return to Ride to book one.';
    if (cancelButton) cancelButton.disabled = true;
    return;
  }

  document.getElementById('rideRequestReference').textContent = booking.reference;
  document.getElementById('ridePickup').textContent = booking.pickup;
  document.getElementById('rideDestination').textContent = booking.destination;
  document.getElementById('rideType').textContent = booking.ride_type.replaceAll('_', ' ');
  document.getElementById('rideFare').textContent = `₦${Number(booking.fare).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

  const [badgeText, message] = RIDE_COPY[booking.status] || ['UPDATED', 'Ride status updated.'];
  let line = booking.status === 'cancelled' && booking.charged === false && booking.driver
    ? 'Ride cancelled. The fare has been refunded to your wallet.'
    : message;
  const driverPos = booking.driver && hasCoords(booking.driver.latitude, booking.driver.longitude)
    ? { lat: booking.driver.latitude, lng: booking.driver.longitude } : null;
  const pickupPos = hasCoords(booking.pickup_lat, booking.pickup_lng)
    ? { lat: booking.pickup_lat, lng: booking.pickup_lng } : null;
  if (driverPos && pickupPos && booking.status === 'assigned') {
    line = `Your driver is about ${distanceKm(driverPos, pickupPos).toFixed(1)} km away.`;
  }
  if (status) status.textContent = line;

  const badge = document.getElementById('rideStatusBadge');
  if (badge) {
    badge.textContent = badgeText;
    badge.classList.toggle('live', ['assigned', 'arrived', 'in_progress'].includes(booking.status));
  }

  const driverDetails = document.getElementById('rideDriverDetails');
  if (driverDetails) {
    driverDetails.hidden = !booking.driver;
    if (booking.driver) {
      document.getElementById('rideDriverName').textContent = booking.driver.name;
      document.getElementById('rideDriverVehicle').textContent =
        `${booking.driver.vehicle} · ${booking.driver.plate_number}`;
      document.getElementById('rideDriverPhone').href = `tel:${booking.driver.phone}`;
    }
  }

  const otpBox = document.getElementById('rideOtpBox');
  if (otpBox) {
    otpBox.hidden = !(booking.pickup_otp && booking.driver && ['assigned', 'arrived'].includes(booking.status));
    const otp = document.getElementById('rideOtp');
    if (otp) otp.textContent = booking.pickup_otp || '----';
  }

  const fareStatus = document.getElementById('rideFareStatus');
  if (fareStatus) {
    fareStatus.textContent = booking.charged
      ? 'Charged to Kapita Pay Wallet'
      : 'Charged when a driver is assigned';
  }
  if (cancelButton) cancelButton.disabled = !['requested', 'assigned', 'arrived'].includes(booking.status);
  updateRideMap(booking, driverPos, pickupPos);
}

async function updateRideMap(booking, driverPos, pickupPos) {
  if (!rideMap) return;
  const L = window.L;
  const destPos = hasCoords(booking.destination_lat, booking.destination_lng)
    ? { lat: booking.destination_lat, lng: booking.destination_lng } : null;
  // Older rides (or a failed geocode at booking time) have no coordinates: look the address up once.
  const pickup = pickupPos || await geocode(booking.pickup);
  const drop = destPos || await geocode(booking.destination);
  if (pickup) rideMarkers.pickup = upsertMarker(rideMap, rideMarkers.pickup, [pickup.lat, pickup.lng], { icon: pin('\uD83D\uDCCD') });
  if (drop) rideMarkers.drop = upsertMarker(rideMap, rideMarkers.drop, [drop.lat, drop.lng], { icon: pin('\uD83C\uDFC1', '#ef4444') });
  if (driverPos && !TERMINAL_STATUSES.includes(booking.status)) {
    rideMarkers.driver = upsertMarker(rideMap, rideMarkers.driver, [driverPos.lat, driverPos.lng], { icon: pin('\uD83D\uDE97', '#0f172a') });
  } else if (rideMarkers.driver) {
    rideMarkers.driver.remove();
    rideMarkers.driver = null;
  }
  const points = [driverPos, pickup, drop].filter(Boolean).map((p) => [p.lat, p.lng]);
  if (points.length && (!fittedToDriver || (driverPos && !fittedToDriver))) {
    rideMap.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
    fittedToDriver = Boolean(driverPos);
  }
}

async function refreshActiveRideRequest() {
  const stored = activeBooking || readStoredBooking();
  if (!stored) return;
  try {
    const result = await authorizedRequest(ENDPOINTS.rides.detail(stored.reference));
    storeBooking(result);
    renderActiveRideRequest();
    if (TERMINAL_STATUSES.includes(result.status)) clearInterval(ridePollTimer);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      // The cached ride belongs to someone else or no longer exists: forget it.
      localStorage.removeItem(ACTIVE_KEY);
      activeBooking = null;
      clearInterval(ridePollTimer);
      renderActiveRideRequest();
      return;
    }
    console.warn('[Ride App] Could not refresh ride status.', error);
  }
}

async function cancelActiveRideRequest() {
  const booking = activeBooking || readStoredBooking();
  if (!booking) return;
  const button = document.getElementById('cancelRideRequestBtn');
  const status = document.getElementById('rideRequestStatus');
  if (button) button.disabled = true;

  try {
    const result = await authorizedRequest(ENDPOINTS.rides.cancel(booking.reference), { method: 'POST' });
    storeBooking(result);
    renderActiveRideRequest();
    clearInterval(ridePollTimer);
  } catch (error) {
    if (status) status.textContent = error.message || 'Ride request could not be cancelled.';
    if (button) button.disabled = false;
    refreshActiveRideRequest();
  }
}

/* 1. Network & Offline State Handlers */
function initNetworkListeners() {
  window.addEventListener('online', () => {
    isOnline = true;
    toggleNetworkBanner(false);
    announceAccessibilityMessage("Internet connection restored.");
    if (lastFailedAction) retryLastRideAction();
  });

  window.addEventListener('offline', () => {
    isOnline = false;
    toggleNetworkBanner(true, "Network connection lost. Operating in offline mode.");
    announceAccessibilityMessage("Network connection lost.");
  });
}

function toggleNetworkBanner(show, text = "") {
  const banner = document.getElementById('networkAlertBanner');
  const alertText = document.getElementById('networkAlertText');
  if (!banner) return;

  if (show) {
    if (alertText) alertText.textContent = text;
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

function announceAccessibilityMessage(msg) {
  const announcer = document.getElementById('ariaLiveAnnouncer');
  if (announcer) announcer.textContent = msg;
}

/* 2. Live API Wallet Fetch */
async function fetchWalletBalance() {
  if (!isAuthenticated()) return;
  try {
    const data = await authorizedRequest(ENDPOINTS.wallet.balance);
    const display = document.getElementById('headerWalletDisplay');
    if (display && data.balance !== undefined) {
      display.textContent = `₦${parseFloat(data.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    }
  } catch {
    console.warn('[Ride App] Offline balance fallback active.');
  }
}

/* 3. Service Navigation Controls & Map Trigger */
function switchMainService(serviceKey) {
  currentMainService = serviceKey;

  const ridePane = document.getElementById('viewRideModule');
  const logisticsPane = document.getElementById('viewLogisticsModule');
  const trackingPane = document.getElementById('viewTrackingModule');

  if (ridePane) ridePane.style.display = serviceKey === 'ride' ? 'block' : 'none';
  if (logisticsPane) logisticsPane.style.display = serviceKey === 'logistics' ? 'block' : 'none';
  if (serviceKey === 'tracking') {
    // A real ride in progress has a real tracker on its own page; the radar below is still a parcel demo.
    const live = readStoredBooking();
    if (live && !TERMINAL_STATUSES.includes(live.status)) {
      window.location.href = 'ride-active.html';
      return;
    }
  }

  if (trackingPane) {
    trackingPane.style.display = serviceKey === 'tracking' ? 'block' : 'none';
    if (serviceKey === 'tracking') {
      setTimeout(initLiveTrackingMap, 250); // Initialize Leaflet map once DOM view is visible
    }
  }

  const toggleRideBtn = document.getElementById('toggleRideModeBtn');
  const toggleLogisticsBtn = document.getElementById('toggleLogisticsModeBtn');

  if (toggleRideBtn) {
    toggleRideBtn.classList.toggle('active', serviceKey === 'ride');
    toggleRideBtn.setAttribute('aria-selected', serviceKey === 'ride');
  }
  if (toggleLogisticsBtn) {
    toggleLogisticsBtn.classList.toggle('active', serviceKey === 'logistics');
    toggleLogisticsBtn.setAttribute('aria-selected', serviceKey === 'logistics');
  }

  const navRide = document.getElementById('navRideBtn');
  const navLogistics = document.getElementById('navLogisticsBtn');
  const navTracking = document.getElementById('navTrackingBtn');

  if (navRide) {
    navRide.classList.toggle('active', serviceKey === 'ride');
    navRide.setAttribute('aria-selected', serviceKey === 'ride');
  }
  if (navLogistics) {
    navLogistics.classList.toggle('active', serviceKey === 'logistics');
    navLogistics.setAttribute('aria-selected', serviceKey === 'logistics');
  }
  if (navTracking) {
    navTracking.classList.toggle('active', serviceKey === 'tracking');
    navTracking.setAttribute('aria-selected', serviceKey === 'tracking');
  }

  const headerMenu = document.getElementById('headerNavDropdownMenu');
  if (headerMenu) headerMenu.classList.remove('active');

  announceAccessibilityMessage(`Switched to ${serviceKey} module.`);
}

/* 4. Header Dropdown Control */
function toggleHeaderNavMenu(event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById('headerNavDropdownMenu');
  const btn = document.getElementById('headerNavMenuBtn');
  if (!dropdown) return;

  const isActive = dropdown.classList.contains('active');
  dropdown.classList.toggle('active', !isActive);
  if (btn) btn.setAttribute('aria-expanded', !isActive);
}

document.addEventListener('click', function (e) {
  const dropdown = document.getElementById('headerNavDropdownMenu');
  const btn = document.getElementById('headerNavMenuBtn');

  if (dropdown && dropdown.classList.contains('active')) {
    if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
      dropdown.classList.remove('active');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
  }
});

/* 5. Ride Hailing Module Logic */
function swapLocations() {
  const originInput = document.getElementById('rideOriginInput');
  const destinationInput = document.getElementById('rideDestinationInput');

  if (originInput && destinationInput) {
    const tempVal = originInput.value;
    originInput.value = destinationInput.value;
    destinationInput.value = tempVal;
    announceAccessibilityMessage("Pickup and destination addresses swapped.");
  }
}

function selectRideType(element, rideName, price) {
  document.querySelectorAll('.ride-option-card').forEach(card => {
    card.classList.remove('selected');
    card.setAttribute('aria-checked', 'false');
  });

  if (element) {
    element.classList.add('selected');
    element.setAttribute('aria-checked', 'true');
  }

  selectedRideType = rideName;
  selectedRidePrice = price;

  const btn = document.getElementById('requestRideBtn');
  if (btn) {
    btn.innerHTML = `Request ${rideName} • ₦${price.toLocaleString()}`;
  }

  updateFareSplitCalculation();
  announceAccessibilityMessage(`Selected ${rideName} for ${price} Naira`);
}

async function confirmRideBooking() {
  hideErrorNotice();
  if (!isAuthenticated()) {
    window.location.href = 'auth.html?next=ride.html';
    return;
  }
  const pickupInput = document.getElementById('rideOriginInput');
  const destInput = document.getElementById('rideDestinationInput');
  const pickup = pickupInput ? pickupInput.value.trim() : '';
  const dest = destInput ? destInput.value.trim() : '';

  if (!pickup || !dest) {
    showErrorNotice('Enter both pickup and destination locations.');
    if (!pickup && pickupInput) pickupInput.focus();
    else if (destInput) destInput.focus();
    return;
  }

  const btn = document.getElementById('requestRideBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-small" aria-hidden="true"></span> Searching for nearby drivers...`;
  }

  announceAccessibilityMessage(`Searching for nearby ${selectedRideType} drivers...`);

  try {
    rideRequestKey ||= newIdempotencyKey();
    const rideTypes = {
      'Kapita Go': 'kapita_go',
      'Kapita Comfort': 'kapita_comfort',
      'Kapita Keke Express': 'kapita_keke_express',
      'Kapita Executive': 'kapita_executive',
    };
    // Best effort: coordinates let the driver and the live map find the addresses. A failed lookup never blocks booking.
    const [from, to] = await Promise.all([geocode(pickup), geocode(dest)]);
    const booking = await authorizedRequest(ENDPOINTS.rides.book, {
      method: 'POST',
      headers: { 'Idempotency-Key': rideRequestKey },
      body: {
        ride_type: rideTypes[selectedRideType],
        pickup,
        destination: dest,
        pickup_lat: from?.lat ?? null,
        pickup_lng: from?.lng ?? null,
        destination_lat: to?.lat ?? null,
        destination_lng: to?.lng ?? null,
      },
    });
    storeBooking(booking);
    rideRequestKey = null;
    window.location.href = 'ride-active.html';
  } catch (err) {
    // A 409 means the key was already spent on a different trip: the next attempt needs a fresh one.
    if (err instanceof ApiError && err.status === 409) rideRequestKey = null;
    lastFailedAction = () => confirmRideBooking();
    showErrorNotice(err.message || 'Ride request failed. Check your connection and try again.');
    announceAccessibilityMessage('Ride request could not be submitted.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* 6. Parcel Dispatch Logic */
function selectPackageCategory(element, packageType, price) {
  document.querySelectorAll('.package-size-card').forEach(card => {
    card.classList.remove('selected');
    card.setAttribute('aria-checked', 'false');
  });

  if (element) {
    element.classList.add('selected');
    element.setAttribute('aria-checked', 'true');
  }

  selectedPackageType = packageType;
  selectedPackagePrice = price;
  updateDispatchButtonPrice();
}

function setDeliverySpeed(tier) {
  deliverySpeedTier = tier;

  const tierStandard = document.getElementById('tierStandard');
  const tierExpress = document.getElementById('tierExpress');

  if (tierStandard && tierExpress) {
    tierStandard.checked = (tier === 'standard');
    tierExpress.checked = (tier === 'express');

    tierStandard.closest('.tier-option').classList.toggle('active', tier === 'standard');
    tierExpress.closest('.tier-option').classList.toggle('active', tier === 'express');
  }

  updateDispatchButtonPrice();
}

function updateDispatchButtonPrice() {
  let finalPrice = selectedPackagePrice + (deliverySpeedTier === 'express' ? 1000 : 0);
  const btn = document.getElementById('requestDispatchBtn');
  if (btn) {
    btn.innerHTML = `Dispatch Courier • ₦${finalPrice.toLocaleString()}`;
  }
}

function prefillExpressDelivery() {
  switchMainService('logistics');
  setDeliverySpeed('express');

  const dropoffInput = document.getElementById('dropoffAddressInput');
  if (dropoffInput) {
    dropoffInput.value = "Victoria Island Tech Hub, Lagos";
    dropoffInput.focus();
  }

  announceAccessibilityMessage("Route priority set to Express Dispatch.");
}

async function confirmParcelDispatch() {
  hideErrorNotice();
  const input = document.getElementById('dropoffAddressInput');
  const dropoff = input ? input.value.trim() : '';

  if (!dropoff) {
    alert('Please enter a receiver destination and phone number.');
    if (input) input.focus();
    return;
  }

  const btn = document.getElementById('requestDispatchBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-small" aria-hidden="true"></span> Assigning rider...`;
  }

  let finalPrice = selectedPackagePrice + (deliverySpeedTier === 'express' ? 1000 : 0);

  try {
    // NOTE: /logistics/dispatch does not exist on the backend yet, so this always falls through to the demo radar.
    await authorizedRequest('/logistics/dispatch', {
      method: 'POST',
      body: { packageType: selectedPackageType, dropoff: dropoff, amount: finalPrice },
    });
    switchMainService('tracking');
  } catch (err) {
    console.warn("[Logistics] Falling back to radar view:", err);
    setTimeout(() => {
      switchMainService('tracking');
    }, 1000);
  } finally {
    if (btn) {
      btn.disabled = false;
      updateDispatchButtonPrice();
    }
  }
}

/* 7. Fare Splitter Modal Logic */
function toggleFareSplitModal() {
  const modal = document.getElementById('fareSplitModal');
  if (modal) {
    modal.classList.add('active');
    updateFareSplitCalculation();
    const searchInput = document.getElementById('splitSearchInput');
    if (searchInput) searchInput.focus();
  }
}

function closeFareSplitModal(e) {
  if (!e || e.target.classList.contains('wallet-modal-overlay') || e.target.closest('.modal-close-btn')) {
    const modal = document.getElementById('fareSplitModal');
    if (modal) modal.classList.remove('active');
  }
}

function setupCoRiderButtons() {
  const addButtons = document.querySelectorAll('.add-user-split-btn');
  addButtons.forEach(btn => {
    btn.addEventListener('click', function () {
      toggleAddCoRider(this);
    });
  });
}

function toggleAddCoRider(btnElement) {
  if (btnElement.innerText === 'Add') {
    btnElement.innerText = 'Added';
    btnElement.style.background = '#008a57';
    btnElement.style.color = '#ffffff';
    splitCoRidersCount += 1;
  } else {
    btnElement.innerText = 'Add';
    btnElement.style.background = '#0f172a';
    btnElement.style.color = '#ffffff';
    splitCoRidersCount = Math.max(1, splitCoRidersCount - 1);
  }

  updateFareSplitCalculation();
}

function updateFareSplitCalculation() {
  const summaryBox = document.querySelector('.fare-calculation-summary');
  if (!summaryBox) return;

  const totalFare = selectedRidePrice;
  const userShare = totalFare / splitCoRidersCount;
  const percentage = Math.round((1 / splitCoRidersCount) * 100);

  summaryBox.innerHTML = `
    <div class="summary-row">
      <span>Total Trip Fare (${selectedRideType}):</span>
      <strong>₦${totalFare.toLocaleString()}.00</strong>
    </div>
    <div class="summary-row highlight">
      <span>Your Share (${percentage}% among ${splitCoRidersCount} rider${splitCoRidersCount > 1 ? 's' : ''}):</span>
      <strong style="color: #008a57;">₦${Math.round(userShare).toLocaleString()}.00</strong>
    </div>
  `;
}

function showErrorNotice(text) {
  const notice = document.getElementById('globalErrorNotice');
  const noticeText = document.getElementById('globalErrorText');
  if (notice && noticeText) {
    noticeText.textContent = text;
    notice.style.display = 'flex';
  }
}

function hideErrorNotice() {
  const notice = document.getElementById('globalErrorNotice');
  if (notice) notice.style.display = 'none';
}

function retryLastRideAction() {
  hideErrorNotice();
  if (lastFailedAction) lastFailedAction();
}

/* ==========================================
   8. REAL LEAFLET MAP LIVE TRACKING INTEGRATION
   ========================================== */
function initLiveTrackingMap() {
  const L = window.L; // Leaflet is loaded by a <script> tag in ride.html
  const mapContainer = document.getElementById('liveTrackingMap');
  if (!mapContainer) return;

  // Prevent re-initialization if already loaded
  if (trackingMap) {
    trackingMap.invalidateSize();
    return;
  }

  // Coordinates: Victoria Island / Lekki Lagos baseline
  const userPickup = [6.4281, 3.4219];
  const driverInitial = [6.4350, 3.4310];
  const dropoffDest = [6.4530, 3.4450];

  // Initialize Leaflet Map
  // Shared helper: one place to configure the tile provider (see src/ui/map.js).
  trackingMap = createMap('liveTrackingMap', { center: userPickup, zoom: 14 });

  // Pickup Pin (User Location)
  const pickupIcon = L.divIcon({
    className: 'custom-map-pin',
    html: '<div style="background:#008a57; color:#fff; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:14px; box-shadow:0 2px 6px rgba(0,0,0,0.3);">📍</div>',
    iconSize: [28, 28]
  });
  L.marker(userPickup, { icon: pickupIcon }).addTo(trackingMap).bindPopup('<b>Your Pickup Location</b><br>Victoria Island, Lagos');

  // Dropoff Pin (Destination)
  const dropoffIcon = L.divIcon({
    className: 'custom-map-pin',
    html: '<div style="background:#ef4444; color:#fff; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:14px; box-shadow:0 2px 6px rgba(0,0,0,0.3);">🏁</div>',
    iconSize: [28, 28]
  });
  L.marker(dropoffDest, { icon: dropoffIcon }).addTo(trackingMap).bindPopup('<b>Destination</b><br>Lekki Phase 1 Gate');

  // Driver Live Marker with Pulse Animation
  const driverIcon = L.divIcon({
    className: 'leaflet-driver-icon',
    html: '<div class="driver-marker-pulse"><span class="material-symbols-outlined" style="font-size:20px;">local_shipping</span></div>',
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });
  driverMarker = L.marker(driverInitial, { icon: driverIcon }).addTo(trackingMap).bindPopup('<b>Musa Ibrahim</b><br>On the way (Honda Rider)');

  // Route Polyline Connecting them
  const routeCoords = [driverInitial, userPickup, dropoffDest];
  routePolyline = L.polyline(routeCoords, {
    color: '#00d084',
    weight: 5,
    opacity: 0.8,
    dashArray: '8, 8'
  }).addTo(trackingMap);

  // Fit bounds to show entire route
  trackingMap.fitBounds(routePolyline.getBounds(), { padding: [30, 30] });

  // Simulate smooth driver movement towards pickup
  let step = 0;
  setInterval(() => {
    step += 0.04;
    if (step > 1) step = 0;
    const lat = driverInitial[0] + (userPickup[0] - driverInitial[0]) * step;
    const lng = driverInitial[1] + (userPickup[1] - driverInitial[1]) * step;
    if (driverMarker) {
      driverMarker.setLatLng([lat, lng]);
    }
  }, 3000);
}

function changeTrackingWaypoint(waypointId) {
  const driverBox = document.querySelector('.tracking-code');
  if (waypointId === 'waypoint2') {
    if (driverBox) driverBox.innerText = 'Ride #KPT-RIDE-44012';
    const etaDisplay = document.getElementById('mapEtaDisplay');
    if (etaDisplay) etaDisplay.innerText = 'ETA: 4 mins (1.8 km away)';
  } else {
    if (driverBox) driverBox.innerText = 'Waybill #KPT-LOG-99201';
    const etaDisplay = document.getElementById('mapEtaDisplay');
    if (etaDisplay) etaDisplay.innerText = 'ETA: 6 mins (2.4 km away)';
  }
}
/* The pages call these from inline onclick="..." attributes, so they must be on window now that this is a module. */
Object.assign(window, {
  switchMainService, toggleHeaderNavMenu, swapLocations, selectRideType, confirmRideBooking,
  selectPackageCategory, setDeliverySpeed, prefillExpressDelivery, confirmParcelDispatch,
  toggleFareSplitModal, closeFareSplitModal, retryLastRideAction, changeTrackingWaypoint,
  cancelActiveRideRequest,
});
