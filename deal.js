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
  business_name: { t: 'c', l: 'שם העסק (לחשבונית)' }, business_id: { t: 'c', l: 'ח.פ / ע.מ' },
  credit_method: { t: 'o', l: 'איך מזכים', list: 'credit_method' }, credit_amount: { t: 'o', l: 'סכום הזיכוי (₪)', type: 'number' }, credit_note: { t: 'o', l: 'מה ניתן / אסמכתא' },
};
const TOGGLE = { mailing_list: ['c', 'מקבל עדכונים ומבצעים'], invoice_business: ['c', 'חשבונית על שם עסק'], priority: ['o', 'אקספרס: עד 7 ימי עסקים מהקליטה'], cloud_affiliate: ['o', 'קנה מנוי ענן דרכנו'], story_posted: ['o', 'פרסם סטורי ותייג אותנו'] };

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
const ro = (label, v) => `<div class="field ro"><span>${esc(label)}</span><div class="ro-v">${esc(v || '')}</div></div>`;

// ---------- page ----------
const SEC_OPEN = {};
VIEWS.order = async function vOrder(id) {
  id = Number(id);
  const [o, rl, ri, re] = await Promise.all([getOrder(id), sb.from('order_lines').select('*').eq('order_id', id), sb.from('items').select('*').eq('order_id', id).order('seq'),
    sb.from('order_events').select('*').eq('order_id', id).is('deleted_at', null).order('at', { ascending: false }).limit(150)]);
  [rl, ri, re].forEach(r => fail(r.error));
  const { data: c, error } = await sb.from('customers').select('*').eq('id', o.customer_id).single(); fail(error);
  const ctx = { o, c, lines: rl.data, items: ri.data, events: re.data, photos: await loadPhotos(id) };
  // photos live in order_photos, not in v_orders: give the step checks what they need
  o.photos_count = ctx.photos.length; o.photos_first_at = ctx.photos[0]?.created_at || null;
  // #order/<id>/<section> opens that section (the sales dashboard uses it, e.g. for missing invoice details)
  const sec = location.hash.split('/')[2];
  if (sec && SECTIONS.some(s => s[0] === sec)) { SEC_OPEN[id] ||= new Set(); SEC_OPEN[id].add(sec); }
  renderDeal(ctx);
  if (sec) setTimeout(() => $(`[data-sec="${sec}"]`)?.scrollIntoView({ block: 'start' }), 50);
};
const reloadDeal = ctx => VIEWS.order(ctx.o.id);

function renderDeal(ctx) {
  const { o, c } = ctx, lost = o.stage === LOST, ph = phaseOf(o.stage);
  const back = ph === 'sales' ? 'מכירה' : ph === 'ops' ? 'בעבודה' : ph === 'done' ? 'הסתיימו' : 'לא רלוונטי';
  const sales = ph === 'sales' && !lost;
  view().innerHTML = `
  <a class="back" href="#deals/${ph}">→ לקוחות: ${back}</a>
  <div class="deal-top">
    <div class="deal-head">
      <div class="grow"><h1>${esc(custName(c))}${lost ? '' : phTag(o.stage)}</h1><div class="meta" id="dealMeta">${dealMeta(o)}</div></div>
      <div class="row dh-acts">
        <span class="btn call-btn"><a href="tel:${esc(c.phone)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg><bdi dir="ltr">${esc(fmtPhone(c.phone))}</bdi></a><button type="button" class="cp" id="copyPhone" aria-label="העתקת המספר" data-tip="העתקת המספר"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></span>
        <button class="btn wa" id="waBtn" data-tip="פתיחת שיחה בוואטסאפ">וואטסאפ</button>
        ${ph !== 'sales' && !lost ? '<button class="btn" id="trackBtn">קישור מעקב</button>' : ''}
        <div class="dd"><button class="btn icon-btn" id="moreBtn" aria-label="עוד פעולות">⋯</button></div>
        ${sales ? `<button class="btn" id="payLinkBtn" data-tip="יצירת קישור תשלום ב-SUMIT ושליחה בוואטסאפ">${o.pay_link_sent_at ? 'קישור תשלום ✓' : 'קישור תשלום'}</button>` : ''}
        ${sales ? '<span class="sep-v"></span><button class="btn won" id="wonBtn">שילם</button><button class="btn lost" id="lostBtn">לא רלוונטי</button>' : ''}
      </div>
    </div>
    ${lost ? `<div class="lost-banner"><div><b>סומן כלא רלוונטי</b><div class="small muted">${esc(subStatus(o))}${o.loss_note ? ' · ' + esc(o.loss_note) : ''}</div></div><button class="btn" id="revive">להחזיר לטיפול</button></div>` : stepperHtml(ctx)}
  </div>
  <div class="deal">
    <aside class="side">${sideHtml(ctx)}</aside>
    <div class="stack">
      ${lost ? '' : `<div id="nextBox">${nextCardHtml(ctx)}</div>`}
      ${historyHtml(ctx)}
      <div class="section-title">פרטים</div>
      ${sectionsHtml(ctx)}
    </div>
  </div>`;
  bindDeal(ctx);
  stickyHead();
  // narrow screens: the stage bar scrolls sideways, so bring the current stage into view
}
// sticky header (name + stage bar): compact when stuck, and tells the sidebar how tall it is
let _stickyObs = null;
function stickyHead() {
  const head = $('.deal-top'); if (!head) return;
  const setH = () => document.documentElement.style.setProperty('--dh', getComputedStyle(head).position === 'sticky' ? head.offsetHeight + 'px' : '0px');
  setH();
  _stickyObs?.disconnect();
  const probe = document.createElement('div'); probe.style.height = '1px'; head.before(probe);
  const top = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--top')) || 56;
  _stickyObs = new IntersectionObserver(([e]) => { head.classList.toggle('stuck', !e.isIntersecting); setH(); }, { rootMargin: `-${EMBED ? 1 : top + 1}px 0px 0px 0px` });
  _stickyObs.observe(probe);
}
function dealMeta(o) {
  return `<span>#${o.id}</span><span>·</span><span>${stagePill(o.stage)}</span>${o.total > 0 ? `<span>·</span><b>${money(o.total)}</b>` : ''}
    ${o.source ? `<span>·</span><span>${esc(o.source)}</span>` : ''}${o.lab_name ? `<span>·</span><span>מעבדה: ${esc(o.lab_name)}</span>` : ''}
    ${o.is_repeat ? '<span class="chip blue">לקוח חוזר</span>' : ''}${o.priority ? '<span class="chip orange">אקספרס</span>' : ''}
    ${o.flag_sla ? `<span class="chip ${o.flag_sla}">${esc(o.sla_reason)}</span>` : o.days_at_lab != null ? `<span class="chip">${o.priority ? o.lab_biz_days + ' ימי עסקים' : o.days_at_lab + ' ימים'} מהקליטה</span>` : ''}${o.flag_count_mismatch ? '<span class="chip red">פער בספירת פריטים</span>' : ''}
    ${o.flag_cash_at_courier ? '<span class="chip orange">מזומן אצל השליח</span>' : ''}`;
}

// ---------- stepper ----------
function stepDate(ctx, s) {
  const d = s.date?.(ctx.o); if (d) return d;
  return ctx.events.find(e => e.kind === 'stage' && e.new_value === s.key)?.at;
}
/** Pipedrive-style chevron bar: every stage, the current one green, and how many days the customer spent in each. */
function stepperHtml(ctx) {
  const cur = stepIdx(ctx.o.stage);
  const start = i => i === cur ? (ctx.o.stage_changed_at || stepDate(ctx, STEPS[i])) : stepDate(ctx, STEPS[i]);
  const days = i => {
    if (i > cur) return '';
    const a = start(i), b = i === cur ? Date.now() : stepDate(ctx, STEPS[i + 1]);
    if (!a || !b) return '';
    const n = Math.max(0, Math.floor((new Date(b) - new Date(a)) / 864e5));
    return n === 0 ? 'פחות מיום' : n === 1 ? 'יום' : `${n} ימים`;
  };
  // narrow screens (side panel, phone) show thin segments + this caption instead of the labels
  const cap = cur >= 0 ? `<div class="pbar-cap"><b>${esc(STEPS[cur].key)}</b><span>שלב ${cur + 1} מתוך ${STEPS.length}${days(cur) ? ' · ' + days(cur) + ' בשלב' : ''}</span>${STEPS[cur + 1] ? `<span class="nx">הבא: ${esc(STEPS[cur + 1].key)}</span>` : ''}</div>` : '';
  const btn = (s, i) => `<button class="step ph-${s.phase} ${i < cur ? 'done' : ''} ${i === cur ? 'cur' : ''}" data-step="${i}" role="listitem" aria-current="${i === cur ? 'step' : 'false'}" aria-label="${esc(s.key)}">
    <span class="l">${esc(s.key)}</span><span class="d">${days(i)}</span></button>`;
  // two groups: sales (lead -> paid) and the lab work (paid -> delivered), with the payment as the gate between them
  const grp = (ph, label, sub) => { const idx = STEPS.map((s, i) => i).filter(i => (STEPS[i].phase === 'sales') === (ph === 'sales'));
    return `<div class="pgroup ph-${ph} ${idx.includes(cur) ? '' : 'dim'}"><div class="pgroup-h">${label} <span>${sub}</span></div><div class="prow">${idx.map(i => btn(STEPS[i], i)).join('')}</div></div>`; };
  const paid = cur >= 0 && STEPS[cur].phase !== 'sales';
  return `<div class="pbar split" role="list" aria-label="שלבים">${grp('sales', 'מכירה', 'מליד ועד תשלום')}
    <div class="pay-gate ${paid ? 'paid' : ''}" title="${paid ? 'הלקוח שילם' : 'עוד לא שולם'}"><span>${paid ? 'שולם' : 'תשלום'}</span><div class="coin">₪</div></div>
    ${grp('ops', 'עבודה במעבדה', 'מתשלום ועד מסירה')}</div>${cap}`;
}

