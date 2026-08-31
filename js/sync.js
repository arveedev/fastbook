/**
 * NFA PASSBOOK — Delta Synchronization Engine
 * Talks to a Google Apps Script Web App (see /gas/Code.gs) configured
 * by the Admin in Settings. The app is fully functional offline without
 * this being configured — sync runs automatically in the background
 * whenever a backend URL is set and the device is online, keeping every
 * user's data (and Admin-configured settings) converged with Google Sheets
 * without anyone needing to press a button.
 */
const SYNC_TABLE_MAP = {
  farmers: 'Farmers',
  warehouses: 'Warehouses',
  deliveries: 'Deliveries',
  users: 'Users',
  systemSettings: 'SystemSettings'
};

const PRIMARY_KEY_FIELDS = {
  farmers: 'passbook_id',
  warehouses: 'warehouse_id',
  deliveries: 'delivery_id',
  users: 'user_id',
  systemSettings: 'setting_key'
};

// Settings that are specific to THIS device/browser and must never be pushed
// to, or overwritten from, the shared backend (e.g. each device connects to
// the backend independently; theme is a personal display preference).
const DEVICE_LOCAL_SETTING_KEYS = ['GAS_WEBAPP_URL', 'THEME_MODE', 'LAST_SYNC_TIMESTAMP', 'LAST_SYNC_ERROR', 'LAST_SYNC_ERROR_AT', 'REPAIR_RUN_FOR_URL', 'REPAIR_RUN_VERSION'];

let syncInProgress = false;
let backgroundSyncTimer = null;
let mutationSyncDebounce = null;
let lastSyncErrorShown = false;

function isOnline() {
  return navigator.onLine;
}

async function getGasUrl() {
  return await getSetting('GAS_WEBAPP_URL', '');
}

// Bump this whenever the backend repair logic changes in a way that needs
// to re-run on devices that already completed an earlier version of it
// (e.g. this fix protects birth_date from Sheets' date auto-conversion,
// which an earlier repair version didn't cover; v3 backfills a missing
// last_updated on rows added directly to the Sheet, which were otherwise
// invisible to every delta sync after the first; v4 installs the daily
// vacuum trigger that permanently removes old soft-deleted rows).
const REPAIR_LOGIC_VERSION = '4';

/** Runs the backend's schema/format repair whenever the repair logic itself
 *  has changed since this device last ran it (tracked by version, not just
 *  URL) — not something that requires an Admin to remember to click. This is
 *  what applies the plain-text column formatting that stops Google Sheets
 *  from silently corrupting RSBSA numbers, birth dates, phone numbers, and
 *  IDs into dates/timestamps. Without this having actually run, that
 *  corruption fix never takes effect. */
async function ensureRemoteRepairRun(url) {
  const flagKey = 'REPAIR_RUN_FOR_URL';
  const versionKey = 'REPAIR_RUN_VERSION';
  const alreadyRunFor = await getSetting(flagKey, '');
  const alreadyRunVersion = await getSetting(versionKey, '');
  if (alreadyRunFor === url && alreadyRunVersion === REPAIR_LOGIC_VERSION) return;
  try {
    await triggerRemoteRepair();
    await setLocalSetting(flagKey, url);
    await setLocalSetting(versionKey, REPAIR_LOGIC_VERSION);
  } catch (e) {
    // Will simply retry on the next sync cycle since the flags weren't set.
  }
}

/** Safely parses a fetch Response as JSON, producing a clear error instead of
 *  a cryptic "Unexpected token '<'" when the backend returns an HTML page
 *  (e.g. a Google login/error page from a misconfigured or undeployed
 *  Apps Script Web App URL). */
async function parseJsonResponse(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    if (text.trim().startsWith('<')) {
      throw new Error('Backend returned a webpage instead of data. Double-check the Web App URL in Settings, and that the Apps Script deployment access is set to "Anyone".');
    }
    throw new Error('Backend returned an unreadable response: ' + text.slice(0, 120));
  }
}

/** Runs a full pull (delta) + push cycle. Pulling first ensures a device
 *  (especially one syncing for the very first time) sees the authoritative
 *  server state before pushing anything, so a fresh device's own local
 *  defaults can never clobber real data another device already published. */
