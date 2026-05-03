import { state } from './state.js';
import { escHtml, HARI_LABELS, showToast, switchPengaturanStab } from './utils.js';
import { authHeaders } from './auth.js';
import { updatePersonalMeta, populatePickerSelect } from './picker.js';

export function getShiftForPin(pin) {
  const id = state.empShifts[String(pin)];
  return state.appShifts.find(s => s.id === id) || state.appShifts[0] || {
    batas_terlambat: '', batas_setengah_hari: '08:30',
    jam_pulang: '17:00', hari_kerja: [1,2,3,4,5,6]
  };
}

export async function loadAppSettings() {
  try {
    const res  = await fetch('/api/settings');
    const { data } = await res.json();
    state.appShifts      = data.shifts          || [];
    state.empShifts      = data.employee_shifts || {};
    state.appHolidays    = data.holidays        || [];
    state.dailyOverrides = data.daily_overrides || [];
    state.departments    = data.departments     || [];
    updatePersonalMeta();
  } catch (e) {}
}

export async function saveSettings() {
  const errEl = document.getElementById('pengaturan-err');
  const okEl  = document.getElementById('pengaturan-ok');
  if (errEl) errEl.classList.remove('show');
  if (okEl)  okEl.classList.remove('show');
  const payload = {
    shifts:          state.appShifts,
    employee_shifts: state.empShifts,
    holidays:        state.appHolidays,
    daily_overrides: state.dailyOverrides,
    departments:     state.departments,
  };
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
    if (okEl) okEl.classList.add('show');
    showToast('✅ Tersimpan', 'Pengaturan berhasil disimpan');
  } catch (e) {
    if (errEl) { errEl.textContent = 'Gagal terhubung ke server.'; errEl.classList.add('show'); }
  }
}

export async function openPengaturanSettings() {
  const errEl = document.getElementById('pengaturan-err');
  const okEl  = document.getElementById('pengaturan-ok');
  if (errEl) errEl.classList.remove('show');
  if (okEl)  okEl.classList.remove('show');
  switchPengaturanStab('pstab-shifts', document.querySelector('.pstab-btn'));
  try {
    const res  = await fetch('/api/settings');
    const { data } = await res.json();
    state.appShifts      = data.shifts          || [];
    state.empShifts      = data.employee_shifts || {};
    state.appHolidays    = data.holidays        || [];
    state.dailyOverrides = data.daily_overrides || [];
    state.departments    = data.departments     || [];
  } catch (e) {}
  renderShiftsTable();
  renderHolidaysTable();
  renderOverridesTable();
  await loadEmployeesForAssign();
}

// ── SHIFTS ──
export function formatHariKerja(arr) {
  if (!arr || !arr.length) return 'Sen–Sab';
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
    const hariCheckboxes = [['1','Sen'],['2','Sel'],['3','Rab'],['4','Kam'],['5','Jum'],['6','Sab'],['0','Min']].map(([v,l])=>
      `<label style="font-size:11px;display:flex;align-items:center;gap:2px"><input type="checkbox" class="si-hari-${i}" value="${v}" ${hari.includes(Number(v))?'checked':''}> ${l}</label>`
    ).join('');
    return `
    <tr id="shift-row-${i}">
      <td><span id="sv-nama-${i}">${escHtml(s.nama)}</span>
          <input id="si-nama-${i}" type="text" value="${escHtml(s.nama)}" style="display:none" /></td>
      <td><span id="sv-masuk-${i}">${s.jam_masuk}</span>
          <input id="si-masuk-${i}" type="time" value="${s.jam_masuk}" style="display:none" oninput="autoFillBatas(${i})" /></td>
      <td><span id="sv-batas-${i}">${s.batas_terlambat||'—'}</span>
          <input id="si-batas-${i}" type="time" value="${s.batas_terlambat||''}" style="display:none" /></td>
      <td><span id="sv-setengah-${i}">${s.batas_setengah_hari||'08:30'}</span>
          <input id="si-setengah-${i}" type="time" value="${s.batas_setengah_hari||'08:30'}" style="display:none" /></td>
      <td><span id="sv-pulang-${i}">${s.jam_pulang}</span>
          <input id="si-pulang-${i}" type="time" value="${s.jam_pulang}" style="display:none" /></td>
      <td>
        <span id="sv-ist-${i}" style="font-size:11px">${s.ist_window_dari && s.ist_window_sampai ? s.ist_window_dari+'–'+s.ist_window_sampai : '—'}</span>
        <span id="si-ist-${i}" style="display:none;gap:4px;align-items:center">
          <input id="si-ist-dari-${i}" type="time" value="${s.ist_window_dari||''}" style="width:90px" />
          <span style="font-size:11px">–</span>
          <input id="si-ist-sampai-${i}" type="time" value="${s.ist_window_sampai||''}" style="width:90px" />
        </span>
      </td>
      <td>
        <span id="sv-hari-${i}" style="font-size:11px">${formatHariKerja(hari)}</span>
        <div id="si-hari-${i}" style="display:none;gap:4px;flex-wrap:wrap">${hariCheckboxes}</div>
      </td>
      <td style="white-space:nowrap">
        <span id="shift-view-btns-${i}">
          <button class="btn-icon" onclick="editShiftRow(${i})" title="Edit">✏️</button>
          <button class="btn-icon del" onclick="deleteShift(${i})" title="Hapus">🗑️</button>
        </span>
        <span id="shift-edit-btns-${i}" style="display:none">
          <button class="btn-icon" onclick="saveShiftRow(${i})" title="Simpan">✅</button>
          <button class="btn-icon" onclick="cancelShiftRow(${i})" title="Batal">❌</button>
        </span>
      </td>
    </tr>`;
  }).join('');
}

