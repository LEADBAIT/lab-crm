/* Tasks: what needs doing per order (TASK_TYPES), shared by the Today screen and the operations board. The old "המשימות שלי" screen was removed 2026-11-25. */
'use strict';
// urgency: 0 = late (red), 1 = today, 2 = soon
const TASK_TYPES = [
  { k: 'new', name: 'פניות חדשות', test: o => o.stage === 'פנייה חדשה' && !o.last_contact_at,
    why: o => `פנייה חדשה${o.source ? ' מ' + o.source : ''} · נכנסה ${ago(o.created_at)}${o.est_quantity ? ` · כתב "${o.est_quantity}"` : ''}`,
    urg: o => daysSince(o.created_at) >= 1 ? 0 : 1, act: { label: 'פנייה בוואטסאפ', wa: true } },
  { k: 'cash', name: 'מזומן אצל שליח', test: o => o.flag_cash_at_courier,
    why: o => `השליח גבה ${money(o.paid_amount || o.total)} במזומן. מסמנים כשהכסף מגיע אלינו`, urg: o => daysSince(o.paid_at) > 3 ? 0 : 1, act: { label: 'הכסף הגיע', cash: true } },
  { k: 'pickup', name: 'לתאם איסוף', test: o => o.stage === 'לתאם איסוף' && !o.pickup_date,
    why: o => `שילם ${ago(o.paid_at)}, צריך ${o.lab_id ? '' : 'לבחור מעבדה ו'}להזמין שליח`, urg: o => daysSince(o.paid_at) >= 2 ? 0 : 1, act: { label: 'תיאום איסוף', open: true } },
  { k: 'pickday', name: 'איסוף היום', test: o => o.stage === 'לתאם איסוף' && o.pickup_date && o.pickup_date <= today(),
    why: o => `השליח ${o.pickup_date < today() ? 'היה אמור להגיע ' + until(o.pickup_date) : 'מגיע היום'}${o.courier ? ' (' + o.courier + ')' : ''}. לסמן כשאסף`, urg: o => o.pickup_date < today() ? 0 : 1, act: { label: 'השליח אסף', advance: true } },
  { k: 'mismatch', name: 'פער בספירה', test: o => o.flag_count_mismatch && o.phase === 'ops',
    why: o => `הלקוח הצהיר על ${o.media_qty} פריטים, במעבדה נקלטו ${o.items_at_lab_or_later}`, urg: () => 0, act: { label: 'בדיקה', open: true } },
  { k: 'deliver', name: 'למסור ללקוח', test: o => o.phase === 'ops' && (o.files_received_at || o.stage === 'למסירה ללקוח') && !o.delivery_sent_at,
    why: o => 'הקבצים מוכנים. למסור ללקוח ולסמן שנמסרו', urg: () => 1, act: { label: 'שליחת הקבצים', open: true } },
  { k: 'late', name: 'באיחור', test: o => o.flag_sla,
    why: o => `${o.sla_reason} · ${o.stage}${o.lab_name ? ' · ' + o.lab_name : ''}`, urg: o => o.flag_sla === 'red' ? 0 : 1, act: { label: 'פתיחה', open: true } },
  { k: 'expiring', name: 'קישור עומד להימחק', test: o => o.delivery_link && o.delivery_link_expires && o.delivery_link_expires >= today() && o.delivery_link_expires <= addDays(7),
    why: o => `קישור ההורדה יימחק ${until(o.delivery_link_expires)}. כדאי להזכיר ללקוח להוריד`, urg: () => 2, act: { label: 'תזכורת להורדה', wa: true } },
  // retention: hardware that was never collected, waived hardware, and the files after the link expires
  { k: 'destroy', name: 'להשמיד חומרה', test: o => !o.destroyed_at && ((o.destroy_notice_at && daysSince(o.destroy_notice_at) >= (setting('destroy_notice_days') ?? 14))
      || (o.hardware_waived_at && daysSince(o.hardware_waived_at) >= (setting('waived_keep_days') ?? 30))),
    why: o => o.hardware_waived_at ? `הלקוח ויתר על החומרה לפני ${daysSince(o.hardware_waived_at)} ימים. משמידים ומסמנים` : `נשלחה הודעה אחרונה לפני ${daysSince(o.destroy_notice_at)} ימים והלקוח לא אסף. משמידים ומסמנים`,
    urg: () => 1, act: { label: 'החומרה הושמדה', destroy: true } },
  { k: 'uncollected', name: 'חומרה לא נאספה', test: o => !!hwWaitStep(o),
    why: o => { const d = daysSince(o.delivery_sent_at); return { remind: `החומרה מחכה ${d} ימים מאז שהקבצים נשלחו. להזכיר ללקוח לאסוף`, fee: `החומרה מחכה ${d} ימים. להודיע ללקוח על דמי אחסון`, notice: `החומרה מחכה ${d} ימים. הודעה אחרונה: אם לא תיאסף תוך ${setting('destroy_notice_days') ?? 14} יום היא תושמד` }[hwWaitStep(o)]; },
    urg: o => hwWaitStep(o) === 'notice' ? 0 : 1, act: { label: 'שלחתי ללקוח', hwStamp: true } },
  { k: 'linkdel', name: 'למחוק קבצים', test: o => o.delivery_link && o.delivery_link_expires && o.delivery_link_expires < today() && !o.files_deleted_at,
    why: o => `קישור ההורדה פג ${until(o.delivery_link_expires)}. מוחקים את התיקייה בדרייב ומסמנים`, urg: () => 2, act: { label: 'התיקייה נמחקה', stamp: 'files_deleted_at' } },
];
/** hardware back from the lab, files sent, still with us: which reminder is due ('remind' | 'fee' | 'notice' | '') */
function hwWaitStep(o) {
  if (!o.back_from_lab_at || !o.delivery_sent_at || o.returned_at || o.hardware_waived_at || o.destroyed_at || o.destroy_notice_at) return '';
  const d = daysSince(o.delivery_sent_at);
  if (d >= (setting('destroy_days') ?? 90)) return 'notice';
  if (d >= (setting('storage_fee_days') ?? 30) && !o.storage_fee_at) return 'fee';
  if (d >= (setting('uncollected_remind_days') ?? 7) && !o.uncollected_reminded_at) return 'remind';
  return '';
}
const HW_STAMP = { remind: 'uncollected_reminded_at', fee: 'storage_fee_at', notice: 'destroy_notice_at' };
function hwMessage(o, st) {
  const n = firstName(o.full_name), d = daysSince(o.delivery_sent_at);
  return { remind: `שלום ${n}, החומרה המקורית של הזמנה ${o.id} (הקלטות והדיסקים) מחכה לך אצלנו. מתי נוח לך שנתאם החזרה?`,
    fee: `שלום ${n}, החומרה של הזמנה ${o.id} נמצאת אצלנו כבר ${d} ימים. מעכשיו חלים דמי אחסון. נשמח לתאם החזרה בהקדם.`,
    notice: `שלום ${n}, תזכורת אחרונה: החומרה של הזמנה ${o.id} מחכה אצלנו ${d} ימים. אם לא נתאם החזרה תוך ${setting('destroy_notice_days') ?? 14} יום, החומרה תושמד.` }[st] || '';
}
const doneKey = () => 'qdone.' + today();
const doneCount = () => Number(lsGet(doneKey()) || 0);
const bumpDone = () => lsSet(doneKey(), doneCount() + 1);

