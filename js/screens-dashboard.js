/**
 * NFA PASSBOOK — Live Procurement Dashboard & Analytics
 */
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Ensures a progress bar with real (nonzero) progress is always visibly
 *  perceptible, even when the true percentage is tiny against a large
 *  branch-wide target — without misrepresenting the displayed number. */
function visibleBarWidth(pct) {
  if (pct <= 0) return 0;
  return Math.max(pct, 1.5);
}

SCREEN_RENDERERS.dashboard = async function (container) {
  container.innerHTML = `<div class="content"><div class="center" style="padding-top:60px;"><div class="loader dark" style="margin:0 auto;"></div></div></div>`;
  await renderDashboardBody(container);
};

async function renderDashboardBody(container) {
  const unit = getWeightUnit();

  const [farmers, deliveries, warehouses, settings] = await Promise.all([
    db.farmers.filter(f => !f.is_deleted).toArray(),
    db.deliveries.filter(d => !d.is_deleted).toArray(),
    db.warehouses.filter(w => !w.is_deleted).toArray(),
    getAllSettings()
  ]);
  const bagWeight = Number(settings.BAG_WEIGHT_KG || 50);

  const now = new Date();
  const currentYear = now.getFullYear();
  const activeSeason = await getActiveSeason();
  const currentSeasonYearKey = seasonYearKeyOfDate(now);

  const todayDeliveries = deliveries.filter(d => isSameDay(new Date(d.date_timestamp), now));
  const todayBags = todayDeliveries.reduce((s, d) => s + Number(d.net_bags_equivalent || d.num_bags || 0), 0);
  const todayKilos = todayDeliveries.reduce((s, d) => s + Number(d.net_kilos || 0), 0);
  const todayFarmers = new Set(todayDeliveries.map(d => d.passbook_id)).size;

  const seasonDeliveries = deliveries.filter(d => {
    return seasonYearKeyOfDate(d.date_timestamp) === currentSeasonYearKey && seasonOfDate(d.date_timestamp) === activeSeason;
  });
  const seasonActualKilos = seasonDeliveries.reduce((s, d) => s + Number(d.net_kilos || 0), 0);
  const targetBags = Number(settings.TARGET_PROCUREMENT_BAGS || 1000000);
  const targetKilos = targetBags * bagWeight;
  const progressPct = targetKilos > 0 ? Math.min(100, (seasonActualKilos / targetKilos) * 100) : 0;

  // Provincial breakdown (province derived from farmer's farm_province)
  const farmerMap = {};
  farmers.forEach(f => farmerMap[f.passbook_id] = f);

  const provinceStats = {};
  deliveries.forEach(d => {
    const f = farmerMap[d.passbook_id];
    const prov = f ? f.farm_province : 'Unknown';
    if (!provinceStats[prov]) provinceStats[prov] = { today: 0, month: 0, year: 0 };
    const dt = new Date(d.date_timestamp);
    const kilos = Number(d.net_kilos || 0);
    if (dt.getFullYear() === currentYear) {
      provinceStats[prov].year += kilos;
      if (dt.getMonth() === now.getMonth()) provinceStats[prov].month += kilos;
      if (isSameDay(dt, now)) provinceStats[prov].today += kilos;
    }
  });

  // Per-warehouse ranking (active season) — bags + weight
  const warehouseStats = {};
  seasonDeliveries.forEach(d => {
    if (!warehouseStats[d.warehouse_name]) warehouseStats[d.warehouse_name] = { bags: 0, kilos: 0 };
    warehouseStats[d.warehouse_name].bags += Number(d.net_bags_equivalent || d.num_bags || 0);
    warehouseStats[d.warehouse_name].kilos += Number(d.net_kilos || 0);
  });
  const warehouseRanking = Object.entries(warehouseStats).sort((a, b) => b[1].bags - a[1].bags).slice(0, 8);
  const topWarehouseBags = warehouseRanking.length ? warehouseRanking[0][1].bags : 0;
  const medal = ['🥇', '🥈', '🥉'];

  // 14-day trend
  const trendDays = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dayBags = deliveries.filter(x => isSameDay(new Date(x.date_timestamp), d))
      .reduce((s, x) => s + Number(x.net_bags_equivalent || x.num_bags || 0), 0);
    trendDays.push({ date: d, bags: dayBags });
  }
  const maxTrend = Math.max(1, ...trendDays.map(t => t.bags));

  // Top municipalities
  const muniStats = {};
  seasonDeliveries.forEach(d => {
    const f = farmerMap[d.passbook_id];
    const muni = f ? f.farm_municipality : 'Unknown';
    muniStats[muni] = (muniStats[muni] || 0) + Number(d.net_bags_equivalent || d.num_bags || 0);
  });
  const topMuni = Object.entries(muniStats).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Latest transactions
  const latest = [...deliveries].sort((a, b) => new Date(b.date_timestamp) - new Date(a.date_timestamp)).slice(0, 10);

  const seasonIcon = activeSeason === 'SUMMER' ? ICONS_SEASON.sunny : ICONS_SEASON.storm;

  container.innerHTML = `
    <div class="content stagger">
      <div class="flex-between mb-14">
        <div class="season-pop-badge ${activeSeason === 'SUMMER' ? 'summer' : 'main'}">
          ${seasonIcon}
          <span>${seasonLabel(activeSeason)}</span>
        </div>
        ${renderWeightUnitToggle('dash-unit-toggle')}
      </div>

      <div class="stat-grid mb-14">
        <div class="stat-box" style="animation-delay:0ms">
          <div class="label">Today's Procurement</div>
          <div class="value">${formatComma(todayBags)} <span style="font-size:12px;font-weight:600;">Net Bags</span></div>
          <div class="text-sm text-muted mt-8">${formatWeightValue(todayKilos, unit)} ${weightUnitLabel(unit)} · ${todayFarmers} farmer(s)</div>
        </div>
        <div class="stat-box" style="animation-delay:40ms">
          <div class="label">Active Season Progress</div>
          <div class="value green">${progressPct.toFixed(unit === 'MT' ? 1 : 2)}%</div>
          <div class="text-sm text-muted mt-8">${formatWeightValue(seasonActualKilos, unit)} / ${formatWeightValue(targetKilos, unit)} ${weightUnitLabel(unit)}</div>
        </div>
      </div>

      <div class="card" style="animation-delay:80ms">
        <div class="card-title">Branch Target Progress</div>
        <div class="progress-track"><div class="progress-fill ${progressPct > 90 ? '' : progressPct > 60 ? 'warn' : ''}" style="width:${visibleBarWidth(progressPct)}%"></div></div>
        <div class="flex-between mt-8 text-sm text-muted">
          <span>${seasonLabel(activeSeason)}</span>
          <span>${progressPct.toFixed(unit === 'MT' ? 1 : 2)}% of target</span>
        </div>
        <div class="text-sm text-muted mt-8">${formatComma(kilosToNetBags(seasonActualKilos, bagWeight))} / ${formatComma(targetBags)} Net Bags <span class="text-muted">(≈ ${formatWeightValue(seasonActualKilos, unit)} / ${formatWeightValue(targetKilos, unit)} ${weightUnitLabel(unit)})</span></div>
      </div>

      <div class="card" style="animation-delay:120ms">
        <div class="card-title">Procurement Volume by Province</div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Province</th><th>Today (${weightUnitLabel(unit)})</th><th>Month (${weightUnitLabel(unit)})</th><th>Year (${weightUnitLabel(unit)})</th></tr></thead>
            <tbody>
              ${Object.entries(provinceStats).length === 0 ? `<tr><td colspan="4" class="text-muted">No records yet</td></tr>` :
                Object.entries(provinceStats).sort((a, b) => b[1].year - a[1].year).map(([prov, s]) => `
                <tr><td>${prov}</td><td>${formatWeightValue(s.today, unit)}</td><td>${formatWeightValue(s.month, unit)}</td><td>${formatWeightValue(s.year, unit)}</td></tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card" style="animation-delay:160ms">
        <div class="card-title">🏆 Top Warehouse Ranking (Active Season)</div>
        ${warehouseRanking.length === 0 ? `<p class="text-muted text-sm">No deliveries recorded this season.</p>` :
          warehouseRanking.map(([wh, s], i) => `
          <div class="leaderboard-row ${i < 3 ? 'top-rank' : ''}">
            <span class="rank-marker">${medal[i] || (i + 1)}</span>
            <div class="rank-info">
              <div class="rank-name">${wh}</div>
              <div class="progress-track" style="height:7px; margin-top:4px;">
                <div class="progress-fill" style="width:${topWarehouseBags ? visibleBarWidth((s.bags / topWarehouseBags) * 100) : 0}%"></div>
              </div>
            </div>
            <div class="rank-values">
              <span class="badge badge-navy">${formatComma(s.bags)} Net Bags</span>
              <span class="text-muted" style="font-size:10.5px; margin-top:3px;">${formatWeightValue(s.kilos, unit)} ${weightUnitLabel(unit)}</span>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="card" style="animation-delay:200ms">
        <div class="card-title">14-Day Delivery Trend (Net Bags)</div>
        <div class="bar-chart">
          ${trendDays.map(t => `
            <div class="bar-col">
              <div class="bar" style="height:${(t.bags / maxTrend) * 100}%" title="${formatComma(t.bags)} Net Bags"></div>
              <div class="bar-label">${t.date.getMonth() + 1}/${t.date.getDate()}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="card" style="animation-delay:240ms">
        <div class="card-title">Top Municipalities Distribution</div>
        ${topMuni.length === 0 ? `<p class="text-muted text-sm">No records yet.</p>` :
          topMuni.map(([m, bags], i) => `
          <div class="flex-between" style="padding:7px 0; border-bottom:1px solid var(--border);">
            <span class="text-sm"><b>${i + 1}.</b> ${m}</span>
            <span class="badge badge-green">${formatComma(bags)} Net Bags</span>
          </div>
        `).join('')}
      </div>

      <div class="card" style="animation-delay:280ms">
        <div class="card-title">Latest Transactions Stream</div>
        ${latest.length === 0 ? `<div class="empty-state">${icon('empty', 44)}<p>No deliveries recorded yet. Scan a Passbook QR to record one.</p></div>` :
          latest.map(d => `
          <div class="flex-between" style="padding:8px 0; border-bottom:1px solid var(--border);">
            <div>
              <div class="text-sm" style="font-weight:700;">${d.display_name}</div>
              <div class="text-muted" style="font-size:11px;">${new Date(d.date_timestamp).toLocaleString()} · ${d.warehouse_name}</div>
            </div>
            <span class="badge badge-gold">${formatComma(d.num_bags)} Net Bags</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  bindWeightUnitToggle('dash-unit-toggle', () => renderDashboardBody(container));
}
