import { state } from './state.js';
import { escHtml, showToast } from './utils.js';
import { authHeaders } from './auth.js';

const PRESET_LABEL = {'setengah_pagi_preset':'Setengah Hari (masuk pagi)','setengah_siang_preset':'Setengah Hari (masuk siang)'};

function parseCatatan(tipe, catatan) {
  if (!catatan) return {note:'', jam2:''};
  if (tipe==='ganti_shift') {
    const [rawId, ...rest] = catatan.split('||');
    return {note: (PRESET_LABEL[rawId]||rawId) + (rest.length ? ' — '+rest.join('||') : ''), jam2:''};
  }
  if (tipe==='customer_visit'||tipe==='lupa') {
    const m = catatan.match(/\|\|jam2=(\d{2}:\d{2})/);
    const jam2 = m ? m[1] : '';
    const note = catatan.replace(/\|\|jam2=\d{2}:\d{2}/, '').trim();
    return {note, jam2};
  }
  return {note: catatan, jam2:''};
}

const AM_TIPE_HINTS = {
  lembur:         'Inject scan pulang ke rekap setelah disetujui. Catatan: Lembur.',
  customer_visit: 'Inject scan pulang ke rekap setelah disetujui. Catatan: Customer Visit.',
  lupa:           'Inject scan lupa absen (maks. 3x disetujui). Isi 1 atau 2 scan.',
  sakit:          'Hanya tambah keterangan Sakit (MC) ke rekap. Tidak perlu isi jam.',
  ganti_shift:    'Override shift untuk hari ini setelah disetujui. Tidak perlu isi jam.',
};

export function toggleAmFields() {
  const tipe      = document.getElementById('am-tipe').value;
  const hint      = document.getElementById('am-tipe-hint');
  const jamWrap   = document.getElementById('am-jam-wrap');
  const jam2Wrap  = document.getElementById('am-jam2-wrap');
  const jamLabel  = document.getElementById('am-jam-label');
  const shiftWrap = document.getElementById('am-shift-wrap');
  const noJam     = tipe==='sakit'||tipe==='ganti_shift';
  const isCV      = tipe==='customer_visit'||tipe==='lupa';
  if (hint) hint.textContent = AM_TIPE_HINTS[tipe]||'';
  jamWrap.style.display   = noJam ? 'none' : 'grid';
  jam2Wrap.style.display  = isCV ? '' : 'none';
  shiftWrap.style.display = tipe==='ganti_shift' ? '' : 'none';
  if (jamLabel) jamLabel.innerHTML = isCV
    ? 'Scan 1 <span style="color:#e53e3e">*</span>'
    : 'Jam <span style="color:#e53e3e">*</span>';
  if (noJam) { document.getElementById('am-jam').value=''; }
  if (!isCV) { document.getElementById('am-jam2').value=''; }
  // shift options are static presets — no dynamic population needed
}

export function previewAttachment() {
  const file = document.getElementById('am-attachment').files[0];
  const wrap  = document.getElementById('am-attachment-preview');
  const img   = document.getElementById('am-preview-img');
  const lbl   = document.getElementById('am-preview-label');
  if (!file) { wrap.style.display='none'; return; }
  lbl.textContent = file.name+' ('+(file.size/1024).toFixed(0)+' KB)';
  if (file.type.startsWith('image/')) { img.src=URL.createObjectURL(file); img.style.display=''; }
  else { img.style.display='none'; }
  wrap.style.display = '';
}

export function initAbsensiMandiri() {
  const today = new Date().toISOString().slice(0,10);
  if (!document.getElementById('am-tanggal').value)
    document.getElementById('am-tanggal').value = today;
  const isAdmin = state.authUser?.role==='admin';
  document.getElementById('am-admin-panel').style.display = isAdmin ? '' : 'none';
  loadMyRequests();
  if (isAdmin) loadAdminRequests();
}

