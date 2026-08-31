/**
 * NFA PASSBOOK BACKEND ENGINE & DATABASE AUTO-REPAIR
 * Google Apps Script Web App Engine
 *
 * DEPLOYMENT:
 * 1. Create a new Google Sheet (this will be your database).
 * 2. Open Extensions > Apps Script, delete any starter code, and paste this file's contents.
 * 3. Click Deploy > New deployment > Type: "Web app".
 *    - Execute as: Me
 *    - Who has access: Anyone (or "Anyone within [organization]" for internal-only use)
 * 4. Copy the deployed Web App URL and paste it into the NFA Passbook app under
 *    Settings > Sync & Backend > Google Apps Script Web App URL.
 * 5. From the app, tap "Trigger Database Repair Routine" (or call ?action=initDB once
 *    manually in a browser) to auto-create all sheet tabs, headers, and the default
 *    Admin account (PIN: 123456).
 */

/**
 * Creates a custom menu in the Google Sheets UI.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Data Schema')
    .addItem('Get Specific Sheet Schema', 'showSchemaPicker')
    .addToUi();
}

// Define Mandatory Spreadsheet Schemas
const DB_SCHEMA = {
  Users: [
    'user_id', 'pin_hash', 'full_name', 'role', 'status', 'last_updated', 'is_deleted'
  ],
  SystemSettings: [
    'setting_key', 'setting_value', 'last_updated'
  ],
  Farmers: [
    'passbook_id', 'passbook_type', 'first_name', 'middle_name', 'last_name',
    'farmer_org', 'home_province', 'home_municipality', 'home_barangay',
    'farm_province', 'farm_municipality', 'farm_barangay', 'hectarage', 'birth_date',
    'civil_status', 'spouse_name', 'contact_no', 'gender', 'sector',
    'irrigated', 'landholding_data', 'rsbsa_no', 'warehouse_assigned',
    'custom_quota_bags', 'created_at', 'last_updated', 'is_deleted'
  ],
  Warehouses: [
    'warehouse_id', 'warehouse_name', 'province', 'capacity_bags', 'status', 'last_updated', 'is_deleted'
  ],
  Deliveries: [
    'delivery_id', 'date_timestamp', 'passbook_id', 'rsbsa_no', 'display_name',
    'warehouse_name', 'num_bags', 'net_kilos', 'net_bags_equivalent', 'variety', 'season', 'year',
    'recorded_by', 'override_comment', 'last_updated', 'is_deleted'
  ]
};

function doGet(e) {
  const action = e.parameter ? e.parameter.action : null;
  if (action === 'initDB') return jsonResponse(initializeOrRepairDB());
  if (action === 'getInitialData') return jsonResponse(getInitialData(e.parameter.since));
  if (action === 'dedupeFarmers') return jsonResponse(dedupeFarmers());
  if (action === 'vacuumDeleted') return jsonResponse(runVacuum());
  if (action === 'renumberPassbookIds') return jsonResponse(renumberPassbookIds());
  if (action === 'createMissingOrgPassbooks') return jsonResponse(createMissingOrgPassbooks());
  return jsonResponse({ status: 'error', message: 'Invalid GET endpoint request' });
}

function doPost(e) {
  try {
    const contents = JSON.parse(e.postData.contents);
    const action = contents.action;
    const payload = contents.payload;

    switch (action) {
      case 'syncPush':
        return jsonResponse(processPushSync(payload));
      case 'authenticatePin':
        return jsonResponse(authenticateUser(payload.pin_hash));
      default:
        return jsonResponse({ status: 'error', message: 'Unknown POST action' });
    }
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Creates missing sheets, adds missing column headers without removing data,
 * and sets default admin user and settings if missing.
 */
// Columns that are genuinely numeric or date-typed — every other column gets
// forced to plain text so Google Sheets never silently reinterprets things
// like RSBSA numbers, phone numbers, or serial IDs as dates or numbers.
const NUMERIC_OR_DATE_COLUMNS = new Set([
  'hectarage', 'capacity_bags', 'num_bags', 'net_kilos', 'net_bags_equivalent',
  'custom_quota_bags', 'year', 'birth_date'
]);

// is_deleted must stay a real boolean, never plain text: forcing its column
// to text format ('@') makes Sheets store any write of the JS boolean false
// as the literal string "false" — which every `!record.is_deleted` check in
// the app then reads as truthy (deleted), silently hiding the record. This
// bit everyone the first time dedupeFarmers() rewrote the whole column.
const BOOLEAN_COLUMNS = new Set(['is_deleted']);

/** Forces every non-numeric/non-date/non-boolean column to plain-text format
 *  so Sheets never auto-converts values like "05-12-34-000123" into a date.
 *  Applied to a generous row range so it also protects rows added after
 *  this runs. */
function enforceTextColumnFormats(sheet, headers) {
  const maxRows = Math.max(sheet.getMaxRows(), 5000);
  headers.forEach((header, idx) => {
    if (BOOLEAN_COLUMNS.has(header)) {
      // Actively undo the '@' text format every earlier repair run applied
      // here (before is_deleted was excluded) — otherwise cells stay stuck
      // as text even though we've stopped re-applying '@' going forward.
      sheet.getRange(2, idx + 1, maxRows - 1, 1).setNumberFormat('General');
      return;
    }
    if (NUMERIC_OR_DATE_COLUMNS.has(header)) return;
    sheet.getRange(2, idx + 1, maxRows - 1, 1).setNumberFormat('@');
  });
}

