import { state } from './state.js';
import { escHtml } from './utils.js';

export function openLaporanModal() {
  const errEl=document.getElementById('lap-err');
  errEl.classList.remove('show');
  if(!state.lastFilterData||!state.lastFilterData.length){
    errEl.textContent='Tampilkan data di Filter & Cari dulu sebelum cetak laporan.';
    errEl.classList.add('show');
    document.getElementById('modal-laporan').classList.add('open');
    return;
  }
  const dari=document.getElementById('f-dari').value;
  const sampai=document.getElementById('f-sampai').value;
  document.getElementById('lap-range-info').textContent=`Data: ${dari?dari+' s/d '+(sampai||dari):'sesuai filter aktif'} (${state.lastFilterData.length} record)`;
  const pins={};
  state.lastFilterData.forEach(r=>{pins[String(r.pin)]=r.nama;});
  const sel=document.getElementById('lap-pin');
  sel.innerHTML='<option value="">— Semua Karyawan —</option>'+
    Object.entries(pins).sort((a,b)=>a[1].localeCompare(b[1])).map(([pin,nama])=>
      `<option value="${escHtml(pin)}">${escHtml(nama)} (${escHtml(pin)})</option>`
    ).join('');
  document.getElementById('modal-laporan').classList.add('open');
}

export function closeLaporanModal() {
  document.getElementById('modal-laporan').classList.remove('open');
}

export function generateLaporan() {
  const pin=document.getElementById('lap-pin').value;
  const errEl=document.getElementById('lap-err');
  errEl.classList.remove('show');
  if(!state.lastFilterData||!state.lastFilterData.length){errEl.textContent='Tidak ada data.';errEl.classList.add('show');return;}
  let data=[...state.lastFilterData];
  if(pin) data=data.filter(r=>String(r.pin)===pin);
  if(!data.length){errEl.textContent='Tidak ada data untuk karyawan ini.';errEl.classList.add('show');return;}
  const dari=document.getElementById('f-dari').value;
  const bulan=dari?dari.slice(0,7):data[0].tanggal.slice(0,7);
  closeLaporanModal();
  printLaporanPdf(data,bulan,pin);
}

