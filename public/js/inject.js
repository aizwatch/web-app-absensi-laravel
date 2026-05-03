// ── INJECT ROW MODAL ──
let _injPin = null, _injTanggal = null;

function openInjectModal(pin, tanggal, nama) {
  _injPin = pin; _injTanggal = tanggal;
  document.getElementById('inj-title').textContent = nama ? `— ${nama} (${tanggal})` : `— ${tanggal}`;
  document.getElementById('inj-alasan').value = 'lembur';
  document.getElementById('inj-jam-masuk').value = '';
  document.getElementById('inj-jam-pulang').value = '';
  document.getElementById('inj-keterangan').value = '';
  const sel = document.getElementById('inj-shift-id');
  sel.innerHTML = _appShifts.map(s => `<option value="${escHtml(s.id)}">${escHtml(s.nama)}</option>`).join('') || '<option value="">— Belum ada shift —</option>';
  toggleInjAlasan();
  document.getElementById('modal-inject-row').classList.add('open');
}

function closeInjectModal() {
  document.getElementById('modal-inject-row').classList.remove('open');
}

function toggleInjAlasan() {
  const alasan  = document.getElementById('inj-alasan').value;
  const isShift = alasan === 'ganti_shift';
  const isSakit = alasan === 'sakit';
  document.getElementById('inj-jam-wrap').style.display   = (isShift || isSakit) ? 'none' : 'grid';
  document.getElementById('inj-wrap-shift').style.display = isShift ? '' : 'none';
  const hints = {
    lembur:         'Inject scan pulang (masuk opsional). Catatan: Lembur.',
    customer_visit: 'Inject scan pulang (masuk opsional). Catatan: Customer Visit.',
    sakit:          'Hanya tambah keterangan Sakit (MC) ke scan_notes. Tidak inject scan.',
    ganti_shift:    'Tambah override ganti shift untuk hari ini. Jam pulang mengikuti shift dipilih.',
  };
  document.getElementById('inj-hint').textContent = hints[alasan] || '';
}

async function confirmInjectModal() {
  if (!_injPin || !_injTanggal) return;
  const alasan     = document.getElementById('inj-alasan').value;
  const jamMasuk   = document.getElementById('inj-jam-masuk').value;
  const jamPulang  = document.getElementById('inj-jam-pulang').value;
  const keterangan = document.getElementById('inj-keterangan').value.trim();
  const alasanLabel = { lembur:'Lembur', customer_visit:'Customer Visit', sakit:'Sakit (MC)', ganti_shift:'Ganti Shift' }[alasan] || alasan;
  const catatan = keterangan || alasanLabel;

  if (['lembur','customer_visit'].includes(alasan) && !jamPulang) { alert('Jam pulang wajib diisi'); return; }
  if (alasan === 'ganti_shift' && !document.getElementById('inj-shift-id').value) { alert('Pilih shift pengganti'); return; }

  const btn = document.getElementById('inj-confirm-btn');
  btn.disabled = true; btn.textContent = 'Menyimpan...';

  const postScan = (scanDate, cat) => fetch('/api/att_log/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _authToken },
    body: JSON.stringify({ data: { pin: String(_injPin), scan_date: scanDate, catatan: cat || null } })
  }).then(r => { if (!r.ok) throw new Error(); });

  try {
    const logEntry = {
      id: 'ov-inject-'+Date.now(), tanggal: _injTanggal, nama: catatan,
      tipe: 'absen_inject', alasan, berlaku_untuk: [String(_injPin)],
      created_by: _authUser?.name||_authUser?.username||'?',
      created_at: new Date().toISOString()
    };

    const fetchSettings = () => fetch('/api/settings', { headers: { 'Authorization': 'Bearer ' + _authToken } }).then(r => r.json()).then(j => j.data || {});
    const saveSettingsInject = (data) => fetch('/api/settings', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+_authToken},
      body: JSON.stringify({ data })
    }).then(r => { if (!r.ok) throw new Error('settings save failed'); });

    if (alasan === 'sakit') {
      const sData = await fetchSettings();
      const notes = sData.scan_notes || [];
      const idx   = notes.findIndex(n => String(n.pin) === String(_injPin) && n.tanggal === _injTanggal);
      if (idx >= 0) notes[idx].catatan = catatan; else notes.push({ pin: String(_injPin), tanggal: _injTanggal, catatan });
      _dailyOverrides.push({ ...logEntry, jam_masuk: null, jam_pulang: null });
      await saveSettingsInject({ ...sData, scan_notes: notes, daily_overrides: _dailyOverrides });
    } else if (alasan === 'ganti_shift') {
      const shiftId = document.getElementById('inj-shift-id').value;
      const shift   = _appShifts.find(s => s.id === shiftId);
      const sData   = await fetchSettings();
      const ovEntry = {
        id: 'ov-'+Date.now(), tanggal: _injTanggal, nama: catatan,
        tipe: 'ganti_shift', shift_id: shiftId,
        jam_pulang: shift?.jam_pulang||'17:00',
        berlaku_untuk: [String(_injPin)],
        created_by: logEntry.created_by, created_at: logEntry.created_at
      };
      _dailyOverrides.push(ovEntry);
      await saveSettingsInject({ ...sData, daily_overrides: _dailyOverrides });
    } else {
      if (jamMasuk) await postScan(_injTanggal + ' ' + jamMasuk + ':00', catatan);
      await postScan(_injTanggal + ' ' + jamPulang + ':00', jamMasuk ? null : catatan);
      _dailyOverrides.push({ ...logEntry, jam_masuk: jamMasuk||null, jam_pulang: jamPulang||null });
      const sData = await fetchSettings();
      await saveSettingsInject({ ...sData, daily_overrides: _dailyOverrides });
    }

    closeInjectModal();
    if (document.getElementById('tab-personal').classList.contains('active') && _selectedEmployee) {
      await loadPersonalAbsensi();
    } else if (typeof _lastFilterData !== 'undefined' && _lastFilterData.length) {
      await applyFilter();
    }
  } catch(e) {
    alert('Gagal menyimpan: ' + (e.message || 'cek koneksi/auth'));
  }
  btn.disabled = false; btn.textContent = '✓ Simpan';
}