/** Rows added directly in the Sheet (bulk paste/import) never get a
 *  `last_updated` value written by the app. getInitialData()'s delta filter
 *  treats a blank/unparsable last_updated as "not changed" and excludes the
 *  row from every sync after the very first one, so such rows silently never
 *  reach any device again. Stamping them here — and having the delta filter
 *  fail open on unparsable values as a second line of defense — fixes both
 *  existing rows and the pull itself. */
function backfillMissingLastUpdated(sheet, headers) {
  const lastUpdatedIdx = headers.indexOf('last_updated');
  if (lastUpdatedIdx === -1 || sheet.getLastRow() <= 1) return 0;

  const numRows = sheet.getLastRow() - 1;
  const range = sheet.getRange(2, lastUpdatedIdx + 1, numRows, 1);
  const values = range.getValues();
  const now = new Date().toISOString();
  let count = 0;

  for (let i = 0; i < values.length; i++) {
    const cell = values[i][0];
    const isValidDate = Object.prototype.toString.call(cell) === '[object Date]' && !isNaN(cell.getTime());
    const isValidString = typeof cell === 'string' && cell.trim() !== '' && !isNaN(new Date(cell).getTime());
    if (!isValidDate && !isValidString) {
      values[i][0] = now;
      count++;
    }
  }

  if (count > 0) range.setValues(values);
  return count;
}

/** Repairs is_deleted cells that got stored as the literal text "true"/
 *  "false" (a Google Sheets quirk: writing a JS boolean into a cell that
 *  has plain-text ('@') number format stores it as a string, not a real
 *  boolean) back into real booleans. Every `!record.is_deleted` check in
 *  the app treats a non-empty string — including "false" — as truthy, so a
 *  row stuck this way is silently hidden everywhere despite not actually
 *  being deleted. */
function normalizeBooleanColumns(sheet, headers) {
  const luIdx = headers.indexOf('last_updated');
  const now = new Date().toISOString();
  let totalFixed = 0;
  headers.forEach((header, idx) => {
    if (!BOOLEAN_COLUMNS.has(header) || sheet.getLastRow() <= 1) return;
    const numRows = sheet.getLastRow() - 1;
    const range = sheet.getRange(2, idx + 1, numRows, 1);
    const values = range.getValues();
    const fixedRowNumbers = []; // 1-based sheet row numbers
    for (let i = 0; i < values.length; i++) {
      const cell = values[i][0];
      if (typeof cell === 'boolean') continue;
      if (cell === 'true' || cell === 'TRUE') { values[i][0] = true; fixedRowNumbers.push(i + 2); }
      else if (cell === 'false' || cell === 'FALSE' || cell === '') { values[i][0] = false; fixedRowNumbers.push(i + 2); }
    }
    if (fixedRowNumbers.length > 0) {
      range.setValues(values);
      // A corrected row's last_updated must be bumped too, or delta sync has
      // no signal that anything changed — every device that already cached
      // the broken (string) value locally would otherwise never re-pull the
      // fix and would keep showing the record as hidden indefinitely.
      if (luIdx !== -1) {
        sheet.getRangeList(fixedRowNumbers.map(r => sheet.getRange(r, luIdx + 1).getA1Notation())).setValue(now);
      }
    }
    totalFixed += fixedRowNumbers.length;
  });
  return totalFixed;
}

function initializeOrRepairDB() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = [];

  Object.keys(DB_SCHEMA).forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      log.push(`Created sheet tab: '${sheetName}'`);
    }

    const expectedHeaders = DB_SCHEMA[sheetName];
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
      sheet.getRange(1, 1, 1, expectedHeaders.length)
           .setFontWeight("bold")
           .setBackground("#003366")
           .setFontColor("#FFFFFF");
      log.push(`Initialized headers for sheet: '${sheetName}'`);
    } else {
      const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      expectedHeaders.forEach(header => {
        if (existingHeaders.indexOf(header) === -1) {
          const nextCol = existingHeaders.length + 1;
          sheet.getRange(1, nextCol).setValue(header).setFontWeight("bold");
          existingHeaders.push(header);
          log.push(`Repaired schema: Added column '${header}' to '${sheetName}'`);
        }
      });
    }

    enforceTextColumnFormats(sheet, DB_SCHEMA[sheetName]);
    log.push(`Enforced plain-text formatting on '${sheetName}' to prevent auto-conversion of RSBSA/ID/phone values`);

    const backfilled = backfillMissingLastUpdated(sheet, DB_SCHEMA[sheetName]);
    if (backfilled > 0) {
      log.push(`Backfilled 'last_updated' on ${backfilled} row(s) in '${sheetName}' (rows with a blank last_updated were invisible to delta sync)`);
    }

    const normalized = normalizeBooleanColumns(sheet, DB_SCHEMA[sheetName]);
    if (normalized > 0) {
      log.push(`Fixed ${normalized} is_deleted cell(s) in '${sheetName}' that had been stored as text ("true"/"false") instead of a real boolean, which was hiding those records from every device.`);
    }
  });

  // Seed Default Admin Account if Users tab is empty (Default PIN: 123456 -> SHA256 Hash)
  const userSheet = ss.getSheetByName('Users');
  if (userSheet.getLastRow() === 1) {
    userSheet.appendRow([
      'USR-0001',
      '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', // SHA-256 for 123456
      'System Administrator',
      'Admin',
      'Active',
      new Date().toISOString(),
      false
    ]);
    log.push('Seeded initial default Admin account (PIN: 123456)');
  }

  // Seed System Settings if empty
  const settingsSheet = ss.getSheetByName('SystemSettings');
  if (settingsSheet.getLastRow() === 1) {
    const defaultSettings = [
      ['AGENCY_NAME', 'NFA', new Date().toISOString()],
      ['REGION_CODE', 'V', new Date().toISOString()],
      ['BRANCH_NAME', 'Albay', new Date().toISOString()],
      ['BRANCH_CODE', 'ALB', new Date().toISOString()],
      ['TARGET_PROCUREMENT_MT', '50000', new Date().toISOString()],
      ['SEASON_OVERRIDE', 'AUTO', new Date().toISOString()]
    ];
    defaultSettings.forEach(setting => settingsSheet.appendRow(setting));
    log.push('Seeded default System Settings');
  }

  if (ensureVacuumTriggerInstalled()) {
    log.push(`Installed daily vacuum trigger (permanently removes rows soft-deleted for over ${VACUUM_SAFETY_DAYS} days).`);
  }

  return { status: 'success', repair_logs: log };
}

