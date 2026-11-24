/* CRM המעבדה v3 — core: utilities, dialogs, data, auth, router, top bar.
   Screens live in: steps.js (process), queue.js, deals.js, deal.js, ops.js (scan/lab/print/track), more.js (reports/expenses/settings).
   No build step: plain scripts sharing the global scope, loaded in order by index.html. */
'use strict';
const sb = supabase.createClient(CRM_CONFIG.url, CRM_CONFIG.key);
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const view = () => $('#view');
const S = { settings: {}, opts: {}, products: [], labs: [], tiers: [], coupons: [], user: null, me: null };
const VIEWS = {};
/** Embed mode (?embed): the customer page inside the sales dashboard's side panel. No top bar; every save tells the dashboard to refresh. */
const EMBED = new URLSearchParams(location.search).has('embed') && window.parent !== window;
if (EMBED) {
  document.documentElement.classList.add('embed');
  const f = window.fetch.bind(window);
  let t = null;
  window.fetch = async (...a) => {
    const r = await f(...a);
    const m = (a[1]?.method || a[0]?.method || 'GET').toUpperCase();
    // reads go through GET, and v_orders/rpc reads through POST only for rpc; notify on every write-ish call
    if (m !== 'GET' && m !== 'HEAD' && !/\/auth\//.test(String(a[0]?.url || a[0]))) { clearTimeout(t); t = setTimeout(() => window.parent.postMessage({ crm: 'changed' }, location.origin), 400); }
    return r;
  };
}
const isLab = () => S.me?.role === 'lab';
const isAdmin = () => S.me?.role === 'admin';

// ---------- utils ----------
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => (n == null || n === '' || isNaN(n)) ? '' : '₪' + Number(n).toLocaleString('he-IL', { maximumFractionDigits: Number(n) % 1 ? 2 : 0 });
const tzShift = () => new Date().getTimezoneOffset() * 60000;
const today = () => new Date(Date.now() - tzShift()).toISOString().slice(0, 10);
const addDays = n => new Date(Date.now() + n * 864e5 - tzShift()).toISOString().slice(0, 10);
/** days until the coming weekday (0 = Sunday … 6 = Saturday); on that weekday itself, next week's */
const daysTo = wd => (wd - new Date().getDay() + 7) % 7 || 7;
const fmtDate = d => d ? new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' }) : '';
const fmtShort = d => d ? new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }) : '';
const fmtDT = d => d ? new Date(d).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const toLocalInput = d => d ? new Date(new Date(d).getTime() - tzShift()).toISOString().slice(0, 16) : '';
const fmtPhone = p => { const d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d.length === 9 ? `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}` : (p || ''); };
/** WhatsApp link for any stored phone format (050…, 972…, +972…, 00972…) */
const waNum = phone => { const d = String(phone || '').replace(/\D/g, '').replace(/^00/, ''); return d.startsWith('972') ? d : '972' + d.replace(/^0/, ''); };
const waLink = (phone, text) => 'https://wa.me/' + waNum(phone) + (text ? '?text=' + encodeURIComponent(text) : '');
/** a timestamp's day in Israel (reports count months by it, not by UTC) */
const ilDay = d => d ? new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }) : '';
const firstName = n => String(n || '').trim().split(/\s+/)[0] || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const daysSince = d => d ? Math.floor((Date.now() - new Date(d)) / 864e5) : null;
/** "היום" / "אתמול" / "לפני 5 ימים" */
const ago = d => { if (!d) return ''; const n = daysSince(d); if (n <= 0) { const h = Math.floor((Date.now() - new Date(d)) / 36e5); return h < 1 ? 'לפני רגע' : `לפני ${h} שע'`; } return n === 1 ? 'אתמול' : `לפני ${n} ימים`; };
const until = d => { const n = -daysSince(d + 'T00:00'); return n === 0 ? 'היום' : n === 1 ? 'מחר' : n > 1 ? `בעוד ${n} ימים` : n === -1 ? 'אתמול' : `לפני ${-n} ימים`; };
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const custName = r => r.full_name || fmtPhone(r.phone) || 'ללא שם';
const plural = (n, one, many) => n === 1 ? one : `${n} ${many}`;

