/**
 * NFA PASSBOOK — System Settings, Warehouse & User Management (Admin)
 */
SCREEN_RENDERERS.settings = async function (container, params) {
  const isAdmin = AppState.currentUser.role === 'Admin';
  const activeTab = (params && params.tab) || 'general';
  // Non-admins only ever see General (Sync & Backend and Warehouses/Users are Admin-only)
  const resolvedTab = isAdmin ? activeTab : 'general';

  container.innerHTML = `
    <div class="content">
      <h2 style="font-size:16px;font-weight:800;margin-bottom:12px;">Settings</h2>
      ${isAdmin ? `
      <div class="subtabs" id="settings-subtabs">
        <button data-t="general" class="${resolvedTab === 'general' ? 'active' : ''}">General</button>
        <button data-t="warehouses" class="${resolvedTab === 'warehouses' ? 'active' : ''}">Warehouses</button>
        <button data-t="users" class="${resolvedTab === 'users' ? 'active' : ''}">Users</button>
        <button data-t="sync" class="${resolvedTab === 'sync' ? 'active' : ''}">Sync &amp; Backend</button>
      </div>` : ''}
      <div id="settings-host"></div>
    </div>
  `;

  if (isAdmin) {
    document.getElementById('settings-subtabs').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      navigate('settings', { tab: btn.dataset.t });
    });
  }

  const host = document.getElementById('settings-host');
  if (resolvedTab === 'general') await renderGeneralSettings(host, isAdmin);
  else if (resolvedTab === 'warehouses' && isAdmin) await renderWarehouseSettings(host);
  else if (resolvedTab === 'users' && isAdmin) await renderUserSettings(host);
  else if (resolvedTab === 'sync' && isAdmin) await renderSyncSettings(host, isAdmin);
};

