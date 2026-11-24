/* מכירות: the central sales dashboard. One table of every open lead, from a new inquiry until pickup is arranged.
   Every cell edits the real CRM fields (stage, follow-up, notes, heat, loss reason, payment), so the customer page,
   the history and the reports update with it. Clicking a row opens the same customer page in a side panel (iframe, ?embed).
   UX: one obvious next-step button per row (depends on the stage), everything else in "עוד". */
'use strict';
const SALES_STAGES = STEPS.filter(s => s.phase === 'sales').map(s => s.key);
const NEW_URGENT_HOURS = 2;
const SD = { rows: [], notes: {}, maxId: 0, cur: null, touch: null, poll: null, tab: 'sales' };
const salesF = () => { try { return JSON.parse(sessionStorage.getItem('salesF') || '{}'); } catch { return {}; } };
const saveSalesF = F => sessionStorage.setItem('salesF', JSON.stringify(F));
/** "2 ימים" / "5 שע'": how long a new lead has been waiting */
const waited = d => { const h = Math.floor(hoursSince(d)); return h >= 48 ? Math.floor(h / 24) + ' ימים' : h >= 24 ? 'יום' : h < 1 ? 'פחות משעה' : h + " שע'"; };
const hoursSince = d => d ? (Date.now() - new Date(d)) / 36e5 : 0;
const isNewUrgent = o => o.stage === 'פנייה חדשה' && hoursSince(o.created_at) >= NEW_URGENT_HOURS;
const tempColor = v => (S.opts.temperature || []).find(o => o.value === v)?.color || '';
const srcShort = r => r.meta_campaign || r.meta_lead_id ? 'מטא' : r.source || '';

VIEWS.sales = async function vSales(tab) {
  tab = tab === 'pickup' ? 'pickup' : 'sales';
  const rows = await getOrders(q => q.in('stage', [...SALES_STAGES, 'לתאם איסוף']));
  const ids = rows.map(r => r.id);
  const { data: ev, error } = ids.length ? await sb.from('order_events').select('order_id, new_value, at').eq('kind', 'note').is('deleted_at', null).in('order_id', ids).order('at', { ascending: false }) : { data: [] };
  fail(error);
  SD.notes = {}; ev.forEach(e => { SD.notes[e.order_id] ||= e; });
  SD.rows = rows;
  const { data: mx } = await sb.from('orders').select('id').order('id', { ascending: false }).limit(1);
  SD.maxId = mx?.[0]?.id || 0;
  renderSales(tab);
  startNewLeadPoll();
  // a change made from the dashboard to the lead that is open in the panel: reload the panel
  if (SD.touch && SD.touch === SD.cur) $('#salesPanel iframe')?.contentWindow?.location.reload();
  SD.touch = null;
};

function salesCounts(rows) {
  const s = rows.filter(r => SALES_STAGES.includes(r.stage));
  return { all: s.length, new: s.filter(r => r.stage === 'פנייה חדשה').length, urgent: s.filter(isNewUrgent).length,
    today: s.filter(r => ['today', 'none'].includes(fuState(r))).length, late: s.filter(r => fuState(r) === 'late').length,
    pickup: rows.filter(r => r.stage === 'לתאם איסוף').length, sum: s.reduce((a, r) => a + Number(r.total || 0), 0) };
}

