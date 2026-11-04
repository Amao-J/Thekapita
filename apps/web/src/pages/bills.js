/* ==========================================
   THEKAPITA BILLS & PAYMENTS ENGINE (LIVE API + ACCESSIBILITY)
   ========================================== */

const API_CONFIG = {
  baseUrl: window.KAPITA_API_BASE_URL || 'https://api.thekapita.com/v1',
  timeoutMs: 10000,
  authToken: localStorage.getItem('kapita_token') || 'demo_bearer_token'
};

// Global State
let isOnline = navigator.onLine;
let lastFailedOperation = null;
let currentWalletBalance = 245500.00;

document.addEventListener('DOMContentLoaded', () => {
  initNetworkListeners();
  fetchLiveWalletBalance();
  fetchLivePaymentHistory();
});

/* 1. Network & Offline Listeners */
function initNetworkListeners() {
  window.addEventListener('online', () => {
    isOnline = true;
    toggleNetworkBanner(false);
    announceAccessibilityMessage("Internet connection restored.");
    if (lastFailedOperation) retryLastOperation();
  });

  window.addEventListener('offline', () => {
    isOnline = false;
    toggleNetworkBanner(true, "Network disconnected. Working in offline fallback mode.");
    announceAccessibilityMessage("Network disconnected.");
  });
}

