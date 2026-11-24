/* The work process: 9 fixed steps + "לא רלוונטי". One source of truth for stage names, what to do at each step,
   which checks/dates belong to it, and what is required before moving on. */
'use strict';
const LOST = 'לא רלוונטי';
/** file check: every barcode that should have a file has one (file name = barcode). Defined before STEPS, which uses it. */
/** payment-link task: warns when the quote changed after the link was made (the next send makes a new link) */
const payLinkState = o => o.pay_link_sent_at && o.sumit_payment_url && Number(o.sumit_payment_amount) !== Number(o.total) ? 'הסכום השתנה, צריך לשלוח קישור חדש' : '';
const FILES_CHECK ={ label: 'בדיקת קבצים: לכל ברקוד יש קובץ', done: o => !!o.files_checked_at && !o.files_missing, at: o => o.files_checked_at, act: 'files', show: o => o.items_count > 0 };
const STEPS = [
  { key: 'פנייה חדשה', short: 'פנייה', phase: 'sales', date: o => o.created_at,
    title: 'ליצור קשר עם הלקוח', todo: 'להתקשר או לשלוח וואטסאפ, להבין מה יש לו (כמה קלטות/דיסקים, מאיזה סוג) ומה הוא צריך.',
    wa: true, btn: 'פניתי ללקוח', open: ['customer', 'sale'],
    checks: [{ label: 'יצרנו קשר', done: o => !!o.last_contact_at, at: o => o.last_contact_at, act: 'contact' }] },
  { key: 'בשיחה', short: 'שיחה', phase: 'sales',
    title: 'להשיג את הלקוח', todo: 'פנינו ועוד לא דיברנו. מנסים שוב במועד הפולו-אפ. הליד נסגר רק כשמסמנים אותו כלא רלוונטי.',
    wa: true, btn: 'דיברנו, ממשיכים לפולו-אפ', open: ['customer', 'sale'],
    checks: [{ label: 'יצרנו קשר', done: o => !!o.last_contact_at, at: o => o.last_contact_at, act: 'contact' }] },
  { key: 'בפולואפ', short: 'פולואפ', phase: 'sales',
    title: 'לקדם להצעת מחיר', todo: 'דיברנו, ומשהו צריך לקרות עד מועד הפולו-אפ (תמונות של החומרה, הלקוח חושב). ממלאים כמויות ושולחים הצעה.',
    wa: true, btn: 'שלחתי הצעת מחיר', open: ['quote', 'customer'],
    need: o => o.media_qty ? [] : ['כמויות בהצעת המחיר'],
    checks: [{ label: 'השאלון לפני הצעה נשלח ללקוח', done: o => !!o.q_sent_at, at: o => o.q_sent_at, act: 'qsent', state: qState },
      { label: 'מילאנו כמויות בהצעת המחיר', done: o => o.media_qty > 0, act: 'open:quote' },
      { label: 'קיבלנו תמונות של החומרה (לא חובה)', done: o => o.photos_count > 0 || !!o.drive_folder_url, at: o => o.photos_first_at, act: 'open:photos', state: o => o.photos_count ? o.photos_count + ' תמונות' : '' }] },
  { key: 'הצעה נשלחה', short: 'הצעה', phase: 'sales',
    title: 'לסגור ולקבל תשלום', todo: 'לעשות פולואפ עד שהלקוח משלם. לפני התשלום משלימים פרטים לחשבונית ולאיסוף.',
    wa: true, btn: 'הלקוח שילם', pay: true, open: ['customer', 'quote'],
    checks: [{ label: 'ההצעה נשלחה ללקוח', done: o => !!o.quote_sent_at, at: o => o.quote_sent_at, act: 'quotesent' },
      { label: 'פרטים לחשבונית ולאיסוף מלאים', done: (o, c) => !missingForPaid(o, c).length, act: 'open:customer' },
      { label: 'הלקוח שילם', done: o => o.payment_status === 'שולם', at: o => o.paid_at, state: o => o.payment_status || 'עוד לא שולם',
        note: 'תשלום בקישור מעביר לבד ל"לתאם איסוף". תשלום בביט, העברה או מזומן: לוחצים "הלקוח שילם" למטה.' }] },
  { key: 'לתאם איסוף', short: 'איסוף', phase: 'ops', date: o => o.paid_at,
    title: 'לתאם איסוף עם שליח', todo: 'לבחור מעבדה, להזמין שליח ולקבוע תאריך. אחר כך לשלוח ללקוח אישור איסוף ולהדפיס מדבקות ודף משלוח.',
    wa: true, btn: 'השליח אסף את החומרה', set: ['picked_up_at'], open: ['shipping', 'items'],
    fields: ['lab_id', 'courier', 'pickup_date', 'pickup_tracking'],
    need: o => [!o.lab_id && 'מעבדה', !o.pickup_date && 'תאריך איסוף'].filter(Boolean),
    checks: [{ label: 'התשלום התקבל', done: o => o.payment_status === 'שולם', at: o => o.paid_at, state: o => o.payment_method || o.payment_status || '' },
      { label: 'בחרנו מעבדה', done: o => !!o.lab_id },
      { label: 'נקבע תאריך איסוף', done: o => !!o.pickup_date, at: o => o.pickup_date },
      { label: 'נוצרו ברקודים לפריטים', done: o => o.items_count > 0, act: 'items' },
      { label: 'המזומן הגיע אלינו מהשליח', done: o => !!o.cash_received_at, at: o => o.cash_received_at, act: 'cash', show: o => /מזומן/.test((o.payment_method || '') + o.payment_status) }] },
  { key: 'בדרך למעבדה', short: 'משלוח', phase: 'ops', date: o => o.picked_up_at,
    title: 'החומרה בדרך למעבדה', todo: 'כשהמעבדה מקבלת את החבילה, היא סורקת את הפריטים (או שלוחצים כאן).',
    btn: 'הגיע למעבדה', set: ['lab_received_at'], open: ['items'],
    checks: [{ label: 'נאסף מהלקוח', done: o => !!o.picked_up_at, at: o => o.picked_up_at, act: 'ms:picked_up_at' }] },
  { key: 'במעבדה', short: 'מעבדה', phase: 'ops', date: o => o.lab_received_at,
    title: 'המעבדה ממירה', todo: 'כשההמרה מסתיימת: מדביקים את קישור הקבצים מהמעבדה ומחזירים את החומרה אלינו.',
    wa: true, btn: 'הקבצים והחומרה אצלנו', set: ['conversion_done_at', 'files_received_at', 'back_from_lab_at'], open: ['items'],
    fields: ['files_link_from_lab'],
    checks: [{ label: 'הגיע למעבדה', done: o => !!o.lab_received_at, at: o => o.lab_received_at, act: 'ms:lab_received_at' },
      { label: 'קליטה הסתיימה (כל הפריטים נספרו)', done: o => !!o.intake_done_at, at: o => o.intake_done_at, act: 'intake' },
      { label: 'ההמרה הסתיימה', done: o => !!o.conversion_done_at, at: o => o.conversion_done_at, act: 'ms:conversion_done_at' },
      { label: 'הקבצים התקבלו מהמעבדה', done: o => !!o.files_received_at, at: o => o.files_received_at, act: 'ms:files_received_at' },
      FILES_CHECK,
      { label: 'החומרה חזרה אלינו', done: o => !!o.back_from_lab_at, at: o => o.back_from_lab_at, act: 'ms:back_from_lab_at' }] },
  { key: 'למסירה ללקוח', short: 'מסירה', phase: 'ops', date: o => o.back_from_lab_at,
    title: 'למסור ללקוח', todo: deliveryTodo,
    wa: true, btn: 'הלקוח קיבל הכל, סיום', set: ['returned_at'], open: ['delivery'],
    fields: ['delivery_link', 'return_method', 'return_tracking'],
    need: o => [!o.delivery_sent_at && 'לסמן שהקבצים נמסרו ללקוח', !closingDone(o) && `ספירת סגירה (${o.items_packed}/${o.items_count} נסרקו "נארז להחזרה")`].filter(Boolean),
    checks: [FILES_CHECK, { label: 'הקבצים נמסרו ללקוח', done: o => !!o.delivery_sent_at, at: o => o.delivery_sent_at, act: 'ms:delivery_sent_at' },
      { label: 'ספירת סגירה: כל פריט נסרק "נארז להחזרה"', done: closingDone, act: 'closing', show: o => o.items_count > 0 && !o.returned_at && !o.hardware_waived_at },
      { label: 'החומרה הוחזרה ללקוח', done: o => !!o.returned_at, at: o => o.returned_at, act: 'ms:returned_at', show: o => !o.hardware_waived_at },
      { label: 'הלקוח ויתר על החומרה (לא חוזרת אליו)', done: o => !!o.hardware_waived_at, at: o => o.hardware_waived_at, act: 'waive', show: o => !o.returned_at || !!o.hardware_waived_at }] },
  { key: 'הושלם', short: 'הושלם', phase: 'done', date: o => o.completed_at || o.returned_at,
    title: 'ההזמנה הסתיימה', todo: 'נשאר רק לבקש ביקורת בגוגל וסטורי, ולשלוח מתנה אם רוצים.',
    wa: true, open: ['after'],
    checks: [{ label: 'ביקשנו ביקורת בגוגל', done: o => !!o.review_requested_at, at: o => o.review_requested_at, act: 'ms:review_requested_at' },
      { label: 'ביקשנו סטורי', done: o => !!o.story_requested_at, at: o => o.story_requested_at, act: 'ms:story_requested_at' }] },
];
/** delivery step instructions built from what the customer chose (user decision 2026-11-23: no assumed download link / return) */
function deliveryTodo(o, ctx) {
  const usb = (ctx?.lines || []).map(l => S.products.find(p => p.id === l.product_id)).find(p => p && /דיסק און קי/.test(p.name));
  const files = { 'דיסק און קי': `לשלוח ללקוח ${usb ? usb.name : 'דיסק און קי'} עם הקבצים.`, 'דיסק של הלקוח': 'להעתיק את הקבצים לדיסק שהלקוח שלח, ולהחזיר לו אותו.',
    'ענן אישי של הלקוח': `להעלות את הקבצים ל-${o.cloud_type || 'ענן'} של הלקוח.` }[o.delivery_method] || 'למסור ללקוח את הקבצים (הלקוח לא בחר איך לקבל).';
  const hw = { 'לא מוחזר (בהסכמה)': 'החומרה לא חוזרת ללקוח.', 'החזרה במשלוח': 'להחזיר את החומרה במשלוח.', 'איסוף עצמי': 'הלקוח אוסף את החומרה בעצמו.' }[o.return_method] || 'לבדוק עם הלקוח מה עושים עם החומרה.';
  return files + ' ' + hw + (o.delivery_link ? ' יש גם קישור הורדה: לשלוח אותו.' : '');
}
/** closing count: every barcode scanned "נארז להחזרה" (or closed otherwise) before the hardware leaves */
function closingDone(o) { return !o.items_count || !!o.returned_at || o.items_packed >= o.items_count; }
const stepIdx = k => STEPS.findIndex(s => s.key === k);
const stepOf = k => STEPS[stepIdx(k)] || null;
const STEP_DONE = () => stepOf('הושלם');
const PHASE_NAME = { sales: 'מכירה', ops: 'בעבודה', done: 'הסתיים', lost: 'לא רלוונטי' };
const phaseOf = k => k === LOST ? 'lost' : stepOf(k)?.phase || 'sales';
const stageColor = k => (S.opts.stage || []).find(o => o.value === k)?.color || '#9CA3AF';
/** sales = lead -> paid · ops = paid -> delivered (the lab work) · done · lost */
const PHASE_INFO = {
  sales: { name: 'שלב מכירה', from: 'ליד חדש', to: 'הלקוח שילם' },
  ops: { name: 'שלב עבודה במעבדה', from: 'הלקוח שילם', to: 'הלקוח קיבל הכל' } };