/* ---------------- GENERAL ---------------- */
async function renderGeneralSettings(host, isAdmin) {
  const s = await getAllSettings();
  host.innerHTML = `
    <div class="card">
      <div class="card-title">Agency &amp; Region Configuration</div>
      <div class="field"><label>Region Code</label><input type="text" id="s-region" value="${s.REGION_CODE || 'V'}" ${isAdmin ? '' : 'disabled'} maxlength="3" style="text-transform:uppercase;"></div>
      <div class="field"><label>Branch Name</label><input type="text" id="s-branch-name" value="${s.BRANCH_NAME || ''}" ${isAdmin ? '' : 'disabled'}></div>
      <div class="field"><label>Branch Code (3-letter)</label><input type="text" id="s-branch-code" value="${s.BRANCH_CODE || ''}" ${isAdmin ? '' : 'disabled'} maxlength="3" style="text-transform:uppercase;"></div>
      <div class="field"><label>Active Season Procurement Target (Net Bags)</label><input type="text" inputmode="decimal" id="s-target-bags" value="${formatComma(s.TARGET_PROCUREMENT_BAGS || 0)}" ${isAdmin ? '' : 'disabled'}></div>
      <div class="field"><label>Standard Bag Weight (kg)</label><input type="text" inputmode="numeric" id="s-bag-weight" value="${s.BAG_WEIGHT_KG || 50}" ${isAdmin ? '' : 'disabled'}></div>
      <div class="field"><label>Season Override</label>
        <select id="s-season-override" ${isAdmin ? '' : 'disabled'}>
          <option value="AUTO" ${s.SEASON_OVERRIDE === 'AUTO' ? 'selected' : ''}>Auto (based on calendar date)</option>
          <option value="SUMMER" ${s.SEASON_OVERRIDE === 'SUMMER' ? 'selected' : ''}>Force Summer Cropping Season</option>
          <option value="MAIN" ${s.SEASON_OVERRIDE === 'MAIN' ? 'selected' : ''}>Force Main Cropping Season</option>
        </select>
        <div class="hint">Overrides the background theme and seasonal quota calculations regardless of the active calendar date.</div>
      </div>
      ${isAdmin ? `<button class="btn btn-primary btn-block" id="save-general">Save Settings</button>` : `<p class="text-sm text-muted">Only Administrators can modify these settings.</p>`}
    </div>
    ${isAdmin ? `
    <div class="card">
      <div class="card-title">Database Maintenance</div>
      <p class="text-sm text-muted mb-14">Repairs the cloud backend's spreadsheet schema (adds missing sheets/columns) without deleting any existing data. Requires a configured backend URL.</p>
      <button class="btn btn-outline btn-block" id="trigger-repair">Trigger Database Repair Routine</button>
      <p class="text-sm text-muted mb-14 mt-14">Removes duplicate farmer records (same name + RSBSA no.) that resulted from a Sheet being bulk-imported more than once. Keeps the earliest passbook ID per farmer; the rest are marked deleted so every device drops them on next sync.</p>
      <button class="btn btn-outline btn-block" id="trigger-dedupe">Remove Duplicate Farmer Records</button>
    </div>` : ''}
  `;

  if (isAdmin) {
    attachLiveCommaFormatter(document.getElementById('s-target-bags'));
    document.getElementById('save-general').onclick = async () => {
      await setSetting('REGION_CODE', document.getElementById('s-region').value.toUpperCase().trim());
      await setSetting('BRANCH_NAME', document.getElementById('s-branch-name').value.trim());
      await setSetting('BRANCH_CODE', document.getElementById('s-branch-code').value.toUpperCase().trim());
      await setSetting('TARGET_PROCUREMENT_BAGS', unformatNumber(document.getElementById('s-target-bags').value));
      await setSetting('BAG_WEIGHT_KG', unformatNumber(document.getElementById('s-bag-weight').value));
      await setSetting('SEASON_OVERRIDE', document.getElementById('s-season-override').value);
      showToast('Settings saved successfully.', 'success');
      await renderAppShell();
      navigate('settings', { tab: 'general' });
    };
    document.getElementById('trigger-repair').onclick = async () => {
      try {
        showToast('Contacting backend...', 'info');
        const result = await triggerRemoteRepair();
        if (result.status === 'success') {
          openModal(`<div class="modal-header"><h3>Repair Complete</h3></div>
            <ul style="font-size:12.5px; padding-left:18px;">${(result.repair_logs || []).map(l => `<li>${l}</li>`).join('') || '<li>No changes needed — schema already up to date.</li>'}</ul>
            <button class="btn btn-primary btn-block mt-14" onclick="this.closest('.modal-backdrop').remove()">Close</button>`, { center: true });
        } else {
          showToast(result.message || 'Repair failed.', 'error');
        }
      } catch (err) {
        showToast('Could not reach backend: ' + err.message, 'error');
      }
    };
    document.getElementById('trigger-dedupe').onclick = async () => {
      const ok = await confirmDialog('Remove duplicate farmer records from the shared backend? This keeps the earliest passbook ID per farmer (matched by name + RSBSA no.) and marks the rest deleted. This cannot be undone from within the app.', 'Remove Duplicate Farmers');
      if (!ok) return;
      try {
        showToast('Contacting backend...', 'info');
        const result = await triggerRemoteDedupe();
        if (result.status === 'success') {
          openModal(`<div class="modal-header"><h3>Dedupe Complete</h3></div>
            <ul style="font-size:12.5px; padding-left:18px;">${(result.log || []).map(l => `<li>${l}</li>`).join('')}</ul>
            <button class="btn btn-primary btn-block mt-14" onclick="this.closest('.modal-backdrop').remove()">Close</button>`, { center: true });
          runSync().catch(() => {});
        } else {
          showToast(result.message || 'Dedupe failed.', 'error');
        }
      } catch (err) {
        showToast('Could not reach backend: ' + err.message, 'error');
      }
    };
  }
}

