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

  return { status: 'success', repair_logs: log };
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
