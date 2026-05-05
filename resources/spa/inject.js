import { state } from './state.js';
import { escHtml } from './utils.js';
import { renderOverridesTable } from './settings.js';
import { loadPersonalAbsensi } from './table.js';
import { applyFilter } from './filter.js';

export function openInjectModal(pin, tanggal, nama) {
  state.injPin=pin; state.injTanggal=tanggal;
  document.getElementById('inj-title').textContent=nama?`— ${nama} (${tanggal})`:`— ${tanggal}`;
  document.getElementById('inj-alasan').value='lembur';
  document.getElementById('inj-jam-masuk').value='';
  document.getElementById('inj-jam-pulang').value='';
  document.getElementById('inj-jam-lainnya').value='';
  document.getElementById('inj-keterangan').value='';
  const sel=document.getElementById('inj-shift-id');
  sel.innerHTML=state.appShifts.map(s=>`<option value="${escHtml(s.id)}">${escHtml(s.nama)}</option>`).join('')||'<option value="">— Belum ada shift —</option>';
  toggleInjAlasan();
  document.getElementById('modal-inject-row').classList.add('open');
}

export function closeInjectModal() {
  document.getElementById('modal-inject-row').classList.remove('open');
}

export function toggleInjAlasan() {
  const alasan=document.getElementById('inj-alasan').value;
  const isShift=alasan==='ganti_shift';
  const isSakit=alasan==='sakit';
  const isLainnya=alasan==='lainnya';
  document.getElementById('inj-jam-wrap').style.display=(isShift||isSakit||isLainnya)?'none':'grid';
  document.getElementById('inj-wrap-shift').style.display=isShift?'':'none';
  document.getElementById('inj-wrap-lainnya').style.display=isLainnya?'':'none';
  const hints={lembur:'Inject scan pulang (masuk opsional). Catatan: Lembur.',customer_visit:'Inject scan pulang (masuk opsional). Catatan: Customer Visit.',sakit:'Hanya tambah keterangan Sakit (MC) ke scan_notes. Tidak inject scan.',ganti_shift:'Tambah override ganti shift. Jam pulang mengikuti shift dipilih.',lainnya:'Inject 1 scan pada jam yang ditentukan. Keterangan wajib diisi.'};
  document.getElementById('inj-hint').textContent=hints[alasan]||'';
}

