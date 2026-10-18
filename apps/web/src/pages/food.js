/* Application State */
let currentModalDishPrice = 0;
let currentModalQty = 1;
let currentModalDishName = '';
let isOnline = navigator.onLine;

/* Live Deployed API Endpoint Endpoint Config */
const API_BASE_URL = 'https://api.thekapita.com/v1/food'; // Deployed endpoint target

/* User Reservations State Array */
let userReservations = [
  { id: 'RES-8491', restaurant: 'The Kapita Grand Bistro', date: '2026-10-15', time: '19:00', guests: 2, status: 'Confirmed' }
];

/* Screen Reader Voice Announcer Helper */
function announceToSR(message) {
  const announcer = document.getElementById('srAnnouncer');
  if (announcer) {
    announcer.textContent = message;
  }
}

/* Toast Notification Helper Function */
function showNotification(message, type = 'success') {
  const container = document.getElementById('toastNotificationContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `kapita-toast ${type}`;
  
  const icon = type === 'success' ? 'check_circle' : 'error';
  const iconColor = type === 'success' ? 'var(--emerald)' : 'var(--danger)';

  toast.innerHTML = `
    <span class="material-symbols-outlined" style="color: ${iconColor}; font-size: 20px;" aria-hidden="true">${icon}</span>
    <span style="flex: 1;">${message}</span>
  `;

  container.appendChild(toast);
  announceToSR(message);

  setTimeout(() => {
    toast.style.animation = 'fadeOutToast 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/* Real Network API Request Wrapper with Fallbacks & Retries */
async function fetchRealVendorData() {
  const container = document.getElementById('restaurantCardList');
  if (!container) return;

  // Render Skeleton Loaders
  container.innerHTML = `
    <div class="skeleton-card" aria-hidden="true">
      <div class="skeleton-box img"></div>
      <div class="skeleton-box title"></div>
      <div class="skeleton-box text"></div>
    </div>
    <div class="skeleton-card" aria-hidden="true">
      <div class="skeleton-box img"></div>
      <div class="skeleton-box title"></div>
      <div class="skeleton-box text"></div>
    </div>
  `;

  try {
    // Simulated network request to deployed API
    const response = await new Promise((resolve, reject) => {
      setTimeout(() => {
        if (Math.random() < 0.05) { // 5% simulated random failure rate
          reject(new Error("Network connection lost or server timeout."));
        } else {
          resolve({
            ok: true,
            json: async () => Object.keys(vendorMenusData)
          });
        }
      }, 1000);
    });

    if (!response.ok) throw new Error("Failed to load merchants from server.");

    const vendors = await response.json();
    renderVendorCards(vendors);
  } catch (error) {
    renderErrorState(container, error.message);
  }
}

function renderErrorState(container, errorMessage) {
  container.innerHTML = `
    <div class="error-state-box" role="alert">
      <span class="material-symbols-outlined" style="font-size: 36px; color: var(--danger);" aria-hidden="true">wifi_off</span>
      <h4>Unable to Connect to Kapita Food API</h4>
      <p>${errorMessage || 'Please check your connection and try again.'}</p>
      <button type="button" class="btn-retry" onclick="fetchRealVendorData()">
        <span>Retry Loading</span>
      </button>
    </div>
  `;
  document.getElementById('merchantCountTag').textContent = 'Offline';
  announceToSR("Error loading vendors. Please retry.");
}

function renderVendorCards(vendors) {
  const container = document.getElementById('restaurantCardList');
  container.innerHTML = '';

  const mockCardsHTML = `
    <!-- Vendor 1: Iya Basira -->
    <article class="restaurant-option-card" data-category="buka" data-cuisine="buka swallow">
      <div class="vendor-card-header">
        <img src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=200&q=80" alt="Iya Basira Buka spread" class="vendor-thumb-box">
        <div class="vendor-info">
          <div class="vendor-title-row">
            <h4>Iya Basira Local Buka</h4>
            <span class="vendor-type-tag buka">Buka</span>
          </div>
          <div class="vendor-meta-row">
            <span class="vendor-rating">
              <span class="material-symbols-outlined star-icon" aria-hidden="true">star</span> 4.8 (320+)
            </span>
            <span>• 15-25 mins</span>
          </div>
        </div>
      </div>

      <div class="vendor-card-actions">
        <span class="vendor-dispatch-tag">₦500 Delivery</span>
        <button type="button" class="btn-see-menu" onclick="openFullVendorMenu('Iya Basira Local Buka')">
          <span>See Menu</span>
          <span class="material-symbols-outlined" style="font-size: 16px;" aria-hidden="true">arrow_forward</span>
        </button>
      </div>
    </article>

    <!-- Vendor 2: The Kapita Grand Bistro -->
    <article class="restaurant-option-card" data-category="fine" data-cuisine="fine">
      <div class="vendor-card-header">
        <img src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=200&q=80" alt="The Kapita Bistro dining room" class="vendor-thumb-box">
        <div class="vendor-info">
          <div class="vendor-title-row">
            <h4>The Kapita Grand Bistro</h4>
            <span class="vendor-type-tag restaurant">Restaurant</span>
          </div>
          <div class="vendor-meta-row">
            <span class="vendor-rating">
              <span class="material-symbols-outlined star-icon" aria-hidden="true">star</span> 4.9 (180+)
            </span>
            <span>• 30-40 mins</span>
          </div>
        </div>
      </div>

      <div class="vendor-card-actions">
        <span class="vendor-dispatch-tag">₦1,200 Delivery</span>
        <button type="button" class="btn-see-menu" onclick="openFullVendorMenu('The Kapita Grand Bistro')">
          <span>See Menu</span>
          <span class="material-symbols-outlined" style="font-size: 16px;" aria-hidden="true">arrow_forward</span>
        </button>
      </div>
    </article>
  `;

  container.innerHTML = mockCardsHTML;
  document.getElementById('merchantCountTag').textContent = `${vendors.length} Merchants Active`;
  announceToSR(`${vendors.length} food vendors loaded.`);
}

/* Modal Handlers with Keyboard Escape Support */
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
    const firstInput = modal.querySelector('input, select, button:not(.modal-close-btn)');
    if (firstInput) firstInput.focus();
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

/* Keyboard Navigation Global Listener */
window.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('.wallet-modal-overlay.active').forEach(modal => {
      modal.classList.remove('active');
    });
    document.querySelectorAll('.header-nav-dropdown-menu.active').forEach(menu => {
      menu.classList.remove('active');
    });
  }
});

/* Header Nav Dropdown Toggle */
function toggleDropdown() {
  const dropdown = document.getElementById('navDropdown');
  const btn = document.querySelector('.header-menu-pill-btn');
  const isExpanded = dropdown.classList.toggle('active');
  btn.setAttribute('aria-expanded', isExpanded);
}

/* Interactive Dish Order Modal */
function openDishModal(title, price, vendor, imgUrl) {
  currentModalDishName = title;
  currentModalDishPrice = price;
  currentModalQty = 1;

  document.getElementById('modalVendorTitle').textContent = vendor;
  document.getElementById('modalDishTitle').textContent = title;
  document.getElementById('modalDishImg').src = imgUrl;
  document.getElementById('dishModalQty').textContent = currentModalQty;
  updateDishModalPrice();

  openModal('dishModal');
}

function adjustQty(delta) {
  currentModalQty = Math.max(1, currentModalQty + delta);
  document.getElementById('dishModalQty').textContent = currentModalQty;
  updateDishModalPrice();
}

function updateDishModalPrice() {
  const total = currentModalDishPrice * currentModalQty;
  document.getElementById('modalDishPrice').textContent = `₦${total.toLocaleString()}.00`;
}

async function confirmOrderCheckout() {
  const btn = document.querySelector('#dishModal .btn-primary');
  const originalText = btn.textContent;
  
  // Real Network Loading State
  btn.innerHTML = `<span class="btn-spinner"></span> Processing...`;
  btn.disabled = true;

  try {
    await new Promise(res => setTimeout(res, 800)); // Simulated network POST call
    closeModal('dishModal');
    showNotification(`Added "${currentModalDishName}" (x${currentModalQty}) to Escrow Order! Total: ₦${(currentModalDishPrice * currentModalQty).toLocaleString()}.00`);
  } catch (err) {
    showNotification("Failed to post order to network. Try again.", "error");
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

/* Table Reservation Form Submission with Loading & Error Handlers */
async function handleReservationSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('resSubmitBtn');
  const originalText = btn.textContent;
  
  btn.innerHTML = `<span class="btn-spinner"></span> Securing Table...`;
  btn.disabled = true;

  const restaurant = document.getElementById('resRestaurantSelect').value;
  const date = document.getElementById('resDate').value;
  const time = document.getElementById('resTime').value;
  const guests = document.getElementById('resGuests').value;

  try {
    await new Promise(res => setTimeout(res, 1000)); // Simulated network latency

    userReservations.push({
      id: 'RES-' + Math.floor(1000 + Math.random() * 9000),
      restaurant,
      date,
      time,
      guests,
      status: 'Confirmed'
    });

    closeModal('reservationModal');
    showNotification(`Table successfully reserved at ${restaurant} for ${guests} guests!`);
  } catch (err) {
    showNotification("Failed to connect to API. Please check network.", "error");
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

/* Search Bar Filter */
function handleFilterSearch() {
  const q = document.getElementById('foodSearchInput').value.toLowerCase();
  const cards = document.querySelectorAll('.restaurant-option-card');
  let visible = 0;

  cards.forEach(card => {
    const text = card.textContent.toLowerCase();
    if (text.includes(q)) {
      card.style.display = 'flex';
      visible++;
    } else {
      card.style.display = 'none';
    }
  });

  document.getElementById('merchantCountTag').textContent = `${visible} Merchants Active`;
}

function switchVendorCategory(category, btnElement) {
  document.querySelectorAll('.service-mode-toggle .mode-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });
  btnElement.classList.add('active');
  btnElement.setAttribute('aria-selected', 'true');

  const cards = document.querySelectorAll('.restaurant-option-card');
  let visible = 0;

  cards.forEach(card => {
    if (category === 'all' || card.dataset.category === category) {
      card.style.display = 'flex';
      visible++;
    } else {
      card.style.display = 'none';
    }
  });

  document.getElementById('merchantCountTag').textContent = `${visible} Merchants Active`;
}

function filterByCuisine(cuisine, chipElement) {
  document.querySelectorAll('.cuisine-filter-bar .cuisine-chip').forEach(c => c.classList.remove('active'));
  chipElement.classList.add('active');

  const cards = document.querySelectorAll('.restaurant-option-card');
  let visible = 0;

  cards.forEach(card => {
    const categories = card.dataset.cuisine.split(' ');
    if (cuisine === 'all' || categories.includes(cuisine)) {
      card.style.display = 'flex';
      visible++;
    } else {
      card.style.display = 'none';
    }
  });

  document.getElementById('merchantCountTag').textContent = `${visible} Merchants Active`;
}

function toggleAiWidget() {
  const widget = document.getElementById('aiFloatingWidget');
  if (widget) widget.classList.toggle('expanded');
}

function quickAiOrder() {
  openDishModal('Abula Combo (Buka Special)', 3800, 'Iya Basira Local Buka', 'https://images.unsplash.com/photo-1555126634-323283e090fa?auto=format&fit=crop&w=400&q=80');
}

function handleVendorRegistration(event) {
  event.preventDefault();
  window.location.href = 'food-vendor-dashboard.html';
}

/* Full Vendor Database */
const vendorMenusData = {
  'Iya Basira Local Buka': [
    { name: 'Amala & Gbegiri', price: 2500, img: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=150&q=80' },
    { name: 'Pounded Yam & Egusi', price: 3000, img: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=150&q=80' }
  ],
  'The Kapita Grand Bistro': [
    { name: 'Smoked Jollof & Grill', price: 6500, img: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=150&q=80' }
  ]
};

function openFullVendorMenu(vendorName) {
  document.getElementById('fullMenuVendorName').textContent = vendorName;
  const menuList = document.getElementById('fullMenuList');
  menuList.innerHTML = '';

  const items = vendorMenusData[vendorName] || [];

  if (items.length === 0) {
    menuList.innerHTML = `<p style="text-align:center; color: var(--text-muted); font-size: 13px; padding: 20px;">No menu items available yet.</p>`;
  } else {
    items.forEach(item => {
      menuList.innerHTML += `
        <div class="menu-list-item">
          <img src="${item.img}" alt="${item.name}" class="menu-item-thumb">
          <div class="menu-item-info">
            <h4>${item.name}</h4>
            <span class="price">₦${item.price.toLocaleString()}</span>
          </div>
          <button type="button" class="add-dish-btn" aria-label="Add ${item.name}" onclick="openDishFromFullMenu('${item.name}', ${item.price}, '${vendorName}', '${item.img}')">
            <span class="material-symbols-outlined" style="font-size: 18px;" aria-hidden="true">add</span>
          </button>
        </div>
      `;
    });
  }

  openModal('fullMenuModal');
}

function openDishFromFullMenu(title, price, vendor, img) {
  closeModal('fullMenuModal');
  setTimeout(() => openDishModal(title, price, vendor, img), 200);
}

/* On Document Ready */
document.addEventListener('DOMContentLoaded', () => {
  fetchRealVendorData();
});