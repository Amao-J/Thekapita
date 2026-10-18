/* Merchant Dashboard Application State */
let activeOrders = [
  { id: 'TK-9921', time: '2 mins ago', items: '2x Abula Combo (Amala, Gbegiri, Ewedu)<br>1x Assorted Meat', total: '8,400', status: 'incoming' },
  { id: 'TK-9918', time: '14 mins ago', items: '1x Pounded Yam & Egusi<br>2x Bottled Water', total: '3,800', status: 'preparing' },
  { id: 'TK-9910', time: 'Rider: Sani Ibrahim', items: 'Provide PIN <strong>5924</strong> to rider upon handoff.', total: '6,500', status: 'dispatch' }
];

/* Screen Reader Announcer */
function announceToSR(message) {
  const announcer = document.getElementById('srAnnouncer');
  if (announcer) announcer.textContent = message;
}

// Tab Switching Logic
function switchTab(tabId, btnElement) {
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
  btnElement.classList.add('active');

  const titles = {
    'dashboard': 'Dashboard Overview',
    'orders': 'Live Order Queue',
    'menu': 'Menu Management',
    'wallet': 'Escrow Wallet & Payouts',
    'store': 'Store Profile & Details'
  };
  document.getElementById('pageTitleDisplay').textContent = titles[tabId];

  document.querySelectorAll('.view-section').forEach(section => section.classList.remove('active'));
  document.getElementById('view-' + tabId).classList.add('active');

  if (tabId === 'orders') renderKanbanBoard();
  announceToSR(`Switched to ${titles[tabId]}`);
}

// Modal Controls
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('active');
    const input = modal.querySelector('input, select, button');
    if (input) input.focus();
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

// Custom Dropdowns Toggle with ARIA Attributes
function toggleCustomDropdown(dropdownId, event) {
  event.stopPropagation();
  const trigger = event.currentTarget;
  const dropdown = document.getElementById(dropdownId);
  const isExpanded = dropdown.classList.toggle('active');
  trigger.setAttribute('aria-expanded', isExpanded);
}

function selectDropdownOption(dropdownId, textSpanId, hiddenInputId, value) {
  document.getElementById(textSpanId).textContent = value;
  document.getElementById(hiddenInputId).value = value;
  document.getElementById(dropdownId).classList.remove('active');
}

window.addEventListener('click', function () {
  document.querySelectorAll('.header-nav-dropdown-menu').forEach(menu => menu.classList.remove('active'));
});

// Kanban Rendering Function
function renderKanbanBoard() {
  const container = document.getElementById('ordersKanbanContainer');
  if (!container) return;

  const incoming = activeOrders.filter(o => o.status === 'incoming');
  const preparing = activeOrders.filter(o => o.status === 'preparing');
  const dispatch = activeOrders.filter(o => o.status === 'dispatch');

  container.innerHTML = `
    <div class="kanban-col">
      <h3>Incoming New <span class="col-count">${incoming.length}</span></h3>
      ${incoming.map(o => `
        <div class="order-card" id="order-${o.id}">
          <div class="order-header">
            <span class="order-id">#${o.id}</span>
            <span class="order-time">${o.time}</span>
          </div>
          <div class="order-items">
            ${o.items}<br>
            <span style="display:block; margin-top: 8px; color: var(--emerald-dark);">Total: ₦${o.total} (Paid to Escrow)</span>
          </div>
          <div class="order-actions">
            <button type="button" class="btn-action btn-reject" onclick="removeCard('${o.id}')">Decline</button>
            <button type="button" class="btn-action btn-accept" onclick="moveOrder('${o.id}', 'preparing')">Accept Order</button>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="kanban-col">
      <h3>Preparing <span class="col-count">${preparing.length}</span></h3>
      ${preparing.map(o => `
        <div class="order-card" id="order-${o.id}">
          <div class="order-header">
            <span class="order-id">#${o.id}</span>
            <span class="order-time">${o.time}</span>
          </div>
          <div class="order-items">${o.items}</div>
          <div class="order-actions">
            <button type="button" class="btn-action btn-ready" onclick="moveOrder('${o.id}', 'dispatch')">Ready for Dispatch</button>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="kanban-col">
      <h3>Awaiting Dispatch <span class="col-count">${dispatch.length}</span></h3>
      ${dispatch.map(o => `
        <div class="order-card" id="order-${o.id}">
          <div class="order-header">
            <span class="order-id">#${o.id}</span>
            <span class="order-time">${o.time}</span>
          </div>
          <div class="order-items" style="color: var(--warning);">${o.items}</div>
          <div class="order-actions">
            <button type="button" class="btn-action btn-reject" style="width: 100%;" onclick="removeCard('${o.id}', true)">Mark Handed Over</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// Kanban Operations with Simulated Network Latency
async function moveOrder(orderId, newStatus) {
  const idx = activeOrders.findIndex(o => o.id === orderId);
  if (idx !== -1) {
    activeOrders[idx].status = newStatus;
    renderKanbanBoard();
    announceToSR(`Order ${orderId} moved to ${newStatus}.`);
  }
}

function removeCard(orderId, complete = false) {
  activeOrders = activeOrders.filter(o => o.id !== orderId);
  renderKanbanBoard();
  announceToSR(complete ? `Order ${orderId} completed.` : `Order ${orderId} declined.`);
}

// Store Status Toggle
function toggleStoreStatus(checkbox) {
  const text = document.getElementById('statusText');
  if (checkbox.checked) {
    text.textContent = "Accepting Orders";
    text.style.color = "var(--emerald-dark)";
    announceToSR("Store is now accepting orders.");
  } else {
    text.textContent = "Store Offline";
    text.style.color = "var(--danger)";
    announceToSR("Store is now offline.");
  }
}

// Functional Withdrawal Form Submission
async function handleWithdrawal(e) {
  e.preventDefault();
  const bank = document.getElementById('bankHidden').value;
  if (!bank) {
    alert("Please select a bank.");
    return;
  }

  const btn = document.getElementById('withdrawSubmitBtn');
  btn.innerHTML = `<span class="btn-spinner"></span> Authorizing Payout...`;
  btn.disabled = true;

  const accountNumber = document.getElementById('withdrawAccountNumber').value;
  const amount = Number(document.getElementById('withdrawAmount').value).toLocaleString();

  setTimeout(() => {
    closeModal('withdrawModal');
    btn.textContent = "Authorize Payout";
    btn.disabled = false;
    alert(`Withdrawal of ₦${amount} to ${bank} (${accountNumber}) initiated successfully!`);
  }, 1000);
}

// Functional Add New Dish Form Submission
async function handleAddNewDish(e) {
  e.preventDefault();
  const btn = document.getElementById('addDishSubmitBtn');
  btn.innerHTML = `<span class="btn-spinner"></span> Publishing...`;
  btn.disabled = true;

  const title = document.getElementById('newDishName').value;
  const price = Number(document.getElementById('newDishPrice').value).toLocaleString();

  setTimeout(() => {
    closeModal('addItemModal');
    btn.textContent = "Publish Dish to Menu";
    btn.disabled = false;
    e.target.reset();
    alert(`"${title}" published to live menu at ₦${price}!`);
  }, 800);
}

// Store Details Form Update Handler
function handleStoreUpdate(e) {
  e.preventDefault();
  const storeName = document.getElementById('storeNameInput').value;
  document.getElementById('sidebarStoreName').textContent = storeName;
  alert("Store profile updated!");
}