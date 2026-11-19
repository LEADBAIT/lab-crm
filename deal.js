/* Customer / deal page: one page per order. Top: who + progress. Center: "the next step" with only what it needs.
   Below: everything else in collapsible sections. Side: contact, notes, timeline. */
'use strict';
const H = k => (window.HINTS || {})[k] || '';
// every editable order/customer field, defined once (label, type, list, hint)
const FIELD = {
  full_name: { t: 'c', l: 'שם מלא' }, phone: { t: 'c', l: 'טלפון', type: 'tel' }, email: { t: 'c', l: 'מייל', type: 'email' },
  id_number: { t: 'c', l: 'ת.ז (לחשבונית)' }, alt_contact_name: { t: 'c', l: 'איש קשר נוסף לאיסוף' }, alt_contact_phone: { t: 'c', l: 'הטלפון שלו', type: 'tel' },
  city: { t: 'c', l: 'עיר' }, street: { t: 'c', l: 'רחוב' }, house_number: { t: 'c', l: 'מספר בית' }, floor: { t: 'c', l: 'קומה' }, apartment: { t: 'c', l: 'דירה' }, entry_code: { t: 'c', l: 'קוד כניסה לבניין' },
  source: { t: 'o', l: 'מאיפה הגיע', list: 'source' }, temperature: { t: 'o', l: 'כמה קרוב לסגירה', list: 'temperature' },
  loss_category: { t: 'o', l: 'סיבה', list: 'loss_category' }, loss_note: { t: 'o', l: 'מה הלקוח אמר', type: 'textarea' },
  lab_id: { t: 'o', l: 'מעבדה', sel: () => S.labs.map(l => [l.id, l.name, l.active]), num: true },
  courier: { t: 'o', l: 'חברת שליחויות', list: 'courier' }, pickup_date: { t: 'o', l: 'תאריך איסוף', type: 'date' }, pickup_tracking: { t: 'o', l: 'מספר משלוח (איסוף)' },
  files_link_from_lab: { t: 'o', l: 'קישור הקבצים מהמעבדה', type: 'url' },
  payment_status: { t: 'o', l: 'מצב התשלום', list: 'payment_status', empty: false }, payment_method: { t: 'o', l: 'איך שילם', list: 'payment_method' },
  paid_amount: { t: 'o', l: 'סכום ששולם (₪)', type: 'number' }, invoice_number: { t: 'o', l: 'מספר חשבונית (SUMIT)' },
  delivery_link: { t: 'o', l: 'קישור הורדה ללקוח', type: 'url' }, personal_cloud_link: { t: 'o', l: 'הענן האישי של הלקוח', type: 'url' },
  drive_folder_url: { t: 'o', l: 'תיקייה עם התמונות מהלקוח', type: 'url' },
  return_method: { t: 'o', l: 'איך החומרה חוזרת', list: 'return_method' }, return_tracking: { t: 'o', l: 'מספר משלוח (החזרה)' },
  gift_sent: { t: 'o', l: 'מתנה שנשלחה' }, manual_discount: { t: 'o', l: 'הנחה ידנית (₪)', type: 'number', zero: true },
  next_followup: { t: 'o', l: 'לחזור ללקוח ב-', type: 'date' },
};
const TOGGLE = { mailing_list: ['c', 'מקבל עדכונים ומבצעים'], priority: ['o', 'דחוף (קדימות בתור)'], cloud_affiliate: ['o', 'קנה מנוי ענן דרכנו'], story_posted: ['o', 'פרסם סטורי ותייג אותנו'] };