// ---------- next step card ----------
function nextCardHtml(ctx) {
  const { o, c } = ctx, i = stepIdx(o.stage), s = STEPS[i];
  if (!s) return '';
  const checks = s.checks.filter(k => !k.show || k.show(o));
  const miss = s.need ? s.need(o) : [];
  const nxt = STEPS[i + 1];
  return `<section class="card next-card">
    <div class="eyebrow">${phTag(o.stage)}שלב ${i + 1} מתוך ${STEPS.length} · ${esc(s.key)}</div>
    <h2>הצעד הבא: ${esc(s.title)}</h2>
    <p class="todo">${esc(s.todo)}</p>
    ${FU_STAGES.includes(o.stage) ? `<div class="fu-line fu-${fuState(o)}"><span>פולו-אפ הבא: <b>${o.next_followup ? fuCh(o) + ' ' + (FU_CH[o.followup_channel] ? FU_CH[o.followup_channel][1] + ' ' : '') + esc(fuLabel(o)) + ' (' + fmtShort(o.next_followup) + ')' : 'אין צעד הבא'}</b>${o.followup_note ? ' · ' + esc(o.followup_note) : ''}${o.stage === 'בשיחה' ? ` · ניסיון ${o.followup_attempts || 1} מתוך ${MAX_ATTEMPTS}` : ''}</span><button class="btn sm" id="fuEdit">${o.next_followup ? 'שינוי' : 'קביעת פולו-אפ'}</button></div>` : ''}
    ${checks.length ? `<ul class="checklist">${checks.map((k, j) => checkHtml(ctx, k, j)).join('')}</ul>` : ''}
    ${s.fields ? `<div class="fields" style="margin-bottom:12px">${s.fields.map(k => fld(ctx, k)).join('')}</div>` : ''}
    ${s.pay ? `<div class="note" style="margin-bottom:12px">תשלום בקישור SUMIT: ההזמנה עוברת לבד לתיאום איסוף (בדרך כלל מיד, לכל המאוחר תוך שעה). תשלום בדרך אחרת: לוחצים "${esc(s.btn)}" ורושמים את התשלום.</div>` : ''}
    ${miss.length && nxt ? `<div class="warn" style="margin-bottom:4px">כדי להמשיך חסר: ${esc(miss.join(', '))}</div>` : ''}
    <div class="next-actions">
      ${nxt && s.btn ? `<button class="btn primary lg" id="advance">${esc(s.btn)} ←</button>` : ''}
      ${s.key === 'בפולואפ' ? `<button class="btn wa" id="sendQuote">שליחת ההצעה בוואטסאפ</button>` : ''}
      ${s.wa ? '<button class="btn wa" id="waOpen">פתיחת שיחה בוואטסאפ</button>' : ''}
      ${s.key === 'לתאם איסוף' ? `<a class="btn ghost" href="#labels/${o.id}">מדבקות</a><a class="btn ghost" href="#manifest/${o.id}">דף משלוח</a>` : ''}
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
    : k.act === 'closing' ? `<button class="btn sm" data-chk="${j}">לסריקה</button>`
    : k.act === 'files' ? `<button class="btn sm" data-chk="${j}">בדיקת קבצים</button>`
    : k.act === 'waive' ? `<button class="btn sm ghost" data-chk="${j}">הלקוח ויתר</button>`
    : k.act === 'quotesent' ? `<button class="btn sm primary" data-chk="${j}">ההצעה נשלחה ✓</button>`
    : k.act === 'paylink' ? `<button class="btn sm primary" data-chk="${j}">שליחת קישור תשלום</button>`
    : k.act === 'qsent' ? `<button class="btn sm ghost" data-qcopy>העתקת קישור</button><button class="btn sm" data-chk="${j}">השאלון נשלח ✓</button>`
    : `<button class="btn sm" data-chk="${j}">סימון ✓</button>`;
  const missNote = k.act === 'files' && ctx.o.files_missing ? ` <span class="chip red">חסרים ${ctx.o.files_missing} קבצים</span>` : '';
  const st = ok && k.state ? k.state(ctx.o) : '', warnSt = k.act === 'paylink' && st;
  return `<li class="${ok ? 'ok' : ''}"><span class="box">${ok ? '✓' : ''}</span><span class="t grow">${esc(k.label)}${missNote}${st ? ` <span class="chip${warnSt ? ' orange' : k.act !== 'qsent' || ctx.o.q_submitted_at ? ' green' : ''}">${esc(st)}</span>` : ''}${at ? ` <span class="when">· ${esc(k.at && FIELD_DATE(at))}</span>` : ''}${!ok && k.note ? `<div class="tiny muted">${esc(k.note)}</div>` : ''}</span>
    ${act}${ok && ms ? `<button class="link-btn" data-msedit="${ms}">שינוי תאריך</button>` : ''}${ok && k.act === 'files' ? `<button class="link-btn" data-chk="${j}">בדיקה שוב</button>` : ''}${ok && k.act === 'paylink' ? `<button class="link-btn" data-chk="${j}">שליחה שוב</button>` : ''}
    ${ok && canUncheck(k) ? `<button class="link-btn" data-unchk="${j}">ביטול סימון</button>` : ''}</li>`;
}
// checks that are a stamp we set (not something derived, like "a lab was chosen") can be un-checked
const canUncheck = k => !!k.act && (k.act.startsWith('ms:') || ['contact', 'intake', 'cash', 'qsent', 'quotesent', 'paylink'].includes(k.act));
const FIELD_DATE = d => /^\d{4}-\d{2}-\d{2}$/.test(d) ? fmtDate(d) : fmtDT(d);

// ---------- sections ----------
const SECTIONS = [
  ['customer', 'פרטי לקוח וכתובת', ctx => { const m = showRequired(ctx.o) ? missingForPaid(ctx.o, ctx.c).filter(x => x !== 'כמויות בהצעת המחיר') : []; return [ctx.c.city, m.length ? `<span class="chip red">חסרים ${m.length} פרטים</span>` : ''].filter(Boolean).join(' · '); }],
  ['photos', 'תמונות החומרה', ctx => { const p = ctx.photos || [], u = p.filter(x => x.kind === 'update').length; return p.length ? `${p.length} תמונות${u ? ` · <span class="chip orange">${u} אחרי שינוי כמויות</span>` : ''}` : '<span class="chip red">אין תמונות</span>'; }],
  ['quote', 'הצעת מחיר', ctx => ctx.o.media_qty ? `${ctx.o.media_qty} פריטים · ${money(ctx.o.total)}` : 'עוד אין כמויות'],
  ['items', 'פריטים וברקודים', ctx => ctx.items.length ? `${ctx.items.length} ברקודים · ${ctx.o.items_at_lab_or_later} הגיעו למעבדה · ${ctx.o.items_converted} הומרו` : 'עוד לא נוצרו'],
  ['payment', 'תשלום, עלות וזיכוי', ctx => [ctx.o.payment_status, ctx.o.paid_amount ? money(ctx.o.paid_amount) : '', ctx.o.invoice_number ? 'חשבונית ' + ctx.o.invoice_number : '',
    ctx.o.lab_id && ctx.o.paid_at ? 'רווח ' + money(orderProfit(ctx.o)) : '', ctx.o.items_no_charge && !ctx.o.credit_done_at ? `<span class="chip orange">זיכוי פתוח ${money(ctx.o.credit_amount ?? ctx.o.credit_due)}</span>` : ''].filter(Boolean).join(' · ')],
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
    <div style="margin-top:12px">${tog(ctx, 'invoice_business')}</div>${ctx.c.invoice_business ? `<div class="fields" style="margin-top:8px">${fld(ctx, 'business_name')}${fld(ctx, 'business_id')}</div>` : ''}
    <div class="subhead">כתובת לאיסוף</div><div class="fields">${['city', 'street', 'house_number', 'floor', 'apartment', 'entry_code'].map(k => fld(ctx, k)).join('')}</div>
    <div style="margin-top:12px">${tog(ctx, 'mailing_list')}</div>`,
  photos: ctx => photosHtml(ctx),
  quote: ctx => quoteHtml(ctx),
  items: ctx => itemsHtml(ctx),
  payment: ctx => `<div class="fields">${['payment_status', 'payment_method', 'paid_amount', 'invoice_number'].map(k => fld(ctx, k)).join('')}${ro('תאריך תשלום', fmtDT(ctx.o.paid_at))}</div>${sumitHtml(ctx.o)}${creditHtml(ctx)}${moneyHtml(ctx.o)}`,
  shipping: ctx => `<div class="fields">${['lab_id', 'courier', 'pickup_date', 'pickup_tracking'].map(k => fld(ctx, k)).join('')}${fld(ctx, 'files_link_from_lab', { wide: true })}</div>
    <div class="row" style="margin-top:12px"><a class="btn sm" href="#labels/${ctx.o.id}">הדפסת מדבקות ברקוד</a><a class="btn sm" href="#boxlabel/${ctx.o.id}">מדבקת ארגז</a><a class="btn sm" href="#manifest/${ctx.o.id}">הדפסת דף משלוח</a><a class="btn sm" href="#shipments/new/${ctx.o.id}">משלוח חדש עם ההזמנה</a></div>`,
  delivery: ctx => `<div class="fields">${fld(ctx, 'delivery_link', { wide: true })}${ro('הקישור יימחק ב-', fmtDate(ctx.o.delivery_link_expires))}${['return_method', 'return_tracking'].map(k => fld(ctx, k)).join('')}
    ${fld(ctx, 'personal_cloud_link')}${fld(ctx, 'drive_folder_url')}</div><div style="margin-top:12px">${tog(ctx, 'cloud_affiliate')}</div>`,
  sale: ctx => `<div class="fields">${fld(ctx, 'source')}${fld(ctx, 'temperature')}${ro('נכנס', fmtDT(ctx.o.created_at))}${ctx.o.est_quantity ? ro('כמות שהלקוח כתב בטופס', ctx.o.est_quantity) : ''}
    ${ctx.o.stage === LOST ? fld(ctx, 'loss_category') + fld(ctx, 'loss_note', { wide: true }) : ''}</div>
    <div style="margin-top:12px">${tog(ctx, 'priority')}</div>
    ${ctx.o.meta_lead_id ? `<div class="subhead">הגיע מטופס לידים במטא: ${esc(ctx.o.meta_form || '')}</div><div class="fields">
      ${ro('פלטפורמה', ctx.o.meta_platform === 'ig' ? 'אינסטגרם' : ctx.o.meta_platform === 'fb' ? 'פייסבוק' : ctx.o.meta_platform)}${ro('קמפיין', ctx.o.meta_campaign)}${ro('סט מודעות', ctx.o.meta_adset)}${ro('מודעה', ctx.o.meta_ad)}${ro('מילא את הטופס', fmtDT(ctx.o.meta_created_at))}</div>` : ''}`,
  after: ctx => `<ul class="checklist">${STEP_DONE().checks.map((k, j) => checkHtml(ctx, k, 'a' + j)).join('')}</ul><div class="fields">${fld(ctx, 'gift_sent')}</div><div style="margin-top:12px">${tog(ctx, 'story_posted')}</div>`,
};

