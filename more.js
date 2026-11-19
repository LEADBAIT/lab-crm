/* דוחות, הוצאות, הגדרות. */
'use strict';
// ---------- REPORTS ----------
VIEWS.reports = async function vReports() {
  const rows = await getOrders();
  const [{ data: exp }, { data: lines }] = await Promise.all([sb.from('expenses').select('*'), sb.from('order_lines').select('order_id, product_id, qty, unit_price')]);
  const month = today().slice(0, 7), sel = sessionStorage.getItem('dashMonth') || month;
  const prevOf = m => { const [y, mm] = m.split('-').map(Number); const d = new Date(y, mm - 2, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const mName = m => new Date(m + '-01').toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  const stats = m => {
    const inM = d => d && d.slice(0, 7) === m;
    const leads = rows.filter(r => inM(r.created_at)), paid = rows.filter(r => inM(r.paid_at) && r.payment_status !== 'הוחזר');
    const revenue = paid.reduce((s, r) => s + Number(r.paid_amount || r.total || 0), 0);
    const expM = (exp || []).filter(e => e.spent_on.slice(0, 7) === m);
    return { leads, paid, revenue, closed: leads.filter(r => r.paid_at).length, lost: rows.filter(r => r.stage === LOST && inM(r.stage_changed_at)),
      ads: expM.filter(e => e.category === 'פרסום').reduce((s, e) => s + Number(e.amount), 0), expTotal: expM.reduce((s, e) => s + Number(e.amount), 0) };
  };
  const A = stats(sel), B = stats(prevOf(sel));
  const delta = (a, b, pts = false) => { if (!b) return '<span class="muted">אין נתון קודם</span>'; const d = a - b; return `<span class="delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${pts ? Math.abs(d) + ' נק\'' : Math.abs(Math.round(d / b * 100)) + '%'}</span> <span class="muted">מול חודש קודם</span>`; };
  const conv = s => s.leads.length ? Math.round(s.closed / s.leads.length * 100) : 0;
  const done = rows.filter(r => r.completed_at && r.paid_at);
  const avgDays = arr => arr.length ? Math.round(arr.reduce((s, r) => s + (new Date(r.completed_at) - new Date(r.paid_at)) / 864e5, 0) / arr.length) : null;
  const countBy = (arr, key) => { const m = {}; arr.forEach(r => { const k = r[key] || 'לא צוין'; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const bars = (pairs, fmt = v => v) => { const max = Math.max(1, ...pairs.map(p => p[1])); return pairs.map(([k, v]) => `<div class="bar-row"><span title="${esc(k)}">${esc(k)}</span><div class="bar-track"><div class="bar-fill" style="width:${v / max * 100}%"></div></div><span class="num">${fmt(v)}</span></div>`).join('') || '<p class="muted small">אין עדיין נתונים</p>'; };
  const kpi = (l, v, d = '') => `<div class="card kpi"><span class="l">${l}</span><span class="v">${v}</span><span class="d">${d}</span></div>`;
  const srcConv = k => { const s = rows.filter(x => (x.source || 'לא צוין') === k); return s.length ? Math.round(s.filter(x => x.paid_at).length / s.length * 100) : 0; };
  const paidIds = new Set(A.paid.map(r => r.id)), revByType = {};
  (lines || []).filter(l => paidIds.has(l.order_id)).forEach(l => { const p = S.products.find(x => x.id === l.product_id); if (!p) return; const k = p.category === 'media' ? p.name.split(' (')[0] : 'תוספות'; revByType[k] = (revByType[k] || 0) + l.qty * Number(l.unit_price ?? p.unit_price); });
  const labDays = S.labs.map(l => [l.name, avgDays(done.filter(r => r.lab_id === l.id))]).filter(x => x[1] != null);
  const months = [...new Set(rows.map(r => r.created_at.slice(0, 7)).concat([month]))].sort().reverse();
  const card = (t, body, sub = '') => `<section class="card"><div class="card-head"><h3>${t}</h3>${sub ? `<span class="tiny muted">${sub}</span>` : ''}</div>${body}</section>`;
  view().innerHTML = `
  <div class="page-head"><div><h1>דוחות</h1><div class="sub">איך העסק עובד בחודש שנבחר.</div></div>
    <label class="field" style="min-width:200px">חודש<select id="dm">${months.map(m => `<option value="${m}" ${m === sel ? 'selected' : ''}>${mName(m)}</option>`).join('')}</select></label></div>
  <div class="grid cols-4">
    ${kpi('פניות חדשות', A.leads.length, delta(A.leads.length, B.leads.length))}
    ${kpi('אחוז שסגרו', conv(A) + '%', B.leads.length ? delta(conv(A), conv(B), true) : '')}
    ${kpi('הכנסות', money(A.revenue), delta(A.revenue, B.revenue))}
    ${kpi('הזמנה ממוצעת', A.paid.length ? money(Math.round(A.revenue / A.paid.length)) : '—', `${A.paid.length} הזמנות שולמו`)}
  </div>
  <div class="section-title">מכירה</div>
  <div class="grid cols-2">
    ${card('מאיפה הגיעו הפניות', bars(countBy(A.leads, 'source')), 'החודש')}
    ${card('איזה ערוץ סוגר הכי טוב', bars(countBy(rows, 'source').map(([k]) => [k, srcConv(k)]), v => v + '%'), 'מכל הזמנים')}
    ${card('למה לקוחות לא קנו', bars(countBy(A.lost, 'loss_category')), 'החודש')}
    ${card('איפה הלקוחות במכירה עכשיו', bars(STEPS.filter(s => s.phase === 'sales').map(s => [s.key, rows.filter(r => r.stage === s.key).length])))}
  </div>
  <div class="section-title">תפעול</div>
  <div class="grid cols-3">
    ${card('הזמנות בעבודה לפי שלב', bars(STEPS.filter(s => s.phase === 'ops').map(s => [s.key, rows.filter(r => r.stage === s.key).length])))}
    ${card('הזמנות פתוחות לפי מעבדה', bars(countBy(rows.filter(r => phaseOf(r.stage) === 'ops'), 'lab_name')))}
    ${card('כמה ימים עד סיום', `<p class="kpi"><span class="v">${avgDays(done) != null ? avgDays(done) : '—'}</span><span class="l">ימים בממוצע מתשלום עד סיום</span></p><div class="divider"></div>${bars(labDays, v => v + ' ימים')}`)}
  </div>
  <div class="section-title">כסף</div>
  <div class="grid cols-3">
    ${card('הכנסה לפי סוג', bars(Object.entries(revByType).sort((a, b) => b[1] - a[1]), money), 'החודש')}
    ${card('רווח החודש', `<div class="totals"><span>הכנסות</span><span>${money(A.revenue)}</span><span>הוצאות</span><span>-${money(A.expTotal)}</span><span class="muted">מתוכן פרסום</span><span class="muted">${money(A.ads)}</span><span class="grand">נשאר</span><span class="grand">${money(A.revenue - A.expTotal)}</span></div>`)}
    ${card('עלות פרסום', `<div class="totals"><span>עלות לפנייה</span><span>${A.ads && A.leads.length ? money(Math.round(A.ads / A.leads.length)) : '—'}</span><span>עלות ללקוח משלם</span><span>${A.ads && A.paid.length ? money(Math.round(A.ads / A.paid.length)) : '—'}</span></div>
      <p class="tiny muted" style="margin-top:10px">מחושב מהוצאות בקטגוריה "פרסום" במסך <a href="#expenses">הוצאות</a>.</p>`)}
  </div>`;
  $('#dm').onchange = e => { sessionStorage.setItem('dashMonth', e.target.value); VIEWS.reports(); };
};

// ---------- EXPENSES ----------
VIEWS.expenses = async function vExpenses() {
  const { data: exp, error } = await sb.from('expenses').select('*').order('spent_on', { ascending: false }).limit(500); fail(error);
  const month = today().slice(0, 7), inM = exp.filter(e => e.spent_on.slice(0, 7) === month), sumM = inM.reduce((s, e) => s + Number(e.amount), 0);
  const ads = inM.filter(e => e.category === 'פרסום').reduce((s, e) => s + Number(e.amount), 0);
  view().innerHTML = `
  <div class="page-head"><div><h1>הוצאות</h1><div class="sub">רושמים כאן כל הוצאה. הוצאות פרסום נכנסות לחישוב "עלות לפנייה" בדוחות.</div></div>
    <div class="row"><div class="card kpi" style="min-width:160px"><span class="l">החודש</span><span class="v">${money(sumM)}</span></div><div class="card kpi" style="min-width:160px"><span class="l">מתוכן פרסום</span><span class="v">${money(ads)}</span></div></div></div>
  <form id="expForm" class="card" style="margin-bottom:16px"><h3 style="margin-bottom:10px">הוצאה חדשה</h3><div class="fields" style="grid-template-columns:150px 180px 180px 130px minmax(160px,1fr) auto;align-items:end">
    <label class="field">תאריך<input type="date" name="spent_on" value="${today()}" required></label>
    <label class="field">על מה<select name="category" required>${opts('expense_category', 'פרסום', { empty: false })}</select></label>
    <label class="field">ערוץ (לפרסום)<select name="channel">${opts('source', '', { emptyLabel: '—' })}</select></label>
    <label class="field">סכום (₪)<input type="number" name="amount" step="0.01" required></label>
    <label class="field">הערה<input name="notes" placeholder="למשל: קמפיין נובמבר"></label>
    <button class="btn primary">הוספה</button></div></form>
  <div class="card flush table-wrap"><table><thead><tr><th>תאריך</th><th>על מה</th><th>ערוץ</th><th class="num">סכום</th><th>הערה</th><th></th></tr></thead>
  <tbody>${exp.map(e => { const s = c => `data-save="expenses:${e.id}:${c}"`; return `<tr>
    <td><label class="field"><input type="date" ${s('spent_on')} value="${esc(e.spent_on)}" required></label></td>
    <td><label class="field"><select ${s('category')}>${opts('expense_category', e.category, { empty: false })}</select></label></td>
    <td><label class="field"><select ${s('channel')}>${opts('source', e.channel, { emptyLabel: '—' })}</select></label></td>
    <td class="num"><label class="field"><input type="number" step="0.01" ${s('amount')} data-num value="${esc(e.amount)}" style="width:110px;text-align:center"></label></td>
    <td><label class="field"><input ${s('notes')} value="${esc(e.notes || '')}"></label></td>
    <td><button class="btn sm ghost danger" data-del="${e.id}">מחיקה</button></td></tr>`; }).join('') || '<tr class="empty-row"><td colspan="6">עוד לא נרשמו הוצאות</td></tr>'}</tbody></table></div>
    ${exp.length ? '<p class="tiny muted" style="margin-top:8px">כל שדה בטבלה אפשר לתקן במקום. נשמר לבד.</p>' : ''}`;
  bindAutosave(view(), (t, col) => { if (['amount', 'category', 'spent_on'].includes(col)) VIEWS.expenses(); });
  $('#expForm').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); if (!f.channel) delete f.channel;
    let id = null;
    await reversible('ההוצאה נוספה', async () => { const { data, error } = await sb.from('expenses').insert(f).select('id').single(); fail(error); id = data.id; },
      async () => { const { error } = await sb.from('expenses').delete().eq('id', id); fail(error); }, VIEWS.expenses);
    VIEWS.expenses(); };
  $$('[data-del]').forEach(b => b.onclick = async () => {
    const { id: oldId, ...back } = exp.find(x => String(x.id) === b.dataset.del); let id = oldId;
    await reversible('ההוצאה נמחקה', async () => { const { error } = await sb.from('expenses').delete().eq('id', id); fail(error); },
      async () => { const { data, error } = await sb.from('expenses').insert(back).select('id').single(); fail(error); id = data.id; }, VIEWS.expenses);
    VIEWS.expenses();
  });
};

// ---------- SETTINGS ----------
const SET_GROUPS = [['prices', 'מחירים', 'מחירון, הנחות, קופונים'], ['process', 'תהליך ותזכורות', 'מתי מזכירים, יעדי זמן'], ['lists', 'רשימות לבחירה', 'מקורות, סיבות, שליחויות'],
  ['templates', 'הודעות וואטסאפ', 'נוסחים מוכנים'], ['labs', 'מעבדות', 'לאן שולחים חומרה'], ['staff', 'צוות והרשאות', 'מי נכנס ומה רואה'], ['backup', 'גיבוי', 'הורדת כל הנתונים']];
const LISTS_EDIT = { source: ['מאיפה לקוחות מגיעים', 'מופיע בכל פנייה ובדוחות לפי ערוץ.'], loss_category: ['סיבות שלקוח לא קנה', 'נבחר כשמסמנים לקוח כלא רלוונטי.'], temperature: ['כמה קרוב לסגירה', 'תחושת בטן: חם, פושר, קר.'],
  payment_method: ['אמצעי תשלום', ''], courier: ['חברות שליחויות', ''], return_method: ['איך החומרה חוזרת ללקוח', ''], expense_category: ['סוגי הוצאות', 'הסוג "פרסום" נכנס לחישוב עלות לפנייה.'] };
const LIST_COL = { source: ['orders', 'source'], temperature: ['orders', 'temperature'], loss_category: ['orders', 'loss_category'], payment_method: ['orders', 'payment_method'], return_method: ['orders', 'return_method'], courier: ['orders', 'courier'], expense_category: ['expenses', 'category'] };
const SENTENCES = {
  followup_days: ['אם הלקוח לא חזר אלינו, להזכיר לי לחזור אליו אחרי', 'ימים', 'נקבע מחדש בכל פעם שלוחצים "דיברתי".'],
  quote_stale_days: ['הצעת מחיר בלי תשובה עולה במשימות אחרי', 'ימים', ''],
  sla_target_days: ['היעד: הלקוח מקבל את הקבצים תוך', 'ימים מהתשלום', 'אחרי זה ההזמנה מסומנת בכתום.'],
  sla_max_days: ['אחרי', 'ימים מהתשלום ההזמנה מסומנת באדום', 'חייב להיות יותר מהיעד.'],
  drive_link_days: ['קישור ההורדה נשמר', 'ימים ואז נמחק', 'שבוע לפני המחיקה מופיעה משימה להזכיר ללקוח.'],
  min_order: ['מינימום הזמנה:', '₪', 'הזמנה קטנה יותר מחויבת בסכום הזה.'],
  vat_percent: ['מע"מ:', '%', 'המחירים במחירון כוללים מע"מ. משמש רק להצגת "לפני מע"מ".'],
};
const sentence = k => { const s = S.settings[k]; if (!s) return ''; const [a, b, h] = SENTENCES[k] || [s.label, '', ''];
  return `<div class="sentence"><label class="field" style="flex-direction:row;align-items:center;gap:8px;font-size:15px;color:var(--ink);font-weight:400">${esc(a)} <input type="number" data-save="settings:${k}:value" data-num value="${esc(s.value)}"> ${esc(b)}</label>${h ? `<span class="hint">${esc(h)}</span>` : ''}</div>`; };
const CAT = { media: 'חומרה להמרה', addon: 'תוספות', repair: 'תיקונים', package: 'חבילות' };

VIEWS.settings = async function vSettings(tab) {
  await loadRef();
  tab = SET_GROUPS.some(g => g[0] === tab) ? tab : (sessionStorage.getItem('setTab') || 'prices');
  sessionStorage.setItem('setTab', tab);
  let body = '';
  if (tab === 'prices') body = `
    ${Object.entries(CAT).map(([cat, name]) => { const ps = S.products.filter(p => p.category === cat); return `<section class="card flush" style="margin-bottom:16px"><div class="card-head" style="padding:14px 16px 0"><h3>${name}</h3></div><div class="table-wrap"><table>
      <thead><tr><th>שם (כפי שהלקוח רואה)</th><th class="num">מחיר כולל מע"מ</th><th class="num">ממוצע מתחרים</th>${cat === 'media' ? '<th>מקבל ברקוד ונספר להנחה</th>' : ''}${cat === 'package' ? '<th>מה כלול</th>' : ''}<th>פעיל</th></tr></thead><tbody>
      ${ps.map(p => `<tr><td><label class="field"><input data-save="products:${p.id}:name" value="${esc(p.name)}" style="min-width:240px"></label></td>
        <td class="num"><label class="field"><input type="number" step="0.01" data-save="products:${p.id}:unit_price" data-num value="${p.unit_price}" style="width:100px;text-align:center"></label></td>
        <td class="num muted">${p.market_avg ? money(p.market_avg) : ''}</td>
        ${cat === 'media' ? `<td><label class="toggle"><input type="checkbox" data-save="products:${p.id}:counts_for_tier" ${p.counts_for_tier ? 'checked' : ''}></label></td>` : ''}
        ${cat === 'package' ? `<td><label class="field"><input data-save="products:${p.id}:includes" value="${esc(p.includes || '')}" style="min-width:220px"></label></td>` : ''}
        <td><label class="toggle"><input type="checkbox" data-save="products:${p.id}:active" ${p.active ? 'checked' : ''}></label></td></tr>`).join('') || `<tr class="empty-row"><td colspan="6">אין</td></tr>`}</tbody></table></div>
      <div style="padding:0 16px 14px"><button class="btn sm" data-addprod="${cat}">+ הוספה ל${name}</button></div></section>`; }).join('')}
    <p class="tiny muted" style="margin:-6px 0 16px">שינוי מחיר משפיע מיד גם על הצעות פתוחות. מוצר שלא מוכרים יותר: מכבים "פעיל" (לא מוחקים, כדי שהזמנות ישנות יישארו תקינות).</p>
    <div class="grid cols-2">
      <section class="card"><h3 style="margin-bottom:6px">הנחת כמות</h3><p class="small muted" style="margin-bottom:8px">לפי סך הקלטות, הדיסקים והסלילים בהזמנה. חלה רק על החומרה, לא על תוספות.</p>
        ${S.tiers.map(t => `<div class="sentence">מ-<input type="number" data-save="discount_tiers:${t.id}:min_items" data-num value="${t.min_items}"> פריטים ומעלה ← <input type="number" data-save="discount_tiers:${t.id}:percent" data-num value="${t.percent}"> % הנחה <button class="btn sm ghost danger" data-deltier="${t.id}">הסרה</button></div>`).join('')}
        <button class="btn sm" id="addTier" style="margin-top:8px">+ מדרגה</button></section>
      <section class="card"><h3 style="margin-bottom:6px">כללי</h3>${sentence('min_order')}${sentence('vat_percent')}</section>
    </div>
    <section class="card flush" style="margin-top:16px"><div class="card-head" style="padding:14px 16px 0"><h3>קופונים</h3><span class="tiny muted">ממלאים אחוז או שקלים, לא את שניהם</span></div><div class="table-wrap"><table>
      <thead><tr><th>קוד</th><th class="num">% הנחה</th><th class="num">₪ הנחה</th><th>קמפיין</th><th>בתוקף עד</th><th>פעיל</th></tr></thead><tbody>
      ${S.coupons.map(x => `<tr><td><b>${esc(x.code)}</b></td><td><label class="field"><input type="number" data-save="coupons:${esc(x.code)}:percent" data-num data-zero value="${x.percent || 0}" style="width:80px"></label></td>
        <td><label class="field"><input type="number" data-save="coupons:${esc(x.code)}:amount" data-num data-zero value="${x.amount || 0}" style="width:80px"></label></td><td><label class="field"><input data-save="coupons:${esc(x.code)}:campaign" value="${esc(x.campaign || '')}"></label></td>
        <td><label class="field"><input type="date" data-save="coupons:${esc(x.code)}:valid_until" value="${x.valid_until || ''}"></label></td><td><label class="toggle"><input type="checkbox" data-save="coupons:${esc(x.code)}:active" ${x.active ? 'checked' : ''}></label></td></tr>`).join('') || '<tr class="empty-row"><td colspan="6">אין קופונים</td></tr>'}
      </tbody></table></div><div style="padding:0 16px 14px"><button class="btn sm" id="addCp">+ קופון</button></div></section>`;
  if (tab === 'process') body = `<section class="card"><h3 style="margin-bottom:6px">תזכורות ויעדים</h3>${['sla_target_days', 'sla_max_days', 'drive_link_days'].map(sentence).join('')}</section>
    <section class="card" style="margin-top:16px"><h3 style="margin-bottom:10px">תקנון בהצעת המחיר</h3><label class="field"><textarea data-save="settings:terms:text_value" rows="6">${esc(S.settings.terms?.text_value || '')}</textarea><span class="hint">מופיע בסוף כל הצעת מחיר. התשלום של הלקוח נחשב הסכמה לטקסט הזה.</span></label></section>
    <section class="card" style="margin-top:16px"><h3 style="margin-bottom:10px">כתובת האתר</h3><label class="field"><input dir="ltr" data-save="settings:public_url:text_value" value="${esc(S.settings.public_url?.text_value || '')}"><span class="hint">משמשת לקישור המעקב שהלקוח מקבל. לא משנים אלא אם האתר עובר כתובת.</span></label></section>
    <section class="card" style="margin-top:16px"><h3 style="margin-bottom:6px">שלבי העבודה</h3><p class="small muted">8 השלבים קבועים, כדי שכולם יעבדו באותו תהליך: ${STEPS.map(s => esc(s.key)).join(' ← ')}. בנוסף: ${LOST}.</p></section>`;
  if (tab === 'lists') body = `<div class="grid cols-2">${Object.entries(LISTS_EDIT).map(([list, [name, hint]]) => `<section class="card"><h3>${name}</h3>${hint ? `<p class="tiny muted">${hint}</p>` : ''}
    <div class="list-editor" style="margin-top:10px">${(S.opts[list] || []).map((o, i, arr) => `<div class="li ${o.active ? '' : 'off'}"><label class="field"><input type="text" data-save="options:${o.id}:value" data-old="${esc(o.value)}" data-list="${list}" value="${esc(o.value)}"></label>
      <button class="btn sm ghost icon-btn" data-mv="${list}:${i}:-1" ${i ? '' : 'disabled'} aria-label="למעלה">↑</button><button class="btn sm ghost icon-btn" data-mv="${list}:${i}:1" ${i < arr.length - 1 ? '' : 'disabled'} aria-label="למטה">↓</button>
      <label class="toggle" title="פעיל"><input type="checkbox" data-save="options:${o.id}:active" ${o.active ? 'checked' : ''}></label></div>`).join('')}</div>
    <button class="btn sm" data-addopt="${list}" style="margin-top:10px">+ הוספה</button></section>`).join('')}</div>
    <p class="tiny muted" style="margin-top:12px">ערך שלא משתמשים בו: מכבים אותו (הוא נשאר בהזמנות ישנות). שינוי שם ישאל אם לעדכן גם הזמנות קיימות.</p>`;
  if (tab === 'templates') { const cur = Number(sessionStorage.getItem('tplCur')) || S.templates[0]?.id, t = S.templates.find(x => x.id === cur) || S.templates[0];
    body = `<div class="tpl-layout"><section class="card tpl-list">${S.templates.map(x => `<button class="${x.id === t?.id ? 'on' : ''} ${x.active ? '' : 'off'}" data-tcur="${x.id}">${esc(x.name)}${x.active ? '' : ' (כבוי)'}</button>`).join('')}<div class="divider"></div><button class="btn sm block" id="addTpl">+ הודעה חדשה</button></section>
      ${t ? `<section class="card stack"><label class="field">שם ההודעה<input data-save="message_templates:${t.id}:name" value="${esc(t.name)}"></label>
        <label class="field">הטקסט<textarea id="tplBody" data-save="message_templates:${t.id}:body" rows="9">${esc(t.body)}</textarea></label>
        <div><div class="small muted" style="margin-bottom:6px">לוחצים כדי להוסיף פרט שמתמלא לבד:</div><div class="var-chips">${['שם', 'הזמנה', 'סכום', 'קישור', 'מעקב', 'תאריך איסוף', 'ימי קישור'].map(v => `<button type="button" data-var="${v}">{${v}}</button>`).join('')}</div></div>
        <div class="row spread"><label class="toggle"><input type="checkbox" data-save="message_templates:${t.id}:active" ${t.active ? 'checked' : ''}> פעילה (מופיעה בתפריט הוואטסאפ)</label>
        <button class="btn sm ghost danger" id="delTpl" data-tip="אם רק לא רוצים אותה כרגע, עדיף לכבות אותה">מחיקת ההודעה</button></div></section>
      <section class="card wa-col"><h3 style="margin-bottom:8px">כך הלקוח יראה</h3><div class="wa-preview"><div class="wa-bubble" id="tplPrev"></div></div><p class="tiny muted" style="margin-top:6px">דוגמה עם לקוח לדוגמה.</p></section>` : ''}</div>`; }
  if (tab === 'labs') body = `<section class="card flush"><div class="table-wrap"><table><thead><tr><th>שם</th><th>המעבדה שלנו</th><th>איש קשר</th><th>טלפון</th><th>כתובת</th><th>מה ממירה</th><th>פעילה</th></tr></thead><tbody>
    ${S.labs.map(l => `<tr><td><label class="field"><input data-save="labs:${l.id}:name" value="${esc(l.name || '')}"></label></td><td><label class="toggle"><input type="checkbox" data-save="labs:${l.id}:is_inhouse" ${l.is_inhouse ? 'checked' : ''}></label></td>
      ${['contact_name', 'phone', 'address', 'media_types'].map(f => `<td><label class="field"><input data-save="labs:${l.id}:${f}" value="${esc(l[f] || '')}"></label></td>`).join('')}
      <td><label class="toggle"><input type="checkbox" data-save="labs:${l.id}:active" ${l.active ? 'checked' : ''}></label></td></tr>`).join('')}</tbody></table></div>
    <div style="padding:0 16px 14px"><button class="btn sm" id="addLab">+ מעבדה</button></div></section>
    <p class="tiny muted" style="margin-top:8px">כדי שמעבדה תסרוק בעצמה: מוסיפים לה משתמש ב"צוות והרשאות" עם תפקיד "מעבדה".</p>`;
  if (tab === 'staff') { const { data: st } = await sb.from('staff').select('*').order('created_at');
    body = `<div class="grid cols-3" style="margin-bottom:16px"><div class="card"><b>מנהל</b><p class="small muted">רואה ועושה הכל, כולל מחיקה וניהול צוות.</p></div><div class="card"><b>צוות</b><p class="small muted">הכל חוץ מניהול צוות ומחיקת הזמנות.</p></div><div class="card"><b>מעבדה</b><p class="small muted">רק סריקה וההזמנות של המעבדה שלו, בלי טלפון וכתובת של לקוחות.</p></div></div>
    <section class="card flush"><div class="table-wrap"><table><thead><tr><th>מייל</th><th>שם</th><th>תפקיד</th><th>מעבדה (לתפקיד מעבדה)</th><th></th></tr></thead><tbody>
    ${st.map(s => `<tr><td>${esc(s.email)}</td><td><label class="field"><input data-save="staff:${esc(s.email)}:name" value="${esc(s.name || '')}" ${isAdmin() ? '' : 'disabled'}></label></td>
      <td><label class="field"><select data-save="staff:${esc(s.email)}:role" ${isAdmin() && s.email !== S.user.email ? '' : 'disabled'}>${[['admin', 'מנהל'], ['staff', 'צוות'], ['lab', 'מעבדה']].map(([k, v]) => `<option value="${k}" ${s.role === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label></td>
      <td><label class="field"><select data-save="staff:${esc(s.email)}:lab_id" data-num ${isAdmin() ? '' : 'disabled'}><option value=""></option>${S.labs.map(l => `<option value="${l.id}" ${s.lab_id === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label></td>
      <td>${s.email === S.user.email ? '<span class="muted small">זה אתה</span>' : isAdmin() ? `<button class="btn sm ghost danger" data-delstaff="${esc(s.email)}">הסרה</button>` : ''}</td></tr>`).join('')}</tbody></table></div></section>
    ${isAdmin() ? `<form id="staffForm" class="card" style="margin-top:16px"><h3 style="margin-bottom:10px">הוספת עובד</h3><div class="fields" style="align-items:end">
      <label class="field">מייל<input name="email" type="email" required></label><label class="field">שם<input name="name"></label>
      <label class="field">תפקיד<select name="role"><option value="staff">צוות</option><option value="lab">מעבדה</option><option value="admin">מנהל</option></select></label>
      <label class="field">מעבדה<select name="lab_id"><option value="">—</option>${S.labs.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select></label><button class="btn primary">הוספה</button></div>
      <p class="tiny muted" style="margin-top:8px">אחרי ההוספה העובד נכנס למסך הכניסה ולוחץ "פעם ראשונה כאן? הרשמה". אם מייל האישור לא מגיע: יוצרים לו משתמש ב-Supabase (Authentication → Add user, Auto Confirm).</p></form>` : ''}`; }
  if (tab === 'backup') body = `<section class="card" style="max-width:640px"><h3 style="margin-bottom:6px">גיבוי לקבצים</h3><p>מוריד 4 קבצים שנפתחים באקסל ובגוגל שיטס: הזמנות, לקוחות, ברקודים, הוצאות. מומלץ פעם בשבוע.</p>
    <button class="btn primary" id="exportBtn" style="margin-top:12px">הורדת גיבוי עכשיו</button><p class="small muted" id="exportMsg" style="margin-top:8px"></p></section>`;
  const g = SET_GROUPS.find(x => x[0] === tab);
  view().innerHTML = `<div class="page-head"><div><h1>הגדרות</h1><div class="sub">כל שינוי נשמר לבד ברגע שיוצאים מהשדה.</div></div></div>
    <div class="settings"><nav class="subnav">${SET_GROUPS.map(([k, n, d]) => `<button class="${k === tab ? 'on' : ''}" data-stab="${k}">${n}<span class="desc">${d}</span></button>`).join('')}</nav>
    <div><h2 style="margin-bottom:12px">${g[1]}</h2>${body}</div></div>`;
  bindSettings(tab);
};
function bindSettings(tab) {
  const re = () => VIEWS.settings(tab);
  $$('[data-stab]').forEach(b => b.onclick = () => go('settings/' + b.dataset.stab));
  bindAutosave(view(), async (table, col, v, el) => {
    if (table === 'options' && col === 'value' && el.dataset.old && el.dataset.old !== v && LIST_COL[el.dataset.list]) {
      const [t, c] = LIST_COL[el.dataset.list];
      if (await ask('לעדכן גם הזמנות קיימות?', `להחליף "${el.dataset.old}" ב-"${v}" בכל הרשומות הקיימות?`, { ok: 'כן, לעדכן הכל', cancel: 'רק ברשימה' })) {
        const { error } = await sb.from(t).update({ [c]: v }).eq(c, el.dataset.old); fail(error); toast('עודכן גם ברשומות הקיימות');
      }
      el.dataset.old = v;
    }
    if (table === 'options' && col === 'active') el.closest('.li')?.classList.toggle('off', !v);
    if (table === 'message_templates' && col !== 'body') { await loadRef(); return re(); }
    loadRef();
  });
  const add = async (table, row) => { const { error } = await sb.from(table).insert(row); fail(error); re(); };
  $$('[data-addprod]').forEach(b => b.onclick = async () => { const cat = b.dataset.addprod; const f = await formModal('הוספה ל' + CAT[cat], `<label class="field">שם<input name="name" required></label><label class="field">מחיר כולל מע"מ (₪)<input name="unit_price" type="number" step="0.01" value="0"></label>`); if (f) add('products', { name: f.name, category: cat, unit_price: Number(f.unit_price || 0), counts_for_tier: cat === 'media', sort: 99 }); });
  $('#addTier')?.addEventListener('click', () => add('discount_tiers', { min_items: Math.max(0, ...S.tiers.map(t => t.min_items)) + 10, percent: 0 }));
  $$('[data-deltier]').forEach(b => b.onclick = async () => {
    const t = S.tiers.find(x => String(x.id) === b.dataset.deltier); let id = t.id;
    await reversible('המדרגה הוסרה', async () => { const { error } = await sb.from('discount_tiers').delete().eq('id', id); fail(error); },
      async () => { const { data, error } = await sb.from('discount_tiers').insert({ min_items: t.min_items, percent: t.percent }).select('id').single(); fail(error); id = data.id; }, re);
    re();
  });
  $('#addCp')?.addEventListener('click', async () => { const f = await formModal('קופון חדש', `<label class="field">קוד<input name="code" required placeholder="SUMMER10"><span class="hint">הקוד לא ניתן לשינוי אחרי היצירה.</span></label><label class="field">% הנחה<input name="percent" type="number" value="10"></label><label class="field">קמפיין<input name="campaign"></label>`); if (f) add('coupons', { code: f.code.trim().toUpperCase(), percent: Number(f.percent || 0), campaign: f.campaign || null }); });
  $$('[data-mv]').forEach(b => b.onclick = async () => {
    const [list, i, d] = b.dataset.mv.split(':'); const arr = S.opts[list], a = arr[+i], c = arr[+i + +d]; if (!a || !c) return;
    const [sa, sc] = a.sort === c.sort ? [+i + +d, +i] : [c.sort, a.sort];
    const r = await Promise.all([sb.from('options').update({ sort: sa }).eq('id', a.id), sb.from('options').update({ sort: sc }).eq('id', c.id)]); r.forEach(x => fail(x.error)); re();
  });
  $$('[data-addopt]').forEach(b => b.onclick = async () => { const list = b.dataset.addopt; const f = await formModal('ערך חדש: ' + LISTS_EDIT[list][0], `<label class="field">ערך<input name="v" required></label>`); if (f) add('options', { list, value: f.v.trim(), sort: Math.max(0, ...(S.opts[list] || []).map(o => o.sort)) + 1 }); });
  // templates
  const prev = () => { const p = $('#tplPrev'), t = $('#tplBody'); if (p && t) p.textContent = fillTemplate(t.value, { id: 1042, total: 890, delivery_link: 'https://drive.google.com/…', pickup_date: addDays(2), track_token: 'xxxx', full_name: 'דנה כהן' }, { full_name: 'דנה כהן' }); };
  prev(); $('#tplBody')?.addEventListener('input', prev);
  $$('[data-tcur]').forEach(b => b.onclick = () => { sessionStorage.setItem('tplCur', b.dataset.tcur); re(); });
  $$('[data-var]').forEach(b => b.onclick = () => { const t = $('#tplBody'), s = t.selectionStart ?? t.value.length, ins = `{${b.dataset.var}}`; t.value = t.value.slice(0, s) + ins + t.value.slice(t.selectionEnd ?? s); t.focus(); t.selectionStart = t.selectionEnd = s + ins.length; prev(); t.dispatchEvent(new Event('change')); });
  $('#delTpl')?.addEventListener('click', async () => {
    const t = S.templates.find(x => x.id === (Number(sessionStorage.getItem('tplCur')) || S.templates[0]?.id)) || S.templates[0];
    if (!await ask(`למחוק את "${t.name}"?`, 'אפשר לבטל מיד אחרי.', { ok: 'מחיקה', danger: true })) return;
    const { id: _x, ...back } = t; let id = t.id;
    await reversible('ההודעה נמחקה', async () => { const { error } = await sb.from('message_templates').delete().eq('id', id); fail(error); sessionStorage.removeItem('tplCur'); },
      async () => { const { data, error } = await sb.from('message_templates').insert(back).select('id').single(); fail(error); id = data.id; sessionStorage.setItem('tplCur', id); }, re);
    re();
  });
  $('#addTpl')?.addEventListener('click', async () => { const f = await formModal('הודעה חדשה', `<label class="field">שם<input name="name" required placeholder="למשל: תזכורת לאיסוף"></label>`); if (!f) return; const { data, error } = await sb.from('message_templates').insert({ name: f.name, body: 'היי {שם}, ', sort: 99 }).select('id').single(); fail(error); sessionStorage.setItem('tplCur', data.id); re(); });
  // labs, staff
  $('#addLab')?.addEventListener('click', async () => { const f = await formModal('מעבדה חדשה', `<label class="field">שם<input name="name" required></label><label class="field">טלפון<input name="phone"></label><label class="field">מה ממירה<input name="media_types" placeholder="VHS, אודיו, פילם"></label>`); if (f) add('labs', { name: f.name, phone: f.phone || null, media_types: f.media_types || null }); });
  $('#staffForm')?.addEventListener('submit', e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); if (f.role === 'lab' && !f.lab_id) return tell('חסרה מעבדה', 'למשתמש מעבדה בוחרים לאיזו מעבדה הוא שייך.'); add('staff', { email: f.email.trim().toLowerCase(), name: f.name || null, role: f.role, lab_id: f.lab_id ? Number(f.lab_id) : null }); });
  $$('[data-delstaff]').forEach(b => b.onclick = async () => { if (!await ask('להסיר את ' + b.dataset.delstaff + '?', 'המשתמש לא יוכל להיכנס יותר.', { ok: 'הסרה', danger: true })) return; const { data: row } = await sb.from('staff').select('*').eq('email', b.dataset.delstaff).single();
    const { email, name, role, lab_id } = row;
    await reversible('המשתמש הוסר', async () => { const { error } = await sb.from('staff').delete().eq('email', email); fail(error); },
      async () => { const { error } = await sb.from('staff').insert({ email, name, role, lab_id }); fail(error); }, re);
    re(); });
  $('#exportBtn')?.addEventListener('click', exportAll);
}
async function exportAll() {
  const tables = [['הזמנות', 'v_orders'], ['לקוחות', 'customers'], ['ברקודים', 'items'], ['הוצאות', 'expenses']];
  $('#exportMsg').textContent = 'מכין…';
  for (const [name, t] of tables) {
    const { data, error } = await sb.from(t).select('*'); fail(error);
    if (!data.length) continue;
    const cols = Object.keys(data[0]);
    const cell = v => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = '﻿' + [cols.join(','), ...data.map(r => cols.map(c => cell(r[c])).join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `crm-${name}-${today()}.csv`; a.click();
    await sleep(400);
  }
  $('#exportMsg').textContent = '✓ הגיבוי ירד לתיקיית ההורדות.';
}
