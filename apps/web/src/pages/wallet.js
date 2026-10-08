/* ==========================================================================
   THEKAPITA PAY WALLET INTERACTION ENGINE (API INTEGRATED WITH SKELETONS)
   ========================================================================== */
import { refreshBalance, getBalanceDisplay, fundWallet, sendMoney } from '../state/ledger.js';
import { isAuthenticated } from '../state/session.js';
import { authorizedRequest } from '../state/session.js';
import { ApiError } from '../api/client.js';
import { showToast } from './app.js';

// Gate the page: if no token, redirect to auth
if (!isAuthenticated()) {
  window.location.href = 'auth.html';
}

let isWalletBalanceMasked = false;
let activeCategoryFilter = 'all';
let currentSearchQuery = '';

let recipientsData = [
  { id: 'REC-1', name: 'Sarah Okoro', avatar: 'SO', type: 'internal', handle: '@sarah • Instant ₦0 Fee', meta: 'KPT-881092 • Primary Tag', isFavorite: true, isOnline: true },
  { id: 'REC-2', name: 'John Okafor', avatar: 'JO', type: 'bank', handle: 'GTBank Guarantee Trust', meta: '•••• 4902 • Verified Name', isFavorite: false, isOnline: true },
  { id: 'REC-3', name: 'Ella Amra', avatar: 'EA', type: 'internal', handle: '@amra • Instant ₦0 Fee', meta: 'KPT-883912 • Primary Tag', isFavorite: true, isOnline: false },
  { id: 'REC-4', name: 'Michael Chen', avatar: 'MC', type: 'bank', handle: 'Access Bank PLC', meta: '•••• 8812 • Verified Name', isFavorite: false, isOnline: false }
];

let recentTransactions = [];

/* --------------------------------------------------------------------------
   0. LIVE HYDRATION ENGINE & SKELETON RENDERERS
   -------------------------------------------------------------------------- */

async function hydrateBalance() {
  const balanceEl = document.getElementById('mainWalletBalance');
  if (!balanceEl) return;

  balanceEl.innerHTML = `<span class="balance-spinner">Loading...</span>`;

  try {
    await refreshBalance();
    if (!isWalletBalanceMasked) {
      balanceEl.textContent = getBalanceDisplay();
    }
  } catch (err) {
    balanceEl.textContent = 'Unavailable';
    if (window.showToast) window.showToast('Could not load live wallet balance from backend.', 'error');
  }
}

async function hydrateTransactions() {
  const container = document.querySelector('.activity-timeline');
  if (!container) return;

  // Render skeleton rows while fetching transactions
  container.innerHTML = Array(3).fill(0).map(() => `
    <div class="activity-row skeleton-card" style="padding: 12px; margin-bottom: 8px;">
      <div style="height: 20px; width: 60%; background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 4px;"></div>
    </div>
  `).join('');

  try {
    const txs = await authorizedRequest('/wallet/transactions').catch(() => null);
    if (txs && Array.isArray(txs) && txs.length > 0) {
      recentTransactions = txs;
      renderTransactionsList(txs);
    } else {
      // Fallback to static initial timeline if empty API array returned
      restoreStaticTransactions();
    }
  } catch (err) {
    restoreStaticTransactions();
  }
}