// ---------- file check: file name = barcode ----------
const NO_CHARGE = ['ריק', 'תוכן לא משפחתי', 'לא ניתן להמרה'];
/** Compare file names to the order's barcodes. A file belongs to 1002-03 if its name starts with 1002-03 and no digit follows (1002-03.mp4, 1002-03_b.mp4). */
function matchFiles(items, names) {
  const want = items.filter(i => !NO_CHARGE.includes(i.outcome) && !NO_CHARGE.includes(i.status)).map(i => i.id);
  const base = names.map(n => n.split(/[\\/]/).pop().trim()).filter(n => n && !n.startsWith('.'));
  const hit = id => base.some(n => n.toLowerCase().startsWith(id.toLowerCase()) && !/\d/.test(n.charAt(id.length)));
  const missing = want.filter(id => !hit(id));
  const extra = base.filter(n => !items.some(i => n.toLowerCase().startsWith(i.id.toLowerCase()) && !/\d/.test(n.charAt(i.id.length))));
  return { want, missing, extra, files: base.length };
}
async function filesCheck(ctx) {
  const { o, items } = ctx;
  const p = modal(`<h2>בדיקת קבצים · הזמנה ${o.id}</h2>
    <p class="small muted">שם כל קובץ צריך להיות הברקוד (למשל ${esc(items[0]?.id || '1001-01')}.mp4). פריטים שסומנו ריק, תוכן לא משפחתי או לא ניתן להמרה לא צריכים קובץ.</p>
    <div class="grid"><label class="field">בחירת התיקייה מהמחשב (הקבצים לא עולים לשום מקום, נקראים רק השמות)<input type="file" id="fcDir" webkitdirectory multiple></label>
      <label class="field">או הדבקת רשימת שמות הקבצים, שורה לכל קובץ<textarea id="fcList" rows="5" dir="ltr" placeholder="1001-01.mp4&#10;1001-02.mp4"></textarea></label>
      <div id="fcRes"></div>
      <div class="actions"><button class="btn primary" id="fcSave" disabled>שמירת הבדיקה</button><button class="btn" id="fcNo">ביטול</button></div></div>`, { wide: true });
  let names = [], res = null;
  const show = () => {
    res = matchFiles(items, names);
    $('#fcRes', p).innerHTML = !res.files ? '' : `<div class="row"><span class="chip">${res.files} קבצים</span><span class="chip">${res.want.length} ברקודים שצריכים קובץ</span>
      ${res.missing.length ? `<span class="chip red">חסרים ${res.missing.length}</span>` : '<span class="chip green">לכל ברקוד יש קובץ ✓</span>'}${res.extra.length ? `<span class="chip orange">${res.extra.length} קבצים בלי ברקוד</span>` : ''}</div>
      ${res.missing.length ? `<p class="small" style="margin-top:8px"><b>ברקודים בלי קובץ:</b> ${res.missing.map(esc).join(', ')}</p>` : ''}
      ${res.extra.length ? `<p class="small muted" style="margin-top:4px"><b>קבצים ששמם לא ברקוד של ההזמנה:</b> ${res.extra.slice(0, 15).map(esc).join(', ')}${res.extra.length > 15 ? '…' : ''}</p>` : ''}`;
    $('#fcSave', p).disabled = !res.files;
  };
  $('#fcDir', p).onchange = e => { names = [...e.target.files].map(f => f.webkitRelativePath || f.name); $('#fcList', p).value = ''; show(); };
  $('#fcList', p).oninput = e => { names = e.target.value.split(/\r?\n/); show(); };
  return new Promise(resolve => {
    $('#fcNo', p).onclick = () => { closeModal(); resolve(false); };
    $('#modal').addEventListener('cancel', () => resolve(false), { once: true });
    $('#fcSave', p).onclick = async () => {
      closeModal();
      await patchOrder(o, { files_checked_at: new Date().toISOString(), files_missing: res.missing.length }, res.missing.length ? `בדיקת קבצים: חסרים ${res.missing.length}` : 'בדיקת קבצים: הכל תקין');
      resolve(true);
    };
  });
}
/** before the download link goes to the customer: the file check passed, or the user says to send anyway */
async function filesOkToSend(o) {
  if (!o.items_count || (o.files_checked_at && !o.files_missing)) return true;
  return ask(o.files_checked_at ? `חסרים ${o.files_missing} קבצים` : 'עוד לא נבדקו הקבצים', o.files_checked_at ? 'בבדיקה האחרונה היו ברקודים בלי קובץ. לשלוח ללקוח בכל זאת?' : 'לא בדקנו שלכל ברקוד יש קובץ. לשלוח ללקוח בכל זאת?', { ok: 'לשלוח בכל זאת', cancel: 'קודם לבדוק' });
}
/** the customer doesn't want the hardware back: items "לא מוחזר", kept for waived_keep_days, then destroyed (a task in היום) */
async function waiveHardware(ctx) {
  const { o, items } = ctx, keep = setting('waived_keep_days') || 30;
  if (!await ask('הלקוח ויתר על החומרה?', `החומרה לא תחזור אליו. נשמור אותה ${keep} יום ואז תופיע משימה להשמיד אותה.\nכדאי שיהיה אישור מהלקוח בוואטסאפ.`, { ok: 'כן, ויתר' })) return false;
  const open = items.filter(i => !['הוחזר ללקוח', 'לא מוחזר', 'הושמד'].includes(i.status));
  if (open.length) { const { error } = await sb.from('items').update({ status: 'לא מוחזר' }).in('id', open.map(i => i.id)); fail(error); }
  const now = new Date().toISOString();
  await patchOrder(o, { hardware_waived_at: now, returned_at: o.returned_at || now }, 'נרשם שהלקוח ויתר על החומרה');
  return true;
}
/** destroy kept hardware: items "הושמד" + destroyed_at */
async function destroyHardware(o) {
  if (!await ask(`להשמיד את החומרה של הזמנה ${o.id}?`, 'מסמנים אחרי שהחומרה הושמדה בפועל. אי אפשר להחזיר אותה אחר כך.', { ok: 'הושמדה', danger: true })) return false;
  const { error } = await sb.from('items').update({ status: 'הושמד' }).eq('order_id', o.id).not('status', 'in', '("הוחזר ללקוח","הושמד")'); fail(error);
  const now = new Date().toISOString();
  await patchOrder(o, { destroyed_at: now, returned_at: o.returned_at || now }, 'נרשם שהחומרה הושמדה');
  return true;
}