async function runSync(logFn = () => {}) {
  if (syncInProgress) return { status: 'busy' };
  const url = await getGasUrl();
  if (!url) return { status: 'not_configured' };
  if (!isOnline()) return { status: 'offline' };

  syncInProgress = true;
  try {
    logFn('Connecting to backend...');
    await ensureRemoteRepairRun(url);
    const pullResult = await pullRemoteChanges(url, logFn);
    const pushResult = await pushLocalChanges(url, logFn);
    await setLocalSetting('LAST_SYNC_ERROR', '');
    lastSyncErrorShown = false;
    return { status: 'success', pushed: pushResult, pulled: pullResult };
  } catch (err) {
    logFn('Sync error: ' + err.message);
    await setLocalSetting('LAST_SYNC_ERROR', err.message);
    await setLocalSetting('LAST_SYNC_ERROR_AT', new Date().toISOString());
    // Surface a one-time toast for background failures so they're never
    // completely silent — but don't spam on every retry.
    if (!lastSyncErrorShown && typeof showToast === 'function') {
      lastSyncErrorShown = true;
      showToast('Background sync failed: ' + err.message, 'error', 5000);
    }
    return { status: 'error', message: err.message };
  } finally {
    syncInProgress = false;
  }
}

/** Pushes queued local additions/updates to the backend in a single batch POST. */
async function pushLocalChanges(url, logFn) {
  const queued = await db.syncQueue.toArray();
  if (queued.length === 0) {
    logFn('No local changes to push.');
    return { count: 0 };
  }

  logFn(`Pushing ${queued.length} local change(s)...`);
  const payload = {};
  const idsToDelete = [];

  for (const item of queued) {
    let parsed;
    try { parsed = JSON.parse(item.payload); } catch (e) { idsToDelete.push(item.id); continue; }

    // Never push device-local settings (e.g. this device's own backend URL, theme).
    if (item.table_name === 'systemSettings' && DEVICE_LOCAL_SETTING_KEYS.includes(parsed.setting_key)) {
      idsToDelete.push(item.id);
      continue;
    }

    // Staleness check: if the pull that just ran (runSync pulls before pushing)
    // already changed — or deleted — this exact record, the server's version
    // wins and we drop our queued snapshot instead of re-clobbering the data
    // we just accepted. This protects a brand-new device's freshly-seeded
    // local defaults from overwriting real data another device already
    // published, and — just as importantly — stops a device that never knew
    // about a deletion from reviving a record another device deleted: if the
    // pull's hard-delete already removed it locally, `currentLocal` will be
    // undefined here, which is exactly the case to drop rather than push.
    const pkField = PRIMARY_KEY_FIELDS[item.table_name];
    if (pkField && db[item.table_name]) {
      const pkValue = parsed[pkField];
      const currentLocal = await db[item.table_name].get(pkValue);
      if (!currentLocal || currentLocal.last_updated !== parsed.last_updated) {
        idsToDelete.push(item.id);
        continue;
      }
    }

    const sheetName = SYNC_TABLE_MAP[item.table_name] || item.table_name;
    if (!payload[sheetName]) payload[sheetName] = [];
    payload[sheetName].push(parsed);
    idsToDelete.push(item.id);
  }

  if (Object.keys(payload).length === 0) {
    // Nothing left to push after filtering — still clear the queue of those
    // local-only / superseded entries so it doesn't grow forever.
    await db.syncQueue.bulkDelete(idsToDelete);
    logFn('No local changes to push.');
    return { count: 0 };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'syncPush', payload })
  });
  const data = await parseJsonResponse(res);

  if (data.status === 'success') {
    await db.syncQueue.bulkDelete(idsToDelete);
    logFn(`Push complete: ${data.summary.inserted} inserted, ${data.summary.updated} updated.`);
  } else {
    throw new Error(data.message || 'Push sync failed');
  }
  return data.summary;
}