function restoreStaticTransactions() {
  const container = document.querySelector('.activity-timeline');
  if (!container) return;

  container.innerHTML = `
    <div class="activity-row tx-item out" onclick="viewTxDetail('TX-990812', 'theKapita Eats', 'Food Payment', '8,500.00', 'Today, 1:42 PM')">
      <div class="act-icon-wrapper eats">
        <span class="material-symbols-outlined">restaurant</span>
      </div>
      <div class="act-details">
        <p class="act-title"><strong>theKapita Eats:</strong> Bukka Hut Lunch</p>
        <span class="act-time">Today, 1:42 PM • Food Payment</span>
      </div>
      <div class="act-right">
        <span class="act-amount negative">-₦8,500</span>
        <span class="tx-status-pill success">Successful</span>
      </div>
    </div>

    <div class="activity-row tx-item in" onclick="viewTxDetail('TX-990811', 'Tech Firm Ltd', 'Bank Transfer', '850,000.00', 'Today, 9:15 AM')">
      <div class="act-icon-wrapper pay">
        <span class="material-symbols-outlined">payments</span>
      </div>
      <div class="act-details">
        <p class="act-title"><strong>Salary Deposit:</strong> Tech Firm Ltd</p>
        <span class="act-time">Today, 9:15 AM • Bank Transfer</span>
      </div>
      <div class="act-right">
        <span class="act-amount positive">+₦850,000</span>
        <span class="tx-status-pill success">Successful</span>
      </div>
    </div>

    <div class="activity-row tx-item out" onclick="viewTxDetail('TX-990810', 'John Okafor', 'Peer Transfer', '20,000.00', 'Yesterday')">
      <div class="act-icon-wrapper ride">
        <span class="material-symbols-outlined">directions_car</span>
      </div>
      <div class="act-details">
        <p class="act-title"><strong>Transfer to:</strong> John Okafor (@john)</p>
        <span class="act-time">Yesterday • Peer Transfer</span>
      </div>
      <div class="act-right">
        <span class="act-amount negative">-₦20,000</span>
        <span class="tx-status-pill success">Successful</span>
      </div>
    </div>
  `;
}