// ---------- toast (with optional undo) ----------
function toast(msg, { ms = 2400, undo, label = 'ביטול' } = {}) {
  const t = $('#toast'); t.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button type="button">${esc(label)}</button>` : ''}`;
  t.classList.remove('hidden'); clearTimeout(t._h);
  if (undo) $('button', t).onclick = () => { t.classList.add('hidden'); undo(); };
  t._h = setTimeout(() => t.classList.add('hidden'), undo ? 6000 : ms);
}
// ---------- double-click guard ----------
// A save, payment, invoice or stage button pressed twice within 1.2s runs once (a double click must never create two
// invoices, payment links, promotions or shipments). Quantity steppers and plain toggles are not affected.
const ONCE_SEL = 'form button:not([type=button]), [data-sumit], [data-paylink], #advance, #wonBtn, #lostBtn, .btn.primary, .btn.solid';
const ONCE_MS = 1200;
function onceGuard(el, e) {
  if (!el) return;
  const now = Date.now();
  if (Number(el.dataset.busyUntil || 0) > now) { e.preventDefault(); e.stopImmediatePropagation(); return; }
  el.dataset.busyUntil = now + ONCE_MS;
}
document.addEventListener('click', e => onceGuard(e.target.closest?.(ONCE_SEL), e), true);
document.addEventListener('submit', e => onceGuard(e.target, e), true);
function fail(error) {
  if (!error) return;
  console.error(error);
  if (/JWT|jwt expired|401/.test(error.message || '') || error.code === 'PGRST301') { showLogin('החיבור פג. נכנסים שוב.'); throw error; }
  toast('משהו נכשל: ' + (error.message || error), { ms: 5000 }); throw error;
}

// ---------- dialogs ----------
function modal(html, { wide = false } = {}) { $('#modal').classList.toggle('wide', wide); $('#modalBody').innerHTML = html; if (!$('#modal').open) $('#modal').showModal(); return $('#modalBody'); }
function closeModal() { if ($('#modal').open) $('#modal').close(); }
function ask(title, msg = '', { ok = 'כן', cancel = 'ביטול', danger = false } = {}) {
  return new Promise(res => {
    const b = modal(`<h2>${esc(title)}</h2>${msg ? `<p style="white-space:pre-line">${esc(msg)}</p>` : ''}
      <div class="actions"><button class="btn ${danger ? 'danger solid' : 'primary'}" id="dOk">${esc(ok)}</button><button class="btn" id="dNo">${esc(cancel)}</button></div>`);
    const done = v => { closeModal(); res(v); };
    $('#dOk', b).onclick = () => done(true); $('#dNo', b).onclick = () => done(false);
    $('#modal').addEventListener('cancel', () => res(false), { once: true });
    setTimeout(() => $('#dOk', b)?.focus(), 30);
  });
}
function formModal(title, fieldsHtml, { ok = 'שמירה', intro = '', wide = false } = {}) {
  return new Promise(res => {
    const b = modal(`<h2>${esc(title)}</h2>${intro ? `<p class="muted" style="margin-bottom:12px">${intro}</p>` : ''}<form id="fm" class="grid">${fieldsHtml}
      <div class="actions"><button class="btn primary">${esc(ok)}</button><button type="button" class="btn" id="fmNo">ביטול</button></div></form>`, { wide });
    $('#fm', b).onsubmit = e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); closeModal(); res(f); };
    $('#fmNo', b).onclick = () => { closeModal(); res(null); };
    $('#modal').addEventListener('cancel', () => res(null), { once: true });
    setTimeout(() => $('#fm input, #fm select, #fm textarea', b)?.focus(), 30);
  });
}
const tell = (title, msg) => ask(title, msg, { ok: 'הבנתי', cancel: 'סגירה' });

/** small dropdown menu anchored to a button. items: [{label, sub, run, danger}] or 'sep' or {head} */
function dropdown(btn, items) {
  closeMenus();
  const m = document.createElement('div'); m.className = 'menu'; m.setAttribute('role', 'menu');
  m.innerHTML = items.map((it, i) => it === 'sep' ? '<div class="sep"></div>' : it.head ? `<div class="label">${esc(it.head)}</div>`
    : `<button type="button" role="menuitem" data-i="${i}" class="${it.danger ? 'danger' : ''}">${esc(it.label)}${it.sub ? `<span class="prev">${esc(it.sub)}</span>` : ''}</button>`).join('');
  btn.closest('.dd').appendChild(m);
  m.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; closeMenus(); items[b.dataset.i].run(); });
  setTimeout(() => document.addEventListener('click', closeMenus, { once: true }), 0);
}
function closeMenus() { $$('.menu').forEach(m => m.remove()); }

