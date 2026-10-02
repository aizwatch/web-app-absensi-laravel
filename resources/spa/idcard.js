// ID Card: design (depan/belakang) di-upload admin, foto + teks ditempel di canvas.
// Posisi disimpan sebagai pecahan (0..1) lebar/tinggi design → tetap pas walau design diganti.
import { state } from './state.js';
import { escHtml, showToast } from './utils.js';
import { authHeaders } from './auth.js';
import { makeZip } from './zip.js';

const MIN_W = 638, MIN_H = 1012; // CR80 54×85,6 mm @300 DPI

// Model pop-out: panel (sudah tergambar di design) jadi batas foto; cutout PNG boleh keluar
// di atas panel, bagian bawah terpotong mengikuti sudut panel.
const DEFAULT = {
  panel: { x: .27, y: .135, w: .645, h: .73, r: .06, keluar: .5 },
  foto:  { x: .59, y: .865, h: .78 },  // x = tengah, y = bawah, h = tinggi cutout (pecahan tinggi kartu)
  // max = lebar maksimum teks (pecahan lebar kartu; untuk vertikal pecahan tinggi) → huruf mengecil otomatis
  nama:  { x: .31, y: .78, size: .055, max: .58, color: '#ffffff', bold: true, align: 'left' },
  dept:  { x: .17, y: .50, size: .065, max: .70, color: '#111111', bold: true, align: 'center', vertical: true },
};

const $ = id => document.getElementById(id);
let _layout = null; // salinan kerja di editor admin

export function idcardLayout() {
  const s = state.idcard || {};
  const L = { depan: s.depan || null, belakang: s.belakang || null };
  // layout model lama (foto lingkaran) beda arti koordinat → abaikan, pakai default pop-out
  const saved = s.model === 'popout' ? s : {};
  for (const k of Object.keys(DEFAULT)) L[k] = { ...DEFAULT[k], ...(saved[k] || {}) };
  return L;
}

const _imgs = new Map();
function loadImg(url) {
  if (!_imgs.has(url)) _imgs.set(url, new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => { _imgs.delete(url); rej(new Error('Gagal memuat gambar')); };
    img.src = url;
  }));
  return _imgs.get(url);
}