const phTag = k => { const p = phaseOf(k); return `<span class="ph-tag ph-${p}">${p === 'sales' ? 'מכירה' : p === 'ops' ? 'מעבדה' : PHASE_NAME[p]}</span>`; };
const stagePill = k => `<span class="stage-pill ph-${phaseOf(k)}"><span class="dot" style="background:${stageColor(k)}"></span>${esc(k)}</span>`;

/** One short line about where it stands inside its step, in plain words. */
function subStatus(o) {
  const d = n => n === 0 ? 'היום' : n === 1 ? 'אתמול' : `לפני ${n} ימים`;
  switch (o.stage) {
    case 'פנייה חדשה': return o.last_contact_at ? `ניסינו ליצור קשר ${d(daysSince(o.last_contact_at))}` : `עוד לא דיברנו · נכנסה ${ago(o.created_at)}`;
    case 'בשיחה': return `ניסיון ${o.followup_attempts || 1} · ${o.last_contact_at ? 'פנינו ' + d(daysSince(o.last_contact_at)) : 'עוד לא נרשמה פנייה'}`;
    case 'בפולואפ': return o.media_qty ? `${o.media_qty} פריטים · ${money(o.total)}, ההצעה עוד לא נשלחה` : 'עוד אין כמויות בהצעה';
    case 'הצעה נשלחה': return `${money(o.total)} · נשלחה ${d(daysSince(o.stage_changed_at))}`;
    case 'לתאם איסוף': return o.pickup_date ? `שליח מגיע ${until(o.pickup_date)} (${fmtShort(o.pickup_date)})` : !o.lab_id ? 'צריך לבחור מעבדה ולהזמין שליח' : 'צריך להזמין שליח';
    case 'בדרך למעבדה': return `נאסף ${o.picked_up_at ? d(daysSince(o.picked_up_at)) : ''}`;
    case 'במעבדה': return o.conversion_done_at ? 'ההמרה הסתיימה, מחכים לחומרה' : o.intake_done_at ? `בהמרה · ${o.items_converted}/${o.items_count} הומרו` : 'בקליטה';
    case 'למסירה ללקוח': return o.delivery_sent_at ? `הקבצים נמסרו${o.delivery_link ? ' · הקישור יימחק ' + fmtShort(o.delivery_link_expires) : ''}` : 'הקבצים עוד לא נמסרו';
    case 'הושלם': return o.completed_at ? `הסתיים ${fmtDate(o.completed_at)}` : 'הסתיים';
    case LOST: return o.loss_category ? `סיבה: ${o.loss_category}` : '';
  }
  return '';
}