// ---------- reference data ----------
function opts(list, cur, { empty = true, emptyLabel = '' } = {}) {
  const arr = (S.opts[list] || []).filter(o => o.active || o.value === cur);
  return (empty ? `<option value="">${esc(emptyLabel)}</option>` : '') + arr.map(o => `<option ${o.value === cur ? 'selected' : ''}>${esc(o.value)}</option>`).join('');
}
const productName = id => S.products.find(p => p.id === id)?.name || '';
const setting = k => S.settings[k]?.value != null ? Number(S.settings[k].value) : null;
const trackUrl = o => ((S.settings.public_url?.text_value || '').trim() || (location.origin + location.pathname)).replace(/#.*$/, '') + '#track/' + o.track_token;
async function loadRef() {
  const q = [sb.from('settings').select('*').order('sort'), sb.from('options').select('*').order('sort'), sb.from('products').select('*').order('sort'),
    sb.from('labs').select('*').order('name'), sb.from('discount_tiers').select('*').order('min_items'), sb.from('coupons').select('*').order('code'),
    sb.from('package_items').select('*'), sb.from('promotions').select('*').order('starts_on', { ascending: false }),
    sb.from('orders').select('id').eq('is_test', true)];
  const r = await Promise.all(q); r.forEach(x => fail(x.error));
  const [st, op, pr, lb, tr, cp, pi, pm, tests] = r.map(x => x.data);
  S.pkgItems = pi; S.promos = pm;
  // test orders (orders.is_test) stay out of lists, tasks and reports unless "show test orders" is on in the user menu
  S.testIds = new Set(tests.map(x => x.id)); S.showTests = lsGet('showTests') === 'on';
  S.settings = Object.fromEntries(st.map(x => [x.key, x]));
  S.opts = {}; op.forEach(o => (S.opts[o.list] ||= []).push(o));
  S.products = pr; S.labs = lb; S.tiers = tr; S.coupons = cp;
}
/** false for a test order while test orders are hidden */
const realOrder = id => S.showTests || !S.testIds?.has(id);
async function getOrders(filter) {
  let q = sb.from('v_orders').select('*').order('id', { ascending: false });
  if (filter) q = filter(q);
  const { data, error } = await q; fail(error);
  // the questionnaire/quote columns for exactly these orders, in chunks (a URL holds ~200 ids; a query returns at most 1000 rows)
  const ids = data.map(o => o.id), m = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const qa = await sb.from('orders').select(Q_COLS).in('id', ids.slice(i, i + 200)); fail(qa.error);
    qa.data.forEach(x => m.set(x.id, x));
  }
  data.forEach(o => Object.assign(o, m.get(o.id)));
  if (data.length >= 1000) toast('מוצגות רק 1000 ההזמנות האחרונות. צמצמו בחיפוש או בסינון', { ms: 6000 });
  return data.filter(o => realOrder(o.id) && (S.showTests || !o.is_test));
}
const getOrder = async id => { const [{ data, error }, qa] = await Promise.all([sb.from('v_orders').select('*').eq('id', id).single(), sb.from('orders').select(Q_COLS).eq('id', id).single()]); fail(error); fail(qa.error); return Object.assign(data, qa.data); };
// ---------- onboarding questionnaire (q.html#<q_token>, spec crm/אפיון-שאלון-אונבורדינג.md) ----------
// its columns are not in v_orders, so every order read merges them in from orders
const Q_COLS = 'id,q_token,q_opened_at,q_saved_at,q_submitted_at,q_progress,q_initial_lines,q_qty_changed_at,q_unsure_type,storage_place,mold,delivery_method,cloud_type,terms_accepted_at,quote_sent_at,q_sent_at,'
  + 'quote_token,quote_version,quote_valid_until,quote_expired_at,quote_views,quote_first_view_at,quote_last_view_at,quote_pay_clicked_at,quote_accepted_at,quote_accepted_name,quote_addons,actions_done,is_test';
