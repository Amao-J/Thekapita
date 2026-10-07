/* ==========================================
   THEKAPITA PAY WALLET INTERACTION ENGINE
   ========================================== */
import { refreshBalance, getBalanceDisplay, fundWallet, sendMoney } from '../state/ledger.js';
import { isAuthenticated } from '../state/session.js';
import { ApiError } from '../api/client.js';

// Gate the page: no token, no wallet. Matches the same check src/pages/auth.js
// runs in reverse (already-authenticated users skip the login form).
if (!isAuthenticated()) {
  window.location.href = 'auth.html';
}

/* 0. Real balance, replacing the static "245,500.00" baked into the HTML */
async function hydrateBalance() {
  const balanceEl = document.getElementById('mainWalletBalance');
  if (!balanceEl) return;
  try {
    await refreshBalance();
    if (!isWalletBalanceMasked) balanceEl.textContent = getBalanceDisplay();
  } catch (err) {
    balanceEl.textContent = 'Unavailable';
    console.error('Could not load wallet balance:', err);
  }
}


/* 1. Tab Navigation & Dynamic Hero Card Toggle */
function switchWalletTab(tabName, btnElement) {
  // Hide all tab panes and clear button active states
  document.querySelectorAll('.w-tab-pane').forEach(pane => pane.classList.remove('active'));
  document.querySelectorAll('.w-tab-btn').forEach(btn => btn.classList.remove('active'));

  // Capitalize first letter to match element ID format: walletTabOverview, walletTabCards, etc.
  const targetPaneId = `walletTab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`;
  const activePane = document.getElementById(targetPaneId);

  if (activePane) activePane.classList.add('active');

  // Handle active state for passed button or fallback match
  if (btnElement) {
    btnElement.classList.add('active');
  } else {
    const defaultBtn = document.querySelector(`.w-tab-btn[onclick*="'${tabName}'"]`);
    if (defaultBtn) defaultBtn.classList.add('active');
  }

  // Hide Hero Card on non-overview tabs to bring content to top
  const heroWrapper = document.getElementById('heroCardWrapper');
  if (heroWrapper) {
    heroWrapper.style.display = (tabName === 'overview') ? 'block' : 'none';
  }

  // Scroll smoothly to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* 2. Balance Masking */
let isWalletBalanceMasked = false;

function toggleWalletBalance() {
  const balanceEl = document.getElementById('mainWalletBalance');
  const eyeIcon = document.getElementById('balanceEyeIcon');
  if (!balanceEl) return;

  if (isWalletBalanceMasked) {
    balanceEl.textContent = getBalanceDisplay();
    isWalletBalanceMasked = false;
    if (eyeIcon) eyeIcon.textContent = 'visibility';
  } else {
    balanceEl.textContent = '••••••••';
    isWalletBalanceMasked = true;
    if (eyeIcon) eyeIcon.textContent = 'visibility_off';
  }
}

/* 3. Modal Engine (Add, Send, Receive, Withdraw) */
function openWalletModal(actionType) {
  const modal = document.getElementById('walletActionModal');
  const title = document.getElementById('walletModalTitle');
  const subtitle = document.getElementById('walletModalSubtitle');
  const content = document.getElementById('walletModalContent');
  if (!modal || !content) return;

  // ADD MONEY FLOW
  if (actionType === 'add') {
    title.textContent = 'Add Money to Wallet';
    subtitle.textContent = 'Fund your wallet via Card, Bank Transfer, or USSD';
    content.innerHTML = `
      <div class="form-group">
        <label>Amount (₦)</label>
        <input type="number" id="fundAmount" placeholder="0.00" class="form-control" style="font-size: 20px; font-weight: 700;" required />
      </div>
      <div style="display: flex; gap: 8px; margin-bottom: 16px;">
        <button type="button" class="btn-sm" onclick="setQuickAmount(5000)">+₦5,000</button>
        <button type="button" class="btn-sm" onclick="setQuickAmount(10000)">+₦10,000</button>
        <button type="button" class="btn-sm" onclick="setQuickAmount(20000)">+₦20,000</button>
      </div>
      <div class="form-group">
        <label>Payment Method</label>
        <select class="form-control" id="fundChannel">
          <option value="bank_transfer">Instant Bank Transfer (GTBank)</option>
          <option value="card">Debit Card (•••• 8821)</option>
        </select>
      </div>
      <button class="btn-primary w-full" style="margin-top: 12px;" onclick="executeFunding()">Continue to Pay</button>
    `;
  }

  // SEND MONEY FLOW
  else if (actionType === 'send') {
    title.textContent = 'Send Money';
    subtitle.textContent = 'Instant zero-fee transfers within theKapita network';
    content.innerHTML = `
      <div class="form-group">
        <label>Recipient ID, Email or Bank Account</label>
        <input type="text" id="sendRecipient" placeholder="e.g. @sarah or KPT-881029" class="form-control" required />
      </div>
      <div class="form-group">
        <label>Amount (₦)</label>
        <input type="number" id="sendAmount" placeholder="0.00" class="form-control" required />
      </div>
      <div class="form-group">
        <label>Note (Optional)</label>
        <input type="text" placeholder="e.g. Lunch refund" class="form-control" />
      </div>
      <button class="btn-primary w-full" onclick="executeSend()">Confirm & Send</button>
    `;
  }

  // RECEIVE MONEY FLOW
  else if (actionType === 'receive') {
    title.textContent = 'Receive Money';
    subtitle.textContent = 'Scan QR code or share your universal Kapita ID';
    content.innerHTML = `
      <div class="text-center">
        <div style="background: #ffffff; padding: 16px; border-radius: 20px; width: 180px; margin: 0 auto 16px; border: 1px solid #e5e7eb; box-shadow: 0 10px 25px rgba(0,0,0,0.05);">
          <svg viewBox="0 0 100 100" class="qr-svg" style="width: 100%; height: auto; display: block;">
            <rect width="100" height="100" fill="#ffffff" />
            <rect x="6" y="6" width="28" height="28" fill="#121212" rx="4" />
            <rect x="11" y="11" width="18" height="18" fill="#ffffff" rx="2" />
            <rect x="15" y="15" width="10" height="10" fill="#121212" rx="1.5" />
            <rect x="66" y="6" width="28" height="28" fill="#121212" rx="4" />
            <rect x="71" y="11" width="18" height="18" fill="#ffffff" rx="2" />
            <rect x="75" y="15" width="10" height="10" fill="#121212" rx="1.5" />
            <rect x="6" y="66" width="28" height="28" fill="#121212" rx="4" />
            <rect x="11" y="71" width="18" height="18" fill="#ffffff" rx="2" />
            <rect x="15" y="75" width="10" height="10" fill="#121212" rx="1.5" />
            <rect x="68" y="68" width="14" height="14" fill="#121212" rx="2" />
            <rect x="71" y="71" width="8" height="8" fill="#ffffff" rx="1" />
            <rect x="73" y="73" width="4" height="4" fill="#121212" rx="0.5" />
            <rect x="38" y="18" width="4" height="4" fill="#121212" />
            <rect x="46" y="18" width="4" height="4" fill="#121212" />
            <rect x="54" y="18" width="4" height="4" fill="#121212" />
            <rect x="18" y="38" width="4" height="4" fill="#121212" />
            <rect x="18" y="46" width="4" height="4" fill="#121212" />
            <rect x="18" y="54" width="4" height="4" fill="#121212" />
            <rect x="38" y="6" width="4" height="8" fill="#121212" />
            <rect x="46" y="10" width="8" height="4" fill="#121212" />
            <rect x="58" y="6" width="4" height="4" fill="#121212" />
            <rect x="58" y="14" width="4" height="8" fill="#121212" />
            <rect x="6" y="38" width="8" height="4" fill="#121212" />
            <rect x="6" y="50" width="4" height="8" fill="#121212" />
            <rect x="86" y="38" width="8" height="4" fill="#121212" />
            <rect x="86" y="46" width="4" height="8" fill="#121212" />
            <rect x="26" y="38" width="8" height="4" fill="#121212" />
            <rect x="38" y="26" width="4" height="8" fill="#121212" />
            <rect x="38" y="38" width="6" height="6" fill="#121212" />
            <rect x="56" y="26" width="8" height="4" fill="#121212" />
            <rect x="66" y="38" width="4" height="8" fill="#121212" />
            <rect x="74" y="38" width="8" height="4" fill="#121212" />
            <rect x="26" y="50" width="4" height="8" fill="#121212" />
            <rect x="34" y="54" width="8" height="4" fill="#121212" />
            <rect x="56" y="50" width="4" height="8" fill="#121212" />
            <rect x="66" y="54" width="8" height="4" fill="#121212" />
            <rect x="38" y="66" width="4" height="8" fill="#121212" />
            <rect x="38" y="78" width="8" height="4" fill="#121212" />
            <rect x="38" y="86" width="4" height="8" fill="#121212" />
            <rect x="50" y="66" width="8" height="4" fill="#121212" />
            <rect x="50" y="74" width="4" height="8" fill="#121212" />
            <rect x="50" y="86" width="8" height="4" fill="#121212" />
            <rect x="66" y="86" width="8" height="4" fill="#121212" />
            <rect x="86" y="66" width="4" height="8" fill="#121212" />
            <rect x="86" y="82" width="8" height="4" fill="#121212" />
            <rect x="43" y="43" width="14" height="14" rx="4" fill="#121212" />
            <circle cx="50" cy="50" r="3" fill="#00d084" />
          </svg>
        </div>
        <h4>Ahmed Ebuka</h4>
        <p style="font-size: 13px; color: #666; margin-bottom: 16px;">@ahmed • KPT-883902</p>
        <button class="btn-secondary w-full" onclick="navigator.clipboard.writeText('KPT-883902'); alert('ID Copied!');">Copy Kapita ID Tag</button>
      </div>
    `;
  }

  modal.classList.add('active');
}

function closeWalletModal(e) {
  if (e && e.target !== e.currentTarget) return;
  const modal = document.getElementById('walletActionModal');
  if (modal) modal.classList.remove('active');
}

/* 4. Transaction Detail Viewer */
function viewTxDetail(txId) {
  const modal = document.getElementById('txDetailModal');
  if (modal) modal.classList.add('active');
}

function closeTxModal(e) {
  if (e && e.target !== e.currentTarget) return;
  const modal = document.getElementById('txDetailModal');
  if (modal) modal.classList.remove('active');
}

/* 5. Utility Functions */
function setQuickAmount(val) {
  const input = document.getElementById('fundAmount');
  if (input) input.value = val;
}

async function executeFunding() {
  const amountInput = document.getElementById('fundAmount');
  const channelSelect = document.getElementById('fundChannel');
  const amount = parseFloat(amountInput?.value);

  if (!amount || amount <= 0) {
    alert('Enter an amount greater than zero.');
    return;
  }

  try {
    await fundWallet(amount, channelSelect?.value ?? 'bank_transfer');
    alert('Funding initiated — you will get a push notification once it clears.');
    closeWalletModal();
    document.getElementById('mainWalletBalance').textContent = getBalanceDisplay();
  } catch (err) {
    alert(err instanceof ApiError ? err.message : 'Could not reach theKapita. Try again.');
  }
}

async function executeSend() {
  const recipient = document.getElementById('sendRecipient')?.value.trim();
  const amount = parseFloat(document.getElementById('sendAmount')?.value);

  if (!recipient) {
    alert('Enter a recipient ID, email or bank account.');
    return;
  }
  if (!amount || amount <= 0) {
    alert('Enter an amount greater than zero.');
    return;
  }

  try {
    await sendMoney(recipient, amount);
    alert('Transfer complete!');
    closeWalletModal();
    document.getElementById('mainWalletBalance').textContent = getBalanceDisplay();
  } catch (err) {
    alert(err instanceof ApiError ? err.message : 'Could not reach theKapita. Try again.');
  }
}

// SECURITY: full card numbers and CVVs must never be present in client-side
// code or the DOM. In production, "reveal" should call the card issuer's
// secure-display widget/SDK (e.g. rendered inside a provider-hosted iframe),
// which returns a short-lived, non-persisted view — this app never sees the
// raw PAN/CVV. The demo below only toggles the last-4 mask and is safe
// because no real card data is embedded here.
function toggleCardDetails() {
  const num = document.getElementById('cardNumberDisplay');
  const cvv = document.getElementById('cardCvvDisplay');
  const revealed = !num.textContent.includes('••••');
  if (!revealed) {
    // TODO(backend): replace with a call to the issuer's secure reveal
    // endpoint/SDK. Never store or render the full PAN/CVV from app code.
    num.textContent = 'Full number available in the secure card view';
    cvv.textContent = '···';
  } else {
    num.textContent = '•••• •••• •••• 8821';
    cvv.textContent = '•••';
  }
}

function toggleFreezeCard(btn) {
  if (btn.textContent === 'Freeze Card') {
    btn.textContent = 'Unfreeze Card';
    btn.style.color = '#ff4d4d';
  } else {
    btn.textContent = 'Freeze Card';
    btn.style.color = '';
  }
}

/* ==========================================
   RECIPIENTS MANAGEMENT ENGINE
   ========================================== */

let recipientsData = [
  {
    id: 'REC-1',
    name: 'Sarah Okoro',
    avatar: 'SO',
    type: 'internal',
    handle: '@sarah • Instant ₦0 Fee',
    meta: 'KPT-881092 • Primary Tag',
    isFavorite: true,
    isOnline: true
  },
  {
    id: 'REC-2',
    name: 'John Okafor',
    avatar: 'JO',
    type: 'bank',
    handle: 'GTBank Guarantee Trust',
    meta: '•••• 4902 • Verified Name',
    isFavorite: false,
    isOnline: true
  },
  {
    id: 'REC-3',
    name: 'Ella Amra',
    avatar: 'EA',
    type: 'internal',
    handle: '@amra • Instant ₦0 Fee',
    meta: 'KPT-883912 • Primary Tag',
    isFavorite: true,
    isOnline: false
  },
  {
    id: 'REC-4',
    name: 'Michael Chen',
    avatar: 'MC',
    type: 'bank',
    handle: 'Access Bank PLC',
    meta: '•••• 8812 • Verified Name',
    isFavorite: false,
    isOnline: false
  }
];

let activeCategoryFilter = 'all';
let currentSearchQuery = '';

/* BUGFIX: wallet.html calls filterTx(type, btn) and openBillPay() via
   inline onclick, but neither was defined anywhere in the codebase — the
   same class of bug as the missing sortProducts() in market.js, just not
   caught until ESLint's no-undef rule had real imports/exports to check
   against. */
function filterTx(type, btnElement) {
  const scope = btnElement?.closest('.filter-pills');
  scope?.querySelectorAll('.pill').forEach((p) => p.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');
  // TODO(backend): once transactions come from GET /wallet/transactions
  // instead of static markup, filter the fetched list by `type` here and
  // re-render — this only handles the visual active-state for now.
}

function openBillPay() {
  // TODO(backend): Bills & Airtime is its own module (Building Plan
  // Section 5.5, VTpass integration) — wire this to that flow once it
  // exists. Reusing the wallet modal here just avoids a dead button.
  openWalletModal('add');
}

document.addEventListener('DOMContentLoaded', () => {
  hydrateBalance();
  initRecipientsEngine();
});

/* ---- Window bridge: wallet.html still calls these via inline onclick
   attributes rather than addEventListener. Nothing here touches money or
   auth state directly (executeFunding/executeSend do, and are wired above
   through real ledger.js calls) — this bridge is UI-only: tabs, modals,
   masking, filters. See src/pages/auth.js for the same pattern explained. */
window.switchWalletTab = switchWalletTab;
window.toggleWalletBalance = toggleWalletBalance;
window.openWalletModal = openWalletModal;
window.closeWalletModal = closeWalletModal;
window.viewTxDetail = viewTxDetail;
window.closeTxModal = closeTxModal;
window.setQuickAmount = setQuickAmount;
window.executeFunding = executeFunding;
window.executeSend = executeSend;
window.toggleCardDetails = toggleCardDetails;
window.toggleFreezeCard = toggleFreezeCard;
window.filterTx = filterTx;
window.openBillPay = openBillPay;
window.quickSendTo = quickSendTo;
window.toggleFavorite = toggleFavorite;

function initRecipientsEngine() {
  const searchInput = document.querySelector('.recipient-search-box input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value.toLowerCase().trim();
      renderRecipients();
    });
  }

  // Direct Inline Event Handlers for Filter Pills
  const filterPills = document.querySelectorAll('#walletTabRecipients .filter-pills .pill');
  filterPills.forEach((pill, idx) => {
    pill.addEventListener('click', function () {
      filterPills.forEach(p => p.classList.remove('active'));
      this.classList.add('active');

      if (idx === 0) activeCategoryFilter = 'all';
      else if (idx === 1) activeCategoryFilter = 'internal';
      else if (idx === 2) activeCategoryFilter = 'bank';
      else if (idx === 3) activeCategoryFilter = 'favorites';

      renderRecipients();
    });
  });

  renderRecipients();
}

