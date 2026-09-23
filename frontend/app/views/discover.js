import { html, useEffect, useState } from '../lib.js';
import { state, setState, allEvents, openEvent, toggleSave } from '../store.js';
import { Cover, DateBadge, DateBox, Heart, Stack, SearchIcon, Empty } from '../ui.js';
import { isoDay, pad2 } from '../util.js';

const openPalette = () => setState({ palette: true, pq: '' });

export function ctaFor(ev) {
  if (ev.going) return "✓ You're going";
  const reg = ev.registration;
  if (ev.requires_approval && reg) {
    if (reg.status === 'in_processing') return 'Application pending';
    if (reg.status === 'payment_required') return `Pay now · ${ev.priceLabel}`;
  }
  if (ev.soldOut) return 'Sold out';
  if (ev.closed) return 'Registration closed';
  if (ev.requires_approval) return 'Apply to join';
  return `Get tickets · ${ev.priceLabel}`;
}

function useTick() {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set(n => n + 1), 1000); return () => clearInterval(t); }, []);
}

function Countdown({ to }) {
  useTick();
  const diff = Math.max(0, to - Date.now());
  const units = [[Math.floor(diff / 864e5), 'days'], [Math.floor(diff / 36e5) % 24, 'hrs'], [Math.floor(diff / 6e4) % 60, 'min'], [Math.floor(diff / 1e3) % 60, 'sec']];
  return html`<div class="countdown" role="timer" aria-label="Time until the event">
    ${units.map(([v, l]) => html`<div><b>${pad2(v)}</b><span>${l}</span></div>`)}
  </div>`;
}

function Featured({ ev }) {
  if (!ev) {
    return html`<div class="featured" style=${{ cursor: 'default' }}>
      <div class="featured-empty">${state.eventsLoaded ? 'No upcoming events yet. Check back soon.' : 'Loading events…'}</div>
    </div>`;
  }
  return html`<div class="featured" onClick=${() => openEvent(ev.id)}>
    <${Cover} ev=${ev} cls="featured-cover" dark=${true}>
      <div class="chips"><span class="chip-orange">Featured</span><span class="chip-glass">${ev.city}</span></div>
    <//>
    <div class="featured-body">
      <div><div class="featured-meta">${ev.dateLong} · ${ev.venue}</div><h2>${ev.title}</h2></div>
      <${Countdown} to=${ev.start} />
      <div class="featured-foot">
        <div class="going"><${Stack} avatars=${ev.avatars} /><span>${ev.goingLabel}</span></div>
        <button class="btn btn-primary" style=${{ height: '48px', fontSize: '15px' }}
          onClick=${e => { e.stopPropagation(); openEvent(ev.id); }}>${ctaFor(ev)}</button>
      </div>
    </div>
  </div>`;
}

function Hero({ events }) {
  const now = new Date(), weekEnd = new Date(now.getTime() + 7 * 864e5);
  const weekCount = events.filter(e => e.start >= now && e.start < weekEnd).length;
  const open = events.filter(e => !e.soldOut && !e.closed);
  // Featured: the fullest event in the next 30 days, else the soonest one
  const soon = open.filter(e => e.start - now < 30 * 864e5);
  const featured = [...soon].sort((a, b) => b.taken / b.cap - a.taken / a.cap)[0] || open[0] || events[0];
  return html`<section class="dark">
    <div class="wrap hero">
      <div class="hero-copy">
        <div class="live-pill"><span class="live-tag">LIVE</span><span>${weekCount} ${weekCount === 1 ? 'event' : 'events'} in the next 7 days</span></div>
        <h1>Every IT event worth <span>showing up</span> for.</h1>
        <p>Tech conferences, hands-on workshops, hackathons and dev meetups. Grab your seat and get a QR ticket in seconds.</p>
        <button class="hero-search" onClick=${openPalette}>
          <${SearchIcon} size=${20} color="#a78bfa" />
          <span class="grow">Try “Kubernetes”, “FastAPI” or “hackathon”</span>
          <span class="hero-search-go">Search</span>
        </button>
      </div>
      <${Featured} ev=${featured} />
    </div>
  </section>`;
}

