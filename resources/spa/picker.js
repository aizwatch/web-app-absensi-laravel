import { state } from './state.js';
import { escHtml, switchTab } from './utils.js';
import { getShiftForPin } from './settings.js';
import { loadPersonalAbsensi } from './table.js';

export async function initPicker() {
  try {
    const res = await fetch('/api/pegawai');
    const { data } = await res.json();
    state.pegawaiList = data || [];
  } catch (e) { state.pegawaiList = []; }
  populatePickerSelect();
}

export function populatePickerSelect() {
  const sel = document.getElementById('picker-select');
  sel.innerHTML = `<option value="">— Pilih nama karyawan —</option>` +
    state.pegawaiList.map(p =>
      `<option value="${escHtml(String(p.pin))}">${escHtml(p.nama)}</option>`
    ).join('');
}

export function confirmPickerSelect() {
  const sel = document.getElementById('picker-select');
  const pin  = sel.value;
  if (!pin) { sel.focus(); return; }
  const emp = state.pegawaiList.find(p => String(p.pin) === pin);
  if (emp) selectEmployee(emp.pin, emp.nama);
}

export function showPicker() {
  document.getElementById('picker-overlay').classList.remove('hidden');
  document.getElementById('picker-select').value = '';
}

export async function selectEmployee(pin, nama) {
  state.selectedEmployee = { pin, nama };
  document.getElementById('picker-overlay').classList.add('hidden');
  document.getElementById('p-avatar').textContent = (nama || '?')[0].toUpperCase();
  document.getElementById('p-name').textContent = nama;
  updatePersonalMeta();
  switchTab('tab-personal', document.getElementById('tab-btn-personal'));
  await loadPersonalAbsensi();
}

export function updatePersonalMeta() {
  if (!state.selectedEmployee) return;
  const shift = getShiftForPin(state.selectedEmployee.pin);
  const shiftNama = shift ? shift.nama : '—';
  document.getElementById('p-meta').textContent =
    `PIN ${state.selectedEmployee.pin} | Shift: ${shiftNama}`;
}