export function submitAbsensiMandiri() {
  const errEl    = document.getElementById('am-err');
  const okEl     = document.getElementById('am-ok');
  errEl.classList.remove('show'); okEl.classList.remove('show');
  const tanggal  = document.getElementById('am-tanggal').value;
  const jam      = document.getElementById('am-jam').value;
  const tipe     = document.getElementById('am-tipe').value;
  const fileEl   = document.getElementById('am-attachment');
  const noJam    = tipe==='sakit'||tipe==='ganti_shift';
  if (!tanggal) { errEl.textContent='Tanggal wajib diisi.'; errEl.classList.add('show'); return; }
  if (!noJam&&!jam) { errEl.textContent='Jam wajib diisi.'; errEl.classList.add('show'); return; }
  if (tipe==='ganti_shift'&&!document.getElementById('am-shift-id').value) { errEl.textContent='Pilih shift pengganti.'; errEl.classList.add('show'); return; }
  if (fileEl.files[0]&&fileEl.files[0].size>5*1024*1024) { errEl.textContent='File maksimal 5MB.'; errEl.classList.add('show'); return; }
  document.getElementById('am-confirm-pw').value = '';
  document.getElementById('am-confirm-err').classList.remove('show');
  document.getElementById('modal-am-confirm').classList.add('open');
  setTimeout(()=>document.getElementById('am-confirm-pw').focus(), 100);
}

export function closeAmConfirm() {
  document.getElementById('modal-am-confirm').classList.remove('open');
}

export async function submitAmConfirmed() {
  const pw       = document.getElementById('am-confirm-pw').value;
  const ceEl     = document.getElementById('am-confirm-err');
  const kirimBtn = document.querySelector('#modal-am-confirm .btn-primary');
  ceEl.classList.remove('show');
  if (!pw) { ceEl.textContent='Password wajib diisi.'; ceEl.classList.add('show'); return; }
  kirimBtn.textContent='⏳ Memproses...'; kirimBtn.disabled=true;
  const tanggal  = document.getElementById('am-tanggal').value;
  const jam      = document.getElementById('am-jam').value;
  const tipe     = document.getElementById('am-tipe').value;
  const catatan  = document.getElementById('am-catatan').value.trim();
  const shiftId  = document.getElementById('am-shift-id')?.value||'';
  const fileEl   = document.getElementById('am-attachment');
  const formData = new FormData();
  formData.append('tanggal', tanggal);
  if (jam) formData.append('jam', jam);
  formData.append('tipe', tipe);
  formData.append('password', pw);
  const jam2 = document.getElementById('am-jam2')?.value||'';
  // ganti_shift: shiftId||catatan_user (backend parse shiftId dari bagian pertama)
  // customer_visit: catatan||jam2=HH:MM jika ada scan kedua
  if (tipe==='ganti_shift') formData.append('catatan', catatan ? shiftId+'||'+catatan : shiftId);
  else if (tipe==='customer_visit'||tipe==='lupa') { const cv=catatan+(jam2?'||jam2='+jam2:''); if(cv) formData.append('catatan',cv); }
  else if (catatan) formData.append('catatan', catatan);
  if (fileEl.files[0]) formData.append('attachment', fileEl.files[0]);
  try {
    const res  = await fetch('/api/absensi-mandiri', { method:'POST', headers:{...authHeaders()}, body:formData });
    const json = await res.json();
    if (!json.success) { ceEl.textContent=json.message||'Terjadi kesalahan.'; ceEl.classList.add('show'); return; }
    closeAmConfirm();
    const okEl = document.getElementById('am-ok');
    okEl.textContent='✅ '+json.message; okEl.classList.add('show');
    document.getElementById('am-catatan').value='';
    fileEl.value='';
    document.getElementById('am-attachment-preview').style.display='none';
    showToast('📤 Terkirim','Permintaan dikirim ke admin');
    await loadMyRequests();
    if (state.authUser?.role==='admin') await loadAdminRequests();
  } catch(e) { ceEl.textContent='Gagal terhubung ke server.'; ceEl.classList.add('show'); }
  finally { kirimBtn.textContent='Kirim'; kirimBtn.disabled=false; }
}

