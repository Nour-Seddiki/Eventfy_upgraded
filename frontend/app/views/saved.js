import { html } from '../lib.js';
import { state, savedEvents, openEvent, toggleSave, navigate } from '../store.js';
import { Cover, DateBadge, Heart, Empty } from '../ui.js';
import { ctaFor } from './discover.js';

export function Saved() {
  const list = savedEvents();
  const low = list.filter(e => e.lowSeats).length;
  return html`
    <section class="dark"><div class="wrap page-head" style=${{ display: 'block' }}>
      <h1 class="page-title">Saved</h1>
      <p class="page-sub">${list.length} ${list.length === 1 ? 'event' : 'events'} on your radar${low ? ` · ${low} filling fast` : ''}</p>
    </div></section>
    <main class="page-main"><section class="wrap section">
      ${!state.dataLoaded && html`<div class="grid">${[0, 1, 2].map(() => html`<div class="skeleton" style=${{ height: '360px' }}></div>`)}</div>`}
      ${state.dataLoaded && list.length > 0 && html`<div class="grid">
        ${list.map(ev => html`<article class="card" key=${ev.id} style=${{ cursor: 'default' }}>
          <${Cover} ev=${ev} cls="wide">
            <${DateBadge} ev=${ev} />
            <${Heart} on=${true} onClick=${() => toggleSave(ev)} />
            ${ev.lowSeats && html`<span class="corner-chip" style=${{ background: '#f97316' }}>Filling fast</span>`}
          <//>
          <div class="card-body">
            <div class="kicker">${ev.city}<i></i><span>${ev.kindLabel}</span></div>
            <h3>${ev.title}</h3>
            <div class="meta">${ev.weekday} · ${ev.time} · ${ev.venue}</div>
            <div style=${{ fontSize: '12px', fontWeight: 700, color: ev.leftColor }}>${ev.leftLabel}</div>
            <button class=${'btn btn-block ' + (ev.going ? '' : 'btn-primary')}
              style=${{ marginTop: 'auto', height: '46px', justifyContent: 'space-between', fontSize: '14px',
                ...(ev.going ? { background: '#dcfce7', color: '#15803d', border: 0 } : {}) }}
              onClick=${() => openEvent(ev.id)}>
              ${ev.going ? "✓ You're going" : ctaFor(ev).replace(/ · .*$/, '')}<span>${ev.priceLabel}</span>
            </button>
          </div>
        </article>`)}
      </div>`}
      ${state.dataLoaded && list.length === 0 && html`<${Empty} title="Nothing saved yet"
        sub="Tap the heart on any event to keep it here." action="Discover events" onAction=${() => navigate('/discover')} />`}
    </section></main>`;
}