/**
 * One-time (safe to re-run) cleanup for Farmers rows that were bulk-imported
 * into the Sheet multiple times, producing several passbook_ids for the same
 * person. Identity is matched by first + middle + last name + RSBSA no. —
 * verified against the actual data to be an exact match (duplicates from a
 * repeated import are byte-identical apart from passbook_id/created_at), so
 * no field-level merging is needed. Keeps the row with the lowest
 * passbook_id per group and soft-deletes the rest (is_deleted = true, not a
 * hard delete) so the existing delta-sync mechanism tells every device that
 * already cached a duplicate passbook_id to remove it locally too.
 */
function dedupeFarmers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Farmers');
  if (!sheet || sheet.getLastRow() <= 1) {
    return { status: 'success', removed: 0, log: ['Farmers sheet is empty — nothing to dedupe.'] };
  }

  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const pbIdx = headers.indexOf('passbook_id');
  const fnIdx = headers.indexOf('first_name');
  const mnIdx = headers.indexOf('middle_name');
  const lnIdx = headers.indexOf('last_name');
  const rsbsaIdx = headers.indexOf('rsbsa_no');
  const luIdx = headers.indexOf('last_updated');
  const delIdx = headers.indexOf('is_deleted');

  const groups = {};
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (row[delIdx] === true || row[delIdx] === 'TRUE') continue; // already-removed rows aren't dedupe candidates
    const key = [row[fnIdx], row[mnIdx], row[lnIdx], row[rsbsaIdx]].join('|').toUpperCase();
    (groups[key] = groups[key] || []).push(r);
  }

  const now = new Date().toISOString();
  let removed = 0;
  const changedRows = []; // 1-based sheet row numbers, for a targeted write below

  Object.values(groups).forEach(rowIndexes => {
    if (rowIndexes.length < 2) return;
    rowIndexes.sort((a, b) => String(values[a][pbIdx]).localeCompare(String(values[b][pbIdx])));
    for (let i = 1; i < rowIndexes.length; i++) {
      const idx = rowIndexes[i];
      changedRows.push(idx + 1);
      removed++;
    }
  });

  // Write only the rows that actually changed — never rewrite untouched
  // survivor rows. (Both changed values are identical across every changed
  // row here, so RangeList.setValue can do it in two calls.)
  if (removed > 0) {
    sheet.getRangeList(changedRows.map(r => sheet.getRange(r, delIdx + 1).getA1Notation())).setValue(true);
    sheet.getRangeList(changedRows.map(r => sheet.getRange(r, luIdx + 1).getA1Notation())).setValue(now);
  }

  const result = {
    status: 'success',
    removed: removed,
    log: [`Removed ${removed} duplicate farmer record(s), keeping the earliest passbook_id per unique farmer (matched by name + RSBSA no.).`]
  };
  Logger.log(JSON.stringify(result)); // visible under View > Executions when run manually from the Apps Script editor
  return result;
}

/** Convenience entry point: select this function in the Apps Script editor's
 *  function dropdown and click Run to dedupe directly, with no web app
 *  deployment or app UI needed. Check View > Executions afterward for the
 *  result log. */
function runDedupeFarmersManually() {
  dedupeFarmers();
}

/**
 * Renumbers surviving Farmers passbook_ids into a clean, gapless sequence
 * per prefix (region/branch/year/type) — cleans up the sparse numbering
 * left behind once dedupeFarmers() removes most rows out of each
 * duplicate-import batch (e.g. survivors like ...FB-0002, ...FB-0235,
 * ...FB-1077 become ...FB-0001, ...FB-0002, ...FB-0003).
 *
 * Implemented as soft-delete-old + insert-new, never an in-place edit of
 * passbook_id: that column is the client's local primary key, and the sync
 * protocol only understands insert / update-by-key / delete — it has no way
 * to recognize "this is the same row, renamed." An in-place edit would
 * silently orphan the old record on every device that already synced it.
 * Cascades the rename into Deliveries, where delivery_id (not passbook_id)
 * is the primary key, so that update is a normal, safe field edit.
 *
 * WARNING (admin judgment call, not enforced by the code): only run this
 * before passbook IDs are printed/handed out. Any already-issued physical
 * ID card or QR code becomes invalid once its passbook_id changes.
 */
