import { state } from './state.js';
import { escHtml, showToast, switchAdminStab, renderAvatar } from './utils.js';
import { authHeaders } from './auth.js';
import { populatePickerSelect, initPicker } from './picker.js';
import { ensureSettingsLoaded, renderDepartmentsCard, isSettingsDirty } from './settings.js';
import { icon } from './icons.js';
import { idcardLayout, renderFront, initIdCardAdmin, uploadCutoutFile } from './idcard.js';

const ADMIN_SECTION_PANES = {
  scan: 'astab-attlog', pegawai: 'astab-pegawai', dept: 'astab-dept', rekap: 'astab-filter',
  sync: 'astab-sync', shift: 'pstab-shifts', penugasan: 'pstab-assign', libur: 'pstab-holidays',
  override: 'pstab-overrides', resetpw: 'pstab-resetpw', idcard: 'astab-idcard',
};
const SETTINGS_SECTIONS = ['shift', 'penugasan', 'libur', 'override', 'resetpw'];

export function showAdminSection(key, btn) {
  const paneId = ADMIN_SECTION_PANES[key];
  if (!paneId) return;
  switchAdminStab(paneId, btn);
  document.querySelectorAll('.admin-nav-item').forEach(el => el.setAttribute('aria-selected', el === btn ? 'true' : 'false'));
  if (key === 'sync') { loadSyncDevices(); populateSyncUserSelect(); }
  if (key === 'dept') renderDepartmentsCard();
  if (key === 'idcard') initIdCardAdmin();
  if (SETTINGS_SECTIONS.includes(key)) ensureSettingsLoaded();
}

export function openAdminModal() {
  adminInit();
  document.getElementById('modal-admin').classList.add('open');
}

export function closeAdminModal() {
  if (isSettingsDirty() && !confirm('Ada perubahan pengaturan yang belum disimpan. Tetap tutup? Perubahan tidak hilang sampai kamu buang, tapi belum tersimpan ke server.')) return;
  document.getElementById('modal-admin').classList.remove('open');
}

export function adminInit() {
  const opts=`<option value="">— Semua —</option>`+
    state.pegawaiList.map(p=>`<option value="${escHtml(String(p.pin))}">${escHtml(p.nama)} (${escHtml(String(p.pin))})</option>`).join('');
  document.getElementById('adm-filter-pin').innerHTML=opts;
  document.getElementById('resetpw-pin').innerHTML=
    `<option value="">— Pilih Karyawan —</option>`+
    state.pegawaiList.map(p=>`<option value="${escHtml(String(p.pin))}">${escHtml(p.nama)} (${escHtml(String(p.pin))})</option>`).join('');
  const today=new Date().toISOString().slice(0,10);
  document.getElementById('adm-dari').value=today;
  document.getElementById('adm-sampai').value=today;
  if(document.getElementById('f-dari')&&!document.getElementById('f-dari').value) document.getElementById('f-dari').value=today;
  if(document.getElementById('f-sampai')&&!document.getElementById('f-sampai').value) document.getElementById('f-sampai').value=today;
  adminLoadPegawai();
}

export async function adminLoadScans() {
  const dari=document.getElementById('adm-dari').value;
  const sampai=document.getElementById('adm-sampai').value;
  const pin=document.getElementById('adm-filter-pin').value;
  const wrap=document.getElementById('adm-raw-wrap');
  const loading=document.createElement('div');
  loading.className='loading-overlay'; loading.innerHTML='<div class="spinner"></div>';
  wrap.appendChild(loading);
  try{
    const params=new URLSearchParams({dari,sampai});
    if(pin) params.append('pin',pin);
    const res=await fetch(`/api/att_log/raw?${params}`,{headers:authHeaders()});
    const {data}=await res.json();
    renderRawScans(data||[]);
    document.getElementById('adm-raw-badge').textContent=`${(data||[]).length} record`;
  }catch(e){
    document.getElementById('adm-raw-tbody').innerHTML=`<tr><td colspan="5" style="color:var(--danger);padding:20px;text-align:center">${escHtml(e.message)}</td></tr>`;
  }finally{ if(wrap.contains(loading)) wrap.removeChild(loading); }
}

