import { request, ApiError } from '../api/client.js';
import { authorizedRequest, isAuthenticated } from '../state/session.js';
import { ENDPOINTS } from '@thekapita/shared/endpoints';

// Global Modal Functions
function openModal(id) {
  // The owner portal and the add-property form need an account (listings belong to a user).
  if ((id === 'vendorDashboardModal' || id === 'addPropertyModal') && !requireSignIn()) return;
  document.getElementById(id).classList.add("active");
  if (id === 'vendorDashboardModal') loadMyProperties();
}

function closeModal(id) {
  document.getElementById(id).classList.remove("active");
  if (id === 'detailModal') {
    stopAutoRotate();
  }
}

function requireSignIn() {
  if (isAuthenticated()) return true;
  alert("Please sign in to continue.");
  window.location.href = "auth.html";
  return false;
}

// Dashboard Tab Switcher
function switchDashTab(tabId, btnElement) {
  document.querySelectorAll('.dash-tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.dash-tab').forEach(btn => btn.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  btnElement.classList.add('active');
}

// Listing text comes from other users, so escape it before it goes into innerHTML.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function setHtml(element, markup) {
  // eslint-disable-next-line no-restricted-properties -- every dynamic value in the templates is passed through esc().
  element.innerHTML = markup;
}

// =====================================
// BACKEND DATA LAYER  (/api/haven/*)
// =====================================
const FALLBACK_IMG = "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80";
const PAGE_SIZE = 100;

// Public grid (live listings) and the signed-in owner's own listings (any status).
let propertiesDataset = [];
let myProperties = [];

function formatPrice(p) {
  const base = `₦${Number(p.price).toLocaleString()}`;
  return p.price_period === "year" ? `${base} / yr` : p.price_period === "night" ? `${base} / night` : base;
}

function formatSpecs(p) {
  const parts = [];
  if (p.bedrooms) parts.push(`${p.bedrooms} Bed${p.bedrooms === 1 ? "" : "s"}`);
  if (p.bathrooms) parts.push(`${p.bathrooms} Bath${p.bathrooms === 1 ? "" : "s"}`);
  if (p.parking) parts.push(`${p.parking} Parking`);
  if (p.area_sqm) parts.push(`${p.area_sqm} sqm`);
  return parts.length ? parts.join(" • ") : p.category_label;
}

// API shape -> the shape the page's renderers already use.
function toView(p) {
  return {
    id: p.id,
    title: p.title,
    intent: p.intent,
    price: formatPrice(p),
    numericPrice: p.price,
    location: p.city,
    address: p.address,
    specs: formatSpecs(p),
    beds: p.bedrooms,
    baths: p.bathrooms,
    titleDoc: p.title_doc_label,
    titleVerified: p.title_verified,
    agentVerified: p.agent_verified,
    featured: p.featured,
    img: p.image_url || FALLBACK_IMG,
    bookmarked: p.bookmarked,
    vendorOwned: p.is_mine,
    status: p.status,
    statusLabel: p.status_label,
    desc: p.description || "No description provided.",
    rawDesc: p.description,
  };
}

const api = (path, opts) => (isAuthenticated() ? authorizedRequest(path, opts) : request(path, opts));

function errorMessage(err, fallback) {
  return err instanceof ApiError && err.message ? err.message : fallback;
}

async function loadProperties() {
  const grid = document.getElementById("propertyGrid");
  setHtml(grid, `<div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; color: #64748b;">Loading properties…</div>`);
  try {
    const all = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const page = await api(`${ENDPOINTS.haven.properties}?limit=${PAGE_SIZE}&offset=${offset}`);
      all.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    propertiesDataset = all.map(toView);
  } catch (err) {
    propertiesDataset = [];
    setHtml(grid, `<div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; color: #64748b;">
      <p>${esc(errorMessage(err, "Could not load properties."))}</p>
      <button class="btn-card-primary" onclick="loadProperties()">Try again</button></div>`);
    updateBookmarkCount();
    return;
  }
  updateBookmarkCount();
  filterProperties();
}

