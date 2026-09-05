/**
 * NFA PASSBOOK — Passbook Search, List & Navigation
 */
SCREEN_RENDERERS.passbooks = async function (container, params) {
  const filterType = (params && params.filterType) || 'all';
  const searchQ = (params && params.q) || '';

  container.innerHTML = `
    <div class="content">
      <button class="btn btn-primary btn-block mb-14" id="pb-register-btn">${icon('plus', 18)} Register New Passbook</button>
      <div class="search-bar">
        ${icon('search', 18)}
        <input type="text" id="pb-search" placeholder="Search name, RSBSA no., or serial..." value="${searchQ}">
      </div>
      <div class="subtabs" id="pb-subtabs">
        <button data-t="all" class="${filterType === 'all' ? 'active' : ''}">All Passbooks</button>
        <button data-t="Individual" class="${filterType === 'Individual' ? 'active' : ''}">Individual Farmer</button>
        <button data-t="Master" class="${filterType === 'Master' ? 'active' : ''}">Master / FO</button>
      </div>
      <div id="pb-list-host"></div>
    </div>
  `;

  document.getElementById('pb-register-btn').onclick = () => navigate('passbookWizard', {});

  document.getElementById('pb-subtabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    navigate('passbooks', { filterType: btn.dataset.t, q: document.getElementById('pb-search').value });
  });

  const searchInput = document.getElementById('pb-search');
  let debounceTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => renderPassbookList(filterType, searchInput.value), 220);
  });
  searchInput.focus();
  searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);

  await renderPassbookList(filterType, searchQ);
};

async function renderPassbookList(filterType, query) {
  const host = document.getElementById('pb-list-host');
  if (!host) return;
  let farmers = await db.farmers.filter(f => !f.is_deleted).toArray();

  if (filterType !== 'all') {
    farmers = farmers.filter(f => f.passbook_type === filterType);
  }
  if (query && query.trim() !== '') {
    const q = query.trim().toLowerCase();
    farmers = farmers.filter(f =>
      buildDisplayName(f).toLowerCase().includes(q) ||
      (f.rsbsa_no || '').toLowerCase().includes(q) ||
      (f.passbook_id || '').toLowerCase().includes(q)
    );
  }
  farmers.sort((a, b) => buildDisplayName(a).localeCompare(buildDisplayName(b)));

  if (farmers.length === 0) {
    host.innerHTML = `<div class="empty-state">${icon('empty', 48)}<p>No passbooks found. Tap the + button to register a new farmer or organization.</p></div>`;
    return;
  }

  host.innerHTML = farmers.map(f => {
    const name = buildDisplayName(f);
    const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    return `
    <div class="list-item" data-id="${f.passbook_id}">
      <div class="avatar ${f.passbook_type === 'Master' ? 'mb' : ''}">${initials}</div>
      <div class="meta">
        <div class="name">${name}</div>
        <div class="sub">${f.passbook_id} · RSBSA ${escapeHtml(f.rsbsa_no) || '—'}</div>
      </div>
      <span class="badge ${f.passbook_type === 'Master' ? 'badge-green' : 'badge-navy'}">${f.passbook_type === 'Master' ? 'MB' : 'FB'}</span>
      <button class="icon-btn list-delete-btn" data-id="${f.passbook_id}" data-name="${name.replace(/"/g, '&quot;')}" style="background:rgba(198,40,40,0.1); color:var(--danger); width:34px; height:34px; flex-shrink:0;" title="Delete passbook">✕</button>
      <span class="chev">${icon('chev', 18)}</span>
    </div>`;
  }).join('');

  host.querySelectorAll('.list-item').forEach(item => {
    item.onclick = (e) => {
      if (e.target.closest('.list-delete-btn')) return;
      navigate('passbookDetail', { id: item.dataset.id });
    };
  });

  host.querySelectorAll('.list-delete-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      // btn.dataset.name comes back through the browser's attribute decoder,
      // which un-escapes the HTML entities buildDisplayName() put there —
      // re-escape before interpolating into confirmDialog's own innerHTML,
      // or a malicious name round-trips back into executable markup here.
      const ok = await confirmDialog(
        `Delete the passbook for <b>${escapeHtml(name)}</b> (${id})? Their delivery history will be kept for records, but they will no longer appear in Passbooks, Reports, or search. This cannot be undone from this device.`,
        'Delete Passbook'
      );
      if (!ok) return;
      const record = await db.farmers.get(id);
      if (!record) return;
      record.is_deleted = true;
      record.last_updated = new Date().toISOString();
      await db.farmers.put(record);
      await queueSync('farmers', 'upsert', record);
      showToast('Passbook deleted.', 'success');
      renderPassbookList(filterType, query);
    };
  });
}