// ---------- lab cost, profit, customer credit ----------
/** what the order earns: paid − lab cost − money refunded (a gift's cost is not known, so it is not subtracted) */
const orderProfit = o => Number(o.paid_amount || o.total || 0) - Number(o.lab_cost || 0) - (o.credit_method === 'החזר כספי' && o.credit_done_at ? Number(o.credit_amount || 0) : 0);
function moneyHtml(o) {
  if (!o.lab_id) return '';
  return `<div class="subhead">עלות ורווח</div><div class="totals" style="max-width:360px">
    <span>הלקוח שילם</span><span>${money(o.paid_amount || o.total)}</span>
    <span>עלות מעבדה (${esc(o.lab_name || '')})</span><span>-${money(o.lab_cost || 0)}</span>
    ${o.credit_method === 'החזר כספי' && o.credit_done_at ? `<span>החזר ללקוח</span><span>-${money(o.credit_amount)}</span>` : ''}
    <span class="grand">רווח</span><span class="grand">${money(orderProfit(o))}</span></div>
    ${o.lab_cost_missing ? `<div class="warn" style="margin-top:8px">חסר מחיר עלות ל-${o.lab_cost_missing} מוצרים בהזמנה. ממלאים בהגדרות ← מעבדות ← מחירון עלות.</div>` : ''}`;
}
function creditHtml(ctx) {
  const o = ctx.o;
  if (!o.items_no_charge && !o.credit_method) return '';
  return `<div class="subhead">זיכוי ללקוח</div>
    <p class="small">${o.items_no_charge} פריטים לא לחיוב (ריק, תוכן לא משפחתי או לא ניתן להמרה). לפי המחיר שלהם אחרי הנחת הכמות: <b>${money(o.credit_due)}</b>.</p>
    <div class="fields">${fld(ctx, 'credit_method')}${fld(ctx, 'credit_amount')}${fld(ctx, 'credit_note')}</div>
    <div class="row" style="margin-top:8px">${o.credit_done_at ? `<span class="chip green">הזיכוי בוצע ${fmtShort(o.credit_done_at)}</span><button class="link-btn" data-credit="undo">ביטול</button>`
      : `<button class="btn sm primary" data-credit="done">${o.credit_method === 'מתנה בשווי' ? 'המתנה נשלחה' : 'הכסף הוחזר'}</button>${o.credit_amount == null ? `<button class="btn sm" data-credit="fill">מילוי הסכום המחושב (${money(o.credit_due)})</button>` : ''}`}</div>
    <p class="tiny muted">החזר כספי: מחזירים ב-SUMIT, בביט או בהעברה, ואז לוחצים "הכסף הוחזר". מתנה בשווי (למשל אלבום תמונות): רושמים מה ניתן.</p>`;
}
async function creditAction(ctx, act) {
  const o = ctx.o;
  if (act === 'fill') await patchOrder(o, { credit_amount: Number(o.credit_due) }, 'הסכום המחושב נכנס');
  if (act === 'done') {
    if (!o.credit_method) return tell('חסר איך מזכים', 'בוחרים "החזר כספי" או "מתנה בשווי".');
    await patchOrder(o, { credit_done_at: new Date().toISOString(), credit_amount: o.credit_amount ?? Number(o.credit_due) }, 'נרשם שהזיכוי בוצע');
  }
  if (act === 'undo') await patchOrder(o, { credit_done_at: null }, 'בוטל סימון הזיכוי');
  SEC_OPEN[o.id].add('payment'); reloadDeal(ctx);
}

