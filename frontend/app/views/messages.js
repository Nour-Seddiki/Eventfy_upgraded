import { html, useEffect, useRef, useState } from '../lib.js';
import {
  state, setState, navigate, role, allEvents, getEvent, loadConversations, openThread, sendMessage,
  contactSupport, messageOrganizer, announce, closeThread, promoteFromThread, flash,
} from '../store.js';
import { Avatar, Choice, Field, Empty } from '../ui.js';
import { initialsOf, relativeTime, avatarColors } from '../util.js';

const TOPICS = [
  ['organizer_access', 'Become an organizer', 'Ask for access to publish your own IT events'],
  ['problem', 'Report a problem', 'Tickets, payments, an event or your account'],
  ['other', 'Something else', 'Questions and feedback for the team'],
];

const openCompose = compose => setState({ compose });
export const contactSupportSheet = (topic = 'problem') => openCompose({ mode: 'support', topic });
export const messageOrganizerSheet = eventId => openCompose({ mode: 'organizer', eventId });

function myUpcomingEvents() {
  const me = state.profile && state.profile.id;
  return allEvents().filter(e => e.organizer_id === me && !e.closed);
}

// ── List ─────────────────────────────────────────────
function ConvAvatar({ c }) {
  const who = c.counterpart || {};
  if (c.kind === 'support' && !c.viewer_is_staff) {
    return html`<span class="conv-av team" aria-hidden="true">E</span>`;
  }
  const [bg, fg] = avatarColors(who.id || c.id);
  return html`<span class="conv-av" style=${{ background: bg, color: fg }} aria-hidden="true">${initialsOf(who.name)}</span>`;
}

function kindChip(c) {
  if (c.kind === 'support') return html`<span class=${'chip ' + (c.topic === 'problem' ? 'chip-orange' : 'chip-violet')}>${c.topic_label}</span>`;
  return html`<span class="chip chip-sky">Event</span>`;
}

function ConvItem({ c, active }) {
  const last = c.last_message;
  const mine = last && last.from_staff === c.viewer_is_staff;
  const preview = last ? (last.is_announcement ? '📣 ' : mine ? 'You: ' : '') + last.body : 'No messages yet';
  return html`<button class=${'conv-item' + (active ? ' active' : '') + (c.unread ? ' unread' : '')}
      onClick=${() => navigate(`/messages/${c.id}`)} aria-current=${active ? 'true' : undefined}>
    <${ConvAvatar} c=${c} />
    <span class="conv-main">
      <span class="conv-top"><b>${c.title}</b><small>${last ? relativeTime(last.created_at) : ''}</small></span>
      <span class="conv-mid">${kindChip(c)}<span>${c.counterpart.name}</span>${c.status === 'closed' ? html`<span class="chip chip-grey">Resolved</span>` : null}</span>
      <span class="conv-preview">${preview}</span>
    </span>
    ${c.unread > 0 && html`<span class="conv-badge" aria-label=${`${c.unread} unread`}>${c.unread}</span>`}
  </button>`;
}

// ── Thread ───────────────────────────────────────────
function Composer({ thread }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try { await sendMessage(thread.id, body); setText(''); } catch (e) { flash(e.message); }
    setBusy(false);
  };
  return html`<div class="composer">
    <textarea class="input" rows="1" maxlength="2000" value=${text} placeholder="Write a message…" aria-label="Message"
      onInput=${e => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'; }}
      onKeyDown=${e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}></textarea>
    <button class="btn btn-primary" disabled=${busy || !text.trim()} onClick=${send}>${busy ? 'Sending…' : 'Send'}</button>
  </div>`;
}

