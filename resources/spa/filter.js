import { state } from './state.js';
import { escHtml, formatTanggal } from './utils.js';
import { getShiftForPin } from './settings.js';
import { timeCell } from './table.js';

export function switchFilterStab(tab) {
  ['rekap', 'bermasalah'].forEach(t => {
    document.getElementById(`fstab-${t}`).style.display = t === tab ? '' : 'none';
    const btn = document.getElementById(`fstab-btn-${t}`);
    if (btn) btn.classList.toggle('active', t === tab);
  });
}

export async function applyBermasalah() {
  const bulan = document.getElementById('fb-bulan').value;
  if (!bulan) { alert('Pilih bulan terlebih dahulu'); return; }
  const wrap = document.getElementById('bermasalah-wrap');
  const loading = document.createElement('div');
  loading.className = 'loading-overlay';
  loading.innerHTML = '<div class="spinner"></div>';
  wrap.appendChild(loading);
  try {
    const res = await fetch(`/api/absensi/bermasalah?bulan=${bulan}`, {
      headers: { Authorization: `Bearer ${state.authToken}` },
    });
    const { data } = await res.json();
    renderBermasalah(data || []);
    document.getElementById('bermasalah-badge').textContent = `${(data || []).length} karyawan`;
  } catch (e) {
    alert('Gagal mengambil data: ' + e.message);
  } finally {
    if (wrap.contains(loading)) wrap.removeChild(loading);
  }
}

export function renderBermasalah(data) {
  const tbody = document.getElementById('bermasalah-tbody');
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">✅</div><div class="empty-text">Tidak ada karyawan bermasalah di bulan ini</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML = data.map((row, i) => {
    const total = row.scan_tunggal.length + row.ist_tunggal.length;
    return `
      <tr class="bm-row" onclick="toggleBermasalahDetail(${i})" style="cursor:pointer">
        <td>${escHtml(row.nama || '—')}</td>
        <td style="font-size:12px;color:var(--text-muted)">${escHtml(row.shift_nama || '—')}</td>
        <td style="text-align:center">${row.scan_tunggal.length ? `<span class="badge-warn">${row.scan_tunggal.length}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td style="text-align:center">${row.ist_tunggal.length ? `<span class="badge-warn">${row.ist_tunggal.length}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td style="text-align:center"><strong>${total}</strong></td>
        <td style="text-align:center;font-size:11px;color:var(--accent)" id="bm-arrow-${i}">▼</td>
      </tr>
      <tr id="bm-detail-${i}" style="display:none">
        <td colspan="6" style="padding:0;background:var(--surface2)">
          <div style="padding:10px 16px">
            ${row.scan_tunggal.length ? `
              <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">1x Scan</div>
              <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
                ${row.scan_tunggal.map(d => {
                  const label = d.jenis === 'pulang_only' ? 'pulang' : d.jenis === 'ist_only' ? 'istirahat' : 'masuk';
                  return `<span class="chip-warn">${formatTanggal(d.tanggal)} <span style="color:var(--text-muted);font-size:11px">${d.jam} (${label})</span></span>`;
                }).join('')}
              </div>` : ''}
            ${row.ist_tunggal.length ? `
              <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">1x Scan Istirahat</div>
              <div style="display:flex;flex-wrap:wrap;gap:6px">
                ${row.ist_tunggal.map(d => {
                  const label = d.ist_keluar ? `keluar ${d.ist_keluar}` : `masuk ${d.ist_masuk}`;
                  return `<span class="chip-warn">${formatTanggal(d.tanggal)} <span style="color:var(--text-muted);font-size:11px">${label}</span></span>`;
                }).join('')}
              </div>` : ''}
          </div>
        </td>
      </tr>`;
  }).join('');
}

export function toggleBermasalahDetail(i) {
  const row = document.getElementById(`bm-detail-${i}`);
  const arrow = document.getElementById(`bm-arrow-${i}`);
  if (!row) return;
  const open = row.style.display === 'none';
  row.style.display = open ? '' : 'none';
  if (arrow) arrow.textContent = open ? '▲' : '▼';
}

