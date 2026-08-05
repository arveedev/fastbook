/**
 * NFA PASSBOOK — Passbook Search, List & Navigation
 */
SCREEN_RENDERERS.passbooks = async function (container, params) {
  const filterType = (params && params.filterType) || 'all';
  const searchQ = (params && params.q) || '';

  container.innerHTML = `
    <div class="content">
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
    <button class="fab" id="pb-fab" title="Register New Passbook">${icon('plus', 26)}</button>
  `;

  document.getElementById('pb-fab').onclick = () => navigate('passbookWizard', {});

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
        <div class="sub">${f.passbook_id} · RSBSA ${f.rsbsa_no || '—'}</div>
      </div>
      <span class="badge ${f.passbook_type === 'Master' ? 'badge-green' : 'badge-navy'}">${f.passbook_type === 'Master' ? 'MB' : 'FB'}</span>
      <span class="chev">${icon('chev', 18)}</span>
    </div>`;
  }).join('');

  host.querySelectorAll('.list-item').forEach(item => {
    item.onclick = () => navigate('passbookDetail', { id: item.dataset.id });
  });
}
