/* Customer links (user decisions 2026-11-25): the questionnaire, the quote, the tracking page and the review link live in ONE place.
   - Deal page: card "קישורים ללקוח" first in the side column; the link the current step needs is highlighted, and the next-step card
     has a button for it.
   - Sales list: 3 status icons per row (questionnaire · quote · payment) and the same sends in the row's ⋯ menu.
   Sending = WhatsApp with the link only (the user writes the message), SMS, or copy. A copy asks "sent to the customer?" and only a yes
   marks it, because "sent" starts the quote clock and the promotion (DB trigger promo_apply on quote_sent_at). */
'use strict';

const SALES_EARLY = ['פנייה חדשה', 'בשיחה', 'בפולואפ'];
/** tone → chip colour: '' grey (not sent), blue (sent), orange (opened / waiting), green (done), red (expired / problem) */
const lkSt = (label, tone = '', sub = '') => ({ label, tone, sub });
const daysLeft = d => Math.ceil((new Date(d) - Date.now()) / 864e5);
const reviewUrl = () => (S.settings.review_url?.text_value || '').trim();

const LINKS = {
  q: {
    name: 'שאלון', icon: '📝',
    url: o => qUrl(o),
    show: o => phaseOf(o.stage) === 'sales' || !!o.q_opened_at,
    relevant: o => SALES_EARLY.includes(o.stage) && !o.q_submitted_at,
    locked: o => (!!o.quote_sent_at && !!o.q_submitted_at) || !!o.quote_accepted_at || o.payment_status === 'שולם' || phaseOf(o.stage) !== 'sales',
    state: o => o.q_submitted_at ? lkSt('מולא', 'green', fmtShort(o.q_submitted_at))
      : o.q_opened_at ? lkSt(`נפתח · ${o.q_progress || 0}%`, 'orange', o.q_saved_at ? 'עדכון אחרון ' + ago(o.q_saved_at) : '')
      : o.q_sent_at ? lkSt('נשלח · עוד לא נפתח', 'blue', fmtShort(o.q_sent_at)) : lkSt('לא נשלח'),
    mark: async o => { if (phaseOf(o.stage) === 'sales') await markQSent(o, 'השאלון נשלח ללקוח. פולו-אפ בעוד יומיים'); },
  },
  quote: {
    name: 'הצעת מחיר', icon: '💬',
    url: o => pUrl(o),
    show: o => phaseOf(o.stage) === 'sales' || !!o.quote_first_view_at || !!o.quote_accepted_at,
    relevant: o => o.stage === 'הצעה נשלחה' || (o.stage === 'בפולואפ' && !!o.q_submitted_at),
    locked: o => o.payment_status === 'שולם' || phaseOf(o.stage) !== 'sales',
    state: o => o.payment_status === 'שולם' ? lkSt('שולמה', 'green', o.quote_accepted_name ? 'אושרה בשם ' + o.quote_accepted_name : '')
      : o.quote_accepted_at ? lkSt('אושרה · עוד לא שולמה', 'orange', ago(o.quote_accepted_at))
      : quoteAlmost(o) ? lkSt('הגיע לתשלום ולא שילם', 'orange', ago(o.quote_pay_clicked_at))
      : o.quote_expired_at ? lkSt('פג תוקף', 'red', 'ההנחות ירדו')
      : o.quote_views ? lkSt(`נפתחה ×${o.quote_views}`, 'orange', 'אחרונה ' + ago(o.quote_last_view_at))
      : o.quote_sent_at ? lkSt('נשלחה · עוד לא נפתחה', 'blue', fmtShort(o.quote_sent_at)) : lkSt('לא נשלחה'),
    /** "עוד 2 ימים" while the quote is valid (shown in the row icon and the card) */
    left: o => !o.quote_expired_at && o.quote_valid_until && o.quote_sent_at && o.payment_status !== 'שולם'
      ? (n => n <= 0 ? 'היום אחרון' : n === 1 ? 'עוד יום' : `עוד ${n} ימים`)(daysLeft(o.quote_valid_until)) : '',
    before: async o => {
      if (!o.media_qty) { await tell('ההצעה ריקה', 'קודם ממלאים כמויות בהצעת המחיר.'); return false; }
      if (!o.q_submitted_at && !await ask('הלקוח עוד לא מילא את השאלון', 'בדרך כלל שולחים הצעה רק אחרי השאלון. לשלוח בכל זאת?', { ok: 'לשלוח בכל זאת' })) return false;
      return true;
    },
    // early sales stages move to "הצעה נשלחה" (stamps quote_sent_at → 4-day validity + promotions); later just the stamp
    mark: async (o, c) => {
      if (SALES_EARLY.includes(o.stage) && await changeStage(o, 'הצעה נשלחה', c, { qOk: true })) return;
      if (!o.quote_sent_at && phaseOf(o.stage) === 'sales')
        await patchOrder(o, { quote_sent_at: new Date().toISOString() }, 'קישור ההצעה נשלח ללקוח. התוקף התחיל', { extra: [...Q_MARK_EXTRA, 'quote_valid_until'] });
    },
  },
  track: {
    name: 'דף מעקב', icon: '📦',
    url: o => trackUrl(o),
    show: o => phaseOf(o.stage) !== 'sales' && o.stage !== LOST,
    relevant: o => ['לתאם איסוף', 'למסירה ללקוח'].includes(o.stage),
    state: (o, ctx) => {
      const open = (ctx?.extraPays || []).find(p => p.status === 'open');
      if (o.delivery_sent_at) return lkSt('הקבצים נשלחו', 'green', fmtShort(o.delivery_sent_at));
      if (o.delivery_link) return lkSt('הקבצים מוכנים · לשלוח', 'orange', o.files_checked_at ? '' : 'קודם בדיקת קבצים');
      if (open) return lkSt(`תוספת ממתינה לתשלום ${money(open.amount)}`, 'orange');
      return lkSt('פעיל', 'blue', 'הלקוח רואה איפה ההזמנה');
    },
    // at delivery, sending the tracking page = sending the files (the download button is there)
    before: async o => o.stage !== 'למסירה ללקוח' || !o.delivery_link || o.delivery_sent_at || await filesOkToSend(o),
    mark: async o => { if (o.stage === 'למסירה ללקוח' && o.delivery_link && !o.delivery_sent_at) await patchOrder(o, { delivery_sent_at: new Date().toISOString() }, 'הקבצים נשלחו ללקוח (דף המעקב)'); },
  },
  review: {
    name: 'ביקורת בגוגל', icon: '⭐',
    url: () => reviewUrl(),
    show: o => o.stage === 'הושלם' || !!o.delivery_sent_at,
    relevant: o => o.stage === 'הושלם' && !o.review_requested_at,
    locked: () => !reviewUrl(),
    state: o => !reviewUrl() ? lkSt('חסר קישור בהגדרות', 'red', 'הגדרות ← תהליך') : o.review_requested_at ? lkSt('נשלח', 'green', fmtShort(o.review_requested_at)) : lkSt('לא נשלח'),
    mark: async o => { if (!o.review_requested_at) await patchOrder(o, { review_requested_at: new Date().toISOString() }, 'ביקשנו ביקורת בגוגל'); },
  },
};
const LINK_ORDER = ['q', 'quote', 'track', 'review'];
/** the link the current step needs (or null) */
const relevantLink = o => LINK_ORDER.find(k => LINKS[k].show(o) && LINKS[k].relevant(o) && !LINKS[k].locked?.(o)) || null;

