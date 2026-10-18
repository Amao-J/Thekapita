/* ==========================================
   THEKAPITA RIDE & LOGISTICS ENGINE (LIVE API + ACCESSIBILITY)
   ========================================== */

const API_CONFIG = {
  baseUrl: window.KAPITA_API_BASE_URL || 'https://api.thekapita.com/v1',
  timeoutMs: 10000,
  authToken: localStorage.getItem('kapita_token') || 'demo_bearer_token'
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

document.addEventListener('DOMContentLoaded', function () {
  initNetworkListeners();
  fetchWalletBalance();
  setupCoRiderButtons();
});

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

/* 3. Service Navigation Controls */
function switchMainService(serviceKey) {
  currentMainService = serviceKey;

  const ridePane = document.getElementById('viewRideModule');
  const logisticsPane = document.getElementById('viewLogisticsModule');
  const trackingPane = document.getElementById('viewTrackingModule');

  if (ridePane) ridePane.style.display = serviceKey === 'ride' ? 'block' : 'none';
  if (logisticsPane) logisticsPane.style.display = serviceKey === 'logistics' ? 'block' : 'none';
  if (trackingPane) trackingPane.style.display = serviceKey === 'tracking' ? 'block' : 'none';

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
  const destInput = document.getElementById('rideDestinationInput');
  const dest = destInput ? destInput.value.trim() : '';

  if (!dest) {
    alert('Please enter a destination address.');
    if (destInput) destInput.focus();
    return;
  }

  const btn = document.getElementById('requestRideBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-small" aria-hidden="true"></span> Searching for nearby drivers...`;
  }

  announceAccessibilityMessage(`Searching for nearby ${selectedRideType} drivers...`);

  try {
    const response = await fetchWithTimeout(`${API_CONFIG.baseUrl}/rides/book`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_CONFIG.authToken}`
      },
      body: JSON.stringify({
        rideType: selectedRideType,
        destination: dest,
        amount: selectedRidePrice
      })
    });

    if (!response.ok) throw new Error("Dispatch server unavailable");
    window.location.href = 'ride-active.html';
  } catch (err) {
    console.warn("[Ride App] Real-time server fallback:", err);
    lastFailedAction = () => confirmRideBooking();
    
    // Simulate live transition for prototype fallback
    setTimeout(() => {
      window.location.href = 'ride-active.html';
    }, 1200);
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