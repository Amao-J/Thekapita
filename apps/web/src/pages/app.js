import {
  authorizedRequest,
  getCurrentUser,
  hydrateProfile,
  isAuthenticated,
  subscribe as subscribeSession,
} from '../state/session.js';

const NOTIFICATION_READ_KEY = 'kapita.notifications.read.v1';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function setHtml(element, markup) {
  // eslint-disable-next-line no-restricted-properties -- Notification fields are escaped before rendering.
  element.innerHTML = markup;
}

function getReadNotificationIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(NOTIFICATION_READ_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function relativeTime(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const minutes = Math.round((timestamp - Date.now()) / 60000);
  const unit = Math.abs(minutes) < 60 ? 'minute' : 'hour';
  const amount = unit === 'minute' ? minutes : Math.round(minutes / 60);
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(amount, unit);
}

function updateNotificationBadge(notifications) {
  const unreadCount = notifications.filter((item) => !getReadNotificationIds().has(item.id)).length;
  const badge = document.querySelector('.notif-badge');
  const button = document.getElementById('notifBtn');
  if (badge) {
    badge.textContent = String(unreadCount);
    badge.hidden = unreadCount === 0;
  }
  if (button) button.setAttribute('aria-label', unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications');
}

function renderNotifications(notifications, error = '') {
  const list = document.querySelector('.notif-list');
  const markRead = document.querySelector('.mark-read');
  if (!list) return;
  const readIds = getReadNotificationIds();
  if (markRead) markRead.hidden = notifications.length === 0;
  setHtml(list, notifications.length ? notifications.map((item) => `
    <a class="notif-item ${readIds.has(item.id) ? '' : 'unread'}" data-notification-id="${escapeHtml(item.id)}" href="${item.href}">
      <div class="notif-icon-circle ${item.kind === 'order' ? 'eats-icon' : 'pay-icon'}" aria-hidden="true">${item.kind === 'order' ? '🛍️' : '💳'}</div>
      <div class="notif-content">
        <p class="notif-title"><strong>${escapeHtml(item.title)}</strong></p>
        <p class="notif-body">${escapeHtml(item.message)}</p>
        <span class="notif-time">${escapeHtml(relativeTime(item.createdAt))}</span>
      </div>
    </a>
  `).join('') : `<p class="notif-empty">${escapeHtml(error || (isAuthenticated() ? 'No recent activity.' : 'Sign in to view your notifications.'))}</p>`);
  updateNotificationBadge(notifications);
}

async function loadNotifications() {
  const list = document.querySelector('.notif-list');
  if (!list) return;
  if (!isAuthenticated()) {
    renderNotifications([]);
    return;
  }

  const [transactionsResult, ordersResult] = await Promise.allSettled([
    authorizedRequest('/wallet/transactions?limit=10'),
    authorizedRequest('/marketplace/orders?limit=10'),
  ]);
  const notifications = [];
  if (transactionsResult.status === 'fulfilled') {
    transactionsResult.value.forEach((transaction) => notifications.push({
      id: `transaction:${transaction.id}`,
      kind: 'transaction',
      title: 'theKapita Pay',
      message: `${transaction.kind === 'credit' ? 'Received' : 'Sent'} ₦${Number(transaction.amount).toLocaleString()}${transaction.counterparty ? ` · ${transaction.counterparty}` : ''}`,
      createdAt: transaction.created_at,
      href: 'wallet.html',
    }));
  }
  if (ordersResult.status === 'fulfilled') {
    ordersResult.value.forEach((order) => notifications.push({
      id: `order:${order.reference}`,
      kind: 'order',
      title: 'Marketplace order',
      message: `${order.reference} · ${order.status_label}`,
      createdAt: order.created_at,
      href: 'marketplace.html',
    }));
  }
  notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const hasError = transactionsResult.status === 'rejected' || ordersResult.status === 'rejected';
  renderNotifications(notifications.slice(0, 10), hasError ? 'Could not load recent activity.' : '');
}

function markNotificationsRead() {
  const ids = new Set([
    ...getReadNotificationIds(),
    ...Array.from(document.querySelectorAll('.notif-item[data-notification-id]'), (item) => item.dataset.notificationId),
  ]);
  localStorage.setItem(NOTIFICATION_READ_KEY, JSON.stringify([...ids]));
  document.querySelectorAll('.notif-item.unread').forEach((item) => item.classList.remove('unread'));
  const badge = document.querySelector('.notif-badge');
  const button = document.getElementById('notifBtn');
  if (badge) badge.hidden = true;
  if (button) button.setAttribute('aria-label', 'Notifications');
}

function updateHomepageGreeting() {
  const greeting = document.getElementById('heroGreeting');
  const greetingText = document.getElementById('heroGreetingText');
  if (!greeting || !greetingText) return;

  const user = isAuthenticated() ? getCurrentUser() : null;
  const fullName = String(user?.full_name || user?.first_name || '').trim();
  const firstName = fullName.split(/\s+/)[0];
  greeting.hidden = !firstName;
  if (!firstName) return;

  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  greetingText.textContent = `${timeGreeting}, ${firstName}.`;
}

function openApp(appName) {
  const routes = {
    Ride: 'ride.html',
    Driver: 'driver.html',
    Bills: 'bills.html',
    Eats: 'food.html',
    Market: 'marketplace.html',
    Directories: 'directories.html',
    Haven: 'haven.html',
    Care: 'care.html',
  };
  const destination = routes[appName];
  if (destination) {
    window.location.href = destination;
  }
}

// Interactive search placeholder effect
const searchInput = document.getElementById('globalSearch');
const placeholders = [
  "Search 'Ride to Airport'...",
  "Search 'Order Jollof'...",
  "Search 'Pay Electricity'...",
  "Ask Kapita Brain AI..."
];

let index = 0;
if (searchInput) {
  setInterval(() => {
    index = (index + 1) % placeholders.length;
    searchInput.setAttribute('placeholder', placeholders[index]);
  }, 3000);
}

/* ===================================================
   INTER-CONTAINER DRAG & DROP SWAP LOGIC
   =================================================== */

let draggedItem = null;

function extractIconMarkup(element) {
  const attrIcon = element.getAttribute('data-icon');
  if (attrIcon && attrIcon !== 'null') {
    return attrIcon;
  }
  const svg = element.querySelector('svg');
  if (svg) {
    return svg.outerHTML;
  }
  const iconNode = element.querySelector('.icon-circle > *, .pill-emblem');
  if (iconNode) {
    return iconNode.outerHTML;
  }
  return '';
}

function extractBadgeStyle(element) {
  const attrStyle = element.getAttribute('data-badge-style');
  if (attrStyle && attrStyle !== 'null') {
    return attrStyle;
  }
  const circle = element.querySelector('.icon-circle');
  if (!circle) return '';
  const inlineBg = circle.style.background;
  return inlineBg ? `style="background: ${escapeHtml(inlineBg)};"` : '';
}

function getItemSnapshot(element) {
  const titleEl = element.querySelector('.app-info h3, .app-card-info h3') || element.querySelector('span:last-child');
  const descEl = element.querySelector('.app-info p, .app-card-info p');
  return {
    id: element.getAttribute('data-id') || '',
    title: element.getAttribute('data-title') || (titleEl ? titleEl.textContent.trim() : ''),
    desc: element.getAttribute('data-desc') || (descEl ? descEl.textContent.trim() : ''),
    icon: extractIconMarkup(element),
    badgeStyle: extractBadgeStyle(element),
  };
}

function applyItemSnapshot(element, data, isPill) {
  element.setAttribute('data-id', data.id);
  element.setAttribute('data-title', data.title);
  element.setAttribute('data-desc', data.desc);
  if (data.icon) {
    element.setAttribute('data-icon', data.icon);
  }
  if (data.badgeStyle) {
    element.setAttribute('data-badge-style', data.badgeStyle);
  }

  const safeId = escapeHtml(data.id);
  const safeTitle = escapeHtml(data.title);
  const safeDesc = escapeHtml(data.desc);
  const safeIcon = data.icon || '';

  if (isPill) {
    // eslint-disable-next-line no-restricted-properties -- Icon markup comes from existing SVG/emblem elements and text fields are escaped.
    element.innerHTML = `${safeIcon}<span>${safeTitle}</span>`;
  } else {
    // eslint-disable-next-line no-restricted-properties -- Icon markup comes from existing SVG/emblem elements and text fields are escaped.
    element.innerHTML = `
      <div class="icon-circle app-emblem-box ${safeId === 'Pay' ? 'hero-icon' : ''}" aria-hidden="true" ${data.badgeStyle || ''}>${safeIcon}</div>
      <div class="app-info">
        <h3>${safeTitle}</h3>
        <p>${safeDesc}</p>
      </div>
    `;
  }
}

function attachDragEvents(element) {
  element.addEventListener('dragstart', handleDragStart);
  element.addEventListener('dragover', handleDragOver);
  element.addEventListener('dragleave', handleDragLeave);
  element.addEventListener('drop', handleDrop);
  element.addEventListener('dragend', handleDragEnd);

  element.addEventListener('click', () => {
    const id = element.getAttribute('data-id');
    if (id) openApp(id);
  });
}

function handleDragStart(e) {
  draggedItem = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.getAttribute('data-id') || '');
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (this !== draggedItem) {
    this.classList.add('drag-over');
  }
}

function handleDragLeave() {
  this.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  this.classList.remove('drag-over');

  if (!draggedItem || draggedItem === this) return;

  const sourceData = getItemSnapshot(draggedItem);
  const targetData = getItemSnapshot(this);

  const sourceIsPill = draggedItem.classList.contains('pill');
  const targetIsPill = this.classList.contains('pill');

  applyItemSnapshot(draggedItem, targetData, sourceIsPill);
  applyItemSnapshot(this, sourceData, targetIsPill);
}

function handleDragEnd() {
  this.classList.remove('dragging');
  document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
  draggedItem = null;
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('heroGreeting')) {
    subscribeSession(updateHomepageGreeting);
    updateHomepageGreeting();
    if (isAuthenticated()) {
      hydrateProfile().catch((error) => {
        console.error('Could not refresh the homepage greeting profile.', error);
      });
    }
  }
  loadNotifications();
  document.querySelector('.mark-read')?.addEventListener('click', markNotificationsRead);
  document.querySelector('.notif-list')?.addEventListener('click', (event) => {
    const item = event.target.closest('.notif-item[data-notification-id]');
    if (!item) return;
    const ids = getReadNotificationIds();
    ids.add(item.dataset.notificationId);
    localStorage.setItem(NOTIFICATION_READ_KEY, JSON.stringify([...ids]));
    item.classList.remove('unread');
    const notifications = Array.from(document.querySelectorAll('.notif-item[data-notification-id]'), (node) => ({
      id: node.dataset.notificationId,
    }));
    updateNotificationBadge(notifications);
  });

  const draggables = document.querySelectorAll('[draggable="true"]');
  draggables.forEach((el) => {
    const snap = getItemSnapshot(el);
    if (snap.icon && !el.getAttribute('data-icon')) {
      el.setAttribute('data-icon', snap.icon);
    }
    if (snap.badgeStyle && !el.getAttribute('data-badge-style')) {
      el.setAttribute('data-badge-style', snap.badgeStyle);
    }
    attachDragEvents(el);
  });
});