export function renderRawScans(data) {
  const tbody=document.getElementById('adm-raw-tbody');
  if(!data.length){tbody.innerHTML=`<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">${icon('clipboard-list')}</div><div class="empty-text">Tidak ada data</div></div></td></tr>`;return;}
  tbody.innerHTML=data.map((r,i)=>`
    <tr id="raw-row-${i}">
      <td>${escHtml(r.nama||'—')}</td>
      <td style="font-family:var(--font-mono);font-size:12px">${escHtml(String(r.pin))}</td>
      <td>
        <span id="raw-view-dt-${i}" style="font-family:var(--font-mono);font-size:13px">${escHtml(r.scan_date)}</span>
        <input id="raw-edit-dt-${i}" type="datetime-local" value="${r.scan_date.replace(' ','T').slice(0,16)}" style="display:none" />
      </td>
      <td style="white-space:nowrap">
        <span id="raw-view-btns-${i}"><button class="btn-icon" onclick="adminEditScanRow(${i})" title="Edit">${icon('pencil')}</button><button class="btn-icon" onclick="adminDeleteScan('${escHtml(r.sn)}','${escHtml(r.scan_date)}','${escHtml(String(r.pin))}')" title="Hapus">${icon('trash-2')}</button></span>
        <span id="raw-edit-btns-${i}" style="display:none">
          <button class="btn-icon" onclick="adminSaveScan(${i},'${escHtml(r.sn)}','${escHtml(r.scan_date)}','${escHtml(String(r.pin))}')" title="Simpan">${icon('check-circle')}</button>
          <button class="btn-icon" onclick="adminCancelScanRow(${i})" title="Batal">${icon('x-circle')}</button>
        </span>
      </td>
    </tr>`).join('');
  window._rawScanData=data;
}

export function adminEditScanRow(i) {
  document.getElementById(`raw-view-dt-${i}`).style.display='none';
  document.getElementById(`raw-edit-dt-${i}`).style.display='';
  document.getElementById(`raw-view-btns-${i}`).style.display='none';
  document.getElementById(`raw-edit-btns-${i}`).style.display='';
}

export function adminCancelScanRow(i) {
  document.getElementById(`raw-view-dt-${i}`).style.display='';
  document.getElementById(`raw-edit-dt-${i}`).style.display='none';
  document.getElementById(`raw-view-btns-${i}`).style.display='';
  document.getElementById(`raw-edit-btns-${i}`).style.display='none';
}

export async function adminSaveScan(i, sn, scan_date_lama, pin) {
  const newDt=document.getElementById(`raw-edit-dt-${i}`).value;
  if(!newDt) return;
  const scan_date_baru=newDt.replace('T',' ')+':00';
  try{
    const res=await fetch('/api/att_log/scan',{method:'PUT',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({data:{sn,scan_date_lama,pin,scan_date_baru}})});
    const json=await res.json();
    if(!json.success){alert(json.message);return;}
    showToast('Berhasil','Waktu scan diperbarui');
    adminLoadScans();
  }catch(e){alert(e.message);}
}

export async function adminDeleteScan(sn, scan_date, pin) {
  if (!confirm('Hapus scan ini?')) return;
  try {
    const res = await fetch('/api/att_log/scan', {method:'DELETE', headers:{'Content-Type':'application/json',...authHeaders()}, body:JSON.stringify({data:{sn, scan_date, pin}})});
    const json = await res.json();
    if (!json.success) { alert(json.message); return; }
    showToast('Dihapus', 'Scan berhasil dihapus');
    adminLoadScans();
  } catch(e) { alert(e.message); }
}

export async function adminLoadPegawai() {
  try{
    const res=await fetch('/api/pegawai',{headers:authHeaders()});
    const {data}=await res.json();
    state.pegawaiList=data||[];
    renderAdminPegawai();
    renderDepartmentsCard();
    document.getElementById('adm-peg-badge').textContent=`${state.pegawaiList.length} karyawan`;
  }catch(e){}
}

