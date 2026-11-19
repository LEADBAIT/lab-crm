/* מכירות: the central sales dashboard. One table of every open lead, from a new inquiry until pickup is arranged.
   Every cell edits the real CRM fields (stage, follow-up, notes, heat, loss reason, payment), so the customer page,
   the history and the reports update with it. Clicking a name opens the same customer page in a side panel (iframe, ?embed). */
'use strict';
const SALES_STAGES = STEPS.filter(s => s.phase === 'sales').map(s => s.key);
const NEW_URGENT_HOURS = 2;
const SD = { rows: [], notes: {}, maxId: 0, cur: null, touch: null, poll: null, newCount: 0 };
const salesF = () => { try { return JSON.parse(sessionStorage.getItem('salesF') || '{}'); } catch { return {}; } };
const saveSalesF = F => sessionStorage.setItem('salesF', JSON.stringify(F));
const hoursSince = d => d ? (Date.now() - new Date(d)) / 36e5 : 0;
const isNewUrgent = o => o.stage === 'פנייה חדשה' && hoursSince(o.created_at) >= NEW_URGENT_HOURS;
const tempColor = v => (S.opts.temperature || []).find(o => o.value === v)?.color || '';

VIEWS.sales = async function vSales(tab) {
  tab = tab === 'pickup' ? 'pickup' : 'sales';
  const rows = await getOrders(q => q.in('stage', [...SALES_STAGES, 'לתאם איסוף']));
  const ids = rows.map(r => r.id);
  const { data: ev, error } = ids.length ? await sb.from('order_events').select('order_id, new_value, at').eq('kind', 'note').is('deleted_at', null).in('order_id', ids).order('at', { ascending: false }) : { data: [] };
  fail(error);
  SD.notes = {}; ev.forEach(e => { SD.notes[e.order_id] ||= e; });
  SD.rows = rows;
  const { data: mx } = await sb.from('orders').select('id').order('id', { ascending: false }).limit(1);
  SD.maxId = mx?.[0]?.id || 0; SD.newCount = 0;
  renderSales(tab);
  startNewLeadPoll();
  // a change made from the dashboard to the lead that is open in the panel: reload the panel
  if (SD.touch && SD.touch === SD.cur) $('#salesPanel iframe')?.contentWindow?.location.reload();
  SD.touch = null;
};

function salesCounts(rows) {
  const s = rows.filter(r => SALES_STAGES.includes(r.stage));
  return { new: s.filter(r => r.stage === 'פנייה חדשה').length, urgent: s.filter(isNewUrgent).length,
    today: s.filter(r => ['today', 'none'].includes(fuState(r))).length, late: s.filter(r => fuState(r) === 'late').length,
    pickup: rows.filter(r => r.stage === 'לתאם איסוף').length };
}

