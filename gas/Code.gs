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

/** Forces every non-numeric/non-date column to plain-text format so Sheets
 *  never auto-converts values like "05-12-34-000123" into a date. Applied to
 *  a generous row range so it also protects rows added after this runs. */
function enforceTextColumnFormats(sheet, headers) {
  const maxRows = Math.max(sheet.getMaxRows(), 5000);
  headers.forEach((header, idx) => {
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

  Object.values(groups).forEach(rowIndexes => {
    if (rowIndexes.length < 2) return;
    rowIndexes.sort((a, b) => String(values[a][pbIdx]).localeCompare(String(values[b][pbIdx])));
    for (let i = 1; i < rowIndexes.length; i++) {
      const idx = rowIndexes[i];
      values[idx][delIdx] = true;
      values[idx][luIdx] = now;
      removed++;
    }
  });

  if (removed > 0) {
    const luCol = values.slice(1).map(row => [row[luIdx]]);
    const delCol = values.slice(1).map(row => [row[delIdx]]);
    sheet.getRange(2, luIdx + 1, luCol.length, 1).setValues(luCol);
    sheet.getRange(2, delIdx + 1, delCol.length, 1).setValues(delCol);
  }

  return {
    status: 'success',
    removed: removed,
    log: [`Removed ${removed} duplicate farmer record(s), keeping the earliest passbook_id per unique farmer (matched by name + RSBSA no.).`]
  };
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

/** Entry point for the installed time-driven trigger. */
function dailyVacuumJob() {
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

/**
 * Receives local Dexie sync batches and updates or inserts into Sheets
 */
function processPushSync(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const summary = { inserted: 0, updated: 0 };

  Object.keys(payload).forEach(tableName => {
    if (!DB_SCHEMA[tableName]) return;
    const sheet = ss.getSheetByName(tableName);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const primaryKey = headers[0];

    const sheetValues = sheet.getDataRange().getValues();
    const pkMap = {};
    for (let r = 1; r < sheetValues.length; r++) {
      pkMap[sheetValues[r][0]] = r + 1; // Row index (1-based)
    }

    payload[tableName].forEach(record => {
      record.last_updated = new Date().toISOString();
      const rowValues = headers.map(h => record[h] !== undefined ? record[h] : '');
      const pkValue = record[primaryKey];

      if (pkMap[pkValue]) {
        const targetRow = pkMap[pkValue];
        sheet.getRange(targetRow, 1, 1, headers.length).setValues([rowValues]);
        summary.updated++;
      } else {
        sheet.appendRow(rowValues);
        summary.inserted++;
      }
    });
  });

  return { status: 'success', summary: summary };
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