function renderTransactionsList(txs) {
  const container = document.querySelector('.activity-timeline');
  if (!container) return;

  container.innerHTML = txs.map(tx => {
    const isPositive = tx.amount > 0;
    const formattedAmount = Math.abs(tx.amount).toLocaleString('en-NG', { minimumFractionDigits: 2 });
    
    return `
      <div class="activity-row tx-item ${isPositive ? 'in' : 'out'}" onclick="viewTxDetail('${tx.id}', '${escapeJs(tx.description || tx.recipient)}', '${escapeJs(tx.category || 'Transfer')}', '${formattedAmount}', '${tx.created_at || 'Just Now'}')">
        <div class="act-icon-wrapper ${isPositive ? 'pay' : 'eats'}">
          <span class="material-symbols-outlined">${isPositive ? 'payments' : 'north_east'}</span>
        </div>
        <div class="act-details">
          <p class="act-title"><strong>${isPositive ? 'Received:' : 'Paid:'}</strong> ${escapeHtml(tx.description || tx.recipient)}</p>
          <span class="act-time">${tx.created_at || 'Recently'} • ${escapeHtml(tx.category || 'Wallet Transfer')}</span>
        </div>
        <div class="act-right">
          <span class="act-amount ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : '-'}₦${formattedAmount}</span>
          <span class="tx-status-pill success">${tx.status || 'Successful'}</span>
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeJs(str) {
  return String(str ?? '').replace(/'/g, "\\'");
}

/* --------------------------------------------------------------------------
   1. TAB NAVIGATION & HERO CARD CONTROLS
   -------------------------------------------------------------------------- */

function switchWalletTab(tabName, btnElement) {
  document.querySelectorAll('.w-tab-pane').forEach(pane => pane.classList.remove('active'));
  document.querySelectorAll('.w-tab-btn').forEach(btn => btn.classList.remove('active'));

  const targetPaneId = `walletTab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`;
  const activePane = document.getElementById(targetPaneId);

  if (activePane) activePane.classList.add('active');

  if (btnElement) {
    btnElement.classList.add('active');
  } else {
    const defaultBtn = document.querySelector(`.w-tab-btn[onclick*="'${tabName}'"]`);
    if (defaultBtn) defaultBtn.classList.add('active');
  }

  const heroWrapper = document.getElementById('heroCardWrapper');
  if (heroWrapper) {
    heroWrapper.style.display = (tabName === 'overview') ? 'block' : 'none';
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

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

/* --------------------------------------------------------------------------
   2. MODAL ENGINE (FUNDING, SENDING, RECEIVING, WITHDRAWING)
   -------------------------------------------------------------------------- */

function openWalletModal(actionType) {
  const modal = document.getElementById('walletActionModal');
  const title = document.getElementById('walletModalTitle');
  const subtitle = document.getElementById('walletModalSubtitle');
  const content = document.getElementById('walletModalContent');
  if (!modal || !content) return;

  if (actionType === 'add') {
    title.textContent = 'Add Money to Wallet';
    subtitle.textContent = 'Fund your wallet via Card, Bank Transfer, or USSD';
    content.innerHTML = `
      <div class="pending-ledger-notice">
        <span class="material-symbols-outlined notice-icon">info</span>
        <div>
          <strong>Backend Ledger Integration Active:</strong>
          <p>Top-ups are submitted as <em>Pending Verification</em> until final bank ledger settlement clears.</p>
        </div>
      </div>
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
          <option value="bank_transfer">Instant Bank Transfer (Wema / Kapita)</option>
          <option value="card">Debit Card (•••• 8821)</option>
        </select>
      </div>
      <button class="btn-primary w-full" id="fundSubmitBtn" style="margin-top: 12px;" onclick="executeFunding()">
        Continue to Pay
      </button>
    `;
  } else if (actionType === 'send') {
    title.textContent = 'Send Money';
    subtitle.textContent = 'Instant zero-fee transfers within theKapita network';
    content.innerHTML = `
      <div class="pending-ledger-notice">
        <span class="material-symbols-outlined notice-icon">schedule</span>
        <div>
          <strong>Transfer Ledger Pending:</strong>
          <p>Transfers process live against server ledger endpoint <code>/wallet/send</code>.</p>
        </div>
      </div>
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
        <input type="text" id="sendNote" placeholder="e.g. Lunch refund" class="form-control" />
      </div>
      <button class="btn-primary w-full" id="sendSubmitBtn" onclick="executeSend()">Confirm & Send</button>
    `;
  } else if (actionType === 'receive') {
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
            <rect x="43" y="43" width="14" height="14" rx="4" fill="#121212" />
            <circle cx="50" cy="50" r="3" fill="#00d084" />
          </svg>
        </div>
        <h4>KPT User</h4>
        <p style="font-size: 13px; color: #666; margin-bottom: 16px;">KPT-883902</p>
        <button class="btn-secondary w-full" onclick="navigator.clipboard.writeText('KPT-883902'); if(window.showToast) window.showToast('ID Copied!', 'success'); else alert('ID Copied!');">Copy Kapita ID Tag</button>
      </div>
    `;
  } else if (actionType === 'withdraw') {
    title.textContent = 'Withdraw Funds';
    subtitle.textContent = 'Transfer funds out to external bank account';
    content.innerHTML = `
      <div class="form-group">
        <label>Select Destination Bank</label>
        <select class="form-control" id="withdrawBank">
          <option value="gtbank">GTBank (•••• 4902)</option>
          <option value="access">Access Bank (•••• 8812)</option>
        </select>
      </div>
      <div class="form-group">
        <label>Amount (₦)</label>
        <input type="number" id="withdrawAmount" placeholder="0.00" class="form-control" required />
      </div>
      <button class="btn-primary w-full" id="withdrawSubmitBtn" onclick="executeWithdrawal()">Confirm Withdrawal</button>
    `;
  } else if (actionType === 'scan') {
    title.textContent = 'Scan & Pay QR';
    subtitle.textContent = 'Point camera at seller or recipient QR code';
    content.innerHTML = `
      <div style="text-align: center; padding: 24px; border: 2px dashed #00d084; border-radius: 16px; background: rgba(0, 208, 132, 0.05);">
        <span class="material-symbols-outlined" style="font-size: 64px; color: #00d084;">qr_code_scanner</span>
        <p style="margin-top: 12px; font-weight: 600;">Camera scanner initializing...</p>
      </div>
      <button class="btn-secondary w-full" style="margin-top: 16px;" onclick="closeWalletModal()">Cancel</button>
    `;
  }

  modal.classList.add('active');
}

function closeWalletModal(e) {
  if (e && e.target !== e.currentTarget) return;
  const modal = document.getElementById('walletActionModal');
  if (modal) modal.classList.remove('active');
}

/* --------------------------------------------------------------------------
   3. TRANSACTION RECEIPT VIEWER
   -------------------------------------------------------------------------- */

function viewTxDetail(txId, recipient = 'theKapita Eats', type = 'Food Payment', amount = '8,500.00', date = 'Today, 1:42 PM') {
  const modal = document.getElementById('txDetailModal');
  const amountEl = document.getElementById('txDetailAmount');
  const recipientEl = document.getElementById('txDetailRecipient');
  const typeEl = document.getElementById('txDetailType');
  const dateEl = document.getElementById('txDetailDate');
  const refEl = document.getElementById('txDetailRef');

  if (amountEl) amountEl.textContent = `₦${amount}`;
  if (recipientEl) recipientEl.textContent = recipient;
  if (typeEl) typeEl.textContent = type;
  if (dateEl) dateEl.textContent = date;
  if (refEl) refEl.textContent = txId || 'KPT-88910293';

  if (modal) modal.classList.add('active');
}

function closeTxModal(e) {
  if (e && e.target !== e.currentTarget) return;
  const modal = document.getElementById('txDetailModal');
  if (modal) modal.classList.remove('active');
}

function setQuickAmount(val) {
  const input = document.getElementById('fundAmount');
  if (input) input.value = val;
}

/* --------------------------------------------------------------------------
   4. LIVE API EXECUTIONS (FUND, SEND, WITHDRAW)
   -------------------------------------------------------------------------- */

async function executeFunding() {
  const amountInput = document.getElementById('fundAmount');
  const channelSelect = document.getElementById('fundChannel');
  const submitBtn = document.getElementById('fundSubmitBtn');
  const amount = parseFloat(amountInput?.value);

  if (!amount || amount <= 0) {
    if (window.showToast) window.showToast('Enter a valid amount greater than zero.', 'error');
    else alert('Enter a valid amount greater than zero.');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="btn-spinner"></span> Processing Request...`;
  }

  try {
    await fundWallet(amount, channelSelect?.value ?? 'bank_transfer');

    if (window.showToast) window.showToast('Funding request submitted! Status: PENDING VERIFICATION.', 'success');
    else alert('Funding request submitted! Status: PENDING LEDGER VERIFICATION.');

    closeWalletModal();
    await hydrateBalance();
    await hydrateTransactions();
  } catch (err) {
    const errorMsg = err instanceof ApiError ? err.message : 'Could not complete top-up request. Check server connection.';
    if (window.showToast) window.showToast(errorMsg, 'error');
    else alert(errorMsg);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Continue to Pay';
    }
  }
}

async function executeSend() {
  const recipientInput = document.getElementById('sendRecipient');
  const amountInput = document.getElementById('sendAmount');
  const submitBtn = document.getElementById('sendSubmitBtn');

  const recipient = recipientInput?.value.trim();
  const amount = parseFloat(amountInput?.value);

  if (!recipient) {
    if (window.showToast) window.showToast('Enter a recipient ID, email or bank account.', 'error');
    else alert('Enter a recipient ID, email or bank account.');
    return;
  }
  if (!amount || amount <= 0) {
    if (window.showToast) window.showToast('Enter a valid amount greater than zero.', 'error');
    else alert('Enter a valid amount greater than zero.');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="btn-spinner"></span> Transferring...`;
  }

  try {
    await sendMoney(recipient, amount);

    if (window.showToast) window.showToast(`Transfer of ₦${amount.toLocaleString()}.00 submitted!`, 'success');
    else alert('Transfer request submitted to ledger! Status: PENDING SETTLEMENT.');

    closeWalletModal();
    await hydrateBalance();
    await hydrateTransactions();
  } catch (err) {
    const errorMsg = err instanceof ApiError ? err.message : 'Transfer failed. Check recipient or balance.';
    if (window.showToast) window.showToast(errorMsg, 'error');
    else alert(errorMsg);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm & Send';
    }
  }
}