const pageUrl = (file, token) => ((S.settings.public_url?.text_value || '').trim() || (location.origin + location.pathname)).replace(/#.*$/, '').replace(/[^/]*$/, '') + file + '#' + token;
const qUrl = o => pageUrl('q.html', o.q_token);
// ---------- quote link (p.html#<quote_token>, spec crm/אפיון-הצעת-מחיר.md) ----------
const pUrl = o => pageUrl('p.html', o.quote_token);
/** the customer reached the pay button of the quote page and did not pay */
const quoteAlmost = o => !!o.quote_pay_clicked_at && o.payment_status !== 'שולם' && phaseOf(o.stage) === 'sales';
/** the customer sent the form and nobody has sent them the quote yet */
const quotePending = o => !!o.q_submitted_at && !o.quote_sent_at && phaseOf(o.stage) === 'sales';
/** columns the orders_aq_marks trigger may change with a mark (stage move + follow-up), so undo puts them back */
const Q_MARK_EXTRA = ['stage', 'stage_changed_at', 'next_followup', 'next_followup_time', 'followup_note', 'followup_channel'];
/** the questionnaire link went to the customer. Keeps the first date. The DB moves early leads to "בפולואפ" and sets a 2-day follow-up */
async function markQSent(o, msg = 'סומן: השאלון נשלח ללקוח. פולו-אפ בעוד יומיים') {
  if (o.q_sent_at) return false;
  await patchOrder(o, { q_sent_at: new Date().toISOString() }, msg, { extra: Q_MARK_EXTRA }); return true;
}
/** where the questionnaire stands, in a few words: '' | not opened | started X% | filled */
const qState = o => o.q_submitted_at ? 'מילא את השאלון' : o.q_opened_at ? `התחיל למלא · ${o.q_progress || 0}%` : o.q_sent_at ? 'עוד לא נפתח' : '';
function qChip(o) {
  if (quotePending(o)) return '<span class="chip orange" data-tip="הלקוח מילא את השאלון. בודקים את ההצעה ושולחים">לשלוח הצעה</span>';
  if (quoteAlmost(o)) return `<span class="chip orange" data-tip="הלקוח הגיע לכפתור התשלום בדף ההצעה ולא שילם (${esc(fmtDT(o.quote_pay_clicked_at))})">כמעט סגר</span>`;
  if (o.stage === 'הצעה נשלחה' && o.quote_expired_at) return '<span class="chip" data-tip="תוקף ההצעה עבר: ההנחות ירדו. אפשר לחדש תוקף בדף העסקה">תוקף ההצעה עבר</span>';
  if (o.stage === 'הצעה נשלחה' && o.quote_views > 0) return `<span class="chip blue" data-tip="צפייה אחרונה ${esc(fmtDT(o.quote_last_view_at))}">צפה בהצעה ×${o.quote_views}</span>`;
  if (o.q_opened_at && !o.q_submitted_at && phaseOf(o.stage) === 'sales') return `<span class="chip" data-tip="הלקוח התחיל למלא את השאלון">שאלון ${o.q_progress || 0}%</span>`;
  if (o.stage === 'בפולואפ' && o.q_sent_at && !o.q_opened_at) return `<span class="chip blue" data-tip="השאלון נשלח ועוד לא נפתח">✓ שאלון ${fmtShort(o.q_sent_at)}</span>`;
  if (o.stage === 'הצעה נשלחה' && o.quote_sent_at) return `<span class="chip blue" data-tip="ההצעה נשלחה ללקוח">✓ הצעה ${fmtShort(o.quote_sent_at)}</span>`;
  return '';
}
/** Undo + redo for any action: runs apply(), then the toast offers "ביטול" (revert) and after that "החזרה" (apply again), back and forth. */
async function reversible(msg, apply, revert, refresh = route) {
  await apply();
  const offerUndo = () => toast(msg, { undo: async () => { await revert(); await refresh(); offerRedo(); } });
  const offerRedo = () => toast('בוטל, חזר למצב הקודם', { label: 'החזרה', undo: async () => { await apply(); await refresh(); offerUndo(); } });
  offerUndo();
}
const upd = (table, patch, col, val) => async () => { const { error } = await (Array.isArray(val) ? sb.from(table).update(patch).in(col, val) : sb.from(table).update(patch).eq(col, val)); fail(error); };
/** Update an order with undo/redo. extra = columns a database trigger may also change, so undo puts them back too. */
async function patchOrder(o, patch, msg, { extra = [] } = {}) {
  const prev = Object.fromEntries([...Object.keys(patch), ...extra].map(k => [k, o[k] ?? null]));
  if (!msg) return upd('orders', patch, 'id', o.id)();
  await reversible(msg, upd('orders', patch, 'id', o.id), upd('orders', prev, 'id', o.id));
}
const finishIntake = (id, msg = 'הקליטה הסתיימה', refresh = route) => reversible(msg, async () => { const { error } = await sb.rpc('finish_intake', { p_order: id }); fail(error); }, upd('orders', { intake_done_at: null }, 'id', id), refresh);
const markContacted = (o, msg = 'נרשם שדיברנו') => patchOrder(o, { last_contact_at: new Date().toISOString() }, msg);

/** SMS through SUMIT. If it can't go out (package used up, no sender, SUMIT down, bad number), the same text is offered in WhatsApp.
 *  Returns 'sms', 'wa' or null. The fallback asks for one click, because a browser only opens WhatsApp from a click. */
const SMS_BUSY = new Set();
async function sendSms(o, text, phone = o.phone) {
  if (SMS_BUSY.has(o.id)) return null;
  SMS_BUSY.add(o.id);
  try {
    toast('שולח SMS…', { ms: 6000 });
    const { data, error } = await sb.functions.invoke('sumit-payment', { body: { order_id: o.id, action: 'sms', text } });
    if (data?.ok) {
      await sb.from('orders').update({ last_contact_at: new Date().toISOString() }).eq('id', o.id); // the SMS event is logged by the server
      toast('ה-SMS נשלח'); return 'sms';
    }
    if (data?.error && !data?.fallback) { toast(data.error, { ms: 5000 }); return null; }
    const reason = data?.reason || error?.message || 'שגיאה לא ידועה';
    const ok = await ask('ה-SMS לא נשלח', `${reason}${data?.cached ? '\n(ה-SMS סומן כלא זמין לשעה הקרובה, אחרי תקלה קודמת.)' : ''}\n\nלשלוח את אותה הודעה בוואטסאפ?`, { ok: 'פתיחה בוואטסאפ', cancel: 'לא לשלוח' });
    if (!ok) return null;
    window.open(waLink(phone, text), '_blank', 'noopener');
    await markContacted(o, 'ה-SMS לא יצא, ההודעה נשלחה בוואטסאפ');
    return 'wa';
  } finally { SMS_BUSY.delete(o.id); }
}
/** a message box with SMS as the main button; the text starts from the given draft */
async function smsModal(o, text, phone = o.phone) {
  const f = await formModal('SMS ל' + custName(o), `<label class="field">ההודעה<textarea name="m" rows="6" maxlength="600">${esc(text || '')}</textarea>
    <span class="hint">יוצא דרך SUMIT מהחבילה של העסק. אם ה-SMS לא יוצא (נגמרה החבילה או כל תקלה אחרת), תוצע אותה הודעה בוואטסאפ.</span></label>`, { ok: 'שליחת SMS' });
  return f ? sendSms(o, f.m, phone) : null;
}

// ---------- field autosave with visible state ----------
/** Saves on change. Each element: data-save="table:id:column". Shows "שומר… / ✓ נשמר / לא נשמר" in its label. */
function bindAutosave(root, after) {
  const cur = el => el.type === 'checkbox' ? el.checked : el.value;
  $$('[data-save]', root).forEach(el => { el._prev = cur(el); el.addEventListener('change', async () => {
    const before = el._prev;
    const [table, id, col] = el.dataset.save.split(':');
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'datetime-local') v = v ? new Date(v).toISOString() : null;
    else if (v === '') v = el.dataset.zero != null ? 0 : null;
    else if (el.type === 'number' || el.dataset.num != null) v = Number(v);
    const host = el.closest('.field, .toggle, label') || el.parentElement;
    let st = $(':scope > .save-state', host); if (!st) { st = document.createElement('span'); st.className = 'save-state'; host.appendChild(st); }
    st.className = 'save-state busy'; st.textContent = 'שומר…';
    const keyCol = table === 'settings' ? 'key' : table === 'coupons' ? 'code' : table === 'staff' ? 'email' : 'id';
    const { error } = await sb.from(table).update({ [col]: v }).eq(keyCol, keyCol === 'id' ? Number(id) : id);
    if (error) { st.className = 'save-state err'; st.textContent = 'לא נשמר'; toast('השמירה נכשלה: ' + error.message, { ms: 5000 }); return; }
    el._prev = cur(el);
    // field-level undo: put the previous value back (it saves again through this same handler)
    st.className = 'save-state ok'; st.innerHTML = '✓ נשמר <button type="button" class="link-btn">ביטול</button>';
    $('button', st).onclick = e => { e.preventDefault(); e.stopPropagation(); if (el.type === 'checkbox') el.checked = before; else el.value = before; el.dispatchEvent(new Event('change')); };
    clearTimeout(st._h); st._h = setTimeout(() => st.textContent = '', 8000);
    after?.(table, col, v, el);
  }); });
}

