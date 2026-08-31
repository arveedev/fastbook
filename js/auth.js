/**
 * NFA PASSBOOK — Authentication (6-digit PIN, SHA-256 local hash check)
 */
let pinBuffer = '';

function renderLoginScreen() {
  pinBuffer = '';
  const root = document.getElementById('app-root');
  root.innerHTML = `
    <div class="pin-screen">
      <div style="text-align:center; margin-bottom:6px;">
        <div style="width:64px;height:64px;border-radius:16px;background:var(--nfa-gold);display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--nfa-navy);font-size:20px;margin:0 auto 14px;">NFA</div>
        <h1 style="color:#fff;font-size:19px;font-weight:800;">NFA Passbook</h1>
        <p style="color:rgba(255,255,255,0.7);font-size:12.5px;margin-top:4px;">Enter your 6-digit PIN to continue</p>
      </div>
      <div class="pin-dots" id="pin-dots">
        ${Array.from({ length: 6 }).map(() => '<div class="pin-dot"></div>').join('')}
      </div>
      <div class="pin-keypad" id="pin-keypad">
        ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="pin-key" data-key="${n}">${n}</button>`).join('')}
        <button class="pin-key" data-key="clear" style="font-size:13px;">Clear</button>
        <button class="pin-key" data-key="0">0</button>
        <button class="pin-key gold" data-key="back">⌫</button>
      </div>
      <div id="pin-error" style="color:#FFB4B4; font-size:12.5px; margin-top:18px; min-height:16px; font-weight:600;"></div>
    </div>
  `;

  document.getElementById('pin-keypad').addEventListener('click', async (e) => {
    const btn = e.target.closest('.pin-key');
    if (!btn) return;
    const key = btn.dataset.key;

    if (key === 'clear') {
      pinBuffer = '';
    } else if (key === 'back') {
      pinBuffer = pinBuffer.slice(0, -1);
    } else if (pinBuffer.length < 6) {
      pinBuffer += key;
    }
    updatePinDots();

    if (pinBuffer.length === 6) {
      await attemptLogin(pinBuffer);
    }
  });
}

function updatePinDots() {
  const dots = document.querySelectorAll('.pin-dot');
  dots.forEach((dot, i) => dot.classList.toggle('filled', i < pinBuffer.length));
}

async function attemptLogin(pin) {
  const errorEl = document.getElementById('pin-error');
  const hash = await sha256(pin);

  const user = await db.users
    .where('pin_hash').equals(hash)
    .and(u => u.status === 'Active' && !u.is_deleted)
    .first();

  if (user) {
    AppState.currentUser = { user_id: user.user_id, full_name: user.full_name, role: user.role };
    sessionStorage.setItem('nfa_session_user', JSON.stringify(AppState.currentUser));
    await renderAppShell();
    navigate('dashboard');
    showToast(`Welcome back, ${user.full_name.split(' ')[0]}.`, 'success');
    // Sync immediately on login rather than waiting for the background interval,
    // so this device is caught up with the shared backend right away.
    if (typeof runSync === 'function') runSync().catch(() => {});
    return;
  }

  // Fallback: attempt remote authentication if a backend is configured (handles multi-device accounts)
  const remoteUrl = await getSetting('GAS_WEBAPP_URL', '');
  if (remoteUrl && isOnline()) {
    try {
      const remote = await authenticateRemote(hash);
      if (remote.status === 'success') {
        await db.users.put({
          user_id: remote.user.user_id,
          pin_hash: hash,
          full_name: remote.user.full_name,
          role: remote.user.role,
          status: 'Active',
          last_updated: new Date().toISOString(),
          is_deleted: false
        });
        AppState.currentUser = remote.user;
        sessionStorage.setItem('nfa_session_user', JSON.stringify(AppState.currentUser));
        await renderAppShell();
        navigate('dashboard');
        showToast(`Welcome back, ${remote.user.full_name.split(' ')[0]}.`, 'success');
        if (typeof runSync === 'function') runSync().catch(() => {});
        return;
      }
    } catch (err) { /* ignore, fall through to error */ }
  }

  errorEl.textContent = 'Invalid 6-digit PIN Code. Please try again.';
  const keypad = document.getElementById('pin-keypad');
  keypad.parentElement.classList.add('pin-shake');
  setTimeout(() => keypad.parentElement.classList.remove('pin-shake'), 400);
  pinBuffer = '';
  setTimeout(updatePinDots, 350);
}
