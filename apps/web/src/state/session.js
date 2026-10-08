/**
 * SINGLE OWNER of session state (JWT tokens + the signed-in user).
 *
 * Every other module reads session state through the functions exported
 * here — none of them touch localStorage directly, and none of them keep
 * their own copy of the user's name/email/kapita_id. That's the specific
 * rule this file exists to enforce: it's the fix for the ₦184,500 vs
 * ₦245,500 class of bug, applied to identity instead of balance.
 */
import { request, ApiError } from '../api/client.js';
import { ENDPOINTS } from '@thekapita/shared/endpoints';

const STORAGE_KEY = 'kapita.session.v1';

function emptyState() {
  return { accessToken: null, refreshToken: null, user: null };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : emptyState();
  } catch {
    return emptyState();
  }
}

let state = load();
const listeners = new Set();

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  listeners.forEach((fn) => fn(state));
}

/** Call from any page to react to login/logout/profile changes, e.g.
 * updating the header avatar the moment hydrateProfile() resolves. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSession() {
  return state;
}
export function getAccessToken() {
  return state.accessToken;
}
export function isAuthenticated() {
  return Boolean(state.accessToken);
}
export function getCurrentUser() {
  return state.user;
}

function applyTokens(tokens) {
  state = { ...state, accessToken: tokens.access_token, refreshToken: tokens.refresh_token };
  persist();
}

export async function login(identifier, password) {
  const tokens = await request(ENDPOINTS.auth.login, { method: 'POST', body: { identifier, password } });
  applyTokens(tokens);
  await hydrateProfile();
}

export async function register({ fullName, email, phone, password }) {
  const tokens = await request(ENDPOINTS.auth.register, {
    method: 'POST',
    body: { full_name: fullName, email, phone, password },
  });
  applyTokens(tokens);
  await hydrateProfile();
}

export async function hydrateProfile() {
  const user = await authorizedRequest(ENDPOINTS.profile.me);
  state = { ...state, user };
  persist();
  return user;
}

export async function updateProfile(profile) {
  const user = await authorizedRequest(ENDPOINTS.profile.me, {
    method: 'PATCH',
    body: profile,
  });
  state = { ...state, user };
  persist();
  return user;
}

export function logout() {
  state = emptyState();
  persist();
}

/**
 * Every other state module (ledger.js, a future cart-checkout call, etc.)
 * should call protected endpoints through this, not through the raw
 * request() in api/client.js — this is the one place that knows how to
 * silently refresh an expired access token and retry exactly once before
 * giving up and surfacing the error.
 */
export async function authorizedRequest(path, opts = {}) {
  const attempt = () =>
    request(path, {
      ...opts,
      headers: { ...(opts.headers || {}), Authorization: `Bearer ${state.accessToken}` },
    });

  try {
    return await attempt();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && state.refreshToken) {
      const tokens = await request(ENDPOINTS.auth.refresh, {
        method: 'POST',
        body: { refresh_token: state.refreshToken },
      });
      applyTokens(tokens);
      return attempt();
    }
    throw err;
  }
}
