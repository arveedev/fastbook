/**
 * NFA PASSBOOK — Delta Synchronization Engine
 * Talks to a Google Apps Script Web App (see /gas/Code.gs) configured
 * by the Admin in Settings. The app is fully functional offline without
 * this being configured — sync is an optional cloud-backup / multi-device
 * feature layered on top of the local Dexie database.
 */
const SYNC_TABLE_MAP = {
  farmers: 'Farmers',
  warehouses: 'Warehouses',
  deliveries: 'Deliveries',
  users: 'Users',
  systemSettings: 'SystemSettings'
};

let syncInProgress = false;

function isOnline() {
  return navigator.onLine;
}

async function getGasUrl() {
  return await getSetting('GAS_WEBAPP_URL', '');
}

/** Runs a full pull (delta) + push cycle. Returns a summary object. */
async function runSync(logFn = () => {}) {
  if (syncInProgress) return { status: 'busy' };
  const url = await getGasUrl();
  if (!url) return { status: 'not_configured' };
  if (!isOnline()) return { status: 'offline' };

  syncInProgress = true;
  try {
    logFn('Connecting to backend...');
    const pushResult = await pushLocalChanges(url, logFn);
    const pullResult = await pullRemoteChanges(url, logFn);
    return { status: 'success', pushed: pushResult, pulled: pullResult };
  } catch (err) {
    logFn('Sync error: ' + err.message);
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
  for (const item of queued) {
    const sheetName = SYNC_TABLE_MAP[item.table_name] || item.table_name;
    if (!payload[sheetName]) payload[sheetName] = [];
    payload[sheetName].push(JSON.parse(item.payload));
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'syncPush', payload })
  });
  const data = await res.json();

  if (data.status === 'success') {
    const ids = queued.map(q => q.id);
    await db.syncQueue.bulkDelete(ids);
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
  const data = await res.json();

  if (data.status !== 'success') throw new Error(data.message || 'Pull sync failed');

  let mergedCount = 0;
  await db.transaction('rw', db.farmers, db.warehouses, db.deliveries, db.users, db.systemSettings, async () => {
    for (const [sheetName, rows] of Object.entries(data.data)) {
      const localTable = Object.keys(SYNC_TABLE_MAP).find(k => SYNC_TABLE_MAP[k] === sheetName);
      if (!localTable || !rows.length) continue;
      for (const row of rows) {
        if (row.is_deleted === true || row.is_deleted === 'TRUE') {
          const pk = Object.keys(row)[0];
          await db[localTable].delete(row[pk]);
        } else {
          await db[localTable].put(row);
        }
        mergedCount++;
      }
    }
  });

  await setSetting('LAST_SYNC_TIMESTAMP', data.timestamp);
  logFn(`Pull complete: ${mergedCount} record(s) merged.`);
  return { count: mergedCount };
}

/** Calls the backend's initDB / repair routine (Admin only). */
async function triggerRemoteRepair() {
  const url = await getGasUrl();
  if (!url) throw new Error('No backend URL configured in Settings.');
  const res = await fetch(`${url}?action=initDB`, { method: 'GET' });
  return await res.json();
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
  return await res.json();
}

// Auto-sync opportunistically whenever the browser regains connectivity
window.addEventListener('online', async () => {
  const url = await getGasUrl();
  if (url) runSync().catch(() => {});
});