/** Send a customer link. via: 'wa' | 'sms' | 'copy'. c = the customer row (phone), ctx = deal context (optional). Returns true if marked sent. */
async function linkSend(o, key, via, { c = null, ctx = null, after = route } = {}) {
  const L = LINKS[key], url = L.url(o), phone = c?.phone || o.phone;
  if (!url) { await tell('אין קישור', key === 'review' ? 'מוסיפים את קישור הביקורת בגוגל בהגדרות ← תהליך.' : 'לא נמצא קישור להזמנה הזו.'); return false; }
  if (L.before && !await L.before(o, c)) return false;
  if (via === 'wa') window.open(waLink(phone, url), '_blank', 'noopener');
  else if (via === 'sms') { if (!await smsModal(o, url, phone)) return false; }
  else if (via === 'copy') {
    let copied = true;
    try { await navigator.clipboard.writeText(url); } catch { copied = false; await tell(L.name, url); }
    // a copy is not a send: one click confirms it went out (starts the quote clock / promotion)
    toast(copied ? `הקישור ל${L.name} הועתק. שלחת ללקוח?` : `שלחת ללקוח את הקישור ל${L.name}?`, { label: '✓ שלחתי', ms: 10000,
      undo: async () => { await L.mark(o, c, ctx); await after(); } });
    return false;
  }
  await L.mark(o, c, ctx);
  await after();
  return true;
}

