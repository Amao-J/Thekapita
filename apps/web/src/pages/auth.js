import { login, register, isAuthenticated } from '../state/session.js';
import { validateRegisterForm } from '@thekapita/shared/validators';
import { ApiError } from '../api/client.js';

// If a token already exists (e.g. the user hit back after signing in),
// don't make them log in again.
if (isAuthenticated()) {
  window.location.href = 'profile.html';
}

function showError(el, message) {
  el.textContent = message;
  el.hidden = false;
}
function hideError(el) {
  el.hidden = true;
}
function setBusy(form, busy) {
  const btn = form.querySelector('button[type="submit"]');
  if (!btn) return;
  btn.disabled = busy;
  btn.dataset.originalText ??= btn.textContent;
  btn.textContent = busy ? 'Please wait…' : btn.dataset.originalText;
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

    setBusy(form, true);
    try {
      await login(identifier, password);
      window.location.href = 'profile.html';
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not reach theKapita. Check your connection and try again.';
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

    setBusy(form, true);
    try {
      await register(fields);
      window.location.href = 'profile.html';
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not reach theKapita. Check your connection and try again.';
      showError(errorEl, message);
    } finally {
      setBusy(form, false);
    }
  });
}

wireSignIn();
wireSignUp();

/* ---- Pure UI helpers below: still bridged onto window because the HTML
   keeps their onclick="..." attributes for now (tab switching, the
   password show/hide eye icon). Nothing security- or state-relevant lives
   in these two — that's why they're the ones left as a bridge rather than
   rewired to addEventListener like the two form submissions above. */

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
  // TODO(backend): real OAuth — this stub is unchanged from the vanilla
  // scaffold, just moved into the module so it doesn't silently error now
  // that auth.js is no longer a global script.
  alert(`Connecting with ${provider}... (not yet wired to a real OAuth flow)`);
}

window.switchAuthMode = switchAuthMode;
window.togglePasswordVisibility = togglePasswordVisibility;
window.handleSocialConnect = handleSocialConnect;
