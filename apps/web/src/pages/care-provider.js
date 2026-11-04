let currentRole = 'hospital';

/* Database of Roles for Dynamic Personalization */
const roleData = {
  hospital: {
    badge: 'Hospital Portal',
    facilityName: 'St. Nicholas Hospital',
    metrics: [
      { label: "Today's Consultations", value: "24 Bookings" },
      { label: "Active ER Dispatches", value: "2 Units Ready" },
      { label: "Settled HSA Wallet", value: "₦842,500.00" },
      { label: "Admitted Inpatients", value: "38 Patients" }
    ],
    queueTitle: "Live Patient Consultations & ER Admissions",
    queueSub: "Manage incoming appointments, doctor visits, and emergency triage",
    headers: ["Patient Name", "Department / Service", "Schedule Time", "Mode", "Status", "Actions"],
    queue: [
      { id: 1, col1: "Omolu Christopher", col2: "General Checkup / Dr. Rita Okon", col3: "Today, 10:00 AM", col4: "Video Consult", status: "confirmed", actionText: "Launch Session" },
      { id: 2, col1: "Amina Yusuf", col2: "Cardiology Review", col3: "Today, 11:30 AM", col4: "In-Person", status: "pending", actionText: "View Vitals" },
      { id: 3, col1: "Chidi Okoro", col2: "Emergency Trauma Unit", col3: "Today, 01:15 PM", col4: "ER Dispatch", status: "dispatch", actionText: "Dispatch Team" }
    ],
    catalogTitle: "Hospital Services & Departments",
    catalog: [
      { name: "General Checkup", cat: "Clinical", price: "₦15,000", status: "Active" },
      { name: "Emergency ER Visit", cat: "Emergency", price: "₦25,000", status: "Active" },
      { name: "Cardiology Review", cat: "Specialist", price: "₦30,000", status: "Active" }
    ],
    rosterTitle: "Staff Doctors & Specialists",
    roster: [
      { name: "Dr. Rita Okon", role: "General Practitioner", license: "42198", status: "Online" },
      { name: "Dr. Adebayo Sanni", role: "Cardiologist", license: "38910", status: "On Call" }
    ]
  },
  pharmacy: {
    badge: 'Pharmacy Portal',
    facilityName: 'HealthPlus Pharmacy (VI)',
    metrics: [
      { label: "Active Prescription Orders", value: "18 Orders" },
      { label: "Pending Rider Dispatches", value: "5 Riders En Route" },
      { label: "Settled Pharmacy Wallet", value: "₦1,245,000.00" },
      { label: "Low Stock Alerts", value: "2 Items" }
    ],
    queueTitle: "Prescription Fulfillment & Delivery Queue",
    queueSub: "Process verified prescriptions and coordinate dispatch riders",
    headers: ["Customer Name", "Medication / Kit", "Order Time", "Delivery Type", "Status", "Actions"],
    queue: [
      { id: 1, col1: "Funke Akindele", col2: "Malaria Treatment Kit (x1)", col3: "Today, 09:15 AM", col4: "Home Delivery", status: "confirmed", actionText: "Verify Rx" },
      { id: 2, col1: "Tunde Ednut", col2: "Vitamin C & Zinc Pack (x2)", col3: "Today, 10:45 AM", col4: "Express Dispatch", status: "dispatch", actionText: "Track Rider" }
    ],
    catalogTitle: "Medication & Health Kit Inventory",
    catalog: [
      { name: "Malaria Treatment Kit", cat: "Pharmacy", price: "₦4,500", status: "In Stock" },
      { name: "Vitamin C & Zinc", cat: "Supplements", price: "₦2,500", status: "In Stock" },
      { name: "Emergency First-Aid Kit", cat: "Trauma Care", price: "₦8,800", status: "Low Stock" }
    ],
    rosterTitle: "Pharmacists & Dispatch Team",
    roster: [
      { name: "Pharm. Chinedu Eze", role: "Superintendent Pharmacist", license: "PH-9281", status: "On Duty" },
      { name: "Sani Ibrahim", role: "Dispatch Rider", license: "LOG-441", status: "En Route" }
    ]
  },
  doctor: {
    badge: 'Doctor Portal',
    facilityName: 'Dr. Rita Okon (Specialist)',
    metrics: [
      { label: "Scheduled Consultations", value: "8 Today" },
      { label: "Completed Sessions", value: "142 This Week" },
      { label: "Consultation Earnings", value: "₦710,000.00" },
      { label: "Patient Satisfaction", value: "4.9 / 5.0" }
    ],
    queueTitle: "Upcoming Tele-Consultations & Appointments",
    queueSub: "Review patient medical history, video links, and consultation notes",
    headers: ["Patient Name", "Consultation Reason", "Scheduled Time", "Mode", "Status", "Actions"],
    queue: [
      { id: 1, col1: "Omolu Christopher", col2: "Routine Health Checkup & Follow-up", col3: "Today, 10:00 AM", col4: "Video Call", status: "confirmed", actionText: "Join HD Call" },
      { id: 2, col1: "Ngozi Eze", col2: "Persistent Cough & Fever", col3: "Today, 02:00 PM", col4: "Video Call", status: "pending", actionText: "View Chart" }
    ],
    catalogTitle: "Consultation Services & Pricing",
    catalog: [
      { name: "Standard Video Consult", cat: "Telemedicine", price: "₦5,000", status: "Active" },
      { name: "Follow-up Check-in", cat: "Telemedicine", price: "₦3,000", status: "Active" },
      { name: "Specialist Referral Review", cat: "Advisory", price: "₦10,000", status: "Active" }
    ],
    rosterTitle: "Clinical Support Staff",
    roster: [
      { name: "Nurse Blessing", role: "Triage & Vitals Nurse", license: "RN-8821", status: "Online" }
    ]
  },
  lab: {
    badge: 'Diagnostics Lab',
    facilityName: 'Kapita Diagnostics Lab',
    metrics: [
      { label: "Lab Test Bookings", value: "14 Today" },
      { label: "Home Sample Pickups", value: "6 Dispatches" },
      { label: "Results Pending Upload", value: "3 Results" },
      { label: "Settled Lab Wallet", value: "₦520,000.00" },
    ],
    queueTitle: "Laboratory Tests & Phlebotomy Queue",
    queueSub: "Manage home sample collections and laboratory test processing",
    headers: ["Patient Name", "Test Panel", "Schedule Time", "Collection Type", "Status", "Actions"],
    queue: [
      { id: 1, col1: "Amina Yusuf", col2: "Comprehensive Lipid Panel", col3: "Today, 11:30 AM", col4: "Home Phlebotomy", status: "confirmed", actionText: "Assign Phlebotomist" },
      { id: 2, col1: "David Adeleke", col2: "Full Malaria & Widal Test", col3: "Today, 01:00 PM", col4: "Walk-in Lab", status: "pending", actionText: "Log Sample" }
    ],
    catalogTitle: "Laboratory Test Menu",
    catalog: [
      { name: "Comprehensive Lipid Panel", cat: "Blood Chemistry", price: "₦12,500", status: "Available" },
      { name: "Full Malaria & Widal Test", cat: "Parasitology", price: "₦8,000", status: "Available" }
    ],
    rosterTitle: "Lab Technicians & Phlebotomists",
    roster: [
      { name: "Dr. Godwin Emeka", role: "Chief Medical Laboratory Scientist", license: "MLS-1092", status: "On Duty" },
      { name: "Blessing Okoro", role: "Mobile Phlebotomist", license: "PHL-332", status: "Dispatched" }
    ]
  }
};

