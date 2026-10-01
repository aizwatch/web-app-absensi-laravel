import { state } from './state.js';
import { escHtml, HARI_LABELS, showToast, switchAdminStab } from './utils.js';
import { authHeaders } from './auth.js';
import { updatePersonalMeta, populatePickerSelect } from './picker.js';
import { icon } from './icons.js';

export function getShiftForPin(pin) {
  const id = state.empShifts[String(pin)];
  return state.appShifts.find(s => s.id === id) || state.appShifts[0] || {
    batas_terlambat: '', batas_setengah_hari: '08:30',
    jam_pulang: '17:00', hari_kerja: [1,2,3,4,5,6]
  };
}

// ── STAGED SETTINGS: baseline + dirty tracking ──
const STAGED_KEYS   = ['shifts','employee_shifts','holidays','daily_overrides','departments'];
const DIRTY_LABELS  = { shifts:'Shift', employee_shifts:'Penugasan', holidays:'Hari Libur', daily_overrides:'Override', departments:'Departemen' };
let baseline = null; // { [key]: JSON string } | null
let settingsLoaded = false;

function currentStagedValues() {
  return {
    shifts: state.appShifts, employee_shifts: state.empShifts, holidays: state.appHolidays,
    daily_overrides: state.dailyOverrides, departments: state.departments,
  };
}

function snapshotAllBaseline() {
  const cur = currentStagedValues();
  baseline = {};
  STAGED_KEYS.forEach(k => { baseline[k] = JSON.stringify(cur[k]); });
}

export function dirtyKeys() {
  if (!baseline) return [];
  const cur = currentStagedValues();
  return STAGED_KEYS.filter(k => JSON.stringify(cur[k]) !== baseline[k]);
}

export function isSettingsDirty() {
  return dirtyKeys().length > 0;
}

export function updateSaveBar() {
  const bar = document.getElementById('settings-save-bar');
  if (!bar) return;
  const keys = dirtyKeys();
  if (!keys.length) { bar.hidden = true; return; }
  bar.hidden = false;
  const text = document.getElementById('save-bar-text');
  if (text) text.textContent = `${keys.length} bagian belum disimpan (${keys.map(k => DIRTY_LABELS[k]).join(', ')})`;
}

function mergeScanNote(notes, pin, catatan, tanggal) {
  const idx = notes.findIndex(n => String(n.pin) === String(pin) && n.tanggal === tanggal);
  if (idx >= 0) { const copy = [...notes]; copy[idx] = { ...copy[idx], catatan }; return copy; }
  return [...notes, { pin: String(pin), tanggal, catatan }];
}

// Immediate (non-staged) write to daily_overrides: fetches the server's current
// copy, appends the new entries there (not the possibly-stale local staged
// array), then merges any still-unsaved local entries back on top so staged
// edits are never clobbered or prematurely persisted. buildFn(server) -> { entries, extra }.
export async function patchOverridesNow(buildFn) {
  try {
    const res    = await fetch('/api/settings', { headers: authHeaders() });
    const server = (await res.json()).data || {};
    const { entries = [], extra = {} } = buildFn(server) || {};
    const overrides = [...(server.daily_overrides || []), ...entries];
    const ok = await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ data: { daily_overrides: overrides, ...extra } }),
    }).then(r => r.ok).catch(() => false);
    if (!ok) return false;
    const stillLocalOnly = state.dailyOverrides.filter(o => !overrides.some(so => so.id === o.id));
    state.dailyOverrides = [...overrides, ...stillLocalOnly];
    if (baseline) baseline.daily_overrides = JSON.stringify(overrides);
    updateSaveBar();
    return true;
  } catch (e) { return false; }
}

export async function patchOverridesRemoveNow(id) {
  try {
    const res    = await fetch('/api/settings', { headers: authHeaders() });
    const server = (await res.json()).data || {};
    const overrides = (server.daily_overrides || []).filter(o => o.id !== id);
    const ok = await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ data: { daily_overrides: overrides } }),
    }).then(r => r.ok).catch(() => false);
    if (!ok) return false;
    const stillLocalOnly = state.dailyOverrides.filter(o => o.id !== id && !overrides.some(so => so.id === o.id));
    state.dailyOverrides = [...overrides, ...stillLocalOnly];
    if (baseline) baseline.daily_overrides = JSON.stringify(overrides);
    updateSaveBar();
    return true;
  } catch (e) { return false; }
}

export async function loadAppSettings() {
  try {
    const res  = await fetch('/api/settings',{headers:authHeaders()});
    const { data } = await res.json();
    state.appShifts      = data.shifts          || [];
    state.empShifts      = data.employee_shifts || {};
    state.appHolidays    = data.holidays        || [];
    state.dailyOverrides = data.daily_overrides || [];
    state.departments    = data.departments     || [];
    state.idcard         = data.idcard          || null;
    updatePersonalMeta();
  } catch (e) {}
}

