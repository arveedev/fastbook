/**
 * NFA PASSBOOK — QR Code Generation & Print Layouts (CR80 ID Cards + A4 Reports)
 */
function buildQrPayload(farmer) {
  return JSON.stringify({
    serial: farmer.passbook_id,
    type: farmer.passbook_type === 'Master' ? 'MB' : 'FB',
    rsbsa: farmer.rsbsa_no,
    name: [farmer.first_name, farmer.middle_name, farmer.last_name].filter(Boolean).join(' '),
    org: farmer.farmer_org || ''
  });
}

/** Renders a QR code into a DOM element using the qrcodejs library. */
function renderQrInto(el, text, size = 180) {
  el.innerHTML = '';
  // eslint-disable-next-line no-undef
  new QRCode(el, {
    text,
    width: size,
    height: size,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });
}

/** Simple circular seal-style emblem (grain stalk on a navy/gold seal) used
 *  on the printed ID in place of a generic text badge. */
function nfaSealSvg(size = 30) {
  return `
  <svg width="${size}" height="${size}" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    <circle cx="20" cy="20" r="19" fill="#FFCC00" stroke="#003366" stroke-width="2"/>
    <circle cx="20" cy="20" r="14.5" fill="none" stroke="#003366" stroke-width="0.6"/>
    <line x1="20" y1="30" x2="20" y2="11" stroke="#003366" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="20" cy="10" r="1.4" fill="#003366"/>
    <ellipse cx="17" cy="14.5" rx="2.1" ry="1.2" fill="#003366" transform="rotate(-32 17 14.5)"/>
    <ellipse cx="23" cy="14.5" rx="2.1" ry="1.2" fill="#003366" transform="rotate(32 23 14.5)"/>
    <ellipse cx="16.4" cy="18.5" rx="2.1" ry="1.2" fill="#003366" transform="rotate(-32 16.4 18.5)"/>
    <ellipse cx="23.6" cy="18.5" rx="2.1" ry="1.2" fill="#003366" transform="rotate(32 23.6 18.5)"/>
    <ellipse cx="15.8" cy="22.5" rx="2.1" ry="1.2" fill="#003366" transform="rotate(-32 15.8 22.5)"/>
    <ellipse cx="24.2" cy="22.5" rx="2.1" ry="1.2" fill="#003366" transform="rotate(32 24.2 22.5)"/>
  </svg>`;
}

/** Builds the inner HTML for one ID card (used twice per printed sheet). */
async function buildIdCardHtml(farmer, settings, qrHostId) {
  const name = buildDisplayName(farmer);
  const typeLabel = farmer.passbook_type === 'Master' ? 'MASTER / FO' : 'INDIVIDUAL FARMER';
  const birthDateFormatted = farmer.birth_date
    ? new Date(farmer.birth_date + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

  return `
    <div class="id-card">
      <div class="id-header">
        <div class="seal-logo">${nfaSealSvg(30)}</div>
        <div class="txt"><b>NATIONAL FOOD AUTHORITY</b>REGION ${settings.REGION_CODE} · ${(settings.BRANCH_NAME || '').toUpperCase()} BRANCH</div>
        <div class="type-ribbon">${typeLabel}</div>
      </div>
      <div class="id-body">
        <div class="id-watermark"></div>
        <div class="id-left">
          <span class="id-name">${name}</span>
          <div class="id-row"><span class="k">RSBSA No.</span><span class="v">${farmer.rsbsa_no || '—'}</span></div>
          <div class="id-row"><span class="k">Birthday</span><span class="v">${birthDateFormatted}</span></div>
          <div class="id-row"><span class="k">Farm Addr.</span><span class="v">${farmer.farm_municipality}, ${farmer.farm_province}</span></div>
          <div class="id-row"><span class="k">Land Area</span><span class="v">${formatComma(farmer.hectarage)} Ha · ${farmer.irrigated === 'Yes' ? 'Irrigated' : 'Rainfed'}</span></div>
        </div>
        <div class="id-right">
          <div id="${qrHostId}"></div>
        </div>
      </div>
      <div class="id-footer">
        <span class="serial">${farmer.passbook_id}</span>
      </div>
    </div>
  `;
}

async function printPassbookId(farmer) {
  const settings = await getAllSettings();
  const printArea = document.getElementById('print-area');

  // Two copies side by side (slim page margins) so one sheet yields a spare
  // card and doesn't waste the rest of the page — cut apart after printing.
  const card1 = await buildIdCardHtml(farmer, settings, 'id-qr-host-1');
  const card2 = await buildIdCardHtml(farmer, settings, 'id-qr-host-2');

  printArea.innerHTML = `<div class="id-print-sheet">${card1}${card2}</div>`;

  const qrPayload = buildQrPayload(farmer);
  renderQrInto(document.getElementById('id-qr-host-1'), qrPayload, 76);
  renderQrInto(document.getElementById('id-qr-host-2'), qrPayload, 76);

  setTimeout(() => window.print(), 150);
}

/** Prints a full-page A4 report given a title and an HTML table body. */
function printReport(title, subtitle, tableHtml) {
  const printArea = document.getElementById('print-area');
  printArea.innerHTML = `
    <div class="report-page">
      <style>
        .report-page table thead { display: table-header-group; }
        .report-page table tr { page-break-inside: avoid; }
        .report-page table tbody tr:nth-child(even) td { background: #EEF1F4; }
        .report-page table td, .report-page table th { border-bottom: 1px solid #DCE1E6; }
      </style>
      <div style="display:flex;align-items:center;gap:10px;border-bottom:3px solid #003366;padding-bottom:8px;margin-bottom:14px;">
        <div style="width:36px;height:36px;border-radius:8px;background:#FFCC00;color:#003366;font-weight:800;display:flex;align-items:center;justify-content:center;">NFA</div>
        <div>
          <div style="font-weight:800;font-size:15px;color:#003366;">${title}</div>
          <div style="font-size:11px;color:#555;">${subtitle}</div>
        </div>
      </div>
      ${tableHtml}
      <div style="display:flex;justify-content:space-between;margin-top:60px;font-size:10.5px;">
        <div style="width:40%;border-top:1px solid #000;padding-top:4px;text-align:center;">Prepared By</div>
        <div style="width:40%;border-top:1px solid #000;padding-top:4px;text-align:center;">Noted By</div>
      </div>
    </div>
  `;
  setTimeout(() => window.print(), 150);
}