export function renderAdminPegawai() {
  const tbody=document.getElementById('adm-peg-tbody');
  if(!state.pegawaiList.length){tbody.innerHTML=`<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">${icon('users')}</div><div class="empty-text">Tidak ada karyawan</div></div></td></tr>`;return;}
  const deptOpts=state.departments.map(d=>`<option value="${escHtml(d)}">${escHtml(d)}</option>`).join('');
  tbody.innerHTML=state.pegawaiList.map((p,i)=>`
    <tr id="peg-row-${i}">
      <td style="font-family:var(--font-mono);font-size:12px">${escHtml(String(p.pin))}</td>
      <td><span id="pv-nama-${i}">${escHtml(p.nama)}</span><input id="pi-nama-${i}" type="text" value="${escHtml(p.nama)}" style="display:none;width:140px" /></td>
      <td><span id="pv-nip-${i}">${escHtml(p.nip||'—')}</span><input id="pi-nip-${i}" type="text" value="${escHtml(p.nip||'')}" style="display:none;width:110px" /></td>
      <td><span id="pv-telp-${i}">${escHtml(p.telp||'—')}</span><input id="pi-telp-${i}" type="text" value="${escHtml(p.telp||'')}" style="display:none;width:120px" /></td>
      <td>
        <span id="pv-dept-${i}">${escHtml(p.departemen||'—')}</span>
        <select id="pi-dept-${i}" style="display:none;font-size:12px;min-width:120px">
          <option value="">— Pilih —</option>
          ${deptOpts}
        </select>
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
          <button class="btn-icon" onclick="openProfilModal('${escHtml(String(p.pin))}')" title="${p.foto_low?'Resolusi rendah — ':''}Foto & Data Diri">${icon('user')}${p.foto_low?'<span style="color:#d97706">⚠</span>':''}</button>
          <button class="btn-icon" onclick="adminEditPegawaiRow(${i})" title="Edit">${icon('pencil')}</button>
          <button class="btn-icon del" onclick="adminDeletePegawai('${escHtml(String(p.pin))}','${escHtml(p.nama)}')" title="Hapus">${icon('trash-2')}</button>
        </span>
        <span id="peg-edit-btns-${i}" style="display:none">
          <button class="btn-icon" onclick="adminSavePegawai(${i},'${escHtml(String(p.pin))}')" title="Simpan">${icon('check-circle')}</button>
          <button class="btn-icon" onclick="adminCancelPegawaiRow(${i})" title="Batal">${icon('x-circle')}</button>
        </span>
      </td>
    </tr>`).join('');
}

export function adminEditPegawaiRow(i) {
  ['nama','nip','telp','dept','status'].forEach(f=>{document.getElementById(`pv-${f}-${i}`).style.display='none';document.getElementById(`pi-${f}-${i}`).style.display='';});
  const deptSel=document.getElementById(`pi-dept-${i}`);
  const p=state.pegawaiList[i];
  if(deptSel&&p) deptSel.value=p.departemen||'';
  document.getElementById(`peg-view-btns-${i}`).style.display='none';
  document.getElementById(`peg-edit-btns-${i}`).style.display='';
}

export function adminCancelPegawaiRow(i) {
  ['nama','nip','telp','dept','status'].forEach(f=>{document.getElementById(`pv-${f}-${i}`).style.display='';document.getElementById(`pi-${f}-${i}`).style.display='none';});
  document.getElementById(`peg-view-btns-${i}`).style.display='';
  document.getElementById(`peg-edit-btns-${i}`).style.display='none';
}