function Thread({ thread }) {
  const listRef = useRef(null);
  const mobile = state.w < 820;
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [thread.id, thread.messages.length]);

  const req = thread.requester;
  const canPromote = thread.viewer_is_staff && thread.kind === 'support' && req && req.role === 'attendee';
  const ev = thread.event_id ? getEvent(thread.event_id) : null;
  const sub = thread.kind === 'support'
    ? (thread.viewer_is_staff ? `${thread.counterpart.name} · ${thread.counterpart.email || ''} · ${thread.counterpart.role}` : 'Eventfy team')
    : thread.viewer_is_staff ? `${thread.counterpart.name} · attendee` : `Organizer · ${thread.counterpart.name}`;

  return html`<section class="thread" aria-label=${thread.title}>
    <header class="thread-head">
      ${mobile && html`<button class="back-btn" onClick=${() => navigate('/messages')} aria-label="Back to conversations">←</button>`}
      <div class="grow" style=${{ minWidth: 0 }}>
        <div class="thread-title">${thread.title}${thread.status === 'closed' ? html` <span class="chip chip-grey">Resolved</span>` : null}</div>
        <div class="thread-sub">${sub}</div>
      </div>
      <div class="thread-actions">
        ${canPromote && html`<button class="btn btn-primary" onClick=${() => promoteFromThread(req.id, thread.id)}>Promote to organizer</button>`}
        ${thread.event_id && html`<button class="btn" onClick=${() => navigate(`/event/${thread.event_id}`)} disabled=${!ev}>View event</button>`}
        ${thread.status === 'open' && html`<button class="btn" onClick=${() => closeThread(thread.id)}>Mark resolved</button>`}
      </div>
    </header>
    ${canPromote && req.organizer_request_pending && html`<div class="note warn" style=${{ margin: '12px 16px 0' }}>
      ${req.name} asked for organizer access. Promote them here, or reply with questions first.</div>`}
    <div class="thread-body" ref=${listRef}>
      ${thread.messages.map(m => m.is_announcement
        ? html`<div class="msg-announce" key=${m.id}><div class="msg-announce-tag">📣 Announcement · ${m.sender_name}</div>
            <div class="msg-text">${m.body}</div><small>${relativeTime(m.created_at)}</small></div>`
        : html`<div class=${'msg' + (m.mine ? ' mine' : '')} key=${m.id}>
            ${!m.mine && html`<div class="msg-who">${m.sender_name}</div>`}
            <div class="msg-bubble"><div class="msg-text">${m.body}</div></div>
            <small>${relativeTime(m.created_at)}</small>
          </div>`)}
    </div>
    ${thread.status === 'closed' && html`<div class="thread-closed">Marked as resolved · sending a message reopens it</div>`}
    <${Composer} key=${thread.id} thread=${thread} />
  </section>`;
}

// ── Page ─────────────────────────────────────────────
export function Messages() {
  const id = state.route.params.id ? Number(state.route.params.id) : null;
  const r = role();
  const mobile = state.w < 820;
  useEffect(() => { loadConversations(); }, []);
  useEffect(() => { if (id) openThread(id); else setState({ thread: null }); }, [id]);

  const list = state.conversations;
  const thread = state.thread && state.thread.id === id ? state.thread : null;
  const sub = r === 'admin' ? 'Support requests from attendees and organizers.'
    : r === 'organizer' ? 'Questions from your attendees, and the Eventfy team.'
    : 'Chat with event organizers and the Eventfy team.';

  const showList = !mobile || !id;
  const showThread = !mobile || id;

  return html`
    <section class="dark"><div class="wrap page-head">
      <div><h1 class="page-title">Messages</h1><p class="page-sub">${sub}</p></div>
      <div style=${{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        ${r === 'organizer' && html`<button class="btn btn-primary" onClick=${() => openCompose({ mode: 'announce' })}>Announce to attendees</button>`}
        ${r !== 'admin' && html`<button class="btn" onClick=${() => contactSupportSheet()}>Contact support</button>`}
      </div>
    </div></section>
    <main class="page-main"><section class="wrap" style=${{ paddingTop: '28px', paddingBottom: '80px' }}>
      ${state.convLoaded && list.length === 0
        ? html`<${Empty} title="No messages yet"
            sub=${r === 'admin' ? 'Support requests from users will show up here.' : 'Message an organizer from any event page, or reach the Eventfy team here.'}
            action=${r === 'admin' ? null : 'Contact support'} onAction=${() => contactSupportSheet()} />`
        : html`<div class="chat">
          ${showList && html`<nav class="conv-list" aria-label="Conversations">
            ${!state.convLoaded && [0, 1, 2].map(() => html`<div class="skeleton" style=${{ height: '76px', borderRadius: '14px' }}></div>`)}
            ${list.map(c => html`<${ConvItem} key=${c.id} c=${c} active=${c.id === id} />`)}
          </nav>`}
          ${showThread && (thread
            ? html`<${Thread} thread=${thread} />`
            : html`<section class="thread thread-empty">${id ? html`<div class="spinner"></div>` : 'Pick a conversation to read it.'}</section>`)}
        </div>`}
    </section></main>`;
}