function renderSales(tab) {
  SD.tab = tab;
  const F = salesF(), rows = SD.rows, n = salesCounts(rows);
  const sources = [...new Set(rows.map(r => r.source).filter(Boolean))], camps = [...new Set(rows.map(r => r.meta_campaign).filter(Boolean))];
  // quick views (late / today / new) are chips in the same row as the stage filter: one filter row, not three
  const qv = (k, label, num, cls, tip) => `<button class="fchip qv ${num ? cls : ''} ${F.view === k && tab === 'sales' ? 'on' : ''}" data-view="${k}" aria-pressed="${F.view === k}" data-tip="${esc(tip)}"><b class="qn">${num}</b>${label}</button>`;
  const byStage = s => rows.filter(r => r.stage === s).length;
  const filtered = F.view || F.stage || F.src || F.hot || F.q;
  view().innerHTML = `
  <div class="toolbar">
    <div class="seg"><button class="${tab === 'sales' ? 'on' : ''}" data-stab="sales">מכירה <span class="n">${n.all}</span></button><button class="${tab === 'pickup' ? 'on' : ''}" data-stab="pickup">לתאם איסוף <span class="n">${n.pickup}</span></button></div>
    <div class="search-box"><input id="sq" type="search" placeholder="חיפוש שם או טלפון" value="${esc(F.q || '')}" aria-label="חיפוש שם או טלפון"></div>
    <select id="ssrc" class="src-sel" aria-label="סינון לפי מקור או קמפיין"><option value="">כל המקורות</option>${sources.map(s => `<option value="src:${esc(s)}" ${F.src === 'src:' + s ? 'selected' : ''}>${esc(s)}</option>`).join('')}${camps.length ? `<optgroup label="קמפיין במטא">${camps.map(s => `<option value="cmp:${esc(s)}" ${F.src === 'cmp:' + s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</optgroup>` : ''}</select>
    <span class="tb-sum">${n.all} לידים פתוחים${n.sum ? ` · <b>${money(n.sum)}</b> בהצעות` : ''}</span>
  </div>
  <div id="newLeadsBar" class="new-bar hidden" role="status"></div>
  ${tab === 'sales' ? `<div class="chips" role="group" aria-label="סינון">
    ${qv('late', 'באיחור', n.late, 'red', 'פולו-אפ שעבר זמנו')}${qv('today', 'להיום', n.today, 'orange', 'לחזור היום, או ליד בלי צעד הבא')}${qv('new', 'חדשים', n.new, n.urgent ? 'red' : 'blue', n.urgent ? `${n.urgent} מחכים מעל ${NEW_URGENT_HOURS} שעות` : 'כולם בזמן')}
    <span class="chips-sep"></span>
    <button class="fchip ${!F.stage ? 'on' : ''}" data-fstage="">כל השלבים</button>
    ${SALES_STAGES.map(s => `<button class="fchip ${F.stage === s ? 'on' : ''}" data-fstage="${esc(s)}" style="--sc:${stageColor(s)}"><span class="dot"></span>${esc(s)} <span class="n">${byStage(s)}</span></button>`).join('')}
    <span class="chips-sep"></span>
    <button class="fchip hot ${F.hot ? 'on' : ''}" data-fhot>רק חמים</button>
    ${filtered ? '<button class="link-btn" id="sclear">ניקוי סינון</button>' : ''}
  </div>` : ''}
  <div id="salesBody"></div>`;
  drawSales(tab);
  const set = (k, v) => { const f = salesF(); f[k] = v; saveSalesF(f); renderSales(tab); };
  $$('[data-view]').forEach(b => b.onclick = () => { const f = salesF(); f.view = f.view === b.dataset.view ? '' : b.dataset.view; saveSalesF(f); if (tab !== 'sales') go('sales'); else renderSales(tab); });
  $$('[data-stab]').forEach(b => b.onclick = () => go(b.dataset.stab === 'pickup' ? 'sales/pickup' : 'sales'));
  $$('[data-fstage]').forEach(b => b.onclick = () => set('stage', b.dataset.fstage));
  $('[data-fhot]') && ($('[data-fhot]').onclick = () => set('hot', !F.hot));
  $('#sq').oninput = e => { const f = salesF(); f.q = e.target.value; saveSalesF(f); drawSales(tab); };
  $('#ssrc').onchange = e => set('src', e.target.value);
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
  }
  return true;
}

const GROUPS = {
  due: ['לטפל עכשיו', 'פולו-אפ שהגיע זמנו, ולידים בלי צעד הבא', 'red'],
  new: ['לידים חדשים', `עוד לא פנינו אליהם · היעד: תוך ${NEW_URGENT_HOURS} שעות`, 'blue'],
  later: ['פולו-אפ בהמשך', 'אין מה לעשות איתם היום', 'grey'],
};
function drawSales(tab) {
  const F = salesF(), vis = SD.rows.filter(r => salesFilter(r, F, tab));
  const fuKey = r => (r.next_followup || '9999') + ' ' + (fuTime(r.next_followup_time) || '99');
  let groups;
  if (tab === 'pickup') groups = [[null, vis.sort((a, b) => String(a.paid_at).localeCompare(String(b.paid_at)))]];
  else {
    const rank = { late: 0, none: 1, today: 2 };
    groups = [
      // a filled questionnaire waiting for its quote always counts as "now", first in the group
      ['due', vis.filter(r => rank[fuState(r)] != null || quotePending(r)).sort((a, b) => (quotePending(b) - quotePending(a)) || (rank[fuState(a)] ?? 3) - (rank[fuState(b)] ?? 3) || fuKey(a).localeCompare(fuKey(b)))],
      ['new', vis.filter(r => r.stage === 'פנייה חדשה' && !quotePending(r)).sort((a, b) => a.created_at.localeCompare(b.created_at))],
      ['later', vis.filter(r => r.stage !== 'פנייה חדשה' && rank[fuState(r)] == null && !quotePending(r)).sort((a, b) => fuKey(a).localeCompare(fuKey(b)))],
    ];
  }
  const cols = tab === 'pickup' ? ['לקוח', 'מה המצב', 'שולם', 'הערה אחרונה', 'חום', ''] : ['לקוח', 'שלב', 'פולו-אפ הבא', 'הערה אחרונה', 'הצעה', 'חום', 'הצעד הבא'];
  const C = cols.length;
  $('#salesBody').innerHTML = !vis.length ? `<div class="card empty"><div class="big">✓</div><h3>${SD.rows.length ? 'אין לידים שמתאימים לסינון' : 'אין לידים פתוחים'}</h3>${Object.values(F).some(Boolean) ? '<button class="btn" id="sclear2">ניקוי הסינון</button>' : ''}</div>`
    : `<div class="card flush sales-table"><table><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
    ${groups.filter(([, list]) => list.length || !F.view).map(([g, list]) => `<tbody class="grp grp-${g ? GROUPS[g][2] : ''}">${g ? `<tr class="grp-row"><td colspan="${C}"><b>${GROUPS[g][0]}</b><span class="n">${list.length}</span><span class="hint">${GROUPS[g][1]}</span></td></tr>` : ''}
      ${list.map(r => tab === 'pickup' ? pickupRowHtml(r) : salesRowHtml(r)).join('') || `<tr class="empty-row"><td colspan="${C}">${g === 'due' ? 'אין פולו-אפים לעכשיו' : 'אין כאן כרגע'}</td></tr>`}</tbody>`).join('')}</table></div>`;
  $('#sclear2') && ($('#sclear2').onclick = () => { saveSalesF({}); renderSales(tab); });
  bindSalesRows();
}

// ---------- cells ----------
function nameCell(r) {
  const src = srcShort(r), tip = r.meta_campaign ? 'קמפיין: ' + r.meta_campaign : '';
  const age = r.stage === 'פנייה חדשה' ? `<span class="age ${isNewUrgent(r) ? 'urgent' : ''}">${isNewUrgent(r) ? 'מחכה ' + esc(waited(r.created_at)) : 'נכנס ' + esc(ago(r.created_at))}</span>` : '';
  return `<td class="who"><div class="nm">${esc(custName(r))}${r.is_repeat ? ' <span class="chip blue">חוזר</span>' : ''} ${qChip(r)}</div>
    <div class="meta"><button class="phone" data-copy="${esc(r.phone || '')}" data-tip="לחיצה מעתיקה את המספר"><bdi dir="ltr">${esc(fmtPhone(r.phone))}</bdi></button>${src ? `<span class="src" ${tip ? `data-tip="${esc(tip)}"` : ''}>${esc(src)}</span>` : ''}${age}</div></td>`;
}
function stageCell(r) {
  return `<td><select class="stage-pill-sel" data-stage="${r.id}" aria-label="שלב" style="--sc:${stageColor(r.stage)}">${SALES_STAGES.map(s => `<option ${s === r.stage ? 'selected' : ''}>${esc(s)}</option>`).join('')}<option value="${LOST}">${LOST}…</option></select>
    ${r.stage === 'בשיחה' ? `<div class="attempts"><small>ניסיון ${r.followup_attempts || 1}</small></div>` : ''}</td>`;
}
function fuCell(r) {
  const st = fuState(r);
  if (r.stage === 'פנייה חדשה') return '<td class="nil">—</td>';
  if (st === 'none') return `<td><button class="fu-pill none" data-fu="${r.id}">+ לקבוע פולו-אפ</button></td>`;
  const late = st === 'late', d = -daysSince(r.next_followup + 'T00:00');
  const label = late ? (d < 0 ? `באיחור ${-d === 1 ? 'יום' : -d + ' ימים'}` : 'היום · עבר הזמן') : fuLabel(r);
  return `<td><button class="fu-pill ${st}" data-fu="${r.id}" data-tip="${esc((FU_CH[r.followup_channel] ? FU_CH[r.followup_channel][1] + ' · ' : '') + fmtDate(r.next_followup) + (r.next_followup_time ? ' ' + fuTime(r.next_followup_time) : '') + ' · לחיצה לשינוי')}">${fuCh(r)}${esc(label)}${late && r.next_followup_time && d === 0 ? ' ' + fuTime(r.next_followup_time) : ''}</button>
    <div class="fu-when">${esc(new Date(r.next_followup + 'T00:00').toLocaleDateString('he-IL', { weekday: 'short' }))} <bdi dir="ltr">${esc(fmtShort(r.next_followup + 'T00:00'))}</bdi>${r.next_followup_time ? ` · <bdi dir="ltr">${esc(fuTime(r.next_followup_time))}</bdi>` : ''}</div>
    ${r.followup_note ? `<div class="fu-why">${esc(r.followup_note)}</div>` : ''}</td>`;
}
function noteCell(r) {
  const n = SD.notes[r.id];
  return `<td class="note-cell" data-note="${r.id}"><button class="note-btn" data-noteedit="${r.id}" ${n ? `data-tip="${esc(n.new_value)}"` : ''}>${n ? `<span class="t">${esc(n.new_value)}</span><span class="when">${esc(ago(n.at))}</span>` : '<span class="add">+ הערה</span>'}</button></td>`;
}
const quoteCell = r => `<td class="num">${r.total > 0 ? `<b>${money(r.total)}</b><div class="small muted">${r.media_qty} פריטים</div>` : '<span class="nil">—</span>'}</td>`;
function tempCell(r) {
  const c = tempColor(r.temperature);
  return `<td><div class="dd"><button class="heat-chip ${r.temperature ? '' : 'none'}" data-heatmenu="${r.id}" style="--tc:${c || 'var(--muted)'}" aria-label="חום הליד: ${esc(r.temperature || 'לא נקבע')}">${r.temperature ? `<span class="dot" style="background:var(--tc)"></span>${esc(r.temperature)}` : '+ חום'}</button></div></td>`;
}
/** the one obvious next step for this lead, by stage */
function nextAct(r) {
  switch (r.stage) {
    case 'פנייה חדשה': return ['wa', 'פנייה בוואטסאפ', 'wa'];
    case 'בשיחה': return r.followup_channel === 'call' ? ['call', 'להתקשר', 'call'] : ['wa', 'לנסות שוב', 'wa'];
    case 'בפולואפ': return r.media_qty ? ['quote', 'שליחת הצעה', 'primary'] : ['fillquote', 'מילוי הצעה', ''];
    case 'הצעה נשלחה': return ['wa', 'פולואפ על ההצעה', 'wa'];
    default: return ['open', 'פתיחה', ''];
  }
}
function actCell(r) {
  const [k, label, cls] = nextAct(r);
  const ic = cls === 'call' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>' : cls === 'wa' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"/></svg>' : '';
  return `<td><div class="row-acts"><button class="btn sm ${cls === 'wa' ? 'wa-o' : ''}" data-act="${k}" data-id="${r.id}">${ic}${esc(label)}</button>
    <div class="dd"><button class="btn sm ghost icon-btn more" data-more="${r.id}" aria-label="עוד פעולות">⋯</button></div></div></td>`;
}
const salesRowHtml = r => `<tr class="srow ${SD.cur === r.id ? 'cur' : ''}" data-row="${r.id}">${nameCell(r)}${stageCell(r)}${fuCell(r)}${noteCell(r)}${quoteCell(r)}${tempCell(r)}${actCell(r)}</tr>`;
const pickupRowHtml = r => `<tr class="srow ${SD.cur === r.id ? 'cur' : ''}" data-row="${r.id}">${nameCell(r)}
    <td class="small">${esc(subStatus(r))}</td>
    <td class="small">${money(r.paid_amount || r.total)}<div class="muted">${esc(r.payment_status || '')}${r.paid_at ? ' · ' + fmtShort(r.paid_at) : ''}</div></td>
    ${noteCell(r)}${tempCell(r)}<td><button class="btn sm" data-act="open" data-id="${r.id}">פתיחה</button></td></tr>`;

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
    bar.innerHTML = `<span>${count === 1 ? 'נכנס ליד חדש' : `נכנסו ${count} לידים חדשים`}</span><button class="btn sm primary">להציג</button>`;
    bar.classList.remove('hidden'); $('button', bar).onclick = () => route();
  }, 60000);
}

// ---------- row actions ----------
const rowOf = id => SD.rows.find(r => r.id === Number(id));
async function custOf(o) { const { data, error } = await sb.from('customers').select('*').eq('id', o.customer_id).single(); fail(error); return data; }
const INTERACTIVE = 'button, select, input, a, textarea, form, .dd';
function bindSalesRows() {
  const body = $('#salesBody');
  // a click anywhere on a row (not on a control) opens the customer card on the side
  body.onclick = e => { const tr = e.target.closest('.srow'); if (!tr) return; const id = Number(tr.dataset.row); if (!e.target.closest(INTERACTIVE)) openPanel(id); else setCur(id); };
  $$('[data-copy]', body).forEach(b => b.onclick = async () => { const p = fmtPhone(b.dataset.copy); try { await navigator.clipboard.writeText(p); toast('הטלפון הועתק: ' + p); } catch { tell('הטלפון', p); } });
  $$('[data-stage]', body).forEach(sel => sel.onchange = async () => {
    const o = rowOf(sel.dataset.stage), to = sel.value; SD.touch = o.id;
    if (!await changeStage(o, to)) { sel.value = o.stage; return; }
    route();
  });
  $$('[data-fu]', body).forEach(b => b.onclick = async () => { const o = rowOf(b.dataset.fu); SD.touch = o.id; if (await setFollowup(o)) route(); });
  $$('[data-heatmenu]', body).forEach(b => b.onclick = e => { e.stopPropagation(); const o = rowOf(b.dataset.heatmenu);
    const setHeat = async v => { SD.touch = o.id; await patchOrder(o, { temperature: v }, v ? 'חום הליד: ' + v : 'חום הליד נוקה'); route(); };
    dropdown(b, [{ head: 'כמה קרוב לסגירה?' }, ...(S.opts.temperature || []).filter(x => x.active).map(x => ({ label: (x.value === o.temperature ? '✓ ' : '') + x.value, run: () => setHeat(x.value) })),
      ...(o.temperature ? ['sep', { label: 'ניקוי', run: () => setHeat(null) }] : [])]); });
  $$('[data-noteedit]', body).forEach(b => b.onclick = () => editNoteCell(Number(b.dataset.noteedit)));
  $$('[data-act]', body).forEach(b => b.onclick = () => { const o = rowOf(b.dataset.id); ({ call: x => { location.href = 'tel:' + x.phone; }, wa: sendWa, quote: sendQuoteRow, pay: paymentLink, open: x => openPanel(x.id), fillquote: x => openPanel(x.id, 'quote') })[b.dataset.act](o); });
  $$('[data-more]', body).forEach(b => b.onclick = e => { e.stopPropagation(); const o = rowOf(b.dataset.more); dropdown(b, [
    { label: 'וואטסאפ', sub: 'פתיחת שיחה', run: () => sendWa(o) },
    { label: 'SMS', sub: 'דרך SUMIT; אם לא יוצא, מוצע וואטסאפ', run: async () => { SD.touch = o.id; if (await smsModal(o, '')) route(); } },
    ...(FU_STAGES.includes(o.stage) ? [{ label: 'קביעת פולו-אפ', run: async () => { SD.touch = o.id; if (await setFollowup(o)) route(); } }] : []),
    { label: 'שליחת קישור ההצעה', run: () => sendQuoteRow(o) }, { label: 'קישור תשלום (SUMIT)', run: () => paymentLink(o) },
    'sep', { label: 'הלקוח שילם', sub: 'מעביר ל"לתאם איסוף"', run: () => markPaid(o) },
    { label: 'לא רלוונטי…', danger: true, run: async () => { SD.touch = o.id; if (await changeStage(o, LOST)) route(); } },
    'sep', { label: 'פתיחת הכרטיס בצד', run: () => openPanel(o.id) }, { label: 'פתיחה בדף מלא', run: () => go('order/' + o.id) }]); });
}
function editNoteCell(id) {
  const td = $(`[data-note="${id}"]`), last = SD.notes[id];
  td.innerHTML = `<form class="note-form"><input name="t" placeholder="${esc(last ? 'קודם: ' + last.new_value : 'מה קרה?')}" aria-label="הערה חדשה" autocomplete="off"><span class="hint">Enter לשמירה · Esc לביטול</span></form>`;
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
/** Opens the WhatsApp chat with the lead (no prepared text) and logs that we reached out.
    A new lead: then offer to move it to "בשיחה" and set when to try again. */
async function sendWa(o) {
  window.open(waLink(o.phone), '_blank', 'noopener');
  SD.touch = o.id;
  await markContacted(o, 'נפתחה שיחת וואטסאפ ונרשם שפנינו');
  if (o.stage === 'פנייה חדשה') await changeStage({ ...o, last_contact_at: new Date().toISOString() }, 'בשיחה');
  else if (o.stage === 'בשיחה') await setFollowup(o, { title: 'מתי לנסות שוב?' });
  route();
}
/** the quote goes out as its personal link (p.html) only, never as text (user decision 2026-11-25) */
async function sendQuoteRow(o) {
  if (!o.media_qty) { toast('ההצעה ריקה: ממלאים כמויות בכרטיס'); return openPanel(o.id, 'quote'); }
  if (!o.q_submitted_at && !await ask('הלקוח עוד לא מילא את השאלון', 'בדרך כלל שולחים הצעה רק אחרי השאלון. לשלוח בכל זאת?', { ok: 'לשלוח בכל זאת' })) return;
  window.open(waLink(o.phone, pUrl(o)), '_blank', 'noopener');
  SD.touch = o.id;
  if (['פנייה חדשה', 'בשיחה', 'בפולואפ'].includes(o.stage)) { if (await changeStage(o, 'הצעה נשלחה', await custOf(o), { qOk: true })) route(); }
  else if (!o.quote_sent_at) { await patchOrder(o, { quote_sent_at: new Date().toISOString() }, 'קישור ההצעה נשלח בוואטסאפ', { extra: Q_MARK_EXTRA }); route(); }
}
async function markPaid(o) {
  const c = await custOf(o), miss = missingForPaid(o, c);
  if (miss.length) { toast('חסר לחשבונית ולאיסוף: ' + miss.join(', '), { ms: 6000 }); return openPanel(o.id, miss.includes('כמויות בהצעת המחיר') && miss.length === 1 ? 'quote' : 'customer'); }
  SD.touch = o.id; if (await changeStage(o, 'לתאם איסוף', c)) route();
}
/** SUMIT payment link for this quote (created by the sumit-payment edge function). Used by the sales list and the customer page.
 *  Sending it stamps pay_link_sent_at (the "קישור תשלום נשלח" task). noQuote = what to open when the quote is empty; after = refresh. */
async function paymentLink(o, { phone = o.phone, noQuote = () => openPanel(o.id, 'quote'), after = route } = {}) {
  if (o.payment_status === 'שולם') return tell('ההזמנה כבר שולמה', 'אין צורך בקישור תשלום.');
  if (!(o.total > 0)) { toast('קודם ממלאים כמויות בהצעת המחיר'); return noQuote(); }
  let url = o.sumit_payment_url;
  if (!url || Number(o.sumit_payment_amount) !== Number(o.total)) {
    toast('יוצר קישור תשלום ב-SUMIT…', { ms: 8000 });
    const { data, error } = await sb.functions.invoke('sumit-payment', { body: { order_id: o.id } });
    if (error || !data?.url) return tell('לא נוצר קישור תשלום', (data?.error || error?.message || '') + '\n\nאם זו הפעם הראשונה: צריך להכניס את מפתח ה-API של SUMIT (ההוראות בקובץ crm/README.md).');
    url = data.url; SD.touch = o.id;
  }
  const alt = (S.settings.pay_alt_text?.text_value || '').trim();
  const text = `היי ${firstName(o.full_name)}, הנה קישור לתשלום (${money(o.total)}, אפשר עד 3 תשלומים באשראי):\n` + url + (alt ? '\n\n' + alt : '');
  const pending = formModal('קישור תשלום ל' + custName(o), `<label class="field">הקישור<input value="${esc(url)}" dir="ltr" readonly onclick="this.select()">
      <button type="button" class="link-btn" id="payCopy" style="margin-top:4px">העתקה וסימון שנשלח (אם שולחים בדרך אחרת)</button></label>
    <label class="field">ההודעה<textarea name="m" rows="5">${esc(text)}</textarea><span class="hint">כשהלקוח משלם, ההזמנה עוברת לבד ל"לתאם איסוף" ונרשמת חשבונית.</span></label>`, { ok: 'שליחה בוואטסאפ' });
  let copied = false; // the modal is already in the page here (formModal builds it synchronously)
  const cb = document.getElementById('payCopy');
  if (cb) cb.onclick = async () => { try { await navigator.clipboard.writeText(url); } catch {} copied = true; cb.textContent = 'הועתק ✓ יירשם שנשלח'; };
  const f = await pending;
  if (f) window.open(waLink(phone, f.m), '_blank', 'noopener');
  if (f || copied) { const now = new Date().toISOString(); await patchOrder(o, { pay_link_sent_at: now, last_contact_at: now }, 'נרשם שקישור התשלום נשלח'); }
  after();
}
