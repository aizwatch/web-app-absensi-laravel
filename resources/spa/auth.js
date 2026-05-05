import { state } from './state.js';
import { escHtml } from './utils.js';

export function authHeaders() {
  return state.authToken ? { 'Authorization': `Bearer ${state.authToken}` } : {};
}

export function saveAuthSession(token, user) {
  state.authToken = token;
  state.authUser  = user;
  localStorage.setItem('_auth', JSON.stringify({ token, user }));
}

export function clearAuthSession() {
  state.authToken = null;
  state.authUser  = null;
  localStorage.removeItem('_auth');
}

export async function loadAuthSession() {
  const raw = localStorage.getItem('_auth');
  if (!raw) return false;
  try {
    const { token } = JSON.parse(raw);
    const res = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) { clearAuthSession(); return false; }
    const json = await res.json();
    state.authToken = token;
    state.authUser  = json.data;
    localStorage.setItem('_auth', JSON.stringify({ token, user: state.authUser }));
    return true;
  } catch (e) { clearAuthSession(); return false; }
}

export function applyAuthUI() {
  const loggedIn = !!state.authUser;
  const isAdmin  = state.authUser?.role === 'admin';
  document.getElementById('header-user-info').style.display   = loggedIn ? 'flex' : 'none';
  document.getElementById('header-username').textContent      = state.authUser?.name || '';
  document.getElementById('btn-user-settings').style.display  = loggedIn ? '' : 'none';
  document.getElementById('btn-admin').style.display          = isAdmin  ? '' : 'none';
  document.getElementById('btn-logout').style.display         = loggedIn ? '' : 'none';
  const gantiBtn = document.getElementById('btn-ganti-karyawan');
  if (gantiBtn) gantiBtn.style.display = isAdmin ? 'inline-block' : 'none';
}

export async function loadLoginUsers() {
  try {
    const res  = await fetch('/api/auth/users');
    const json = await res.json();
    const sel  = document.getElementById('login-username');
    sel.innerHTML = `<option value="">— Pilih pengguna —</option>` +
      (json.data || []).map(u =>
        `<option value="${escHtml(u.username)}">${escHtml(u.name)} (${escHtml(u.username)})</option>`
      ).join('');
  } catch (e) {}
}

export async function doLogin() {
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-err');
  errEl.classList.remove('show');
  if (!username) {
    errEl.textContent = 'Pilih pengguna terlebih dahulu.';
    errEl.classList.add('show'); return;
  }
  try {
    const res  = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const json = await res.json();
    if (!json.success) {
      errEl.textContent = json.message || 'Login gagal.';
      errEl.classList.add('show'); return;
    }
    saveAuthSession(json.data.token, json.data.user);
    document.getElementById('overlay-login').classList.remove('show');
    if (json.data.user.must_change_password) {
      document.getElementById('overlay-force-pw').classList.add('show');
      setTimeout(() => document.getElementById('fcp-password').focus(), 100);
      return;
    }
    await afterLogin();
  } catch (e) {
    errEl.textContent = 'Gagal terhubung ke server.';
    errEl.classList.add('show');
  }
}

export async function doForceChangePw() {
  const pw      = document.getElementById('fcp-password').value;
  const confirm = document.getElementById('fcp-confirm').value;
  const errEl   = document.getElementById('fcp-err');
  errEl.classList.remove('show');
  if (pw.length < 6) { errEl.textContent = 'Password minimal 6 karakter.'; errEl.classList.add('show'); return; }
  if (pw !== confirm) { errEl.textContent = 'Konfirmasi tidak cocok.'; errEl.classList.add('show'); return; }
  try {
    const res  = await fetch('/api/auth/change-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ password: pw, password_confirmation: confirm })
    });
    const json = await res.json();
    if (!json.success) { errEl.textContent = json.message; errEl.classList.add('show'); return; }
    state.authUser.must_change_password = false;
    saveAuthSession(state.authToken, state.authUser);
    document.getElementById('overlay-force-pw').classList.remove('show');
    await afterLogin();
  } catch (e) { errEl.textContent = 'Gagal terhubung ke server.'; errEl.classList.add('show'); }
}

export async function doLogout() {
  try { await fetch('/api/auth/logout', { method: 'POST', headers: authHeaders() }); } catch (_) {}
  clearAuthSession();
  applyAuthUI();
  document.getElementById('overlay-login').classList.add('show');
  await loadLoginUsers();
}

// afterLogin dipindah ke main.js untuk hindari circular dep
// (auth ← picker ← settings ← ... ← auth)
// main.js inject afterLogin ke state atau export dari sana
export let afterLogin = async () => {};
export function setAfterLogin(fn) { afterLogin = fn; }
