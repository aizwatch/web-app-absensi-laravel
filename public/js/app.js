// ── INIT — runs after all scripts loaded ──
(async () => {
  const valid = await loadAuthSession();
  if (!valid) {
    await loadLoginUsers();
    document.getElementById('overlay-login').classList.add('show');
    return;
  }
  await afterLogin();
})();