export async function saveSettings() {
  const keys = dirtyKeys();
  if (!keys.length) return;
  const errEl = document.getElementById('pengaturan-err');
  const okEl  = document.getElementById('pengaturan-ok');
  if (errEl) errEl.classList.remove('show');
  if (okEl)  okEl.classList.remove('show');
  const src = currentStagedValues();
  const payload = {};
  keys.forEach(k => { payload[k] = src[k]; });
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ data: payload })
    });
    const json = await res.json();
    if (!json.success) {
      if (errEl) { errEl.textContent = json.message || 'Gagal menyimpan.'; errEl.classList.add('show'); }
      return;
    }
    await loadAppSettings();
    snapshotAllBaseline();
    renderShiftsTable(); renderHolidaysTable(); renderOverridesTable(); renderAssignTable(); renderDepartmentsCard();
    updateSaveBar();
    if (okEl) okEl.classList.add('show');
    showToast('Tersimpan', 'Pengaturan berhasil disimpan');
  } catch (e) {
    if (errEl) { errEl.textContent = 'Gagal terhubung ke server.'; errEl.classList.add('show'); }
  }
}

export function discardSettings() {
  if (!baseline) return;
  cancelShiftForm();
  state.appShifts      = JSON.parse(baseline.shifts);
  state.empShifts      = JSON.parse(baseline.employee_shifts);
  state.appHolidays     = JSON.parse(baseline.holidays);
  state.dailyOverrides  = JSON.parse(baseline.daily_overrides);
  state.departments     = JSON.parse(baseline.departments);
  renderShiftsTable(); renderHolidaysTable(); renderOverridesTable(); renderAssignTable(); renderDepartmentsCard();
  updateSaveBar();
}

// Called once per admin-view entry into any Pengaturan-family section.
// Skips the network round-trip while there are unsaved local changes, so it
// never clobbers work in progress.
export async function ensureSettingsLoaded() {
  if (settingsLoaded && !isSettingsDirty()) return;
  if (isSettingsDirty()) return;
  await loadAppSettings();
  snapshotAllBaseline();
  settingsLoaded = true;
  renderShiftsTable();
  renderHolidaysTable();
  renderOverridesTable();
  await loadEmployeesForAssign();
  updateSaveBar();
}

// ── SHIFTS ──
export function formatHariKerja(arr) {
  if (arr === undefined || arr === null) return 'Sen–Sab (default)';
  if (!arr.length) return 'Tidak ada';
  return arr.map(d => HARI_LABELS[d]).join(' ');
}

export function renderShiftsTable() {
  const tbody = document.getElementById('shifts-tbody');
  if (!state.appShifts.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:16px">Belum ada shift</td></tr>`;
    return;
  }
  tbody.innerHTML = state.appShifts.map((s, i) => {
    const hari = s.hari_kerja || [1,2,3,4,5,6];
    const ist  = (s.ist_window_dari && s.ist_window_sampai) ? `${s.ist_window_dari}–${s.ist_window_sampai}` : '—';
    return `
    <tr id="shift-row-${i}">
      <td>${escHtml(s.nama)}</td>
      <td>${s.jam_masuk}<div class="sub">telat ≥ ${s.batas_terlambat||'—'} · ½ hari ≥ ${s.batas_setengah_hari||'—'}</div></td>
      <td>${s.jam_pulang}${s.jam_pulang_resmi?`<div class="sub">resmi ${s.jam_pulang_resmi}</div>`:''}</td>
      <td>${ist}</td>
      <td>${escHtml(formatHariKerja(hari))}</td>
      <td class="t-c">${s.no_ot?'<span class="ot-no">Tidak</span>':'<span class="ot-yes">Ya</span>'}</td>
      <td class="t-c" style="white-space:nowrap">
        <button class="btn-icon" onclick="openShiftForm(${i})" title="Edit shift" aria-label="Edit shift ${escHtml(s.nama)}">${icon('pencil')}</button>
        <button class="btn-icon del" onclick="deleteShift(${i})" title="Hapus shift" aria-label="Hapus shift ${escHtml(s.nama)}">${icon('trash-2')}</button>
      </td>
    </tr>`;
  }).join('');
}

let editingShiftIdx = null;

function fillShiftFormField(id, val) { document.getElementById(id).value = val ?? ''; }

