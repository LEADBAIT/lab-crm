/* המשימות שלי: one prioritized list. Every row says why it is here and has one button that does the real next step. */
'use strict';
// urgency: 0 = late (red), 1 = today, 2 = soon
const TASK_TYPES = [
  { k: 'new', name: 'פניות חדשות', test: o => o.stage === 'פנייה חדשה' && !o.last_contact_at,
    why: o => `פנייה חדשה${o.source ? ' מ' + o.source : ''} · נכנסה ${ago(o.created_at)}${o.est_quantity ? ` · כתב "${o.est_quantity}"` : ''}`,
    urg: o => daysSince(o.created_at) >= 1 ? 0 : 1, act: { label: 'שליחת הודעת פתיחה', tpl: 'פתיחה ללידים' } },
  { k: 'followup', name: 'לחזור ללקוח', test: o => o.flag_followup && !(o.stage === 'פנייה חדשה' && !o.last_contact_at) && !o.flag_quote_stale,
    why: o => { const n = daysSince(o.next_followup + 'T00:00'); return `${n > 0 ? `היינו אמורים לחזור אליו ${n === 1 ? 'אתמול' : `לפני ${n} ימים`}` : 'קבענו לחזור אליו היום'} · ${o.stage}${o.last_contact_at ? ' · דיברנו ' + ago(o.last_contact_at) : ''}`; },
    urg: o => daysSince(o.next_followup + 'T00:00') > 0 ? 0 : 1, act: { label: '✓ חזרתי אליו', contact: true } },
  { k: 'stale', name: 'הצעות בלי תשובה', test: o => o.flag_quote_stale,
    why: o => `שלחנו הצעה של ${money(o.total)} ${ago(o.stage_changed_at)} ואין תשובה`, urg: () => 1, act: { label: 'שליחת תזכורת', tpl: 'פולואפ להצעה' } },
  { k: 'cash', name: 'מזומן אצל שליח', test: o => o.flag_cash_at_courier,
    why: o => `השליח גבה ${money(o.paid_amount || o.total)} במזומן. מסמנים כשהכסף מגיע אלינו`, urg: o => daysSince(o.paid_at) > 3 ? 0 : 1, act: { label: 'הכסף הגיע', cash: true } },
  { k: 'pickup', name: 'לתאם איסוף', test: o => o.stage === 'לתאם איסוף' && !o.pickup_date,
    why: o => `שילם ${ago(o.paid_at)}, צריך ${o.lab_id ? '' : 'לבחור מעבדה ו'}להזמין שליח`, urg: o => daysSince(o.paid_at) >= 2 ? 0 : 1, act: { label: 'תיאום איסוף', open: true } },
  { k: 'pickday', name: 'איסוף היום', test: o => o.stage === 'לתאם איסוף' && o.pickup_date && o.pickup_date <= today(),
    why: o => `השליח ${o.pickup_date < today() ? 'היה אמור להגיע ' + until(o.pickup_date) : 'מגיע היום'}${o.courier ? ' (' + o.courier + ')' : ''}. לסמן כשאסף`, urg: o => o.pickup_date < today() ? 0 : 1, act: { label: 'השליח אסף', advance: true } },
  { k: 'mismatch', name: 'פער בספירה', test: o => o.flag_count_mismatch,
    why: o => `הלקוח הצהיר על ${o.media_qty} פריטים, במעבדה נקלטו ${o.items_at_lab_or_later}`, urg: () => 0, act: { label: 'בדיקה', open: true } },
  { k: 'deliver', name: 'למסור ללקוח', test: o => (o.files_received_at || o.stage === 'למסירה ללקוח') && !o.delivery_sent_at,
    why: o => o.delivery_link ? 'הקבצים מוכנים והקישור מוכן. לשלוח ללקוח' : 'הקבצים מוכנים. צריך להדביק קישור הורדה ולשלוח', urg: () => 1, act: { label: 'שליחת הקבצים', open: true } },
  { k: 'late', name: 'באיחור', test: o => o.flag_late,
    why: o => `${o.days_since_paid} ימים מהתשלום (היעד: ${setting('sla_target_days') || 21}) · ${o.stage}${o.lab_name ? ' · ' + o.lab_name : ''}`, urg: o => o.flag_late === 'red' ? 0 : 1, act: { label: 'פתיחה', open: true } },
  { k: 'expiring', name: 'קישור עומד להימחק', test: o => o.delivery_link_expires && o.delivery_link_expires >= today() && o.delivery_link_expires <= addDays(7),
    why: o => `קישור ההורדה יימחק ${until(o.delivery_link_expires)}. כדאי להזכיר ללקוח להוריד`, urg: () => 2, act: { label: 'תזכורת להורדה', tpl: 'הקבצים מוכנים' } },
];
const doneKey = () => 'qdone.' + today();
const doneCount = () => Number(lsGet(doneKey()) || 0);
const bumpDone = () => lsSet(doneKey(), doneCount() + 1);

function buildTasks(rows) {
  const tasks = [];
  rows.forEach(o => { const t = TASK_TYPES.find(t => t.test(o)); if (t) tasks.push({ o, t, u: t.urg(o) }); });
  return tasks.sort((a, b) => a.u - b.u || (a.o.priority ? -1 : 0) - (b.o.priority ? -1 : 0) || a.o.id - b.o.id);
}