// t.vertical = diputar -90° (dibaca dari bawah ke atas), selalu rata tengah
function drawText(ctx, text, t, W, H) {
  if (!text) return;
  const vertical = !!t.vertical;
  const align = vertical ? 'center' : t.align || 'center';
  const max = t.max * (vertical ? H : W);
  let px = t.size * H;
  const font = () => `${t.bold ? 700 : 500} ${px}px Montserrat, sans-serif`;
  ctx.font = font();
  while (ctx.measureText(text).width > max && px > 6) { px -= 1; ctx.font = font(); }
  ctx.save();
  ctx.translate(t.x * W, t.y * H);
  if (vertical) ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = t.color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function panelPath(ctx, p, W, H) {
  ctx.roundRect(p.x * W, p.y * H, p.w * W, p.h * H, p.r * W);
}

/** Gambar kartu depan ke canvas (ukuran = resolusi asli design). emp: {nama, departemen, foto, cutout} */
export async function renderFront(canvas, L, emp) {
  const design = L.depan ? await loadImg(L.depan).catch(() => null) : null;
  const W = canvas.width = design ? design.naturalWidth : MIN_W;
  const H = canvas.height = design ? design.naturalHeight : MIN_H;
  const ctx = canvas.getContext('2d');
  await Promise.all(['500', '700'].map(w => document.fonts.load(`${w} 20px Montserrat`).catch(() => {})));

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  if (design) ctx.drawImage(design, 0, 0);

  const p = L.panel, cut = emp.cutout ? await loadImg(emp.cutout).catch(() => null) : null;
  ctx.save();
  ctx.beginPath();
  panelPath(ctx, p, W, H);
  if (cut) {
    // area "keluar": selebar kartu, dari atas sampai sebagian tinggi panel
    ctx.rect(0, 0, W, (p.y + p.h * p.keluar) * H);
    ctx.clip();
    const h = L.foto.h * H, w = cut.naturalWidth * h / cut.naturalHeight;
    ctx.drawImage(cut, L.foto.x * W - w / 2, L.foto.y * H - h, w, h);
  } else {
    // belum ada cutout → foto biasa, cover di dalam panel
    ctx.clip();
    const foto = emp.foto ? await loadImg(emp.foto).catch(() => null) : null;
    if (foto) {
      const pw = p.w * W, ph = p.h * H, s = Math.max(pw / foto.naturalWidth, ph / foto.naturalHeight);
      const w = foto.naturalWidth * s, h = foto.naturalHeight * s;
      ctx.drawImage(foto, p.x * W + (pw - w) / 2, p.y * H + (ph - h) * .25, w, h);
    }
  }
  ctx.restore();

  drawText(ctx, emp.nama, L.nama, W, H);
  drawText(ctx, emp.departemen, L.dept, W, H);
}

// ── Editor admin ──
const TEXT = [['x', 'Posisi X', 0, 1], ['y', 'Posisi Y', 0, 1], ['size', 'Ukuran', .015, .15], ['max', 'Lebar maks', .1, 1], ['color', 'Warna'], ['bold', 'Tebal']];
const FIELDS = [
  ['panel', 'Panel (samakan dengan kotak di design)', [['x', 'Kiri', 0, 1], ['y', 'Atas', 0, 1], ['w', 'Lebar', .1, 1], ['h', 'Tinggi', .1, 1], ['r', 'Sudut', 0, .2], ['keluar', 'Batas keluar samping', 0, 1]]],
  ['foto', 'Foto cutout', [['x', 'Tengah X', 0, 1], ['y', 'Bawah Y', 0, 1.2], ['h', 'Tinggi', .2, 1.2]]],
  ['nama', 'Nama', [...TEXT, ['align', 'Rata']]],
  ['dept', 'Departemen', [...TEXT, ['vertical', 'Vertikal'], ['align', 'Rata (horizontal)']]],
];

const activeEmps = () => (state.pegawaiList || []).filter(p => p.status == 1);

export function initIdCardAdmin() {
  _layout = idcardLayout();
  $('idc-fields').innerHTML = FIELDS.map(([g, label, fs]) => `
    <div class="idc-group"><div class="idc-group-title">${label}</div>${fs.map(([k, lbl, min, max]) => {
      const v = _layout[g][k], id = `idc-${g}-${k}`;
      const inp = k === 'align'
        ? `<select id="${id}" onchange="idcardSet('${g}','${k}',this.value)">${['left', 'center', 'right'].map(a => `<option value="${a}" ${a === v ? 'selected' : ''}>${{ left: 'Kiri', center: 'Tengah', right: 'Kanan' }[a]}</option>`).join('')}</select>`
        : typeof v === 'boolean'
        ? `<input type="checkbox" id="${id}" ${v ? 'checked' : ''} onchange="idcardSet('${g}','${k}',this.checked)">`
        : typeof v === 'string'
          ? `<input type="color" id="${id}" value="${v}" oninput="idcardSet('${g}','${k}',this.value)">`
          : `<input type="range" id="${id}" min="${min}" max="${max}" step="0.001" value="${v}" oninput="idcardSet('${g}','${k}',+this.value)">`;
      return `<label class="idc-field"><span>${lbl}</span>${inp}</label>`;
    }).join('')}</div>`).join('');

  const emps = activeEmps();
  const sel = $('idc-emp'), prev = sel.value;
  sel.innerHTML = emps.map(p => `<option value="${escHtml(String(p.pin))}">${escHtml(p.nama)}${p.cutout ? '' : p.foto ? ' (tanpa cutout)' : ' (tanpa foto)'}</option>`).join('');
  if (prev) sel.value = prev; else { const best = emps.find(p => p.cutout) || emps.find(p => p.foto); if (best) sel.value = best.pin; }

  const noCut = emps.filter(p => !p.cutout);
  $('idc-warn').innerHTML = [
    noCut.length && `⚠ ${noCut.length} karyawan belum ada cutout (pakai foto biasa di dalam panel)`,
  ].filter(Boolean).join('<br>');

  _designInfo('depan'); _designInfo('belakang');
  renderCutoutList();
  renderIdCardPreview();
}

// ── Cutout per karyawan (admin hapus background di luar aplikasi, upload PNG transparan) ──
export function renderCutoutList() {
  const q = ($('idc-cut-q').value || '').toLowerCase();
  $('idc-cut-list').innerHTML = activeEmps().filter(p => !q || p.nama.toLowerCase().includes(q)).map(p => {
    const pin = escHtml(String(p.pin));
    return `<div class="idc-cut-row">
      <span class="idc-cut-name">${escHtml(p.nama)}</span>
      <span class="idc-cut-st ${p.cutout ? 'ok' : ''}">${p.cutout ? '✓ cutout' : '—'}</span>
      ${p.foto ? `<a class="btn btn-ghost btn-sm" href="${escHtml(p.foto)}" download="${pin}_${escHtml(slug(p.nama))}.jpg" title="Unduh foto asli untuk diedit">Foto ↓</a>` : '<span class="idc-cut-st">tanpa foto</span>'}
      <label class="btn btn-ghost btn-sm">Upload PNG<input type="file" accept="image/png" hidden onchange="uploadCutout('${pin}',this)"></label>
      ${p.cutout ? `<button class="btn btn-ghost btn-sm" onclick="deleteCutout('${pin}')">Hapus</button>` : ''}
    </div>`;
  }).join('') || '<p class="hint">Tidak ada karyawan</p>';
}

// buang margin transparan supaya posisi kepala/bawah konsisten antar karyawan
function _trimAlpha(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1, opaque = 0;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        const a = data[(y * c.width + x) * 4 + 3];
        if (a > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (a === 255) opaque++;
      }
      if (x1 < 0) return reject(new Error('Gambar kosong (transparan semua)'));
      if (opaque === c.width * c.height) return reject(new Error('PNG tidak transparan — hapus background dulu'));
      const o = document.createElement('canvas');
      o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
      o.getContext('2d').drawImage(c, -x0, -y0);
      o.toBlob(b => b ? resolve(b) : reject(new Error('Gagal memproses gambar')), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('File bukan PNG yang valid')); };
    img.src = url;
  });
}