// ---------- auth ----------
async function boot() {
  applyTheme();
  if (location.hash.startsWith('#track/')) return VIEWS.track(location.hash.split('/')[1]);
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showLogin();
  S.user = session.user;
  const { data: me, error: meErr } = await sb.rpc('me');
  if (meErr) { view().innerHTML = ''; return showLogin('אין חיבור לשרת כרגע. בודקים את האינטרנט ומנסים שוב.'); }
  if (!me) return showLogin('המייל הזה עוד לא מורשה. מנהל צריך להוסיף אותו בהגדרות ← צוות.');
  S.me = me;
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  $$('[data-staff]').forEach(el => el.classList.toggle('hidden', isLab()));
  buildNav();
  $('#userBtn').textContent = (S.me.name || S.user.email || '?').trim()[0].toUpperCase();
  await loadRef();
  if (isLab() && !/^#(lab|scan)/.test(location.hash)) location.hash = 'lab';
  await route();
  if (!isLab() && !EMBED) customerEvents();
}
/** what customers do on their pages (order_events kinds 'quote' and 'alert', via Realtime). No pop-ups (user decision):
 *  an open deal page refreshes, and listeners (the Today screen's activity strip) get the event. */
let custChan = null; const CUST_EVENT_FNS = new Set();
function customerEvents() {
  if (custChan || !sb.channel) return;
  custChan = sb.channel('customer-events').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_events' }, ({ new: ev }) => {
    if (!['quote', 'alert'].includes(ev.kind)) return;
    CUST_EVENT_FNS.forEach(fn => { try { fn(ev); } catch (e) { console.error(e); } });
    if (location.hash === '#order/' + ev.order_id) route();
  }).subscribe();
}
function showLogin(msg = '') { $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); $('#loginMsg').textContent = msg; }
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  $('#loginMsg').textContent = 'נכנס…';
  const { error } = await sb.auth.signInWithPassword({ email: String(f.get('email')).trim().toLowerCase(), password: f.get('password') });
  if (error) return $('#loginMsg').textContent = /invalid/i.test(error.message) ? 'המייל או הסיסמה לא נכונים.' : 'הכניסה נכשלה: ' + error.message;
  boot();
});

