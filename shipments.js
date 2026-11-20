/* Shipments (manifests): every hand-over of hardware between places. One shipment = one or more orders,
   counted when it leaves and again when it arrives. The printed sheet carries order numbers only, no customer names. */
'use strict';
const SHIP_DIR = {
  to_lab: ['מהלקוח למעבדה', 'הלקוח', 'המעבדה'],
  us_to_lab: ['מאיתנו למעבדה', 'אנחנו', 'המעבדה'],
  lab_to_us: ['מהמעבדה אלינו', 'המעבדה', 'אנחנו'],
  lab_to_customer: ['מהמעבדה ללקוח', 'המעבדה', 'הלקוח'],
  us_to_customer: ['מאיתנו ללקוח', 'אנחנו', 'הלקוח'],
};
const shipNo = id => 'S-' + id;
const labName = id => S.labs.find(l => l.id === id)?.name || '';
const shipState = s => !s.sent_at ? ['טיוטה', ''] : !s.received_at ? ['בדרך', 'blue']
  : s.count_received != null && s.count_sent != null && s.count_received !== s.count_sent ? ['פער בספירה', 'red'] : ['התקבל', 'green'];

VIEWS.shipments = async function vShipments() {
  const parts = location.hash.slice(1).split('/'); // #shipments/new/1002
  const { data: ships, error } = await sb.from('shipments').select('*, shipment_orders(order_id)').order('id', { ascending: false }).limit(200); fail(error);
  const open = ships.filter(s => !s.received_at), done = ships.filter(s => s.received_at);
  const row = s => { const [st, cls] = shipState(s), ids = s.shipment_orders.map(x => x.order_id);
    return `<tr data-ship="${s.id}" class="clickable"><td><b>${shipNo(s.id)}</b></td><td>${esc(SHIP_DIR[s.direction]?.[0] || s.direction)}</td><td>${esc(labName(s.lab_id))}</td>
      <td class="small">${ids.map(i => '#' + i).join(', ')}</td><td class="num">${s.count_sent ?? '—'}</td><td class="num">${s.count_received ?? '—'}</td>
      <td class="small">${s.sent_at ? fmtShort(s.sent_at) : ''}</td><td class="small">${s.received_at ? fmtShort(s.received_at) : ''}</td>
      <td><span class="chip ${cls}">${st}</span>${s.received_at && !s.signed ? ' <span class="chip orange">חסר דף חתום</span>' : ''}</td></tr>`; };
  const table = (rows, empty) => `<div class="card flush table-wrap"><table><thead><tr><th>משלוח</th><th>כיוון</th><th>מעבדה</th><th>הזמנות</th><th class="num">נשלחו</th><th class="num">התקבלו</th><th>יצא</th><th>הגיע</th><th>מצב</th></tr></thead>
    <tbody>${rows.map(row).join('') || `<tr class="empty-row"><td colspan="9">${empty}</td></tr>`}</tbody></table></div>`;
  view().innerHTML = `<div class="page-head"><div><div class="sub">כל העברה של חומרה בין מקומות: רשימת פריטים, ספירה ביציאה וספירה בהגעה. הדף המודפס מראה מספרי הזמנות בלבד.</div></div>
      <button class="btn primary" id="newShip">+ משלוח חדש</button></div>
    <h3 style="margin:4px 0 8px">פתוחים (${open.length})</h3>${table(open, 'אין משלוחים פתוחים')}
    <h3 style="margin:20px 0 8px">הסתיימו</h3>${table(done.slice(0, 50), 'עוד אין')}`;
  $$('[data-ship]').forEach(tr => tr.onclick = () => go('shipment/' + tr.dataset.ship));
  $('#newShip').onclick = () => newShipment();
  if (parts[1] === 'new') { history.replaceState(null, '', '#shipments'); newShipment(Number(parts[2]) || null); }
};