function openRowHistory(pin, tanggal, nama) {
  document.getElementById('hist-title').textContent = nama ? `— ${nama} (${tanggal})` : `— ${tanggal}`;
  const entries = _dailyOverrides.filter(o => {
    if ((o.tanggal || '') !== tanggal) return false;
    if (o.berlaku_untuk === 'semua') return true;
    if (Array.isArray(o.berlaku_untuk)) return o.berlaku_untuk.includes(String(pin));
    return false;
  });
  const alasanIcons = { lembur:'🌙', sakit:'🏥', customer_visit:'🚗', setengah_hari_pagi:'🌅', setengah_hari_siang:'🌤️', ganti_shift:'🔄' };
  const body = document.getElementById('hist-body');
  if (!entries.length) {
    body.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:16px">Tidak ada riwayat untuk hari ini.</p>`;
  } else {
    body.innerHTML = entries.map(o => {
      const icon = o.tipe === 'absen_inject' ? (alasanIcons[o.alasan]||'📝') : o.tipe === 'ganti_shift' ? '🔄' : '⏰';
      const detail = o.tipe === 'absen_inject'
        ? `${o.nama}${o.jam_masuk?' ('+o.jam_masuk+'→'+o.jam_pulang+')':o.jam_pulang?' (→'+o.jam_pulang+')':''}`
        : o.tipe === 'ganti_shift'
          ? `${o.nama} — shift: ${_appShifts.find(s=>s.id===o.shift_id)?.nama||o.shift_id}`
          : `${o.nama} — pulang ${o.jam_pulang}`;
      const byAt = [o.created_by, o.created_at ? new Date(o.created_at).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : null].filter(Boolean).join(' · ');
      return `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px">
        <span style="font-size:18px">${icon}</span>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600">${escHtml(detail)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${escHtml(byAt || '—')}</div>
        </div>
        <button class="btn-icon del" title="Hapus" onclick="deleteOverride('${escHtml(o.id)}');openRowHistory('${escHtml(String(pin))}','${escHtml(tanggal)}','${escHtml(nama||'')}')">🗑️</button>
      </div>`;
    }).join('');
  }
  document.getElementById('modal-row-history').classList.add('open');
}

async function deleteOverride(id) {
  const entry = _dailyOverrides.find(o => o.id === id);
  if (!entry) return;

  if (entry.tipe === 'absen_inject') {
    const pins = Array.isArray(entry.berlaku_untuk) ? entry.berlaku_untuk : [entry.berlaku_untuk];
    const nama = entry.nama || 'entri ini';
    if (!confirm(`Hapus inject "${nama}" untuk ${pins.length} karyawan?\nScan di att_log dan catatan akan dihapus.`)) return;

    const delScan = (pin, jam) => fetch('/api/att_log/scan', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _authToken },
      body: JSON.stringify({ data: { sn: 'MANUAL', scan_date: entry.tanggal + ' ' + jam + ':00', pin: String(pin) } })
    });

    const delScanNote = async (pin) => {
      const sRes  = await fetch('/api/settings', { headers: { 'Authorization': 'Bearer ' + _authToken } });
      const sData = (await sRes.json()).data || {};
      sData.scan_notes = (sData.scan_notes || []).filter(n => !(String(n.pin) === String(pin) && n.tanggal === entry.tanggal));
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _authToken },
        body: JSON.stringify({ data: sData })
      });
    };

    for (const pin of pins) {
      if (entry.alasan === 'sakit') {
        await delScanNote(pin).catch(() => {});
      } else {
        if (entry.jam_masuk) await delScan(pin, entry.jam_masuk).catch(() => {});
        if (entry.jam_pulang) await delScan(pin, entry.jam_pulang).catch(() => {});
      }
    }
  } else {
    if (!confirm('Hapus override ini?')) return;
  }

  _dailyOverrides = _dailyOverrides.filter(o => o.id !== id);
  if (entry.tipe === 'absen_inject' || entry.tipe === 'ganti_shift') {
    fetch('/api/settings', { headers: { 'Authorization': 'Bearer ' + _authToken } })
      .then(r => r.json()).then(j => {
        const d = j.data || {};
        d.daily_overrides = _dailyOverrides;
        return fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _authToken },
          body: JSON.stringify({ data: d })
        });
      }).catch(() => {});
  }
  renderOverridesTable();
  if (document.getElementById('tab-personal')?.classList.contains('active') && _selectedEmployee) {
    loadPersonalAbsensi();
  }
}