function FilterBar() {
  const mobile = state.w < 820;
  return html`<div class="filterbar">
    <div class="wrap filterbar-row">
      ${!mobile && html`<div class="filter-title">IT events <span>· Algeria & online</span></div>`}
      <div class="seg" role="group" aria-label="Price">
        ${['All', 'Free', 'Paid'].map(p => html`<button class=${state.price === p ? 'on' : ''} aria-pressed=${state.price === p}
          onClick=${() => setState({ price: p })}>${p}</button>`)}
      </div>
      <select class="select" aria-label="Sort" value=${state.sort} onChange=${e => setState({ sort: e.target.value })}>
        <option value="soon">Soonest first</option>
        <option value="popular">Filling fast</option>
        <option value="price">Price: low to high</option>
      </select>
      <div class="seg" role="group" aria-label="View">
        <button class=${'sq' + (state.view === 'grid' ? ' on' : '')} aria-label="Grid view" aria-pressed=${state.view === 'grid'} onClick=${() => setState({ view: 'grid' })}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="2"></rect><rect x="13" y="3" width="8" height="8" rx="2"></rect><rect x="3" y="13" width="8" height="8" rx="2"></rect><rect x="13" y="13" width="8" height="8" rx="2"></rect></svg>
        </button>
        <button class=${'sq' + (state.view === 'list' ? ' on' : '')} aria-label="List view" aria-pressed=${state.view === 'list'} onClick=${() => setState({ view: 'list' })}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="4" width="18" height="4" rx="2"></rect><rect x="3" y="10" width="18" height="4" rx="2"></rect><rect x="3" y="16" width="18" height="4" rx="2"></rect></svg>
        </button>
      </div>
    </div>
  </div>`;
}

function DayStrip({ events }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const counts = new Map();
  events.forEach(e => counts.set(e.dayKey, (counts.get(e.dayKey) || 0) + 1));
  const days = Array.from({ length: 21 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() + i); return d; });
  return html`<div class="days" role="group" aria-label="Pick a day">
    ${days.map((d, i) => {
      const k = isoDay(d), on = state.day === k, n = counts.get(k) || 0;
      return html`<button class=${'day' + (on ? ' on' : '')} aria-pressed=${on} aria-label=${`${d.toDateString()}, ${n} events`}
          onClick=${() => setState({ day: on ? null : k })}>
        <small>${i === 0 ? 'Today' : d.toLocaleString('en', { weekday: 'short' })}</small><b>${d.getDate()}</b>
        <i style=${{ background: n ? (on ? '#f97316' : '#7c3aed') : 'transparent' }}></i>
      </button>`;
    })}
  </div>`;
}

