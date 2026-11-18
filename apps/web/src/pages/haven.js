// Global Modal Functions
      function openModal(id) {
        document.getElementById(id).classList.add("active");
      }

      function closeModal(id) {
        document.getElementById(id).classList.remove("active");
        if (id === 'detailModal') {
          stopAutoRotate();
        }
      }
      
      // Dashboard Tab Switcher
      function switchDashTab(tabId, btnElement) {
        // Hide all tabs
        document.querySelectorAll('.dash-tab-content').forEach(tab => {
          tab.classList.remove('active');
        });
        // Remove active class from all buttons
        document.querySelectorAll('.dash-tab').forEach(btn => {
          btn.classList.remove('active');
        });
        
        // Activate target
        document.getElementById(tabId).classList.add('active');
        btnElement.classList.add('active');
      }

      // Dataset: Verified Properties
      // Added `vendorOwned: true` flag to properties 2 and 3 so they render in the dashboard
      const propertiesDataset = [
        {
          id: 1,
          title: "Luxury 4-Bedroom Semi-Detached Duplex",
          intent: "buy",
          price: "₦120,000,000",
          numericPrice: 120000000,
          location: "Lekki Phase 1, Lagos",
          specs: "4 Beds • 4 Baths • 3 Parking",
          titleDoc: "Certificate of Occupancy",
          titleVerified: true,
          agentVerified: true,
          featured: true,
          img: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80",
          bookmarked: false,
          vendorOwned: false,
          desc: "Fully serviced luxury duplex with automated home system, fitted kitchen, swimming pool access, and registered C of O."
        },
        {
          id: 2,
          title: "Modern 3-Bedroom Serviced Apartment",
          intent: "rent",
          price: "₦4,500,000 / yr",
          numericPrice: 4500000,
          location: "Ikeja GRA, Lagos",
          specs: "3 Beds • 3 Baths • 24/7 Power",
          titleDoc: "Governor's Consent",
          titleVerified: true,
          agentVerified: true,
          featured: false,
          img: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
          bookmarked: false,
          vendorOwned: true,
          desc: "Contemporary apartment in a serene gated estate with round-the-clock security and gym facilities."
        },
        {
          id: 3,
          title: "Waterfront Short-Let Penthouse Suite",
          intent: "shortlet",
          price: "₦150,000 / night",
          numericPrice: 150000,
          location: "Victoria Island, Lagos",
          specs: "2 Beds • Ocean View • High-Speed WiFi",
          titleDoc: "Verified Host Title",
          titleVerified: true,
          agentVerified: true,
          featured: true,
          img: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80",
          bookmarked: false,
          vendorOwned: true,
          desc: "Exclusive short-stay suite featuring panoramic sea views, chef-on-demand, and premium security."
        },
        {
          id: 4,
          title: "Grade-A Commercial Office Floor",
          intent: "buy",
          price: "₦350,000,000",
          numericPrice: 350000000,
          location: "Maitama, Abuja",
          specs: "450 sqm • Open Plan • Elevator",
          titleDoc: "FCT AGIS Title",
          titleVerified: true,
          agentVerified: true,
          featured: false,
          img: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80",
          bookmarked: false,
          vendorOwned: false,
          desc: "Prime corporate commercial tower space with central air conditioning and underground parking."
        },
        {
          id: 5,
          title: "Serene 2-Bedroom Terrace House",
          intent: "rent",
          price: "₦2,800,000 / yr",
          numericPrice: 2800000,
          location: "Yaba, Lagos",
          specs: "2 Beds • 2 Baths • Private Yard",
          titleDoc: "Deed of Assignment",
          titleVerified: true,
          agentVerified: false,
          featured: false,
          img: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80",
          bookmarked: false,
          vendorOwned: false,
          desc: "Charming terrace residential unit suitable for young tech professionals and small families."
        }
      ];

      let activeIntent = "all";
      let activeDetailProp = null;
      let currentEditPropId = null;
      let showingOnlyBookmarks = false;
      let activePillFilter = null;

      // 360 Panorama State Variables
      let currentPanX = -30;
      let currentZoom = 1;
      let autoRotateInterval = null;

      document.addEventListener("DOMContentLoaded", () => {
        renderProperties(propertiesDataset);
        updateBookmarkCount();
        renderDashboardListings();
      });

      // =====================================
      // VENDOR DASHBOARD LISTINGS CONTROLLER
      // =====================================
      function renderDashboardListings() {
        const container = document.getElementById("dashboardListingsContainer");
        container.innerHTML = "";
        
        const vendorProps = propertiesDataset.filter(p => p.vendorOwned);
        document.getElementById("dashTotalListings").textContent = vendorProps.length;

        vendorProps.forEach(prop => {
          const row = document.createElement("div");
          row.className = "listing-row";
          
          row.innerHTML = `
            <div class="listing-row-info">
              <img src="${prop.img}" alt="Prop" class="listing-row-img">
              <div>
                <strong style="font-size: 13px; display: block;">${prop.title}</strong>
                <span style="font-size: 11px; color: #64748b;">${prop.price} • ${prop.location}</span>
              </div>
            </div>
            <div style="display: flex; gap: 12px; align-items: center;">
              <span class="listing-row-status ${prop.titleVerified ? 'status-active' : 'status-pending'}">
                ${prop.titleVerified ? 'Live & Verified' : 'Pending Audit'}
              </span>
              <button onclick="openEditPropertyModal(${prop.id})" style="background: none; border: none; cursor: pointer; color: #64748b;" title="Edit Property">
                <span class="material-symbols-outlined" style="font-size: 18px;">edit</span>
              </button>
            </div>
          `;
          container.appendChild(row);
        });
      }

      // =====================================
      // EDIT PROPERTY LOGIC
      // =====================================
      function openEditPropertyModal(id) {
        const prop = propertiesDataset.find(p => p.id === id);
        if (!prop) return;
        currentEditPropId = id;
        
        // Populate edit form fields
        document.getElementById("editPropTitle").value = prop.title;
        document.getElementById("editPropIntent").value = prop.intent;
        document.getElementById("editPropPrice").value = prop.numericPrice;
        document.getElementById("editPropLocation").value = prop.location;
        document.getElementById("editPropDesc").value = prop.desc;
        
        // Extract Bed/Bath digits safely
        const bedsMatch = prop.specs.match(/(\d+)\s*Beds?/i);
        const bathsMatch = prop.specs.match(/(\d+)\s*Baths?/i);
        document.getElementById("editPropBeds").value = bedsMatch ? bedsMatch[1] : "";
        document.getElementById("editPropBaths").value = bathsMatch ? bathsMatch[1] : "";

        // Switch Modals
        closeModal("vendorDashboardModal");
        openModal("editPropertyModal");
      }

      function handleEditProperty(e) {
        e.preventDefault();
        const prop = propertiesDataset.find(p => p.id === currentEditPropId);
        if (!prop) return;

        // Save updated data
        prop.title = document.getElementById("editPropTitle").value;
        prop.intent = document.getElementById("editPropIntent").value;
        
        const price = document.getElementById("editPropPrice").value;
        prop.price = `₦${Number(price).toLocaleString()}`;
        prop.numericPrice = Number(price);
        
        prop.location = document.getElementById("editPropLocation").value;
        prop.desc = document.getElementById("editPropDesc").value;

        const beds = document.getElementById("editPropBeds").value || "0";
        const baths = document.getElementById("editPropBaths").value || "0";
        prop.specs = `${beds} Beds • ${baths} Baths`;

        // Update UI grids
        filterProperties();
        renderDashboardListings();

        // Switch Modals back
        closeModal("editPropertyModal");
        openModal("vendorDashboardModal");
        
        alert(`Property '${prop.title}' updated successfully.`);
      }

      // =====================================
      // ADD NEW PROPERTY LOGIC
      // =====================================
      function handleAddProperty(e) {
        e.preventDefault();
        const title = document.getElementById("newPropTitle").value;
        const price = document.getElementById("newPropPrice").value;
        const location = document.getElementById("newPropLocation").value;
        const intent = document.getElementById("newPropIntent").value;
        const beds = document.getElementById("newPropBeds").value || "0";
        const baths = document.getElementById("newPropBaths").value || "0";

        const newProp = {
          id: Date.now(),
          title: title,
          intent: intent,
          price: `₦${Number(price).toLocaleString()}`,
          numericPrice: Number(price),
          location: location,
          specs: `${beds} Beds • ${baths} Baths`,
          titleDoc: "Title Audit Pending",
          titleVerified: false,
          agentVerified: true,
          featured: false,
          img: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
          bookmarked: false,
          vendorOwned: true, // Ties to dashboard
          desc: document.getElementById("newPropDesc").value || "Newly listed property submitted via Kapita Real Estate Owner Portal."
        };

        // Add to main grid
        propertiesDataset.unshift(newProp);
        
        // Re-render UI grids
        filterProperties();
        renderDashboardListings();
        
        closeModal("addPropertyModal");
        switchDashTab('dashListings', document.querySelectorAll('.dash-tab')[1]);
        openModal("vendorDashboardModal");
        
        alert(`Property '${title}' submitted successfully. It is currently under Title Verification and will go live shortly.`);
        e.target.reset();
      }

      // Filter & Render Property Grid
      function renderProperties(items) {
        const grid = document.getElementById("propertyGrid");
        grid.innerHTML = "";

        if (items.length === 0) {
          grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; color: #64748b;">
              <span class="material-symbols-outlined" style="font-size: 48px; margin-bottom: 8px;">home_work</span>
              <p>No verified properties found matching your search parameters.</p>
            </div>
          `;
          return;
        }

        items.forEach(item => {
          const card = document.createElement("div");
          card.className = `property-card ${item.featured ? 'featured' : ''}`;
          
          card.innerHTML = `
            ${item.featured ? '<span class="featured-badge">FEATURED</span>' : ''}
            <button class="btn-card-bookmark ${item.bookmarked ? 'bookmarked' : ''}" onclick="event.stopPropagation(); toggleBookmark(${item.id})">
              <span class="material-symbols-outlined" style="font-size: 18px;">bookmark</span>
            </button>
            <div class="property-img-wrapper" onclick="openDetailModal(${item.id})">
              <img src="${item.img}" class="property-img" alt="${item.title}">
              <div class="virtual-tour-pill">
                <span class="material-symbols-outlined" style="font-size: 14px;">360</span>
                <span>360° Tour</span>
              </div>
            </div>
            <div class="property-info-body">
              <div class="property-price">${item.price}</div>
              <div class="property-title">${item.title}</div>
              <div class="property-location">
                <span class="material-symbols-outlined" style="font-size: 14px;">location_on</span>
                <span>${item.location}</span>
              </div>
              <div class="property-specs-row">
                <span class="spec-item">
                  <span class="material-symbols-outlined" style="font-size: 16px;">bed</span>
                  ${item.specs}
                </span>
              </div>
              <div class="badges-row">
                <span class="badge-title-verified">
                  <span class="material-symbols-outlined" style="font-size: 12px;">verified</span>
                  ${item.titleDoc}
                </span>
                ${item.agentVerified ? '<span class="badge-agent-verified"><span class="material-symbols-outlined" style="font-size: 12px;">badge</span>Verified Agent</span>' : ''}
              </div>
              <div class="card-footer-actions">
                <button class="btn-card-primary" onclick="openDetailModal(${item.id})">Inspect & View</button>
                <button class="btn-card-secondary" onclick="openScheduleModal()">Book Viewing</button>
              </div>
            </div>
          `;
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

      function toggleBookmark(id) {
        const item = propertiesDataset.find(p => p.id === id);
        if (item) {
          item.bookmarked = !item.bookmarked;
          updateBookmarkCount();
          filterProperties();
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

        activeDetailProp = item;
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