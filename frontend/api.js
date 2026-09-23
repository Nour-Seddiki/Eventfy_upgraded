/**
 * ═══════════════════════════════════════════
 * api.js — Shared Eventfy API Helper
 * Single source of truth for backend communication,
 * JWT token management, and auth state.
 * ═══════════════════════════════════════════
 */
'use strict';

// Use config.js value, with fallback
const API_BASE = window.EVENTFY_API_BASE || (
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:8000'
    : 'https://eventfy-backend-exhu.onrender.com'
);

/* ── Token Management ────────────────────── */

/** @returns {string|null} The stored JWT token */
function getToken() {
  return localStorage.getItem('eventfy_token');
}

/** @param {string} token */
function setToken(token) {
  localStorage.setItem('eventfy_token', token);
}

function clearToken() {
  localStorage.removeItem('eventfy_token');
  localStorage.removeItem('eventfy_user');
}

/** @returns {boolean} */
function isLoggedIn() {
  return !!getToken();
}

/** @returns {object|null} Cached user profile */
function getCachedUser() {
  try {
    return JSON.parse(localStorage.getItem('eventfy_user'));
  } catch {
    return null;
  }
}

/** @param {object} user */
function setCachedUser(user) {
  localStorage.setItem('eventfy_user', JSON.stringify(user));
}

/**
 * Get the relative path to the login page from the current page.
 * Works from any directory depth (dashboard/, org-profile/, etc.)
 */
function getLoginPath() {
  // Sign-in lives in the v4 app at the frontend root; these pages are one level down.
  return '../index.html#/signin';
}

/* ── API Error Messages ───────────────────── */
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
function apiErrorMessage(body, fallback = 'Something went wrong. Please try again.') {
  const d = body && body.detail;
  if (typeof d === 'string' && d.trim()) return d;
  if (Array.isArray(d) && d.length) return d.map(describeValidationError).join(' · ');
  return fallback;
}

/* ── API Fetch Helper ────────────────────── */

/**
 * Fetch wrapper that auto-attaches JWT Bearer token.
 * @param {string} path    - API path, e.g. '/users/my_profile'
 * @param {object} options - Fetch options (method, body, headers…)
 * @returns {Promise<Response>}
 */
async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Auto-set JSON content type for POST/PUT unless FormData or URLSearchParams
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !(options.body instanceof URLSearchParams) &&
    !headers['Content-Type']
  ) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // Auto-logout on 401
  if (response.status === 401) {
    clearToken();
    const loc = window.location.pathname;
    if (!loc.includes('/login') && !loc.includes('/signup')) {
      window.location.href = getLoginPath();
    }
  }

  // Check for restricted user on 403
  if (response.status === 403) {
    const errData = await response.clone().json().catch(() => ({}));
    if (errData.detail && errData.detail.toLowerCase().includes('restricted')) {
      showRestrictionToast(errData.detail);
    }
  }

  return response;
}

/* ── Auth API Calls ──────────────────────── */

/**
 * Login with email + password.
 * FastAPI OAuth2 expects x-www-form-urlencoded with 'username' field.
 */
async function apiLogin(email, password) {
  const body = new URLSearchParams();
  body.append('username', email);   // OAuth2 form field name
  body.append('password', password);

  const res = await fetch(`${API_BASE}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(apiErrorMessage(err, 'Login failed'));
  }

  const data = await res.json();
  setToken(data.access_token);

  // Fetch & cache user profile right after login
  try {
    const profile = await fetchMyProfile();
    setCachedUser(profile);
    localStorage.setItem('eventfy_currency', profile.preferred_currency || 'DZD');
    checkRestrictionStatus();
  } catch { /* non-critical */ }

  return data;
}

/**
 * Register a new user.
 * @param {object} userData - { user_name, email, password, role }
 */
async function apiSignup(userData) {
  const res = await fetch(`${API_BASE}/auth/sign_up`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(apiErrorMessage(err, 'Registration failed'));
  }

  return await res.json();
}

/**
 * Render the official Google button into #containerId.
 * The OAuth client id comes from the backend (/auth/google/config), so it
 * always matches the id the backend verifies tokens against.
 * @param {string} containerId
 * @param {(response: {credential: string}) => void} onCredential
 * @param {object} buttonOptions - extra google.accounts.id.renderButton options
 * @returns {Promise<boolean>} false (and the container hidden) if Google sign-in is unavailable
 */
async function initGoogleButton(containerId, onCredential, buttonOptions = {}) {
  const container = document.getElementById(containerId);
  if (!container) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/google/config`);
    const { client_id: clientId } = res.ok ? await res.json() : {};
    if (!clientId) throw new Error('no client id configured');
    if (!(await waitForGoogleScript())) throw new Error('Google script did not load');

    google.accounts.id.initialize({ client_id: clientId, callback: onCredential });
    google.accounts.id.renderButton(container, { theme: 'outline', size: 'large', locale: 'en', ...buttonOptions });
    return true;
  } catch (err) {
    console.warn('[Eventfy] Google sign-in unavailable:', err.message);
    container.style.display = 'none';
    return false;
  }
}