export async function loadMyRequests() {
  const el = document.getElementById('am-my-list');
  if (!el) return;
  try {
    const res  = await fetch('/api/absensi-mandiri/mine', { headers:authHeaders() });
    const json = await res.json();
    const data = json.data||[];
    if (!data.length) { el.innerHTML='<div style="color:var(--text-muted);padding:12px 0">Belum ada permintaan.</div>'; return; }
    el.innerHTML = data.map(r=>`
      <div style="border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px;background:var(--surface2)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div>
            <span style="font-weight:600;color:var(--text)">${escHtml(r.tipe_label)}</span>
            <span style="margin-left:8px;font-size:12px;color:var(--text-muted)">${escHtml(r.tanggal)}${r.jam?' '+escHtml(r.jam.slice(0,5)):''}</span>
          </div>
          <span class="td-status ${r.status==='approved'?'status-hadir':r.status==='rejected'?'status-alpha':'status-terlambat'}" style="font-size:11px;white-space:nowrap">
            ${r.status==='approved'?'✅ Disetujui':r.status==='rejected'?'❌ Ditolak':'⏳ Menunggu'}
          </span>
        </div>
        ${(()=>{const {note,jam2}=parseCatatan(r.tipe,r.catatan);const parts=[note,jam2?'Scan 2: '+jam2:''].filter(Boolean);return parts.length?`<div style="font-size:12px;color:var(--text-muted);margin-top:4px">${escHtml(parts.join(' · '))}</div>`:'';})()}
        ${r.review_catatan?`<div style="font-size:12px;color:var(--accent);margin-top:4px">Admin: ${escHtml(r.review_catatan)}</div>`:''}
        ${r.attachment_url?`<a href="${r.attachment_url+(r.attachment_url.includes('?')?'&':'?')+'token='+encodeURIComponent(state.authToken||'')}" target="_blank" style="font-size:12px;color:var(--accent);display:inline-block;margin-top:4px">📎 Lihat Lampiran</a>`:''}
      </div>`).join('');
  } catch(e) { el.innerHTML='<div style="color:var(--danger)">Gagal memuat.</div>'; }
}

