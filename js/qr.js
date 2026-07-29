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
    correctLevel: QRCode.CorrectLevel.M
  });
}

async function printPassbookId(farmer) {
  const settings = await getAllSettings();
  const name = buildDisplayName(farmer);
  const allowance = await computeSeasonalAllowance(farmer);
  const printArea = document.getElementById('print-area');
  const typeLabel = farmer.passbook_type === 'Master' ? 'MASTER / FO PASSBOOK' : 'INDIVIDUAL FARMER';
  const year = new Date().getFullYear();

  printArea.innerHTML = `
    <div class="id-card">
      <div class="id-header">
        <div class="badge-logo">NFA</div>
        <div class="txt"><b>NATIONAL FOOD AUTHORITY</b>REGION ${settings.REGION_CODE} · ${(settings.BRANCH_NAME || '').toUpperCase()} BRANCH</div>
        <div class="type-ribbon">${typeLabel}</div>
      </div>
      <div class="id-body">
        <div class="id-watermark"></div>
        <div class="id-left">
          <span class="id-name">${name}</span>
          <div class="id-row"><span class="k">RSBSA</span><span>${farmer.rsbsa_no || '—'}</span></div>
          <div class="id-row"><span class="k">Farm</span><span>${farmer.farm_municipality}, ${farmer.farm_province}</span></div>
          <div class="id-row"><span class="k">Area</span><span>${formatComma(farmer.hectarage)} Ha · ${farmer.irrigated === 'Yes' ? 'Irrigated' : 'Rainfed'}</span></div>
          <div class="id-row"><span class="k">Quota</span><span>${formatComma(allowance.totalQuotaBags)} bags / season</span></div>
          <div class="id-row"><span class="k">Warehouse</span><span>${farmer.warehouse_assigned || '—'}</span></div>
        </div>
        <div class="id-right">
          <div id="id-qr-host"></div>
          <span class="scan-label">SCAN TO VERIFY</span>
        </div>
      </div>
      <div class="id-footer">
        <span class="serial">${farmer.passbook_id}</span>
        <span>Valid: CY ${year}</span>
      </div>
    </div>
  `;
  renderQrInto(document.getElementById('id-qr-host'), buildQrPayload(farmer), 96);

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