function buildTasks(rows) {
  const tasks = [];
  rows.forEach(o => { const t = TASK_TYPES.find(t => t.test(o)); if (t) tasks.push({ o, t, u: t.urg(o) }); });
  return tasks.sort((a, b) => a.u - b.u || (a.o.priority ? -1 : 0) - (b.o.priority ? -1 : 0) || a.o.id - b.o.id);
}

/** the same action on many tasks of one type at once (ops board / Today screen). Returns false if nothing changed. */
async function runBulkTask(type, rows) {
  if (type === 'cash') await bulkPatch(rows, { payment_status: 'שולם', cash_received_at: new Date().toISOString() }, `נרשם שהמזומן הגיע ב-${rows.length} הזמנות`);
  else if (type === 'pickday') { if (!await bulkMove(rows, 'בדרך למעבדה')) return false; }
  else return false;
  rows.forEach(bumpDone); return true;
}
// task types where doing all of them at once makes sense (no message to write, same action for each)
const BULK_TASK = { cash: 'הכסף הגיע בכולן', pickday: 'השליח אסף את כולן' };
function taskHtml({ o, t, u }) {
  const a = t.act;
  return `<div class="task"><span class="urg u${u}"></span>
    <div><div class="who"><a href="#order/${o.id}">${esc(custName(o))}</a><span class="chip">${esc(t.name)}</span>${o.priority ? '<span class="chip orange">אקספרס</span>' : ''}<span class="tiny muted">#${o.id}</span></div>
      <div class="why">${esc(t.why(o))}</div></div>
    <div class="acts">${a.open ? `<a class="btn ${u === 0 ? 'primary' : ''}" href="#order/${o.id}">${esc(a.label)}</a>`
      : `<button class="btn ${u <= 1 ? 'primary' : ''}" data-tact="${o.id}">${esc(a.label)}</button>`}
      ${a.open ? '' : `<a class="btn ghost" href="#order/${o.id}">פתיחה</a>`}</div></div>`;
}
async function runTask(x, btn) {
  const { o, t } = x, a = t.act;
  btn.disabled = true;
  try {
    if (a.wa) {
      window.open(waLink(o.phone), '_blank', 'noopener');
      await markContacted(o, 'נפתחה שיחת וואטסאפ ונרשם שדיברנו');
    } else if (a.contact) await markContacted(o);
    else if (a.cash) await patchOrder(o, { payment_status: 'שולם' }, 'נרשם שהמזומן הגיע', { extra: ['cash_received_at'] });
    else if (a.advance) { const nx = STEPS[stepIdx(o.stage) + 1]; if (!await changeStage(o, nx.key)) { btn.disabled = false; return; } }
    else if (a.stamp) await patchOrder(o, { [a.stamp]: new Date().toISOString() }, 'נרשם: ' + t.name);
    else if (a.hwStamp) { const st = hwWaitStep(o); window.open(waLink(o.phone, hwMessage(o, st)), '_blank', 'noopener'); await patchOrder(o, { [HW_STAMP[st]]: new Date().toISOString() }, 'נרשם שההודעה נשלחה'); }
    else if (a.destroy) { if (!await destroyHardware(o)) { btn.disabled = false; return; } }
  } catch { btn.disabled = false; return; }
  bumpDone();
  btn.closest('.task').classList.add('done-anim');
  setTimeout(() => route(), 450);
}
