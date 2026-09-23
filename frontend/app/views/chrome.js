import { html } from '../lib.js';
import { state, setState, navigate, signOut, markAllRead, myTickets, savedEvents, role } from '../store.js';
import { Logo, Icon, ICONS, SearchIcon, Avatar } from '../ui.js';
import { relativeTime } from '../util.js';

export const CONSOLE = {
  organizer: { href: 'org-dashboard/index.html', label: 'Organizer dashboard' },
  admin: { href: 'Admin/admin.html', label: 'Admin panel' },
};

function navDefs() {
  const authed = state.authed;
  const up = authed ? myTickets().upcoming.length : 0;
  const saved = authed ? savedEvents().length : 0;
  return [
    { page: 'discover', label: 'Discover', short: 'Discover' },
    { page: 'tickets', label: 'My tickets', short: 'Tickets', badge: up, badgeBg: '#7c3aed' },
    { page: 'saved', label: 'Saved', short: 'Saved', badge: saved, badgeBg: '#f97316' },
    { page: 'news', label: 'News & highlights', short: 'News' },
  ];
}

const openPalette = () => setState({ palette: true, pq: '', notifOpen: false, menuOpen: false });

export function Header() {
  const { route, authed, profile, menuOpen, notifOpen, unread } = state;
  const mobile = state.w < 820;
  const r = role();
  const consoleLink = CONSOLE[r];

  return html`<header class="header">
    <div class="wrap header-row">
      <${Logo} onClick=${() => navigate('/discover')} />
      ${!mobile && html`<nav class="nav" aria-label="Main">
        ${navDefs().map(n => html`<button class=${'nav-item' + (route.name === n.page ? ' active' : '')}
            aria-current=${route.name === n.page ? 'page' : undefined} onClick=${() => navigate('/' + n.page)}>
          ${n.label}${authed && n.badge ? html`<span class="nav-badge" style=${{ background: n.badgeBg }}>${n.badge}</span>` : null}
        </button>`)}
        ${authed && consoleLink && html`<a class="organize-btn" href=${consoleLink.href}>${r === 'admin' ? 'Admin panel' : 'Organize'}<span class="role-chip">${r}</span></a>`}
      </nav>`}
      <button class="search-btn" onClick=${openPalette} aria-label="Search events">
        <${SearchIcon} />
        ${!mobile && html`<span>Search</span><span class="kbd">/</span>`}
      </button>
      <div class="head-actions">
        ${authed && html`
          <button class="icon-btn" aria-label=${`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded=${notifOpen}
            onClick=${() => setState({ notifOpen: !notifOpen, menuOpen: false })}>
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" stroke-linecap="round" stroke-linejoin="round"></path></svg>
            ${unread > 0 && html`<span class="unread-dot"></span>`}
          </button>
          <${Avatar} profile=${profile} aria-expanded=${menuOpen} onClick=${() => setState({ menuOpen: !menuOpen, notifOpen: false })} />`}
        ${!authed && html`
          <button class="ghost-dark" onClick=${() => navigate('/signin')}>Sign in</button>
          ${!mobile && html`<button class="solid-violet" onClick=${() => navigate('/signup')}>Get started</button>`}`}
        ${menuOpen && html`<${AccountMenu} />`}
        ${notifOpen && html`<${Notifications} />`}
      </div>
    </div>
  </header>`;
}

function AccountMenu() {
  const p = state.profile || {};
  const consoleLink = CONSOLE[role()];
  const items = [['profile', 'Profile & settings'], ['tickets', 'My tickets'], ['saved', 'Saved events']];
  return html`<div class="popover menu" role="menu">
    <div class="menu-head">
      <${Avatar} profile=${p} />
      <div style=${{ minWidth: 0 }}><div class="menu-name">${p.full_name || p.username || 'Your account'}</div><div class="menu-email">${p.email || ''}</div></div>
    </div>
    ${items.map(([pg, l]) => html`<button class="menu-item" role="menuitem" onClick=${() => navigate('/' + pg)}>${l}</button>`)}
    ${consoleLink && html`<a class="menu-item" role="menuitem" href=${consoleLink.href}>${consoleLink.label}</a>`}
    <div class="menu-sep"></div>
    <button class="menu-item danger" role="menuitem" onClick=${() => signOut()}>Log out</button>
  </div>`;
}

function Notifications() {
  const list = state.notifications;
  return html`<div class="popover notif-pop">
    <div class="notif-head">
      <span class="display" style=${{ fontWeight: 700, fontSize: '14px' }}>Notifications</span>
      ${state.unread > 0 && html`<button class="link-btn" style=${{ fontSize: '12px' }} onClick=${markAllRead}>Mark all read</button>`}
    </div>
    <div class="notif-list">
      ${list.length === 0 && html`<div class="notif-empty">You're all caught up.</div>`}
      ${list.map(n => html`<div class="notif-row">
        <span class="notif-dot" style=${{ background: n.read ? '#e4e0ea' : '#f97316' }}></span>
        <div><div class="notif-title">${n.title}</div><div class="notif-sub">${n.message}</div>
          <div class="notif-sub">${relativeTime(n.created_at)}</div></div>
      </div>`)}
    </div>
  </div>`;
}

export function Footer() {
  return html`<footer class="footer">
    <div class="wrap footer-row">
      <span>© ${new Date().getFullYear()} Eventfy</span>
      <nav><a href="#/discover">Discover</a><a href="#/news">News</a><a href="#/profile">For organizers</a></nav>
    </div>
  </footer>`;
}

export function TabBar() {
  const page = state.route.name;
  const tabs = [...navDefs(), { page: 'profile', short: 'Profile' }];
  return html`<nav class="tabbar" aria-label="Main">
    ${tabs.map(n => html`<button class=${'tab' + (page === n.page ? ' on' : '')} aria-current=${page === n.page ? 'page' : undefined}
        onClick=${() => navigate('/' + n.page)}>
      <span class="pill"><${Icon} d=${ICONS[n.page]} /></span>
      <span>${n.short}</span>
      ${state.authed && n.badge ? html`<span class="nav-badge" style=${{ background: n.badgeBg }}>${n.badge}</span>` : null}
    </button>`)}
  </nav>`;
}

export function Toast() {
  if (!state.toast) return null;
  const lifted = state.w < 820 && !['signin', 'signup'].includes(state.route.name);
  return html`<div class=${'toast' + (lifted ? ' lifted' : '')} role="status"><i>✓</i>${state.toast}</div>`;
}
