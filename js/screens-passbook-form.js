/**
 * NFA PASSBOOK — Create / Edit Passbook Form
 */
const CIVIL_STATUS_OPTIONS = ['Single', 'Married', 'Widowed', 'Separated', 'Divorced'];
const SECTOR_OPTIONS = ['Adult', 'Indigent', 'Muslim', 'Persons with Disability', 'Senior Citizen', 'Youth'].sort();
const LANDHOLDING_OPTIONS = ['CLT Holder/Recipient', 'Cornland', 'Landowner/Lessor', 'Owner-Tiller', 'Riceland'];

SCREEN_RENDERERS.passbookForm = async function (container, params) {
  const editingId = params && params.id;
  const isEdit = !!editingId;
  let record = {
    passbook_type: 'Individual', first_name: '', middle_name: '', last_name: '', farmer_org: '',
    home_province: '', home_municipality: '', home_barangay: '',
    farm_province: '', farm_municipality: '', farm_barangay: '',
    hectarage: '', birth_date: '', civil_status: '', spouse_name: '', contact_no: '',
    gender: '', sector: '', irrigated: 'No', landholding_data: [], rsbsa_no: '',
    custom_quota_bags: '', same_as_home: false
  };
  if (isEdit) {
    const existing = await db.farmers.get(editingId);
    if (existing) record = { ...record, ...existing, landholding_data: existing.landholding_data ? JSON.parse(existing.landholding_data) : [] };
  }

  const settings = await getAllSettings();
  const regionCode = settings.REGION_CODE || 'V';
  const provinces = getProvinces(regionCode);

  container.innerHTML = `
    <div class="content">
      <div class="flex-between mb-14">
        <button class="icon-btn" style="background:var(--surface-2);color:var(--text);" id="pf-back">${icon('back', 18)}</button>
        <h2 style="font-size:16px;font-weight:800;">${isEdit ? 'Edit Passbook' : 'Register New Passbook'}</h2>
        <span style="width:34px;"></span>
      </div>

      <form id="passbook-form">
        <div class="card">
          <div class="card-title">Passbook Type</div>
          <div class="segmented" id="pb-type-toggle" ${isEdit ? 'data-locked="true"' : ''}>
            <button type="button" data-v="Individual" class="${record.passbook_type === 'Individual' ? 'active' : ''}" ${isEdit ? 'disabled' : ''}>Individual Farmer</button>
            <button type="button" data-v="Master" class="${record.passbook_type === 'Master' ? 'active' : ''}" ${isEdit ? 'disabled' : ''}>Farmer Organization (Master)</button>
          </div>
          ${isEdit ? `<div class="hint mt-8">Passbook type cannot be changed after registration, since it is embedded in the serial control number.</div>` : ''}
        </div>

        <div class="card">
          <div class="card-title">Personal Information</div>
          <div class="field"><label>First Name <span class="req">*</span></label>
            <div class="autocomplete-wrap">
              <input type="text" id="f-first_name" required value="${record.first_name || ''}" autocomplete="off">
              <div class="autocomplete-list" id="ac-first_name"></div>
            </div>
          </div>
          <div class="field"><label>Middle Name</label><input type="text" id="f-middle_name" value="${record.middle_name || ''}"></div>
          <div class="field"><label>Last Name <span class="req">*</span></label>
            <div class="autocomplete-wrap">
              <input type="text" id="f-last_name" required value="${record.last_name || ''}" autocomplete="off">
              <div class="autocomplete-list" id="ac-last_name"></div>
            </div>
          </div>
          <div class="field" id="org-field-wrap">
            <label>Farmer Organization Name <span id="org-req" class="req" style="display:${record.passbook_type === 'Master' ? 'inline' : 'none'};">*</span></label>
            <input type="text" id="f-farmer_org" value="${record.farmer_org || ''}" placeholder="e.g., FFSPFA">
            <div class="hint">If populated, classifies this entry as linked to a Farmer Organization.</div>
          </div>
          <div class="two-col">
            <div class="field"><label>Birth Date <span class="req">*</span></label><input type="date" id="f-birth_date" required value="${toDateInputValue(record.birth_date)}"></div>
            <div class="field"><label>Gender <span class="req">*</span></label>
              <div class="segmented" id="gender-toggle">
                <button type="button" data-v="Male" class="${record.gender === 'Male' ? 'active' : ''}">Male</button>
                <button type="button" data-v="Female" class="${record.gender === 'Female' ? 'active' : ''}">Female</button>
              </div>
            </div>
          </div>
          <div class="field"><label>Civil Status <span class="req">*</span></label>
            <select id="f-civil_status" required>
              <option value="">Select...</option>
              ${CIVIL_STATUS_OPTIONS.map(o => `<option value="${o}" ${record.civil_status === o ? 'selected' : ''}>${o}</option>`).join('')}
            </select>
          </div>
          <div class="field" id="spouse-field-wrap" style="display:${record.civil_status === 'Married' ? 'block' : 'none'};">
            <label>Spouse Name</label><input type="text" id="f-spouse_name" value="${record.spouse_name || ''}" ${record.civil_status === 'Married' ? 'required' : ''}>
          </div>
          <div class="field"><label>Contact Number <span class="req">*</span></label>
            <input type="tel" id="f-contact_no" required placeholder="09XX-XXX-XXXX" maxlength="13" value="${record.contact_no || ''}">
          </div>
          <div class="field"><label>Sector <span class="req">*</span></label>
            <select id="f-sector" required>
              <option value="">Select...</option>
              ${SECTOR_OPTIONS.map(o => `<option value="${o}" ${record.sector === o ? 'selected' : ''}>${o}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Home Address</div>
          <div class="field"><label>Province <span class="req">*</span></label>
            <select id="f-home_province" required>
              <option value="">Select Province...</option>
              ${provinces.map(p => `<option value="${p}" ${record.home_province === p ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Municipality <span class="req">*</span></label>
            <select id="f-home_municipality" required><option value="">Select Province first...</option></select>
          </div>
          <div class="field"><label>Barangay / Street <span class="req">*</span></label>
            <div class="autocomplete-wrap">
              <input type="text" id="f-home_barangay" required value="${record.home_barangay || ''}" autocomplete="off">
              <div class="autocomplete-list" id="ac-home_barangay"></div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title flex-between">
            <span>Farm Address</span>
            <button type="button" class="btn btn-sm btn-outline" id="same-as-home-btn">${record.same_as_home ? '✓ Same as Home' : 'Same as Home Address'}</button>
          </div>
          <div id="farm-address-fields" style="display:${record.same_as_home ? 'none' : 'block'};">
            <div class="field"><label>Province <span class="req">*</span></label>
              <select id="f-farm_province">
                <option value="">Select Province...</option>
                ${provinces.map(p => `<option value="${p}" ${record.farm_province === p ? 'selected' : ''}>${p}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>Municipality <span class="req">*</span></label>
              <select id="f-farm_municipality"><option value="">Select Province first...</option></select>
            </div>
            <div class="field"><label>Barangay / Sitio <span class="req">*</span></label>
              <div class="autocomplete-wrap">
                <input type="text" id="f-farm_barangay" value="${record.farm_barangay || ''}" autocomplete="off">
                <div class="autocomplete-list" id="ac-farm_barangay"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Land & Delivery Data</div>
          <div class="field"><label>Hectarage (Land Area, Ha) <span class="req">*</span></label>
            <input type="text" inputmode="decimal" id="f-hectarage" required value="${record.hectarage ? formatComma(record.hectarage) : ''}">
            <div class="hint" id="quota-preview">Per-season quota auto-calculates as Hectarage × 100 Net Bags.</div>
          </div>
          <div class="field"><label>Irrigated <span class="req">*</span></label>
            <div class="segmented" id="irrigated-toggle">
              <button type="button" data-v="Yes" class="${record.irrigated === 'Yes' ? 'active' : ''}">Yes</button>
              <button type="button" data-v="No" class="${record.irrigated !== 'Yes' ? 'active' : ''}">No</button>
            </div>
          </div>
          <div class="field"><label>Landholding Data <span class="req">*</span></label>
            <div class="checkbox-list" id="landholding-list">
              ${LANDHOLDING_OPTIONS.map(o => `
                <label><input type="checkbox" value="${o}" ${record.landholding_data.includes(o) ? 'checked' : ''}> ${o}</label>
              `).join('')}
            </div>
          </div>
          <div class="field"><label>RSBSA Number <span class="req">*</span></label>
            <input type="text" id="f-rsbsa_no" required placeholder="00-00-00-000000" value="${record.rsbsa_no || ''}">
          </div>
          ${AppState.currentUser.role === 'Admin' ? `
          <div class="field"><label>Per Season Delivery Custom Quota (Admin Override)</label>
            <input type="text" inputmode="decimal" id="f-custom_quota_bags" value="${record.custom_quota_bags ? formatComma(record.custom_quota_bags) : ''}" placeholder="Leave blank to use hectarage formula">
          </div>` : ''}
        </div>

        <button type="submit" class="btn btn-primary btn-block" style="margin-bottom:30px;">${isEdit ? 'Save Changes' : 'Register Passbook'}</button>
      </form>
    </div>
  `;

  document.getElementById('pf-back').onclick = () => navigate(isEdit ? 'passbookDetail' : 'passbooks', isEdit ? { id: editingId } : {});

  // Passbook type toggle
  bindSegmented('pb-type-toggle', (val) => {
    record.passbook_type = val;
    document.getElementById('org-req').style.display = val === 'Master' ? 'inline' : 'none';
  });
  bindSegmented('gender-toggle', () => {});
  bindSegmented('irrigated-toggle', () => {});

  // Civil status -> spouse field
  document.getElementById('f-civil_status').addEventListener('change', (e) => {
    const isMarried = e.target.value === 'Married';
    document.getElementById('spouse-field-wrap').style.display = isMarried ? 'block' : 'none';
    const spouseInput = document.getElementById('f-spouse_name');
    if (spouseInput) spouseInput.required = isMarried;
  });

  // Contact number mask 09XX-XXX-XXXX
  const contactInput = document.getElementById('f-contact_no');
  contactInput.addEventListener('input', (e) => {
    let digits = e.target.value.replace(/\D/g, '').slice(0, 11);
    let formatted = digits;
    if (digits.length > 4) formatted = digits.slice(0, 4) + '-' + digits.slice(4);
    if (digits.length > 7) formatted = digits.slice(0, 4) + '-' + digits.slice(4, 7) + '-' + digits.slice(7);
    e.target.value = formatted;
  });

  // Live comma formatting
  attachLiveCommaFormatter(document.getElementById('f-hectarage'));
  const customQuotaEl = document.getElementById('f-custom_quota_bags');
  if (customQuotaEl) attachLiveCommaFormatter(customQuotaEl);

  // Home province -> municipality cascade
  const homeProvinceSel = document.getElementById('f-home_province');
  const homeMuniSel = document.getElementById('f-home_municipality');
  function refreshHomeMuni(selectedMuni) {
    const muniList = getMunicipalities(regionCode, homeProvinceSel.value);
    homeMuniSel.innerHTML = `<option value="">Select Municipality...</option>` +
      muniList.map(m => `<option value="${m}" ${m === selectedMuni ? 'selected' : ''}>${m}</option>`).join('');
  }
  homeProvinceSel.addEventListener('change', () => refreshHomeMuni());
  if (record.home_province) refreshHomeMuni(record.home_municipality);

  // Farm province -> municipality cascade
  const farmProvinceSel = document.getElementById('f-farm_province');
  const farmMuniSel = document.getElementById('f-farm_municipality');
  function refreshFarmMuni(selectedMuni) {
    const muniList = getMunicipalities(regionCode, farmProvinceSel.value);
    farmMuniSel.innerHTML = `<option value="">Select Municipality...</option>` +
      muniList.map(m => `<option value="${m}" ${m === selectedMuni ? 'selected' : ''}>${m}</option>`).join('');
  }
  farmProvinceSel.addEventListener('change', () => refreshFarmMuni());
  if (record.farm_province) refreshFarmMuni(record.farm_municipality);

  // Same as home toggle
  const sameBtn = document.getElementById('same-as-home-btn');
  let sameAsHome = record.same_as_home;
  sameBtn.onclick = () => {
    sameAsHome = !sameAsHome;
    sameBtn.textContent = sameAsHome ? '✓ Same as Home' : 'Same as Home Address';
    document.getElementById('farm-address-fields').style.display = sameAsHome ? 'none' : 'block';
  };

  // Auto-complete bindings
  bindAutoComplete('f-first_name', 'ac-first_name', 'first_name');
  bindAutoComplete('f-last_name', 'ac-last_name', 'last_name');
  bindAutoComplete('f-home_barangay', 'ac-home_barangay', 'barangay');
  bindAutoComplete('f-farm_barangay', 'ac-farm_barangay', 'barangay');

  // Submit
  document.getElementById('passbook-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitPassbookForm(record, editingId, sameAsHome);
  });
};

function bindSegmented(id, onChange) {
  const wrap = document.getElementById(id);
  if (!wrap) return;
  wrap.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => {
      wrap.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(btn.dataset.v);
    };
  });
}

function getSegmentedValue(id) {
  const active = document.querySelector(`#${id} button.active`);
  return active ? active.dataset.v : null;
}

function bindAutoComplete(inputId, listId, fieldKey) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  if (!input || !list) return;
  input.addEventListener('input', async () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 1) { list.classList.remove('show'); return; }
    const suggestions = await getAutoCompleteSuggestions(fieldKey);
    const filtered = suggestions.filter(s => s.toLowerCase().includes(q)).slice(0, 6);
    if (filtered.length === 0) { list.classList.remove('show'); return; }
    list.innerHTML = filtered.map(s => `<div>${s}</div>`).join('');
    list.classList.add('show');
    list.querySelectorAll('div').forEach((el, i) => {
      el.onclick = () => { input.value = filtered[i]; list.classList.remove('show'); };
    });
  });
  input.addEventListener('blur', () => setTimeout(() => list.classList.remove('show'), 180));
}

