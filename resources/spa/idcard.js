// ID Card: design (depan/belakang) di-upload admin, foto + teks ditempel di canvas.
// Posisi disimpan sebagai pecahan (0..1) lebar/tinggi design → tetap pas walau design diganti.
import { state } from './state.js';
import { escHtml, showToast } from './utils.js';
import { authHeaders } from './auth.js';
import { makeZip } from './zip.js';

const MIN_W = 638, MIN_H = 1012; // CR80 54×85,6 mm @300 DPI

const DEFAULT = {
  foto: { x: .5, y: .40, d: .46, ring: .012, ringColor: '#ffffff' },
  nama: { y: .68, size: .055, color: '#111111', bold: true },
  dept: { y: .74, size: .040, color: '#333333', bold: false },
  nip:  { y: .79, size: .040, color: '#333333', bold: false },
};

const $ = id => document.getElementById(id);
let _layout = null; // salinan kerja di editor admin

export function idcardLayout() {
  const s = state.idcard || {};
  const L = { depan: s.depan || null, belakang: s.belakang || null };
  for (const k of Object.keys(DEFAULT)) L[k] = { ...DEFAULT[k], ...(s[k] || {}) };
  return L;
}

/** NIP di kartu = NIP + MMYY tanggal lahir; tanpa tgl lahir → NIP saja */
export const tglLahirOk = emp => !!emp.tgl_lahir && emp.tgl_lahir > '1900';
export function nipKartu(emp) {
  const t = emp.tgl_lahir;
  return (emp.nip || '') + (tglLahirOk(emp) ? t.slice(5, 7) + t.slice(2, 4) : '');
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

function drawText(ctx, text, t, W, H) {
  if (!text) return;
  let px = t.size * H;
  const font = () => `${t.bold ? 700 : 500} ${px}px Montserrat, sans-serif`;
  ctx.font = font();
  while (ctx.measureText(text).width > W * .9 && px > 6) { px -= 1; ctx.font = font(); }
  ctx.fillStyle = t.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, t.y * H);
}

