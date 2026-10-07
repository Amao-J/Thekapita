/**
 * SINGLE OWNER of session state on mobile, exactly as
 * apps/web/src/state/session.js is on web — same exported functions, same
 * behavior, different storage backend underneath (SecureStore's encrypted
 * keychain/keystore instead of localStorage, since a stolen phone is a much
 * more realistic threat model than a stolen browser tab).
 *
 * NOTE: SecureStore is synchronous-feeling but its API is async — every
 * function here that touches storage is async, unlike the web version's
 * synchronous localStorage reads. Callers (screens) already await these.
 */
import * as SecureStore from 'expo-secure-store';
import { request, ApiError } from '../api/client.js';
import { ENDPOINTS } from '@thekapita/shared/endpoints';

const ACCESS_KEY = 'kapita.accessToken';
const REFRESH_KEY = 'kapita.refreshToken';

let state = { accessToken: null, refreshToken: null, user: null };
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSession() {
  return state;
}
export function isAuthenticated() {
  return Boolean(state.accessToken);
}
export function getCurrentUser() {
  return state.user;
}

/** Call once at app startup, before rendering the navigator, to restore a
 * previous session from the secure store. */
export async function restoreSession() {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  state = { ...state, accessToken, refreshToken };
  if (accessToken) {
    try {
      await hydrateProfile();
    } catch {
      // Stored token is dead (expired/revoked) — clear it rather than
      // leave the app thinking it's signed in when every call will 401.
      await logout();
    }
  }
  notify();
}

async function applyTokens(tokens) {
  state = { ...state, accessToken: tokens.access_token, refreshToken: tokens.refresh_token };
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, tokens.access_token),
    SecureStore.setItemAsync(REFRESH_KEY, tokens.refresh_token),
  ]);
  notify();
}

export async function login(identifier, password) {
  const tokens = await request(ENDPOINTS.auth.login, { method: 'POST', body: { identifier, password } });
  await applyTokens(tokens);
  await hydrateProfile();
}

export async function register({ fullName, email, phone, password }) {
  const tokens = await request(ENDPOINTS.auth.register, {
    method: 'POST',
    body: { full_name: fullName, email, phone, password },
  });
  await applyTokens(tokens);
  await hydrateProfile();
}

export async function hydrateProfile() {
  const user = await authorizedRequest(ENDPOINTS.profile.me);
  state = { ...state, user };
  notify();
  return user;
}

export async function logout() {
  state = { accessToken: null, refreshToken: null, user: null };
  await Promise.all([SecureStore.deleteItemAsync(ACCESS_KEY), SecureStore.deleteItemAsync(REFRESH_KEY)]);
  notify();
}

/** Same role as the web version: the one place that knows how to silently
 * refresh an expired access token and retry once. */
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
      await applyTokens(tokens);
      return attempt();
    }
    throw err;
  }
}
