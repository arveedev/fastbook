/**
 * NFA PASSBOOK — Full-Page Data Reports (sortable, filterable, KG/MT aware)
 */
const ReportSortState = {
  roster: { key: 'name', dir: 1 },
  deliveries: { key: 'date', dir: -1 },
  warehouse: { key: 'seasonBags', dir: -1 }
};

const ReportFilterState = {
  deliveries: { from: '', to: '' }
};

function sortArrow(reportKey, colKey) {
  const s = ReportSortState[reportKey];
  if (s.key !== colKey) return '';
  return `<span class="sort-arrow">${s.dir === 1 ? '▲' : '▼'}</span>`;
}

function toggleSort(reportKey, colKey) {
  const s = ReportSortState[reportKey];
  if (s.key === colKey) { s.dir *= -1; } else { s.key = colKey; s.dir = 1; }
}

function genericSort(rows, key, dir, accessor) {
  return [...rows].sort((a, b) => {
    const va = accessor(a, key);
    const vb = accessor(b, key);
    if (typeof va === 'string') return va.localeCompare(vb) * dir;
    return (va - vb) * dir;
  });
}

SCREEN_RENDERERS.reports = async function (container, params) {
  const activeTab = (params && params.tab) || 'roster';

  container.innerHTML = `
    <div class="content">
      <div class="flex-between mb-14">
        <h2 style="font-size:16px;font-weight:800;">Reports</h2>
        ${renderWeightUnitToggle('report-unit-toggle')}
      </div>
      <div class="subtabs" id="report-subtabs">
        <button data-t="roster" class="${activeTab === 'roster' ? 'active' : ''}">Master Farmer Roster</button>
        <button data-t="deliveries" class="${activeTab === 'deliveries' ? 'active' : ''}">Delivery Log</button>
        <button data-t="warehouse" class="${activeTab === 'warehouse' ? 'active' : ''}">Warehouse Summary</button>
      </div>
      <div id="report-host"></div>
    </div>
  `;

  document.getElementById('report-subtabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    navigate('reports', { tab: btn.dataset.t });
  });

  const host = document.getElementById('report-host');
  async function renderCurrentTab() {
    if (activeTab === 'roster') await renderRosterReport(host);
    else if (activeTab === 'deliveries') await renderDeliveryLogReport(host);
    else await renderWarehouseSummaryReport(host);
  }
  bindWeightUnitToggle('report-unit-toggle', renderCurrentTab);
  await renderCurrentTab();
};

