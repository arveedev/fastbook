/**
 * NFA PASSBOOK — Full-Page Data Reports
 */
SCREEN_RENDERERS.reports = async function (container, params) {
  const activeTab = (params && params.tab) || 'roster';

  container.innerHTML = `
    <div class="content">
      <h2 style="font-size:16px;font-weight:800;margin-bottom:12px;">Reports</h2>
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
  if (activeTab === 'roster') await renderRosterReport(host);
  else if (activeTab === 'deliveries') await renderDeliveryLogReport(host);
  else await renderWarehouseSummaryReport(host);
};

async function renderRosterReport(host) {
  const farmers = (await db.farmers.filter(f => !f.is_deleted).toArray())
    .sort((a, b) => buildDisplayName(a).localeCompare(buildDisplayName(b)));

  const rowsHtml = farmers.map(f => `
    <tr><td>${f.passbook_id}</td><td>${buildDisplayName(f)}</td><td>${f.rsbsa_no}</td><td>${formatComma(f.hectarage)}</td><td>${f.warehouse_assigned}</td></tr>
  `).join('');
  const tableHtml = `
    <table class="data-table" style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead><tr style="background:#003366;color:#fff;"><th style="padding:6px;">Control No.</th><th style="padding:6px;">Farmer / FO Name</th><th style="padding:6px;">RSBSA No.</th><th style="padding:6px;">Hectarage</th><th style="padding:6px;">Warehouse</th></tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="5">No registered farmers.</td></tr>`}</tbody>
    </table>`;

  host.innerHTML = `
    <div class="card">
      <div class="flex-between mb-14"><span class="text-sm text-muted">${farmers.length} record(s)</span>
        <button class="btn btn-sm btn-gold" id="print-roster">${icon('print', 14)} Print</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Control No.</th><th>Name</th><th>RSBSA</th><th>Hectarage</th><th>Warehouse</th></tr></thead>
          <tbody>${rowsHtml || `<tr><td colspan="5" class="text-muted">No registered farmers.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('print-roster').onclick = () => {
    printReport('Master Farmer Roster Report', `Generated ${new Date().toLocaleString()} · ${farmers.length} record(s)`, tableHtml);
  };
}

async function renderDeliveryLogReport(host) {
  const deliveries = (await db.deliveries.filter(d => !d.is_deleted).toArray())
    .sort((a, b) => new Date(b.date_timestamp) - new Date(a.date_timestamp));

  const rowsHtml = deliveries.map(d => `
    <tr><td>${new Date(d.date_timestamp).toLocaleString()}</td><td>${d.display_name}</td><td>${d.rsbsa_no}</td><td>${d.warehouse_name}</td><td>${d.variety}</td><td>${formatComma(d.num_bags)}</td><td>${formatComma(d.net_kilos)}</td></tr>
  `).join('');
  const tableHtml = `
    <table style="width:100%;border-collapse:collapse;font-size:10.5px;">
      <thead><tr style="background:#003366;color:#fff;"><th style="padding:6px;">Timestamp</th><th style="padding:6px;">Farmer / FO</th><th style="padding:6px;">RSBSA</th><th style="padding:6px;">Warehouse</th><th style="padding:6px;">Variety</th><th style="padding:6px;">Bags</th><th style="padding:6px;">Kilos</th></tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="7">No deliveries recorded.</td></tr>`}</tbody>
    </table>`;

  const totalBags = deliveries.reduce((s, d) => s + Number(d.num_bags || 0), 0);
  const totalKilos = deliveries.reduce((s, d) => s + Number(d.net_kilos || 0), 0);

  host.innerHTML = `
    <div class="stat-grid mb-14">
      <div class="stat-box"><div class="label">Total Bags</div><div class="value">${formatComma(totalBags)}</div></div>
      <div class="stat-box"><div class="label">Total Metric Tons</div><div class="value green">${formatComma((totalKilos / 1000).toFixed(2))}</div></div>
    </div>
    <div class="card">
      <div class="flex-between mb-14"><span class="text-sm text-muted">${deliveries.length} transaction(s)</span>
        <button class="btn btn-sm btn-gold" id="print-log">${icon('print', 14)} Print</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Timestamp</th><th>Farmer/FO</th><th>RSBSA</th><th>Warehouse</th><th>Variety</th><th>Bags</th><th>Kilos</th></tr></thead>
          <tbody>${rowsHtml || `<tr><td colspan="7" class="text-muted">No deliveries recorded.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('print-log').onclick = () => {
    printReport('Seasonal Procurement Delivery Log', `Generated ${new Date().toLocaleString()} · Total ${formatComma(totalBags)} Bags / ${formatComma((totalKilos / 1000).toFixed(2))} MT`, tableHtml);
  };
}

async function renderWarehouseSummaryReport(host) {
  const [warehouses, deliveries] = await Promise.all([
    db.warehouses.filter(w => !w.is_deleted).toArray(),
    db.deliveries.filter(d => !d.is_deleted).toArray()
  ]);
  const now = new Date();
  const activeSeason = await getActiveSeason();

  const rows = warehouses.map(w => {
    const whDeliveries = deliveries.filter(d => d.warehouse_name === w.warehouse_name);
    const dayBags = whDeliveries.filter(d => isSameDay(new Date(d.date_timestamp), now)).reduce((s, d) => s + Number(d.num_bags || 0), 0);
    const monthBags = whDeliveries.filter(d => { const dt = new Date(d.date_timestamp); return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear(); }).reduce((s, d) => s + Number(d.num_bags || 0), 0);
    const seasonBags = whDeliveries.filter(d => seasonOfDate(d.date_timestamp) === activeSeason && new Date(d.date_timestamp).getFullYear() === now.getFullYear()).reduce((s, d) => s + Number(d.num_bags || 0), 0);
    return { name: w.warehouse_name, dayBags, monthBags, seasonBags };
  });

  const rowsHtml = rows.map(r => `<tr><td>${r.name}</td><td>${formatComma(r.dayBags)}</td><td>${formatComma(r.monthBags)}</td><td>${formatComma(r.seasonBags)}</td></tr>`).join('');
  const tableHtml = `
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead><tr style="background:#003366;color:#fff;"><th style="padding:6px;">Warehouse</th><th style="padding:6px;">Today (Bags)</th><th style="padding:6px;">Month (Bags)</th><th style="padding:6px;">Season (Bags)</th></tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="4">No warehouses configured.</td></tr>`}</tbody>
    </table>`;

  host.innerHTML = `
    <div class="card">
      <div class="flex-between mb-14"><span class="text-sm text-muted">${warehouses.length} warehouse(s)</span>
        <button class="btn btn-sm btn-gold" id="print-wh">${icon('print', 14)} Print</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Warehouse</th><th>Today</th><th>Month</th><th>Season</th></tr></thead>
          <tbody>${rowsHtml || `<tr><td colspan="4" class="text-muted">No warehouses configured.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('print-wh').onclick = () => {
    printReport('Warehouse Summary Report', `Generated ${new Date().toLocaleString()} · ${seasonLabel(activeSeason)}`, tableHtml);
  };
}
