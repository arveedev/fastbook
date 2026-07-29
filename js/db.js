/**
 * NFA PASSBOOK — Offline Database Engine (Dexie.js / IndexedDB)
 */
const db = new Dexie('NFAPassbookDB');

db.version(1).stores({
  users: 'user_id, pin_hash, full_name, role, status, last_updated, is_deleted',
  systemSettings: 'setting_key, last_updated',
  warehouses: 'warehouse_id, warehouse_name, province, status, last_updated, is_deleted',
  farmers: 'passbook_id, passbook_type, rsbsa_no, last_name, farmer_org, home_province, home_municipality, warehouse_assigned, last_updated, is_deleted',
  deliveries: 'delivery_id, date_timestamp, passbook_id, rsbsa_no, warehouse_name, variety, season, year, last_updated, is_deleted',
  sequences: 'seq_key',
  syncQueue: '++id, table_name, action, timestamp',
  autoComplete: '++id, field_name, value'
});

/* ---------------------------------------------------------------------- *
 *  CRYPTO — SHA-256 PIN Hashing (native SubtleCrypto, no external lib)
 * ---------------------------------------------------------------------- */
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ---------------------------------------------------------------------- *
 *  SEED / DATABASE INITIALIZATION (runs once, safe to re-run — repairs
 *  missing defaults without ever deleting existing records)
 * ---------------------------------------------------------------------- */
async function initializeLocalDB() {
  const nowIso = new Date().toISOString();

  // Migration: rename legacy 'Officer' role to 'Warehouse Staff'
  const legacyOfficers = await db.users.filter(u => u.role === 'Officer').toArray();
  for (const u of legacyOfficers) {
    u.role = 'Warehouse Staff';
    u.last_updated = nowIso;
    await db.users.put(u);
  }

  // Seed default Administrator account (PIN: 123456) if Users table empty
  const userCount = await db.users.count();
  if (userCount === 0) {
    const pinHash = await sha256('123456');
    const adminUser = {
      user_id: 'USR-0001',
      pin_hash: pinHash,
      full_name: 'System Administrator',
      role: 'Admin',
      status: 'Active',
      last_updated: nowIso,
      is_deleted: false
    };
    await db.users.put(adminUser);
    await queueSync('users', 'upsert', adminUser);
  }

  // Seed default System Settings if empty
  const settingsCount = await db.systemSettings.count();
  if (settingsCount === 0) {
    const defaults = [
      ['AGENCY_NAME', 'NFA'],
      ['REGION_CODE', 'V'],
      ['BRANCH_NAME', 'Albay'],
      ['BRANCH_CODE', 'ALB'],
      ['TARGET_PROCUREMENT_MT', '50000'],
      ['SEASON_OVERRIDE', 'AUTO'],
      ['BAG_WEIGHT_KG', '50'],
      ['THEME_MODE', 'light'],
      ['GAS_WEBAPP_URL', ''],
      ['LAST_SYNC_TIMESTAMP', '']
    ];
    for (const [key, value] of defaults) {
      const record = { setting_key: key, setting_value: value, last_updated: nowIso };
      await db.systemSettings.put(record);
      // Device-local keys never get pushed to the shared backend.
      if (!DEVICE_LOCAL_SETTING_KEYS.includes(key)) {
        await queueSync('systemSettings', 'upsert', record);
      }
    }
  }

  // Seed a starter set of operational warehouses for the default branch (Albay)
  const whCount = await db.warehouses.count();
  if (whCount === 0) {
    const starterWarehouses = [
      { warehouse_id: 'WH-0001', warehouse_name: 'Legazpi City Warehouse', province: 'Albay', capacity_bags: 40000, status: 'Active' },
      { warehouse_id: 'WH-0002', warehouse_name: 'Tabaco Warehouse', province: 'Albay', capacity_bags: 35000, status: 'Active' },
      { warehouse_id: 'WH-0003', warehouse_name: 'Ligao Warehouse', province: 'Albay', capacity_bags: 30000, status: 'Active' },
      { warehouse_id: 'WH-0004', warehouse_name: 'Guinobatan Transport Terminal', province: 'Albay', capacity_bags: 20000, status: 'Active' }
    ];
    for (const wh of starterWarehouses) {
      const record = { ...wh, last_updated: nowIso, is_deleted: false };
      await db.warehouses.put(record);
      await queueSync('warehouses', 'upsert', record);
    }
  }
}

