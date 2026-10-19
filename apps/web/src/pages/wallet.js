/* ==========================================
   THEKAPITA PAY WALLET INTERACTION ENGINE
   ========================================== */
import { refreshBalance, getBalance, getBalanceDisplay, fundWallet, sendMoney, loadTransactions, loadWalletAnalytics } from '../state/ledger.js';
import { isAuthenticated, getCurrentUser, hydrateProfile, authorizedRequest } from '../state/session.js';
import { formatCurrency } from '@thekapita/shared/currency';
import { renderKapitaQr } from '../ui/kapitaQr.js';
import { BrowserQRCodeReader } from '@zxing/browser';
import { ApiError } from '../api/client.js';
import { ENDPOINTS } from '@thekapita/shared/endpoints';
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

let recipientsData = [];

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
    renderWalletLimits();
  } catch (err) {
    balanceEl.textContent = 'Unavailable';
    if (window.showToast) window.showToast('Could not load live wallet balance from backend.', 'error');
  }
}

function renderWalletLimits() {
  const balance = getBalance();
  const daily = document.getElementById('dailyTransferLimit');
  const monthly = document.getElementById('monthlyTransferLimit');
  if (daily) daily.textContent = formatCurrency(balance.dailyLimit ?? 0);
  if (monthly) monthly.textContent = formatCurrency(balance.monthlyLimit ?? 0);
  const paymentBalance = document.getElementById('walletPaymentBalance');
  if (paymentBalance) paymentBalance.textContent = getBalanceDisplay();
}

async function hydrateWalletAnalytics() {
  for (const id of ['walletAnalyticsInflow', 'walletAnalyticsOutflow', 'walletAnalyticsNet', 'overviewWalletInflow', 'overviewWalletOutflow']) {
    const element = document.getElementById(id);
    if (element) element.textContent = 'Loading';
  }
  document.getElementById('walletAnalyticsChart')?.replaceChildren();
  document.querySelector('.service-analytics-section')?.remove();

  try {
    renderWalletAnalytics(await loadWalletAnalytics());
  } catch {
    const chart = document.getElementById('walletAnalyticsChart');
    if (chart) chart.textContent = 'Could not load wallet analytics.';
  }
}

function renderWalletAnalytics(analytics) {
  const inflow = Number(analytics.current_month_inflow);
  const outflow = Number(analytics.current_month_outflow);
  const net = inflow - outflow;
  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  setText('walletAnalyticsInflow', formatCurrency(inflow));
  setText('walletAnalyticsOutflow', formatCurrency(outflow));
  setText('walletAnalyticsNet', formatCurrency(net));
  setText('overviewWalletInflow', formatCurrency(inflow));
  setText('overviewWalletOutflow', formatCurrency(outflow));
  const total = inflow + outflow;
  const inflowBar = document.getElementById('overviewInflowBar');
  const outflowBar = document.getElementById('overviewOutflowBar');
  if (inflowBar) inflowBar.style.width = `${total ? inflow / total * 100 : 0}%`;
  if (outflowBar) outflowBar.style.width = `${total ? outflow / total * 100 : 0}%`;

  const chart = document.getElementById('walletAnalyticsChart');
  if (!chart) return;
  const months = analytics.months || [];
  const maxValue = Math.max(1, ...months.flatMap((item) => [Number(item.inflow), Number(item.outflow)]));
  chart.replaceChildren(...months.map((item) => {
    const group = document.createElement('div');
    group.className = 'bar-group';
    const wrapper = document.createElement('div');
    wrapper.className = 'bar-wrapper';
    for (const [kind, amount] of [['inflow', Number(item.inflow)], ['outflow', Number(item.outflow)]]) {
      const bar = document.createElement('div');
      bar.className = `bar ${kind}`;
      bar.style.height = `${amount ? Math.max(2, amount / maxValue * 100) : 0}%`;
      bar.title = `${kind === 'inflow' ? 'Inflow' : 'Outflow'}: ${formatCurrency(amount)}`;
      wrapper.appendChild(bar);
    }
    const label = document.createElement('span');
    label.className = 'bar-label';
    label.textContent = new Date(`${item.month}-01T00:00:00`).toLocaleDateString('en', { month: 'short' });
    group.append(wrapper, label);
    return group;
  }));
}

