/* ==========================================================================
   FOOD VENDOR DASHBOARD
   - signed out            -> auth.html?next=food-vendor-dashboard.html
   - signed in, no store   -> food.html (API answers 403 on /food/vendor/me)
   - vendor                -> live orders, menu, store profile, wallet from /api/food/vendor/*
   Money: customers pay into escrow; the restaurant's wallet is credited only when the
   customer confirms delivery, so "Balance" here is released money, not pending orders.
   ========================================================================== */
import { authorizedRequest, isAuthenticated } from '../state/session.js';
import { ApiError } from '../api/client.js';
import { ENDPOINTS } from '@thekapita/shared/endpoints';
import { $, closeModal, errorMessage, h, money, moneyShort, openModal, setText, toast } from '../ui/dom.js';

const POLL_MS = 15000;
const CATEGORY_SLUG = {
  'Authentic Local Buka': 'buka',
  'Fine Dining Restaurant': 'fine',
  'Grills & Suya Spot': 'grill',
  'Bakery & Pastries': 'bakery',
};

const state = { store: null, orders: [], menu: [], busy: false };

/* ---------- boot ---------- */

async function boot() {
  if (!isAuthenticated()) {
    window.location.replace('auth.html?next=food-vendor-dashboard.html');
    return;
  }
  try {
    state.store = await authorizedRequest(ENDPOINTS.food.vendor.me);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      window.location.replace('food.html'); // no restaurant yet: the vendor sign-up form lives there
      return;
    }
    toast(errorMessage(err), 'error');
    return;
  }
  renderStore();
  await Promise.all([refreshOrders(), refreshMenu(), refreshSummary()]);
  setInterval(() => {
    if (document.visibilityState === 'visible') { refreshOrders(); refreshSummary(); }
  }, POLL_MS);
}

function renderStore() {
  const s = state.store;
  setText('sidebarStoreName', s.name);
  if (s.image_url) $('sidebarStoreAvatar').src = s.image_url;
  $('storeStatusCheckbox').checked = s.is_open;
  paintStatusText(s.is_open);
  $('storeNameInput').value = s.name;
  $('storeAddressInput').value = s.address;
  $('storePhoneInput').value = s.phone;
  $('storeHoursInput').value = s.hours || '';
  $('storeAvatarInput').value = s.image_url || '';
  setText('storeCategoryText', s.category_label);
  $('storeCategoryHidden').value = s.category_label;
  if (!s.is_active) toast('Your store is awaiting approval and is not visible to customers yet.');
}

function paintStatusText(open) {
  const text = $('statusText');
  text.textContent = open ? 'Accepting Orders' : 'Store Offline';
  text.style.color = open ? 'var(--emerald-dark)' : 'var(--danger)';
}

/* ---------- summary / wallet ---------- */

async function refreshSummary() {
  try {
    const s = await authorizedRequest(ENDPOINTS.food.vendor.summary);
    setText('mSales', moneyShort(s.sales_today));
    setText('mActive', String(s.active_orders));
    setText('mDone', String(s.completed_today));
    setText('walletBalance', money(s.balance));
    setText('withdrawAvailable', money(s.balance));
    $('withdrawAmount').max = String(Math.floor(s.balance));
  } catch { /* keep placeholders */ }
}

/* ---------- orders (kanban) ---------- */

async function refreshOrders() {
  try {
    state.orders = await authorizedRequest(ENDPOINTS.food.vendor.orders);
    renderKanbanBoard();
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) window.location.replace('food.html');
  }
}

function orderCard(o, actions, note) {
  return h('div', { class: 'order-card', id: `order-${o.reference}` },
    h('div', { class: 'order-header' },
      h('span', { class: 'order-id' }, `#${o.reference}`),
      h('span', { class: 'order-time' }, new Date(o.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })),
    ),
    h('div', { class: 'order-items' },
      o.items.map((i) => h('div', {}, `${i.qty}\u00D7 ${i.name}`)),
      o.note ? h('div', { style: 'margin-top:6px;font-style:italic;' }, `Note: ${o.note}`) : null,
      h('div', { style: 'margin-top:6px;font-size:11px;' }, `${o.customer_name} \u2022 ${o.delivery_address || 'No address given'}`),
      note,
    ),
    h('div', { class: 'order-actions' }, actions),
  );
}