async function submitPassbookForm(record, editingId, sameAsHome) {
  const passbookType = getSegmentedValue('pb-type-toggle') || record.passbook_type;
  const gender = getSegmentedValue('gender-toggle');
  const irrigated = getSegmentedValue('irrigated-toggle') || 'No';
  const farmerOrg = document.getElementById('f-farmer_org').value.trim();

  if (passbookType === 'Master' && !farmerOrg) {
    showToast('Master Passbooks require a Farmer Organization Name.', 'error');
    return;
  }
  if (!gender) { showToast('Please select a Gender.', 'error'); return; }

  const landholding = Array.from(document.querySelectorAll('#landholding-list input:checked')).map(c => c.value);
  if (landholding.length === 0) { showToast('Please select at least one Landholding Data option.', 'error'); return; }

  const homeProvince = document.getElementById('f-home_province').value;
  const homeMunicipality = document.getElementById('f-home_municipality').value;
  const homeBarangay = document.getElementById('f-home_barangay').value.trim();

  let farmProvince = homeProvince, farmMunicipality = homeMunicipality, farmBarangay = homeBarangay;
  if (!sameAsHome) {
    farmProvince = document.getElementById('f-farm_province').value;
    farmMunicipality = document.getElementById('f-farm_municipality').value;
    farmBarangay = document.getElementById('f-farm_barangay').value.trim();
    if (!farmProvince || !farmMunicipality || !farmBarangay) {
      showToast('Please complete the Farm Address fields.', 'error');
      return;
    }
  }

  const nowIso = new Date().toISOString();
  const passbookId = editingId || await generateSerialNumber(passbookType);

  const customQuotaEl = document.getElementById('f-custom_quota_bags');

  const record_out = {
    passbook_id: passbookId,
    passbook_type: passbookType,
    first_name: document.getElementById('f-first_name').value.trim(),
    middle_name: document.getElementById('f-middle_name').value.trim(),
    last_name: document.getElementById('f-last_name').value.trim(),
    farmer_org: farmerOrg,
    home_province: homeProvince,
    home_municipality: homeMunicipality,
    home_barangay: homeBarangay,
    farm_province: farmProvince,
    farm_municipality: farmMunicipality,
    farm_barangay: farmBarangay,
    hectarage: unformatNumber(document.getElementById('f-hectarage').value),
    birth_date: document.getElementById('f-birth_date').value,
    civil_status: document.getElementById('f-civil_status').value,
    spouse_name: document.getElementById('f-spouse_name') ? document.getElementById('f-spouse_name').value.trim() : '',
    contact_no: document.getElementById('f-contact_no').value,
    gender,
    sector: document.getElementById('f-sector').value,
    irrigated,
    landholding_data: JSON.stringify(landholding),
    rsbsa_no: document.getElementById('f-rsbsa_no').value.trim(),
    custom_quota_bags: customQuotaEl ? unformatNumber(customQuotaEl.value) : (record.custom_quota_bags || 0),
    created_at: editingId ? record.created_at || nowIso : nowIso,
    last_updated: nowIso,
    is_deleted: false
  };

  await db.farmers.put(record_out);
  await queueSync('farmers', 'upsert', record_out);

  await rememberAutoComplete('first_name', record_out.first_name);
  await rememberAutoComplete('last_name', record_out.last_name);
  await rememberAutoComplete('barangay', record_out.home_barangay);
  await rememberAutoComplete('barangay', record_out.farm_barangay);

  showToast(editingId ? 'Passbook updated successfully.' : `Passbook registered: ${passbookId}`, 'success');
  navigate('passbookDetail', { id: passbookId });
}