/** Pulls delta changes from the backend since the last successful sync. */
async function pullRemoteChanges(url, logFn) {
  const since = await getSetting('LAST_SYNC_TIMESTAMP', '');
  logFn(since ? `Pulling changes since ${since}...` : 'Pulling full dataset (first sync)...');

  const qs = new URLSearchParams({ action: 'getInitialData', since: since || '' });
  const res = await fetch(`${url}?${qs.toString()}`, { method: 'GET' });
  const data = await parseJsonResponse(res);

  if (data.status !== 'success') throw new Error(data.message || 'Pull sync failed');

  let mergedCount = 0;
  await db.transaction('rw', db.farmers, db.warehouses, db.deliveries, db.users, db.systemSettings, async () => {
    for (const [sheetName, rows] of Object.entries(data.data)) {
      const localTable = Object.keys(SYNC_TABLE_MAP).find(k => SYNC_TABLE_MAP[k] === sheetName);
      if (!localTable || !rows.length) continue;
      for (const row of rows) {
        // Never let a remote row overwrite this device's own local-only settings.
        if (localTable === 'systemSettings' && DEVICE_LOCAL_SETTING_KEYS.includes(row.setting_key)) continue;

        const pk = Object.keys(row)[0];
        // Google Sheets can hand back is_deleted as the literal string
        // "true"/"false" instead of a real boolean (a plain-text-formatted
        // cell stores whatever was last written to it as text). Normalize
        // here, once, so every `!record.is_deleted` check throughout the
        // app can keep trusting it's a real boolean — a stray truthy string
        // would otherwise silently hide the record everywhere downstream.
        if ('is_deleted' in row) {
          row.is_deleted = row.is_deleted === true || row.is_deleted === 'TRUE' || row.is_deleted === 'true';
        }
        if (row.is_deleted === true) {
          await db[localTable].delete(row[pk]);
        } else {
          await db[localTable].put(row);
        }
        mergedCount++;
      }
    }
  });

  await setLocalSetting('LAST_SYNC_TIMESTAMP', data.timestamp);
  logFn(`Pull complete: ${mergedCount} record(s) merged.`);
  return { count: mergedCount };
}

/** Calls the backend's initDB / repair routine (Admin only). */
async function triggerRemoteRepair() {
  const url = await getGasUrl();
  if (!url) throw new Error('No backend URL configured in Settings.');
  const res = await fetch(`${url}?action=initDB`, { method: 'GET' });
  return await parseJsonResponse(res);
}

/** Calls the backend's one-time farmer-deduplication routine (Admin only). */
async function triggerRemoteDedupe() {
  const url = await getGasUrl();
  if (!url) throw new Error('No backend URL configured in Settings.');
  const res = await fetch(`${url}?action=dedupeFarmers`, { method: 'GET' });
  return await parseJsonResponse(res);
}

/** Calls the backend's passbook_id renumbering routine (Admin only). */
async function triggerRemoteRenumber() {
  const url = await getGasUrl();
  if (!url) throw new Error('No backend URL configured in Settings.');
  const res = await fetch(`${url}?action=renumberPassbookIds`, { method: 'GET' });
  return await parseJsonResponse(res);
}

/** Authenticates a PIN against the remote backend (used as a fallback / cross-device check). */
async function authenticateRemote(pinHash) {
  const url = await getGasUrl();
  if (!url) return { status: 'not_configured' };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'authenticatePin', payload: { pin_hash: pinHash } })
  });
  return await parseJsonResponse(res);
}

/* ---------------------------------------------------------------------- *
 *  AUTOMATIC BACKGROUND SYNC
 *  Runs silently on an interval, and shortly after any local data change,
 *  so every device (and Google Sheets) converge without manual action.
 * ---------------------------------------------------------------------- */
const BACKGROUND_SYNC_INTERVAL_MS = 45000;

function startBackgroundSync() {
  if (backgroundSyncTimer) clearInterval(backgroundSyncTimer);
  backgroundSyncTimer = setInterval(() => {
    runSync().catch(() => {});
  }, BACKGROUND_SYNC_INTERVAL_MS);
}

/** Called by queueSync() after every local create/update so changes reach
 *  the backend within a few seconds instead of waiting for the next interval. */
function scheduleSyncSoon() {
  clearTimeout(mutationSyncDebounce);
  mutationSyncDebounce = setTimeout(() => {
    runSync().catch(() => {});
  }, 4000);
}

// Auto-sync opportunistically whenever the browser regains connectivity
window.addEventListener('online', async () => {
  const url = await getGasUrl();
  if (url) runSync().catch(() => {});
});