export async function adminSavePegawai(i, pin) {
  const nama=document.getElementById(`pi-nama-${i}`).value.trim();
  const nip=document.getElementById(`pi-nip-${i}`).value.trim();
  const telp=document.getElementById(`pi-telp-${i}`).value.trim();
  const dept=document.getElementById(`pi-dept-${i}`).value;
  const status=document.getElementById(`pi-status-${i}`).value;
  if(!nama){alert('Nama tidak boleh kosong');return;}
  try{
    const res=await fetch(`/api/pegawai/${encodeURIComponent(pin)}`,{method:'PUT',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({data:{pegawai_nama:nama,pegawai_nip:nip,pegawai_telp:telp,pegawai_departemen:dept||null,pegawai_status:parseInt(status)}})});
    const json=await res.json();
    if(!json.success){alert(json.message);return;}
    showToast('Berhasil',`${nama} diperbarui`);
    await adminLoadPegawai(); populatePickerSelect();
  }catch(e){alert(e.message);}
}

export async function adminDeletePegawai(pin, nama) {
  if(!confirm(`Hapus karyawan "${nama}" (PIN: ${pin})?\nData absensi tidak ikut terhapus.`)) return;
  try{
    const res=await fetch(`/api/pegawai/${encodeURIComponent(pin)}`,{method:'DELETE',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({})});
    const json=await res.json();
    if(!json.success){alert(json.message);return;}
    showToast('Dihapus',`${nama} dihapus`);
    await adminLoadPegawai(); populatePickerSelect();
  }catch(e){alert(e.message);}
}

export async function adminAddPegawai() {
  const pin=document.getElementById('np-pin').value.trim();
  const nama=document.getElementById('np-nama').value.trim();
  const nip=document.getElementById('np-nip').value.trim();
  const telp=document.getElementById('np-telp').value.trim();
  const dept=document.getElementById('np-dept').value;
  const errEl=document.getElementById('adm-peg-err');
  const okEl=document.getElementById('adm-peg-ok');
  errEl.classList.remove('show'); okEl.classList.remove('show');
  if(!pin||!nama){errEl.textContent='PIN dan Nama wajib diisi';errEl.classList.add('show');return;}
  try{
    const res=await fetch('/api/pegawai',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({data:{pegawai_pin:pin,pegawai_nama:nama,pegawai_nip:nip,pegawai_telp:telp,pegawai_departemen:dept||null}})});
    const json=await res.json();
    if(!json.success){errEl.textContent=json.message;errEl.classList.add('show');return;}
    okEl.textContent=`Karyawan "${nama}" berhasil ditambahkan`; okEl.classList.add('show');
    document.getElementById('np-pin').value=document.getElementById('np-nama').value=document.getElementById('np-nip').value=document.getElementById('np-telp').value=document.getElementById('np-dept').value='';
    await adminLoadPegawai(); populatePickerSelect();
    showToast('Berhasil',`${nama} ditambahkan`);
  }catch(e){errEl.textContent=e.message;errEl.classList.add('show');}
}

export async function loadSyncDevices() {
  try{
    const res=await fetch('/api/sync/devices',{headers:authHeaders()});
    const json=await res.json();
    if(!json.success) return;
    const opts=json.data.map(id=>`<option value="${escHtml(id)}">${escHtml(id)}</option>`).join('');
    const sel=document.getElementById('sync-device');
    sel.innerHTML='<option value="">— Semua Mesin —</option>'+opts;
  }catch(_){}
}


export async function runBackfill() {
  const dari=document.getElementById('sync-dari').value;
  const sampai=document.getElementById('sync-sampai').value;
  const cloudId=document.getElementById('sync-device').value;
  const errEl=document.getElementById('sync-err');
  const okEl=document.getElementById('sync-ok');
  const btn=document.getElementById('sync-btn');
  errEl.classList.remove('show'); okEl.classList.remove('show');
  if(!dari||!sampai){errEl.textContent='Pilih rentang tanggal terlebih dahulu.';errEl.classList.add('show');return;}
  if(dari>sampai){errEl.textContent='Tanggal dari tidak boleh lebih besar dari sampai.';errEl.classList.add('show');return;}
  btn.textContent='Memproses...'; btn.disabled=true;
  try{
    const payload={start_date:dari,end_date:sampai};
    if(cloudId) payload.cloud_id=cloudId;
    const res=await fetch('/api/sync/backfill',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({data:payload})});
    const json=await res.json();
    if(!json.success) throw new Error(json.message);
    const mesin=cloudId||'semua mesin';
    okEl.textContent=`Selesai (${mesin}) — ${json.inserted} data baru, ${json.duplicate} duplikat diabaikan (total: ${json.total}).`;
    okEl.classList.add('show');
  }catch(e){errEl.textContent=e.message;errEl.classList.add('show');}
  finally{btn.innerHTML=icon('refresh-cw') + ' Sinkronisasi';btn.disabled=false;}
}