async function _reloadPegawai() {
  const res = await fetch('/api/pegawai', { headers: authHeaders() });
  const json = await res.json();
  if (json.success) state.pegawaiList = json.data;
  initIdCardAdmin();
}

/** trim + upload PNG transparan sebagai cutout; throw bila tidak transparan / gagal */
export async function uploadCutoutFile(pin, file) {
  const fd = new FormData();
  fd.append('cutout', await _trimAlpha(file), 'cutout.png');
  const res = await fetch(`/api/pegawai/${encodeURIComponent(pin)}/cutout`, { method: 'POST', headers: { Accept: 'application/json', ...authHeaders() }, body: fd });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Upload gagal');
}

export async function uploadCutout(pin, input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  try {
    await uploadCutoutFile(pin, file);
    $('idc-emp').value = pin; // dipertahankan initIdCardAdmin → preview langsung karyawan ini
    await _reloadPegawai();
    showToast('Berhasil', 'Cutout diperbarui');
  } catch (e) { showToast('Gagal', e.message || 'Upload gagal'); }
}

export async function deleteCutout(pin) {
  if (!confirm('Hapus cutout?')) return;
  try {
    await fetch(`/api/pegawai/${encodeURIComponent(pin)}/cutout`, { method: 'DELETE', headers: { Accept: 'application/json', ...authHeaders() } });
    await _reloadPegawai();
  } catch (e) { showToast('Gagal', 'Gagal terhubung ke server.'); }
}

