/* היום: the home screen (user decisions 2026-11-25). Everything due today across the whole flow, in three columns
   (מכירה · תפעול · אחרי סיום), "דורש בדיקה" alerts on top, and a quiet strip of what customers did lately (no pop-ups). */
'use strict';

VIEWS.today = async function vToday() {
  const rows = await getOrders(q => q.neq('stage', LOST));
  const since = new Date(Date.now() - 3 * 864e5).toISOString();
  const delivering = rows.filter(o => o.stage === 'למסירה ללקוח').map(o => o.id);
  const [ra, rv, rl] = await Promise.all([
    sb.from('order_events').select('id, order_id, new_value, at').eq('kind', 'alert').is('handled_at', null).order('at', { ascending: false }).limit(50),
    sb.from('order_events').select('id, order_id, kind, new_value, by_email, at').gte('at', since).or('kind.eq.quote,by_email.ilike.%הלקוח%').order('at', { ascending: false }).limit(30),
    delivering.length ? sb.from('order_lines').select('order_id, product_id, qty').in('order_id', delivering) : Promise.resolve({ data: [] })]);
  [ra, rv, rl].forEach(r => fail(r.error));
  const byId = new Map(rows.map(o => [o.id, o]));
  const T = { rows, byId, alerts: (ra.data || []).filter(a => realOrder(a.order_id)), feed: (rv.data || []).filter(e => byId.has(e.order_id)), lines: rl.data || [] };
  renderToday(T);
  CUST_EVENT_FNS.clear(); // a customer acts while the screen is open: refresh quietly
  CUST_EVENT_FNS.add(() => { if (location.hash === '#today' || location.hash === '') { clearTimeout(VIEWS.today._t); VIEWS.today._t = setTimeout(() => route(), 1500); } });
};

// ---------- the three columns ----------
/** sales: follow-ups due, new leads, questionnaires waiting for a quote, quotes about to expire (with the promotion they lose) */
function salesItems(T) {
  const out = [], s = T.rows.filter(o => phaseOf(o.stage) === 'sales');
  const add = (o, why, tone, act, u) => out.push({ o, why, tone, act, u });
  for (const o of s) {
    if (quotePending(o)) add(o, 'מילא את השאלון: לבנות ולשלוח הצעה', 'orange', { label: 'לבניית ההצעה', href: '#quote-edit/' + o.id }, 0);
    else if (quoteAlmost(o)) add(o, `הגיע לתשלום ולא שילם · ${ago(o.quote_pay_clicked_at)}`, 'orange', { label: 'וואטסאפ', wa: true }, 0);
    else if (o.stage === 'פנייה חדשה' && !o.last_contact_at) add(o, `פנייה חדשה${o.source ? ' מ' + o.source : ''} · ${ago(o.created_at)}`, isNewUrgent(o) ? 'red' : 'blue', { label: 'פנייה בוואטסאפ', wa: true }, isNewUrgent(o) ? 0 : 1);
    else if (['late', 'today', 'none'].includes(fuState(o))) add(o, `${fuState(o) === 'late' ? 'פולו-אפ באיחור' : fuState(o) === 'none' ? 'אין צעד הבא' : 'פולו-אפ היום'}${o.followup_note ? ' · ' + o.followup_note : ''}`, fuState(o) === 'late' ? 'red' : 'orange', { label: 'פתיחה', open: true }, fuState(o) === 'late' ? 0 : 1);
    // a sent quote that expires within a day (it loses its discounts and promotion)
    const left = o.quote_valid_until && !o.quote_expired_at && o.payment_status !== 'שולם' ? (new Date(o.quote_valid_until) - Date.now()) / 864e5 : null;
    if (left != null && left <= 1.2) {
      const promo = (o.promo_lines || []).filter(l => Number(l.amount) > 0);
      add(o, `ההצעה פגה ${until(o.quote_valid_until.slice(0, 10))}${promo.length ? ` · תאבד ${promo.map(l => l.name).join(', ')} −${money(promo.reduce((a, l) => a + Number(l.amount), 0))}` : ''}`, 'red', { label: 'שליחה שוב', send: 'quote' }, 0);
    }
  }
  return out.sort((a, b) => a.u - b.u);
}
const OPS_TASKS = ['cash', 'pickup', 'pickday', 'mismatch', 'deliver', 'late'];
const AFTER_TASKS = ['destroy', 'uncollected', 'linkdel', 'expiring'];
function opsItems(T) {
  const tasks = buildTasks(T.rows).filter(x => OPS_TASKS.includes(x.t.k));
  // add-ons still to do when the order reaches delivery (burn a USB, ship the projector…)
  for (const o of T.rows.filter(o => o.stage === 'למסירה ללקוח')) {
    const acts = orderActions(o, T.lines.filter(l => l.order_id === o.id)), done = o.actions_done || {}, open = acts.filter(a => !done[a.p.id]);
    if (open.length) tasks.push({ o, t: { k: 'actions', name: 'תוספות לביצוע', why: () => open.map(a => a.p.action_text).join(' · '), act: { label: 'פתיחה', open: true } }, u: 1 });
  }
  return tasks.sort((a, b) => a.u - b.u);
}
function afterItems(T) {
  const tasks = buildTasks(T.rows).filter(x => AFTER_TASKS.includes(x.t.k));
  for (const o of T.rows.filter(o => o.stage === 'הושלם' && !o.review_requested_at))
    tasks.push({ o, t: { k: 'review', name: 'בקשת ביקורת', why: () => `הסתיים ${o.completed_at ? ago(o.completed_at) : ''}`, act: { label: 'בקשת ביקורת', send: 'review' } }, u: 2 });
  return tasks.sort((a, b) => a.u - b.u);
}