async function newShipment(preOrder) {
  const { data: orders, error } = await sb.from('v_orders').select('id, full_name, stage, lab_id, lab_name, items_count, media_qty, returned_at, phase').eq('phase', 'ops').order('id'); fail(error);
  const pre = orders.find(o => o.id === preOrder);
  const guessDir = o => !o ? 'lab_to_us' : !o.lab_id || ['לתאם איסוף', 'בדרך למעבדה'].includes(o.stage) ? 'to_lab' : o.stage === 'למסירה ללקוח' ? 'us_to_customer' : 'lab_to_us';
  const p = modal(`<h2>משלוח חדש</h2><form id="shF" class="grid">
    <div class="fields">
      <label class="field">כיוון<select name="direction">${Object.entries(SHIP_DIR).map(([k, [t]]) => `<option value="${k}" ${k === guessDir(pre) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="field">מעבדה<select name="lab_id"><option value="">—</option>${S.labs.filter(l => l.active).map(l => `<option value="${l.id}" ${pre?.lab_id === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
      <label class="field">שליח<select name="courier">${opts('courier')}</select></label>
      <label class="field">מספר מעקב<input name="tracking" dir="ltr"></label></div>
    <div><div class="small muted" style="margin-bottom:6px">אילו הזמנות במשלוח? (רק הזמנות בעבודה)</div>
      <div class="ship-pick" id="shPick">${orders.filter(o => !o.returned_at).map(o => `<label class="ship-opt" data-lab="${o.lab_id || ''}"><input type="checkbox" name="o" value="${o.id}" ${o.id === preOrder ? 'checked' : ''}>
        <b>#${o.id}</b><span>${esc(custName(o))}</span><span class="muted small">${esc(o.stage)} · ${o.items_count || o.media_qty} פריטים${o.lab_name ? ' · ' + esc(o.lab_name) : ''}</span></label>`).join('') || '<p class="muted">אין הזמנות בעבודה</p>'}</div></div>
    <label class="field">הערה<input name="notes"></label>
    <div class="actions"><button class="btn primary">יצירת המשלוח</button><button type="button" class="btn" id="shNo">ביטול</button></div></form>`, { wide: true });
  // choosing a lab shows that lab's orders first, the rest stay selectable
  const sortPick = () => { const lab = $('[name=lab_id]', p).value; [...$$('.ship-opt', p)].sort((a, b) => (b.dataset.lab === lab) - (a.dataset.lab === lab)).forEach(x => $('#shPick', p).appendChild(x)); };
  $('[name=lab_id]', p).onchange = sortPick; sortPick();
  $('#shNo', p).onclick = closeModal;
  $('#shF', p).onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target), ids = fd.getAll('o').map(Number);
    if (!ids.length) return toast('בוחרים לפחות הזמנה אחת');
    const { data: s, error: e1 } = await sb.from('shipments').insert({ direction: fd.get('direction'), lab_id: Number(fd.get('lab_id')) || null, courier: fd.get('courier') || null, tracking: fd.get('tracking') || null, notes: fd.get('notes') || null }).select('id').single(); fail(e1);
    const { error: e2 } = await sb.from('shipment_orders').insert(ids.map(order_id => ({ shipment_id: s.id, order_id }))); fail(e2);
    closeModal(); toast(`משלוח ${shipNo(s.id)} נוצר`); go('shipment/' + s.id);
  };
}

VIEWS.shipment = async function vShipment(id) {
  const { data: s, error } = await sb.from('shipments').select('*, shipment_orders(order_id)').eq('id', id).single(); fail(error);
  const ids = s.shipment_orders.map(x => x.order_id).sort((a, b) => a - b);
  const [{ data: items, error: e2 }, { data: ords, error: e3 }] = await Promise.all([
    sb.from('items').select('id, order_id, seq, product_id, label_text, status, damaged').in('order_id', ids.length ? ids : [0]).order('order_id').order('seq'),
    sb.from('v_orders').select('id, priority, media_qty, items_count').in('id', ids.length ? ids : [0])]); fail(e2); fail(e3);
  const total = ords.reduce((a, o) => a + (o.items_count || o.media_qty || 0), 0);
  const [dir, from, to] = SHIP_DIR[s.direction] || [s.direction, '', ''];
  const [st, cls] = shipState(s);
  const mismatch = s.received_at && s.count_received != null && s.count_received !== s.count_sent;
  view().innerHTML = `<div class="row no-print" style="margin-bottom:16px;flex-wrap:wrap">
      <a class="btn" href="#shipments">→ כל המשלוחים</a>
      ${!s.sent_at ? `<button class="btn primary" id="shSent">יצא עכשיו (${total} פריטים)</button>` : ''}
      ${s.sent_at && !s.received_at ? '<button class="btn primary" id="shRecv">הגיע: רישום הספירה</button>' : ''}
      <label class="toggle"><input type="checkbox" id="shSigned" ${s.signed ? 'checked' : ''}> הדף החתום אצלי</label>
      <button class="btn" onclick="print()">הדפסה (2 עותקים)</button>
      ${!s.sent_at ? '<button class="btn ghost danger" id="shDel">מחיקת הטיוטה</button>' : ''}
      <span class="chip ${cls}">${st}</span></div>
    ${mismatch ? `<div class="warn no-print" style="margin-bottom:12px">פער בספירה: יצאו ${s.count_sent}, הגיעו ${s.count_received}. מבררים היום מול ${esc(from)} לפי הדף החתום, ורושמים בהערות.</div>` : ''}
    <div class="card paper">
      <div class="row spread"><h1>משלוח ${shipNo(s.id)} · ${esc(dir)}</h1><svg id="sbar"></svg></div>
      <div class="fields" style="margin:12px 0">
        <div><b>מ:</b> ${esc(from === 'המעבדה' ? labName(s.lab_id) || from : from)}</div><div><b>אל:</b> ${esc(to === 'המעבדה' ? labName(s.lab_id) || to : to)}</div>
        <div><b>שליח:</b> ${esc(s.courier || '________')}</div><div><b>מספר מעקב:</b> <bdi dir="ltr">${esc(s.tracking || '________')}</bdi></div>
        <div><b>הזמנות:</b> ${ids.length}</div><div><b>סה"כ פריטים:</b> ${total}</div>
        <div><b>יצא:</b> ${s.sent_at ? fmtDT(s.sent_at) : '________'}</div><div><b>הגיע:</b> ${s.received_at ? fmtDT(s.received_at) : '________'}</div></div>
      ${s.notes ? `<p><b>הערה:</b> ${esc(s.notes)}</p>` : ''}
      ${ids.map(oid => { const its = items.filter(i => i.order_id === oid), o = ords.find(x => x.id === oid) || {};
        return `<h3 style="margin:16px 0 6px">הזמנה ${oid}${o.priority ? ' · אקספרס' : ''} · ${its.length || o.media_qty} פריטים</h3>
        <table><thead><tr><th>✓</th><th>ברקוד</th><th>סוג</th><th>מה כתוב עליו</th><th>מצב</th></tr></thead><tbody>
        ${its.map(it => `<tr><td>☐</td><td><b>${esc(it.id)}</b></td><td class="wrap">${esc(productName(it.product_id).split(' (')[0])}</td><td class="wrap">${esc(it.label_text || '')}</td><td class="small">${it.damaged ? 'פגום' : ''}</td></tr>`).join('') || '<tr><td colspan="5">אין ברקודים להזמנה הזאת (המעבדה מדביקה בקליטה)</td></tr>'}</tbody></table>`; }).join('')}
      <div class="sign"><div>מסר: ____________ חתימה: ____________</div><div>קיבל: ____________ חתימה: ____________</div><div>תאריך ושעה: ____________ נספרו בהגעה: ______ פריטים</div></div>
      <p class="tiny muted" style="margin-top:12px">שני הצדדים סופרים וחותמים. פער מדווחים באותו יום. הזמנה אחת = ארגז אחד.</p></div>`;
  JsBarcode('#sbar', shipNo(s.id), { format: 'CODE128', height: 40, fontSize: 14, margin: 0 });
  const save = async (patch, msg) => { const { error } = await sb.from('shipments').update(patch).eq('id', s.id); fail(error); toast(msg); VIEWS.shipment(id); };
  $('#shSent') && ($('#shSent').onclick = () => save({ sent_at: new Date().toISOString(), count_sent: total }, `המשלוח יצא עם ${total} פריטים`));
  $('#shSigned').onchange = e => save({ signed: e.target.checked }, e.target.checked ? 'נרשם שהדף החתום אצלך' : 'בוטל');
  $('#shDel') && ($('#shDel').onclick = async () => { if (!await ask('למחוק את הטיוטה?', 'המשלוח עוד לא יצא. ההזמנות לא משתנות.', { ok: 'מחיקה', danger: true })) return;
    const { error } = await sb.from('shipments').delete().eq('id', s.id); fail(error); toast('הטיוטה נמחקה'); go('shipments'); });
  $('#shRecv') && ($('#shRecv').onclick = async () => {
    const backToUs = s.direction === 'lab_to_us';
    const f = await formModal(`הגעת משלוח ${shipNo(s.id)}`, `<label class="field">כמה פריטים נספרו בהגעה? <span class="req">*</span><input name="n" type="number" min="0" required value="${s.count_sent ?? total}"><span class="hint">יצאו ${s.count_sent ?? total}. סופרים בפועל, לא מעתיקים.</span></label>
      ${backToUs ? `<label class="toggle"><input type="checkbox" name="mark" checked> לסמן את הפריטים של ${plural(ids.length, 'ההזמנה', 'ההזמנות')} "חזר אלינו"</label>` : ''}`, { ok: 'רישום ההגעה' });
    if (!f) return;
    const n = Number(f.n);
    const { error } = await sb.from('shipments').update({ received_at: new Date().toISOString(), count_received: n }).eq('id', s.id); fail(error);
    if (backToUs && f.mark) { const moving = items.filter(i => LAB_PLACES.includes(i.status)); if (moving.length) await bulkItemStatus(moving, 'אצלנו'); }
    if (n !== (s.count_sent ?? total)) await tell('פער בספירה', `יצאו ${s.count_sent ?? total}, הגיעו ${n}. מבררים היום לפי הדף החתום.`); else toast('המשלוח התקבל, הספירה תואמת');
    VIEWS.shipment(id);
  });
};