function renumberPassbookIds() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const farmersSheet = ss.getSheetByName('Farmers');
  if (!farmersSheet || farmersSheet.getLastRow() <= 1) {
    return { status: 'success', renamed: 0, log: ['Farmers sheet is empty — nothing to renumber.'] };
  }

  const values = farmersSheet.getDataRange().getValues();
  const headers = values[0];
  const pbIdx = headers.indexOf('passbook_id');
  const luIdx = headers.indexOf('last_updated');
  const delIdx = headers.indexOf('is_deleted');

  const ID_RE = /^(.*-)(\d+)$/;
  const groups = {}; // prefix -> [{ rowIdx, seq, width }]

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (row[delIdx] === true || row[delIdx] === 'TRUE') continue;
    const m = ID_RE.exec(String(row[pbIdx]));
    if (!m) continue; // unexpected format — leave untouched rather than guess
    const prefix = m[1];
    (groups[prefix] = groups[prefix] || []).push({ rowIdx: r, seq: parseInt(m[2], 10), width: m[2].length });
  }

  const renameMap = {}; // oldId -> newId
  const newFarmerRows = [];
  const changedRows = []; // 1-based sheet row numbers of soft-deleted old rows
  const now = new Date().toISOString();

  Object.keys(groups).forEach(prefix => {
    const group = groups[prefix];
    group.sort((a, b) => a.seq - b.seq);
    group.forEach((entry, i) => {
      const newId = prefix + String(i + 1).padStart(entry.width, '0');
      const oldRow = values[entry.rowIdx];
      const oldId = oldRow[pbIdx];
      if (newId === oldId) return;

      renameMap[oldId] = newId;
      changedRows.push(entry.rowIdx + 1);

      newFarmerRows.push(headers.map((h, colIdx) => {
        if (h === 'passbook_id') return newId;
        if (h === 'last_updated') return now;
        if (h === 'is_deleted') return false;
        return oldRow[colIdx];
      }));
    });
  });

  const renamedCount = Object.keys(renameMap).length;
  if (renamedCount === 0) {
    return { status: 'success', renamed: 0, log: ['Passbook IDs are already sequential — nothing to renumber.'] };
  }

  // Soft-delete only the old rows that actually got renamed — never rewrite
  // untouched rows.
  farmersSheet.getRangeList(changedRows.map(r => farmersSheet.getRange(r, delIdx + 1).getA1Notation())).setValue(true);
  farmersSheet.getRangeList(changedRows.map(r => farmersSheet.getRange(r, luIdx + 1).getA1Notation())).setValue(now);
  farmersSheet.getRange(farmersSheet.getLastRow() + 1, 1, newFarmerRows.length, headers.length).setValues(newFarmerRows);

  // Cascade into Deliveries — a normal field update, not a rename, since
  // delivery_id (unaffected here) is that sheet's primary key.
  let deliveriesUpdated = 0;
  const deliveriesSheet = ss.getSheetByName('Deliveries');
  if (deliveriesSheet && deliveriesSheet.getLastRow() > 1) {
    const dValues = deliveriesSheet.getDataRange().getValues();
    const dHeaders = dValues[0];
    const dPbIdx = dHeaders.indexOf('passbook_id');
    const dLuIdx = dHeaders.indexOf('last_updated');
    for (let r = 1; r < dValues.length; r++) {
      const oldId = dValues[r][dPbIdx];
      if (renameMap[oldId]) {
        dValues[r][dPbIdx] = renameMap[oldId];
        dValues[r][dLuIdx] = now;
        deliveriesUpdated++;
      }
    }
    if (deliveriesUpdated > 0) {
      const dPbCol = dValues.slice(1).map(row => [row[dPbIdx]]);
      const dLuCol = dValues.slice(1).map(row => [row[dLuIdx]]);
      deliveriesSheet.getRange(2, dPbIdx + 1, dPbCol.length, 1).setValues(dPbCol);
      deliveriesSheet.getRange(2, dLuIdx + 1, dLuCol.length, 1).setValues(dLuCol);
    }
  }

  return {
    status: 'success',
    renamed: renamedCount,
    log: [
      `Renumbered ${renamedCount} passbook ID(s) into a clean sequence (old IDs soft-deleted, new IDs inserted — will sync to all devices as usual).`,
      `Updated ${deliveriesUpdated} delivery record(s) to reference the new passbook ID.`
    ]
  };
}

/**
 * Creates a placeholder Master (Farmer Organization) passbook for every
 * distinct farmer_org value that appears on an active Individual farmer but
 * has no matching Master record yet (matched case-insensitively). The real
 * officer/representative details (name, birth date, gender, etc.) aren't
 * known from existing data, so those fields are left as an obvious
 * placeholder for an Admin to fill in later — this only makes sure the FO
 * itself shows up in the app and can list its members.
 */
