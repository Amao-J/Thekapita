/* ==========================================================================
   THEKAPITA PROFILE CONTROLLER (API INTEGRATED WITH SKELETON LOADERS)
   ========================================================================== */
import { refreshBalance, getBalanceDisplay } from '../state/ledger.js';
import { isAuthenticated, hydrateProfile, updateProfile } from '../state/session.js';
import { ApiError } from '../api/client.js';
import { showToast } from './app.js';

if (!isAuthenticated()) {
  window.location.href = 'auth.html';
}

let isBalanceMasked = false;
let currentEditSection = '';

/* --------------------------------------------------------------------------
   0. HYDRATION ENGINE (WITH REAL NETWORK LOADING & SKELETON STATES)
   -------------------------------------------------------------------------- */

async function hydrateBalance() {
  const balanceEl = document.getElementById('walletBalance');
  if (!balanceEl) return;

  balanceEl.innerHTML = `<span class="balance-spinner">Loading...</span>`;

  try {
    await refreshBalance();
    if (!isBalanceMasked) balanceEl.textContent = getBalanceDisplay();
  } catch (err) {
    balanceEl.textContent = 'Unavailable';
    if (window.showToast) {
      window.showToast('Could not load live wallet balance.', 'error');
    }
  }
}

async function hydrateIdentity() {
  const nameEl = document.querySelector('[data-profile-field="fullName"]');
  const idEl = document.querySelector('[data-profile-field="kapitaId"]');
  const bioEl = document.querySelector('.bio-text');

  // Render skeleton loaders for user metadata while fetching profile
  if (nameEl) nameEl.innerHTML = `<span class="skeleton-text" style="width: 140px; display: inline-block;"></span>`;
  if (idEl) idEl.innerHTML = `<span class="skeleton-text" style="width: 100px; display: inline-block;"></span>`;

  try {
    const user = await hydrateProfile();

    if (nameEl) nameEl.textContent = user?.full_name || 'User';
    if (idEl) idEl.textContent = user?.kapita_id || 'KPT-000000';
    if (bioEl) bioEl.textContent = user?.bio || 'Ecosystem Identity';
  } catch (err) {
    const errorMsg = err instanceof ApiError ? err.message : 'Could not sync identity details.';
    if (nameEl) nameEl.textContent = 'User Profile';
    if (idEl) idEl.textContent = 'KPT-OFFLINE';
    if (window.showToast) window.showToast(errorMsg, 'error');
  }
}

/* --------------------------------------------------------------------------
   1. TAB SWITCHING & VISIBILITY TOGGLES
   -------------------------------------------------------------------------- */

function switchTab(tabId, btnElement) {
  const panes = document.querySelectorAll('.tab-pane');
  panes.forEach(pane => pane.classList.remove('active'));

  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach(btn => btn.classList.remove('active'));

  const selectedPane = document.getElementById(tabId);
  if (selectedPane) selectedPane.classList.add('active');
  if (btnElement) btnElement.classList.add('active');
}

function openQrModal() {
  const modal = document.getElementById('qrModal');
  if (modal) modal.classList.add('active');
}

function closeQrModal(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById('qrModal');
  if (modal) modal.classList.remove('active');
}

function toggleBalanceVisibility() {
  const balanceEl = document.getElementById('walletBalance');
  const toggleBtn = document.querySelector('.eye-toggle');
  if (!balanceEl || !toggleBtn) return;

  const eyeIcon = toggleBtn.querySelector('.material-symbols-outlined');

  if (isBalanceMasked) {
    balanceEl.textContent = getBalanceDisplay();
    isBalanceMasked = false;
    if (eyeIcon) eyeIcon.textContent = 'visibility';
  } else {
    balanceEl.textContent = '••••••••';
    isBalanceMasked = true;
    if (eyeIcon) eyeIcon.textContent = 'visibility_off';
  }
}

function copyKapitaId() {
  const idEl = document.querySelector('[data-profile-field="kapitaId"]');
  const tag = idEl?.textContent.trim() || 'KPT-883902';
  navigator.clipboard.writeText(tag);
  if (window.showToast) window.showToast(`theKapita ID (${tag}) copied to clipboard!`, 'success');
  else alert(`theKapita ID (${tag}) copied to clipboard!`);
}

