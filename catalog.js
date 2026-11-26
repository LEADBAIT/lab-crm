/* Price list catalog (spec: crm/אפיון-אפסיילים-חבילות-ומבצעים.md, stage 2).
   Full product editor: description, picture (public bucket product-images), cost, dates, where the customer sees it, checklist action.
   Package builder: package_items rows (which addons/services a package includes, and how many). Admin only. */
'use strict';
const PROD_BUCKET = 'product-images';
const SHOW_AT = [['show_q', 'שאלון'], ['show_quote', 'הצעת מחיר'], ['show_track', 'דף מעקב']];
const prodImg = p => p?.image_path ? sb.storage.from(PROD_BUCKET).getPublicUrl(p.image_path).data.publicUrl : '';
const pkgItems = id => (S.pkgItems || []).filter(x => x.package_id === id);
const prodById = id => S.products.find(p => p.id === id);
/** value of what the package includes, its cost to us, and the customer's saving */
function pkgMath(pkg, items = pkgItems(pkg.id)) {
  const value = items.reduce((s, x) => s + x.qty * Number(prodById(x.product_id)?.unit_price || 0), 0);
  const costs = items.map(x => { const c = prodById(x.product_id)?.cost; return c == null ? null : x.qty * Number(c); });
  const cost = costs.includes(null) ? null : costs.reduce((s, c) => s + c, 0) + Number(pkg.cost || 0);
  return { value, saving: Math.max(0, value - Number(pkg.unit_price || 0)), cost, zero: items.filter(x => !Number(prodById(x.product_id)?.unit_price)).map(x => prodById(x.product_id)?.name) };
}
/** profit per unit: price minus our cost (package: minus the cost of what it includes) */
function prodProfit(p) {
  if (p.category === 'package') { const m = pkgMath(p); return m.cost == null ? null : Number(p.unit_price) - m.cost; }
  return p.cost == null ? null : Number(p.unit_price) - Number(p.cost);
}
function prodBadges(p) {
  const b = SHOW_AT.filter(([k]) => p[k]).map(([, l]) => `<span class="chip blue">${l}</span>`);
  if (p.always_included) b.unshift(`<span class="chip green">מתנה בשאלון${Number(p.gift_value) > 0 ? ' · ' + money(p.gift_value) + ' מחוק' : ''}</span>`);
  if (p.recommended) b.push('<span class="chip green">מומלץ</span>');
  if (p.valid_from || p.valid_until) b.push(`<span class="chip orange">${p.valid_from ? fmtShort(p.valid_from) : '…'} – ${p.valid_until ? fmtShort(p.valid_until) : '…'}</span>`);
  return b.join(' ');
}
function pkgSummary(p) {
  const it = pkgItems(p.id);
  if (!it.length) return `<span class="muted small">${esc(p.includes || 'בלי מוצרים')}</span>`;
  const m = pkgMath(p);
  return `<span class="small">${it.map(x => `${x.qty > 1 ? x.qty + '× ' : ''}${esc(prodById(x.product_id)?.name || '?')}`).join(' + ')}</span>
    <span class="tiny muted" style="display:block">שווי ${money(m.value)}${m.saving ? ` · חוסך ${money(m.saving)}` : ''}${m.zero.length ? ` · <span style="color:var(--orange)">בלי מחיר: ${esc(m.zero.join(', '))}</span>` : ''}</span>`;
}

