import { html, render, useEffect } from './lib.js';
import { state, setState, useStore, boot } from './store.js';
import { Header, Footer, TabBar, Toast } from './views/chrome.js';
import { Discover } from './views/discover.js';
import { EventModal } from './views/event-modal.js';
import { Tickets, QrModal, ConfirmDialog } from './views/tickets.js';
import { Saved } from './views/saved.js';
import { News, ArticleModal } from './views/news.js';
import { Profile } from './views/profile.js';
import { Auth } from './views/auth.js';
import { Checkout, PaymentResult } from './views/checkout.js';
import { Palette } from './views/palette.js';

const PAGES = {
  discover: Discover, tickets: Tickets, saved: Saved, news: News, profile: Profile,
  checkout: Checkout, payment: PaymentResult,
};

function useShortcuts() {
  useEffect(() => {
    const onKey = e => {
      const tag = e.target.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setState({ palette: true, pq: '', notifOpen: false, menuOpen: false });
      }
      if (e.key === 'Escape') {
        setState({ palette: false, modal: null, notifOpen: false, qrTicketId: null, articleId: null, menuOpen: false, confirm: null });
      }
    };
    const onClick = e => {
      if ((state.menuOpen || state.notifOpen) && !e.target.closest('.head-actions')) setState({ menuOpen: false, notifOpen: false });
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('click', onClick); };
  }, []);
}

function App() {
  useStore();
  useShortcuts();
  const name = state.route.name;
  const overlay = !!(state.modal || state.palette || state.qrTicketId || state.articleId || state.confirm);
  useEffect(() => { document.body.style.overflow = overlay ? 'hidden' : ''; }, [overlay]);

  if (name === 'signin' || name === 'signup') {
    return html`<div class="app"><${Auth} /><${Toast} /></div>`;
  }
  const Page = PAGES[name] || Discover;
  const mobile = state.w < 820;
  return html`<div class="app">
    <${Header} />
    <${Page} />
    <${Footer} />
    ${mobile && name !== 'checkout' && html`<${TabBar} />`}
    <${EventModal} />
    <${QrModal} />
    <${ArticleModal} />
    <${Palette} />
    <${ConfirmDialog} />
    <${Toast} />
  </div>`;
}

boot();
render(html`<${App} />`, document.getElementById('app'));
