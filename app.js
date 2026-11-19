/* CRM המעבדה — single-page app on Supabase. No build step. */
'use strict';
const sb = supabase.createClient(CRM_CONFIG.url, CRM_CONFIG.key);
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const view = () => $('#view');
const S = { settings: {}, opts: {}, products: [], labs: [], tiers: [], coupons: [], templates: [], user: null, me: null, orderTab: {} };
const isLab = () => S.me?.role === 'lab';
const isAdmin = () => S.me?.role === 'admin';

// ---------- utils ----------
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => (n == null || n === '' || isNaN(n)) ? '' : '₪' + Number(n).toLocaleString('he-IL', { maximumFractionDigits: Number(n) % 1 ? 2 : 0 });
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const addDays = n => new Date(Date.now() + n * 864e5 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const fmtDate = d => d ? new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
const fmtDT = d => d ? new Date(d).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
const toLocalInput = d => d ? new Date(new Date(d).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
const fmtPhone = p => { const d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d.length === 9 ? `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}` : (p || ''); };
const waLink = (phone, text) => 'https://wa.me/972' + String(phone || '').replace(/\D/g, '').replace(/^0/, '') + (text ? '?text=' + encodeURIComponent(text) : '');
const firstName = n => String(n || '').trim().split(/\s+/)[0] || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isMobile = () => matchMedia('(max-width: 700px)').matches;
// ---------- help: ⓘ next to fields + "מה רואים כאן?" box per screen (texts in help.js) ----------
const HELPS = window.HELP || {};
const info = key => HELPS[key] ? `<button type="button" class="i" data-help="${esc(key)}" aria-label="הסבר" title="הסבר">ⓘ</button>` : '';
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const intro = key => { const t = HELPS['screen.' + key]; if (!t) return ''; const closed = lsGet('introClosed.' + key) === '1';
  return `<details class="intro" data-intro="${esc(key)}" ${closed ? '' : 'open'}><summary>מה רואים כאן?</summary><p>${esc(t)}</p></details>`; };
document.addEventListener('click', e => {
  const b = e.target.closest('[data-help]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const host = b.closest('label, th, .ms, h2, h3, .help-host') || b.parentElement;
  const open = host.querySelector(':scope > .help-pop');
  if (open) { open.remove(); b.classList.remove('on'); return; }
  const pop = document.createElement('div'); pop.className = 'help-pop'; pop.textContent = HELPS[b.dataset.help];
  host.appendChild(pop); b.classList.add('on');
}, true);
document.addEventListener('toggle', e => { const d = e.target; if (d.matches?.('details.intro')) lsSet('introClosed.' + d.dataset.intro, d.open ? '0' : '1'); }, true);

function toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.add('hidden'), ms); }
function fail(error) { if (error) { console.error(error); toast('שגיאה: ' + (error.message || error), 4000); throw error; } }
function opts(list, cur, { empty = true } = {}) {
  const arr = (S.opts[list] || []).filter(o => o.active || o.value === cur);
  return (empty ? '<option value=""></option>' : '') + arr.map(o => `<option ${o.value === cur ? 'selected' : ''}>${esc(o.value)}</option>`).join('');
}
const optColor = (list, v) => (S.opts[list] || []).find(o => o.value === v)?.color || '#9CA3AF';
const stageInfo = v => (S.opts.stage || []).find(o => o.value === v) || {};
const stagesOf = phase => (S.opts.stage || []).filter(o => o.active && o.phase === phase).map(o => o.value);
const productName = id => S.products.find(p => p.id === id)?.name || '';
const setting = k => S.settings[k]?.value != null ? Number(S.settings[k].value) : null;
const trackUrl = o => ((S.settings.public_url?.text_value || '').trim() || (location.origin + location.pathname)).replace(/#.*$/, '') + '#track/' + o.track_token;

// ---------- in-app dialogs (no browser confirm/prompt) ----------
function modal(html) { $('#modalBody').innerHTML = html; $('#modal').showModal(); return $('#modalBody'); }
function closeModal() { $('#modal').close(); }
function ask(title, msg = '', { ok = 'כן', cancel = 'ביטול', danger = false } = {}) {
  return new Promise(res => {
    const b = modal(`<h2>${esc(title)}</h2>${msg ? `<p style="white-space:pre-line">${esc(msg)}</p>` : ''}
      <div class="row"><button class="btn ${danger ? 'danger' : 'primary'}" id="dOk">${esc(ok)}</button><button class="btn" id="dNo">${esc(cancel)}</button></div>`);
    const done = v => { closeModal(); res(v); };
    $('#dOk', b).onclick = () => done(true); $('#dNo', b).onclick = () => done(false);
    $('#modal').addEventListener('cancel', () => res(false), { once: true });
  });
}
function formModal(title, fieldsHtml, { ok = 'שמירה' } = {}) {
  return new Promise(res => {
    const b = modal(`<h2>${esc(title)}</h2><form id="fm" class="grid">${fieldsHtml}
      <div class="row"><button class="btn primary">${esc(ok)}</button><button type="button" class="btn" id="fmNo">ביטול</button></div></form>`);
    $('#fm', b).onsubmit = e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); closeModal(); res(f); };
    $('#fmNo', b).onclick = () => { closeModal(); res(null); };
    $('#modal').addEventListener('cancel', () => res(null), { once: true });
    setTimeout(() => $('#fm input, #fm select, #fm textarea', b)?.focus(), 30);
  });
}
const tell = (title, msg) => ask(title, msg, { ok: 'הבנתי', cancel: 'סגירה' });

// ---------- data ----------
async function loadRef() {
  const q = [sb.from('settings').select('*').order('sort'), sb.from('options').select('*').order('sort'), sb.from('products').select('*').order('sort'),
    sb.from('labs').select('*').order('name'), sb.from('discount_tiers').select('*').order('min_items'), sb.from('coupons').select('*').order('code'),
    sb.from('message_templates').select('*').order('sort')];
  const [st, op, pr, lb, tr, cp, tp] = await Promise.all(q);
  [st, op, pr, lb, tr, cp, tp].forEach(r => fail(r.error));
  S.settings = Object.fromEntries(st.data.map(r => [r.key, r]));
  S.opts = {}; op.data.forEach(o => (S.opts[o.list] ||= []).push(o));
  S.products = pr.data; S.labs = lb.data; S.tiers = tr.data; S.coupons = cp.data; S.templates = tp.data;
}
async function getOrders(filter) {
  let q = sb.from('v_orders').select('*').order('id', { ascending: false });
  if (filter) q = filter(q);
  const { data, error } = await q; fail(error); return data;
}
const getOrder = async id => { const { data, error } = await sb.from('v_orders').select('*').eq('id', id).single(); fail(error); return data; };

// ---------- auth ----------
async function boot() {
  if (location.hash.startsWith('#track/')) return vTrack(location.hash.split('/')[1]);
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showLogin();
  S.user = session.user;
  const { data: me } = await sb.rpc('me');
  if (!me) return showLogin('המייל הזה עוד לא מורשה. מנהל צריך להוסיף אותו בהגדרות ← צוות.');
  S.me = me;
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  $$('[data-staff]').forEach(el => el.classList.toggle('hidden', isLab()));
  $$('[data-lab]').forEach(el => el.classList.toggle('hidden', !isLab()));
  await loadRef();
  if (isLab() && !/^#(lab|scan)/.test(location.hash)) location.hash = 'lab';
  route();
}
function showLogin(msg = '') { $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); $('#loginMsg').textContent = msg; }
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const { error } = await sb.auth.signInWithPassword({ email: String(f.get('email')).trim().toLowerCase(), password: f.get('password') });
  if (error) return $('#loginMsg').textContent = 'הכניסה נכשלה: ' + error.message;
  boot();
});
$('#signupBtn').addEventListener('click', async () => {
  const f = new FormData($('#loginForm'));
  if (!f.get('email') || String(f.get('password')).length < 6) return $('#loginMsg').textContent = 'מלא מייל וסיסמה (6 תווים לפחות).';
  const { error } = await sb.auth.signUp({ email: String(f.get('email')).trim().toLowerCase(), password: f.get('password') });
  $('#loginMsg').textContent = error && /rate limit/i.test(error.message) ? 'נשלחו יותר מדי מיילי אישור בשעה האחרונה. אפשר לחכות שעה, או שמנהל ייצור את המשתמש ב-Supabase (Authentication → Add user → Auto Confirm).'
    : error ? 'ההרשמה נכשלה: ' + error.message : 'נשלח מייל אישור. אחרי האישור חוזרים לכאן ונכנסים.';
});
$('#logoutBtn')?.addEventListener('click', async () => { await sb.auth.signOut(); location.hash = ''; location.reload(); });

// ---------- router ----------
window.addEventListener('hashchange', route);
// serialize renders so a slow earlier page can never overwrite the page the user navigated to last
let routeBusy = false, routeAgain = false;
async function route() {
  routeAgain = true;
  if (routeBusy) return;
  routeBusy = true;
  try { while (routeAgain) { routeAgain = false; await routeOnce(); } } finally { routeBusy = false; }
}
async function routeOnce() {
  if (location.hash.startsWith('#track/')) return vTrack(location.hash.split('/')[1]);
  if (!S.user) return;
  $('.topbar').classList.remove('hidden');
  const [r, arg] = (location.hash.slice(1) || (isLab() ? 'lab' : 'today')).split('/');
  if (isLab() && !['lab', 'scan'].includes(r)) { location.hash = 'lab'; return; }
  setNav(r);
  stopScanner();
  view().innerHTML = '<div class="loading"><span class="spin"></span> טוען…</div>';
  try {
    const fn = { today: vToday, leads: vLeads, orders: vOrders, order: vOrder, scan: vScan, dash: vDash, finance: vFinance, settings: vSettings, labels: vLabels, quote: vQuote, manifest: vManifest, lab: vLab }[r] || vToday;
    await fn(arg);
    window.scrollTo(0, 0);
  } catch (e) { console.error(e); view().innerHTML = `<div class="err">שגיאה בטעינה: ${esc(e.message)}</div>`; }
}
function setNav(r) { $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === r)); }

