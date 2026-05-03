// ── CONSTANTS ──
const HARI       = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const HARI_LABELS = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];

// ── STRING HELPERS ──
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function formatTanggal(str) {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  const full = d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
  return `<span class="tgl-full">${full}</span><span class="tgl-short">${d.getDate()}</span>`;
}

function fmtTime(val) {
  return `<span class="t-full">${val}</span><span class="t-short">${val.substring(0,5)}</span>`;
}

// ── UI HELPERS ──
function showToast(title, body) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<div class="toast-title">${escHtml(title)}</div><div class="toast-body">${escHtml(body)}</div>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function setStatus(online) {
  const dot    = document.getElementById('live-dot');
  const status = document.getElementById('conn-status');
  if (online) {
    dot.className = 'live-dot';
    status.textContent = 'LIVE';
    status.style.color = 'var(--accent2)';
  } else {
    dot.className = 'live-dot offline';
    status.textContent = 'OFFLINE';
    status.style.color = 'var(--danger)';
  }
}

// ── TAB SWITCHERS ──
function switchTab(id, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');
}

function switchStab(id, btn) {
  document.querySelectorAll('.stab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.stab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (btn) btn.classList.add('active');
}

function switchPengaturanStab(id, btn) {
  document.querySelectorAll('.pstab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.pstab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (btn) btn.classList.add('active');
}

function switchAdminStab(id, btn) {
  document.querySelectorAll('.admin-stab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.admin-stab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');
}

// ── THEME ──
function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : '');
  document.getElementById('theme-btn').textContent = dark ? '☀️' : '🌙';
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next = !isDark;
  localStorage.setItem('theme', next ? 'dark' : 'light');
  applyTheme(next);
}

// ── CLOCK ──
setInterval(() => {
  document.getElementById('clock').textContent = new Date().toLocaleTimeString('id-ID');
}, 1000);
document.getElementById('clock').textContent = new Date().toLocaleTimeString('id-ID');

document.getElementById('tanggal-hari-ini').textContent =
  new Date().toLocaleDateString('id-ID', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

// Init theme dari localStorage, default light
applyTheme(localStorage.getItem('theme') === 'dark');
