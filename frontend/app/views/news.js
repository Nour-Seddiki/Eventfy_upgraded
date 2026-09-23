import { html } from '../lib.js';
import { state, setState, allEvents, openEvent } from '../store.js';
import { NEWS, HIGHLIGHTS, TAG_COLORS } from '../news.js';
import { DateBox } from '../ui.js';
import { ctaFor } from './discover.js';

const stripes = (a, b) => `repeating-linear-gradient(135deg,${a} 0 10px,${b} 10px 20px)`;

function article(n) {
  const [tagBg, tagFg, tintA, tintB] = TAG_COLORS[n.tag];
  const dateLabel = new Date(n.d + 'T00:00').toLocaleString('en', { month: 'short', day: 'numeric', year: 'numeric' });
  return { ...n, tagBg, tagFg, tintA, tintB, dateLabel };
}
const openArticle = id => setState({ articleId: id });

export function News() {
  const tab = state.newsTab;
  const all = [...NEWS].sort((a, b) => b.d.localeCompare(a.d)).map(article);
  const lead = article(NEWS[0]);
  const list = tab === 'All' ? all.filter(n => n.id !== lead.id) : all.filter(n => n.tag === tab);
  const labels = { All: 'All', Recap: 'Recaps', Announcement: 'Announcements', Community: 'Community' };

  return html`
    <section class="dark"><div class="wrap page-head">
      <div><h1 class="page-title">News & highlights</h1>
        <p class="page-sub">Recaps, announcements and the best moments from recent IT events.</p></div>
      <div class="seg-dark" role="tablist">
        ${Object.keys(labels).map(k => html`<button role="tab" aria-selected=${tab === k} class=${tab === k ? 'on' : ''}
          style=${{ padding: '0 16px' }} onClick=${() => setState({ newsTab: k })}>${labels[k]}</button>`)}
      </div>
    </div></section>
    <main class="page-main"><section class="wrap section" style=${{ gap: '44px' }}>
      ${tab === 'All' && html`<button class="lead" onClick=${() => openArticle(lead.id)}>
        <div style=${{ minHeight: '300px', background: stripes('#ede9fe', '#f5f3ff') }}></div>
        <div class="lead-body">
          <span class="tag" style=${{ background: lead.tagBg, color: lead.tagFg }}>${lead.tag}</span>
          <h2>${lead.title}</h2>
          <p>${lead.excerpt}</p>
          <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginTop: '6px' }}>
            <span class="hint" style=${{ fontSize: '13px', fontWeight: 600 }}>${lead.dateLabel} · ${lead.read} read</span>
            <span style=${{ fontSize: '14px', fontWeight: 800, color: '#7c3aed' }}>Read the recap →</span>
          </div>
        </div>
      </button>`}

      ${(tab === 'All' || tab === 'Recap') && html`<div>
        <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '16px', gap: '12px' }}>
          <h2 class="section-h">Highlights</h2>
          <span class="hint" style=${{ fontSize: '13px', fontWeight: 600 }}>Talks and moments worth rewatching</span>
        </div>
        <div class="h-scroll">
          ${HIGHLIGHTS.map(h => html`<button class="highlight" onClick=${() => openArticle(h.art)}>
            <div class="highlight-still"><span class="play" aria-hidden="true">▶</span><span class="dur">${h.dur}</span></div>
            <div class="display" style=${{ fontWeight: 700, fontSize: '15px', lineHeight: 1.3, color: '#16131d' }}>${h.title}</div>
            <div class="hint" style=${{ marginTop: '-4px' }}>${h.event}</div>
          </button>`)}
        </div>
      </div>`}

      <div>
        <h2 class="section-h" style=${{ marginBottom: '16px' }}>${tab === 'All' ? 'Latest stories' : labels[tab]}</h2>
        <div class="grid" style=${{ gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,300px),1fr))' }}>
          ${list.map(n => html`<button class="card" key=${n.id} onClick=${() => openArticle(n.id)}>
            <div class="cover wide"><div class="stripes" style=${{ background: stripes(n.tintA, n.tintB) }}></div></div>
            <div class="card-body" style=${{ padding: '18px 20px 20px' }}>
              <span class="tag" style=${{ background: n.tagBg, color: n.tagFg, fontSize: '11px', padding: '3px 10px' }}>${n.tag}</span>
              <h3>${n.title}</h3>
              <p class="meta" style=${{ margin: 0, fontSize: '14px', lineHeight: 1.55 }}>${n.excerpt}</p>
              <div class="hint" style=${{ marginTop: 'auto', paddingTop: '8px' }}>${n.dateLabel} · ${n.read} read</div>
            </div>
          </button>`)}
        </div>
      </div>
    </section></main>`;
}

export function ArticleModal() {
  const id = state.articleId;
  if (!id) return null;
  const a = article(NEWS.find(n => n.id === id) || NEWS[0]);
  const close = () => setState({ articleId: null });
  const related = a.related && allEvents().find(e => e.title.toLowerCase().includes(a.related.toLowerCase()) && !e.closed);
  const mobile = state.w < 820;
  return html`<div class=${'scrim' + (mobile ? ' sheety' : '')} onClick=${close}>
    <div class="sheet wide" role="dialog" aria-modal="true" aria-labelledby="article-title" onClick=${e => e.stopPropagation()}>
      <div class="cover" style=${{ aspectRatio: '16/7' }}>
        <div class="stripes" style=${{ background: stripes(a.tintA, a.tintB) }}></div>
        <button class="close-x" aria-label="Close" onClick=${close}>✕</button>
      </div>
      <div style=${{ padding: '28px clamp(22px,4vw,40px) 36px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <span class="tag" style=${{ background: a.tagBg, color: a.tagFg }}>${a.tag}</span>
        <h2 id="article-title" class="display" style=${{ fontSize: 'clamp(24px,3vw,32px)', lineHeight: 1.12, letterSpacing: '-.8px', margin: 0 }}>${a.title}</h2>
        <div class="hint" style=${{ fontSize: '13px' }}>${a.dateLabel} · ${a.read} read · Eventfy editorial</div>
        ${a.body.map(p => html`<p style=${{ margin: 0, fontSize: '16px', lineHeight: 1.7, color: '#2e2938' }}>${p}</p>`)}
        ${related && html`<div style=${{ marginTop: '8px', padding: '16px 18px', borderRadius: '18px', background: '#f5f3ff', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <${DateBox} ev=${related} />
          <div style=${{ flex: 1, minWidth: '180px' }}>
            <div style=${{ fontSize: '12px', fontWeight: 800, color: '#7c3aed' }}>Coming up</div>
            <div class="display" style=${{ fontWeight: 700, fontSize: '16px', marginTop: '2px' }}>${related.title}</div>
          </div>
          <button class="btn btn-primary" onClick=${() => { close(); openEvent(related.id); }}>${ctaFor(related)}</button>
        </div>`}
      </div>
    </div>
  </div>`;
}
