import { html, useState, useEffect } from '../lib.js';
import { state, getEvent, navigate, startCheckout, verifyPayment, myTickets } from '../store.js';
import { Cover, Choice, QrImage, Icon, ICONS } from '../ui.js';
import { downloadIcs, ticketCode } from '../util.js';

const METHODS = [
  ['cib', 'CIB', 'Interbank card (SATIM)'],
  ['edahabia', 'EDAHABIA', 'Algérie Poste card'],
];

function Summary({ ev, children }) {
  return html`<div class="panel" style=${{ padding: 0, gap: 0, overflow: 'hidden' }}>
    <${Cover} ev=${ev} cls="banner" />
    <div style=${{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div><div class="kicker">${ev.city} · ${ev.kindLabel}</div>
        <div class="display" style=${{ fontWeight: 700, fontSize: '18px', marginTop: '4px', lineHeight: 1.25 }}>${ev.title}</div>
        <div class="meta" style=${{ marginTop: '4px' }}>${ev.dateLong} · ${ev.venue}</div></div>
      <div style=${{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '14px', borderTop: '1px solid #f1eff4' }}>
        <div class="sum-row"><span>1 × General admission</span><b>${ev.priceLabel}</b></div>
        ${ev.converted && html`<div class="sum-row"><span>Converted from ${ev.converted}</span><b></b></div>`}
      </div>
      <div class="total-row"><span style=${{ fontSize: '15px', fontWeight: 800 }}>Total</span>
        <span class="display" style=${{ fontSize: '24px', letterSpacing: '-.5px' }}>${ev.priceLabel}</span></div>
      ${children}
    </div>
  </div>`;
}

export function Checkout() {
  const ev = getEvent(Number(state.route.params.id));
  const [method, setMethod] = useState('cib');
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);

  if (!ev) {
    return html`<main class="page-main"><section class="wrap-narrow section">
      ${state.eventsLoaded ? html`<div class="empty"><div class="empty-title">This event isn't available</div>
        <div class="empty-sub">It may have ended or been removed.</div>
        <button class="btn btn-primary" onClick=${() => navigate('/discover')}>Discover events</button></div>`
      : html`<div class="skeleton" style=${{ height: '320px' }}></div>`}
    </section></main>`;
  }
  const blocked = ev.going ? "You already have a ticket for this event."
    : ev.isFree ? 'This event is free, no payment needed.'
    : ev.soldOut ? 'This event is sold out.'
    : ev.requires_approval && !(ev.registration && ev.registration.status === 'payment_required') ? 'The organizer needs to approve your application before you can pay.'
    : null;

  const pay = async () => {
    setBusy(true); setError(null);
    try { await startCheckout(ev, method); } catch (e) { setError(e.message); setBusy(false); }
  };

  return html`<main class="page-main"><section class="wrap-narrow" style=${{ paddingTop: '24px', paddingBottom: '80px' }}>
    <div style=${{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <button class="back-btn" style=${{ alignSelf: 'flex-start' }} onClick=${() => navigate(`/event/${ev.id}`)}>← Back to ticket details</button>
      <div>
        <div class="steps-line"><span style=${{ color: '#16a34a' }}>✓ Tickets</span><span>—</span><span style=${{ color: '#16a34a' }}>✓ Details</span><span>—</span><span style=${{ color: '#7c3aed' }}>Payment</span></div>
        <h1 class="display" style=${{ fontSize: 'clamp(30px,4vw,44px)', letterSpacing: '-1.4px', margin: '8px 0 0' }}>Checkout</h1>
      </div>
      <div class="co-grid">
        <div style=${{ display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>
          <div class="panel">
            <div><h2>Payment method</h2><p class="desc">Pay with an Algerian bank card. You'll enter your card details on Chargily Pay's secure page.</p></div>
            <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '10px' }}>
              ${METHODS.map(([id, l, sub]) => html`<${Choice} on=${method === id} label=${l} sub=${sub} onClick=${() => setMethod(id)} />`)}
            </div>
          </div>
          <div class="note">
            <span style=${{ flexShrink: 0, marginTop: '1px' }}><${Icon} d=${ICONS.lock} size=${18} /></span>
            <span>Payments are processed by Chargily Pay with 3-D Secure through SATIM. Eventfy never sees or stores your card number.</span>
          </div>
        </div>
        <aside class="co-aside">
          <${Summary} ev=${ev}>
            ${blocked
              ? html`<div class="note warn">${blocked}</div>`
              : html`<button class="btn btn-primary btn-lg" disabled=${busy} onClick=${pay}>${busy ? 'Opening Chargily…' : `Pay ${ev.priceLabel}`}</button>`}
            ${error && html`<div class="err" role="alert">${error}</div>`}
            <p style=${{ margin: 0, fontSize: '12px', color: '#8a8496', textAlign: 'center', lineHeight: 1.5 }}>You'll come back here once the payment is confirmed.</p>
          <//>
        </aside>
      </div>
    </div>
  </section></main>`;
}