// ── Compose sheet (support / message organizer / announce) ──
export function ComposeSheet() {
  const c = state.compose;
  // Re-mount per opening so the form starts from the topic/event it was opened with
  return c ? html`<${Compose} key=${[c.mode, c.topic, c.eventId].join(':')} c=${c} />` : null;
}

function Compose({ c }) {
  const [topic, setTopic] = useState(c.topic || 'problem');
  const [eventId, setEventId] = useState(c.eventId || '');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);

  const close = () => { setState({ compose: null }); setText(''); setError(null); };
  const myEvents = c.mode === 'announce' ? myUpcomingEvents() : [];
  const ev = c.mode === 'organizer' ? getEvent(c.eventId) : null;
  const titles = { support: 'Contact the Eventfy team', organizer: 'Message the organizer', announce: 'Announce to attendees' };

  const send = async () => {
    const body = text.trim();
    if (!body) return setError('Write a message first');
    if (c.mode === 'announce' && !eventId) return setError('Pick one of your events');
    setBusy(true); setError(null);
    try {
      if (c.mode === 'support') await contactSupport(topic, body);
      else if (c.mode === 'organizer') await messageOrganizer(c.eventId, body);
      else await announce(Number(eventId), body);
      setText('');
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  return html`<div class=${'scrim' + (state.w < 820 ? ' sheety' : '')} style=${{ zIndex: 125 }} onClick=${close}>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="compose-title" onClick=${e => e.stopPropagation()}>
      <div class="sheet-body">
        <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div>
            <h2 id="compose-title" class="display" style=${{ fontSize: '22px', letterSpacing: '-.5px', margin: 0 }}>${titles[c.mode]}</h2>
            <p class="meta" style=${{ margin: '6px 0 0' }}>
              ${c.mode === 'support' && 'The admins usually answer within a day. You’ll find the reply in Messages.'}
              ${c.mode === 'organizer' && (ev ? `About ${ev.title} · ${ev.dateShort}` : 'About this event')}
              ${c.mode === 'announce' && 'Sent to everyone with a ticket, in their Messages and notifications.'}
            </p>
          </div>
          <button class="close-x" style=${{ position: 'static', background: '#f7f6f9' }} aria-label="Close" onClick=${close}>✕</button>
        </div>
        ${c.mode === 'support' && html`<div style=${{ display: 'grid', gap: '8px' }}>
          ${TOPICS.map(([id, l, sub]) => html`<${Choice} on=${topic === id} label=${l} sub=${sub} onClick=${() => setTopic(id)} />`)}
        </div>`}
        ${c.mode === 'announce' && (myEvents.length
          ? html`<${Field} label="Event"><select class="input" value=${eventId} onChange=${e => setEventId(e.target.value)}>
              <option value="">Choose an upcoming event</option>
              ${myEvents.map(e => html`<option value=${e.id}>${e.title} · ${e.dateShort}</option>`)}
            </select><//>`
          : html`<div class="note warn">You have no upcoming events to announce yet.</div>`)}
        <${Field} label="Message" extra=${html`<span style=${{ fontWeight: 600, color: '#8a8496' }}>${text.length}/2000</span>`}>
          <textarea class="input" rows="5" maxlength="2000" value=${text} onInput=${e => setText(e.target.value)}
            placeholder=${c.mode === 'announce' ? 'Doors open at 8:30, bring your laptop… or promote a talk you just added.'
              : c.mode === 'organizer' ? 'Ask about the venue, the schedule, tickets…'
              : topic === 'organizer_access' ? 'Tell us about the events you want to organize.' : 'What happened? Include the event name if it’s about an event.'}></textarea>
        <//>
        ${error && html`<div class="err" role="alert">${error}</div>`}
        <div style=${{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button class="btn" onClick=${close}>Cancel</button>
          <button class="btn btn-primary" disabled=${busy || (c.mode === 'announce' && !myEvents.length)} onClick=${send}>
            ${busy ? 'Sending…' : c.mode === 'announce' ? 'Send announcement' : 'Send message'}</button>
        </div>
      </div>
    </div>
  </div>`;
}
