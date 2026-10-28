/* ==========================================================================
   THEKAPITA PROFILE CONTROLLER
   Everything on this page that belongs to the user comes from GET /profile/me
   (identity, personal details, service preferences, privacy + notification
   settings) and is written back through PATCH /profile/me, /profile/preferences
   and /profile/settings. The DOM is only ever painted FROM that object.
   ========================================================================== */
import { refreshBalance, getBalanceDisplay } from '../state/ledger.js';
import { renderKapitaQr } from '../ui/kapitaQr.js';
import {
  isAuthenticated,
  hydrateProfile,
  updateProfile,
  updatePreferences,
  updateSettings,
  getCurrentUser,
} from '../state/session.js';

if (!isAuthenticated()) {
  window.location.href = 'auth.html';
}

let isBalanceMasked = false;
let currentEditSection = '';

function notify(message, type = 'success') {
  if (window.showToast) window.showToast(message, type);
  else if (type === 'error') alert(message);
}

/* --------------------------------------------------------------------------
   0. HYDRATION
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
    console.error('Could not load wallet balance:', err);
  }
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** The single place that paints the user object into the page. */
function paint(user) {
  if (!user) return;
  const prefs = user.preferences || {};
  const settings = user.settings || {};
  const fields = {
    fullName: user.full_name,
    kapitaId: user.kapita_id,
    email: user.email,
    phone: user.phone,
    handle: user.handle ? `@${user.handle}` : '',
    dateOfBirth: formatDate(user.date_of_birth),
    location: user.location,
    address: user.address,
    language: user.language,
  };
  for (const [key, value] of Object.entries(fields)) {
    document.querySelectorAll(`[data-profile-field="${key}"]`).forEach((el) => {
      el.textContent = value || '—';
    });
  }
  document.querySelectorAll('[data-pref]').forEach((el) => {
    const value = prefs[el.dataset.pref];
    el.textContent = el.dataset.pref === 'quiet_mode' ? (value ? 'Enabled' : 'Disabled') : value || '—';
  });
  document.querySelectorAll('[data-setting]').forEach((el) => {
    el.checked = Boolean(settings[el.dataset.setting]);
  });
  const bioEl = document.querySelector('.bio-text');
  if (bioEl) bioEl.textContent = user.bio || '';
}

async function hydrateIdentity() {
  const cached = getCurrentUser();
  if (cached) {
    paint(cached); // instant, from the stored session
  } else {
    document.querySelectorAll('[data-profile-field="fullName"], [data-profile-field="kapitaId"]').forEach((el) => {
      el.innerHTML = `<span class="skeleton-text" style="width: 120px; display: inline-block;"></span>`;
    });
  }
  try {
    paint(await hydrateProfile());
  } catch (err) {
    if (!cached) paint({ full_name: 'User Profile', kapita_id: '—' });
    notify(err.message || 'Could not sync your profile details.', 'error');
  }
}

/* --------------------------------------------------------------------------
   1. TABS, QR, BALANCE MASK
   -------------------------------------------------------------------------- */

function switchTab(tabId, btnElement) {
  document.querySelectorAll('.tab-pane').forEach((pane) => pane.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.remove('active'));
  document.getElementById(tabId)?.classList.add('active');
  btnElement?.classList.add('active');
}

async function openQrModal() {
  const modal = document.getElementById('qrModal');
  const canvas = modal?.querySelector('[data-kapita-qr]');
  if (!modal || !canvas) return;

  modal.classList.add('active');
  try {
    const user = getCurrentUser()?.kapita_id ? getCurrentUser() : await hydrateProfile();
    if (!await renderKapitaQr(canvas, user?.kapita_id)) {
      notify('Your Kapita ID is not available yet.', 'error');
    }
  } catch (err) {
    notify(err.message || 'Could not create your Kapita ID QR code.', 'error');
  }
}

function closeQrModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('qrModal')?.classList.remove('active');
}

function toggleBalanceVisibility() {
  const balanceEl = document.getElementById('walletBalance');
  const toggleBtn = document.querySelector('.eye-toggle');
  if (!balanceEl || !toggleBtn) return;
  const eyeIcon = toggleBtn.querySelector('.material-symbols-outlined');
  isBalanceMasked = !isBalanceMasked;
  balanceEl.textContent = isBalanceMasked ? '••••••••' : getBalanceDisplay();
  if (eyeIcon) eyeIcon.textContent = isBalanceMasked ? 'visibility_off' : 'visibility';
}

function copyKapitaId() {
  const id = getCurrentUser()?.kapita_id;
  if (!id) return;
  navigator.clipboard.writeText(id);
  notify(`theKapita ID (${id}) copied to clipboard!`);
}

