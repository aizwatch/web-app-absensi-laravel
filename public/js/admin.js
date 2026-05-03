// ── ADMIN MODAL ──
function openAdminModal() {
  adminInit();
  document.getElementById('modal-admin').classList.add('open');
}

function closeAdminModal() {
  document.getElementById('modal-admin').classList.remove('open');
}

function adminInit() {
  const opts = `<option value="">— Semua —</option>` +
    _pegawaiList.map(p => `<option value="${escHtml(String(p.pin))}">${escHtml(p.nama)} (${escHtml(String(p.pin))})</option>`).join('');
  document.getElementById('adm-filter-pin').innerHTML = opts;
  document.getElementById('resetpw-pin').innerHTML =
    `<option value="">— Pilih Karyawan —</option>` +
    _pegawaiList.map(p => `<option value="${escHtml(String(p.pin))}">${escHtml(p.nama)} (${escHtml(String(p.pin))})</option>`).join('');

  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('adm-dari').value   = today;
  document.getElementById('adm-sampai').value = today;
  if (document.getElementById('f-dari') && !document.getElementById('f-dari').value)
    document.getElementById('f-dari').value = today;
  if (document.getElementById('f-sampai') && !document.getElementById('f-sampai').value)
    document.getElementById('f-sampai').value = today;

  adminLoadPegawai();
}

// ── ATT_LOG CRUD ──
async function adminLoadScans() {
  const dari   = document.getElementById('adm-dari').value;
  const sampai = document.getElementById('adm-sampai').value;
  const pin    = document.getElementById('adm-filter-pin').value;
  const wrap   = document.getElementById('adm-raw-wrap');
  const loading = document.createElement('div');
  loading.className = 'loading-overlay';
  loading.innerHTML = '<div class="spinner"></div>';
  wrap.appendChild(loading);

  try {
    const params = new URLSearchParams({ dari, sampai });
    if (pin) params.append('pin', pin);
    const res  = await fetch(`/api/att_log/raw?${params}`);
    const { data } = await res.json();
    renderRawScans(data || []);
    document.getElementById('adm-raw-badge').textContent = `${(data||[]).length} record`;
  } catch (e) {
    document.getElementById('adm-raw-tbody').innerHTML =
      `<tr><td colspan="5" style="color:var(--danger);padding:20px;text-align:center">${escHtml(e.message)}</td></tr>`;
  } finally {
    if (wrap.contains(loading)) wrap.removeChild(loading);
  }
}

