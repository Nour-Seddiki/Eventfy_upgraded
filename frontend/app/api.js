// Thin fetch wrapper around the Eventfy API.
// The token lives under the same localStorage key the organizer/admin
// pages (../api.js) use, so signing in here signs you in there too.

const BASE = window.EVENTFY_API_BASE || 'http://localhost:8000';
const TOKEN_KEY = 'eventfy_token';
const USER_KEY = 'eventfy_user';

export const apiBase = BASE;

export const token = {
  get() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* private mode */ } },
  clear() {
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch { /* private mode */ }
  },
};

/** Cache the profile where ../api.js (organizer/admin pages) expects it. */
export function cacheUser(profile) {
  try { localStorage.setItem(USER_KEY, JSON.stringify(profile)); } catch { /* private mode */ }
}

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

/**
 * @param {string} path  e.g. '/events/public?limit=100'
 * @param {{method?: string, json?: any, form?: FormData|URLSearchParams, auth?: boolean}} opts
 */
export async function api(path, { method = 'GET', json, form, auth = true } = {}) {
  const headers = {};
  const t = token.get();
  if (auth && t) headers.Authorization = `Bearer ${t}`;
  let body;
  if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  else if (form) body = form;

  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body });
  } catch {
    throw new ApiError('Could not reach the Eventfy server. Check your connection.', 0);
  }
  if (res.status === 401 && auth && t) onUnauthorized();
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data && data.detail;
    const msg = typeof detail === 'string' ? detail
      : Array.isArray(detail) ? detail.map(d => d.msg).join(', ')
      : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return data;
}

/** Resolve an image path from the API (relative /uploads/... or absolute URL). */
export function assetUrl(path) {
  if (!path) return null;
  return /^https?:/.test(path) ? path : BASE + path;
}

export function ticketQrUrl(ticketId) {
  return `${BASE}/ticket/${encodeURIComponent(ticketId)}/qr`;
}