// ---------- required details before payment ----------
const REQUIRED_BEFORE_PAID = [['full_name', 'שם מלא'], ['email', 'מייל'], ['id_number', 'ת.ז לחשבונית'], ['city', 'עיר'], ['street', 'רחוב'], ['house_number', 'מספר בית']]; // backup contact is optional (user decision 2026-11-22)
// a business invoice needs the business name + number instead of the ID number
const missingForPaid = (o, c) => REQUIRED_BEFORE_PAID.filter(([k]) => !(k === 'id_number' && c?.invoice_business && String(c.business_name || '').trim() && String(c.business_id || '').trim()) && !String(c?.[k] || '').trim()).map(x => x[1]).concat(o.media_qty ? [] : ['כמויות בהצעת המחיר']);
const showRequired = o => stepIdx(o.stage) >= stepIdx('הצעה נשלחה') || phaseOf(o.stage) !== 'sales';

// ---------- follow-ups (manual: a date is set only by us) ----------
/** stages where a lead must always have a next follow-up date */
const FU_STAGES = ['בשיחה', 'בפולואפ', 'הצעה נשלחה'];
const fuTime = t => t ? String(t).slice(0, 5) : '';
/** 'late' | 'today' | 'none' (in a follow-up stage without a date) | 'future' | '' */
function fuState(o) {
  if (!FU_STAGES.includes(o.stage)) return '';
  if (!o.next_followup) return 'none';
  const t = today();
  if (o.next_followup < t) return 'late';
  if (o.next_followup > t) return 'future';
  if (o.next_followup_time && fuTime(o.next_followup_time) < new Date().toTimeString().slice(0, 5)) return 'late';
  return 'today';
}
/** how the follow-up is planned: a phone call or a message (orders.followup_channel) */
const FU_CH = { call: ['📞', 'שיחה'], msg: ['💬', 'הודעה'] };
const fuCh = o => FU_CH[o.followup_channel] ? `<span class="fu-ch" aria-label="${FU_CH[o.followup_channel][1]}">${FU_CH[o.followup_channel][0]}</span>` : '';
/** "היום 17:30" / "מחר" / "לפני 3 ימים" */
function fuLabel(o) {
  if (!o.next_followup) return '';
  return until(o.next_followup) + (o.next_followup_time ? ' ' + fuTime(o.next_followup_time) : '');
}
/** Dialog for the next follow-up: call or message, date (quick buttons), optional hour, and why. Returns the patch or null. */
/** YYYY-MM-DD n days from today (Israel time) */
const dayPlus = n => new Date(Date.now() + n * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
async function followupModal(o, { stage = o.stage, title, date, note } = {}) {
  // in "בשיחה" rescheduling counts as one more attempt (counted only; leads never close by themselves, user decision 2026-11-23)
  const resched = stage === o.stage && o.stage === 'בשיחה' && o.next_followup;
  const next = resched ? (o.followup_attempts || 1) + 1 : 1;
  const warn = resched ? `<p class="small muted">ניסיון ${next}</p>` : '';
  const ch = o.followup_channel || 'call';
  const p = modal(`<h2>${esc(title || 'מתי חוזרים ל' + custName(o) + '?')}</h2>${warn}<form id="fuF" class="grid">
    <div class="field">איך חוזרים <span class="req">*</span><div class="seg big" role="radiogroup" aria-label="איך חוזרים">${Object.entries(FU_CH).map(([k, [ic, l]]) => `<button type="button" role="radio" data-ch="${k}" class="${k === ch ? 'on' : ''}" aria-checked="${k === ch}">${ic} ${l}</button>`).join('')}</div><input type="hidden" name="ch" value="${ch}"></div>
    <div class="row"><button type="button" class="btn sm" data-fqh="2">בעוד שעתיים</button>${[[1, 'מחר'], [3, 'בעוד 3 ימים'], [7, 'בעוד שבוע'], [daysTo(5), 'שישי הקרוב'], [daysTo(0), 'ראשון הקרוב']].map(([n, l]) => `<button type="button" class="btn sm" data-fq="${n}">${l}</button>`).join('')}</div>
    <div class="row nowrap"><label class="field grow">תאריך <span class="req">*</span><input type="date" name="d" required value="${esc(date || (o.next_followup && o.next_followup >= today() ? o.next_followup : ''))}" min="${today()}"></label>
      <label class="field">שעה (לא חובה)<input type="time" name="t" value="${esc(fuTime(o.next_followup_time))}"></label></div>
    <label class="field">למה חוזרים<input name="n" value="${esc(note ?? o.followup_note ?? '')}" placeholder="למשל: שולח תמונות של הקלטות"></label>
    <div class="actions"><button class="btn primary">שמירה</button><button type="button" class="btn" id="fuNo">ביטול</button></div></form>`);
  return new Promise(res => {
    $$('[data-ch]', p).forEach(b => b.onclick = () => { $$('[data-ch]', p).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
      $('[name=ch]', p).value = b.dataset.ch; });
    $$('[data-fq]', p).forEach(b => b.onclick = () => { $('[name=d]', p).value = addDays(Number(b.dataset.fq)); });
    // "in two hours": today, at now + 2h (user decision 2026-11-25)
    $$('[data-fqh]', p).forEach(b => b.onclick = () => { const t = toLocalInput(new Date(Date.now() + Number(b.dataset.fqh) * 36e5));
      $('[name=d]', p).value = t.slice(0, 10); $('[name=t]', p).value = t.slice(11, 16); });
    $('#fuF', p).onsubmit = e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); closeModal();
      res({ next_followup: f.d, next_followup_time: f.t || null, followup_channel: f.ch, followup_note: f.n.trim() || null }); };
    $('#fuNo', p).onclick = () => { closeModal(); res(null); };
    $('#modal').addEventListener('cancel', () => res(null), { once: true });
    setTimeout(() => $('[data-fq]', p)?.focus(), 30);
  });
}
/** Set the next follow-up with undo. The trigger may also close the lead, so undo restores stage/attempts too. */
async function setFollowup(o, opts) {
  const patch = await followupModal(o, opts); if (!patch) return false;
  await patchOrder(o, patch, 'נקבע פולו-אפ (' + FU_CH[patch.followup_channel][1] + '): ' + until(patch.next_followup) + (patch.next_followup_time ? ' ' + patch.next_followup_time : ''), { extra: ['stage', 'loss_category', 'followup_attempts'] });
  return true;
}

