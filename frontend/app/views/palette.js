import { html, useEffect, useRef } from '../lib.js';
import { state, setState, allEvents, openEvent } from '../store.js';
import { SearchIcon } from '../ui.js';

export function Palette() {
  const ref = useRef(null);
  useEffect(() => { if (state.palette && ref.current) ref.current.focus(); }, [state.palette]);
  if (!state.palette) return null;

  const pq = state.pq.trim().toLowerCase();
  const events = allEvents();
  const src = pq
    ? events.filter(e => `${e.title} ${e.venue} ${e.description || ''}`.toLowerCase().includes(pq))
    : [...events].sort((a, b) => a.start - b.start).slice(0, 5);
  const results = src.slice(0, 6);
  const close = () => setState({ palette: false });

  return html`<div class="scrim palette-scrim" onClick=${close}>
    <div class="palette" role="dialog" aria-modal="true" aria-label="Search events" onClick=${e => e.stopPropagation()}>
      <div class="palette-in">
        <${SearchIcon} size=${18} color="#7c3aed" />
        <input ref=${ref} value=${state.pq} placeholder="Search talks, workshops, venues…" aria-label="Search"
          onInput=${e => setState({ pq: e.target.value })}
          onKeyDown=${e => { if (e.key === 'Enter' && results[0]) openEvent(results[0].id); }} />
        <span class="kbd" style=${{ background: '#f1eff4', color: '#6b6578', padding: '3px 8px' }}>esc</span>
      </div>
      <div class="palette-list">
        <div style=${{ padding: '8px 12px 6px', fontSize: '11px', fontWeight: 800, color: '#8a8496', textTransform: 'uppercase', letterSpacing: '1px' }}>
          ${pq ? `${src.length} result${src.length === 1 ? '' : 's'}` : 'Coming up soon'}</div>
        ${results.map((e, i) => html`<button class=${'palette-row' + (i === 0 && pq ? ' first' : '')} onClick=${() => openEvent(e.id)}>
          <div class="mini-date"><small>${e.mon}</small><b>${e.day}</b></div>
          <div class="grow" style=${{ minWidth: 0 }}>
            <div style=${{ fontWeight: 700, fontSize: '14px', color: '#16131d' }}>${e.title}</div>
            <div class="hint" style=${{ fontWeight: 500, marginTop: '2px' }}>${e.dateShort} · ${e.venue} · ${e.priceLabel}</div>
          </div>
          <span style=${{ fontSize: '13px', color: '#7c3aed', fontWeight: 800 }} aria-hidden="true">↵</span>
        </button>`)}
        ${pq && src.length === 0 && html`<div style=${{ padding: '28px 12px', textAlign: 'center', fontSize: '14px', color: '#8a8496' }}>No events match “${state.pq}”</div>`}
      </div>
    </div>
  </div>`;
}