/* --------------------------------------------------------------------------
   2. EDIT MODAL — one config table drives every section
   `target` decides which endpoint a section saves to.
   -------------------------------------------------------------------------- */

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const SECTIONS = {
  main: {
    title: 'Edit Main Profile',
    target: 'profile',
    fields: [
      { key: 'full_name', label: 'Full Name' },
      { key: 'bio', label: 'Bio / Tagline', required: false, maxLength: 200 },
    ],
  },
  personal: {
    title: 'Update Personal Details',
    target: 'profile',
    fields: [
      { key: 'full_name', label: 'Full Name' },
      { key: 'email', label: 'Email Address (cannot be changed here)', type: 'email', readOnly: true },
      { key: 'phone', label: 'Phone Number', type: 'tel' },
      { key: 'date_of_birth', label: 'Date of Birth', type: 'date', required: false },
      { key: 'location', label: 'Primary Location', required: false, maxLength: 100 },
      { key: 'address', label: 'Residential Address', required: false, maxLength: 200 },
      { key: 'language', label: 'Language', required: false, maxLength: 30 },
    ],
  },
  eats: {
    title: 'Edit theKapita Eats Profile',
    target: 'preferences',
    fields: [
      { key: 'dietary_preference', label: 'Dietary Preference', required: false, maxLength: 120 },
      { key: 'favorite_cuisine', label: 'Favorite Cuisine', required: false, maxLength: 120 },
      { key: 'default_address', label: 'Default Address', required: false, maxLength: 200 },
    ],
  },
  ride: {
    title: 'Edit theKapita Ride Profile',
    target: 'preferences',
    fields: [
      { key: 'preferred_ride', label: 'Preferred Ride', required: false, maxLength: 60 },
      { key: 'quiet_mode', label: 'Quiet Mode', type: 'select', options: [['true', 'Enabled'], ['false', 'Disabled']] },
      { key: 'default_payment', label: 'Default Payment', required: false, maxLength: 60 },
    ],
  },
  talent: {
    title: 'Edit theKapita Talent Profile',
    target: 'preferences',
    fields: [
      { key: 'primary_skill', label: 'Primary Skill', required: false, maxLength: 100 },
      { key: 'experience_level', label: 'Experience Level', required: false, maxLength: 60 },
    ],
  },
  health: {
    title: 'Edit theKapita Health Profile',
    target: 'preferences',
    fields: [
      { key: 'blood_group', label: 'Blood Group', type: 'select', options: [['', 'Not set'], ...BLOOD_GROUPS.map((g) => [g, g])] },
      { key: 'emergency_contact', label: 'Emergency Contact', type: 'tel', required: false, maxLength: 30 },
      { key: 'health_insurance_id', label: 'Health Insurance ID', required: false, maxLength: 40 },
    ],
  },
};

// Values go into `.value` via the DOM, never into an HTML string, so a quote or "<" in a saved value can't inject markup.
function buildEditField(container, field, value) {
  const id = `edit-${field.key}`;
  const group = document.createElement('div');
  group.className = 'form-group';
  const label = document.createElement('label');
  label.setAttribute('for', id);
  label.textContent = field.label;

  let input;
  if (field.type === 'select') {
    input = document.createElement('select');
    for (const [optValue, optLabel] of field.options) {
      const opt = document.createElement('option');
      opt.value = optValue;
      opt.textContent = optLabel;
      input.appendChild(opt);
    }
    input.value = String(value ?? '');
  } else {
    input = document.createElement('input');
    input.type = field.type || 'text';
    input.value = value ?? '';
    if (field.maxLength) input.maxLength = field.maxLength;
    if (field.type === 'date') input.max = new Date().toISOString().slice(0, 10);
  }
  input.id = id;
  input.className = 'form-control';
  input.required = field.required !== false;
  input.readOnly = Boolean(field.readOnly);
  group.append(label, input);
  container.appendChild(group);
}

function currentValue(section, key) {
  const user = getCurrentUser() || {};
  return section.target === 'preferences' ? user.preferences?.[key] : user[key];
}

function openEditModal(sectionName) {
  const section = SECTIONS[sectionName];
  const modal = document.getElementById('editModal');
  const container = document.getElementById('dynamicFormFields');
  if (!section || !modal || !container) return;

  currentEditSection = sectionName;
  document.getElementById('editModalTitle').textContent = section.title;
  container.replaceChildren();
  for (const field of section.fields) {
    buildEditField(container, field, currentValue(section, field.key));
  }
  modal.classList.add('active');
}

function closeEditModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('editModal')?.classList.remove('active');
}

function collectPayload(section) {
  const payload = {};
  for (const field of section.fields) {
    if (field.readOnly) continue;
    const raw = document.getElementById(`edit-${field.key}`).value.trim();
    if (field.key === 'quiet_mode') payload[field.key] = raw === 'true';
    else if (field.key === 'date_of_birth') payload[field.key] = raw || null;
    else payload[field.key] = raw;
  }
  return payload;
}

async function saveProfileChanges(event) {
  event.preventDefault();
  const section = SECTIONS[currentEditSection];
  if (!section) return;

  const submitButton = event.currentTarget.querySelector('[type="submit"]');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.innerHTML = `<span class="btn-spinner"></span> Saving...`;
  }
  try {
    const payload = collectPayload(section);
    if (section.target === 'profile') await updateProfile(payload);
    else await updatePreferences(payload);
    paint(getCurrentUser());
    closeEditModal();
    notify('Saved!', 'success');
  } catch (err) {
    notify(err.message || 'Could not save your changes. Please try again.', 'error');
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Save Changes';
    }
  }
}

/* --------------------------------------------------------------------------
   3. PRIVACY + NOTIFICATION TOGGLES (data-setting="<settings field>")
   -------------------------------------------------------------------------- */

function bindSettingToggles() {
  document.querySelectorAll('[data-setting]').forEach((input) => {
    input.addEventListener('change', async () => {
      const wanted = input.checked;
      input.disabled = true;
      try {
        await updateSettings({ [input.dataset.setting]: wanted });
      } catch (err) {
        input.checked = !wanted; // roll the switch back
        notify(err.message || 'Could not save that setting.', 'error');
      } finally {
        input.disabled = false;
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  bindSettingToggles();
  hydrateBalance();
  hydrateIdentity();
});

// Window bridge: profile.html uses inline onclick attributes.
window.switchTab = switchTab;
window.toggleBalanceVisibility = toggleBalanceVisibility;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.saveProfileChanges = saveProfileChanges;
window.openQrModal = openQrModal;
window.closeQrModal = closeQrModal;
window.copyKapitaId = copyKapitaId;