/** Resolve true once the async Google Identity Services script is ready. */
function waitForGoogleScript(timeoutMs = 10000) {
  return new Promise(resolve => {
    const start = Date.now();
    (function check() {
      if (window.google && google.accounts && google.accounts.id) return resolve(true);
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(check, 100);
    })();
  });
}

/**
 * Login / register via Google One Tap.
 * Sends the Google ID token to the backend, which verifies it,
 * creates the user if needed, and returns a JWT.
 * @param {string} idToken - Google credential JWT
 */
async function apiGoogleLogin(idToken) {
  const res = await fetch(`${API_BASE}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: idToken }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(apiErrorMessage(err, 'Google sign-in failed'));
  }

  const data = await res.json();
  setToken(data.access_token);

  // Fetch & cache user profile right after login
  try {
    const profile = await fetchMyProfile();
    setCachedUser(profile);
    localStorage.setItem('eventfy_currency', profile.preferred_currency || 'DZD');
    checkRestrictionStatus();
  } catch { /* non-critical */ }

  return data;
}

/* ── User API Calls ──────────────────────── */

/** @returns {Promise<object>} User profile */
async function fetchMyProfile() {
  const res = await apiFetch('/users/my_profile');
  if (!res.ok) throw new Error('Failed to fetch profile');
  return await res.json();
}

/** @returns {Promise<object>} User activity (tickets + events) */
async function fetchMyActivity() {
  const res = await apiFetch('/users/my_activity');
  if (!res.ok) throw new Error('Failed to fetch activity');
  return await res.json();
}

/** Update user profile (extended fields: full_name, bio, phone, location, website) */
async function updateMyProfile(data) {
  const res = await apiFetch('/users/update_profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(apiErrorMessage(err, 'Failed to update profile'));
  }
  return await res.json();
}

/* ── Event API Calls ─────────────────────── */

/** Fetch public events (no login needed) */
async function fetchPublicEvents(limit = 20) {
  const res = await fetch(`${API_BASE}/events/public?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch events');
  return await res.json();
}

/** Fetch trending events (no login needed) */
async function fetchTrendingEvents(limit = 5) {
  const res = await fetch(`${API_BASE}/events/trending?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch trending events');
  return await res.json();
}

/** Search events (no login needed) */
async function searchEvents(q = '', location = '') {
  const params = new URLSearchParams();
  if (q) params.append('q', q);
  if (location) params.append('location', location);

  const res = await fetch(`${API_BASE}/events/search?${params}`);
  if (!res.ok) throw new Error('Failed to search events');
  return await res.json();
}

/** Fetch a single event by ID (no login needed) */
async function fetchEventById(eventId) {
  const res = await fetch(`${API_BASE}/events/public/${eventId}`);
  if (!res.ok) throw new Error('Event not found');
  return await res.json();
}

/** Fetch organizer's events (requires auth) */
async function fetchMyEvents() {
  const res = await apiFetch('/Event/event_list');
  if (!res.ok) throw new Error('Failed to fetch my events');
  return await res.json();
}

/** Create a new event (requires auth, organizer role) */
async function createEvent(eventData) {
  const res = await apiFetch('/Event/create_event', {
    method: 'POST',
    body: JSON.stringify(eventData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(apiErrorMessage(err, 'Failed to create event'));
  }
  return await res.json();
}

/** Upload event image */
async function uploadEventImage(eventId, file) {
  const formData = new FormData();
  formData.append('image', file);

  const token = localStorage.getItem('eventfy_token');
  const res = await fetch(`${API_BASE}/Event/event/${eventId}/image`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(apiErrorMessage(err, 'Failed to upload image'));
  }
  return await res.json();
}

/** Upload user avatar */
async function uploadAvatar(file) {
  const formData = new FormData();
  formData.append('image', file);

  const token = localStorage.getItem('eventfy_token');
  const res = await fetch(`${API_BASE}/users/avatar`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(apiErrorMessage(err, 'Failed to upload avatar'));
  }
  return await res.json();
}

/** Update an event (requires auth, organizer role) */
async function updateEvent(eventId, eventData) {
  const res = await apiFetch(`/Event/update_event/${eventId}`, {
    method: 'PUT',
    body: JSON.stringify(eventData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(apiErrorMessage(err, 'Failed to update event'));
  }
  return await res.json();
}

/** Delete an event (requires auth, organizer role) */
async function deleteEvent(eventId) {
  const res = await apiFetch(`/Event/delete_event/${eventId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete event');
  return await res.json();
}

/** Fetch a single event for editing (requires auth) */
async function fetchEventForEdit(eventId) {
  const res = await apiFetch(`/Event/get_event_by_id/${eventId}`);
  if (!res.ok) throw new Error('Failed to fetch event for editing');
  return await res.json();
}

/* ── Ticket API Calls ────────────────────── */

/** Fetch user's tickets */
async function fetchMyTickets() {
  const res = await apiFetch('/ticket/get_user_tickets');
  if (!res.ok) throw new Error('Failed to fetch tickets');
  return await res.json();
}

/* ── Saved Events API Calls ──────────────── */

/** Fetch user's saved events */
async function fetchSavedEvents() {
  const res = await apiFetch('/saving-events/my-saved-events');
  if (!res.ok) throw new Error('Failed to fetch saved events');
  return await res.json();
}

/** Save an event */
async function saveEvent(eventId) {
  const res = await apiFetch('/saving-events/save', {
    method: 'POST',
    body: JSON.stringify({ event_id: eventId }),
  });
  if (!res.ok) throw new Error('Failed to save event');
  return await res.json();
}

/** Unsave an event */
async function unsaveEvent(savingId) {
  const res = await apiFetch(`/saving-events/remove/${savingId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to unsave event');
  return await res.json();
}

/* ── Notification API Calls ──────────────── */

/** Fetch user's notifications */
async function fetchNotifications() {
  const res = await apiFetch('/notifications');
  if (!res.ok) throw new Error('Failed to fetch notifications');
  return await res.json();
}

/** Fetch unread notification count */
async function fetchUnreadCount() {
  const res = await apiFetch('/notifications/unread-count');
  if (!res.ok) return 0;
  const data = await res.json();
  return data.count || data.unread_count || 0;
}

/** Mark a single notification as read */
async function markNotificationRead(notifId) {
  const res = await apiFetch(`/notifications/${notifId}/read`, { method: 'PUT' });
  if (!res.ok) throw new Error('Failed to mark notification as read');
  return await res.json();
}

/** Mark all notifications as read */
async function markAllNotificationsRead() {
  const res = await apiFetch('/notifications/mark-all-as-read', { method: 'PUT' });
  if (!res.ok) throw new Error('Failed to mark all notifications as read');
  return await res.json();
}

/* ── Payment Verification ────────────────── */

/**
 * Verify a Chargily payment and fulfill the order.
 * Called from the payment success page to create the ticket
 * + notification without relying on the Chargily webhook.
 * @param {string} paymentId - Eventfy payment ID (from the success URL)
 */
async function verifyPayment(paymentId) {
  const res = await apiFetch(`/payment/verify/${encodeURIComponent(paymentId)}`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(apiErrorMessage(err, 'Payment verification failed'));
  }
  return await res.json();
}

/* ── Registration API Calls ──────────────── */

/** Fetch event questions (public — no auth needed) */
async function fetchEventQuestions(eventId) {
  const res = await fetch(`${API_BASE}/registrations/events/${eventId}/questions`);
  if (!res.ok) throw new Error('Failed to fetch event questions');
  return await res.json();
}

/** Submit registration form for an event */
async function submitRegistration(eventId, answers) {
  const res = await apiFetch(`/registrations/events/${eventId}/register`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(apiErrorMessage(err, 'Registration failed'));
  }
  return await res.json();
}

/** Fetch current user's registrations across all events */
async function fetchMyRegistrations() {
  const res = await apiFetch('/registrations/my-registrations');
  if (!res.ok) throw new Error('Failed to fetch registrations');
  return await res.json();
}

/** Save event questions (organizer — bulk save) */
async function saveEventQuestions(eventId, questions) {
  const res = await apiFetch(`/registrations/events/${eventId}/questions`, {
    method: 'POST',
    body: JSON.stringify({ questions }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(apiErrorMessage(err, 'Failed to save questions'));
  }
  return await res.json();
}

/** Delete a single event question */
async function deleteEventQuestion(questionId) {
  const res = await apiFetch(`/registrations/questions/${questionId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete question');
  return await res.json();
}

/** Fetch all registrations for an event (organizer) */
async function fetchEventRegistrations(eventId, statusFilter) {
  let url = `/registrations/events/${eventId}/registrations`;
  if (statusFilter) url += `?status=${statusFilter}`;
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to fetch registrations');
  return await res.json();
}

/** Fetch attendees (ticket holders) for an event (organizer) */
async function fetchEventAttendees(eventId) {
  const res = await apiFetch(`/ticket/events/${eventId}/attendees`);
  if (!res.ok) throw new Error('Failed to fetch attendees');
  return await res.json();
}

/** Fetch full detail of a single registration (organizer) */
async function fetchRegistrationDetail(registrationId) {
  const res = await apiFetch(`/registrations/${registrationId}`);
  if (!res.ok) throw new Error('Failed to fetch registration detail');
  return await res.json();
}

/** Approve or reject a registration (organizer) */
async function reviewRegistration(registrationId, action) {
  const res = await apiFetch(`/registrations/${registrationId}/review`, {
    method: 'PUT',
    body: JSON.stringify({ action }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(apiErrorMessage(err, 'Review action failed'));
  }
  return await res.json();
}

/* ── Restriction Checks ─────────────────── */

/** Show a restriction toast message */
function showRestrictionToast(message) {
  // Avoid duplicate toasts
  if (document.getElementById('restriction-toast')) return;
  const toast = document.createElement('div');
  toast.id = 'restriction-toast';
  toast.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#fef3c7,#fde68a);color:#92400e;padding:10px 24px;border-radius:12px;font-size:13px;font-weight:600;z-index:9998;box-shadow:0 4px 12px rgba(0,0,0,0.1);display:flex;align-items:center;gap:8px;max-width:90vw;';
  toast.innerHTML = '⚠️ ' + (message || 'Your account is restricted.');
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.transition = 'opacity 0.5s'; toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, 6000);
}

/** Check if user is restricted and show warning */
function checkRestrictionStatus() {
  const user = getCachedUser();
  if (user && user.is_restricted) {
    // Create a subtle persistent banner
    if (document.getElementById('restriction-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'restriction-banner';
    banner.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#fef3c7,#fde68a);color:#92400e;padding:10px 24px;border-radius:12px;font-size:13px;font-weight:600;z-index:9998;box-shadow:0 4px 12px rgba(0,0,0,0.1);display:flex;align-items:center;gap:8px;max-width:90vw;';
    banner.innerHTML = '⚠️ Your account is restricted. You can browse events but cannot purchase tickets or register.';
    document.body.appendChild(banner);
    // Auto-hide after 8 seconds
    setTimeout(() => { if (banner) { banner.style.transition = 'opacity 0.5s'; banner.style.opacity = '0'; setTimeout(() => banner.remove(), 500); } }, 8000);
  }
}

/* ── Logout ──────────────────────────────── */

function apiLogout() {
  clearToken();
  window.location.href = getLoginPath();
}

/* ── Custom Modals ───────────────────────── */

window.showConfirmModal = function(msg, confirmText = 'OK', cancelText = 'Cancel', type = 'warning') {
  return new Promise((resolve) => {
    const existing = document.getElementById('custom-confirm-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'custom-confirm-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:99999;opacity:0;transition:opacity 0.2s ease-out;';

    const iconColor = type === 'danger' ? '#ef4444' : '#f59e0b';
    const iconBg = type === 'danger' ? '#fef2f2' : '#fffbeb';
    const btnColor = type === 'danger' ? '#dc2626' : '#ea580c';
    
    const svg = type === 'danger' 
      ? '<svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>'
      : '<svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#ffffff;width:90%;max-width:400px;border-radius:16px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1),0 10px 10px -5px rgba(0,0,0,0.04);padding:24px;transform:scale(0.95) translateY(10px);transition:all 0.2s cubic-bezier(0.16,1,0.3,1);display:flex;flex-direction:column;gap:16px;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;';

    modal.innerHTML = `
      <div style="display:flex;gap:16px;align-items:flex-start;">
        <div style="width:48px;height:48px;border-radius:50%;background:${iconBg};color:${iconColor};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          ${svg}
        </div>
        <div style="padding-top:4px;">
          <h3 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#0f172a;">Are you sure?</h3>
          <p style="margin:0;font-size:14px;color:#475569;line-height:1.5;">${msg}</p>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:8px;">
        <button id="custom-confirm-cancel" style="padding:10px 16px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#475569;font-weight:500;font-size:14px;cursor:pointer;transition:background 0.2s;">${cancelText}</button>
        <button id="custom-confirm-ok" style="padding:10px 16px;border-radius:8px;border:none;background:${btnColor};color:#fff;font-weight:500;font-size:14px;cursor:pointer;transition:opacity 0.2s;">${confirmText}</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      modal.style.transform = 'scale(1) translateY(0)';
    });

    const close = (result) => {
      overlay.style.opacity = '0';
      modal.style.transform = 'scale(0.95) translateY(10px)';
      setTimeout(() => {
        overlay.remove();
        resolve(result);
      }, 200);
    };

    document.getElementById('custom-confirm-cancel').onclick = () => close(false);
    document.getElementById('custom-confirm-ok').onclick = () => close(true);
    
    // allow clicking overlay to cancel
    overlay.onclick = (e) => {
      if (e.target === overlay) close(false);
    };
  });
};

window.showAlertModal = function(msg, title = 'Notification', type = 'info') {
  return new Promise((resolve) => {
    const existing = document.getElementById('custom-alert-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'custom-alert-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:99999;opacity:0;transition:opacity 0.2s ease-out;';

    const iconColor = type === 'danger' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6';
    const iconBg = type === 'danger' ? '#fef2f2' : type === 'success' ? '#ecfdf5' : '#eff6ff';
    
    const svg = type === 'danger' 
      ? '<svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>'
      : type === 'success'
      ? '<svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>'
      : '<svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#ffffff;width:90%;max-width:400px;border-radius:16px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1),0 10px 10px -5px rgba(0,0,0,0.04);padding:24px;transform:scale(0.95) translateY(10px);transition:all 0.2s cubic-bezier(0.16,1,0.3,1);display:flex;flex-direction:column;gap:16px;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;';

    modal.innerHTML = `
      <div style="display:flex;gap:16px;align-items:flex-start;">
        <div style="width:48px;height:48px;border-radius:50%;background:${iconBg};color:${iconColor};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          ${svg}
        </div>
        <div style="padding-top:4px;">
          <h3 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#0f172a;">${title}</h3>
          <p style="margin:0;font-size:14px;color:#475569;line-height:1.5;">${msg}</p>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:8px;">
        <button id="custom-alert-ok" style="padding:10px 24px;border-radius:8px;border:none;background:#0f172a;color:#fff;font-weight:500;font-size:14px;cursor:pointer;transition:opacity 0.2s;">OK</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      modal.style.transform = 'scale(1) translateY(0)';
    });

    const close = () => {
      overlay.style.opacity = '0';
      modal.style.transform = 'scale(0.95) translateY(10px)';
      setTimeout(() => {
        overlay.remove();
        resolve(true);
      }, 200);
    };

    document.getElementById('custom-alert-ok').onclick = close;
    
    // allow clicking overlay to close
    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };
  });
};
