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
  if (sel) {
    sel.innerHTML = `<option value="">— Pilih nama karyawan —</option>` +
      state.pegawaiList.map(p =>
        `<option value="${escHtml(String(p.pin))}">${escHtml(p.nama)}</option>`
      ).join('');
  }
  const dd = document.getElementById('picker-dropdown');
  if (dd) {
    dd.innerHTML = state.pegawaiList.map(p =>
      `<div class="picker-dd-item" data-pin="${escHtml(String(p.pin))}" data-nama="${escHtml(p.nama)}"
        style="padding:10px 16px;cursor:pointer;font-size:14px;color:var(--text);transition:background 0.15s"
        onmouseenter="this.style.background='var(--surface2)'" onmouseleave="this.style.background=''"
        onclick="window._pickerSelect('${escHtml(String(p.pin))}','${escHtml(p.nama)}')"
      >${escHtml(p.nama)}</div>`
    ).join('');
  }
}

export function confirmPickerSelect() {
  const sel = document.getElementById('picker-select');
  if (!sel) return;
  const pin = sel.value;
  if (!pin) { sel.focus(); return; }
  const emp = state.pegawaiList.find(p => String(p.pin) === pin);
  if (emp) selectEmployee(emp.pin, emp.nama);
}

let _pickerOutsideHandler = null;
export function showPicker() {
  const dd = document.getElementById('picker-dropdown');
  if (!dd) return;
  const isOpen = dd.style.display !== 'none';
  dd.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    if (_pickerOutsideHandler) document.removeEventListener('mousedown', _pickerOutsideHandler);
    _pickerOutsideHandler = (e) => {
      if (!dd.contains(e.target) && !document.getElementById('btn-ganti-karyawan').contains(e.target)) {
        dd.style.display = 'none';
        document.removeEventListener('mousedown', _pickerOutsideHandler);
        _pickerOutsideHandler = null;
      }
    };
    setTimeout(() => document.addEventListener('mousedown', _pickerOutsideHandler), 0);
  }
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
