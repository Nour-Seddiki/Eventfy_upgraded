import { assetUrl } from './api.js';

// Chargily charges in DZD; other currencies are converted with the same
// fixed rates the backend uses (backend/app/services/payment_service.py).
export const RATES_TO_DZD = { DZD: 1, USD: 230, EUR: 280, GBP: 300 };

export function priceDzd(ev) {
  if (!ev.price) return 0;
  const rate = RATES_TO_DZD[(ev.currency || 'DZD').toUpperCase()] || 1;
  return Math.round(ev.price * rate);
}

export function priceLabel(dzd) {
  return dzd ? `${dzd.toLocaleString('en-US')} DA` : 'Free';
}

// Backend datetimes are naive ISO strings in the organizer's local time.
export const toDate = s => (s ? new Date(s) : null);
const fmt = (d, o) => d.toLocaleString('en', o);

export const pad2 = n => String(n).padStart(2, '0');
export const isoDay = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function timeLabel(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// Server-set timestamps (created_at…) are naive UTC, unlike event times.
const fromUtc = s => (s ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z') : null);

export function relativeTime(s) {
  const d = fromUtc(s);
  if (!d) return '';
  const mins = Math.round((Date.now() - d) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return fmt(d, { month: 'short', day: 'numeric' });
}

export function startsIn(d) {
  const ms = Math.max(0, d - Date.now());
  const dd = Math.floor(ms / 864e5), hh = Math.floor(ms / 36e5) % 24, mm = Math.floor(ms / 6e4) % 60;
  return dd ? `${dd} ${dd === 1 ? 'day' : 'days'} ${hh} hrs` : `${hh} hrs ${mm} min`;
}

export function initialsOf(name) {
  return (name || 'U').split(/[\s._-]+/).filter(Boolean).map(x => x[0]).slice(0, 2).join('').toUpperCase();
}

// Cover stripes and avatar colours from the v4 design, picked by id.
const TINTS = [['#ede9fe', '#f5f3ff'], ['#e0f2fe', '#f0f9ff'], ['#ffedd5', '#fff7ed'], ['#dcfce7', '#f0fdf4']];
const PEOPLE = [['#ede9fe', '#6d28d9'], ['#ffedd5', '#c2410c'], ['#dcfce7', '#15803d'], ['#e0f2fe', '#0369a1'], ['#fce7f3', '#be185d']];

export function avatarColors(i) { return PEOPLE[Math.abs(i) % PEOPLE.length]; }

/** Short, human-friendly label for a ticket UUID. */
export const ticketCode = id => 'TKT-' + String(id).replace(/-/g, '').slice(0, 8).toUpperCase();

/**
 * Derive everything the views display from a raw API event.
 * @param {object} e        event from /events/public (tickets_sold, attendees optional)
 * @param {object} ctx      { goingIds:Set, savedIds:Set, regByEvent:Map }
 */
export function enrich(e, ctx) {
  const start = toDate(e.start_date) || new Date();
  const taken = e.tickets_sold || 0;
  const left = Math.max(0, e.available_tickets || 0);
  const cap = Math.max(1, taken + left);
  const low = left > 0 && left <= 20;
  const soldOut = left === 0;
  const going = ctx.goingIds.has(e.id);
  const deadline = toDate(e.registration_deadline);
  const closed = (deadline && deadline < new Date()) || start < new Date();
  const dzd = priceDzd(e);
  const [tintA, tintB] = TINTS[e.id % TINTS.length];
  const venue = e.location || 'Venue TBA';
  const city = venue.split(',')[0].trim();
  const attendees = e.attendees || [];

  return {
    ...e, start, taken, left, cap, lowSeats: low, soldOut, going, closed, venue, city,
    saved: ctx.savedIds.has(e.id),
    registration: ctx.regByEvent.get(e.id) || null,
    dzd, priceLabel: priceLabel(dzd), isFree: !dzd,
    converted: dzd && (e.currency || 'DZD').toUpperCase() !== 'DZD' ? `${e.price} ${e.currency}` : null,
    image: assetUrl(e.image), tintA, tintB,
    mon: fmt(start, { month: 'short' }).toUpperCase(), day: start.getDate(),
    weekday: fmt(start, { weekday: 'short' }), time: timeLabel(start),
    dateShort: fmt(start, { weekday: 'short', month: 'short', day: 'numeric' }),
    dateLong: `${fmt(start, { weekday: 'short', month: 'short', day: 'numeric' })} · ${timeLabel(start)}`,
    dayKey: isoDay(start),
    leftLabel: soldOut ? 'Sold out' : low ? `Only ${left} left` : `${taken} going`,
    leftColor: soldOut ? '#dc2626' : low ? '#ea580c' : '#6b6578',
    barColor: low || soldOut ? '#f97316' : '#7c3aed',
    pct: `${Math.round((taken / cap) * 100)}%`,
    goingLabel: going ? `You + ${Math.max(0, taken - 1)} others going` : `${taken} going`,
    kindLabel: e.requires_approval ? 'Approval required' : 'Instant ticket',
    avatars: attendees.slice(0, 3).map((a, i) => {
      const [bg, fg] = avatarColors(e.id + i);
      return { i: initialsOf(a.username), bg, fg, src: assetUrl(a.avatar_url) };
    }),
  };
}

/** Build and download an .ics file for an event. */
export function downloadIcs(ev) {
  const stamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = toDate(ev.end_date) || new Date(ev.start.getTime() + 2 * 36e5);
  const esc = s => String(s || '').replace(/[\\,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Eventfy//EN', 'BEGIN:VEVENT',
    `UID:eventfy-${ev.id}@eventfy`, `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(ev.start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(ev.title)}`, `LOCATION:${esc(ev.venue)}`, `DESCRIPTION:${esc(ev.description)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = `${ev.title.replace(/[^\w\s-]/g, '').trim() || 'event'}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function directionsUrl(ev) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.venue)}`;
}

export const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '');

export function strength(pw) {
  if (!pw) return 0;
  const n = [pw.length >= 8, /[A-Z]/.test(pw), /[0-9]/.test(pw), /[^A-Za-z0-9]/.test(pw)].filter(Boolean).length;
  return Math.max(1, n);
}
const S_COLORS = ['#ebe8f0', '#ef4444', '#f97316', '#eab308', '#16a34a'];
export const strengthBars = pw => { const n = strength(pw); return [0, 1, 2, 3].map(i => (i < n ? S_COLORS[n] : '#ebe8f0')); };
export const strengthLabel = pw => (pw
  ? ['', 'Weak', 'Fair', 'Good', 'Strong'][strength(pw)] + (pw.length < 8 ? ' · use 8+ characters' : '')
  : 'Use 8+ characters with a number and a symbol');
