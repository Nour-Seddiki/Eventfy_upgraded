import { html } from './lib.js';
import { ticketQrUrl, assetUrl } from './api.js';
import { initialsOf } from './util.js';

export const ICONS = {
  discover: 'M12 3a9 9 0 100 18 9 9 0 000-18zM15.5 8.5l-2 5-5 2 2-5z',
  tickets: 'M4 7a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2 2 0 000-4z',
  saved: 'M12 20.5l-7.7-7.6a4.8 4.8 0 016.8-6.8L12 7l.9-.9a4.8 4.8 0 016.8 6.8z',
  news: 'M5 4h11a2 2 0 012 2v12a2 2 0 002 2H7a2 2 0 01-2-2zM9 8h5M9 12h5M9 16h3',
  profile: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 018 0v4',
};

export function Icon({ d, size = 20, width = 2 }) {
  return html`<svg width=${size} height=${size} fill="none" stroke="currentColor" stroke-width=${width}
    stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d=${d}></path></svg>`;
}

export function SearchIcon({ size = 16, color = 'currentColor' }) {
  return html`<svg width=${size} height=${size} fill="none" stroke=${color} stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5" stroke-linecap="round"></path></svg>`;
}

export function Logo({ onClick, light = false }) {
  return html`<button class=${'logo' + (light ? ' on-light' : '')} onClick=${onClick} aria-label="Eventfy home">
    <span class="logo-mark"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="4" fill="#7f0df2" opacity="0.15"></rect>
      <path d="M8 2v4M16 2v4M3 10h18" stroke="#7f0df2" stroke-width="2" stroke-linecap="round"></path>
      <circle cx="8" cy="15" r="1.5" fill="#7f0df2"></circle><circle cx="12" cy="15" r="1.5" fill="#7f0df2"></circle>
      <circle cx="16" cy="15" r="1.5" fill="#7f0df2"></circle></svg></span>
    <span class="logo-word">Eventfy</span>
  </button>`;
}

/** Event cover: the real image when there is one, else the design's tinted stripes. */
export function Cover({ ev, cls = '', dark = false, children }) {
  const stripes = dark
    ? 'repeating-linear-gradient(135deg,#2a2335 0 12px,#241e2e 12px 24px)'
    : `repeating-linear-gradient(135deg,${ev.tintA} 0 10px,${ev.tintB} 10px 20px)`;
  return html`<div class=${'cover ' + cls}>
    ${ev.image
      ? html`<img src=${ev.image} alt="" loading="lazy" onError=${e => { e.currentTarget.style.display = 'none'; }} />`
      : html`<div class="stripes" style=${{ background: stripes }}></div>`}
    ${children}
  </div>`;
}

export function DateBadge({ ev }) {
  return html`<div class="date-badge"><small>${ev.mon}</small><b>${ev.day}</b></div>`;
}

export function DateBox({ ev, past = false }) {
  return html`<div class=${'date-box' + (past ? ' past' : '')}><small>${ev.mon}</small><b>${ev.day}</b></div>`;
}

export function Heart({ on, onClick, small = false, label }) {
  const color = on ? '#f97316' : '#6b6578';
  return html`<button class=${'heart' + (small ? ' sm' : '')} aria-label=${label || (on ? 'Remove from saved' : 'Save')}
    aria-pressed=${on} onClick=${e => { e.stopPropagation(); onClick(); }}>
    <svg width=${small ? 16 : 18} height=${small ? 16 : 18} viewBox="0 0 24 24" fill=${on ? '#f97316' : 'none'} stroke=${color} stroke-width="2" aria-hidden="true">
      <path d="M12 20.5l-7.7-7.6a4.8 4.8 0 016.8-6.8L12 7l.9-.9a4.8 4.8 0 016.8 6.8z" stroke-linejoin="round"></path></svg>
  </button>`;
}

export function Avatar({ profile, cls = 'avatar', onClick, label }) {
  const name = profile && (profile.full_name || profile.username);
  const inner = profile && profile.avatar_url
    ? html`<img src=${assetUrl(profile.avatar_url)} alt="" />`
    : initialsOf(name);
  return onClick
    ? html`<button class=${cls} onClick=${onClick} aria-label=${label || 'Account'}>${inner}</button>`
    : html`<span class=${cls}>${inner}</span>`;
}

export function Stack({ avatars, small = false }) {
  if (!avatars.length) return null;
  return html`<div class=${'stack' + (small ? ' sm' : '')}>
    ${avatars.map(a => html`<span style=${{ background: a.bg, color: a.fg }}>${a.src ? html`<img src=${a.src} alt="" />` : a.i}</span>`)}
  </div>`;
}

export function QrImage({ ticketId, size = 160 }) {
  return html`<div class="qr" style=${{ width: size + 'px', height: size + 'px' }}>
    <img src=${ticketQrUrl(ticketId)} alt="Ticket QR code" width=${size} height=${size} />
  </div>`;
}

export function Choice({ on, label, sub, onClick }) {
  return html`<button type="button" class=${'choice' + (on ? ' on' : '')} onClick=${onClick} aria-pressed=${on}>
    <span class="choice-top">${label}<span class="radio"><i></i></span></span>
    ${sub && html`<small>${sub}</small>`}
  </button>`;
}

export function CheckBox({ on, onClick, children }) {
  return html`<button type="button" class="check" onClick=${onClick} aria-pressed=${on}>
    <span class=${'check-box' + (on ? ' on' : '')}>${on ? '✓' : ''}</span><span>${children}</span>
  </button>`;
}

export function Field({ label, error, hint, children, extra }) {
  return html`<label class="field">
    ${extra ? html`<span style=${{ display: 'flex', justifyContent: 'space-between' }}>${label}${extra}</span>` : label}
    ${children}
    ${hint && html`<span class="hint">${hint}</span>`}
    ${error && html`<span class="err">${error}</span>`}
  </label>`;
}

export function Empty({ title, sub, action, onAction }) {
  return html`<div class="empty">
    <div class="empty-title">${title}</div>
    <div class="empty-sub">${sub}</div>
    ${action && html`<button class="btn btn-primary" onClick=${onAction}>${action}</button>`}
  </div>`;
}
