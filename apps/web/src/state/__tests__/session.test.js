import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getSession,
  getAccessToken,
  isAuthenticated,
  getCurrentUser,
  login,
  register,
  logout,
  authorizedRequest,
  subscribe,
  hydrateProfile,
} from '../session.js';
import { ApiError } from '../../api/client.js';

// Mock the client request method
vi.mock('../../api/client.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    request: vi.fn(),
  };
});

import { request } from '../../api/client.js';

function accessTokenWithExpiry(exp) {
  const payload = btoa(JSON.stringify({ exp }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `header.${payload}.signature`;
}

describe('session state & retry logic', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      store: {},
      getItem(key) { return this.store[key] ?? null; },
      setItem(key, value) { this.store[key] = String(value); },
      removeItem(key) { delete this.store[key]; },
      clear() { this.store = {}; },
    });
    vi.stubGlobal('window', { location: { href: '' } });
    vi.clearAllMocks();
    request.mockResolvedValue({});
    localStorage.clear();
    logout(); // Resets session module state before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts in an unauthenticated state', () => {
    expect(isAuthenticated()).toBe(false);
    expect(getAccessToken()).toBeNull();
    expect(getCurrentUser()).toBeNull();
  });

  it('successfully logs in, saves tokens, and hydrates profile', async () => {
    // 1st call: login returns tokens
    request.mockResolvedValueOnce({
      access_token: 'acc_123',
      refresh_token: 'ref_456',
    });
    // 2nd call: hydrateProfile fetches user details
    request.mockResolvedValueOnce({
      id: 'u1',
      full_name: 'Test User',
      email: 'test@kapita.com',
    });

    await login('test@kapita.com', 'password123');

    expect(isAuthenticated()).toBe(true);
    expect(getAccessToken()).toBe('acc_123');
    expect(getCurrentUser()).toEqual({
      id: 'u1',
      full_name: 'Test User',
      email: 'test@kapita.com',
    });
    expect(localStorage.getItem('kapita.session.v1')).toContain('acc_123');
  });

  it('successfully registers, saves tokens, and hydrates profile', async () => {
    request.mockResolvedValueOnce({
      access_token: 'acc_reg',
      refresh_token: 'ref_reg',
    });
    request.mockResolvedValueOnce({
      id: 'u2',
      full_name: 'New User',
      email: 'new@kapita.com',
    });

    await register({
      fullName: 'New User',
      email: 'new@kapita.com',
      phone: '08012345678',
      password: 'securepass',
    });

    expect(isAuthenticated()).toBe(true);
    expect(getAccessToken()).toBe('acc_reg');
    expect(getCurrentUser().full_name).toBe('New User');
  });

  it('clears session state on logout', async () => {
    // Seed logged-in state
    request.mockResolvedValueOnce({ access_token: 'acc_123', refresh_token: 'ref_456' });
    request.mockResolvedValueOnce({ id: 'u1', full_name: 'Test User' });
    await login('test@kapita.com', 'password123');

    logout();

    expect(isAuthenticated()).toBe(false);
    expect(getAccessToken()).toBeNull();
    expect(getCurrentUser()).toBeNull();
    expect(localStorage.getItem('kapita.session.v1')).toContain('null');
  });

  it('notifies subscribers whenever session state changes', async () => {
    const subscriber = vi.fn();
    const unsubscribe = subscribe(subscriber);

    request.mockResolvedValueOnce({ access_token: 'acc_123', refresh_token: 'ref_456' });
    request.mockResolvedValueOnce({ id: 'u1', full_name: 'Test User' });

    await login('test@kapita.com', 'password123');

    expect(subscriber).toHaveBeenCalled();
    unsubscribe();
  });

  describe('authorizedRequest (Silent 401 Refresh & Retry Logic)', () => {
    it('executes a protected request with the Authorization header', async () => {
      // Seed initial tokens
      request.mockResolvedValueOnce({ access_token: 'valid_token', refresh_token: 'ref_token' });
      request.mockResolvedValueOnce({ id: 'u1' });
      await login('user', 'pass');

      request.mockResolvedValueOnce({ data: 'wallet_data' });

      const res = await authorizedRequest('/wallet/balance');

      expect(res).toEqual({ data: 'wallet_data' });
      expect(request).toHaveBeenLastCalledWith('/wallet/balance', {
        headers: { Authorization: 'Bearer valid_token' },
      });
    });

    it('silently refreshes token on 401 error and retries request once', async () => {
      // Seed tokens
      request.mockResolvedValueOnce({ access_token: 'expired_token', refresh_token: 'valid_refresh' });
      request.mockResolvedValueOnce({ id: 'u1' });
      await login('user', 'pass');

      // 1st request fails with 401 ApiError
      request.mockRejectedValueOnce(new ApiError(401, 'Token expired'));
      // 2nd request (refresh endpoint) succeeds with new tokens
      request.mockResolvedValueOnce({
        access_token: 'new_fresh_token',
        refresh_token: 'new_refresh_token',
      });
      // 3rd request (retried original call) succeeds
      request.mockResolvedValueOnce({ balance: 245500 });

      const res = await authorizedRequest('/wallet/balance');

      expect(res).toEqual({ balance: 245500 });
      expect(getAccessToken()).toBe('new_fresh_token');
    });

    it('refreshes a near-expiry JWT before making a protected request', async () => {
      request.mockResolvedValueOnce({
        access_token: accessTokenWithExpiry(Math.floor(Date.now() / 1000) + 5),
        refresh_token: 'valid_refresh',
      });
      request.mockResolvedValueOnce({ id: 'u1' });
      await login('user', 'pass');
      request.mockResolvedValueOnce({ access_token: 'fresh_token', refresh_token: 'fresh_refresh' });
      request.mockResolvedValueOnce({ balance: 100 });

      const result = await authorizedRequest('/wallet/balance');

      expect(result).toEqual({ balance: 100 });
      expect(request).toHaveBeenNthCalledWith(3, '/auth/refresh', {
        method: 'POST',
        body: { refresh_token: 'valid_refresh' },
      });
    });

    it('clears an access-only legacy session when a protected request returns 401', async () => {
      request.mockResolvedValueOnce({ access_token: 'stale_access_token' });
      request.mockResolvedValueOnce({ id: 'u1' });
      await login('user', 'pass');
      request.mockRejectedValueOnce(new ApiError(401, 'Invalid token'));

      await expect(authorizedRequest('/wallet/balance')).rejects.toThrow('Invalid token');

      expect(isAuthenticated()).toBe(false);
      expect(getAccessToken()).toBeNull();
    });

    it('throws error when initial request fails with non-401 error', async () => {
      request.mockResolvedValueOnce({ access_token: 'acc_token', refresh_token: 'ref_token' });
      request.mockResolvedValueOnce({ id: 'u1' });
      await login('user', 'pass');

      request.mockRejectedValueOnce(new ApiError(500, 'Server error'));

      await expect(authorizedRequest('/wallet/balance')).rejects.toThrow('Server error');
    });

    it('throws error when refresh attempt itself fails during 401 retry', async () => {
      request.mockResolvedValueOnce({ access_token: 'expired_token', refresh_token: 'bad_refresh' });
      request.mockResolvedValueOnce({ id: 'u1' });
      await login('user', 'pass');

      // Failed request -> Failed refresh
      request.mockRejectedValueOnce(new ApiError(401, 'Token expired'));
      request.mockRejectedValueOnce(new ApiError(401, 'Invalid refresh token'));

      await expect(authorizedRequest('/wallet/balance')).rejects.toThrow('Invalid refresh token');
    });
  });
});