function fld(ctx, k, { wide = false, label } = {}) {
  const d = FIELD[k], row = d.t === 'c' ? ctx.c : ctx.o, val = row[k];
  const req = d.t === 'c' && REQUIRED_BEFORE_PAID.some(r => r[0] === k);
  const miss = req && showRequired(ctx.o) && !String(val || '').trim();
  const save = `data-save="${d.t === 'c' ? 'customers' : 'orders'}:${row.id}:${k}"${d.num || d.type === 'number' ? ' data-num' : ''}${d.zero ? ' data-zero' : ''}`;
  let input;
  if (d.list) input = `<select ${save}>${opts(d.list, val, { empty: d.empty !== false })}</select>`;
  else if (d.sel) input = `<select ${save}><option value=""></option>${d.sel().filter(x => x[2] !== false || x[0] === val).map(([v, t]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  else if (d.type === 'textarea') input = `<textarea ${save} rows="3">${esc(val || '')}</textarea>`;
  else input = `<input type="${d.type || 'text'}" ${save} value="${esc(val ?? '')}" ${d.type === 'url' ? 'dir="ltr" placeholder="https://"' : ''}>`;
  const hint = H(k);
  return `<label class="field ${miss ? 'missing' : ''} ${wide ? 'wide' : ''}" data-req="${req ? k : ''}"><span>${esc(label || d.l)}${req && showRequired(ctx.o) ? ' <span class="req">*</span>' : ''}</span>${input}${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</label>`;
}
const tog = (ctx, k) => { const [t, l] = TOGGLE[k], row = t === 'c' ? ctx.c : ctx.o; return `<label class="toggle"><input type="checkbox" data-save="${t === 'c' ? 'customers' : 'orders'}:${row.id}:${k}" ${row[k] ? 'checked' : ''}> ${esc(l)}</label>`; };
const ro = (label, v) => `<div class="field"><span>${esc(label)}</span><input disabled value="${esc(v || '')}"></div>`;

// ---------- page ----------
const SEC_OPEN = {};
VIEWS.order = async function vOrder(id) {
  id = Number(id);
  const [o, rl, ri, re] = await Promise.all([getOrder(id), sb.from('order_lines').select('*').eq('order_id', id), sb.from('items').select('*').eq('order_id', id).order('seq'),
    sb.from('order_events').select('*').eq('order_id', id).order('at', { ascending: false }).limit(150)]);
  [rl, ri, re].forEach(r => fail(r.error));
  const { data: c, error } = await sb.from('customers').select('*').eq('id', o.customer_id).single(); fail(error);
  const ctx = { o, c, lines: rl.data, items: ri.data, events: re.data };
  renderDeal(ctx);
};
const reloadDeal = ctx => VIEWS.order(ctx.o.id);

function renderDeal(ctx) {
  const { o, c } = ctx, lost = o.stage === LOST, ph = phaseOf(o.stage);
  const back = ph === 'sales' ? 'מכירה' : ph === 'ops' ? 'בעבודה' : ph === 'done' ? 'הסתיימו' : 'לא רלוונטי';
  view().innerHTML = `
  <a class="back" href="#deals/${ph}">→ חזרה ללקוחות: ${back}</a>
  <div class="deal-head">
    <div><h1>${esc(custName(c))}</h1><div class="meta" id="dealMeta">${dealMeta(o)}</div></div>
    <div class="row">
      <a class="btn" href="tel:${esc(c.phone)}" title="חיוג">📞 <bdi dir="ltr">${esc(fmtPhone(c.phone))}</bdi></a>
      <div class="dd"><button class="btn wa" id="waBtn">וואטסאפ ▾</button></div>
      ${ph !== 'sales' && !lost ? '<button class="btn" id="trackBtn" title="קישור שהלקוח פותח בלי סיסמה ורואה איפה ההזמנה">קישור מעקב ללקוח</button>' : ''}
      <div class="dd"><button class="btn icon-btn" id="moreBtn" aria-label="עוד פעולות">⋯</button></div>
    </div>
  </div>
  <div class="deal">
    <div class="stack">
      ${lost ? `<div class="lost-banner"><div><b>סומן כלא רלוונטי</b><div class="small muted">${esc(subStatus(o))}${o.loss_note ? ' · ' + esc(o.loss_note) : ''}</div></div><button class="btn" id="revive">להחזיר לטיפול</button></div>`
        : `<div class="card flush">${stepperHtml(ctx)}</div><div id="nextBox">${nextCardHtml(ctx)}</div>`}
      ${sectionsHtml(ctx)}
    </div>
    <aside class="side">${sideHtml(ctx)}</aside>
  </div>`;
  bindDeal(ctx);
}
function dealMeta(o) {
  return `<span>#${o.id}</span><span>·</span><span>${stagePill(o.stage)}</span>${o.total > 0 ? `<span>·</span><b>${money(o.total)}</b>` : ''}
    ${o.source ? `<span>·</span><span>${esc(o.source)}</span>` : ''}${o.lab_name ? `<span>·</span><span>מעבדה: ${esc(o.lab_name)}</span>` : ''}
    ${o.is_repeat ? '<span class="chip blue">לקוח חוזר</span>' : ''}${o.priority ? '<span class="chip orange">דחוף</span>' : ''}
    ${o.flag_late ? `<span class="chip ${o.flag_late}">${o.days_since_paid} ימים מהתשלום</span>` : ''}${o.flag_count_mismatch ? '<span class="chip red">פער בספירת פריטים</span>' : ''}
    ${o.flag_cash_at_courier ? '<span class="chip orange">מזומן אצל השליח</span>' : ''}`;
}

// ---------- stepper ----------
function stepDate(ctx, s) {
  const d = s.date?.(ctx.o); if (d) return d;
  return ctx.events.find(e => e.kind === 'stage' && e.new_value === s.key)?.at;
}
function stepperHtml(ctx) {
  const cur = stepIdx(ctx.o.stage);
  const btn = (s, i) => `<button class="step ${i < cur ? 'done' : ''} ${i === cur ? 'cur' : ''} ${i === 2 || i === 7 ? 'last-in-grp' : ''}" data-step="${i}" title="${i === cur ? 'השלב הנוכחי' : 'מעבר לשלב הזה'}">
    <span class="c">${i < cur ? '✓' : i + 1}</span><span class="l">${esc(s.key)}</span><span class="d">${i <= cur ? fmtShort(stepDate(ctx, s)) : ''}</span></button>`;
  return `<div class="stepper"><div class="grp" style="grid-column:1/4">מכירה</div><div class="grp" style="grid-column:5/10">עבודה</div>
    ${STEPS.slice(0, 3).map(btn).join('')}<div class="gap"></div>${STEPS.slice(3).map((s, j) => btn(s, j + 3)).join('')}</div>`;
}

// ---------- next step card ----------
function nextCardHtml(ctx) {
  const { o, c } = ctx, i = stepIdx(o.stage), s = STEPS[i];
  if (!s) return '';
  const checks = s.checks.filter(k => !k.show || k.show(o));
  const miss = s.need ? s.need(o) : [];
  const nxt = STEPS[i + 1];
  const tpls = [s.tpl, s.tpl2].map(tplByName).filter(Boolean);
  return `<section class="card next-card">
    <div class="eyebrow">שלב ${i + 1} מתוך 8 · ${esc(s.key)}</div>
    <h2>הצעד הבא: ${esc(s.title)}</h2>
    <p class="todo">${esc(s.todo)}</p>
    ${checks.length ? `<ul class="checklist">${checks.map((k, j) => checkHtml(ctx, k, j)).join('')}</ul>` : ''}
    ${s.fields ? `<div class="fields" style="margin-bottom:12px">${s.fields.map(k => fld(ctx, k)).join('')}</div>` : ''}
    ${s.pay ? `<div class="note" style="margin-bottom:12px">כשהלקוח משלם, לוחצים "${esc(s.btn)}". נפתח חלון קצר לרישום התשלום, וההזמנה עוברת לתיאום איסוף.</div>` : ''}
    ${miss.length && nxt ? `<div class="warn" style="margin-bottom:4px">כדי להמשיך חסר: ${esc(miss.join(', '))}</div>` : ''}
    <div class="next-actions">
      ${nxt && s.btn ? `<button class="btn primary lg" id="advance">${esc(s.btn)} ←</button>` : ''}
      ${i === 1 ? `<button class="btn wa" id="sendQuote">שליחת ההצעה בוואטסאפ</button>` : ''}
      ${tpls.map(t => `<button class="btn wa" data-tpl="${t.id}">וואטסאפ: ${esc(t.name)}</button>`).join('')}
      ${s.phase === 'sales' ? `<button class="btn ghost" id="toLost">הלקוח לא מעוניין</button>` : ''}
      ${i === 3 ? `<a class="btn ghost" href="#labels/${o.id}">מדבקות</a><a class="btn ghost" href="#manifest/${o.id}">דף משלוח</a>` : ''}
    </div>
  </section>`;
}
function checkHtml(ctx, k, j) {
  const ok = k.done(ctx.o, ctx.c), at = k.at?.(ctx.o);
  const ms = k.act?.startsWith('ms:') ? k.act.slice(3) : null;
  let act = '';
  if (!ok && k.act) act = k.act === 'contact' ? '<button class="btn sm" data-chk="' + j + '">✓ דיברתי עכשיו</button>'
    : k.act.startsWith('open:') ? `<button class="btn sm ghost" data-chk="${j}">להשלמה ↓</button>`
    : k.act === 'items' ? `<button class="btn sm" data-chk="${j}">יצירת ברקודים</button>`
    : k.act === 'cash' ? `<button class="btn sm" data-chk="${j}">הכסף הגיע</button>`
    : k.act === 'intake' ? `<button class="btn sm" data-chk="${j}">סיום קליטה</button>`
    : `<button class="btn sm" data-chk="${j}">סימון ✓</button>`;
  return `<li class="${ok ? 'ok' : ''}"><span class="box">${ok ? '✓' : ''}</span><span class="t grow">${esc(k.label)}${at ? ` <span class="when">· ${esc(k.at && FIELD_DATE(at))}</span>` : ''}</span>
    ${act}${ok && ms ? `<button class="link-btn" data-msedit="${ms}">שינוי תאריך</button>` : ''}</li>`;
}
const FIELD_DATE = d => /^\d{4}-\d{2}-\d{2}$/.test(d) ? fmtDate(d) : fmtDT(d);

// ---------- sections ----------
const SECTIONS = [
  ['customer', 'פרטי לקוח וכתובת', ctx => { const m = showRequired(ctx.o) ? missingForPaid(ctx.o, ctx.c).filter(x => x !== 'כמויות בהצעת המחיר') : []; return [ctx.c.city, m.length ? `<span class="chip red">חסרים ${m.length} פרטים</span>` : ''].filter(Boolean).join(' · '); }],
  ['quote', 'הצעת מחיר', ctx => ctx.o.media_qty ? `${ctx.o.media_qty} פריטים · ${money(ctx.o.total)}` : 'עוד אין כמויות'],
  ['items', 'פריטים וברקודים', ctx => ctx.items.length ? `${ctx.items.length} ברקודים · ${ctx.o.items_at_lab_or_later} הגיעו למעבדה · ${ctx.o.items_converted} הומרו` : 'עוד לא נוצרו'],
  ['payment', 'תשלום', ctx => [ctx.o.payment_status, ctx.o.paid_amount ? money(ctx.o.paid_amount) : '', ctx.o.invoice_number ? 'חשבונית ' + ctx.o.invoice_number : ''].filter(Boolean).join(' · ')],
  ['shipping', 'משלוח ומעבדה', ctx => [ctx.o.lab_name, ctx.o.pickup_date ? 'איסוף ' + fmtShort(ctx.o.pickup_date) : ''].filter(Boolean).join(' · ') || 'לא נקבע'],
  ['delivery', 'מסירה והחזרה', ctx => ctx.o.delivery_sent_at ? 'הקישור נשלח ' + fmtShort(ctx.o.delivery_sent_at) : ctx.o.delivery_link ? 'יש קישור, עוד לא נשלח' : ''],
  ['sale', 'מקור ומכירה', ctx => [ctx.o.source, ctx.o.temperature].filter(Boolean).join(' · ')],
  ['after', 'אחרי סיום', ctx => [ctx.o.review_requested_at && 'ביקורת ✓', ctx.o.story_requested_at && 'סטורי ✓', ctx.o.gift_sent && 'מתנה ✓'].filter(Boolean).join(' · ')],
];
function sectionsHtml(ctx) {
  const id = ctx.o.id, s = stepOf(ctx.o.stage);
  SEC_OPEN[id] ||= new Set(s?.open || ['customer', 'sale']);
  return SECTIONS.map(([k, title, sum]) => `<details class="sec" data-sec="${k}" ${SEC_OPEN[id].has(k) ? 'open' : ''}>
    <summary>${title} <span class="sum" data-sum="${k}">${sum(ctx)}</span></summary><div class="body" data-body="${k}">${SEC_BODY[k](ctx)}</div></details>`).join('');
}
const SEC_BODY = {
  customer: ctx => `<div class="fields">${['full_name', 'phone', 'email', 'id_number', 'alt_contact_name', 'alt_contact_phone'].map(k => fld(ctx, k)).join('')}</div>
    <div class="subhead">כתובת לאיסוף</div><div class="fields">${['city', 'street', 'house_number', 'floor', 'apartment', 'entry_code'].map(k => fld(ctx, k)).join('')}</div>
    <div style="margin-top:12px">${tog(ctx, 'mailing_list')}</div>`,
  quote: ctx => quoteHtml(ctx),
  items: ctx => itemsHtml(ctx),
  payment: ctx => `<div class="fields">${['payment_status', 'payment_method', 'paid_amount', 'invoice_number'].map(k => fld(ctx, k)).join('')}${ro('תאריך תשלום', fmtDT(ctx.o.paid_at))}</div>`,
  shipping: ctx => `<div class="fields">${['lab_id', 'courier', 'pickup_date', 'pickup_tracking'].map(k => fld(ctx, k)).join('')}${fld(ctx, 'files_link_from_lab', { wide: true })}</div>
    <div class="row" style="margin-top:12px"><a class="btn sm" href="#labels/${ctx.o.id}">הדפסת מדבקות ברקוד</a><a class="btn sm" href="#manifest/${ctx.o.id}">הדפסת דף משלוח</a></div>`,
  delivery: ctx => `<div class="fields">${fld(ctx, 'delivery_link', { wide: true })}${ro('הקישור יימחק ב-', fmtDate(ctx.o.delivery_link_expires))}${['return_method', 'return_tracking'].map(k => fld(ctx, k)).join('')}
    ${fld(ctx, 'personal_cloud_link')}${fld(ctx, 'drive_folder_url')}</div><div style="margin-top:12px">${tog(ctx, 'cloud_affiliate')}</div>`,
  sale: ctx => `<div class="fields">${fld(ctx, 'source')}${fld(ctx, 'temperature')}${ro('נכנס', fmtDT(ctx.o.created_at))}${ctx.o.est_quantity ? ro('כמות שהלקוח כתב בטופס', ctx.o.est_quantity) : ''}
    ${ctx.o.stage === LOST ? fld(ctx, 'loss_category') + fld(ctx, 'loss_note', { wide: true }) : ''}</div>
    <div style="margin-top:12px">${tog(ctx, 'priority')}</div>
    ${ctx.o.meta_lead_id ? `<div class="subhead">הגיע מטופס לידים במטא: ${esc(ctx.o.meta_form || '')}</div><div class="fields">
      ${ro('פלטפורמה', ctx.o.meta_platform === 'ig' ? 'אינסטגרם' : ctx.o.meta_platform === 'fb' ? 'פייסבוק' : ctx.o.meta_platform)}${ro('קמפיין', ctx.o.meta_campaign)}${ro('סט מודעות', ctx.o.meta_adset)}${ro('מודעה', ctx.o.meta_ad)}${ro('מילא את הטופס', fmtDT(ctx.o.meta_created_at))}</div>` : ''}`,
  after: ctx => `<ul class="checklist">${STEPS[7].checks.map((k, j) => checkHtml(ctx, k, 'a' + j)).join('')}</ul><div class="fields">${fld(ctx, 'gift_sent')}</div><div style="margin-top:12px">${tog(ctx, 'story_posted')}</div>`,
};

// ---------- quote builder ----------
function quoteHtml(ctx) {
  const { o, lines } = ctx;
  const qtyOf = pid => lines.find(l => l.product_id === pid)?.qty || 0;
  const row = p => { const q = qtyOf(p.id); return `<div class="qrow ${q ? 'has' : ''}"><div class="nm">${esc(p.name)}${p.notes ? `<span class="sub">${esc(p.notes)}</span>` : ''}</div>
    <div class="pr muted">${money(p.unit_price)}</div>
    <div class="stepperq"><button type="button" data-qd="${p.id}" data-d="1" aria-label="עוד אחד">+</button><input type="number" min="0" inputmode="numeric" data-line="${p.id}" value="${q || ''}" placeholder="0" aria-label="כמות ${esc(p.name)}"><button type="button" data-qd="${p.id}" data-d="-1" aria-label="אחד פחות">−</button></div>
    <div class="lt" data-lt="${p.id}">${q ? money(q * p.unit_price) : ''}</div></div>`; };
  const media = S.products.filter(p => p.category === 'media' && (p.active || qtyOf(p.id)));
  const extras = S.products.filter(p => (p.category === 'addon' || p.category === 'repair') && (p.active || qtyOf(p.id)));
  const pk = S.products.filter(p => p.category === 'package' && (p.active || p.id === o.package_id));
  return `<div class="quote-layout"><div>
    <div class="qrow qhead"><span>מה יש ללקוח</span><span class="pr">מחיר ליחידה</span><span>כמות</span><span class="lt">סה"כ</span></div>${media.map(row).join('')}
    <div class="subhead">תוספות ותיקונים</div>${extras.map(row).join('')}
    <div class="subhead">חבילה, הנחות ודחיפות</div><div class="fields">
      <label class="field"><span>חבילה</span><select data-save="orders:${o.id}:package_id" data-num><option value="">בלי חבילה</option>${pk.map(p => `<option value="${p.id}" ${o.package_id === p.id ? 'selected' : ''}>${esc(p.name)} (${money(p.unit_price)})</option>`).join('')}</select></label>
      <label class="field"><span>קופון</span><select data-save="orders:${o.id}:coupon_code"><option value="">בלי קופון</option>${S.coupons.filter(x => x.active || x.code === o.coupon_code).map(x => `<option ${x.code === o.coupon_code ? 'selected' : ''}>${esc(x.code)}</option>`).join('')}</select></label>
      ${fld(ctx, 'manual_discount')}</div>
    <div style="margin-top:12px">${tog(ctx, 'priority')}</div>
  </div>
  <div class="quote-total"><h3>סיכום ההצעה</h3><div id="totalsBox">${totalsHtml(o)}</div>
    <button class="btn primary block" id="sendQuote2">שליחה ללקוח בוואטסאפ</button>
    <div class="row"><button class="btn sm grow" id="copyQuote">העתקת הטקסט</button><a class="btn sm grow" href="#quote/${o.id}">PDF להדפסה</a></div>
    <p class="tiny muted">הנחת כמות, קופון ומינימום הזמנה מחושבים לבד. המחירים מגיעים מהמחירון בהגדרות.</p></div></div>`;
}

// ---------- items ----------
const ITEM_LOC = { 'ממתין לאיסוף': 'אצל הלקוח', 'נאסף': 'אצל השליח', 'במעבדה': 'במעבדה', 'הומר': 'במעבדה', 'לא ניתן להמרה': 'במעבדה', 'אצלנו': 'אצלנו', 'הוחזר ללקוח': 'חזר ללקוח', 'לא מוחזר': 'לא מוחזר' };
function itemsHtml(ctx) {
  const { o, items } = ctx;
  if (!items.length) return `<div class="empty"><div class="big">🏷️</div><h3>עוד אין ברקודים</h3><p>כל קלטת, דיסק או סליל מקבל ברקוד משלו לפי הכמויות בהצעת המחיר.<br>תמונות ושקופיות נספרות כקבוצה בלי ברקוד.</p>
    <button class="btn primary" style="margin-top:12px" data-gen ${o.media_qty ? '' : 'disabled'}>${o.media_qty ? `יצירת ${o.media_qty} ברקודים` : 'קודם ממלאים כמויות בהצעת המחיר'}</button></div>`;
  const statuses = (S.opts.item_status || []).filter(x => x.active).map(x => x.value);
  return `<div class="row spread" style="margin-bottom:12px"><div class="row small"><span class="chip">הוצהרו ${o.media_qty}</span><span class="chip">ברקודים ${items.length}</span><span class="chip blue">הגיעו למעבדה ${o.items_at_lab_or_later}</span><span class="chip green">הומרו ${o.items_converted}</span>${o.intake_done_at ? `<span class="chip">קליטה הסתיימה ${fmtShort(o.intake_done_at)}</span>` : ''}</div>
    <div class="row">${items.length < o.media_qty ? `<button class="btn sm" data-gen>יצירת ${o.media_qty - items.length} ברקודים חסרים</button>` : ''}<a class="btn sm" href="#labels/${o.id}">מדבקות</a><a class="btn sm" href="#manifest/${o.id}">דף משלוח</a></div></div>
    <div class="card flush table-wrap"><table><thead><tr><th>ברקוד</th><th>סוג</th><th>מה כתוב עליו</th><th>איפה הוא</th><th>פגום</th><th>הערה</th></tr></thead><tbody>
    ${items.map(it => `<tr><td><b class="num">${esc(it.id)}</b></td><td class="small">${esc(productName(it.product_id).split(' (')[0])}</td>
      <td><input data-isave="${esc(it.id)}:label_text" value="${esc(it.label_text || '')}" placeholder="למשל: חתונה 1994"></td>
      <td><select data-isave="${esc(it.id)}:status">${statuses.map(s => `<option ${s === it.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select><span class="sub">${esc(ITEM_LOC[it.status] || '')}${['במעבדה', 'הומר', 'לא ניתן להמרה'].includes(it.status) && o.lab_name ? ': ' + esc(o.lab_name) : ''}</span></td>
      <td><input type="checkbox" data-isave="${esc(it.id)}:damaged" ${it.damaged ? 'checked' : ''} aria-label="פגום"></td>
      <td><input data-isave="${esc(it.id)}:notes" value="${esc(it.notes || '')}"></td></tr>`).join('')}</tbody></table></div>
    <p class="tiny muted" style="margin-top:8px">המיקום מתעדכן לבד כשסורקים במסך "סריקה".</p>`;
}

// ---------- side panel ----------
const EV_IC = { stage: ['→', 'stage'], payment: ['₪', 'payment'], contact: ['☎', 'contact'], note: ['✎', 'note'] };
function evText(ev) {
  if (ev.kind === 'stage') return `עבר ל<b>${esc(ev.new_value)}</b>`;
  if (ev.kind === 'payment') return `תשלום: ${esc(ev.old_value ? ev.old_value + ' ← ' : '')}<b>${esc(ev.new_value)}</b>`;
  if (ev.kind === 'contact') return 'שיחה / הודעה עם הלקוח';
  return esc(ev.new_value || '');
}
function sideHtml(ctx) {
  const { o } = ctx, sales = phaseOf(o.stage) === 'sales';
  return `${sales ? `<section class="card"><div class="card-head"><h3>קשר עם הלקוח</h3><span class="small muted">${o.last_contact_at ? 'דיברנו ' + ago(o.last_contact_at) : 'עוד לא דיברנו'}</span></div>
      <button class="btn block" id="contacted">✓ דיברתי איתו עכשיו</button>
      ${o.followup_draft ? `<div class="divider"></div><div class="small muted">טיוטת הודעה</div><p class="small" style="white-space:pre-wrap">${esc(o.followup_draft)}</p><a class="btn sm wa" target="_blank" rel="noopener" href="${waLink(ctx.c.phone, o.followup_draft)}">שליחת הטיוטה</a>` : ''}
    </section>` : ''}
    <section class="card"><div class="card-head"><h3>הערות קבועות</h3></div>
      <label class="field"><textarea data-save="orders:${o.id}:notes" rows="4" placeholder="מה חשוב לזכור על הלקוח הזה (למשל: הקלטות של החתונה, רגיש)">${esc(o.notes || '')}</textarea></label></section>
    <section class="card"><div class="card-head"><h3>יומן</h3><span class="small muted">${ctx.events.length}</span></div>
      <form id="noteForm" class="row nowrap" style="margin-bottom:8px"><input name="t" placeholder="מה קרה? (שיחה, עדכון…)" required><button class="btn sm">הוספה</button></form>
      <ul class="timeline">${ctx.events.map(ev => { const [ic, cls] = EV_IC[ev.kind] || EV_IC.note; return `<li><span class="ic ${cls}">${ic}</span><div><div>${evText(ev)}</div><div class="w">${fmtDT(ev.at)}${ev.by_email ? ' · ' + esc(ev.by_email.split('@')[0]) : ''}</div></div></li>`; }).join('') || '<li class="muted small" style="display:block">עוד אין רישומים</li>'}</ul>
    </section>`;
}

// ---------- behavior ----------
async function lightRefresh(ctx, savedKey) {
  const o = await getOrder(ctx.o.id); ctx.o = o;
  $('#dealMeta') && ($('#dealMeta').innerHTML = dealMeta(o));
  $('#totalsBox') && ($('#totalsBox').innerHTML = totalsHtml(o));
  SECTIONS.forEach(([k, , sum]) => { const el = $(`[data-sum="${k}"]`); if (el) el.innerHTML = sum(ctx); });
  $$('[data-req]').forEach(l => { const k = l.dataset.req; if (k) l.classList.toggle('missing', showRequired(o) && !String(ctx.c[k] || '').trim()); });
  const box = $('#nextBox');
  if (box) { const f = document.activeElement?.dataset?.save; box.innerHTML = nextCardHtml(ctx); bindNext(ctx); bindAutosave(box, (t, k, v) => afterSave(ctx, t, k, v)); if (f) box.querySelector(`[data-save="${f}"]`)?.focus();
    const el = savedKey && box.querySelector(`[data-save="${savedKey}"]`);
    if (el) { const host = el.closest('.field, .toggle'); const st = document.createElement('span'); st.className = 'save-state ok'; st.textContent = '✓ נשמר'; host?.appendChild(st); setTimeout(() => st.remove(), 2500); } }
}
function afterSave(ctx, table, k, v) {
  if (table === 'customers') ctx.c[k] = v; else ctx.o[k] = v;
  // keep duplicate inputs (same field in next card and in a section) in sync
  const key = `${table}:${table === 'customers' ? ctx.c.id : ctx.o.id}:${k}`;
  $$(`[data-save="${key}"]`).forEach(el => { if (el !== document.activeElement) { if (el.type === 'checkbox') el.checked = !!v; else el.value = v ?? ''; } });
  lightRefresh(ctx, key);
}
async function runCheck(ctx, k) {
  const o = ctx.o;
  if (k.act === 'contact') { await markContacted(o.id); return reloadDeal(ctx); }
  if (k.act.startsWith('open:')) { const s = k.act.slice(5), d = $(`[data-sec="${s}"]`); d.open = true; SEC_OPEN[o.id].add(s); d.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (k.act === 'items') return genItems(ctx);
  if (k.act === 'cash') { const { error } = await sb.from('orders').update({ payment_status: 'שולם' }).eq('id', o.id); fail(error); toast('נרשם שהמזומן הגיע'); return reloadDeal(ctx); }
  if (k.act === 'intake') {
    const miss = o.media_qty - o.items_at_lab_or_later;
    if (miss > 0 && !await ask('חסרים פריטים', `נקלטו ${o.items_at_lab_or_later} מתוך ${o.media_qty}. לסיים קליטה ולסמן פער?`, { ok: 'לסיים עם פער' })) return;
    const { error } = await sb.rpc('finish_intake', { p_order: o.id }); fail(error); toast('הקליטה הסתיימה'); return reloadDeal(ctx);
  }
  if (k.act.startsWith('ms:')) { const f = k.act.slice(3); const { error } = await sb.from('orders').update({ [f]: new Date().toISOString() }).eq('id', o.id); fail(error); toast('נרשם', { undo: async () => { await sb.from('orders').update({ [f]: null }).eq('id', o.id); reloadDeal(ctx); } }); return reloadDeal(ctx); }
}
async function genItems(ctx) { const { data, error } = await sb.rpc('generate_items', { p_order: ctx.o.id }); fail(error); toast(data ? `נוצרו ${data} ברקודים` : 'אין ברקודים חדשים ליצירה'); SEC_OPEN[ctx.o.id].add('items'); reloadDeal(ctx); }
async function openTemplate(ctx, t) {
  const o = ctx.o;
  window.open(waLink(ctx.c.phone, t ? fillTemplate(t.body, o, ctx.c) : ''), '_blank', 'noopener');
  // smart follow-ups: sending some messages *is* the step's checkmark
  const stamp = { 'פתיחה ללידים': 'last_contact_at', 'פולואפ להצעה': 'last_contact_at', 'בקשת תשלום': 'last_contact_at', 'הקבצים מוכנים': 'delivery_sent_at', 'בקשת ביקורת': 'review_requested_at', 'בקשת סטורי': 'story_requested_at' }[t?.name];
  if (!stamp || (stamp !== 'last_contact_at' && o[stamp])) return;
  if (stamp === 'delivery_sent_at' && !o.delivery_link) return tell('אין עדיין קישור הורדה', 'ההודעה נפתחה, אבל כדי שהקישור ייכנס להודעה צריך קודם להדביק אותו בשדה "קישור הורדה ללקוח".');
  const { error } = await sb.from('orders').update({ [stamp]: new Date().toISOString() }).eq('id', o.id); fail(error);
  toast(stamp === 'last_contact_at' ? 'נרשם שדיברנו עם הלקוח' : 'נרשם בצ\'קליסט', { undo: stamp === 'last_contact_at' ? null : async () => { await sb.from('orders').update({ [stamp]: null }).eq('id', o.id); reloadDeal(ctx); } });
  reloadDeal(ctx);
}
function bindNext(ctx) {
  const s = stepOf(ctx.o.stage); if (!s) return;
  const checks = s.checks.filter(k => !k.show || k.show(ctx.o));
  $$('#nextBox [data-chk]').forEach(b => b.onclick = () => runCheck(ctx, checks[b.dataset.chk]));
  $('#advance') && ($('#advance').onclick = async () => { const nx = STEPS[stepIdx(ctx.o.stage) + 1]; if (nx && await changeStage(ctx.o, nx.key, ctx.c)) { delete SEC_OPEN[ctx.o.id]; reloadDeal(ctx); } });
  $('#toLost') && ($('#toLost').onclick = async () => { if (await changeStage(ctx.o, LOST, ctx.c)) reloadDeal(ctx); });
  $$('#nextBox [data-tpl]').forEach(b => b.onclick = () => openTemplate(ctx, S.templates.find(t => String(t.id) === b.dataset.tpl)));
  $('#sendQuote') && ($('#sendQuote').onclick = () => sendQuote(ctx));
  $$('#nextBox [data-msedit]').forEach(b => b.onclick = () => editDate(ctx, b.dataset.msedit));
}
function sendQuote(ctx) {
  if (!ctx.o.media_qty) return tell('ההצעה ריקה', 'קודם ממלאים כמויות בחלק "הצעת מחיר".');
  window.open(waLink(ctx.c.phone, quoteText(ctx.o, ctx.c, ctx.lines)), '_blank', 'noopener');
}
async function editDate(ctx, k) {
  const f = await formModal('תיקון תאריך', `<label class="field">תאריך ושעה<input type="datetime-local" name="v" value="${toLocalInput(ctx.o[k])}"><span class="hint">משאירים ריק כדי למחוק את הסימון.</span></label>`);
  if (!f) return; const { error } = await sb.from('orders').update({ [k]: f.v ? new Date(f.v).toISOString() : null }).eq('id', ctx.o.id); fail(error); reloadDeal(ctx);
}
function bindDeal(ctx) {
  const { o, c } = ctx;
  bindAutosave(view(), (t, k, v) => afterSave(ctx, t, k, v));
  bindNext(ctx);
  $$('details.sec').forEach(d => d.addEventListener('toggle', () => SEC_OPEN[o.id][d.open ? 'add' : 'delete'](d.dataset.sec)));
  $$('[data-step]').forEach(b => b.onclick = async () => { const s = STEPS[b.dataset.step]; if (s.key !== ctx.o.stage && await changeStage(ctx.o, s.key, c)) { delete SEC_OPEN[o.id]; reloadDeal(ctx); } });
  $('#revive') && ($('#revive').onclick = async () => { if (await changeStage(ctx.o, ctx.o.media_qty ? 'בשיחה' : 'פנייה חדשה', c)) reloadDeal(ctx); });
  $('#waBtn').onclick = e => { e.stopPropagation(); dropdown(e.currentTarget, [{ head: 'הודעה מוכנה (נפתחת בוואטסאפ עם הפרטים של הלקוח)' },
    ...S.templates.filter(t => t.active).map(t => ({ label: t.name, sub: fillTemplate(t.body, ctx.o, c).slice(0, 80), run: () => openTemplate(ctx, t) })),
    'sep', { label: 'הצעת המחיר', run: () => sendQuote(ctx) }, { label: 'הודעה ריקה', run: () => window.open(waLink(c.phone), '_blank', 'noopener') }]); };
  $('#trackBtn') && ($('#trackBtn').onclick = async () => { const u = trackUrl(ctx.o); await navigator.clipboard.writeText(u).catch(() => {}); toast('הקישור הועתק. מדביקים אותו בוואטסאפ ללקוח'); });
  $('#moreBtn').onclick = e => { e.stopPropagation(); dropdown(e.currentTarget, [
    { label: 'הדפסת הצעת מחיר (PDF)', run: () => go('quote/' + o.id) }, { label: 'הדפסת מדבקות ברקוד', run: () => go('labels/' + o.id) }, { label: 'הדפסת דף משלוח', run: () => go('manifest/' + o.id) },
    'sep', ctx.o.stage === LOST ? { label: 'להחזיר לטיפול', run: () => $('#revive').click() } : { label: 'סימון כלא רלוונטי', run: async () => { if (await changeStage(ctx.o, LOST, c)) reloadDeal(ctx); } },
    ...(isAdmin() ? [{ label: 'מחיקת ההזמנה', danger: true, run: () => deleteOrder(o) }] : [])]); };
  // quote steppers
  const saveLine = async (pid, qty) => {
    const r = qty > 0 ? await sb.from('order_lines').upsert({ order_id: o.id, product_id: pid, qty }, { onConflict: 'order_id,product_id' }) : await sb.from('order_lines').delete().eq('order_id', o.id).eq('product_id', pid);
    fail(r.error);
    const l = ctx.lines.find(x => x.product_id === pid); if (l) l.qty = qty; else if (qty) ctx.lines.push({ order_id: o.id, product_id: pid, qty });
    const p = S.products.find(x => x.id === pid), lt = $(`[data-lt="${pid}"]`); if (lt) lt.textContent = qty ? money(qty * p.unit_price) : '';
    $(`[data-line="${pid}"]`)?.closest('.qrow').classList.toggle('has', qty > 0);
    lightRefresh(ctx);
  };
  $$('[data-line]').forEach(el => el.addEventListener('change', () => saveLine(Number(el.dataset.line), Math.max(0, Number(el.value || 0)))));
  $$('[data-qd]').forEach(b => b.onclick = () => { const inp = $(`[data-line="${b.dataset.qd}"]`); const v = Math.max(0, Number(inp.value || 0) + Number(b.dataset.d)); inp.value = v || ''; saveLine(Number(b.dataset.qd), v); });
  $('#sendQuote2') && ($('#sendQuote2').onclick = () => sendQuote(ctx));
  $('#copyQuote') && ($('#copyQuote').onclick = async () => { const t = quoteText(ctx.o, c, ctx.lines); try { await navigator.clipboard.writeText(t); toast('הטקסט הועתק'); } catch { tell('טקסט ההצעה', t); } });
  // items
  $$('[data-gen]').forEach(b => b.onclick = () => genItems(ctx));
  $$('[data-isave]').forEach(el => el.addEventListener('change', async () => {
    const [iid, col] = el.dataset.isave.split(':'); const v = el.type === 'checkbox' ? el.checked : (el.value || null);
    const { error } = await sb.from('items').update({ [col]: v }).eq('id', iid); fail(error); toast('נשמר');
    if (col === 'status') lightRefresh(ctx);
  }));
  // after-section checks share the step-8 checklist
  $$('[data-body="after"] [data-chk]').forEach(b => b.onclick = () => runCheck(ctx, STEPS[7].checks[Number(b.dataset.chk.slice(1))]));
  $$('[data-body="after"] [data-msedit]').forEach(b => b.onclick = () => editDate(ctx, b.dataset.msedit));
  // side
  $('#contacted') && ($('#contacted').onclick = async () => { await markContacted(o.id); toast('נרשם שדיברנו'); reloadDeal(ctx); });
  $$('[data-fu]').forEach(b => b.onclick = async () => { const d = addDays(Number(b.dataset.fu)); const { error } = await sb.from('orders').update({ next_followup: d }).eq('id', o.id); fail(error); $$(`[data-save="orders:${o.id}:next_followup"]`).forEach(i => i.value = d); toast('נחזור ללקוח ב-' + fmtDate(d)); });
  $('#noteForm').onsubmit = async e => { e.preventDefault(); const t = new FormData(e.target).get('t'); const { error } = await sb.rpc('add_note', { p_order: o.id, p_text: t }); fail(error); reloadDeal(ctx); };
}
async function deleteOrder(o) {
  const f = await formModal('מחיקת הזמנה ' + o.id, `<p>הפעולה לא ניתנת לביטול: נמחקים ההזמנה, הצעת המחיר והברקודים. הלקוח עצמו נשאר.</p><label class="field">כדי לאשר, מקלידים את מספר ההזמנה<input name="n" required inputmode="numeric"></label>`, { ok: 'מחיקה סופית' });
  if (!f) return; if (f.n.trim() !== String(o.id)) return tell('לא נמחק', 'המספר לא תאם.');
  const { error } = await sb.from('orders').delete().eq('id', o.id); fail(error); toast('ההזמנה נמחקה'); go('deals');
}