export function openShiftForm(i) {
  editingShiftIdx = (i === undefined || i === null) ? null : i;
  const s = editingShiftIdx !== null ? state.appShifts[editingShiftIdx] : null;
  document.getElementById('shift-form-title').textContent = s ? `Edit Shift — ${s.nama}` : 'Tambah Shift';
  document.getElementById('shift-form-submit').textContent = s ? 'Terapkan' : 'Tambah';
  fillShiftFormField('ns-nama', s?.nama);
  fillShiftFormField('ns-masuk', s?.jam_masuk || '08:00');
  fillShiftFormField('ns-batas', s?.batas_terlambat ?? '08:06');
  fillShiftFormField('ns-setengah', s?.batas_setengah_hari || '08:30');
  fillShiftFormField('ns-pulang', s?.jam_pulang || '17:00');
  fillShiftFormField('ns-pulang-resmi', s?.jam_pulang_resmi);
  fillShiftFormField('ns-ist-dari', s?.ist_window_dari);
  fillShiftFormField('ns-ist-sampai', s?.ist_window_sampai);
  document.getElementById('ns-no-ot').checked = !!s?.no_ot;
  const hari = s?.hari_kerja || [1,2,3,4,5,6];
  document.querySelectorAll('.ns-hari').forEach(cb => { cb.checked = hari.includes(Number(cb.value)); });
  clearShiftFormMessages();
  const form = document.getElementById('shift-form');
  form.classList.add('open');
  form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  document.getElementById('ns-nama').focus();
}

export function cancelShiftForm() {
  editingShiftIdx = null;
  const form = document.getElementById('shift-form');
  if (form) form.classList.remove('open');
  clearShiftFormMessages();
}

function clearShiftFormMessages() {
  const err = document.getElementById('shift-form-err');
  const warn = document.getElementById('shift-form-warn');
  if (err)  { err.hidden = true; err.innerHTML = ''; }
  if (warn) { warn.hidden = true; warn.textContent = ''; }
  document.querySelectorAll('#shift-form .field-invalid').forEach(el => el.classList.remove('field-invalid'));
}

function markShiftFieldInvalid(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('field-invalid');
}

function validateShiftForm() {
  const errors = [];
  const nama     = document.getElementById('ns-nama').value.trim();
  const masuk    = document.getElementById('ns-masuk').value;
  const batas    = document.getElementById('ns-batas').value;
  const setengah = document.getElementById('ns-setengah').value;
  const pulang   = document.getElementById('ns-pulang').value;
  const istDari  = document.getElementById('ns-ist-dari').value;
  const istSampai= document.getElementById('ns-ist-sampai').value;
  const hariChecked = [...document.querySelectorAll('.ns-hari:checked')];

  if (!nama) { errors.push('Nama shift tidak boleh kosong.'); markShiftFieldInvalid('ns-nama'); }
  else if (state.appShifts.some((sh, idx) => sh.nama.toLowerCase() === nama.toLowerCase() && idx !== editingShiftIdx)) {
    errors.push('Sudah ada shift dengan nama ini.'); markShiftFieldInvalid('ns-nama');
  }
  if (!masuk)  { errors.push('Jam Masuk wajib diisi.'); markShiftFieldInvalid('ns-masuk'); }
  if (!pulang) { errors.push('Batas Pulang wajib diisi.'); markShiftFieldInvalid('ns-pulang'); }
  if (masuk && batas && batas < masuk) { errors.push('Batas Terlambat tidak boleh lebih awal dari Jam Masuk.'); markShiftFieldInvalid('ns-batas'); }
  if (batas && setengah && setengah < batas) { errors.push('Batas ½ Hari tidak boleh lebih awal dari Batas Terlambat.'); markShiftFieldInvalid('ns-setengah'); }
  if ((istDari && !istSampai) || (!istDari && istSampai)) {
    errors.push('Istirahat Dari dan Sampai harus diisi berdua, atau dikosongkan berdua.');
    markShiftFieldInvalid('ns-ist-dari'); markShiftFieldInvalid('ns-ist-sampai');
  }
  if (istDari && istSampai && istSampai <= istDari) { errors.push('Istirahat Sampai harus lebih akhir dari Istirahat Dari.'); markShiftFieldInvalid('ns-ist-sampai'); }
  if (!hariChecked.length) errors.push('Pilih minimal satu Hari Kerja.');

  const warn = (masuk && pulang && pulang < masuk) ? 'Batas Pulang lebih awal dari Jam Masuk — shift lintas tengah malam?' : '';
  return { errors, warn };
}

export function submitShiftForm(e) {
  if (e) e.preventDefault();
  clearShiftFormMessages();
  const { errors, warn } = validateShiftForm();
  const errEl = document.getElementById('shift-form-err');
  const warnEl = document.getElementById('shift-form-warn');
  if (errors.length) {
    errEl.innerHTML = `<ul>${errors.map(m => `<li>${escHtml(m)}</li>`).join('')}</ul>`;
    errEl.hidden = false;
    return;
  }
  if (warn) { warnEl.textContent = warn; warnEl.hidden = false; }
  const hariChecked = [...document.querySelectorAll('.ns-hari:checked')].map(c => Number(c.value));
  const data = {
    nama: document.getElementById('ns-nama').value.trim(),
    jam_masuk: document.getElementById('ns-masuk').value,
    batas_terlambat: document.getElementById('ns-batas').value,
    batas_setengah_hari: document.getElementById('ns-setengah').value,
    jam_pulang: document.getElementById('ns-pulang').value,
    jam_pulang_resmi: document.getElementById('ns-pulang-resmi').value || null,
    ist_window_dari: document.getElementById('ns-ist-dari').value || null,
    ist_window_sampai: document.getElementById('ns-ist-sampai').value || null,
    hari_kerja: hariChecked,
    no_ot: document.getElementById('ns-no-ot').checked,
  };
  if (editingShiftIdx !== null) {
    state.appShifts[editingShiftIdx] = { ...state.appShifts[editingShiftIdx], ...data };
  } else {
    data.id = data.nama.toLowerCase().replace(/\s+/g,'-') + '-' + Date.now();
    state.appShifts.push(data);
  }
  editingShiftIdx = null;
  document.getElementById('shift-form').classList.remove('open');
  renderShiftsTable();
  renderAssignTable();
  updateSaveBar();
}

