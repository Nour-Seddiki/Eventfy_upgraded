import { html, useState, useEffect, useRef } from '../lib.js';
import { api } from '../api.js';
import { state, navigate, signIn, signUp, googleSignIn, flash } from '../store.js';
import { Logo, Field, CheckBox } from '../ui.js';
import { emailOk, strength, strengthBars, strengthLabel } from '../util.js';

// ── Google Identity Services ──
let gsiReady;
function loadGsi() {
  if (!gsiReady) {
    gsiReady = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Google sign-in could not load'));
      document.head.appendChild(s);
    });
  }
  return gsiReady;
}

function GoogleButton({ text }) {
  const ref = useRef(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [{ client_id: clientId }] = await Promise.all([api('/auth/google/config', { auth: false }), loadGsi()]);
        if (!alive || !ref.current || !clientId) throw new Error('unavailable');
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async resp => {
            try { await googleSignIn(resp.credential); } catch (e) { flash(e.message); }
          },
        });
        window.google.accounts.id.renderButton(ref.current, {
          theme: 'outline', size: 'large', shape: 'pill', text, locale: 'en',
          width: Math.min(420, ref.current.offsetWidth || 420),
        });
      } catch { if (alive) setHidden(true); }
    })();
    return () => { alive = false; };
  }, []);
  if (hidden) return null;
  return html`<div>
    <div ref=${ref} class="google-slot"></div>
    <div class="divider-or" style=${{ marginTop: '18px' }}><span></span>or with email<span></span></div>
  </div>`;
}

function PasswordInput({ value, onInput, bad, autocomplete, placeholder, onEnter }) {
  const [show, setShow] = useState(false);
  return html`<div class="pw-wrap">
    <input class=${'input' + (bad ? ' bad' : '')} type=${show ? 'text' : 'password'} value=${value} placeholder=${placeholder}
      autocomplete=${autocomplete} onInput=${onInput} onKeyDown=${e => { if (e.key === 'Enter' && onEnter) onEnter(); }} />
    <button type="button" class="pw-toggle" onClick=${() => setShow(!show)} aria-label=${show ? 'Hide password' : 'Show password'}>${show ? 'Hide' : 'Show'}</button>
  </div>`;
}

function SignIn() {
  const [id, setId] = useState(''), [pw, setPw] = useState('');
  const [err, setErr] = useState({}), [busy, setBusy] = useState(false);
  const submit = async () => {
    const e = {};
    if (!id.trim()) e.id = 'Enter your email or username';
    if (!pw) e.pw = 'Enter your password';
    if (Object.keys(e).length) return setErr(e);
    setErr({}); setBusy(true);
    try { await signIn(id, pw); } catch (x) {
      setBusy(false);
      setErr({ pw: x.status === 401 ? 'That email and password don’t match' : x.message });
    }
  };
  return html`<div class="auth-form">
    <div><h1>Welcome back</h1><p class="meta" style=${{ margin: '8px 0 0', fontSize: '15px' }}>Sign in to see your tickets and saved events.</p></div>
    <${GoogleButton} text="signin_with" />
    <${Field} label="Email or username" error=${err.id}>
      <input class=${'input' + (err.id ? ' bad' : '')} value=${id} autocomplete="username" placeholder="you@example.com"
        onInput=${e => { setId(e.target.value); setErr({ ...err, id: null }); }} />
    <//>
    <${Field} label="Password" error=${err.pw}>
      <${PasswordInput} value=${pw} bad=${err.pw} autocomplete="current-password" placeholder="Your password" onEnter=${submit}
        onInput=${e => { setPw(e.target.value); setErr({ ...err, pw: null }); }} />
    <//>
    <button class="btn btn-primary btn-lg" disabled=${busy} onClick=${submit}>${busy ? 'Signing in…' : 'Sign in'}</button>
    <div style=${{ textAlign: 'center', fontSize: '14px', color: '#6b6578' }}>New to Eventfy? <button class="link-btn" style=${{ fontSize: '14px' }} onClick=${() => navigate('/signup')}>Create an account</button></div>
  </div>`;
}

