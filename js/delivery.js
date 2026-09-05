/**
 * NFA PASSBOOK — Delivery Recording Logic (shared by Passbook Detail & QR Scan flows)
 */
const PALAY_VARIETIES = ['PD1-A', 'PD1-B', 'PD2-A', 'PD2-B', 'PW1-A', 'PW1-B', 'PW2-A', 'PW2-B'].sort();

async function openRecordDeliveryModal(farmer, onSaved) {
  const allowance = await computeSeasonalAllowance(farmer);
  const settings = await getAllSettings();
  const bagWeight = Number(settings.BAG_WEIGHT_KG || 50);
  const warehouses = await db.warehouses.filter(w => !w.is_deleted && w.status === 'Active').toArray();
  warehouses.sort((a, b) => a.warehouse_name.localeCompare(b.warehouse_name));
  const displayName = buildDisplayName(farmer);
  const now = new Date();

  const backdrop = openModal(`
    <div class="modal-header">
      <h3>Record New Delivery</h3>
      <button class="modal-close" id="rd-close">✕</button>
    </div>
    <div class="text-sm text-muted" style="margin-bottom:12px; line-height:1.6;">
      <b style="color:var(--text);">${displayName}</b> · RSBSA ${farmer.rsbsa_no}<br>${now.toLocaleString()}
    </div>
    <div class="card" style="background:var(--surface-2);box-shadow:none;">
      <div class="text-sm text-muted">Remaining Seasonal Balance</div>
      <div style="font-size:24px;font-weight:800;color:${allowance.remainingBalanceBags < 0 ? 'var(--danger)' : 'var(--palay-green)'};">
        ${formatComma(allowance.remainingBalanceBags)} Net Bags
      </div>
      <div class="progress-track mt-8">
        <div class="progress-fill ${allowance.deliveredBagsCount / allowance.totalQuotaBags > 0.9 ? 'danger' : allowance.deliveredBagsCount / allowance.totalQuotaBags > 0.7 ? 'warn' : ''}"
             style="width:${Math.min(100, (allowance.deliveredBagsCount / Math.max(1, allowance.totalQuotaBags)) * 100)}%"></div>
      </div>
    </div>
    <form id="delivery-form" class="mt-14">
      <div class="field"><label>Target Warehouse <span class="req">*</span></label>
        <select id="dl-warehouse" class="input-guided" required>
          ${warehouses.map(w => `<option value="${w.warehouse_name}">${w.warehouse_name}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Palay Variety <span class="req">*</span></label>
        <select id="dl-variety" class="input-guided" required>
          <option value="">Select Variety...</option>
          ${PALAY_VARIETIES.map(v => `<option value="${v}">${v}</option>`).join('')}
        </select>
      </div>
      <div class="two-col">
        <div class="field"><label>Number of Bags <span class="req">*</span></label><input type="text" inputmode="numeric" id="dl-bags" class="input-guided" required></div>
        <div class="field"><label>Net Kilograms <span class="req">*</span></label><input type="text" inputmode="decimal" id="dl-kilos" class="input-guided"></div>
      </div>
      <div class="field">
        <label>Calculated Net Bags Equivalent</label>
        <input type="text" id="dl-net-bags" disabled value="0.00">
        <div class="hint">Net weight per bag: ${bagWeight} kg. Net Kilograms auto-fills from bags, or enter manually.</div>
      </div>
      <div id="dl-warning"></div>
      <button type="submit" class="btn btn-primary btn-block mt-14">Record Delivery</button>
    </form>
  `, { center: true });

  document.getElementById('rd-close').onclick = () => closeModal(backdrop);

  const bagsInput = document.getElementById('dl-bags');
  const kilosInput = document.getElementById('dl-kilos');
  const netBagsInput = document.getElementById('dl-net-bags');
  let kilosManuallyEdited = false;

  function recompute() {
    const bags = unformatNumber(bagsInput.value);
    let kilos = unformatNumber(kilosInput.value);
    if (!kilosManuallyEdited) {
      kilos = bags * bagWeight;
      kilosInput.value = kilos ? formatComma(kilos) : '';
    }
    const netBags = kilos > 0 ? kilos / bagWeight : bags;
    netBagsInput.value = formatComma(Math.round(netBags * 100) / 100);

    const warnHost = document.getElementById('dl-warning');
    if (netBags > allowance.remainingBalanceBags) {
      warnHost.innerHTML = `<div class="toast warn" style="position:static;display:block;text-align:left;margin:10px 0 0;animation:none;">
        ⚠ This delivery (${formatComma(Math.round(netBags * 100) / 100)} Net Bags) exceeds the remaining seasonal balance (${formatComma(allowance.remainingBalanceBags)} Net Bags).
        ${AppState.currentUser.role === 'Admin' ? 'As Admin, you may override with an audit comment below.' : 'Standard users cannot complete this transaction.'}
      </div>
      ${AppState.currentUser.role === 'Admin' ? `
        <div class="field mt-8"><label>Admin Override — Audit Comment <span class="req">*</span></label>
        <textarea id="dl-override-comment" rows="2" placeholder="Explain reason for exceeding seasonal allowance..."></textarea></div>
      ` : ''}`;
    } else {
      warnHost.innerHTML = '';
    }
  }

  attachLiveCommaFormatter(bagsInput);
  attachLiveCommaFormatter(kilosInput);
  bagsInput.addEventListener('input', recompute);
  kilosInput.addEventListener('input', () => { kilosManuallyEdited = true; recompute(); });

  document.getElementById('delivery-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const bags = unformatNumber(bagsInput.value);
    const kilos = unformatNumber(kilosInput.value);
    const netBags = kilos > 0 ? kilos / bagWeight : bags;
    const variety = document.getElementById('dl-variety').value;
    const warehouseName = document.getElementById('dl-warehouse').value;

    if (!variety) { showToast('Please select a Palay Variety.', 'error'); return; }
    if (bags <= 0) { showToast('Please enter the number of bags.', 'error'); return; }

    if (netBags > allowance.remainingBalanceBags) {
      if (AppState.currentUser.role !== 'Admin') {
        showToast('Delivery blocked: exceeds remaining seasonal balance.', 'error');
        return;
      }
      const commentEl = document.getElementById('dl-override-comment');
      if (!commentEl || !commentEl.value.trim()) {
        showToast('An audit comment is required to override the seasonal allowance.', 'error');
        return;
      }
    }

    const nowIso = new Date().toISOString();
    const deliveryId = await generateUniqueDeliveryId();
    const record = {
      delivery_id: deliveryId,
      date_timestamp: nowIso,
      passbook_id: farmer.passbook_id,
      rsbsa_no: farmer.rsbsa_no,
      display_name: displayName,
      warehouse_name: warehouseName,
      num_bags: bags,
      net_kilos: kilos,
      net_bags_equivalent: Math.round(netBags * 100) / 100,
      variety,
      season: allowance.activeSeason,
      year: new Date().getFullYear(),
      recorded_by: AppState.currentUser.full_name,
      override_comment: document.getElementById('dl-override-comment') ? document.getElementById('dl-override-comment').value.trim() : '',
      last_updated: nowIso,
      is_deleted: false
    };

    await db.deliveries.put(record);
    await queueSync('deliveries', 'upsert', record);

    // audible + haptic confirmation
    playConfirmationTone();
    if (navigator.vibrate) navigator.vibrate(80);

    showToast(`Delivery recorded: ${formatComma(bags)} Net Bags from ${displayName}.`, 'success');
    closeModal(backdrop);
    if (onSaved) onSaved();
  });

  recompute();
}

/** delivery_id is timestamp+random and was never checked for uniqueness —
 *  a rapid double-tap or bulk entry within the same millisecond had a small
 *  but real chance of colliding, and Dexie's put() would silently overwrite
 *  the earlier delivery rather than erroring. Regenerate on the rare
 *  collision instead of trusting randomness alone. */
async function generateUniqueDeliveryId() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = 'DLV-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    if (!(await db.deliveries.get(candidate))) return candidate;
  }
  return 'DLV-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomUUID().slice(0, 8).toUpperCase();
}

/** Renders one delivery history row with Edit/Delete actions. */
function renderDeliveryHistoryRow(d, unit) {
  return `
    <div class="flex-between delivery-history-row" data-delivery-id="${d.delivery_id}" style="padding:10px 0; border-bottom:1px solid var(--border);">
      <div style="min-width:0; flex:1;">
        <div class="text-sm" style="font-weight:700;">${new Date(d.date_timestamp).toLocaleDateString()} <span class="text-muted" style="font-weight:500;">${new Date(d.date_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
        <div class="text-muted" style="font-size:11px;">${d.warehouse_name} · ${d.variety}</div>
      </div>
      <div style="text-align:right; margin-right:8px;">
        <span class="badge badge-gold">${formatComma(d.num_bags)} Net Bags</span>
        <div class="text-muted" style="font-size:10.5px; margin-top:3px;">${formatWeightValue(d.net_kilos, unit)} ${weightUnitLabel(unit)}</div>
      </div>
      <div style="display:flex; gap:6px; flex-shrink:0;">
        <button class="icon-btn delivery-edit-btn" style="background:var(--surface-2); color:var(--text); width:34px; height:34px;" title="Edit delivery">${icon('edit', 15)}</button>
        <button class="icon-btn delivery-delete-btn" style="background:rgba(198,40,40,0.12); color:var(--danger); width:34px; height:34px;" title="Delete delivery">✕</button>
      </div>
    </div>`;
}

/** Wires up Edit/Delete buttons within a container of delivery-history rows. */
function bindDeliveryHistoryActions(container, farmer, onChange) {
  container.querySelectorAll('.delivery-history-row').forEach(row => {
    const deliveryId = row.dataset.deliveryId;
    const editBtn = row.querySelector('.delivery-edit-btn');
    const deleteBtn = row.querySelector('.delivery-delete-btn');
    if (editBtn) {
      editBtn.onclick = async () => {
        const delivery = await db.deliveries.get(deliveryId);
        if (delivery) openEditDeliveryModal(delivery, farmer, onChange);
      };
    }
    if (deleteBtn) {
      deleteBtn.onclick = async () => {
        const ok = await confirmDialog('Delete this delivery record? This will restore the bags to the farmer\'s remaining seasonal balance.', 'Delete Delivery');
        if (!ok) return;
        const delivery = await db.deliveries.get(deliveryId);
        if (!delivery) return;
        delivery.is_deleted = true;
        delivery.last_updated = new Date().toISOString();
        await db.deliveries.put(delivery);
        await queueSync('deliveries', 'upsert', delivery);
        showToast('Delivery record deleted.', 'success');
        if (onChange) onChange();
      };
    }
  });
}

/** Modal to edit an existing delivery's warehouse, variety, bags, and kilos.
 *  Re-checks the seasonal allowance the same way the create flow does — the
 *  edit flow previously let anyone silently push an existing delivery's
 *  bags past quota with no warning and no override trail. */
async function openEditDeliveryModal(delivery, farmer, onSaved) {
  const settings = await getAllSettings();
  const bagWeight = Number(settings.BAG_WEIGHT_KG || 50);
  const warehouses = await db.warehouses.filter(w => !w.is_deleted && w.status === 'Active').toArray();
  warehouses.sort((a, b) => a.warehouse_name.localeCompare(b.warehouse_name));

  const allowance = await computeSeasonalAllowance(farmer);
  // computeSeasonalAllowance's remaining balance already has THIS delivery's
  // current value subtracted out (it's already in db.deliveries) — add it
  // back so the check below compares the new value against the balance
  // available excluding this delivery, not double-counting it.
  const oldNetBags = Number(delivery.net_bags_equivalent || delivery.num_bags || 0);
  const balanceExcludingThis = allowance.remainingBalanceBags + oldNetBags;

  const backdrop = openModal(`
    <div class="modal-header">
      <h3>Edit Delivery</h3>
      <button class="modal-close" id="ed-close">✕</button>
    </div>
    <div class="text-sm text-muted mb-14">${new Date(delivery.date_timestamp).toLocaleString()}</div>
    <form id="edit-delivery-form">
      <div class="field"><label>Target Warehouse <span class="req">*</span></label>
        <select id="ed-warehouse" class="input-guided" required>
          ${warehouses.map(w => `<option value="${w.warehouse_name}" ${w.warehouse_name === delivery.warehouse_name ? 'selected' : ''}>${w.warehouse_name}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Palay Variety <span class="req">*</span></label>
        <select id="ed-variety" class="input-guided" required>
          ${PALAY_VARIETIES.map(v => `<option value="${v}" ${v === delivery.variety ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="two-col">
        <div class="field"><label>Number of Bags <span class="req">*</span></label><input type="text" inputmode="numeric" id="ed-bags" class="input-guided" required value="${formatComma(delivery.num_bags)}"></div>
        <div class="field"><label>Net Kilograms <span class="req">*</span></label><input type="text" inputmode="decimal" id="ed-kilos" class="input-guided" value="${formatComma(delivery.net_kilos)}"></div>
      </div>
      <div id="ed-warning"></div>
      <button type="submit" class="btn btn-primary btn-block mt-14">Save Changes</button>
    </form>
  `, { center: true });

  document.getElementById('ed-close').onclick = () => closeModal(backdrop);
  const bagsInput = document.getElementById('ed-bags');
  const kilosInput = document.getElementById('ed-kilos');
  attachLiveCommaFormatter(bagsInput);
  attachLiveCommaFormatter(kilosInput);
  // Unlike the create-delivery modal, kilos here is pre-filled with the
  // delivery's real, already-recorded value, which can legitimately differ
  // from bags*bagWeight (actual weighing varies per bag). The mutation this
  // flag guards only ever runs from the bagsInput 'input' listener below —
  // never from the initial recomputeEditWarning() call at the bottom of
  // this function — so starting it false is safe: opening the modal never
  // touches kilos, and it only auto-syncs once the user actually edits
  // bags in this session (and stops the moment they touch kilos directly).
  let kilosManuallyEdited = false;

  function recomputeEditWarning() {
    const bags = unformatNumber(bagsInput.value);
    const kilos = unformatNumber(kilosInput.value) || bags * bagWeight;
    const netBags = kilos > 0 ? kilos / bagWeight : bags;
    const warnHost = document.getElementById('ed-warning');
    if (netBags > balanceExcludingThis) {
      warnHost.innerHTML = `<div class="toast warn" style="position:static;display:block;text-align:left;margin:10px 0 0;animation:none;">
        ⚠ This change (${formatComma(Math.round(netBags * 100) / 100)} Net Bags) exceeds the remaining seasonal balance (${formatComma(balanceExcludingThis)} Net Bags).
        ${AppState.currentUser.role === 'Admin' ? 'As Admin, you may override with an audit comment below.' : 'Standard users cannot save this change.'}
      </div>
      ${AppState.currentUser.role === 'Admin' ? `
        <div class="field mt-8"><label>Admin Override — Audit Comment <span class="req">*</span></label>
        <textarea id="ed-override-comment" rows="2" placeholder="Explain reason for exceeding seasonal allowance...">${delivery.override_comment || ''}</textarea></div>
      ` : ''}`;
    } else {
      warnHost.innerHTML = '';
    }
  }
  // Editing "Number of Bags" alone previously left net_kilos/net_bags_equivalent
  // stale (kilosInput still held the pre-edit value, and a non-empty stale
  // value always won over recomputing from the new bags in the checks
  // above) — silently wrong saved data, and it could mask a real quota
  // violation instead of catching one. Auto-sync kilos from the new bags
  // value, same as the create-delivery flow, but only once the user
  // actually edits bags in this session (not on open — see the comment on
  // kilosManuallyEdited above).
  bagsInput.addEventListener('input', () => {
    if (!kilosManuallyEdited) {
      const bags = unformatNumber(bagsInput.value);
      const autoKilos = bags * bagWeight;
      kilosInput.value = autoKilos ? formatComma(autoKilos) : '';
    }
    recomputeEditWarning();
  });
  kilosInput.addEventListener('input', () => { kilosManuallyEdited = true; recomputeEditWarning(); });
  recomputeEditWarning();

  document.getElementById('edit-delivery-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const bags = unformatNumber(bagsInput.value);
    const kilos = unformatNumber(kilosInput.value) || bags * bagWeight;
    const netBags = kilos > 0 ? kilos / bagWeight : bags;

    if (bags <= 0) { showToast('Please enter the number of bags.', 'error'); return; }

    if (netBags > balanceExcludingThis) {
      if (AppState.currentUser.role !== 'Admin') {
        showToast('Update blocked: exceeds remaining seasonal balance.', 'error');
        return;
      }
      const commentEl = document.getElementById('ed-override-comment');
      if (!commentEl || !commentEl.value.trim()) {
        showToast('An audit comment is required to override the seasonal allowance.', 'error');
        return;
      }
      delivery.override_comment = commentEl.value.trim();
    }

    delivery.warehouse_name = document.getElementById('ed-warehouse').value;
    delivery.variety = document.getElementById('ed-variety').value;
    delivery.num_bags = bags;
    delivery.net_kilos = kilos;
    delivery.net_bags_equivalent = Math.round(netBags * 100) / 100;
    delivery.last_updated = new Date().toISOString();

    await db.deliveries.put(delivery);
    await queueSync('deliveries', 'upsert', delivery);
    showToast('Delivery updated.', 'success');
    closeModal(backdrop);
    if (onSaved) onSaved();
  });
}

function playConfirmationTone() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) { /* audio not available */ }
}