export function editShiftRow(i) {
  ['nama','masuk','batas','setengah','pulang'].forEach(f => {
    document.getElementById(`sv-${f}-${i}`).style.display = 'none';
    document.getElementById(`si-${f}-${i}`).style.display = '';
  });
  document.getElementById(`sv-ist-${i}`).style.display = 'none';
  document.getElementById(`si-ist-${i}`).style.display = 'flex';
  document.getElementById(`sv-hari-${i}`).style.display = 'none';
  document.getElementById(`si-hari-${i}`).style.display = 'flex';
  document.getElementById(`shift-view-btns-${i}`).style.display = 'none';
  document.getElementById(`shift-edit-btns-${i}`).style.display = '';
}

export function cancelShiftRow(i) {
  const s = state.appShifts[i];
  document.getElementById(`si-nama-${i}`).value     = s.nama;
  document.getElementById(`si-masuk-${i}`).value    = s.jam_masuk;
  document.getElementById(`si-batas-${i}`).value    = s.batas_terlambat || '';
  document.getElementById(`si-setengah-${i}`).value = s.batas_setengah_hari || '08:30';
  document.getElementById(`si-pulang-${i}`).value   = s.jam_pulang;
  document.getElementById(`si-ist-dari-${i}`).value   = s.ist_window_dari || '';
  document.getElementById(`si-ist-sampai-${i}`).value = s.ist_window_sampai || '';
  ['nama','masuk','batas','setengah','pulang'].forEach(f => {
    document.getElementById(`sv-${f}-${i}`).style.display = '';
    document.getElementById(`si-${f}-${i}`).style.display = 'none';
  });
  document.getElementById(`sv-ist-${i}`).style.display = '';
  document.getElementById(`si-ist-${i}`).style.display = 'none';
  document.getElementById(`sv-hari-${i}`).style.display = '';
  document.getElementById(`si-hari-${i}`).style.display = 'none';
  document.getElementById(`shift-view-btns-${i}`).style.display = '';
  document.getElementById(`shift-edit-btns-${i}`).style.display = 'none';
}

export function saveShiftRow(i) {
  const hariChecked = [...document.querySelectorAll(`.si-hari-${i}:checked`)].map(c => Number(c.value));
  state.appShifts[i] = {
    ...state.appShifts[i],
    nama:                document.getElementById(`si-nama-${i}`).value.trim(),
    jam_masuk:           document.getElementById(`si-masuk-${i}`).value,
    batas_terlambat:     document.getElementById(`si-batas-${i}`).value,
    batas_setengah_hari: document.getElementById(`si-setengah-${i}`).value,
    jam_pulang:          document.getElementById(`si-pulang-${i}`).value,
    ist_window_dari:     document.getElementById(`si-ist-dari-${i}`).value || null,
    ist_window_sampai:   document.getElementById(`si-ist-sampai-${i}`).value || null,
    hari_kerja:          hariChecked,
  };
  renderShiftsTable();
  renderAssignTable();
}

