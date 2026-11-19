/* Scanning, the lab users' home, print sheets (quote / labels / manifest) and the public tracking page. */
'use strict';
// item statuses in plain words: what is happening to the item right now
const SCAN_ACTIONS = [
  ['נאסף', 'נאסף מהלקוח', 'השליח לקח את החומרה'],
  ['במעבדה', 'נקלט במעבדה', 'המעבדה קיבלה את הפריט'],
  ['הומר', 'הומר', 'הפריט הומר לקבצים'],
  ['לא ניתן להמרה', 'לא ניתן להמרה', 'פגום / ריק / לא קריא'],
  ['אצלנו', 'חזר אלינו', 'החומרה חזרה מהמעבדה'],
  ['הוחזר ללקוח', 'הוחזר ללקוח', 'הלקוח קיבל את המקור'],
];
let scanner = null, lastCode = '', lastAt = 0;
VIEWS.stopScanner = () => { if (scanner) { scanner.stop().catch(() => {}); scanner = null; } };

VIEWS.scan = async function vScan() {
  const active = (S.opts.item_status || []).filter(x => x.active).map(x => x.value);
  const acts = SCAN_ACTIONS.filter(([s]) => active.includes(s) && (!isLab() || ['במעבדה', 'הומר', 'לא ניתן להמרה'].includes(s)));
  let current = sessionStorage.getItem('scanStatus'); if (!acts.some(a => a[0] === current)) current = 'במעבדה';
  const word = s => (SCAN_ACTIONS.find(a => a[0] === s) || [s, s])[1];
  view().innerHTML = `
  <div class="page-head"><div><h1>סריקת פריטים</h1><div class="sub">מעדכנים איפה כל קלטת נמצאת, בלי להיכנס להזמנה. עובד עם סורק ברקוד, מצלמת הטלפון או הקלדה.</div></div></div>
  <div class="scan-layout">
    <div class="card steps-num">
      <div><div class="lbl-n">1. מה קורה עכשיו לפריטים?</div><div class="action-pick">${acts.map(([s, t, d]) => `<button data-s="${esc(s)}" class="${s === current ? 'on' : ''}"><b>${esc(t)}</b><span>${esc(d)}</span></button>`).join('')}</div></div>
      <div><div class="lbl-n">2. סורקים את הברקודים אחד אחרי השני</div>
        <input id="manual" class="scan-input" placeholder="סורקים או מקלידים, למשל 1001-03" inputmode="numeric" autocomplete="off" aria-label="ברקוד">
        <div class="row" style="margin-top:8px"><button class="btn" id="camBtn">📷 סריקה במצלמה</button><span class="small muted">כל סריקה נשמרת מיד. אין צורך ללחוץ "שמירה".</span></div>
        <div id="reader" style="margin-top:8px"></div></div>
    </div>
    <div class="stack"><div id="orderBox"></div>
      <section class="card"><div class="card-head"><h3>מה נסרק</h3><span class="small muted" id="scanN">0</span></div><ul class="scan-log" id="log"><li class="muted" style="background:none">עוד לא נסרק כלום</li></ul></section></div>
  </div>`;
  const focusIn = () => setTimeout(() => $('#manual')?.focus(), 30);
  $$('[data-s]').forEach(b => b.onclick = () => { current = b.dataset.s; sessionStorage.setItem('scanStatus', current); $$('[data-s]').forEach(x => x.classList.toggle('on', x === b)); focusIn(); });
  let n = 0;
  const showOrder = async orderId => {
    const { data: its } = await sb.from('items').select('id, status').eq('order_id', orderId);
    const k = its.filter(i => i.status === current).length;
    // marking the whole order at once is fine for later stages; intake ("במעבדה") must stay one by one, that's the count check
    const allBtn = current !== 'במעבדה' && k < its.length ? `<button class="btn block" style="margin-top:8px" data-allorder="${orderId}">לסמן את כל ההזמנה "${esc(word(current))}" (עוד ${its.length - k})</button>` : '';
    $('#orderBox').innerHTML = `<section class="card"><div class="row spread"><div><div class="small muted">הזמנה ${orderId}</div><b>"${esc(word(current))}"</b></div><div class="big-count">${k}<span class="muted" style="font-size:20px">/${its.length}</span></div></div>
      <div class="progress" style="margin-top:10px"><div style="width:${its.length ? k / its.length * 100 : 0}%"></div></div>
      ${current === 'במעבדה' ? `<button class="btn ${k === its.length ? 'primary' : ''} block" style="margin-top:12px" data-finish="${orderId}">סיום קליטה להזמנה ${orderId}</button><p class="tiny muted" style="margin-top:6px">לוחצים כשסיימתם לספור את כל הפריטים של ההזמנה. אם חסר משהו, היא תסומן "פער בספירה".</p>` : ''}${allBtn}</section>`;
    $('[data-allorder]')?.addEventListener('click', async () => { if (await bulkItemStatus(its, current)) { showOrder(orderId); focusIn(); } });
    $('[data-finish]')?.addEventListener('click', async e => {
      const miss = its.length - k;
      if (miss && !await ask('חסרים פריטים', `נקלטו ${k} מתוך ${its.length}. חסרים ${miss}. לסיים קליטה ולסמן פער?`, { ok: 'לסיים עם פער' })) return;
      const oid = Number(e.target.dataset.finish);
      const { error } = await sb.rpc('finish_intake', { p_order: oid }); fail(error);
      toast('הקליטה הסתיימה', isLab() ? {} : { undo: () => undoOrder(oid, { intake_done_at: null }) }); focusIn();
    });
  };
  const handle = async code => {
    code = code.trim(); if (!code) return;
    const now = Date.now(); if (code === lastCode && now - lastAt < 3000) return; lastCode = code; lastAt = now;
    const { data: before } = await sb.from('items').select('status').eq('id', code).maybeSingle();
    const { data, error } = await sb.from('items').update({ status: current }).eq('id', code).select('id, order_id');
    const li = document.createElement('li');
    if (n === 0) $('#log').innerHTML = '';
    if (error || !data?.length) { li.className = 'bad'; li.innerHTML = `<b class="num">${esc(code)}</b><span>לא נמצא${isLab() ? ' (או לא שייך למעבדה שלך)' : ''}</span>`; navigator.vibrate?.(300); }
    else {
      const prev = before?.status, set = current;
      li.className = 'good'; li.innerHTML = `<span><b class="num">${esc(code)}</b> <span class="small muted">הזמנה ${data[0].order_id}</span></span><span class="row nowrap"><span class="chip green">✓ ${esc(word(set))}</span>${prev && prev !== set ? '<button class="link-btn" type="button">ביטול</button>' : ''}</span>`;
      navigator.vibrate?.(60); showOrder(data[0].order_id);
      // undo a wrong scan: put the item back to the status it had before
      $('button', li)?.addEventListener('click', async ev => {
        const { error: e2 } = await sb.from('items').update({ status: prev }).eq('id', code); fail(e2);
        ev.target.closest('.row').innerHTML = `<span class="chip">בוטל, חזר ל"${esc(word(prev))}"</span>`; li.className = '';
        lastCode = ''; showOrder(data[0].order_id); focusIn();
      });
    }
    $('#log').prepend(li); $('#scanN').textContent = ++n;
  };
  $('#manual').onkeydown = e => { if (e.key === 'Enter') { handle(e.target.value); e.target.value = ''; } };
  $('#camBtn').onclick = async () => {
    if (scanner) { VIEWS.stopScanner(); $('#camBtn').textContent = '📷 סריקה במצלמה'; return; }
    scanner = new Html5Qrcode('reader', { formatsToSupport: [Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.QR_CODE] });
    try { await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 280, height: 120 } }, handle); $('#camBtn').textContent = 'עצירת המצלמה'; }
    catch (e) { toast('אין גישה למצלמה: ' + e, { ms: 4000 }); scanner = null; }
  };
  focusIn();
};