/* ---------------------------------------------------------------------- *
 *  SYSTEM SETTINGS — helpers
 * ---------------------------------------------------------------------- */
async function getSetting(key, fallback = '') {
  const row = await db.systemSettings.get(key);
  return row ? row.setting_value : fallback;
}

async function setSetting(key, value) {
  const record = { setting_key: key, setting_value: String(value), last_updated: new Date().toISOString() };
  await db.systemSettings.put(record);
  await queueSync('systemSettings', 'upsert', record);
}

/** Like setSetting, but for device-local preferences (e.g. THEME_MODE, this
 *  device's own backend URL) that must never be pushed to, or overwritten
 *  by, the shared cloud backend. */
async function setLocalSetting(key, value) {
  await db.systemSettings.put({ setting_key: key, setting_value: String(value), last_updated: new Date().toISOString() });
}

async function getAllSettings() {
  const rows = await db.systemSettings.toArray();
  const out = {};
  rows.forEach(r => out[r.setting_key] = r.setting_value);
  return out;
}

/* ---------------------------------------------------------------------- *
 *  SERIAL CONTROL NUMBER GENERATION
 *  Format: NFA{REGION}-{BRANCH}{YY}-{TYPE}-{SEQUENCE(4-digit)}
 * ---------------------------------------------------------------------- */
async function generateSerialNumber(passbookType) {
  const settings = await getAllSettings();
  const region = settings.REGION_CODE || 'V';
  const branch = settings.BRANCH_CODE || 'ALB';
  const yy = String(new Date().getFullYear()).slice(-2);
  const typeCode = passbookType === 'Master' ? 'MB' : 'FB';
  const seqKey = `${typeCode}-${yy}`;

  const nextSeq = await db.transaction('rw', db.sequences, async () => {
    let seqRow = await db.sequences.get(seqKey);
    const nextVal = seqRow ? seqRow.seq_value + 1 : 1;
    await db.sequences.put({ seq_key: seqKey, seq_value: nextVal });
    return nextVal;
  });

  const paddedSeq = String(nextSeq).padStart(4, '0');
  return `NFA${region}-${branch}${yy}-${typeCode}-${paddedSeq}`;
}

/* ---------------------------------------------------------------------- *
 *  SEASONAL DELIVERY QUOTA & ALLOWANCE ENGINE
 * ---------------------------------------------------------------------- */
async function getActiveSeason() {
  const override = await getSetting('SEASON_OVERRIDE', 'AUTO');
  if (override === 'SUMMER' || override === 'MAIN') return override;
  const month = new Date().getMonth(); // 0-11
  return month <= 5 ? 'SUMMER' : 'MAIN';
}

function seasonOfDate(dateVal) {
  const d = new Date(dateVal);
  return d.getMonth() <= 5 ? 'SUMMER' : 'MAIN';
}

function seasonLabel(season) {
  return season === 'SUMMER' ? 'Summer Cropping Season (Jan-Jun)' : 'Main Cropping Season (Jul-Dec)';
}

/** Computes seasonal quota, delivered bags, and remaining balance for a farmer record. */
async function computeSeasonalAllowance(farmerRecord) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const activeSeason = await getActiveSeason();

  let totalQuotaBags = 0;
  if (farmerRecord.custom_quota_bags && Number(farmerRecord.custom_quota_bags) > 0) {
    totalQuotaBags = Number(farmerRecord.custom_quota_bags);
  } else {
    totalQuotaBags = Math.floor(Number(farmerRecord.hectarage || 0) * 100);
  }

  const allDeliveries = await db.deliveries
    .where('passbook_id').equals(farmerRecord.passbook_id)
    .filter(d => !d.is_deleted)
    .toArray();

  const seasonDeliveries = allDeliveries.filter(d => {
    const dDate = new Date(d.date_timestamp);
    return dDate.getFullYear() === currentYear && seasonOfDate(d.date_timestamp) === activeSeason;
  });

  const deliveredBagsCount = seasonDeliveries.reduce((sum, item) => sum + Number(item.net_bags_equivalent || item.num_bags || 0), 0);
  const remainingBalanceBags = totalQuotaBags - deliveredBagsCount;

  return {
    activeSeason,
    activeSeasonLabel: seasonLabel(activeSeason),
    totalQuotaBags,
    deliveredBagsCount: Math.round(deliveredBagsCount * 100) / 100,
    remainingBalanceBags: Math.round(remainingBalanceBags * 100) / 100,
    isQuotaExceeded: remainingBalanceBags < 0,
    seasonDeliveries
  };
}