/** Landing page after Chargily redirects back: confirms the payment and shows the ticket. */
export function PaymentResult() {
  const paymentId = state.route.params.id;
  const [phase, setPhase] = useState('checking');   // checking | pending | done | failed | error
  const [result, setResult] = useState(null), [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    verifyPayment(paymentId, () => alive && setPhase('pending'))
      .then(res => {
        if (!alive) return;
        setResult(res);
        if (res.status === 'fulfilled' || res.status === 'already_fulfilled') setPhase('done');
        else setPhase(['failed', 'canceled', 'expired'].includes(res.payment_status) ? 'failed' : 'pending-final');
      })
      .catch(e => { if (alive) { setError(e.message); setPhase('error'); } });
    return () => { alive = false; };
  }, [paymentId]);

  const wrap = body => html`<main class="page-main"><section class="wrap-narrow" style=${{ paddingTop: '24px', paddingBottom: '80px' }}>
    <div style=${{ maxWidth: '560px', margin: '24px auto 0', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '14px' }}>${body}</div>
  </section></main>`;

  if (phase === 'checking' || phase === 'pending') {
    return wrap(html`<div class="spinner" role="status" aria-label="Confirming payment"></div>
      <h1 class="display" style=${{ fontSize: 'clamp(26px,4vw,34px)', letterSpacing: '-1px', margin: 0 }}>Confirming your payment…</h1>
      <p class="meta" style=${{ margin: 0, fontSize: '15px' }}>${phase === 'pending' ? 'Chargily is still processing it. This can take a few seconds.' : 'Checking with Chargily and issuing your ticket.'}</p>`);
  }
  if (phase !== 'done') {
    const title = phase === 'failed' ? 'Payment not completed' : phase === 'error' ? 'We couldn’t confirm your payment' : 'Payment still processing';
    const sub = phase === 'failed' ? 'You were not charged. You can try again from the event page.'
      : phase === 'error' ? error : 'If you completed the payment, your ticket will appear in My tickets shortly.';
    return wrap(html`<div class=${'done-mark' + (phase === 'failed' || phase === 'error' ? ' bad' : '')}>${phase === 'failed' || phase === 'error' ? '!' : '…'}</div>
      <h1 class="display" style=${{ fontSize: 'clamp(26px,4vw,34px)', letterSpacing: '-1px', margin: 0 }}>${title}</h1>
      <p class="meta" style=${{ margin: 0, fontSize: '15px', maxWidth: '440px' }}>${sub}</p>
      <div style=${{ display: 'flex', gap: '10px', width: '100%', flexWrap: 'wrap', marginTop: '6px' }}>
        <button class="btn btn-primary grow" style=${{ height: '50px', fontSize: '15px' }} onClick=${() => navigate('/tickets')}>Go to my tickets</button>
        <button class="btn grow" style=${{ height: '50px', fontSize: '14px' }} onClick=${() => navigate('/discover')}>Discover events</button>
      </div>`);
  }

  const ticket = [...myTickets().upcoming, ...myTickets().past].find(t => t.id === result.ticket_id);
  const ev = ticket ? ticket.ev : getEvent(result.event_id);
  const p = state.profile || {};
  return wrap(html`<div class="done-mark">✓</div>
    <h1 class="display" style=${{ fontSize: 'clamp(28px,4vw,38px)', letterSpacing: '-1.2px', margin: 0 }}>Payment confirmed</h1>
    <p class="meta" style=${{ margin: 0, fontSize: '15px', lineHeight: 1.6, maxWidth: '440px' }}>
      ${ev ? `${ev.priceLabel} paid. ` : ''}Your ticket is in My tickets and on its way to ${p.email}.</p>
    ${ev && html`<div class="ticket" style=${{ marginTop: '8px' }}>
      <div class="ticket-top"><div><small>${ev.dateLong}</small><b>${ev.title}</b></div><span class="ticket-tier">1 × General</span></div>
      <div class="ticket-bottom">
        ${result.ticket_id && html`<${QrImage} ticketId=${result.ticket_id} size=${112} />`}
        <div class="kv">
          ${result.ticket_id && html`<div><span>Ticket</span><span class="mono">${ticketCode(result.ticket_id)}</span></div>`}
          <div><span>Paid</span><b>${ev.priceLabel}</b></div>
          <div><span>Date</span><b>${ev.dateShort}</b></div>
          <div><span>Venue</span><b>${ev.venue}</b></div>
        </div>
      </div>
    </div>`}
    <div style=${{ display: 'flex', gap: '10px', width: '100%', flexWrap: 'wrap', marginTop: '6px' }}>
      <button class="btn btn-primary grow" style=${{ height: '50px', fontSize: '15px' }} onClick=${() => navigate('/tickets')}>View my tickets</button>
      ${ev && html`<button class="btn grow" style=${{ height: '50px', fontSize: '14px' }} onClick=${() => downloadIcs(ev)}>Add to calendar</button>`}
    </div>`);
}