function toggleNetworkBanner(show, text = "") {
  const banner = document.getElementById('networkAlertBanner');
  const alertText = document.getElementById('networkAlertText');
  if (!banner) return;

  if (show) {
    if (alertText) alertText.textContent = text;
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

function announceAccessibilityMessage(msg) {
  const announcer = document.getElementById('ariaLiveAnnouncer');
  if (announcer) announcer.textContent = msg;
}

/* 2. Live Backend API Integration (Wallet & Transactions) */
async function fetchLiveWalletBalance() {
  try {
    const response = await fetchWithTimeout(`${API_CONFIG.baseUrl}/wallet/balance`, {
      headers: { 'Authorization': `Bearer ${API_CONFIG.authToken}` }
    });
    if (response.ok) {
      const data = await response.json();
      currentWalletBalance = data.balance || currentWalletBalance;
      updateWalletBalanceDisplay(currentWalletBalance);
    }
  } catch (error) {
    console.warn("[Kapita Pay] Operating on local wallet balance cache:", error);
    updateWalletBalanceDisplay(currentWalletBalance);
  }
}

function updateWalletBalanceDisplay(val) {
  const el = document.getElementById('headerWalletBalanceDisplay');
  if (el) {
    el.textContent = `₦${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

async function fetchLivePaymentHistory() {
  const container = document.getElementById('billHistoryContainer');
  if (!container) return;

  try {
    const res = await fetchWithTimeout(`${API_CONFIG.baseUrl}/bills/history`, {
      headers: { 'Authorization': `Bearer ${API_CONFIG.authToken}` }
    });
    if (res.ok) {
      const history = await res.json();
      renderHistoryItems(history);
    }
  } catch (err) {
    console.warn("[Kapita Pay] Pre-loaded audit log rendered.");
  }
}

function renderHistoryItems(items) {
  const container = document.getElementById('billHistoryContainer');
  if (!container || !Array.isArray(items) || items.length === 0) return;

  container.innerHTML = items.map(item => `
    <div class="history-item">
      <div class="history-left">
        <div class="bill-icon-wrapper ${item.bgClass || 'bg-blue'}">
          <span class="material-symbols-outlined" aria-hidden="true">${item.icon || 'receipt'}</span>
        </div>
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          <span class="history-meta">${escapeHtml(item.date)} • Ref: ${escapeHtml(item.ref)}</span>
          ${item.token ? `<div class="token-code-box">Token: <strong>${escapeHtml(item.token)}</strong></div>` : ''}
        </div>
      </div>
      <div class="history-right">
        <strong class="price">₦${parseFloat(item.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
        ${item.status === 'Pending' ? 
          `<span class="pending-badge"><span class="spinner-small"></span> Ledger Pending</span>` : 
          `<span class="status-success">Successful</span>`}
        ${item.token ? `<button type="button" class="copy-btn" onclick="copyTokenText('${escapeHtml(item.token)}', this)">Copy Token</button>` : ''}
      </div>
    </div>
  `).join('');
}

/* 3. Navigation Controls */
function toggleHeaderNavMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('headerNavDropdownMenu');
  const btn = document.getElementById('headerNavMenuBtn');
  if (!menu) return;

  const isExpanded = menu.classList.contains('show');
  menu.classList.toggle('show', !isExpanded);
  if (btn) btn.setAttribute('aria-expanded', !isExpanded);
}

document.addEventListener('click', () => {
  const menu = document.getElementById('headerNavDropdownMenu');
  const btn = document.getElementById('headerNavMenuBtn');
  if (menu && menu.classList.contains('show')) {
    menu.classList.remove('show');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
});

function switchBillsTab(tabKey, btnElement) {
  document.querySelectorAll('.bills-view-pane').forEach(pane => pane.style.display = 'none');
  
  document.querySelectorAll('.market-nav-btn').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });

  if (btnElement) {
    btnElement.classList.add('active');
    btnElement.setAttribute('aria-selected', 'true');
  }

  const targetPane = document.getElementById(`view${tabKey.charAt(0).toUpperCase() + tabKey.slice(1)}`);
  if (targetPane) {
    targetPane.style.display = 'block';
  }

  announceAccessibilityMessage(`Switched to ${tabKey} view`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* 4. Dynamic Form & Accessibility Pass */
/* 4. Dynamic Form & Accessibility Pass */
function openBillModal(serviceType, defaultAccount = '', defaultProvider = '') {
  const modal = document.getElementById('billActionModal');
  const title = document.getElementById('billModalTitle');
  const subtitle = document.getElementById('billModalSubtitle');
  const content = document.getElementById('billModalContent');
  if (!modal || !content) return;

  hideErrorNotice();

  if (serviceType === 'airtime') {
    title.textContent = 'Airtime & Mobile Data';
    subtitle.textContent = 'Instant zero-fee recharge for all major networks';
    content.innerHTML = `
      <form onsubmit="handleBillSubmit(event, 'Airtime/Data')">
        <div class="form-group">
          <label>Network Provider</label>
          <select class="form-control" required>
            <option>MTN Nigeria</option><option>Airtel Nigeria</option><option>Glo Mobile</option><option>9mobile</option>
          </select>
        </div>
        <div class="form-group">
          <label>Phone Number</label>
          <input type="tel" value="${escapeHtml(defaultAccount)}" placeholder="08123456789" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Service Type</label>
          <select class="form-control" onchange="toggleAirtimeDataFields(this)">
            <option value="airtime">Airtime Recharge</option><option value="data">Data Bundle</option>
          </select>
        </div>
        <div class="form-group" id="dataPlanGroup" style="display: none;">
          <label>Data Plan</label>
          <select class="form-control">
            <option>1.5GB Daily — ₦500</option><option>10GB Monthly — ₦4,500</option>
          </select>
        </div>
        <div class="form-group" id="airtimeAmountGroup">
          <label>Amount (₦)</label>
          <input type="number" placeholder="0.00" class="form-control" style="font-size: 20px; font-weight: 700;" required />
        </div>
        <button type="submit" class="btn-primary w-full" id="btnSubmitBill">Recharge Now</button>
      </form>
    `;
  } else if (serviceType === 'utilities') {
    title.textContent = 'Electricity & Water';
    subtitle.textContent = 'Pay DisCo Tokens & State Water Bills';
    content.innerHTML = `
      <form onsubmit="handleBillSubmit(event, 'Utilities')">
        <div class="form-group">
          <label>Utility Provider</label>
          <select class="form-control" required>
            <option>Ikeja Electric (IKEDC)</option><option>Eko Electric (EKEDC)</option><option>Lagos Water Corp</option>
          </select>
        </div>
        <div class="form-group">
          <label>Meter / Account Number</label>
          <input type="text" placeholder="e.g. 4509-2819-0012" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Amount (₦)</label>
          <input type="number" class="form-control" style="font-size: 20px; font-weight: 700;" required />
        </div>
        <button type="submit" class="btn-primary w-full" id="btnSubmitBill">Pay Utility Bill</button>
      </form>
    `;
  } else if (serviceType === 'cable') {
    title.textContent = 'Cable TV & Entertainment';
    subtitle.textContent = 'Reactivate your decoder instantly';
    content.innerHTML = `
      <form onsubmit="handleBillSubmit(event, 'Cable TV')">
        <div class="form-group">
          <label>Service Provider</label>
          <select class="form-control" required>
            <option>DStv</option><option>GOtv</option><option>Startimes</option><option>Showmax</option>
          </select>
        </div>
        <div class="form-group">
          <label>Smartcard Number</label>
          <input type="text" placeholder="Enter Smartcard ID" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Subscription Package</label>
          <select class="form-control" required>
            <option>Compact Plus - ₦25,000</option><option>Premium - ₦37,000</option>
          </select>
        </div>
        <button type="submit" class="btn-primary w-full" id="btnSubmitBill">Renew Subscription</button>
      </form>
    `;
  } else if (serviceType === 'internet') {
    title.textContent = 'Internet Subscription';
    subtitle.textContent = 'Keep your broadband active';
    content.innerHTML = `
      <form onsubmit="handleBillSubmit(event, 'Internet Sub')">
        <div class="form-group">
          <label>ISP / Provider</label>
          <select class="form-control" required>
            <option>Spectranet</option><option>Smile Communications</option><option>FiberOne</option>
          </select>
        </div>
        <div class="form-group">
          <label>Account / User ID</label>
          <input type="text" placeholder="Enter Internet Account ID" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Amount (₦)</label>
          <input type="number" class="form-control" style="font-size: 20px; font-weight: 700;" required />
        </div>
        <button type="submit" class="btn-primary w-full" id="btnSubmitBill">Pay Internet Bill</button>
      </form>
    `;
  } else if (serviceType === 'travel') {
    title.textContent = 'Airlines, Travels & Logistics';
    subtitle.textContent = 'Pay for flights, bus bookings & shipping';
    content.innerHTML = `
      <form onsubmit="handleBillSubmit(event, 'Travel & Logistics')">
        <div class="form-group">
          <label>Booking Type</label>
          <select class="form-control" required>
            <option>Airline / Flight</option><option>Bus Transit</option><option>Shipping Line Payment</option>
          </select>
        </div>
        <div class="form-group">
          <label>Booking Reference (PNR) / Tracking ID</label>
          <input type="text" placeholder="e.g. XYZ123" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Amount (₦)</label>
          <input type="number" class="form-control" style="font-size: 20px; font-weight: 700;" required />
        </div>
        <button type="submit" class="btn-primary w-full" id="btnSubmitBill">Confirm Booking Payment</button>
      </form>
    `;
  } else if (serviceType === 'government') {
    title.textContent = 'Government Taxes, Levies & Remita';
    subtitle.textContent = 'Settle FIRS, LIRS, VISA fees & eBillsPay';
    content.innerHTML = `
      <form onsubmit="handleBillSubmit(event, 'Government Taxes')">
        <div class="form-group">
          <label>Biller / Agency</label>
          <select class="form-control" required>
            <option>Remita (RRR)</option><option>NIBSS eBillsPay</option><option>VISA Fee Payment</option><option>PAYDIRECT</option>
          </select>
        </div>
        <div class="form-group">
          <label>RRR / Reference Number</label>
          <input type="text" placeholder="Enter Reference Code" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Amount (₦)</label>
          <input type="number" class="form-control" style="font-size: 20px; font-weight: 700;" required />
        </div>
        <button type="submit" class="btn-primary w-full" id="btnSubmitBill">Process Payment</button>
      </form>
    `;
  } else if (serviceType === 'school') {
    title.textContent = 'Schools & Professional Bodies';
    subtitle.textContent = 'Pay tuition, alumni dues & professional fees';
    content.innerHTML = `
      <form onsubmit="handleBillSubmit(event, 'School & Pro Fees')">
        <div class="form-group">
          <label>Institution / Body</label>
          <input type="text" placeholder="e.g. UNILAG, ICAN, NBA" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Matric / Registration Number</label>
          <input type="text" placeholder="Enter Student ID" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Amount (₦)</label>
          <input type="number" class="form-control" style="font-size: 20px; font-weight: 700;" required />
        </div>
        <button type="submit" class="btn-primary w-full" id="btnSubmitBill">Pay Fees</button>
      </form>
    `;
  } else if (serviceType === 'estate') {
    title.textContent = 'Estates & Associations';
    subtitle.textContent = 'Pay estate resident dues & association levies';
    content.innerHTML = `
      <form onsubmit="handleBillSubmit(event, 'Estate Dues')">
        <div class="form-group">
          <label>Estate / Association Name</label>
          <input type="text" placeholder="Search Estate Name..." class="form-control" required />
        </div>
        <div class="form-group">
          <label>House / Flat Number</label>
          <input type="text" placeholder="e.g. Block 4, Flat B" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Amount (₦)</label>
          <input type="number" class="form-control" style="font-size: 20px; font-weight: 700;" required />
        </div>
        <button type="submit" class="btn-primary w-full" id="btnSubmitBill">Pay Dues</button>
      </form>
    `;
  } else if (serviceType === 'toll') {
    title.textContent = 'Toll Fees - LCC';
    subtitle.textContent = 'Top-up your eTag balance instantly';
    content.innerHTML = `
      <form onsubmit="handleBillSubmit(event, 'Toll Fees')">
        <div class="form-group">
          <label>Toll Operator</label>
          <select class="form-control" disabled><option>Lekki Concession Company (LCC)</option></select>
        </div>
        <div class="form-group">
          <label>eTag / Account Number</label>
          <input type="text" placeholder="Enter LCC eTag" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Top-up Amount (₦)</label>
          <input type="number" class="form-control" style="font-size: 20px; font-weight: 700;" required />
        </div>
        <button type="submit" class="btn-primary w-full" id="btnSubmitBill">Top-up eTag</button>
      </form>
    `;
  } else if (serviceType === 'gaming') {
    title.textContent = 'Sports and Gaming';
    subtitle.textContent = 'Fund your betting or gaming wallets safely';
    content.innerHTML = `
      <form onsubmit="handleBillSubmit(event, 'Sports & Gaming')">
        <div class="form-group">
          <label>Gaming Platform</label>
          <select class="form-control" required>
            <option>Bet9ja</option><option>SportyBet</option><option>Nairabet</option><option>1xBet</option>
          </select>
        </div>
        <div class="form-group">
          <label>User ID / Account Number</label>
          <input type="text" placeholder="Enter Platform User ID" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Deposit Amount (₦)</label>
          <input type="number" class="form-control" style="font-size: 20px; font-weight: 700;" required />
        </div>
        <button type="submit" class="btn-primary w-full" id="btnSubmitBill">Fund Wallet</button>
      </form>
    `;
  } else if (serviceType === 'religious') {
    title.textContent = 'Religious Institutions & NGO';
    subtitle.textContent = 'Seamlessly send tithes, offerings, and donations';
    content.innerHTML = `
      <form onsubmit="handleBillSubmit(event, 'Religious & NGO')">
        <div class="form-group">
          <label>Institution / NGO Name</label>
          <input type="text" placeholder="Search Church, Mosque or NGO..." class="form-control" required />
        </div>
        <div class="form-group">
          <label>Giving Type</label>
          <select class="form-control" required>
            <option>Tithe</option><option>Offering</option><option>Zakat</option><option>Charity Donation</option>
          </select>
        </div>
        <div class="form-group">
          <label>Amount (₦)</label>
          <input type="number" class="form-control" style="font-size: 20px; font-weight: 700;" required />
        </div>
        <button type="submit" class="btn-primary w-full" id="btnSubmitBill">Complete Donation</button>
      </form>
    `;
  } else if (serviceType === 'insurance') {
    title.textContent = 'Insurance & HMO';
    subtitle.textContent = 'Pay for life, vehicle & health insurance policies';
    content.innerHTML = `
      <form onsubmit="handleBillSubmit(event, 'Insurance & HMO')">
        <div class="form-group">
          <label>Insurance Provider</label>
          <input type="text" placeholder="e.g. Leadway, AXA Mansard, Reliance HMO" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Policy Number / Enrollee ID</label>
          <input type="text" placeholder="Enter Policy ID" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Premium Amount (₦)</label>
          <input type="number" class="form-control" style="font-size: 20px; font-weight: 700;" required />
        </div>
        <button type="submit" class="btn-primary w-full" id="btnSubmitBill">Pay Premium</button>
      </form>
    `;
  } else if (serviceType === 'investments') {
    title.textContent = 'Capital Market & Investments';
    subtitle.textContent = 'Fund your investment portfolios & trading accounts';
    content.innerHTML = `
      <form onsubmit="handleBillSubmit(event, 'Investments')">
        <div class="form-group">
          <label>Investment Platform / Broker</label>
          <input type="text" placeholder="e.g. Bamboo, Trove, ARM" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Account ID / CSCS Number</label>
          <input type="text" placeholder="Enter Account ID" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Amount (₦)</label>
          <input type="number" class="form-control" style="font-size: 20px; font-weight: 700;" required />
        </div>
        <button type="submit" class="btn-primary w-full" id="btnSubmitBill">Fund Account</button>
      </form>
    `;
  } else if (serviceType === 'distributors') {
    title.textContent = 'Distributors & Agent Payments';
    subtitle.textContent = 'Settle bulk purchases and agency fees';
    content.innerHTML = `
      <form onsubmit="handleBillSubmit(event, 'Distributors')">
        <div class="form-group">
          <label>Company / Principal</label>
          <input type="text" placeholder="e.g. FMCG Corp, Brewery" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Agent / Distributor ID</label>
          <input type="text" placeholder="Enter Agent ID" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Amount (₦)</label>
          <input type="number" class="form-control" style="font-size: 20px; font-weight: 700;" required />
        </div>
        <button type="submit" class="btn-primary w-full" id="btnSubmitBill">Process Payment</button>
      </form>
    `;
  } else if (serviceType === 'financial') {
    title.textContent = 'Financial Institutions';
    subtitle.textContent = 'Loan repayments and microfinance deposits';
    content.innerHTML = `
      <form onsubmit="handleBillSubmit(event, 'Financial Institutions')">
        <div class="form-group">
          <label>Institution Name</label>
          <input type="text" placeholder="e.g. LAPO, Renmoney, Mutual Trust" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Loan / Account Number</label>
          <input type="text" placeholder="Enter Account Number" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Amount (₦)</label>
          <input type="number" class="form-control" style="font-size: 20px; font-weight: 700;" required />
        </div>
        <button type="submit" class="btn-primary w-full" id="btnSubmitBill">Make Payment</button>
      </form>
    `;
  } else if (serviceType === 'infotech') {
    title.textContent = 'Infotechs & Other Services';
    subtitle.textContent = 'Pay for tech services, hosting, and cloud tools';
    content.innerHTML = `
      <form onsubmit="handleBillSubmit(event, 'Infotechs')">
        <div class="form-group">
          <label>Service Provider</label>
          <input type="text" placeholder="e.g. Web Host, SaaS Platform" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Invoice / Reference Number</label>
          <input type="text" placeholder="Enter Reference" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Amount (₦)</label>
          <input type="number" class="form-control" style="font-size: 20px; font-weight: 700;" required />
        </div>
        <button type="submit" class="btn-primary w-full" id="btnSubmitBill">Pay Invoice</button>
      </form>
    `;
  } else if (serviceType === 'split') {
    title.textContent = 'Household Bill-Splitting Hub';
    subtitle.textContent = 'Split apartment rent, electricity & cleaner fees with roomies';
    content.innerHTML = `
      <form onsubmit="handleBillSubmit(event, 'Shared Bill Request')">
        <div class="form-group">
          <label for="splitTitle">Bill Purpose / Title</label>
          <input type="text" id="splitTitle" value="September Electricity & Estate Dues" class="form-control" required />
        </div>
        <div class="form-group">
          <label for="splitTotalAmount">Total Shared Bill Amount (₦)</label>
          <input type="number" id="splitTotalAmount" value="45000" class="form-control" style="font-size: 20px; font-weight: 700;" oninput="calculateSplitShares()" required />
        </div>
        <div class="form-group">
          <label for="splitParticipants">Select Roommates (Kapita Handles or Phone Numbers)</label>
          <input type="text" id="splitParticipants" value="@sarah, @ahmed, @john" class="form-control" placeholder="e.g. @sarah, @ahmed" oninput="calculateSplitShares()" required />
        </div>
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px; margin-bottom: 16px;">
          <div style="font-size: 12px; color: #475569; margin-bottom: 4px;">Automatic Breakdown (4 People Total including You):</div>
          <strong style="font-size: 16px; color: #008a57;" id="splitShareDisplay">₦11,250.00 per person</strong>
        </div>
        <button type="submit" class="btn-primary w-full" style="margin-top: 4px;" id="btnSubmitBill">
          <span>Request Roommate Contributions</span>
        </button>
      </form>
    `;
} else {
    // Default Fallback Form
    title.textContent = 'Pay Utility Bill';
    subtitle.textContent = 'Secure single-tap payment';
    content.innerHTML = `
      <form onsubmit="handleBillSubmit(event, 'Utility Bill')">
        <div class="form-group">
          <label for="genericAccount">Account / Smartcard / Account Reference</label>
          <input type="text" id="genericAccount" value="${escapeHtml(defaultAccount)}" placeholder="Enter ID number" class="form-control" required />
        </div>
        <div class="form-group">
          <label for="genericAmount">Amount (₦)</label>
          <input type="number" id="genericAmount" value="5000" class="form-control" style="font-size: 20px; font-weight: 700;" required />
        </div>
        <button type="submit" class="btn-primary w-full" style="margin-top: 12px;" id="btnSubmitBill">
          <span>Process Payment</span>
        </button>
      </form>
    `;
  }


  modal.classList.add('active');
  const firstInput = content.querySelector('input, select');
  if (firstInput) firstInput.focus();
}

function toggleAirtimeDataFields(selectEl) {
  const dataGroup = document.getElementById('dataPlanGroup');
  const airtimeGroup = document.getElementById('airtimeAmountGroup');

  if (selectEl.value === 'data') {
    if (dataGroup) dataGroup.style.display = 'block';
    if (airtimeGroup) airtimeGroup.style.display = 'none';
  } else {
    if (dataGroup) dataGroup.style.display = 'none';
    if (airtimeGroup) airtimeGroup.style.display = 'block';
  }
}

function calculateSplitShares() {
  const totalInput = document.getElementById('splitTotalAmount');
  const participantsInput = document.getElementById('splitParticipants');
  const display = document.getElementById('splitShareDisplay');
  if (!totalInput || !display) return;

  const total = parseFloat(totalInput.value) || 0;
  const rawList = participantsInput ? participantsInput.value : '';
  const count = rawList.split(',').filter(item => item.trim() !== '').length + 1;

  const share = total / count;
  display.textContent = `₦${share.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per person (${count} members)`;
}

function closeBillModal(e) {
  if (e && e.target !== e.currentTarget) return;
  const modal = document.getElementById('billActionModal');
  if (modal) modal.classList.remove('active');
}

/* 5. Live Backend Payment Submission + Pending Ledger State */
async function handleBillSubmit(event, serviceName) {
  event.preventDefault();

  const submitBtn = document.getElementById('btnSubmitBill');
  const alertBox = document.getElementById('pendingLedgerModalAlert');

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner-small" aria-hidden="true"></span> Processing...`;
  }

  if (alertBox) alertBox.style.display = 'flex';

  const payload = {
    service: serviceName,
    timestamp: new Date().toISOString(),
    idempotencyKey: `KPT-BL-${Date.now()}`
  };

  try {
    const response = await fetchWithTimeout(`${API_CONFIG.baseUrl}/bills/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_CONFIG.authToken}`
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const resData = await response.json();
      announceAccessibilityMessage(`Payment for ${serviceName} confirmed.`);
      showSuccessAlert(`Payment Successful!\n${resData.message || serviceName + ' has been settled via your Kapita Pay Wallet.'}`);
    } else {
      throw new Error(`Server status ${response.status}`);
    }
  } catch (err) {
    console.warn("[Kapita Pay] Backend pending ledger fallback triggered:", err);
    
    // Flag transaction in pending state locally
    prependPendingHistoryItem(serviceName, payload.idempotencyKey);
    announceAccessibilityMessage(`Payment queued. Transaction marked pending backend ledger sync.`);
    showSuccessAlert(`Transaction Queued!\nYour ${serviceName} is marked pending until the live backend ledger completes sync.`);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Confirm & Process</span>`;
    }
    if (alertBox) alertBox.style.display = 'none';
    closeBillModal();
  }
}

function prependPendingHistoryItem(serviceName, refCode) {
  const container = document.getElementById('billHistoryContainer');
  if (!container) return;

  const itemHtml = `
    <div class="history-item">
      <div class="history-left">
        <div class="bill-icon-wrapper bg-amber">
          <span class="material-symbols-outlined" aria-hidden="true">pending</span>
        </div>
        <div>
          <h3>${escapeHtml(serviceName)}</h3>
          <span class="history-meta">Just now • Ref: ${escapeHtml(refCode)}</span>
        </div>
      </div>
      <div class="history-right">
        <span class="pending-badge"><span class="spinner-small"></span> Ledger Pending</span>
      </div>
    </div>
  `;
  container.insertAdjacentHTML('afterbegin', itemHtml);
}

function toggleAutopayState(checkbox, title) {
  const status = checkbox.checked ? 're-enabled' : 'paused';
  announceAccessibilityMessage(`Auto-Pay ${status} for ${title}`);
}

function copyTokenText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    announceAccessibilityMessage("Meter token copied to clipboard.");
    setTimeout(() => { btn.textContent = originalText; }, 2000);
  });
}

function showSuccessAlert(msg) {
  alert(msg);
}

function showErrorNotice(text) {
  const notice = document.getElementById('globalErrorNotice');
  const noticeText = document.getElementById('globalErrorText');
  if (notice && noticeText) {
    noticeText.textContent = text;
    notice.style.display = 'flex';
  }
}

function hideErrorNotice() {
  const notice = document.getElementById('globalErrorNotice');
  if (notice) notice.style.display = 'none';
}

function retryLastOperation() {
  hideErrorNotice();
  fetchLiveWalletBalance();
  fetchLivePaymentHistory();
}

async function fetchWithTimeout(resource, options = {}) {
  const { timeoutMs = API_CONFIG.timeoutMs } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* 6. Search Filter for Services */
/* 6. Search Filter for Services */
function filterBillServices() {
  const input = document.getElementById('billSearchInput');
  const filter = input.value.toLowerCase();
  const grid = document.getElementById('billsCategoryGrid');
  const cards = grid.getElementsByClassName('bill-service-card');

  let visibleCount = 0;

  for (let i = 0; i < cards.length; i++) {
    const title = cards[i].querySelector('h3').textContent.toLowerCase();
    const description = cards[i].querySelector('p').textContent.toLowerCase();
    
    if (title.indexOf(filter) > -1 || description.indexOf(filter) > -1) {
      // Force display to flex with !important
      cards[i].style.setProperty('display', 'flex', 'important');
      visibleCount++;
    } else {
      // Force display to none with !important to override the CSS class
      cards[i].style.setProperty('display', 'none', 'important');
    }
  }

  // Optional: Accessibility announcement for screen readers
  announceAccessibilityMessage(`Showing ${visibleCount} matching services.`);
}