function renderSales(tab) {
  SD.tab = tab;
  const F = salesF(), rows = SD.rows, n = salesCounts(rows);
  setBadge(n.late + n.today + n.urgent);
  const sources = [...new Set(rows.map(r => r.source).filter(Boolean))], camps = [...new Set(rows.map(r => r.meta_campaign).filter(Boolean))];
  const counter = (k, label, num, cls = '') => `<button class="counter ${cls} ${F.view === k ? 'on' : ''}" data-view="${k}" aria-pressed="${F.view === k}"><b>${num}</b><span>${label}</span></button>`;
  view().innerHTML = `
  <div class="page-head"><div><h1>מכירות</h1><div class="sub">כל ליד מהכניסה ועד תיאום האיסוף. כל שינוי כאן נשמר מיד בכרטיס הלקוח.</div></div>
    <div class="counters">${counter('late', 'באיחור', n.late, n.late ? 'red' : '')}${counter('today', 'להיום', n.today, n.today ? 'orange' : '')}${counter('new', 'חדשים', n.new + (n.urgent ? ` <small>(${n.urgent === 1 ? 'דחוף אחד' : n.urgent + ' דחופים'})</small>` : ''), n.urgent ? 'red' : '')}</div></div>
  <div id="newLeadsBar" class="new-bar hidden" role="status"></div>
  <div class="row spread" style="margin-bottom:12px">
    <div class="seg"><button class="${tab === 'sales' ? 'on' : ''}" data-stab="sales">מכירה <span class="n">${rows.length - n.pickup}</span></button><button class="${tab === 'pickup' ? 'on' : ''}" data-stab="pickup">לתאם איסוף <span class="n">${n.pickup}</span></button></div>
    <div class="filters">
      <input class="search-in" id="sq" type="search" placeholder="חיפוש שם או טלפון" value="${esc(F.q || '')}" aria-label="חיפוש שם או טלפון">
      ${tab === 'sales' ? `<select id="sstage" aria-label="סינון לפי שלב"><option value="">כל השלבים</option>${SALES_STAGES.map(s => `<option ${F.stage === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <select id="sview" aria-label="סינון לפי פולו-אפ"><option value="">כל הפולו-אפים</option>${[['today', 'להיום'], ['late', 'באיחור'], ['none', 'בלי פולו-אפ מתוזמן'], ['new', 'חדשים']].map(([k, l]) => `<option value="${k}" ${F.view === k ? 'selected' : ''}>${l}</option>`).join('')}</select>` : ''}
      <select id="ssrc" aria-label="סינון לפי מקור או קמפיין"><option value="">כל המקורות</option>${sources.map(s => `<option value="src:${esc(s)}" ${F.src === 'src:' + s ? 'selected' : ''}>${esc(s)}</option>`).join('')}${camps.length ? `<optgroup label="קמפיין במטא">${camps.map(s => `<option value="cmp:${esc(s)}" ${F.src === 'cmp:' + s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</optgroup>` : ''}</select>
      <label class="check"><input type="checkbox" id="shot" ${F.hot ? 'checked' : ''}> רק חמים</label>
      ${Object.values(F).some(Boolean) ? '<button class="btn sm ghost" id="sclear">ניקוי סינון</button>' : ''}
    </div>
  </div>
  <div id="salesBody"></div>`;
  drawSales(tab);
  const set = (k, v) => { const f = salesF(); f[k] = v; saveSalesF(f); renderSales(tab); };
  $$('[data-view]').forEach(b => b.onclick = () => { const f = salesF(); f.view = f.view === b.dataset.view ? '' : b.dataset.view; saveSalesF(f); if (tab !== 'sales') go('sales'); else renderSales(tab); });
  $$('[data-stab]').forEach(b => b.onclick = () => go(b.dataset.stab === 'pickup' ? 'sales/pickup' : 'sales'));
  $('#sq').oninput = e => { const f = salesF(); f.q = e.target.value; saveSalesF(f); drawSales(tab); };
  $('#sstage') && ($('#sstage').onchange = e => set('stage', e.target.value));
  $('#sview') && ($('#sview').onchange = e => set('view', e.target.value));
  $('#ssrc').onchange = e => set('src', e.target.value);
  $('#shot').onchange = e => set('hot', e.target.checked);
  $('#sclear') && ($('#sclear').onclick = () => { saveSalesF({}); renderSales(tab); });
}

function salesFilter(r, F, tab) {
  if (tab === 'pickup' ? r.stage !== 'לתאם איסוף' : !SALES_STAGES.includes(r.stage)) return false;
  const q = (F.q || '').trim(), dq = q.replace(/\D/g, '');
  if (q && !(String(r.full_name || '').includes(q) || (dq.length >= 3 && String(r.phone || '').includes(dq.replace(/^972/, '0').replace(/^0/, ''))) || String(r.id) === q)) return false;
  if (tab === 'sales' && F.stage && r.stage !== F.stage) return false;
  if (F.src && !(F.src === 'src:' + r.source || F.src === 'cmp:' + r.meta_campaign)) return false;
  if (F.hot && r.temperature !== 'חם') return false;
  if (tab === 'sales' && F.view) {
    const st = fuState(r);
    if (F.view === 'new' && r.stage !== 'פנייה חדשה') return false;
    if (F.view === 'today' && !['today', 'none'].includes(st)) return false;
    if (F.view === 'late' && st !== 'late') return false;
    if (F.view === 'none' && st !== 'none') return false;
  }
  return true;
}

function drawSales(tab) {
  const F = salesF(), vis = SD.rows.filter(r => salesFilter(r, F, tab));
  const fuKey = r => (r.next_followup || '9999') + ' ' + (fuTime(r.next_followup_time) || '99');
  let groups;
  if (tab === 'pickup') groups = [['', vis.sort((a, b) => String(a.paid_at).localeCompare(String(b.paid_at)))]];
  else {
    const rank = { late: 0, none: 1, today: 2 };
    groups = [
      ['באיחור והיום', vis.filter(r => rank[fuState(r)] != null).sort((a, b) => rank[fuState(a)] - rank[fuState(b)] || fuKey(a).localeCompare(fuKey(b)))],
      ['חדשים', vis.filter(r => r.stage === 'פנייה חדשה').sort((a, b) => a.created_at.localeCompare(b.created_at))],
      ['השאר', vis.filter(r => r.stage !== 'פנייה חדשה' && rank[fuState(r)] == null).sort((a, b) => fuKey(a).localeCompare(fuKey(b)))],
    ];
  }
  const cols = tab === 'pickup' ? ['לקוח', 'טלפון', 'מה המצב', 'סכום', 'שולם', 'הערה אחרונה', 'חום', ''] : ['לקוח', 'טלפון', 'שלב', 'סכום הצעה', 'פולו-אפ הבא', 'הערה אחרונה', 'חום', 'פעולות'];
  $('#salesBody').innerHTML = `<div class="card flush table-wrap sales-table"><table><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
    ${groups.map(([name, list]) => `<tbody>${name ? `<tr class="grp-row"><td colspan="${cols.length}">${esc(name)} <span class="n">${list.length}</span></td></tr>` : ''}
      ${list.map(r => tab === 'pickup' ? pickupRowHtml(r) : salesRowHtml(r)).join('') || (name ? `<tr class="empty-row"><td colspan="${cols.length}">אין כאן כרגע</td></tr>` : '')}</tbody>`).join('')}
    ${!vis.length ? `<tbody><tr class="empty-row"><td colspan="${cols.length}">אין לידים שמתאימים לסינון</td></tr></tbody>` : ''}</table></div>`;
  bindSalesRows(tab);
}

function nameCell(r) {
  const camp = r.meta_campaign ? 'מטא · ' + r.meta_campaign : r.source || '';
  return `<td class="name-cell"><button class="link-btn strong" data-open="${r.id}">${esc(custName(r))}</button>
    <span class="sub">#${r.id}${camp ? ' · ' + esc(camp) : ''}</span>
    ${r.stage === 'פנייה חדשה' ? `<span class="chip ${isNewUrgent(r) ? 'red' : ''}">${isNewUrgent(r) ? 'דחוף · ' : ''}נכנס ${esc(ago(r.created_at))}</span>` : ''}${r.is_repeat ? '<span class="chip blue">חוזר</span>' : ''}</td>`;
}
const phoneCell = r => `<td><bdi dir="ltr" class="num">${esc(fmtPhone(r.phone))}</bdi> <button class="btn xs ghost" data-copy="${esc(r.phone || '')}" aria-label="העתקת הטלפון">העתקה</button></td>`;
function noteCell(r) {
  const n = SD.notes[r.id];
  return `<td class="note-cell" data-note="${r.id}"><button class="note-btn" data-noteedit="${r.id}" ${n ? `data-tip="${esc(fmtDT(n.at) + ': ' + n.new_value)}"` : ''}>${n ? esc(n.new_value) : '<span class="muted">+ הערה</span>'}</button></td>`;
}
const tempCell = r => `<td><select class="temp-sel" data-temp="${r.id}" aria-label="חום הליד" style="${tempColor(r.temperature) ? `--tc:${tempColor(r.temperature)}` : ''}">${opts('temperature', r.temperature, { emptyLabel: '—' })}</select></td>`;

function salesRowHtml(r) {
  const st = fuState(r);
  const fu = r.next_followup
    ? `<b class="${st === 'late' ? 'late' : ''}">${esc(fuLabel(r))}</b>${r.followup_note ? `<span class="sub clip">${esc(r.followup_note)}</span>` : ''}`
    : st === 'none' ? '<span class="chip red">אין צעד הבא</span>' : '<span class="muted">—</span>';
  return `<tr class="srow ${SD.cur === r.id ? 'cur' : ''}" data-row="${r.id}">${nameCell(r)}${phoneCell(r)}
    <td><select class="stage-sel" data-stage="${r.id}" aria-label="שלב" style="--sc:${stageColor(r.stage)}">${SALES_STAGES.map(s => `<option ${s === r.stage ? 'selected' : ''}>${esc(s)}</option>`).join('')}<option value="${LOST}">${LOST}…</option></select>
      ${r.stage === 'בשיחה' ? `<span class="sub">ניסיון ${r.followup_attempts || 1} מתוך ${MAX_ATTEMPTS}</span>` : ''}</td>
    <td class="num">${r.total > 0 ? `<b>${money(r.total)}</b><span class="sub">${r.media_qty} פריטים</span>` : '<span class="muted">—</span>'}</td>
    <td><button class="fu-btn fu-${st}" data-fu="${r.id}">${fu}</button></td>
    ${noteCell(r)}${tempCell(r)}
    <td><div class="acts-in"><button class="btn xs wa" data-wa="${r.id}">וואטסאפ</button><button class="btn xs" data-quote="${r.id}">הצעה</button><button class="btn xs" data-pay="${r.id}">${r.sumit_payment_url ? 'קישור תשלום ✓' : 'קישור תשלום'}</button>
      <div class="dd"><button class="btn xs ghost" data-more="${r.id}" aria-label="עוד פעולות">עוד ▾</button></div></div></td></tr>`;
}
function pickupRowHtml(r) {
  return `<tr class="srow ${SD.cur === r.id ? 'cur' : ''}" data-row="${r.id}">${nameCell(r)}${phoneCell(r)}
    <td class="wrap small">${esc(subStatus(r))}</td><td class="num">${money(r.total)}</td>
    <td class="small">${esc(r.payment_status || '')}${r.paid_at ? `<span class="sub">${fmtShort(r.paid_at)}</span>` : ''}</td>
    ${noteCell(r)}${tempCell(r)}<td><button class="btn xs" data-open="${r.id}">פתיחה</button></td></tr>`;
}

// ---------- side panel: the real customer page in an iframe ----------
function openPanel(id, sec = '') {
  let p = $('#salesPanel');
  if (!p) { p = document.createElement('aside'); p.id = 'salesPanel'; p.className = 'spanel'; p.setAttribute('aria-label', 'כרטיס לקוח'); document.body.appendChild(p); }
  const o = SD.rows.find(r => r.id === id);
  p.innerHTML = `<div class="spanel-head"><b class="grow">${esc(o ? custName(o) : '#' + id)}</b><a class="btn sm ghost" href="#order/${id}">לדף המלא</a><button class="btn sm" id="spClose">סגירה ✕</button></div>
    <iframe title="כרטיס הלקוח" src="${location.pathname}?embed=1#order/${id}${sec ? '/' + sec : ''}"></iframe>`;
  $('#spClose', p).onclick = closePanel;
  setCur(id);
}
function closePanel() { $('#salesPanel')?.remove(); SD.cur = null; $$('.srow.cur').forEach(r => r.classList.remove('cur')); }
function setCur(id) { SD.cur = id; $$('.srow').forEach(r => r.classList.toggle('cur', Number(r.dataset.row) === id)); }
window.addEventListener('message', e => { if (e.origin === location.origin && e.data?.crm === 'changed' && /^#sales/.test(location.hash || '#sales')) route(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#salesPanel') && !$('#modal').open) closePanel(); });

// ---------- new leads while the screen is open ----------
function startNewLeadPoll() {
  clearInterval(SD.poll);
  SD.poll = setInterval(async () => {
    if (!/^#sales/.test(location.hash || '#sales') || document.hidden) return;
    const { count } = await sb.from('orders').select('id', { count: 'exact', head: true }).gt('id', SD.maxId);
    const bar = $('#newLeadsBar'); if (!bar || !count) return;
    bar.innerHTML = `<span>${count === 1 ? 'נכנס ליד חדש' : `נכנסו ${count} לידים חדשים`}</span><button class="btn sm primary">רענון</button>`;
    bar.classList.remove('hidden'); $('button', bar).onclick = () => route();
  }, 60000);
}

// ---------- row actions ----------
const rowOf = id => SD.rows.find(r => r.id === Number(id));
async function custOf(o) { const { data, error } = await sb.from('customers').select('*').eq('id', o.customer_id).single(); fail(error); return data; }
function bindSalesRows(tab) {
  const body = $('#salesBody');
  body.onclick = e => { const tr = e.target.closest('.srow'); if (tr) setCur(Number(tr.dataset.row)); };
  $$('[data-open]', body).forEach(b => b.onclick = () => openPanel(Number(b.dataset.open)));
  $$('[data-copy]', body).forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(fmtPhone(b.dataset.copy)); toast('הטלפון הועתק: ' + fmtPhone(b.dataset.copy)); } catch { tell('הטלפון', fmtPhone(b.dataset.copy)); } });
  $$('[data-stage]', body).forEach(sel => sel.onchange = async () => {
    const o = rowOf(sel.dataset.stage), to = sel.value; SD.touch = o.id;
    if (!await changeStage(o, to)) { sel.value = o.stage; return; }
    route();
  });
  $$('[data-fu]', body).forEach(b => b.onclick = async () => {
    const o = rowOf(b.dataset.fu); SD.touch = o.id;
    if (o.stage === 'פנייה חדשה') { toast('ליד חדש: מעבירים ל"בשיחה" אחרי שפונים אליו, ואז קובעים פולו-אפ'); b.closest('tr').querySelector('[data-stage]')?.focus(); return; }
    if (await setFollowup(o)) route();
  });
  $$('[data-temp]', body).forEach(sel => sel.onchange = async () => {
    const o = rowOf(sel.dataset.temp); SD.touch = o.id;
    await patchOrder(o, { temperature: sel.value || null }, 'חום הליד: ' + (sel.value || 'ריק')); route();
  });
  $$('[data-noteedit]', body).forEach(b => b.onclick = () => editNoteCell(Number(b.dataset.noteedit)));
  $$('[data-wa]', body).forEach(b => b.onclick = () => sendWa(rowOf(b.dataset.wa)));
  $$('[data-quote]', body).forEach(b => b.onclick = () => sendQuoteRow(rowOf(b.dataset.quote)));
  $$('[data-pay]', body).forEach(b => b.onclick = () => paymentLink(rowOf(b.dataset.pay)));
  $$('[data-more]', body).forEach(b => b.onclick = e => { e.stopPropagation(); const o = rowOf(b.dataset.more); dropdown(b, [
    { label: 'הלקוח שילם', sub: 'מעביר ל"לתאם איסוף"', run: () => markPaid(o) },
    { label: 'לא רלוונטי…', run: async () => { SD.touch = o.id; if (await changeStage(o, LOST)) route(); } },
    'sep', { label: 'פתיחת הכרטיס', run: () => openPanel(o.id) }, { label: 'פתיחה בדף מלא', run: () => go('order/' + o.id) }]); });
}
function editNoteCell(id) {
  const td = $(`[data-note="${id}"]`), o = rowOf(id), last = SD.notes[id];
  td.innerHTML = `<form class="note-form"><input name="t" placeholder="${esc(last ? 'קודם: ' + last.new_value : 'מה קרה? (Enter לשמירה)')}" aria-label="הערה חדשה" autocomplete="off"></form>`;
  const f = $('form', td), inp = $('input', f); inp.focus();
  const cancel = () => drawSales(SD.tab);
  inp.onkeydown = e => { if (e.key === 'Escape') { e.stopPropagation(); cancel(); } };
  inp.onblur = () => { if (!inp.value.trim() && !inp.disabled) cancel(); };
  f.onsubmit = async e => {
    e.preventDefault(); const t = inp.value.trim(); if (!t) return;
    inp.disabled = true; SD.touch = id; let nid = null;
    await reversible('ההערה נוספה', async () => { if (nid) { const { error } = await sb.rpc('set_note_deleted', { p_id: nid, p_deleted: false }); return fail(error); }
      const { data, error } = await sb.rpc('add_note', { p_order: id, p_text: t }); fail(error); nid = data; },
      async () => { const { error } = await sb.rpc('set_note_deleted', { p_id: nid, p_deleted: true }); fail(error); });
    route();
  };
}
/** WhatsApp with the lead's prepared message (or the stage's template), editable before it opens. */
async function sendWa(o) {
  const tpl = tplByName(stepOf(o.stage)?.tpl || '');
  const text = o.followup_draft || (tpl ? fillTemplate(tpl.body, o, null) : '');
  const f = await formModal('וואטסאפ ל' + custName(o), `<label class="field">ההודעה<textarea name="m" rows="6">${esc(text)}</textarea><span class="hint">${o.followup_draft ? 'ההודעה המוכנה מהפולו-אפ.' : tpl ? 'התבנית של השלב "' + esc(o.stage) + '".' : ''} נפתחת בוואטסאפ, ונרשם שפנינו ללקוח.</span></label>`, { ok: 'פתיחה בוואטסאפ' });
  if (!f) return;
  window.open(waLink(o.phone, f.m), '_blank', 'noopener');
  SD.touch = o.id; await markContacted(o, 'ההודעה נפתחה ונרשם שפנינו'); route();
}
async function sendQuoteRow(o) {
  if (!o.media_qty) { toast('ההצעה ריקה: ממלאים כמויות בכרטיס'); return openPanel(o.id, 'quote'); }
  const [{ data: lines, error }, c] = await Promise.all([sb.from('order_lines').select('*').eq('order_id', o.id), custOf(o)]); fail(error);
  window.open(waLink(o.phone, quoteText(o, c, lines)), '_blank', 'noopener');
  if (['פנייה חדשה', 'בשיחה', 'בפולואפ'].includes(o.stage) && await ask('ההצעה נפתחה בוואטסאפ', 'להעביר את הליד ל"הצעה נשלחה"?', { ok: 'כן, להעביר', cancel: 'לא עכשיו' })) {
    SD.touch = o.id; if (await changeStage(o, 'הצעה נשלחה', c)) route();
  }
}
async function markPaid(o) {
  const c = await custOf(o), miss = missingForPaid(o, c);
  if (miss.length) { toast('חסר לחשבונית ולאיסוף: ' + miss.join(', '), { ms: 6000 }); return openPanel(o.id, miss.includes('כמויות בהצעת המחיר') && miss.length === 1 ? 'quote' : 'customer'); }
  SD.touch = o.id; if (await changeStage(o, 'לתאם איסוף', c)) route();
}
/** SUMIT payment link for this quote (created by the sumit-payment edge function). */
async function paymentLink(o) {
  if (!o.media_qty || !(o.total > 0)) { toast('קודם ממלאים כמויות בהצעת המחיר'); return openPanel(o.id, 'quote'); }
  let url = o.sumit_payment_url;
  if (!url || Number(o.sumit_payment_amount) !== Number(o.total)) {
    toast('יוצר קישור תשלום ב-SUMIT…', { ms: 8000 });
    const { data, error } = await sb.functions.invoke('sumit-payment', { body: { order_id: o.id } });
    if (error || !data?.url) return tell('לא נוצר קישור תשלום', (data?.error || error?.message || '') + '\n\nאם זו הפעם הראשונה: צריך להכניס את מפתח ה-API של SUMIT (ההוראות בקובץ crm/README.md).');
    url = data.url; SD.touch = o.id;
  }
  const tpl = tplByName('בקשת תשלום');
  const text = (tpl ? fillTemplate(tpl.body, o, null) : `היי ${firstName(o.full_name)}, הנה קישור לתשלום (${money(o.total)}):`) + '\n' + url;
  const f = await formModal('קישור תשלום ל' + custName(o), `<label class="field">הקישור<input value="${esc(url)}" dir="ltr" readonly onclick="this.select()"></label>
    <label class="field">ההודעה<textarea name="m" rows="5">${esc(text)}</textarea><span class="hint">כשהלקוח משלם, הליד עובר לבד ל"לתאם איסוף".</span></label>`, { ok: 'שליחה בוואטסאפ' });
  if (f) { window.open(waLink(o.phone, f.m), '_blank', 'noopener'); await markContacted(o, 'קישור התשלום נשלח'); }
  route();
}