export async function runSetTime() {
  const tz    = 'Asia/Jakarta';
  const errEl = document.getElementById('settime-err');
  const okEl  = document.getElementById('settime-ok');
  const btn   = document.getElementById('settime-btn');
  errEl.classList.remove('show'); okEl.classList.remove('show');
  if (!confirm(`Kirim perintah sync jam (${tz}) ke semua mesin?\n\nMesin selain REVO/VIDA/VEGA/VIVO series akan RESTART otomatis.`)) return;
  btn.textContent = 'Mengirim...'; btn.disabled = true;
  try {
    const res  = await fetch('/api/sync/set-time', {method:'POST', headers:{'Content-Type':'application/json',...authHeaders()}, body:JSON.stringify({timezone:tz})});
    const json = await res.json();
    if (!json.success && !json.results) throw new Error(json.message || 'Gagal');
    const results = json.results || [];
    const lines   = results.map(r => `${r.cloud_id}: ${r.success ? 'OK' : (r.message||'Gagal')}`).join(' | ');
    if (json.success) {
      okEl.textContent  = `Perintah terkirim — ${lines}`;
      okEl.classList.add('show');
    } else {
      errEl.textContent = `Sebagian gagal — ${lines}`;
      errEl.classList.add('show');
    }
  } catch(e) {
    errEl.textContent = e.message;
    errEl.classList.add('show');
  } finally {
    btn.innerHTML = icon('clock') + ' Sync Jam'; btn.disabled = false;
  }
}

export function populateSyncUserSelect() {
  const sel = document.getElementById('syncuser-pin');
  if (!sel) return;
  const opts = (state.pegawaiList || []).map(p => `<option value="${escHtml(String(p.pin))}">${escHtml(p.nama)} (${escHtml(String(p.pin))})</option>`).join('');
  sel.innerHTML = '<option value="">— Semua Karyawan —</option>' + opts;
}

export async function runSyncUserInfo() {
  const pin   = document.getElementById('syncuser-pin')?.value || '';
  const errEl = document.getElementById('syncuser-err');
  const okEl  = document.getElementById('syncuser-ok');
  const btn   = document.getElementById('syncuser-btn');
  errEl.classList.remove('show'); okEl.classList.remove('show');
  const label = pin
    ? (state.pegawaiList||[]).find(p=>String(p.pin)===pin)?.nama || pin
    : 'semua karyawan';
  if (!confirm(`Kirim data ke mesin untuk ${label}?\n\nProses ini mungkin membutuhkan beberapa detik.`)) return;
  btn.textContent = 'Mengirim...'; btn.disabled = true;
  try {
    const body = pin ? {pin} : {};
    const res  = await fetch('/api/sync/user-info', {method:'POST', headers:{'Content-Type':'application/json',...authHeaders()}, body:JSON.stringify(body)});
    const json = await res.json();
    if (!json.success && !json.results) throw new Error(json.message || 'Gagal');
    const results = json.results || [];
    const lines   = results.map(r => `${r.cloud_id}: ${r.sent} terkirim${r.failed ? `, ${r.failed} gagal` : ''}`).join(' | ');
    if (json.success) {
      okEl.textContent = `Selesai — ${json.total_karyawan} karyawan — ${lines}`;
      okEl.classList.add('show');
    } else {
      errEl.textContent = `Sebagian gagal — ${lines}`;
      errEl.classList.add('show');
    }
  } catch(e) {
    errEl.textContent = e.message;
    errEl.classList.add('show');
  } finally {
    btn.innerHTML = icon('user') + ' Sync'; btn.disabled = false;
  }
}