function createMissingOrgPassbooks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Farmers');
  if (!sheet || sheet.getLastRow() <= 1) {
    return { status: 'success', created: 0, log: ['Farmers sheet is empty — nothing to create.'] };
  }

  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const pbIdx = headers.indexOf('passbook_id');
  const typeIdx = headers.indexOf('passbook_type');
  const orgIdx = headers.indexOf('farmer_org');
  const delIdx = headers.indexOf('is_deleted');

  const existingMasterOrgs = new Set(); // lowercased
  const individualOrgs = new Map(); // lowercased -> original-cased display value
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (row[delIdx] === true) continue;
    const org = String(row[orgIdx] || '').trim();
    if (!org) continue;
    if (row[typeIdx] === 'Master') {
      existingMasterOrgs.add(org.toLowerCase());
    } else if (row[typeIdx] === 'Individual' && !individualOrgs.has(org.toLowerCase())) {
      individualOrgs.set(org.toLowerCase(), org);
    }
  }

  const missingOrgs = [...individualOrgs.entries()].filter(([lower]) => !existingMasterOrgs.has(lower));
  if (missingOrgs.length === 0) {
    return { status: 'success', created: 0, log: ['Every Farmer Organization already has a Master passbook.'] };
  }

  const nextSeq = nextPassbookSeq(values, pbIdx, 'MB');
  const now = new Date().toISOString();
  const newRows = missingOrgs.map(([, orgDisplay], i) => headers.map(h => {
    if (h === 'passbook_id') return buildPassbookId('MB', nextSeq + i);
    if (h === 'passbook_type') return 'Master';
    if (h === 'farmer_org') return orgDisplay;
    if (h === 'first_name') return 'Officer';
    if (h === 'last_name') return 'TBD';
    if (h === 'created_at' || h === 'last_updated') return now;
    if (h === 'is_deleted') return false;
    return '';
  }));

  sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, headers.length).setValues(newRows);

  return {
    status: 'success',
    created: newRows.length,
    log: [`Created ${newRows.length} placeholder Master passbook(s) for Farmer Organization(s) that didn't have one yet: ${missingOrgs.map(([, o]) => o).join(', ')}. Officer details are placeholders — open each one in the app to fill them in.`]
  };
}

/** Shared passbook_id prefix builder — mirrors the client's generateSerialNumber()
 *  in js/db.js so IDs created here fit the same NFA{region}-{branch}{yy}-{type}-{seq} scheme. */
function passbookIdPrefix(typeCode) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settingsSheet = ss.getSheetByName('SystemSettings');
  const settings = {};
  if (settingsSheet && settingsSheet.getLastRow() > 1) {
    settingsSheet.getDataRange().getValues().slice(1).forEach(row => { settings[row[0]] = row[1]; });
  }
  const region = settings.REGION_CODE || 'V';
  const branch = settings.BRANCH_CODE || 'ALB';
  const yy = String(new Date().getFullYear()).slice(-2);
  return `NFA${region}-${branch}${yy}-${typeCode}-`;
}

function buildPassbookId(typeCode, seq) {
  return passbookIdPrefix(typeCode) + String(seq).padStart(4, '0');
}

/** Scans already-loaded Farmers `values` for the highest sequence number in
 *  use for a given type prefix, across every row regardless of is_deleted
 *  (a soft-deleted row's ID must still never be reissued). */
function nextPassbookSeq(values, pbIdx, typeCode) {
  const prefix = passbookIdPrefix(typeCode);
  let maxSeq = 0;
  for (let r = 1; r < values.length; r++) {
    const id = String(values[r][pbIdx] || '');
    if (!id.startsWith(prefix)) continue;
    const seq = parseInt(id.slice(prefix.length), 10);
    if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
  }
  return maxSeq + 1;
}

/* ---------------------------------------------------------------------- *
 *  AUTOMATIC VACUUM
 *  Soft-deleted rows (is_deleted = true) can't be physically removed from
 *  the Sheet right away: every device that already cached one needs a
 *  chance to pull that deletion during a normal sync first. Vacuuming
 *  removes rows only once they've been soft-deleted for longer than the
 *  safety window below, and runs on its own daily trigger so it never
 *  needs a manual click.
 * ---------------------------------------------------------------------- */
const VACUUM_SAFETY_DAYS = 7;
const VACUUM_TRIGGER_HANDLER = 'dailyVacuumJob';

/** Permanently deletes rows in one sheet that are marked is_deleted and
 *  have been that way for longer than VACUUM_SAFETY_DAYS. */
function vacuumSoftDeletedRows(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() <= 1) return 0;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const delIdx = headers.indexOf('is_deleted');
  const luIdx = headers.indexOf('last_updated');
  if (delIdx === -1 || luIdx === -1) return 0; // e.g. SystemSettings has no is_deleted column

  const values = sheet.getDataRange().getValues();
  const cutoff = Date.now() - VACUUM_SAFETY_DAYS * 24 * 60 * 60 * 1000;
  const rowsToDelete = [];

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const isDeleted = row[delIdx] === true || row[delIdx] === 'TRUE';
    if (!isDeleted) continue;
    const lu = new Date(row[luIdx]).getTime();
    if (!isNaN(lu) && lu < cutoff) rowsToDelete.push(r + 1); // convert to 1-based sheet row number
  }

  // Delete from the bottom up so earlier row numbers in the list stay valid.
  rowsToDelete.sort((a, b) => b - a).forEach(rowNum => sheet.deleteRow(rowNum));
  return rowsToDelete.length;
}

/** Vacuums every schema'd sheet. Callable manually (?action=vacuumDeleted)
 *  or by the daily trigger. */
function runVacuum() {
  const log = [];
  let total = 0;
  Object.keys(DB_SCHEMA).forEach(sheetName => {
    const removedCount = vacuumSoftDeletedRows(sheetName);
    total += removedCount;
    if (removedCount > 0) log.push(`Vacuumed ${removedCount} row(s) from '${sheetName}' (soft-deleted for over ${VACUUM_SAFETY_DAYS} days).`);
  });
  if (total === 0) log.push('Nothing to vacuum — no soft-deleted rows older than the safety window.');
  return { status: 'success', removed: total, log: log };
}

/** Entry point for the installed time-driven trigger. Re-running dedupe here
 *  (not just vacuum) is what makes duplicate cleanup permanent: any future
 *  duplicate — from someone pasting into the Sheet directly, a repeated
 *  import, anything that bypasses the app — gets caught and soft-deleted
 *  automatically within a day, without needing the Settings button again. */
