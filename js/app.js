/**
 * NFA PASSBOOK — Core Application Shell
 * Router, theming, seasonal background engine, toast/modal helpers.
 */
const AppState = {
  currentUser: null,
  theme: 'light',
  route: 'dashboard',
  routeParams: {},
  history: []
};

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', roles: ['Admin', 'Warehouse Staff'], icon: 'grid' },
  { id: 'passbooks', label: 'Passbooks', roles: ['Admin', 'Warehouse Staff'], icon: 'book' },
  { id: 'scan', label: 'Scan QR', roles: ['Admin', 'Warehouse Staff'], icon: 'qr' },
  { id: 'reports', label: 'Reports', roles: ['Admin', 'Warehouse Staff'], icon: 'chart' },
  { id: 'settings', label: 'Settings', roles: ['Admin'], icon: 'gear' }
];

const ICONS = {
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  qr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM14 20h3M20 14v3M17 20h3v-3"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12.5" y="8" width="3" height="10"/><rect x="18" y="5" width="3" height="13"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M9 18l6-6-6-6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M15 18l-6-6 6-6"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>',
  empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M3 7l2-4h14l2 4"/><path d="M9 7v4a3 3 0 0 0 6 0V7"/></svg>',
  sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.65 4.36A9 9 0 0 0 20.5 15"/></svg>'
};

function icon(name, size = 18) {
  return (ICONS[name] || '').replace('<svg ', `<svg width="${size}" height="${size}" `);
}

const ICONS_SEASON = {
  sunny: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="5.5" fill="#FFB300" stroke="#FF8F00" stroke-width="1"/>
    <g stroke="#FF8F00" stroke-width="2" stroke-linecap="round">
      <path d="M12 1.5v3"/><path d="M12 19.5v3"/><path d="M1.5 12h3"/><path d="M19.5 12h3"/>
      <path d="M4.4 4.4l2.1 2.1"/><path d="M17.5 17.5l2.1 2.1"/><path d="M4.4 19.6l2.1-2.1"/><path d="M17.5 6.5l2.1-2.1"/>
    </g>
  </svg>`,
  storm: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M6.5 17a4.5 4.5 0 0 1-.7-8.94A5.5 5.5 0 0 1 16.3 6.9 4 4 0 0 1 17.5 15" fill="#90A4AE" stroke="#607D8B" stroke-width="1"/>
    <path d="M6.5 17h11" stroke="#607D8B" stroke-width="1" fill="none"/>
    <path d="M11.2 15.5l-2 4M15.2 15.5l-2 4" stroke="#4FC3F7" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M13 15.5l-1.6 2.7h2.2l-1.4 2.6" stroke="#FFD54F" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`
};

/* ---------------------------------------------------------------------- *
 *  BOOTSTRAP
 * ---------------------------------------------------------------------- */
async function bootApp() {
  await initializeLocalDB();
  const theme = await getSetting('THEME_MODE', 'light');
  AppState.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);

  const savedSession = sessionStorage.getItem('nfa_session_user');
  if (savedSession) {
    AppState.currentUser = JSON.parse(savedSession);
    renderAppShell();
    navigate('dashboard');
  } else {
    renderLoginScreen();
  }

  // Automatic background sync: runs immediately if configured & online, then
  // keeps running silently on an interval so the app and Google Sheets stay
  // converged without anyone needing to press a "Sync Now" button.
  const gasUrl = await getSetting('GAS_WEBAPP_URL', '');
  if (gasUrl && isOnline()) runSync().catch(() => {});
  startBackgroundSync();
}

/* ---------------------------------------------------------------------- *
 *  APP SHELL (post-login)
 * ---------------------------------------------------------------------- */
async function renderAppShell() {
  const root = document.getElementById('app-root');
  const settings = await getAllSettings();
  root.innerHTML = `
    <div class="topbar">
      <div class="logo-badge">NFA</div>
      <div class="title-block">
        <h1>${settings.AGENCY_NAME || 'NFA'} Passbook — ${settings.BRANCH_NAME || ''} Branch</h1>
        <span>${getRegionName(settings.REGION_CODE || 'V')}</span>
      </div>
      <button class="icon-btn" id="theme-toggle-btn" title="Toggle theme">${icon(AppState.theme === 'dark' ? 'sun' : 'moon', 17)}</button>
      <button class="icon-btn" id="logout-btn" title="Logout (${AppState.currentUser.full_name} · ${AppState.currentUser.role})">${icon('logout', 17)}</button>
    </div>
    <div class="sky-banner" id="sky-banner"></div>
    <div id="screen-container" style="position:relative; flex:1; overflow:hidden;"></div>
    <div class="bottom-nav" id="bottom-nav"></div>
    <div id="toast-host"></div>
    <div id="print-area"></div>
  `;

  document.getElementById('theme-toggle-btn').onclick = toggleTheme;
  document.getElementById('logout-btn').onclick = confirmLogout;

  await renderCelestialBackground();
  renderBottomNav();
  startCelestialClock();
}