function renderRawScans(data) {
  const tbody = document.getElementById('adm-raw-tbody');
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">Tidak ada data</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML = data.map((r, i) => `
    <tr id="raw-row-${i}">
      <td>${escHtml(r.nama || '—')}</td>
      <td style="font-family:var(--font-mono);font-size:12px">${escHtml(String(r.pin))}</td>
      <td>
        <span id="raw-view-dt-${i}" style="font-family:var(--font-mono);font-size:13px">${escHtml(r.scan_date)}</span>
        <input id="raw-edit-dt-${i}" type="datetime-local" value="${r.scan_date.replace(' ','T').slice(0,16)}" style="display:none" />
      </td>
      <td style="white-space:nowrap">
        <span id="raw-view-btns-${i}">
          <button class="btn-icon" onclick="adminEditScanRow(${i})" title="Edit">✏️</button>
        </span>
        <span id="raw-edit-btns-${i}" style="display:none">
          <button class="btn-icon" onclick="adminSaveScan(${i},'${escHtml(r.sn)}','${escHtml(r.scan_date)}','${escHtml(String(r.pin))}')" title="Simpan">✅</button>
          <button class="btn-icon" onclick="adminCancelScanRow(${i})" title="Batal">❌</button>
        </span>
      </td>
    </tr>`).join('');
  window._rawScanData = data;
}

function adminEditScanRow(i) {
  document.getElementById(`raw-view-dt-${i}`).style.display = 'none';
  document.getElementById(`raw-edit-dt-${i}`).style.display = '';
  document.getElementById(`raw-view-btns-${i}`).style.display = 'none';
  document.getElementById(`raw-edit-btns-${i}`).style.display = '';
}

function adminCancelScanRow(i) {
  document.getElementById(`raw-view-dt-${i}`).style.display = '';
  document.getElementById(`raw-edit-dt-${i}`).style.display = 'none';
  document.getElementById(`raw-view-btns-${i}`).style.display = '';
  document.getElementById(`raw-edit-btns-${i}`).style.display = 'none';
}

async function adminSaveScan(i, sn, scan_date_lama, pin) {
  const newDt = document.getElementById(`raw-edit-dt-${i}`).value;
  if (!newDt) return;
  const scan_date_baru = newDt.replace('T', ' ') + ':00';
  try {
    const res = await fetch('/api/att_log/scan', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ data: { sn, scan_date_lama, pin, scan_date_baru } })
    });
    const json = await res.json();
    if (!json.success) { alert(json.message); return; }
    showToast('✅ Berhasil', 'Waktu scan diperbarui');
    adminLoadScans();
  } catch (e) { alert(e.message); }
}

// ── PEGAWAI CRUD ──
async function adminLoadPegawai() {
  try {
    const res  = await fetch('/api/pegawai');
    const { data } = await res.json();
    _pegawaiList = data || [];
    renderAdminPegawai();
    document.getElementById('adm-peg-badge').textContent = `${_pegawaiList.length} karyawan`;
  } catch (e) {}
}

function renderAdminPegawai() {
  const tbody = document.getElementById('adm-peg-tbody');
  if (!_pegawaiList.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">👥</div><div class="empty-text">Tidak ada karyawan</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML = _pegawaiList.map((p, i) => `
    <tr id="peg-row-${i}">
      <td style="font-family:var(--font-mono);font-size:12px">${escHtml(String(p.pin))}</td>
      <td>
        <span id="pv-nama-${i}">${escHtml(p.nama)}</span>
        <input id="pi-nama-${i}" type="text" value="${escHtml(p.nama)}" style="display:none;width:140px" />
      </td>
      <td>
        <span id="pv-nip-${i}">${escHtml(p.nip||'—')}</span>
        <input id="pi-nip-${i}" type="text" value="${escHtml(p.nip||'')}" style="display:none;width:110px" />
      </td>
      <td>
        <span id="pv-telp-${i}">${escHtml(p.telp||'—')}</span>
        <input id="pi-telp-${i}" type="text" value="${escHtml(p.telp||'')}" style="display:none;width:120px" />
      </td>
      <td>
        <span id="pv-status-${i}" class="td-status ${p.status==1?'status-hadir':'status-alpha'}">${p.status==1?'Aktif':'Nonaktif'}</span>
        <select id="pi-status-${i}" style="display:none;font-size:12px">
          <option value="1" ${p.status==1?'selected':''}>Aktif</option>
          <option value="0" ${p.status==0?'selected':''}>Nonaktif</option>
        </select>
      </td>
      <td style="white-space:nowrap">
        <span id="peg-view-btns-${i}">
          <button class="btn-icon" onclick="adminEditPegawaiRow(${i})" title="Edit">✏️</button>
          <button class="btn-icon del" onclick="adminDeletePegawai('${escHtml(String(p.pin))}','${escHtml(p.nama)}')" title="Hapus">🗑️</button>
        </span>
        <span id="peg-edit-btns-${i}" style="display:none">
          <button class="btn-icon" onclick="adminSavePegawai(${i},'${escHtml(String(p.pin))}')" title="Simpan">✅</button>
          <button class="btn-icon" onclick="adminCancelPegawaiRow(${i})" title="Batal">❌</button>
        </span>
      </td>
    </tr>`).join('');
}

function adminEditPegawaiRow(i) {
  ['nama','nip','telp','status'].forEach(f => {
    document.getElementById(`pv-${f}-${i}`).style.display = 'none';
    document.getElementById(`pi-${f}-${i}`).style.display = '';
  });
  document.getElementById(`peg-view-btns-${i}`).style.display = 'none';
  document.getElementById(`peg-edit-btns-${i}`).style.display = '';
}

function adminCancelPegawaiRow(i) {
  ['nama','nip','telp','status'].forEach(f => {
    document.getElementById(`pv-${f}-${i}`).style.display = '';
    document.getElementById(`pi-${f}-${i}`).style.display = 'none';
  });
  document.getElementById(`peg-view-btns-${i}`).style.display = '';
  document.getElementById(`peg-edit-btns-${i}`).style.display = 'none';
}

async function adminSavePegawai(i, pin) {
  const nama   = document.getElementById(`pi-nama-${i}`).value.trim();
  const nip    = document.getElementById(`pi-nip-${i}`).value.trim();
  const telp   = document.getElementById(`pi-telp-${i}`).value.trim();
  const status = document.getElementById(`pi-status-${i}`).value;
  if (!nama) { alert('Nama tidak boleh kosong'); return; }
  try {
    const res = await fetch(`/api/pegawai/${encodeURIComponent(pin)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ data: { pegawai_nama: nama, pegawai_nip: nip, pegawai_telp: telp, pegawai_status: parseInt(status) } })
    });
    const json = await res.json();
    if (!json.success) { alert(json.message); return; }
    showToast('✅ Berhasil', `${nama} diperbarui`);
    await adminLoadPegawai();
    populatePickerSelect();
  } catch (e) { alert(e.message); }
}