function dailyVacuumJob() {
  dedupeFarmers();
  runVacuum();
}

/** Installs the daily vacuum trigger if it isn't already present. Safe to
 *  call on every repair run — checks for an existing trigger first so it
 *  never creates duplicates. */
function ensureVacuumTriggerInstalled() {
  const alreadyInstalled = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === VACUUM_TRIGGER_HANDLER);
  if (alreadyInstalled) return false;
  try {
    ScriptApp.newTrigger(VACUUM_TRIGGER_HANDLER).timeBased().everyDays(1).atHour(3).create();
    return true;
  } catch (e) {
    // Can fail if this deployment hasn't been re-authorized for the
    // script-triggers scope yet; initializeOrRepairDB() retries this on
    // every repair run until it succeeds.
    return false;
  }
}

/**
 * Validates 6-Digit PIN Hash against Active User Accounts
 */
function authenticateUser(pinHash) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Users');
  if (!sheet || sheet.getLastRow() <= 1) {
    return { status: 'error', message: 'User database uninitialized' };
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const hashIdx = headers.indexOf('pin_hash');
  const statusIdx = headers.indexOf('status');
  const delIdx = headers.indexOf('is_deleted');

  for (let i = 1; i < data.length; i++) {
    if (data[i][hashIdx] === pinHash && data[i][statusIdx] === 'Active' && !data[i][delIdx]) {
      return {
        status: 'success',
        user: {
          user_id: data[i][headers.indexOf('user_id')],
          full_name: data[i][headers.indexOf('full_name')],
          role: data[i][headers.indexOf('role')]
        }
      };
    }
  }
  return { status: 'error', message: 'Invalid 6-Digit PIN Code' };
}

/**
 * Returns Delta Data updated after the specified ISO timestamp
 */
/** Google Sheets auto-detects date-looking cell values and silently converts
 *  them to its own Date type. When read back via getValues() and serialized
 *  to JSON, a Date becomes a full ISO timestamp (e.g. "1985-07-15T00:00:00.000Z")
 *  instead of the plain "YYYY-MM-DD" string the app originally wrote — this
 *  is what was causing "Invalid Date" to appear on printed IDs. Normalize
 *  every cell here so the client always receives a predictable format.
 */
function normalizeCellValue(value, header) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    if (header === 'birth_date') {
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, '0');
      const d = String(value.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return value.toISOString();
  }
  return value;
}

function getInitialData(sinceTimestamp) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const responseData = {};
  const queryTime = sinceTimestamp ? new Date(sinceTimestamp).getTime() : 0;

  Object.keys(DB_SCHEMA).forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() <= 1) {
      responseData[sheetName] = [];
      return;
    }

    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const lastUpdatedIdx = headers.indexOf('last_updated');

    const filteredRows = values.slice(1).filter(row => {
      if (!sinceTimestamp) return true;
      const rowTime = new Date(row[lastUpdatedIdx]).getTime();
      // A blank/unparsable last_updated (e.g. a row pasted directly into the
      // Sheet, bypassing the app) must never be silently excluded forever —
      // fail open and include it rather than treating NaN > queryTime as false.
      if (isNaN(rowTime)) return true;
      return rowTime > queryTime;
    }).map(row => {
      const rowObj = {};
      headers.forEach((header, colIdx) => {
        rowObj[header] = normalizeCellValue(row[colIdx], header);
      });
      return rowObj;
    });

    responseData[sheetName] = filteredRows;
  });

  return {
    status: 'success',
    timestamp: new Date().toISOString(),
    data: responseData
  };
}

// Main Cropping Season: September - February. Summer: March - August.
// Mirrors js/db.js's seasonOfDate/seasonYearKeyOfDate — kept in sync manually
// since Apps Script and the client app are separate deployables.
function seasonOfDateGas(dateVal) {
  const month = new Date(dateVal).getMonth();
  return (month >= 8 || month <= 1) ? 'MAIN' : 'SUMMER';
}
function seasonYearKeyOfDateGas(dateVal) {
  const d = new Date(dateVal);
  const month = d.getMonth();
  const year = d.getFullYear();
  if (month >= 8) return year;
  if (month <= 1) return year - 1;
  return year;
}

/** Server-side (authoritative-data) quota check for one incoming delivery.
 *  The client can only ever see its own local data when deciding whether a
 *  delivery is within quota — two devices offline at once can each approve
 *  a delivery that, combined, exceeds the farmer's season quota, and
 *  neither would know. This re-checks against the actual Sheet (every
 *  device's already-synced deliveries) at push time and returns a warning
 *  string instead of silently letting it through unflagged. Never blocks
 *  the push — an offline-first app can't refuse data a warehouse already
 *  physically accepted; it can only surface it for a human to review. */
