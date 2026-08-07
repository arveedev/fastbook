/**
 * NFA PASSBOOK — Passbook Information & Seasonal Balance Display
 */
SCREEN_RENDERERS.passbookDetail = async function (container, params) {
  const id = params && params.id;
  const farmer = id ? await db.farmers.get(id) : null;

  if (!farmer) {
    container.innerHTML = `<div class="content"><div class="empty-state">${icon('empty', 48)}<p>Passbook not found.</p></div>
      <button class="btn btn-outline btn-block" onclick="navigate('passbooks')">Back to Passbooks</button></div>`;
    return;
  }

  await renderPassbookDetailBody(container, farmer);
};

async function renderPassbookDetailBody(container, farmer) {
  const unit = getWeightUnit();
  const allowance = await computeSeasonalAllowance(farmer);
  const name = buildDisplayName(farmer);
  const pct = allowance.totalQuotaBags > 0 ? Math.min(100, (allowance.deliveredBagsCount / allowance.totalQuotaBags) * 100) : 0;
  const landholding = farmer.landholding_data ? JSON.parse(farmer.landholding_data) : [];

  const history = (await db.deliveries
    .where('passbook_id').equals(farmer.passbook_id)
    .filter(d => !d.is_deleted)
    .toArray())
    .sort((a, b) => new Date(b.date_timestamp) - new Date(a.date_timestamp));

  container.innerHTML = `
    <div class="content">
      <div class="flex-between mb-14">
        <button class="icon-btn" style="background:var(--surface-2);color:var(--text);" id="pd-back">${icon('back', 18)}</button>
        <span class="badge ${farmer.passbook_type === 'Master' ? 'badge-green' : 'badge-navy'}">${farmer.passbook_type === 'Master' ? 'MASTER PASSBOOK' : 'INDIVIDUAL FARMER'}</span>
        <span style="width:34px;"></span>
      </div>

      <div class="card stagger">
        <h2 style="font-size:20px;font-weight:800;">${name}</h2>
        <p class="text-muted" style="font-size:13.5px; margin-top:6px;">${farmer.passbook_id} · RSBSA ${farmer.rsbsa_no}</p>
        <div class="divider"></div>
        <div class="two-col" style="font-size:14px;">
          <div><b>Civil Status:</b><br>${farmer.civil_status || '—'}</div>
          <div><b>Gender:</b><br>${farmer.gender || '—'}</div>
          <div><b>Contact:</b><br>${farmer.contact_no || '—'}</div>
          <div><b>Sector:</b><br>${farmer.sector || '—'}</div>
          <div><b>Hectarage:</b><br>${formatComma(farmer.hectarage)} Ha</div>
          <div><b>Irrigated:</b><br>${farmer.irrigated || '—'}</div>
        </div>
        <div class="divider"></div>
        <div style="font-size:14px;"><b>Home Address:</b><br>${farmer.home_barangay}, ${farmer.home_municipality}, ${farmer.home_province}</div>
        <div style="font-size:14px; margin-top:10px;"><b>Farm Address:</b><br>${farmer.farm_barangay}, ${farmer.farm_municipality}, ${farmer.farm_province}</div>
        <div style="font-size:14px; margin-top:10px;"><b>Landholding Data:</b><br>${landholding.join(', ') || '—'}</div>
      </div>

      <div class="card">
        <div class="card-title">Seasonal Delivery Panel</div>
        <span class="badge badge-gold mb-14" style="margin-bottom:10px;">${allowance.activeSeasonLabel}</span>
        <div class="stat-grid">
          <div class="stat-box"><div class="label">Per Season Quota</div><div class="value">${formatComma(allowance.totalQuotaBags)} <span style="font-size:11px;font-weight:600;">Net Bags</span></div></div>
          <div class="stat-box"><div class="label">Delivered This Season</div><div class="value green">${formatComma(allowance.deliveredBagsCount)} <span style="font-size:11px;font-weight:600;">Net Bags</span></div></div>
        </div>
        <div class="mt-14">
          <div class="flex-between text-sm text-muted"><span>Remaining Balance</span><span><b style="color:${allowance.remainingBalanceBags < 0 ? 'var(--danger)' : 'var(--text)'}">${formatComma(allowance.remainingBalanceBags)} Net Bags</b></span></div>
          <div class="progress-track mt-8"><div class="progress-fill ${pct > 90 ? 'danger' : pct > 70 ? 'warn' : ''}" style="width:${pct}%"></div></div>
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:14px;">
        <button class="btn btn-green btn-block" id="pd-record-delivery">Record New Delivery</button>
        <button class="btn btn-outline btn-block" id="pd-edit">${icon('edit', 16)} Edit Passbook Details</button>
        <button class="btn btn-gold btn-block" id="pd-print">${icon('print', 16)} Print Passbook ID</button>
      </div>

      <div class="card" style="margin-bottom:24px;">
        <div class="flex-between mb-14">
          <div class="card-title" style="margin:0;">📋 Delivery History</div>
          ${renderWeightUnitToggle('pd-unit-toggle')}
        </div>
        <div id="pd-history-list">
          ${history.length === 0 ? `<div class="empty-state">${icon('empty', 40)}<p>No delivery records yet.</p></div>` :
            history.map(d => renderDeliveryHistoryRow(d, unit)).join('')}
        </div>
      </div>
    </div>
  `;

  document.getElementById('pd-back').onclick = () => navigate('passbooks');
  document.getElementById('pd-edit').onclick = () => navigate('passbookForm', { id: farmer.passbook_id });
  document.getElementById('pd-print').onclick = () => printPassbookId(farmer);
  document.getElementById('pd-record-delivery').onclick = () => {
    openRecordDeliveryModal(farmer, async () => {
      const fresh = await db.farmers.get(farmer.passbook_id);
      await renderPassbookDetailBody(container, fresh);
    });
  };

  const refreshDetail = async () => {
    const fresh = await db.farmers.get(farmer.passbook_id);
    await renderPassbookDetailBody(container, fresh);
  };
  bindDeliveryHistoryActions(document.getElementById('pd-history-list'), farmer, refreshDetail);
  bindWeightUnitToggle('pd-unit-toggle', refreshDetail);
}
