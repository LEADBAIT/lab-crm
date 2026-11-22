/* Hardware photos per order: the photos the customer sent on WhatsApp, uploaded by staff (later also by the customer in the onboarding form).
   Files live in the private Supabase Storage bucket "order-photos" under <order_id>/, one row per photo in order_photos. */
'use strict';
const PHOTO_BUCKET = 'order-photos';
const PHOTO_KIND = { initial: 'תמונה ראשונה', update: 'אחרי שינוי כמויות' };
const PHOTO_MAX = 2000; // longest side after resize; keeps the free storage small and the form fast

async function loadPhotos(orderId) {
  const { data, error } = await sb.from('order_photos').select('*').eq('order_id', orderId).is('deleted_at', null).order('created_at');
  fail(error); return data;
}
/** Short-lived signed URLs for a batch of photos (the bucket is private). */
async function photoUrls(photos) {
  if (!photos.length) return {};
  const { data, error } = await sb.storage.from(PHOTO_BUCKET).createSignedUrls(photos.map(p => p.path), 3600);
  fail(error); return Object.fromEntries(data.filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]));
}
/** Resize big JPEG/PNG/WebP to PHOTO_MAX px JPEG. HEIC and anything the browser can't draw goes up as is. */
async function shrinkPhoto(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, PHOTO_MAX / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size < 1.5e6) return file;
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.85));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}
async function uploadPhotos(orderId, files, kind = 'initial') {
  files = [...files].filter(f => f.type.startsWith('image/'));
  if (!files.length) { toast('לא נבחרו תמונות'); return 0; }
  let n = 0;
  for (const f of files) {
    toast(`מעלה תמונה ${n + 1} מתוך ${files.length}…`, { ms: 60000 });
    const file = await shrinkPhoto(f);
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${orderId}/${crypto.randomUUID()}.${ext}`;
    const up = await sb.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg' });
    fail(up.error);
    const { error } = await sb.from('order_photos').insert({ order_id: orderId, path, kind, source: 'staff', file_name: f.name });
    fail(error); n++;
  }
  await sb.from('order_events').insert({ order_id: orderId, kind: 'field', new_value: `הועלו ${n} תמונות של החומרה` });
  toast(n === 1 ? 'התמונה נשמרה' : `${n} תמונות נשמרו`);
  return n;
}

function photosHtml(ctx) {
  const ph = ctx.photos || [];
  return `<div class="photo-drop" id="photoDrop" tabindex="0">
      <div class="photo-grid" id="photoGrid">${ph.map(p => `<figure class="photo" data-photo="${p.id}">
        <button type="button" class="photo-img" data-photoopen="${p.id}" aria-label="פתיחת התמונה"><img alt="${esc(p.file_name || 'תמונה')}" data-photopath="${esc(p.path)}"></button>
        <figcaption><span class="chip ${p.kind === 'update' ? 'orange' : ''}">${PHOTO_KIND[p.kind]}</span>${p.source === 'customer' ? '<span class="chip blue">הלקוח העלה</span>' : ''}
          <span class="tiny muted"><bdi dir="ltr">${fmtShort(p.created_at)}</bdi></span><button type="button" class="link-btn danger" data-photodel="${p.id}">הסרה</button></figcaption></figure>`).join('')}</div>
      ${ph.length ? '' : '<div class="empty" style="padding:16px 0"><div class="big">📷</div><h3>עוד אין תמונות</h3><p>שומרים כאן את התמונות שהלקוח שלח בוואטסאפ. הן יופיעו לו בשאלון.</p></div>'}
      <div class="row" style="justify-content:center;margin-top:10px">
        <label class="btn primary sm">העלאת תמונות<input type="file" accept="image/*" multiple hidden id="photoInput"></label>
        <select id="photoKind" style="width:auto"><option value="initial">${PHOTO_KIND.initial}</option><option value="update">${PHOTO_KIND.update}</option></select>
      </div>
      <p class="tiny muted" style="text-align:center;margin-top:6px">אפשר גם לגרור לכאן תמונות, או להעתיק תמונה מוואטסאפ ווב ולהדביק (Ctrl+V) כשהאזור הזה מסומן.</p>
    </div>`;
}
async function fillPhotoThumbs(ctx) {
  const urls = await photoUrls(ctx.photos || []); ctx.photoUrls = urls;
  $$('[data-photopath]').forEach(img => { const u = urls[img.dataset.photopath]; if (u) img.src = u; });
}
function bindPhotos(ctx) {
  const box = $('#photoDrop'); if (!box) return;
  fillPhotoThumbs(ctx);
  const done = async files => { if (await uploadPhotos(ctx.o.id, files, $('#photoKind').value)) { SEC_OPEN[ctx.o.id].add('photos'); if (['פנייה חדשה', 'בשיחה'].includes(ctx.o.stage)) toast('הליד עבר אוטומטית ל"בפולואפ"'); reloadDeal(ctx); } }; // order_photos_followup trigger
  $('#photoInput').onchange = e => done(e.target.files);
  box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('over'); });
  box.addEventListener('dragleave', () => box.classList.remove('over'));
  box.addEventListener('drop', e => { e.preventDefault(); box.classList.remove('over'); done(e.dataTransfer.files); });
  box.addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])]; if (f.length) { e.preventDefault(); done(f); } });
  $$('[data-photoopen]').forEach(b => b.onclick = () => {
    const p = ctx.photos.find(x => x.id === Number(b.dataset.photoopen)), u = ctx.photoUrls?.[p.path]; if (!u) return;
    modal(`<div class="photo-full"><img src="${esc(u)}" alt=""><div class="row spread" style="margin-top:8px"><span class="small muted">${esc(PHOTO_KIND[p.kind])} · ${fmtDT(p.created_at)}${p.uploaded_by ? ' · ' + esc(p.uploaded_by.split('@')[0]) : ''}</span>
      <div class="row"><a class="btn sm" href="${esc(u)}" target="_blank" rel="noopener">פתיחה בחלון חדש</a><button class="btn sm" onclick="this.closest('dialog').close()">סגירה</button></div></div></div>`, { wide: true });
  });
  // soft delete (the file stays in storage), with undo
  $$('[data-photodel]').forEach(b => b.onclick = () => { const id = Number(b.dataset.photodel);
    const set = v => async () => { const { error } = await sb.from('order_photos').update({ deleted_at: v }).eq('id', id); fail(error); };
    reversible('התמונה הוסרה', set(new Date().toISOString()), set(null), () => reloadDeal(ctx)).then(() => { SEC_OPEN[ctx.o.id].add('photos'); reloadDeal(ctx); }); });
}
