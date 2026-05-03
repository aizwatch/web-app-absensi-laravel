// ── EMPLOYEE PICKER ──
let _selectedEmployee = null; // { pin, nama }
let _pegawaiList      = [];   // [{pin,nama}]
let _currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

async function initPicker() {
  try {
    const res = await fetch('/api/pegawai');
    const { data } = await res.json();
    _pegawaiList = data || [];
  } catch (e) { _pegawaiList = []; }
  populatePickerSelect();
}

function populatePickerSelect() {
  const sel = document.getElementById('picker-select');
  sel.innerHTML = `<option value="">— Pilih nama karyawan —</option>` +
    _pegawaiList.map(p =>
      `<option value="${escHtml(String(p.pin))}">${escHtml(p.nama)}</option>`
    ).join('');
}

function confirmPickerSelect() {
  const sel = document.getElementById('picker-select');
  const pin  = sel.value;
  if (!pin) { sel.focus(); return; }
  const emp = _pegawaiList.find(p => String(p.pin) === pin);
  if (emp) selectEmployee(emp.pin, emp.nama);
}

function showPicker() {
  document.getElementById('picker-overlay').classList.remove('hidden');
  document.getElementById('picker-select').value = '';
}

async function selectEmployee(pin, nama) {
  _selectedEmployee = { pin, nama };
  document.getElementById('picker-overlay').classList.add('hidden');

  document.getElementById('p-avatar').textContent = (nama || '?')[0].toUpperCase();
  document.getElementById('p-name').textContent = nama;
  updatePersonalMeta();

  switchTab('tab-personal', document.getElementById('tab-btn-personal'));

  await loadPersonalAbsensi();
}

function updatePersonalMeta() {
  if (!_selectedEmployee) return;
  const shift = getShiftForPin(_selectedEmployee.pin);
  const shiftNama = shift ? shift.nama : '—';
  document.getElementById('p-meta').textContent =
    `PIN ${_selectedEmployee.pin} | Shift: ${shiftNama}`;
}
