import { authorizedRequest, getCurrentUser, hydrateProfile, isAuthenticated } from '../state/session.js';
import { ApiError, newIdempotencyKey, request } from '../api/client.js';
import { ENDPOINTS } from '@thekapita/shared/endpoints';

/* Application State */
let currentDish = null; // { id, slug, name, price, vendor, img } for the dish modal
let currentModalQty = 1;
let orderKey = null;    // Idempotency-Key for the order being placed (reused only for network retries)
let restaurants = [];   // from GET /food/restaurants
let isOnline = navigator.onLine;

function requireLogin() {
  if (isAuthenticated()) return true;
  window.location.href = 'auth.html?next=food.html';
  return false;
}

const naira = (n) => `\u20A6${Number(n || 0).toLocaleString('en-NG')}`;

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

  const iconEl = document.createElement('span');
  iconEl.className = 'material-symbols-outlined';
  iconEl.style.cssText = `color: ${iconColor}; font-size: 20px;`;
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.textContent = icon;
  const textEl = document.createElement('span');
  textEl.style.flex = '1';
  textEl.textContent = message; // message can contain server text: never as HTML
  toast.append(iconEl, textEl);

  container.appendChild(toast);
  announceToSR(message);

  setTimeout(() => {
    toast.style.animation = 'fadeOutToast 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/* Live restaurant list from the API */
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
    restaurants = await request(ENDPOINTS.food.restaurants);
    renderVendorCards(restaurants);
    populateReservationSelect();
  } catch (error) {
    renderErrorState(container, error.message);
  }
}

function renderErrorState(container, errorMessage) {
  container.innerHTML = `
    <div class="error-state-box" role="alert">
      <span class="material-symbols-outlined" style="font-size: 36px; color: var(--danger);" aria-hidden="true">wifi_off</span>
      <h4>Unable to Connect to Kapita Food API</h4>
      <p></p>
      <button type="button" class="btn-retry" onclick="fetchRealVendorData()">
        <span>Retry Loading</span>
      </button>
    </div>
  `;
  container.querySelector('p').textContent = errorMessage || 'Please check your connection and try again.';
  document.getElementById('merchantCountTag').textContent = 'Offline';
  announceToSR("Error loading vendors. Please retry.");
}

const CATEGORY_IMG = {
  buka: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=200&q=80',
  fine: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=200&q=80',
  grill: 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&w=200&q=80',
  bakery: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=200&q=80',
};

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  node.append(...children.flat().filter((c) => c !== null && c !== undefined));
  return node;
}

