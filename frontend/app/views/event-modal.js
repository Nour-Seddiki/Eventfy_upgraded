import { html, useEffect } from '../lib.js';
import { api } from '../api.js';
import { state, setState, getEvent, navigate, getFreeTicket, applyToEvent, flash } from '../store.js';
import { Cover, QrImage, Field } from '../ui.js';
import { messageOrganizerSheet } from './messages.js';
import { downloadIcs, ticketCode } from '../util.js';

const patch = p => setState({ modal: { ...state.modal, ...p } });
const close = () => {
  // Opened from a #/event/<id> link: drop the id so a reload doesn't reopen it
  if (location.hash.startsWith('#/event/')) history.replaceState(null, '', '#/discover');
  setState({ modal: null });
};

function stepLabels(ev) {
  if (ev.requires_approval) return ['Details', 'Apply', 'Sent'];
  return ev.isFree ? ['Details', 'Confirm', 'Ticket'] : ['Details', 'Confirm', 'Payment'];
}

function primaryAction(ev) {
  const reg = ev.registration;
  if (ev.going) return { label: 'View my ticket', go: () => { close(); navigate('/tickets'); } };
  if (ev.requires_approval && reg) {
    if (reg.status === 'in_processing') return { label: 'Application pending review', disabled: true };
    if (reg.status === 'payment_required') return { label: `Continue to payment · ${ev.priceLabel}`, go: () => { close(); navigate(`/checkout/${ev.id}`); } };
    if (reg.status === 'rejected' && (reg.attempt_count || 1) >= 3) return { label: 'Application closed', disabled: true };
  }
  if (ev.soldOut) return { label: 'Sold out', disabled: true };
  if (ev.closed) return { label: 'Registration closed', disabled: true };
  const again = ev.requires_approval && reg && reg.status === 'rejected';
  return { label: again ? 'Apply again' : 'Continue', price: `${ev.priceLabel} →`, go: () => patch({ step: 2, error: null }) };
}