function renderKanbanBoard() {
  const by = (status) => state.orders.filter((o) => o.status === status);
  const incoming = by('incoming');
  const preparing = by('preparing');
  const dispatch = state.orders.filter((o) => o.status === 'dispatch' || o.status === 'handed_over');
  const btn = (cls, label, onclick, extra = {}) => h('button', { type: 'button', class: `btn-action ${cls}`, onclick, ...extra }, label);

  $('ordersKanbanContainer').replaceChildren(
    h('div', { class: 'kanban-col' },
      h('h3', {}, 'Incoming New ', h('span', { class: 'col-count' }, incoming.length)),
      incoming.map((o) => orderCard(o, [
        btn('btn-reject', 'Decline', () => setOrderStatus(o, 'declined')),
        btn('btn-accept', 'Accept Order', () => setOrderStatus(o, 'preparing')),
      ], h('span', { style: 'display:block;margin-top:8px;color:var(--emerald-dark);' }, `Total: ${money(o.total)} (Paid to Escrow)`)))),
    h('div', { class: 'kanban-col' },
      h('h3', {}, 'Preparing ', h('span', { class: 'col-count' }, preparing.length)),
      preparing.map((o) => orderCard(o, [btn('btn-ready', 'Ready for Dispatch', () => setOrderStatus(o, 'dispatch'))]))),
    h('div', { class: 'kanban-col' },
      h('h3', {}, 'Awaiting Dispatch ', h('span', { class: 'col-count' }, dispatch.length)),
      dispatch.map((o) => o.status === 'dispatch'
        ? orderCard(o, [btn('btn-reject', 'Mark Handed Over', () => setOrderStatus(o, 'handed_over'), { style: 'width:100%;' })])
        : orderCard(o, [], h('span', { style: 'display:block;margin-top:8px;color:var(--warning);' }, 'Handed over \u2014 waiting for the customer to confirm. You are paid when they do.')))),
  );
}

async function setOrderStatus(order, status) {
  if (state.busy) return;
  state.busy = true;
  try {
    await authorizedRequest(ENDPOINTS.food.vendor.orderStatus(order.reference), { method: 'POST', body: { status } });
    announce(`Order ${order.reference} is now ${status.replace('_', ' ')}.`);
  } catch (err) {
    toast(errorMessage(err), 'error');
  } finally {
    state.busy = false;
    refreshOrders();
    refreshSummary();
  }
}

/* ---------- menu ---------- */

async function refreshMenu() {
  try {
    state.menu = await authorizedRequest(ENDPOINTS.food.vendor.menu);
    renderMenu();
  } catch { /* keep empty */ }
}

function renderMenu() {
  const q = ($('menuSearchInput')?.value || '').trim().toLowerCase();
  const rows = state.menu.filter((m) => !q || m.name.toLowerCase().includes(q));
  const list = $('vendor-menu-list');
  if (!rows.length) {
    list.replaceChildren(h('p', { style: 'padding:20px;text-align:center;color:var(--text-muted);font-size:13px;' },
      state.menu.length ? 'No dishes match your search.' : 'No dishes yet. Tap "Add Item" to publish your first one.'));
    return;
  }
  list.replaceChildren(...rows.map((m) => h('div', { class: 'menu-item-row' },
    h('div', { class: 'menu-item-left' },
      m.image_url ? h('img', { src: m.image_url, alt: '', class: 'menu-item-thumb', loading: 'lazy' }) : null,
      h('div', { class: 'menu-item-info' },
        h('h4', {}, m.name),
        h('p', { style: 'color:var(--text-muted);font-weight:500;font-size:11px;' }, `${m.category || 'Uncategorised'} \u2022 ${money(m.price)}`),
      ),
    ),
    h('label', { class: 'switch', title: m.is_available ? 'On the menu' : 'Hidden from customers' },
      h('input', { type: 'checkbox', checked: m.is_available, onchange: (e) => setAvailability(m, e.target.checked) }),
      h('span', { class: 'slider round', 'aria-hidden': 'true' }),
      h('span', { class: 'sr-only' }, `Show ${m.name} on the menu`),
    ),
  )));
}

async function setAvailability(item, available) {
  try {
    const updated = await authorizedRequest(ENDPOINTS.food.vendor.menuItem(item.id), { method: 'PATCH', body: { is_available: available } });
    Object.assign(item, updated);
    toast(available ? `${item.name} is back on the menu` : `${item.name} hidden from customers`, 'success');
  } catch (err) {
    toast(errorMessage(err), 'error');
    refreshMenu();
  }
}