function SignUp() {
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [pw, setPw] = useState('');
  const [terms, setTerms] = useState(false), [err, setErr] = useState({}), [busy, setBusy] = useState(false);
  const clear = k => setErr({ ...err, [k]: null });
  const submit = async () => {
    const e = {};
    if (name.trim().length < 2) e.name = 'Enter your full name';
    if (!emailOk(email)) e.email = 'Enter a valid email address';
    if (pw.length < 8 || strength(pw) < 2) e.pw = 'Use at least 8 characters, including a number or capital';
    if (!terms) e.terms = 'Please accept the terms to continue';
    if (Object.keys(e).length) return setErr(e);
    setErr({}); setBusy(true);
    try { await signUp(name, email, pw); } catch (x) {
      setBusy(false);
      if (/email/i.test(x.message)) setErr({ email: x.message }); else setErr({ pw: x.message });
    }
  };
  return html`<div class="auth-form">
    <div><h1>Create your account</h1><p class="meta" style=${{ margin: '8px 0 0', fontSize: '15px' }}>It takes less than a minute.</p></div>
    <${GoogleButton} text="signup_with" />
    <${Field} label="Full name" error=${err.name}>
      <input class=${'input' + (err.name ? ' bad' : '')} value=${name} autocomplete="name" placeholder="Yacine Salhi" onInput=${e => { setName(e.target.value); clear('name'); }} />
    <//>
    <${Field} label="Email" error=${err.email}>
      <input class=${'input' + (err.email ? ' bad' : '')} type="email" value=${email} autocomplete="email" placeholder="you@example.com" onInput=${e => { setEmail(e.target.value); clear('email'); }} />
    <//>
    <${Field} label="Password" error=${err.pw}>
      <${PasswordInput} value=${pw} bad=${err.pw} autocomplete="new-password" placeholder="At least 8 characters" onEnter=${submit}
        onInput=${e => { setPw(e.target.value); clear('pw'); }} />
      <div class="bars">${strengthBars(pw).map(c => html`<span style=${{ background: c }}></span>`)}</div>
      <span class="hint">${strengthLabel(pw)}</span>
    <//>
    <div style=${{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <${CheckBox} on=${terms} onClick=${() => { setTerms(!terms); clear('terms'); }}>I agree to Eventfy's <b style=${{ color: '#7c3aed' }}>Terms</b> and <b style=${{ color: '#7c3aed' }}>Privacy Policy</b><//>
      ${err.terms && html`<span class="err">${err.terms}</span>`}
    </div>
    <div class="note warn">Want to host events? Every account starts as an attendee. Request organizer access from your profile and an admin will review it.</div>
    <button class="btn btn-primary btn-lg" disabled=${busy} onClick=${submit}>${busy ? 'Creating account…' : 'Create account'}</button>
    <div style=${{ textAlign: 'center', fontSize: '14px', color: '#6b6578' }}>Already have an account? <button class="link-btn" style=${{ fontSize: '14px' }} onClick=${() => navigate('/signin')}>Sign in</button></div>
  </div>`;
}

export function Auth() {
  const mobile = state.w < 820;
  const isSignup = state.route.name === 'signup';
  const home = () => navigate('/discover');
  return html`<div class="auth">
    ${!mobile && html`<aside class="auth-aside">
      <div><${Logo} onClick=${home} /></div>
      <div style=${{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '480px' }}>
        <h2>Your next room full of developers is <span>one ticket away.</span></h2>
        <p>Conferences, workshops, hackathons and meetups across Algeria and online. Every QR ticket in one place.</p>
        <div class="demo-ticket" aria-hidden="true">
          <div style=${{ padding: '18px 20px', background: '#7c3aed', color: '#fff' }}>
            <div style=${{ fontSize: '12px', fontWeight: 700, opacity: .85 }}>Your ticket · QR at the door</div>
            <div class="display" style=${{ fontSize: '19px', marginTop: '4px' }}>Your next IT event</div>
          </div>
          <div style=${{ padding: '18px 20px', display: 'flex', gap: '16px', alignItems: 'center', borderTop: '2px dashed #ebe8f0' }}>
            <div style=${{ width: '84px', height: '84px', flexShrink: 0, borderRadius: '12px', background: 'repeating-linear-gradient(0deg,#ece9f1 0 6px,#fff 6px 12px)', border: '1px solid #ebe8f0' }}></div>
            <div style=${{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
              <span class="mono">TKT-7K2Q9M1A</span><b>Free pass × 1</b><span class="pill-green" style=${{ alignSelf: 'flex-start' }}>Valid</span>
            </div>
          </div>
        </div>
      </div>
      <div style=${{ fontSize: '13px', color: '#8a8496' }}>© ${new Date().getFullYear()} Eventfy</div>
    </aside>`}
    <main class="auth-main">
      <div style=${{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        ${mobile && html`<${Logo} light=${true} onClick=${home} />`}
        <button class="btn" style=${{ marginLeft: 'auto', height: '40px', padding: '0 14px', color: '#4a4455' }} onClick=${home}>← Back to events</button>
      </div>
      <div style=${{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 0' }}>
        ${isSignup ? html`<${SignUp} />` : html`<${SignIn} />`}
      </div>
    </main>
  </div>`;
}