/** Move an order to another step. Asks only for what that move needs. Returns true if it moved. */
async function changeStage(o, to, c, { qOk = false } = {}) {
  if (to === o.stage) return false;
  const toQuote = to === 'הצעה נשלחה' && phaseOf(o.stage) === 'sales' && stepIdx(o.stage) < stepIdx(to);
  if (toQuote && !o.q_submitted_at && !qOk && !await ask('הלקוח עוד לא מילא את השאלון', 'בדרך כלל שולחים הצעה רק אחרי השאלון. להמשיך בכל זאת?', { ok: 'להמשיך בכל זאת' })) return false;
  const from = stepIdx(o.stage), dest = stepIdx(to);
  const patch = { stage: to };
  if (to === LOST) {
    const f = await formModal('למה הלקוח לא רלוונטי?', `<label class="field">הסיבה העיקרית <span class="req">*</span><select name="loss_category" required>${opts('loss_category', o.loss_category)}</select><span class="hint">נספר בדוחות, כדי לדעת למה לקוחות לא קונים.</span></label>
      <label class="field">מה הוא אמר (לא חובה)<textarea name="loss_note" rows="3">${esc(o.loss_note || '')}</textarea></label>`, { ok: 'סימון כלא רלוונטי' });
    if (!f) return false;
    Object.assign(patch, { loss_category: f.loss_category, loss_note: f.loss_note || null });
  } else if (dest > from && from >= 0) {
    // moving forward: check what the current step needs
    // what every step we pass through needs (skipping ahead on the stage bar or the board must not skip the checks).
    // Sales steps count only for the current one, so "the customer paid" can still jump from any sales step.
    const miss = [];
    for (let i = from; i < dest; i++) if (STEPS[i].need && (i === from || STEPS[i].phase !== 'sales')) miss.push(...STEPS[i].need(o));
    if (miss.length) { await tell('עוד לא אפשר לעבור לשלב הזה', 'חסר: ' + [...new Set(miss)].join(', ')); return false; }
    if (STEPS[dest].phase !== 'sales' && phaseOf(o.stage) === 'sales') {
      c ||= (await sb.from('customers').select('*').eq('id', o.customer_id).single()).data;
      const m = missingForPaid(o, c);
      if (m.length && !await ask('חסרים פרטים לחשבונית ולאיסוף', 'חסר: ' + m.join(', ') + '\n\nאפשר להשלים אחר כך, אבל השליח והחשבונית צריכים אותם.', { ok: 'להמשיך בכל זאת', cancel: 'להשלים קודם' })) return false;
      if (o.payment_status === 'לא שולם' || !o.payment_status) {
        const f = await formModal('רישום התשלום', `<label class="field">איך שילם<select name="payment_method">${opts('payment_method', o.payment_method)}</select></label>
          <label class="field">סכום ששולם (₪)<input name="paid_amount" type="number" step="0.01" min="0" value="${esc(o.total)}"></label>
          <label class="field">מצב התשלום<select name="payment_status">${opts('payment_status', 'שולם', { empty: false })}</select><span class="hint">"מזומן אצל שליח" = השליח גובה. ההזמנה תופיע במשימות עד שהכסף מגיע.</span></label>`, { ok: 'שמירה ומעבר לתיאום איסוף' });
        if (!f) return false;
        Object.assign(patch, { payment_status: f.payment_status, payment_method: f.payment_method || null, paid_amount: f.paid_amount ? Number(f.paid_amount) : null });
      }
    }
    if (dest >= stepIdx('בדרך למעבדה') && !o.lab_id) { await tell('צריך לבחור מעבדה', 'לפני שהחומרה יוצאת צריך לשייך את ההזמנה למעבדה (בכרטיס "הצעד הבא" או בחלק "משלוח ומעבדה").'); return false; }
    // stamp the dates of every step we pass through
    for (let i = from; i < dest; i++) (STEPS[i].set || []).forEach(k => { if (!o[k]) patch[k] = new Date().toISOString(); });
  } else if (from >= 0 && dest >= 0 && dest < from) {
    if (!await ask(`להחזיר ל"${to}"?`, 'התאריכים שכבר נרשמו נשארים. אפשר לתקן אותם בצ\'קליסט של כל שלב.', { ok: 'להחזיר' })) return false;
  }
  // every follow-up stage needs a next step: ask for it as part of the move
  if (FU_STAGES.includes(to)) {
    const fu = await followupModal(o, toQuote ? { stage: to, title: 'ההצעה נשלחה: מתי חוזרים ללקוח?', date: dayPlus(1), note: 'פולואפ על ההצעה' } : { stage: to, title: `עובר ל"${to}": מתי חוזרים ללקוח?` });
    if (!fu) return false;
    Object.assign(patch, fu);
  }
  if (to === LOST) Object.assign(patch, { next_followup: null, next_followup_time: null });
  if (toQuote && !o.quote_sent_at) patch.quote_sent_at = new Date().toISOString();
  // database triggers may also stamp these; undo puts them back too
  await patchOrder(o, patch, to === LOST ? 'סומן כלא רלוונטי' : 'עבר לשלב: ' + to, { extra: ['completed_at', 'paid_at', 'cash_received_at', 'followup_attempts'].filter(k => !(k in patch)) });
  return true;
}