// ---------- lab users' home ----------
VIEWS.lab = async function vLab() {
  const { data, error } = await sb.rpc('lab_orders'); fail(error);
  const open = data.filter(r => !r.intake_done).length;
  view().innerHTML = `<div class="page-head"><div><h1>${esc(S.me.lab_name || 'המעבדה')}: הזמנות פתוחות</h1>
    <div class="sub">${data.length ? `${plural(data.length, 'הזמנה אחת', 'הזמנות')}, מתוכן ${open} עוד בקליטה.` : ''} רואים כאן רק את ההזמנות שנשלחו אליכם, בלי פרטי לקוח.</div></div>
    <a class="btn primary lg" href="#scan">לסריקה</a></div>
    <div class="grid cols-3" style="margin-bottom:16px">
      <div class="card"><b>1. קליטה</b><p class="small muted">סורקים כל פריט כ"נקלט במעבדה" ולוחצים "סיום קליטה".</p></div>
      <div class="card"><b>2. המרה</b><p class="small muted">כשפריט מוכן, סורקים אותו כ"הומר". פריט פגום: "לא ניתן להמרה".</p></div>
      <div class="card"><b>3. החזרה</b><p class="small muted">שולחים למשרד את קישור הקבצים ומחזירים את החומרה.</p></div></div>
    <div class="card flush table-wrap"><table><thead><tr><th>הזמנה</th><th>שם</th><th class="num">פריטים</th><th class="num">נקלטו</th><th class="num">הומרו</th><th>קליטה</th><th></th></tr></thead><tbody>
    ${data.map(r => `<tr><td><b>${r.id}</b>${r.priority ? ' <span class="chip orange">דחוף</span>' : ''}</td><td>${esc(r.first_name)}</td><td class="num">${r.items_count}</td><td class="num">${r.items_received}</td><td class="num">${r.items_converted}</td>
      <td>${r.intake_done ? '<span class="chip green">הסתיימה</span>' : '<span class="chip orange">בקליטה</span>'}</td>
      <td>${r.intake_done ? '' : `<button class="btn sm" data-finish="${r.id}">סיום קליטה</button>`}</td></tr>`).join('') || '<tr class="empty-row"><td colspan="7">אין הזמנות פתוחות כרגע</td></tr>'}</tbody></table></div>`;
  $$('[data-finish]').forEach(b => b.onclick = async () => {
    const r = data.find(x => String(x.id) === b.dataset.finish);
    if (r.items_received < r.items_count && !await ask('חסרים פריטים', `נקלטו ${r.items_received} מתוך ${r.items_count}. לסיים בכל זאת?`, { ok: 'לסיים עם פער' })) return;
    const { error } = await sb.rpc('finish_intake', { p_order: r.id }); fail(error); VIEWS.lab();
  });
};

