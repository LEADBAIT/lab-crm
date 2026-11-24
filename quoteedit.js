/* Full-screen quote editor (#quote-edit/<order id>, user decision 2026-11-25): the editor on one side, the customer's quote page
   (p.html?preview=1) live on the other, reloaded after every save. Opens with what the customer chose in the questionnaire.
   Promotions: the ones in the order, the one that will enter when the quote is sent, and manual add / remove per order. */
'use strict';

VIEWS['quote-edit'] = async function vQuoteEdit(id) {
  id = Number(id);
  const ctx = await loadDealCtx(id);
  const { data: promos, error } = await sb.from('order_promotions').select('id, promotion_id, applied_at, reason, removed_at, source').eq('order_id', id).order('applied_at'); fail(error);
  ctx.promos = promos || [];
  ctx.reload = () => VIEWS['quote-edit'](id);
  ctx.onSaved = previewSoon;
  renderQuoteEdit(ctx);
};

function renderQuoteEdit(ctx) {
  const { o, c } = ctx, paid = o.payment_status === 'שולם', sales = phaseOf(o.stage) === 'sales';
  const left = LINKS.quote.left(o), state = LINKS.quote.state(o);
  view().innerHTML = `
  <a class="back" href="#order/${o.id}">→ חזרה לדף הלקוח</a>
  <div class="qe-head"><div><h1>הצעת מחיר · ${esc(custName(c))}</h1><div class="meta">#${o.id} · ${stagePill(o.stage)} · <span class="chip ${state.tone}">${esc(state.label)}</span>${left ? ` <span class="chip">${esc(left)}</span>` : ''}</div></div></div>
  ${paid ? '<div class="note">ההזמנה שולמה: ההצעה נעולה. שינויים בכמויות אחרי תשלום עושים בדף הלקוח, והלקוח משלם על ההפרש מדף המעקב.</div>' : ''}
  <div class="qe">
    <div class="qe-edit stack">
      ${o.q_opened_at ? `<section class="card"><div class="card-head"><h3>מה הלקוח מילא בשאלון</h3></div>${questionnaireHtml(ctx)}</section>` : '<div class="note">הלקוח עוד לא מילא את השאלון. אפשר לבנות את ההצעה ידנית, או לשלוח קודם את השאלון.</div>'}
      <section class="card qe-lines ${paid ? 'locked' : ''}">${quoteLinesHtml(ctx)}</section>
      <section class="card">${promoBoxHtml(ctx)}</section>
      ${sales ? `<section class="card">${validityHtml(ctx)}</section>` : ''}
    </div>
    <div class="qe-side">
      <section class="card qe-total"><h3>סיכום</h3><div id="totalsBox">${totalsHtml(o)}</div>
        ${paid || !sales ? '' : `<div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn wa grow" data-lsend="quote:wa">שליחה בוואטסאפ</button><button class="btn ghost" data-lsend="quote:sms">SMS</button><button class="btn ghost" data-lsend="quote:copy">העתקה</button></div>`}
        <a class="btn sm ghost block" href="#quote/${o.id}">PDF להדפסה</a></section>
      <div class="qe-prev card flush"><div class="qe-prev-h"><span>כך הלקוח רואה את ההצעה</span><a class="link-btn" href="${esc(pUrl(o).replace('#', '?preview=1#'))}" target="_blank" rel="noopener">פתיחה בחלון</a></div>
        <iframe id="qePrev" title="תצוגה מקדימה של ההצעה" src="${esc(pUrl(o).replace('#', '?preview=1#'))}"></iframe></div>
    </div>
  </div>`;
  bindAutosave(view(), (t, k, v) => afterSave(ctx, t, k, v));
  bindQuote(ctx);
  bindLinks(view(), ctx);
  $$('[data-promo-del]').forEach(b => b.onclick = () => promoRemove(ctx, Number(b.dataset.promoDel)));
  $$('[data-promo-back]').forEach(b => b.onclick = () => promoBack(ctx, Number(b.dataset.promoBack)));
  $('#promoAdd') && ($('#promoAdd').onclick = () => promoAdd(ctx, Number($('#promoPick').value)));
  if (paid) $$('.qe-lines input, .qe-lines select, .qe-lines button').forEach(el => el.disabled = true);
}

/** the preview reloads a moment after the last save (several quick clicks = one reload) */
let _prevT = null;
function previewSoon() { clearTimeout(_prevT); _prevT = setTimeout(() => { try { $('#qePrev')?.contentWindow.location.reload(); } catch {} }, 700); }

// ---------- validity ----------
function validityHtml(ctx) {
  const o = ctx.o;
  const line = o.quote_expired_at ? `<span class="chip red">פג תוקף ${esc(fmtShort(o.quote_expired_at))}</span> ההנחות והמבצע ירדו. חידוש מחזיר אותם.`
    : o.quote_valid_until ? `בתוקף עד <b>${esc(fmtDT(o.quote_valid_until))}</b>` : 'התוקף מתחיל כשההצעה נשלחת (עד סוף היום השלישי).';
  return `<div class="card-head"><h3>תוקף ההצעה</h3>${o.quote_valid_until || o.quote_expired_at ? '<button class="btn sm" data-lrenew>חידוש תוקף</button>' : ''}</div><p class="small" style="margin:0">${line}</p>`;
}

// ---------- promotions (S5): automatic + manual per order ----------
const promoName = pid => S.promos.find(p => p.id === pid)?.name || 'מבצע';
const qePromoValue = p => !p ? '' : p.kind === 'percent' ? `${Number(p.value)}%` : p.kind === 'amount' ? money(p.value) : 'מתנה: ' + productName(p.gift_product_id);
const promoRunning = p => { const t = today(); return p.active && p.starts_on <= t && p.ends_on >= t; };
function promoBoxHtml(ctx) {
  const o = ctx.o, paid = o.payment_status === 'שולם';
  const inOrder = ctx.promos.filter(x => !x.removed_at), removed = ctx.promos.filter(x => x.removed_at);
  const amount = new Map((o.promo_lines || []).map(l => [Number(l.promotion_id), l]));
  const has = new Set(ctx.promos.map(x => x.promotion_id));
  const coming = sb && !paid ? S.promos.filter(p => promoRunning(p) && !has.has(p.id)) : [];
  const addable = S.promos.filter(p => !inOrder.some(x => x.promotion_id === p.id));
  const row = x => { const p = S.promos.find(y => y.id === x.promotion_id), l = amount.get(x.promotion_id);
    return `<li><span class="grow"><b>${esc(promoName(x.promotion_id))}</b> <span class="muted">${esc(qePromoValue(p))}</span>
      <span class="tiny muted" style="display:block">${x.source === 'staff' ? 'נוסף ידנית' : esc(x.reason || '')} · ${esc(fmtShort(x.applied_at))}${o.quote_expired_at ? ' · לא פעיל עד חידוש התוקף' : ''}</span></span>
      ${l ? `<span class="pos">${l.kind === 'gift' ? 'מתנה' : '−' + money(l.amount)}</span>` : ''}${paid ? '' : `<button class="link-btn danger" data-promo-del="${x.id}">הסרה</button>`}</li>`; };
  return `<div class="card-head"><h3>מבצעים</h3></div>
    ${inOrder.length ? `<ul class="promo-list">${inOrder.map(row).join('')}</ul>` : '<p class="small muted" style="margin:0">אין מבצע בהזמנה.</p>'}
    ${coming.length ? `<div class="note" style="margin-top:8px">בשליחה או בחידוש ייכנס: <b>${coming.map(p => esc(p.name) + ' ' + esc(qePromoValue(p))).join(', ')}</b></div>` : ''}
    ${removed.length ? `<div class="small muted" style="margin-top:8px">הוסרו מההזמנה: ${removed.map(x => `${esc(promoName(x.promotion_id))} ${paid ? '' : `<button class="link-btn" data-promo-back="${x.id}">החזרה</button>`}`).join(' · ')}</div>` : ''}
    ${paid || !addable.length ? '' : `<div class="row" style="margin-top:10px;gap:6px"><select id="promoPick" aria-label="מבצע להוספה">${addable.map(p => `<option value="${p.id}">${esc(p.name)} (${esc(qePromoValue(p))})${promoRunning(p) ? '' : ' · לא בתאריכים'}</option>`).join('')}</select><button class="btn sm" id="promoAdd">הוספת מבצע</button></div>`}`;
}
const promoEvent = (o, text) => sb.from('order_events').insert({ order_id: o.id, kind: 'field', new_value: text });
async function promoRemove(ctx, rowId) {
  const x = ctx.promos.find(y => y.id === rowId), name = promoName(x.promotion_id);
  const set = v => async () => { const { error } = await sb.from('order_promotions').update({ removed_at: v }).eq('id', rowId); fail(error); };
  await reversible(`המבצע "${name}" הוסר מההזמנה`, set(new Date().toISOString()), set(null), ctx.reload);
  await promoEvent(ctx.o, `המבצע "${name}" הוסר מההזמנה (ידנית)`); ctx.reload();
}
async function promoBack(ctx, rowId) {
  const x = ctx.promos.find(y => y.id === rowId);
  const { error } = await sb.from('order_promotions').update({ removed_at: null }).eq('id', rowId); fail(error);
  await promoEvent(ctx.o, `המבצע "${promoName(x.promotion_id)}" הוחזר להזמנה`); toast('המבצע חזר'); ctx.reload();
}
async function promoAdd(ctx, pid) {
  if (!pid) return;
  const old = ctx.promos.find(y => y.promotion_id === pid);
  const r = old ? await sb.from('order_promotions').update({ removed_at: null }).eq('id', old.id)
    : await sb.from('order_promotions').insert({ order_id: ctx.o.id, promotion_id: pid, reason: 'נוסף ידנית', source: 'staff' });
  fail(r.error);
  await promoEvent(ctx.o, `המבצע "${promoName(pid)}" נוסף להזמנה (ידנית)`); toast('המבצע נוסף'); ctx.reload();
}