/* Toast Notification */
function showNotification(message, type = 'success') {
  const container = document.getElementById('toastNotificationContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `kapita-toast`;
  toast.innerHTML = `
    <span class="material-symbols-outlined" style="color: var(--primary); font-size: 18px;">check_circle</span>
    <span style="flex: 1;">${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'fadeOutToast 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/* Onboarding & Role Selection */
function selectProviderRole(role) {
  currentRole = role;
  const data = roleData[role];
  if (!data) return;

  document.getElementById('headerRoleBadge').textContent = data.badge;
  document.getElementById('switcherFacilityName').textContent = data.facilityName;

  const metricsGrid = document.getElementById('metricsGrid');
  metricsGrid.innerHTML = '';
  data.metrics.forEach(m => {
    metricsGrid.innerHTML += `
      <div class="metric-card">
        <div class="label">${m.label}</div>
        <div class="value">${m.value}</div>
      </div>
    `;
  });

  document.getElementById('queueSectionTitle').textContent = data.queueTitle;
  document.getElementById('queueSectionSub').textContent = data.queueSub;

  const headersTr = document.getElementById('tableHeaders');
  headersTr.innerHTML = '';
  data.headers.forEach(h => {
    headersTr.innerHTML += `<th>${h}</th>`;
  });

  renderQueueTable();

  document.getElementById('catalogSectionTitle').textContent = data.catalogTitle;
  renderCatalogTable();

  document.getElementById('rosterSectionTitle').textContent = data.rosterTitle;
  renderRosterTable();

  document.getElementById('providerOnboardingModal').classList.remove('active');
  showNotification(`Workspace personalized for ${data.facilityName}!`);
}

function openOnboardingModal() {
  document.getElementById('providerOnboardingModal').classList.add('active');
}

/* Render Tables */
function renderQueueTable() {
  const data = roleData[currentRole];
  const tbody = document.getElementById('providerQueueTableBody');
  tbody.innerHTML = '';

  data.queue.forEach((item, index) => {
    tbody.innerHTML = `
      <tr>
        <td><strong>${item.col1}</strong></td>
        <td>${item.col2}</td>
        <td>${item.col3}</td>
        <td>${item.col4}</td>
        <td><span class="status-pill ${item.status}">${item.status.toUpperCase()}</span></td>
        <td><button class="action-btn" onclick="executeQueueAction('${item.col1}', '${item.actionText}')">${item.actionText}</button></td>
      </tr>
    ` + tbody.innerHTML;
  });
}

function renderCatalogTable() {
  const data = roleData[currentRole];
  const tbody = document.getElementById('catalogTableBody');
  tbody.innerHTML = '';

  data.catalog.forEach(item => {
    tbody.innerHTML += `
      <tr>
        <td><strong>${item.name}</strong></td>
        <td>${item.cat}</td>
        <td>${item.price}</td>
        <td><span class="status-pill confirmed">${item.status}</span></td>
      </tr>
    `;
  });
}

function renderRosterTable() {
  const data = roleData[currentRole];
  const tbody = document.getElementById('rosterTableBody');
  tbody.innerHTML = '';

  data.roster.forEach(item => {
    tbody.innerHTML += `
      <tr>
        <td><strong>${item.name}</strong></td>
        <td>${item.role}</td>
        <td>${item.license}</td>
        <td><span class="status-pill confirmed">${item.status}</span></td>
      </tr>
    `;
  });
}

/* Functional Actions */
function executeQueueAction(name, action) {
  showNotification(`Executed "${action}" for ${name}!`);
}

function openAddRecordModal() {
  document.getElementById('providerModalTitle').textContent = "Add New Queue Entry";
  document.getElementById('providerModalSub').textContent = "Register a new patient, prescription or test";
  document.getElementById('inputLabel1').textContent = "Patient / Client Name";
  document.getElementById('inputLabel2').textContent = "Service / Details";
  document.getElementById('modalInput1').value = "";
  document.getElementById('modalInput2').value = "";
  openModal('providerModal');
}

function openCatalogItemModal() {
  document.getElementById('providerModalTitle').textContent = "Add Service / Inventory Item";
  document.getElementById('providerModalSub').textContent = "Add a new offering to your catalog";
  document.getElementById('inputLabel1').textContent = "Item / Service Name";
  document.getElementById('inputLabel2').textContent = "Price (e.g. ₦5,000)";
  document.getElementById('modalInput1').value = "";
  document.getElementById('modalInput2').value = "";
  openModal('providerModal');
}

function openStaffModal() {
  document.getElementById('providerModalTitle').textContent = "Add Staff / Doctor";
  document.getElementById('providerModalSub').textContent = "Register a new medical practitioner";
  document.getElementById('inputLabel1').textContent = "Staff Full Name";
  document.getElementById('inputLabel2').textContent = "Specialty / License ID";
  document.getElementById('modalInput1').value = "";
  document.getElementById('modalInput2').value = "";
  openModal('providerModal');
}

function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

function closeProviderModal() {
  document.getElementById('providerModal').classList.remove('active');
}

/* Custom Modal Dropdown Handlers */
function toggleModalDropdown(wrapperId) {
  const wrapper = document.getElementById(wrapperId);
  document.querySelectorAll('.custom-modal-select-wrapper').forEach(w => {
    if (w.id !== wrapperId) w.classList.remove('active');
  });
  wrapper.classList.toggle('active');
}

function selectModalStatus(value, label, btnEl) {
  document.getElementById('selectedModalStatusLabel').textContent = label;
  document.getElementById('modalInput4').value = value;
  
  const menu = btnEl.closest('.care-filter-dropdown-menu');
  menu.querySelectorAll('.filter-option-item').forEach(i => i.classList.remove('active'));
  btnEl.classList.add('active');
  btnEl.closest('.care-filter-dropdown-wrapper').classList.remove('active');
}

/* Close custom dropdowns on outside click */
document.addEventListener('click', function(e) {
  if (!e.target.closest('.custom-modal-select-wrapper')) {
    document.querySelectorAll('.custom-modal-select-wrapper').forEach(w => w.classList.remove('active'));
  }
});

function handleProviderFormSubmit(e) {
  e.preventDefault();
  const val1 = document.getElementById('modalInput1').value;
  const val2 = document.getElementById('modalInput2').value;
  const time = document.getElementById('modalInput3').value;
  const status = document.getElementById('modalInput4').value.toLowerCase();

  const data = roleData[currentRole];
  data.queue.unshift({
    id: Date.now(),
    col1: val1,
    col2: val2,
    col3: time,
    col4: 'Standard',
    status: status.includes('pend') ? 'pending' : (status.includes('en') ? 'dispatch' : 'confirmed'),
    actionText: 'Manage'
  });

  renderQueueTable();
  closeProviderModal();
  showNotification(`Successfully added "${val1}" to active queue!`);
}

function toggleMobileNav() {
  openOnboardingModal();
}

// Initialize default view on load
window.addEventListener('DOMContentLoaded', () => {
  selectProviderRole('hospital');
});