/* --------------------------------------------------------------------------
   2. DYNAMIC EDIT MODAL & LIVE PROFILE SAVING
   -------------------------------------------------------------------------- */

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

  if (section === 'main') {
    title.textContent = 'Edit Main Profile';
    const currentName = document.querySelector('[data-profile-field="fullName"]')?.textContent.trim() || '';
    const currentBio = document.querySelector('.bio-text')?.textContent.trim() || '';

    container.innerHTML = '';
    buildEditField(container, { id: 'input1', label: 'Full Name', value: currentName });
    buildEditField(container, { id: 'input2', label: 'Bio / Tagline', value: currentBio, required: false });
  } else if (section === 'eats') {
    title.textContent = 'Edit theKapita Eats Profile';
    const rows = document.querySelectorAll('#serviceProfilesTab .service-profile-card:nth-child(1) .detail-row strong');

    container.innerHTML = '';
    buildEditField(container, { id: 'input1', label: 'Dietary Preference', value: rows[0]?.textContent.trim() || '' });
    buildEditField(container, { id: 'input2', label: 'Favorite Cuisine', value: rows[1]?.textContent.trim() || '' });
  } else if (section === 'ride') {
    title.textContent = 'Edit theKapita Ride Profile';
    const rows = document.querySelectorAll('#serviceProfilesTab .service-profile-card:nth-child(2) .detail-row strong');

    container.innerHTML = '';
    buildEditField(container, { id: 'input1', label: 'Preferred Ride', value: rows[0]?.textContent.trim() || '' });
    buildEditField(container, { id: 'input2', label: 'Quiet Mode', value: rows[1]?.textContent.trim() || '' });
  } else if (section === 'talent') {
    title.textContent = 'Edit theKapita Talent Profile';
    const rows = document.querySelectorAll('#serviceProfilesTab .service-profile-card:nth-child(3) .detail-row strong');

    container.innerHTML = '';
    buildEditField(container, { id: 'input1', label: 'Primary Skill', value: rows[0]?.textContent.trim() || '' });
    buildEditField(container, { id: 'input2', label: 'Experience Level', value: rows[1]?.textContent.trim() || '' });
  } else if (section === 'health') {
    title.textContent = 'Edit theKapita Health Profile';
    const rows = document.querySelectorAll('#serviceProfilesTab .service-profile-card:nth-child(4) .detail-row strong');

    container.innerHTML = '';
    buildEditField(container, { id: 'input1', label: 'Blood Group', value: rows[0]?.textContent.trim() || '' });
    buildEditField(container, { id: 'input2', label: 'Emergency Contact', value: rows[1]?.textContent.trim() || '' });
  } else if (section === 'personal') {
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

  const submitButton = event.currentTarget.querySelector('[type="submit"]');
  const val1 = document.getElementById('input1')?.value;
  const val2 = document.getElementById('input2')?.value;
  const val3 = document.getElementById('input3')?.value;

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.innerHTML = `<span class="btn-spinner"></span> Saving...`;
  }

  try {
    if (currentEditSection === 'main') {
      const user = await updateProfile({ full_name: val1.trim(), bio: val2.trim() });
      
      const nameEl = document.querySelector('[data-profile-field="fullName"]');
      const bioEl = document.querySelector('.bio-text');

      if (nameEl) nameEl.textContent = user.full_name;
      if (bioEl) bioEl.textContent = user.bio;

      if (window.showToast) window.showToast('Profile updated successfully!', 'success');
      closeEditModal();
      return;
    } 
    
    if (currentEditSection === 'eats') {
      const rows = document.querySelectorAll('#serviceProfilesTab .service-profile-card:nth-child(1) .detail-row strong');
      if (val1 && rows[0]) rows[0].textContent = val1;
      if (val2 && rows[1]) rows[1].textContent = val2;
    } else if (currentEditSection === 'ride') {
      const rows = document.querySelectorAll('#serviceProfilesTab .service-profile-card:nth-child(2) .detail-row strong');
      if (val1 && rows[0]) rows[0].textContent = val1;
      if (val2 && rows[1]) rows[1].textContent = val2;
    } else if (currentEditSection === 'talent') {
      const rows = document.querySelectorAll('#serviceProfilesTab .service-profile-card:nth-child(3) .detail-row strong');
      if (val1 && rows[0]) rows[0].textContent = val1;
      if (val2 && rows[1]) rows[1].textContent = val2;
    } else if (currentEditSection === 'health') {
      const rows = document.querySelectorAll('#serviceProfilesTab .service-profile-card:nth-child(4) .detail-row strong');
      if (val1 && rows[0]) rows[0].textContent = val1;
      if (val2 && rows[1]) rows[1].textContent = val2;
    } else if (currentEditSection === 'personal') {
      const rows = document.querySelectorAll('#securityTab .kapita-card:nth-child(1) .detail-row strong');
      if (val1 && rows[0]) rows[0].textContent = val1;
      if (val2 && rows[1]) rows[1].textContent = val2 + ' ✓';
      if (val3 && rows[2]) rows[2].textContent = val3 + ' ✓';
    }

    if (window.showToast) window.showToast('Preferences saved!', 'success');
    closeEditModal();
  } catch (err) {
    const errorMsg = err instanceof ApiError ? err.message : 'Could not save profile changes.';
    if (window.showToast) window.showToast(errorMsg, 'error');
    else alert(errorMsg);
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Save Changes';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  hydrateBalance();
  hydrateIdentity();
});

// Window Bridge Bindings
window.switchTab = switchTab;
window.toggleBalanceVisibility = toggleBalanceVisibility;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.saveProfileChanges = saveProfileChanges;
window.openQrModal = openQrModal;
window.closeQrModal = closeQrModal;
window.copyKapitaId = copyKapitaId;