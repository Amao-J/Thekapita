/* ==========================================================================
   DIRECTORY
   Public browsing needs no account. Reviews, bookmarks, reports, submitting a listing and "My Biz"
   need sign-in (we send people to auth.html?next=directories.html and bring them back).
   Notifications and billing are still UI-only: there is no backend for them yet.
   ========================================================================== */
import { authorizedRequest, isAuthenticated } from '../state/session.js';
import { ApiError, request } from '../api/client.js';
import { ENDPOINTS } from '@thekapita/shared/endpoints';
import { $, closeModal, errorMessage, h, openModal, setText, toast } from '../ui/dom.js';
import { currentPosition, geocode, hasCoords } from '../ui/map.js';

const state = {
  category: 'All',        // 'All' | 'Businesses' | 'Government' | 'Schools' | 'Hospitals' (labels the page already uses)
  view: 'grid',
  mode: 'explore',        // explore | bookmarks | dashboard
  listings: [],
  bookmarks: new Set(),
  pos: null,              // {lat, lng}
  query: '',
  selected: null,         // listing open in the detail modal
  rating: 0,
  transit: 'drive',
  route: null,
  searchTimer: null,
  loadToken: 0,
};

const SPEED_KMH = { drive: 30, transit: 20, walk: 5 }; // rough city averages for a straight-line estimate

function requireLogin() {
  if (isAuthenticated()) return true;
  window.location.href = 'auth.html?next=directories.html';
  return false;
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
}

/* ---------- loading & rendering ---------- */

async function loadListings() {
  const token = ++state.loadToken; // ignore answers that arrive after a newer request
  const grid = $('directoryGrid');
  grid.replaceChildren(h('p', { style: 'padding:24px;color:#64748b;font-size:13px;' }, 'Loading listings...'));
  try {
    let rows;
    if (state.mode === 'bookmarks') {
      if (!requireLogin()) return;
      rows = await authorizedRequest(ENDPOINTS.directory.bookmarks);
    } else {
      const params = new URLSearchParams();
      if (state.category !== 'All') params.set('category', state.category.toLowerCase());
      if (state.query) params.set('q', state.query);
      if (state.pos) { params.set('lat', state.pos.lat); params.set('lng', state.pos.lng); }
      rows = await request(`${ENDPOINTS.directory.listings}?${params}`);
    }
    if (token !== state.loadToken) return;
    state.listings = rows;
    renderGrid();
    fillReportSelect();
  } catch (err) {
    if (token !== state.loadToken) return;
    grid.replaceChildren(h('p', { role: 'alert', style: 'padding:24px;color:#b91c1c;font-size:13px;' }, errorMessage(err, 'Could not load the directory.')));
  }
}

function renderGrid(rows = state.listings) {
  const grid = $('directoryGrid');
  grid.classList.toggle('list-view', state.view === 'list');
  if (!rows.length) {
    grid.replaceChildren(h('p', { style: 'padding:24px;color:#64748b;font-size:13px;' },
      state.mode === 'bookmarks' ? 'You have not saved any listings yet.' : 'No listings match yet.'));
    return;
  }
  grid.replaceChildren(...rows.map(card));
}

function card(l) {
  const saved = state.bookmarks.has(l.id);
  return h('article', { class: 'directory-card entity-card' + (l.tier === 'sponsored' ? ' sponsored' : '') },
    h('div', { class: 'entity-header' },
      h('div', { class: 'entity-logo-box' }, initials(l.name)),
      h('div', {},
        h('h3', { class: 'entity-name' }, l.name, l.is_verified ? h('span', { class: 'material-symbols-outlined', title: 'Verified', style: 'font-size:16px;color:#008a57;vertical-align:middle;margin-left:4px;' }, 'verified') : null),
        h('span', { class: 'entity-category' }, l.category_label),
      ),
    ),
    h('p', { class: 'entity-address' }, l.address),
    h('p', { class: 'entity-meta', style: 'font-size:12px;color:#64748b;' },
      l.rating !== null ? `\u2605 ${l.rating} (${l.review_count})` : 'No reviews yet',
      l.distance_km !== null ? ` \u2022 ${l.distance_km} km away` : '',
      l.tier === 'sponsored' ? ' \u2022 Sponsored' : '',
    ),
    h('div', { class: 'entity-actions', style: 'display:flex;gap:8px;margin-top:10px;' },
      h('button', { type: 'button', class: 'btn-submit-primary', onclick: () => openDetail(l.id) }, 'Details'),
      h('button', { type: 'button', class: 'btn-submit-primary', style: 'background:transparent;border:2px solid var(--border-color);color:var(--black);', onclick: () => openRoute(l) }, 'Directions'),
      h('button', {
        type: 'button', class: 'icon-btn', 'aria-label': saved ? `Remove ${l.name} from saved` : `Save ${l.name}`, 'aria-pressed': String(saved),
        onclick: () => toggleBookmark(l),
      }, h('span', { class: 'material-symbols-outlined', style: saved ? "font-variation-settings:'FILL' 1;" : '' }, 'bookmark')),
    ),
  );
}