export function EventCard({ ev }) {
  return html`<article class="card" onClick=${() => openEvent(ev.id)} tabindex="0"
      onKeyDown=${e => { if (e.key === 'Enter') openEvent(ev.id); }}>
    <${Cover} ev=${ev}>
      <${DateBadge} ev=${ev} />
      <${Heart} on=${ev.saved} onClick=${() => toggleSave(ev)} />
      ${ev.going && html`<span class="corner-chip" style=${{ background: '#16a34a' }}>✓ You're going</span>`}
      ${!ev.going && ev.soldOut && html`<span class="corner-chip" style=${{ background: '#16131d' }}>Sold out</span>`}
    <//>
    <div class="card-body">
      <div class="kicker">${ev.city}<i></i><span>${ev.kindLabel}</span></div>
      <h3>${ev.title}</h3>
      <div class="meta">${ev.weekday} · ${ev.time} · ${ev.venue}</div>
      <div class="bar"><div style=${{ width: ev.pct, background: ev.barColor }}></div></div>
      <div class="card-foot">
        <div class="left"><${Stack} avatars=${ev.avatars} small=${true} /><span style=${{ color: ev.leftColor }}>${ev.leftLabel}</span></div>
        <span class="price">${ev.priceLabel}</span>
      </div>
    </div>
  </article>`;
}

function EventRow({ ev }) {
  return html`<div class="row clickable" onClick=${() => openEvent(ev.id)} tabindex="0" role="button"
      onKeyDown=${e => { if (e.key === 'Enter') openEvent(ev.id); }}>
    <${DateBox} ev=${ev} />
    <div style=${{ minWidth: 0 }}>
      <div class="row-title">${ev.title}</div>
      <div class="row-sub">${ev.kindLabel} · ${ev.time} · ${ev.venue}</div>
    </div>
    <div class="row-end">
      <span style=${{ fontSize: '12px', fontWeight: 700, color: ev.leftColor }}>${ev.leftLabel}</span>
      <span class="price" style=${{ fontSize: '15px', minWidth: '64px', textAlign: 'right' }}>${ev.priceLabel}</span>
      <${Heart} on=${ev.saved} small=${true} onClick=${() => toggleSave(ev)} />
    </div>
  </div>`;
}

export function Discover() {
  const events = allEvents();
  const { price, day, sort, view } = state;
  let list = events.filter(e => (price === 'All' || (price === 'Free' ? e.isFree : !e.isFree)) && (!day || e.dayKey === day));
  list.sort(sort === 'popular' ? (a, b) => b.taken / b.cap - a.taken / a.cap
    : sort === 'price' ? (a, b) => a.dzd - b.dzd : (a, b) => a.start - b.start);
  const filtered = price !== 'All' || !!day;
  const reset = () => setState({ price: 'All', day: null });
  const dayTitle = day && new Date(day + 'T00:00').toLocaleString('en', { weekday: 'long', month: 'long', day: 'numeric' });

  return html`
    <${Hero} events=${events} />
    <${FilterBar} />
    <main class="page-main">
      <section class="wrap" style=${{ paddingTop: '32px', paddingBottom: '80px' }}>
        <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          <h2 class="eyebrow">Pick a day</h2>
          ${day && html`<button class="link-btn" onClick=${() => setState({ day: null })}>Any date ✕</button>`}
        </div>
        <${DayStrip} events=${events} />
        <div class="list-head">
          <div>
            <h2 class="list-title">${dayTitle || 'Upcoming IT events'}</h2>
            <div class="list-sub">${list.length} ${list.length === 1 ? 'event' : 'events'}${price !== 'All' ? ` · ${price}` : ''}</div>
          </div>
          ${filtered && html`<button class="btn" style=${{ height: '36px', padding: '0 14px' }} onClick=${reset}>Reset filters</button>`}
        </div>
        ${!state.eventsLoaded && html`<div class="grid">${[0, 1, 2].map(() => html`<div class="skeleton" style=${{ height: '380px' }}></div>`)}</div>`}
        ${state.eventsLoaded && state.eventsError && html`<${Empty} title="Couldn't load events" sub=${state.eventsError} />`}
        ${state.eventsLoaded && !state.eventsError && list.length > 0 && (view === 'grid'
          ? html`<div class="grid">${list.map(ev => html`<${EventCard} key=${ev.id} ev=${ev} />`)}</div>`
          : html`<div class="rows">${list.map(ev => html`<${EventRow} key=${ev.id} ev=${ev} />`)}</div>`)}
        ${state.eventsLoaded && !state.eventsError && list.length === 0 && (events.length
          ? html`<${Empty} title="Nothing on that combination" sub="Try another day or price." action="Reset filters" onAction=${reset} />`
          : html`<${Empty} title="No upcoming events yet" sub="New IT events are added every week." />`)}
      </section>
    </main>`;
}