export function addMinutesToTime(hhmm, menit) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + menit;
  return `${String(Math.floor(total/60)%24).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}

export function autoFillBatasNew() {
  const masuk = document.getElementById('ns-masuk').value;
  if (!masuk) return;
  document.getElementById('ns-batas').value    = addMinutesToTime(masuk, 6);
  document.getElementById('ns-setengah').value = addMinutesToTime(masuk, 29);
}

export function deleteShift(i) {
  if (state.appShifts.length <= 1) { alert('Minimal harus ada satu shift.'); return; }
  if (!confirm(`Hapus shift "${state.appShifts[i].nama}"? Perubahan ini butuh klik Simpan Perubahan untuk berlaku.`)) return;
  const deletedId = state.appShifts[i].id;
  state.appShifts.splice(i, 1);
  for (const pin of Object.keys(state.empShifts)) {
    if (state.empShifts[pin] === deletedId) delete state.empShifts[pin];
  }
  if (editingShiftIdx === i) cancelShiftForm();
  renderShiftsTable();
  renderAssignTable();
  updateSaveBar();
}

// ── ASSIGN ──
export async function loadEmployeesForAssign() {
  if (!state.pegawaiList.length) {
    try {
      const res = await fetch('/api/pegawai',{headers:authHeaders()});
      const { data } = await res.json();
      state.pegawaiList = data || [];
    } catch (e) {}
  }
  renderAssignTable();
}

export function renderAssignTable(filter) {
  const tbody   = document.getElementById('assign-tbody');
  const keyword = (filter || document.getElementById('emp-search').value || '').toLowerCase();
  const list    = keyword
    ? state.pegawaiList.filter(p => p.nama.toLowerCase().includes(keyword) || String(p.pin).includes(keyword))
    : state.pegawaiList;
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:20px">Tidak ada karyawan</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(p => {
    const assigned = state.empShifts[String(p.pin)] || '';
    const opts = `<option value="">— Default —</option>` +
      state.appShifts.map(s =>
        `<option value="${escHtml(s.id)}" ${assigned===s.id?'selected':''}>${escHtml(s.nama)}</option>`
      ).join('');
    return `<tr>
      <td style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted)">${escHtml(String(p.pin))}</td>
      <td>${escHtml(p.nama)}</td>
      <td><select aria-label="Shift untuk ${escHtml(p.nama)}" onchange="assignShift('${escHtml(String(p.pin))}',this.value)">${opts}</select></td>
    </tr>`;
  }).join('');
}

export function assignShift(pin, shiftId) {
  if (shiftId) state.empShifts[pin] = shiftId;
  else delete state.empShifts[pin];
  updateSaveBar();
}

export function filterEmpRows() {
  renderAssignTable(document.getElementById('emp-search').value);
}

// ── HOLIDAYS ──
export function renderHolidaysTable() {
  const tbody = document.getElementById('holidays-tbody');
  if (!state.appHolidays.length) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:16px">Belum ada hari libur</td></tr>`;
    return;
  }
  const sorted = [...state.appHolidays].sort((a,b) => a.tanggal.localeCompare(b.tanggal));
  tbody.innerHTML = sorted.map(h => {
    const d = new Date(h.tanggal+'T00:00:00');
    const label = d.toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    return `<tr>
      <td style="font-family:var(--font-mono);font-size:12px">${h.tanggal}</td>
      <td><div style="font-size:13px">${escHtml(h.nama||'—')}</div><div style="font-size:11px;color:var(--text-muted)">${label}</div></td>
      <td><button class="btn-icon del" onclick="deleteHoliday('${escHtml(h.tanggal)}')" title="Hapus" aria-label="Hapus hari libur ${escHtml(h.nama||h.tanggal)}">${icon('trash-2')}</button></td>
    </tr>`;
  }).join('');
}