// ---------- theme ----------
// default is dark (chosen 2026-11-19); '' = follow the device
const themePref = () => { const t = lsGet('theme'); return t === null ? 'dark' : t; };
function applyTheme() { const t = themePref(); if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }

// ---------- nav ----------
const ICONS = {
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  sales: '<path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/>',
  queue: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
  deals: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M16 4a4 4 0 0 1 0 8M22 21c0-3-2-5-4-5.5"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M11 8v8M15 8v8M18 8v8"/>',
  reports: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  expenses: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  shipments: '<path d="M1 4h14v11H1z"/><path d="M15 8h4l3 3v4h-7z"/><circle cx="5.5" cy="17.5" r="2"/><circle cx="18.5" cy="17.5" r="2"/>',
  lab: '<path d="M9 3h6M10 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/>',
};
const icon = k => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ''}</svg>`;
function buildNav() {
  const items = isLab() ? [['lab', 'ההזמנות שלי', 'lab'], ['scan', 'סריקה', 'scan']]
    : [['today', 'היום', 'today'], ['sales', 'מכירות', 'sales'], ['deals', 'לקוחות', 'deals'], ['scan', 'סריקה', 'scan'], ['shipments', 'משלוחים', 'shipments'], ['reports', 'דוחות', 'reports'], ['expenses', 'הוצאות', 'expenses'], ['settings', 'הגדרות', 'settings']];
  $('#nav').innerHTML = items.map(([r, t, ic]) => `<a href="#${r}" data-r="${r}" ${NAV_PHONE.includes(r) ? 'data-phone' : ''}>${icon(ic)}<span class="t">${t}</span></a>`).join('')
    + (isLab() ? '' : `<div class="dd nav-more"><button type="button" id="navMore" aria-label="עוד מסכים">${icon('more')}<span class="t">עוד</span></button></div>`);
  // phones show Today · Customers · Scan; the rest is under "עוד" (user decision 2026-11-25)
  $('#navMore') && ($('#navMore').onclick = e => { e.stopPropagation(); dropdown(e.currentTarget, items.filter(([r]) => !NAV_PHONE.includes(r)).map(([r, t]) => ({ label: t, run: () => go(r) }))); });
}
const NAV_PHONE = ['today', 'deals', 'scan'];
// the page title lives in the top bar (Pipedrive style); pages start with their toolbar
const PAGE_TITLE = { today: 'היום', sales: 'מכירות', deals: 'לקוחות', scan: 'סריקת פריטים', reports: 'דוחות', expenses: 'הוצאות', settings: 'הגדרות', lab: 'ההזמנות שלי', quote: 'הצעת מחיר', labels: 'מדבקות ברקוד', manifest: 'דף משלוח', boxlabel: 'מדבקת ארגז', shipments: 'משלוחים', shipment: 'משלוח', labbills: 'חשבונות מעבדות', 'quote-edit': 'עריכת הצעת מחיר' };
function setNav(r) { $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === r)); $('#pageTitle').textContent = PAGE_TITLE[r] || (VIEWS[r] ? PAGE_TITLE.deals : PAGE_TITLE.today); }
$('#userBtn').addEventListener('click', e => {
  e.stopPropagation();
  const t = themePref();
  dropdown(e.currentTarget, [{ head: S.me?.name || S.user?.email || '' },
    { label: S.showTests ? 'הסתרת הזמנות בדיקה' : 'הצגת הזמנות בדיקה', run: () => { lsSet('showTests', S.showTests ? 'off' : 'on'); S.showTests = !S.showTests; route(); } },
    { label: t === 'dark' ? 'מצב בהיר' : t === 'light' ? 'מצב לפי המכשיר' : 'מצב כהה', run: () => { lsSet('theme', t === 'dark' ? 'light' : t === 'light' ? '' : 'dark'); applyTheme(); } },
    'sep', { label: 'יציאה', run: async () => { await sb.auth.signOut(); location.hash = ''; location.reload(); } }]);
});

// ---------- router ----------
window.addEventListener('hashchange', route);
let routeBusy = false, routeAgain = false;
async function route() {
  routeAgain = true;
  if (routeBusy) return;
  routeBusy = true;
  try { while (routeAgain) { routeAgain = false; await routeOnce(); } } finally { routeBusy = false; }
}
const ALIAS = { queue: 'today', leads: 'deals', orders: 'deals', dash: 'reports', finance: 'expenses' };
let _lastHash = null;
async function routeOnce() {
  if (location.hash.startsWith('#track/')) return VIEWS.track(location.hash.split('/')[1]);
  if (!S.user) return;
  $('.topbar').classList.remove('hidden'); $('#app').classList.remove('public');
  let [r, arg] = (location.hash.slice(1) || (isLab() ? 'lab' : 'today')).split('/');
  r = ALIAS[r] || r;
  if (isLab() && !['lab', 'scan'].includes(r)) { location.hash = 'lab'; return; }
  setNav(r === 'order' || r === 'quote-edit' ? 'deals' : r === 'shipment' ? 'shipments' : r === 'labbills' ? 'expenses' : r);
  if (['quote', 'labels', 'manifest', 'boxlabel', 'shipment', 'labbills', 'quote-edit'].includes(r)) $('#pageTitle').textContent = PAGE_TITLE[r];
  VIEWS.stopScanner?.();
  closeMenus();
  if (r !== 'sales') $('#salesPanel')?.remove();
  // same page refreshed after a save: keep the scroll position and skip the "loading" flash
  const same = location.hash === _lastHash; _lastHash = location.hash;
  const y = window.scrollY;
  if (!same) view().innerHTML = '<div class="loading"><span class="spin"></span> טוען…</div>';
  try {
    const fn = VIEWS[r] || VIEWS.today;
    await fn(arg);
    if (!routeAgain) window.scrollTo(0, same ? y : 0);
  } catch (e) { console.error(e); view().innerHTML = `<div class="err">הדף לא נטען: ${esc(e.message)}. נסו לרענן.</div>`; }
}
const go = h => { if (location.hash === '#' + h) route(); else location.hash = h; };

// ---------- global search ----------
$('#searchForm').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('#searchInput').value.trim(); if (!q) return;
  $('#searchInput').blur();
  if (/^\d{3,6}-\d{1,3}$/.test(q)) {
    const { data } = await sb.from('items').select('id, order_id, status').eq('id', q).maybeSingle();
    if (data) { go('order/' + data.order_id); toast(`פריט ${data.id}: ${data.status}`); return; }
  }
  if (/^\d{3,6}$/.test(q)) { const { data } = await sb.from('orders').select('id').eq('id', q).maybeSingle(); if (data) { go('order/' + data.id); return; } }
  const digits = q.replace(/\D/g, '');
  let cq = sb.from('customers').select('id, full_name, phone, city').limit(20);
  cq = digits.length >= 4 ? cq.like('phone', `%${digits.replace(/^972/, '0').replace(/^0?/, '')}%`) : cq.ilike('full_name', `%${q}%`);
  const { data: cust, error } = await cq; fail(error);
  if (!cust.length) return tell('לא נמצא', `אין תוצאות ל"${q}".\nאפשר לחפש שם, טלפון, מספר הזמנה (למשל 1001) או ברקוד (למשל 1001-03).`);
  const { data: ords } = await sb.from('v_orders').select('id, customer_id, stage, total, created_at').in('customer_id', cust.map(c => c.id)).order('id', { ascending: false });
  if (ords.length === 1) { go('order/' + ords[0].id); return; }
  const b = modal(`<h2>נמצאו ${ords.length} תוצאות</h2><div class="card flush"><table><tbody>${cust.map(c => ords.filter(o => o.customer_id === c.id).map(o => `
    <tr class="click" data-go="${o.id}"><td><b>${esc(c.full_name || fmtPhone(c.phone))}</b><span class="sub">${esc(fmtPhone(c.phone))}${c.city ? ' · ' + esc(c.city) : ''}</span></td>
    <td>${stagePill(o.stage)}</td><td class="num">${money(o.total)}</td><td class="muted small">#${o.id}</td></tr>`).join('')).join('')}</tbody></table></div>
    <div class="actions"><button class="btn" id="srClose">סגירה</button></div>`, { wide: true });
  $$('[data-go]', b).forEach(tr => tr.onclick = () => { closeModal(); go('order/' + tr.dataset.go); });
  $('#srClose', b).onclick = closeModal;
});

// ---------- new inquiry ----------
/** new lead (the "+ ליד" button in the sales and customers toolbars, user decision 2026-11-25) */
async function newLead() {
  const f = await formModal('פנייה חדשה', `
    <label class="field">טלפון <span class="req">*</span><input name="phone" type="tel" required inputmode="tel" placeholder="050-0000000"></label>
    <label class="field">שם<input name="name" placeholder="שם פרטי ומשפחה"></label>
    <label class="field">מאיפה הגיע<select name="source">${opts('source', '', { emptyLabel: 'לא ידוע' })}</select></label>
    <label class="field">מה יש לו / הערה<textarea name="note" rows="3" placeholder="למשל: 20 קלטות VHS של החתונה"></textarea></label>`,
    { ok: 'יצירה ומעבר ללקוח', intro: 'אם הטלפון כבר קיים אצלנו עם פנייה פתוחה, ההערה תתווסף אליה ולא תיווצר כפילות.' });
  if (!f) return;
  const { data, error } = await sb.rpc('upsert_lead', { p_phone: f.phone, p_name: f.name || null, p_source: f.source || null, p_note: f.note || null });
  fail(error); toast('נשמר. פנייה #' + data); go('order/' + data);
}
document.addEventListener('click', e => { if (e.target.closest?.('[data-newlead]')) newLead(); });

// ---------- PWA ----------
// the customer's tracking page is not the staff app: no install, no cached staff files on the customer's phone
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !location.hash.startsWith('#track/')) {
  const hadSw = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // a new version took over while the app is open: offer a refresh (old code against a new database is how bugs happen)
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadSw) toast('יש גרסה חדשה של ה-CRM', { label: 'רענון', undo: () => location.reload(), ms: 60000 }); });
}
sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT' && S.user) { S.user = null; showLogin('החיבור פג. נכנסים שוב.'); } });