/** Gambar kartu depan ke canvas (ukuran = resolusi asli design). emp: {nama, departemen, nip, tgl_lahir, foto} */
export async function renderFront(canvas, L, emp) {
  const design = L.depan ? await loadImg(L.depan).catch(() => null) : null;
  const W = canvas.width = design ? design.naturalWidth : MIN_W;
  const H = canvas.height = design ? design.naturalHeight : MIN_H;
  const ctx = canvas.getContext('2d');
  await Promise.all(['500', '700'].map(w => document.fonts.load(`${w} 20px Montserrat`).catch(() => {})));

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  if (design) ctx.drawImage(design, 0, 0);

  const f = L.foto, D = f.d * W, cx = f.x * W, cy = f.y * H;
  if (f.ring > 0) {
    ctx.beginPath(); ctx.arc(cx, cy, D / 2 + f.ring * W, 0, Math.PI * 2);
    ctx.fillStyle = f.ringColor; ctx.fill();
  }
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, D / 2, 0, Math.PI * 2); ctx.clip();
  const foto = emp.foto ? await loadImg(emp.foto).catch(() => null) : null;
  if (foto) {
    // cover + fokus 25% dari atas (wajah), sama seperti avatar
    const s = D / Math.min(foto.naturalWidth, foto.naturalHeight);
    const w = foto.naturalWidth * s, h = foto.naturalHeight * s;
    ctx.drawImage(foto, cx - w / 2, cy - D / 2 + (D - h) * .25, w, h);
  } else {
    ctx.fillStyle = '#d1d5db'; ctx.fillRect(cx - D / 2, cy - D / 2, D, D);
    ctx.fillStyle = '#6b7280'; ctx.font = `700 ${D * .4}px Montserrat, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((emp.nama || '?').trim().charAt(0).toUpperCase(), cx, cy);
  }
  ctx.restore();

  drawText(ctx, emp.nama, L.nama, W, H);
  drawText(ctx, emp.departemen, L.dept, W, H);
  drawText(ctx, nipKartu(emp), L.nip, W, H);
}

// ── Editor admin ──
const FIELDS = [
  ['foto', 'Foto', [['x', 'Posisi X', 0, 1], ['y', 'Posisi Y', 0, 1], ['d', 'Diameter', .1, 1], ['ring', 'Tebal bingkai', 0, .05], ['ringColor', 'Warna bingkai']]],
  ['nama', 'Nama', [['y', 'Posisi Y', 0, 1], ['size', 'Ukuran', .015, .12], ['color', 'Warna'], ['bold', 'Tebal']]],
  ['dept', 'Departemen', [['y', 'Posisi Y', 0, 1], ['size', 'Ukuran', .015, .12], ['color', 'Warna'], ['bold', 'Tebal']]],
  ['nip', 'NIP', [['y', 'Posisi Y', 0, 1], ['size', 'Ukuran', .015, .12], ['color', 'Warna'], ['bold', 'Tebal']]],
];

const activeEmps = () => (state.pegawaiList || []).filter(p => p.status == 1);

export function initIdCardAdmin() {
  _layout = idcardLayout();
  $('idc-fields').innerHTML = FIELDS.map(([g, label, fs]) => `
    <div class="idc-group"><div class="idc-group-title">${label}</div>${fs.map(([k, lbl, min, max]) => {
      const v = _layout[g][k], id = `idc-${g}-${k}`;
      const inp = typeof v === 'boolean'
        ? `<input type="checkbox" id="${id}" ${v ? 'checked' : ''} onchange="idcardSet('${g}','${k}',this.checked)">`
        : typeof v === 'string'
          ? `<input type="color" id="${id}" value="${v}" oninput="idcardSet('${g}','${k}',this.value)">`
          : `<input type="range" id="${id}" min="${min}" max="${max}" step="0.001" value="${v}" oninput="idcardSet('${g}','${k}',+this.value)">`;
      return `<label class="idc-field"><span>${lbl}</span>${inp}</label>`;
    }).join('')}</div>`).join('');

  const emps = activeEmps();
  const sel = $('idc-emp'), prev = sel.value;
  sel.innerHTML = emps.map(p => `<option value="${escHtml(String(p.pin))}">${escHtml(p.nama)}${p.foto ? '' : ' (tanpa foto)'}</option>`).join('');
  if (prev) sel.value = prev; else { const withFoto = emps.find(p => p.foto); if (withFoto) sel.value = withFoto.pin; }

  const noFoto = emps.filter(p => !p.foto), noTgl = emps.filter(p => !tglLahirOk(p));
  $('idc-warn').innerHTML = [
    noFoto.length && `⚠ ${noFoto.length} karyawan belum ada foto`,
    noTgl.length && `⚠ ${noTgl.length} karyawan tanggal lahir kosong (NIP tanpa MMYY): ${noTgl.slice(0, 8).map(p => escHtml(p.nama)).join(', ')}${noTgl.length > 8 ? ', dst.' : ''}`,
  ].filter(Boolean).join('<br>');

  _designInfo('depan'); _designInfo('belakang');
  renderIdCardPreview();
}

export function idcardSet(g, k, v) {
  _layout[g][k] = v;
  renderIdCardPreview();
}

export function renderIdCardPreview() {
  const emp = (state.pegawaiList || []).find(p => String(p.pin) === $('idc-emp').value) || { nama: 'Nama Karyawan', departemen: 'Departemen', nip: '1001', tgl_lahir: '1996-10-01' };
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
      body: JSON.stringify({ data: { idcard: layout } }),
    });
    const json = await res.json();
    if (!json.success) { showToast('Gagal', json.message || 'Gagal menyimpan'); return; }
    state.idcard = { ...(state.idcard || {}), ...layout };
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
      files.push({ name: `${nipKartu(p) || p.pin}_${slug(p.nama)}_depan.png`, data: new Uint8Array(await blob.arrayBuffer()) });
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