function renderVendorCards(vendors) {
  const container = document.getElementById('restaurantCardList');
  container.replaceChildren();

  if (!vendors.length) {
    container.append(el('p', { style: 'text-align:center;color:var(--text-muted);padding:24px;font-size:13px;' }, 'No restaurants are open yet. Check back soon!'));
  }

  for (const v of vendors) {
    const card = el('article', {
      class: 'restaurant-option-card',
      dataset: { category: v.category, cuisine: [v.category, ...(v.tags || [])].join(' '), slug: v.slug },
    },
      el('div', { class: 'vendor-card-header' },
        el('img', { src: v.image_url || CATEGORY_IMG[v.category] || CATEGORY_IMG.buka, alt: `${v.name}`, class: 'vendor-thumb-box' }),
        el('div', { class: 'vendor-info' },
          el('div', { class: 'vendor-title-row' },
            el('h4', {}, v.name),
            el('span', { class: `vendor-type-tag ${v.category}` }, v.category_label.split(' ')[0]),
          ),
          el('div', { class: 'vendor-meta-row' },
            el('span', { class: 'vendor-rating' }, v.rating ? `\u2605 ${v.rating}` : 'New'),
            el('span', {}, `\u2022 ${v.eta_min}-${v.eta_max} mins`),
            v.is_open ? null : el('span', { style: 'color:var(--danger);font-weight:700;' }, '\u2022 Closed'),
          ),
        ),
      ),
      el('div', { class: 'vendor-card-actions' },
        el('span', { class: 'vendor-dispatch-tag' }, `${naira(v.delivery_fee)} Delivery`),
        el('button', { type: 'button', class: 'btn-see-menu', onclick: () => openFullVendorMenu(v.slug) },
          el('span', {}, 'See Menu'),
          el('span', { class: 'material-symbols-outlined', style: 'font-size: 16px;', 'aria-hidden': 'true' }, 'arrow_forward'),
        ),
      ),
    );
    container.append(card);
  }

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
    if (modalId === 'historyModal') loadOrderHistory();
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

function openExternalDetails(name, address, desc, imgUrl) {
  document.getElementById('extSpotTitle').textContent = name;
  document.getElementById('extSpotAddress').textContent = address;
  document.getElementById('extSpotDesc').textContent = desc;
  document.getElementById('extSpotImg').src = imgUrl;
  openModal('externalSpotModal');
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

/**
 * Two ways in: openDishModal({ id, slug, name, price, vendor, img }) from the live menu, and the
 * old openDishModal(title, price, vendorName, img) used by the static "top picks" cards, which we
 * resolve against the live menu by name so every order still goes through the backend.
 */
async function openDishModal(first, price, vendorName, img) {
  if (typeof first === 'object') return showDish(first);
  const restaurant = restaurants.find((r) => r.name === vendorName);
  if (!restaurant) return showNotification('That restaurant is not available right now.', 'error');
  try {
    const detail = await request(ENDPOINTS.food.restaurant(restaurant.slug));
    const item = detail.menu.find((m) => m.name === first);
    if (!item) return showNotification(`${first} isn't on the menu right now.`, 'error');
    showDish({ id: item.id, slug: restaurant.slug, name: item.name, price: item.price, vendor: restaurant.name, img: item.image_url || img });
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

async function showDish(dish) {
  currentDish = dish;
  currentModalQty = 1;
  orderKey = null;

  document.getElementById('modalVendorTitle').textContent = dish.vendor;
  document.getElementById('modalDishTitle').textContent = dish.name;
  document.getElementById('modalDishImg').src = dish.img || CATEGORY_IMG.buka;
  document.getElementById('dishModalQty').textContent = currentModalQty;
  updateDishModalPrice();

  const address = document.getElementById('dishAddress');
  if (address && !address.value) {
    // Prefill from the profile when we can; the customer can still edit it per order.
    const user = getCurrentUser() || (isAuthenticated() ? await hydrateProfile().catch(() => null) : null);
    address.value = user?.preferences?.default_address || user?.address || '';
  }
  openModal('dishModal');
}

function adjustQty(delta) {
  currentModalQty = Math.min(50, Math.max(1, currentModalQty + delta));
  document.getElementById('dishModalQty').textContent = currentModalQty;
  updateDishModalPrice();
}

function updateDishModalPrice() {
  const total = (currentDish?.price || 0) * currentModalQty;
  document.getElementById('modalDishPrice').textContent = `${naira(total)} + delivery`;
}

async function confirmOrderCheckout() {
  if (!currentDish || !requireLogin()) return;
  const btn = document.querySelector('#dishModal .btn-primary');
  const originalText = btn.textContent;
  const address = (document.getElementById('dishAddress')?.value || '').trim();
  if (!address) {
    showNotification('Enter a delivery address so the restaurant can reach you.', 'error');
    document.getElementById('dishAddress')?.focus();
    return;
  }

  btn.innerHTML = `<span class="btn-spinner"></span> Processing...`;
  btn.disabled = true;

  try {
    orderKey ||= newIdempotencyKey();
    const { order } = await authorizedRequest(ENDPOINTS.food.orders, {
      method: 'POST',
      headers: { 'Idempotency-Key': orderKey },
      body: { restaurant: currentDish.slug, items: [{ id: currentDish.id, qty: currentModalQty }], address },
    });
    orderKey = null;
    closeModal('dishModal');
    showNotification(`Order ${order.reference} placed! ${naira(order.total)} is held in escrow until you confirm delivery.`);
    loadActiveOrder();
  } catch (err) {
    // The server remembers a failed attempt under its key, so after a real answer (not a dropped connection) start fresh.
    if (err instanceof ApiError && err.status !== 0 && err.status !== 408) orderKey = null;
    showNotification(err.message || 'Failed to post order to network. Try again.', 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

/* Orders: escrow only pays the restaurant when the customer confirms. */
const STEP_INDEX = { incoming: 0, preparing: 1, dispatch: 2, handed_over: 2, completed: 3 };

async function loadActiveOrder() {
  const card = document.getElementById('activeOrderCard');
  const title = document.getElementById('activeOrderTitle');
  if (!card || !isAuthenticated()) return;
  let orders = [];
  try {
    orders = await authorizedRequest(ENDPOINTS.food.orders);
  } catch {
    return;
  }
  const active = orders.find((o) => ['incoming', 'preparing', 'dispatch', 'handed_over'].includes(o.status));
  card.style.display = title.style.display = active ? '' : 'none';
  if (!active) return;

  card.querySelector('.tracking-code').textContent = `Order ${active.reference}`;
  card.querySelector('.status-badge span:last-child').textContent = active.status_label.toUpperCase();
  card.querySelectorAll('.timeline-step').forEach((step, i) => {
    const at = STEP_INDEX[active.status];
    step.classList.toggle('completed', i < at);
    step.classList.toggle('active', i === at);
  });
  // No rider is dispatched through the app for food yet, so hide the placeholder rider and PIN.
  card.querySelector('.courier-driver-box')?.style.setProperty('display', 'none');
  card.querySelector('.proof-of-delivery-box')?.style.setProperty('display', 'none');

  card.querySelector('#activeOrderActions')?.remove();
  const actions = el('div', { id: 'activeOrderActions', style: 'display:flex;gap:8px;margin-top:12px;' },
    el('span', { style: 'flex:1;font-size:12px;color:var(--text-muted);align-self:center;' }, `${active.restaurant} \u2022 ${naira(active.total)}`),
    active.status === 'incoming'
      ? el('button', { type: 'button', class: 'btn-secondary', onclick: () => orderAction(ENDPOINTS.food.cancelOrder(active.reference), 'Order cancelled and refunded.') }, 'Cancel')
      : null,
    ['dispatch', 'handed_over'].includes(active.status)
      ? el('button', { type: 'button', class: 'btn-primary', onclick: () => orderAction(ENDPOINTS.food.confirmOrder(active.reference), 'Thanks! The restaurant has been paid.') }, 'I received my order')
      : null,
  );
  card.append(actions);
}

async function orderAction(path, successMessage) {
  try {
    await authorizedRequest(path, { method: 'POST' });
    showNotification(successMessage);
  } catch (err) {
    showNotification(err.message, 'error');
  }
  loadActiveOrder();
  if (document.getElementById('historyModal')?.classList.contains('active')) loadOrderHistory();
}

async function loadOrderHistory() {
  const list = document.getElementById('historyList');
  if (!list) return;
  if (!isAuthenticated()) {
    list.replaceChildren(el('p', { style: 'font-size:13px;color:var(--text-muted);' }, 'Sign in to see your orders.'));
    return;
  }
  try {
    const orders = await authorizedRequest(ENDPOINTS.food.orders);
    if (!orders.length) {
      list.replaceChildren(el('p', { style: 'font-size:13px;color:var(--text-muted);' }, 'No orders yet.'));
      return;
    }
    list.replaceChildren(...orders.map((o) => el('div', { class: 'history-card', style: 'background: var(--surface-gray); padding: 12px; border-radius: 12px; border: 1px solid var(--border-color);' },
      el('div', { style: 'display:flex;justify-content:space-between;font-weight:700;font-size:13px;margin-bottom:4px;' },
        el('span', {}, o.restaurant), el('span', { style: 'color: var(--emerald-dark);' }, naira(o.total))),
      el('p', { style: 'font-size:11px;color:var(--text-muted);margin-bottom:8px;' },
        `${o.items.map((i) => `${i.qty}\u00D7 ${i.name}`).join(', ')} \u2022 ${o.status_label} \u2022 ${new Date(o.created_at).toLocaleDateString('en-NG', { dateStyle: 'medium' })}`),
      ['dispatch', 'handed_over'].includes(o.status)
        ? el('button', { type: 'button', class: 'add-dish-btn', style: 'width:100%;border-radius:8px;height:32px;font-size:12px;', onclick: () => orderAction(ENDPOINTS.food.confirmOrder(o.reference), 'Thanks! The restaurant has been paid.') }, 'I received this order')
        : null,
    )));
  } catch (err) {
    list.replaceChildren(el('p', { style: 'font-size:13px;color:var(--danger);' }, err.message));
  }
}

/* Table reservations */
function populateReservationSelect() {
  const select = document.getElementById('resRestaurantSelect');
  if (!select) return;
  select.replaceChildren(...restaurants.map((r) => el('option', { value: r.slug }, `${r.name} (${r.address})`)));
  const date = document.getElementById('resDate');
  if (date) {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    date.min = new Date().toISOString().slice(0, 10);
    date.value = tomorrow;
  }
}

async function handleReservationSubmit(e) {
  e.preventDefault();
  if (!requireLogin()) return;
  const btn = document.getElementById('resSubmitBtn');
  const originalText = btn.textContent;

  btn.innerHTML = `<span class="btn-spinner"></span> Securing Table...`;
  btn.disabled = true;

  const select = document.getElementById('resRestaurantSelect');
  try {
    const res = await authorizedRequest(ENDPOINTS.food.reservations, {
      method: 'POST',
      body: {
        restaurant: select.value,
        date: document.getElementById('resDate').value,
        time: document.getElementById('resTime').value,
        guests: Number(document.getElementById('resGuests').value),
      },
    });
    closeModal('reservationModal');
    showNotification(`Table reserved at ${res.restaurant} for ${res.guests} on ${res.date} at ${res.time}. Ref ${res.reference}`);
  } catch (err) {
    showNotification(err.message || "Failed to connect to API. Please check network.", 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

async function openReservationsListModal() {
  openModal('reservationsListModal');
  const box = document.getElementById('reservationsListContainer');
  if (!isAuthenticated()) {
    box.replaceChildren(el('p', { style: 'font-size:13px;color:var(--text-muted);' }, 'Sign in to see your reservations.'));
    return;
  }
  try {
    const rows = await authorizedRequest(ENDPOINTS.food.reservations);
    if (!rows.length) {
      box.replaceChildren(el('p', { style: 'font-size:13px;color:var(--text-muted);' }, 'No reservations yet.'));
      return;
    }
    box.replaceChildren(...rows.map((r) => el('div', { class: 'history-card', style: 'background: var(--surface-gray); padding: 12px; border-radius: 12px; border: 1px solid var(--border-color);' },
      el('div', { style: 'display:flex;justify-content:space-between;font-weight:700;font-size:13px;' }, el('span', {}, r.restaurant), el('span', {}, r.status_label)),
      el('p', { style: 'font-size:11px;color:var(--text-muted);margin:4px 0 8px;' }, `${r.date} at ${r.time} \u2022 ${r.guests} guest${r.guests === 1 ? '' : 's'} \u2022 ${r.reference}`),
      r.status === 'confirmed'
        ? el('button', { type: 'button', class: 'add-dish-btn', style: 'width:100%;border-radius:8px;height:32px;font-size:12px;', onclick: async () => {
          try { await authorizedRequest(ENDPOINTS.food.cancelReservation(r.reference), { method: 'POST' }); } catch (err) { showNotification(err.message, 'error'); }
          openReservationsListModal();
        } }, 'Cancel reservation')
        : null,
    )));
  } catch (err) {
    box.replaceChildren(el('p', { style: 'font-size:13px;color:var(--danger);' }, err.message));
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
  // "Surprise me": open a random open restaurant's menu.
  const open = restaurants.filter((r) => r.is_open);
  if (!open.length) return showNotification('No restaurants are open right now.', 'error');
  openFullVendorMenu(open[Math.floor(Math.random() * open.length)].slug);
}

async function handleVendorRegistration(event) {
  event.preventDefault();
  if (!requireLogin()) return;
  const btn = document.getElementById('vendorSubmitBtn');
  btn.disabled = true;
  try {
    await authorizedRequest(ENDPOINTS.food.vendor.register, {
      method: 'POST',
      body: {
        name: document.getElementById('vendorStoreName').value.trim(),
        category: document.getElementById('vendorCategorySelect').value,
        address: document.getElementById('vendorAddress').value.trim(),
        phone: document.getElementById('vendorPhone').value.trim(),
      },
    });
    window.location.href = 'food-vendor-dashboard.html';
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      window.location.href = 'food-vendor-dashboard.html'; // already a vendor: just go to the dashboard
      return;
    }
    showNotification(err.message || 'Could not submit your application.', 'error');
    btn.disabled = false;
  }
}

/* Menu (loaded per restaurant from the API) */
async function openFullVendorMenu(slug) {
  const menuList = document.getElementById('fullMenuList');
  menuList.replaceChildren(el('p', { style: 'text-align:center;color:var(--text-muted);font-size:13px;padding:20px;' }, 'Loading menu...'));
  document.getElementById('fullMenuVendorName').textContent = restaurants.find((r) => r.slug === slug)?.name || 'Vendor Menu';
  openModal('fullMenuModal');

  try {
    const r = await request(ENDPOINTS.food.restaurant(slug));
    document.getElementById('fullMenuVendorName').textContent = r.name;
    if (!r.menu.length) {
      menuList.replaceChildren(el('p', { style: 'text-align:center;color:var(--text-muted);font-size:13px;padding:20px;' }, 'No menu items available yet.'));
      return;
    }
    menuList.replaceChildren(...r.menu.map((item) => {
      const img = item.image_url || CATEGORY_IMG[r.category] || CATEGORY_IMG.buka;
      return el('div', { class: 'menu-list-item' },
        el('img', { src: img, alt: item.name, class: 'menu-item-thumb' }),
        el('div', { class: 'menu-item-info' }, el('h4', {}, item.name), el('span', { class: 'price' }, naira(item.price))),
        el('button', {
          type: 'button', class: 'add-dish-btn', 'aria-label': `Add ${item.name}`,
          onclick: () => {
            if (!r.is_open) return showNotification(`${r.name} isn't accepting orders right now.`, 'error');
            closeModal('fullMenuModal');
            setTimeout(() => openDishModal({ id: item.id, slug: r.slug, name: item.name, price: item.price, vendor: r.name, img }), 200);
          },
        }, el('span', { class: 'material-symbols-outlined', style: 'font-size: 18px;', 'aria-hidden': 'true' }, 'add')),
      );
    }));
  } catch (err) {
    menuList.replaceChildren(el('p', { style: 'text-align:center;color:var(--danger);font-size:13px;padding:20px;' }, err.message));
  }
}

/* On Document Ready */
document.addEventListener('DOMContentLoaded', () => {
  fetchRealVendorData();
  loadActiveOrder();
});

window.addEventListener('online', () => { isOnline = true; });
window.addEventListener('offline', () => { isOnline = false; });

/* The page calls these from inline onclick="..." attributes, so they must be on window now that this is a module. */
Object.assign(window, {
  openModal, closeModal, toggleDropdown, adjustQty, confirmOrderCheckout, handleReservationSubmit,
  openReservationsListModal, handleFilterSearch, switchVendorCategory, filterByCuisine, toggleAiWidget,
  quickAiOrder, handleVendorRegistration, openDishModal, openFullVendorMenu, fetchRealVendorData,
});
