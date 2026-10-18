/* ==========================================
   THEKAPITA PAY WALLET INTERACTION ENGINE
   ========================================== */
import { refreshBalance, getBalanceDisplay, fundWallet, sendMoney, loadTransactions } from '../state/ledger.js';
import { isAuthenticated, getCurrentUser, hydrateProfile, authorizedRequest } from '../state/session.js';
import { formatCurrency } from '@thekapita/shared/currency';
import { renderKapitaQr } from '../ui/kapitaQr.js';
import { BrowserQRCodeReader } from '@zxing/browser';
import { ApiError } from '../api/client.js';
import { showToast } from './app.js';

// Gate the page: if no token, redirect to auth
if (!isAuthenticated()) {
  window.location.href = 'auth.html';
}

let isWalletBalanceMasked = false;
let activeCategoryFilter = 'all';
let currentSearchQuery = '';
let qrScannerControls = null;
let qrReader = null;

let recipientsData = [
  { id: 'REC-1', name: 'Sarah Okoro', avatar: 'SO', type: 'internal', handle: '@sarah • Instant ₦0 Fee', meta: 'KPT-881092 • Primary Tag', isFavorite: true, isOnline: true },
  { id: 'REC-2', name: 'John Okafor', avatar: 'JO', type: 'bank', handle: 'GTBank Guarantee Trust', meta: '•••• 4902 • Verified Name', isFavorite: false, isOnline: true },
  { id: 'REC-3', name: 'Ella Amra', avatar: 'EA', type: 'internal', handle: '@amra • Instant ₦0 Fee', meta: 'KPT-883912 • Primary Tag', isFavorite: true, isOnline: false },
  { id: 'REC-4', name: 'Michael Chen', avatar: 'MC', type: 'bank', handle: 'Access Bank PLC', meta: '•••• 8812 • Verified Name', isFavorite: false, isOnline: false }
];

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

