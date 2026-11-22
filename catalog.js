/* Price list catalog (spec: crm/אפיון-אפסיילים-חבילות-ומבצעים.md, stage 2).
   Full product editor: description, picture (public bucket product-images), cost, dates, where the customer sees it, checklist action.
   Package builder: package_items rows (which addons/services a package includes, and how many). Admin only. */
'use strict';
const PROD_BUCKET = 'product-images';
const SHOW_AT = [['show_q', 'שאלון'], ['show_quote', 'הצעת מחיר'], ['show_track', 'דף מעקב']];
const prodImg = p => p?.image_path ? sb.storage.from(PROD_BUCKET).getPublicUrl(p.image_path).data.publicUrl : '';
const pkgItems = id => (S.pkgItems || []).filter(x => x.package_id === id);
const prodById = id => S.products.find(p => p.id === id);
/** value of what the package includes, its cost to us, and the customer's saving */
function pkgMath(pkg, items = pkgItems(pkg.id)) {
  const value = items.reduce((s, x) => s + x.qty * Number(prodById(x.product_id)?.unit_price || 0), 0);
  const costs = items.map(x => { const c = prodById(x.product_id)?.cost; return c == null ? null : x.qty * Number(c); });
  const cost = costs.includes(null) ? null : costs.reduce((s, c) => s + c, 0) + Number(pkg.cost || 0);
  return { value, saving: Math.max(0, value - Number(pkg.unit_price || 0)), cost, zero: items.filter(x => !Number(prodById(x.product_id)?.unit_price)).map(x => prodById(x.product_id)?.name) };
}
/** profit per unit: price minus our cost (package: minus the cost of what it includes) */
function prodProfit(p) {
  if (p.category === 'package') { const m = pkgMath(p); return m.cost == null ? null : Number(p.unit_price) - m.cost; }
  return p.cost == null ? null : Number(p.unit_price) - Number(p.cost);
}
function prodBadges(p) {
  const b = SHOW_AT.filter(([k]) => p[k]).map(([, l]) => `<span class="chip blue">${l}</span>`);
  if (p.recommended) b.push('<span class="chip green">מומלץ</span>');
  if (p.valid_from || p.valid_until) b.push(`<span class="chip orange">${p.valid_from ? fmtShort(p.valid_from) : '…'} – ${p.valid_until ? fmtShort(p.valid_until) : '…'}</span>`);
  return b.join(' ');
}
function pkgSummary(p) {
  const it = pkgItems(p.id);
  if (!it.length) return `<span class="muted small">${esc(p.includes || 'בלי מוצרים')}</span>`;
  const m = pkgMath(p);
  return `<span class="small">${it.map(x => `${x.qty > 1 ? x.qty + '× ' : ''}${esc(prodById(x.product_id)?.name || '?')}`).join(' + ')}</span>
    <span class="tiny muted" style="display:block">שווי ${money(m.value)}${m.saving ? ` · חוסך ${money(m.saving)}` : ''}${m.zero.length ? ` · <span style="color:var(--orange)">בלי מחיר: ${esc(m.zero.join(', '))}</span>` : ''}</span>`;
}