async function loadMyProperties() {
  if (!isAuthenticated()) return;
  try {
    myProperties = (await authorizedRequest(ENDPOINTS.haven.mine)).map(toView);
  } catch (err) {
    alert(errorMessage(err, "Could not load your properties."));
    return;
  }
  renderDashboardListings();
}

let activeIntent = "all";
let currentEditPropId = null;
let showingOnlyBookmarks = false;
let activePillFilter = null;

// 360 Panorama State Variables
let currentPanX = -30;
let currentZoom = 1;
let autoRotateInterval = null;

document.addEventListener("DOMContentLoaded", () => {
  loadProperties();
  if (isAuthenticated()) loadMyProperties();
});

// =====================================
// VENDOR DASHBOARD LISTINGS CONTROLLER
// =====================================
function renderDashboardListings() {
  const container = document.getElementById("dashboardListingsContainer");
  setHtml(container, "");

  document.getElementById("dashTotalListings").textContent = myProperties.filter(p => p.status === "approved").length;

  if (myProperties.length === 0) {
    setHtml(container, `<div style="padding: 24px; text-align: center; color: #64748b; font-size: 13px;">You have not listed any property yet.</div>`);
    return;
  }

  myProperties.forEach(prop => {
    const row = document.createElement("div");
    row.className = "listing-row";
    const live = prop.status === "approved";
    const label = live ? (prop.titleVerified ? "Live & Verified" : "Live") : prop.status === "pending" ? "Pending Audit" : prop.statusLabel;

    setHtml(row, `
      <div class="listing-row-info">
        <img src="${esc(prop.img)}" alt="Prop" class="listing-row-img">
        <div>
          <strong style="font-size: 13px; display: block;">${esc(prop.title)}</strong>
          <span style="font-size: 11px; color: #64748b;">${esc(prop.price)} • ${esc(prop.location)}</span>
        </div>
      </div>
      <div style="display: flex; gap: 12px; align-items: center;">
        <span class="listing-row-status ${live ? 'status-active' : 'status-pending'}">${esc(label)}</span>
        <button onclick="openEditPropertyModal(${Number(prop.id)})" style="background: none; border: none; cursor: pointer; color: #64748b;" title="Edit Property">
          <span class="material-symbols-outlined" style="font-size: 18px;">edit</span>
        </button>
        <button onclick="handleArchiveProperty(${Number(prop.id)})" style="background: none; border: none; cursor: pointer; color: #64748b;" title="Remove Listing">
          <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
        </button>
      </div>
    `);
    container.appendChild(row);
  });
}

// =====================================
// EDIT PROPERTY LOGIC
// =====================================
function openEditPropertyModal(id) {
  const prop = myProperties.find(p => p.id === id);
  if (!prop) return;
  currentEditPropId = id;

  document.getElementById("editPropTitle").value = prop.title;
  document.getElementById("editPropIntent").value = prop.intent;
  document.getElementById("editPropPrice").value = prop.numericPrice;
  document.getElementById("editPropLocation").value = prop.location;
  document.getElementById("editPropDesc").value = prop.rawDesc || "";
  document.getElementById("editPropBeds").value = prop.beds || "";
  document.getElementById("editPropBaths").value = prop.baths || "";

  closeModal("vendorDashboardModal");
  openModal("editPropertyModal");
}

async function handleEditProperty(e) {
  e.preventDefault();
  const prop = myProperties.find(p => p.id === currentEditPropId);
  if (!prop) return;

  const submit = e.target.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    await authorizedRequest(ENDPOINTS.haven.property(prop.id), {
      method: "PATCH",
      body: {
        title: document.getElementById("editPropTitle").value.trim(),
        intent: document.getElementById("editPropIntent").value,
        price: document.getElementById("editPropPrice").value,
        city: document.getElementById("editPropLocation").value.trim(),
        description: document.getElementById("editPropDesc").value,
        bedrooms: Number(document.getElementById("editPropBeds").value || 0),
        bathrooms: Number(document.getElementById("editPropBaths").value || 0),
      },
    });
  } catch (err) {
    alert(errorMessage(err, "Could not update the property."));
    return;
  } finally {
    submit.disabled = false;
  }

  await Promise.all([loadProperties(), loadMyProperties()]);
  closeModal("editPropertyModal");
  openModal("vendorDashboardModal");
  alert("Property updated successfully.");
}

