/* Monthly lab bills: what we owe each lab for the orders it finished in a month (from the lab price list).
   Paying a bill records an expense (category "מעבדות"), so the money-out stays in one place. */
'use strict';
VIEWS.labbills = async function vLabBills() {
  const month = today().slice(0, 7);
  const sel = sessionStorage.getItem('billMonth') || month;
  const [{ data: rows, error: e1 }, { data: paid, error: e2 }] = await Promise.all([
    sb.from('v_orders').select('id, full_name, lab_id, lab_name, lab_month, lab_cost, lab_cost_missing, items_count, media_qty, items_no_charge, conversion_done_at, back_from_lab_at').not('lab_month', 'is', null),
    sb.from('expenses').select('*').not('lab_id', 'is', null)]); fail(e1); fail(e2);
  rows.splice(0, rows.length, ...rows.filter(r => realOrder(r.id)));
  const months = [...new Set(rows.map(r => r.lab_month.slice(0, 7)).concat([month]))].sort().reverse();
  const mName = m => new Date(m + '-01').toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  const inM = rows.filter(r => r.lab_month.slice(0, 7) === sel);
  const labs = S.labs.filter(l => inM.some(r => r.lab_id === l.id) || paid.some(p => p.lab_id === l.id && p.period_month?.slice(0, 7) === sel));
  const bill = l => { const os = inM.filter(r => r.lab_id === l.id), due = os.reduce((s, r) => s + Number(r.lab_cost || 0), 0);
    const pd = paid.filter(p => p.lab_id === l.id && p.period_month?.slice(0, 7) === sel).reduce((s, p) => s + Number(p.amount), 0);
    return { os, due, pd, left: Math.round((due - pd) * 100) / 100, missing: os.filter(r => r.lab_cost_missing).length }; };
  const totalLeft = labs.reduce((s, l) => s + Math.max(0, bill(l).left), 0);
  view().innerHTML = `<div class="page-head"><div><div class="sub">כמה חייבים לכל מעבדה על ההזמנות שהיא סיימה בחודש (לפי מחירון העלות). תשלום נרשם גם כהוצאה בקטגוריה "מעבדות".</div></div>
      <div class="row"><label class="field" style="min-width:200px">חודש<select id="bm">${months.map(m => `<option value="${m}" ${m === sel ? 'selected' : ''}>${mName(m)}</option>`).join('')}</select></label>
      <div class="card kpi" style="min-width:160px"><span class="l">נשאר לשלם</span><span class="v">${money(totalLeft)}</span></div></div></div>
    ${labs.map(l => { const b = bill(l); return `<section class="card flush" style="margin-bottom:16px">
      <div class="card-head" style="padding:14px 16px 0"><h3>${esc(l.name)}</h3><div class="row">
        <span class="chip">${plural(b.os.length, 'הזמנה אחת', 'הזמנות')}</span><span class="chip">לתשלום ${money(b.due)}</span>${b.pd ? `<span class="chip green">שולם ${money(b.pd)}</span>` : ''}
        ${b.left > 0 ? `<button class="btn sm primary" data-pay="${l.id}" data-amt="${b.left}">סימון ששולם ${money(b.left)}</button>` : b.due ? '<span class="chip green">סגור</span>' : ''}</div></div>
      ${b.missing ? `<div class="warn" style="margin:10px 16px 0">ל-${b.missing} הזמנות חסר מחיר עלות לחלק מהמוצרים, אז הסכום נמוך מהאמת. משלימים בהגדרות ← מעבדות.</div>` : ''}
      <div class="table-wrap"><table><thead><tr><th>הזמנה</th><th>לקוח</th><th class="num">פריטים</th><th class="num">לא לחיוב</th><th>הסתיים במעבדה</th><th class="num">עלות</th></tr></thead><tbody>
      ${b.os.map(r => `<tr><td><a href="#order/${r.id}"><b>#${r.id}</b></a></td><td>${esc(custName(r))}</td><td class="num">${r.items_count || r.media_qty}</td><td class="num">${r.items_no_charge || ''}</td>
        <td class="small">${fmtShort(r.conversion_done_at || r.back_from_lab_at)}</td><td class="num">${money(r.lab_cost || 0)}${r.lab_cost_missing ? ' <span class="chip orange">חסר מחיר</span>' : ''}</td></tr>`).join('') || '<tr class="empty-row"><td colspan="6">אין הזמנות החודש</td></tr>'}</tbody></table></div></section>`; }).join('')
      || '<div class="card empty"><h3>אין חשבונות לחודש הזה</h3><p>הזמנה נכנסת לחשבון של המעבדה בחודש שבו ההמרה הסתיימה (או שהחומרה חזרה).</p></div>'}
    <p class="tiny muted">מחירי העלות נקבעים בהגדרות ← מעבדות ← מחירון עלות. פריט ריק, תוכן לא משפחתי או פריט שלא ניתן להמרה מחושב לפי "פריט לא לחיוב" של המעבדה.</p>`;
  $('#bm').onchange = e => { sessionStorage.setItem('billMonth', e.target.value); VIEWS.labbills(); };
  $$('[data-pay]').forEach(b => b.onclick = async () => {
    const l = S.labs.find(x => x.id === Number(b.dataset.pay));
    const f = await formModal(`תשלום ל${l.name}`, `<label class="field">סכום ששולם (₪)<input name="amount" type="number" step="0.01" min="0.01" required value="${b.dataset.amt}"></label>
      <label class="field">תאריך התשלום<input name="spent_on" type="date" required value="${today()}"></label><label class="field">הערה / אסמכתא<input name="ref"></label>`, { ok: 'רישום התשלום' });
    if (!f) return;
    const row = { spent_on: f.spent_on, category: 'מעבדות', amount: Number(f.amount), lab_id: l.id, period_month: sel + '-01', notes: `חשבון ${l.name} ל${mName(sel)}${f.ref ? ' · ' + f.ref : ''}` };
    let id = null;
    await reversible('התשלום נרשם (גם בהוצאות)', async () => { const { data, error } = await sb.from('expenses').insert(row).select('id').single(); fail(error); id = data.id; },
      async () => { const { error } = await sb.from('expenses').delete().eq('id', id); fail(error); }, VIEWS.labbills);
    VIEWS.labbills();
  });
};
