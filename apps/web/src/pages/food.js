import { authorizedRequest, getCurrentUser, hydrateProfile, isAuthenticated } from '../state/session.js';
import { ApiError, newIdempotencyKey, request } from '../api/client.js';
import { ENDPOINTS } from '@thekapita/shared/endpoints';
import { buildDirectoryQuery, DIRECTORY_PAGE_SIZE } from '@thekapita/shared/directoryQuery';
import { currentPosition, locationAlreadyGranted } from '../ui/map.js';

/* Application State */
let currentDish = null; // { id, slug, name, price, vendor, img } for the dish modal
let currentModalQty = 1;
let orderKey = null;    // Idempotency-Key for the order being placed (reused only for network retries)
let restaurants = [];   // orderable vendors, from GET /food/restaurants?source=food
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

/* Live restaurant list from the API.
 *
 * Orderable vendors are few, so they load in one request. The directory can hold thousands of places, so it loads one
 * page at a time and the SERVER does the searching and filtering. Never download the whole catalogue to filter it here:
 * that is slow for everyone and gets slower with every import. */
const VENDOR_LIMIT = 100;
const DIRECTORY_PAGE = DIRECTORY_PAGE_SIZE;
const dir = { rows: [], hasMore: false, loading: false, token: 0, category: 'all', chip: 'all', q: '', timer: null };
let userPos = null; // {lat, lng}, only when the browser already allows location (never a surprise prompt)