export function printLaporanPdf(data, bulan, filterPin) {
  const [yr,mo]=bulan.split('-');
  const bulanLabel=new Date(yr,mo-1,1).toLocaleDateString('id-ID',{month:'long',year:'numeric'});
  const daysInMonth=new Date(+yr,+mo,0).getDate();
  const allDays=Array.from({length:daysInMonth},(_,i)=>{const d=String(i+1).padStart(2,'0');return `${yr}-${mo}-${d}`;});
  const byPin={};
  data.forEach(r=>{const key=String(r.pin);if(!byPin[key])byPin[key]={nama:r.nama,pin:key,byDate:{}};byPin[key].byDate[r.tanggal]=r;});
  if(filterPin&&!byPin[filterPin]){const emp=(state.pegawaiList||[]).find(p=>String(p.pin)===filterPin);if(emp)byPin[filterPin]={nama:emp.nama,pin:filterPin,byDate:{}};}
  const pegawaiList=Object.values(byPin).sort((a,b)=>a.nama.localeCompare(b.nama)).map(p=>({...p,rows:allDays.map(tgl=>p.byDate[tgl]||{tanggal:tgl,pin:p.pin})}));
  const appShifts=state.appShifts||[];
  const empShifts=state.empShifts||{};
  function getShift(pin){const id=empShifts[String(pin)];return appShifts.find(s=>s.id===id)||appShifts[0]||{batas_terlambat:'08:06',batas_setengah_hari:'08:30',jam_pulang:'17:00',hari_kerja:[1,2,3,4,5,6]};}
  function t(val){return val?val.slice(0,5):'';}
  const holidays=(state.appHolidays||[]).map(h=>h.tanggal);

  function rowHtml(r,shift){
    const tglDate=new Date(r.tanggal+'T00:00:00');
    const dayOfWeek=tglDate.getDay();
    const isSunday=dayOfWeek===0;
    const isHoliday=holidays.includes(r.tanggal);
    const workDayNums=shift&&shift.hari_kerja&&shift.hari_kerja.length?shift.hari_kerja:[1,2,3,4,5,6];
    const isNonWorkDay=!workDayNums.includes(dayOfWeek);
    const tglFmt=tglDate.toLocaleDateString('id-ID',{day:'2-digit',month:'short'});
    const dayName=tglDate.toLocaleDateString('id-ID',{weekday:'short'});
    if(isSunday||isHoliday||isNonWorkDay){
      const label=isHoliday?((state.appHolidays||[]).find(h=>h.tanggal===r.tanggal)?.nama||'Libur'):isSunday?'Minggu':(shift&&shift.nama?shift.nama:'Libur');
      return `<tr style="background:#f0f0f0;color:#999"><td>${tglFmt} <span style="font-size:7.5px">${dayName}</span></td><td colspan="5" style="text-align:center;font-style:italic;font-size:8px">${label}</td><td></td></tr>`;
    }
    const absent=!r.scan_masuk;
    const batas=shift&&shift.batas_terlambat?(shift.batas_terlambat+':00'):null;
    const batasSetengah=((shift&&shift.batas_setengah_hari)||'08:30')+':00';
    const jamPulang=((shift&&shift.jam_pulang)||'17:00')+':00';
    const veryLate=r.scan_masuk&&r.scan_masuk>=batasSetengah;
    const terlambat=!veryLate&&r.scan_masuk&&batas&&r.scan_masuk>batas;
    const pulangCepat=r.scan_pulang&&r.scan_pulang<jamPulang;
    const istSelisih=r.durasi_istirahat!=null&&r.scan_masuk?r.durasi_istirahat-60:null;
    const istPenalty=istSelisih!=null&&istSelisih>=60?'merah':istSelisih!=null&&istSelisih>=30?'pink':istSelisih!=null&&istSelisih>=15?'kuning':null;
    let rowBg='',statusCell='';
    if(r.catatan){rowBg='#fff3cd';statusCell=`<span class="s-ket">${r.catatan}</span>`;}
    else if(absent){rowBg='#fde8ec';statusCell=`<span class="s-alpha">Tidak Hadir</span>`;}
    else if(veryLate||istPenalty==='merah'){rowBg='#fde8ec';statusCell=veryLate?`<span class="s-alpha">1/2 Hari</span>`:`<span class="s-alpha">Tidak Hadir</span>`;}
    else if(istPenalty==='pink'){rowBg='#ffd6e7';statusCell=`<span class="s-alpha">1/2 Hari</span>`;}
    else if(terlambat&&istPenalty==='kuning'){rowBg='#fff8e1';statusCell=`<span class="s-late">Terlambat + 1/4 Hari</span>`;}
    else if(istPenalty==='kuning'){rowBg='#fff8e1';statusCell=`<span class="s-late">1/4 Hari</span>`;}
    else if(terlambat){rowBg='#fff8e1';statusCell=`<span class="s-late">Terlambat</span>`;}
    else{statusCell=`<span class="s-hadir">Hadir</span>`;}
    const masukStyle=veryLate?'color:#c53030;font-weight:700':terlambat?'color:#b7791f;font-weight:700':(r.scan_masuk?'color:#276749;font-weight:700':'');
    const pulangStyle=pulangCepat?'color:#2b6cb0':(r.scan_pulang?'color:#276749':'');
    const ist1=r.scan_istirahat1&&!r.scan_istirahat2?`<span style="color:#e67e22">${t(r.scan_istirahat1)}</span>`:(t(r.scan_istirahat1)||'—');
    let durasiHtml='—';
    if(r.durasi_istirahat!=null){
      const selisihStr=istSelisih!=null?(istSelisih>=0?`+${istSelisih}`:`${istSelisih}`):null;
      const selisihColor=istPenalty==='merah'?'#c53030':istPenalty==='pink'?'#ad1457':istPenalty==='kuning'?'#b7791f':istSelisih!=null&&istSelisih<0?'#2b6cb0':'#555';
      durasiHtml=selisihStr!=null?`${r.durasi_istirahat} <span style="font-size:7.5px;color:${selisihColor};font-weight:700">${selisihStr}</span>`:`${r.durasi_istirahat}`;
    }
    return `<tr style="background:${rowBg}">
      <td>${tglFmt} <span style="font-size:7.5px;color:#888">${dayName}</span></td>
      <td style="text-align:center;${masukStyle}">${t(r.scan_masuk)||'—'}</td>
      <td style="text-align:center">${ist1}</td>
      <td style="text-align:center">${t(r.scan_istirahat2)||'—'}</td>
      <td style="text-align:center;${pulangStyle}">${t(r.scan_pulang)||'—'}</td>
      <td style="text-align:center">${durasiHtml}</td>
      <td>${statusCell}</td>
    </tr>`;
  }

  function cardHtml(p){
    const shift=getShift(p.pin);
    const rows=p.rows.map(r=>rowHtml(r,shift)).join('');
    const shiftWorkDays=shift&&shift.hari_kerja&&shift.hari_kerja.length?shift.hari_kerja:[1,2,3,4,5,6];
    const shiftBatasSetengah=((shift&&shift.batas_setengah_hari)||'08:30')+':00';
    const workDays=p.rows.filter(r=>{const d=new Date(r.tanggal+'T00:00:00');return shiftWorkDays.includes(d.getDay())&&!holidays.includes(r.tanggal);});
    const getIstPenalty=r=>{if(r.durasi_istirahat==null||!r.scan_masuk)return null;const s=r.durasi_istirahat-60;return s>=60?'merah':s>=30?'pink':s>=15?'kuning':null;};
    const alpha=workDays.filter(r=>!r.scan_masuk&&!r.catatan).length;
    const ket=workDays.filter(r=>r.catatan).length;
    const telatSekali=workDays.filter(r=>r.scan_masuk&&!r.catatan&&r.scan_masuk>=shiftBatasSetengah).length;
    const telat=workDays.filter(r=>{if(!r.scan_masuk||r.catatan||r.scan_masuk>=shiftBatasSetengah)return false;const batas=shift&&shift.batas_terlambat?(shift.batas_terlambat+':00'):null;return batas&&r.scan_masuk>batas;}).length;
    const istMerah=workDays.filter(r=>r.scan_masuk&&!r.catatan&&getIstPenalty(r)==='merah'&&r.scan_masuk<shiftBatasSetengah).length;
    const istPink=workDays.filter(r=>r.scan_masuk&&!r.catatan&&getIstPenalty(r)==='pink'&&r.scan_masuk<shiftBatasSetengah).length;
    const istKuning=workDays.filter(r=>r.scan_masuk&&!r.catatan&&getIstPenalty(r)==='kuning'&&r.scan_masuk<shiftBatasSetengah).length;
    const hadirDecimal=workDays.reduce((sum,r)=>{if(!r.scan_masuk||r.catatan||r.scan_masuk>=shiftBatasSetengah)return sum;const ip=getIstPenalty(r);if(ip==='merah'||ip==='pink')return sum;if(ip==='kuning')return sum+0.75;return sum+1;},0);
    const hadir=hadirDecimal%1===0?hadirDecimal:+hadirDecimal.toFixed(2);
    const hadirCount=workDays.filter(r=>r.scan_masuk&&!r.catatan).length;
    const totalIst=workDays.filter(r=>r.scan_masuk&&!r.catatan).reduce((sum,r)=>sum+(r.durasi_istirahat!=null?r.durasi_istirahat:0),0);
    const selisihIst=totalIst-(hadirCount*60);
    return `<div class="emp-card">
      <div class="emp-title">PT. LONG TIME — Laporan Absensi ${escHtml(bulanLabel)}</div>
      <div class="emp-header"><span class="emp-name">${escHtml(p.nama)}</span><span class="emp-pin">PIN: ${escHtml(p.pin)}</span><span class="emp-shift">${shift?escHtml(shift.nama||''):''}</span></div>
      <table class="rec-table"><thead><tr>
        <th style="width:44px">Tgl</th><th style="width:38px;text-align:center">Masuk</th>
        <th style="width:60px;text-align:center">Mulai Istirahat</th><th style="width:65px;text-align:center">Selesai Istirahat</th>
        <th style="width:38px;text-align:center">Pulang</th><th style="width:55px;text-align:center">Istirahat (menit)</th><th>Status</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <div class="summary">
        <span class="s-hadir">Hadir: <b>${hadir}</b></span>
        <span class="s-late">Terlambat: <b>${telat}</b></span>
        <span class="s-alpha">1/2 Hari: <b>${telatSekali}</b></span>
        <span class="s-alpha">Tidak Hadir: <b>${alpha}</b></span>
        <span class="s-ket">Keterangan: <b>${ket}</b></span>
        <span style="margin-left:auto;color:#333">Total Istirahat: ${selisihIst===0?`<b style="color:#276749">tepat</b>`:selisihIst>0?`<b style="color:#c53030">+${selisihIst}m</b>`:`<b style="color:#2b6cb0">${selisihIst}m</b>`} &nbsp;|&nbsp; Hari Kerja: <b>${workDays.length}</b> | Total: <b>${p.rows.length}</b> hari</span>
      </div>
      <div class="summary" style="margin-top:3px;border-top:1px dashed #ccc;padding-top:3px">
        <span style="color:#555;font-weight:600">Potongan Istirahat:</span>
        <span style="color:#b7791f">1/4 Hari: <b>${istKuning}</b></span>
        <span style="color:#ad1457">1/2 Hari: <b>${istPink}</b></span>
        <span style="color:#c53030">Tidak Hadir: <b>${istMerah}</b></span>
      </div>
    </div>`;
  }

  let pages='';
  for(let i=0;i<pegawaiList.length;i+=2){
    const a=pegawaiList[i],b=pegawaiList[i+1];
    pages+=`<div class="page"><div class="two-col">${cardHtml(a)}${b?cardHtml(b):'<div class="emp-card" style="visibility:hidden"></div>'}</div></div>`;
  }
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Laporan Absensi ${escHtml(bulanLabel)}</title>
<style>
  @page{size:A4 landscape;margin:8mm}*{box-sizing:border-box;font-family:Arial,sans-serif}
  body{margin:0;font-size:9px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{width:100%;page-break-after:always}.page:last-child{page-break-after:avoid}
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #333}
  .emp-card{padding:7px 8px;border-right:1px solid #aaa}.emp-card:last-child{border-right:none}
  .emp-title{text-align:center;font-size:9.5px;font-weight:700;letter-spacing:.3px;background:#1a365d;color:#fff;padding:4px 6px;margin:-7px -8px 6px}
  .emp-header{display:flex;align-items:center;gap:8px;border-bottom:2px solid #1a365d;padding-bottom:4px;margin-bottom:4px}
  .emp-name{font-weight:700;font-size:10px;flex:1}.emp-pin{color:#555;font-size:8.5px}.emp-shift{color:#2b6cb0;font-size:8.5px;margin-left:auto}
  .rec-table{width:100%;border-collapse:collapse;font-size:8.5px}
  .rec-table th{background:#2d3748;color:#fff;padding:3px 4px;text-align:left;font-weight:600}
  .rec-table td{padding:2px 4px;border-bottom:1px solid #e2e8f0;vertical-align:middle}
  .rec-table tr:nth-child(even) td{filter:brightness(0.97)}
  .summary{display:flex;gap:10px;align-items:center;margin-top:5px;padding-top:4px;border-top:2px solid #2d3748;font-size:8px;flex-wrap:wrap}
  .s-hadir{color:#276749;font-weight:700}.s-late{color:#b7791f;font-weight:700}.s-alpha{color:#c53030;font-weight:700}.s-ket{color:#744210;font-weight:700}
</style></head><body>${pages}</body></html>`;
  const win=window.open('','_blank','width=1280,height=900');
  win.document.write(html); win.document.close();
  win.onload=()=>{win.focus();win.print();};
}
