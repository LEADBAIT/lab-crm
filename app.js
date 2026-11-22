/* CRM המעבדה v3 — core: utilities, dialogs, data, auth, router, top bar.
   Screens live in: steps.js (process), queue.js, deals.js, deal.js, ops.js (scan/lab/print/track), more.js (reports/expenses/settings).
   No build step: plain scripts sharing the global scope, loaded in order by index.html. */
'use strict';
const sb = supabase.createClient(CRM_CONFIG.url, CRM_CONFIG.key);
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const view = () => $('#view');
const S = { settings: {}, opts: {}, products: [], labs: [], tiers: [], coupons: [], templates: [], user: null, me: null };
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
const waLink = (phone, text) => 'https://wa.me/972' + String(phone || '').replace(/\D/g, '').replace(/^0/, '') + (text ? '?text=' + encodeURIComponent(text) : '');
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
function fail(error) { if (error) { console.error(error); toast('משהו נכשל: ' + (error.message || error), { ms: 5000 }); throw error; } }

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
    sb.from('message_templates').select('*').order('sort')];
  const r = await Promise.all(q); r.forEach(x => fail(x.error));
  const [st, op, pr, lb, tr, cp, tp] = r.map(x => x.data);
  S.settings = Object.fromEntries(st.map(x => [x.key, x]));
  S.opts = {}; op.forEach(o => (S.opts[o.list] ||= []).push(o));
  S.products = pr; S.labs = lb; S.tiers = tr; S.coupons = cp; S.templates = tp;
}
async function getOrders(filter) {
  let q = sb.from('v_orders').select('*').order('id', { ascending: false });
  if (filter) q = filter(q);
  const [{ data, error }, qa] = await Promise.all([q, sb.from('orders').select(Q_COLS)]); fail(error); fail(qa.error);
  const m = new Map(qa.data.map(x => [x.id, x])); data.forEach(o => Object.assign(o, m.get(o.id))); return data;
}
const getOrder = async id => { const [{ data, error }, qa] = await Promise.all([sb.from('v_orders').select('*').eq('id', id).single(), sb.from('orders').select(Q_COLS).eq('id', id).single()]); fail(error); fail(qa.error); return Object.assign(data, qa.data); };
// ---------- onboarding questionnaire (q.html#<q_token>, spec crm/אפיון-שאלון-אונבורדינג.md) ----------
// its columns are not in v_orders, so every order read merges them in from orders
const Q_COLS = 'id,q_token,q_opened_at,q_saved_at,q_submitted_at,q_progress,q_initial_lines,q_qty_changed_at,q_unsure_type,storage_place,mold,delivery_method,cloud_type,terms_accepted_at,quote_sent_at,q_sent_at,'
  + 'quote_token,quote_version,quote_valid_until,quote_expired_at,quote_views,quote_first_view_at,quote_last_view_at,quote_pay_clicked_at,quote_accepted_at,quote_accepted_name,quote_addons';
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
  const { data: me } = await sb.rpc('me');
  if (!me) return showLogin('המייל הזה עוד לא מורשה. מנהל צריך להוסיף אותו בהגדרות ← צוות.');
  S.me = me;
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  $$('[data-staff]').forEach(el => el.classList.toggle('hidden', isLab()));
  buildNav();
  $('#userBtn').textContent = (S.me.name || S.user.email || '?').trim()[0].toUpperCase();
  await loadRef();
  if (isLab() && !/^#(lab|scan)/.test(location.hash)) location.hash = 'lab';
  await route();
  if (!isLab() && !EMBED) quoteAlerts();
  if (!isLab() && !EMBED && lsGet('tour.v3') !== 'done') setTimeout(startTour, 400);
}
/** live alert when a customer opens the quote page or reaches its pay button (order_events kind 'quote' via Realtime) */
let quoteChan = null;
function quoteAlerts() {
  if (quoteChan || !sb.channel) return;
  quoteChan = sb.channel('quote-alerts').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_events', filter: 'kind=eq.quote' }, async ({ new: ev }) => {
    if (!/פתח|כפתור התשלום|אישר/.test(ev.new_value || '')) return;
    const { data: o } = await sb.from('v_orders').select('id, full_name, phone').eq('id', ev.order_id).maybeSingle();
    const who = o ? custName(o) : 'לקוח #' + ev.order_id;
    toast(`${who}: ${ev.new_value.replace(/^הלקוח /, '')}`, { undo: () => go('order/' + ev.order_id), label: 'לעסקה', ms: 12000 });
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
$('#signupBtn').addEventListener('click', async () => {
  const f = new FormData($('#loginForm'));
  if (!f.get('email') || String(f.get('password')).length < 6) return $('#loginMsg').textContent = 'ממלאים מייל וסיסמה (6 תווים לפחות) ולוחצים שוב.';
  const { error } = await sb.auth.signUp({ email: String(f.get('email')).trim().toLowerCase(), password: f.get('password') });
  $('#loginMsg').textContent = error && /rate limit/i.test(error.message) ? 'נשלחו יותר מדי מיילי אישור בשעה האחרונה. מחכים שעה, או שמנהל יוצר את המשתמש ב-Supabase (Authentication → Add user → Auto Confirm).'
    : error ? 'ההרשמה נכשלה: ' + error.message : 'נשלח אליך מייל אישור. אחרי האישור חוזרים לכאן ונכנסים.';
});

// ---------- theme ----------
// default is dark (chosen 2026-11-19); '' = follow the device
const themePref = () => { const t = lsGet('theme'); return t === null ? 'dark' : t; };
function applyTheme() { const t = themePref(); if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }

// ---------- nav ----------
const ICONS = {
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
    : [['sales', 'מכירות', 'sales'], ['deals', 'לקוחות', 'deals'], ['scan', 'סריקה', 'scan'], ['shipments', 'משלוחים', 'shipments'], ['reports', 'דוחות', 'reports'], ['expenses', 'הוצאות', 'expenses'], ['settings', 'הגדרות', 'settings']];
  $('#nav').innerHTML = items.map(([r, t, ic]) => `<a href="#${r}" data-r="${r}">${icon(ic)}<span class="t">${t}</span>${r === 'sales' ? '<span class="badge hidden" id="qBadge"></span>' : ''}</a>`).join('');
}
// the page title lives in the top bar (Pipedrive style); pages start with their toolbar
const PAGE_TITLE = { sales: 'מכירות', deals: 'לקוחות', scan: 'סריקת פריטים', reports: 'דוחות', expenses: 'הוצאות', settings: 'הגדרות', lab: 'ההזמנות שלי', quote: 'הצעת מחיר', labels: 'מדבקות ברקוד', manifest: 'דף משלוח', boxlabel: 'מדבקת ארגז', shipments: 'משלוחים', shipment: 'משלוח', labbills: 'חשבונות מעבדות' };
function setNav(r) { $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === r)); $('#pageTitle').textContent = PAGE_TITLE[r] || PAGE_TITLE.deals; }
function setBadge(n) { const b = $('#qBadge'); if (!b) return; b.textContent = n; b.classList.toggle('hidden', !n); }
$('#userBtn').addEventListener('click', e => {
  e.stopPropagation();
  const t = themePref();
  dropdown(e.currentTarget, [{ head: S.me?.name || S.user?.email || '' },
    ...(isLab() ? [] : [{ label: 'סיור היכרות עם ה-CRM', run: startTour }]),
    { label: tipsOn() ? 'הסתרת הסברים במעבר עכבר' : 'הצגת הסברים במעבר עכבר', run: () => { lsSet('tips', tipsOn() ? 'off' : 'on'); toast(tipsOn() ? 'ההסברים מוצגים' : 'ההסברים הוסתרו'); } },
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
const ALIAS = { today: 'sales', queue: 'sales', leads: 'deals', orders: 'deals', dash: 'reports', finance: 'expenses' };
let _lastHash = null;
async function routeOnce() {
  if (location.hash.startsWith('#track/')) return VIEWS.track(location.hash.split('/')[1]);
  if (!S.user) return;
  $('.topbar').classList.remove('hidden'); $('#app').classList.remove('public');
  let [r, arg] = (location.hash.slice(1) || (isLab() ? 'lab' : 'sales')).split('/');
  r = ALIAS[r] || r;
  if (isLab() && !['lab', 'scan'].includes(r)) { location.hash = 'lab'; return; }
  setNav(r === 'order' ? 'deals' : r === 'shipment' ? 'shipments' : r === 'labbills' ? 'expenses' : r);
  if (['quote', 'labels', 'manifest', 'boxlabel', 'shipment', 'labbills'].includes(r)) $('#pageTitle').textContent = PAGE_TITLE[r];
  VIEWS.stopScanner?.();
  closeMenus();
  if (r !== 'sales') $('#salesPanel')?.remove();
  // same page refreshed after a save: keep the scroll position and skip the "loading" flash
  const same = location.hash === _lastHash; _lastHash = location.hash;
  const y = window.scrollY;
  if (!same) view().innerHTML = '<div class="loading"><span class="spin"></span> טוען…</div>';
  try {
    const fn = VIEWS[r] || VIEWS.sales;
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
$('#newLeadBtn').addEventListener('click', async () => {
  const f = await formModal('פנייה חדשה', `
    <label class="field">טלפון <span class="req">*</span><input name="phone" type="tel" required inputmode="tel" placeholder="050-0000000"></label>
    <label class="field">שם<input name="name" placeholder="שם פרטי ומשפחה"></label>
    <label class="field">מאיפה הגיע<select name="source">${opts('source', '', { emptyLabel: 'לא ידוע' })}</select></label>
    <label class="field">מה יש לו / הערה<textarea name="note" rows="3" placeholder="למשל: 20 קלטות VHS של החתונה"></textarea></label>`,
    { ok: 'יצירה ומעבר ללקוח', intro: 'אם הטלפון כבר קיים אצלנו עם פנייה פתוחה, ההערה תתווסף אליה ולא תיווצר כפילות.' });
  if (!f) return;
  const { data, error } = await sb.rpc('upsert_lead', { p_phone: f.phone, p_name: f.name || null, p_source: f.source || null, p_note: f.note || null });
  fail(error); toast('נשמר. פנייה #' + data); go('order/' + data);
});

// ---------- first-run tour ----------
const TOUR = window.TOUR || [];
function startTour(i = 0) {
  if (!TOUR.length) return;
  const s = TOUR[i];
  const b = modal(`<div class="tour-step"><span class="n">${i + 1} מתוך ${TOUR.length}</span><h2 style="margin:0">${esc(s.title)}</h2><p>${esc(s.text)}</p>
    <div class="row spread" style="margin-top:8px"><div class="tour-dots">${TOUR.map((_, j) => `<span class="${j === i ? 'on' : ''}"></span>`).join('')}</div>
    <div class="row">${i ? '<button class="btn" id="tPrev">הקודם</button>' : '<button class="btn ghost" id="tSkip">דילוג</button>'}<button class="btn primary" id="tNext">${i === TOUR.length - 1 ? 'מתחילים' : 'הבא'}</button></div></div></div>`);
  if (s.route && !location.hash.startsWith('#' + s.route)) location.hash = s.route;
  const end = () => { lsSet('tour.v3', 'done'); closeModal(); };
  $('#tNext', b).onclick = () => i === TOUR.length - 1 ? end() : startTour(i + 1);
  $('#tPrev', b) && ($('#tPrev', b).onclick = () => startTour(i - 1));
  $('#tSkip', b) && ($('#tSkip', b).onclick = end);
  $('#modal').addEventListener('cancel', () => lsSet('tour.v3', 'done'), { once: true });
}

// ---------- hover tips: a short note on every button / object (texts in help.js → TIP_RULES, COL_TIPS) ----------
const tipsOn = () => lsGet('tips') !== 'off';
function tipFor(el) {
  if (el.dataset?.tip) return el.dataset.tip;
  for (const [sel, t] of (window.TIP_RULES || [])) if (el.matches?.(sel)) { const v = typeof t === 'function' ? t(el) : t; if (v) return v; }
  const [tbl, , col] = (el.dataset?.save || '').split(':');
  const ct = col && (window.COL_TIPS?.[tbl + '.' + col] ?? window.COL_TIPS?.[col]);
  if (ct) return ct;
  if (el.title) { el.dataset.tip = el.title; el.removeAttribute('title'); return el.dataset.tip; }
  return '';
}
(() => {
  const box = document.createElement('div'); box.className = 'tip hidden'; box.setAttribute('role', 'tooltip'); document.body.appendChild(box);
  let cur = null, timer = null;
  const hide = () => { clearTimeout(timer); cur = null; box.classList.add('hidden'); };
  const place = el => {
    const r = el.getBoundingClientRect(), b = box.getBoundingClientRect(), pad = 8;
    let top = r.top - b.height - pad; if (top < 64) top = r.bottom + pad;
    let left = r.left + r.width / 2 - b.width / 2; left = Math.max(pad, Math.min(left, innerWidth - b.width - pad));
    box.style.top = top + 'px'; box.style.left = left + 'px';
  };
  let touch = false;
  document.addEventListener('touchstart', () => { touch = true; hide(); }, { passive: true, capture: true });
  document.addEventListener('mouseover', e => {
    if (!tipsOn() || touch) { touch = false; return; }
    let el = e.target, txt = '';
    for (let i = 0; el && el !== document.body && i < 6; i++, el = el.parentElement) { txt = tipFor(el); if (txt) break; }
    if (!txt) return hide();
    if (el === cur) return;
    hide(); cur = el;
    timer = setTimeout(() => { if (cur !== el || !el.isConnected) return; box.textContent = txt; box.classList.remove('hidden'); place(el); }, 350);
  });
  document.addEventListener('mousedown', hide, true);
  addEventListener('scroll', hide, true);
  document.addEventListener('mouseleave', hide);
})();

// ---------- PWA ----------
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
