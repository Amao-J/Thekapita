/* ==========================================
   PROFILE CONTROLLER & TAB SWITCHING
   ========================================== */
import { refreshBalance, getBalanceDisplay } from '../state/ledger.js';
import { isAuthenticated, hydrateProfile, updateProfile } from '../state/session.js';

if (!isAuthenticated()) {
  window.location.href = 'auth.html';
}

async function hydrateBalance() {
  const balanceEl = document.getElementById('walletBalance');
  if (!balanceEl) return;
  try {
    await refreshBalance();
    if (!isBalanceMasked) balanceEl.textContent = getBalanceDisplay();
  } catch (err) {
    balanceEl.textContent = 'Unavailable';
    console.error('Could not load wallet balance:', err);
  }
}

async function hydrateIdentity() {
  try {
    const user = await hydrateProfile();
    const nameEl = document.querySelector('[data-profile-field="fullName"]');
    if (nameEl && user?.full_name) nameEl.textContent = user.full_name;
    const idEl = document.querySelector('[data-profile-field="kapitaId"]');
    if (idEl && user?.kapita_id) idEl.textContent = user.kapita_id;
    const bioEl = document.querySelector('.bio-text');
    if (bioEl) bioEl.textContent = user?.bio || '';
  } catch (err) {
    console.error('Could not load profile:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  hydrateBalance();
  hydrateIdentity();
});


function switchTab(tabId, btnElement) {
  const panes = document.querySelectorAll('.tab-pane');
  panes.forEach(pane => pane.classList.remove('active'));

  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach(btn => btn.classList.remove('active'));

  const selectedPane = document.getElementById(tabId);
  if (selectedPane) selectedPane.classList.add('active');
  if (btnElement) btnElement.classList.add('active');
}

/* Modal Dialog Controls */
function openQrModal() {
  const modal = document.getElementById('qrModal');
  if (modal) modal.classList.add('active');
}

function closeQrModal(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById('qrModal');
  if (modal) modal.classList.remove('active');
}

/* Balance Masking Toggle */
let isBalanceMasked = false;

function toggleBalanceVisibility() {
  const balanceEl = document.getElementById('walletBalance');
  const toggleBtn = document.querySelector('.eye-toggle');
  if (!balanceEl || !toggleBtn) return;

  const eyeOpenPaths = toggleBtn.querySelectorAll('.eye-open');
  const eyeClosedPath = toggleBtn.querySelector('.eye-closed');

  if (isBalanceMasked) {
    balanceEl.textContent = getBalanceDisplay();
    isBalanceMasked = false;
    eyeOpenPaths.forEach(path => path.style.display = 'block');
    if (eyeClosedPath) eyeClosedPath.style.display = 'none';
  } else {
    balanceEl.textContent = '••••••••';
    isBalanceMasked = true;
    eyeOpenPaths.forEach(path => path.style.display = 'none');
    if (eyeClosedPath) eyeClosedPath.style.display = 'block';
  }
}

/* Clipboard Copy */
function copyKapitaId() {
  navigator.clipboard.writeText('KPT-883902');
  alert('theKapita ID (KPT-883902) copied to clipboard!');
}

/* ==========================================
   DYNAMIC EDIT MODAL & LIVE DOM UPDATES
   ========================================== */

let currentEditSection = '';

// SECURITY: values read back from the DOM (name, bio, saved preferences)
// must never be interpolated into an HTML string to rebuild an <input>,
// because once any of those values can contain a double-quote or "<", it
// breaks out of the attribute and injects markup. Build the field with real
// DOM APIs instead, so the value always lands in the `value` property, not
// in parsed HTML.
function buildEditField(container, { id, label, type = 'text', value = '', required = true }) {
  const group = document.createElement('div');
  group.className = 'form-group';
  const labelEl = document.createElement('label');
  labelEl.setAttribute('for', id);
  labelEl.textContent = label;
  const input = document.createElement('input');
  input.type = type;
  input.id = id;
  input.value = value;
  input.className = 'form-control';
  input.required = required;
  group.append(labelEl, input);
  container.appendChild(group);
}

function openEditModal(section) {
  currentEditSection = section;
  const modal = document.getElementById('editModal');
  const container = document.getElementById('dynamicFormFields');
  const title = document.getElementById('editModalTitle');

  if (!modal || !container) return;

  // 1. MAIN PROFILE
  if (section === 'main') {
    title.textContent = 'Edit Main Profile';
    const currentName = document.querySelector('.name-line h2')?.textContent.trim() || '';
    const currentBio = document.querySelector('.bio-text')?.textContent.trim() || '';

    container.innerHTML = '';
    buildEditField(container, { id: 'input1', label: 'Full Name', value: currentName });
    buildEditField(container, { id: 'input2', label: 'Bio / Tagline', value: currentBio, required: false });
  }
  
  // 2. EATS PROFILE
  else if (section === 'eats') {
    title.textContent = 'Edit theKapita Eats Profile';
    const rows = document.querySelectorAll('#serviceProfilesTab .service-profile-card:nth-child(1) .detail-row strong');

    container.innerHTML = '';
    buildEditField(container, { id: 'input1', label: 'Dietary Preference', value: rows[0]?.textContent.trim() || '' });
    buildEditField(container, { id: 'input2', label: 'Favorite Cuisine', value: rows[1]?.textContent.trim() || '' });
  }

  // 3. RIDE PROFILE
  else if (section === 'ride') {
    title.textContent = 'Edit theKapita Ride Profile';
    const rows = document.querySelectorAll('#serviceProfilesTab .service-profile-card:nth-child(2) .detail-row strong');

    container.innerHTML = '';
    buildEditField(container, { id: 'input1', label: 'Preferred Ride', value: rows[0]?.textContent.trim() || '' });
    buildEditField(container, { id: 'input2', label: 'Quiet Mode', value: rows[1]?.textContent.trim() || '' });
  }

  // 4. TALENT / JOBS PROFILE
  else if (section === 'talent') {
    title.textContent = 'Edit theKapita Talent Profile';
    const rows = document.querySelectorAll('#serviceProfilesTab .service-profile-card:nth-child(3) .detail-row strong');

    container.innerHTML = '';
    buildEditField(container, { id: 'input1', label: 'Primary Skill', value: rows[0]?.textContent.trim() || '' });
    buildEditField(container, { id: 'input2', label: 'Experience Level', value: rows[1]?.textContent.trim() || '' });
  }

  // 5. HEALTH PROFILE
  else if (section === 'health') {
    title.textContent = 'Edit theKapita Health Profile';
    const rows = document.querySelectorAll('#serviceProfilesTab .service-profile-card:nth-child(4) .detail-row strong');

    container.innerHTML = '';
    buildEditField(container, { id: 'input1', label: 'Blood Group', value: rows[0]?.textContent.trim() || '' });
    buildEditField(container, { id: 'input2', label: 'Emergency Contact', value: rows[1]?.textContent.trim() || '' });
  }

  // 6. PERSONAL DETAILS
  else if (section === 'personal') {
    title.textContent = 'Update Personal Details';
    const rows = document.querySelectorAll('#securityTab .kapita-card:nth-child(1) .detail-row strong');

    container.innerHTML = '';
    buildEditField(container, { id: 'input1', label: 'Full Name', value: rows[0]?.textContent.replace('✓', '').trim() || '' });
    buildEditField(container, { id: 'input2', label: 'Email Address', type: 'email', value: rows[1]?.textContent.replace('✓', '').trim() || '' });
    buildEditField(container, { id: 'input3', label: 'Phone Number', type: 'tel', value: rows[2]?.textContent.replace('✓', '').trim() || '' });
  }

  modal.classList.add('active');
}

function closeEditModal(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById('editModal');
  if (modal) modal.classList.remove('active');
}

async function saveProfileChanges(event) {
  event.preventDefault();

  const val1 = document.getElementById('input1')?.value;
  const val2 = document.getElementById('input2')?.value;
  const val3 = document.getElementById('input3')?.value;

  if (currentEditSection === 'main') {
    const submitButton = event.currentTarget.querySelector('[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const user = await updateProfile({ full_name: val1.trim(), bio: val2.trim() });
      document.querySelector('[data-profile-field="fullName"]').textContent = user.full_name;
      document.querySelector('.bio-text').textContent = user.bio;
      closeEditModal();
    } catch (err) {
      alert(err.message || 'Could not save your profile. Please try again.');
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
    return;
  }
  else if (currentEditSection === 'eats') {
    const rows = document.querySelectorAll('#serviceProfilesTab .service-profile-card:nth-child(1) .detail-row strong');
    if (val1 && rows[0]) rows[0].textContent = val1;
    if (val2 && rows[1]) rows[1].textContent = val2;
  }
  else if (currentEditSection === 'ride') {
    const rows = document.querySelectorAll('#serviceProfilesTab .service-profile-card:nth-child(2) .detail-row strong');
    if (val1 && rows[0]) rows[0].textContent = val1;
    if (val2 && rows[1]) rows[1].textContent = val2;
  }
  else if (currentEditSection === 'talent') {
    const rows = document.querySelectorAll('#serviceProfilesTab .service-profile-card:nth-child(3) .detail-row strong');
    if (val1 && rows[0]) rows[0].textContent = val1;
    if (val2 && rows[1]) rows[1].textContent = val2;
  }
  else if (currentEditSection === 'health') {
    const rows = document.querySelectorAll('#serviceProfilesTab .service-profile-card:nth-child(4) .detail-row strong');
    if (val1 && rows[0]) rows[0].textContent = val1;
    if (val2 && rows[1]) rows[1].textContent = val2;
  }
  else if (currentEditSection === 'personal') {
    const rows = document.querySelectorAll('#securityTab .kapita-card:nth-child(1) .detail-row strong');
    if (val1 && rows[0]) rows[0].textContent = val1;
    if (val2 && rows[1]) rows[1].textContent = val2 + ' ✓';
    if (val3 && rows[2]) rows[2].textContent = val3 + ' ✓';
  }

  closeEditModal();
}

/* ---- Window bridge: profile.html still calls these via inline onclick.
   Same pattern as auth.js/wallet.js — see auth.js for the full explanation.
   openApp() is not bridged here; it's defined in app.js, which is still a
   plain global <script> on this page (not yet converted to a module). */
window.switchTab = switchTab;
window.toggleBalanceVisibility = toggleBalanceVisibility;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.saveProfileChanges = saveProfileChanges;
window.openQrModal = openQrModal;
window.closeQrModal = closeQrModal;
window.copyKapitaId = copyKapitaId;