async function renderRosterReport(host) {
  let farmers = await db.farmers.filter(f => !f.is_deleted).toArray();
  const accessor = (f, key) => {
    if (key === 'name') return buildDisplayName(f).toLowerCase();
    if (key === 'rsbsa') return f.rsbsa_no || '';
    if (key === 'hectarage') return Number(f.hectarage || 0);
    if (key === 'contact') return f.contact_no || '';
    return '';
  };
  const s = ReportSortState.roster;
  farmers = genericSort(farmers, s.key, s.dir, accessor);

  const rowsHtml = farmers.map(f => `
    <tr><td>${f.passbook_id}</td><td>${buildDisplayName(f)}</td><td>${escapeHtml(f.rsbsa_no) || '—'}</td><td>${formatComma(f.hectarage)}</td><td>${escapeHtml(f.contact_no) || '—'}</td></tr>
  `).join('');
  const printTableHtml = `
    <table>
      <thead><tr><th>Control No.</th><th>Farmer / FO Name</th><th>RSBSA No.</th><th>Hectarage</th><th>Contact No.</th></tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="5">No registered farmers.</td></tr>`}</tbody>
    </table>`;

  host.innerHTML = `
    <div class="card">
      <div class="flex-between mb-14"><span class="text-sm text-muted">${farmers.length} record(s) · tap a column to sort</span>
        <button class="btn btn-sm btn-gold" id="print-roster">${icon('print', 14)} Print</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>Control No.</th>
            <th class="sortable-th" data-k="name">Name${sortArrow('roster', 'name')}</th>
            <th class="sortable-th" data-k="rsbsa">RSBSA${sortArrow('roster', 'rsbsa')}</th>
            <th class="sortable-th" data-k="hectarage">Hectarage${sortArrow('roster', 'hectarage')}</th>
            <th class="sortable-th" data-k="contact">Contact No.${sortArrow('roster', 'contact')}</th>
          </tr></thead>
          <tbody>${rowsHtml || `<tr><td colspan="5" class="text-muted">No registered farmers.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;

  host.querySelectorAll('.sortable-th').forEach(th => {
    th.onclick = () => { toggleSort('roster', th.dataset.k); renderRosterReport(host); };
  });
  document.getElementById('print-roster').onclick = () => {
    printReport('Master Farmer Roster Report', `Generated ${new Date().toLocaleString()} · ${farmers.length} record(s)`, printTableHtml);
  };
}

async function renderDeliveryLogReport(host) {
  const unit = getWeightUnit();
  let deliveries = await db.deliveries.filter(d => !d.is_deleted).toArray();
  const filter = ReportFilterState.deliveries;

  if (filter.from) {
    const fromDate = new Date(filter.from + 'T00:00:00');
    deliveries = deliveries.filter(d => new Date(d.date_timestamp) >= fromDate);
  }
  if (filter.to) {
    const toDate = new Date(filter.to + 'T23:59:59');
    deliveries = deliveries.filter(d => new Date(d.date_timestamp) <= toDate);
  }

  const accessor = (d, key) => {
    if (key === 'date') return new Date(d.date_timestamp).getTime();
    if (key === 'farmer') return (d.display_name || '').toLowerCase();
    if (key === 'warehouse') return (d.warehouse_name || '').toLowerCase();
    if (key === 'variety') return d.variety || '';
    if (key === 'bags') return Number(d.num_bags || 0);
    if (key === 'weight') return Number(d.net_kilos || 0);
    return '';
  };
  const s = ReportSortState.deliveries;
  deliveries = genericSort(deliveries, s.key, s.dir, accessor);

  const rowsHtml = deliveries.map(d => `
    <tr><td>${new Date(d.date_timestamp).toLocaleString()}</td><td>${escapeHtml(d.display_name)}</td><td>${escapeHtml(d.rsbsa_no) || '—'}</td><td>${escapeHtml(d.warehouse_name)}</td><td>${escapeHtml(d.variety)}</td><td>${formatComma(d.num_bags)}</td><td>${formatWeightValue(d.net_kilos, unit)}</td></tr>
  `).join('');
  const printTableHtml = `
    <table>
      <thead><tr><th>Timestamp</th><th>Farmer / FO</th><th>RSBSA</th><th>Warehouse</th><th>Variety</th><th>Net Bags</th><th>${weightUnitLabel(unit)}</th></tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="7">No deliveries recorded.</td></tr>`}</tbody>
    </table>`;

  const totalBags = deliveries.reduce((s2, d) => s2 + Number(d.num_bags || 0), 0);
  const totalKilos = deliveries.reduce((s2, d) => s2 + Number(d.net_kilos || 0), 0);

  host.innerHTML = `
    <div class="report-filter-bar">
      <div class="field"><label>From</label><input type="date" id="flt-from" value="${filter.from}"></div>
      <div class="field"><label>To</label><input type="date" id="flt-to" value="${filter.to}"></div>
      <button class="btn btn-outline btn-sm" id="flt-clear">Clear Dates</button>
    </div>
    <div class="stat-grid mb-14">
      <div class="stat-box"><div class="label">Total Net Bags</div><div class="value">${formatComma(totalBags)}</div></div>
      <div class="stat-box"><div class="label">Total ${weightUnitLabel(unit)}</div><div class="value green">${formatWeightValue(totalKilos, unit)}</div></div>
    </div>
    <div class="card">
      <div class="flex-between mb-14"><span class="text-sm text-muted">${deliveries.length} transaction(s) · tap a column to sort</span>
        <button class="btn btn-sm btn-gold" id="print-log">${icon('print', 14)} Print</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th class="sortable-th" data-k="date">Timestamp${sortArrow('deliveries', 'date')}</th>
            <th class="sortable-th" data-k="farmer">Farmer/FO${sortArrow('deliveries', 'farmer')}</th>
            <th>RSBSA</th>
            <th class="sortable-th" data-k="warehouse">Warehouse${sortArrow('deliveries', 'warehouse')}</th>
            <th class="sortable-th" data-k="variety">Variety${sortArrow('deliveries', 'variety')}</th>
            <th class="sortable-th" data-k="bags">Net Bags${sortArrow('deliveries', 'bags')}</th>
            <th class="sortable-th" data-k="weight">${weightUnitLabel(unit)}${sortArrow('deliveries', 'weight')}</th>
          </tr></thead>
          <tbody>${rowsHtml || `<tr><td colspan="7" class="text-muted">No deliveries recorded.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;

  host.querySelectorAll('.sortable-th').forEach(th => {
    th.onclick = () => { toggleSort('deliveries', th.dataset.k); renderDeliveryLogReport(host); };
  });
  document.getElementById('flt-from').onchange = (e) => { filter.from = e.target.value; renderDeliveryLogReport(host); };
  document.getElementById('flt-to').onchange = (e) => { filter.to = e.target.value; renderDeliveryLogReport(host); };
  document.getElementById('flt-clear').onclick = () => { filter.from = ''; filter.to = ''; renderDeliveryLogReport(host); };
  document.getElementById('print-log').onclick = () => {
    const rangeLabel = (filter.from || filter.to) ? ` · Range: ${filter.from || 'start'} to ${filter.to || 'today'}` : '';
    printReport('Seasonal Procurement Delivery Log', `Generated ${new Date().toLocaleString()} · Total ${formatComma(totalBags)} Bags / ${formatWeightValue(totalKilos, unit)} ${weightUnitLabel(unit)}${rangeLabel}`, printTableHtml);
  };
}

