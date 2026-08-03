/**
 * NFA PASSBOOK — QR Scan Result (condensed view)
 * Shown immediately after a successful scan. Surfaces only what a warehouse
 * staffer needs in the moment — identity, seasonal balance, and delivery
 * history — instead of the full registration record. Full details remain
 * one tap away via "View Full Passbook Details".
 */
SCREEN_RENDERERS.scanResult = async function (container, params) {
  const id = params && params.id;
  const farmer = id ? await db.farmers.get(id) : null;

  if (!farmer) {
    container.innerHTML = `<div class="content"><div class="empty-state">${icon('empty', 48)}<p>Passbook not found.</p></div>
      <button class="btn btn-outline btn-block" onclick="navigate('scan')">Back to Scan</button></div>`;
    return;
  }

  await renderScanResultBody(container, farmer);
};

async function renderScanResultBody(container, farmer) {
  const unit = getWeightUnit();
  const allowance = await computeSeasonalAllowance(farmer);
  const name = buildDisplayName(farmer);
  const pct = allowance.totalQuotaBags > 0 ? Math.min(100, (allowance.deliveredBagsCount / allowance.totalQuotaBags) * 100) : 0;

  const history = (await db.deliveries
    .where('passbook_id').equals(farmer.passbook_id)
    .filter(d => !d.is_deleted)
    .toArray())
    .sort((a, b) => new Date(b.date_timestamp) - new Date(a.date_timestamp));

  const historyTotalBags = history.reduce((s, d) => s + Number(d.num_bags || 0), 0);
  const historyTotalKilos = history.reduce((s, d) => s + Number(d.net_kilos || 0), 0);

  container.innerHTML = `
    <div class="content">
      <div class="flex-between mb-14">
        <button class="icon-btn" style="background:var(--surface-2);color:var(--text);" id="sr-back">${icon('back', 18)}</button>
        <span class="badge badge-green" style="font-size:11px;">${icon('qr', 12)} QR MATCH FOUND</span>
        <span style="width:34px;"></span>
      </div>

      <div class="card" style="text-align:center; padding:22px 16px;">
        <div style="width:56px;height:56px;border-radius:50%;background:var(--nfa-navy);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;margin:0 auto 10px;">
          ${name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()}
        </div>
        <h2 style="font-size:18px;font-weight:800;">${name}</h2>
        <p class="text-muted text-sm mt-8">${farmer.passbook_id} · RSBSA ${farmer.rsbsa_no}</p>
        <span class="badge ${farmer.passbook_type === 'Master' ? 'badge-green' : 'badge-navy'}" style="margin-top:8px;">${farmer.passbook_type === 'Master' ? 'MASTER / FO PASSBOOK' : 'INDIVIDUAL FARMER'}</span>
      </div>

      <div class="card">
        <div class="card-title">Seasonal Delivery Balance</div>
        <span class="badge badge-gold" style="margin-bottom:10px;">${allowance.activeSeasonLabel}</span>
        <div class="stat-grid">
          <div class="stat-box"><div class="label">Quota</div><div class="value">${formatComma(allowance.totalQuotaBags)} <span style="font-size:11px;font-weight:600;">Net Bags</span></div></div>
          <div class="stat-box"><div class="label">Delivered</div><div class="value green">${formatComma(allowance.deliveredBagsCount)} <span style="font-size:11px;font-weight:600;">Net Bags</span></div></div>
        </div>
        <div class="mt-14">
          <div class="flex-between text-sm text-muted"><span>Remaining Balance</span><span><b style="color:${allowance.remainingBalanceBags < 0 ? 'var(--danger)' : 'var(--text)'}">${formatComma(allowance.remainingBalanceBags)} Net Bags</b></span></div>
          <div class="progress-track mt-8"><div class="progress-fill ${pct > 90 ? 'danger' : pct > 70 ? 'warn' : ''}" style="width:${pct}%"></div></div>
        </div>
      </div>

      <button class="btn btn-green btn-block mb-14" id="sr-record-delivery" style="font-size:15px; padding:14px;">Record New Delivery</button>

      <div class="card">
        <div class="flex-between mb-14">
          <div class="card-title" style="margin:0;">📋 Delivery History</div>
          ${renderWeightUnitToggle('sr-unit-toggle')}
        </div>
        ${history.length > 0 ? `
        <div class="stat-grid mb-14">
          <div class="stat-box"><div class="label">Lifetime Bags</div><div class="value">${formatComma(historyTotalBags)}</div></div>
          <div class="stat-box"><div class="label">Lifetime ${weightUnitLabel(unit)}</div><div class="value green">${formatWeightValue(historyTotalKilos, unit)}</div></div>
        </div>` : ''}
        <div id="sr-history-list">
          ${history.length === 0 ? `<div class="empty-state">${icon('empty', 40)}<p>No delivery records yet for this passbook.</p></div>` :
            history.slice(0, 15).map(d => `
            <div class="flex-between" style="padding:10px 0; border-bottom:1px solid var(--border);">
              <div>
                <div class="text-sm" style="font-weight:700;">${new Date(d.date_timestamp).toLocaleDateString()} <span class="text-muted" style="font-weight:500;">${new Date(d.date_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
                <div class="text-muted" style="font-size:11px;">${d.warehouse_name} · ${d.variety}</div>
              </div>
              <div style="text-align:right;">
                <span class="badge badge-gold">${formatComma(d.num_bags)} Net Bags</span>
                <div class="text-muted" style="font-size:10.5px; margin-top:3px;">${formatWeightValue(d.net_kilos, unit)} ${weightUnitLabel(unit)}</div>
              </div>
            </div>
          `).join('')}
          ${history.length > 15 ? `<p class="text-muted text-sm mt-8">+ ${history.length - 15} more record(s). View full details for the complete history.</p>` : ''}
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:10px; margin: 14px 0 24px;">
        <button class="btn btn-outline btn-block" id="sr-full-details">View Full Passbook Details</button>
        <button class="btn btn-gold btn-block" id="sr-print">${icon('print', 16)} Print Passbook ID</button>
        <button class="btn btn-primary btn-block" id="sr-scan-another">${icon('qr', 16)} Scan Another</button>
      </div>
    </div>
  `;

  document.getElementById('sr-back').onclick = () => navigate('scan');
  document.getElementById('sr-full-details').onclick = () => navigate('passbookDetail', { id: farmer.passbook_id });
  document.getElementById('sr-print').onclick = () => printPassbookId(farmer);
  document.getElementById('sr-scan-another').onclick = () => navigate('scan');
  document.getElementById('sr-record-delivery').onclick = () => {
    openRecordDeliveryModal(farmer, async () => {
      const fresh = await db.farmers.get(farmer.passbook_id);
      await renderScanResultBody(container, fresh);
    });
  };
  bindWeightUnitToggle('sr-unit-toggle', async () => {
    const fresh = await db.farmers.get(farmer.passbook_id);
    await renderScanResultBody(container, fresh);
  });
}