// ---------- print sheets ----------
const printBar = (id, note = '') => `<div class="row no-print" style="margin-bottom:16px"><a class="btn" href="#order/${id}">→ חזרה ללקוח</a><button class="btn primary" onclick="print()">הדפסה / שמירה כ-PDF</button>${note ? `<span class="small muted">${note}</span>` : ''}</div>`;
VIEWS.quote = async function vQuote(id) {
  const o = await getOrder(id);
  const [{ data: c }, { data: lines }] = await Promise.all([sb.from('customers').select('*').eq('id', o.customer_id).single(), sb.from('order_lines').select('*').eq('order_id', id)]);
  const rows = lines.filter(l => l.qty).map(l => { const p = S.products.find(x => x.id === l.product_id); const pr = l.unit_price ?? p.unit_price; return `<tr><td class="wrap">${esc(p.name)}</td><td class="num">${l.qty}</td><td class="num">${money(pr)}</td><td class="num">${money(pr * l.qty)}</td></tr>`; }).join('');
  view().innerHTML = printBar(id) + `<div class="card paper">
    <div class="row spread" style="margin-bottom:16px"><h1>הצעת מחיר</h1><div class="muted">הזמנה ${o.id} · ${fmtDate(new Date())}</div></div>
    <p><b>המעבדה להמרת קלטות ודיסקים</b></p><p style="margin-bottom:16px">לכבוד: ${esc(c.full_name || '')} · ${esc(fmtPhone(c.phone))}${c.city ? ' · ' + esc(c.city) : ''}</p>
    <table><thead><tr><th>פריט</th><th class="num">כמות</th><th class="num">מחיר</th><th class="num">סה"כ</th></tr></thead><tbody>${rows}
    ${o.package_name ? `<tr><td>${esc(o.package_name)}</td><td class="num">1</td><td></td><td class="num">${money(S.products.find(p => p.id === o.package_id)?.unit_price)}</td></tr>` : ''}</tbody></table>
    <div class="totals" style="margin-top:16px;max-width:340px;margin-inline-start:auto">
      ${o.tier_percent > 0 ? `<span>הנחת כמות ${Number(o.tier_percent)}%</span><span>-${money(o.tier_discount)}</span>` : ''}
      ${o.coupon_code ? `<span>קופון ${esc(o.coupon_code)}</span><span>${o.coupon_percent > 0 ? '-' + Number(o.coupon_percent) + '%' : '-' + money(o.coupon_amount)}</span>` : ''}
      ${o.manual_discount > 0 ? `<span>הנחה</span><span>-${money(o.manual_discount)}</span>` : ''}
      <span>לפני מע"מ</span><span>${money(o.total_before_vat)}</span><span class="grand">סה"כ כולל מע"מ</span><span class="grand">${money(o.total)}</span></div>
    <p class="small" style="margin-top:24px;white-space:pre-line">${esc(S.settings.terms?.text_value || '')}</p></div>`;
};
VIEWS.labels = async function vLabels(id) {
  const [{ data: items, error }, o] = await Promise.all([sb.from('items').select('*').eq('order_id', id).order('seq'), getOrder(id)]); fail(error);
  view().innerHTML = printBar(id, 'דף A4, 3×8 מדבקות (70×37 מ"מ). מדביקים מדבקה על כל פריט.') +
    `<div class="labels">${items.map(it => `<div class="lbl"><svg data-code="${esc(it.id)}"></svg><div>${esc(firstName(o.full_name))} · ${esc(productName(it.product_id).split(' (')[0])} · ${it.seq}/${items.length}</div></div>`).join('') || '<div class="card">אין עדיין ברקודים. יוצרים אותם בדף הלקוח, בחלק "פריטים וברקודים".</div>'}</div>`;
  $$('svg[data-code]').forEach(svg => JsBarcode(svg, svg.dataset.code, { format: 'CODE128', height: 50, fontSize: 16, margin: 2 }));
};
VIEWS.manifest = async function vManifest(id) {
  const [o, { data: items }, { data: lines }] = await Promise.all([getOrder(id), sb.from('items').select('*').eq('order_id', id).order('seq'), sb.from('order_lines').select('*').eq('order_id', id)]);
  const byType = lines.filter(l => S.products.find(p => p.id === l.product_id)?.category === 'media' && l.qty);
  view().innerHTML = printBar(id, 'מדפיסים 2 עותקים: אחד נשאר אצל מי שמסר, אחד נוסע עם החבילה.') + `<div class="card paper">
    <div class="row spread"><h1>דף משלוח · הזמנה ${o.id}</h1><svg id="mbar"></svg></div>
    <div class="fields" style="margin:12px 0"><div><b>לקוח:</b> ${esc(firstName(o.full_name))}${o.city ? ', ' + esc(o.city) : ''}</div><div><b>מעבדה:</b> ${esc(o.lab_name || '________')}</div>
      <div><b>תאריך:</b> ${fmtDate(new Date())}</div><div><b>סה"כ פריטים:</b> ${o.media_qty}</div></div>
    <p style="margin-bottom:12px"><b>לפי סוג:</b> ${byType.map(l => `${esc(productName(l.product_id))}: ${l.qty}`).join(' · ') || '-'}</p>
    <table><thead><tr><th>✓</th><th>ברקוד</th><th>סוג</th><th>מה כתוב עליו</th><th>הערה</th></tr></thead><tbody>
      ${items.map(it => `<tr><td>☐</td><td><b>${esc(it.id)}</b></td><td class="wrap">${esc(productName(it.product_id))}</td><td class="wrap">${esc(it.label_text || '')}</td><td class="wrap">${it.damaged ? 'פגום. ' : ''}${esc(it.notes || '')}</td></tr>`).join('') || '<tr><td colspan="5">אין עדיין ברקודים. יוצרים אותם בדף הלקוח.</td></tr>'}</tbody></table>
    <div class="sign"><div>מסר: ____________ חתימה: ____________</div><div>קיבל: ____________ חתימה: ____________</div><div>תאריך ושעה: ____________ נספרו: ______ פריטים</div></div></div>`;
  JsBarcode('#mbar', String(o.id), { format: 'CODE128', height: 40, fontSize: 14, margin: 0 });
};