export async function confirmInjectModal() {
  if(!state.injPin||!state.injTanggal) return;
  const alasan=document.getElementById('inj-alasan').value;
  const jamMasuk=document.getElementById('inj-jam-masuk').value;
  const jamPulang=document.getElementById('inj-jam-pulang').value;
  const keterangan=document.getElementById('inj-keterangan').value.trim();
  const jamLainnya=document.getElementById('inj-jam-lainnya').value;
  const alasanLabel={lembur:'Lembur',customer_visit:'Customer Visit',sakit:'Sakit (MC)',ganti_shift:'Ganti Shift',lainnya:'Lainnya'}[alasan]||alasan;
  const catatan=keterangan||alasanLabel;
  if(['lembur','customer_visit'].includes(alasan)&&!jamPulang){alert('Jam pulang wajib diisi');return;}
  if(alasan==='ganti_shift'&&!document.getElementById('inj-shift-id').value){alert('Pilih shift pengganti');return;}
  if(alasan==='lainnya'&&!jamLainnya){alert('Jam wajib diisi');return;}
  if(alasan==='lainnya'&&!keterangan){alert('Keterangan wajib diisi untuk alasan Lainnya');return;}

  const btn=document.getElementById('inj-confirm-btn');
  btn.disabled=true; btn.textContent='Menyimpan...';

  const postScan=(scanDate,cat)=>fetch('/api/att_log/scan',{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+state.authToken},
    body:JSON.stringify({data:{pin:String(state.injPin),scan_date:scanDate,catatan:cat||null}})
  }).then(r=>{if(!r.ok)throw new Error();});

  try {
    const logEntry={id:'ov-inject-'+Date.now(),tanggal:state.injTanggal,nama:catatan,tipe:'absen_inject',alasan,berlaku_untuk:[String(state.injPin)],created_by:state.authUser?.name||state.authUser?.username||'?',created_at:new Date().toISOString()};
    const fetchSettings=()=>fetch('/api/settings',{headers:{'Authorization':'Bearer '+state.authToken}}).then(r=>r.json()).then(j=>j.data||{});
    const saveSettingsInject=(data)=>fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+state.authToken},body:JSON.stringify({data})}).then(r=>{if(!r.ok)throw new Error('settings save failed');});

    if(alasan==='sakit'){
      const sData=await fetchSettings();
      const notes=sData.scan_notes||[];
      const idx=notes.findIndex(n=>String(n.pin)===String(state.injPin)&&n.tanggal===state.injTanggal);
      if(idx>=0) notes[idx].catatan=catatan; else notes.push({pin:String(state.injPin),tanggal:state.injTanggal,catatan});
      state.dailyOverrides.push({...logEntry,jam_masuk:null,jam_pulang:null});
      await saveSettingsInject({...sData,scan_notes:notes,daily_overrides:state.dailyOverrides});
    } else if(alasan==='ganti_shift'){
      const shiftId=document.getElementById('inj-shift-id').value;
      const shift=state.appShifts.find(s=>s.id===shiftId);
      const sData=await fetchSettings();
      const ovEntry={id:'ov-'+Date.now(),tanggal:state.injTanggal,nama:catatan,tipe:'ganti_shift',shift_id:shiftId,jam_pulang:shift?.jam_pulang||'17:00',berlaku_untuk:[String(state.injPin)],created_by:logEntry.created_by,created_at:logEntry.created_at};
      state.dailyOverrides.push(ovEntry);
      await saveSettingsInject({...sData,daily_overrides:state.dailyOverrides});
    } else if(alasan==='lainnya'){
      await postScan(state.injTanggal+' '+jamLainnya+':00',catatan);
      state.dailyOverrides.push({...logEntry,jam_masuk:jamLainnya,jam_pulang:null});
      const sData=await fetchSettings();
      await saveSettingsInject({...sData,daily_overrides:state.dailyOverrides});
    } else {
      if(jamMasuk) await postScan(state.injTanggal+' '+jamMasuk+':00',catatan);
      await postScan(state.injTanggal+' '+jamPulang+':00',jamMasuk?null:catatan);
      state.dailyOverrides.push({...logEntry,jam_masuk:jamMasuk||null,jam_pulang:jamPulang||null});
      const sData=await fetchSettings();
      await saveSettingsInject({...sData,daily_overrides:state.dailyOverrides});
    }
    closeInjectModal();
    if(document.getElementById('tab-personal').classList.contains('active')&&state.selectedEmployee)
      await loadPersonalAbsensi();
    else if(state.lastFilterData.length)
      await applyFilter();
  } catch(e){ alert('Gagal menyimpan: '+(e.message||'cek koneksi/auth')); }
  btn.disabled=false; btn.textContent='✓ Simpan';
}

export async function openRowHistory(pin, tanggal, nama) {
  document.getElementById('hist-title').textContent=nama?`— ${nama} (${tanggal})`:`— ${tanggal}`;
  const body=document.getElementById('hist-body');
  body.innerHTML=`<p style="color:var(--text-muted);text-align:center;padding:16px">Memuat…</p>`;
  document.getElementById('modal-row-history').classList.add('open');

  // fetch scan_notes fresh dari server
  let scanNoteEntry=null;
  try{
    const sRes=await fetch('/api/settings',{headers:{'Authorization':'Bearer '+state.authToken}});
    const sData=(await sRes.json()).data||{};
    const notes=sData.scan_notes||[];
    scanNoteEntry=notes.find(n=>String(n.pin)===String(pin)&&n.tanggal===tanggal)||null;
  }catch(_){}

  const ovEntries=state.dailyOverrides.filter(o=>{
    if((o.tanggal||'')!==tanggal) return false;
    if(o.berlaku_untuk==='semua') return true;
    if(Array.isArray(o.berlaku_untuk)) return o.berlaku_untuk.includes(String(pin));
    return false;
  });

  const alasanIcons={lembur:'🌙',sakit:'🏥',customer_visit:'🚗',setengah_hari_pagi:'🌅',setengah_hari_siang:'🌤️',ganti_shift:'🔄',lainnya:'📝'};
  const rows=[];

  // scan_note entry (orphan — tidak ada di daily_overrides)
  const ovHasScanNote=ovEntries.some(o=>o.tipe==='absen_inject'&&o.alasan==='sakit');
  if(scanNoteEntry&&!ovHasScanNote){
    rows.push(`<div style="display:flex;align-items:flex-start;gap:10px;padding:10px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px">
      <span style="font-size:18px">📝</span>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600">Catatan: ${escHtml(scanNoteEntry.catatan)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">scan_notes (tanpa audit trail)</div>
      </div>
      <button class="btn-icon del" title="Hapus catatan" onclick="deleteScanNote('${escHtml(String(pin))}','${escHtml(tanggal)}','${escHtml(nama||'')}')">🗑️</button>
    </div>`);
  }

  ovEntries.forEach(o=>{
    const icon=o.tipe==='absen_inject'?(alasanIcons[o.alasan]||'📝'):o.tipe==='ganti_shift'?'🔄':'⏰';
    const detail=o.tipe==='absen_inject'
      ?`${o.nama}${o.jam_masuk?' ('+o.jam_masuk+'→'+(o.jam_pulang||'')+')':(o.jam_pulang?' (→'+o.jam_pulang+')':'')}`
      :o.tipe==='ganti_shift'
        ?`${o.nama} — shift: ${state.appShifts.find(s=>s.id===o.shift_id)?.nama||o.shift_id}`
        :`${o.nama} — pulang ${o.jam_pulang}`;
    const byAt=[o.created_by,o.created_at?new Date(o.created_at).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):null].filter(Boolean).join(' · ');
    rows.push(`<div style="display:flex;align-items:flex-start;gap:10px;padding:10px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px">
      <span style="font-size:18px">${icon}</span>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600">${escHtml(detail)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${escHtml(byAt||'—')}</div>
      </div>
      <button class="btn-icon del" title="Hapus" onclick="deleteOverride('${escHtml(o.id)}');openRowHistory('${escHtml(String(pin))}','${escHtml(tanggal)}','${escHtml(nama||'')}')">🗑️</button>
    </div>`);
  });

  body.innerHTML=rows.length
    ?rows.join('')
    :`<p style="color:var(--text-muted);text-align:center;padding:16px">Tidak ada riwayat untuk hari ini.</p>`;
}