function Step1({ ev }) {
  const act = primaryAction(ev);
  const reg = ev.registration;
  return html`<div style=${{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
    <div>
      <div class="kicker" style=${{ marginBottom: '6px' }}>${ev.city} · ${ev.kindLabel}</div>
      <h2 id="modal-title" class="display" style=${{ fontSize: '24px', lineHeight: 1.15, letterSpacing: '-.6px', margin: 0 }}>${ev.title}</h2>
      <div class="meta" style=${{ fontSize: '14px', marginTop: '6px' }}>${ev.dateLong} · ${ev.venue}</div>
    </div>
    ${ev.description && html`<p style=${{ margin: 0, fontSize: '14px', lineHeight: 1.6, color: '#4a4455', whiteSpace: 'pre-line' }}>${ev.description}</p>`}
    ${reg && reg.status === 'rejected' && html`<div class="note warn">Your last application wasn't accepted. You can apply ${3 - (reg.attempt_count || 1)} more ${3 - (reg.attempt_count || 1) === 1 ? 'time' : 'times'}.</div>`}
    <div class="tier">
      <div><div style=${{ fontWeight: 800, fontSize: '15px' }}>${ev.isFree ? 'Free pass' : 'General admission'}</div>
        <div class="meta" style=${{ marginTop: '2px' }}>${ev.requires_approval ? 'Organizer reviews every application' : 'Full access to the event'}</div></div>
      <div class="price" style=${{ fontSize: '15px' }}>${ev.priceLabel}</div>
    </div>
    <div class="seats">
      <div><div style=${{ fontSize: '14px', fontWeight: 800 }}>Tickets</div>
        <div style=${{ fontSize: '12px', color: ev.leftColor, fontWeight: 700, marginTop: '2px' }}>${ev.leftLabel}</div></div>
      <span class="pill-soft">1 per person</span>
    </div>
    <button class="btn btn-primary btn-lg cta-split" disabled=${act.disabled} onClick=${act.go}>
      <span>${act.label}</span>${act.price && html`<span>${act.price}</span>`}
    </button>
    ${state.profile && state.profile.id !== ev.organizer_id && html`
      <button class="link-btn" style=${{ alignSelf: 'center', fontSize: '14px' }} onClick=${() => messageOrganizerSheet(ev.id)}>
        Questions? Message the organizer</button>`}
  </div>`;
}

function ConfirmStep({ ev }) {
  const m = state.modal, p = state.profile || {};
  const confirm = async () => {
    if (!ev.isFree) { close(); navigate(`/checkout/${ev.id}`); return; }
    patch({ busy: true, error: null });
    try {
      const ticket = await getFreeTicket(ev);
      patch({ busy: false, step: 3, ticket });
      flash('Ticket added to My tickets');
    } catch (e) { patch({ busy: false, error: e.message }); }
  };
  return html`<div style=${{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
    <h2 class="display" style=${{ fontSize: '22px', letterSpacing: '-.5px', margin: 0 }}>Who's coming?</h2>
    <${Field} label="Full name"><input class="input" value=${p.full_name || p.username || ''} disabled /><//>
    <${Field} label="Email for your ticket" hint="Tickets go to your account email. Change it in Profile."><input class="input" value=${p.email || ''} disabled /><//>
    <div class="sum-row" style=${{ padding: '4px 2px' }}><span>1 × ${ev.isFree ? 'Free pass' : 'General'}</span><b>${ev.priceLabel}</b></div>
    ${m.error && html`<div class="err" role="alert">${m.error}</div>`}
    <div style=${{ display: 'flex', gap: '10px' }}>
      <button class="btn" style=${{ height: '52px', padding: '0 22px', fontSize: '14px' }} onClick=${() => patch({ step: 1 })}>Back</button>
      <button class="btn btn-primary grow" style=${{ height: '52px', fontSize: '15px' }} disabled=${m.busy} onClick=${confirm}>
        ${m.busy ? 'Getting your ticket…' : ev.isFree ? 'Confirm registration' : 'Continue to payment →'}</button>
    </div>
  </div>`;
}

function Question({ q, value, onChange }) {
  const opts = (() => { try { return JSON.parse(q.options_json || '[]'); } catch { return []; } })();
  const label = q.label + (q.is_required ? ' *' : '');
  if (q.question_type === 'long_text') {
    return html`<${Field} label=${label}><textarea class="input" rows="3" value=${value} onInput=${e => onChange(e.target.value)}></textarea><//>`;
  }
  if (q.question_type === 'multiple_choice' || q.question_type === 'yes_no') {
    const choices = q.question_type === 'yes_no' ? ['Yes', 'No'] : opts;
    return html`<div class="field">${label}
      <div style=${{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        ${choices.map(c => html`<button type="button" class=${'btn' + (value === c ? ' btn-primary' : '')} onClick=${() => onChange(c)} aria-pressed=${value === c}>${c}</button>`)}
      </div></div>`;
  }
  return html`<${Field} label=${label}><input class="input" value=${value} onInput=${e => onChange(e.target.value)} /><//>`;
}

function ApplyStep({ ev }) {
  const m = state.modal;
  useEffect(() => {
    if (m.questions) return;
    api(`/registrations/events/${ev.id}/questions`, { auth: false })
      .then(questions => {
        const p = state.profile || {};
        const answers = {};
        questions.forEach(q => { answers[q.id] = (q.profile_field_key && p[q.profile_field_key]) || ''; });
        patch({ questions, answers });
      })
      .catch(e => patch({ questions: [], answers: {}, error: e.message }));
  }, [ev.id]);

  const submit = async () => {
    const missing = (m.questions || []).find(q => q.is_required && !String(m.answers[q.id] || '').trim());
    if (missing) return patch({ error: `Please answer “${missing.label}”` });
    patch({ busy: true, error: null });
    try {
      await applyToEvent(ev, (m.questions || []).map(q => ({ question_id: q.id, answer_value: String(m.answers[q.id] || '') })));
      patch({ busy: false, step: 3 });
    } catch (e) { patch({ busy: false, error: e.message }); }
  };

  return html`<div style=${{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
    <h2 class="display" style=${{ fontSize: '22px', letterSpacing: '-.5px', margin: 0 }}>Apply to join</h2>
    <p class="meta" style=${{ margin: 0 }}>The organizer reviews every application. ${ev.isFree ? "You'll get your ticket once you're accepted." : "Once you're accepted you can pay and get your ticket."}</p>
    ${!m.questions && html`<div class="skeleton" style=${{ height: '120px' }}></div>`}
    ${m.questions && m.questions.map(q => html`<${Question} key=${q.id} q=${q} value=${m.answers[q.id] || ''}
      onChange=${v => patch({ answers: { ...state.modal.answers, [q.id]: v } })} />`)}
    ${m.error && html`<div class="err" role="alert">${m.error}</div>`}
    <div style=${{ display: 'flex', gap: '10px' }}>
      <button class="btn" style=${{ height: '52px', padding: '0 22px', fontSize: '14px' }} onClick=${() => patch({ step: 1, error: null })}>Back</button>
      <button class="btn btn-primary grow" style=${{ height: '52px', fontSize: '15px' }} disabled=${m.busy || !m.questions} onClick=${submit}>
        ${m.busy ? 'Sending…' : 'Send application'}</button>
    </div>
  </div>`;
}

function DoneStep({ ev }) {
  const m = state.modal, p = state.profile || {};
  const first = (p.full_name || p.username || 'there').split(' ')[0];
  if (ev.requires_approval) {
    return html`<div style=${{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px' }}>
      <div class="done-mark" style=${{ width: '52px', height: '52px', fontSize: '24px' }}>✓</div>
      <h2 class="display" style=${{ fontSize: '24px', letterSpacing: '-.5px', margin: 0 }}>Application sent</h2>
      <p class="meta" style=${{ maxWidth: '340px', margin: 0 }}>We'll notify you when the organizer reviews it.${ev.isFree ? '' : ' If you are accepted, you can pay from the event page.'}</p>
      <button class="btn btn-primary" style=${{ width: '100%', height: '48px' }} onClick=${close}>Done</button>
    </div>`;
  }
  const t = m.ticket;
  return html`<div style=${{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px' }}>
    <div class="done-mark" style=${{ width: '52px', height: '52px', fontSize: '24px' }}>✓</div>
    <h2 class="display" style=${{ fontSize: '24px', letterSpacing: '-.5px', margin: 0 }}>You're in, ${first}</h2>
    <p class="meta" style=${{ maxWidth: '340px', margin: 0 }}>Sent to ${p.email}. Show this code at the door.</p>
    <div class="ticket" style=${{ marginTop: '6px' }}>
      <div class="ticket-top"><div><small>${ev.dateLong}</small><b>${ev.title}</b></div><span class="ticket-tier">1 × Free pass</span></div>
      <div class="ticket-bottom">
        ${t && html`<${QrImage} ticketId=${t.id} size=${112} />`}
        <div class="kv">
          <div><span>Ticket</span><span class="mono">${t ? ticketCode(t.id) : ''}</span></div>
          <div><span>Holder</span><b>${p.full_name || p.username}</b></div>
          <div><span>Venue</span><b>${ev.venue}</b></div>
        </div>
      </div>
    </div>
    <div style=${{ display: 'flex', gap: '10px', width: '100%', marginTop: '4px' }}>
      <button class="btn grow" style=${{ height: '48px', fontSize: '14px' }} onClick=${() => { close(); navigate('/tickets'); }}>View my tickets</button>
      <button class="btn btn-primary grow" style=${{ height: '48px' }} onClick=${() => downloadIcs(ev)}>Add to calendar</button>
    </div>
  </div>`;
}

export function EventModal() {
  const m = state.modal;
  if (!m) return null;
  const ev = getEvent(m.eventId);
  const mobile = state.w < 820;
  if (!ev) {
    return html`<div class=${'scrim' + (mobile ? ' sheety' : '')} onClick=${close}>
      <div class="sheet" onClick=${e => e.stopPropagation()} style=${{ padding: '40px', textAlign: 'center' }}>
        ${state.eventsLoaded ? 'This event is no longer available.' : 'Loading…'}</div></div>`;
  }
  const labels = stepLabels(ev);
  return html`<div class=${'scrim' + (mobile ? ' sheety' : '')} onClick=${close}>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick=${e => e.stopPropagation()}>
      <${Cover} ev=${ev} cls="banner">
        <button class="close-x" aria-label="Close" onClick=${close}>✕</button>
      <//>
      <div class="sheet-body">
        <div class="step-bars">${labels.map((l, i) => html`<div class=${i < m.step ? 'on' : ''}><i></i><span>${l}</span></div>`)}</div>
        ${m.step === 1 && html`<${Step1} ev=${ev} />`}
        ${m.step === 2 && (ev.requires_approval ? html`<${ApplyStep} ev=${ev} />` : html`<${ConfirmStep} ev=${ev} />`)}
        ${m.step === 3 && html`<${DoneStep} ev=${ev} />`}
      </div>
    </div>
  </div>`;
}