function renderBottomNav() {
  const nav = document.getElementById('bottom-nav');
  const role = AppState.currentUser.role;
  const leftItems = NAV_ITEMS.filter(i => i.roles.includes(role) && i.id !== 'scan');
  const scanItem = NAV_ITEMS.find(i => i.id === 'scan');

  nav.innerHTML = `
    <div class="nav-left-group">
      ${leftItems.map(item => `
        <button class="nav-item ${AppState.route === item.id ? 'active' : ''}" data-route="${item.id}">
          ${icon(item.icon, 21)}
          <span>${item.label}</span>
        </button>
      `).join('')}
    </div>
    <button class="nav-scan-fab ${AppState.route === 'scan' ? 'active' : ''}" data-route="scan" title="Scan QR">
      ${icon('qr', 24)}
      <span>Scan</span>
    </button>
  `;
  nav.querySelectorAll('[data-route]').forEach(btn => {
    btn.onclick = () => navigate(btn.dataset.route);
  });
}

/* ---------------------------------------------------------------------- *
 *  SEASONAL SKY BANNER — sun/moon rise & set along a real time-of-day arc
 * ---------------------------------------------------------------------- */
let celestialClockTimer = null;

/** Returns { visible, fraction } — fraction 0=rising at horizon, 0.5=peak, 1=setting at horizon. */
function computeCelestialFraction(isDark) {
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  if (!isDark) {
    // Sun visible 6:00–18:00
    if (h < 6 || h > 18) return { visible: false, fraction: 0 };
    return { visible: true, fraction: (h - 6) / 12 };
  } else {
    // Moon visible 18:00–06:00 (wraps past midnight)
    if (h >= 6 && h <= 18) return { visible: false, fraction: 0 };
    const hoursSince18 = h >= 18 ? h - 18 : h + 6;
    return { visible: true, fraction: hoursSince18 / 12 };
  }
}

function positionCelestialBody(el, isDark) {
  const { visible, fraction } = computeCelestialFraction(isDark);
  const f = Math.max(0, Math.min(1, fraction));
  const leftPct = 8 + f * 78;               // travels left→right across the banner
  const arcHeight = 52;                      // px of vertical arc travel
  const baseline = 58;                       // px from top at horizon (rise/set)
  const topPx = baseline - Math.sin(f * Math.PI) * arcHeight;
  el.style.left = leftPct + '%';
  el.style.top = topPx + 'px';
  el.style.opacity = visible ? '1' : '0';
}

async function renderCelestialBackground() {
  const banner = document.getElementById('sky-banner');
  if (!banner) return;
  const season = await getActiveSeason();
  const isDark = AppState.theme === 'dark';
  const skyClass = `sky-${season === 'SUMMER' ? 'summer' : 'main'}-${isDark ? 'dark' : 'light'}`;
  banner.className = `sky-banner ${skyClass}`;

  const bodyClass = isDark ? 'moon-icon' : 'sun-icon';
  banner.innerHTML = `<div class="celestial-body celestial-rising ${bodyClass}" id="celestial-body"></div>`;
  const bodyEl = document.getElementById('celestial-body');
  positionCelestialBody(bodyEl, isDark);

  if (season === 'MAIN') {
    // Main Cropping Season: overcast clouds + rain + occasional lightning flash
    const cloudLayout = [
      { left: '4%', top: '14px', w: 64, h: 22 },
      { left: '38%', top: '8px', w: 84, h: 26 },
      { left: '70%', top: '18px', w: 58, h: 20 }
    ];
    cloudLayout.forEach(c => {
      const cloud = document.createElement('div');
      cloud.className = 'sky-cloud';
      cloud.style.cssText = `left:${c.left}; top:${c.top}; width:${c.w}px; height:${c.h}px;`;
      banner.appendChild(cloud);
    });

    const rainHost = document.createElement('div');
    rainHost.style.cssText = 'position:absolute;inset:0;overflow:hidden;';
    for (let i = 0; i < 26; i++) {
      const drop = document.createElement('div');
      drop.className = 'raindrop';
      drop.style.left = Math.random() * 100 + '%';
      drop.style.animationDuration = (0.6 + Math.random() * 0.5) + 's';
      drop.style.animationDelay = (Math.random() * 2) + 's';
      rainHost.appendChild(drop);
    }
    banner.appendChild(rainHost);

    const flash = document.createElement('div');
    flash.className = 'lightning-flash';
    flash.style.animationDelay = Math.random() * 4 + 's';
    banner.appendChild(flash);
  }
}

