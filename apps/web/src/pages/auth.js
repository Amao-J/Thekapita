import { login, loginWithGoogle, register, isAuthenticated } from '../state/session.js';
import { validateRegisterForm } from '@thekapita/shared/validators';
import { ApiError } from '../api/client.js';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

if (isAuthenticated()) {
  window.location.href = 'profile.html';
}

function showError(el, message) {
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  el.classList.add('visible-error');
}

function hideError(el) {
  if (!el) return;
  el.hidden = true;
  el.classList.remove('visible-error');
}

function setBusy(form, busy, busyText = 'Please wait...') {
  const btn = form.querySelector('button[type="submit"]');
  if (!btn) return;
  btn.disabled = busy;
  btn.dataset.originalText ??= btn.textContent;
  
  if (busy) {
    btn.innerHTML = `<span class="btn-spinner"></span> ${busyText}`;
  } else {
    btn.textContent = btn.dataset.originalText;
  }
}

function wireSignIn() {
  const form = document.getElementById('signInForm');
  const errorEl = document.getElementById('signInError');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError(errorEl);
    const identifier = document.getElementById('signinIdentifier').value.trim();
    const password = document.getElementById('signinPassword').value;

    setBusy(form, true, 'Signing in...');
    try {
      await login(identifier, password);
      window.location.href = 'profile.html';
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not reach theKapita API server. Check your connection.';
      showError(errorEl, message);
    } finally {
      setBusy(form, false);
    }
  });
}

function wireSignUp() {
  const form = document.getElementById('signUpForm');
  const errorEl = document.getElementById('signUpError');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError(errorEl);

    const fields = {
      fullName: document.getElementById('signupFullName').value.trim(),
      email: document.getElementById('signupEmail').value.trim(),
      phone: document.getElementById('signupPhone').value.trim(),
      password: document.getElementById('signupPassword').value,
    };

    const { valid, errors } = validateRegisterForm(fields);
    if (!valid) {
      showError(errorEl, Object.values(errors)[0]);
      return;
    }

    setBusy(form, true, 'Creating Account...');
    try {
      await register(fields);
      window.location.href = 'profile.html';
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not reach theKapita API server. Check your connection.';
      showError(errorEl, message);
    } finally {
      setBusy(form, false);
    }
  });
}

wireSignIn();
wireSignUp();

function switchAuthMode(mode) {
  const signInForm = document.getElementById('signInForm');
  const signUpForm = document.getElementById('signUpForm');
  const tabSignIn = document.getElementById('tabSignIn');
  const tabSignUp = document.getElementById('tabSignUp');

  if (mode === 'signin') {
    signInForm.classList.add('active');
    signUpForm.classList.remove('active');
    tabSignIn.classList.add('active');
    tabSignUp.classList.remove('active');
  } else {
    signUpForm.classList.add('active');
    signInForm.classList.remove('active');
    tabSignUp.classList.add('active');
    tabSignIn.classList.remove('active');
  }
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const eyeOpenPaths = btn.querySelectorAll('.eye-open');
  const eyeClosedPath = btn.querySelector('.eye-closed');
  if (input.type === 'password') {
    input.type = 'text';
    eyeOpenPaths.forEach((path) => (path.style.display = 'none'));
    if (eyeClosedPath) eyeClosedPath.style.display = 'block';
  } else {
    input.type = 'password';
    eyeOpenPaths.forEach((path) => (path.style.display = 'block'));
    if (eyeClosedPath) eyeClosedPath.style.display = 'none';
  }
}

function handleSocialConnect(provider) {
  alert(`Connecting with ${provider}... (not yet wired to a real OAuth flow)`);
}

let googleScript;
function loadGoogleScript() {
  googleScript ||= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load Google sign-in.'));
    document.head.appendChild(script);
  });
  return googleScript;
}

async function onGoogleCredential({ credential }) {
  const errorEl = document.getElementById('signInError') || document.getElementById('signUpError');
  try {
    await loginWithGoogle(credential);
    window.location.href = 'profile.html';
  } catch (err) {
    showError(errorEl, err instanceof ApiError ? err.message : 'Could not reach theKapita API server.');
  }
}

async function initGoogleSignIn() {
  const holder = document.getElementById('googleSignIn');
  if (!holder) return;
  if (!GOOGLE_CLIENT_ID) {
    holder.hidden = true;
    return;
  }
  try {
    await loadGoogleScript();
  } catch {
    holder.hidden = true;
    return;
  }
  window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onGoogleCredential });
  window.google.accounts.id.renderButton(holder, {
    theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', width: holder.clientWidth || 280,
  });
}

document.addEventListener('DOMContentLoaded', initGoogleSignIn);

window.switchAuthMode = switchAuthMode;
window.togglePasswordVisibility = togglePasswordVisibility;
window.handleSocialConnect = handleSocialConnect;