async function handleArchiveProperty(id) {
  const prop = myProperties.find(p => p.id === id);
  if (!prop || !confirm(`Remove '${prop.title}' from Haven? This cannot be undone from here.`)) return;
  try {
    await authorizedRequest(ENDPOINTS.haven.property(id), { method: "DELETE" });
  } catch (err) {
    alert(errorMessage(err, "Could not remove the property."));
    return;
  }
  await Promise.all([loadProperties(), loadMyProperties()]);
}

// =====================================
// ADD NEW PROPERTY LOGIC
// =====================================
async function handleAddProperty(e) {
  e.preventDefault();
  const form = e.target;
  const submit = form.querySelector('[type="submit"]');
  const value = (id) => document.getElementById(id).value;

  submit.disabled = true;
  let created;
  try {
    created = await authorizedRequest(ENDPOINTS.haven.properties, {
      method: "POST",
      body: {
        title: value("newPropTitle").trim(),
        category: value("newPropCategory"),
        intent: value("newPropIntent"),
        price: value("newPropPrice"),
        negotiable: document.getElementById("priceNegotiable").checked,
        address: value("newPropAddress").trim(),
        city: value("newPropLocation").trim(),
        bedrooms: Number(value("newPropBeds") || 0),
        bathrooms: Number(value("newPropBaths") || 0),
        description: value("newPropDesc"),
        title_doc: value("newPropDocType"),
      },
    });
  } catch (err) {
    alert(errorMessage(err, "Could not submit the property."));
    return;
  } finally {
    submit.disabled = false;
  }

  form.reset();
  await Promise.all([loadProperties(), loadMyProperties()]);
  closeModal("addPropertyModal");
  switchDashTab('dashListings', document.querySelectorAll('.dash-tab')[1]);
  openModal("vendorDashboardModal");

  alert(created.status === "approved"
    ? `Property '${created.title}' is now live.`
    : `Property '${created.title}' submitted successfully. It is currently under Title Verification and will go live shortly.`);
}

      // Filter & Render Property Grid
      function renderProperties(items) {
        const grid = document.getElementById("propertyGrid");
        setHtml(grid, "");

        if (items.length === 0) {
          setHtml(grid, `
            <div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; color: #64748b;">
              <span class="material-symbols-outlined" style="font-size: 48px; margin-bottom: 8px;">home_work</span>
              <p>No verified properties found matching your search parameters.</p>
            </div>
          `);
          return;
        }

        items.forEach(item => {
          const card = document.createElement("div");
          card.className = `property-card ${item.featured ? 'featured' : ''}`;
          
          setHtml(card, `
            ${item.featured ? '<span class="featured-badge">FEATURED</span>' : ''}
            <button class="btn-card-bookmark ${item.bookmarked ? 'bookmarked' : ''}" onclick="event.stopPropagation(); toggleBookmark(${item.id})">
              <span class="material-symbols-outlined" style="font-size: 18px;">bookmark</span>
            </button>
            <div class="property-img-wrapper" onclick="openDetailModal(${item.id})">
              <img src="${esc(item.img)}" class="property-img" alt="${esc(item.title)}">
              <div class="virtual-tour-pill">
                <span class="material-symbols-outlined" style="font-size: 14px;">360</span>
                <span>360° Tour</span>
              </div>
            </div>
            <div class="property-info-body">
              <div class="property-price">${esc(item.price)}</div>
              <div class="property-title">${esc(item.title)}</div>
              <div class="property-location">
                <span class="material-symbols-outlined" style="font-size: 14px;">location_on</span>
                <span>${esc(item.location)}</span>
              </div>
              <div class="property-specs-row">
                <span class="spec-item">
                  <span class="material-symbols-outlined" style="font-size: 16px;">bed</span>
                  ${esc(item.specs)}
                </span>
              </div>
              <div class="badges-row">
                <span class="badge-title-verified">
                  <span class="material-symbols-outlined" style="font-size: 12px;">verified</span>
                  ${esc(item.titleVerified ? item.titleDoc : `${item.titleDoc} (audit pending)`)}
                </span>
                ${item.agentVerified ? '<span class="badge-agent-verified"><span class="material-symbols-outlined" style="font-size: 12px;">badge</span>Verified Agent</span>' : ''}
              </div>
              <div class="card-footer-actions">
                <button class="btn-card-primary" onclick="openDetailModal(${item.id})">Inspect & View</button>
                <button class="btn-card-secondary" onclick="openScheduleModal()">Book Viewing</button>
              </div>
            </div>
          `);
          grid.appendChild(card);
        });

        document.getElementById("propertyCountTag").textContent = `${items.length} Listings Found`;
      }

      function filterProperties() {
        const query = document.getElementById("propertySearchInput").value.toLowerCase();
        const maxBudget = Number(document.getElementById("budgetSearchInput").value);

        let filtered = propertiesDataset.filter(p => {
          const matchesIntent = (activeIntent === "all") || (p.intent === activeIntent);
          const matchesSearch = p.title.toLowerCase().includes(query) ||
                                p.location.toLowerCase().includes(query) ||
                                p.titleDoc.toLowerCase().includes(query);
          const matchesBudget = !maxBudget || p.numericPrice <= maxBudget;
          const matchesBookmark = !showingOnlyBookmarks || p.bookmarked;

          let matchesPill = true;
          if (activePillFilter) {
            matchesPill = p.titleDoc.toLowerCase().includes(activePillFilter.toLowerCase()) ||
                          p.title.toLowerCase().includes(activePillFilter.toLowerCase()) ||
                          p.intent.toLowerCase().includes(activePillFilter.toLowerCase());
          }

          return matchesIntent && matchesSearch && matchesBudget && matchesBookmark && matchesPill;
        });

        renderProperties(filtered);
      }

      function setIntent(intent, btn) {
        activeIntent = intent;
        document.querySelectorAll(".intent-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        filterProperties();
      }

      function togglePillFilter(btn, keyword) {
        if (activePillFilter === keyword) {
          activePillFilter = null;
          btn.classList.remove("active");
        } else {
          document.querySelectorAll(".pill-btn").forEach(b => b.classList.remove("active"));
          activePillFilter = keyword;
          btn.classList.add("active");
        }
        filterProperties();
      }

      async function toggleBookmark(id) {
        const item = propertiesDataset.find(p => p.id === id);
        if (!item || !requireSignIn()) return;
        const next = !item.bookmarked;
        item.bookmarked = next; // optimistic; rolled back below if the server refuses
        updateBookmarkCount();
        filterProperties();
        try {
          await authorizedRequest(ENDPOINTS.haven.bookmark(id), { method: next ? "POST" : "DELETE" });
        } catch (err) {
          item.bookmarked = !next;
          updateBookmarkCount();
          filterProperties();
          alert(errorMessage(err, "Could not update your saved properties."));
        }
      }

      function updateBookmarkCount() {
        const count = propertiesDataset.filter(p => p.bookmarked).length;
        document.getElementById("bookmarkCount").textContent = count;
      }

      function showAllProperties() {
        showingOnlyBookmarks = false;
        document.getElementById("navAllBtn").classList.add("active");
        document.getElementById("navBookmarksBtn").classList.remove("active");
        filterProperties();
      }

      function showBookmarkedProperties() {
        showingOnlyBookmarks = true;
        document.getElementById("navBookmarksBtn").classList.add("active");
        document.getElementById("navAllBtn").classList.remove("active");
        filterProperties();
      }

      // AI Search Console
      function executeAISearch() {
        const query = document.getElementById("propertySearchInput").value.toLowerCase();
        const banner = document.getElementById("aiParsedBanner");
        const text = document.getElementById("aiParsedText");

        if (!query.trim()) {
          banner.classList.remove("active");
          filterProperties();
          return;
        }

        banner.classList.add("active");
        text.textContent = `AI Intent Parsed: Matching property listings by budget, commute & legal verification for "${query}"`;
        filterProperties();
      }

      function handleSearchKeyup(e) {
        if (e.key === "Enter") executeAISearch();
        else filterProperties();
      }

      // Detail Modal & 360 Walkthrough Controls
      function openDetailModal(id) {
        const item = propertiesDataset.find(p => p.id === id);
        if (!item) return;

        document.getElementById("modalPropTitle").textContent = item.title;
        document.getElementById("modalPropLocation").textContent = item.location;
        document.getElementById("modalPropPrice").textContent = item.price;
        document.getElementById("modalPropImg").src = item.img;
        document.getElementById("modalPropDescription").textContent = item.desc;
        document.getElementById("modalPropTitleBadge").textContent = item.titleDoc;

        currentPanX = -30;
        currentZoom = 1;
        apply360Transform();

        openModal("detailModal");
      }

      function pan360(offset) {
        currentPanX += offset;
        if (currentPanX > 0) currentPanX = 0;
        if (currentPanX < -60) currentPanX = -60;
        apply360Transform();
      }

      function zoom360(factor) {
        currentZoom += factor;
        if (currentZoom < 0.8) currentZoom = 0.8;
        if (currentZoom > 1.6) currentZoom = 1.6;
        apply360Transform();
      }

      function apply360Transform() {
        const img = document.getElementById("modalPropImg");
        if (img) {
          img.style.left = `${currentPanX}%`;
          img.style.transform = `scale(${currentZoom})`;
        }
      }

      function toggleAutoRotate() {
        if (autoRotateInterval) {
          stopAutoRotate();
        } else {
          document.getElementById("autoRotateIcon").style.color = "var(--emerald)";
          autoRotateInterval = setInterval(() => {
            currentPanX -= 1;
            if (currentPanX < -60) currentPanX = 0;
            apply360Transform();
          }, 80);
        }
      }

      function stopAutoRotate() {
        if (autoRotateInterval) {
          clearInterval(autoRotateInterval);
          autoRotateInterval = null;
          const icon = document.getElementById("autoRotateIcon");
          if (icon) icon.style.color = "var(--white)";
        }
      }

      function openScheduleModal() {
        closeModal("detailModal");
        openModal("scheduleModal");
      }

      function handleScheduleSubmit(e) {
        e.preventDefault();
        const date = document.getElementById("inspectionDate").value;
        alert(`Inspection appointment confirmed for ${date}! Assigned agent has been notified.`);
        closeModal("scheduleModal");
      }

      function handleValuationCalculate(e) {
        e.preventDefault();
        document.getElementById("valuationResultBox").style.display = "block";
      }

      function handleLegalCheckSubmit(e) {
        e.preventDefault();
        const fileNo = document.getElementById("titleFileNo").value;
        alert(`Legal search dispatched for Title File '${fileNo}'. Search results will be emailed in 24 hours.`);
        closeModal("legalCheckModal");
      }

      function triggerEscrowFlow() {
        alert("Redirecting to Escrow-backed secure payment contract generator...");
      }

      // Notification Helpers
      function toggleNotifDropdown() {
        document.getElementById("notifDropdown").classList.toggle("active");
      }

      function markNotificationRead(id) {
        document.getElementById(id).classList.add("read");
        updateNotifBadge();
      }

      function markAllNotificationsRead() {
        document.querySelectorAll(".notif-item").forEach(el => el.classList.add("read"));
        updateNotifBadge();
      }

      function updateNotifBadge() {
        const unread = document.querySelectorAll(".notif-item:not(.read)").length;
        const badge = document.getElementById("notifBadge");
        badge.textContent = unread;
        if (unread === 0) badge.style.display = "none";
      }

// The page's inline onclick/onsubmit handlers look these up on window (this file is now an ES module).
Object.assign(window, {
  closeModal, executeAISearch, handleAddProperty, handleArchiveProperty, handleEditProperty,
  handleLegalCheckSubmit, handleScheduleSubmit, handleSearchKeyup, handleValuationCalculate,
  loadProperties, markAllNotificationsRead, markNotificationRead, openDetailModal, openEditPropertyModal,
  openModal, openScheduleModal, pan360, setIntent, showAllProperties, showBookmarkedProperties,
  switchDashTab, toggleAutoRotate, toggleBookmark, toggleNotifDropdown, togglePillFilter,
  triggerEscrowFlow, zoom360,
});