// Toggle Notification Menu
function toggleNotifMenu(event) {
  event.stopPropagation();
  const notifMenu = document.getElementById('notifMenu');
  const launcherMenu = document.getElementById('launcherMenu');

  if (launcherMenu) launcherMenu.classList.remove('active');
  if (notifMenu) notifMenu.classList.toggle('active');
}

// Toggle App Launcher Menu
function toggleAppMenu(event) {
  event.stopPropagation();
  const launcherMenu = document.getElementById('launcherMenu');
  const notifMenu = document.getElementById('notifMenu');

  if (notifMenu) notifMenu.classList.remove('active');
  if (launcherMenu) launcherMenu.classList.toggle('active');
}

// Close all menus when clicking anywhere outside
document.addEventListener('click', function (event) {
  const notifMenu = document.getElementById('notifMenu');
  const launcherMenu = document.getElementById('launcherMenu');

  if (notifMenu && !notifMenu.contains(event.target)) {
    notifMenu.classList.remove('active');
  }
  if (launcherMenu && !launcherMenu.contains(event.target)) {
    launcherMenu.classList.remove('active');
  }
});

/* ---- Window bridge: index.html and profile.html still call these via
   inline onclick. Same pattern as auth.js/wallet.js/profile.js. */
window.openApp = openApp;
window.toggleAppMenu = toggleAppMenu;
window.toggleNotifMenu = toggleNotifMenu;

