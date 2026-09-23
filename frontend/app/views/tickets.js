import { html } from '../lib.js';
import { state, setState, myTickets, navigate, cancelTicket, rateEvent } from '../store.js';
import { DateBox, QrImage, Empty } from '../ui.js';
import { downloadIcs, directionsUrl, startsIn, ticketCode } from '../util.js';

const tierLabel = ev => (ev.isFree ? 'Free pass' : 'General');

function askCancel(t) {
  setState({
    confirm: {
      title: 'Cancel this ticket?',
      body: `Your seat at ${t.ev.title} goes back to other attendees. You can get a new ticket later while seats last.`,
      confirmLabel: 'Cancel ticket', danger: true,
      onConfirm: () => cancelTicket(t),
    },
  });
}

function NextUp({ t }) {
  const ev = t.ev;
  const mobile = state.w < 820;
  return html`<div class="next">
    <div class="next-main">
      <div style=${{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span class="tag-orange">NEXT UP</span>
        <span style=${{ fontSize: '14px', fontWeight: 800, color: '#7c3aed' }}>${ev.start > new Date() ? `Starts in ${startsIn(ev.start)}` : 'Happening now'}</span>
      </div>
      <h2>${ev.title}</h2>
      <div class="facts">
        <div class="fact"><small>Date</small><b>${ev.dateShort}</b></div>
        <div class="fact"><small>Doors open</small><b>${ev.time}</b></div>
        <div class="fact"><small>Venue</small><b>${ev.venue}</b></div>
        <div class="fact"><small>Ticket</small><b>${tierLabel(ev)} × 1</b></div>
      </div>
      <div style=${{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button class="btn" onClick=${() => downloadIcs(ev)}>Add to calendar</button>
        <a class="btn" href=${directionsUrl(ev)} target="_blank" rel="noopener">Get directions</a>
        ${ev.isFree && html`<button class="btn btn-danger" onClick=${() => askCancel(t)}>Cancel ticket</button>`}
      </div>
    </div>
    <div class="stub" style=${mobile ? {} : undefined}>
      <${QrImage} ticketId=${t.id} size=${160} />
      <div class="mono" style=${{ fontSize: '13px', fontWeight: 500 }}>${ticketCode(t.id)}</div>
      <button class="btn btn-primary" style=${{ height: '46px', padding: '0 22px' }} onClick=${() => setState({ qrTicketId: t.id })}>Show at the door</button>
    </div>
  </div>`;
}

function PastRow({ t }) {
  const ev = t.ev;
  const attended = t.status === 'used';
  const rating = state.myRatings[ev.id] || 0;
  return html`<div class="row">
    <${DateBox} ev=${ev} past=${true} />
    <div style=${{ minWidth: 0 }}>
      <div style=${{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span class="row-title">${ev.title}</span>
        ${attended ? html`<span class="pill-green">Attended</span>` : html`<span class="pill-grey">Not checked in</span>`}
      </div>
      <div class="row-sub">${ev.start.toLocaleString('en', { month: 'long', year: 'numeric' })} · ${ev.venue}</div>
    </div>
    ${attended && html`<div class="row-end" style=${{ flexDirection: 'column', alignItems: state.w < 820 ? 'flex-start' : 'flex-end', gap: '4px' }}>
      <div class="stars" role="group" aria-label="Rate this event">
        ${[1, 2, 3, 4, 5].map(n => html`<button aria-label=${`${n} star${n > 1 ? 's' : ''}`} disabled=${!!rating}
          style=${{ color: n <= rating ? '#f97316' : '#dcd7e3' }} onClick=${() => rateEvent(ev.id, n)}>★</button>`)}
      </div>
      <span class="hint">${rating ? `You rated ${rating}/5` : 'Rate this event'}</span>
    </div>`}
  </div>`;
}

