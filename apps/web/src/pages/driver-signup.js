import { authorizedRequest, isAuthenticated } from '../state/session.js';
import { ApiError } from '../api/client.js';
import { ENDPOINTS } from '@thekapita/shared/endpoints';
import { $ } from '../ui/dom.js';

const PORTAL = 'driver.html';

function showError(message) {
  const box = $('signupError');
  box.textContent = message;
  box.style.display = message ? 'block' : 'none';
}

async function init() {
  if (!isAuthenticated()) {
    window.location.replace('auth.html?next=driver-signup.html');
    return;
  }
  try {
    // Already registered? Skip the form.
    await authorizedRequest(ENDPOINTS.driver.me);
    window.location.replace(PORTAL);
    return;
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 403)) {
      showError(err?.message || 'Could not reach theKapita. Check your connection and try again.');
    }
    // 403 = not a driver yet, which is exactly why the form is here.
  }

  $('driverSignupForm').addEventListener('submit', onSubmit);
}

async function onSubmit(event) {
  event.preventDefault();
  showError('');
  const rideTypes = [...document.querySelectorAll('input[name="rideTypes"]:checked')].map((i) => i.value);
  const body = {
    phone: $('dsPhone').value.trim(),
    vehicle: $('dsVehicle').value.trim(),
    plate_number: $('dsPlate').value.trim(),
    ride_types: rideTypes,
  };
  if (!body.phone || !body.vehicle || !body.plate_number) return showError('Please fill in every field.');
  if (!rideTypes.length) return showError('Choose at least one ride type.');

  const button = $('dsSubmit');
  button.disabled = true;
  button.textContent = 'Registering...';
  try {
    await authorizedRequest(ENDPOINTS.driver.register, { method: 'POST', body });
    window.location.replace(PORTAL);
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Could not reach theKapita. Check your connection.');
    button.disabled = false;
    button.textContent = 'Register as a driver';
  }
}

init();