function filterMenuList() { renderMenu(); }

async function handleAddNewDish(e) {
  e.preventDefault();
  const btn = $('addDishSubmitBtn');
  btn.disabled = true;
  try {
    const dish = await authorizedRequest(ENDPOINTS.food.vendor.menu, {
      method: 'POST',
      body: {
        name: $('newDishName').value.trim(),
        price: Number($('newDishPrice').value),
        category: $('dishCategoryHidden').value,
        image_url: $('newDishImg').value.trim(),
      },
    });
    state.menu.push(dish);
    renderMenu();
    closeModal('addItemModal');
    e.target.reset();
    toast(`"${dish.name}" published at ${money(dish.price)}`, 'success');
  } catch (err) {
    toast(errorMessage(err), 'error');
  } finally {
    btn.disabled = false;
  }
}

/* ---------- store profile / open switch ---------- */

async function patchStore(body) {
  state.store = await authorizedRequest(ENDPOINTS.food.vendor.store, { method: 'PATCH', body });
  renderStore();
}

async function toggleStoreStatus(checkbox) {
  const wanted = checkbox.checked;
  paintStatusText(wanted);
  try {
    await patchStore({ is_open: wanted });
    announce(wanted ? 'Store is now accepting orders.' : 'Store is now offline.');
  } catch (err) {
    checkbox.checked = !wanted;
    paintStatusText(!wanted);
    toast(errorMessage(err), 'error');
  }
}

async function handleStoreUpdate(e) {
  e.preventDefault();
  const btn = $('storeSaveBtn');
  if (btn) btn.disabled = true;
  try {
    await patchStore({
      name: $('storeNameInput').value.trim(),
      category: CATEGORY_SLUG[$('storeCategoryHidden').value] || state.store.category,
      address: $('storeAddressInput').value.trim(),
      phone: $('storePhoneInput').value.trim(),
      hours: $('storeHoursInput').value.trim(),
      image_url: $('storeAvatarInput').value.trim(),
    });
    toast('Store profile updated', 'success');
  } catch (err) {
    toast(errorMessage(err), 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ---------- withdrawals ---------- */

function handleWithdrawal(e) {
  e.preventDefault();
  // Honest placeholder: there is no bank-transfer provider (Paystack/Monnify transfers) connected yet, so
  // pretending to pay out would be a lie. Released earnings stay safely in the Kapita wallet meanwhile.
  closeModal('withdrawModal');
  toast('Bank withdrawals are not live yet. Your earnings stay safe in your Kapita wallet.');
}

/* ---------- tabs, dropdowns, a11y (same behaviour as before) ---------- */

function announce(message) {
  const node = $('srAnnouncer');
  if (node) node.textContent = message;
}

function switchTab(tabId, btnElement) {
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
  btnElement?.classList.add('active');
  const titles = {
    dashboard: 'Dashboard Overview', orders: 'Live Order Queue', menu: 'Menu Management',
    wallet: 'Escrow Wallet & Payouts', store: 'Store Profile & Details',
  };
  setText('pageTitleDisplay', titles[tabId]);
  document.querySelectorAll('.view-section').forEach((s) => s.classList.remove('active'));
  $(`view-${tabId}`)?.classList.add('active');
  if (tabId === 'orders') refreshOrders();
  if (tabId === 'wallet') refreshSummary();
  announce(`Switched to ${titles[tabId]}`);
}

function toggleCustomDropdown(dropdownId, event) {
  event.stopPropagation();
  const open = $(dropdownId).classList.toggle('active');
  event.currentTarget.setAttribute('aria-expanded', open);
}

function selectDropdownOption(dropdownId, textSpanId, hiddenInputId, value) {
  setText(textSpanId, value);
  $(hiddenInputId).value = value;
  $(dropdownId).classList.remove('active');
}

window.addEventListener('click', () => {
  document.querySelectorAll('.header-nav-dropdown-menu').forEach((m) => m.classList.remove('active'));
});

Object.assign(window, {
  switchTab, openModal, closeModal, toggleCustomDropdown, selectDropdownOption,
  toggleStoreStatus, handleWithdrawal, handleAddNewDish, handleStoreUpdate, filterMenuList,
});

boot();
