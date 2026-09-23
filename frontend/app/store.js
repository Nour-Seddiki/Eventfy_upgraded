import { useEffect, useState } from './lib.js';
import { api, token, cacheUser, setUnauthorizedHandler, ApiError } from './api.js';
import { enrich, toDate } from './util.js';

// ─────────────────────────────────────────────
//  State: one object, re-rendered from the root
// ─────────────────────────────────────────────
export const state = {
  route: { name: 'discover', params: {} },
  w: window.innerWidth,

  authed: !!token.get(),
  profile: null,

  events: [], eventsLoaded: false, eventsError: null,
  extraEvents: {},          // id -> raw event not in the public list (past / saved)
  tickets: [], saved: [], registrations: [], notifications: [], unread: 0, myRatings: {},
  dataLoaded: false,

  // Discover UI
  price: 'All', day: null, sort: 'soon', view: 'grid',
  // Overlays
  palette: false, pq: '', notifOpen: false, menuOpen: false,
  modal: null, qrTicketId: null, articleId: null, confirm: null, toast: null,
  ticketTab: 'up', newsTab: 'All', pfTab: 'info',
};

const listeners = new Set();
export function setState(patch) {
  Object.assign(state, typeof patch === 'function' ? patch(state) : patch);
  listeners.forEach(l => l());
}
/** Subscribe a component (the root) to every state change. */
export function useStore() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force(n => n + 1);
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);
  return state;
}

let toastTimer;
export function flash(msg) {
  clearTimeout(toastTimer);
  setState({ toast: msg });
  toastTimer = setTimeout(() => setState({ toast: null }), 2600);
}

// ─────────────────────────────────────────────
//  Router (hash based: #/discover, #/event/3 …)
// ─────────────────────────────────────────────
const PRIVATE = new Set(['tickets', 'saved', 'profile', 'checkout', 'payment']);

function parseHash() {
  const [name = 'discover', ...rest] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { name, params: { id: rest[0] ? decodeURIComponent(rest[0]) : null } };
}

let returnTo = null;
function applyRoute() {
  const route = parseHash();
  if (PRIVATE.has(route.name) && !state.authed) {
    returnTo = location.hash;
    return navigate('/signin', { replace: true });
  }
  if ((route.name === 'signin' || route.name === 'signup') && state.authed) {
    return navigate('/discover', { replace: true });
  }
  const patch = { route, notifOpen: false, menuOpen: false, palette: false };
  if (route.name === 'event') {
    patch.route = { name: 'discover', params: {} };
    const id = Number(route.params.id);
    if (!state.authed) { returnTo = location.hash; return navigate('/signin', { replace: true }); }
    patch.modal = { eventId: id, step: 1 };
  } else if (state.route.name !== route.name) {
    patch.modal = null;
    window.scrollTo(0, 0);
  }
  setState(patch);
}

export function navigate(path, { replace = false } = {}) {
  const hash = '#' + path;
  if (location.hash === hash) return applyRoute();
  if (replace) { history.replaceState(null, '', hash); applyRoute(); }
  else location.hash = hash;
}

// ─────────────────────────────────────────────
//  Derived data
// ─────────────────────────────────────────────
function ctx() {
  const goingIds = new Set(state.tickets.filter(t => t.status !== 'cancelled').map(t => t.event_id));
  const savedIds = new Set(state.saved.map(s => s.event_id));
  const regByEvent = new Map(state.registrations.map(r => [r.event_id, r]));
  return { goingIds, savedIds, regByEvent };
}

export function allEvents() {
  const c = ctx();
  return state.events.map(e => enrich(e, c));
}

export function getEvent(id) {
  const raw = state.events.find(e => e.id === id) || state.extraEvents[id];
  return raw ? enrich(raw, ctx()) : null;
}

export function myTickets() {
  const now = new Date();
  const rows = state.tickets
    .filter(t => t.status !== 'cancelled')
    .map(t => ({ ...t, ev: getEvent(t.event_id) }))
    .filter(t => t.ev);
  const endOf = t => toDate(t.ev.end_date) || t.ev.start;
  const upcoming = rows.filter(t => endOf(t) >= now).sort((a, b) => a.ev.start - b.ev.start);
  const past = rows.filter(t => endOf(t) < now).sort((a, b) => b.ev.start - a.ev.start);
  return { upcoming, past };
}

export function savedEvents() {
  return state.saved.map(s => getEvent(s.event_id)).filter(Boolean).sort((a, b) => a.start - b.start);
}

export const role = () => (state.profile && state.profile.role) || 'attendee';

// ─────────────────────────────────────────────
//  Loading
// ─────────────────────────────────────────────
export async function loadEvents() {
  try {
    const events = await api('/events/public?limit=100', { auth: false });
    setState({ events, eventsLoaded: true, eventsError: null });
  } catch (e) {
    setState({ eventsLoaded: true, eventsError: e.message });
  }
}

