import { state } from './state.js';
import { escHtml } from './utils.js';

let _pollInterval = null;
let _clockInterval = null;

export function openDashboardModal() {
  if (state.authUser?.role !== 'admin') return;
  document.getElementById('modal-dashboard').classList.add('open');
  document.body.style.overflow = 'hidden';
  _startClock();
  switchDashTab('harian');
}

export function closeDashboardModal() {
  document.getElementById('modal-dashboard').classList.remove('open');
  document.body.style.overflow = '';
  _stopPoll();
  _stopClock();
}

export function switchDashTab(tab) {
  document.querySelectorAll('.dash-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.dash-pane').forEach(p => p.classList.toggle('active', p.id === 'dash-pane-' + tab));
  _stopPoll();
  if (tab === 'harian') {
    _loadHarian();
    _pollInterval = setInterval(_loadHarian, 5000);
  } else if (tab === 'bulanan') {
    _initBulanan();
  } else if (tab === 'tahunan') {
    _initTahunan();
  }
}

// ── CLOCK ──────────────────────────────────────────────────────────────────
function _startClock() {
  _updateClock();
  _clockInterval = setInterval(_updateClock, 1000);
}
function _stopClock() { clearInterval(_clockInterval); }
function _stopPoll()  { clearInterval(_pollInterval); _pollInterval = null; }