export async function applyFilter() {
  const dari   = document.getElementById('f-dari').value;
  const sampai = document.getElementById('f-sampai').value;
  const nama   = (document.getElementById('f-nama').value||'').trim().toLowerCase();
  const wrap   = document.getElementById('filter-wrap');
  const loading= document.createElement('div');
  loading.className='loading-overlay';
  loading.innerHTML='<div class="spinner"></div>';
  wrap.appendChild(loading);
  try {
    const params=new URLSearchParams();
    if(dari)   params.append('tanggal_dari',dari);
    if(sampai) params.append('tanggal_sampai',sampai);
    const res=await fetch(`/api/absensi/filter?${params}`);
    const {data}=await res.json();
    let filtered=data||[];
    if(nama) filtered=filtered.filter(r=>(r.nama||'').toLowerCase().includes(nama));
    filtered.sort((a,b)=>{
      const pa=parseInt(a.pin)||0,pb=parseInt(b.pin)||0;
      return pa!==pb?pa-pb:a.tanggal.localeCompare(b.tanggal);
    });
    state.lastFilterData=filtered;
    renderFilterTable(filtered);
    document.getElementById('filter-badge').textContent=`${filtered.length} record`;
  } catch(e) {
    alert('Gagal mengambil data: '+e.message);
  } finally {
    if(wrap.contains(loading)) wrap.removeChild(loading);
  }
}

export function renderFilterTable(data) {
  const tbody=document.getElementById('filter-tbody');
  if(!data||!data.length){
    tbody.innerHTML=`<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-text">Tidak ada data</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML=data.map(row=>{
    const shift=getShiftForPin(row.pin);
    const durasi=row.durasi_istirahat!=null
      ?`<span class="td-durasi${row.durasi_istirahat===0?' zero':''}">${row.durasi_istirahat}</span>`
      :`<span class="td-durasi zero">—</span>`;
    const ist1Only=row.scan_istirahat1&&!row.scan_istirahat2;
    const ist2Only=!row.scan_istirahat1&&row.scan_istirahat2;
    const istInc=ist1Only||ist2Only;
    const ist1Cell=istInc?`<span class="cell-ist-incomplete">${row.scan_istirahat1||row.scan_istirahat2}</span>`:timeCell(row.scan_istirahat1,'ist',shift);
    const ist2Cell=istInc?`<span class="td-time empty">—</span>`:timeCell(row.scan_istirahat2,'ist',shift);
    const adminBtnsF=state.authUser?.role==='admin'
      ?`<span style="display:inline-flex;gap:3px;margin-left:4px">
           <button class="btn-icon" style="font-size:11px;padding:1px 4px" onclick="openInjectModal('${escHtml(String(row.pin))}','${escHtml(row.tanggal)}','${escHtml(row.nama||'')}')">⚙️</button>
           <button class="btn-icon" style="font-size:11px;padding:1px 4px" onclick="openRowHistory('${escHtml(String(row.pin))}','${escHtml(row.tanggal)}','${escHtml(row.nama||'')}')">📋</button>
         </span>`:'';
    return `<tr>
      <td style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted)">${escHtml(String(row.pin))}</td>
      <td class="td-tanggal">${formatTanggal(row.tanggal)}</td>
      <td><div class="td-name">${escHtml(row.nama||'—')}${adminBtnsF}</div></td>
      <td>${timeCell(row.scan_masuk,'masuk',shift)}</td>
      <td>${ist1Cell}</td><td>${ist2Cell}</td>
      <td>${timeCell(row.scan_pulang,'pulang',shift)}</td>
      <td>${durasi}</td>
    </tr>`;
  }).join('');
}

export function exportFilter() {
  if(!state.lastFilterData||!state.lastFilterData.length){alert('Tampilkan data dulu sebelum export.');return;}
  const header=['Name','Employee','Work Entry Type','From','Afternoon Out','Afternoon In','To'];
  const rows=[header,...state.lastFilterData.filter(r=>r.scan_masuk).map(r=>{
    const dt=(jam)=>jam?`${r.tanggal} ${jam}`:'';
    return [`Attendance: ${r.nama||r.pin}`,r.nama||String(r.pin),'Attendance',dt(r.scan_masuk),dt(r.scan_istirahat1),dt(r.scan_istirahat2),dt(r.scan_pulang)];
  })];
  const ws=XLSX.utils.aoa_to_sheet(rows);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Attendance');
  const dari=document.getElementById('f-dari').value||'dari';
  const sampai=document.getElementById('f-sampai').value||'sampai';
  XLSX.writeFile(wb,`Attendance_${dari}_${sampai}.xlsx`);
}

export function resetFilter() {
  const today=new Date().toISOString().slice(0,10);
  document.getElementById('f-dari').value=today;
  document.getElementById('f-sampai').value=today;
  document.getElementById('f-nama').value='';
  document.getElementById('filter-tbody').innerHTML=
    `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-text">Pilih filter lalu klik Tampilkan</div></div></td></tr>`;
  document.getElementById('filter-badge').textContent='0 record';
}