export function addHoliday() {
  const tanggal = document.getElementById('hl-tanggal').value;
  const nama    = document.getElementById('hl-nama').value.trim();
  if (!tanggal) { alert('Pilih tanggal hari libur'); return; }
  if (state.appHolidays.find(h => h.tanggal===tanggal)) { alert('Tanggal ini sudah ada'); return; }
  state.appHolidays.push({ tanggal, nama: nama||'Hari Libur' });
  document.getElementById('hl-tanggal').value = '';
  document.getElementById('hl-nama').value    = '';
  renderHolidaysTable();
  updateSaveBar();
}

export function deleteHoliday(tanggal) {
  if (!confirm(`Hapus hari libur ${tanggal}?`)) return;
  state.appHolidays = state.appHolidays.filter(h => h.tanggal!==tanggal);
  renderHolidaysTable();
  updateSaveBar();
}

// ── OVERRIDES ──
export function toggleOvFields() {
  const tipe = document.getElementById('ov-tipe').value;
  document.getElementById('ov-field-pulang').style.display = tipe==='pulang_awal' ? '' : 'none';
  document.getElementById('ov-field-shift').style.display  = tipe==='ganti_shift'  ? '' : 'none';
  document.getElementById('ov-field-manual').style.display = tipe==='absen_manual' ? '' : 'none';
  if (tipe==='absen_manual') {
    document.getElementById('ov-berlaku').value = 'tertentu';
    document.getElementById('ov-berlaku').disabled = true;
    document.getElementById('ov-karyawan-wrap').style.display = '';
    toggleOvAlasan();
  } else {
    document.getElementById('ov-berlaku').disabled = false;
    toggleOvKaryawan();
  }
}

export function toggleOvAlasan() {
  const alasan    = document.getElementById('ov-alasan').value;
  const hint      = document.getElementById('ov-alasan-hint');
  const isHalfDay = ['setengah_hari_pagi','setengah_hari_siang'].includes(alasan);
  const isInject  = ['lembur','customer_visit'].includes(alasan);
  document.getElementById('ov-wrap-jam-manual').style.display  = isInject  ? 'grid' : 'none';
  document.getElementById('ov-wrap-shift-manual').style.display = isHalfDay ? ''     : 'none';
  if (isInject) {
    document.getElementById('ov-wrap-masuk').style.display  = '';
    document.getElementById('ov-wrap-pulang-manual').style.display = '';
    document.getElementById('ov-label-pulang-manual').innerHTML = 'Jam Pulang <span class="field-required">*</span>';
    const masukLabel = ['customer_visit','lembur'].includes(alasan)
      ? 'Jam Masuk <span style="color:var(--text-muted);font-weight:400">(opsional)</span>'
      : 'Jam Masuk <span class="field-required">*</span>';
    document.getElementById('ov-label-masuk').innerHTML = masukLabel;
  }
  if (isHalfDay) {
    const sel = document.getElementById('ov-shift-manual');
    sel.innerHTML = state.appShifts.map(s =>
      `<option value="${escHtml(s.id)}">${escHtml(s.nama)}</option>`
    ).join('') || '<option value="">— Belum ada shift —</option>';
  }
  const hints = {
    lembur:'Inject scan pulang ke att_log (masuk opsional). Catatan: Lembur.',
    sakit:'Hanya tambah keterangan "Sakit (MC)" ke scan_notes. Tidak inject scan.',
    customer_visit:'Inject scan pulang ke att_log (masuk opsional). Catatan: Customer Visit.',
    setengah_hari_pagi:'Ganti shift 1 hari. Catatan: Setengah Hari Pagi.',
    setengah_hari_siang:'Ganti shift 1 hari. Catatan: Setengah Hari Siang.',
  };
  hint.textContent = hints[alasan] || '';
}

export function toggleOvKaryawan() {
  document.getElementById('ov-karyawan-wrap').style.display =
    document.getElementById('ov-berlaku').value === 'tertentu' ? '' : 'none';
}

export function populateOvShiftSelect() {
  const sel = document.getElementById('ov-shift-id');
  sel.innerHTML = state.appShifts.map(s =>
    `<option value="${escHtml(s.id)}">${escHtml(s.nama)}</option>`
  ).join('') || '<option value="">— Belum ada shift —</option>';
}

export function populateOvKaryawanSelect() {}

export function openOvKaryawanPicker() {
  document.getElementById('ov-picker-search').value = '';
  renderOvPickerList('');
  document.getElementById('ov-picker-overlay').style.display = 'flex';
}

export function closeOvKaryawanPicker() {
  document.getElementById('ov-picker-overlay').style.display = 'none';
}

export function filterOvPicker() {
  renderOvPickerList(document.getElementById('ov-picker-search').value);
}

