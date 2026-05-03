// ── AUTH STATE ──
let _authToken = null;
let _authUser  = null;

function authHeaders() {
  return _authToken ? { 'Authorization': `Bearer ${_authToken}` } : {};
}

function saveAuthSession(token, user) {
  _authToken = token;
  _authUser  = user;
  localStorage.setItem('_auth', JSON.stringify({ token, user }));
}

function clearAuthSession() {
  _authToken = null;
  _authUser  = null;
  localStorage.removeItem('_auth');
}

async function loadAuthSession() {
  const raw = localStorage.getItem('_auth');
  if (!raw) return false;
  try {
    const { token, user } = JSON.parse(raw);
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) { clearAuthSession(); return false; }
    const json = await res.json();
    _authToken = token;
    _authUser  = json.data;
    localStorage.setItem('_auth', JSON.stringify({ token, user: _authUser }));
    return true;
  } catch (e) { clearAuthSession(); return false; }
}

function applyAuthUI() {
  const loggedIn = !!_authUser;
  const isAdmin  = _authUser?.role === 'admin';
  document.getElementById('header-user-info').style.display   = loggedIn ? 'flex' : 'none';
  document.getElementById('header-username').textContent      = _authUser?.name || '';
  document.getElementById('btn-user-settings').style.display  = loggedIn ? '' : 'none';
  document.getElementById('btn-admin').style.display          = isAdmin  ? '' : 'none';
  document.getElementById('btn-logout').style.display         = loggedIn ? '' : 'none';
}

async function loadLoginUsers() {
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

async function doLogin() {
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

async function doForceChangePw() {
  const pw      = document.getElementById('fcp-password').value;
  const confirm = document.getElementById('fcp-confirm').value;
  const errEl   = document.getElementById('fcp-err');
  errEl.classList.remove('show');

  if (pw.length < 6) {
    errEl.textContent = 'Password minimal 6 karakter.'; errEl.classList.add('show'); return;
  }
  if (pw !== confirm) {
    errEl.textContent = 'Konfirmasi tidak cocok.'; errEl.classList.add('show'); return;
  }

  try {
    const res  = await fetch('/api/auth/change-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ password: pw, password_confirmation: confirm })
    });
    const json = await res.json();
    if (!json.success) {
      errEl.textContent = json.message; errEl.classList.add('show'); return;
    }
    _authUser.must_change_password = false;
    saveAuthSession(_authToken, _authUser);
    document.getElementById('overlay-force-pw').classList.remove('show');
    await afterLogin();
  } catch (e) {
    errEl.textContent = 'Gagal terhubung ke server.'; errEl.classList.add('show');
  }
}

async function doLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', headers: authHeaders() });
  } catch (_) {}
  clearAuthSession();
  applyAuthUI();
  document.getElementById('overlay-login').classList.add('show');
  await loadLoginUsers();
}

async function afterLogin() {
  applyAuthUI();
  await loadAppSettings();
  await initPicker();
  if (_authUser?.pegawai_pin) {
    const emp = _pegawaiList.find(p => String(p.pin) === String(_authUser.pegawai_pin));
    if (emp) selectEmployee(emp.pin, emp.nama);
  }
}
