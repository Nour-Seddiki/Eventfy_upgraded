import { html, useState, useRef } from '../lib.js';
import {
  state, setState, myTickets, role, updateProfile, uploadAvatar, changePassword,
  requestOrganizer, deleteAccount, flash,
} from '../store.js';
import { Avatar, Field } from '../ui.js';
import { CONSOLE } from './chrome.js';
import { strength, strengthBars, strengthLabel } from '../util.js';

const FIELDS = [
  ['full_name', 'Full name', 'text'], ['phone', 'Phone', 'tel'], ['location', 'City', 'text'],
  ['website', 'Website', 'url'], ['university', 'University or school', 'text'], ['major', 'Field of study', 'text'],
];
const pick = p => Object.fromEntries([...FIELDS.map(([k]) => k), 'bio'].map(k => [k, (p && p[k]) || '']));

function InfoTab() {
  const p = state.profile;
  const [draft, setDraft] = useState(() => pick(p));
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const saved = pick(p);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const r = role();

  const save = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    try {
      const patch = {};
      Object.keys(draft).forEach(k => { if (draft[k] !== saved[k]) patch[k] = draft[k]; });
      await updateProfile(patch);
      flash('Profile updated');
    } catch (e) { flash(e.message); }
    setBusy(false);
  };
  const onPhoto = async e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return flash('Choose an image under 2 MB');
    try { await uploadAvatar(file); flash('Photo updated'); } catch (err) { flash(err.message); }
  };
  const request = async () => {
    try { await requestOrganizer(); flash('Request sent · an admin will review it'); } catch (e) { flash(e.message); }
  };

  return html`
    <div class="panel">
      <div><h2>Personal info</h2><p class="desc">This is how you appear to organizers and on attendee lists.</p></div>
      <div style=${{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <${Avatar} profile=${p} cls="big-avatar" />
        <input ref=${fileRef} type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" onChange=${onPhoto} aria-label="Upload photo" />
        <button class="btn" onClick=${() => fileRef.current.click()}>Upload photo</button>
        <span class="hint" style=${{ fontWeight: 500 }}>JPG or PNG, up to 2 MB</span>
      </div>
      <div class="two collapse">
        <${Field} label="Email"><input class="input" type="email" value=${p.email} disabled /><//>
        ${FIELDS.map(([k, l, t]) => html`<${Field} label=${l}>
          <input class="input" type=${t} value=${draft[k]} onInput=${e => setDraft({ ...draft, [k]: e.target.value })} /><//>`)}
      </div>
      <${Field} label="Bio" extra=${html`<span style=${{ fontWeight: 600, color: '#8a8496' }}>${draft.bio.length}/160</span>`}>
        <textarea class="input" rows="3" maxlength="160" value=${draft.bio} onInput=${e => setDraft({ ...draft, bio: e.target.value })}></textarea>
      <//>
      <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', borderTop: '1px solid #f1eff4', paddingTop: '16px' }}>
        <span style=${{ fontSize: '13px', fontWeight: 700, color: dirty ? '#ea580c' : '#16a34a' }}>${dirty ? 'You have unsaved changes' : 'All changes saved'}</span>
        <div style=${{ display: 'flex', gap: '8px' }}>
          <button class="btn" disabled=${!dirty} onClick=${() => setDraft(saved)}>Discard</button>
          <button class="btn btn-primary" disabled=${!dirty || busy} onClick=${save}>${busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </div>
    <div class="panel">
      <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div style=${{ flex: 1, minWidth: '220px' }}><h2>Host your own events</h2>
          <p class="desc">Organizer accounts can publish events, sell tickets and scan QR codes at the door. An admin reviews every request.</p></div>
        ${r === 'attendee' && !p.organizer_request_pending && html`<button class="btn btn-primary" onClick=${request}>Request organizer access</button>`}
        ${r === 'attendee' && p.organizer_request_pending && html`<span style=${{ padding: '9px 14px', borderRadius: '99px', background: '#ffedd5', color: '#c2410c', fontSize: '13px', fontWeight: 800 }}>Pending admin review</span>`}
        ${CONSOLE[r] && html`<a class="btn btn-dark" href=${CONSOLE[r].href}>Open ${r} console</a>`}
      </div>
    </div>`;
}

function SecurityTab() {
  const [cur, setCur] = useState(''), [next, setNext] = useState(''), [conf, setConf] = useState('');
  const [busy, setBusy] = useState(false);
  const update = async () => {
    if (!cur) return flash('Enter your current password');
    if (next.length < 8 || strength(next) < 2) return flash('Choose a stronger password');
    if (next !== conf) return flash('New passwords don’t match');
    setBusy(true);
    try {
      await changePassword(cur, next);
      setCur(''); setNext(''); setConf('');
      flash('Password updated');
    } catch (e) { flash(e.status === 401 ? 'Your current password is incorrect' : e.message); }
    setBusy(false);
  };
  return html`<div class="panel">
    <div><h2>Change password</h2><p class="desc">Use at least 8 characters with a number and a symbol.</p></div>
    <${Field} label="Current password"><input class="input" type="password" autocomplete="current-password" value=${cur} onInput=${e => setCur(e.target.value)} /><//>
    <div class="two collapse">
      <${Field} label="New password"><input class="input" type="password" autocomplete="new-password" value=${next} onInput=${e => setNext(e.target.value)} /><//>
      <${Field} label="Confirm new password"><input class="input" type="password" autocomplete="new-password" value=${conf} onInput=${e => setConf(e.target.value)} /><//>
    </div>
    <div style=${{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div class="bars">${strengthBars(next).map(c => html`<span style=${{ background: c }}></span>`)}</div>
      <span class="hint">${strengthLabel(next)}</span>
    </div>
    <div style=${{ display: 'flex', justifyContent: 'flex-end' }}>
      <button class="btn btn-primary" disabled=${busy} onClick=${update}>${busy ? 'Updating…' : 'Update password'}</button>
    </div>
  </div>`;
}

function AccountTab() {
  const [open, setOpen] = useState(false), [text, setText] = useState('');
  const doDelete = async () => {
    if (text !== 'DELETE') return;
    try { await deleteAccount(); } catch (e) { flash(e.message); }
  };
  return html`<div class="panel danger">
    <div><h2 style=${{ color: '#b91c1c' }}>Delete account</h2>
      <p class="desc">This removes your profile, tickets and reviews for good. Tickets for upcoming events will be cancelled.</p></div>
    ${!open && html`<div><button class="btn btn-danger" onClick=${() => setOpen(true)}>Delete my account</button></div>`}
    ${open && html`<div style=${{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', borderRadius: '16px', background: '#fef2f2' }}>
      <${Field} label="Type DELETE to confirm"><input class="input" style=${{ borderColor: '#fecaca' }} placeholder="DELETE" value=${text} onInput=${e => setText(e.target.value)} /><//>
      <div style=${{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button class="btn" onClick=${() => { setOpen(false); setText(''); }}>Cancel</button>
        <button class="btn" style=${{ border: 0, background: text === 'DELETE' ? '#dc2626' : '#fca5a5', color: '#fff' }}
          disabled=${text !== 'DELETE'} onClick=${doDelete}>Delete forever</button>
      </div>
    </div>`}
  </div>`;
}

export function Profile() {
  const p = state.profile;
  if (!p) {
    return html`<main class="page-main"><section class="wrap-narrow section"><div class="skeleton" style=${{ height: '320px' }}></div></section></main>`;
  }
  const { upcoming, past } = myTickets();
  const tab = state.pfTab;
  const since = p.created_at ? new Date(p.created_at).toLocaleString('en', { month: 'long', year: 'numeric' }) : null;
  const tabs = [['info', 'Personal info'], ['security', 'Password'], ['account', 'Account']];
  return html`
    <section class="dark"><div class="wrap-narrow profile-head">
      <${Avatar} profile=${p} cls="big-avatar" />
      <div style=${{ flex: 1, minWidth: '200px' }}>
        <h1 class="display" style=${{ fontSize: 'clamp(28px,4vw,40px)', letterSpacing: '-1.2px', margin: 0, lineHeight: 1.05 }}>${p.full_name || p.username}</h1>
        <div style=${{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '10px', alignItems: 'center' }}>
          <span class="role-chip" style=${{ padding: '3px 10px', fontSize: '11px' }}>${role()}</span>
          <span style=${{ fontSize: '14px', color: '#a59cb4' }}>${[p.location, since && `Member since ${since}`].filter(Boolean).join(' · ')}</span>
        </div>
      </div>
      <div style=${{ display: 'flex', gap: '10px' }}>
        <div class="stat"><b>${upcoming.length}</b><small>Upcoming</small></div>
        <div class="stat"><b>${past.filter(t => t.status === 'used').length}</b><small>Attended</small></div>
      </div>
    </div></section>
    <main class="page-main"><section class="wrap-narrow profile-grid">
      <nav class="side-nav" role="tablist" aria-label="Profile sections">
        ${tabs.map(([k, l]) => html`<button role="tab" aria-selected=${tab === k} class=${tab === k ? 'on' : ''} onClick=${() => setState({ pfTab: k })}>${l}</button>`)}
      </nav>
      <div style=${{ display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>
        ${tab === 'info' && html`<${InfoTab} key=${p.id} />`}
        ${tab === 'security' && html`<${SecurityTab} />`}
        ${tab === 'account' && html`<${AccountTab} />`}
      </div>
    </section></main>`;
}
