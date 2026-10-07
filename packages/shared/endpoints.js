/**
 * Single source of truth for API paths. Mirrors backend_integration/api.py
 * route-for-route. If a path changes on the backend, this is the one file
 * that needs updating — apps/web and apps/mobile both import from here
 * instead of hardcoding strings, which is exactly the pattern that was
 * missing when the wallet balance drifted between profile.html and
 * wallet.html in the original scaffold.
 */
export const ENDPOINTS = Object.freeze({
  auth: {
    register: '/auth/register',
    login: '/auth/login',
    refresh: '/auth/refresh',
  },
  profile: {
    me: '/profile/me',
  },
  wallet: {
    balance: '/wallet/balance',
    fund: '/wallet/fund',
    send: '/wallet/send',
  },
});