function todayRowHtml(x, i) {
  const { o } = x, a = x.act || x.t?.act || {}, why = x.why ?? x.t.why(o), tone = x.tone || (x.u === 0 ? 'red' : x.u === 1 ? 'orange' : '');
  const btn = a.href ? `<a class="btn sm" href="${a.href}">${esc(a.label)}</a>`
    : a.open ? `<a class="btn sm ghost" href="#order/${o.id}">${esc(a.label)}</a>`
    : `<button class="btn sm ${a.wa || a.send ? 'wa-o' : ''}" data-tdo="${i}">${esc(a.label)}</button>`;
  return `<li class="trow"><span class="urg ${tone}"></span><div class="grow"><a class="who" href="#order/${o.id}">${esc(custName(o))}</a>${x.t ? ` <span class="chip">${esc(x.t.name)}</span>` : ''}${o.priority ? ' <span class="chip orange">אקספרס</span>' : ''}
    <div class="why">${esc(why)}</div></div>${btn}</li>`;
}
function colHtml(title, items, empty, base) {
  return `<section class="card tcol"><div class="card-head"><h3>${title}</h3><span class="chip ${items.length ? 'orange' : 'green'}">${items.length}</span></div>
    ${items.length ? `<ul class="tlist">${items.map((x, i) => todayRowHtml(x, base + i)).join('')}</ul>` : `<p class="small muted" style="margin:0">${empty}</p>`}</section>`;
}
function renderToday(T) {
  const sales = salesItems(T), ops = opsItems(T), after = afterItems(T), all = [...sales, ...ops, ...after];
  const hour = new Date().getHours(), hello = hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : 'ערב טוב';
  view().innerHTML = `
  <div class="page-head"><div><h1>${hello}${S.me?.name ? ', ' + esc(firstName(S.me.name)) : ''}</h1>
    <div class="sub">${all.length ? `${plural(all.length, 'דבר אחד', 'דברים')} לטפל בהם היום. מתחילים מהאדומים.` : 'הכל טופל. ✓'}</div></div>
    <button class="btn primary" data-newlead>+ ליד</button></div>
  ${T.alerts.length ? `<section class="card alert-card"><h3>⚠ דורש בדיקה (${T.alerts.length})</h3>${T.alerts.map(a => `<div class="alert-row"><div class="grow"><a href="#order/${a.order_id}">${esc(custName(T.byId.get(a.order_id) || { phone: '#' + a.order_id }))}</a> · ${esc(a.new_value)}<div class="tiny muted">${esc(ago(a.at))}</div></div><button class="btn sm" data-alertok="${a.id}">טופל ✓</button></div>`).join('')}</section>` : ''}
  <div class="today">
    <div class="tcols">
      ${colHtml('מכירה', sales, 'אין פולו-אפים או לידים שמחכים.', 0)}
      ${colHtml('תפעול', ops, 'אין איסופים, מזומן או מסירות להיום.', sales.length)}
      ${colHtml('אחרי סיום', after, 'אין משימות שימור או ביקורות.', sales.length + ops.length)}
    </div>
    <aside class="card tfeed"><div class="card-head"><h3>פעילות לקוחות</h3><span class="tiny muted">3 ימים אחרונים</span></div>
      ${T.feed.length ? `<ul class="feed">${T.feed.map(e => `<li><a href="#order/${e.order_id}"><b>${esc(custName(T.byId.get(e.order_id)))}</b></a> ${esc((e.new_value || '').replace(/^הלקוח /, ''))}<div class="tiny muted">${esc(ago(e.at))}</div></li>`).join('')}</ul>` : '<p class="small muted" style="margin:0">עוד אין פעילות של לקוחות.</p>'}
    </aside>
  </div>`;
  $$('[data-alertok]').forEach(b => b.onclick = async () => { const { error } = await sb.rpc('handle_alert', { p_id: Number(b.dataset.alertok) }); fail(error); toast('סומן כטופל'); route(); });
  $$('[data-tdo]').forEach(b => b.onclick = async () => {
    const x = all[Number(b.dataset.tdo)], a = x.act || x.t.act;
    if (a.send) return linkSend(x.o, a.send, 'wa', { after: route });
    if (x.t && x.t.test) return runTask(x, b); // shared task actions (queue.js)
    if (a.wa) { window.open(waLink(x.o.phone), '_blank', 'noopener'); await markContacted(x.o, 'נפתחה שיחת וואטסאפ ונרשם שפנינו'); route(); }
  });
}