// Neutral tile for places with no photo. A stock food photo would pretend to be the real place.
const NO_PHOTO = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#e2e8f0"/>'
  + '<path d="M28 20v14a4 4 0 0 0 4 4v22h4V38a4 4 0 0 0 4-4V20h-3v10h-2V20h-3v10h-2V20zM50 20c-4 2-6 8-6 14h6v26h4V20z" fill="#94a3b8"/></svg>',
)}`;

function ensureDirectorySection() {
  let list = document.getElementById('restaurantDirectoryList');
  if (!list) {
    const anchor = document.getElementById('restaurantCardList');
    list = el('div', { id: 'restaurantDirectoryList' });
    anchor.after(el('section', { id: 'restaurantDirectorySection', 'aria-labelledby': 'restaurantDirectoryHeading', style: 'margin-top: 24px;' },
      el('h3', { id: 'restaurantDirectoryHeading' }, 'Restaurant directory ', el('small', { id: 'directoryCountTag' })),
      list));
  }
  if (!document.getElementById('restaurantDirectoryAttribution')) {
    list.after(el('p', { id: 'restaurantDirectoryAttribution', hidden: '', style: 'font-size: 11px; color: #64748b; text-align: center;' }));
  }
  if (!document.getElementById('directoryLoadMore')) {
    list.after(el('div', { style: 'text-align: center; margin: 16px 0;' },
      el('button', { type: 'button', id: 'directoryLoadMore', class: 'btn-see-menu', hidden: '', onclick: () => loadDirectory(false) }, 'Show more restaurants')));
  }
  return list;
}

async function locateQuietly() {
  if (userPos || !(await locationAlreadyGranted())) return userPos;
  const here = await Promise.race([currentPosition(), new Promise((resolve) => setTimeout(resolve, 2500, null))]);
  userPos = here || null;
  return userPos;
}

function withPosition(params) {
  if (userPos) {
    params.set('lat', userPos.lat);
    params.set('lng', userPos.lng);
  }
  return params;
}

async function fetchRealVendorData() {
  const container = document.getElementById('restaurantCardList');
  if (!container) return;
  const directoryContainer = ensureDirectorySection();

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
  directoryContainer.replaceChildren(el('p', { class: 'directory-load-state' }, 'Loading restaurant directory...'));

  await locateQuietly();
  try {
    const params = withPosition(new URLSearchParams({ source: 'food', limit: VENDOR_LIMIT }));
    const vendors = await request(`${ENDPOINTS.food.restaurants}?${params}`);
    if (!Array.isArray(vendors)) throw new Error('The Eats catalogue returned an invalid response.');
    restaurants = vendors;
    renderVendorCards(restaurants);
    populateReservationSelect();
  } catch (error) {
    restaurants = [];
    renderVendorCards([], error);
  }
  await loadDirectory(true);
}

/** The server filter for the directory section, from the mode tabs, the cuisine chip and the search box. */
function directoryParams(offset) {
  return buildDirectoryQuery({ category: dir.category, chip: dir.chip, q: dir.q, offset, limit: DIRECTORY_PAGE, position: userPos });
}

function paintDirectoryMore() {
  const btn = document.getElementById('directoryLoadMore');
  if (!btn) return;
  btn.hidden = !dir.hasMore;
  btn.disabled = dir.loading;
  btn.textContent = dir.loading ? 'Loading...' : 'Show more restaurants';
}

async function loadDirectory(reset) {
  const list = ensureDirectorySection();
  const token = ++dir.token; // a newer request makes any older answer irrelevant
  if (reset) {
    dir.rows = [];
    dir.hasMore = false;
    list.replaceChildren(el('p', { class: 'directory-load-state' }, 'Loading restaurant directory...'));
  }
  dir.loading = true;
  paintDirectoryMore();
  try {
    const params = directoryParams(reset ? 0 : dir.rows.length);
    const page = params ? await request(`${ENDPOINTS.food.restaurants}?${params}`) : [];
    if (!Array.isArray(page)) throw new Error('The restaurant directory returned an invalid response.');
    if (token !== dir.token) return;
    const have = new Set(dir.rows.map((row) => row.id));
    dir.rows = dir.rows.concat(page.filter((row) => !have.has(row.id)));
    dir.hasMore = params !== null && page.length === DIRECTORY_PAGE;
    renderDirectoryCards(dir.rows);
  } catch (error) {
    if (token !== dir.token) return;
    if (reset) renderDirectoryCards([], error);
    else showNotification(error.message || 'Could not load more restaurants.', 'error');
  } finally {
    if (token === dir.token) {
      dir.loading = false;
      paintDirectoryMore();
    }
  }
}

function reloadDirectorySoon(delay = 0) {
  clearTimeout(dir.timer);
  dir.timer = setTimeout(() => loadDirectory(true), delay);
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

function renderVendorCards(vendors, error = null) {
  const container = document.getElementById('restaurantCardList');
  container.replaceChildren();

  if (error) {
    container.append(el('div', { class: 'directory-load-error', role: 'alert' },
      el('strong', {}, 'Food vendors could not be loaded.'),
      el('span', {}, error.message || 'Please check your connection and retry.'),
      el('button', { type: 'button', class: 'btn-retry', onclick: fetchRealVendorData }, 'Retry Loading'),
    ));
  }

  if (!vendors.length) {
    if (!error) container.append(el('p', { style: 'text-align:center;color:var(--text-muted);padding:24px;font-size:13px;' }, 'No onboarded food vendors are available yet.'));
  }

  for (const v of vendors) {
    const card = el('article', {
      class: 'restaurant-option-card',
      dataset: { category: v.category, cuisine: [v.category, ...(v.tags || [])].join(' '), slug: v.slug, source: 'food' },
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
            v.distance_km != null ? el('span', {}, `\u2022 ${v.distance_km} km`) : null,
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

  updateVisibleCounts();
  announceToSR(`${vendors.length} orderable food vendors loaded.`);
}

function directoryPlaceType(place) {
  if (['buka', 'bakery', 'grill', 'fine'].includes(place.category)) return place.category;
  const text = `${place.name} ${place.description || ''} ${(place.services || []).join(' ')}`.toLowerCase().replace(/[_-]/g, ' ');
  if (/\b(buka|bukateria)\b/.test(text)) return 'buka';
  if (/\bfine dining\b/.test(text)) return 'fine';
  return 'external';
}

function renderDirectoryCards(listings, error = null) {
  const container = document.getElementById('restaurantDirectoryList');
  const credit = document.getElementById('restaurantDirectoryAttribution');
  container.replaceChildren();

  if (error) {
    container.append(el('div', { class: 'directory-load-error', role: 'alert' },
      el('strong', {}, 'Restaurant directory could not be loaded.'),
      el('span', {}, error.message || 'Please check your connection and retry.'),
      el('button', { type: 'button', class: 'btn-retry', onclick: fetchRealVendorData }, 'Retry Loading'),
    ));
  }

  if (!listings.length && !error) {
    const filtered = dir.q || dir.category !== 'all' || dir.chip !== 'all';
    container.append(el('p', { class: 'directory-load-state' },
      filtered ? 'No directory restaurants match these filters. Try clearing the search or choosing All.' : 'No restaurant directory listings are available yet.'));
  }

  for (const place of listings) {
    const type = directoryPlaceType(place);
    const terms = [type, place.name, place.description, ...(place.services || [])]
      .filter(Boolean).join(' ').toLowerCase().replace(/[_-]/g, ' ');
    const address = [place.address, place.city].filter(Boolean).join(', ');
    const detailLines = [
      address,
      place.distance_km != null ? `${place.distance_km} km away` : '',
      place.hours ? `Hours: ${place.hours}` : '',
      place.phone ? `Phone: ${place.phone}` : '',
      place.services?.length ? place.services.join(' · ') : '',
    ].filter(Boolean);
    container.append(el('article', {
      class: 'restaurant-option-card directory-restaurant-card',
      dataset: { category: type, cuisine: terms, source: 'directory' },
    },
    el('div', { class: 'vendor-card-header' },
      el('img', { src: place.image_url || NO_PHOTO, alt: place.image_url ? place.name : '', class: 'vendor-thumb-box', loading: 'lazy' }),
      el('div', { class: 'vendor-info' },
        el('div', { class: 'vendor-title-row' },
          el('h4', {}, place.name),
          el('span', { class: `vendor-type-tag ${type}` }, type === 'buka' ? 'Buka' : 'Restaurant'),
        ),
        ...detailLines.map((line) => el('p', { class: 'directory-place-detail' }, line)),
      ),
    ),
    el('div', { class: 'vendor-card-actions' },
      el('span', { class: 'directory-discovery-label' }, 'Directory listing · Not orderable'),
      el('a', { href: 'directories.html', class: 'btn-see-menu btn-directory-link' }, 'Browse Directory'),
    )));
  }

  const credits = [...new Set(listings.map((place) => place.attribution).filter(Boolean))];
  credit.hidden = credits.length === 0;
  credit.textContent = credits.length ? `Restaurant directory data: ${credits.join('; ')}` : '';
  updateVisibleCounts();
}

function updateVisibleCounts() {
  const cards = [...document.querySelectorAll('.restaurant-option-card')];
  const visibleFood = cards.filter((card) => card.dataset.source !== 'directory' && card.style.display !== 'none').length;
  const visibleDirectory = cards.filter((card) => card.dataset.source === 'directory' && card.style.display !== 'none').length;
  const merchantCount = document.getElementById('merchantCountTag');
  const directoryCount = document.getElementById('directoryCountTag');
  if (merchantCount) merchantCount.textContent = `${visibleFood} Merchants Active`;
  if (directoryCount) directoryCount.textContent = `${visibleDirectory}${dir.hasMore ? '+' : ''} Listings`;
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
// Orderable vendors are few, so they are filtered right here. The directory can be huge, so its filters go to the server.
function vendorCards() {
  return document.querySelectorAll('.restaurant-option-card:not(.directory-restaurant-card)');
}

function handleFilterSearch() {
  const raw = document.getElementById('foodSearchInput').value;
  const q = raw.toLowerCase();
  vendorCards().forEach((card) => {
    card.style.display = card.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
  });
  dir.q = raw.trim();
  updateVisibleCounts();
  reloadDirectorySoon(350); // wait for a pause in typing
}

function switchVendorCategory(category, btnElement) {
  document.querySelectorAll('.service-mode-toggle .mode-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });
  btnElement.classList.add('active');
  btnElement.setAttribute('aria-selected', 'true');

  vendorCards().forEach((card) => {
    card.style.display = category === 'all' || card.dataset.category === category ? 'flex' : 'none';
  });
  dir.category = category;
  updateVisibleCounts();
  reloadDirectorySoon();
}

function filterByCuisine(cuisine, chipElement) {
  document.querySelectorAll('.cuisine-filter-bar .cuisine-chip').forEach(c => c.classList.remove('active'));
  chipElement.classList.add('active');

  vendorCards().forEach((card) => {
    const categories = card.dataset.cuisine.split(' ');
    card.style.display = cuisine === 'all' || categories.includes(cuisine) ? 'flex' : 'none';
  });
  dir.chip = cuisine;
  updateVisibleCounts();
  reloadDirectorySoon();
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
/** "About 12 min away by road": shown above the menu when we know where the person is and where the restaurant is. */
async function showDeliveryEstimate(restaurant, menuList) {
  if (!userPos || restaurant.latitude == null || !isAuthenticated()) return;
  try {
    const params = new URLSearchParams({ lat: userPos.lat, lng: userPos.lng });
    const estimate = await authorizedRequest(`${ENDPOINTS.food.deliveryEstimate(restaurant.slug)}?${params}`);
    if (document.getElementById('fullMenuVendorName').textContent !== restaurant.name) return; // they opened another menu meanwhile
    const how = estimate.source === 'road' ? 'by road' : '(estimate)';
    const text = estimate.minutes ? `About ${estimate.minutes} min away ${how}, ${estimate.distance_km} km` : 'You are right next to this restaurant';
    menuList.before(el('p', { id: 'fullMenuEta', style: 'font-size:12px;font-weight:600;color:var(--text-muted);margin:0 0 10px;' }, text));
  } catch {
    /* the menu is fine without an estimate */
  }
}

async function openFullVendorMenu(slug) {
  document.getElementById('fullMenuEta')?.remove();
  const menuList = document.getElementById('fullMenuList');
  menuList.replaceChildren(el('p', { style: 'text-align:center;color:var(--text-muted);font-size:13px;padding:20px;' }, 'Loading menu...'));
  document.getElementById('fullMenuVendorName').textContent = restaurants.find((r) => r.slug === slug)?.name || 'Vendor Menu';
  openModal('fullMenuModal');

  try {
    const r = await request(ENDPOINTS.food.restaurant(slug));
    document.getElementById('fullMenuVendorName').textContent = r.name;
    showDeliveryEstimate(r, menuList); // in the background: never delay the menu
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
