/**
 * NFA PASSBOOK — Multi-Step Passbook Registration Wizard
 * New registrations use this step-by-step flow instead of one long form.
 * Editing an existing passbook still uses the classic single-page form
 * (screens-passbook-form.js) since jumping straight to one field is faster
 * than clicking through steps when most fields are already filled in.
 */
const WIZARD_STEP_LABELS = ['Personal Info', 'Address', 'Land & Delivery', 'Review'];

SCREEN_RENDERERS.passbookWizard = async function (container) {
  const state = {
    step: 0,
    sameAsHome: false,
    data: {
      passbook_type: 'Individual', first_name: '', middle_name: '', last_name: '', farmer_org: '',
      home_province: '', home_municipality: '', home_barangay: '',
      farm_province: '', farm_municipality: '', farm_barangay: '',
      hectarage: '', birth_date: '', civil_status: '', spouse_name: '', contact_no: '',
      gender: '', sector: '', irrigated: 'No', landholding_data: [], rsbsa_no: '',
      custom_quota_bags: ''
    }
  };
  await renderWizardStep(container, state);
};

function wizardProgressHtml(step) {
  const pct = ((step + 1) / WIZARD_STEP_LABELS.length) * 100;
  return `
    <div class="wizard-progress">
      <div class="wizard-progress-track"><div class="wizard-progress-fill" style="width:${pct}%"></div></div>
      <div class="wizard-progress-label">Step ${step + 1} of ${WIZARD_STEP_LABELS.length} — ${WIZARD_STEP_LABELS[step]}</div>
    </div>`;
}

async function renderWizardStep(container, state) {
  const { step, data } = state;

  if (step === 0) return renderWizardStepPersonal(container, state);
  if (step === 1) return renderWizardStepAddress(container, state);
  if (step === 2) return renderWizardStepLandDelivery(container, state);
  if (step === 3) return renderWizardStepReview(container, state);
}