async function hydrateWalletIdentity() {
  const idEl = document.getElementById('walletKapitaId');
  if (!idEl) return;

  try {
    const user = getCurrentUser()?.kapita_id ? getCurrentUser() : await hydrateProfile();
    idEl.textContent = user?.kapita_id || '—';
  } catch {
    idEl.textContent = '—';
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
      <form class="wallet-modal-form" onsubmit="executeFunding(event)">
        <div class="form-group">
          <label for="fundAmount">Amount (₦)</label>
          <input type="number" id="fundAmount" name="amount" placeholder="0.00" class="form-control" min="0.01" step="0.01" inputmode="decimal" required />
        </div>
        <div class="wallet-quick-amounts" aria-label="Quick amounts">
          <button type="button" class="btn-sm" onclick="setQuickAmount(5000)">₦5,000</button>
          <button type="button" class="btn-sm" onclick="setQuickAmount(10000)">₦10,000</button>
          <button type="button" class="btn-sm" onclick="setQuickAmount(20000)">₦20,000</button>
        </div>
        <div class="form-group">
          <label for="fundChannel">Payment Method</label>
          <select class="form-control" id="fundChannel" name="channel">
            <option value="bank_transfer">Bank transfer</option>
            <option value="card">Debit card</option>
          </select>
        </div>
        <button type="submit" class="btn-primary w-full" id="fundSubmitBtn">Continue to Pay</button>
      </form>
    `;
  } else if (actionType === 'beneficiary') {
    title.textContent = 'Add Beneficiary';
    subtitle.textContent = 'Save a Kapita account for a future transfer';
    content.innerHTML = `
      <form class="wallet-modal-form" id="beneficiaryForm" onsubmit="saveBeneficiary(event)">
        <div class="form-group">
          <label for="beneficiaryName">Beneficiary name</label>
          <input type="text" id="beneficiaryName" name="name" class="form-control" placeholder="Enter a name to recognize them" maxlength="80" autocomplete="name" required />
        </div>
        <div class="form-group">
          <label for="beneficiaryRecipient">Kapita ID or handle</label>
          <input type="text" id="beneficiaryRecipient" name="recipient" class="form-control" placeholder="KPT-123ABC or @handle" autocomplete="off" required />
          <p class="wallet-form-help">We’ll verify the account and save this ID or handle for future transfers. No amount is needed.</p>
        </div>
        <button type="submit" class="btn-primary w-full" id="saveBeneficiaryBtn">
          <span class="material-symbols-outlined" aria-hidden="true">person_add</span>
          Save Beneficiary
        </button>
      </form>
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
      <form class="wallet-modal-form" onsubmit="executeSend(event)">
        <div class="form-group">
          <label for="sendRecipient">Recipient</label>
          <input type="text" id="sendRecipient" name="recipient" placeholder="Kapita ID, @handle, or email" class="form-control" autocomplete="off" required />
        </div>
        <div class="form-group">
          <label for="sendAmount">Amount (₦)</label>
          <input type="number" id="sendAmount" name="amount" placeholder="0.00" class="form-control" min="0.01" step="0.01" inputmode="decimal" required />
        </div>
        <div class="form-group">
          <label for="sendNote">Note <span class="wallet-form-optional">Optional</span></label>
          <input type="text" id="sendNote" name="note" placeholder="What’s this transfer for?" class="form-control" />
        </div>
        <button type="submit" class="btn-primary w-full" id="sendSubmitBtn">Confirm &amp; Send</button>
      </form>
    `;
  } else if (actionType === 'receive') {
    title.textContent = 'Receive Money';
    subtitle.textContent = 'Scan QR code or share your universal Kapita ID';
    content.innerHTML = `
      <div class="text-center">
        <div style="background: #ffffff; padding: 16px; border-radius: 20px; width: 180px; margin: 0 auto 16px; border: 1px solid #e5e7eb; box-shadow: 0 10px 25px rgba(0,0,0,0.05);">
          <canvas class="qr-svg" data-kapita-qr aria-label="Kapita ID QR code"></canvas>
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
      <p>Bank withdrawals are unavailable until a payout provider and verified bank account are connected.</p>
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
  set('txDetailType', tx.status === 'pending' ? 'Wallet funding pending' : tx.kind === 'credit' ? 'Money received' : 'Money sent');
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

async function executeFunding(event) {
  event?.preventDefault();
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

    if (window.showToast) window.showToast('Funding request recorded. Funds will appear after provider confirmation.', 'info');
    else alert('Funding request recorded. Funds will appear after provider confirmation.');

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

async function executeSend(event) {
  event?.preventDefault();
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
  if (window.showToast) window.showToast('Bank withdrawals are unavailable until a payout provider and verified bank account are connected.', 'info');
}

async function saveBeneficiary(event) {
  event?.preventDefault();
  const nameInput = document.getElementById('beneficiaryName');
  const recipientInput = document.getElementById('beneficiaryRecipient');
  const submitBtn = document.getElementById('saveBeneficiaryBtn');
  const name = nameInput?.value.trim();
  const recipient = recipientInput?.value.trim();
  if (!name || !recipient) return;

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Checking account...';
  }

  try {
    const beneficiary = await authorizedRequest(ENDPOINTS.wallet.beneficiaries, {
      method: 'POST',
      body: { name, recipient },
    });
    if (window.showToast) window.showToast(`${beneficiary.full_name} saved as a beneficiary.`, 'success');
    closeWalletModal();
    await hydrateBeneficiaries();
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not save this beneficiary.';
    if (window.showToast) window.showToast(message, 'error');
    else alert(message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">person_add</span> Save Beneficiary';
    }
  }
}

async function removeBeneficiary(beneficiaryId) {
  try {
    await authorizedRequest(`${ENDPOINTS.wallet.beneficiaries}/${beneficiaryId}`, { method: 'DELETE' });
    recipientsData = recipientsData.filter((item) => item.id !== beneficiaryId);
    renderRecipients();
    if (window.showToast) window.showToast('Beneficiary removed.', 'success');
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not remove this beneficiary.';
    if (window.showToast) window.showToast(message, 'error');
    else alert(message);
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
    status.className = `tx-status-pill ${tx.status === 'pending' ? 'pending' : 'success'}`;
    status.textContent = tx.status === 'pending' ? 'Pending' : 'Successful';
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

async function hydrateBeneficiaries() {
  try {
    const beneficiaries = await authorizedRequest(ENDPOINTS.wallet.beneficiaries);
    recipientsData = beneficiaries.map((item) => ({
      ...item,
      avatar: item.full_name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
    }));
  } catch (err) {
    recipientsData = [];
    if (window.showToast) window.showToast('Could not load your saved beneficiaries.', 'error');
  }
  renderRecipients();
}

function copyMyKapitaId() {
  const id = getCurrentUser()?.kapita_id;
  if (!id) return;
  navigator.clipboard.writeText(id);
  alert('ID Copied!');
}

function openBillPay() {
  if (window.showToast) window.showToast('Bill payments are unavailable until a biller provider is connected.', 'info');
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

      activeCategoryFilter = idx === 0 ? 'all' : 'internal';

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
    const matchesCategory = activeCategoryFilter === 'all' || item.type === activeCategoryFilter;

    const matchesSearch =
      item.full_name.toLowerCase().includes(currentSearchQuery) ||
      item.handle.toLowerCase().includes(currentSearchQuery) ||
      item.kapita_id.toLowerCase().includes(currentSearchQuery);

    return matchesCategory && matchesSearch;
  });

  if (filtered.length === 0) {
    gridContainer.innerHTML = `
      <div class="recipient-empty-state">
        <span class="material-symbols-outlined" aria-hidden="true">person_search</span>
        <p>No saved beneficiaries yet.</p>
        <button type="button" class="btn-primary" onclick="openWalletModal('beneficiary')">Add Beneficiary</button>
      </div>
    `;
  } else {
    gridContainer.innerHTML = filtered.map(item => `
      <article class="recipient-card" id="card-${item.id}">
        <div class="rec-card-top">
          <span class="network-badge internal">
            <span class="material-symbols-outlined" aria-hidden="true">bolt</span>
            Kapita Network
          </span>
        </div>
        <div class="rec-avatar-lg">
          ${item.avatar}
          <span class="badge-dot kapita-dot" aria-hidden="true"></span>
        </div>
        <h3>${escapeHtml(item.full_name)}</h3>
        <p class="handle">${escapeHtml(item.handle)}</p>
        <span class="account-meta">${escapeHtml(item.kapita_id)}</span>
        <div class="rec-card-actions">
          <button type="button" class="btn-primary" onclick="quickSendTo('${escapeJs(item.handle)}')">
            <span class="material-symbols-outlined" aria-hidden="true">send</span>
            Send Money
          </button>
          <button type="button" class="recipient-remove-btn" onclick="removeBeneficiary(${Number(item.id)})" aria-label="Remove ${escapeHtml(item.full_name)}">
            <span class="material-symbols-outlined" aria-hidden="true">delete</span>
          </button>
        </div>
      </article>
    `).join('');
  }

  if (railContainer) {
    railContainer.innerHTML = `
      <button type="button" class="rail-item" onclick="openWalletModal('beneficiary')">
        <div class="rail-avatar add-new-rail">
          <span class="material-symbols-outlined">add</span>
        </div>
        <span>New Payee</span>
      </button>
    ` + recipientsData.map(item => `
      <button type="button" class="rail-item" onclick="quickSendTo('${escapeJs(item.handle)}')">
        <div class="rail-avatar">
          ${item.avatar}
        </div>
        <span>${escapeHtml(item.full_name.split(' ')[0])}</span>
      </button>
    `).join('');
  }
}

function quickSendTo(handle) {
  openWalletModal('send');
  setTimeout(() => {
    const recipientInput = document.querySelector('#sendRecipient');
    if (recipientInput) {
      recipientInput.value = handle;
      recipientInput.focus();
    }
  }, 50);
}

document.addEventListener('DOMContentLoaded', () => {
  hydrateBalance();
  hydrateTransactions();
  hydrateWalletIdentity();
  hydrateWalletAnalytics();
  hydrateBeneficiaries();
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
window.saveBeneficiary = saveBeneficiary;
window.removeBeneficiary = removeBeneficiary;
window.executeWithdrawal = executeWithdrawal;
window.toggleCardDetails = toggleCardDetails;
window.toggleFreezeCard = toggleFreezeCard;
window.filterTx = filterTx;
window.openBillPay = openBillPay;
window.quickSendTo = quickSendTo;
window.copyMyKapitaId = copyMyKapitaId;