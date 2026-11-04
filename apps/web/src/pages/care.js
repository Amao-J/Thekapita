/* Application State */
let currentModalServicePrice = 0;
let currentModalQty = 1;
let currentModalServiceName = '';
let currentSelectedDoctor = '';

/* User Appointments State Array */
let userAppointments = [
  { id: 'APT-8491', provider: 'Dr. Rita Okon (Video Consult)', date: '2026-10-25', time: '10:00', status: 'Confirmed' }
];

/* Toast Notification Helper Function */
function showNotification(message, type = 'success') {
  const container = document.getElementById('toastNotificationContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `kapita-toast ${type}`;

  const icon = type === 'success' ? 'check_circle' : 'info';
  const iconColor = type === 'success' ? 'var(--emerald)' : '#ef4444';

  toast.innerHTML = `
    <span class="material-symbols-outlined" style="color: ${iconColor}; font-size: 20px;">${icon}</span>
    <span style="flex: 1;">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'fadeOutToast 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/* Header Nav Dropdown Toggle */
function toggleDropdown() {
  const dropdown = document.getElementById('navDropdown');
  dropdown.classList.toggle('active');
}

/* Modal Handlers */
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

/* Open Appointments List Modal & Render */
function openAppointmentsListModal() {
  document.getElementById('navDropdown').classList.remove('active');

  const container = document.getElementById('appointmentsListContainer');
  container.innerHTML = '';

  if (userAppointments.length === 0) {
    container.innerHTML = `<p style="text-align:center; color: var(--text-muted); font-size: 13px; padding: 20px;">No active consultations found.</p>`;
  } else {
    userAppointments.forEach((apt, index) => {
      container.innerHTML += `
        <div style="background: var(--surface-gray); border: 1px solid var(--border-color); padding: 12px; border-radius: 12px; display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="font-size: 13px; color: var(--text-dark);">${apt.provider}</strong>
            <span style="font-size: 10px; font-weight: 800; background: #e6fdf4; color: var(--emerald-dark); padding: 2px 8px; border-radius: 6px;">${apt.status}</span>
          </div>
          <div style="font-size: 11px; color: var(--text-muted);">
            📅 Date: <strong>${apt.date}</strong> | ⏰ Time: <strong>${apt.time}</strong>
          </div>
          <div style="display: flex; justify-content: flex-end; margin-top: 4px;">
            <button type="button" onclick="cancelAppointment(${index})" style="background: #fee2e2; color: #b91c1c; border: none; font-size: 10px; font-weight: 700; padding: 4px 10px; border-radius: 6px; cursor: pointer;">Cancel Booking</button>
          </div>
        </div>
      `;
    });
  }

  openModal('appointmentsListModal');
}

/* Cancel Appointment Action */
function cancelAppointment(index) {
  userAppointments.splice(index, 1);
  openAppointmentsListModal();
  showNotification("Consultation successfully cancelled.");
}

/* 1. Doctor Profile Modal with Day/Time Scheduling */
function openDoctorProfile(name, specialty, price, imgUrl, metaInfo) {
  currentSelectedDoctor = name;
  currentModalServicePrice = price;

  document.getElementById('docProfileName').textContent = name;
  document.getElementById('docProfileSpecialty').textContent = specialty;
  document.getElementById('docProfileTitle').textContent = name;
  document.getElementById('docProfileMeta').textContent = metaInfo;
  document.getElementById('docProfileImg').src = imgUrl;
  document.getElementById('docProfilePrice').textContent = `₦${price.toLocaleString()}.00`;

  openModal('doctorProfileModal');
}

function confirmDoctorBooking(e) {
  e.preventDefault();
  const date = document.getElementById('docScheduleDate').value;
  const time = document.getElementById('docScheduleTime').value;
  const consultType = document.getElementById('docConsultType').value;

  userAppointments.push({
    id: 'APT-' + Math.floor(1000 + Math.random() * 9000),
    provider: `${currentSelectedDoctor} (${consultType})`,
    date,
    time,
    status: 'Scheduled'
  });

  closeModal('doctorProfileModal');
  showNotification(`Successfully scheduled ${consultType} with ${currentSelectedDoctor} for ${date} at ${time}!`);
}

/* 2. Pharmacy Medication Order Modal */
function openPharmacyMedModal(title, price, provider, imgUrl, description) {
  currentModalServiceName = title;
  currentModalServicePrice = price;
  currentModalQty = 1;

  document.getElementById('medProviderTitle').textContent = provider;
  document.getElementById('medModalTitle').textContent = title;
  document.getElementById('medModalDesc').textContent = description;
  document.getElementById('medModalImg').src = imgUrl;
  document.getElementById('medModalQty').textContent = currentModalQty;
  document.getElementById('medModalPrice').textContent = `₦${price.toLocaleString()}.00`;

  openModal('pharmacyMedModal');
}

function adjustMedQty(delta) {
  currentModalQty = Math.max(1, currentModalQty + delta);
  document.getElementById('medModalQty').textContent = currentModalQty;
  const total = currentModalServicePrice * currentModalQty;
  document.getElementById('medModalPrice').textContent = `₦${total.toLocaleString()}.00`;
}

function confirmPharmacyOrder() {
  const total = currentModalServicePrice * currentModalQty;
  closeModal('pharmacyMedModal');
  showNotification(`Medication order for "${currentModalServiceName}" (x${currentModalQty}) placed! Total: ₦${total.toLocaleString()}.00`);
}

/* 3. Lab Test Modal */
function openLabTestModal(title, price, provider, imgUrl, instructions) {
  currentModalServiceName = title;
  currentModalServicePrice = price;

  document.getElementById('labModalProvider').textContent = provider;
  document.getElementById('labModalTitle').textContent = title;
  document.getElementById('labModalInstructions').textContent = instructions;
  document.getElementById('labModalImg').src = imgUrl;
  document.getElementById('labModalPrice').textContent = `₦${price.toLocaleString()}.00`;

  openModal('labTestModal');
}

function confirmLabBooking() {
  const preference = document.getElementById('sampleCollectionType').value;
  closeModal('labTestModal');
  showNotification(`Lab test "${currentModalServiceName}" booked! Preference: ${preference}`);
}

/* 4. Wellness Program Modal */
function openWellnessProgramModal(title, price, provider, imgUrl, desc) {
  currentModalServiceName = title;
  currentModalServicePrice = price;

  document.getElementById('wellnessModalProvider').textContent = provider;
  document.getElementById('wellnessModalTitle').textContent = title;
  document.getElementById('wellnessModalDesc').textContent = desc;
  document.getElementById('wellnessModalImg').src = imgUrl;
  document.getElementById('wellnessModalPrice').textContent = `₦${price.toLocaleString()}.00`;

  openModal('wellnessProgramModal');
}

function confirmWellnessBooking() {
  const goal = document.getElementById('wellnessGoalInput').value || 'General Health';
  closeModal('wellnessProgramModal');
  showNotification(`Successfully enrolled in "${currentModalServiceName}"! Goal: ${goal}`);
}

function reorderService(title, price) {
  closeModal('historyModal');
  showNotification(`Reordering prescription "${title}" for ₦${price.toLocaleString()}.00...`);
}

/* Appointment Form Submission */
function handleAppointmentSubmit(e) {
  e.preventDefault();
  const provider = document.getElementById('resProviderSelect').value;
  const date = document.getElementById('resDate').value;
  const time = document.getElementById('resTime').value;

  userAppointments.push({
    id: 'APT-' + Math.floor(1000 + Math.random() * 9000),
    provider,
    date,
    time,
    status: 'Confirmed'
  });

  closeModal('appointmentModal');
  showNotification(`Consultation successfully booked with ${provider}!`);
}

/* Dual Switcher */
function switchProviderCategory(category, btnElement) {
  document.querySelectorAll('.service-mode-toggle .mode-btn').forEach(btn => btn.classList.remove('active'));
  btnElement.classList.add('active');

  const cards = document.querySelectorAll('.restaurant-option-card');
  let visible = 0;

  cards.forEach(card => {
    if (category === 'all' || card.dataset.category === category) {
      card.style.display = 'flex';
      visible++;
    } else {
      card.style.display = 'none';
    }
  });

  document.getElementById('merchantCountTag').textContent = `${visible} Providers Active`;
}

/* Category Filtering */
function filterBySpecialty(specialty, chipElement) {
  const cards = document.querySelectorAll('.restaurant-option-card');
  let visible = 0;

  cards.forEach(card => {
    const categories = card.dataset.cuisine.split(' ');
    if (specialty === 'all' || categories.includes(specialty)) {
      card.style.display = 'flex';
      visible++;
    } else {
      card.style.display = 'none';
    }
  });

  document.getElementById('merchantCountTag').textContent = `${visible} Providers Active`;
}

/* Search Bar Filter */
function handleFilterSearch() {
  const q = document.getElementById('careSearchInput').value.toLowerCase();
  const cards = document.querySelectorAll('.restaurant-option-card');
  let visible = 0;

  cards.forEach(card => {
    const text = card.textContent.toLowerCase();
    if (text.includes(q)) {
      card.style.display = 'flex';
      visible++;
    } else {
      card.style.display = 'none';
    }
  });

  document.getElementById('merchantCountTag').textContent = `${visible} Providers Active`;
}

/* Quick Action Helpers */
function quickMarkTaken() {
  toggleAiWidget();
  showNotification(`Medicine logged successfully!`);
}

function triggerAddressChange() {
  const newLoc = prompt('Enter your current location:', 'Victoria Island, Lagos');
  if (newLoc) {
    document.getElementById('headerLocationText').textContent = newLoc;
    showNotification(`Location updated to ${newLoc}`);
  }
}

function focusSearchInput(btnElement) {
  switchDockTab('search', btnElement);
  document.getElementById('careSearchInput').focus();
}

function switchDockTab(tab, btnElement) {
  document.querySelectorAll('.market-nav-btn').forEach(b => b.classList.remove('active'));
  btnElement.classList.add('active');
}

/* Full Database for Provider Catalogs */
const hospitalCatalogs = {
  'St. Nicholas Hospital': [
    { name: 'General Checkup', price: 15000, img: 'https://images.unsplash.com/photo-1581056771107-24ca5f033842?auto=format&fit=crop&w=150&q=80', desc: 'Comprehensive physical evaluation & vital signs.' },
    { name: 'Emergency ER Visit', price: 25000, img: 'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=150&q=80', desc: 'Immediate trauma stabilization.' },
    { name: 'Cardiology Review', price: 28000, img: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=150&q=80', desc: 'Heart health assessment & ECG.' }
  ],
  'Evercare Hospital Lekki': [
    { name: 'Cardiology Consultation', price: 30000, img: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=150&q=80', desc: 'Specialist heart evaluation.' },
    { name: 'Pediatric Care Visit', price: 18000, img: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=150&q=80', desc: 'Child health immunization & checkup.' }
  ]
};

const pharmacyCatalogs = {
  'HealthPlus Pharmacy': [
    { name: 'Malaria Treatment Kit', price: 4500, img: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=150&q=80', desc: 'Anti-malarial course with test kit.' },
    { name: 'Vitamin C & Zinc', price: 2500, img: 'https://images.unsplash.com/photo-1550572017-edb7fd9062cb?auto=format&fit=crop&w=150&q=80', desc: 'Immunity support supplements.' },
    { name: 'Emergency First-Aid Kit', price: 8800, img: 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=150&q=80', desc: 'Trauma & burn treatment kit.' }
  ]
};

const labCatalogs = {
  'Kapita Diagnostics Lab': [
    { name: 'Comprehensive Lipid Panel', price: 12500, img: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=150&q=80', desc: 'Cholesterol and glucose profile.' },
    { name: 'Full Malaria & Widal Test', price: 8000, img: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=150&q=80', desc: 'Parasite and typhoid screening.' }
  ]
};

const wellnessCatalogs = {
  'Zen Wellness Hub': [
    { name: 'Dietary & Nutrition Plan', price: 10000, img: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=150&q=80', desc: 'Custom 4-week meal plan.' },
    { name: 'Stress Relief & Sleep Coaching', price: 12000, img: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=150&q=80', desc: 'Holistic wellness guidance.' }
  ]
};

function openHospitalCatalog(providerName) {
  document.getElementById('fullCatalogProviderName').textContent = providerName;
  document.getElementById('fullCatalogSub').textContent = 'Hospital Services & Clinical Departments';
  renderCatalogItems(hospitalCatalogs[providerName] || [], providerName, 'hospital');
}

function openPharmacyCatalog(providerName) {
  document.getElementById('fullCatalogProviderName').textContent = providerName;
  document.getElementById('fullCatalogSub').textContent = 'Prescription & OTC Medication Catalog';
  renderCatalogItems(pharmacyCatalogs[providerName] || [], providerName, 'pharmacy');
}

function openLabCatalog(providerName) {
  document.getElementById('fullCatalogProviderName').textContent = providerName;
  document.getElementById('fullCatalogSub').textContent = 'Diagnostics & Laboratory Test Menu';
  renderCatalogItems(labCatalogs[providerName] || [], providerName, 'lab');
}

function openWellnessCatalog(providerName) {
  document.getElementById('fullCatalogProviderName').textContent = providerName;
  document.getElementById('fullCatalogSub').textContent = 'Holistic Wellness Programs & Diet Plans';
  renderCatalogItems(wellnessCatalogs[providerName] || [], providerName, 'wellness');
}

function renderCatalogItems(items, providerName, type) {
  const menuList = document.getElementById('fullCatalogList');
  menuList.innerHTML = '';

  if (items.length === 0) {
    menuList.innerHTML = `<p style="text-align:center; color: var(--text-muted); font-size: 13px; padding: 20px;">No services currently available.</p>`;
  } else {
    items.forEach(item => {
      let clickAction = '';
      if (type === 'hospital') {
        clickAction = `openHospitalServiceModal('${item.name}', ${item.price}, '${providerName}', '${item.img}', '${item.desc}')`;
      } else if (type === 'pharmacy') {
        clickAction = `openPharmacyMedModal('${item.name}', ${item.price}, '${providerName}', '${item.img}', '${item.desc}')`;
      } else if (type === 'lab') {
        clickAction = `openLabTestModal('${item.name}', ${item.price}, '${providerName}', '${item.img}', '${item.desc}')`;
      } else {
        clickAction = `openWellnessProgramModal('${item.name}', ${item.price}, '${providerName}', '${item.img}', '${item.desc}')`;
      }

      menuList.innerHTML += `
        <div class="menu-list-item" style="cursor: pointer;" onclick="closeModal('fullCatalogModal'); ${clickAction}">
          <img src="${item.img}" alt="${item.name}" class="menu-item-thumb">
          <div class="menu-item-info">
            <h4>${item.name}</h4>
            <p style="font-size: 11px; color: var(--text-muted); margin-bottom: 2px;">${item.desc}</p>
            <span class="price">₦${item.price.toLocaleString()}</span>
          </div>
          <button type="button" class="add-dish-btn">
            <span class="material-symbols-outlined" style="font-size: 18px;">arrow_forward</span>
          </button>
        </div>
      `;
    });
  }

  openModal('fullCatalogModal');
}

function openHospitalServiceModal(title, price, provider, img, desc) {
  openAppointmentWithDetails(title, price, provider);
}

function openAppointmentWithDetails(title, price, provider) {
  selectModalProvider(`${provider} (${title})`, `${provider} (${title}) - ₦${price.toLocaleString()}`, document.querySelector('.filter-option-item'));
  document.getElementById('appointmentFeeDisplay').textContent = `₦${price.toLocaleString()}.00`;
  openModal('appointmentModal');
}

function handleProviderRegistration(e) {
  e.preventDefault();
  const storeName = document.getElementById('vendorStoreName').value;
  closeModal('providerRegisterModal');
  showNotification(`Provider application for "${storeName}" received successfully!`);
}

function toggleAiWidget() {
  const widget = document.getElementById('aiFloatingWidget');
  if (widget) widget.classList.toggle('expanded');
}

/* Custom Modal Dropdown Handlers (Matching Search Filter Style) */
function toggleModalDropdown(wrapperId) {
  const wrapper = document.getElementById(wrapperId);
  document.querySelectorAll('.custom-modal-select-wrapper').forEach(w => {
    if (w.id !== wrapperId) w.classList.remove('active');
  });
  wrapper.classList.toggle('active');
}

function selectModalProvider(value, label, btnEl) {
  document.getElementById('selectedModalProviderLabel').textContent = label;
  document.getElementById('resProviderSelect').value = value;
  
  const menu = btnEl.closest('.care-filter-dropdown-menu');
  menu.querySelectorAll('.filter-option-item').forEach(i => i.classList.remove('active'));
  btnEl.classList.add('active');
  btnEl.closest('.care-filter-dropdown-wrapper').classList.remove('active');
}

function selectModalConsult(value, label, btnEl) {
  document.getElementById('selectedModalConsultLabel').textContent = label;
  document.getElementById('docConsultType').value = value;
  
  const menu = btnEl.closest('.care-filter-dropdown-menu');
  menu.querySelectorAll('.filter-option-item').forEach(i => i.classList.remove('active'));
  btnEl.classList.add('active');
  btnEl.closest('.care-filter-dropdown-wrapper').classList.remove('active');
}

function selectModalLab(value, label, btnEl) {
  document.getElementById('selectedModalLabLabel').textContent = label;
  document.getElementById('sampleCollectionType').value = value;
  
  const menu = btnEl.closest('.care-filter-dropdown-menu');
  menu.querySelectorAll('.filter-option-item').forEach(i => i.classList.remove('active'));
  btnEl.classList.add('active');
  btnEl.closest('.care-filter-dropdown-wrapper').classList.remove('active');
}

function selectModalProviderType(value, label, btnEl) {
  document.getElementById('selectedModalProviderTypeLabel').textContent = label;
  document.getElementById('vendorCategorySelect').value = value;
  
  const menu = btnEl.closest('.care-filter-dropdown-menu');
  menu.querySelectorAll('.filter-option-item').forEach(i => i.classList.remove('active'));
  btnEl.classList.add('active');
  btnEl.closest('.care-filter-dropdown-wrapper').classList.remove('active');
}

/* Close custom modal dropdowns on outside click */
document.addEventListener('click', function(e) {
  if (!e.target.closest('.custom-modal-select-wrapper')) {
    document.querySelectorAll('.custom-modal-select-wrapper').forEach(w => w.classList.remove('active'));
  }
});

/* 1. AI Symptom Triage Logic */
function handleTriageAnalysis(e) {
  e.preventDefault();
  const btn = document.getElementById('triageAnalyzeBtn');
  btn.textContent = "Analyzing Symptoms...";
  btn.disabled = true;

  setTimeout(() => {
    const symptom = document.getElementById('triageSymptomValue').value;

    const recs = {
      fever: {
        name: "Standard Video Consult", provider: "Dr. Rita Okon", price: 5000, img: "https://images.unsplash.com/photo-1643297654416-05795d62e39c?q=80&w=853&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D",
        message: "We recommend a telemedicine consult to evaluate your fever. Would you like to schedule Dr. Rita Okon?"
      },
      headache: {
        name: "General Checkup", provider: "St. Nicholas Hospital", price: 15000, img: "https://images.unsplash.com/photo-1581056771107-24ca5f033842?auto=format&fit=crop&w=400&q=80",
        message: "Severe headaches warrant an in-person checkup. Book an appointment with a nearby hospital."
      },
      stomach: {
        name: "Standard Video Consult", provider: "Dr. Rita Okon", price: 5000, img: "https://images.unsplash.com/photo-1643297654416-05795d62e39c?q=80&w=853&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D",
        message: "A quick tele-consult can help identify the cause of your stomach pain."
      },
      cough: {
        name: "General Checkup", provider: "St. Nicholas Hospital", price: 15000, img: "https://images.unsplash.com/photo-1581056771107-24ca5f033842?auto=format&fit=crop&w=400&q=80",
        message: "Persistent cough may require auscultation. We recommend booking an in-person visit."
      }
    };

    const result = recs[symptom] || recs.fever;

    document.getElementById('triageResultDetails').textContent = result.message;
    document.getElementById('triageResultBox').style.display = 'block';

    btn.textContent = "Re-Analyze Symptoms";
    btn.disabled = false;
    window.selectedTriageService = result;
  }, 1200);
}

function proceedTriageBooking() {
  if (!window.selectedTriageService) return;
  const service = window.selectedTriageService;

  closeModal('triageModal');
  openDoctorProfile(service.provider, 'General Practitioner', service.price, service.img, 'MDCN Verified • AI Triage Referral');
}

/* 2. SOS Emergency Dispatch Logic */
function confirmSOSDispatch() {
  closeModal('sosModal');
  showNotification("Ambulance dispatched! Track progress on your dashboard.", "success");
  setTimeout(() => location.reload(), 2000);
}

/* Custom Dropdown Toggle for Symptom Preference */
function toggleCustomDropdown(e) {
  e.stopPropagation();
  const menu = document.getElementById('triageOptionsMenu');
  menu.classList.toggle('active');
}

function selectTriageOption(value, labelText) {
  document.getElementById('triageSymptomValue').value = value;
  document.getElementById('selectedTriageLabel').textContent = labelText;

  const items = document.querySelectorAll('#triageOptionsMenu .custom-option-item');
  items.forEach(item => item.classList.remove('selected'));
  event.currentTarget.classList.add('selected');

  document.getElementById('triageOptionsMenu').classList.remove('active');
}

document.addEventListener('click', () => {
  const menu = document.getElementById('triageOptionsMenu');
  if (menu) menu.classList.remove('active');
});

// Toggle Dropdown Visibility
function toggleCareFilterDropdown() {
  const wrapper = document.getElementById('careFilterDropdown');
  wrapper.classList.toggle('active');
}

// Handle Selection and Filter trigger
function selectCareFilter(categoryKey, labelText, buttonElement) {
  document.getElementById('selectedFilterLabel').innerText = labelText;

  const items = document.querySelectorAll('.filter-option-item');
  items.forEach(item => item.classList.remove('active'));
  buttonElement.classList.add('active');

  document.getElementById('careFilterDropdown').classList.remove('active');

  if (typeof filterBySpecialty === 'function') {
    filterBySpecialty(categoryKey, buttonElement);
  }
}

// Toggle Active Dispatch Section Visibility
function toggleActiveDispatch() {
  const toggleBtn = document.getElementById('dispatchToggleBtn');
  const collapseWrapper = document.getElementById('activeShipmentCollapse');

  toggleBtn.classList.toggle('active');
  collapseWrapper.classList.toggle('expanded');

  const isExpanded = collapseWrapper.classList.contains('expanded');
  toggleBtn.setAttribute('aria-expanded', isExpanded);
}