const $ = id => document.getElementById(id);
const showMsg = (id, msg) => { const el = $(id); el.textContent = msg; el.classList.add('show'); };
const hideMsgs = (...ids) => ids.forEach(id => $(id).classList.remove('show'));

// pin = karyawan yang diedit (diri sendiri atau, oleh admin, orang lain)
let _profilPin = null;
let _profilNama = '';
let _profilData = null;

// preview kartu depan di pane Profil (hanya bila admin sudah upload design)
function _renderProfilIdCard() {
  const L = idcardLayout(), d = _profilData;
  $('us-idcard').style.display = L.depan && d ? '' : 'none';
  if (!L.depan || !d) return;
  $('us-idcard-hint').textContent = d.foto ? '' : 'Belum ada foto.';
  renderFront($('us-idcard-canvas'), L, d);
}

export async function openUserSettingsModal() {
  if (!state.authUser) return;
  await openProfilModal(state.authUser.pegawai_pin);
}

export async function openProfilModal(pin) {
  const au = state.authUser;
  if (!au) return;
  const self = !pin || String(pin) === String(au.pegawai_pin);
  _profilPin = self ? au.pegawai_pin : String(pin);
  const emp = (state.pegawaiList || []).find(p => String(p.pin) === String(_profilPin));
  _profilNama = self ? (au.name || '') : (emp?.nama || '');

  $('acc-title').textContent = self ? 'Pengaturan Akun' : `Profil — ${_profilNama}`;
  $('us-nama').textContent     = _profilNama || '—';
  $('us-username').textContent = (self ? au.nip : emp?.nip) || '—';
  $('us-role').textContent     = self ? (au.role || '—') : 'karyawan';
  $('us-pin').textContent      = _profilPin || '(tidak terhubung ke karyawan)';
  ['us-pw-baru', 'us-pw-konfirm'].forEach(id => $(id).value = '');
  hideMsgs('us-pw-err', 'us-pw-ok', 'us-data-err', 'us-data-ok', 'us-foto-err');

  // akun tanpa pegawai_pin (admin murni) hanya punya Password; password cuma untuk diri sendiri
  const hasPin = !!_profilPin;
  $('acc-nav-profil').style.display = hasPin ? '' : 'none';
  $('acc-nav-data').style.display   = hasPin ? '' : 'none';
  $('acc-nav-sec').style.display    = self ? '' : 'none';
  _setFotoHint(false);
  _profilData = null;
  _renderProfilIdCard();
  _cropClose();
  showAccountSection(hasPin ? 'us-profil' : 'us-password');
  renderAvatar($('us-avatar'), _profilNama, emp?.foto);
  $('modal-settings').classList.add('open');

  if (!hasPin) return;
  try {
    const res = await fetch(`/api/pegawai/${encodeURIComponent(_profilPin)}/profil`, { headers: authHeaders() });
    const json = await res.json();
    if (!json.success) { showMsg('us-data-err', json.message || 'Gagal memuat data'); return; }
    const d = json.data;
    $('us-telp').value   = d.telp || '';
    $('us-tempat').value = d.tempat_lahir || '';
    $('us-tgl').value    = d.tgl_lahir || '';
    $('us-gender').value = String(d.gender || 1);
    renderAvatar($('us-avatar'), _profilNama, d.foto);
    _setFotoHint(!!d.foto, d.foto_low, d.foto_dim);
    _profilData = d;
    $('us-username').textContent = d.nip || '—';
    _renderProfilIdCard();
  } catch (e) { showMsg('us-data-err', 'Gagal terhubung ke server.'); }
}