async function uploadProdImage(file, productId) {
  if (!file?.type.startsWith('image/')) { toast('צריך לבחור תמונה'); return null; }
  toast('מעלה תמונה…', { ms: 60000 });
  const f = await shrinkPhoto(file);
  const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${productId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from(PROD_BUCKET).upload(path, f, { contentType: f.type || 'image/jpeg' });
  fail(error); toast('התמונה עלתה'); return path;
}

/** the editor modal. Resolves true when something was saved. */
function editProduct(id) {
  const p = prodById(id); if (!p) return;
  const cat = p.category, isPkg = cat === 'package', isMedia = cat === 'media', isExtra = cat === 'addon' || cat === 'repair';
  let img = p.image_path || null;
  const cur = Object.fromEntries(pkgItems(id).map(x => [x.product_id, x.qty]));
  const choices = S.products.filter(x => ['addon', 'repair'].includes(x.category) && (x.active || cur[x.id]));
  const chk = (k, l) => `<label class="toggle" style="gap:6px"><input type="checkbox" name="${k}" ${p[k] ? 'checked' : ''}> ${l}</label>`;
  const b = modal(`<h2>${esc(p.name)}</h2><p class="small muted" style="margin:-4px 0 12px">${esc(CAT[cat])} · מה שכתוב כאן הלקוח רואה בשאלון, בהצעת המחיר ובדף המעקב.</p>
    <form id="pe" class="grid" style="gap:14px">
      <div class="fields">
        <label class="field">שם<input name="name" required value="${esc(p.name)}"></label>
        <label class="field">מחיר כולל מע"מ (₪)<input name="unit_price" type="number" step="0.01" min="0" required value="${p.unit_price}"></label>
        ${isExtra ? `<label class="field">מחיר לפי<select name="pricing"><option value="unit" ${p.pricing !== 'order' ? 'selected' : ''}>יחידה (הלקוח בוחר כמות)</option><option value="order" ${p.pricing === 'order' ? 'selected' : ''}>הזמנה (פעם אחת)</option></select></label>` : ''}
        ${isMedia ? '' : `<label class="field">${isPkg ? 'עלות נוספת לחבילה (₪)' : 'כמה זה עולה לך (₪)'}<input name="cost" type="number" step="0.01" min="0" value="${p.cost ?? ''}" placeholder="—"><span class="hint">${isPkg ? 'מעבר לעלות המוצרים שבתוכה (אריזה, כרטיס). לחישוב הרווח.' : 'לחישוב הרווח. לא מוצג ללקוח.'}</span></label>`}
      </div>
      <label class="field">תיאור קצר<textarea name="description" rows="2" maxlength="240" placeholder="שורה או שתיים שמסבירות ללקוח למה זה שווה">${esc(p.description || '')}</textarea></label>
      <div class="field"><span>תמונה</span><div id="peImg" style="display:flex;gap:12px;align-items:center"></div></div>
      ${isPkg ? `<section class="card" style="padding:12px 14px"><h3 style="margin-bottom:4px">מה החבילה כוללת</h3><p class="tiny muted" style="margin-bottom:8px">כמות 0 = לא כלול. לקוח שמוסיף מוצר שכבר כלול משלם רק על מה שמעבר.</p>
        <div class="table-wrap"><table><thead><tr><th>מוצר</th><th class="num">מחיר</th><th class="num">כמות בחבילה</th></tr></thead><tbody>
        ${choices.map(x => `<tr><td>${esc(x.name)}${x.active ? '' : ' <span class="chip">כבוי</span>'}</td><td class="num muted">${money(x.unit_price)}</td>
          <td class="num"><input type="number" min="0" max="20" data-pi="${x.id}" value="${cur[x.id] || 0}" style="width:70px;text-align:center" aria-label="כמות ${esc(x.name)} בחבילה"></td></tr>`).join('')}</tbody></table></div>
        <div id="peMath" class="small" style="margin-top:8px"></div>
        <label class="field" style="margin-top:8px">עוד מה כלול (טקסט חופשי)<input name="includes" value="${esc(p.includes || '')}" placeholder="למשל: קבצים בקישור דרייב ל-60 יום"></label></section>
        <section class="card" style="padding:12px 14px"><h3 style="margin-bottom:4px">מתי להמליץ עליה בשאלון</h3><p class="tiny muted" style="margin-bottom:8px">אם הלקוח עומד בכל מה שמילאת, החבילה מסומנת "מומלץ" אצלו. ריק = לא בודקים.</p>
        <div class="fields"><label class="field">מינימום פריטי מדיה<input name="rec_min_media" type="number" min="0" value="${p.rec_min_media ?? ''}"></label>
          <label class="field">מקסימום פריטי מדיה<input name="rec_max_media" type="number" min="0" value="${p.rec_max_media ?? ''}"></label>
          <label class="field">שיטת מסירה שבחר<select name="rec_delivery"><option value="">כל שיטה</option>${(S.opts.delivery_method || []).map(o => `<option ${o.value === p.rec_delivery ? 'selected' : ''}>${esc(o.value)}</option>`).join('')}</select></label></div></section>` : ''}
      ${isExtra ? `<label class="field">פעולה בצ'קליסט של העסקה<input name="action_text" value="${esc(p.action_text || '')}" placeholder="למשל: לצרוב את הקבצים לדיסק און קי"><span class="hint">מופיע כפריט לסימון בדף העסקה כשהמוצר בהזמנה. ריק = אין פעולה.</span></label>` : ''}
      ${isMedia ? '' : `<div class="field"><span>איפה הלקוח רואה ${isPkg ? 'אותה' : 'אותו'}</span><div style="display:flex;gap:16px;flex-wrap:wrap">${SHOW_AT.map(([k, l]) => chk(k, l)).join('')}${chk('recommended', 'תגית "מומלץ"')}</div></div>`}
      <div class="fields"><label class="field">זמין מ-<input name="valid_from" type="date" value="${p.valid_from || ''}"></label><label class="field">עד<input name="valid_until" type="date" value="${p.valid_until || ''}"><span class="hint">ריק = תמיד. מחוץ לתאריכים הלקוח לא רואה ${isPkg ? 'אותה' : 'אותו'}.</span></label></div>
      <p id="peErr" class="small" style="color:var(--red)" hidden></p>
      <div class="actions"><button class="btn primary">שמירה</button><button type="button" class="btn" id="peNo">ביטול</button></div>
    </form>`, { wide: true });

  const drawImg = () => { const url = img ? sb.storage.from(PROD_BUCKET).getPublicUrl(img).data.publicUrl : '';
    $('#peImg', b).innerHTML = `${url ? `<img src="${esc(url)}" alt="" style="width:88px;height:88px;object-fit:cover;border-radius:8px;border:1px solid var(--line)">` : '<div class="muted small" style="width:88px;height:88px;border:1px dashed var(--line);border-radius:8px;display:grid;place-items:center">אין</div>'}
      <label class="btn sm">${url ? 'החלפה' : 'העלאה'}<input type="file" accept="image/*" hidden id="peFile"></label>${url ? '<button type="button" class="btn sm ghost danger" id="peDel">הסרה</button>' : ''}`;
    $('#peFile', b).onchange = async e => { const path = await uploadProdImage(e.target.files[0], id); if (path) { img = path; drawImg(); } };
    $('#peDel', b)?.addEventListener('click', () => { img = null; drawImg(); }); };
  drawImg();
  const readItems = () => $$('[data-pi]', b).map(el => ({ package_id: id, product_id: Number(el.dataset.pi), qty: Math.max(0, Math.round(Number(el.value) || 0)) })).filter(x => x.qty > 0);
  const drawMath = () => { if (!isPkg) return; const items = readItems(), price = Number($('[name=unit_price]', b).value || 0), m = pkgMath({ ...p, unit_price: price, cost: $('[name=cost]', b).value || null }, items);
    $('#peMath', b).innerHTML = items.length ? `שווי המוצרים <b>${money(m.value)}</b> · מחיר החבילה <b>${money(price)}</b> · ${m.saving ? `הלקוח חוסך <b style="color:var(--green)">${money(m.saving)}</b>` : `<span style="color:var(--orange)">אין חיסכון: החבילה לא זולה מהמוצרים בנפרד</span>`}${m.cost != null ? ` · רווח <b>${money(price - m.cost)}</b>` : ' · <span class="muted">רווח: חסרה עלות לחלק מהמוצרים</span>'}${m.zero.length ? `<br><span style="color:var(--orange)">במחיר 0 ₪: ${esc(m.zero.join(', '))}. החיסכון לא כולל אותם.</span>` : ''}` : '<span class="muted">עוד לא נבחרו מוצרים</span>'; };
  if (isPkg) { b.addEventListener('input', e => { if (e.target.matches('[data-pi], [name=unit_price], [name=cost]')) drawMath(); }); drawMath(); }

  return new Promise(res => {
    $('#peNo', b).onclick = () => { closeModal(); res(false); };
    $('#modal').addEventListener('cancel', () => res(false), { once: true });
    $('#pe', b).onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target), num = k => f.get(k) === '' || f.get(k) == null ? null : Number(f.get(k)), str = k => (f.get(k) ?? '').toString().trim() || null;
      const err = m => { $('#peErr', b).textContent = m; $('#peErr', b).hidden = false; };
      const row = { name: str('name'), unit_price: num('unit_price') ?? 0, description: str('description'), image_path: img, valid_from: str('valid_from'), valid_until: str('valid_until') };
      if (!row.name) return err('חסר שם');
      if (row.valid_from && row.valid_until && row.valid_from > row.valid_until) return err('תאריך "עד" לפני תאריך "מ-"');
      if (!isMedia) { row.cost = num('cost'); SHOW_AT.forEach(([k]) => row[k] = f.get(k) === 'on'); row.recommended = f.get('recommended') === 'on'; }
      if (isExtra) { row.pricing = f.get('pricing') === 'order' ? 'order' : 'unit'; row.action_text = str('action_text'); }
      if (isPkg) { row.includes = str('includes'); row.rec_min_media = num('rec_min_media'); row.rec_max_media = num('rec_max_media'); row.rec_delivery = str('rec_delivery');
        if (row.rec_min_media != null && row.rec_max_media != null && row.rec_min_media > row.rec_max_media) return err('המינימום גדול מהמקסימום'); }
      const btn = $('button.primary', b); btn.disabled = true; btn.textContent = 'שומר…';
      try {
        const { error } = await sb.from('products').update(row).eq('id', id); fail(error);
        if (isPkg) { const items = readItems(), keep = new Set(items.map(x => x.product_id)); // upsert first, then drop removed rows: a failure never empties the package
          if (items.length) { const i = await sb.from('package_items').upsert(items, { onConflict: 'package_id,product_id' }); fail(i.error); }
          const gone = pkgItems(id).filter(x => !keep.has(x.product_id)).map(x => x.product_id);
          if (gone.length) { const d = await sb.from('package_items').delete().eq('package_id', id).in('product_id', gone); fail(d.error); } }
        if (p.image_path && p.image_path !== img) sb.storage.from(PROD_BUCKET).remove([p.image_path]);
        closeModal(); toast('נשמר'); res(true);
      } catch { btn.disabled = false; btn.textContent = 'שמירה'; }
    };
  });
}