function checkDeliveryQuota(ss, deliveryRecord, farmersCache) {
  const farmersSheet = ss.getSheetByName('Farmers');
  if (!farmersSheet || farmersSheet.getLastRow() <= 1) return null;

  if (!farmersCache.rows) {
    const values = farmersSheet.getDataRange().getValues();
    const headers = values[0];
    farmersCache.pbIdx = headers.indexOf('passbook_id');
    farmersCache.hectIdx = headers.indexOf('hectarage');
    farmersCache.quotaIdx = headers.indexOf('custom_quota_bags');
    farmersCache.rows = values.slice(1);
  }
  const farmerRow = farmersCache.rows.find(r => r[farmersCache.pbIdx] === deliveryRecord.passbook_id);
  if (!farmerRow) return null;

  const customQuota = Number(farmerRow[farmersCache.quotaIdx]);
  const quota = customQuota > 0 ? customQuota : Math.floor(Number(farmerRow[farmersCache.hectIdx] || 0) * 100);
  if (quota <= 0) return null;

  const deliveriesSheet = ss.getSheetByName('Deliveries');
  if (!deliveriesSheet || deliveriesSheet.getLastRow() <= 1) return null;
  const dValues = deliveriesSheet.getDataRange().getValues();
  const dHeaders = dValues[0];
  const dPbIdx = dHeaders.indexOf('passbook_id');
  const dDateIdx = dHeaders.indexOf('date_timestamp');
  const dBagsIdx = dHeaders.indexOf('net_bags_equivalent');
  const dNumBagsIdx = dHeaders.indexOf('num_bags');
  const dIdIdx = dHeaders.indexOf('delivery_id');
  const dDelIdx = dHeaders.indexOf('is_deleted');

  const targetSeason = seasonOfDateGas(deliveryRecord.date_timestamp);
  const targetYearKey = seasonYearKeyOfDateGas(deliveryRecord.date_timestamp);

  let total = 0;
  for (let r = 1; r < dValues.length; r++) {
    const row = dValues[r];
    if (row[dDelIdx] === true) continue;
    if (row[dPbIdx] !== deliveryRecord.passbook_id) continue;
    if (row[dIdIdx] === deliveryRecord.delivery_id) continue; // don't double-count this same delivery on an update
    if (seasonOfDateGas(row[dDateIdx]) !== targetSeason || seasonYearKeyOfDateGas(row[dDateIdx]) !== targetYearKey) continue;
    total += Number(row[dBagsIdx] || row[dNumBagsIdx] || 0);
  }
  total += Number(deliveryRecord.net_bags_equivalent || deliveryRecord.num_bags || 0);

  if (total > quota) {
    return `${deliveryRecord.passbook_id} (delivery ${deliveryRecord.delivery_id}): season total ${total} Net Bags exceeds quota of ${quota}.`;
  }
  return null;
}

/**
 * Receives local Dexie sync batches and updates or inserts into Sheets
 */
function processPushSync(payload) {
  // Two devices pushing at (near) the same moment would otherwise each read
  // the sheet's current state independently and write back based on stale
  // data — the second write can silently clobber the first with no
  // conflict detection. Serializing the whole push behind a lock turns that
  // race into a safe sequence: whoever gets the lock second always reads
  // the first one's already-committed change.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return { status: 'error', message: 'Backend is busy processing another device\'s sync — please try again in a moment.' };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const summary = { inserted: 0, updated: 0, quotaWarnings: [] };
    const renamed = {}; // tableName -> { oldId: newId }
    const farmersCache = {};

    Object.keys(payload).forEach(tableName => {
      if (!DB_SCHEMA[tableName]) return;
      const sheet = ss.getSheetByName(tableName);
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const primaryKey = headers[0];
      const createdAtIdx = headers.indexOf('created_at');

      const sheetValues = sheet.getDataRange().getValues();
      const pkMap = {};
      for (let r = 1; r < sheetValues.length; r++) {
        pkMap[sheetValues[r][0]] = r + 1; // Row index (1-based)
      }

      const tableRenames = {};
      let nextSeqByType = {}; // cached within this batch to avoid reissuing the same id twice

      payload[tableName].forEach(record => {
        record.last_updated = new Date().toISOString();
        let pkValue = record[primaryKey];

        // Two devices offline at once can independently generate the same
        // passbook_id before either has synced (js/db.js's
        // generateSerialNumber can only see what THIS device already
        // pulled). Detect that here instead of silently overwriting one
        // farmer's data with an unrelated farmer's: if a row already
        // exists under this key but its created_at doesn't match the
        // incoming record's, they're two distinct records that only
        // coincidentally share an ID — reissue a fresh one for the
        // incoming record rather than clobbering what's already there.
        if (tableName === 'farmers' && pkMap[pkValue] && createdAtIdx !== -1 && record.created_at) {
          const existingCreatedAt = sheetValues[pkMap[pkValue] - 1][createdAtIdx];
          if (existingCreatedAt && String(existingCreatedAt) !== String(record.created_at)) {
            const typeCode = record.passbook_type === 'Master' ? 'MB' : 'FB';
            if (!(typeCode in nextSeqByType)) nextSeqByType[typeCode] = nextPassbookSeq(sheetValues, 0, typeCode);
            const newId = buildPassbookId(typeCode, nextSeqByType[typeCode]++);
            tableRenames[pkValue] = newId;
            record[primaryKey] = newId;
            pkValue = newId;
          }
        }

        if (tableName === 'deliveries' && !pkMap[pkValue]) {
          const warning = checkDeliveryQuota(ss, record, farmersCache);
          if (warning) summary.quotaWarnings.push(warning);
        }

        const rowValues = headers.map(h => record[h] !== undefined ? record[h] : '');

        if (pkMap[pkValue]) {
          const targetRow = pkMap[pkValue];
          sheet.getRange(targetRow, 1, 1, headers.length).setValues([rowValues]);
          summary.updated++;
        } else {
          sheet.appendRow(rowValues);
          pkMap[pkValue] = sheet.getLastRow(); // keep pkMap current for the rest of this batch
          summary.inserted++;
        }
      });

      if (Object.keys(tableRenames).length > 0) renamed[tableName] = tableRenames;
    });

    const result = { status: 'success', summary: summary };
    if (Object.keys(renamed).length > 0) result.renamed = renamed;
    return result;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Gets all sheet names for the picker
 */
function getSheetList() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets().map(s => s.getName());
}