export function showAccountSection(id, btn) {
  document.querySelectorAll('#modal-settings .acc-pane').forEach(p => p.classList.toggle('active', p.id === id));
  const navId = { 'us-profil': 'acc-nav-profil', 'us-data': 'acc-nav-data', 'us-password': 'acc-nav-pw' }[id];
  document.querySelectorAll('#modal-settings .acc-nav-btn').forEach(b => {
    const on = b === (btn || $(navId));
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}

export function closeSettingsModal() {
  $('modal-settings').classList.remove('open');
}

export async function saveProfil() {
  hideMsgs('us-data-err', 'us-data-ok');
  try {
    const res = await fetch(`/api/pegawai/${encodeURIComponent(_profilPin)}/profil`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders() },
      body: JSON.stringify({
        telp: $('us-telp').value.trim(), tempat_lahir: $('us-tempat').value.trim(),
        tgl_lahir: $('us-tgl').value || null, gender: $('us-gender').value,
      }),
    });
    const json = await res.json();
    if (!json.success) { showMsg('us-data-err', json.message || 'Gagal menyimpan'); return; }
    showMsg('us-data-ok', json.message || 'Tersimpan');
    if (_profilData) { _profilData.tgl_lahir = $('us-tgl').value || null; _renderProfilIdCard(); }
    adminLoadPegawai();
  } catch (e) { showMsg('us-data-err', 'Gagal terhubung ke server.'); }
}

// Editor crop 3:4: geser (drag) + zoom. Hasil maks 900×1200 (tanpa upscale), JPEG q0.92.
let _crop = null; // { img, url, zoom, cx, cy } — cx/cy = titik tengah crop dalam piksel gambar

function _cropSize() {
  const { img, zoom } = _crop;
  const w = Math.min(img.naturalWidth, img.naturalHeight * 3 / 4) / zoom;
  return { w, h: w * 4 / 3 };
}

function _cropDraw() {
  const { img } = _crop, { w, h } = _cropSize();
  // jaga crop tetap di dalam gambar
  _crop.cx = Math.min(Math.max(_crop.cx, w / 2), img.naturalWidth - w / 2);
  _crop.cy = Math.min(Math.max(_crop.cy, h / 2), img.naturalHeight - h / 2);
  const c = $('us-crop-canvas'), ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, _crop.cx - w / 2, _crop.cy - h / 2, w, h, 0, 0, c.width, c.height);
}

function _cropClose() {
  if (_crop) URL.revokeObjectURL(_crop.url);
  _crop = null;
  $('us-crop').style.display = 'none';
  $('us-foto-btn').disabled = false;
}

export function uploadFoto(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  hideMsgs('us-foto-err');
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => {
    if (_crop) URL.revokeObjectURL(_crop.url);
    _crop = { img, url, file, zoom: 1, cx: img.naturalWidth / 2, cy: 0 }; // cy=0 → mulai dari atas (kepala)
    $('us-crop-zoom').value = 1;
    $('us-crop').style.display = '';
    $('us-foto-btn').disabled = true;
    _cropDraw();
  };
  img.onerror = () => { URL.revokeObjectURL(url); showMsg('us-foto-err', 'File bukan gambar yang valid'); };
  img.src = url;
}

export function cropZoom(v) {
  if (!_crop) return;
  _crop.zoom = +v;
  _cropDraw();
}

export function cropCancel() { _cropClose(); }

// drag: pasang sekali di canvas
document.addEventListener('pointerdown', e => {
  if (e.target.id !== 'us-crop-canvas' || !_crop) return;
  const c = e.target, k = _cropSize().w / c.clientWidth;
  let x = e.clientX, y = e.clientY;
  c.setPointerCapture(e.pointerId);
  const move = ev => {
    _crop.cx -= (ev.clientX - x) * k; _crop.cy -= (ev.clientY - y) * k;
    x = ev.clientX; y = ev.clientY;
    _cropDraw();
  };
  const up = () => { c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); };
  c.addEventListener('pointermove', move);
  c.addEventListener('pointerup', up);
});