function _updateClock() {
  const now = new Date();
  const t = document.getElementById('dash-clock-time');
  const d = document.getElementById('dash-clock-date');
  if (t) t.textContent = now.toLocaleTimeString('id-ID');
  if (d) d.textContent = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ── HELPERS ─────────────────────────────────────────────────────────────────
function _getShift(pin) {
  const appShifts = state.appShifts || [];
  const empShifts = state.empShifts || {};
  const id = empShifts[String(pin)];
  return appShifts.find(s => s.id === id) || appShifts[0] || {
    batas_terlambat: '08:06', batas_setengah_hari: '08:30',
    jam_pulang: '17:00', hari_kerja: [1, 2, 3, 4, 5, 6],
  };
}

function _avatarColor(name) {
  const colors = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#14b8a6','#06b6d4','#3b82f6','#84cc16','#f97316','#a855f7'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

function _authHeaders() {
  return state.authToken ? { Authorization: 'Bearer ' + state.authToken } : {};
}

function _populateEmpDropdown(id) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Semua Karyawan —</option>' +
    (state.pegawaiList || []).sort((a, b) => a.nama.localeCompare(b.nama))
      .map(p => `<option value="${escHtml(String(p.pin))}">${escHtml(p.nama)}</option>`).join('');
  if (cur) sel.value = cur;
}

// ── DONUT CHART ─────────────────────────────────────────────────────────────
function _renderDonut(hadirTotal, terlambat, alpha, total, pctHadir) {
  const svg = document.getElementById('dash-donut-svg');
  if (!svg) return;
  const r = 60, cx = 75, cy = 75, C = 2 * Math.PI * r;
  const hadirBersih = Math.max(0, hadirTotal - terlambat);
  const segments = [];
  if (total > 0) {
    if (hadirBersih > 0)  segments.push({ val: hadirBersih, color: '#10b981' });
    if (terlambat > 0)    segments.push({ val: terlambat,   color: '#f59e0b' });
    if (alpha > 0)        segments.push({ val: alpha,        color: '#ef4444' });
  }
  let paths = '', cumFrac = 0;
  segments.forEach(s => {
    const frac = s.val / total;
    const dash = frac * C, gap = C - dash;
    const offset = C * (0.25 - cumFrac);
    paths += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="14"
      stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"/>`;
    cumFrac += frac;
  });
  svg.innerHTML = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1e293b" stroke-width="14"/>${paths}
    <text x="${cx}" y="${cy-8}" text-anchor="middle" fill="#f1f5f9" font-size="22" font-weight="700" font-family="IBM Plex Sans,sans-serif">${pctHadir}%</text>
    <text x="${cx}" y="${cy+10}" text-anchor="middle" fill="#64748b" font-size="10" font-family="IBM Plex Sans,sans-serif">hadir</text>`;
}

// ── TAB HARIAN ──────────────────────────────────────────────────────────────
async function _loadHarian() {
  try {
    const res = await fetch('/api/absensi/hari-ini', { headers: _authHeaders() });
    const json = await res.json();
    _renderHarian(json.data || []);
  } catch (_) {}
}

function _renderHarian(records) {
  const today    = new Date();
  const todayDay = today.getDay();
  const todayStr = today.toISOString().slice(0, 10);
  const holidays = (state.appHolidays || []).map(h => h.tanggal);

  const allEmp = (state.pegawaiList || []).filter(p => {
    const shift = _getShift(p.pin);
    return (shift.hari_kerja || [1,2,3,4,5,6]).includes(todayDay) && !holidays.includes(todayStr);
  });

  const byPin = {};
  records.forEach(r => { byPin[String(r.pin)] = r; });

  let hadirCount = 0, terlambatCount = 0;
  const absentList = [];

  allEmp.forEach(emp => {
    const r = byPin[String(emp.pin)];
    const shift = _getShift(emp.pin);
    const batas = shift.batas_terlambat ? (shift.batas_terlambat + ':00') : null;

    if (r?.catatan) {
      hadirCount++;
      const c = r.catatan.toLowerCase();
      const badge = c.includes('sakit') ? 'Sakit' : c.includes('izin') ? 'Izin' : c.includes('lembur') ? 'Lembur' : 'Ket';
      absentList.push({ emp, badge, shift });
    } else if (!r?.scan_masuk) {
      absentList.push({ emp, badge: 'Alfa', shift });
    } else {
      hadirCount++;
      if (batas && r.scan_masuk > batas) terlambatCount++;
    }
  });

  const total      = allEmp.length;
  const alphaCount = absentList.filter(x => x.badge === 'Alfa').length;
  const pctHadir   = total > 0 ? Math.round(hadirCount / total * 100) : 0;
  const pctTelat   = total > 0 ? Math.round(terlambatCount / total * 100) : 0;
  const pctAlpha   = total > 0 ? Math.round(alphaCount / total * 100) : 0;

  _set('dash-stat-total',          total);
  _set('dash-stat-hadir',          hadirCount);
  _set('dash-stat-terlambat',      terlambatCount);
  _set('dash-stat-alpha',          alphaCount);
  _set('dash-stat-hadir-pct',      pctHadir + '%');
  _set('dash-stat-terlambat-pct',  pctTelat + '%');
  _set('dash-stat-alpha-pct',      pctAlpha + '%');
  _set('dash-leg-hadir',           `Hadir  ${hadirCount} — ${pctHadir}%`);
  _set('dash-leg-terlambat',       `Terlambat  ${terlambatCount} — ${pctTelat}%`);
  _set('dash-leg-alpha',           `Alfa / Izin  ${alphaCount} — ${pctAlpha}%`);
  _set('dash-update-time',         new Date().toLocaleTimeString('id-ID'));

  _renderDonut(hadirCount, terlambatCount, alphaCount, total, pctHadir);

  const listEl = document.getElementById('dash-absent-list');
  if (!listEl) return;
  if (!absentList.length) {
    listEl.innerHTML = '<div class="dash-all-present">✓ Semua karyawan sudah hadir</div>';
    return;
  }
  listEl.innerHTML = absentList.map(({ emp, badge, shift }) => {
    const initials = emp.nama.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
    const color    = _avatarColor(emp.nama);
    const badgeCls = badge === 'Alfa' ? 'dash-badge-alfa' : badge === 'Sakit' ? 'dash-badge-sakit' : 'dash-badge-izin';
    return `<div class="dash-absent-row">
      <div class="dash-avatar" style="background:${color}">${escHtml(initials)}</div>
      <div class="dash-absent-info">
        <div class="dash-absent-name">${escHtml(emp.nama)}</div>
        <div class="dash-absent-shift">${escHtml(shift.nama || '')}</div>
      </div>
      <span class="dash-badge ${badgeCls}">${badge}</span>
    </div>`;
  }).join('');
}

function _set(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

// ── KALKULASI PER KARYAWAN PER BULAN ────────────────────────────────────────
function _calcMonth(pin, rows, yr, mo) {
  const holidays       = (state.appHolidays || []).map(h => h.tanggal);
  const shift          = _getShift(pin);
  const workDayNums    = shift.hari_kerja || [1,2,3,4,5,6];
  const batasSetengah  = ((shift.batas_setengah_hari) || '08:30') + ':00';
  const shiftHasIst    = !!(shift.ist_window_dari && shift.ist_window_sampai);

  const days = new Date(+yr, +mo, 0).getDate();
  const allDays = Array.from({ length: days }, (_, i) => {
    const d = String(i + 1).padStart(2, '0');
    return `${yr}-${mo}-${d}`;
  });

  const byDate = {};
  rows.forEach(r => { byDate[r.tanggal] = r; });
  const allRows  = allDays.map(tgl => byDate[tgl] || { tanggal: tgl });
  const workDays = allRows.filter(r => {
    const d = new Date(r.tanggal + 'T00:00:00');
    return workDayNums.includes(d.getDay()) && !holidays.includes(r.tanggal);
  });

  const getIstPenalty = r => {
    if (!shiftHasIst || !r.scan_masuk || r.catatan || r.scan_masuk >= batasSetengah) return null;
    if ((r.scan_istirahat1 && !r.scan_istirahat2) || (!r.scan_istirahat1 && r.scan_istirahat2)) return 'pink';
    if (r.durasi_istirahat == null) return null;
    const s = r.durasi_istirahat - 60;
    return s >= 60 ? 'merah' : s >= 30 ? 'pink' : s >= 15 ? 'kuning' : null;
  };

  const alpha       = workDays.filter(r => !r.scan_masuk && !r.catatan).length;
  const ket         = workDays.filter(r => r.catatan).length;
  const telatSekali = workDays.filter(r => r.scan_masuk && !r.catatan && r.scan_masuk >= batasSetengah).length;
  const batasStr    = shift.batas_terlambat ? (shift.batas_terlambat + ':00') : null;
  const telat       = workDays.filter(r => {
    if (!r.scan_masuk || r.catatan || r.scan_masuk >= batasSetengah) return false;
    return batasStr && r.scan_masuk > batasStr;
  }).length;

  const hadirDecimal = workDays.reduce((sum, r) => {
    if (r.catatan) return sum + 1;
    if (!r.scan_masuk) return sum;
    if (r.scan_masuk >= batasSetengah) return sum + 0.5;
    const ip = getIstPenalty(r);
    if (ip === 'merah') return sum;
    if (ip === 'pink')  return sum + 0.5;
    if (ip === 'kuning') return sum + 0.75;
    return sum + 1;
  }, 0);

  const nonWork    = allRows.length - workDays.length;
  const hadirTotal = hadirDecimal + nonWork;
  const hadir      = hadirTotal % 1 === 0 ? hadirTotal : +hadirTotal.toFixed(2);

  // selisih istirahat
  const hadirRows  = shiftHasIst ? workDays.filter(r => {
    if (!r.scan_masuk || r.catatan || r.scan_masuk >= batasSetengah) return false;
    if ((r.scan_istirahat1 && !r.scan_istirahat2) || (!r.scan_istirahat1 && r.scan_istirahat2)) return false;
    return true;
  }) : [];
  const totalIst   = hadirRows.reduce((s, r) => s + (r.durasi_istirahat ?? 0), 0);
  const selisihIst = hadirRows.length > 0 ? totalIst - hadirRows.length * 60 : null;

  return { hadir, alpha, ket, telatSekali, telat, workDays: workDays.length, total: allRows.length, selisihIst };
}

// ── TAB BULANAN ─────────────────────────────────────────────────────────────
function _initBulanan() {
  const now = new Date();
  const bEl = document.getElementById('dash-bul-bulan');
  const tEl = document.getElementById('dash-bul-tahun');
  if (bEl && !bEl.dataset.init) { bEl.value = String(now.getMonth() + 1).padStart(2, '0'); bEl.dataset.init = '1'; }
  if (tEl && !tEl.dataset.init) { tEl.value = String(now.getFullYear()); tEl.dataset.init = '1'; }
  _populateEmpDropdown('dash-bul-emp');
}

export async function loadDashBulanan() {
  const bulan  = document.getElementById('dash-bul-bulan').value;
  const tahun  = document.getElementById('dash-bul-tahun').value;
  const pinFil = document.getElementById('dash-bul-emp').value;
  const mo     = bulan.padStart(2, '0');
  const days   = new Date(+tahun, +mo, 0).getDate();
  const dari   = `${tahun}-${mo}-01`;
  const sampai = `${tahun}-${mo}-${String(days).padStart(2, '0')}`;
  const tbody  = document.getElementById('dash-bul-body');
  tbody.innerHTML = '<tr><td colspan="8" class="dash-td-loading">Memuat...</td></tr>';
  try {
    const res  = await fetch(`/api/absensi/filter?tanggal_dari=${dari}&tanggal_sampai=${sampai}`, { headers: _authHeaders() });
    const json = await res.json();
    _renderBulanan(json.data || [], tahun, mo, pinFil);
  } catch (_) {
    tbody.innerHTML = '<tr><td colspan="8" class="dash-td-err">Gagal memuat data</td></tr>';
  }
}

function _renderBulanan(data, yr, mo, filterPin) {
  const byPin = {};
  data.forEach(r => {
    const k = String(r.pin);
    if (!byPin[k]) byPin[k] = { nama: r.nama, pin: k, rows: [] };
    byPin[k].rows.push(r);
  });
  (state.pegawaiList || []).forEach(p => {
    const k = String(p.pin);
    if (!byPin[k]) byPin[k] = { nama: p.nama, pin: k, rows: [] };
  });

  let list = Object.values(byPin).sort((a, b) => a.nama.localeCompare(b.nama));
  if (filterPin) list = list.filter(e => e.pin === filterPin);

  const tbody = document.getElementById('dash-bul-body');
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="8" class="dash-td-loading">Tidak ada data</td></tr>'; return; }

  tbody.innerHTML = list.map(emp => {
    const s = _calcMonth(emp.pin, emp.rows, yr, mo);
    const istColor = s.selisihIst == null ? '#64748b' : s.selisihIst > 0 ? '#ef4444' : s.selisihIst < 0 ? '#3b82f6' : '#10b981';
    const istTxt   = s.selisihIst == null ? '—' : s.selisihIst === 0 ? 'tepat' : (s.selisihIst > 0 ? `+${s.selisihIst}m` : `${s.selisihIst}m`);
    return `<tr>
      <td>${escHtml(emp.nama)}</td>
      <td class="dash-tc">${s.workDays}</td>
      <td class="dash-tc" style="color:#10b981;font-weight:600">${s.hadir}</td>
      <td class="dash-tc" style="color:#f59e0b">${s.telat}</td>
      <td class="dash-tc" style="color:#f97316">${s.telatSekali}</td>
      <td class="dash-tc" style="color:#ef4444">${s.alpha}</td>
      <td class="dash-tc" style="color:#a78bfa">${s.ket}</td>
      <td class="dash-tc" style="color:${istColor}">${istTxt}</td>
    </tr>`;
  }).join('');
}

// ── TAB TAHUNAN ─────────────────────────────────────────────────────────────
function _initTahunan() {
  const now = new Date();
  const tEl = document.getElementById('dash-thn-tahun');
  if (tEl && !tEl.dataset.init) { tEl.value = String(now.getFullYear()); tEl.dataset.init = '1'; }
  _populateEmpDropdown('dash-thn-emp');
}

export async function loadDashTahunan() {
  const tahun  = document.getElementById('dash-thn-tahun').value;
  const pinFil = document.getElementById('dash-thn-emp').value;
  const tbody  = document.getElementById('dash-thn-body');
  tbody.innerHTML = '<tr><td colspan="15" class="dash-td-loading">Memuat data satu tahun, mohon tunggu...</td></tr>';
  try {
    const res  = await fetch(`/api/absensi/filter?tanggal_dari=${tahun}-01-01&tanggal_sampai=${tahun}-12-31`, { headers: _authHeaders() });
    const json = await res.json();
    _renderTahunan(json.data || [], tahun, pinFil);
  } catch (_) {
    tbody.innerHTML = '<tr><td colspan="15" class="dash-td-err">Gagal memuat data</td></tr>';
  }
}

function _renderTahunan(data, tahun, filterPin) {
  const byPin = {};
  data.forEach(r => {
    const k = String(r.pin);
    if (!byPin[k]) byPin[k] = { nama: r.nama, pin: k, byMonth: {} };
    const mo = r.tanggal.slice(5, 7);
    if (!byPin[k].byMonth[mo]) byPin[k].byMonth[mo] = [];
    byPin[k].byMonth[mo].push(r);
  });
  if (filterPin && !byPin[filterPin]) {
    const emp = (state.pegawaiList || []).find(p => String(p.pin) === filterPin);
    if (emp) byPin[filterPin] = { nama: emp.nama, pin: filterPin, byMonth: {} };
  }

  let list = Object.values(byPin).sort((a, b) => a.nama.localeCompare(b.nama));
  if (filterPin) list = list.filter(e => e.pin === filterPin);

  const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  const tbody  = document.getElementById('dash-thn-body');
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="15" class="dash-td-loading">Tidak ada data</td></tr>'; return; }

  tbody.innerHTML = list.map(emp => {
    let sumHadir = 0, sumAlpha = 0, sumTelat = 0;
    const cells = months.map(mo => {
      const rows = emp.byMonth[mo] || [];
      const s    = _calcMonth(emp.pin, rows, tahun, mo);
      sumHadir += s.hadir;
      sumAlpha += s.alpha;
      sumTelat += s.telat;
      const color = s.alpha > 3 ? '#ef4444' : s.alpha > 0 ? '#f59e0b' : '#10b981';
      return `<td class="dash-tc" style="font-size:11px">
        <span style="color:${color};font-weight:600">${s.hadir}</span>
        <br><span style="color:#64748b;font-size:9px">${s.alpha}α</span>
      </td>`;
    }).join('');
    return `<tr>
      <td style="font-size:12px;white-space:nowrap;padding:6px 10px">${escHtml(emp.nama)}</td>
      ${cells}
      <td class="dash-tc" style="color:#10b981;font-weight:700">${+sumHadir.toFixed(1)}</td>
      <td class="dash-tc" style="color:#ef4444;font-weight:600">${sumAlpha}</td>
      <td class="dash-tc" style="color:#f59e0b">${sumTelat}</td>
    </tr>`;
  }).join('');
}
