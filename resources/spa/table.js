import { state } from './state.js';
import { escHtml, fmtTime, formatTanggal, showToast, setStatus, HARI } from './utils.js';
import { getShiftForPin } from './settings.js';

export const POLL_INTERVAL = 5000;

export async function pollAbsensi() {
  try {
    const res  = await fetch('/api/absensi/hari-ini');
    const json = await res.json();
    if (!json.success) throw new Error();
    const { data, total } = json;
    renderTable('live-tbody', data, true);
    updateStats(data);
    updateLastUpdate(new Date().toISOString());
    document.getElementById('badge-total').textContent = `${total} karyawan`;
    if (total > state.prevTotal && state.prevTotal > 0) {
      const latest = data.find(r => r.scan_masuk);
      if (latest) showToast('✅ Update Absensi', `${latest.nama||'PIN '+latest.pin}`);
    }
    state.prevTotal = total;
    if (!state.pollOnline) { state.pollOnline = true; setStatus(true); }
  } catch (_) {
    if (state.pollOnline) { state.pollOnline = false; setStatus(false); }
  }
}

export function timeCell(val, type, shift) {
  if (!val) return `<span class="td-time empty">—</span>`;
  if (type==='masuk') {
    const batas        = shift&&shift.batas_terlambat ? shift.batas_terlambat+':00' : null;
    const batasSetengah = shift&&shift.batas_setengah_hari ? shift.batas_setengah_hari+':00' : '08:30:00';
    if (val>=batasSetengah) return `<span class="cell-very-late">${fmtTime(val)}</span>`;
    if (batas&&val>batas)   return `<span class="cell-late">${fmtTime(val)}</span>`;
    return `<span class="td-time cell-ok">${fmtTime(val)}</span>`;
  }
  if (type==='pulang') {
    const pulang = ((shift&&shift.jam_pulang)||'17:00')+':00';
    return val<pulang
      ? `<span class="cell-early">${fmtTime(val)}</span>`
      : `<span class="td-time cell-ok">${fmtTime(val)}</span>`;
  }
  return `<span class="td-time">${fmtTime(val)}</span>`;
}