export function Tickets() {
  const { upcoming, past } = myTickets();
  const tab = state.ticketTab;
  const [next, ...more] = upcoming;
  const attended = past.filter(t => t.status === 'used').length;
  return html`
    <section class="dark"><div class="wrap page-head">
      <div><h1 class="page-title">My tickets</h1><p class="page-sub">${upcoming.length} upcoming · ${attended} attended</p></div>
      <div class="seg-dark" role="tablist">
        ${[['up', 'Upcoming'], ['past', 'Past']].map(([k, l]) => html`<button role="tab" aria-selected=${tab === k}
          class=${tab === k ? 'on' : ''} onClick=${() => setState({ ticketTab: k })}>${l}</button>`)}
      </div>
    </div></section>
    <main class="page-main"><section class="wrap section">
      ${!state.dataLoaded && html`<div class="skeleton" style=${{ height: '260px' }}></div>`}
      ${state.dataLoaded && tab === 'up' && next && html`
        <${NextUp} t=${next} />
        ${more.length > 0 && html`<div class="rows">
          <h3 class="eyebrow" style=${{ margin: '0 0 4px' }}>Also coming up</h3>
          ${more.map(t => html`<div class="row">
            <${DateBox} ev=${t.ev} />
            <div style=${{ minWidth: 0 }}>
              <div class="row-title">${t.ev.title}</div>
              <div class="row-sub">${t.ev.time} · ${t.ev.venue} · <span class="mono" style=${{ fontSize: '12px' }}>${ticketCode(t.id)}</span></div>
            </div>
            <div class="row-end" style=${{ gap: '8px' }}>
              <span class="pill-soft">${tierLabel(t.ev)} × 1</span>
              <button class="btn btn-dark" style=${{ height: '38px', padding: '0 14px', fontSize: '13px' }} onClick=${() => setState({ qrTicketId: t.id })}>QR</button>
            </div>
          </div>`)}
        </div>`}`}
      ${state.dataLoaded && tab === 'up' && !next && html`<${Empty} title="No upcoming tickets"
          sub="Your next conference or workshop is a search away." action="Discover events" onAction=${() => navigate('/discover')} />`}
      ${state.dataLoaded && tab === 'past' && (past.length
        ? html`<div class="rows">${past.map(t => html`<${PastRow} key=${t.id} t=${t} />`)}</div>`
        : html`<${Empty} title="No past events yet" sub="Events you attend show up here so you can rate them." />`)}
    </section></main>`;
}

export function QrModal() {
  const id = state.qrTicketId;
  if (!id) return null;
  const t = [...myTickets().upcoming, ...myTickets().past].find(x => x.id === id);
  if (!t) return null;
  const closeQr = () => setState({ qrTicketId: null });
  const p = state.profile || {};
  const used = t.status === 'used';
  return html`<div class="scrim" style=${{ zIndex: 110, background: 'rgba(17,14,23,.8)' }} onClick=${closeQr}>
    <div class="qr-card" role="dialog" aria-modal="true" aria-label="Ticket QR code" onClick=${e => e.stopPropagation()}>
      <div class="qr-top"><div style=${{ fontSize: '12px', fontWeight: 700, opacity: .85 }}>${t.ev.dateLong}</div>
        <div class="display" style=${{ fontSize: '20px', marginTop: '4px', letterSpacing: '-.4px' }}>${t.ev.title}</div></div>
      <div style=${{ padding: '28px 24px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
        <${QrImage} ticketId=${t.id} size=${240} />
        <div class="mono" style=${{ fontSize: '15px', fontWeight: 500, letterSpacing: '1px' }}>${ticketCode(t.id)}</div>
        ${used ? html`<span class="pill-grey" style=${{ fontSize: '12px', padding: '5px 12px' }}>Checked in</span>`
               : html`<span class="pill-green" style=${{ fontSize: '12px', padding: '5px 12px' }}>Valid · not scanned yet</span>`}
        <div class="meta">${p.full_name || p.username} · ${tierLabel(t.ev)} × 1</div>
        <div style=${{ display: 'flex', gap: '10px', width: '100%', marginTop: '6px' }}>
          <button class="btn grow" style=${{ height: '48px', fontSize: '14px' }} onClick=${closeQr}>Close</button>
          <button class="btn btn-dark grow" style=${{ height: '48px' }} onClick=${() => downloadIcs(t.ev)}>Add to calendar</button>
        </div>
      </div>
    </div>
  </div>`;
}

export function ConfirmDialog() {
  const c = state.confirm;
  if (!c) return null;
  const done = () => setState({ confirm: null });
  return html`<div class="scrim" style=${{ zIndex: 130 }} onClick=${done}>
    <div class="sheet" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" style=${{ maxWidth: '420px' }} onClick=${e => e.stopPropagation()}>
      <div class="sheet-body">
        <h2 id="confirm-title" class="display" style=${{ fontSize: '22px', margin: 0, letterSpacing: '-.5px' }}>${c.title}</h2>
        <p class="meta" style=${{ margin: 0, fontSize: '14px', lineHeight: 1.6 }}>${c.body}</p>
        <div style=${{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button class="btn" onClick=${done}>Keep it</button>
          <button class=${'btn ' + (c.danger ? 'btn-danger' : 'btn-primary')} onClick=${async () => { done(); await c.onConfirm(); }}>${c.confirmLabel}</button>
        </div>
      </div>
    </div>
  </div>`;
}
