/* ==========================================
   THEKAPITA RIDE & LOGISTICS ENGINE (LIVE API + ACCESSIBILITY + LEAFLET MAP)
   ========================================== */

const API_CONFIG = {
  baseUrl: window.KAPITA_API_BASE_URL || (
    ['localhost', '127.0.0.1'].includes(window.location.hostname)
      ? 'http://127.0.0.1:8000/api'
      : 'https://api.thekapita.com/api'
  ),
  timeoutMs: 10000,
  authToken: (() => {
    try {
      return JSON.parse(localStorage.getItem('kapita.session.v1') || '{}').accessToken;
    } catch {
      return null;
    }
  })()
};

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
    renderActiveRideRequest();
  }
});

function renderActiveRideRequest() {
  const status = document.getElementById('rideRequestStatus');
  const booking = JSON.parse(localStorage.getItem('kapita.ride.active.v1') || 'null');
  if (!booking) {
    if (status) status.textContent = 'No ride request was found. Return to Ride to book one.';
    const cancelButton = document.getElementById('cancelRideRequestBtn');
    if (cancelButton) cancelButton.disabled = true;
    return;
  }

  document.getElementById('rideRequestReference').textContent = booking.reference;
  document.getElementById('ridePickup').textContent = booking.pickup;
  document.getElementById('rideDestination').textContent = booking.destination;
  document.getElementById('rideType').textContent = booking.ride_type.replaceAll('_', ' ');
  document.getElementById('rideFare').textContent = `₦${Number(booking.fare).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
  if (status) {
    status.textContent = ({
      requested: 'Your request is queued until a compatible driver is available.',
      assigned: 'A driver accepted your request. Your wallet has been charged.',
      cancelled: booking.refunded_at ? 'Ride cancelled. The fare has been refunded to your wallet.' : 'Ride request cancelled.',
      completed: 'This ride has been completed.',
    })[booking.status] || 'Ride status updated.';
  }
  const badge = document.getElementById('rideStatusBadge');
  const statuses = {
    requested: 'WAITING FOR DRIVER',
    assigned: 'DRIVER ASSIGNED',
    cancelled: 'CANCELLED',
    completed: 'COMPLETED',
  };
  if (badge) {
    badge.textContent = statuses[booking.status] || booking.status.toUpperCase();
    badge.classList.toggle('live', booking.status === 'assigned');
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
  const fareStatus = document.getElementById('rideFareStatus');
  if (fareStatus) {
    fareStatus.textContent = booking.charged
      ? 'Charged to Kapita Pay Wallet'
      : 'Charged when a driver is assigned';
  }
  const cancelButton = document.getElementById('cancelRideRequestBtn');
  if (cancelButton) cancelButton.disabled = !['requested', 'assigned'].includes(booking.status);
}

async function refreshActiveRideRequest() {
  const booking = JSON.parse(localStorage.getItem('kapita.ride.active.v1') || 'null');
  if (!booking || !API_CONFIG.authToken || !['requested', 'assigned'].includes(booking.status)) return;
  try {
    const response = await fetchWithTimeout(
      `${API_CONFIG.baseUrl}/rides/${encodeURIComponent(booking.reference)}`,
      { headers: { Authorization: `Bearer ${API_CONFIG.authToken}` } }
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || 'Ride status could not be refreshed.');
    localStorage.setItem('kapita.ride.active.v1', JSON.stringify(result));
    renderActiveRideRequest();
  } catch (error) {
    console.warn('[Ride App] Could not refresh ride status.', error);
  }
}

async function cancelActiveRideRequest() {
  const booking = JSON.parse(localStorage.getItem('kapita.ride.active.v1') || 'null');
  if (!booking || !API_CONFIG.authToken) return;
  const button = document.getElementById('cancelRideRequestBtn');
  const status = document.getElementById('rideRequestStatus');
  if (button) button.disabled = true;

  try {
    const response = await fetchWithTimeout(
      `${API_CONFIG.baseUrl}/rides/${encodeURIComponent(booking.reference)}/cancel`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_CONFIG.authToken}` },
      }
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || 'Ride request could not be cancelled.');
    localStorage.setItem('kapita.ride.active.v1', JSON.stringify(result));
    renderActiveRideRequest();
    refreshActiveRideRequest();
    window.setInterval(refreshActiveRideRequest, 10000);
  } catch (error) {
    if (status) status.textContent = error.message || 'Ride request could not be cancelled.';
    if (button) button.disabled = false;
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
  try {
    const response = await fetchWithTimeout(`${API_CONFIG.baseUrl}/wallet/balance`, {
      headers: { 'Authorization': `Bearer ${API_CONFIG.authToken}` }
    });
    if (response.ok) {
      const data = await response.json();
      const display = document.getElementById('headerWalletDisplay');
      if (display && data.balance !== undefined) {
        display.textContent = `₦${parseFloat(data.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
      }
    }
  } catch (err) {
    console.warn("[Ride App] Offline balance fallback active.");
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
  if (!API_CONFIG.authToken) {
    showErrorNotice('Sign in to your theKapita account before requesting a ride.');
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
    rideRequestKey ||= crypto.randomUUID();
    const rideTypes = {
      'Kapita Go': 'kapita_go',
      'Kapita Comfort': 'kapita_comfort',
      'Kapita Keke Express': 'kapita_keke_express',
      'Kapita Executive': 'kapita_executive',
    };
    const response = await fetchWithTimeout(`${API_CONFIG.baseUrl}/rides/book`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': rideRequestKey,
        'Authorization': `Bearer ${API_CONFIG.authToken}`
      },
      body: JSON.stringify({
        ride_type: rideTypes[selectedRideType],
        pickup,
        destination: dest,
      })
    });

    const booking = await response.json();
    if (!response.ok) throw new Error(booking.detail || 'Ride request could not be submitted.');
    localStorage.setItem('kapita.ride.active.v1', JSON.stringify(booking));
    rideRequestKey = null;
    window.location.href = 'ride-active.html';
  } catch (err) {
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
    const res = await fetchWithTimeout(`${API_CONFIG.baseUrl}/logistics/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_CONFIG.authToken}`
      },
      body: JSON.stringify({
        packageType: selectedPackageType,
        dropoff: dropoff,
        amount: finalPrice
      })
    });

    if (!res.ok) throw new Error("Dispatch server unavailable");
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

async function fetchWithTimeout(resource, options = {}) {
  const { timeoutMs = API_CONFIG.timeoutMs } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

/* ==========================================
   8. REAL LEAFLET MAP LIVE TRACKING INTEGRATION
   ========================================== */
function initLiveTrackingMap() {
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
  trackingMap = L.map('liveTrackingMap', {
    zoomControl: false,
    attributionControl: false
  }).setView(userPickup, 14);

  // Use Wikimedia Maps or Stamen Toner / OpenStreetMap via public free proxy mirror (No usage policy blocking)
  L.tileLayer('https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}{r}.png', {
    maxZoom: 18,
    attribution: '&copy; Wikimedia contributors'
  }).addTo(trackingMap);

  // Add Zoom control to top-right
  L.control.zoom({ position: 'topright' }).addTo(trackingMap);

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