export function addMinutesToTime(hhmm, menit) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + menit;
  return `${String(Math.floor(total/60)%24).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}

export function autoFillBatas(i) {
  const masuk = document.getElementById(`si-masuk-${i}`).value;
  if (!masuk) return;
  document.getElementById(`si-batas-${i}`).value    = addMinutesToTime(masuk, 6);
  document.getElementById(`si-setengah-${i}`).value = addMinutesToTime(masuk, 29);
}

export function autoFillBatasNew() {
  const masuk = document.getElementById('ns-masuk').value;
  if (!masuk) return;
  document.getElementById('ns-batas').value    = addMinutesToTime(masuk, 6);
  document.getElementById('ns-setengah').value = addMinutesToTime(masuk, 29);
}

export function deleteShift(i) {
  if (!confirm(`Hapus shift "${state.appShifts[i].nama}"?`)) return;
  const deletedId = state.appShifts[i].id;
  state.appShifts.splice(i, 1);
  for (const pin of Object.keys(state.empShifts)) {
    if (state.empShifts[pin] === deletedId) delete state.empShifts[pin];
  }
  renderShiftsTable();
  renderAssignTable();
}

export function toggleAddShift() {
  document.getElementById('add-shift-form').classList.toggle('open');
}

export function addShift() {
  const nama     = document.getElementById('ns-nama').value.trim();
  const masuk    = document.getElementById('ns-masuk').value;
  const batas    = document.getElementById('ns-batas').value;
  const setengah = document.getElementById('ns-setengah').value;
  const pulang   = document.getElementById('ns-pulang').value;
  if (!nama) { alert('Nama shift tidak boleh kosong'); return; }
  const hariChecked = [...document.querySelectorAll('.ns-hari:checked')].map(c => Number(c.value));
  const istDari   = document.getElementById('ns-ist-dari').value   || null;
  const istSampai = document.getElementById('ns-ist-sampai').value || null;
  const id = nama.toLowerCase().replace(/\s+/g,'-') + '-' + Date.now();
  state.appShifts.push({ id, nama, jam_masuk:masuk, batas_terlambat:batas, batas_setengah_hari:setengah, jam_pulang:pulang, ist_window_dari:istDari, ist_window_sampai:istSampai, hari_kerja:hariChecked });
  document.getElementById('ns-nama').value = '';
  document.getElementById('ns-ist-dari').value = '';
  document.getElementById('ns-ist-sampai').value = '';
  document.getElementById('add-shift-form').classList.remove('open');
  renderShiftsTable();
  renderAssignTable();
}

// ── ASSIGN ──
export async function loadEmployeesForAssign() {
  if (!state.pegawaiList.length) {
    try {
      const res = await fetch('/api/pegawai');
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
      <td><select onchange="assignShift('${escHtml(String(p.pin))}',this.value)">${opts}</select></td>
    </tr>`;
  }).join('');
}

export function assignShift(pin, shiftId) {
  if (shiftId) state.empShifts[pin] = shiftId;
  else delete state.empShifts[pin];
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
      <td><button class="btn-icon del" onclick="deleteHoliday('${escHtml(h.tanggal)}')" title="Hapus">🗑️</button></td>
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
}