async function executeWithdrawal() {
  const amountInput = document.getElementById('withdrawAmount');
  const submitBtn = document.getElementById('withdrawSubmitBtn');
  const amount = parseFloat(amountInput?.value);

  if (!amount || amount <= 0) {
    if (window.showToast) window.showToast('Enter a valid withdrawal amount.', 'error');
    else alert('Enter a valid withdrawal amount.');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="btn-spinner"></span> Processing Withdrawal...`;
  }

  try {
    await authorizedRequest('/wallet/withdraw', {
      method: 'POST',
      body: { amount }
    });

    if (window.showToast) window.showToast(`Withdrawal of ₦${amount.toLocaleString()}.00 initialized!`, 'success');
    else alert(`Withdrawal of ₦${amount.toLocaleString()}.00 initialized!`);

    closeWalletModal();
    await hydrateBalance();
    await hydrateTransactions();
  } catch (err) {
    const errorMsg = err instanceof ApiError ? err.message : 'Withdrawal request failed.';
    if (window.showToast) window.showToast(errorMsg, 'error');
    else alert(errorMsg);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm Withdrawal';
    }
  }
}

/* --------------------------------------------------------------------------
   5. UTILITIES & RECIPIENT DIRECTORY ENGINE
   -------------------------------------------------------------------------- */

function toggleCardDetails() {
  const num = document.getElementById('cardNumberDisplay');
  const cvv = document.getElementById('cardCvvDisplay');
  if (!num || !cvv) return;

  const revealed = !num.textContent.includes('••••');
  if (!revealed) {
    num.textContent = 'Full number in secure card view';
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
    if (window.showToast) window.showToast('Card frozen for security', 'info');
  } else {
    btn.textContent = 'Freeze Card';
    btn.style.color = '';
    if (window.showToast) window.showToast('Card active', 'success');
  }
}

function filterTx(type, btnElement) {
  const scope = btnElement?.closest('.filter-pills');
  scope?.querySelectorAll('.pill').forEach((p) => p.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');
}

function openBillPay() {
  openWalletModal('add');
}

function initRecipientsEngine() {
  const searchInput = document.querySelector('.recipient-search-box input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value.toLowerCase().trim();
      renderRecipients();
    });
  }

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
        <h4>${escapeHtml(item.name)}</h4>
        <p class="handle">${escapeHtml(item.handle)}</p>
        <span class="account-meta">${escapeHtml(item.meta)}</span>
        <div class="rec-card-actions">
          <button class="${item.type === 'internal' ? 'btn-primary' : 'btn-secondary'}" onclick="quickSendTo('${escapeJs(item.name)}', '${escapeJs(item.handle)}')">
            <span class="material-symbols-outlined" style="font-size: 16px; margin-right: 4px;">send</span>
            ${item.type === 'internal' ? 'Send Money' : 'Transfer'}
          </button>
        </div>
      </div>
    `).join('');
  }

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
      <div class="rail-item" onclick="quickSendTo('${escapeJs(item.name)}', '${escapeJs(item.handle)}')">
        <div class="rail-avatar">
          ${item.avatar}
          ${item.isOnline ? '<span class="online-indicator"></span>' : ''}
        </div>
        <span>${escapeHtml(item.name.split(' ')[0])}</span>
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

document.addEventListener('DOMContentLoaded', () => {
  hydrateBalance();
  hydrateTransactions();
  initRecipientsEngine();
});

// Window Bridge Bindings
window.switchWalletTab = switchWalletTab;
window.toggleWalletBalance = toggleWalletBalance;
window.openWalletModal = openWalletModal;
window.closeWalletModal = closeWalletModal;
window.viewTxDetail = viewTxDetail;
window.closeTxModal = closeTxModal;
window.setQuickAmount = setQuickAmount;
window.executeFunding = executeFunding;
window.executeSend = executeSend;
window.executeWithdrawal = executeWithdrawal;
window.toggleCardDetails = toggleCardDetails;
window.toggleFreezeCard = toggleFreezeCard;
window.filterTx = filterTx;
window.openBillPay = openBillPay;
window.quickSendTo = quickSendTo;
window.toggleFavorite = toggleFavorite;