// ---------- bulk actions (many at once, one undo) ----------
/** Set one item status on many items. items: [{id, status}]. Undo puts each back to its own previous status. */
async function bulkItemStatus(items, to) {
  const ch = items.filter(i => i.status !== to); if (!ch.length) { toast('כל הפריטים כבר בסטטוס הזה'); return false; }
  const byPrev = {}; ch.forEach(i => (byPrev[i.status] ||= []).push(i.id));
  await reversible(`${ch.length} פריטים עודכנו ל"${to}"`, upd('items', { status: to }, 'id', ch.map(i => i.id)),
    async () => { const r = await Promise.all(Object.entries(byPrev).map(([s, ids]) => sb.from('items').update({ status: s }).in('id', ids))); r.forEach(x => fail(x.error)); });
  return true;
}
/** Write a different patch per order. rows: [[id, patch]] */
const updMany = rows => async () => { const r = await Promise.all(rows.map(([id, p]) => sb.from('orders').update(p).eq('id', id))); r.forEach(x => fail(x.error)); };
/** Move many orders to one step. Moves only what can move safely (same phase, nothing required missing) and says what was skipped. */
async function bulkMove(rows, to) {
  let extra = {};
  if (to === LOST) {
    const f = await formModal(`${rows.length} לקוחות לא רלוונטיים: למה?`, `<label class="field">הסיבה העיקרית <span class="req">*</span><select name="loss_category" required>${opts('loss_category')}</select><span class="hint">אותה סיבה תירשם לכולם.</span></label>`, { ok: 'סימון כולם' });
    if (!f) return false; extra = { loss_category: f.loss_category };
  }
  const dest = stepIdx(to), ok = [], skip = [];
  rows.forEach(o => {
    if (o.stage === to) return;
    if (to === LOST || o.stage === LOST) return ok.push([o, {}]);
    const from = stepIdx(o.stage);
    const work = p => p === 'ops' || p === 'done'; // closing an order is the end of the work part
    if (from < 0 || (STEPS[from].phase !== STEPS[dest].phase && !(work(STEPS[from].phase) && work(STEPS[dest].phase)))) return skip.push([o, 'שלב בחלק אחר (מכירה / עבודה)']);
    if (dest >= stepIdx('בדרך למעבדה') && !o.lab_id) return skip.push([o, 'אין מעבדה']);
    const stamps = {};
    for (let i = from; i < dest; i++) {
      const miss = STEPS[i].need ? STEPS[i].need(o) : [];
      if (miss.length) return skip.push([o, 'חסר: ' + miss.join(', ')]);
      (STEPS[i].set || []).forEach(k => { if (!o[k]) stamps[k] = new Date().toISOString(); });
    }
    ok.push([o, stamps]);
  });
  if (!ok.length) { await tell('אף לקוח לא הועבר', skip.map(([o, w]) => `${custName(o)}: ${w}`).join('\n')); return false; }
  const prevs = ok.map(([o, st]) => { const p = { ...extra, ...st, stage: to }; return [o.id, Object.fromEntries([...Object.keys(p), 'completed_at'].map(k => [k, o[k] ?? null])), p]; });
  await reversible(`${ok.length} הועברו ל"${to}"${skip.length ? ` · ${skip.length} לא הועברו` : ''}`, updMany(prevs.map(([id, , p]) => [id, p])), updMany(prevs.map(([id, prev]) => [id, prev])));
  if (skip.length) await tell(`${skip.length} לא הועברו`, skip.map(([o, w]) => `${custName(o)}: ${w}`).join('\n') + '\n\nאת אלה מעבירים מדף הלקוח, שם רואים מה חסר.');
  return true;
}
/** Same values on many orders (e.g. one lab for all). */
async function bulkPatch(rows, patch, msg) {
  const prevs = rows.map(o => [o.id, Object.fromEntries(Object.keys(patch).map(k => [k, o[k] ?? null]))]);
  await reversible(msg, upd('orders', patch, 'id', rows.map(o => o.id)), updMany(prevs));
}