/* ---------------- WAREHOUSES ---------------- */
async function renderWarehouseSettings(host) {
  const warehouses = (await db.warehouses.filter(w => !w.is_deleted).toArray()).sort((a, b) => a.warehouse_name.localeCompare(b.warehouse_name));
  host.innerHTML = `
    <div class="card">
      <div class="flex-between mb-14"><div class="card-title" style="margin:0;">Warehouse List</div><button class="btn btn-sm btn-primary" id="add-wh">+ Add Warehouse</button></div>
      ${warehouses.length === 0 ? `<p class="text-muted text-sm">No warehouses configured yet.</p>` : warehouses.map(w => `
        <div class="flex-between" style="padding:10px 0; border-bottom:1px solid var(--border);">
          <div><div style="font-weight:700;font-size:13.5px;">${w.warehouse_name}</div><div class="text-muted text-sm">${w.province} · ${formatComma(w.capacity_bags)} bag capacity</div></div>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-sm btn-outline" data-edit="${w.warehouse_id}">Edit</button>
            <button class="btn btn-sm btn-danger" data-del="${w.warehouse_id}">Remove</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  document.getElementById('add-wh').onclick = () => openWarehouseEditor(null, () => navigate('settings', { tab: 'warehouses' }));
  host.querySelectorAll('[data-edit]').forEach(btn => btn.onclick = async () => {
    const wh = await db.warehouses.get(btn.dataset.edit);
    openWarehouseEditor(wh, () => navigate('settings', { tab: 'warehouses' }));
  });
  host.querySelectorAll('[data-del]').forEach(btn => btn.onclick = async () => {
    const ok = await confirmDialog('Remove this warehouse from the active list? Historical delivery records referencing it are kept.', 'Remove Warehouse');
    if (!ok) return;
    const wh = await db.warehouses.get(btn.dataset.del);
    wh.is_deleted = true;
    wh.last_updated = new Date().toISOString();
    await db.warehouses.put(wh);
    await queueSync('warehouses', 'upsert', wh);
    showToast('Warehouse removed.', 'success');
    navigate('settings', { tab: 'warehouses' });
  });
}