export function idcardSet(g, k, v) {
  _layout[g][k] = v;
  renderIdCardPreview();
}

export function renderIdCardPreview() {
  const emp = (state.pegawaiList || []).find(p => String(p.pin) === $('idc-emp').value) || { nama: 'Nama Karyawan', departemen: 'Departemen' };
  return renderFront($('idc-canvas'), _layout, emp);
}

async function _designInfo(side) {
  const el = $(`idc-${side}-info`), url = _layout[side];
  if (side === 'belakang') { $('idc-belakang-img').src = url || ''; $('idc-belakang-img').style.display = url ? '' : 'none'; }
  if (!url) { el.textContent = 'Belum di-upload'; el.classList.remove('warn'); return; }
  const img = await loadImg(url).catch(() => null);
  if (!img) { el.textContent = 'Gagal memuat'; return; }
  const low = img.naturalWidth < MIN_W || img.naturalHeight < MIN_H;
  el.classList.toggle('warn', low);
  el.textContent = `${img.naturalWidth}×${img.naturalHeight} px` + (low ? ` — ⚠ Resolusi rendah. Disarankan minimal ${MIN_W}×${MIN_H} px.` : '');
}

export async function uploadIdCardDesign(side, input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  const fd = new FormData();
  fd.append('design', file);
  try {
    const res = await fetch(`/api/settings/idcard/${side}`, { method: 'POST', headers: { Accept: 'application/json', ...authHeaders() }, body: fd });
    const json = await res.json();
    if (!json.success) { showToast('Gagal', json.message || 'Upload gagal'); return; }
    _layout[side] = json.url;
    state.idcard = { ...(state.idcard || {}), [side]: json.url };
    await _designInfo(side);
    renderIdCardPreview();
    showToast('Berhasil', `Design ${side} diperbarui`);
  } catch (e) { showToast('Gagal', 'Gagal terhubung ke server.'); }
}

export async function saveIdCardLayout() {
  const { depan, belakang, ...layout } = _layout;
  try {
    const res = await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders() },
      body: JSON.stringify({ data: { idcard: { ...layout, model: 'popout' } } }),
    });
    const json = await res.json();
    if (!json.success) { showToast('Gagal', json.message || 'Gagal menyimpan'); return; }
    state.idcard = { ...(state.idcard || {}), ...layout, model: 'popout' };
    showToast('Tersimpan', 'Layout ID Card disimpan');
  } catch (e) { showToast('Gagal', 'Gagal terhubung ke server.'); }
}

const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export async function exportIdCardZip(btn) {
  if (!_layout.depan) { showToast('Gagal', 'Upload design depan dulu'); return; }
  const emps = activeEmps(), label = btn.innerHTML, files = [];
  btn.disabled = true;
  try {
    const canvas = document.createElement('canvas');
    for (const [i, p] of emps.entries()) {
      btn.textContent = `Membuat ${i + 1}/${emps.length}…`;
      await renderFront(canvas, _layout, p);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      files.push({ name: `${p.nip || p.pin}_${slug(p.nama)}_depan.png`, data: new Uint8Array(await blob.arrayBuffer()) });
    }
    if (_layout.belakang) {
      const buf = await (await fetch(_layout.belakang)).arrayBuffer();
      files.push({ name: `belakang.${_layout.belakang.split('?')[0].split('.').pop()}`, data: new Uint8Array(buf) });
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(makeZip(files));
    a.download = `idcard-karyawan-${new Date().toLocaleDateString('sv-SE').replace(/-/g, '')}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (e) {
    showToast('Gagal', e.message || 'Gagal membuat ZIP');
  } finally {
    btn.disabled = false; btn.innerHTML = label;
  }
}