/* ---------------- STEP 1: PERSONAL INFO ---------------- */
function renderWizardStepPersonal(container, state) {
  const d = state.data;
  container.innerHTML = `
    <div class="content wizard-step-slide">
      ${wizardProgressHtml(0)}
      <div class="card">
        <div class="card-title">Passbook Type</div>
        <div class="segmented" id="pb-type-toggle">
          <button type="button" data-v="Individual" class="${d.passbook_type === 'Individual' ? 'active' : ''}">Individual Farmer</button>
          <button type="button" data-v="Master" class="${d.passbook_type === 'Master' ? 'active' : ''}">Farmer Organization (Master)</button>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Personal Information</div>
        <div class="field"><label>First Name <span class="req">*</span></label>
          <div class="autocomplete-wrap">
            <input type="text" id="f-first_name" required value="${d.first_name}" autocomplete="off">
            <div class="autocomplete-list" id="ac-first_name"></div>
          </div>
        </div>
        <div class="field"><label>Middle Name</label><input type="text" id="f-middle_name" value="${d.middle_name}"></div>
        <div class="field"><label>Last Name <span class="req">*</span></label>
          <div class="autocomplete-wrap">
            <input type="text" id="f-last_name" required value="${d.last_name}" autocomplete="off">
            <div class="autocomplete-list" id="ac-last_name"></div>
          </div>
        </div>
        <div class="field" id="org-field-wrap">
          <label>Farmer Organization Name <span id="org-req" class="req" style="display:${d.passbook_type === 'Master' ? 'inline' : 'none'};">*</span></label>
          <input type="text" id="f-farmer_org" value="${d.farmer_org}" placeholder="e.g., FFSPFA">
        </div>
        <div class="two-col">
          <div class="field"><label>Birth Date <span class="req">*</span></label><input type="date" id="f-birth_date" required value="${d.birth_date}"></div>
          <div class="field"><label>Gender <span class="req">*</span></label>
            <div class="segmented" id="gender-toggle">
              <button type="button" data-v="Male" class="${d.gender === 'Male' ? 'active' : ''}">Male</button>
              <button type="button" data-v="Female" class="${d.gender === 'Female' ? 'active' : ''}">Female</button>
            </div>
          </div>
        </div>
        <div class="field"><label>Civil Status <span class="req">*</span></label>
          <select id="f-civil_status" required>
            <option value="">Select...</option>
            ${CIVIL_STATUS_OPTIONS.map(o => `<option value="${o}" ${d.civil_status === o ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </div>
        <div class="field" id="spouse-field-wrap" style="display:${d.civil_status === 'Married' ? 'block' : 'none'};">
          <label>Spouse Name</label><input type="text" id="f-spouse_name" value="${d.spouse_name}" ${d.civil_status === 'Married' ? 'required' : ''}>
        </div>
        <div class="field"><label>Contact Number <span class="req">*</span></label>
          <input type="tel" id="f-contact_no" required placeholder="09XX-XXX-XXXX" maxlength="13" value="${d.contact_no}">
        </div>
        <div class="field"><label>Sector <span class="req">*</span></label>
          <select id="f-sector" required>
            <option value="">Select...</option>
            ${SECTOR_OPTIONS.map(o => `<option value="${o}" ${d.sector === o ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </div>
      </div>
      <button class="btn btn-primary btn-block mb-14" id="wiz-next">Next</button>
      <button class="btn btn-outline btn-block mb-14" id="wiz-cancel">Cancel</button>
    </div>
  `;

  bindSegmented('pb-type-toggle', (val) => {
    document.getElementById('org-req').style.display = val === 'Master' ? 'inline' : 'none';
  });
  bindSegmented('gender-toggle', () => {});
  document.getElementById('f-civil_status').addEventListener('change', (e) => {
    const isMarried = e.target.value === 'Married';
    document.getElementById('spouse-field-wrap').style.display = isMarried ? 'block' : 'none';
    const spouseInput = document.getElementById('f-spouse_name');
    if (spouseInput) spouseInput.required = isMarried;
  });
  const contactInput = document.getElementById('f-contact_no');
  contactInput.addEventListener('input', (e) => {
    let digits = e.target.value.replace(/\D/g, '').slice(0, 11);
    let formatted = digits;
    if (digits.length > 4) formatted = digits.slice(0, 4) + '-' + digits.slice(4);
    if (digits.length > 7) formatted = digits.slice(0, 4) + '-' + digits.slice(4, 7) + '-' + digits.slice(7);
    e.target.value = formatted;
  });
  bindAutoComplete('f-first_name', 'ac-first_name', 'first_name');
  bindAutoComplete('f-last_name', 'ac-last_name', 'last_name');

  document.getElementById('wiz-cancel').onclick = async () => {
    const ok = await confirmDialog('Discard this new passbook registration?', 'Cancel Registration');
    if (ok) navigate('passbooks');
  };

  document.getElementById('wiz-next').onclick = () => {
    const passbookType = getSegmentedValue('pb-type-toggle');
    const gender = getSegmentedValue('gender-toggle');
    const farmerOrg = document.getElementById('f-farmer_org').value.trim();
    const firstName = document.getElementById('f-first_name').value.trim();
    const lastName = document.getElementById('f-last_name').value.trim();
    const birthDate = document.getElementById('f-birth_date').value;
    const civilStatus = document.getElementById('f-civil_status').value;
    const spouseName = document.getElementById('f-spouse_name') ? document.getElementById('f-spouse_name').value.trim() : '';
    const contactNo = document.getElementById('f-contact_no').value;
    const sector = document.getElementById('f-sector').value;

    if (!firstName || !lastName) { showToast('First and last name are required.', 'error'); return; }
    if (passbookType === 'Master' && !farmerOrg) { showToast('Master Passbooks require a Farmer Organization Name.', 'error'); return; }
    if (!birthDate) { showToast('Birth date is required.', 'error'); return; }
    if (!gender) { showToast('Please select a Gender.', 'error'); return; }
    if (!civilStatus) { showToast('Please select a Civil Status.', 'error'); return; }
    if (civilStatus === 'Married' && !spouseName) { showToast('Spouse name is required when Civil Status is Married.', 'error'); return; }
    if (!contactNo) { showToast('Contact number is required.', 'error'); return; }
    if (!sector) { showToast('Please select a Sector.', 'error'); return; }

    Object.assign(state.data, {
      passbook_type: passbookType, gender, farmer_org: farmerOrg,
      first_name: firstName, middle_name: document.getElementById('f-middle_name').value.trim(), last_name: lastName,
      birth_date: birthDate, civil_status: civilStatus, spouse_name: spouseName, contact_no: contactNo, sector
    });
    rememberAutoComplete('first_name', firstName);
    rememberAutoComplete('last_name', lastName);

    state.step = 1;
    renderWizardStep(container, state);
  };
}

/* ---------------- STEP 2: ADDRESS ---------------- */
async function renderWizardStepAddress(container, state) {
  const d = state.data;
  const settings = await getAllSettings();
  const regionCode = settings.REGION_CODE || 'V';
  const provinces = getProvinces(regionCode);

  container.innerHTML = `
    <div class="content wizard-step-slide">
      ${wizardProgressHtml(1)}
      <div class="card">
        <div class="card-title">Home Address</div>
        <div class="field"><label>Province <span class="req">*</span></label>
          <select id="f-home_province" required>
            <option value="">Select Province...</option>
            ${provinces.map(p => `<option value="${p}" ${d.home_province === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Municipality <span class="req">*</span></label>
          <select id="f-home_municipality" required><option value="">Select Province first...</option></select>
        </div>
        <div class="field"><label>Barangay / Street <span class="req">*</span></label>
          <div class="autocomplete-wrap">
            <input type="text" id="f-home_barangay" required value="${d.home_barangay}" autocomplete="off">
            <div class="autocomplete-list" id="ac-home_barangay"></div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-title flex-between">
          <span>Farm Address</span>
          <button type="button" class="btn btn-sm btn-outline" id="same-as-home-btn">${state.sameAsHome ? '✓ Same as Home' : 'Same as Home Address'}</button>
        </div>
        <div id="farm-address-fields" style="display:${state.sameAsHome ? 'none' : 'block'};">
          <div class="field"><label>Province <span class="req">*</span></label>
            <select id="f-farm_province">
              <option value="">Select Province...</option>
              ${provinces.map(p => `<option value="${p}" ${d.farm_province === p ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Municipality <span class="req">*</span></label>
            <select id="f-farm_municipality"><option value="">Select Province first...</option></select>
          </div>
          <div class="field"><label>Barangay / Sitio <span class="req">*</span></label>
            <div class="autocomplete-wrap">
              <input type="text" id="f-farm_barangay" value="${d.farm_barangay}" autocomplete="off">
              <div class="autocomplete-list" id="ac-farm_barangay"></div>
            </div>
          </div>
        </div>
      </div>
      <button class="btn btn-primary btn-block mb-14" id="wiz-next">Next</button>
      <button class="btn btn-outline btn-block mb-14" id="wiz-back">Back</button>
    </div>
  `;

  const homeProvinceSel = document.getElementById('f-home_province');
  const homeMuniSel = document.getElementById('f-home_municipality');
  function refreshHomeMuni(selectedMuni) {
    const muniList = getMunicipalities(regionCode, homeProvinceSel.value);
    homeMuniSel.innerHTML = `<option value="">Select Municipality...</option>` +
      muniList.map(m => `<option value="${m}" ${m === selectedMuni ? 'selected' : ''}>${m}</option>`).join('');
  }
  homeProvinceSel.addEventListener('change', () => refreshHomeMuni());
  if (d.home_province) refreshHomeMuni(d.home_municipality);

  const farmProvinceSel = document.getElementById('f-farm_province');
  const farmMuniSel = document.getElementById('f-farm_municipality');
  function refreshFarmMuni(selectedMuni) {
    const muniList = getMunicipalities(regionCode, farmProvinceSel.value);
    farmMuniSel.innerHTML = `<option value="">Select Municipality...</option>` +
      muniList.map(m => `<option value="${m}" ${m === selectedMuni ? 'selected' : ''}>${m}</option>`).join('');
  }
  farmProvinceSel.addEventListener('change', () => refreshFarmMuni());
  if (d.farm_province) refreshFarmMuni(d.farm_municipality);

  const sameBtn = document.getElementById('same-as-home-btn');
  sameBtn.onclick = () => {
    state.sameAsHome = !state.sameAsHome;
    sameBtn.textContent = state.sameAsHome ? '✓ Same as Home' : 'Same as Home Address';
    document.getElementById('farm-address-fields').style.display = state.sameAsHome ? 'none' : 'block';
  };

  bindAutoComplete('f-home_barangay', 'ac-home_barangay', 'barangay');
  bindAutoComplete('f-farm_barangay', 'ac-farm_barangay', 'barangay');

  document.getElementById('wiz-back').onclick = () => { state.step = 0; renderWizardStep(container, state); };
  document.getElementById('wiz-next').onclick = () => {
    const homeProvince = homeProvinceSel.value;
    const homeMunicipality = homeMuniSel.value;
    const homeBarangay = document.getElementById('f-home_barangay').value.trim();
    if (!homeProvince || !homeMunicipality || !homeBarangay) {
      showToast('Please complete the Home Address fields.', 'error');
      return;
    }

    let farmProvince = homeProvince, farmMunicipality = homeMunicipality, farmBarangay = homeBarangay;
    if (!state.sameAsHome) {
      farmProvince = farmProvinceSel.value;
      farmMunicipality = farmMuniSel.value;
      farmBarangay = document.getElementById('f-farm_barangay').value.trim();
      if (!farmProvince || !farmMunicipality || !farmBarangay) {
        showToast('Please complete the Farm Address fields.', 'error');
        return;
      }
    }

    Object.assign(state.data, {
      home_province: homeProvince, home_municipality: homeMunicipality, home_barangay: homeBarangay,
      farm_province: farmProvince, farm_municipality: farmMunicipality, farm_barangay: farmBarangay
    });
    rememberAutoComplete('barangay', homeBarangay);
    rememberAutoComplete('barangay', farmBarangay);

    state.step = 2;
    renderWizardStep(container, state);
  };
}

/* ---------------- STEP 3: LAND & DELIVERY DATA ---------------- */
async function renderWizardStepLandDelivery(container, state) {
  const d = state.data;

  container.innerHTML = `
    <div class="content wizard-step-slide">
      ${wizardProgressHtml(2)}
      <div class="card">
        <div class="card-title">Land & Delivery Data</div>
        <div class="field"><label>Hectarage (Land Area, Ha) <span class="req">*</span></label>
          <input type="text" inputmode="decimal" id="f-hectarage" required value="${d.hectarage ? formatComma(d.hectarage) : ''}">
          <div class="hint">Per-season quota auto-calculates as Hectarage × 100 Net Bags.</div>
        </div>
        <div class="field"><label>Irrigated <span class="req">*</span></label>
          <div class="segmented" id="irrigated-toggle">
            <button type="button" data-v="Yes" class="${d.irrigated === 'Yes' ? 'active' : ''}">Yes</button>
            <button type="button" data-v="No" class="${d.irrigated !== 'Yes' ? 'active' : ''}">No</button>
          </div>
        </div>
        <div class="field"><label>Landholding Data <span class="req">*</span></label>
          <div class="checkbox-list" id="landholding-list">
            ${LANDHOLDING_OPTIONS.map(o => `
              <label><input type="checkbox" value="${o}" ${d.landholding_data.includes(o) ? 'checked' : ''}> ${o}</label>
            `).join('')}
          </div>
        </div>
        <div class="field"><label>RSBSA Number <span class="req">*</span></label>
          <input type="text" id="f-rsbsa_no" required placeholder="00-00-00-000000" value="${d.rsbsa_no}">
        </div>
        ${AppState.currentUser.role === 'Admin' ? `
        <div class="field"><label>Per Season Delivery Custom Quota (Admin Override)</label>
          <input type="text" inputmode="decimal" id="f-custom_quota_bags" value="${d.custom_quota_bags ? formatComma(d.custom_quota_bags) : ''}" placeholder="Leave blank to use hectarage formula">
        </div>` : ''}
      </div>
      <button class="btn btn-primary btn-block mb-14" id="wiz-next">Next</button>
      <button class="btn btn-outline btn-block mb-14" id="wiz-back">Back</button>
    </div>
  `;

  bindSegmented('irrigated-toggle', () => {});
  attachLiveCommaFormatter(document.getElementById('f-hectarage'));
  const customQuotaEl = document.getElementById('f-custom_quota_bags');
  if (customQuotaEl) attachLiveCommaFormatter(customQuotaEl);

  document.getElementById('wiz-back').onclick = () => { state.step = 1; renderWizardStep(container, state); };
  document.getElementById('wiz-next').onclick = () => {
    const hectarage = unformatNumber(document.getElementById('f-hectarage').value);
    const irrigated = getSegmentedValue('irrigated-toggle') || 'No';
    const landholding = Array.from(document.querySelectorAll('#landholding-list input:checked')).map(c => c.value);
    const rsbsaNo = document.getElementById('f-rsbsa_no').value.trim();
    const customQuota = customQuotaEl ? unformatNumber(customQuotaEl.value) : (d.custom_quota_bags || 0);

    if (!hectarage || hectarage <= 0) { showToast('Please enter a valid hectarage.', 'error'); return; }
    if (landholding.length === 0) { showToast('Please select at least one Landholding Data option.', 'error'); return; }
    if (!rsbsaNo) { showToast('RSBSA Number is required.', 'error'); return; }

    Object.assign(state.data, {
      hectarage, irrigated, landholding_data: landholding, rsbsa_no: rsbsaNo,
      custom_quota_bags: customQuota
    });

    state.step = 3;
    renderWizardStep(container, state);
  };
}

/* ---------------- STEP 4: REVIEW & FINISH ---------------- */
async function renderWizardStepReview(container, state) {
  const d = state.data;
  const name = [d.first_name, d.middle_name, d.last_name].filter(Boolean).join(' ');
  const displayName = d.farmer_org ? `${d.farmer_org} c/o ${name}` : name;
  const estQuota = d.custom_quota_bags > 0 ? d.custom_quota_bags : Math.floor(Number(d.hectarage || 0) * 100);

  container.innerHTML = `
    <div class="content wizard-step-slide">
      ${wizardProgressHtml(3)}
      <div class="card">
        <div class="card-title">Review Your Entry</div>
        <div class="text-sm" style="line-height:2;">
          <div><b>${displayName}</b></div>
          <div class="text-muted">${d.passbook_type === 'Master' ? 'Master / Farmer Organization' : 'Individual Farmer'}</div>
          <div class="divider"></div>
          <div><b>Birth Date:</b> ${formatDateOnly(d.birth_date)}</div>
          <div><b>Gender:</b> ${d.gender} &nbsp; <b>Civil Status:</b> ${d.civil_status}</div>
          <div><b>Contact:</b> ${d.contact_no}</div>
          <div><b>Sector:</b> ${d.sector}</div>
          <div class="divider"></div>
          <div><b>Home:</b> ${d.home_barangay}, ${d.home_municipality}, ${d.home_province}</div>
          <div><b>Farm:</b> ${d.farm_barangay}, ${d.farm_municipality}, ${d.farm_province}</div>
          <div class="divider"></div>
          <div><b>Hectarage:</b> ${formatComma(d.hectarage)} Ha (${d.irrigated === 'Yes' ? 'Irrigated' : 'Rainfed'})</div>
          <div><b>Landholding:</b> ${d.landholding_data.join(', ')}</div>
          <div><b>RSBSA:</b> ${d.rsbsa_no}</div>
          <div><b>Estimated Per-Season Quota:</b> ${formatComma(estQuota)} Net Bags</div>
        </div>
      </div>
      <button class="btn btn-green btn-block mb-14" id="wiz-finish" style="font-size:16px; padding:16px;">Finish &amp; Register Passbook</button>
      <button class="btn btn-outline btn-block mb-14" id="wiz-back">Back</button>
    </div>
  `;

  document.getElementById('wiz-back').onclick = () => { state.step = 2; renderWizardStep(container, state); };
  document.getElementById('wiz-finish').onclick = async () => {
    const finishBtn = document.getElementById('wiz-finish');
    finishBtn.disabled = true;
    finishBtn.innerHTML = `<div class="loader" style="width:18px;height:18px;border-color:rgba(255,255,255,0.4);border-top-color:#fff;"></div> Saving...`;

    const nowIso = new Date().toISOString();
    const passbookId = await generateSerialNumber(d.passbook_type);
    const record = {
      passbook_id: passbookId,
      passbook_type: d.passbook_type,
      first_name: d.first_name, middle_name: d.middle_name, last_name: d.last_name, farmer_org: d.farmer_org,
      home_province: d.home_province, home_municipality: d.home_municipality, home_barangay: d.home_barangay,
      farm_province: d.farm_province, farm_municipality: d.farm_municipality, farm_barangay: d.farm_barangay,
      hectarage: d.hectarage, birth_date: d.birth_date, civil_status: d.civil_status, spouse_name: d.spouse_name,
      contact_no: d.contact_no, gender: d.gender, sector: d.sector, irrigated: d.irrigated,
      landholding_data: JSON.stringify(d.landholding_data), rsbsa_no: d.rsbsa_no,
      custom_quota_bags: d.custom_quota_bags || 0,
      created_at: nowIso, last_updated: nowIso, is_deleted: false
    };

    await db.farmers.put(record);
    await queueSync('farmers', 'upsert', record);

    renderWizardCelebration(container, record);
  };
}

/* ---------------- CELEBRATION SCREEN ---------------- */
function renderWizardCelebration(container, record) {
  const name = buildDisplayName(record);
  container.innerHTML = `
    <div class="content" style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:70vh; text-align:center;">
      <div class="celebrate-burst">
        <div class="celebrate-check">
          <svg viewBox="0 0 52 52" width="64" height="64"><circle cx="26" cy="26" r="25" fill="none"/><path fill="none" d="M14 27l7 7 16-16"/></svg>
        </div>
        ${Array.from({ length: 14 }).map((_, i) => {
          const angle = i * 25.7 * (Math.PI / 180);
          const dist = 80 + (i % 3) * 12;
          const tx = Math.round(Math.cos(angle) * dist);
          const ty = Math.round(Math.sin(angle) * dist);
          return `<span class="confetti-piece" style="--i:${i}; --tx:${tx}px; --ty:${ty}px;"></span>`;
        }).join('')}
      </div>
      <h2 style="font-size:20px; font-weight:800; margin-top:18px;">Passbook Registered! 🎉</h2>
      <p class="text-muted text-sm mt-8" style="max-width:280px;">${name} has been successfully added with control number <b>${record.passbook_id}</b>.</p>
      <div style="display:flex; flex-direction:column; gap:10px; margin-top:26px; width:100%; max-width:320px;">
        <button class="btn btn-primary btn-block" id="wiz-view-passbook">View Passbook</button>
        <button class="btn btn-gold btn-block" id="wiz-print-id">${icon('print', 16)} Print Passbook ID</button>
        <button class="btn btn-outline btn-block" id="wiz-register-another">Register Another</button>
      </div>
    </div>
  `;
  document.getElementById('wiz-view-passbook').onclick = () => navigate('passbookDetail', { id: record.passbook_id });
  document.getElementById('wiz-print-id').onclick = () => printPassbookId(record);
  document.getElementById('wiz-register-another').onclick = () => navigate('passbookWizard', {});
}