function openWalletModal(actionType, recipientId = '') {
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
        <label>Kapita ID, @handle or Email</label>
        <input type="text" id="sendRecipient" placeholder="e.g. @sarah, KPT-881029 or sarah@mail.com" class="form-control" required />
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
          <canvas data-kapita-qr aria-label="Kapita ID QR code" style="width: 100%; height: auto; display: block;"></canvas>
        </div>
        <h4>${escapeHtml(getCurrentUser()?.full_name)}</h4>
        <p style="font-size: 13px; color: #666; margin-bottom: 16px;">${escapeHtml(getCurrentUser()?.handle ? '@' + getCurrentUser().handle + ' • ' : '')}${escapeHtml(getCurrentUser()?.kapita_id)}</p>
        <button class="btn-secondary w-full" onclick="copyMyKapitaId()">Copy Kapita ID Tag</button>
      </div>
    `;
    const qrCanvas = content.querySelector('[data-kapita-qr]');
    const user = getCurrentUser();
    if (user?.kapita_id) {
      renderKapitaQr(qrCanvas, user.kapita_id).catch(() => {
        if (window.showToast) window.showToast('Could not create your Kapita ID QR code.', 'error');
      });
    } else {
      hydrateProfile()
        .then((profile) => renderKapitaQr(qrCanvas, profile?.kapita_id))
        .catch(() => {
          if (window.showToast) window.showToast('Could not load your Kapita ID.', 'error');
        });
    }
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
    subtitle.textContent = 'Scan a Kapita ID to start a transfer';
    content.innerHTML = `
      <div style="text-align: center;">
        <video id="kapitaQrVideo" playsinline style="width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 12px; background: #111;"></video>
        <p id="kapitaQrStatus" role="status" aria-live="polite" style="margin: 12px 0 0;">Starting camera...</p>
      </div>
      <button class="btn-secondary w-full" style="margin-top: 16px;" onclick="closeWalletModal()">Cancel</button>
    `;
  }

  modal.classList.add('active');
  if (actionType === 'send' && recipientId) {
    const recipientInput = content.querySelector('#sendRecipient');
    if (recipientInput) {
      recipientInput.value = recipientId;
      content.querySelector('#sendAmount')?.focus();
    }
  }
  if (actionType === 'scan') startKapitaQrScanner();
}

function closeWalletModal(e) {
  if (e && e.target !== e.currentTarget) return;
  qrScannerControls?.stop();
  qrScannerControls = null;
  const modal = document.getElementById('walletActionModal');
  if (modal) modal.classList.remove('active');
}

async function startKapitaQrScanner() {
  const video = document.getElementById('kapitaQrVideo');
  const status = document.getElementById('kapitaQrStatus');
  if (!video || !status) return;

  qrReader ||= new BrowserQRCodeReader();
  try {
    qrScannerControls = await qrReader.decodeFromVideoDevice(undefined, video, (result, _error, controls) => {
      if (!result) return;

      const recipientId = result.getText().trim();
      if (!/^KPT-[A-F0-9]{6}$/i.test(recipientId)) {
        status.textContent = 'This QR code is not a valid Kapita ID. Keep scanning or cancel.';
        return;
      }

      controls.stop();
      qrScannerControls = null;
      closeWalletModal();
      openWalletModal('send', recipientId);
    });
  } catch (error) {
    status.textContent = error.name === 'NotAllowedError'
      ? 'Camera access is blocked. Allow camera access in your browser and try again.'
      : 'Could not start the camera. Use a secure connection and check that a camera is available.';
  }
}

/* 4. Transaction Detail Viewer */
function viewTxDetail(txId) {
  const tx = transactions.find((t) => t.id === txId);
  const modal = document.getElementById('txDetailModal');
  if (!tx || !modal) return;
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set('txDetailAmount', formatCurrency(tx.amount));
  set('txDetailRecipient', tx.counterparty);
  set('txDetailType', tx.kind === 'credit' ? 'Money received' : 'Money sent');
  set('txDetailDate', formatTxDate(tx.created_at));
  set('txDetailRef', tx.id);
  modal.classList.add('active');
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
    document.getElementById('mainWalletBalance').textContent = getBalanceDisplay();
    hydrateTransactions();
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
    alert('Enter a Kapita ID, @handle or email.');
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
    document.getElementById('mainWalletBalance').textContent = getBalanceDisplay();
    hydrateTransactions();
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
  txFilter = type;
  renderTransactions();
}

/* ---- Transactions (GET /wallet/transactions) ---- */
let transactions = [];
let txFilter = 'all';

function formatTxDate(iso) {
  return new Date(iso).toLocaleString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function renderTransactions() {
  const list = document.querySelector('.activity-timeline');
  if (!list) return;
  list.replaceChildren();
  const rows = transactions.filter(
    (t) => txFilter === 'all' || (txFilter === 'in' ? t.kind === 'credit' : t.kind === 'debit'),
  );
  if (rows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'act-time';
    empty.style.padding = '16px';
    empty.textContent = 'No transactions yet.';
    list.appendChild(empty);
    return;
  }
  for (const tx of rows) {
    const credit = tx.kind === 'credit';
    const row = document.createElement('div');
    row.className = `activity-row tx-item ${credit ? 'in' : 'out'}`;
    row.addEventListener('click', () => viewTxDetail(tx.id));

    const iconWrap = document.createElement('div');
    iconWrap.className = 'act-icon-wrapper';
    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.textContent = credit ? 'south_west' : 'north_east';
    iconWrap.appendChild(icon);

    const details = document.createElement('div');
    details.className = 'act-details';
    const title = document.createElement('p');
    title.className = 'act-title';
    const strong = document.createElement('strong');
    strong.textContent = credit ? 'Received from ' : 'Sent to ';
    title.append(strong, document.createTextNode(tx.counterparty));
    const time = document.createElement('span');
    time.className = 'act-time';
    time.textContent = formatTxDate(tx.created_at);
    details.append(title, time);

    const right = document.createElement('div');
    right.className = 'act-right';
    const amount = document.createElement('span');
    amount.className = `act-amount ${credit ? 'positive' : 'negative'}`;
    amount.textContent = `${credit ? '+' : '-'}${formatCurrency(tx.amount)}`;
    const status = document.createElement('span');
    status.className = 'tx-status-pill success';
    status.textContent = 'Successful';
    right.append(amount, status);

    row.append(iconWrap, details, right);
    list.appendChild(row);
  }
}

async function hydrateTransactions() {
  const list = document.querySelector('.activity-timeline');
  if (list) {
    const skeleton = document.createElement('div');
    skeleton.className = 'activity-row skeleton-card';
    skeleton.style.cssText = 'height:48px;margin-bottom:8px;background:#f1f5f9;border-radius:8px;';
    list.replaceChildren(skeleton);
  }
  try {
    transactions = await loadTransactions();
  } catch (err) {
    transactions = [];
    if (window.showToast) window.showToast('Could not load your transactions.', 'error');
  }
  renderTransactions();
}

function copyMyKapitaId() {
  const id = getCurrentUser()?.kapita_id;
  if (!id) return;
  navigator.clipboard.writeText(id);
  alert('ID Copied!');
}

function openBillPay() {
  openWalletModal('add');
}

document.addEventListener('DOMContentLoaded', () => {
  hydrateBalance();
  hydrateTransactions();
  if (!getCurrentUser()) hydrateProfile().catch(() => {});
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
window.copyMyKapitaId = copyMyKapitaId;
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