async function renderWarehouseSummaryReport(host) {
  const unit = getWeightUnit();
  const [warehouses, deliveries] = await Promise.all([
    db.warehouses.filter(w => !w.is_deleted).toArray(),
    db.deliveries.filter(d => !d.is_deleted).toArray()
  ]);
  const now = new Date();
  const activeSeason = await getActiveSeason();
  const currentSeasonYearKey = seasonYearKeyOfDate(now);

  let rows = warehouses.map(w => {
    const whDeliveries = deliveries.filter(d => d.warehouse_name === w.warehouse_name);
    const dayD = whDeliveries.filter(d => isSameDay(new Date(d.date_timestamp), now));
    const monthD = whDeliveries.filter(d => { const dt = new Date(d.date_timestamp); return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear(); });
    const seasonD = whDeliveries.filter(d => seasonOfDate(d.date_timestamp) === activeSeason && seasonYearKeyOfDate(d.date_timestamp) === currentSeasonYearKey);
    const sum = (arr, field) => arr.reduce((s, d) => s + Number(d[field] || 0), 0);
    return {
      name: w.warehouse_name,
      dayBags: sum(dayD, 'num_bags'), dayKilos: sum(dayD, 'net_kilos'),
      monthBags: sum(monthD, 'num_bags'), monthKilos: sum(monthD, 'net_kilos'),
      seasonBags: sum(seasonD, 'num_bags'), seasonKilos: sum(seasonD, 'net_kilos')
    };
  });

  const accessor = (r, key) => typeof r[key] === 'string' ? r[key].toLowerCase() : r[key];
  const s = ReportSortState.warehouse;
  rows = genericSort(rows, s.key, s.dir, accessor);

  const rowsHtml = rows.map(r => `<tr>
    <td>${escapeHtml(r.name)}</td>
    <td>${formatComma(r.dayBags)}</td><td>${formatWeightValue(r.dayKilos, unit)}</td>
    <td>${formatComma(r.monthBags)}</td><td>${formatWeightValue(r.monthKilos, unit)}</td>
    <td>${formatComma(r.seasonBags)}</td><td>${formatWeightValue(r.seasonKilos, unit)}</td>
  </tr>`).join('');
  const printTableHtml = `
    <table>
      <thead><tr>
        <th>Warehouse</th>
        <th>Today (Net Bags)</th><th>Today (${weightUnitLabel(unit)})</th>
        <th>Month (Net Bags)</th><th>Month (${weightUnitLabel(unit)})</th>
        <th>Season (Net Bags)</th><th>Season (${weightUnitLabel(unit)})</th>
      </tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="7">No warehouses configured.</td></tr>`}</tbody>
    </table>`;

  host.innerHTML = `
    <div class="card">
      <div class="flex-between mb-14"><span class="text-sm text-muted">${warehouses.length} warehouse(s) · tap a column to sort</span>
        <button class="btn btn-sm btn-gold" id="print-wh">${icon('print', 14)} Print</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th class="sortable-th" data-k="name">Warehouse${sortArrow('warehouse', 'name')}</th>
            <th class="sortable-th" data-k="dayBags">Today Net Bags${sortArrow('warehouse', 'dayBags')}</th>
            <th class="sortable-th" data-k="dayKilos">Today ${weightUnitLabel(unit)}${sortArrow('warehouse', 'dayKilos')}</th>
            <th class="sortable-th" data-k="monthBags">Month Net Bags${sortArrow('warehouse', 'monthBags')}</th>
            <th class="sortable-th" data-k="monthKilos">Month ${weightUnitLabel(unit)}${sortArrow('warehouse', 'monthKilos')}</th>
            <th class="sortable-th" data-k="seasonBags">Season Net Bags${sortArrow('warehouse', 'seasonBags')}</th>
            <th class="sortable-th" data-k="seasonKilos">Season ${weightUnitLabel(unit)}${sortArrow('warehouse', 'seasonKilos')}</th>
          </tr></thead>
          <tbody>${rowsHtml || `<tr><td colspan="7" class="text-muted">No warehouses configured.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;

  host.querySelectorAll('.sortable-th').forEach(th => {
    th.onclick = () => { toggleSort('warehouse', th.dataset.k); renderWarehouseSummaryReport(host); };
  });
  document.getElementById('print-wh').onclick = () => {
    printReport('Warehouse Summary Report', `Generated ${new Date().toLocaleString()} · ${seasonLabel(activeSeason)}`, printTableHtml);
  };
}