/* ---------- filters, search ---------- */

function setCategoryFilter(category, btn) {
  state.category = category;
  document.querySelectorAll('.cat-pill').forEach((b) => b.classList.toggle('active', b === btn));
  setText('aiParsedText', '');
  $('aiParsedFeedback').style.display = 'none';
  loadListings();
}

function setDirectoryView(view) {
  state.view = view;
  $('gridViewBtn').classList.toggle('active', view === 'grid');
  $('listViewBtn').classList.toggle('active', view === 'list');
  renderGrid();
}

function handleSearchKeyup(event) {
  if (event.key === 'Enter') return executeAISearch();
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(() => {
    state.query = $('directorySearchInput').value.trim();
    $('aiParsedFeedback').style.display = 'none';
    loadListings();
  }, 300);
}

/** "AI Search" is a keyword parser on the server today (category words + free text), not an LLM. */
async function executeAISearch() {
  const q = $('directorySearchInput').value.trim();
  if (!q) return toast('Type what you are looking for, e.g. "hospital in Ikeja".');
  clearTimeout(state.searchTimer);
  try {
    const params = new URLSearchParams({ q });
    if (state.pos) { params.set('lat', state.pos.lat); params.set('lng', state.pos.lng); }
    const res = await request(`${ENDPOINTS.directory.search}?${params}`);
    state.mode = 'explore';
    state.listings = res.results;
    const bits = [];
    if (res.intent.category) bits.push(`category: ${res.intent.category}`);
    if (res.intent.keywords.length) bits.push(`keywords: ${res.intent.keywords.join(', ')}`);
    setText('aiParsedText', `Understood ${bits.join(' \u2022 ') || 'your search as plain text'}`);
    $('aiParsedFeedback').style.display = '';
    renderGrid();
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

async function detectUserLocation() {
  setText('currentLocationLabel', 'Locating...');
  const pos = await currentPosition();
  if (!pos) {
    setText('currentLocationLabel', 'Location unavailable');
    return toast('Could not get your location. Check browser permissions.', 'error');
  }
  state.pos = pos;
  setText('currentLocationLabel', 'Near you');
  loadListings(); // server sorts sponsored first, then nearest
}

/* ---------- detail, reviews, bookmarks ---------- */

async function openDetail(id) {
  try {
    const l = await request(ENDPOINTS.directory.listing(id));
    state.selected = l;
    state.rating = 0;
    setText('modalLogo', initials(l.name));
    setText('modalTitle', l.name);
    setText('modalCategory', l.category_label);
    setText('modalAddress', l.address);
    setText('modalPhone', l.phone);
    setText('modalHours', l.hours || 'Hours not provided');
    $('modalServices').replaceChildren(...l.services.map((s) => h('span', { class: 'stat-badge badge-emerald' }, s)));
    $('reviewCommentInput').value = '';
    paintStars(0);
    $('modalReviewsList').replaceChildren(...(l.reviews.length
      ? l.reviews.map((r) => h('div', { class: 'review-item', style: 'padding:8px 0;border-bottom:1px solid var(--border-color);' },
        h('strong', {}, r.author), ` \u2014 ${'\u2605'.repeat(r.rating)}${'\u2606'.repeat(5 - r.rating)}`,
        r.comment ? h('p', { style: 'font-size:12px;color:#475569;margin-top:2px;' }, r.comment) : null))
      : [h('p', { style: 'font-size:12px;color:#64748b;' }, 'No reviews yet. Be the first.')]));
    openModal('detailModal');
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

function paintStars(n) {
  document.querySelectorAll('#starRatingRow .material-symbols-outlined').forEach((star, i) => {
    star.classList.toggle('selected', i < n);
  });
}

function setRating(n) {
  state.rating = n;
  paintStars(n);
}

async function submitReview() {
  if (!requireLogin() || !state.selected) return;
  if (!state.rating) return toast('Tap the stars to choose a rating first.', 'error');
  try {
    await authorizedRequest(ENDPOINTS.directory.reviews(state.selected.id), {
      method: 'POST',
      body: { rating: state.rating, comment: $('reviewCommentInput').value.trim() },
    });
    toast('Review posted. Thank you!', 'success');
    await openDetail(state.selected.id);
    loadListings();
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

async function loadBookmarks() {
  if (!isAuthenticated()) return;
  try {
    const rows = await authorizedRequest(ENDPOINTS.directory.bookmarks);
    state.bookmarks = new Set(rows.map((r) => r.id));
    renderGrid();
  } catch { /* bookmarks are a nicety; the page works without them */ }
}

async function toggleBookmark(listing) {
  if (!requireLogin()) return;
  try {
    const { bookmarked } = await authorizedRequest(ENDPOINTS.directory.bookmark(listing.id), { method: 'POST' });
    if (bookmarked) state.bookmarks.add(listing.id); else state.bookmarks.delete(listing.id);
    if (state.mode === 'bookmarks' && !bookmarked) state.listings = state.listings.filter((l) => l.id !== listing.id);
    renderGrid();
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

/* ---------- directions (straight-line estimate + hand-off to a maps app) ---------- */

function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(x));
}

async function openRoute(listing) {
  state.route = listing;
  setText('routeModalTitle', `Directions to ${listing.name}`);
  setText('routeCurrentLocDisplay', state.pos ? 'Your current location' : 'Location not shared');
  openModal('routeModal');
  if (!state.pos) state.pos = await currentPosition();
  setText('routeCurrentLocDisplay', state.pos ? 'Your current location' : 'Location not shared');
  paintRoute();
}

function setTransitMode(mode) {
  state.transit = mode;
  paintRoute();
}

function paintRoute() {
  for (const [id, mode] of [['modeDrive', 'drive'], ['modeTransit', 'transit'], ['modeWalk', 'walk']]) {
    $(id)?.classList.toggle('active', state.transit === mode);
  }
  const l = state.route;
  if (!l) return;
  const dest = hasCoords(l.latitude, l.longitude) ? { lat: l.latitude, lng: l.longitude } : null;
  if (state.pos && dest) {
    const km = haversineKm(state.pos, dest);
    const mins = Math.max(1, Math.round((km / SPEED_KMH[state.transit]) * 60));
    setText('routeDistanceTime', `~${mins} min (${km.toFixed(1)} km straight line)`);
  } else {
    setText('routeDistanceTime', dest ? 'Share your location for an estimate' : 'No map position for this listing yet');
  }
  $('turnByTurnList').replaceChildren(h('div', {}, `Head to ${l.address}. Tap "Open in Maps" for turn-by-turn road directions.`));
}

function launchExternalMaps() {
  const l = state.route;
  if (!l) return;
  const destination = hasCoords(l.latitude, l.longitude) ? `${l.latitude},${l.longitude}` : `${l.name}, ${l.address}`;
  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set('destination', destination);
  url.searchParams.set('travelmode', { drive: 'driving', transit: 'transit', walk: 'walking' }[state.transit]);
  window.open(url, '_blank', 'noopener');
}

/* ---------- submit a listing / report ---------- */

async function handleBusinessSubmit(event) {
  event.preventDefault();
  if (!requireLogin()) return;
  const button = event.target.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    const address = $('newAddress').value.trim();
    const where = await geocode(address); // best effort: lets listings sort by distance
    const listing = await authorizedRequest(ENDPOINTS.directory.listings, {
      method: 'POST',
      body: {
        name: $('newEntityName').value.trim(),
        category: $('newCategory').value.toLowerCase(),
        phone: $('newPhone').value.trim(),
        address,
        tier: $('newTier').value,
        latitude: where?.lat ?? null,
        longitude: where?.lng ?? null,
      },
    });
    closeModal('addBusinessModal');
    event.target.reset();
    toast(listing.status === 'approved' ? 'Your listing is live.' : 'Submitted! Your listing will appear once our team reviews it.', 'success');
    if (listing.status === 'approved') loadListings();
  } catch (err) {
    toast(errorMessage(err), 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function fillReportSelect() {
  const select = $('reportEntitySelect');
  if (!select) return;
  select.replaceChildren(...state.listings.map((l) => h('option', { value: String(l.id) }, l.name)));
}

async function submitReport() {
  if (!requireLogin()) return;
  const listingId = Number($('reportEntitySelect').value);
  if (!listingId) return toast('Pick the listing you want to report.', 'error');
  try {
    await authorizedRequest(ENDPOINTS.directory.reports, {
      method: 'POST',
      body: { listing_id: listingId, issue_type: $('reportIssueType').value, notes: $('reportNotes').value.trim() },
    });
    closeModal('reportModal');
    $('reportNotes').value = '';
    toast('Report received. Thanks for helping keep the directory accurate.', 'success');
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

/* ---------- tabs / My Biz ---------- */

async function switchNavMode(mode, btn) {
  state.mode = mode;
  document.querySelectorAll('.market-nav-btn').forEach((b) => b.classList.toggle('active', b === btn));
  $('exploreSection').classList.toggle('hidden', mode === 'dashboard');
  $('dashboardSection').classList.toggle('hidden', mode !== 'dashboard');
  if (mode === 'dashboard') return loadMyListings();
  loadListings();
}

async function loadMyListings() {
  const body = $('myListingsBody');
  if (!isAuthenticated()) {
    body.textContent = 'Sign in to see the listings you submitted.';
    return;
  }
  try {
    const rows = await authorizedRequest(ENDPOINTS.directory.mine);
    body.replaceChildren(...(rows.length
      ? rows.map((l) => h('div', { style: 'display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--border-color);' },
        h('span', {}, h('strong', {}, l.name), ` \u2022 ${l.category_label}`),
        h('span', {}, `${l.status_label} \u2022 ${l.review_count} review${l.review_count === 1 ? '' : 's'} \u2022 ${l.bookmark_count} saved`)))
      : [h('span', {}, 'You have not submitted a listing yet. Use "Add Listing" at the top.')]));
  } catch (err) {
    body.textContent = err instanceof ApiError ? err.message : 'Could not load your listings.';
  }
}

/* ---------- UI-only pieces (no backend yet) ---------- */

function toggleNotifDropdown() {
  $('notifDropdown').classList.toggle('active');
}

function refreshNotifBadge() {
  const unread = document.querySelectorAll('#notifDropdown .notif-item:not(.read)').length;
  const badge = $('notifBadge');
  badge.textContent = String(unread);
  badge.style.display = unread ? '' : 'none';
}

function markNotificationRead(id) {
  $(id)?.classList.add('read');
  refreshNotifBadge();
}

function markAllNotificationsRead() {
  document.querySelectorAll('#notifDropdown .notif-item').forEach((n) => n.classList.add('read'));
  refreshNotifBadge();
}

function saveBillingSettings() {
  closeModal('billingModal');
  toast('Billing is not live yet, so nothing was changed.');
}

Object.assign(window, {
  openModal, closeModal, setCategoryFilter, setDirectoryView, handleSearchKeyup, executeAISearch,
  detectUserLocation, setRating, submitReview, setTransitMode, launchExternalMaps,
  handleBusinessSubmit, submitReport, switchNavMode, toggleNotifDropdown,
  markNotificationRead, markAllNotificationsRead, saveBillingSettings,
});

$('aiParsedFeedback').style.display = 'none';
loadListings();
loadBookmarks();
