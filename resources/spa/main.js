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
  openDeptModal, closeDeptModal,
} from './settings.js';
import { pollAbsensi, changeMonth, loadPersonalAbsensi } from './table.js';
import { applyFilter, resetFilter, exportFilter, switchFilterStab, applyBermasalah, toggleBermasalahDetail } from './filter.js';
import {
  openInjectModal, closeInjectModal, toggleInjAlasan,
  confirmInjectModal, openRowHistory, deleteOverride, deleteScanNote,
} from './inject.js';
import {
  openAdminModal, closeAdminModal, adminInit,
  adminLoadScans, adminEditScanRow, adminCancelScanRow, adminSaveScan, adminDeleteScan,
  adminLoadPegawai, adminEditPegawaiRow, adminCancelPegawaiRow,
  adminSavePegawai, adminDeletePegawai, adminAddPegawai,
  loadSyncDevices, runBackfill, runSetTime, runSyncUserInfo, populateSyncUserSelect,
  openUserSettingsModal, closeSettingsModal, userChangePassword,
} from './admin.js';
import {
  openLaporanModal, closeLaporanModal, generateLaporan,
} from './laporan.js';
import {
  openDashboardModal, closeDashboardModal, switchDashTab,
  loadDashBulanan, loadDashTahunan,
} from './dashboard.js';
import {
  toggleAmFields, previewAttachment, initAbsensiMandiri,
  submitAbsensiMandiri, closeAmConfirm, submitAmConfirmed,
  loadMyRequests, loadAdminRequests, adminActionMandiri, revokeAndEditMandiri,
  updatePendingBadge, populateAmAdminPinSelect, debounceAmFilter,
  openAttachmentModal, closeAttachmentModal,
} from './absensi-mandiri.js';

// ── MOBILE NAV ──
const _mnavTabMap = {
  'tab-personal': 'tab-btn-personal',
  'tab-live':     'tab-btn-live',
  'tab-mandiri':  'tab-btn-mandiri',
};

function mobileNavSwitch(tabId, navItemId) {
  const desktopBtn = document.getElementById(_mnavTabMap[tabId]);
  if (desktopBtn) switchTab(tabId, desktopBtn);
  document.querySelectorAll('.mobile-nav-item').forEach(el => el.classList.remove('active'));
  const item = document.getElementById(navItemId);
  if (item) item.classList.add('active');
}

// ── EXPOSE TO window (required by inline onclick= in HTML) ──
Object.assign(window, {
  // theme & nav
  toggleTheme, switchTab, switchStab, switchPengaturanStab, switchAdminStab,
  mobileNavSwitch,

  // auth
  doLogin, doForceChangePw, doLogout,

  // picker
  confirmPickerSelect, showPicker, changeMonth,
  _pickerSelect: (pin, nama) => selectEmployee(pin, nama),

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
  openDeptModal, closeDeptModal,

  // filter
  applyFilter, resetFilter, exportFilter,
  switchFilterStab, applyBermasalah, toggleBermasalahDetail,

  // inject
  openInjectModal, closeInjectModal, toggleInjAlasan,
  confirmInjectModal, openRowHistory, deleteScanNote,

  // admin modal
  openAdminModal, closeAdminModal, switchAdminStab,
  adminLoadScans, adminEditScanRow, adminCancelScanRow, adminSaveScan, adminDeleteScan,
  adminEditPegawaiRow, adminCancelPegawaiRow, adminSavePegawai,
  adminDeletePegawai, adminAddPegawai,
  loadSyncDevices, runBackfill, runSetTime, runSyncUserInfo, populateSyncUserSelect,
  openUserSettingsModal, closeSettingsModal, userChangePassword,

  // laporan
  openLaporanModal, closeLaporanModal, generateLaporan,

  // dashboard
  openDashboardModal, closeDashboardModal, switchDashTab,
  loadDashBulanan, loadDashTahunan,

  // absensi mandiri
  toggleAmFields, previewAttachment, initAbsensiMandiri,
  submitAbsensiMandiri, closeAmConfirm, submitAmConfirmed,
  loadMyRequests, loadAdminRequests, adminActionMandiri, revokeAndEditMandiri,
  populateAmAdminPinSelect, debounceAmFilter,
  openAttachmentModal, closeAttachmentModal,
});

// ── afterLogin — defined here to avoid circular dep ──
async function afterLogin() {
  applyAuthUI();
  const dashBtn = document.getElementById('btn-dashboard');
  if (dashBtn) dashBtn.style.display = state.authUser?.role === 'admin' ? '' : 'none';
  await loadAppSettings();
  await initPicker();
  if (state.authUser?.pegawai_pin) {
    const emp = state.pegawaiList.find(p => String(p.pin) === String(state.authUser.pegawai_pin));
    if (emp) selectEmployee(emp.pin, emp.nama);
  }
  updatePendingBadge();
  populateAmAdminPinSelect();
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
  document.getElementById('modal-dashboard').addEventListener('click', function(e) {
    if (e.target === this) closeDashboardModal();
  });
});

// ── DEFAULT FILTER DATES ──
const todayStr = new Date().toISOString().slice(0, 10);
document.getElementById('f-dari').value   = todayStr;
document.getElementById('f-sampai').value = todayStr;

// ── INIT CLOCK + THEME ──
initClock();

// ── START POLLING ──
let _pollLiveInterval    = null;
let _pollPersonalInterval = null;
let _pollBadgeInterval    = null;

function _startPolling() {
  if (!_pollLiveInterval) {
    pollAbsensi();
    _pollLiveInterval = setInterval(pollAbsensi, 5000);
  }
  if (!_pollPersonalInterval) {
    _pollPersonalInterval = setInterval(() => {
      const isCurrentMonth = state.currentMonth === new Date().toLocaleDateString('sv-SE').slice(0,7);
      if (document.getElementById('tab-personal')?.classList.contains('active') && state.selectedEmployee && isCurrentMonth) {
        loadPersonalAbsensi();
      }
    }, 30000);
  }
  if (!_pollBadgeInterval) {
    _pollBadgeInterval = setInterval(updatePendingBadge, 30000);
  }
}

function _stopPolling() {
  clearInterval(_pollLiveInterval);
  clearInterval(_pollPersonalInterval);
  clearInterval(_pollBadgeInterval);
  _pollLiveInterval    = null;
  _pollPersonalInterval = null;
  _pollBadgeInterval    = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    _stopPolling();
  } else {
    _startPolling();
    if (document.getElementById('tab-personal')?.classList.contains('active') && state.selectedEmployee) {
      loadPersonalAbsensi();
    }
  }
});

_startPolling();

// ── BOOT AUTH ──
(async () => {
  const valid = await loadAuthSession();
  if (!valid) {
    await loadLoginUsers();
    document.getElementById('overlay-login').classList.add('show');
    return;
  }
  if (state.authUser?.must_change_password) {
    await loadLoginUsers();
    document.getElementById('overlay-force-pw').classList.add('show');
    setTimeout(() => document.getElementById('fcp-password').focus(), 100);
    return;
  }
  await afterLogin();
})();
