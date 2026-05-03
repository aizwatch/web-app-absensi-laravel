import './app.css';

// ── IMPORTS ──
import { state } from './state.js';
import { initClock, toggleTheme, switchTab, switchStab, switchPengaturanStab, switchAdminStab } from './utils.js';
import {
  doLogin, doForceChangePw, doLogout,
  loadAuthSession, loadLoginUsers, applyAuthUI,
  setAfterLogin,
} from './auth.js';
import {
  initPicker, populatePickerSelect, confirmPickerSelect,
  showPicker, selectEmployee, updatePersonalMeta,
} from './picker.js';
import { loadAppSettings } from './settings.js';
import {
  saveSettings, openPengaturanSettings,
  renderShiftsTable, editShiftRow, cancelShiftRow, saveShiftRow,
  deleteShift, toggleAddShift, addShift, autoFillBatas, autoFillBatasNew,
  filterEmpRows, assignShift,
  addHoliday, deleteHoliday,
  toggleOvFields, toggleOvAlasan, toggleOvKaryawan,
  openOvKaryawanPicker, closeOvKaryawanPicker, filterOvPicker,
  toggleOvPin, ovPickerSelectAll, ovPickerClearAll, confirmOvKaryawanPicker,
  addOverride,
  adminResetUserPassword,
  renderDepartmentsCard, addDepartment, removeDepartment,
} from './settings.js';
import { pollAbsensi, changeMonth, loadPersonalAbsensi } from './table.js';
import { applyFilter, resetFilter, exportFilter } from './filter.js';
import {
  openInjectModal, closeInjectModal, toggleInjAlasan,
  confirmInjectModal, openRowHistory, deleteOverride,
} from './inject.js';
import {
  openAdminModal, closeAdminModal, adminInit,
  adminLoadScans, adminEditScanRow, adminCancelScanRow, adminSaveScan,
  adminLoadPegawai, adminEditPegawaiRow, adminCancelPegawaiRow,
  adminSavePegawai, adminDeletePegawai, adminAddPegawai,
  loadSyncDevices, runBackfill,
  openUserSettingsModal, closeSettingsModal, userChangePassword,
} from './admin.js';
import {
  openLaporanModal, closeLaporanModal, generateLaporan,
} from './laporan.js';
import {
  toggleAmFields, previewAttachment, initAbsensiMandiri,
  submitAbsensiMandiri, closeAmConfirm, submitAmConfirmed,
  loadMyRequests, loadAdminRequests, adminActionMandiri,
} from './absensi-mandiri.js';

// ── EXPOSE TO window (required by inline onclick= in HTML) ──
Object.assign(window, {
  // theme & nav
  toggleTheme, switchTab, switchStab, switchPengaturanStab, switchAdminStab,

  // auth
  doLogin, doForceChangePw, doLogout,

  // picker
  confirmPickerSelect, showPicker, changeMonth,

  // settings — shifts
  editShiftRow, cancelShiftRow, saveShiftRow, deleteShift,
  toggleAddShift, addShift, autoFillBatas, autoFillBatasNew,

  // settings — assign
  filterEmpRows, assignShift,

  // settings — holidays
  addHoliday, deleteHoliday,

  // settings — overrides
  toggleOvFields, toggleOvAlasan, toggleOvKaryawan,
  openOvKaryawanPicker, closeOvKaryawanPicker, filterOvPicker,
  toggleOvPin, ovPickerSelectAll, ovPickerClearAll, confirmOvKaryawanPicker,
  addOverride, deleteOverride,

  // settings — password + departemen
  adminResetUserPassword, saveSettings,
  openPengaturanSettings,
  renderDepartmentsCard, addDepartment, removeDepartment,

  // filter
  applyFilter, resetFilter, exportFilter,

  // inject
  openInjectModal, closeInjectModal, toggleInjAlasan,
  confirmInjectModal, openRowHistory,

  // admin modal
  openAdminModal, closeAdminModal, switchAdminStab,
  adminLoadScans, adminEditScanRow, adminCancelScanRow, adminSaveScan,
  adminEditPegawaiRow, adminCancelPegawaiRow, adminSavePegawai,
  adminDeletePegawai, adminAddPegawai,
  loadSyncDevices, runBackfill,
  openUserSettingsModal, closeSettingsModal, userChangePassword,

  // laporan
  openLaporanModal, closeLaporanModal, generateLaporan,

  // absensi mandiri
  toggleAmFields, previewAttachment, initAbsensiMandiri,
  submitAbsensiMandiri, closeAmConfirm, submitAmConfirmed,
  loadMyRequests, loadAdminRequests, adminActionMandiri,
});

// ── afterLogin — defined here to avoid circular dep ──
async function afterLogin() {
  applyAuthUI();
  await loadAppSettings();
  await initPicker();
  if (state.authUser?.pegawai_pin) {
    const emp = state.pegawaiList.find(p => String(p.pin) === String(state.authUser.pegawai_pin));
    if (emp) selectEmployee(emp.pin, emp.nama);
  }
}
setAfterLogin(afterLogin);

// ── MODAL close-on-backdrop ──
document.getElementById('modal-settings').addEventListener('click', function(e) {
  if (e.target === this) closeSettingsModal();
});
document.getElementById('modal-am-confirm').addEventListener('click', function(e) {
  if (e.target === this) closeAmConfirm();
});
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modal-admin').addEventListener('click', function(e) {
    if (e.target === this) closeAdminModal();
  });
  document.getElementById('modal-laporan').addEventListener('click', function(e) {
    if (e.target === this) closeLaporanModal();
  });
});

// ── DEFAULT FILTER DATES ──
const todayStr = new Date().toISOString().slice(0, 10);
document.getElementById('f-dari').value   = todayStr;
document.getElementById('f-sampai').value = todayStr;

// ── INIT CLOCK + THEME ──
initClock();

// ── START POLLING ──
pollAbsensi();
setInterval(pollAbsensi, 5000);

// ── BOOT AUTH ──
(async () => {
  const valid = await loadAuthSession();
  if (!valid) {
    await loadLoginUsers();
    document.getElementById('overlay-login').classList.add('show');
    return;
  }
  if (state.authUser?.must_change_password) {
    document.getElementById('overlay-force-pw').classList.add('show');
    setTimeout(() => document.getElementById('fcp-password').focus(), 100);
    return;
  }
  await afterLogin();
})();