/**
 * Generates a highly compact JSON for a SINGLE specific sheet
 * Optimized for AI token limits by removing metadata, structure definitions,
 * dropping entirely empty cells and rows, extracting column widths, and
 * prioritizing raw formulas over calculated values.
 */
function getSingleSheetSchema(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) return JSON.stringify({ error: "Sheet not found" });

  const range = sheet.getDataRange();
  const values = range.getValues();
  const formulas = range.getFormulas(); // Fetch formulas for the entire data range
  const numCols = range.getLastColumn();

  // Handle empty sheet scenario
  if (values.length === 0 || (values.length === 1 && values[0].join('') === '')) {
    return JSON.stringify({ [sheetName]: "Empty Sheet" }, null, 2);
  }

  // Treat row 1 as headers
  const headers = values[0];
  const dataRows = values.slice(1);
  const formulaRows = formulas.slice(1);

  // Capture Column Widths formatting mapped to headers or fallback column keys
  const columnWidths = {};
  headers.forEach((header, index) => {
    const key = header || `Col_${index + 1}`;
    columnWidths[key] = sheet.getColumnWidth(index + 1);
  });

  const compactData = [];

  // Map rows into compact objects, prioritizing formulas over values
  dataRows.forEach((row, rowIndex) => {
    let rowObj = {};
    let hasData = false;

    headers.forEach((header, index) => {
      // Check if a formula exists in this cell; fallback to the raw value if not
      let val = formulaRows[rowIndex][index] || row[index];

      // Only include cells that actually have data
      if (val !== "" && val !== null) {
        const key = header || `Col_${index + 1}`;

        // Convert dates to ISO strings (only applies to static values, formulas are strings)
        if (Object.prototype.toString.call(val) === '[object Date]') {
          val = val.toISOString();
        }

        rowObj[key] = val;
        hasData = true;
      }
    });

    // Only push rows that contain actual data (ignores blank rows)
    if (hasData) {
      compactData.push(rowObj);
    }
  });

  // Wrap the data and structural formatting inside an object named after the sheet
  const schema = {
    [sheetName]: {
      columnWidths: columnWidths,
      rows: compactData
    }
  };

  return JSON.stringify(schema, null, 2);
}

/**
 * Displays the Picker Modal
 */
function showSchemaPicker() {
  const htmlContent = `
    <html>
      <head>
        <link rel="stylesheet" href="https://ssl.gstatic.com/docs/script/css/add-ons1.css">
        <style>
          body { padding: 20px; font-family: sans-serif; }
          select { width: 100%; padding: 8px; margin-bottom: 15px; }
          pre { background: #f4f4f4; padding: 10px; border: 1px solid #ddd; height: 250px; overflow: auto; font-size: 11px; display: none; white-space: pre-wrap; word-wrap: break-word; }
          .controls { display: flex; gap: 10px; margin-bottom: 10px; }
          #loading { display: none; font-size: 12px; color: #666; margin-top: 5px; }
        </style>
      </head>
      <body>
        <label>Select Sheet to Analyze:</label>
        <select id="sheetSelect"></select>

        <div class="controls">
          <button class="action" id="genBtn" onclick="generate()">Generate JSON</button>
          <button id="copyBtn" style="display:none;" onclick="copyToClipboard()">Copy JSON</button>
        </div>
        <div id="loading">Extracting all data... please wait.</div>

        <pre id="output"></pre>

        <script>
          // Populate dropdown on load
          google.script.run.withSuccessHandler(list => {
            const select = document.getElementById('sheetSelect');
            list.forEach(name => {
              const opt = document.createElement('option');
              opt.value = name;
              opt.innerHTML = name;
              select.appendChild(opt);
            });
          }).getSheetList();

          function generate() {
            const name = document.getElementById('sheetSelect').value;
            const btn = document.getElementById('genBtn');
            const loading = document.getElementById('loading');
            const output = document.getElementById('output');
            const copyBtn = document.getElementById('copyBtn');

            // UI Loading state to prevent multiple clicks on large sheets
            btn.disabled = true;
            loading.style.display = 'block';
            output.style.display = 'none';
            copyBtn.style.display = 'none';

            google.script.run.withSuccessHandler(json => {
              output.innerText = json;
              output.style.display = 'block';
              copyBtn.style.display = 'inline-block';
              btn.disabled = false;
              loading.style.display = 'none';
            }).getSingleSheetSchema(name);
          }

          function copyToClipboard() {
            const text = document.getElementById('output').innerText;
            const elem = document.createElement('textarea');
            document.body.appendChild(elem);
            elem.value = text;
            elem.select();
            document.execCommand('copy');
            document.body.removeChild(elem);

            const copyBtn = document.getElementById('copyBtn');
            const originalText = copyBtn.innerText;
            copyBtn.innerText = 'Copied!';
            setTimeout(() => { copyBtn.innerText = originalText; }, 2000);
          }
        </script>
      </body>
    </html>
  `;

  const htmlOutput = HtmlService.createHtmlOutput(htmlContent)
      .setWidth(450)
      .setHeight(450)
      .setTitle('Select Sheet for AI Context');

  SpreadsheetApp.getUi().showModalDialog(htmlOutput, ' ');
}