// ---------- deal page ----------
function linkRowHtml(ctx, key) {
  const { o } = ctx, L = LINKS[key], s = L.state(o, ctx), on = relevantLink(o) === key, locked = L.locked?.(o);
  const left = L.left?.(o) || '';
  const extra = key === 'quote' && !locked ? `<a class="link-btn" href="${esc(pUrl(o).replace('#', '?preview=1#'))}" target="_blank" rel="noopener">תצוגה מקדימה</a>
      ${o.quote_valid_until || o.quote_expired_at ? '<button class="link-btn" data-lrenew>חידוש תוקף</button>' : ''}`
    : key === 'track' ? `<a class="link-btn" href="${esc(trackUrl(o))}" target="_blank" rel="noopener">פתיחה</a>` : '';
  const added = key === 'quote' ? (o.quote_addons || []).map(a => productName(a.pid)).filter(Boolean) : [];
  return `<li class="lk ${on ? 'on' : ''} ${locked ? 'locked' : ''}" data-lk="${key}">
    <div class="lk-top"><span class="lk-ic" aria-hidden="true">${L.icon}</span><b>${esc(L.name)}</b><span class="chip ${s.tone}">${esc(s.label)}</span>${left ? `<span class="chip ${daysLeft(o.quote_valid_until) <= 1 ? 'orange' : ''}">${esc(left)}</span>` : ''}</div>
    ${s.sub || added.length ? `<div class="lk-sub">${esc(s.sub)}${added.length ? `${s.sub ? ' · ' : ''}הוסיף בהצעה: ${esc(added.join(', '))}` : ''}</div>` : ''}
    ${locked ? '' : `<div class="lk-acts"><button class="btn sm ${on ? 'wa' : 'wa-o'}" data-lsend="${key}:wa">וואטסאפ</button><button class="btn sm ghost" data-lsend="${key}:sms">SMS</button><button class="btn sm ghost" data-lsend="${key}:copy">העתקה</button>${extra}</div>`}
    ${locked && extra ? `<div class="lk-acts">${extra}</div>` : ''}
  </li>`;
}
function linksCardHtml(ctx) {
  const keys = LINK_ORDER.filter(k => LINKS[k].show(ctx.o));
  if (!keys.length) return '';
  return `<section class="card links-card" id="linksCard"><div class="card-head"><h3>קישורים ללקוח</h3></div>
    <ul class="links">${keys.map(k => linkRowHtml(ctx, k)).join('')}</ul></section>`;
}
/** the next-step card's shortcut: the one link this step needs */
function linkShortcutHtml(ctx) {
  const k = relevantLink(ctx.o); if (!k) return '';
  const label = { q: 'שליחת השאלון', quote: ctx.o.quote_sent_at ? 'שליחת ההצעה שוב' : 'שליחת ההצעה', track: ctx.o.delivery_link && !ctx.o.delivery_sent_at ? 'שליחת הקבצים (דף המעקב)' : 'שליחת דף המעקב', review: 'בקשת ביקורת' }[k];
  return `<button class="btn wa" data-lsend="${k}:wa">${esc(label)} בוואטסאפ</button>`;
}
async function quoteRenewDate(ctx) {
  const { data: def, error } = await sb.rpc('quote_deadline', { sent: new Date().toISOString() }); fail(error);
  const f = await formModal('חידוש תוקף ההצעה', `<label class="field">בתוקף עד<input type="datetime-local" name="v" required value="${toLocalInput(def)}"><span class="hint">ההנחות והמבצע חוזרים עד התאריך הזה.</span></label>`, { ok: 'חידוש' });
  if (!f) return;
  const v = new Date(f.v).toISOString();
  await patchOrder(ctx.o, { quote_valid_until: v }, `תוקף ההצעה חודש עד ${fmtDT(v)}. ההנחות חזרו`, { extra: ['quote_expired_at'] });
  reloadDeal(ctx);
}
/** binds every [data-lsend] / [data-lrenew] inside root (the side card and the next-step card) */
function bindLinks(root, ctx) {
  $$('[data-lsend]', root).forEach(b => b.onclick = () => { const [k, via] = b.dataset.lsend.split(':');
    linkSend(ctx.o, k, via, { c: ctx.c, ctx, after: () => { delete SEC_OPEN[ctx.o.id]; return reloadDeal(ctx); } }); });
  $$('[data-lrenew]', root).forEach(b => b.onclick = () => quoteRenewDate(ctx));
}

// ---------- sales list ----------
/** questionnaire · quote · payment as three small coloured icons */
function linkDots(o) {
  const q = LINKS.q.state(o), p = LINKS.quote.state(o), left = LINKS.quote.left(o);
  const pay = o.payment_status === 'שולם' ? lkSt('שולם', 'green') : o.quote_accepted_at || o.quote_pay_clicked_at ? lkSt('הגיע לתשלום', 'orange') : lkSt('לא שולם');
  const dot = (ic, name, s, extra = '') => `<span class="ldot ${s.tone || 'none'}" title="${esc(name + ': ' + s.label + (extra ? ' · ' + extra : ''))}" aria-label="${esc(name + ': ' + s.label)}">${ic}${extra ? `<i>${esc(extra)}</i>` : ''}</span>`;
  return `<span class="ldots">${dot('📝', 'שאלון', q)}${dot('💬', 'הצעה', p, left)}${dot('₪', 'תשלום', pay)}</span>`;
}
/** menu items for the sales row's ⋯: send the links that apply */
const linkMenuItems = (o, after = route) => LINK_ORDER.filter(k => LINKS[k].show(o) && !LINKS[k].locked?.(o))
  .map(k => ({ label: `שליחת ${LINKS[k].name} בוואטסאפ`, run: () => linkSend(o, k, 'wa', { after }) }));