function openWarehouseEditor(existing, onDone) {
  const settingsPromise = getAllSettings();
  settingsPromise.then(s => {
    const provinces = getProvinces(s.REGION_CODE || 'V');
    const backdrop = openModal(`
      <div class="modal-header"><h3>${existing ? 'Edit' : 'Add'} Warehouse</h3><button class="modal-close" id="wh-close">✕</button></div>
      <div class="field"><label>Warehouse Name <span class="req">*</span></label><input type="text" id="wh-name" value="${existing ? existing.warehouse_name : ''}"></div>
      <div class="field"><label>Province <span class="req">*</span></label>
        <select id="wh-province">${provinces.map(p => `<option value="${p}" ${existing && existing.province === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Bag Capacity</label><input type="text" inputmode="numeric" id="wh-capacity" value="${existing ? formatComma(existing.capacity_bags) : ''}"></div>
      <div class="field"><label>Status</label>
        <select id="wh-status">
          <option value="Active" ${!existing || existing.status === 'Active' ? 'selected' : ''}>Active</option>
          <option value="Inactive" ${existing && existing.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </div>
      <button class="btn btn-primary btn-block" id="wh-save">Save Warehouse</button>
    `, { center: true });
    document.getElementById('wh-close').onclick = () => closeModal(backdrop);
    attachLiveCommaFormatter(document.getElementById('wh-capacity'));
    document.getElementById('wh-save').onclick = async () => {
      const name = document.getElementById('wh-name').value.trim();
      if (!name) { showToast('Warehouse name is required.', 'error'); return; }
      const record = {
        warehouse_id: existing ? existing.warehouse_id : 'WH-' + Date.now().toString(36).toUpperCase(),
        warehouse_name: name,
        province: document.getElementById('wh-province').value,
        capacity_bags: unformatNumber(document.getElementById('wh-capacity').value),
        status: document.getElementById('wh-status').value,
        last_updated: new Date().toISOString(),
        is_deleted: false
      };
      await db.warehouses.put(record);
      await queueSync('warehouses', 'upsert', record);
      showToast('Warehouse saved.', 'success');
      closeModal(backdrop);
      onDone();
    };
  });
}

/* ---------------- USERS ---------------- */
async function renderUserSettings(host) {
  const users = (await db.users.filter(u => !u.is_deleted).toArray()).sort((a, b) => a.full_name.localeCompare(b.full_name));
  host.innerHTML = `
    <div class="card">
      <div class="flex-between mb-14"><div class="card-title" style="margin:0;">User Accounts</div><button class="btn btn-sm btn-primary" id="add-user">+ Add User</button></div>
      ${users.map(u => `
        <div class="flex-between" style="padding:10px 0; border-bottom:1px solid var(--border);">
          <div><div style="font-weight:700;font-size:13.5px;">${u.full_name}</div><div class="text-muted text-sm">${u.role} · ${u.status}</div></div>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-sm btn-outline" data-edit="${u.user_id}">Edit</button>
            ${u.user_id !== AppState.currentUser.user_id ? `<button class="btn btn-sm btn-danger" data-del="${u.user_id}">Deactivate</button>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;

  document.getElementById('add-user').onclick = () => openUserEditor(null, () => navigate('settings', { tab: 'users' }));
  host.querySelectorAll('[data-edit]').forEach(btn => btn.onclick = async () => {
    const u = await db.users.get(btn.dataset.edit);
    openUserEditor(u, () => navigate('settings', { tab: 'users' }));
  });
  host.querySelectorAll('[data-del]').forEach(btn => btn.onclick = async () => {
    const ok = await confirmDialog('Deactivate this user account? They will no longer be able to log in.', 'Deactivate User');
    if (!ok) return;
    const u = await db.users.get(btn.dataset.del);
    u.status = 'Inactive';
    u.last_updated = new Date().toISOString();
    await db.users.put(u);
    await queueSync('users', 'upsert', u);
    showToast('User deactivated.', 'success');
    navigate('settings', { tab: 'users' });
  });
}

function openUserEditor(existing, onDone) {
  const backdrop = openModal(`
    <div class="modal-header"><h3>${existing ? 'Edit' : 'Add'} User</h3><button class="modal-close" id="us-close">✕</button></div>
    <div class="field"><label>Full Name <span class="req">*</span></label><input type="text" id="us-name" value="${existing ? existing.full_name : ''}"></div>
    <div class="field"><label>Role <span class="req">*</span></label>
      <select id="us-role">
        <option value="Warehouse Staff" ${existing && existing.role === 'Warehouse Staff' ? 'selected' : ''}>Warehouse Staff</option>
        <option value="Admin" ${existing && existing.role === 'Admin' ? 'selected' : ''}>Administrator</option>
      </select>
    </div>
    <div class="field"><label>Status</label>
      <select id="us-status">
        <option value="Active" ${!existing || existing.status === 'Active' ? 'selected' : ''}>Active</option>
        <option value="Inactive" ${existing && existing.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
      </select>
    </div>
    <div class="field"><label>${existing ? 'Reset PIN (leave blank to keep current)' : 'Set 6-digit PIN'} ${existing ? '' : '<span class="req">*</span>'}</label>
      <input type="text" inputmode="numeric" maxlength="6" id="us-pin" placeholder="6-digit PIN">
    </div>
    <button class="btn btn-primary btn-block" id="us-save">Save User</button>
  `, { center: true });
  document.getElementById('us-close').onclick = () => closeModal(backdrop);
  document.getElementById('us-save').onclick = async () => {
    const name = document.getElementById('us-name').value.trim();
    const pin = document.getElementById('us-pin').value.trim();
    if (!name) { showToast('Full name is required.', 'error'); return; }
    if (!existing && (!pin || pin.length !== 6 || isNaN(pin))) { showToast('Please set a valid 6-digit PIN.', 'error'); return; }
    if (pin && (pin.length !== 6 || isNaN(pin))) { showToast('PIN must be exactly 6 digits.', 'error'); return; }

    const record = {
      user_id: existing ? existing.user_id : 'USR-' + Date.now().toString(36).toUpperCase(),
      pin_hash: pin ? await sha256(pin) : existing.pin_hash,
      full_name: name,
      role: document.getElementById('us-role').value,
      status: document.getElementById('us-status').value,
      last_updated: new Date().toISOString(),
      is_deleted: false
    };
    await db.users.put(record);
    await queueSync('users', 'upsert', record);
    showToast('User saved.', 'success');
    closeModal(backdrop);
    onDone();
  };
}

/* ---------------- SYNC ---------------- */
async function renderSyncSettings(host, isAdmin) {
  const s = await getAllSettings();
  const queueCount = await db.syncQueue.count();
  const configured = !!(s.GAS_WEBAPP_URL || '').trim();
  host.innerHTML = `
    <div class="card">
      <div class="card-title">Cloud Backend Sync</div>
      <p class="text-sm text-muted mb-14">The app works fully offline. Once a backend URL is configured below, syncing happens <b>automatically in the background</b> — on every data change, every ${Math.round(BACKGROUND_SYNC_INTERVAL_MS / 1000)} seconds, and whenever the device reconnects. No manual action is needed. Branch settings (region, target, season override, etc.) configured here are pushed to Google Sheets and pulled by every Warehouse Staff device automatically. See the included <code>gas/Code.gs</code> file for backend deployment instructions.</p>
      <div class="field"><label>Google Apps Script Web App URL</label>
        <input type="text" id="s-gas-url" value="${s.GAS_WEBAPP_URL || ''}" placeholder="https://script.google.com/macros/s/XXXX/exec" ${isAdmin ? '' : 'disabled'}>
      </div>
      ${isAdmin ? `<button class="btn btn-primary btn-block" id="save-gas-url">Save Backend URL</button>` : ''}
      <div class="divider"></div>
      <div class="flex-between text-sm">
        <span class="text-muted">Background sync</span>
        <span class="badge ${configured ? 'badge-green' : 'badge-navy'}">${configured ? 'Active' : 'Not configured'}</span>
      </div>
      <div class="flex-between text-sm mt-8">
        <span class="text-muted">Pending local changes to sync</span>
        <span class="badge badge-navy">${queueCount}</span>
      </div>
      <div class="flex-between text-sm mt-8">
        <span class="text-muted">Last successful sync</span>
        <span>${s.LAST_SYNC_TIMESTAMP ? new Date(s.LAST_SYNC_TIMESTAMP).toLocaleString() : 'Never'}</span>
      </div>
      <div class="flex-between text-sm mt-8">
        <span class="text-muted">Connection status</span>
        <span class="badge ${navigator.onLine ? 'badge-green' : 'badge-danger'}">${navigator.onLine ? 'Online' : 'Offline'}</span>
      </div>
      ${s.LAST_SYNC_ERROR ? `
      <div class="card" style="background:rgba(198,40,40,0.08); box-shadow:none; border-color:var(--danger); margin-top:12px; margin-bottom:0;">
        <div class="text-sm" style="font-weight:700; color:var(--danger);">⚠ Last sync error${s.LAST_SYNC_ERROR_AT ? ' (' + new Date(s.LAST_SYNC_ERROR_AT).toLocaleString() + ')' : ''}</div>
        <div class="text-sm mt-8">${s.LAST_SYNC_ERROR}</div>
      </div>` : ''}
      <button class="btn btn-outline btn-block mt-14" id="run-sync-now">${icon('sync', 16)} Sync Now (force immediate sync)</button>
      <div id="sync-log" class="text-sm text-muted mt-8"></div>
    </div>
  `;

  if (isAdmin) {
    document.getElementById('save-gas-url').onclick = async () => {
      await setLocalSetting('GAS_WEBAPP_URL', document.getElementById('s-gas-url').value.trim());
      showToast('Backend URL saved. Syncing in the background now...', 'success');
      runSync().catch(() => {});
    };
  }

  document.getElementById('run-sync-now').onclick = async () => {
    const logHost = document.getElementById('sync-log');
    logHost.textContent = 'Starting sync...';
    const result = await runSync((msg) => { logHost.textContent = msg; });
    if (result.status === 'success') { showToast('Sync completed successfully.', 'success'); navigate('settings', { tab: 'sync' }); }
    else if (result.status === 'not_configured') showToast('No backend URL configured yet.', 'warn');
    else if (result.status === 'offline') showToast('Device is offline. Sync will resume automatically when reconnected.', 'warn');
    else showToast('Sync failed: ' + (result.message || 'unknown error'), 'error');
  };
}
