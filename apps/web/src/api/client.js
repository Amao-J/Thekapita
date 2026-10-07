/**
 * Deliberately dumb: no session/token awareness here. state/session.js
 * wraps this with auth headers and 401-refresh-retry logic. Keeping this
 * file pure makes it trivial to point at a different base URL per
 * environment (see BASE_URL below) without touching auth logic at all.
 */

// Vite exposes import.meta.env.* from a .env file or the shell environment.
// Falls back to local Django dev server if nothing is set.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail || `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * @param {string} path - e.g. '/wallet/balance' (see packages/shared/endpoints.js)
 * @param {{method?: string, body?: object, headers?: object}} options
 */
export async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // 204 No Content or similar — no body to parse, that's fine.
  }

  if (!res.ok) {
    throw new ApiError(res.status, data?.detail);
  }
  return data;
}

/** One idempotency key per user action — generate fresh at the moment the
 * user clicks "Send" or "Fund", not per render, so a re-render never
 * silently reuses a stale key. */
export function newIdempotencyKey() {
  return crypto.randomUUID();
}