/** Keeps the sun/moon drifting along its arc in real time while the app is open. */
function startCelestialClock() {
  if (celestialClockTimer) clearInterval(celestialClockTimer);
  celestialClockTimer = setInterval(() => {
    const bodyEl = document.getElementById('celestial-body');
    if (bodyEl) positionCelestialBody(bodyEl, AppState.theme === 'dark');
  }, 60000);
}

async function toggleTheme() {
  const body = document.getElementById('celestial-body');
  if (body) {
    body.classList.remove('celestial-rising');
    body.classList.add('celestial-setting');
  }
  setTimeout(async () => {
    AppState.theme = AppState.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', AppState.theme);
    await setLocalSetting('THEME_MODE', AppState.theme);
    document.getElementById('theme-toggle-btn').innerHTML = icon(AppState.theme === 'dark' ? 'sun' : 'moon', 17);
    await renderCelestialBackground();
  }, 260);
}

/* ---------------------------------------------------------------------- *
 *  ROUTER
 * ---------------------------------------------------------------------- */
// SCREEN_RENDERERS is declared in core.js (loaded first) and populated by screen modules:
// SCREEN_RENDERERS.dashboard = async (container, params) => {...}

async function navigate(routeId, params = {}) {
  // Release the camera if we're leaving the QR scan screen
  if (AppState.route === 'scan' && routeId !== 'scan' && typeof stopScanner === 'function') {
    stopScanner();
  }

  const sameRoute = AppState.route === routeId;
  AppState.route = routeId;
  AppState.routeParams = params;
  const container = document.getElementById('screen-container');
  if (!container) return;

  const existing = container.querySelector('.screen');

  // When re-navigating to the SAME route (e.g. switching subtabs), remove the
  // outgoing screen immediately. Otherwise it would sit in the DOM during its
  // exit animation with duplicate element IDs, causing getElementById() in the
  // freshly-rendered screen to resolve to the stale, about-to-be-removed nodes.
  if (sameRoute && existing) {
    existing.remove();
  }

  const newScreen = document.createElement('div');
  newScreen.className = 'screen screen-enter';
  container.appendChild(newScreen);

  renderBottomNav();

  const renderer = SCREEN_RENDERERS[routeId];
  if (renderer) {
    await renderer(newScreen, params);
  } else {
    newScreen.innerHTML = `<div class="content"><div class="empty-state">${icon('empty', 52)}<p>Screen not found.</p></div></div>`;
  }

  if (existing && !sameRoute) {
    existing.classList.remove('screen-enter');
    existing.classList.add('screen-exit');
    setTimeout(() => existing.remove(), 220);
  }
}

/* ---------------------------------------------------------------------- *
 *  TOAST
 * ---------------------------------------------------------------------- */
function showToast(message, type = 'info', duration = 2600) {
  const host = document.getElementById('toast-host');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 200ms ease, transform 200ms ease';
    el.style.opacity = '0';
    el.style.transform = 'translateY(-10px)';
    setTimeout(() => el.remove(), 220);
  }, duration);
}

/* ---------------------------------------------------------------------- *
 *  MODAL
 * ---------------------------------------------------------------------- */
function openModal(innerHtml, { center = false, onClose = null } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal-box ${center ? 'center' : ''}">${innerHtml}</div>`;
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal(backdrop, onClose);
  });
  document.body.appendChild(backdrop);
  return backdrop;
}

function closeModal(backdropEl, onClose) {
  if (!backdropEl) return;
  backdropEl.style.animation = 'fadeIn 160ms ease reverse';
  setTimeout(() => {
    backdropEl.remove();
    if (onClose) onClose();
  }, 150);
}

function confirmDialog(message, title = 'Please Confirm') {
  return new Promise((resolve) => {
    const backdrop = openModal(`
      <div class="modal-header"><h3>${title}</h3></div>
      <p class="text-sm" style="margin-bottom:18px;">${message}</p>
      <div style="display:flex; gap:10px;">
        <button class="btn btn-outline btn-block" id="cd-cancel">Cancel</button>
        <button class="btn btn-primary btn-block" id="cd-ok">Confirm</button>
      </div>
    `, { center: true });
    backdrop.querySelector('#cd-cancel').onclick = () => { closeModal(backdrop); resolve(false); };
    backdrop.querySelector('#cd-ok').onclick = () => { closeModal(backdrop); resolve(true); };
  });
}

/* ---------------------------------------------------------------------- *
 *  LOGOUT
 * ---------------------------------------------------------------------- */
async function confirmLogout() {
  const ok = await confirmDialog('You will need to enter your 6-digit PIN again to continue. Logout now?', 'Logout');
  if (!ok) return;
  if (typeof stopScanner === 'function') stopScanner();
  sessionStorage.removeItem('nfa_session_user');
  AppState.currentUser = null;
  renderLoginScreen();
}

/* ---------------------------------------------------------------------- *
 *  BOOT
 * ---------------------------------------------------------------------- */
window.addEventListener('DOMContentLoaded', bootApp);