export function renderOvPickerList(keyword) {
  const kw   = (keyword||'').toLowerCase();
  const list = kw
    ? state.pegawaiList.filter(p => p.nama.toLowerCase().includes(kw)||String(p.pin).includes(kw))
    : state.pegawaiList;
  const el = document.getElementById('ov-picker-list');
  if (!list.length) { el.innerHTML=`<div style="text-align:center;color:var(--text-muted);padding:16px;font-size:13px">Tidak ditemukan</div>`; return; }
  el.innerHTML = list.map(p => {
    const checked = state.ovSelectedPins.includes(String(p.pin)) ? 'checked' : '';
    return `<label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;background:${checked?'rgba(0,180,255,0.08)':'transparent'};border:1px solid ${checked?'var(--accent)':'transparent'};transition:.15s">
      <input type="checkbox" value="${escHtml(String(p.pin))}" ${checked} onchange="toggleOvPin('${escHtml(String(p.pin))}')" style="accent-color:var(--accent);width:16px;height:16px" />
      <div><div style="font-size:13px">${escHtml(p.nama)}</div><div style="font-size:11px;color:var(--text-muted)">PIN ${escHtml(String(p.pin))}</div></div>
    </label>`;
  }).join('');
}

export function toggleOvPin(pin) {
  const idx = state.ovSelectedPins.indexOf(pin);
  if (idx===-1) state.ovSelectedPins.push(pin); else state.ovSelectedPins.splice(idx,1);
  renderOvPickerList(document.getElementById('ov-picker-search').value);
}

export function ovPickerSelectAll() {
  state.ovSelectedPins = state.pegawaiList.map(p => String(p.pin));
  renderOvPickerList(document.getElementById('ov-picker-search').value);
}

export function ovPickerClearAll() {
  state.ovSelectedPins = [];
  renderOvPickerList(document.getElementById('ov-picker-search').value);
}

export function confirmOvKaryawanPicker() {
  closeOvKaryawanPicker();
  const label = document.getElementById('ov-karyawan-label');
  if (!state.ovSelectedPins.length) {
    label.textContent = 'Belum ada dipilih';
  } else {
    const names = state.ovSelectedPins.map(pin => {
      const p = state.pegawaiList.find(x => String(x.pin)===pin);
      return p ? p.nama.split(' ')[0] : pin;
    });
    label.textContent = names.length<=3 ? names.join(', ') : `${names.slice(0,3).join(', ')} +${names.length-3} lainnya`;
  }
}

export function updateOvKaryawanLabel() { confirmOvKaryawanPicker(); }