/* ===================================================
   GLOBAL NETWORK & TOAST FEEDBACK ENGINE
   =================================================== */

export function showToast(message, type = 'error', duration = 4000) {
  let toastContainer = document.getElementById('globalToastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'globalToastContainer';
    toastContainer.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 360px;
      width: calc(100% - 48px);
    `;
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const bg = type === 'error' ? '#121212' : type === 'success' ? '#00d084' : '#2b6cb0';
  const border = type === 'error' ? '#ff4d4d' : 'transparent';
  const color = type === 'success' ? '#121212' : '#ffffff';

  toast.style.cssText = `
    background: ${bg};
    color: ${color};
    border-left: 4px solid ${border};
    padding: 14px 16px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    display: flex;
    align-items: center;
    justify-content: space-between;
    animation: slideIn 0.2s ease-out;
  `;

  const messageElement = document.createElement('span');
  messageElement.textContent = message;
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = '✕';
  closeButton.style.cssText = 'background:none; border:none; color:inherit; cursor:pointer; font-weight:bold; margin-left:12px;';
  closeButton.addEventListener('click', () => toast.remove());
  toast.replaceChildren(messageElement, closeButton);

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Online / Offline Global Event Listeners
window.addEventListener('offline', () => {
  showToast('You are currently offline. Please check your internet connection.', 'error', 6000);
});

window.addEventListener('online', () => {
  showToast('Connection restored! You are back online.', 'success', 3000);
});

window.showToast = showToast;