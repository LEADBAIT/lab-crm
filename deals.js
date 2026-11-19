/* לקוחות: every deal in one place. Tabs by phase, board or table, one filter row. */
'use strict';
const DEAL_TABS = [['sales', 'מכירה'], ['ops', 'בעבודה'], ['done', 'הסתיימו'], ['lost', 'לא רלוונטי'], ['all', 'הכל']];
VIEWS.deals = async function vDeals(tab) {
  tab = DEAL_TABS.some(t => t[0] === tab) ? tab : (sessionStorage.getItem('dealsTab') || 'sales');
  sessionStorage.setItem('dealsTab', tab);
  const rows = await getOrders();
  rows.forEach(r => r._ph = phaseOf(r.stage));
  const counts = Object.fromEntries(DEAL_TABS.map(([k]) => [k, k === 'all' ? rows.length : rows.filter(r => r._ph === k).length]));
  const boardable = tab === 'sales' || tab === 'ops';
  const mode = boardable ? (lsGet('dealsView') || 'board') : 'table';
  const F = JSON.parse(sessionStorage.getItem('dealsF') || '{}');
  const list = rows.filter(r => tab === 'all' || r._ph === tab);
  const sources = [...new Set(list.map(r => r.source).filter(Boolean))];
  view().innerHTML = `
  <div class="page-head"><div><h1>לקוחות</h1><div class="sub">כל פנייה והזמנה במקום אחד. לוחצים על לקוח כדי לראות מה הצעד הבא איתו.</div></div>
    ${boardable ? `<div class="seg" role="tablist" aria-label="תצוגה"><button class="${mode === 'board' ? 'on' : ''}" data-mode="board">לוח</button><button class="${mode === 'table' ? 'on' : ''}" data-mode="table">טבלה</button></div>` : ''}</div>
  <div class="row spread" style="margin-bottom:12px">
    <div class="seg">${DEAL_TABS.map(([k, n]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${n} <span class="n">${counts[k]}</span></button>`).join('')}</div>
    <div class="filters">
      <input class="search-in" id="fq" type="search" placeholder="סינון לפי שם, טלפון או מספר" value="${esc(F.q || '')}">
      ${sources.length ? `<select id="fsrc"><option value="">כל המקורות</option>${sources.map(s => `<option ${F.src === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>` : ''}
      ${tab !== 'sales' ? `<select id="flab"><option value="">כל המעבדות</option>${S.labs.map(l => `<option ${F.lab === l.name ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>` : ''}
      <label class="check"><input type="checkbox" id="furg" ${F.urg ? 'checked' : ''}> רק מה שדורש טיפול</label>
    </div>
  </div>
  ${tab === 'ops' ? opsTasksHtml(rows) : ''}
  <div id="dealsBody"></div>`;
  const urgent = r => r.flag_late || r.flag_count_mismatch || r.flag_cash_at_courier || (r.stage === 'פנייה חדשה' && !r.last_contact_at);
  const draw = () => {
    const q = (F.q || '').trim();
    const vis = list.filter(r => (!q || `${r.id} ${r.full_name || ''} ${r.phone || ''}`.includes(q)) && (!F.src || r.source === F.src) && (!F.lab || r.lab_name === F.lab) && (!F.urg || urgent(r)));
    $('#dealsBody').innerHTML = mode === 'board' ? boardHtml(vis, tab) : tableHtml(vis, tab);
    bindDealsBody(vis);
  };
  const saveF = () => sessionStorage.setItem('dealsF', JSON.stringify(F));
  $('#fq').oninput = e => { F.q = e.target.value; saveF(); draw(); };
  $('#fsrc') && ($('#fsrc').onchange = e => { F.src = e.target.value; saveF(); draw(); });
  $('#flab') && ($('#flab').onchange = e => { F.lab = e.target.value; saveF(); draw(); });
  $('#furg').onchange = e => { F.urg = e.target.checked; saveF(); draw(); };
  $$('[data-tab]').forEach(b => b.onclick = () => go('deals/' + b.dataset.tab));
  if (tab === 'ops') { const tasks = buildTasks(rows.filter(r => r._ph === 'ops')).filter(x => x.t.k !== 'new'); $$('[data-tact]').forEach(b => b.onclick = () => runTask(tasks.find(x => String(x.o.id) === b.dataset.tact), b)); }
  $$('[data-mode]').forEach(b => b.onclick = () => { lsSet('dealsView', b.dataset.mode); VIEWS.deals(tab); });
  draw();
};

/** Operations tasks (cash at courier, pickup today, delivery, late, expiring links): one card above the work board. */
function opsTasksHtml(rows) {
  const tasks = buildTasks(rows.filter(r => r._ph === 'ops')).filter(x => x.t.k !== 'new');
  if (!tasks.length) return '';
  return `<section class="card flush" style="margin-bottom:12px"><div class="card-head" style="padding:12px 16px 0"><h3>משימות תפעול</h3><span class="small muted">${tasks.length}</span></div>${tasks.map(taskHtml).join('')}</section>`;
}
function dealFlags(r) {
  return [r.stage === 'פנייה חדשה' && !r.last_contact_at && '<span class="chip red">עוד לא דיברנו</span>',
    r.flag_late && `<span class="chip ${r.flag_late}">${r.days_since_paid} ימים מתשלום</span>`, r.flag_count_mismatch && '<span class="chip red">פער בספירה</span>',
    r.flag_cash_at_courier && '<span class="chip orange">מזומן אצל שליח</span>', r.priority && '<span class="chip orange">דחוף</span>', r.is_repeat && '<span class="chip blue">חוזר</span>'].filter(Boolean).join('');
}
function boardHtml(vis, tab) {
  const lanes = STEPS.filter(s => s.phase === tab);
  return `<div class="kanban">${lanes.map(s => { const l = vis.filter(r => r.stage === s.key), sum = l.reduce((a, r) => a + Number(r.total || 0), 0);
    return `<div class="lane" data-stage="${esc(s.key)}"><div class="lane-head"><div><span class="stage-pill"><span class="dot" style="background:${stageColor(s.key)}"></span>${esc(s.key)}</span>${sum ? `<span class="sum">${money(sum)}</span>` : ''}</div><span class="n">${l.length}</span></div>
      ${l.map(r => `<div class="kcard" draggable="true" data-id="${r.id}"><div class="row spread nowrap"><span class="t">${esc(custName(r))}</span>${r.total > 0 ? `<span class="small b num">${money(r.total)}</span>` : ''}</div>
        <div class="m">${esc(subStatus(r))}</div>${dealFlags(r) ? `<div class="tags">${dealFlags(r)}</div>` : ''}</div>`).join('') || '<p class="tiny muted" style="padding:8px">אין כאן כרגע</p>'}</div>`; }).join('')}</div>
    <p class="tiny muted" style="margin-top:8px">אפשר לגרור כרטיס לעמודה אחרת כדי להעביר שלב. לטיפול בכמה לקוחות יחד: תצוגת "טבלה".</p>`;
}
function tableHtml(vis, tab) {
  const timeCol = r => r._ph === 'ops' && r.days_since_paid != null ? `<span class="chip ${r.flag_late || ''}">${r.days_since_paid} ימים מתשלום</span>` : `<span class="muted small">${ago(r.created_at)}</span>`;
  const sel = tab !== 'done';
  const moveTo = tab === 'sales' ? STEPS.filter(s => s.phase === 'sales') : tab === 'ops' ? STEPS.filter(s => s.phase !== 'sales') : tab === 'all' ? STEPS : [];
  const bar = sel ? `<div class="bulk-bar hidden" id="dbulk"><b id="dbulkN"></b>
    ${moveTo.length ? `<span>להעביר ל:</span><select id="dbTo">${moveTo.map(s => `<option>${esc(s.key)}</option>`).join('')}</select><button class="btn sm primary" id="dbMove">העברה</button>` : ''}
    ${tab === 'ops' ? `<span>·</span><select id="dbLab"><option value="">שיוך מעבדה…</option>${S.labs.filter(l => l.active).map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select>` : ''}
    ${tab === 'lost' ? '<button class="btn sm primary" id="dbRevive">החזרה לטיפול</button>' : '<button class="btn sm" id="dbLost">סימון כלא רלוונטי</button>'}
    <button class="btn sm ghost" id="dbClear">ביטול הבחירה</button></div>` : '';
  return `${bar}<div class="card flush table-wrap"><table><thead><tr>${sel ? '<th class="sel"><input type="checkbox" id="dselAll" aria-label="בחירת כולם"></th>' : ''}<th>לקוח</th><th>שלב</th><th>מה המצב</th>${tab !== 'sales' ? '<th>מעבדה</th>' : '<th>מקור</th>'}<th class="num">פריטים</th><th class="num">סכום</th><th>זמן</th><th>דורש תשומת לב</th></tr></thead><tbody>
    ${vis.map(r => `<tr class="click" data-id="${r.id}">${sel ? `<td class="sel"><input type="checkbox" data-dsel="${r.id}" aria-label="בחירה"></td>` : ''}<td><b>${esc(custName(r))}</b><span class="sub"><bdi dir="ltr">${esc(fmtPhone(r.phone))}</bdi> · #${r.id}</span></td>
      <td>${stagePill(r.stage)}</td><td class="wrap small">${esc(subStatus(r))}</td>
      <td class="small">${tab !== 'sales' ? esc(r.lab_name || (r._ph === 'ops' ? '—' : '')) : esc(r.source || '')}</td>
      <td class="num">${r.media_qty || ''}</td><td class="num">${money(r.total)}</td><td>${timeCol(r)}</td><td><div class="row" style="gap:4px">${dealFlags(r)}</div></td></tr>`).join('')
      || `<tr class="empty-row"><td colspan="9">אין לקוחות שמתאימים לסינון</td></tr>`}</tbody></table></div>
    ${sel && vis.length ? '<p class="tiny muted" style="margin-top:8px">כדי לטפל בכמה לקוחות יחד: מסמנים אותם בעמודה הראשונה.</p>' : ''}`;
}
function bindDealsBody(vis) {
  $$('#dealsBody [data-id]').forEach(el => el.addEventListener('click', e => { if (e.target.closest('.sel')) return; go('order/' + el.dataset.id); }));
  // bulk selection (table view)
  const picked = () => { const ids = new Set($$('[data-dsel]:checked').map(c => Number(c.dataset.dsel))); return vis.filter(r => ids.has(r.id)); };
  const sync = () => { const n = picked().length, bar = $('#dbulk'); if (!bar) return; bar.classList.toggle('hidden', !n); $('#dbulkN').textContent = `נבחרו ${n}`;
    const all = $('#dselAll'); all.checked = n && n === $$('[data-dsel]').length; all.indeterminate = n > 0 && !all.checked; };
  $$('[data-dsel]').forEach(c => c.onchange = sync);
  $('#dselAll') && ($('#dselAll').onchange = e => { $$('[data-dsel]').forEach(c => c.checked = e.target.checked); sync(); });
  const redraw = () => VIEWS.deals(sessionStorage.getItem('dealsTab'));
  $('#dbClear') && ($('#dbClear').onclick = () => { $$('[data-dsel]').forEach(c => c.checked = false); sync(); });
  $('#dbMove') && ($('#dbMove').onclick = async () => { if (await bulkMove(picked(), $('#dbTo').value)) redraw(); });
  $('#dbLost') && ($('#dbLost').onclick = async () => { if (await bulkMove(picked(), LOST)) redraw(); });
  $('#dbRevive') && ($('#dbRevive').onclick = async () => { const rs = picked(); await bulkPatch(rs, { stage: 'פנייה חדשה' }, `${rs.length} חזרו לטיפול (פנייה חדשה)`); redraw(); });
  $('#dbLab') && ($('#dbLab').onchange = async e => { const id = Number(e.target.value); if (!id) return; const rs = picked(); await bulkPatch(rs, { lab_id: id }, `${rs.length} שויכו ל${S.labs.find(l => l.id === id)?.name}`); redraw(); });
  $$('.kcard').forEach(c => { c.addEventListener('dragstart', e => { e.dataTransfer.setData('id', c.dataset.id); c.classList.add('dragging'); }); c.addEventListener('dragend', () => c.classList.remove('dragging')); });
  $$('.lane').forEach(l => {
    l.addEventListener('dragover', e => { e.preventDefault(); l.classList.add('drop'); });
    l.addEventListener('dragleave', () => l.classList.remove('drop'));
    l.addEventListener('drop', async e => {
      e.preventDefault(); l.classList.remove('drop');
      const o = vis.find(r => String(r.id) === e.dataTransfer.getData('id'));
      if (o && await changeStage(o, l.dataset.stage)) VIEWS.deals(sessionStorage.getItem('dealsTab'));
    });
  });
}
