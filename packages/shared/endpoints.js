
export const ENDPOINTS = Object.freeze({
  auth: {
    register: '/auth/register',
    login: '/auth/login',
    google: '/auth/google',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
  },
  profile: {
    me: '/profile/me',
  },
  wallet: {
    balance: '/wallet/balance',
    analytics: '/wallet/analytics',
    fund: '/wallet/fund',
    send: '/wallet/send',
    transactions: '/wallet/transactions',
    beneficiaries: '/wallet/beneficiaries',
  },
});