function renderRecipients() {
  const gridContainer = document.querySelector('#walletTabRecipients .recipients-grid');
  const railContainer = document.querySelector('.quick-send-rail');
  if (!gridContainer) return;

  const filtered = recipientsData.filter(item => {
    const matchesCategory =
      activeCategoryFilter === 'all' ? true :
      activeCategoryFilter === 'favorites' ? item.isFavorite :
      item.type === activeCategoryFilter;

    const matchesSearch =
      item.name.toLowerCase().includes(currentSearchQuery) ||
      item.handle.toLowerCase().includes(currentSearchQuery) ||
      item.meta.toLowerCase().includes(currentSearchQuery);

    return matchesCategory && matchesSearch;
  });

  if (filtered.length === 0) {
    gridContainer.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px 16px; color: #718096;">
        <span class="material-symbols-outlined" style="font-size: 48px; color: #cbd5e0;">person_search</span>
        <p style="margin-top: 8px; font-weight: 600;">No recipients match your search or filter.</p>
      </div>
    `;
  } else {
    gridContainer.innerHTML = filtered.map(item => `
      <div class="recipient-card ${item.isFavorite ? 'favorited' : ''}" id="card-${item.id}">
        <div class="rec-card-top">
          <span class="network-badge ${item.type}">
            <span class="material-symbols-outlined">${item.type === 'internal' ? 'bolt' : 'account_balance'}</span>
            ${item.type === 'internal' ? 'Kapita ID' : 'Bank Account'}
          </span>
          <button class="fav-star-btn ${item.isFavorite ? 'active' : ''}" onclick="toggleFavorite('${item.id}')" title="${item.isFavorite ? 'Remove Favorite' : 'Add Favorite'}">
            <span class="material-symbols-outlined">star</span>
          </button>
        </div>
        <div class="rec-avatar-lg ${item.type === 'bank' ? 'bank-avatar' : ''}">
          ${item.avatar}
          ${item.type === 'internal' ? '<span class="badge-dot kapita-dot"></span>' : ''}
        </div>
        <h4>${item.name}</h4>
        <p class="handle">${item.handle}</p>
        <span class="account-meta">${item.meta}</span>
        <div class="rec-card-actions">
          <button class="${item.type === 'internal' ? 'btn-primary' : 'btn-secondary'}" onclick="quickSendTo('${item.name}', '${item.handle}')">
            <span class="material-symbols-outlined" style="font-size: 16px; margin-right: 4px;">send</span>
            ${item.type === 'internal' ? 'Send Money' : 'Transfer'}
          </button>
        </div>
      </div>
    `).join('');
  }

  // Quick-Send Rail Render
  if (railContainer) {
    const frequent = recipientsData.filter(r => r.isFavorite || r.isOnline);
    railContainer.innerHTML = `
      <div class="rail-item" onclick="openWalletModal('send')">
        <div class="rail-avatar add-new-rail">
          <span class="material-symbols-outlined">add</span>
        </div>
        <span>New Payee</span>
      </div>
    ` + frequent.map(item => `
      <div class="rail-item" onclick="quickSendTo('${item.name}', '${item.handle}')">
        <div class="rail-avatar">
          ${item.avatar}
          ${item.isOnline ? '<span class="online-indicator"></span>' : ''}
        </div>
        <span>${item.name.split(' ')[0]}</span>
      </div>
    `).join('');
  }
}

function toggleFavorite(id) {
  const recipient = recipientsData.find(r => r.id === id);
  if (recipient) {
    recipient.isFavorite = !recipient.isFavorite;
    renderRecipients();
  }
}

function quickSendTo(name, handle) {
  openWalletModal('send');
  setTimeout(() => {
    const recipientInput = document.querySelector('#walletModalContent input[type="text"]');
    if (recipientInput) {
      recipientInput.value = handle.includes('@') ? handle.split(' ')[0] : name;
      recipientInput.focus();
    }
  }, 50);
}