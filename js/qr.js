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
        <img class="seal-logo" src="icons/nfa-official-logo.png" alt="NFA" width="30" height="30">
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

/** Waits for every <img> inside a container to finish loading (or fail) —
 *  printing before the logo image has loaded would leave it blank/broken. */
function waitForImages(container) {
  const imgs = Array.from(container.querySelectorAll('img'));
  return Promise.all(imgs.map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise(resolve => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    });
  }));
}

/** Browsers add their own headers/footers (URL, date, page number) to every
 *  printed page — this is a print-dialog setting the page has no way to
 *  control via CSS or JS. We can only tell the person how to turn it off.
 *  Most browsers remember that choice after the first time, so this only
 *  needs to be shown once per device. */
async function ensurePrintHeadersReminder() {
  if (localStorage.getItem('nfa_print_reminder_dismissed') === 'true') return;
  return new Promise((resolve) => {
    const backdrop = openModal(`
      <div class="modal-header"><h3>Before you print</h3></div>
      <p class="text-sm" style="margin-bottom:14px;">Your browser's print dialog adds its own URL, date, and page number to every printout by default — this app cannot remove that. For a clean ID with nothing but the card:</p>
      <ol style="font-size:13px; padding-left:18px; line-height:1.8; margin-bottom:16px;">
        <li>In the print dialog, click <b>"More settings"</b></li>
        <li>Turn <b>OFF "Headers and footers"</b></li>
      </ol>
      <p class="text-sm text-muted" style="margin-bottom:16px;">Most browsers remember this choice, so you'll likely only need to do it once.</p>
      <button class="btn btn-primary btn-block" id="print-reminder-ok">Got it, continue to print</button>
    `, { center: true });
    document.getElementById('print-reminder-ok').onclick = () => {
      localStorage.setItem('nfa_print_reminder_dismissed', 'true');
      closeModal(backdrop);
      resolve();
    };
  });
}

async function printPassbookId(farmer) {
  await ensurePrintHeadersReminder();

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

  await waitForImages(printArea);
  setTimeout(() => window.print(), 150);
}

/** Prints a full-page A4 report given a title and an HTML table body. */
async function printReport(title, subtitle, tableHtml) {
  await ensurePrintHeadersReminder();
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