// ---------- messages ----------
function totalsHtml(o) {
  return `<div class="totals">
    <span>חומרה (${o.media_qty} פריטים)</span><span>${money(o.media_subtotal)}</span>
    ${o.tier_percent > 0 ? `<span>הנחת כמות ${Number(o.tier_percent)}%</span><span>-${money(o.tier_discount)}</span>` : ''}
    ${o.extras_subtotal > 0 ? `<span>תוספות${o.package_name ? ' + ' + esc(o.package_name) : ''}</span><span>${money(o.extras_subtotal)}</span>` : ''}
    ${o.coupon_percent > 0 || o.coupon_amount > 0 ? `<span>קופון ${esc(o.coupon_code)}</span><span>${o.coupon_percent > 0 ? '-' + Number(o.coupon_percent) + '%' : ''} ${o.coupon_amount > 0 ? '-' + money(o.coupon_amount) : ''}</span>` : ''}
    ${o.manual_discount > 0 ? `<span>הנחה ידנית</span><span>-${money(o.manual_discount)}</span>` : ''}
    ${o.media_units > 0 && Number(o.total) + Number(o.promo_discount || 0) > Number(o.total_raw) ? `<span class="muted">הושלם למינימום הזמנה (${money(setting('min_order'))})</span><span></span>` : ''}
    ${promoRows(o).map(l => `<span style="color:var(--green)">${esc(promoLabel(l))}</span><span style="color:var(--green)">${l.kind === 'gift' ? 'מתנה' : '-' + money(l.amount)}</span>`).join('')}
    <span class="grand">סה"כ כולל מע"מ</span><span class="grand">${money(o.total)}</span></div>`;
}