export async function loadAdminRequests() {
  const el     = document.getElementById('am-admin-list');
  const status = document.getElementById('am-admin-filter').value;
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text-muted);font-size:13px">Memuat...</div>';
  try {
    const res  = await fetch(`/api/absensi-mandiri?status=${status}`, { headers:authHeaders() });
    const json = await res.json();
    const data = json.data||[];
    if (!data.length) { el.innerHTML='<div style="color:var(--text-muted);font-size:13px;padding:12px 0">Tidak ada data.</div>'; return; }
    el.innerHTML = `<div style="overflow-x:auto"><table class="settings-table" style="table-layout:fixed;width:100%"><thead><tr>
      <th style="width:13%">Karyawan</th><th style="width:10%">Tanggal</th><th style="width:6%;text-align:center">Jam</th><th style="width:9%">Tipe</th><th style="width:18%">Catatan</th><th style="width:7%;text-align:center">Lampiran</th><th style="width:9%;text-align:center">Status</th><th style="width:28%;text-align:center">Aksi Admin</th>
    </tr></thead><tbody>`+data.map(r=>`
      <tr>
        <td>${escHtml(r.nama||r.pegawai_pin)}</td>
        <td>${escHtml(r.tanggal)}</td>
        <td style="text-align:center">${r.jam?escHtml(r.jam.slice(0,5)):'—'}</td>
        <td><span style="white-space:nowrap">${escHtml(r.tipe_label)}</span></td>
        <td style="font-size:12px;word-break:break-word">${(()=>{const {note,jam2}=parseCatatan(r.tipe,r.catatan);const parts=[note,jam2?'Scan 2: '+jam2:''].filter(Boolean);return parts.length?escHtml(parts.join(' · ')):'—';})()}${r.review_catatan?`<div style="color:var(--accent);margin-top:2px">💬 ${escHtml(r.review_catatan)}</div>`:''}</td>
        <td style="text-align:center">${r.attachment_url?`<a href="${r.attachment_url+(r.attachment_url.includes('?')?'&':'?')+'token='+encodeURIComponent(state.authToken||'')}" target="_blank" style="font-size:12px;color:var(--accent)">📎 Lihat</a>`:'—'}</td>
        <td style="text-align:center"><span class="td-status ${r.status==='approved'?'status-hadir':r.status==='rejected'?'status-alpha':'status-terlambat'}" style="font-size:11px">
          ${r.status==='approved'?'✅ Disetujui':r.status==='rejected'?'❌ Ditolak':'⏳ Menunggu'}
        </span></td>
        <td style="text-align:center">${r.status==='pending'?`
          <div style="display:flex;flex-direction:column;gap:6px">
            <input type="text" id="am-note-${r.id}" placeholder="Catatan admin (opsional)" style="font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);outline:none;width:100%;box-sizing:border-box;text-align:left" />
            <div style="display:flex;gap:6px">
              <button class="btn btn-primary" style="font-size:11px;padding:4px 10px;flex:1" onclick="adminActionMandiri(${r.id},'approve')">✅ Setuju</button>
              <button class="btn" style="font-size:11px;padding:4px 10px;flex:1;background:var(--danger);color:#fff;border:none;border-radius:8px;cursor:pointer" onclick="adminActionMandiri(${r.id},'reject')">❌ Tolak</button>
            </div>
          </div>`:r.status==='approved'?`
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
            <span style="font-size:11px;color:var(--text-muted)">${r.reviewed_by?(()=>{const p=state.pegawaiList.find(p=>String(p.pin)===String(r.reviewed_by));return 'oleh '+escHtml(p?p.nama:r.reviewed_by);})():''}</span>
            <button class="btn btn-ghost" style="font-size:11px;padding:3px 10px" onclick="revokeAndEditMandiri(${r.id})">✏️ Edit</button>
          </div>`:`<span style="font-size:11px;color:var(--text-muted)">${r.reviewed_by?(()=>{const p=state.pegawaiList.find(p=>String(p.pin)===String(r.reviewed_by));return 'oleh '+escHtml(p?p.nama:r.reviewed_by);})():''}</span>`}
        </td>
      </tr>`).join('')+'</tbody></table></div>';
  } catch(e) { el.innerHTML='<div style="color:var(--danger);font-size:13px">Gagal memuat.</div>'; }
}

export async function adminActionMandiri(id, action) {
  const catatan = document.getElementById(`am-note-${id}`)?.value.trim()||'';
  try {
    const res  = await fetch(`/api/absensi-mandiri/${id}/${action}`, {
      method:'POST', headers:{'Content-Type':'application/json',...authHeaders()},
      body:JSON.stringify({catatan})
    });
    const json = await res.json();
    if (!json.success) { alert(json.message); return; }
    showToast(action==='approve'?'✅ Disetujui':'❌ Ditolak', json.message);
    await loadAdminRequests();
    await loadMyRequests();
  } catch(e) { alert(e.message); }
}

export async function revokeAndEditMandiri(id) {
  if (!confirm('Batalkan persetujuan ini dan kembalikan ke pending agar bisa disetujui ulang?')) return;
  try {
    const res  = await fetch(`/api/absensi-mandiri/${id}/revoke`, {
      method:'POST', headers:{'Content-Type':'application/json',...authHeaders()}
    });
    const json = await res.json();
    if (!json.success) { alert(json.message); return; }
    showToast('✏️ Dibatalkan', json.message);
    await loadAdminRequests();
    await loadMyRequests();
  } catch(e) { alert(e.message); }
}