async function adminDeletePegawai(pin, nama) {
  if (!confirm(`Hapus karyawan "${nama}" (PIN: ${pin})?\nData absensi tidak ikut terhapus.`)) return;
  try {
    const res = await fetch(`/api/pegawai/${encodeURIComponent(pin)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({})
    });
    const json = await res.json();
    if (!json.success) { alert(json.message); return; }
    showToast('🗑️ Dihapus', `${nama} dihapus`);
    await adminLoadPegawai();
    populatePickerSelect();
  } catch (e) { alert(e.message); }
}

async function adminAddPegawai() {
  const pin  = document.getElementById('np-pin').value.trim();
  const nama = document.getElementById('np-nama').value.trim();
  const nip  = document.getElementById('np-nip').value.trim();
  const telp = document.getElementById('np-telp').value.trim();
  const errEl = document.getElementById('adm-peg-err');
  const okEl  = document.getElementById('adm-peg-ok');
  errEl.classList.remove('show'); okEl.classList.remove('show');

  if (!pin || !nama) { errEl.textContent = 'PIN dan Nama wajib diisi'; errEl.classList.add('show'); return; }
  try {
    const res = await fetch('/api/pegawai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ data: { pegawai_pin: pin, pegawai_nama: nama, pegawai_nip: nip, pegawai_telp: telp } })
    });
    const json = await res.json();
    if (!json.success) { errEl.textContent = json.message; errEl.classList.add('show'); return; }
    okEl.textContent = `Karyawan "${nama}" berhasil ditambahkan`;
    okEl.classList.add('show');
    document.getElementById('np-pin').value = document.getElementById('np-nama').value =
    document.getElementById('np-nip').value = document.getElementById('np-telp').value = '';
    await adminLoadPegawai();
    populatePickerSelect();
    showToast('✅ Berhasil', `${nama} ditambahkan`);
  } catch (e) { errEl.textContent = e.message; errEl.classList.add('show'); }
}

// ── SYNC ──
async function loadSyncDevices() {
  try {
    const res  = await fetch('/api/sync/devices', { headers: authHeaders() });
    const json = await res.json();
    if (!json.success) return;
    const sel = document.getElementById('sync-device');
    sel.innerHTML = '<option value="">— Semua Mesin —</option>' +
      json.data.map(id => `<option value="${escHtml(id)}">${escHtml(id)}</option>`).join('');
  } catch (_) {}
}

async function runBackfill() {
  const dari    = document.getElementById('sync-dari').value;
  const sampai  = document.getElementById('sync-sampai').value;
  const cloudId = document.getElementById('sync-device').value;
  const errEl   = document.getElementById('sync-err');
  const okEl    = document.getElementById('sync-ok');
  const btn     = document.getElementById('sync-btn');

  errEl.classList.remove('show'); okEl.classList.remove('show');
  if (!dari || !sampai) {
    errEl.textContent = 'Pilih rentang tanggal terlebih dahulu.';
    errEl.classList.add('show'); return;
  }
  if (dari > sampai) {
    errEl.textContent = 'Tanggal dari tidak boleh lebih besar dari sampai.';
    errEl.classList.add('show'); return;
  }

  btn.textContent = '⏳ Memproses...'; btn.disabled = true;
  try {
    const payload = { start_date: dari, end_date: sampai };
    if (cloudId) payload.cloud_id = cloudId;
    const res  = await fetch('/api/sync/backfill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ data: payload })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    const mesin = cloudId || 'semua mesin';
    okEl.textContent = `✅ Selesai (${mesin}) — ${json.inserted} data baru, ${json.duplicate} duplikat diabaikan (total dari API: ${json.total}).`;
    okEl.classList.add('show');
  } catch (e) {
    errEl.textContent = '❌ ' + e.message; errEl.classList.add('show');
  } finally {
    btn.textContent = '🔄 Sinkronisasi'; btn.disabled = false;
  }
}

// ── USER SETTINGS MODAL ──
function openUserSettingsModal() {
  if (!_authUser) return;
  document.getElementById('us-nama').textContent     = _authUser.name     || '—';
  document.getElementById('us-username').textContent = _authUser.username  || '—';
  document.getElementById('us-role').textContent     = _authUser.role      || '—';
  document.getElementById('us-pin').textContent      = _authUser.pegawai_pin || '(tidak terhubung ke karyawan)';
  document.getElementById('us-pw-baru').value   = '';
  document.getElementById('us-pw-konfirm').value = '';
  document.getElementById('us-pw-err').classList.remove('show');
  document.getElementById('us-pw-ok').classList.remove('show');
  switchStab('us-profil', document.querySelector('.stab-btn'));
  document.getElementById('modal-settings').classList.add('open');
}

function closeSettingsModal() {
  document.getElementById('modal-settings').classList.remove('open');
}

async function userChangePassword() {
  const pw      = document.getElementById('us-pw-baru').value;
  const confirm = document.getElementById('us-pw-konfirm').value;
  const errEl   = document.getElementById('us-pw-err');
  const okEl    = document.getElementById('us-pw-ok');
  errEl.classList.remove('show'); okEl.classList.remove('show');

  if (pw.length < 6) {
    errEl.textContent = 'Password minimal 6 karakter.'; errEl.classList.add('show'); return;
  }
  if (pw !== confirm) {
    errEl.textContent = 'Konfirmasi tidak cocok.'; errEl.classList.add('show'); return;
  }

  try {
    const res  = await fetch('/api/auth/change-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ password: pw, password_confirmation: confirm })
    });
    const json = await res.json();
    if (!json.success) { errEl.textContent = json.message; errEl.classList.add('show'); return; }
    okEl.textContent = 'Password berhasil diubah.'; okEl.classList.add('show');
    document.getElementById('us-pw-baru').value   = '';
    document.getElementById('us-pw-konfirm').value = '';
  } catch (e) {
    errEl.textContent = 'Gagal terhubung ke server.'; errEl.classList.add('show');
  }
}

// ── EVENT LISTENERS ──
document.getElementById('modal-settings').addEventListener('click', function(e) {
  if (e.target === this) closeSettingsModal();
});

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modal-admin').addEventListener('click', function(e) {
    if (e.target === this) closeAdminModal();
  });
});