export function deleteHoliday(tanggal) {
  state.appHolidays = state.appHolidays.filter(h => h.tanggal!==tanggal);
  renderHolidaysTable();
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
    document.getElementById('ov-label-pulang-manual').innerHTML = 'Jam Pulang <span style="color:#e53e3e">*</span>';
    const masukLabel = ['customer_visit','lembur'].includes(alasan)
      ? 'Jam Masuk <span style="color:var(--text-muted);font-weight:400">(opsional)</span>'
      : 'Jam Masuk <span style="color:#e53e3e">*</span>';
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

    const btn = document.querySelector('[onclick="addOverride()"]');
    btn.disabled=true; btn.textContent='Menyimpan...';

    const postScan = (pin, scanDate, cat) => fetch('/api/att_log/scan',{
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+state.authToken},
      body:JSON.stringify({data:{pin:String(pin),scan_date:scanDate,catatan:cat||null}})
    }).then(r=>{if(!r.ok)throw new Error();});

    const addScanNote = (sData, pin, cat) => {
      const notes = sData.scan_notes||[];
      const idx   = notes.findIndex(n=>String(n.pin)===String(pin)&&n.tanggal===tanggal);
      if(idx>=0) notes[idx].catatan=cat; else notes.push({pin:String(pin),tanggal,catatan:cat});
      return {...sData,scan_notes:notes};
    };
    const postSettings = (data) => fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+state.authToken},body:JSON.stringify({data})}).then(r=>{if(!r.ok)throw new Error();});

    let berhasil=0, gagal=0;
    if (isHalfDay) {
      try {
        const shiftId = document.getElementById('ov-shift-manual').value;
        const shift   = state.appShifts.find(s=>s.id===shiftId);
        const sRes    = await fetch('/api/settings',{headers:{'Authorization':'Bearer '+state.authToken}});
        const sData   = (await sRes.json()).data||{};
        let updated   = {...sData};
        for (const pin of state.ovSelectedPins) {
          state.dailyOverrides.push({id:'ov-'+Date.now()+'-'+pin,tanggal,nama:catatan,tipe:'ganti_shift',shift_id:shiftId,jam_pulang:shift?.jam_pulang||'17:00',berlaku_untuk:[String(pin)],created_by:state.authUser?.name||state.authUser?.username||'?',created_at:new Date().toISOString()});
          updated=addScanNote(updated,pin,catatan); berhasil++;
        }
        updated.daily_overrides=state.dailyOverrides;
        await postSettings(updated);
        state.appShifts=updated.shifts||state.appShifts;
        renderOverridesTable();
      } catch { gagal=state.ovSelectedPins.length; berhasil=0; }
    } else {
      for (const pin of state.ovSelectedPins) {
        try {
          if(alasan==='sakit'){
            const sRes=await fetch('/api/settings',{headers:{'Authorization':'Bearer '+state.authToken}});
            const sData=(await sRes.json()).data||{};
            await postSettings(addScanNote(sData,pin,catatan));
          } else {
            if(jamMasuk) await postScan(pin,tanggal+' '+jamMasuk+':00',catatan);
            await postScan(pin,tanggal+' '+jamPulang+':00',jamMasuk?null:catatan);
          }
          state.dailyOverrides.push({id:'ov-inject-'+Date.now()+'-'+pin,tanggal,nama:catatan,tipe:'absen_inject',alasan,jam_masuk:jamMasuk||null,jam_pulang:jamPulang||null,berlaku_untuk:[String(pin)],created_by:state.authUser?.name||state.authUser?.username||'?',created_at:new Date().toISOString()});
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
    const alasanIcons={lembur:'🌙',sakit:'🏥',customer_visit:'🚗',setengah_hari_pagi:'🌅',setengah_hari_siang:'🌤️'};
    const tipeLabel=o.tipe==='pulang_awal'
      ?`⏰ Pulang ${o.jam_pulang}`
      :o.tipe==='absen_inject'
        ?`${alasanIcons[o.alasan]||'📝'} ${o.nama}${o.jam_masuk?' ('+o.jam_masuk+'→'+o.jam_pulang+')':o.jam_pulang?' (→'+o.jam_pulang+')':''} <span style="font-size:10px;color:var(--text-muted)">[inject]</span>`
        :`🔄 ${state.appShifts.find(s=>s.id===o.shift_id)?.nama||o.shift_id}`;
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
      <td><button class="btn-icon del" onclick="deleteOverride('${escHtml(o.id)}')" title="Hapus">🗑️</button></td>
    </tr>`;
  }).join('');
}

// ── DEPARTEMEN ──
export function renderDepartmentsCard() {
  const el=document.getElementById('dept-list');
  if(el){
    if(!state.departments.length){el.innerHTML='<span style="color:var(--text2);font-size:13px">Belum ada departemen</span>';}
    else{el.innerHTML=state.departments.map((d,i)=>
      `<span style="display:inline-flex;align-items:center;gap:6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:3px 10px;font-size:13px">
        ${escHtml(d)}
        <button onclick="removeDepartment(${i})" style="background:none;border:none;cursor:pointer;color:var(--text2);font-size:14px;line-height:1;padding:0" title="Hapus">×</button>
      </span>`
    ).join('');}
  }
  // sync dropdown tambah karyawan
  const sel=document.getElementById('np-dept');
  if(sel){
    const cur=sel.value;
    sel.innerHTML='<option value="">— Pilih —</option>'+state.departments.map(d=>`<option value="${escHtml(d)}">${escHtml(d)}</option>`).join('');
    sel.value=cur;
  }
}

export async function addDepartment() {
  const inp=document.getElementById('dept-input');
  const nama=(inp?.value||'').trim();
  if(!nama) return;
  if(state.departments.includes(nama)){showToast('⚠️','Departemen sudah ada');return;}
  state.departments.push(nama);
  inp.value='';
  renderDepartmentsCard();
  await saveSettings();
}

export async function removeDepartment(idx) {
  state.departments.splice(idx,1);
  renderDepartmentsCard();
  await saveSettings();
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
  const pw=document.getElementById('resetpw-baru').value;
  const confirm=document.getElementById('resetpw-konfirm').value;
  const errEl=document.getElementById('resetpw-err');
  const okEl=document.getElementById('resetpw-ok');
  errEl.classList.remove('show'); okEl.classList.remove('show');
  if(!pin){errEl.textContent='Pilih karyawan.';errEl.classList.add('show');return;}
  if(pw.length<6){errEl.textContent='Password minimal 6 karakter.';errEl.classList.add('show');return;}
  if(pw!==confirm){errEl.textContent='Konfirmasi tidak cocok.';errEl.classList.add('show');return;}
  try{
    const res=await fetch('/api/auth/admin-reset-password',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({pin,password:pw})});
    const json=await res.json();
    if(!json.success){errEl.textContent=json.message;errEl.classList.add('show');return;}
    okEl.textContent=json.message;okEl.classList.add('show');
    document.getElementById('resetpw-baru').value='';
    document.getElementById('resetpw-konfirm').value='';
    document.getElementById('resetpw-pin').value='';
  }catch(e){errEl.textContent='Gagal terhubung ke server.';errEl.classList.add('show');}
}