// ---------- public tracking page (no login) ----------
VIEWS.track = async function vTrack(token) {
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden'); $('.topbar').classList.add('hidden');
  const { data, error } = await sb.rpc('track_order', { p_token: token });
  if (error || !data) { view().innerHTML = '<div class="card track"><h1>ההזמנה לא נמצאה</h1><p>בדקו את הקישור או כתבו לנו בוואטסאפ.</p></div>'; return; }
  const steps = [['ההזמנה התקבלה', data.paid_at], ['החומרים נאספו', data.picked_up_at], ['במעבדה, בעבודה', data.lab_received_at], ['ההמרה הסתיימה', data.conversion_done_at], ['הקבצים נשלחו אליכם', data.delivery_sent_at], ['הושלם', data.completed_at || data.returned_at]];
  const curIdx = steps.reduce((a, s, i) => s[1] ? i : a, -1);
  view().innerHTML = `<div class="card track">
    <h1>שלום ${esc(data.first_name)}, זה מצב ההזמנה שלך</h1><p class="muted">הזמנה ${data.id} · המעבדה להמרת קלטות ודיסקים</p>
    <ol class="steps">${steps.map(([l, d], i) => `<li class="${i <= curIdx ? 'done' : ''} ${i === curIdx ? 'cur' : ''}"><span class="b">${i <= curIdx ? '✓' : i + 1}</span><span>${l}${d ? `<span class="small muted"> · ${fmtDate(d)}</span>` : ''}</span></li>`).join('')}</ol>
    ${data.items_count ? `<p>${data.items_converted} מתוך ${data.items_count} פריטים הומרו.</p>` : ''}
    ${data.delivery_link ? `<a class="btn primary lg" style="margin-top:12px" href="${esc(data.delivery_link)}" target="_blank" rel="noopener">להורדת הקבצים</a>` : ''}
    <p class="small muted" style="margin-top:16px">שאלות? פשוט עונים לנו בוואטסאפ.</p></div>`;
};