// ---------- SUMIT: invoice-receipt, credit, customer page ----------
function sumitHtml(o) {
  const doc = o.sumit_doc_id ? `<a class="btn sm" href="${esc(o.sumit_doc_url || '#')}" target="_blank" rel="noopener">חשבונית ${esc(o.invoice_number || '')} (PDF)</a>` : '';
  const credit = o.sumit_credit_doc_number ? `<a class="btn sm" href="${esc(o.sumit_credit_doc_url || '#')}" target="_blank" rel="noopener">זיכוי ${esc(o.sumit_credit_doc_number)} (PDF)</a>` : '';
  return `<div class="subhead">SUMIT</div><div class="row">${doc}${credit}
    ${o.payment_status !== 'שולם' && o.stage !== LOST ? `<button class="btn sm primary" data-paylink>${o.pay_link_sent_at ? 'שליחת קישור תשלום שוב' : 'שליחת קישור תשלום'}</button>` : ''}
    ${!o.sumit_doc_id ? '<button class="btn sm" data-sumit="receipt">הפקת חשבונית מס-קבלה</button>' : ''}
    ${o.sumit_doc_id && !o.sumit_credit_doc_number ? '<button class="btn sm" data-sumit="cancel">ביטול החשבונית (זיכוי)</button>' : ''}
    <button class="btn sm ghost" data-sumit="customer_url">כרטיס הלקוח ב-SUMIT</button></div>
    <p class="tiny muted">${o.sumit_doc_id ? '' : 'תשלום בקישור SUMIT מפיק חשבונית לבד. הכפתור הוא לתשלום בביט, פייבוקס, העברה או מזומן.'}</p>`;
}
async function callSumit(body) {
  const { data, error } = await sb.functions.invoke('sumit-payment', { body });
  if (error || data?.error) { tell('SUMIT', data?.error || error?.message || 'שגיאה'); return null; }
  return data;
}
async function sumitAction(ctx, act) {
  const { o, c } = ctx;
  if (act === 'customer_url') { toast('פותח את SUMIT…'); const d = await callSumit({ order_id: o.id, action: act }); if (d?.url) window.open(d.url, '_blank', 'noopener'); return; }
  if (act === 'receipt') {
    const methods = (S.opts.payment_method || []).filter(x => x.active && !/SUMIT/.test(x.value)).map(x => x.value);
    const f = await formModal('הפקת חשבונית מס-קבלה', `<label class="field">איך הלקוח שילם<select name="method" required>${methods.map(m => `<option ${m === o.payment_method ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
      <label class="field">סכום (₪, כולל מע"מ)<input name="amount" type="number" step="0.01" min="1" required value="${Number(o.paid_amount || o.total) || ''}"></label>
      <label class="field">אסמכתא (לא חובה)<input name="reference" placeholder="מספר העברה / שם בביט"></label>
      <p class="hint">${c.email ? 'החשבונית תישלח במייל אל ' + esc(c.email) + '.' : 'ללקוח אין מייל, אז החשבונית לא תישלח. אפשר לשלוח את ה-PDF בוואטסאפ.'} מסמך שהופק נשאר בהנהלת החשבונות; תיקון רק דרך זיכוי.</p>`, { ok: 'הפקה' });
    if (!f) return;
    toast('מפיק חשבונית ב-SUMIT…', { ms: 8000 });
    const d = await callSumit({ order_id: o.id, action: 'receipt', method: f.method, amount: Number(f.amount), reference: f.reference });
    if (d) toast(`חשבונית ${d.number} הופקה${d.emailed ? ' ונשלחה ללקוח' : ''}`, { ms: 6000 });
  }
  if (act === 'cancel') {
    const f = await formModal('ביטול חשבונית ' + (o.invoice_number || ''), `<label class="field">סיבה (מודפסת על מסמך הזיכוי)<input name="reason" required></label>
      <p class="hint">מופק מסמך זיכוי וההזמנה מסומנת "הוחזר". הכסף עצמו לא חוזר אוטומטית: החזר באשראי עושים ב-SUMIT, ביט/העברה מחזירים ידנית.</p>`, { ok: 'הפקת זיכוי' });
    if (!f) return;
    const d = await callSumit({ order_id: o.id, action: 'cancel', reason: f.reason });
    if (d) toast('מסמך זיכוי ' + d.number + ' הופק', { ms: 6000 });
  }
  SEC_OPEN[o.id].add('payment'); reloadDeal(ctx);
}

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
const ITEM_LOC = { 'ממתין לאיסוף': 'אצל הלקוח', 'נאסף': 'אצל השליח', 'במעבדה': 'במעבדה', 'הומר': 'במעבדה', 'ריק': 'במעבדה', 'תוכן לא משפחתי': 'במעבדה', 'לא ניתן להמרה': 'במעבדה',
  'אצלנו': 'אצלנו', 'נארז להחזרה': 'ארוז, יוצא ללקוח', 'הוחזר ללקוח': 'חזר ללקוח', 'לא מוחזר': 'אצלנו, הלקוח ויתר', 'הושמד': 'הושמד' };
const LAB_PLACES = ['במעבדה', 'הומר', 'ריק', 'תוכן לא משפחתי', 'לא ניתן להמרה'];
function itemsHtml(ctx) {
  const { o, items } = ctx;
  if (!items.length) return `<div class="empty"><div class="big">🏷️</div><h3>עוד אין ברקודים</h3><p>כל קלטת, דיסק או סליל מקבל ברקוד משלו לפי הכמויות בהצעת המחיר.<br>תמונות ושקופיות נספרות כקבוצה בלי ברקוד.</p>
    <button class="btn primary" style="margin-top:12px" data-gen ${o.media_qty ? '' : 'disabled'}>${o.media_qty ? `יצירת ${o.media_qty} ברקודים` : 'קודם ממלאים כמויות בהצעת המחיר'}</button></div>`;
  const statuses = (S.opts.item_status || []).filter(x => x.active).map(x => x.value);
  return `<div class="row spread" style="margin-bottom:12px"><div class="row small"><span class="chip">הוצהרו ${o.media_qty}</span><span class="chip">ברקודים ${items.length}</span><span class="chip blue">הגיעו למעבדה ${o.items_at_lab_or_later}</span><span class="chip green">הומרו ${o.items_converted}</span>${o.items_no_charge ? `<span class="chip orange" data-tip="ריק, תוכן לא משפחתי או לא ניתן להמרה: הלקוח לא מחויב עליהם">לא לחיוב ${o.items_no_charge}</span>` : ''}${o.items_packed ? `<span class="chip">נספרו להחזרה ${o.items_packed}/${items.length}</span>` : ''}${o.intake_done_at ? `<span class="chip">קליטה הסתיימה ${fmtShort(o.intake_done_at)}</span>` : ''}</div>
    <div class="row">${items.length < o.media_qty ? `<button class="btn sm" data-gen>יצירת ${o.media_qty - items.length} ברקודים חסרים</button>` : ''}<a class="btn sm" href="#labels/${o.id}">מדבקות</a><a class="btn sm" href="#boxlabel/${o.id}">מדבקת ארגז</a><a class="btn sm" href="#manifest/${o.id}">דף משלוח</a></div></div>
    <div class="bulk-bar hidden" id="ibulk"><b id="ibulkN"></b><span>להעביר את כולם ל:</span>
      <select id="ibulkTo">${statuses.map(s => `<option>${esc(s)}</option>`).join('')}</select><button class="btn sm primary" id="ibulkGo">החלה</button><span>·</span><button class="btn sm ghost" id="ibulkDel" data-tip="למשל כשהלקוח שלח פחות קלטות. אפשר למחוק רק ברקודים שעוד לא נאספו">מחיקת הברקודים</button><button class="btn sm ghost" id="ibulkClear">ביטול הבחירה</button></div>
    <div class="card flush table-wrap"><table><thead><tr><th class="sel"><input type="checkbox" id="iselAll" aria-label="בחירת כל הפריטים"></th><th>ברקוד</th><th>סוג</th><th>מה כתוב עליו</th><th>איפה הוא</th><th>פגום</th><th>הערה</th></tr></thead><tbody>
    ${items.map(it => `<tr><td class="sel"><input type="checkbox" data-isel="${esc(it.id)}" aria-label="בחירת ${esc(it.id)}"></td><td><b class="num">${esc(it.id)}</b></td><td class="small">${esc(productName(it.product_id).split(' (')[0])}</td>
      <td><input data-isave="${esc(it.id)}:label_text" value="${esc(it.label_text || '')}" placeholder="למשל: חתונה 1994"></td>
      <td><select data-isave="${esc(it.id)}:status">${statuses.map(s => `<option ${s === it.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select><span class="sub">${esc(ITEM_LOC[it.status] || '')}${LAB_PLACES.includes(it.status) && o.lab_name ? ': ' + esc(o.lab_name) : ''}</span></td>
      <td><input type="checkbox" data-isave="${esc(it.id)}:damaged" ${it.damaged ? 'checked' : ''} aria-label="פגום"></td>
      <td><input data-isave="${esc(it.id)}:notes" value="${esc(it.notes || '')}"></td></tr>`).join('')}</tbody></table></div>
    <p class="tiny muted" style="margin-top:8px">המיקום מתעדכן לבד כשסורקים במסך "סריקה". כדי לעדכן כמה פריטים יחד: מסמנים אותם בעמודה הראשונה (או את כולם בכותרת).</p>`;
}

// ---------- side panel ----------
const EV_IC = { stage: ['←', 'stage'], payment: ['₪', 'payment'], contact: ['☎', 'contact'], note: ['✎', 'note'], followup: ['⏰', 'stage'], field: ['✎', 'field'] };
function evText(ev) {
  if (ev.kind === 'followup') return `פולו-אפ: <b>${esc(ev.new_value)}</b>`;
  if (ev.kind === 'stage') return `עבר ל<b>${esc(ev.new_value)}</b>`;
  if (ev.kind === 'payment') return `תשלום: ${esc(ev.old_value ? ev.old_value + ' ← ' : '')}<b>${esc(ev.new_value)}</b>`;
  if (ev.kind === 'contact') return 'שיחה / הודעה עם הלקוח';
  return esc(ev.new_value || '');
}
/** Sidebar "סיכום" (Pipedrive summary section): the deal's key facts at a glance. Re-rendered after every save. */
function summaryHtml(ctx) {
  const { o } = ctx, st = fuState(o);
  const fu = FU_STAGES.includes(o.stage) ? (o.next_followup ? `<span class="fu-pill ${st === 'late' ? 'late' : st === 'today' ? 'today' : ''}" style="cursor:default">${fuCh(o)}${esc(fuLabel(o))}</span>` : '<span class="fu-pill none" style="cursor:default">אין צעד הבא</span>') : '';
  const kv = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : '';
  return `<dl class="kv">
    ${kv('סכום', o.total > 0 ? `<span class="big">${money(o.total)}</span>${o.media_qty ? ` <span class="muted small">${o.media_qty} פריטים</span>` : ''}` : '<span class="muted">עוד אין הצעה</span>')}
    ${kv('שלב', stagePill(o.stage))}
    ${kv('פולו-אפ הבא', fu)}
    ${kv('חום', o.temperature ? `<span class="chip" style="background:color-mix(in srgb, ${tempColor(o.temperature) || 'var(--muted)'} 18%, transparent)">${esc(o.temperature)}</span>` : '')}
    ${kv('מקור', esc(o.source || ''))}
    ${kv('נכנס', `${fmtDate(o.created_at)} <span class="muted small">(${esc(ago(o.created_at))})</span>`)}
    ${kv('מעבדה', esc(o.lab_name || ''))}
    ${phaseOf(o.stage) !== 'sales' ? kv('תשלום', esc([o.payment_status, o.paid_amount ? money(o.paid_amount) : ''].filter(Boolean).join(' · '))) : ''}
    ${kv('הזמנה', '#' + o.id)}</dl>`;
}
function contactHtml(ctx) {
  const { c } = ctx, addr = [c.street, c.house_number].filter(Boolean).join(' ');
  const kv = (k, v) => `<dt>${k}</dt><dd>${v || '<span class="muted">—</span>'}</dd>`;
  return `<dl class="kv">${kv('טלפון', c.phone ? `<a href="tel:${esc(c.phone)}"><bdi dir="ltr">${esc(fmtPhone(c.phone))}</bdi></a>` : '')}${kv('מייל', c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '')}
    ${kv('עיר', esc(c.city || ''))}${kv('כתובת', esc(addr))}${c.alt_contact_name ? kv('איש קשר נוסף', esc(c.alt_contact_name) + (c.alt_contact_phone ? ` · <bdi dir="ltr">${esc(fmtPhone(c.alt_contact_phone))}</bdi>` : '')) : ''}</dl>`;
}
function sideHtml(ctx) {
  const { o } = ctx, sales = phaseOf(o.stage) === 'sales';
  return `<section class="card"><div class="card-head"><h3>סיכום</h3></div><div id="sumBox">${summaryHtml(ctx)}</div></section>
    ${questionnaireHtml(ctx)}
    <section class="card"><div class="card-head"><h3>איש קשר</h3><button class="link-btn" data-opensec="customer">עריכה</button></div><div id="contactBox">${contactHtml(ctx)}</div>
      ${sales ? `<div class="divider"></div><div class="row spread"><span class="small muted">${o.last_contact_at ? 'דיברנו ' + ago(o.last_contact_at) : 'עוד לא דיברנו'}</span><button class="btn sm" id="contacted">✓ דיברתי איתו עכשיו</button></div>` : ''}
    </section>
    <section class="card"><div class="card-head"><h3>הערות קבועות</h3></div>
      <label class="field"><textarea data-save="orders:${o.id}:notes" rows="4" placeholder="מה חשוב לזכור על הלקוח הזה (למשל: הקלטות של החתונה, רגיש)">${esc(o.notes || '')}</textarea></label></section>`;
}
/** History (Pipedrive): a composer with tabs, filter pills, and a vertical timeline. */
const HIST_SHOW = 6; // latest events shown before "show all"
const HIST_F = [['', 'הכל'], ['note', 'הערות'], ['stage', 'שלבים'], ['contact', 'שיחות'], ['payment', 'תשלומים']];
function historyHtml(ctx) {
  const { o } = ctx;
  return `<section class="card composer">
      <div class="ctabs" role="tablist"><button class="on" data-ctab="note" role="tab"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4h16v12l-4 4H4z"/><path d="M8 9h8M8 13h5"/></svg>הערה</button></div>
      <div class="cbody" data-cbody="note"><form id="noteForm" class="stack" style="gap:8px"><textarea name="t" rows="2" placeholder="מה קרה? (שיחה, עדכון, מה הלקוח אמר…)" required></textarea><div class="row" style="justify-content:flex-end"><button class="btn primary sm">שמירת הערה</button></div></form></div>
    </section>
    <div><div class="hist-head"><h3>היסטוריה</h3><div class="pills" role="group" aria-label="סינון היסטוריה">${HIST_F.map(([k, l]) => `<button class="${k ? '' : 'on'}" data-hf="${k}">${l}${k ? '' : ` <span class="n">${ctx.events.length}</span>`}</button>`).join('')}</div></div>
      <ul class="timeline ${ctx.events.length > HIST_SHOW ? 'clipped' : ''}" id="tl">${ctx.events.map((ev, i) => { const [ic, cls] = EV_IC[ev.kind] || EV_IC.note, note = ev.kind === 'note';
        return `<li data-ev="${ev.id}" data-kind="${esc(ev.kind)}" class="${i >= HIST_SHOW ? 'extra' : ''}"><span class="ic ${note ? 'note' : cls}">${ic}</span><div><div class="ev-t">${evText(ev)}</div><div class="w"><bdi dir="ltr">${fmtDT(ev.at)}</bdi>${ev.by_email ? ' · ' + esc(ev.by_email.split('@')[0]) : ''}${ev.edited_at ? ` · <span data-tip="${esc('לפני העריכה: ' + (ev.original_value || ''))}">נערך</span>` : ''}
          ${note ? `<span class="ev-acts"><button class="link-btn" data-evedit="${ev.id}">עריכה</button><button class="link-btn danger" data-evdel="${ev.id}">מחיקה</button></span>` : ''}</div></div></li>`; }).join('') || '<li class="empty-li">עוד אין רישומים</li>'}</ul>
      ${ctx.events.length > HIST_SHOW ? `<button class="btn sm ghost" id="histAll" style="margin-top:8px">הצגת כל ההיסטוריה (${ctx.events.length})</button>` : ''}
      <p class="tiny muted" style="margin-top:10px">הערות אפשר לערוך ולמחוק. מעברי שלב, תשלומים ושיחות נרשמים לבד ולא נערכים, כדי שההיסטוריה תישאר אמינה.</p></div>`;
}

// ---------- behavior ----------
async function lightRefresh(ctx, savedKey) {
  const prevStage = ctx.o.stage, o = await getOrder(ctx.o.id); ctx.o = o;
  o.photos_count = ctx.photos?.length || 0; o.photos_first_at = ctx.photos?.[0]?.created_at || null; // not in v_orders (see vOrder)
  // a database trigger moved the lead (e.g. quantities -> "בפולואפ"): redraw the whole page so the stage bar follows
  if (o.stage !== prevStage) { toast(`הליד עבר אוטומטית ל"${o.stage}"`); return reloadDeal(ctx); }
  $('#dealMeta') && ($('#dealMeta').innerHTML = dealMeta(o));
  $('#sumBox') && ($('#sumBox').innerHTML = summaryHtml(ctx));
  $('#contactBox') && ($('#contactBox').innerHTML = contactHtml(ctx));
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
  if (k === 'invoice_business') { SEC_OPEN[ctx.o.id].add('customer'); return reloadDeal(ctx); } // shows / hides the business fields
  // keep duplicate inputs (same field in next card and in a section) in sync
  const key = `${table}:${table === 'customers' ? ctx.c.id : ctx.o.id}:${k}`;
  $$(`[data-save="${key}"]`).forEach(el => { if (el !== document.activeElement) { if (el.type === 'checkbox') el.checked = !!v; else el.value = v ?? ''; } });
  lightRefresh(ctx, key);
}
async function runUncheck(ctx, k) {
  const o = ctx.o;
  const patch = k.act === 'contact' ? { last_contact_at: null } : k.act === 'intake' ? { intake_done_at: null }
    : k.act === 'cash' ? { payment_status: 'מזומן אצל שליח', cash_received_at: null }
    : k.act === 'qsent' ? { q_sent_at: null } : k.act === 'quotesent' ? { quote_sent_at: null } : k.act === 'paylink' ? { pay_link_sent_at: null } : { [k.act.slice(3)]: null };
  await patchOrder(o, patch, `בוטל הסימון: ${k.label}`); reloadDeal(ctx);
}
async function runCheck(ctx, k) {
  const o = ctx.o;
  if (k.act === 'contact') { await markContacted(o); return reloadDeal(ctx); }
  if (k.act.startsWith('open:')) { const s = k.act.slice(5), d = $(`[data-sec="${s}"]`); if (!d) return; d.open = true; SEC_OPEN[o.id].add(s); d.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (k.act === 'items') return genItems(ctx);
  if (k.act === 'quotesent') { await markQuoteSent(o); return reloadDeal(ctx); }
  if (k.act === 'paylink') return dealPayLink(ctx);
  if (k.act === 'qsent') { await markQSent(o); return reloadDeal(ctx); }
  if (k.act === 'closing') { sessionStorage.setItem('scanStatus', 'נארז להחזרה'); return go('scan'); }
  if (k.act === 'files') { if (await filesCheck(ctx)) reloadDeal(ctx); return; }
  if (k.act === 'waive') { if (await waiveHardware(ctx)) reloadDeal(ctx); return; }
  if (k.act === 'ms:delivery_sent_at' && !await filesOkToSend(o)) return;
  if (k.act === 'cash') { await patchOrder(o, { payment_status: 'שולם' }, 'נרשם שהמזומן הגיע', { extra: ['cash_received_at'] }); return reloadDeal(ctx); }
  if (k.act === 'intake') {
    const miss = o.media_qty - o.items_at_lab_or_later;
    if (miss > 0 && !await ask('חסרים פריטים', `נקלטו ${o.items_at_lab_or_later} מתוך ${o.media_qty}. לסיים קליטה ולסמן פער?`, { ok: 'לסיים עם פער' })) return;
    await finishIntake(o.id); return reloadDeal(ctx);
  }
  if (k.act.startsWith('ms:')) { await patchOrder(o, { [k.act.slice(3)]: new Date().toISOString() }, 'נרשם: ' + k.label); return reloadDeal(ctx); }
}
/** SUMIT payment link from the customer page: same flow as the sales list (paymentLink in sales.js) */
const dealPayLink = ctx => paymentLink(ctx.o, { phone: ctx.c.phone, after: () => reloadDeal(ctx),
  noQuote: () => { const d = $('[data-sec="quote"]'); if (d) { d.open = true; SEC_OPEN[ctx.o.id].add('quote'); d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } } });
async function genItems(ctx) { const { data, error } = await sb.rpc('generate_items', { p_order: ctx.o.id }); fail(error); toast(data ? `נוצרו ${data} ברקודים` : 'אין ברקודים חדשים ליצירה'); SEC_OPEN[ctx.o.id].add('items'); reloadDeal(ctx); }
/** WhatsApp chat with the customer, no prepared text. In sales, opening it counts as contacting the lead. */
async function openWa(ctx) {
  window.open(waLink(ctx.c.phone), '_blank', 'noopener');
  if (phaseOf(ctx.o.stage) !== 'sales') return;
  await patchOrder(ctx.o, { last_contact_at: new Date().toISOString() }, 'נרשם שדיברנו עם הלקוח');
  reloadDeal(ctx);
}
function bindNext(ctx) {
  const s = stepOf(ctx.o.stage); if (!s) return;
  const checks = s.checks.filter(k => !k.show || k.show(ctx.o));
  $$('#nextBox [data-chk]').forEach(b => b.onclick = () => runCheck(ctx, checks[b.dataset.chk]));
  $('#advance') && ($('#advance').onclick = async () => { const nx = STEPS[stepIdx(ctx.o.stage) + 1]; if (nx && await changeStage(ctx.o, nx.key, ctx.c)) {
    delete SEC_OPEN[ctx.o.id]; reloadDeal(ctx); } });
  $('#fuEdit') && ($('#fuEdit').onclick = async () => { if (await setFollowup(ctx.o)) reloadDeal(ctx); });
  $('#toLost') && ($('#toLost').onclick = async () => { if (await changeStage(ctx.o, LOST, ctx.c)) reloadDeal(ctx); });
  $('#waOpen') && ($('#waOpen').onclick = () => openWa(ctx));
  $('#sendQuote') && ($('#sendQuote').onclick = () => sendQuote(ctx));
  $$('#nextBox [data-msedit]').forEach(b => b.onclick = () => editDate(ctx, b.dataset.msedit));
  $$('#nextBox [data-qcopy]').forEach(b => b.onclick = () => copyQLink(ctx));
  $$('#nextBox [data-unchk]').forEach(b => b.onclick = () => runUncheck(ctx, checks[b.dataset.unchk]));
}
async function sendQuote(ctx) {
  if (!ctx.o.media_qty) return tell('ההצעה ריקה', 'קודם ממלאים כמויות בחלק "הצעת מחיר".');
  // the process: a quote only after the questionnaire (user, 2026-11-22)
  if (!ctx.o.q_submitted_at && !await ask('הלקוח עוד לא מילא את השאלון', 'בדרך כלל שולחים הצעה רק אחרי השאלון. לשלוח בכל זאת?', { ok: 'לשלוח בכל זאת' })) return;
  window.open(waLink(ctx.c.phone, quoteText(ctx.o, ctx.c, ctx.lines)), '_blank', 'noopener');
  if (['פנייה חדשה', 'בשיחה', 'בפולואפ'].includes(ctx.o.stage)) {
    if (await ask('ההצעה נפתחה בוואטסאפ', 'להעביר את הליד ל"הצעה נשלחה"?', { ok: 'כן, להעביר', cancel: 'לא עכשיו' }) && await changeStage(ctx.o, 'הצעה נשלחה', ctx.c, { qOk: true })) { delete SEC_OPEN[ctx.o.id]; reloadDeal(ctx); }
  } else if (!ctx.o.quote_sent_at && phaseOf(ctx.o.stage) === 'sales') { await markQuoteSent(ctx.o); reloadDeal(ctx); }
}
/** copy the questionnaire link for WhatsApp on the phone. Copying counts as sending it (first time only) */
async function copyQLink(ctx) {
  const u = qUrl(ctx.o);
  try { await navigator.clipboard.writeText(u); } catch { tell('קישור השאלון', u); }
  if (phaseOf(ctx.o.stage) === 'sales' && await markQSent(ctx.o, 'הקישור הועתק וסומן שהשאלון נשלח. פולו-אפ בעוד יומיים')) return reloadDeal(ctx);
  toast('קישור השאלון הועתק. מדביקים אותו בוואטסאפ ללקוח');
}
/** the quote reached the customer: closes the "לשלוח הצעה" task and locks the questionnaire */
async function markQuoteSent(o) {
  if (o.quote_sent_at) return;
  await patchOrder(o, { quote_sent_at: new Date().toISOString() }, 'נרשם שההצעה נשלחה ללקוח. השאלון ננעל. פולו-אפ מחר', { extra: Q_MARK_EXTRA });
}

// ---------- questionnaire card (side) ----------
const Q_LABEL = { storage_place: 'איפה נשמרה', mold: 'עובש', delivery_method: 'קבלת הקבצים', cloud_type: 'ענן', return_method: 'החומרה בסוף' };
function questionnaireHtml(ctx) {
  const { o, c, lines } = ctx;
  if (phaseOf(o.stage) !== 'sales' && !o.q_opened_at) return '';
  const status = o.q_submitted_at ? `<b>נשלח</b> ${fmtDT(o.q_submitted_at)}` : o.q_opened_at ? `התחיל למלא · <b>${o.q_progress || 0}%</b>${o.q_saved_at ? ` · עדכון אחרון ${esc(ago(o.q_saved_at))}` : ''}` : o.q_sent_at ? `<b>נשלח ללקוח</b> ${fmtDT(o.q_sent_at)} · עוד לא נפתח` : '<span class="muted">עוד לא נשלח ללקוח</span>';
  // quantities the customer changed vs. what we entered from the WhatsApp photos
  const init = new Map((o.q_initial_lines || []).map(l => [l.product_id, l.qty]));
  const diff = o.q_qty_changed_at ? S.products.filter(p => p.category === 'media').map(p => [p, init.get(p.id) || 0, lines.find(l => l.product_id === p.id)?.qty || 0]).filter(([, a, b]) => a !== b) : [];
  const ups = (ctx.photos || []).filter(p => p.source === 'customer').length; // optional photos the customer added in the form
  const kv = (k, v) => v ? `<dt>${k}</dt><dd>${esc(v)}</dd>` : '';
  const ans = o.q_opened_at ? `<dl class="kv" style="margin-top:8px">${Object.entries(Q_LABEL).map(([k, l]) => kv(l, o[k])).join('')}${kv('אקספרס', o.priority ? 'כן' : '')}${kv('תקנון', o.terms_accepted_at ? 'אושר ' + fmtShort(o.terms_accepted_at) : '')}</dl>` : '';
  return `<section class="card" id="qCard"><div class="card-head"><h3>שאלון לפני הצעה</h3><button class="link-btn" id="qCopy">העתקת קישור</button></div>
    <div class="small">${status}</div>
    ${quotePending(o) ? `<div class="warn" style="margin-top:8px"><b>ההצעה עוד לא נשלחה.</b> בודקים את הצעת המחיר (השורות כבר מולאו מהשאלון) ושולחים.<div class="row" style="margin-top:8px"><button class="btn sm primary" id="qSend">שליחת ההצעה בוואטסאפ</button><button class="btn sm" id="qSent">כבר שלחתי ✓</button></div></div>` : ''}
    ${o.quote_sent_at && o.q_submitted_at ? `<div class="small muted" style="margin-top:6px">ההצעה נשלחה ${fmtDT(o.quote_sent_at)}. השאלון נעול לעריכה.</div>` : ''}
    ${diff.length ? `<div class="note" style="margin-top:8px"><b>הלקוח שינה כמויות:</b><br>${diff.map(([p, a, b]) => `${esc(p.name.split(' (')[0])}: ${a} ← <b>${b}</b>`).join('<br>')}</div>` : ''}
    ${ups ? `<div class="small" style="margin-top:6px"><span class="chip blue">הלקוח הוסיף ${ups} תמונות</span> <button class="link-btn" data-opensec="photos">לצפייה</button></div>` : ''}
    ${o.q_unsure_type ? '<div class="note" style="margin-top:8px">הלקוח לא בטוח מה הסוג של חלק מהפריטים. לזהות לפי התמונות.</div>' : ''}
    ${c.invoice_business ? `<div class="small" style="margin-top:6px">חשבונית על שם עסק: <b>${esc(c.business_name || '')}</b> ${esc(c.business_id || '')}</div>` : ''}
    ${ans}</section>`;
}
async function editDate(ctx, k) {
  const f = await formModal('תיקון תאריך', `<label class="field">תאריך ושעה<input type="datetime-local" name="v" value="${toLocalInput(ctx.o[k])}"><span class="hint">משאירים ריק כדי למחוק את הסימון.</span></label>`);
  if (!f) return; const { error } = await sb.from('orders').update({ [k]: f.v ? new Date(f.v).toISOString() : null }).eq('id', ctx.o.id); fail(error); reloadDeal(ctx);
}
function bindDeal(ctx) {
  const { o, c } = ctx;
  $('#copyPhone') && ($('#copyPhone').onclick = async () => { const p = fmtPhone(c.phone); try { await navigator.clipboard.writeText(p); toast('הטלפון הועתק: ' + p); } catch { tell('הטלפון', p); } });
  bindAutosave(view(), (t, k, v) => afterSave(ctx, t, k, v));
  bindNext(ctx);
  bindPhotos(ctx);
  $$('details.sec').forEach(d => d.addEventListener('toggle', () => SEC_OPEN[o.id][d.open ? 'add' : 'delete'](d.dataset.sec)));
  $$('[data-step]').forEach(b => b.onclick = async () => { const s = STEPS[b.dataset.step]; if (s.key !== ctx.o.stage && await changeStage(ctx.o, s.key, c)) { delete SEC_OPEN[o.id]; reloadDeal(ctx); } });
  // Pipedrive won / lost: "שילם" runs the normal move to pickup (payment dialog, required details); "לא רלוונטי" asks why
  $('#wonBtn') && ($('#wonBtn').onclick = async () => { if (await changeStage(ctx.o, 'לתאם איסוף', c)) { delete SEC_OPEN[o.id]; reloadDeal(ctx); } });
  $('#lostBtn') && ($('#lostBtn').onclick = async () => { if (await changeStage(ctx.o, LOST, c)) reloadDeal(ctx); });
  $$('[data-opensec]').forEach(b => b.onclick = () => { const s = b.dataset.opensec, d = $(`[data-sec="${s}"]`); d.open = true; SEC_OPEN[o.id].add(s); d.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  // composer tabs + history filter
  $$('[data-ctab]').forEach(b => b.onclick = () => { $$('[data-ctab]').forEach(x => x.classList.toggle('on', x === b)); $$('[data-cbody]').forEach(x => x.classList.toggle('hidden', x.dataset.cbody !== b.dataset.ctab)); });
  const unclip = () => { $('#tl')?.classList.remove('clipped'); $('#histAll')?.remove(); };
  $('#histAll') && ($('#histAll').onclick = unclip);
  $$('[data-hf]').forEach(b => b.onclick = () => { $$('[data-hf]').forEach(x => x.classList.toggle('on', x === b)); const k = b.dataset.hf; if (k) unclip();
    $$('#tl li[data-kind]').forEach(li => li.classList.toggle('hidden', !!k && (k === 'stage' ? !['stage', 'followup'].includes(li.dataset.kind) : li.dataset.kind !== k))); });
  $('#revive') && ($('#revive').onclick = async () => { if (await changeStage(ctx.o, ctx.o.media_qty ? 'בפולואפ' : 'פנייה חדשה', c)) reloadDeal(ctx); });
  $('#waBtn').onclick = () => openWa(ctx);
  $('#qCopy') && ($('#qCopy').onclick = () => copyQLink(ctx));
  $('#qSend') && ($('#qSend').onclick = () => sendQuote(ctx));
  $('#qSent') && ($('#qSent').onclick = async () => { await markQuoteSent(ctx.o); reloadDeal(ctx); });
  $('#trackBtn') && ($('#trackBtn').onclick = async () => { const u = trackUrl(ctx.o); await navigator.clipboard.writeText(u).catch(() => {}); toast('הקישור הועתק. מדביקים אותו בוואטסאפ ללקוח'); });
  $('#moreBtn').onclick = e => { e.stopPropagation(); dropdown(e.currentTarget, [
    { label: 'שליחת הצעת המחיר בוואטסאפ', run: () => sendQuote(ctx) },
    ...(o.payment_status !== 'שולם' ? [{ label: 'קישור תשלום (SUMIT)', run: () => dealPayLink(ctx) }] : []),
    { label: 'SMS', sub: 'דרך SUMIT; אם לא יוצא, מוצע וואטסאפ', run: async () => { if (await smsModal(ctx.o, '', c.phone)) reloadDeal(ctx); } }, 'sep',
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
  $$('[data-sumit]').forEach(b => b.onclick = () => sumitAction(ctx, b.dataset.sumit));
  $$('[data-paylink], #payLinkBtn').forEach(b => b.onclick = () => dealPayLink(ctx));
  $$('[data-credit]').forEach(b => b.onclick = () => creditAction(ctx, b.dataset.credit));
  $$('[data-isave]').forEach(el => el.addEventListener('change', async () => {
    const [iid, col] = el.dataset.isave.split(':'); const v = el.type === 'checkbox' ? el.checked : (el.value || null);
    const { error } = await sb.from('items').update({ [col]: v }).eq('id', iid); fail(error); toast('נשמר');
    if (col === 'status') lightRefresh(ctx);
  }));
  // items: select many → one status for all
  const isel = () => $$('[data-isel]:checked').map(c => c.dataset.isel);
  const syncBulk = () => { const n = isel().length, bar = $('#ibulk'); if (!bar) return; bar.classList.toggle('hidden', !n); $('#ibulkN').textContent = `נבחרו ${n}`;
    const all = $('#iselAll'); all.checked = n && n === $$('[data-isel]').length; all.indeterminate = n > 0 && !all.checked; };
  $$('[data-isel]').forEach(c => c.onchange = syncBulk);
  $('#iselAll') && ($('#iselAll').onchange = e => { $$('[data-isel]').forEach(c => c.checked = e.target.checked); syncBulk(); });
  $('#ibulkClear') && ($('#ibulkClear').onclick = () => { $$('[data-isel]').forEach(c => c.checked = false); syncBulk(); });
  $('#ibulkGo') && ($('#ibulkGo').onclick = async () => { const ids = new Set(isel()); if (await bulkItemStatus(ctx.items.filter(i => ids.has(i.id)), $('#ibulkTo').value)) { SEC_OPEN[o.id].add('items'); reloadDeal(ctx); } });
  $('#ibulkDel') && ($('#ibulkDel').onclick = async () => {
    const ids = new Set(isel()), sel = ctx.items.filter(i => ids.has(i.id)), moved = sel.filter(i => i.status !== 'ממתין לאיסוף');
    if (moved.length) return tell('אי אפשר למחוק את הברקודים האלה', `${moved.map(i => i.id).join(', ')} כבר יצאו מהלקוח. מוחקים רק ברקודים בסטטוס "ממתין לאיסוף".`);
    if (!await ask(`למחוק ${sel.length} ברקודים?`, 'אם המדבקות כבר הודפסו, אל תשתמשו בהן. אפשר לבטל מיד אחרי.', { ok: 'מחיקה', danger: true })) return;
    const rows = sel.map(({ id, order_id, seq, product_id, label_text, damaged, notes, status }) => ({ id, order_id, seq, product_id, label_text, damaged, notes, status }));
    await reversible(`${sel.length} ברקודים נמחקו`,
      async () => { const { error } = await sb.from('items').delete().in('id', rows.map(r => r.id)).eq('status', 'ממתין לאיסוף'); fail(error); },
      async () => { const { error } = await sb.from('items').insert(rows); fail(error); }, () => reloadDeal(ctx));
    SEC_OPEN[o.id].add('items'); reloadDeal(ctx);
  });
  // after-section checks share the step-8 checklist
  $$('[data-body="after"] [data-chk]').forEach(b => b.onclick = () => runCheck(ctx, STEP_DONE().checks[Number(b.dataset.chk.slice(1))]));
  $$('[data-body="after"] [data-msedit]').forEach(b => b.onclick = () => editDate(ctx, b.dataset.msedit));
  $$('[data-body="after"] [data-unchk]').forEach(b => b.onclick = () => runUncheck(ctx, STEP_DONE().checks[Number(b.dataset.unchk.slice(1))]));
  // side
  $('#contacted') && ($('#contacted').onclick = async () => { await markContacted(ctx.o); reloadDeal(ctx); });
  $$('[data-fu]').forEach(b => b.onclick = async () => { const d = addDays(Number(b.dataset.fu)); const { error } = await sb.from('orders').update({ next_followup: d }).eq('id', o.id); fail(error); $$(`[data-save="orders:${o.id}:next_followup"]`).forEach(i => i.value = d); toast('נחזור ללקוח ב-' + fmtDate(d)); });
  // journal notes: edit in place, delete (hidden, restorable) — both with undo/redo
  const noteRpc = (fn, args) => async () => { const { error } = await sb.rpc(fn, args); fail(error); };
  $$('[data-evdel]').forEach(b => b.onclick = () => { const id = Number(b.dataset.evdel);
    reversible('ההערה נמחקה', noteRpc('set_note_deleted', { p_id: id, p_deleted: true }), noteRpc('set_note_deleted', { p_id: id, p_deleted: false }), () => reloadDeal(ctx)).then(() => reloadDeal(ctx)); });
  $$('[data-evedit]').forEach(b => b.onclick = () => {
    const id = Number(b.dataset.evedit), ev = ctx.events.find(x => x.id === id), box = $(`[data-ev="${id}"] .ev-t`);
    box.innerHTML = `<form class="row nowrap"><input value="${esc(ev.new_value || '')}" required><button class="btn sm primary">שמירה</button><button type="button" class="btn sm ghost">ביטול</button></form>`;
    const f = $('form', box), inp = $('input', f); inp.focus(); inp.select();
    $('button[type=button]', f).onclick = () => { box.innerHTML = evText(ev); };
    f.onsubmit = async e => { e.preventDefault(); const t = inp.value.trim(), old = ev.new_value; if (!t || t === old) { box.innerHTML = evText(ev); return; }
      await reversible('ההערה עודכנה', noteRpc('edit_note', { p_id: id, p_text: t }), noteRpc('edit_note', { p_id: id, p_text: old }), () => reloadDeal(ctx)); reloadDeal(ctx); };
  });
  $('#noteForm').onsubmit = async e => { e.preventDefault(); const t = new FormData(e.target).get('t');
    let nid = null; // first time: add; redo after undo: bring the same note back
    await reversible('ההערה נוספה', async () => { if (nid) return noteRpc('set_note_deleted', { p_id: nid, p_deleted: false })(); const { data, error } = await sb.rpc('add_note', { p_order: o.id, p_text: t }); fail(error); nid = data; },
      () => noteRpc('set_note_deleted', { p_id: nid, p_deleted: true })(), () => reloadDeal(ctx));
    reloadDeal(ctx); };
}
async function deleteOrder(o) {
  const f = await formModal('מחיקת הזמנה ' + o.id, `<p>הפעולה לא ניתנת לביטול: נמחקים ההזמנה, הצעת המחיר והברקודים. הלקוח עצמו נשאר.</p><label class="field">כדי לאשר, מקלידים את מספר ההזמנה<input name="n" required inputmode="numeric"></label>`, { ok: 'מחיקה סופית' });
  if (!f) return; if (f.n.trim() !== String(o.id)) return tell('לא נמחק', 'המספר לא תאם.');
  const { error } = await sb.from('orders').delete().eq('id', o.id); fail(error); toast('ההזמנה נמחקה'); go('deals');
}
