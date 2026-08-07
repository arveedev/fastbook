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
    const deliveryId = 'DLV-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
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

/** Modal to edit an existing delivery's warehouse, variety, bags, and kilos. */
async function openEditDeliveryModal(delivery, farmer, onSaved) {
  const settings = await getAllSettings();
  const bagWeight = Number(settings.BAG_WEIGHT_KG || 50);
  const warehouses = await db.warehouses.filter(w => !w.is_deleted && w.status === 'Active').toArray();
  warehouses.sort((a, b) => a.warehouse_name.localeCompare(b.warehouse_name));

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
      <button type="submit" class="btn btn-primary btn-block mt-14">Save Changes</button>
    </form>
  `, { center: true });

  document.getElementById('ed-close').onclick = () => closeModal(backdrop);
  attachLiveCommaFormatter(document.getElementById('ed-bags'));
  attachLiveCommaFormatter(document.getElementById('ed-kilos'));

  document.getElementById('edit-delivery-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const bags = unformatNumber(document.getElementById('ed-bags').value);
    const kilos = unformatNumber(document.getElementById('ed-kilos').value) || bags * bagWeight;
    const netBags = kilos > 0 ? kilos / bagWeight : bags;

    if (bags <= 0) { showToast('Please enter the number of bags.', 'error'); return; }

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
