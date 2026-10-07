/**
 * Deliberately the same shape as apps/web/src/api/client.js: a dumb
 * request() with no token awareness, wrapped by state/session.js for auth.
 * The two files aren't literally shared (fetch exists in both environments
 * but the base-URL source differs), but keeping the same interface means
 * anyone who's read one has read the other.
 */
import Constants from 'expo-constants';

const BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl ?? 'http://127.0.0.1:8000/api';

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail || `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
  }
}

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
    // 204 No Content or similar
  }

  if (!res.ok) {
    throw new ApiError(res.status, data?.detail);
  }
  return data;
}

/**
 * RN has no built-in crypto.randomUUID() the way browsers do (support
 * varies by JS engine/Hermes version) — a small RFC4122-v4-shaped fallback
 * avoids adding a native module just for this. Swap for
 * `expo-crypto`'s randomUUID() if you're already pulling that package in
 * for something else.
 */
export function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