VIEWS.queue = async function vQueue() {
  const rows = await getOrders(q => q.not('stage', 'in', `("הושלם","${LOST}")`));
  const tasks = buildTasks(rows);
  setBadge(tasks.length);
  const filter = sessionStorage.getItem('qFilter') || '';
  const types = TASK_TYPES.map(t => [t, tasks.filter(x => x.t === t).length]).filter(([, n]) => n);
  const shown = tasks.filter(x => !filter || x.t.k === filter);
  const done = doneCount(), total = done + tasks.length;
  const hour = new Date().getHours(), hello = hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : 'ערב טוב';
  const sales = rows.filter(r => phaseOf(r.stage) === 'sales'), ops = rows.filter(r => phaseOf(r.stage) === 'ops');
  view().innerHTML = `
  <div class="page-head"><div><h1>${hello}${S.me?.name ? ', ' + esc(firstName(S.me.name)) : ''}</h1>
    <div class="sub">${tasks.length ? `יש ${plural(tasks.length, 'משימה אחת', 'משימות')} שמחכות לך. מתחילים מלמעלה: האדומות הכי דחופות.` : 'אין משימות פתוחות.'}</div></div></div>
  <div class="queue-layout">
    <div class="stack">
      ${types.length > 1 ? `<div class="pills"><button class="${filter ? '' : 'on'}" data-qf="">הכל <span class="n">${tasks.length}</span></button>${types.map(([t, n]) => `<button class="${filter === t.k ? 'on' : ''}" data-qf="${t.k}">${t.name} <span class="n">${n}</span></button>`).join('')}</div>` : ''}
      <div class="card flush">${shown.length ? shown.map(taskHtml).join('') : `<div class="empty"><div class="big">✓</div><h3>הכל טופל</h3><p>משימות חדשות מופיעות כאן לבד: פנייה חדשה, לקוח שצריך לחזור אליו, איסוף לתאם ועוד.</p></div>`}</div>
    </div>
    <aside class="stack">
      <section class="card"><h3 style="margin-bottom:8px">ההתקדמות שלך היום</h3><div class="progress"><div style="width:${total ? Math.round(done / total * 100) : 100}%"></div></div>
        <p class="small muted" style="margin-top:6px">${done} מתוך ${total} טופלו</p></section>
      <section class="card"><h3 style="margin-bottom:10px">תמונת מצב</h3><div class="stat-list">
        <div><span>פניות חדשות היום</span><b>${rows.filter(r => r.created_at.slice(0, 10) === today()).length}</b></div>
        <div><span>במכירה</span><a href="#deals/sales"><b>${sales.length}</b></a></div>
        <div><span>שווי הצעות פתוחות</span><b>${money(sales.reduce((s, r) => s + Number(r.total || 0), 0))}</b></div>
        <div><span>הזמנות בעבודה</span><a href="#deals/ops"><b>${ops.length}</b></a></div>
        <div><span>באיחור</span><b>${ops.filter(r => r.flag_late).length}</b></div></div></section>
      <section class="card small muted">טיפ: כל כפתור ירוק/צהוב עושה את הפעולה עצמה. "פתיחה" לוקחת לדף הלקוח, ושם כרטיס "הצעד הבא" אומר בדיוק מה לעשות.</section>
    </aside>
  </div>`;
  $$('[data-qf]').forEach(b => b.onclick = () => { sessionStorage.setItem('qFilter', b.dataset.qf); VIEWS.queue(); });
  $$('[data-tact]').forEach(b => b.onclick = () => runTask(tasks.find(x => String(x.o.id) === b.dataset.tact), b));
};
function taskHtml({ o, t, u }) {
  const a = t.act, tpl = a.tpl && tplByName(a.tpl);
  return `<div class="task"><span class="urg u${u}"></span>
    <div><div class="who"><a href="#order/${o.id}">${esc(custName(o))}</a><span class="chip">${esc(t.name)}</span>${o.priority ? '<span class="chip orange">דחוף</span>' : ''}<span class="tiny muted">#${o.id}</span></div>
      <div class="why">${esc(t.why(o))}</div></div>
    <div class="acts">${a.open ? `<a class="btn ${u === 0 ? 'primary' : ''}" href="#order/${o.id}">${esc(a.label)}</a>`
      : `<button class="btn ${u <= 1 ? 'primary' : ''}" data-tact="${o.id}" ${a.tpl && !tpl ? 'disabled title="התבנית לא קיימת בהגדרות"' : ''}>${esc(a.label)}</button>`}
      ${a.open ? '' : `<a class="btn ghost" href="#order/${o.id}">פתיחה</a>`}</div></div>`;
}
async function runTask(x, btn) {
  const { o, t } = x, a = t.act;
  btn.disabled = true;
  try {
    if (a.tpl) {
      const tpl = tplByName(a.tpl);
      window.open(waLink(o.phone, fillTemplate(tpl.body, o, null)), '_blank', 'noopener');
      await markContacted(o.id);
    } else if (a.contact) await markContacted(o.id);
    else if (a.cash) { const { error } = await sb.from('orders').update({ payment_status: 'שולם' }).eq('id', o.id); fail(error); }
    else if (a.advance) { const nx = STEPS[stepIdx(o.stage) + 1]; if (!await changeStage(o, nx.key)) { btn.disabled = false; return; } }
  } catch { btn.disabled = false; return; }
  bumpDone();
  btn.closest('.task').classList.add('done-anim');
  toast('בוצע. ' + (a.tpl ? 'נרשם שדיברנו, מועד החזרה הבא נקבע לבד' : ''));
  setTimeout(() => VIEWS.queue(), 450);
}