// tipe absen_manual writes real att_log/scan_notes data, so it is always
// immediate (see patchOverridesNow) even though the rest of this tab is staged.
export async function addOverride() {
  const tanggal = document.getElementById('ov-tanggal').value;
  const nama    = document.getElementById('ov-nama').value.trim();
  const tipe    = document.getElementById('ov-tipe').value;
  const berlaku = document.getElementById('ov-berlaku').value;
  if (!tanggal) { alert('Pilih tanggal'); return; }

  if (tipe==='absen_manual') {
    const alasan    = document.getElementById('ov-alasan').value;
    const jamMasuk  = document.getElementById('ov-jam-masuk').value;
    const jamPulang = document.getElementById('ov-jam-pulang-manual').value;
    if (!state.ovSelectedPins.length) { alert('Pilih minimal satu karyawan'); return; }
    const alasanLabel = {lembur:'Lembur',sakit:'Sakit (MC)',customer_visit:'Customer Visit',setengah_hari_siang:'Setengah Hari Siang',setengah_hari_pagi:'Setengah Hari Pagi'}[alasan]||alasan;
    const catatan = nama||alasanLabel;
    const isHalfDay = ['setengah_hari_pagi','setengah_hari_siang'].includes(alasan);
    const isInject  = ['lembur','customer_visit'].includes(alasan);
    if (isInject && !jamPulang) { alert('Jam pulang wajib diisi'); return; }
    if (isHalfDay && !document.getElementById('ov-shift-manual').value) { alert('Pilih shift'); return; }

    const btn = document.getElementById('ov-add-btn');
    btn.disabled=true; btn.textContent='Menyimpan...';

    const postScan = (pin, scanDate, cat) => fetch('/api/att_log/scan',{
      method:'POST', headers:{'Content-Type':'application/json',...authHeaders()},
      body:JSON.stringify({data:{pin:String(pin),scan_date:scanDate,catatan:cat||null}})
    }).then(r=>{if(!r.ok)throw new Error();});

    let berhasil=0, gagal=0;
    if (isHalfDay) {
      const shiftId = document.getElementById('ov-shift-manual').value;
      const shift   = state.appShifts.find(s=>s.id===shiftId);
      const entries = state.ovSelectedPins.map(pin => ({
        id:'ov-'+Date.now()+'-'+pin, tanggal, nama:catatan, tipe:'ganti_shift', shift_id:shiftId,
        jam_pulang:shift?.jam_pulang||'17:00', berlaku_untuk:[String(pin)],
        created_by:state.authUser?.name||state.authUser?.username||'?', created_at:new Date().toISOString(),
      }));
      const ok = await patchOverridesNow(server => {
        let notes = server.scan_notes || [];
        for (const pin of state.ovSelectedPins) notes = mergeScanNote(notes, pin, catatan, tanggal);
        return { entries, extra: { scan_notes: notes } };
      });
      if (ok) { berhasil = state.ovSelectedPins.length; renderOverridesTable(); }
      else gagal = state.ovSelectedPins.length;
    } else {
      for (const pin of state.ovSelectedPins) {
        try {
          const entry = {
            id:'ov-inject-'+Date.now()+'-'+pin, tanggal, nama:catatan, tipe:'absen_inject', alasan,
            jam_masuk:jamMasuk||null, jam_pulang:jamPulang||null, berlaku_untuk:[String(pin)],
            created_by:state.authUser?.name||state.authUser?.username||'?', created_at:new Date().toISOString(),
          };
          if (alasan==='sakit') {
            await patchOverridesNow(server => ({ entries:[entry], extra:{ scan_notes: mergeScanNote(server.scan_notes||[], pin, catatan, tanggal) } }));
          } else {
            if(jamMasuk) await postScan(pin, tanggal+' '+jamMasuk+':00', catatan);
            await postScan(pin, tanggal+' '+jamPulang+':00', jamMasuk?null:catatan);
            await patchOverridesNow(() => ({ entries:[entry] }));
          }
          berhasil++;
        } catch { gagal++; }
      }
      if(berhasil) renderOverridesTable();
    }
    btn.disabled=false; btn.textContent='＋ Tambah Override';
    alert(berhasil+' karyawan berhasil disimpan.'+(gagal?' '+gagal+' gagal.':''));
    document.getElementById('ov-tanggal').value='';
    document.getElementById('ov-nama').value='';
    document.getElementById('ov-jam-masuk').value='';
    document.getElementById('ov-jam-pulang-manual').value='';
    state.ovSelectedPins=[];
    document.getElementById('ov-karyawan-label').textContent='Belum ada dipilih';
    return;
  }

  // pulang_awal / ganti_shift: staged, requires "Simpan Perubahan"
  const entry={id:'ov-'+Date.now(),tanggal,nama:nama||(tipe==='pulang_awal'?'Pulang Awal':'Ganti Shift'),tipe};
  if(tipe==='pulang_awal'){
    const jamPulang=document.getElementById('ov-jam-pulang').value;
    if(!jamPulang){alert('Isi jam pulang baru');return;}
    entry.jam_pulang=jamPulang;
  } else {
    const shiftId=document.getElementById('ov-shift-id').value;
    if(!shiftId){alert('Pilih shift pengganti');return;}
    entry.shift_id=shiftId;
    const shift=state.appShifts.find(s=>s.id===shiftId);
    entry.jam_pulang=shift?shift.jam_pulang:'17:00';
  }
  entry.berlaku_untuk = berlaku==='semua' ? 'semua' : (state.ovSelectedPins.length ? [...state.ovSelectedPins] : (alert('Pilih minimal satu karyawan'),null));
  if(!entry.berlaku_untuk) return;
  entry.created_by=state.authUser?.name||state.authUser?.username||'?';
  entry.created_at=new Date().toISOString();
  state.dailyOverrides.push(entry);
  document.getElementById('ov-tanggal').value='';
  document.getElementById('ov-nama').value='';
  state.ovSelectedPins=[];
  document.getElementById('ov-karyawan-label').textContent='Belum ada dipilih';
  renderOverridesTable();
  updateSaveBar();
}

