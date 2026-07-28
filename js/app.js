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
  { id: 'dashboard', label: 'Dashboard', roles: ['Admin', 'Officer'], icon: 'grid' },
  { id: 'passbooks', label: 'Passbooks', roles: ['Admin', 'Officer'], icon: 'book' },
  { id: 'scan', label: 'Scan QR', roles: ['Admin', 'Officer'], icon: 'qr' },
  { id: 'reports', label: 'Reports', roles: ['Admin', 'Officer'], icon: 'chart' },
  { id: 'settings', label: 'Settings', roles: ['Admin', 'Officer'], icon: 'gear' }
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

  // opportunistic background sync on load if configured & online
  const gasUrl = await getSetting('GAS_WEBAPP_URL', '');
  if (gasUrl && isOnline()) runSync().catch(() => {});
}

/* ---------------------------------------------------------------------- *
 *  APP SHELL (post-login)
 * ---------------------------------------------------------------------- */
async function renderAppShell() {
  const root = document.getElementById('app-root');
  const settings = await getAllSettings();
  root.innerHTML = `
    <div class="celestial-layer" id="celestial-layer"></div>
    <div class="topbar">
      <div class="logo-badge">NFA</div>
      <div class="title-block">
        <h1>${settings.AGENCY_NAME || 'NFA'} Passbook — ${settings.BRANCH_NAME || ''} Branch</h1>
        <span>${getRegionName(settings.REGION_CODE || 'V')}</span>
      </div>
      <button class="icon-btn" id="theme-toggle-btn" title="Toggle theme">${icon(AppState.theme === 'dark' ? 'sun' : 'moon', 17)}</button>
      <button class="icon-btn" id="logout-btn" title="Logout">${icon('logout', 17)}</button>
    </div>
    <div id="season-badge-host"></div>
    <div id="screen-container" style="position:relative; flex:1; overflow:hidden;"></div>
    <div class="bottom-nav" id="bottom-nav"></div>
    <div id="toast-host"></div>
    <div id="print-area"></div>
  `;

  document.getElementById('theme-toggle-btn').onclick = toggleTheme;
  document.getElementById('logout-btn').onclick = confirmLogout;

  await renderCelestialBackground();
  await renderSeasonBadge();
  renderBottomNav();
}

async function renderSeasonBadge() {
  const season = await getActiveSeason();
  const host = document.getElementById('season-badge-host');
  if (!host) return;
  host.innerHTML = `
    <div class="season-badge">
      <span class="dot"></span>
      ${seasonLabel(season)}
      <span class="text-muted" style="margin-left:auto;">${AppState.currentUser.full_name} · ${AppState.currentUser.role}</span>
    </div>`;
}

function renderBottomNav() {
  const nav = document.getElementById('bottom-nav');
  const role = AppState.currentUser.role;
  nav.innerHTML = NAV_ITEMS.filter(i => i.roles.includes(role)).map(item => `
    <button class="nav-item ${AppState.route === item.id ? 'active' : ''}" data-route="${item.id}">
      ${icon(item.icon, 21)}
      <span>${item.label}</span>
    </button>
  `).join('');
  nav.querySelectorAll('.nav-item').forEach(btn => {
    btn.onclick = () => navigate(btn.dataset.route);
  });
}

/* ---------------------------------------------------------------------- *
 *  SEASONAL CELESTIAL BACKGROUND ENGINE
 * ---------------------------------------------------------------------- */
async function renderCelestialBackground() {
  const layer = document.getElementById('celestial-layer');
  if (!layer) return;
  const season = await getActiveSeason();
  const isDark = AppState.theme === 'dark';
  const skyClass = `sky-${season === 'SUMMER' ? 'summer' : 'main'}-${isDark ? 'dark' : 'light'}`;
  layer.className = `celestial-layer ${skyClass}`;

  const bodyClass = isDark ? 'moon-icon' : 'sun-icon';
  layer.innerHTML = `<div class="celestial-body ${bodyClass}" id="celestial-body"></div>`;

  if (season === 'MAIN') {
    // Main Cropping Season: overcast + rain effect
    const rainHost = document.createElement('div');
    rainHost.style.cssText = 'position:absolute;inset:0;overflow:hidden;';
    for (let i = 0; i < 34; i++) {
      const drop = document.createElement('div');
      drop.className = 'raindrop';
      drop.style.left = Math.random() * 100 + '%';
      drop.style.animationDuration = (0.7 + Math.random() * 0.6) + 's';
      drop.style.animationDelay = (Math.random() * 2) + 's';
      drop.style.opacity = 0.18;
      rainHost.appendChild(drop);
    }
    layer.appendChild(rainHost);
  }
}

async function toggleTheme() {
  const body = document.getElementById('celestial-body');
  if (body) {
    body.classList.add(AppState.theme === 'dark' ? 'celestial-hide-up' : 'celestial-hide-down');
  }
  setTimeout(async () => {
    AppState.theme = AppState.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', AppState.theme);
    await setSetting('THEME_MODE', AppState.theme);
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

  await renderSeasonBadge();
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