// ---------- global search ----------
$('#searchForm').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('#searchInput').value.trim(); if (!q) return;
  $('#searchInput').blur();
  if (/^\d{3,6}-\d{1,3}$/.test(q)) {
    const { data } = await sb.from('items').select('id, order_id, status').eq('id', q).maybeSingle();
    if (data) { location.hash = 'order/' + data.order_id; toast(`פריט ${data.id}: ${data.status}`); return; }
  }
  if (/^\d{3,6}$/.test(q)) { const { data } = await sb.from('orders').select('id').eq('id', q).maybeSingle(); if (data) { location.hash = 'order/' + data.id; return; } }
  const digits = q.replace(/\D/g, '');
  let cq = sb.from('customers').select('id, full_name, phone, city').limit(20);
  cq = digits.length >= 4 ? cq.like('phone', `%${digits.replace(/^972/, '0').replace(/^0?/, '')}%`) : cq.ilike('full_name', `%${q}%`);
  const { data: cust, error } = await cq; fail(error);
  if (!cust.length) return tell('לא נמצא', `אין תוצאות ל"${q}". אפשר לחפש שם, טלפון, מספר הזמנה או ברקוד.`);
  const { data: ords } = await sb.from('v_orders').select('id, customer_id, stage, total, created_at').in('customer_id', cust.map(c => c.id)).order('id', { ascending: false });
  if (ords.length === 1) { location.hash = 'order/' + ords[0].id; return; }
  modal(`<h2>תוצאות חיפוש</h2><ul class="task-list">${cust.map(c => ords.filter(o => o.customer_id === c.id).map(o => `
    <li><a href="#order/${o.id}" onclick="closeModal()"><b>${esc(c.full_name || fmtPhone(c.phone))}</b> · #${o.id}</a><span class="small muted">${esc(o.stage)} · ${money(o.total)}</span></li>`).join('')).join('')}</ul>
    <button class="btn" onclick="closeModal()">סגירה</button>`);
});

// ---------- new lead ----------
$('#newLeadBtn').addEventListener('click', async () => {
  const f = await formModal('ליד חדש', `
    <label>טלפון *<input name="phone" type="tel" required inputmode="tel"></label>
    <label>שם<input name="name"></label>
    <label>מקור<select name="source">${opts('source')}</select></label>
    <label>מה יש לו / הערה<textarea name="note"></textarea></label>
    <p class="muted small">אם הטלפון כבר קיים עם ליד פתוח, הפנייה מתמזגת אליו.</p>`);
  if (!f) return;
  const { data, error } = await sb.rpc('upsert_lead', { p_phone: f.phone, p_name: f.name || null, p_source: f.source || null, p_note: f.note || null });
  fail(error); toast('נשמר: הזמנה ' + data); location.hash = 'order/' + data;
});

// ---------- TODAY ----------
async function markContacted(id) { const { error } = await sb.from('orders').update({ last_contact_at: new Date().toISOString() }).eq('id', id); fail(error); toast('נרשם. הפולואפ הבא נקבע אוטומטית'); }
async function vToday() {
  const rows = await getOrders(q => q.not('phase', 'in', '(done,lost)'));
  const t = today(), in7 = addDays(7);
  const sales = r => `<button class="btn sm" data-contact="${r.id}">דיברתי</button>`;
  const groups = [
    ['לידים חדשים שלא טופלו', rows.filter(r => r.stage === 'ליד חדש' && !r.last_contact_at), r => `${esc(r.source || '')} · נכנס ${fmtDT(r.created_at)}`, sales],
    ['פולואפ להיום', rows.filter(r => r.flag_followup && !(r.stage === 'ליד חדש' && !r.last_contact_at)), r => `פולואפ ${fmtDate(r.next_followup)} · ${esc(r.stage)}`, sales],
    ['הצעות בלי תשובה', rows.filter(r => r.flag_quote_stale), r => `נשלחה ${fmtDate(r.stage_changed_at)} · ${money(r.total)}`, sales],
    ['לתאם איסוף', rows.filter(r => r.stage === 'שולם - לתאם איסוף'), r => `שולם ${fmtDate(r.paid_at)}${r.lab_name ? '' : ' · <span class="chip orange">אין מעבדה</span>'}`],
    ['מזומן אצל שליח', rows.filter(r => r.flag_cash_at_courier), r => money(r.paid_amount || r.total)],
    ['פער כמויות במעבדה', rows.filter(r => r.flag_count_mismatch), r => `הוצהר ${r.media_qty} · נקלט ${r.items_at_lab_or_later}`],
    ['באיחור', rows.filter(r => r.flag_late).sort((a, b) => b.days_since_paid - a.days_since_paid), r => `<span class="chip ${r.flag_late}">${r.days_since_paid} ימים</span> ${esc(r.lab_name || '')}`],
    ['להעביר קבצים ללקוח', rows.filter(r => r.files_received_at && !r.delivery_sent_at), r => `קבצים התקבלו ${fmtDate(r.files_received_at)}`],
    ['קישור נמחק בשבוע הקרוב', rows.filter(r => r.delivery_link_expires && r.delivery_link_expires <= in7 && r.delivery_link_expires >= t), r => `נמחק ${fmtDate(r.delivery_link_expires)}`],
  ];
  const total = groups.reduce((s, g) => s + g[1].length, 0);
  view().innerHTML = `
    <div class="row spread"><h1>היום</h1><span class="muted">${total} משימות פתוחות</span></div>
    ${intro('today')}
    <div class="grid cols-3">${groups.map(([title, list, sub, act]) => `
      <section class="card ${list.length ? '' : 'empty'}"><h2>${title} <span class="count ${list.length ? 'hot' : ''}">${list.length}</span></h2>
        ${list.length ? `<ul class="task-list">${list.map(r => `
          <li><div><a href="#order/${r.id}"><b>${esc(r.full_name || fmtPhone(r.phone))}</b></a> <span class="muted small">#${r.id}</span><div class="small muted">${sub(r)}</div></div>
          <div class="row nowrap">${act ? act(r) : ''}<a class="btn sm" href="${waLink(r.phone)}" target="_blank" rel="noopener">וואטסאפ</a></div></li>`).join('')}</ul>` : '<p class="muted small">אין כרגע</p>'}
      </section>`).join('')}</div>`;
  $$('[data-contact]').forEach(b => b.onclick = async () => { await markContacted(b.dataset.contact); vToday(); });
}

// ---------- LEADS ----------
async function vLeads() {
  const rows = await getOrders(q => q.eq('phase', 'sales'));
  const lanes = stagesOf('sales');
  const card = r => `<div class="kcard" draggable="true" data-id="${r.id}" data-q="${esc((r.full_name || '') + ' ' + r.phone)}">
    <div class="row spread"><span class="t">${esc(r.full_name || fmtPhone(r.phone))}</span>${r.temperature ? `<span class="chip" style="color:${optColor('temperature', r.temperature)}">${esc(r.temperature)}</span>` : ''}</div>
    <div class="small muted">${esc(r.source || '')}${r.city ? ' · ' + esc(r.city) : ''} ${r.media_qty ? '· ' + r.media_qty + ' פריטים · ' + money(r.total) : ''}</div>
    ${r.est_quantity ? `<div class="small"><span class="chip blue">כמות משוערת: ${esc(r.est_quantity)}</span></div>` : ''}
    <div class="small">${r.flag_followup ? '<span class="chip red">פולואפ</span>' : `<span class="muted">פולואפ ${fmtDate(r.next_followup)}</span>`} ${r.is_repeat ? '<span class="chip blue">חוזר</span>' : ''} ${isMobile() ? `<span class="chip">${esc(r.stage)}</span>` : ''}</div></div>`;
  const pipeline = rows.reduce((s, r) => s + Number(r.total || 0), 0);
  const head = `<div class="row spread"><h1>לידים <span class="muted small">${rows.length} · שווי צנרת ${money(pipeline)}</span></h1><input id="lf" placeholder="סינון שם / טלפון" style="max-width:220px"></div>${intro('leads')}`;
  if (isMobile()) {
    const cur = sessionStorage.getItem('leadStage') || '';
    view().innerHTML = head + `<div class="chips-row"><button class="btn sm ${cur ? '' : 'on'}" data-ls="">הכל (${rows.length})</button>${lanes.map(s => `<button class="btn sm ${s === cur ? 'on' : ''}" data-ls="${esc(s)}">${esc(s)} (${rows.filter(r => r.stage === s).length})</button>`).join('')}</div>
      <div>${rows.filter(r => !cur || r.stage === cur).map(card).join('') || '<p class="muted">אין לידים</p>'}</div>`;
    $$('[data-ls]').forEach(b => b.onclick = () => { sessionStorage.setItem('leadStage', b.dataset.ls); vLeads(); });
  } else {
    view().innerHTML = head + `<div class="kanban">${lanes.map(s => {
      const list = rows.filter(r => r.stage === s);
      return `<div class="lane" data-stage="${esc(s)}"><h3><span><span class="dot" style="background:${optColor('stage', s)}"></span>${esc(s)}</span><span class="count">${list.length}</span></h3>${list.map(card).join('')}</div>`;
    }).join('')}</div><p class="muted small">גוררים כרטיס בין עמודות כדי לשנות שלב.</p>`;
    $$('.lane').forEach(l => {
      l.addEventListener('dragover', e => { e.preventDefault(); l.classList.add('drop'); });
      l.addEventListener('dragleave', () => l.classList.remove('drop'));
      l.addEventListener('drop', async e => {
        e.preventDefault(); l.classList.remove('drop');
        const id = e.dataTransfer.getData('id'), o = rows.find(r => String(r.id) === id);
        if (o && await changeStage(o, l.dataset.stage)) vLeads();
      });
    });
  }
  $$('.kcard').forEach(c => { c.addEventListener('click', () => location.hash = 'order/' + c.dataset.id); c.addEventListener('dragstart', e => e.dataTransfer.setData('id', c.dataset.id)); });
  $('#lf').addEventListener('input', e => { const q = e.target.value.trim(); $$('.kcard').forEach(c => c.classList.toggle('hidden', !!q && !c.dataset.q.includes(q))); });
}

// ---------- ORDERS ----------
async function vOrders() {
  const showAll = sessionStorage.getItem('ordersAll') === '1';
  const rows = await getOrders(q => showAll ? q : q.eq('phase', 'ops'));
  view().innerHTML = `
    <div class="row spread"><h1>הזמנות ${showAll ? '(הכל)' : 'בתפעול'} <span class="muted small">${rows.length}</span></h1>
      <div class="row"><input id="of" placeholder="סינון: שם, טלפון, מס'" style="max-width:200px">
      <select id="ostage" style="max-width:180px"><option value="">כל השלבים</option>${(S.opts.stage || []).filter(s => showAll || s.phase === 'ops').map(s => `<option>${esc(s.value)}</option>`).join('')}</select>
      <select id="olab" style="max-width:160px"><option value="">כל המעבדות</option>${S.labs.map(l => `<option>${esc(l.name)}</option>`).join('')}</select>
      <button class="btn sm" id="otoggle">${showAll ? 'רק בתפעול' : 'הצג הכל'}</button></div></div>
    ${intro('orders')}
    <div class="card table-wrap"><table>
      <thead><tr><th>#</th><th>לקוח</th><th>שלב</th><th>מעבדה</th><th class="num">פריטים</th><th class="num">סה"כ</th><th>תשלום</th><th>ימים</th><th class="hide-m">דגלים</th></tr></thead>
      <tbody>${rows.map(r => `<tr class="click" data-id="${r.id}" data-q="${esc(r.id + ' ' + (r.full_name || '') + ' ' + r.phone)}" data-lab="${esc(r.lab_name || '')}" data-stage="${esc(r.stage)}">
        <td>${r.id}</td><td>${esc(r.full_name || fmtPhone(r.phone))}</td>
        <td><span class="dot" style="background:${r.stage_color || '#999'}"></span>${esc(r.stage)}</td>
        <td>${r.lab_name ? esc(r.lab_name) : (r.phase === 'ops' ? '<span class="chip orange">חסר</span>' : '')}</td><td class="num">${r.media_qty}</td><td class="num">${money(r.total)}</td>
        <td><span class="chip ${r.payment_status === 'שולם' ? 'green' : r.payment_status === 'מזומן אצל שליח' ? 'orange' : ''}">${esc(r.payment_status)}</span></td>
        <td>${r.days_since_paid != null ? `<span class="chip ${r.flag_late || ''}">${r.days_since_paid}</span>` : ''}</td>
        <td class="hide-m">${r.flag_count_mismatch ? '<span class="chip red">פער כמויות</span>' : ''} ${r.priority ? '<span class="chip orange">קדימות</span>' : ''}</td>
      </tr>`).join('') || '<tr><td colspan="9" class="muted">אין הזמנות</td></tr>'}</tbody></table></div>`;
  $$('tr.click').forEach(tr => tr.addEventListener('click', () => location.hash = 'order/' + tr.dataset.id));
  $('#otoggle').onclick = () => { sessionStorage.setItem('ordersAll', showAll ? '0' : '1'); vOrders(); };
  const filt = () => { const q = $('#of').value.trim(), lab = $('#olab').value, st = $('#ostage').value; $$('tr.click').forEach(tr => tr.classList.toggle('hidden', (q && !tr.dataset.q.includes(q)) || (lab && tr.dataset.lab !== lab) || (st && tr.dataset.stage !== st))); };
  $('#of').oninput = filt; $('#olab').onchange = filt; $('#ostage').onchange = filt;
}

// ---------- stage logic ----------
const REQUIRED_BEFORE_PAID = [['full_name', 'שם מלא'], ['email', 'מייל'], ['id_number', 'ת.ז לחשבונית'], ['city', 'עיר'], ['street', 'רחוב'], ['house_number', 'מספר בית'], ['alt_contact_name', 'איש קשר נוסף'], ['alt_contact_phone', 'טלפון איש קשר נוסף']];
const missingForPaid = (o, c) => REQUIRED_BEFORE_PAID.filter(([k]) => !String(c?.[k] || '').trim()).map(x => x[1]).concat(o.media_qty ? [] : ['כמויות חומרה']);
const showRequired = o => o.phase === 'sales' && (stageInfo(o.stage).sort || 0) >= (stageInfo('הצעת מחיר נשלחה').sort || 5);
const NEXT = {
  'ליד חדש': { to: 'ניסיון קשר' }, 'ניסיון קשר': { to: 'בשיחה' }, 'בשיחה': { to: 'הצעת מחיר נשלחה', label: 'נשלחה הצעת מחיר' },
  'התקבלו פרטים/תמונות': { to: 'הצעת מחיר נשלחה', label: 'נשלחה הצעת מחיר' }, 'הצעת מחיר נשלחה': { to: 'ממתין לתשלום' },
  'ממתין לתשלום': { to: 'שולם - לתאם איסוף', label: 'שולם' },
  'שולם - לתאם איסוף': { to: 'שליח הוזמן', need: [['lab_id', 'מעבדה'], ['pickup_date', 'תאריך איסוף']] },
  'שליח הוזמן': { to: 'נאסף מהלקוח', set: 'picked_up_at' }, 'נאסף מהלקוח': { to: 'הגיע למעבדה', set: 'lab_received_at' },
  'הגיע למעבדה': { to: 'בהמרה' }, 'בהמרה': { to: 'ההמרה הסתיימה', set: 'conversion_done_at' },
  'ההמרה הסתיימה': { to: 'החומרה אצלנו', set: 'back_from_lab_at' },
  'החומרה אצלנו': { to: 'קבצים נשלחו ללקוח', set: 'delivery_sent_at', need: [['delivery_link', 'קישור הורדה ללקוח']] },
  'קבצים נשלחו ללקוח': { to: 'החומרה הוחזרה / נמסרה', set: 'returned_at' }, 'החומרה הוחזרה / נמסרה': { to: 'הושלם' },
};
const STAGE_SET = Object.fromEntries(Object.values(NEXT).filter(n => n.set).map(n => [n.to, n.set]));
function nextOf(stage) {
  if (NEXT[stage] && stageInfo(NEXT[stage].to).active) return NEXT[stage];
  const cur = stageInfo(stage); if (!cur.phase || cur.phase === 'done' || cur.phase === 'lost') return null;
  const nxt = (S.opts.stage || []).filter(s => s.active && s.sort > cur.sort && s.phase !== 'lost').sort((a, b) => a.sort - b.sort)[0];
  return nxt ? { to: nxt.value } : null;
}
// returns true if the stage changed
async function changeStage(o, to, c) {
  if (to === o.stage) return false;
  const from = stageInfo(o.stage), dest = stageInfo(to);
  const patch = { stage: to };
  if (to === 'אבוד') {
    const f = await formModal('ליד אבוד: למה לא קנה?', `<label>סיבה בשורה תחתונה *<select name="loss_category" required>${opts('loss_category', o.loss_category)}</select></label>
      <label>פירוט<textarea name="loss_note">${esc(o.loss_note || '')}</textarea></label>`);
    if (!f) return false;
    Object.assign(patch, { loss_category: f.loss_category, loss_note: f.loss_note || null });
  }
  if (dest.phase === 'ops' && from.phase === 'sales') {
    c ||= (await sb.from('customers').select('*').eq('id', o.customer_id).single()).data;
    const miss = missingForPaid(o, c);
    if (miss.length && !await ask('חסרים פרטים', 'לפני מעבר לתפעול חסר: ' + miss.join(', ') + '\nלהעביר בכל זאת?', { ok: 'להעביר בכל זאת' })) return false;
    if (o.payment_status === 'לא שולם') {
      const f = await formModal('תשלום', `<label>סטטוס<select name="payment_status">${opts('payment_status', 'שולם', { empty: false })}</select></label>
        <label>אמצעי תשלום<select name="payment_method">${opts('payment_method', o.payment_method)}</select></label>
        <label>סכום<input name="paid_amount" type="number" step="1" value="${esc(o.total)}"></label>`, { ok: 'שמירה והעברה' });
      if (!f) return false;
      Object.assign(patch, { payment_status: f.payment_status, payment_method: f.payment_method || null, paid_amount: f.paid_amount ? Number(f.paid_amount) : null });
    }
  }
  if (dest.phase === 'ops' && dest.sort >= (stageInfo('שליח הוזמן').sort || 11) && !o.lab_id) {
    await tell('צריך לבחור מעבדה', 'לפני שליחת החומרה צריך לשייך את ההזמנה למעבדה (בלשונית תפעול).'); return false;
  }
  const n = nextOf(o.stage);
  if (n && n.to === to && n.need) {
    const miss = n.need.filter(([k]) => !o[k]).map(x => x[1]);
    if (miss.length) { await tell('חסר למעבר הזה', miss.join(', ')); return false; }
  }
  const setField = STAGE_SET[to]; if (setField && !o[setField]) patch[setField] = new Date().toISOString();
  const { error } = await sb.from('orders').update(patch).eq('id', o.id); fail(error);
  toast('השלב עודכן: ' + to); return true;
}

// ---------- ORDER page ----------
const MILESTONES = [['paid_at', 'שולם'], ['cash_received_at', 'מזומן הגיע אלינו'], ['picked_up_at', 'נאסף מהלקוח'], ['lab_received_at', 'הגיע למעבדה'], ['intake_done_at', 'קליטה במעבדה הסתיימה'],
  ['conversion_done_at', 'ההמרה הסתיימה'], ['back_from_lab_at', 'אספתי מהמעבדה'], ['files_received_at', 'קבצים התקבלו מהמעבדה'], ['delivery_sent_at', 'קישור נשלח ללקוח'], ['returned_at', 'חומרה הוחזרה / נמסרה']];
const AFTER = [['review_requested_at', 'ביקשתי ביקורת גוגל'], ['story_requested_at', 'ביקשתי סטורי']];
const ITEM_LOC = { 'ממתין לאיסוף': 'אצל הלקוח', 'נאסף': 'אצל השליח', 'במעבדה': 'במעבדה', 'הומר': 'במעבדה', 'לא ניתן להמרה': 'במעבדה', 'אצלנו': 'אצלנו', 'הוחזר ללקוח': 'אצל הלקוח (הוחזר)', 'לא מוחזר': 'לא מוחזר' };

async function vOrder(id) {
  const [o, { data: lines, error: e2 }, { data: items, error: e3 }, { data: events, error: e4 }] = await Promise.all([
    getOrder(id), sb.from('order_lines').select('*').eq('order_id', id), sb.from('items').select('*').eq('order_id', id).order('seq'),
    sb.from('order_events').select('*').eq('order_id', id).order('at', { ascending: false }).limit(100)]);
  [e2, e3, e4].forEach(fail);
  const { data: c, error: e5 } = await sb.from('customers').select('*').eq('id', o.customer_id).single(); fail(e5);
  setNav(o.phase === 'sales' || o.phase === 'lost' ? 'leads' : 'orders');
  const ctx = { o, c, lines, items, events };
  const defTab = o.phase === 'sales' ? (o.media_qty ? 'quote' : 'customer') : o.phase === 'ops' ? 'ops' : 'history';
  const tab = S.orderTab[id] || defTab;
  const nx = nextOf(o.stage);
  const tabs = [['customer', 'לקוח'], ['quote', 'הצעת מחיר'], ['ops', 'תפעול'], ['items', `פריטים${items.length ? ' (' + items.length + ')' : ''}`], ['history', 'היסטוריה']];
  view().innerHTML = `
  ${intro('order')}
  <div class="order-head card">
    <div><h1>${esc(c.full_name || fmtPhone(c.phone))} <span class="muted">#${o.id}</span></h1>
      <div class="row small" id="headFlags">${headFlags(o)}</div></div>
    <div class="row help-host">
      <select id="stageSel" style="min-width:190px" aria-label="שלב">${opts('stage', o.stage, { empty: false })}</select>${info('order.stage')}
      ${nx ? `<button class="btn primary" id="nextBtn">▶ ${esc(nx.label || nx.to)}</button>${info('order.next')}` : ''}
    </div>
    <div class="row help-host">
      <a class="btn sm" href="tel:${esc(c.phone)}">חיוג ${esc(fmtPhone(c.phone))}</a>
      <select id="tplSel" class="btn sm" style="width:auto" aria-label="תבנית וואטסאפ"><option value="">וואטסאפ: תבנית…</option><option value="-1">הודעה ריקה</option>${S.templates.filter(t => t.active).map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>${info('order.template')}
      <button class="btn sm" id="contacted">דיברתי עכשיו</button>${info('order.contacted')}
      <button class="btn sm" id="copyTrack">קישור מעקב ללקוח</button>${info('order.track')}
    </div>
  </div>
  <div class="tabs">${tabs.map(([k, v]) => `<button class="tab ${k === tab ? 'on' : ''}" data-tab="${k}">${v}</button>`).join('')}</div>
  <div id="tabBody"></div>`;
  const renderTab = k => { S.orderTab[id] = k; $$('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === k)); $('#tabBody').innerHTML = TABS[k](ctx); bindOrder(ctx, k); };
  $$('.tab').forEach(b => b.onclick = () => renderTab(b.dataset.tab));
  renderTab(tab);
  // always use ctx.o: field edits refresh it in place
  $('#stageSel').onchange = async e => { if (await changeStage(ctx.o, e.target.value, c)) { delete S.orderTab[id]; vOrder(id); } else e.target.value = ctx.o.stage; };
  $('#nextBtn') && ($('#nextBtn').onclick = async () => { if (await changeStage(ctx.o, nx.to, c)) { delete S.orderTab[id]; vOrder(id); } });
  $('#contacted').onclick = async () => { await markContacted(o.id); vOrder(id); };
  $('#tplSel').onchange = e => { const v = e.target.value; e.target.value = ''; if (!v) return; const t = S.templates.find(x => String(x.id) === v); window.open(waLink(c.phone, t ? fillTemplate(t.body, ctx.o, c) : ''), '_blank', 'noopener'); };
  $('#copyTrack').onclick = async () => { await navigator.clipboard.writeText(trackUrl(o)).catch(() => {}); tell('קישור מעקב ללקוח', trackUrl(o) + (S.settings.public_url?.text_value ? '' : '\n\nשימו לב: הקישור יעבוד ללקוחות רק אחרי שהאתר יעלה לאוויר וכתובתו תוגדר בהגדרות.')); };
}
function headFlags(o) {
  return `<span class="chip" style="border-color:${o.stage_color}">${esc(o.stage)}</span>${o.is_repeat ? '<span class="chip blue">לקוח חוזר</span>' : ''}${o.priority ? '<span class="chip orange">קדימות</span>' : ''}
  ${o.flag_late ? `<span class="chip ${o.flag_late}">${o.days_since_paid} ימים מתשלום</span>` : ''}${o.flag_count_mismatch ? '<span class="chip red">פער כמויות</span>' : ''}${o.flag_cash_at_courier ? '<span class="chip orange">מזומן אצל שליח</span>' : ''}
  <span class="muted">${money(o.total)}${o.lab_name ? ' · ' + esc(o.lab_name) : ''}</span>`;
}
function fillTemplate(body, o, c) {
  const map = { 'שם': firstName(c.full_name), 'הזמנה': o.id, 'סכום': money(o.total), 'קישור': o.delivery_link || '', 'מעקב': trackUrl(o), 'תאריך איסוף': o.pickup_date ? fmtDate(o.pickup_date) : '', 'ימי קישור': setting('drive_link_days') || 60 };
  return body.replace(/\{([^}]+)\}/g, (m, k) => map[k] ?? m);
}
// field helpers
const fv = (ctx, t, k) => t === 'c' ? ctx.c[k] : ctx.o[k];
function F(ctx, t, k, label, type = 'text', extra = '') {
  const val = fv(ctx, t, k);
  const miss = t === 'c' && showRequired(ctx.o) && REQUIRED_BEFORE_PAID.some(r => r[0] === k) && !String(val || '').trim();
  const v = type === 'datetime-local' ? toLocalInput(val) : (val ?? '');
  return `<label class="${miss ? 'missing' : ''}" data-wrap="${k}"><span class="lt">${label}${info(t + '.' + k)}</span><input type="${type}" data-t="${t}" data-k="${k}" value="${esc(v)}" ${extra}></label>`;
}
const SEL = (ctx, t, k, label, list) => `<label><span class="lt">${label}${info(t + '.' + k)}</span><select data-t="${t}" data-k="${k}">${opts(list, fv(ctx, t, k))}</select></label>`;
const CHK = (ctx, t, k, label) => `<label class="check help-host"><input type="checkbox" data-t="${t}" data-k="${k}" ${fv(ctx, t, k) ? 'checked' : ''}> ${label}${info(t + '.' + k)}</label>`;
const milestone = (o, k, label) => `<div class="ms" data-ms="${k}"><span>${label}</span>${o[k] ? `<span class="ms-done">✓ ${fmtDT(o[k])} <button class="link-btn" data-msedit="${k}">שינוי</button></span>` : `<button class="btn sm" data-msnow="${k}">עכשיו ✓</button>`}</div>`;

const TABS = {
  customer: ({ o, c }) => {
    const ctx = { o, c }, miss = showRequired(o) ? missingForPaid(o, c) : [];
    return `${miss.length ? `<div class="warn" id="reqWarn">חסר לפני תשלום: ${miss.join(', ')}</div>` : '<div id="reqWarn"></div>'}
    <div class="grid cols-2">
    <section class="card"><h2>פרטי לקוח</h2><div class="fields">
      ${F(ctx, 'c', 'full_name', 'שם מלא')}${F(ctx, 'c', 'phone', 'טלפון', 'tel')}${F(ctx, 'c', 'email', 'מייל', 'email')}${F(ctx, 'c', 'id_number', 'ת.ז לחשבונית')}
      ${F(ctx, 'c', 'alt_contact_name', 'איש קשר נוסף לאיסוף')}${F(ctx, 'c', 'alt_contact_phone', 'טלפון נוסף', 'tel')}
    </div><div class="row" style="margin-top:8px">${CHK(ctx, 'c', 'mailing_list', 'ברשימת תפוצה')}</div></section>
    <section class="card"><h2>כתובת לאיסוף</h2><div class="fields">
      ${F(ctx, 'c', 'city', 'עיר')}${F(ctx, 'c', 'street', 'רחוב')}${F(ctx, 'c', 'house_number', 'מספר')}${F(ctx, 'c', 'floor', 'קומה')}${F(ctx, 'c', 'apartment', 'דירה')}${F(ctx, 'c', 'entry_code', 'קוד כניסה')}
    </div></section>
    <section class="card"><h2>מכירה</h2><div class="fields">
      ${SEL(ctx, 'o', 'source', 'מקור', 'source')}${SEL(ctx, 'o', 'temperature', 'חום', 'temperature')}
      ${F(ctx, 'o', 'next_followup', 'פולואפ הבא', 'date')}<label>קשר אחרון<input disabled value="${esc(fmtDT(o.last_contact_at))}"></label>
    </div><div class="row" style="margin-top:8px"><span class="small muted">פולואפ בעוד:</span>${[1, 3, 7].map(n => `<button class="btn sm" data-fu="${n}">${n === 7 ? 'שבוע' : n === 1 ? 'יום' : n + ' ימים'}</button>`).join('')}</div>
    ${o.stage === 'אבוד' ? `<div class="fields" style="margin-top:10px">${SEL(ctx, 'o', 'loss_category', 'סיבה בשורה תחתונה', 'loss_category')}</div>
      <label style="margin-top:8px">למה לא קנה<textarea data-t="o" data-k="loss_note">${esc(o.loss_note || '')}</textarea></label>` : ''}
    </section>
    ${o.meta_lead_id ? `<section class="card"><h2>מטא — ${esc(o.meta_form || 'טופס לידים')}</h2><div class="fields">
      <label>כמה קלטות/דיסקים/סלילים (לפי הטופס)<input disabled value="${esc(o.est_quantity || '')}"></label>
      <label>פלטפורמה<input disabled value="${esc(o.meta_platform === 'ig' ? 'אינסטגרם' : o.meta_platform === 'fb' ? 'פייסבוק' : (o.meta_platform || ''))}"></label>
      <label>קמפיין<input disabled value="${esc(o.meta_campaign || '')}"></label>
      <label>סט מודעות<input disabled value="${esc(o.meta_adset || '')}"></label>
      <label>מודעה<input disabled value="${esc(o.meta_ad || '')}"></label>
      <label>זמן מילוי הטופס<input disabled value="${esc(fmtDT(o.meta_created_at))}"></label>
      <label>מזהה ליד במטא<input disabled value="${esc(o.meta_lead_id)}"></label>
    </div></section>` : ''}
    <section class="card"><h2>הערות קבועות</h2><textarea data-t="o" data-k="notes" rows="5">${esc(o.notes || '')}</textarea>
      <label style="margin-top:10px">טיוטת הודעת פולואפ<textarea data-t="o" data-k="followup_draft" placeholder="בהמשך: AI יכתוב כאן הודעה לפי השיחה">${esc(o.followup_draft || '')}</textarea></label>
      ${o.followup_draft ? `<a class="btn sm" style="margin-top:6px" target="_blank" rel="noopener" href="${waLink(c.phone, o.followup_draft)}">שליחת הטיוטה בוואטסאפ</a>` : ''}
    </section></div>`;
  },
  quote: ({ o, lines }) => {
    const qtyOf = pid => lines.find(l => l.product_id === pid)?.qty || '';
    const row = p => `<tr><td class="wrap">${esc(p.name)}${p.notes ? `<div class="small muted">${esc(p.notes)}</div>` : ''}</td><td class="num">${money(p.unit_price)}</td>
      <td><input class="qty" type="number" min="0" inputmode="numeric" data-line="${p.id}" value="${qtyOf(p.id)}"></td></tr>`;
    const media = S.products.filter(p => p.category === 'media' && (p.active || qtyOf(p.id)));
    const extras = S.products.filter(p => (p.category === 'addon' || p.category === 'repair') && (p.active || qtyOf(p.id)));
    const ctx = { o };
    return `<div class="grid cols-2">
      <section class="card"><h2>חומרה</h2><div class="table-wrap"><table><thead><tr><th>סוג</th><th class="num">מחיר</th><th>כמות${info('quote.qty')}</th></tr></thead><tbody>${media.map(row).join('')}</tbody></table></div></section>
      <div class="grid">
        <section class="card"><h2>תוספות</h2><div class="table-wrap"><table><thead><tr><th>תוספת</th><th class="num">מחיר</th><th>כמות${info('quote.qty')}</th></tr></thead><tbody>${extras.map(row).join('')}</tbody></table></div></section>
        <section class="card"><div class="fields">
          <label><span class="lt">חבילה${info('o.package_id')}</span><select data-t="o" data-k="package_id"><option value=""></option>${S.products.filter(p => p.category === 'package' && (p.active || p.id === o.package_id)).map(p => `<option value="${p.id}" ${o.package_id === p.id ? 'selected' : ''}>${esc(p.name)} (${money(p.unit_price)})</option>`).join('')}</select></label>
          <label><span class="lt">קופון${info('o.coupon_code')}</span><select data-t="o" data-k="coupon_code"><option value=""></option>${S.coupons.filter(x => x.active || x.code === o.coupon_code).map(x => `<option ${x.code === o.coupon_code ? 'selected' : ''}>${esc(x.code)}</option>`).join('')}</select></label>
          ${F(ctx, 'o', 'manual_discount', 'הנחה ידנית (₪)', 'number', 'min="0" step="1"')}
        </div><div class="row" style="margin-top:8px">${CHK(ctx, 'o', 'priority', 'קדימות בתור')}</div></section>
        <section class="card"><h2>סיכום <span class="row"><button class="btn sm" id="copyQuote">העתקה לוואטסאפ</button>${info('quote.copy')}<a class="btn sm" href="#quote/${o.id}">PDF</a>${info('quote.pdf')}</span></h2><div id="totalsBox">${totalsHtml(o)}</div></section>
      </div></div>`;
  },
  ops: ({ o }) => {
    const ctx = { o };
    return `<div class="grid cols-2">
    <section class="card"><h2>שילוח ומעבדה</h2><div class="fields">
      <label class="${o.phase === 'ops' && !o.lab_id ? 'missing' : ''}"><span class="lt">מעבדה${info('o.lab_id')}</span><select data-t="o" data-k="lab_id"><option value=""></option>${S.labs.filter(l => l.active || l.id === o.lab_id).map(l => `<option value="${l.id}" ${o.lab_id === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
      ${SEL(ctx, 'o', 'courier', 'חברת שליחויות', 'courier')}${F(ctx, 'o', 'pickup_date', 'תאריך איסוף', 'date')}${F(ctx, 'o', 'pickup_tracking', 'מס\' מעקב איסוף')}
      ${F(ctx, 'o', 'files_link_from_lab', 'קישור קבצים מהמעבדה', 'url')}
    </div><div class="row help-host" style="margin-top:8px"><a class="btn sm" href="#manifest/${o.id}">דף משלוח להדפסה</a>${info('items.manifest')}<a class="btn sm" href="#labels/${o.id}">מדבקות</a>${info('items.labels')}</div></section>
    <section class="card"><h2>אבני דרך${info('ops.milestones')}</h2>${MILESTONES.filter(([k]) => k !== 'cash_received_at' || /מזומן/.test((o.payment_method || '') + o.payment_status)).map(([k, l]) => milestone(o, k, l)).join('')}</section>
    <section class="card"><h2>תשלום</h2><div class="fields">
      ${SEL(ctx, 'o', 'payment_status', 'סטטוס תשלום', 'payment_status')}${SEL(ctx, 'o', 'payment_method', 'אמצעי', 'payment_method')}
      ${F(ctx, 'o', 'paid_amount', 'סכום ששולם', 'number', 'step="1"')}${F(ctx, 'o', 'invoice_number', 'מס\' חשבונית (SUMIT)')}
    </div></section>
    <section class="card"><h2>מסירה ללקוח</h2><div class="fields">
      ${F(ctx, 'o', 'delivery_link', 'קישור הורדה ללקוח', 'url')}<label>הקישור נמחק<input disabled value="${esc(fmtDate(o.delivery_link_expires))}"></label>
      ${F(ctx, 'o', 'personal_cloud_link', 'ענן אישי של הלקוח', 'url')}${F(ctx, 'o', 'drive_folder_url', 'תיקיית דרייב (תמונות מהלקוח)', 'url')}
      ${SEL(ctx, 'o', 'return_method', 'החזרת החומרה', 'return_method')}${F(ctx, 'o', 'return_tracking', 'מס\' מעקב החזרה')}
    </div><div class="row" style="margin-top:8px">${CHK(ctx, 'o', 'cloud_affiliate', 'נמכר מנוי ענן (אפיליאייט)')}</div></section>
    <section class="card"><h2>אחרי סיום</h2>${AFTER.map(([k, l]) => milestone(o, k, l)).join('')}
      <div class="fields" style="margin-top:8px">${F(ctx, 'o', 'gift_sent', 'מתנה שנשלחה')}</div><div class="row" style="margin-top:8px">${CHK(ctx, 'o', 'story_posted', 'פרסם סטורי ותייג')}</div></section>
    </div>`;
  },
  items: ({ o, items }) => {
    const statuses = (S.opts.item_status || []).filter(x => x.active).map(x => x.value);
    return `<section class="card"><h2>פריטים <span class="row"><button class="btn sm" id="genItems">יצירת פריטים לפי הכמויות</button>${info('items.gen')}<a class="btn sm" href="#labels/${o.id}">מדבקות</a>${info('items.labels')}<a class="btn sm" href="#manifest/${o.id}">דף משלוח</a>${info('items.manifest')}</span></h2>
    ${items.length ? `<div class="row small" style="margin-bottom:8px">הוצהר: <b>${o.media_qty}</b> · פריטים: <b>${items.length}</b> · במעבדה ואילך: <b>${o.items_at_lab_or_later}</b> · הומרו: <b>${o.items_converted}</b>${o.intake_done_at ? ` · קליטה הסתיימה ${fmtDT(o.intake_done_at)}` : ''}</div>
    <div class="table-wrap"><table><thead><tr><th>ברקוד</th><th>סוג</th><th>מה כתוב עליו${info('items.label_text')}</th><th>סטטוס${info('items.status')}</th><th>איפה עכשיו</th><th>פגום</th><th>הערה</th></tr></thead><tbody>
    ${items.map(it => `<tr data-item="${esc(it.id)}"><td><b>${esc(it.id)}</b></td><td class="small wrap">${esc(productName(it.product_id))}</td>
      <td><input data-ik="label_text" value="${esc(it.label_text || '')}"></td>
      <td><select data-ik="status">${statuses.map(s => `<option ${s === it.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></td>
      <td class="small">${esc((ITEM_LOC[it.status] || '') + (['במעבדה', 'הומר', 'לא ניתן להמרה'].includes(it.status) && o.lab_name ? ': ' + o.lab_name : ''))}</td>
      <td><input type="checkbox" data-ik="damaged" ${it.damaged ? 'checked' : ''}></td>
      <td><input data-ik="notes" value="${esc(it.notes || '')}"></td></tr>`).join('')}</tbody></table></div>`
    : '<p class="muted small">עדיין אין פריטים. ממלאים כמויות בלשונית "הצעת מחיר" ולוחצים "יצירת פריטים". כל קלטת, דיסק או סליל מקבל ברקוד משלו (תמונות ושקופיות נספרות כקבוצה).</p>'}</section>`;
  },
  history: ({ o, events }) => `<div class="grid cols-2">
    <section class="card"><h2>הוספת הערה</h2><form id="noteForm" class="row"><input name="t" placeholder="מה קרה בשיחה / עדכון" required style="flex:1"><button class="btn primary sm">הוספה</button></form></section>
    <section class="card"><h2>היסטוריה</h2><ul class="timeline">${events.map(ev => `<li><span class="muted">${fmtDT(ev.at)}${ev.by_email ? ' · ' + esc(ev.by_email.split('@')[0]) : ''}</span><br>${ev.kind === 'stage' ? 'שלב' : ev.kind === 'payment' ? 'תשלום' : ev.kind === 'contact' ? 'שיחה' : 'הערה'}: ${esc(ev.old_value ? ev.old_value + ' ← ' : '')}${esc(ev.new_value || '')}</li>`).join('') || '<li class="muted">אין</li>'}</ul></section>
    ${isAdmin() ? `<section class="card"><h2>ניהול</h2><button class="btn danger sm" id="delOrder">מחיקת ההזמנה</button><p class="muted small">מוחק את ההזמנה, השורות והפריטים שלה. הלקוח נשאר.</p></section>` : ''}
  </div>`,
};
function totalsHtml(o) {
  return `<div class="totals">
    <span>חומרה (${o.media_qty} פריטים)</span><span>${money(o.media_subtotal)}</span>
    ${o.tier_percent > 0 ? `<span>הנחת כמות ${Number(o.tier_percent)}%</span><span>-${money(o.tier_discount)}</span>` : ''}
    ${o.extras_subtotal > 0 ? `<span>תוספות${o.package_name ? ' + ' + esc(o.package_name) : ''}</span><span>${money(o.extras_subtotal)}</span>` : ''}
    ${o.coupon_percent > 0 || o.coupon_amount > 0 ? `<span>קופון ${esc(o.coupon_code)}</span><span>${o.coupon_percent > 0 ? '-' + Number(o.coupon_percent) + '%' : ''} ${o.coupon_amount > 0 ? '-' + money(o.coupon_amount) : ''}</span>` : ''}
    ${o.manual_discount > 0 ? `<span>הנחה ידנית</span><span>-${money(o.manual_discount)}</span>` : ''}
    ${o.media_units > 0 && Number(o.total) > Number(o.total_raw) ? `<span class="muted">הושלם למינימום הזמנה</span><span></span>` : ''}
    <span class="grand">סה"כ כולל מע"מ</span><span class="grand">${money(o.total)}</span></div>`;
}
async function refreshOrderLight(ctx) {
  const o = await getOrder(ctx.o.id); ctx.o = o;
  if ($('#totalsBox')) $('#totalsBox').innerHTML = totalsHtml(o);
  if ($('#headFlags')) $('#headFlags').innerHTML = headFlags(o);
  const w = $('#reqWarn'); if (w) { const m = showRequired(o) ? missingForPaid(o, ctx.c) : []; w.className = m.length ? 'warn' : ''; w.textContent = m.length ? 'חסר לפני תשלום: ' + m.join(', ') : ''; }
  $$('[data-wrap]').forEach(l => { const k = l.dataset.wrap; if (REQUIRED_BEFORE_PAID.some(r => r[0] === k)) l.classList.toggle('missing', showRequired(o) && !String(ctx.c[k] || '').trim()); });
}
function bindOrder(ctx, tab) {
  const { o, c } = ctx;
  $$('#tabBody [data-t]').forEach(el => el.addEventListener('change', async () => {
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'datetime-local') v = v ? new Date(v).toISOString() : null; else if (v === '') v = null;
    const k = el.dataset.k;
    if (k === 'lab_id' || k === 'package_id') v = v ? Number(v) : null;
    if (k === 'manual_discount') v = v ? Number(v) : 0;
    const patch = { [k]: v };
    if (k === 'payment_status' && v === 'שולם' && !ctx.o.paid_amount) patch.paid_amount = Number(ctx.o.total) || null;
    const isC = el.dataset.t === 'c';
    const { error } = await sb.from(isC ? 'customers' : 'orders').update(patch).eq('id', isC ? c.id : o.id); fail(error);
    if (isC) c[k] = v; toast('נשמר');
    refreshOrderLight(ctx);
  }));
  $$('[data-fu]').forEach(b => b.onclick = async () => { const d = addDays(Number(b.dataset.fu)); const { error } = await sb.from('orders').update({ next_followup: d }).eq('id', o.id); fail(error); $('[data-k="next_followup"]').value = d; toast('פולואפ נקבע ל-' + fmtDate(d)); });
  $$('[data-line]').forEach(el => el.addEventListener('change', async () => {
    const qty = Number(el.value || 0), pid = Number(el.dataset.line);
    const r = qty > 0 ? await sb.from('order_lines').upsert({ order_id: o.id, product_id: pid, qty }, { onConflict: 'order_id,product_id' })
      : await sb.from('order_lines').delete().eq('order_id', o.id).eq('product_id', pid);
    fail(r.error);
    const l = ctx.lines.find(x => x.product_id === pid); if (l) l.qty = qty; else if (qty) ctx.lines.push({ order_id: o.id, product_id: pid, qty });
    refreshOrderLight(ctx);
  }));
  $('#copyQuote') && ($('#copyQuote').onclick = async () => { const t = quoteText(ctx.o, c, ctx.lines); try { await navigator.clipboard.writeText(t); toast('ההצעה הועתקה'); } catch { tell('טקסט ההצעה', t); } });
  $$('[data-msnow]').forEach(b => b.onclick = async () => { const k = b.dataset.msnow; const { error } = await sb.from('orders').update({ [k]: new Date().toISOString() }).eq('id', o.id); fail(error); toast('נרשם'); vOrder(o.id); });
  $$('[data-msedit]').forEach(b => b.onclick = async () => {
    const k = b.dataset.msedit;
    const f = await formModal('עריכת תאריך', `<label>תאריך ושעה<input type="datetime-local" name="v" value="${toLocalInput(o[k])}"></label><p class="muted small">שדה ריק = מחיקת התאריך</p>`);
    if (!f) return; const { error } = await sb.from('orders').update({ [k]: f.v ? new Date(f.v).toISOString() : null }).eq('id', o.id); fail(error); vOrder(o.id);
  });
  $('#genItems') && ($('#genItems').onclick = async () => { const { data, error } = await sb.rpc('generate_items', { p_order: o.id }); fail(error); toast(data ? `נוצרו ${data} פריטים` : 'אין פריטים חדשים ליצירה'); vOrder(o.id); });
  $$('[data-item] [data-ik]').forEach(el => el.addEventListener('change', async () => {
    const v = el.type === 'checkbox' ? el.checked : (el.value || null);
    const { error } = await sb.from('items').update({ [el.dataset.ik]: v }).eq('id', el.closest('tr').dataset.item); fail(error); toast('נשמר');
  }));
  $('#noteForm') && ($('#noteForm').onsubmit = async e => { e.preventDefault(); const t = new FormData(e.target).get('t'); const { error } = await sb.rpc('add_note', { p_order: o.id, p_text: t }); fail(error); vOrder(o.id); });
  $('#delOrder') && ($('#delOrder').onclick = async () => {
    const f = await formModal('מחיקת הזמנה ' + o.id, `<p>הפעולה לא ניתנת לביטול. כדי לאשר, הקלידו את מספר ההזמנה.</p><label>מספר הזמנה<input name="n" required></label>`, { ok: 'מחיקה סופית' });
    if (!f || f.n.trim() !== String(o.id)) return f && tell('לא נמחק', 'המספר לא תאם.');
    const { error } = await sb.from('orders').delete().eq('id', o.id); fail(error); toast('ההזמנה נמחקה'); location.hash = 'orders';
  });
}

function quoteText(o, c, lines) {
  const L = [`שלום ${firstName(c.full_name)}, הנה הצעת המחיר מהמעבדה להמרת קלטות ודיסקים (הזמנה ${o.id}):`, ''];
  lines.forEach(l => { const p = S.products.find(x => x.id === l.product_id); if (!p || !l.qty) return; L.push(`• ${l.qty} × ${p.name}: ${money(l.qty * (l.unit_price ?? p.unit_price))}`); });
  if (o.package_name) L.push(`• ${o.package_name}: ${money(S.products.find(p => p.id === o.package_id)?.unit_price)}`);
  if (o.tier_percent > 0) L.push(`הנחת כמות ${Number(o.tier_percent)}%: -${money(o.tier_discount)}`);
  if (o.coupon_percent > 0) L.push(`קופון ${o.coupon_code}: -${Number(o.coupon_percent)}%`);
  if (o.coupon_amount > 0) L.push(`קופון ${o.coupon_code}: -${money(o.coupon_amount)}`);
  if (o.manual_discount > 0) L.push(`הנחה: -${money(o.manual_discount)}`);
  L.push('', `סה"כ לתשלום: ${money(o.total)} (כולל מע"מ)`, '');
  if (S.settings.terms?.text_value) L.push(S.settings.terms.text_value);
  return L.join('\n');
}

// ---------- print pages ----------
async function vQuote(id) {
  const o = await getOrder(id);
  const { data: c } = await sb.from('customers').select('*').eq('id', o.customer_id).single();
  const { data: lines } = await sb.from('order_lines').select('*').eq('order_id', id);
  const rows = lines.filter(l => l.qty).map(l => { const p = S.products.find(x => x.id === l.product_id); const pr = l.unit_price ?? p.unit_price; return `<tr><td class="wrap">${esc(p.name)}</td><td class="num">${l.qty}</td><td class="num">${money(pr)}</td><td class="num">${money(pr * l.qty)}</td></tr>`; }).join('');
  view().innerHTML = `
  <div class="row no-print" style="margin-bottom:12px"><button class="btn primary" onclick="print()">הדפסה / שמירה כ-PDF</button><a class="btn" href="#order/${id}">חזרה להזמנה</a></div>
  <div class="card paper">
    <div class="row spread"><h1>הצעת מחיר</h1><div class="muted">הזמנה ${o.id} · ${fmtDate(new Date())}</div></div>
    <p><b>המעבדה להמרת קלטות ודיסקים</b></p><p>לכבוד: ${esc(c.full_name || '')} · ${esc(fmtPhone(c.phone))}${c.city ? ' · ' + esc(c.city) : ''}</p>
    <table><thead><tr><th>פריט</th><th class="num">כמות</th><th class="num">מחיר</th><th class="num">סה"כ</th></tr></thead><tbody>${rows}
    ${o.package_name ? `<tr><td>${esc(o.package_name)}</td><td class="num">1</td><td></td><td class="num">${money(S.products.find(p => p.id === o.package_id)?.unit_price)}</td></tr>` : ''}</tbody></table>
    <div class="totals" style="margin-top:12px;max-width:340px;margin-inline-start:auto">
      ${o.tier_percent > 0 ? `<span>הנחת כמות ${Number(o.tier_percent)}%</span><span>-${money(o.tier_discount)}</span>` : ''}
      ${o.coupon_code ? `<span>קופון ${esc(o.coupon_code)}</span><span>${o.coupon_percent > 0 ? '-' + Number(o.coupon_percent) + '%' : '-' + money(o.coupon_amount)}</span>` : ''}
      ${o.manual_discount > 0 ? `<span>הנחה</span><span>-${money(o.manual_discount)}</span>` : ''}
      <span>לפני מע"מ</span><span>${money(o.total_before_vat)}</span><span class="grand">סה"כ כולל מע"מ</span><span class="grand">${money(o.total)}</span></div>
    <p class="small" style="margin-top:20px;white-space:pre-line">${esc(S.settings.terms?.text_value || '')}</p></div>`;
}
async function vLabels(id) {
  const { data: items, error } = await sb.from('items').select('*').eq('order_id', id).order('seq'); fail(error);
  const o = await getOrder(id);
  view().innerHTML = `
  <div class="row no-print" style="margin-bottom:12px"><button class="btn primary" onclick="print()">הדפסה</button><a class="btn" href="#order/${id}">חזרה להזמנה</a>
    <span class="muted small">דף A4, 3×8 מדבקות (70×37 מ"מ). המעבדה מדביקה על כל פריט בקליטה.</span></div>
  <div class="labels">${items.map(it => `<div class="lbl"><svg data-code="${esc(it.id)}"></svg><div>${esc(firstName(o.full_name))} · ${esc(productName(it.product_id).split(' (')[0])} · ${it.seq}/${items.length}</div></div>`).join('') || '<p>אין פריטים. צריך ליצור אותם מדף ההזמנה.</p>'}</div>`;
  $$('svg[data-code]').forEach(svg => JsBarcode(svg, svg.dataset.code, { format: 'CODE128', height: 50, fontSize: 16, margin: 2 }));
}
async function vManifest(id) {
  const o = await getOrder(id);
  const { data: items } = await sb.from('items').select('*').eq('order_id', id).order('seq');
  const { data: lines } = await sb.from('order_lines').select('*').eq('order_id', id);
  const byType = lines.filter(l => S.products.find(p => p.id === l.product_id)?.category === 'media' && l.qty);
  view().innerHTML = `
  <div class="row no-print" style="margin-bottom:12px"><button class="btn primary" onclick="print()">הדפסה</button><a class="btn" href="#order/${id}">חזרה להזמנה</a>
    <span class="muted small">מדפיסים 2 עותקים: אחד נשאר אצל המוסר, אחד נוסע עם החבילה.</span></div>
  <div class="card paper">
    <div class="row spread"><h1>דף משלוח · הזמנה ${o.id}</h1><svg id="mbar"></svg></div>
    <div class="fields" style="margin-bottom:12px"><div><b>לקוח:</b> ${esc(firstName(o.full_name))}${o.city ? ', ' + esc(o.city) : ''}</div><div><b>מעבדה:</b> ${esc(o.lab_name || '________')}</div>
      <div><b>תאריך:</b> ${fmtDate(new Date())}</div><div><b>סה"כ פריטים:</b> ${o.media_qty}</div></div>
    <p><b>סיכום לפי סוג:</b> ${byType.map(l => `${esc(productName(l.product_id))}: ${l.qty}`).join(' · ') || '-'}</p>
    <table><thead><tr><th>✓</th><th>ברקוד</th><th>סוג</th><th>מה כתוב עליו</th><th>הערה</th></tr></thead><tbody>
      ${items.map(it => `<tr><td>☐</td><td><b>${esc(it.id)}</b></td><td class="wrap">${esc(productName(it.product_id))}</td><td class="wrap">${esc(it.label_text || '')}</td><td class="wrap">${it.damaged ? 'פגום. ' : ''}${esc(it.notes || '')}</td></tr>`).join('') || '<tr><td colspan="5">אין פריטים. צריך ליצור אותם מדף ההזמנה.</td></tr>'}</tbody></table>
    <div class="sign"><div>מסר: ____________ חתימה: ____________</div><div>קיבל: ____________ חתימה: ____________</div><div>תאריך ושעה: ____________ נספרו: ______ פריטים</div></div>
  </div>`;
  JsBarcode('#mbar', String(o.id), { format: 'CODE128', height: 40, fontSize: 14, margin: 0 });
}

// ---------- SCAN (staff + lab) ----------
let scanner = null, lastCode = '', lastAt = 0;
function stopScanner() { if (scanner) { scanner.stop().catch(() => {}); scanner = null; } }
async function vScan() {
  const all = (S.opts.item_status || []).filter(x => x.active).map(x => x.value);
  const statuses = isLab() ? all.filter(s => ['במעבדה', 'הומר', 'לא ניתן להמרה'].includes(s)) : all;
  let current = sessionStorage.getItem('scanStatus'); if (!statuses.includes(current)) current = statuses.includes('במעבדה') ? 'במעבדה' : statuses[0];
  view().innerHTML = `
    <h1>סריקת פריטים</h1>
    ${intro('scan')}
    <div class="card grid">
      <div><div class="muted small" style="margin-bottom:6px">1. לאיזה סטטוס להעביר:</div><div class="status-pick">${statuses.map(s => `<button class="btn sm ${s === current ? 'on' : ''}" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>
      <div><div class="muted small" style="margin-bottom:6px">2. סורקים ברצף, או מקלידים מספר:</div>
        <div class="row"><button class="btn primary" id="camBtn">הפעלת מצלמה</button><input id="manual" placeholder="למשל 1001-03" style="max-width:170px" inputmode="numeric"><button class="btn" id="manualBtn">עדכון</button></div></div>
      <div id="reader"></div>
      <div id="orderBox"></div>
      <ul class="task-list scan-log" id="log"></ul>
    </div>`;
  $$('[data-s]').forEach(b => b.onclick = () => { current = b.dataset.s; sessionStorage.setItem('scanStatus', current); $$('[data-s]').forEach(x => x.classList.toggle('on', x === b)); });
  const showOrder = async orderId => {
    const { data: its } = await sb.from('items').select('id, status').eq('order_id', orderId);
    const n = its.filter(i => i.status === current).length;
    $('#orderBox').innerHTML = `<div class="card scan-count"><div class="row spread"><b>הזמנה ${orderId}</b><span class="big">${n}/${its.length}</span></div>
      <div class="small muted">פריטים בסטטוס "${esc(current)}"</div>
      ${current === 'במעבדה' ? `<button class="btn primary" style="margin-top:8px" data-finish="${orderId}">סיום קליטה להזמנה ${orderId}</button>` : ''}</div>`;
    $('[data-finish]')?.addEventListener('click', async e => {
      const miss = its.length - n;
      if (miss && !await ask('חסרים פריטים', `נקלטו ${n} מתוך ${its.length}. חסרים ${miss}. לסיים קליטה ולסמן פער?`, { ok: 'סיום עם פער' })) return;
      const { error } = await sb.rpc('finish_intake', { p_order: Number(e.target.dataset.finish) }); fail(error); toast('הקליטה נסגרה');
    });
  };
  const handle = async code => {
    code = code.trim(); if (!code) return;
    const now = Date.now(); if (code === lastCode && now - lastAt < 3000) return; lastCode = code; lastAt = now;
    const { data, error } = await sb.from('items').update({ status: current }).eq('id', code).select('id, order_id');
    const li = document.createElement('li');
    if (error || !data?.length) { li.innerHTML = `<span class="chip red">${esc(code)}</span><span>לא נמצא${isLab() ? ' (או לא שייך למעבדה שלך)' : ''}</span>`; navigator.vibrate?.(300); }
    else { li.innerHTML = `<span><b>${esc(code)}</b> <span class="small muted">הזמנה ${data[0].order_id}</span></span><span class="chip green">${esc(current)}</span>`; navigator.vibrate?.(60); showOrder(data[0].order_id); }
    $('#log').prepend(li);
  };
  $('#manualBtn').onclick = () => { handle($('#manual').value); $('#manual').value = ''; $('#manual').focus(); };
  $('#manual').onkeydown = e => { if (e.key === 'Enter') $('#manualBtn').click(); };
  $('#camBtn').onclick = async () => {
    if (scanner) { stopScanner(); $('#camBtn').textContent = 'הפעלת מצלמה'; return; }
    scanner = new Html5Qrcode('reader', { formatsToSupport: [Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.QR_CODE] });
    try { await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 280, height: 120 } }, handle); $('#camBtn').textContent = 'עצירת מצלמה'; }
    catch (e) { toast('אין גישה למצלמה: ' + e, 4000); scanner = null; }
  };
}

// ---------- LAB home ----------
async function vLab() {
  const { data, error } = await sb.rpc('lab_orders'); fail(error);
  view().innerHTML = `<div class="row spread"><h1>${esc(S.me.lab_name || 'המעבדה')}: הזמנות פתוחות</h1><a class="btn primary" href="#scan">סריקה</a></div>
    ${intro('lab')}
    <div class="card table-wrap"><table><thead><tr><th>הזמנה</th><th>שם</th><th class="num">פריטים</th><th class="num">נקלטו</th><th class="num">הומרו</th><th>קליטה</th><th></th></tr></thead><tbody>
    ${data.map(r => `<tr><td><b>${r.id}</b>${r.priority ? ' <span class="chip orange">קדימות</span>' : ''}</td><td>${esc(r.first_name)}</td><td class="num">${r.items_count}</td><td class="num">${r.items_received}</td><td class="num">${r.items_converted}</td>
      <td>${r.intake_done ? '<span class="chip green">הסתיימה</span>' : '<span class="chip">פתוחה</span>'}</td>
      <td>${r.intake_done ? '' : `<button class="btn sm" data-finish="${r.id}">סיום קליטה</button>`}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">אין הזמנות פתוחות</td></tr>'}</tbody></table></div>
    <p class="muted small">סורקים כל פריט בקליטה ("במעבדה") ובסיום ההמרה ("הומר"). פריט שלא ניתן להמיר מסמנים "לא ניתן להמרה".</p>`;
  $$('[data-finish]').forEach(b => b.onclick = async () => {
    const r = data.find(x => String(x.id) === b.dataset.finish);
    if (r.items_received < r.items_count && !await ask('חסרים פריטים', `נקלטו ${r.items_received} מתוך ${r.items_count}. לסיים בכל זאת?`, { ok: 'סיום עם פער' })) return;
    const { error } = await sb.rpc('finish_intake', { p_order: r.id }); fail(error); vLab();
  });
}

// ---------- public tracking page ----------
async function vTrack(token) {
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden'); $('.topbar').classList.add('hidden');
  const { data, error } = await sb.rpc('track_order', { p_token: token });
  if (error || !data) { view().innerHTML = '<div class="card paper"><h1>ההזמנה לא נמצאה</h1><p>בדקו את הקישור או פנו אלינו בוואטסאפ.</p></div>'; return; }
  const steps = [['ההזמנה התקבלה', data.paid_at], ['החומרים נאספו', data.picked_up_at], ['במעבדה, בעבודה', data.lab_received_at], ['ההמרה הסתיימה', data.conversion_done_at], ['הקבצים נשלחו אליכם', data.delivery_sent_at], ['הושלם', data.completed_at || data.returned_at]];
  const curIdx = steps.reduce((a, s, i) => s[1] ? i : a, -1);
  view().innerHTML = `<div class="card paper track">
    <h1>שלום ${esc(data.first_name)}, זה מצב ההזמנה שלך</h1><p class="muted">הזמנה ${data.id} · המעבדה להמרת קלטות ודיסקים</p>
    <ol class="steps">${steps.map(([l, d], i) => `<li class="${i <= curIdx ? 'done' : ''} ${i === curIdx ? 'cur' : ''}"><span class="b">${i <= curIdx ? '✓' : i + 1}</span><span>${l}${d ? `<span class="small muted"> · ${fmtDate(d)}</span>` : ''}</span></li>`).join('')}</ol>
    ${data.items_count ? `<p>${data.items_converted} מתוך ${data.items_count} פריטים הומרו.</p>` : ''}
    ${data.delivery_link ? `<a class="btn primary" href="${esc(data.delivery_link)}" target="_blank" rel="noopener">להורדת הקבצים</a>` : ''}
    <p class="small muted" style="margin-top:16px">שאלות? פשוט עונים לנו בוואטסאפ.</p></div>`;
}

// ---------- DASHBOARD ----------
async function vDash() {
  const rows = await getOrders();
  const [{ data: exp }, { data: lines }] = await Promise.all([sb.from('expenses').select('*'), sb.from('order_lines').select('order_id, product_id, qty, unit_price')]);
  const month = today().slice(0, 7);
  const sel = sessionStorage.getItem('dashMonth') || month;
  const prevOf = m => { const [y, mm] = m.split('-').map(Number); const d = new Date(y, mm - 2, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const prev = prevOf(sel);
  const stats = m => {
    const inM = d => d && d.slice(0, 7) === m;
    const leads = rows.filter(r => inM(r.created_at)), paid = rows.filter(r => inM(r.paid_at) && r.payment_status !== 'הוחזר');
    const revenue = paid.reduce((s, r) => s + Number(r.paid_amount || r.total || 0), 0);
    const expM = (exp || []).filter(e => e.spent_on.slice(0, 7) === m);
    return { leads, paid, revenue, closed: leads.filter(r => r.paid_at).length, lost: rows.filter(r => r.stage === 'אבוד' && inM(r.stage_changed_at)),
      ads: expM.filter(e => e.category === 'פרסום').reduce((s, e) => s + Number(e.amount), 0), expTotal: expM.reduce((s, e) => s + Number(e.amount), 0) };
  };
  const A = stats(sel), B = stats(prev);
  const delta = (a, b, pct = false) => { if (!b) return ''; const d = a - b; return `<span class="delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${pct ? Math.abs(d) + ' נק\'' : Math.abs(Math.round(d / b * 100)) + '%'}</span>`; };
  const conv = s => s.leads.length ? Math.round(s.closed / s.leads.length * 100) : 0;
  const done = rows.filter(r => r.completed_at && r.paid_at);
  const avgDays = arr => arr.length ? Math.round(arr.reduce((s, r) => s + (new Date(r.completed_at) - new Date(r.paid_at)) / 864e5, 0) / arr.length) : null;
  const countBy = (arr, key) => { const m = {}; arr.forEach(r => { const k = (typeof key === 'function' ? key(r) : r[key]) || 'לא צוין'; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const bars = (pairs, fmt = v => v) => { const max = Math.max(1, ...pairs.map(p => p[1])); return pairs.map(([k, v]) => `<div class="bar-row"><span>${esc(k)}</span><div class="bar-track"><div class="bar-fill" style="width:${v / max * 100}%"></div></div><span class="num">${fmt(v)}</span></div>`).join('') || '<p class="muted small">אין נתונים</p>'; };
  const kpi = (v, l, d = '') => `<div class="card kpi"><div class="v">${v}</div><div class="l">${l} ${d}</div></div>`;
  const srcConv = k => { const s = rows.filter(x => (x.source || 'לא צוין') === k); return s.length ? Math.round(s.filter(x => x.paid_at).length / s.length * 100) : 0; };
  const pipeline = rows.filter(r => r.phase === 'sales').reduce((s, r) => s + Number(r.total || 0), 0);
  const paidIds = new Set(A.paid.map(r => r.id));
  const revByType = {}; (lines || []).filter(l => paidIds.has(l.order_id)).forEach(l => { const p = S.products.find(x => x.id === l.product_id); if (!p) return; const k = p.category === 'media' ? p.name.split(' (')[0] : 'תוספות'; revByType[k] = (revByType[k] || 0) + l.qty * Number(l.unit_price ?? p.unit_price); });
  const labDays = S.labs.map(l => [l.name, avgDays(done.filter(r => r.lab_id === l.id))]).filter(x => x[1] != null);
  const months = [...new Set(rows.map(r => r.created_at.slice(0, 7)).concat([month]))].sort().reverse();
  view().innerHTML = `
    <div class="row spread"><h1>מדדים</h1><select id="dm" style="max-width:160px">${months.map(m => `<option ${m === sel ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
    ${intro('dash')}
    <div class="grid cols-4">
      ${kpi(A.leads.length, 'לידים', delta(A.leads.length, B.leads.length))}
      ${kpi(conv(A) + '%', 'אחוז סגירה', B.leads.length ? delta(conv(A), conv(B), true) : '')}
      ${kpi(money(A.revenue), 'הכנסות (שולם)', delta(A.revenue, B.revenue))}
      ${kpi(A.paid.length ? money(Math.round(A.revenue / A.paid.length)) : '-', 'ממוצע הזמנה')}
      ${kpi(money(pipeline), 'שווי צנרת (לידים פתוחים)')}
      ${kpi(rows.filter(r => r.phase === 'ops').length, 'הזמנות בתפעול')}
      ${kpi(avgDays(done) != null ? avgDays(done) + ' ימים' : '-', 'זמן ממוצע מתשלום לסיום')}
      ${kpi(A.ads && A.leads.length ? money(Math.round(A.ads / A.leads.length)) : '-', 'עלות לליד')}
    </div>
    <div class="grid cols-2" style="margin-top:12px">
      <section class="card"><h2>לידים לפי ערוץ (החודש)</h2>${bars(countBy(A.leads, 'source'))}</section>
      <section class="card"><h2>אחוז סגירה לפי ערוץ (כל הזמן)</h2>${bars(countBy(rows, 'source').map(([k]) => [k, srcConv(k)]), v => v + '%')}</section>
      <section class="card"><h2>למה לא קנו (החודש)</h2>${bars(countBy(A.lost, 'loss_category'))}</section>
      <section class="card"><h2>צנרת מכירה עכשיו</h2>${bars(stagesOf('sales').map(s => [s, rows.filter(r => r.stage === s).length]))}</section>
      <section class="card"><h2>הכנסה לפי סוג (החודש)</h2>${bars(Object.entries(revByType).sort((a, b) => b[1] - a[1]), money)}</section>
      <section class="card"><h2>תפעול: הזמנות לפי שלב</h2>${bars(stagesOf('ops').map(s => [s, rows.filter(r => r.stage === s).length]))}</section>
      <section class="card"><h2>הזמנות פתוחות לפי מעבדה</h2>${bars(countBy(rows.filter(r => r.phase === 'ops'), 'lab_name'))}</section>
      <section class="card"><h2>ימים ממוצעים עד סיום, לפי מעבדה</h2>${bars(labDays, v => v + ' ימים')}</section>
      <section class="card"><h2>כסף החודש</h2><div class="totals">
        <span>הכנסות</span><span>${money(A.revenue)}</span><span>הוצאות</span><span>-${money(A.expTotal)}</span>
        <span>מתוכן פרסום</span><span>${money(A.ads)}</span><span class="grand">נשאר</span><span class="grand">${money(A.revenue - A.expTotal)}</span></div></section>
    </div>`;
  $('#dm').onchange = e => { sessionStorage.setItem('dashMonth', e.target.value); vDash(); };
}

// ---------- FINANCE ----------
async function vFinance() {
  const { data: exp, error } = await sb.from('expenses').select('*').order('spent_on', { ascending: false }).limit(500); fail(error);
  const month = today().slice(0, 7), sumM = exp.filter(e => e.spent_on.slice(0, 7) === month).reduce((s, e) => s + Number(e.amount), 0);
  view().innerHTML = `
    <div class="row spread"><h1>כספים: הוצאות</h1><span class="muted">החודש: ${money(sumM)}</span></div>
    ${intro('finance')}
    <form id="expForm" class="card fields" style="margin-bottom:12px">
      <label>תאריך<input type="date" name="spent_on" value="${today()}" required></label>
      <label>קטגוריה<select name="category" required>${opts('expense_category', 'פרסום', { empty: false })}</select></label>
      <label>ערוץ (לפרסום)<select name="channel">${opts('source')}</select></label>
      <label>סכום (₪)<input type="number" name="amount" step="0.01" required></label>
      <label>הערה<input name="notes"></label>
      <label>&nbsp;<button class="btn primary">הוספה</button></label>
    </form>
    <div class="card table-wrap"><table><thead><tr><th>תאריך</th><th>קטגוריה</th><th>ערוץ</th><th class="num">סכום</th><th>הערה</th><th></th></tr></thead>
    <tbody>${exp.map(e => `<tr><td>${fmtDate(e.spent_on)}</td><td>${esc(e.category)}</td><td>${esc(e.channel || '')}</td><td class="num">${money(e.amount)}</td><td class="wrap">${esc(e.notes || '')}</td><td><button class="btn sm danger" data-del="${e.id}">מחיקה</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">אין הוצאות</td></tr>'}</tbody></table></div>`;
  $('#expForm').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); if (!f.channel) delete f.channel; const { error } = await sb.from('expenses').insert(f); fail(error); toast('נוספה'); vFinance(); };
  $$('[data-del]').forEach(b => b.onclick = async () => { if (!await ask('למחוק את ההוצאה?', '', { ok: 'מחיקה', danger: true })) return; const { error } = await sb.from('expenses').delete().eq('id', b.dataset.del); fail(error); vFinance(); });
}

// ---------- SETTINGS ----------
const LIST_NAMES = { stage: 'שלבים', source: 'מקורות ליד', temperature: 'חום ליד', loss_category: 'סיבות אובדן', payment_method: 'אמצעי תשלום', payment_status: 'סטטוס תשלום', return_method: 'החזרת חומרה', delivery_method: 'דרכי מסירה', courier: 'חברות שליחויות', item_status: 'סטטוס פריט', expense_category: 'קטגוריות הוצאה' };
const LIST_COL = { stage: ['orders', 'stage'], source: ['orders', 'source'], temperature: ['orders', 'temperature'], loss_category: ['orders', 'loss_category'], payment_method: ['orders', 'payment_method'], payment_status: ['orders', 'payment_status'], return_method: ['orders', 'return_method'], courier: ['orders', 'courier'], item_status: ['items', 'status'], expense_category: ['expenses', 'category'] };
async function vSettings() {
  await loadRef();
  const tab = sessionStorage.getItem('setTab') || 'general';
  const tabs = { general: 'כללי', prices: 'מחירון', lists: 'רשימות', templates: 'תבניות וואטסאפ', labs: 'מעבדות', coupons: 'קופונים', staff: 'צוות', backup: 'גיבוי' };
  let body = '';
  if (tab === 'general') body = `<div class="card fields">${Object.values(S.settings).map(s => (s.key === 'terms' || s.key === 'public_url')
      ? `<label style="grid-column:1/-1"><span class="lt">${esc(s.label)}${info('set.' + s.key)}</span>${s.key === 'terms' ? `<textarea data-set="${s.key}" data-f="text_value" rows="4">${esc(s.text_value || '')}</textarea>` : `<input data-set="${s.key}" data-f="text_value" value="${esc(s.text_value || '')}" placeholder="https://...">`}</label>`
      : `<label><span class="lt">${esc(s.label)}${info('set.' + s.key)}</span><input type="number" data-set="${s.key}" data-f="value" value="${esc(s.value)}"></label>`).join('')}</div>
    <div class="card" style="margin-top:12px"><h2>מדרגות הנחה (לפי סך הפריטים)${info('set.tiers')}</h2>
      <table><thead><tr><th>מ-כמה פריטים</th><th>הנחה %</th><th></th></tr></thead><tbody>
      ${S.tiers.map(t => `<tr><td><input type="number" data-tier="${t.id}" data-f="min_items" value="${t.min_items}"></td><td><input type="number" data-tier="${t.id}" data-f="percent" value="${t.percent}"></td><td><button class="btn sm danger" data-deltier="${t.id}">מחיקה</button></td></tr>`).join('')}
      </tbody></table><button class="btn sm" id="addTier" style="margin-top:8px">+ מדרגה</button></div>`;
  if (tab === 'prices') body = `<div class="card table-wrap"><table><thead><tr><th>שם${info('prod.name')}</th><th>סוג${info('prod.category')}</th><th class="num">מחיר${info('prod.unit_price')}</th><th class="num">ממוצע שוק${info('prod.market_avg')}</th><th>נספר להנחה ולברקוד${info('prod.counts_for_tier')}</th><th>כולל (חבילה)${info('prod.includes')}</th><th>פעיל${info('prod.active')}</th></tr></thead><tbody>
    ${S.products.map(p => `<tr><td><input data-prod="${p.id}" data-f="name" value="${esc(p.name)}" style="min-width:200px"></td>
      <td><select data-prod="${p.id}" data-f="category">${['media', 'addon', 'repair', 'package'].map(k => `<option value="${k}" ${p.category === k ? 'selected' : ''}>${{ media: 'חומרה', addon: 'תוספת', repair: 'תיקון', package: 'חבילה' }[k]}</option>`).join('')}</select></td>
      <td><input type="number" step="0.01" data-prod="${p.id}" data-f="unit_price" value="${p.unit_price}" style="width:90px"></td><td class="num muted">${p.market_avg ? money(p.market_avg) : ''}</td>
      <td><input type="checkbox" data-prod="${p.id}" data-f="counts_for_tier" ${p.counts_for_tier ? 'checked' : ''}></td>
      <td><input data-prod="${p.id}" data-f="includes" value="${esc(p.includes || '')}"></td>
      <td><input type="checkbox" data-prod="${p.id}" data-f="active" ${p.active ? 'checked' : ''}></td></tr>`).join('')}
    </tbody></table><button class="btn sm" id="addProd" style="margin-top:8px">+ פריט / תוספת</button>
    <p class="muted small">פריט שכבר נמכר לא נמחק. מכבים אותו ב"פעיל".</p></div>`;
  if (tab === 'lists') body = `<div class="grid cols-3">${Object.entries(LIST_NAMES).map(([list, name]) => `
    <section class="card"><h2>${name}</h2>
      <div class="row nowrap small muted list-head"><span style="flex:1">שם${info('list.value')}</span>${list === 'stage' ? `<span style="width:90px">חלק${info('list.phase')}</span>` : ''}<span style="width:60px">סדר${info('list.sort')}</span><span style="width:24px">פעיל${info('list.active')}</span></div>
      ${(S.opts[list] || []).map(o => `<div class="row nowrap" style="margin-bottom:6px">
      <input data-opt="${o.id}" data-f="value" data-old="${esc(o.value)}" data-list="${list}" value="${esc(o.value)}" style="flex:1">${list === 'stage' ? `<select data-opt="${o.id}" data-f="phase" style="width:90px">${['sales', 'ops', 'done', 'lost'].map(p => `<option value="${p}" ${o.phase === p ? 'selected' : ''}>${{ sales: 'מכירה', ops: 'תפעול', done: 'סיום', lost: 'אבוד' }[p]}</option>`).join('')}</select>` : ''}
      <input type="number" data-opt="${o.id}" data-f="sort" value="${o.sort}" style="width:60px" title="סדר">
      <input type="checkbox" data-opt="${o.id}" data-f="active" ${o.active ? 'checked' : ''} title="פעיל"></div>`).join('')}
      <button class="btn sm" data-addopt="${list}">+ הוספה</button></section>`).join('')}</div>
    <p class="muted small">שינוי שם מציע לעדכן גם את ההזמנות הקיימות. ערך שלא בשימוש מכבים ב-V.</p>`;
  if (tab === 'templates') body = `<div class="grid cols-2">${S.templates.map(t => `<section class="card"><div class="row nowrap"><input data-tpl="${t.id}" data-f="name" value="${esc(t.name)}" style="flex:1"><input type="checkbox" data-tpl="${t.id}" data-f="active" ${t.active ? 'checked' : ''} title="פעיל"></div>
      <textarea data-tpl="${t.id}" data-f="body" rows="4" style="margin-top:6px">${esc(t.body)}</textarea></section>`).join('')}</div>
    <button class="btn sm" id="addTpl" style="margin-top:8px">+ תבנית</button>
    <p class="muted small">משתנים: {שם} {הזמנה} {סכום} {קישור} {מעקב} {תאריך איסוף} {ימי קישור}</p>`;
  if (tab === 'labs') body = `<div class="card table-wrap"><table><thead><tr><th>שם${info('lab.name')}</th><th>שלנו${info('lab.is_inhouse')}</th><th>איש קשר</th><th>טלפון</th><th>כתובת</th><th>מה ממירה${info('lab.media_types')}</th><th>פעיל${info('lab.active')}</th></tr></thead><tbody>
    ${S.labs.map(l => `<tr><td><input data-lab="${l.id}" data-f="name" value="${esc(l.name || '')}"></td>
      <td><input type="checkbox" data-lab="${l.id}" data-f="is_inhouse" ${l.is_inhouse ? 'checked' : ''}></td>
      ${['contact_name', 'phone', 'address', 'media_types'].map(f => `<td><input data-lab="${l.id}" data-f="${f}" value="${esc(l[f] || '')}"></td>`).join('')}
      <td><input type="checkbox" data-lab="${l.id}" data-f="active" ${l.active ? 'checked' : ''}></td></tr>`).join('')}
    </tbody></table><button class="btn sm" id="addLab" style="margin-top:8px">+ מעבדה</button></div>`;
  if (tab === 'coupons') body = `<div class="card table-wrap"><table><thead><tr><th>קוד${info('cp.code')}</th><th>% הנחה${info('cp.percent')}</th><th>₪ הנחה${info('cp.amount')}</th><th>קמפיין${info('cp.campaign')}</th><th>בתוקף עד${info('cp.valid_until')}</th><th>פעיל${info('cp.active')}</th></tr></thead><tbody>
    ${S.coupons.map(x => `<tr><td><b>${esc(x.code)}</b></td><td><input type="number" data-cp="${esc(x.code)}" data-f="percent" value="${x.percent || 0}" style="width:80px"></td>
      <td><input type="number" data-cp="${esc(x.code)}" data-f="amount" value="${x.amount || 0}" style="width:80px"></td><td><input data-cp="${esc(x.code)}" data-f="campaign" value="${esc(x.campaign || '')}" style="min-width:170px"></td>
      <td><input type="date" data-cp="${esc(x.code)}" data-f="valid_until" value="${x.valid_until || ''}"></td><td><input type="checkbox" data-cp="${esc(x.code)}" data-f="active" ${x.active ? 'checked' : ''}></td></tr>`).join('') || '<tr><td colspan="6" class="muted">אין קופונים</td></tr>'}
    </tbody></table><button class="btn sm" id="addCp" style="margin-top:8px">+ קופון</button></div>`;
  if (tab === 'staff') { const { data: st } = await sb.from('staff').select('*').order('created_at'); body = `<div class="card">
    <p class="muted small">רק מיילים ברשימה נכנסים. <b>מנהל</b>: הכל כולל מחיקה וצוות. <b>צוות</b>: הכל חוץ מניהול צוות ומחיקה. <b>מעבדה</b>: רואה רק את הפריטים של המעבדה שלה וסורק אותם, בלי פרטי לקוח.</p>
    <div class="table-wrap"><table><thead><tr><th>מייל</th><th>שם</th><th>תפקיד${info('staff.role')}</th><th>מעבדה${info('staff.lab_id')}</th><th></th></tr></thead><tbody>
    ${st.map(s => `<tr><td>${esc(s.email)}</td><td><input data-staff-row="${esc(s.email)}" data-f="name" value="${esc(s.name || '')}" ${isAdmin() ? '' : 'disabled'}></td>
      <td><select data-staff-row="${esc(s.email)}" data-f="role" ${isAdmin() && s.email !== S.user.email ? '' : 'disabled'}>${[['admin', 'מנהל'], ['staff', 'צוות'], ['lab', 'מעבדה']].map(([k, v]) => `<option value="${k}" ${s.role === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
      <td><select data-staff-row="${esc(s.email)}" data-f="lab_id" ${isAdmin() ? '' : 'disabled'}><option value=""></option>${S.labs.map(l => `<option value="${l.id}" ${s.lab_id === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></td>
      <td>${s.email === S.user.email ? '<span class="muted small">אתה</span>' : isAdmin() ? `<button class="btn sm danger" data-delstaff="${esc(s.email)}">הסרה</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
    ${isAdmin() ? `<form id="staffForm" class="row" style="margin-top:8px"><input name="email" type="email" placeholder="מייל" required style="max-width:240px"><input name="name" placeholder="שם" style="max-width:140px">
      <select name="role" style="max-width:110px"><option value="staff">צוות</option><option value="lab">מעבדה</option><option value="admin">מנהל</option></select>
      <select name="lab_id" style="max-width:160px"><option value="">מעבדה (לתפקיד מעבדה)</option>${S.labs.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select><button class="btn sm">הוספה</button></form>
      <p class="muted small">אחרי ההוספה: יוצרים לו משתמש ב-Supabase (Authentication → Add user, Auto Confirm) או שהוא נרשם במסך הכניסה.</p>` : ''}</div>`; }
  if (tab === 'backup') body = `<div class="card"><h2>גיבוי לקבצים</h2><p>מוריד 4 קבצי CSV (נפתחים באקסל ובגוגל שיטס): הזמנות, לקוחות, פריטים, הוצאות.</p>
    <button class="btn primary" id="exportBtn">הורדת גיבוי עכשיו</button><p class="muted small" id="exportMsg"></p>
    <p class="muted small">גיבוי לילי אוטומטי לגוגל שיטס יופעל אחרי שהאתר יעלה לאוויר (דרך Make/n8n).</p></div>`;

  view().innerHTML = `<h1>הגדרות</h1><div class="tabs">${Object.entries(tabs).map(([k, v]) => `<button class="tab ${k === tab ? 'on' : ''}" data-stab="${k}">${v}</button>`).join('')}</div>${intro('set.' + tab)}${body}`;
  $$('[data-stab]').forEach(b => b.onclick = () => { sessionStorage.setItem('setTab', b.dataset.stab); vSettings(); });
  const bind = (attr, table, keyCol, cast = v => v) => $$(`[data-${attr}]`).forEach(el => el.addEventListener('change', async () => {
    let v = el.type === 'checkbox' ? el.checked : (el.value === '' ? null : el.value);
    if (el.type === 'number' && v != null) v = Number(v);
    if (el.dataset.f === 'lab_id') v = v ? Number(v) : null;
    const { error } = await sb.from(table).update({ [el.dataset.f]: v }).eq(keyCol, cast(el.dataset[attr.replace(/-([a-z])/g, (m, ch) => ch.toUpperCase())])); fail(error); toast('נשמר');
    if (attr === 'opt' && el.dataset.f === 'value' && el.dataset.old && el.dataset.old !== v && LIST_COL[el.dataset.list]) {
      const [t, col] = LIST_COL[el.dataset.list];
      if (await ask('לעדכן גם רשומות קיימות?', `להחליף "${el.dataset.old}" ב-"${v}" בכל הרשומות הקיימות?`, { ok: 'כן, לעדכן', cancel: 'רק ברשימה' })) {
        const { error: e2 } = await sb.from(t).update({ [col]: v }).eq(col, el.dataset.old); fail(e2); toast('עודכן גם ברשומות');
      }
      el.dataset.old = v;
    }
    loadRef();
  }));
  bind('set', 'settings', 'key'); bind('tier', 'discount_tiers', 'id', Number); bind('prod', 'products', 'id', Number); bind('opt', 'options', 'id', Number);
  bind('lab', 'labs', 'id', Number); bind('cp', 'coupons', 'code'); bind('tpl', 'message_templates', 'id', Number); bind('staff-row', 'staff', 'email');
  const add = async (table, row) => { const { error } = await sb.from(table).insert(row); fail(error); vSettings(); };
  $('#addTier')?.addEventListener('click', () => add('discount_tiers', { min_items: (Math.max(0, ...S.tiers.map(t => t.min_items)) + 10), percent: 0 }));
  $('#addProd')?.addEventListener('click', async () => { const f = await formModal('פריט / תוספת חדשים', `<label>שם<input name="name" required></label><label>סוג<select name="category"><option value="media">חומרה</option><option value="addon" selected>תוספת</option><option value="repair">תיקון</option><option value="package">חבילה</option></select></label><label>מחיר (₪)<input name="unit_price" type="number" step="0.01" value="0"></label>`); if (f) add('products', { name: f.name, category: f.category, unit_price: Number(f.unit_price || 0), counts_for_tier: f.category === 'media', sort: 99 }); });
  $('#addLab')?.addEventListener('click', async () => { const f = await formModal('מעבדה חדשה', `<label>שם<input name="name" required></label><label>טלפון<input name="phone"></label><label>מה ממירה<input name="media_types"></label>`); if (f) add('labs', { name: f.name, phone: f.phone || null, media_types: f.media_types || null }); });
  $('#addCp')?.addEventListener('click', async () => { const f = await formModal('קופון חדש', `<label>קוד<input name="code" required placeholder="SUMMER10"></label><label>% הנחה<input name="percent" type="number" value="10"></label><label>קמפיין<input name="campaign"></label>`); if (f) add('coupons', { code: f.code.trim().toUpperCase(), percent: Number(f.percent || 0), campaign: f.campaign || null }); });
  $('#addTpl')?.addEventListener('click', async () => { const f = await formModal('תבנית חדשה', `<label>שם<input name="name" required></label><label>טקסט<textarea name="body" required rows="4">היי {שם}, </textarea></label>`); if (f) add('message_templates', { name: f.name, body: f.body, sort: 99 }); });
  $$('[data-addopt]').forEach(b => b.onclick = async () => { const f = await formModal('ערך חדש: ' + LIST_NAMES[b.dataset.addopt], `<label>ערך<input name="v" required></label>`); if (f) add('options', { list: b.dataset.addopt, value: f.v.trim(), phase: b.dataset.addopt === 'stage' ? 'ops' : null, sort: 99 }); });
  $$('[data-deltier]').forEach(b => b.onclick = async () => { const { error } = await sb.from('discount_tiers').delete().eq('id', b.dataset.deltier); fail(error); vSettings(); });
  $('#staffForm')?.addEventListener('submit', e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); if (f.role === 'lab' && !f.lab_id) return tell('חסרה מעבדה', 'למשתמש מעבדה צריך לבחור לאיזו מעבדה הוא שייך.'); add('staff', { email: f.email.trim().toLowerCase(), name: f.name || null, role: f.role, lab_id: f.lab_id ? Number(f.lab_id) : null }); });
  $$('[data-delstaff]').forEach(b => b.onclick = async () => { if (!await ask('להסיר את ' + b.dataset.delstaff + '?', 'המשתמש לא יוכל להיכנס יותר.', { ok: 'הסרה', danger: true })) return; const { error } = await sb.from('staff').delete().eq('email', b.dataset.delstaff); fail(error); vSettings(); });
  $('#exportBtn')?.addEventListener('click', exportAll);
}
async function exportAll() {
  const tables = [['הזמנות', 'v_orders'], ['לקוחות', 'customers'], ['פריטים', 'items'], ['הוצאות', 'expenses']];
  const stamp = today();
  for (const [name, t] of tables) {
    const { data, error } = await sb.from(t).select('*'); fail(error);
    if (!data.length) continue;
    const cols = Object.keys(data[0]);
    const cell = v => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = '﻿' + [cols.join(','), ...data.map(r => cols.map(c => cell(r[c])).join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `crm-${name}-${stamp}.csv`; a.click();
    await sleep(400);
  }
  $('#exportMsg').textContent = 'הגיבוי ירד לתיקיית ההורדות.';
}

// ---------- PWA ----------
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});

boot();
