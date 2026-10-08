import { isAuthenticated } from '../state/session.js';

if (!isAuthenticated()) {
  const notificationBadge = document.querySelector('.notif-badge');
  const notificationList = document.querySelector('.notif-list');
  const markRead = document.querySelector('.mark-read');

  if (notificationBadge) notificationBadge.textContent = '0';
  if (notificationList) {
    const emptyState = document.createElement('p');
    emptyState.className = 'notif-empty';
    emptyState.textContent = 'Sign in to view your notifications.';
    notificationList.replaceChildren(emptyState);
  }
  if (markRead) markRead.hidden = true;
}

function openApp(appName) {
  // Prototype trigger for routing between internal services
  console.log(`Navigating to theKapita ${appName}...`);
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
// BUGFIX: #globalSearch only exists on index.html, so this threw a
// TypeError every 3 seconds on Profile, Wallet and Marketplace (app.js
// loads on all of them). Guard so the interval is a no-op elsewhere.
if (searchInput) {
  setInterval(() => {
    index = (index + 1) % placeholders.length;
    searchInput.setAttribute('placeholder', placeholders[index]);
  }, 3000);
}

// BUGFIX: toggleAppMenu() was defined three times in this file, the last
// definition silently winning and the earlier two (plus their own
// document-level "click outside" listeners) becoming dead code that still
// ran on every click. The single definition and its outside-click handler
// now live further down this file, right after toggleNotifMenu(), where
// they also close the notification menu — the earlier, incomplete versions
// have been removed.

/* ===================================================
   INTER-CONTAINER DRAG & DROP SWAP LOGIC
   =================================================== */

let draggedItem = null;

// Helper: Re-render element HTML depending on whether it sits in Top Pills or Main Grid
// eslint-disable-next-line no-restricted-properties -- title/desc/icon come
// from this page's own data-title/data-desc/data-icon attributes (developer-
// authored markup), never from user input, so this is not the injection
// pattern the rule exists to catch (contrast with the old seller.js bug).
function buildElementHTML(id, title, desc, icon, isPill) {
  if (isPill) {
    return `${icon} ${title}`;
  } else {
    return `
      <div class="icon-circle ${id === 'Pay' ? 'hero-icon' : ''}">${icon}</div>
      <div class="app-info">
        <h4>${title}</h4>
        <p>${desc}</p>
      </div>
    `;
  }
}

// Helper: Attach Event Listeners to Draggable Items
function attachDragEvents(element) {
  element.addEventListener('dragstart', handleDragStart);
  element.addEventListener('dragover', handleDragOver);
  element.addEventListener('dragleave', handleDragLeave);
  element.addEventListener('drop', handleDrop);
  element.addEventListener('dragend', handleDragEnd);

  // Click handler so dragging still allows normal clicks
  element.addEventListener('click', (e) => {
    const id = element.getAttribute('data-id');
    if (id) openApp(id);
  });
}

function handleDragStart(e) {
  draggedItem = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.getAttribute('data-id'));
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (this !== draggedItem) {
    this.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  this.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  this.classList.remove('drag-over');

  if (!draggedItem || draggedItem === this) return;

  // Extract metadata for both target and dragged items
  const sourceData = {
    id: draggedItem.getAttribute('data-id'),
    title: draggedItem.getAttribute('data-title'),
    desc: draggedItem.getAttribute('data-desc'),
    icon: draggedItem.getAttribute('data-icon')
  };

  const targetData = {
    id: this.getAttribute('data-id'),
    title: this.getAttribute('data-title'),
    desc: this.getAttribute('data-desc'),
    icon: this.getAttribute('data-icon')
  };

  // Determine container types
  const sourceIsPill = draggedItem.classList.contains('pill');
  const targetIsPill = this.classList.contains('pill');

  // Swap attributes
  draggedItem.setAttribute('data-id', targetData.id);
  draggedItem.setAttribute('data-title', targetData.title);
  draggedItem.setAttribute('data-desc', targetData.desc);
  draggedItem.setAttribute('data-icon', targetData.icon);

  this.setAttribute('data-id', sourceData.id);
  this.setAttribute('data-title', sourceData.title);
  this.setAttribute('data-desc', sourceData.desc);
  this.setAttribute('data-icon', sourceData.icon);

  // Re-render inner HTML based on their target containers
  // eslint-disable-next-line no-restricted-properties -- see buildElementHTML comment above
  draggedItem.innerHTML = buildElementHTML(targetData.id, targetData.title, targetData.desc, targetData.icon, sourceIsPill);
  // eslint-disable-next-line no-restricted-properties -- see buildElementHTML comment above
  this.innerHTML = buildElementHTML(sourceData.id, sourceData.title, sourceData.desc, sourceData.icon, targetIsPill);
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  draggedItem = null;
}

// Initialize all draggable elements on page load
document.addEventListener('DOMContentLoaded', () => {
  const draggables = document.querySelectorAll('[draggable="true"]');
  draggables.forEach(attachDragEvents);
});

// Toggle Notification Menu
function toggleNotifMenu(event) {
  event.stopPropagation();
  const notifMenu = document.getElementById('notifMenu');
  const launcherMenu = document.getElementById('launcherMenu');
  
  // Close launcher menu if open
  if (launcherMenu) launcherMenu.classList.remove('active');
  
  if (notifMenu) notifMenu.classList.toggle('active');
}

// Toggle App Launcher Menu
function toggleAppMenu(event) {
  event.stopPropagation();
  const launcherMenu = document.getElementById('launcherMenu');
  const notifMenu = document.getElementById('notifMenu');
  
  // Close notification menu if open
  if (notifMenu) notifMenu.classList.remove('active');
  
  if (launcherMenu) launcherMenu.classList.toggle('active');
}

// Close all menus when clicking anywhere outside
document.addEventListener('click', function(event) {
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

  toast.innerHTML = `
    <span>${message}</span>
    <button style="background:none; border:none; color:inherit; cursor:pointer; font-weight:bold; margin-left:12px;" onclick="this.parentElement.remove()">✕</button>
  `;

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