// ---------- promotions (Black Friday etc.) ----------
// An order gets every promotion running when its questionnaire is submitted, its quote is sent or its validity renewed (DB trigger
// orders_promo_apply), keeps it after the promotion ends, loses it while the quote is expired. They come off the final line one after the other.
const PROMO_KIND = { percent: 'אחוז הנחה', amount: 'סכום קבוע (₪)', gift: 'מוצר במתנה' };
const todayIL = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
function promoState(m) {
  const t = todayIL();
  if (!m.active) return ['כבוי', ''];
  if (m.starts_on > t) return ['מתוכנן', 'blue'];
  if (m.ends_on < t) return ['הסתיים', ''];
  return ['פעיל עכשיו', 'green'];
}
const promoValue = m => m.kind === 'percent' ? `${Number(m.value)}%` : m.kind === 'amount' ? money(m.value) : `מתנה: ${esc(prodById(m.gift_product_id)?.name || '?')}`;
async function promosHtml() {
  const { data: stats, error } = await sb.from('v_promotion_stats').select('*'); fail(error);
  const st = id => stats.find(s => s.promotion_id === id) || { orders: 0, paid_orders: 0, discount_paid: 0 };
  const rows = (S.promos || []).map(m => { const [lbl, cls] = promoState(m), s = st(m.id); return `<tr>
    <td><b>${esc(m.name)}</b>${m.banner_text ? `<span class="tiny muted" style="display:block;max-width:280px">באנר: ${esc(m.banner_text)}</span>` : ''}</td>
    <td>${promoValue(m)}</td><td class="small">${fmtShort(m.starts_on)} – ${fmtShort(m.ends_on)}</td><td><span class="chip ${cls}">${lbl}</span></td>
    <td class="num">${s.orders}${s.paid_orders ? ` <span class="tiny muted">(${s.paid_orders} שילמו)</span>` : ''}</td><td class="num">${money(s.discount_paid) || '₪0'}</td>
    <td>${isAdmin() ? `<button class="btn sm" data-editpromo="${m.id}">עריכה</button>` : ''}</td></tr>`; }).join('');
  return `<section class="card flush" style="margin-top:16px"><div class="card-head" style="padding:14px 16px 0"><h3>מבצעים</h3><span class="tiny muted">נכנס לבד לכל הזמנה שהשאלון שלה נשלח, ההצעה שלה נשלחה או שהתוקף שלה חודש בתאריכי המבצע. יורד מהשורה האחרונה, אחרי כל ההנחות. כמה מבצעים יחד יורדים אחד אחרי השני.</span></div>
    <div class="table-wrap"><table><thead><tr><th>שם</th><th>הנחה</th><th>תאריכים</th><th>מצב</th><th class="num">הזמנות</th><th class="num">הנחה שניתנה</th><th></th></tr></thead><tbody>
    ${rows || '<tr class="empty-row"><td colspan="7">עוד אין מבצעים</td></tr>'}</tbody></table></div>
    ${isAdmin() ? '<div style="padding:0 16px 14px"><button class="btn sm" id="addPromo">+ מבצע</button></div>' : ''}
    <p class="tiny muted" style="padding:0 16px 14px">"הנחה שניתנה" = בהזמנות ששולמו. כשתוקף ההצעה עובר, גם הנחת המבצע יורדת, וחידוש התוקף מחזיר אותה.</p></section>`;
}
/** add / edit a promotion. Resolves true when saved. */
function editPromo(id) {
  const m = (S.promos || []).find(x => x.id === id) || { name: '', kind: 'percent', value: 30, starts_on: todayIL(), ends_on: todayIL(), active: true, banner_text: '' };
  const gifts = S.products.filter(p => ['addon', 'repair'].includes(p.category) && (p.active || p.id === m.gift_product_id));
  const b = modal(`<h2>${id ? 'עריכת מבצע' : 'מבצע חדש'}</h2><form id="pf" class="grid" style="gap:14px">
    <label class="field">שם (הלקוח רואה אותו בהצעה ובחשבונית)<input name="name" required value="${esc(m.name)}" placeholder="בלק פריידי"></label>
    <div class="fields"><label class="field">סוג<select name="kind">${Object.entries(PROMO_KIND).map(([k, l]) => `<option value="${k}" ${m.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field" data-pk="value">ערך<input name="value" type="number" step="0.01" min="0" value="${Number(m.value) || ''}"><span class="hint" id="pfHint"></span></label>
      <label class="field" data-pk="gift">מוצר במתנה<select name="gift_product_id"><option value="">בחירה</option>${gifts.map(p => `<option value="${p.id}" ${m.gift_product_id === p.id ? 'selected' : ''}>${esc(p.name)} (${money(p.unit_price)})</option>`).join('')}</select></label></div>
    <div class="fields"><label class="field">מתאריך<input name="starts_on" type="date" required value="${m.starts_on}"></label><label class="field">עד תאריך (כולל)<input name="ends_on" type="date" required value="${m.ends_on}"></label></div>
    <label class="field">באנר בשאלון ובדף המעקב<input name="banner_text" maxlength="120" value="${esc(m.banner_text || '')}" placeholder="בלק פריידי: 30% הנחה על הכל עד יום ראשון"><span class="hint">ריק = בלי באנר.</span></label>
    <label class="toggle" style="gap:6px"><input type="checkbox" name="active" ${m.active ? 'checked' : ''}> פעיל</label>
    <p id="pfErr" class="small" style="color:var(--red)" hidden></p>
    <div class="actions"><button class="btn primary">שמירה</button><button type="button" class="btn" id="pfNo">ביטול</button></div></form>`);
  const sync = () => { const k = $('[name=kind]', b).value; $('[data-pk=value]', b).hidden = k === 'gift'; $('[data-pk=gift]', b).hidden = k !== 'gift';
    $('#pfHint', b).textContent = k === 'percent' ? 'אחוז מהסכום הסופי' : 'שקלים מהסכום הסופי'; };
  $('[name=kind]', b).onchange = sync; sync();
  return new Promise(res => {
    $('#pfNo', b).onclick = () => { closeModal(); res(false); };
    $('#modal').addEventListener('cancel', () => res(false), { once: true });
    $('#pf', b).onsubmit = async e => { e.preventDefault();
      const f = new FormData(e.target), err = t => { $('#pfErr', b).textContent = t; $('#pfErr', b).hidden = false; };
      const row = { name: String(f.get('name')).trim(), kind: f.get('kind'), value: f.get('kind') === 'gift' ? 0 : Number(f.get('value') || 0),
        gift_product_id: f.get('kind') === 'gift' ? Number(f.get('gift_product_id')) || null : null, starts_on: f.get('starts_on'), ends_on: f.get('ends_on'),
        banner_text: String(f.get('banner_text') || '').trim() || null, active: f.get('active') === 'on' };
      if (!row.name) return err('חסר שם');
      if (row.ends_on < row.starts_on) return err('תאריך הסיום לפני תאריך ההתחלה');
      if (row.kind === 'percent' && !(row.value > 0 && row.value <= 100)) return err('אחוז בין 1 ל-100');
      if (row.kind === 'amount' && !(row.value > 0)) return err('חסר סכום');
      if (row.kind === 'gift' && !row.gift_product_id) return err('לבחור מוצר במתנה');
      const { error } = id ? await sb.from('promotions').update(row).eq('id', id) : await sb.from('promotions').insert(row); fail(error);
      closeModal(); toast('המבצע נשמר'); res(true); };
  });
}
/** promotion lines of an order (from v_orders.promo_lines) for totals, quote text and print */
const promoRows = o => o.promo_lines || [];
const promoLabel = l => l.kind === 'gift' ? `${l.name}: ${prodById(l.gift_product_id)?.name || 'מתנה'} במתנה` : `${l.name}${l.kind === 'percent' ? ` ${Number(l.value)}%` : ''}`;

// ---------- in an order (deal page, quote text, print) ----------
/** how many of a product the order's package already includes; the customer pays only for the rest (same rule as v_orders) */
const includedQty = (o, pid) => (o?.package_id ? (pkgItems(o.package_id).find(x => x.product_id === pid)?.qty || 0) : 0)
  + (o?.promo_gifts || []).filter(g => Number(g) === pid).length; // gifts from promotions count like package contents (same as v_orders)
const chargedQty = (o, pid, qty) => Math.max(0, (qty || 0) - includedQty(o, pid));
const inclNote = (o, pid, qty) => { const n = Math.min(includedQty(o, pid), qty || 0); return n ? ` (${n === qty ? '' : n + ' '}כלול בחבילה)` : ''; };
const pkgContents = o => o?.package_id ? pkgItems(o.package_id).map(x => `${x.qty > 1 ? x.qty + '× ' : ''}${prodById(x.product_id)?.name || ''}`).filter(Boolean).join(', ') : '';
/** upsell work to do for an order: products with a checklist action, from its lines and from what its package includes */
function orderActions(o, lines = []) {
  const m = new Map(lines.filter(l => l.qty > 0).map(l => [l.product_id, l.qty]));
  if (o.package_id) pkgItems(o.package_id).forEach(x => m.set(x.product_id, Math.max(m.get(x.product_id) || 0, x.qty)));
  (o.promo_gifts || []).forEach(g => { const id = Number(g); m.set(id, Math.max(m.get(id) || 0, 1)); });
  return [...m].map(([pid, qty]) => ({ p: prodById(pid), qty })).filter(x => x.p?.action_text);
}
function actionsHtml(ctx) {
  const acts = orderActions(ctx.o, ctx.lines); if (!acts.length) return '';
  const done = ctx.o.actions_done || {}, left = acts.filter(a => !done[a.p.id]).length;
  return `<div class="subhead" style="margin-top:4px">תוספות לביצוע ${left ? `<span class="chip orange">${left} פתוחות</span>` : '<span class="chip green">הכל בוצע</span>'}</div>
    <ul class="checklist" id="actList">${acts.map(({ p, qty }) => { const at = done[p.id]; return `<li class="${at ? 'ok' : ''}"><span class="box">${at ? '✓' : ''}</span>
      <span class="t grow">${esc(p.action_text)}${qty > 1 ? ` <span class="chip">×${qty}</span>` : ''}${includedQty(ctx.o, p.id) ? ' <span class="chip blue">מהחבילה</span>' : ''}${at ? ` <span class="when">· ${esc(fmtDT(at))}</span>` : ''}</span>
      ${at ? `<button class="link-btn" data-actundo="${p.id}">ביטול סימון</button>` : `<button class="btn sm" data-actdone="${p.id}">בוצע ✓</button>`}</li>`; }).join('')}</ul>`;
}
async function setActionDone(o, pid, on) {
  const cur = { ...(o.actions_done || {}) }; if (on) cur[pid] = new Date().toISOString(); else delete cur[pid];
  const { error } = await sb.from('orders').update({ actions_done: cur }).eq('id', o.id); fail(error); o.actions_done = cur;
}

async function uploadProdImage(file, productId) {
  if (!file?.type.startsWith('image/')) { toast('צריך לבחור תמונה'); return null; }
  toast('מעלה תמונה…', { ms: 60000 });
  const f = await shrinkPhoto(file);
  const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${productId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from(PROD_BUCKET).upload(path, f, { contentType: f.type || 'image/jpeg' });
  fail(error); toast('התמונה עלתה'); return path;
}

/** the editor modal. Resolves true when something was saved. */
function editProduct(id) {
  const p = prodById(id); if (!p) return;
  const cat = p.category, isPkg = cat === 'package', isMedia = cat === 'media', isExtra = cat === 'addon' || cat === 'repair';
  let img = p.image_path || null;
  const cur = Object.fromEntries(pkgItems(id).map(x => [x.product_id, x.qty]));
  const choices = S.products.filter(x => ['addon', 'repair'].includes(x.category) && (x.active || cur[x.id]));
  const chk = (k, l) => `<label class="toggle" style="gap:6px"><input type="checkbox" name="${k}" ${p[k] ? 'checked' : ''}> ${l}</label>`;
  const b = modal(`<h2>${esc(p.name)}</h2><p class="small muted" style="margin:-4px 0 12px">${esc(CAT[cat])} · מה שכתוב כאן הלקוח רואה בשאלון, בהצעת המחיר ובדף המעקב.</p>
    <form id="pe" class="grid" style="gap:14px">
      <div class="fields">
        <label class="field">שם<input name="name" required value="${esc(p.name)}"></label>
        <label class="field">מחיר כולל מע"מ (₪)<input name="unit_price" type="number" step="0.01" min="0" required value="${p.unit_price}"></label>
        ${isExtra ? `<label class="field">מחיר לפי<select name="pricing"><option value="unit" ${p.pricing !== 'order' ? 'selected' : ''}>יחידה (הלקוח בוחר כמות)</option><option value="order" ${p.pricing === 'order' ? 'selected' : ''}>הזמנה (פעם אחת)</option></select></label>` : ''}
        ${isMedia ? '' : `<label class="field">${isPkg ? 'עלות נוספת לחבילה (₪)' : 'כמה זה עולה לך (₪)'}<input name="cost" type="number" step="0.01" min="0" value="${p.cost ?? ''}" placeholder="—"><span class="hint">${isPkg ? 'מעבר לעלות המוצרים שבתוכה (אריזה, כרטיס). לחישוב הרווח.' : 'לחישוב הרווח. לא מוצג ללקוח.'}</span></label>`}
      </div>
      <label class="field">תיאור קצר<textarea name="description" rows="2" maxlength="240" placeholder="שורה או שתיים שמסבירות ללקוח למה זה שווה">${esc(p.description || '')}</textarea></label>
      <div class="field"><span>תמונה</span><div id="peImg" style="display:flex;gap:12px;align-items:center"></div></div>
      ${isPkg ? `<section class="card" style="padding:12px 14px"><h3 style="margin-bottom:4px">מה החבילה כוללת</h3><p class="tiny muted" style="margin-bottom:8px">כמות 0 = לא כלול. לקוח שמוסיף מוצר שכבר כלול משלם רק על מה שמעבר.</p>
        <div class="table-wrap"><table><thead><tr><th>מוצר</th><th class="num">מחיר</th><th class="num">כמות בחבילה</th></tr></thead><tbody>
        ${choices.map(x => `<tr><td>${esc(x.name)}${x.active ? '' : ' <span class="chip">כבוי</span>'}</td><td class="num muted">${money(x.unit_price)}</td>
          <td class="num"><input type="number" min="0" max="20" data-pi="${x.id}" value="${cur[x.id] || 0}" style="width:70px;text-align:center" aria-label="כמות ${esc(x.name)} בחבילה"></td></tr>`).join('')}</tbody></table></div>
        <div id="peMath" class="small" style="margin-top:8px"></div>
        <label class="field" style="margin-top:8px">עוד מה כלול (טקסט חופשי)<input name="includes" value="${esc(p.includes || '')}" placeholder="למשל: קבצים בקישור דרייב ל-60 יום"></label></section>
        <section class="card" style="padding:12px 14px"><h3 style="margin-bottom:4px">מתי להמליץ עליה בשאלון</h3><p class="tiny muted" style="margin-bottom:8px">אם הלקוח עומד בכל מה שמילאת, החבילה מסומנת "מומלץ" אצלו. ריק = לא בודקים.</p>
        <div class="fields"><label class="field">מינימום פריטי מדיה<input name="rec_min_media" type="number" min="0" value="${p.rec_min_media ?? ''}"></label>
          <label class="field">מקסימום פריטי מדיה<input name="rec_max_media" type="number" min="0" value="${p.rec_max_media ?? ''}"></label>
          <label class="field">שיטת מסירה שבחר<select name="rec_delivery"><option value="">כל שיטה</option>${(S.opts.delivery_method || []).map(o => `<option ${o.value === p.rec_delivery ? 'selected' : ''}>${esc(o.value)}</option>`).join('')}</select></label></div></section>` : ''}
      ${isExtra ? `<label class="field">פעולה בצ'קליסט של העסקה<input name="action_text" value="${esc(p.action_text || '')}" placeholder="למשל: לצרוב את הקבצים לדיסק און קי"><span class="hint">מופיע כפריט לסימון בדף העסקה כשהמוצר בהזמנה. ריק = אין פעולה.</span></label>` : ''}
      ${isMedia ? '' : `<div class="field"><span>איפה הלקוח רואה ${isPkg ? 'אותה' : 'אותו'}</span><div style="display:flex;gap:16px;flex-wrap:wrap">${SHOW_AT.map(([k, l]) => chk(k, l)).join('')}${chk('recommended', 'תגית "מומלץ"')}</div></div>
      <div class="field">${chk('always_included', 'מתנה שהלקוח מפעיל בשאלון')}<span class="hint">בשאלון מופיע מתג "מתנה בשבילך" עם "חינם" ליד המחיר המחוק. נכנס להצעה ולהזמנה (ב-0 ₪) רק אם הלקוח הפעיל, והעלות יורדת מהרווח של אותה הזמנה בלבד.</span></div>
      <label class="field">מחיר מחוק שמוצג ליד "חינם" (₪)<input name="gift_value" type="number" step="1" min="0" value="${p.gift_value ?? ''}" placeholder="—"><span class="hint">רק למתנה. ריק = בלי מחיר מחוק.</span></label>`}
      <div class="fields"><label class="field">זמין מ-<input name="valid_from" type="date" value="${p.valid_from || ''}"></label><label class="field">עד<input name="valid_until" type="date" value="${p.valid_until || ''}"><span class="hint">ריק = תמיד. מחוץ לתאריכים הלקוח לא רואה ${isPkg ? 'אותה' : 'אותו'}.</span></label></div>
      <p id="peErr" class="small" style="color:var(--red)" hidden></p>
      <div class="actions"><button class="btn primary">שמירה</button><button type="button" class="btn" id="peNo">ביטול</button></div>
    </form>`, { wide: true });

  const drawImg = () => { const url = img ? sb.storage.from(PROD_BUCKET).getPublicUrl(img).data.publicUrl : '';
    $('#peImg', b).innerHTML = `${url ? `<img src="${esc(url)}" alt="" style="width:88px;height:88px;object-fit:cover;border-radius:8px;border:1px solid var(--line)">` : '<div class="muted small" style="width:88px;height:88px;border:1px dashed var(--line);border-radius:8px;display:grid;place-items:center">אין</div>'}
      <label class="btn sm">${url ? 'החלפה' : 'העלאה'}<input type="file" accept="image/*" hidden id="peFile"></label>${url ? '<button type="button" class="btn sm ghost danger" id="peDel">הסרה</button>' : ''}`;
    $('#peFile', b).onchange = async e => { const path = await uploadProdImage(e.target.files[0], id); if (path) { img = path; drawImg(); } };
    $('#peDel', b)?.addEventListener('click', () => { img = null; drawImg(); }); };
  drawImg();
  const readItems = () => $$('[data-pi]', b).map(el => ({ package_id: id, product_id: Number(el.dataset.pi), qty: Math.max(0, Math.round(Number(el.value) || 0)) })).filter(x => x.qty > 0);
  const drawMath = () => { if (!isPkg) return; const items = readItems(), price = Number($('[name=unit_price]', b).value || 0), m = pkgMath({ ...p, unit_price: price, cost: $('[name=cost]', b).value || null }, items);
    $('#peMath', b).innerHTML = items.length ? `שווי המוצרים <b>${money(m.value)}</b> · מחיר החבילה <b>${money(price)}</b> · ${m.saving ? `הלקוח חוסך <b style="color:var(--green)">${money(m.saving)}</b>` : `<span style="color:var(--orange)">אין חיסכון: החבילה לא זולה מהמוצרים בנפרד</span>`}${m.cost != null ? ` · רווח <b>${money(price - m.cost)}</b>` : ' · <span class="muted">רווח: חסרה עלות לחלק מהמוצרים</span>'}${m.zero.length ? `<br><span style="color:var(--orange)">במחיר 0 ₪: ${esc(m.zero.join(', '))}. החיסכון לא כולל אותם.</span>` : ''}` : '<span class="muted">עוד לא נבחרו מוצרים</span>'; };
  if (isPkg) { b.addEventListener('input', e => { if (e.target.matches('[data-pi], [name=unit_price], [name=cost]')) drawMath(); }); drawMath(); }

  return new Promise(res => {
    $('#peNo', b).onclick = () => { closeModal(); res(false); };
    $('#modal').addEventListener('cancel', () => res(false), { once: true });
    $('#pe', b).onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target), num = k => f.get(k) === '' || f.get(k) == null ? null : Number(f.get(k)), str = k => (f.get(k) ?? '').toString().trim() || null;
      const err = m => { $('#peErr', b).textContent = m; $('#peErr', b).hidden = false; };
      const row = { name: str('name'), unit_price: num('unit_price') ?? 0, description: str('description'), image_path: img, valid_from: str('valid_from'), valid_until: str('valid_until') };
      if (!row.name) return err('חסר שם');
      if (row.valid_from && row.valid_until && row.valid_from > row.valid_until) return err('תאריך "עד" לפני תאריך "מ-"');
      if (!isMedia) { row.cost = num('cost'); SHOW_AT.forEach(([k]) => row[k] = f.get(k) === 'on'); row.recommended = f.get('recommended') === 'on'; row.always_included = f.get('always_included') === 'on'; row.gift_value = num('gift_value'); }
      if (isExtra) { row.pricing = f.get('pricing') === 'order' ? 'order' : 'unit'; row.action_text = str('action_text'); }
      if (isPkg) { row.includes = str('includes'); row.rec_min_media = num('rec_min_media'); row.rec_max_media = num('rec_max_media'); row.rec_delivery = str('rec_delivery');
        if (row.rec_min_media != null && row.rec_max_media != null && row.rec_min_media > row.rec_max_media) return err('המינימום גדול מהמקסימום'); }
      const btn = $('button.primary', b); btn.disabled = true; btn.textContent = 'שומר…';
      try {
        const { error } = await sb.from('products').update(row).eq('id', id); fail(error);
        if (isPkg) { const items = readItems(), keep = new Set(items.map(x => x.product_id)); // upsert first, then drop removed rows: a failure never empties the package
          if (items.length) { const i = await sb.from('package_items').upsert(items, { onConflict: 'package_id,product_id' }); fail(i.error); }
          const gone = pkgItems(id).filter(x => !keep.has(x.product_id)).map(x => x.product_id);
          if (gone.length) { const d = await sb.from('package_items').delete().eq('package_id', id).in('product_id', gone); fail(d.error); } }
        if (p.image_path && p.image_path !== img) sb.storage.from(PROD_BUCKET).remove([p.image_path]);
        closeModal(); toast('נשמר'); res(true);
      } catch { btn.disabled = false; btn.textContent = 'שמירה'; }
    };
  });
}