export function renderTable(tbodyId, data, isLive) {
  const tbody = document.getElementById(tbodyId);
  if (!data||!data.length) {
    tbody.innerHTML=`<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">Belum ada data absensi</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML=data.map((row,i)=>{
    const shift    = getShiftForPin(row.pin);
    const absent   = !row.scan_masuk&&!row.scan_pulang;
    const rowClass = absent?'row-absent':(i===0&&isLive&&state.prevTotal>0?'new-entry':'');
    const durasi   = row.durasi_istirahat;
    const durasiCell=durasi!=null?`<span class="td-durasi${durasi===0?' zero':''}">${durasi}</span>`:`<span class="td-durasi zero">—</span>`;
    const ist1Only=row.scan_istirahat1&&!row.scan_istirahat2;
    const ist2Only=!row.scan_istirahat1&&row.scan_istirahat2;
    const istIncomplete=ist1Only||ist2Only;
    const ist1Cell=istIncomplete?`<span class="cell-ist-incomplete">${row.scan_istirahat1||row.scan_istirahat2}</span>`:timeCell(row.scan_istirahat1,'ist',shift);
    const ist2Cell=istIncomplete?`<span class="td-time empty">—</span>`:timeCell(row.scan_istirahat2,'ist',shift);
    return `<tr class="${rowClass}">
      <td class="td-tanggal">${formatTanggal(row.tanggal)}</td>
      <td><div class="td-name">${escHtml(row.nama||'—')}</div></td>
      <td>${timeCell(row.scan_masuk,'masuk',shift)}</td>
      <td>${ist1Cell}</td><td>${ist2Cell}</td>
      <td>${timeCell(row.scan_pulang,'pulang',shift)}</td>
      <td>${durasiCell}</td>
    </tr>`;
  }).join('');
}

export function updateStats(data) {
  const total=state.pegawaiList.length||data.length;
  const sudahMasuk=data.filter(r=>r.scan_masuk).length;
  const sudahPulang=data.filter(r=>r.scan_pulang).length;
  const terlambat=data.filter(r=>{
    if(!r.scan_masuk) return false;
    const shift=getShiftForPin(r.pin);
    const batas=shift&&shift.batas_terlambat?shift.batas_terlambat+':00':null;
    return batas?r.scan_masuk>batas:false;
  }).length;
  const durasiList=data.filter(r=>r.durasi_istirahat!=null&&r.durasi_istirahat>0).map(r=>r.durasi_istirahat);
  const avgIst=durasiList.length?Math.round(durasiList.reduce((a,b)=>a+b,0)/durasiList.length):null;
  document.getElementById('stat-total').textContent  =total;
  document.getElementById('stat-in').textContent     =sudahMasuk;
  document.getElementById('stat-out').textContent    =sudahPulang;
  document.getElementById('stat-late').textContent   =terlambat;
  document.getElementById('stat-avg-ist').textContent=avgIst!=null?avgIst+' mnt':'—';
}

export function updateLastUpdate(ts) {
  document.getElementById('last-update').textContent='Update: '+new Date(ts).toLocaleTimeString('id-ID');
}

export async function loadPersonalAbsensi() {
  if (!state.selectedEmployee) return;
  const wrap=document.getElementById('personal-wrap');
  const loading=document.createElement('div');
  loading.className='loading-overlay';
  loading.innerHTML='<div class="spinner"></div>';
  wrap.appendChild(loading);
  const [year,month]=state.currentMonth.split('-').map(Number);
  const label=new Date(year,month-1,1).toLocaleDateString('id-ID',{month:'long',year:'numeric'});
  document.getElementById('p-month-label').textContent=label;
  document.getElementById('p-table-month').textContent=label.toUpperCase();
  try {
    const res=await fetch(`/api/absensi/karyawan/${encodeURIComponent(state.selectedEmployee.pin)}?bulan=${state.currentMonth}`);
    const {data}=await res.json();
    renderPersonalTable(data||[]);
  } catch(e) {
    document.getElementById('personal-tbody').innerHTML=
      `<tr><td colspan="8" style="text-align:center;color:var(--danger);padding:20px">Gagal memuat data: ${escHtml(e.message)}</td></tr>`;
  } finally {
    if(wrap.contains(loading)) wrap.removeChild(loading);
  }
}

export function changeMonth(delta) {
  let [y,m]=state.currentMonth.split('-').map(Number);
  m+=delta;
  if(m>12){m=1;y++;} if(m<1){m=12;y--;}
  state.currentMonth=`${y}-${String(m).padStart(2,'0')}`;
  loadPersonalAbsensi();
}

export function renderPersonalTable(data) {
  const tbody=document.getElementById('personal-tbody');
  const [year,month]=state.currentMonth.split('-').map(Number);
  const daysInMonth=new Date(year,month,0).getDate();
  const map={};
  for(const r of data) map[r.tanggal]=r;
  const shift=state.selectedEmployee?getShiftForPin(state.selectedEmployee.pin):null;
  const todayStr=new Date().toLocaleDateString('sv-SE');
  let totalKerja=0,hadir=0,telat=0,pulangAwal=0,alpha=0;
  const rows=[];
  for(let d=1;d<=daysInMonth;d++){
    const dateStr=`${state.currentMonth}-${String(d).padStart(2,'0')}`;
    const dayOfWeek=new Date(dateStr+'T00:00:00').getDay();
    const hariKerja=shift?(shift.hari_kerja||[1,2,3,4,5,6]):[1,2,3,4,5,6];
    const isWeekend=!hariKerja.includes(dayOfWeek);
    const holiday=state.appHolidays.find(h=>h.tanggal===dateStr)||null;
    const isHoliday=!!holiday;
    const isFuture=dateStr>todayStr;
    const row=map[dateStr];
    if(!isWeekend&&!isHoliday&&!isFuture){
      totalKerja++;
      if(row&&row.scan_masuk){
        hadir++;
        const batas=shift&&shift.batas_terlambat?shift.batas_terlambat+':00':null;
        if(batas&&row.scan_masuk>batas) telat++;
        if(row.scan_pulang){
          const jamPulang=((shift&&shift.jam_pulang)||'17:00')+':00';
          if(row.scan_pulang<jamPulang) pulangAwal++;
        }
      } else if(row&&row.catatan) { /* keterangan — skip alpha */ }
      else { alpha++; }
    }
    const ist1Only=row&&row.scan_istirahat1&&!row.scan_istirahat2;
    const istIncomplete=ist1Only||(row&&!row.scan_istirahat1&&row.scan_istirahat2);
    const ist1Cell=!row?`<span class="td-time empty">—</span>`
      :istIncomplete?`<span class="cell-ist-incomplete">${row.scan_istirahat1||row.scan_istirahat2}</span>`
      :timeCell(row?row.scan_istirahat1:null,'ist',shift);
    const ist2Cell=!row||istIncomplete?`<span class="td-time empty">—</span>`:timeCell(row?row.scan_istirahat2:null,'ist',shift);
    const durasi=row&&row.durasi_istirahat!=null
      ?`<span class="td-durasi${row.durasi_istirahat===0?' zero':''}">${row.durasi_istirahat}</span>`
      :`<span class="td-durasi zero">—</span>`;
    let statusHtml;
    if(isWeekend) statusHtml=`<span class="td-status status-libur">Libur</span>`;
    else if(isHoliday) statusHtml=`<span class="td-status status-libur" title="${escHtml(holiday.nama)}">🗓️ ${escHtml(holiday.nama)}</span>`;
    else if(isFuture) statusHtml=`<span class="td-status status-future">—</span>`;
    else if(row&&row.catatan) statusHtml=`<span class="td-status status-catatan" title="${escHtml(row.catatan)}">📝 ${escHtml(row.catatan)}</span>`;
    else if(row&&row.override){const ovLabel=escHtml(row.override.nama||(row.override.tipe==='pulang_awal'?'Pulang Awal':'Ganti Shift'));statusHtml=`<span class="td-status status-override" title="${ovLabel}">✏️ ${ovLabel}</span>`;}
    else if(row&&row.scan_masuk) statusHtml=`<span class="td-status status-hadir">Hadir</span>`;
    else statusHtml=`<span class="td-status status-alpha">Tidak Hadir</span>`;
    const _injRowPin=row?String(row.pin):(state.selectedEmployee?String(state.selectedEmployee.pin):null);
    const _injRowNama=row?(row.nama||''):(state.selectedEmployee?(state.selectedEmployee.nama||''):'');
    const adminBtns=(!isWeekend&&!isHoliday&&!isFuture&&state.authUser?.role==='admin'&&_injRowPin)
      ?`<span style="display:inline-flex;gap:3px;margin-left:4px">
           <button class="btn-icon" style="font-size:11px;padding:1px 4px" onclick="openInjectModal('${escHtml(_injRowPin)}','${dateStr}','${escHtml(_injRowNama)}')">⚙️</button>
           <button class="btn-icon" style="font-size:11px;padding:1px 4px" onclick="openRowHistory('${escHtml(_injRowPin)}','${dateStr}','${escHtml(_injRowNama)}')">📋</button>
         </span>`:'';
    rows.push(`<tr class="${(isWeekend||isHoliday||isFuture)?'td-weekend':''}">
      <td class="td-tanggal">${formatTanggal(dateStr)}</td>
      <td style="font-size:12px;color:var(--text-muted)">${HARI[dayOfWeek]}</td>
      <td>${timeCell(row?row.scan_masuk:null,'masuk',shift)}</td>
      <td>${ist1Cell}</td><td>${ist2Cell}</td>
      <td>${timeCell(row?row.scan_pulang:null,'pulang',shift)}</td>
      <td>${durasi}</td>
      <td>${statusHtml}${adminBtns}</td>
    </tr>`);
  }
  tbody.innerHTML=rows.join('');
  document.getElementById('p-badge').textContent=`${daysInMonth} hari`;
  document.getElementById('ps-total').textContent=totalKerja;
  document.getElementById('ps-hadir').textContent=hadir;
  document.getElementById('ps-telat').textContent=telat;
  document.getElementById('ps-awal').textContent=pulangAwal;
  document.getElementById('ps-alpha').textContent=alpha;
}
