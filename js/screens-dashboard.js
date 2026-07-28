/**
 * NFA PASSBOOK — Live Procurement Dashboard & Analytics
 */
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

SCREEN_RENDERERS.dashboard = async function (container) {
  container.innerHTML = `<div class="content"><div class="center" style="padding-top:60px;"><div class="loader dark" style="margin:0 auto;"></div></div></div>`;

  const [farmers, deliveries, warehouses, settings] = await Promise.all([
    db.farmers.filter(f => !f.is_deleted).toArray(),
    db.deliveries.filter(d => !d.is_deleted).toArray(),
    db.warehouses.filter(w => !w.is_deleted).toArray(),
    getAllSettings()
  ]);

  const bagWeight = Number(settings.BAG_WEIGHT_KG || 50);
  const now = new Date();
  const activeSeason = await getActiveSeason();
  const currentYear = now.getFullYear();

  const todayDeliveries = deliveries.filter(d => isSameDay(new Date(d.date_timestamp), now));
  const todayBags = todayDeliveries.reduce((s, d) => s + Number(d.net_bags_equivalent || d.num_bags || 0), 0);
  const todayMT = todayDeliveries.reduce((s, d) => s + Number(d.net_kilos || 0), 0) / 1000;
  const todayFarmers = new Set(todayDeliveries.map(d => d.passbook_id)).size;

  const seasonDeliveries = deliveries.filter(d => {
    const dt = new Date(d.date_timestamp);
    return dt.getFullYear() === currentYear && seasonOfDate(d.date_timestamp) === activeSeason;
  });
  const seasonActualMT = seasonDeliveries.reduce((s, d) => s + Number(d.net_kilos || 0), 0) / 1000;
  const targetMT = Number(settings.TARGET_PROCUREMENT_MT || 50000);
  const progressPct = targetMT > 0 ? Math.min(100, (seasonActualMT / targetMT) * 100) : 0;

  // Provincial breakdown (province derived from farmer's farm_province)
  const farmerMap = {};
  farmers.forEach(f => farmerMap[f.passbook_id] = f);

  const provinceStats = {};
  deliveries.forEach(d => {
    const f = farmerMap[d.passbook_id];
    const prov = f ? f.farm_province : 'Unknown';
    if (!provinceStats[prov]) provinceStats[prov] = { today: 0, month: 0, year: 0 };
    const dt = new Date(d.date_timestamp);
    const mt = Number(d.net_kilos || 0) / 1000;
    if (dt.getFullYear() === currentYear) {
      provinceStats[prov].year += mt;
      if (dt.getMonth() === now.getMonth()) provinceStats[prov].month += mt;
      if (isSameDay(dt, now)) provinceStats[prov].today += mt;
    }
  });

  // Per-warehouse ranking (active season)
  const warehouseStats = {};
  seasonDeliveries.forEach(d => {
    warehouseStats[d.warehouse_name] = (warehouseStats[d.warehouse_name] || 0) + Number(d.net_bags_equivalent || d.num_bags || 0);
  });
  const warehouseRanking = Object.entries(warehouseStats).sort((a, b) => b[1] - a[1]).slice(0, 6);

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

  container.innerHTML = `
    <div class="content stagger">
      <div class="stat-grid mb-14">
        <div class="stat-box" style="animation-delay:0ms">
          <div class="label">Today's Procurement</div>
          <div class="value">${formatComma(todayBags)} <span style="font-size:12px;font-weight:600;">bags</span></div>
          <div class="text-sm text-muted mt-8">${formatComma(todayMT.toFixed(2))} MT · ${todayFarmers} farmer(s)</div>
        </div>
        <div class="stat-box" style="animation-delay:40ms">
          <div class="label">Active Season Progress</div>
          <div class="value green">${progressPct.toFixed(1)}%</div>
          <div class="text-sm text-muted mt-8">${formatComma(seasonActualMT.toFixed(2))} / ${formatComma(targetMT)} MT</div>
        </div>
      </div>

      <div class="card" style="animation-delay:80ms">
        <div class="card-title">Branch Target Progress</div>
        <div class="progress-track"><div class="progress-fill ${progressPct > 90 ? '' : progressPct > 60 ? 'warn' : ''}" style="width:${progressPct}%"></div></div>
        <div class="flex-between mt-8 text-sm text-muted">
          <span>${seasonLabel(activeSeason)}</span>
          <span>${progressPct.toFixed(1)}% of target</span>
        </div>
      </div>

      <div class="card" style="animation-delay:120ms">
        <div class="card-title">Procurement Volume by Province</div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Province</th><th>Today (MT)</th><th>Month (MT)</th><th>Year (MT)</th></tr></thead>
            <tbody>
              ${Object.entries(provinceStats).length === 0 ? `<tr><td colspan="4" class="text-muted">No records yet</td></tr>` :
                Object.entries(provinceStats).sort((a, b) => b[1].year - a[1].year).map(([prov, s]) => `
                <tr><td>${prov}</td><td>${formatComma(s.today.toFixed(2))}</td><td>${formatComma(s.month.toFixed(2))}</td><td>${formatComma(s.year.toFixed(2))}</td></tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card" style="animation-delay:160ms">
        <div class="card-title">Per-Warehouse Ranking (Active Season)</div>
        ${warehouseRanking.length === 0 ? `<p class="text-muted text-sm">No deliveries recorded this season.</p>` :
          warehouseRanking.map(([wh, bags], i) => `
          <div class="flex-between" style="padding:7px 0; border-bottom:1px solid var(--border);">
            <span class="text-sm"><b>${i + 1}.</b> ${wh}</span>
            <span class="badge badge-navy">${formatComma(bags)} bags</span>
          </div>
        `).join('')}
      </div>

      <div class="card" style="animation-delay:200ms">
        <div class="card-title">14-Day Delivery Trend (Net Bags)</div>
        <div class="bar-chart">
          ${trendDays.map(t => `
            <div class="bar-col">
              <div class="bar" style="height:${(t.bags / maxTrend) * 100}%" title="${formatComma(t.bags)} bags"></div>
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
            <span class="badge badge-green">${formatComma(bags)} bags</span>
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
            <span class="badge badge-gold">${formatComma(d.num_bags)} bags</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
};