/* ---------------------------------------------------------------------- *
 *  SUPPLIER DISPLAY NAME AUTO-FORMATTING
 * ---------------------------------------------------------------------- */
function buildDisplayName(farmer) {
  const fullName = [farmer.first_name, farmer.middle_name, farmer.last_name].filter(Boolean).join(' ');
  if (farmer.farmer_org && farmer.farmer_org.trim() !== '') {
    return `${farmer.farmer_org} c/o ${fullName}`;
  }
  return fullName;
}

/* ---------------------------------------------------------------------- *
 *  SYNC QUEUE — offline delta sync queueing
 * ---------------------------------------------------------------------- */
async function queueSync(tableName, action, payload) {
  await db.syncQueue.add({
    table_name: tableName,
    action,
    payload: JSON.stringify(payload),
    timestamp: new Date().toISOString()
  });
  if (typeof scheduleSyncSoon === 'function') scheduleSyncSoon();
}

/* ---------------------------------------------------------------------- *
 *  AUTOCOMPLETE MEMORY — remembers barangay / street / name entries
 * ---------------------------------------------------------------------- */
async function rememberAutoComplete(fieldName, value) {
  if (!value || value.trim() === '') return;
  const existing = await db.autoComplete.where({ field_name: fieldName, value }).first();
  if (!existing) {
    await db.autoComplete.add({ field_name: fieldName, value: value.trim() });
  }
}

async function getAutoCompleteSuggestions(fieldName) {
  const rows = await db.autoComplete.where('field_name').equals(fieldName).toArray();
  return [...new Set(rows.map(r => r.value))].sort((a, b) => a.localeCompare(b));
}

/* ---------------------------------------------------------------------- *
 *  WEIGHT UNIT PREFERENCE (KG / MT) — device-local display preference
 * ---------------------------------------------------------------------- */
function getWeightUnit() {
  return localStorage.getItem('nfa_weight_unit') || 'KG';
}

function setWeightUnit(unit) {
  localStorage.setItem('nfa_weight_unit', unit);
}

/** Converts a kilogram value into the currently selected display unit and
 *  returns a formatted string WITHOUT the unit suffix (caller adds label). */
function formatWeightValue(kilos, unit) {
  unit = unit || getWeightUnit();
  const n = Number(kilos) || 0;
  if (unit === 'MT') {
    return formatComma((n / 1000).toFixed(2));
  }
  return formatComma(Math.round(n * 100) / 100);
}

function weightUnitLabel(unit) {
  unit = unit || getWeightUnit();
  return unit === 'MT' ? 'MT' : 'kg';
}

/** Renders a small KG/MT segmented toggle. Call bindWeightUnitToggle(id, onChange)
 *  after inserting the returned HTML to wire up its click behavior. */
function renderWeightUnitToggle(id) {
  const unit = getWeightUnit();
  return `
    <div class="segmented" id="${id}" style="width:auto; display:inline-flex;">
      <button type="button" data-v="KG" class="${unit === 'KG' ? 'active' : ''}" style="padding:6px 14px; font-size:11.5px;">KG</button>
      <button type="button" data-v="MT" class="${unit === 'MT' ? 'active' : ''}" style="padding:6px 14px; font-size:11.5px;">MT</button>
    </div>`;
}

function bindWeightUnitToggle(id, onChange) {
  const wrap = document.getElementById(id);
  if (!wrap) return;
  wrap.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => {
      wrap.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setWeightUnit(btn.dataset.v);
      onChange(btn.dataset.v);
    };
  });
}
function formatComma(num) {
  if (num === null || num === undefined || num === '') return '';
  const n = Number(String(num).replace(/,/g, ''));
  if (isNaN(n)) return '';
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function attachLiveCommaFormatter(inputEl) {
  inputEl.addEventListener('input', function (e) {
    const caret = e.target.selectionStart;
    const oldLen = e.target.value.length;
    let raw = e.target.value.replace(/,/g, '');
    if (raw === '' || isNaN(raw)) {
      // allow trailing decimal point while typing
      if (!/^\d*\.\d*$/.test(raw)) { return; }
    }
    const parts = raw.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    e.target.value = parts.join('.');
    const newLen = e.target.value.length;
    const newPos = caret + (newLen - oldLen);
    e.target.setSelectionRange(newPos, newPos);
  });
}

function unformatNumber(str) {
  if (str === null || str === undefined) return 0;
  const n = Number(String(str).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}