async function fetchMissingEvents(ids) {
  const known = new Set([...state.events.map(e => e.id), ...Object.keys(state.extraEvents).map(Number)]);
  const missing = [...new Set(ids)].filter(id => !known.has(id));
  if (!missing.length) return;
  const found = await Promise.all(missing.map(id => api(`/events/public/${id}`, { auth: false }).catch(() => null)));
  const extra = { ...state.extraEvents };
  found.filter(Boolean).forEach(e => { extra[e.id] = e; });
  setState({ extraEvents: extra });
}

export async function loadMe() {
  if (!token.get()) return;
  try {
    const profile = await api('/users/my_profile');
    cacheUser(profile);
    setState({ profile, authed: true });
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 404)) return signOut(true);
    return;
  }
  const [tickets, saved, registrations, notif] = await Promise.all([
    api('/ticket/get_user_tickets').catch(() => []),
    api('/saving-events/my-saved-events').catch(() => []),
    api('/registrations/my-registrations').catch(() => []),
    api('/notifications?limit=20').catch(() => ({ notifications: [], unread_count: 0 })),
  ]);
  setState({
    tickets, saved, registrations,
    notifications: notif.notifications || [], unread: notif.unread_count || 0,
    dataLoaded: true,
  });
  await fetchMissingEvents([...tickets.map(t => t.event_id), ...saved.map(s => s.event_id)]);
  loadMyRatings();
}

async function loadMyRatings() {
  const me = state.profile && state.profile.id;
  const { past } = myTickets();
  const used = past.filter(t => t.status === 'used');
  const ratings = {};
  await Promise.all(used.map(async t => {
    const reviews = await api(`/review/event_reviews/${t.event_id}`, { auth: false }).catch(() => []);
    const mine = (Array.isArray(reviews) ? reviews : []).find(r => r.reviewer_id === me);
    if (mine) ratings[t.event_id] = mine.rating;
  }));
  setState({ myRatings: { ...state.myRatings, ...ratings } });
}

// ─────────────────────────────────────────────
//  Auth
// ─────────────────────────────────────────────
async function afterSignIn(accessToken, greeting) {
  token.set(accessToken);
  setState({ authed: true });
  await loadMe();
  const target = returnTo || '#/discover';
  returnTo = null;
  history.replaceState(null, '', target);
  applyRoute();
  const first = state.profile && (state.profile.full_name || state.profile.username || '').split(' ')[0];
  flash(greeting + (first ? `, ${first}` : ''));
}

export async function signIn(identifier, password) {
  const form = new URLSearchParams({ username: identifier.trim(), password });
  const data = await api('/auth/token', { method: 'POST', form, auth: false });
  await afterSignIn(data.access_token, 'Welcome back');
}

export async function googleSignIn(credential) {
  const data = await api('/auth/google', { method: 'POST', json: { id_token: credential }, auth: false });
  await afterSignIn(data.access_token, 'Welcome');
}

/** Sign up with a full name; the username is derived from it (users sign in by email). */
export async function signUp(fullName, email, password) {
  const base = fullName.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 14) || 'user';
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    const userName = `${base}.${Math.floor(1000 + Math.random() * 9000)}`;
    try {
      await api('/auth/sign_up', { method: 'POST', json: { user_name: userName, email: email.trim(), password }, auth: false });
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      if (!(e.status === 409 && /username/i.test(e.message))) throw e;
    }
  }
  if (lastErr) throw lastErr;
  const form = new URLSearchParams({ username: email.trim(), password });
  const data = await api('/auth/token', { method: 'POST', form, auth: false });
  token.set(data.access_token);
  await api('/users/update_profile', { method: 'PUT', json: { full_name: fullName.trim() } }).catch(() => {});
  await afterSignIn(data.access_token, 'Welcome to Eventfy');
}

export function signOut(expired = false) {
  token.clear();
  setState({
    authed: false, profile: null, tickets: [], saved: [], registrations: [], notifications: [], unread: 0,
    myRatings: {}, dataLoaded: false, menuOpen: false, notifOpen: false, modal: null,
  });
  navigate('/discover', { replace: true });
  flash(expired ? 'Your session expired. Sign in again.' : 'You have signed out');
}
setUnauthorizedHandler(() => { if (state.authed) signOut(true); });

// ─────────────────────────────────────────────
//  Event actions
// ─────────────────────────────────────────────
export function openEvent(id) {
  if (!state.authed) { returnTo = `#/event/${id}`; navigate('/signin'); flash('Sign in to get tickets'); return; }
  setState({ modal: { eventId: id, step: 1 }, palette: false, notifOpen: false, articleId: null });
}

