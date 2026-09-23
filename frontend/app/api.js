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

const FIELD_LABELS = {
  title: 'Title', description: 'Description', location: 'Location', price: 'Price',
  currency: 'Currency', available_tickets: 'Number of seats', start_date: 'Start date',
  end_date: 'End date', registration_deadline: 'Registration deadline', image: 'Image',
  email: 'Email', user_name: 'Username', username: 'Username', password: 'Password',
  current_password: 'Current password', new_password: 'New password', full_name: 'Full name',
  phone: 'Phone', website: 'Website', bio: 'Bio', rating: 'Rating', answers: 'Answers',
};

/** One FastAPI/Pydantic validation error → a sentence ("Title must be at most 50 characters"). */
function describeValidationError(e) {
  const loc = Array.isArray(e.loc) ? e.loc.filter(p => p !== 'body' && p !== 'query' && p !== 'path') : [];
  const key = loc.length ? loc[loc.length - 1] : '';
  const field = FIELD_LABELS[key] || (typeof key === 'string' && key ? key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) : '');
  const ctx = e.ctx || {};
  const byType = {
    missing: 'is required',
    string_too_short: ctx.min_length === 1 ? 'is required' : `must be at least ${ctx.min_length} characters`,
    string_too_long: `must be at most ${ctx.max_length} characters`,
    greater_than_equal: `must be at least ${ctx.ge}`,
    greater_than: `must be more than ${ctx.gt}`,
    less_than_equal: `must be at most ${ctx.le}`,
    int_parsing: 'must be a whole number', int_from_float: 'must be a whole number',
    float_parsing: 'must be a number', datetime_parsing: 'must be a valid date and time',
    datetime_from_date_parsing: 'must be a valid date and time', value_error: null,
  };
  const phrase = byType[e.type];
  if (phrase) return field ? `${field} ${phrase}` : phrase.replace(/^./, c => c.toUpperCase());
  const msg = String(e.msg || 'is invalid').replace(/^(Value|Assertion) error,\s*/i, '');
  // Model-level rules (no field), and messages that already name their field, read as full sentences
  if (!field || msg.toLowerCase().startsWith(field.toLowerCase())) return msg.replace(/^./, c => c.toUpperCase());
  return `${field}: ${msg.replace(/^./, c => c.toLowerCase())}`;
}

/** Turn an API error body into a message people can act on. */
export function apiErrorMessage(body, fallback = 'Something went wrong. Please try again.') {
  const d = body && body.detail;
  if (typeof d === 'string' && d.trim()) return d;
  if (Array.isArray(d) && d.length) return d.map(describeValidationError).join(' · ');
  if (d && typeof d.message === 'string') return d.message;  // {field, message}
  return fallback;
}

export class ApiError extends Error {
  /** field: the form field the server blamed ({detail: {field, message}}), if any */
  constructor(message, status, field = null) { super(message); this.status = status; this.field = field; }
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
    const fallback = res.status >= 500 ? 'The server had a problem. Please try again in a moment.' : `Request failed (${res.status})`;
    const field = data && data.detail && typeof data.detail.field === 'string' ? data.detail.field : null;
    throw new ApiError(apiErrorMessage(data, fallback), res.status, field);
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