export async function cropSave() {
  if (!_crop) return;
  const { w, h } = _cropSize(), k = Math.min(1, 900 / w);
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); // PNG transparan → latar putih, bukan hitam
  ctx.drawImage(_crop.img, _crop.cx - w / 2, _crop.cy - h / 2, w, h, 0, 0, c.width, c.height);
  try {
    const blob = await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Gagal memproses gambar')), 'image/jpeg', 0.92));
    const fd = new FormData();
    fd.append('foto', blob, 'foto.jpg');
    const res = await fetch(`/api/pegawai/${encodeURIComponent(_profilPin)}/foto`, {
      method: 'POST', headers: { Accept: 'application/json', ...authHeaders() }, body: fd,
    });
    const json = await res.json();
    if (!json.success) { showMsg('us-foto-err', json.message || 'Gagal upload'); return; }
    // admin upload PNG transparan → file asli sekalian jadi cutout ID Card
    let cut = false;
    if (state.authUser?.role === 'admin' && _crop.file.type === 'image/png')
      cut = await uploadCutoutFile(_profilPin, _crop.file).then(() => true, () => false);
    _cropClose();
    await _refreshFoto();
    _setFotoHint(true, json.foto_low, json.foto_dim);
    showToast('Berhasil', cut ? 'Foto diperbarui + disimpan sebagai cutout ID Card' : 'Foto diperbarui');
  } catch (e) { showMsg('us-foto-err', e.message || 'Gagal upload'); }
}

function _setFotoHint(has, low, dim) {
  const el = $('us-foto-hint');
  el.classList.toggle('warn', !!(has && low));
  el.textContent = has && low
    ? `⚠ Resolusi rendah${dim ? ` (${dim.w}×${dim.h})` : ''}. Disarankan minimal 600×800 px.`
    : 'Foto portrait (rasio 3:4). Disarankan minimal 600×800 px.';
}

export function exportFotoZip() {
  window.location.href = `/api/pegawai/foto/zip?token=${encodeURIComponent(state.authToken)}`;
}

async function _refreshFoto() {
  await initPicker();
  if (document.getElementById('adm-peg-tbody')?.children.length) await adminLoadPegawai();
  const emp = state.pegawaiList.find(p => String(p.pin) === String(_profilPin));
  renderAvatar($('us-avatar'), _profilNama, emp?.foto);
  if (_profilData) { _profilData.foto = emp?.foto || null; _renderProfilIdCard(); }
  // header tab Saya, kalau yang diganti = karyawan yang sedang tampil
  if (state.selectedEmployee && String(state.selectedEmployee.pin) === String(_profilPin))
    renderAvatar($('p-avatar'), _profilNama, emp?.foto);
}

export async function deleteFoto() {
  if (!confirm('Hapus foto?')) return;
  hideMsgs('us-foto-err');
  try {
    const res = await fetch(`/api/pegawai/${encodeURIComponent(_profilPin)}/foto`, {
      method: 'DELETE', headers: { Accept: 'application/json', ...authHeaders() },
    });
    const json = await res.json();
    if (!json.success) { showMsg('us-foto-err', json.message || 'Gagal hapus'); return; }
    await _refreshFoto();
    _setFotoHint(false);
  } catch (e) { showMsg('us-foto-err', 'Gagal terhubung ke server.'); }
}

export async function userChangePassword() {
  const pw=document.getElementById('us-pw-baru').value;
  const confirm=document.getElementById('us-pw-konfirm').value;
  const errEl=document.getElementById('us-pw-err');
  const okEl=document.getElementById('us-pw-ok');
  errEl.classList.remove('show'); okEl.classList.remove('show');
  if(pw.length<6){errEl.textContent='Password minimal 6 karakter.';errEl.classList.add('show');return;}
  if(pw!==confirm){errEl.textContent='Konfirmasi tidak cocok.';errEl.classList.add('show');return;}
  try{
    const res=await fetch('/api/auth/change-password',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({password:pw,password_confirmation:confirm})});
    const json=await res.json();
    if(!json.success){errEl.textContent=json.message;errEl.classList.add('show');return;}
    okEl.textContent='Password berhasil diubah.'; okEl.classList.add('show');
    document.getElementById('us-pw-baru').value='';
    document.getElementById('us-pw-konfirm').value='';
  }catch(e){errEl.textContent='Gagal terhubung ke server.';errEl.classList.add('show');}
}