export async function deleteScanNote(pin, tanggal, nama) {
  if(!confirm(`Hapus catatan untuk ${nama||pin} pada ${tanggal}?`)) return;
  try{
    const sRes=await fetch('/api/settings',{headers:{'Authorization':'Bearer '+state.authToken}});
    const sData=(await sRes.json()).data||{};
    sData.scan_notes=(sData.scan_notes||[]).filter(n=>!(String(n.pin)===String(pin)&&n.tanggal===tanggal));
    await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+state.authToken},body:JSON.stringify({data:sData})});
    await openRowHistory(pin,tanggal,nama);
    if(document.getElementById('tab-personal')?.classList.contains('active')&&state.selectedEmployee) loadPersonalAbsensi();
    else if(state.lastFilterData.length) applyFilter();
  }catch(e){alert('Gagal hapus: '+(e.message||'cek koneksi'));}
}

export async function deleteOverride(id) {
  const entry=state.dailyOverrides.find(o=>o.id===id);
  if(!entry) return;
  if(entry.tipe==='absen_inject'){
    const pins=Array.isArray(entry.berlaku_untuk)?entry.berlaku_untuk:[entry.berlaku_untuk];
    if(!confirm(`Hapus inject "${entry.nama||'entri ini'}" untuk ${pins.length} karyawan?\nScan di att_log dan catatan akan dihapus.`)) return;
    const delScan=(pin,jam)=>fetch('/api/att_log/scan',{method:'DELETE',headers:{'Content-Type':'application/json','Authorization':'Bearer '+state.authToken},body:JSON.stringify({data:{sn:'MANUAL',scan_date:entry.tanggal+' '+jam+':00',pin:String(pin)}})});
    const delScanNote=async(pin)=>{
      const sRes=await fetch('/api/settings',{headers:{'Authorization':'Bearer '+state.authToken}});
      const sData=(await sRes.json()).data||{};
      sData.scan_notes=(sData.scan_notes||[]).filter(n=>!(String(n.pin)===String(pin)&&n.tanggal===entry.tanggal));
      await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+state.authToken},body:JSON.stringify({data:sData})});
    };
    for(const pin of pins){
      if(entry.alasan==='sakit') await delScanNote(pin).catch(()=>{});
      else{
        if(entry.jam_masuk) await delScan(pin,entry.jam_masuk).catch(()=>{});
        if(entry.jam_pulang) await delScan(pin,entry.jam_pulang).catch(()=>{});
      }
    }
  } else {
    if(!confirm('Hapus override ini?')) return;
  }
  state.dailyOverrides=state.dailyOverrides.filter(o=>o.id!==id);
  if(entry.tipe==='absen_inject'||entry.tipe==='ganti_shift'){
    fetch('/api/settings',{headers:{'Authorization':'Bearer '+state.authToken}})
      .then(r=>r.json()).then(j=>{const d=j.data||{};d.daily_overrides=state.dailyOverrides;return fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+state.authToken},body:JSON.stringify({data:d})});}).catch(()=>{});
  }
  renderOverridesTable();
  if(document.getElementById('tab-personal')?.classList.contains('active')&&state.selectedEmployee) loadPersonalAbsensi();
}
