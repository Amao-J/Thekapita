/**
 * Deliberately dumb: no session/token awareness here. state/session.js
 * wraps this with auth headers and 401-refresh-retry logic. Keeping this
 * file pure makes it trivial to point at a different base URL per
 * environment (see BASE_URL below) without touching auth logic at all.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';
const DEFAULT_TIMEOUT_MS = 10000; // 10s network timeout for live API calls

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail || `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * @param {string} path - e.g. '/wallet/balance' (see packages/shared/endpoints.js)
 * @param {{method?: string, body?: object, headers?: object, timeout?: number}} options
 */
export async function request(path, { method = 'GET', body, headers = {}, timeout = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    let data = null;
    try {
      data = await res.json();
    } catch {
      // 204 No Content or non-JSON body
    }

    if (!res.ok) {
      throw new ApiError(res.status, data?.detail);
    }
    return data;
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      throw new ApiError(408, 'Request timed out. The server is taking too long to respond.');
    }
    if (err instanceof ApiError) {
      throw err;
    }
    // Handles offline or network drop errors ("Failed to fetch")
    throw new ApiError(0, 'Network connection lost. Please check your internet connection and try again.');
  }
}

/** One idempotency key per user action */
export function newIdempotencyKey() {
  return crypto.randomUUID();
}