export async function toggleSave(ev) {
  if (!state.authed) { navigate('/signin'); flash('Sign in to save events'); return; }
  const existing = state.saved.find(s => s.event_id === ev.id);
  try {
    if (existing) {
      setState({ saved: state.saved.filter(s => s !== existing) });
      await api(`/saving-events/remove/${existing.saving_id}`, { method: 'DELETE' });
      flash('Removed from saved');
    } else {
      const row = await api('/saving-events/save', { method: 'POST', json: { event_id: ev.id } });
      setState({ saved: [...state.saved, { saving_id: row.id, event_id: ev.id }] });
      flash(`Saved “${ev.title}”`);
    }
  } catch (e) {
    flash(e.message);
    api('/saving-events/my-saved-events').then(saved => setState({ saved })).catch(() => {});
  }
}

export async function getFreeTicket(ev) {
  const ticket = await api(`/ticket/purchase_ticket/${ev.id}`, { method: 'POST' });
  setState({ tickets: [...state.tickets, ticket] });
  loadEvents();
  return ticket;
}

export async function applyToEvent(ev, answers) {
  await api(`/registrations/events/${ev.id}/register`, { method: 'POST', json: { answers } });
  const registrations = await api('/registrations/my-registrations').catch(() => state.registrations);
  setState({ registrations });
}

export async function startCheckout(ev, method) {
  const q = method ? `?payment_method=${method}` : '';
  const data = await api(`/payment/checkout/${ev.id}${q}`, { method: 'POST' });
  window.location.href = data.checkout_url;
}

/** Ask the backend to confirm a Chargily payment; retries while it is still pending. */
export async function verifyPayment(paymentId, onPending) {
  let delay = 1500;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await api(`/payment/verify/${encodeURIComponent(paymentId)}`, { method: 'POST' });
    if (res.status === 'fulfilled' || res.status === 'already_fulfilled') {
      await loadMe();
      loadEvents();
      return res;
    }
    if (onPending) onPending(res.payment_status);
    if (['failed', 'canceled', 'expired'].includes(res.payment_status)) return res;
    await new Promise(r => setTimeout(r, delay));
    delay = Math.min(delay * 1.6, 6000);
  }
  return { status: 'not_paid', payment_status: 'pending' };
}

export async function cancelTicket(ticket) {
  try {
    await api(`/ticket/cancell_ticket/${ticket.event_id}`, { method: 'PUT' });
  } catch (e) { flash(e.message); return; }
  setState({ tickets: state.tickets.map(t => (t.id === ticket.id ? { ...t, status: 'cancelled' } : t)), qrTicketId: null });
  loadEvents();
  flash('Ticket cancelled');
}

export async function rateEvent(eventId, rating) {
  try {
    await api('/review/create_review', { method: 'POST', json: { event_id: eventId, rating } });
    setState({ myRatings: { ...state.myRatings, [eventId]: rating } });
    flash('Thanks for rating this event');
  } catch (e) { flash(e.message); }
}

export async function markAllRead() {
  setState({ unread: 0, notifications: state.notifications.map(n => ({ ...n, read: true })) });
  await api('/notifications/mark-all-as-read', { method: 'PUT' }).catch(() => {});
}

// ─────────────────────────────────────────────
//  Profile actions
// ─────────────────────────────────────────────
export async function updateProfile(patch) {
  await api('/users/update_profile', { method: 'PUT', json: patch });
  const profile = await api('/users/my_profile');
  cacheUser(profile);
  setState({ profile });
}

export async function uploadAvatar(file) {
  const form = new FormData();
  form.append('image', file);
  await api('/users/avatar', { method: 'POST', form });
  const profile = await api('/users/my_profile');
  cacheUser(profile);
  setState({ profile });
}

export async function changePassword(current, next) {
  await api('/auth/reset_password', { method: 'POST', json: { current_password: current, new_password: next } });
}

export async function requestOrganizer() {
  await api('/users/request_organizer', { method: 'POST' });
  setState({ profile: { ...state.profile, organizer_request_pending: true } });
}

export async function deleteAccount() {
  await api('/users/delete_me', { method: 'DELETE' });
  signOut();
  flash('Your account has been deleted');
}

// ─────────────────────────────────────────────
//  Boot
// ─────────────────────────────────────────────
export function boot() {
  const q = new URLSearchParams(location.search);
  const paymentId = q.get('payment_id');
  const cancelled = q.get('payment_cancelled');
  if (paymentId || cancelled) {
    // Chargily redirects to /?payment_id=… — move that into the hash route.
    history.replaceState(null, '', location.pathname + (paymentId ? `#/payment/${paymentId}` : '#/discover'));
    if (cancelled) setTimeout(() => flash('Payment cancelled · you were not charged'), 300);
  }
  window.addEventListener('hashchange', applyRoute);
  window.addEventListener('resize', () => setState({ w: window.innerWidth }));
  applyRoute();
  loadEvents();
  loadMe();
}