export function renderOverridesTable() {
  populateOvShiftSelect();
  populateOvKaryawanSelect();
  const tbody  = document.getElementById('overrides-tbody');
  const sorted = [...state.dailyOverrides].sort((a,b)=>b.tanggal.localeCompare(a.tanggal));
  if(!sorted.length){
    tbody.innerHTML=`<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:16px">Belum ada override</td></tr>`;
    return;
  }
  tbody.innerHTML=sorted.map(o=>{
    const d=new Date(o.tanggal+'T00:00:00');
    const label=d.toLocaleDateString('id-ID',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
    const alasanIcons={lembur:icon('moon'),sakit:icon('hospital'),customer_visit:icon('car'),setengah_hari_pagi:icon('sunrise'),setengah_hari_siang:icon('cloud-sun')};
    const tipeLabel=o.tipe==='pulang_awal'
      ?`${icon('clock')} Pulang ${o.jam_pulang}`
      :o.tipe==='absen_inject'
        ?`${alasanIcons[o.alasan]||icon('file-text')} ${o.nama}${o.jam_masuk?' ('+o.jam_masuk+'→'+o.jam_pulang+')':o.jam_pulang?' (→'+o.jam_pulang+')':''} <span style="font-size:10px;color:var(--text-muted)">[inject]</span>`
        :`${icon('refresh-cw')} ${state.appShifts.find(s=>s.id===o.shift_id)?.nama||o.shift_id}`;
    const berlakuLabel=o.berlaku_untuk==='semua'?'Semua'
      :Array.isArray(o.berlaku_untuk)?o.berlaku_untuk.map(pin=>{const p=state.pegawaiList.find(x=>String(x.pin)===String(pin));return p?p.nama.split(' ')[0]:pin;}).join(', ')
      :String(o.berlaku_untuk);
    return `<tr>
      <td style="font-size:12px"><div style="font-family:var(--font-mono)">${o.tanggal}</div><div style="color:var(--text-muted);font-size:11px">${label}</div></td>
      <td style="font-size:13px">${escHtml(o.nama)}</td>
      <td style="font-size:12px">${tipeLabel}</td>
      <td style="font-size:12px;color:var(--text-muted)" title="${escHtml(berlakuLabel)}">${escHtml(berlakuLabel.length>20?berlakuLabel.slice(0,18)+'…':berlakuLabel)}</td>
      <td style="font-size:11px;color:var(--text-muted)">
        ${o.created_by?`<div style="font-weight:600;color:var(--text)">${escHtml(o.created_by)}</div>`:''}
        ${o.created_at?`<div>${new Date(o.created_at).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div>`:'—'}
      </td>
      <td><button class="btn-icon del" onclick="deleteOverride('${escHtml(o.id)}')" title="Hapus" aria-label="Hapus override ${escHtml(o.nama)}">${icon('trash-2')}</button></td>
    </tr>`;
  }).join('');
}

// ── DEPARTEMEN (staged, part of "Simpan Perubahan") ──
export function renderDepartmentsCard() {
  const el=document.getElementById('dept-list');
  if(el){
    if(!state.departments.length){el.innerHTML='<p style="color:var(--text-muted);font-size:13px;margin:0">Belum ada departemen.</p>';}
    else{el.innerHTML=state.departments.map((d,i)=>
      `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:13px">
        <span>${escHtml(d)}</span>
        <button onclick="removeDepartment(${i})" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:16px;line-height:1;padding:0 2px" title="Hapus" aria-label="Hapus departemen ${escHtml(d)}">×</button>
      </div>`
    ).join('');}
  }
  const sel=document.getElementById('np-dept');
  if(sel){
    const cur=sel.value;
    sel.innerHTML='<option value="">— Pilih —</option>'+state.departments.map(d=>`<option value="${escHtml(d)}">${escHtml(d)}</option>`).join('');
    sel.value=cur;
  }
}

export function addDepartment() {
  const inp=document.getElementById('dept-input');
  const nama=(inp?.value||'').trim();
  if(!nama) return;
  if(state.departments.includes(nama)){showToast('Peringatan','Departemen sudah ada');return;}
  state.departments.push(nama);
  inp.value='';
  renderDepartmentsCard();
  updateSaveBar();
}

export function removeDepartment(idx) {
  state.departments.splice(idx,1);
  renderDepartmentsCard();
  updateSaveBar();
}

// ── ADMIN PASSWORD ──
export async function adminChangePassword() {
  const pw=document.getElementById('adm-pw-baru').value;
  const confirm=document.getElementById('adm-pw-konfirm').value;
  const errEl=document.getElementById('adm-pw-err');
  const okEl=document.getElementById('adm-pw-ok');
  errEl.classList.remove('show'); okEl.classList.remove('show');
  if(pw.length<6){errEl.textContent='Password minimal 6 karakter.';errEl.classList.add('show');return;}
  if(pw!==confirm){errEl.textContent='Konfirmasi tidak cocok.';errEl.classList.add('show');return;}
  try{
    const res=await fetch('/api/auth/change-password',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({password:pw,password_confirmation:confirm})});
    const json=await res.json();
    if(!json.success){errEl.textContent=json.message;errEl.classList.add('show');return;}
    okEl.textContent='Password berhasil diubah.';okEl.classList.add('show');
    document.getElementById('adm-pw-baru').value='';
    document.getElementById('adm-pw-konfirm').value='';
  }catch(e){errEl.textContent='Gagal terhubung ke server.';errEl.classList.add('show');}
}

export async function adminResetUserPassword() {
  const pin=document.getElementById('resetpw-pin').value;
  const errEl=document.getElementById('resetpw-err');
  const okEl=document.getElementById('resetpw-ok');
  errEl.classList.remove('show'); okEl.classList.remove('show');
  if(!pin){errEl.textContent='Pilih karyawan.';errEl.classList.add('show');return;}
  try{
    const res=await fetch('/api/auth/admin-reset-password',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({pin})});
    const json=await res.json();
    if(!json.success){errEl.textContent=json.message;errEl.classList.add('show');return;}
    okEl.textContent=json.message+(json.temp_password?' Password sementara: '+json.temp_password:'');okEl.classList.add('show');
    document.getElementById('resetpw-pin').value='';
  }catch(e){errEl.textContent='Gagal terhubung ke server.';errEl.classList.add('show');}
}
