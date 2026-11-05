function openModal(id) {
      document.getElementById(id).classList.add("active");
    }

    function closeModal(id) {
      document.getElementById(id).classList.remove("active");
    }

    // Helper to generate initials (max 2 letters) and a consistent color per category
    function getInitials(name) {
      const parts = name.replace(/[^a-zA-Z0-9 ]/g, "").split(" ");
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return name.substring(0, 2).toUpperCase();
    }

    function getCategoryColor(category) {
      switch(category) {
        case 'Hospitals': return '#008755'; // Deep emerald
        case 'Government': return '#267691'; // Blue-grey
        case 'Schools': return '#d97706'; // Warm amber
        default: return '#FF6A00'; // Brand orange
      }
    }

    let userCurrentLocation = "Lagos, NG";

    function detectUserLocation() {
      if (navigator.geolocation) {
        document.getElementById("currentLocationLabel").textContent = "Locating...";
        navigator.geolocation.getCurrentPosition(
          (position) => {
            // Simulated reverse geocoding approximation for demonstration
            userCurrentLocation = "Lagos, NG (GPS Active)";
            document.getElementById("currentLocationLabel").textContent = userCurrentLocation;
            document.getElementById("routeCurrentLocDisplay").textContent = userCurrentLocation;
            alert("Current GPS location acquired successfully!");
          },
          (error) => {
            userCurrentLocation = "Lagos, NG";
            document.getElementById("currentLocationLabel").textContent = userCurrentLocation;
            alert("Geolocation permission denied or unavailable. Defaulting to Lagos, NG.");
          },
          { timeout: 10000 }
        );
      } else {
        alert("Geolocation is not supported by your browser.");
      }
    }

    let directoryListings = [
      {
        id: 1,
        name: "St. Nicholas Hospital",
        category: "Hospitals",
        categoryLabel: "Hospital & Maternity Care",
        verified: true,
        sponsored: true,
        rating: 4.8,
        reviewCount: 142,
        phone: "+234 1 280 0600",
        address: "57 Campbell Street, Lagos Island, Lagos",
        distance: "1.2 km",
        timeEst: "6 mins drive",
        isOpen: true,
        hours: "Open 24 Hours",
        services: ["Maternity Care", "Emergency ER", "Pediatrics", "Surgery"],
        bookmarked: false,
        reviews: [
          { author: "Dr. Funke Akindele", stars: 5, text: "Excellent maternity ward services and prompt emergency response." }
        ],
        turns: [
          "Head south on Campbell Street towards Catholic Mission Street (400m)",
          "Turn right at the junction onto Broad Street (600m)",
          "Destination will be on your left"
        ]
      },
      {
        id: 2,
        name: "Federal Internal Revenue Service (FIRS)",
        category: "Government",
        categoryLabel: "Government Tax Office",
        verified: true,
        sponsored: false,
        rating: 4.2,
        reviewCount: 89,
        phone: "+234 9 460 2000",
        address: "17B Awolowo Road, Ikoyi, Lagos",
        distance: "2.5 km",
        timeEst: "11 mins drive",
        isOpen: true,
        hours: "Mon - Fri: 8:00 AM - 4:00 PM",
        services: ["Tax Filing", "TIN Generation", "Corporate Compliance"],
        bookmarked: false,
        reviews: [
          { author: "Efe Money Ltd", stars: 4, text: "Quick tax clearance processing via verified online portal." }
        ],
        turns: [
          "Take Falomo Bridge towards Awolowo Road (1.2 km)",
          "Continue straight past Ikoyi Club (800m)",
          "FIRS Building is on the right"
        ]
      },
      {
        id: 3,
        name: "Lagos State University Teaching Hospital (LASUTH)",
        category: "Hospitals",
        categoryLabel: "Tertiary Healthcare & Research",
        verified: true,
        sponsored: true,
        rating: 4.6,
        reviewCount: 230,
        phone: "+234 802 314 9198",
        address: "1 Oba Akinjobi Way, Ikeja, Lagos",
        distance: "4.1 km",
        timeEst: "14 mins drive",
        isOpen: true,
        hours: "Open 24 Hours",
        services: ["Maternity ER", "Cardiology", "Diagnostics"],
        bookmarked: false,
        reviews: [
          { author: "Bisi Adebayo", stars: 5, text: "Top-tier emergency doctors available 24/7." }
        ],
        turns: [
          "Take Mobolaji Bank Anthony Way towards Ikeja (2.8 km)",
          "Turn left onto Oba Akinjobi Way (1.3 km)",
          "LASUTH Main Gate is ahead"
        ]
      },
      {
        id: 4,
        name: "Yaba College of Technology (YABATECH)",
        category: "Schools",
        categoryLabel: "Higher Education & Tech Institute",
        verified: true,
        sponsored: false,
        rating: 4.5,
        reviewCount: 310,
        phone: "+234 1 212 1234",
        address: "Herbert Macaulay Way, Yaba, Lagos",
        distance: "3.0 km",
        timeEst: "9 mins drive",
        isOpen: true,
        hours: "Mon - Fri: 8:00 AM - 5:00 PM",
        services: ["Computer Science", "Engineering", "Short Tech Courses"],
        bookmarked: false,
        reviews: [],
        turns: [
          "Head North on Herbert Macaulay Way (2.2 km)",
          "Turn right at Yaba Bus Stop roundabout (800m)",
          "Arrive at YABATECH Campus Gate"
        ]
      },
      {
        id: 5,
        name: "Medplus 24/7 Pharmacy",
        category: "Businesses",
        categoryLabel: "Pharmacy & Wellness Center",
        verified: true,
        sponsored: false,
        rating: 4.9,
        reviewCount: 95,
        phone: "+234 809 111 2233",
        address: "Adetokunbo Ademola St, Victoria Island",
        distance: "0.8 km",
        timeEst: "3 mins drive",
        isOpen: true,
        hours: "Open 24 Hours",
        services: ["Prescriptions", "Health Checks", "Vaccinations"],
        bookmarked: false,
        reviews: [],
        turns: [
          "Head east on Ahmadu Bello Way (500m)",
          "Turn left onto Adetokunbo Ademola Street (300m)",
          "Medplus is located beside Eko Hotel"
        ]
      },
      {
        id: 6,
        name: "Apex Innovation & Tech Hub",
        category: "Businesses",
        categoryLabel: "Co-Working Space & Incubator",
        verified: true,
        sponsored: true,
        rating: 4.7,
        reviewCount: 68,
        phone: "+234 812 345 6789",
        address: "22 Commercial Avenue, Sabo, Yaba, Lagos",
        distance: "1.5 km",
        timeEst: "5 mins drive",
        isOpen: true,
        hours: "Mon - Sat: 8:00 AM - 9:00 PM",
        services: ["High-speed Fiber WiFi", "Private Offices", "Meeting Rooms"],
        bookmarked: false,
        reviews: [
          { author: "Tunde Ednut", stars: 5, text: "Great tech ecosystem with reliable power and fiber internet." }
        ],
        turns: [
          "Drive along Commercial Avenue (1.0 km)",
          "Pass Sabo Market junction (500m)",
          "Apex Hub is on the 3rd floor of the Glass Building"
        ]
      },
      {
        id: 7,
        name: "National Identity Management Commission",
        category: "Government",
        categoryLabel: "National ID Enrollment Center",
        verified: true,
        sponsored: false,
        rating: 4.0,
        reviewCount: 112,
        phone: "+234 1 271 6234",
        address: "Plot 1, Obafemi Awolowo Way, Ikeja, Lagos",
        distance: "5.2 km",
        timeEst: "18 mins drive",
        isOpen: false,
        hours: "Mon - Fri: 8:00 AM - 3:30 PM",
        services: ["NIN Slip Printing", "Biometric Modification", "Identity Verification"],
        bookmarked: false,
        reviews: [],
        turns: [
          "Take Ikeja Along Expressway (3.5 km)",
          "Turn onto Obafemi Awolowo Way (1.7 km)",
          "NIMC State Headquarters is on the left"
        ]
      },
      {
        id: 8,
        name: "Corona Schools Trust Council",
        category: "Schools",
        categoryLabel: "Primary & Secondary Education",
        verified: true,
        sponsored: false,
        rating: 4.9,
        reviewCount: 76,
        phone: "+234 1 270 3101",
        address: "6 Mekunwen Road, Ikoyi, Lagos",
        distance: "3.8 km",
        timeEst: "12 mins drive",
        isOpen: true,
        hours: "Mon - Fri: 7:30 AM - 4:00 PM",
        services: ["British Curriculum", "STEM Education", "Sports Facility"],
        bookmarked: false,
        reviews: [],
        turns: [
          "Head south towards Ikoyi Crescent (2.0 km)",
          "Turn right onto Mekunwen Road (1.8 km)",
          "School entrance on the right"
        ]
      }
    ];

    let activeCategory = 'All';
    let currentNavMode = 'explore';
    let currentDirectoryView = 'grid'; // 'grid' or 'list'
    let currentSelectedRating = 4;
    let activeDetailListing = null;
    let activeRouteListing = null;

    document.addEventListener("DOMContentLoaded", () => {
      renderDirectoryGrid(directoryListings);
      populateReportDropdown();
    });

    function setDirectoryView(viewMode) {
      currentDirectoryView = viewMode;
      const gridEl = document.getElementById("directoryGrid");
      const gridBtn = document.getElementById("gridViewBtn");
      const listBtn = document.getElementById("listViewBtn");

      if (viewMode === 'grid') {
        gridEl.classList.remove('list-view');
        gridBtn.classList.add('active');
        listBtn.classList.remove('active');
      } else {
        gridEl.classList.add('list-view');
        listBtn.classList.add('active');
        gridBtn.classList.remove('active');
      }
    }

    function renderDirectoryGrid(listings) {
      const grid = document.getElementById("directoryGrid");
      grid.innerHTML = "";

      if (listings.length === 0) {
        grid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #64748b;">
            <span class="material-symbols-outlined" style="font-size: 48px; margin-bottom: 8px;">search_off</span>
            <p>No verified listings found matching criteria.</p>
          </div>
        `;
        return;
      }

      listings.forEach(item => {
        const card = document.createElement("div");
        card.className = `directory-card ${item.sponsored ? 'sponsored' : ''}`;
        const initials = getInitials(item.name);
        const logoColor = getCategoryColor(item.category);
        
        card.innerHTML = `
          ${item.sponsored ? '<span class="sponsored-badge">⭐</span>' : ''}
          <div class="card-top-row" onclick="openDetailModal(${item.id})">
            <div class="entity-logo-box" style="background-color: ${logoColor};">
              ${initials}
            </div>
            <div class="entity-details-col">
              <h3 class="entity-name">
                ${item.name}
                ${item.verified ? '<span class="material-symbols-outlined verified-icon" title="Verified Record">verified</span>' : ''}
              </h3>
              <span class="entity-category">${item.categoryLabel}</span>
              <div class="rating-row">
                <span class="stars-fill">★ ${item.rating}</span>
                <span class="review-count">(${item.reviewCount} reviews)</span>
              </div>
            </div>
          </div>

          <div class="info-list" onclick="openDetailModal(${item.id})">
            <div class="info-item">
              <span class="material-symbols-outlined icon">location_on</span>
              <span>${item.address} • <strong>${item.distance}</strong></span>
            </div>
            <div class="info-item">
              <span class="material-symbols-outlined icon">schedule</span>
              <span class="${item.isOpen ? 'status-open' : 'status-closed'}">
                ${item.isOpen ? '● Open Now' : '● Closed'}
              </span>
              <span style="color: #64748b; font-size: 11px;">(${item.hours})</span>
            </div>
          </div>

          <div class="card-actions-bar">
            <a href="tel:${item.phone}" class="btn-card-action" onclick="event.stopPropagation();">
              <span class="material-symbols-outlined" style="font-size: 16px;">call</span>
              Call
            </a>
            <button class="btn-card-action" style="background: var(--black); color: var(--emerald); border-color: var(--black);" onclick="event.stopPropagation(); openRouteModal(${item.id});">
              <span class="material-symbols-outlined" style="font-size: 16px;">directions</span>
              Route
            </button>
            <button class="btn-card-action" onclick="event.stopPropagation(); openDetailModal(${item.id});">
              <span class="material-symbols-outlined" style="font-size: 16px;">info</span>
              Details
            </button>
            <button class="btn-bookmark ${item.bookmarked ? 'bookmarked' : ''}" onclick="event.stopPropagation(); toggleBookmark(${item.id});" title="Bookmark Listing">
              <span class="material-symbols-outlined" style="font-size: 18px;">bookmark</span>
            </button>
          </div>
        `;
        grid.appendChild(card);
      });
    }

    function switchNavMode(mode, buttonEl) {
      currentNavMode = mode;
      document.querySelectorAll('.market-nav-btn').forEach(b => b.classList.remove('active'));
      if(buttonEl) buttonEl.classList.add('active');

      const exploreSec = document.getElementById('exploreSection');
      const dashSec = document.getElementById('dashboardSection');

      if (mode === 'explore' || mode === 'bookmarks') {
        exploreSec.classList.remove('hidden');
        dashSec.classList.add('hidden');
        filterAndRenderListings();
      } else if (mode === 'dashboard') {
        exploreSec.classList.add('hidden');
        dashSec.classList.remove('hidden');
      }
    }

    function setCategoryFilter(category, buttonEl) {
      activeCategory = category;
      document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
      buttonEl.classList.add('active');
      filterAndRenderListings();
    }

    function filterAndRenderListings() {
      const searchTerm = document.getElementById("directorySearchInput").value.toLowerCase();

      let filtered = directoryListings.filter(item => {
        const matchesCategory = (activeCategory === 'All') || (item.category === activeCategory);
        const matchesSearch = item.name.toLowerCase().includes(searchTerm) ||
                              item.categoryLabel.toLowerCase().includes(searchTerm) ||
                              item.services.some(s => s.toLowerCase().includes(searchTerm));
        const matchesNav = (currentNavMode === 'bookmarks') ? item.bookmarked : true;

        return matchesCategory && matchesSearch && matchesNav;
      });

      filtered.sort((a, b) => {
        if (a.sponsored && !b.sponsored) return -1;
        if (!a.sponsored && b.sponsored) return 1;
        return 0;
      });

      renderDirectoryGrid(filtered);
    }

    function executeAISearch() {
      const query = document.getElementById("directorySearchInput").value.toLowerCase();
      const feedbackBanner = document.getElementById("aiParsedFeedback");
      const feedbackText = document.getElementById("aiParsedText");

      if (!query.trim()) {
        feedbackBanner.classList.remove("active");
        filterAndRenderListings();
        return;
      }

      feedbackBanner.classList.add("active");
      currentNavMode = 'explore';
      document.querySelectorAll('.market-nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.market-nav-btn:first-child').classList.add('active');
      document.getElementById('exploreSection').classList.remove('hidden');
      document.getElementById('dashboardSection').classList.add('hidden');

      if (query.includes("maternity") || query.includes("hospital") || query.includes("doctor")) {
        activeCategory = 'Hospitals';
        feedbackText.textContent = `AI Parsed Intent (near ${userCurrentLocation}): Filtered for Medical, Hospitals & Emergency facilities open now.`;
        updateCategoryPillsUI('Hospitals');
      } else if (query.includes("school") || query.includes("tech") || query.includes("institute")) {
        activeCategory = 'Schools';
        feedbackText.textContent = `AI Parsed Intent (near ${userCurrentLocation}): Filtered for Educational Institutes & Certified Academies.`;
        updateCategoryPillsUI('Schools');
      } else if (query.includes("tax") || query.includes("government") || query.includes("firs")) {
        activeCategory = 'Government';
        feedbackText.textContent = `AI Parsed Intent (near ${userCurrentLocation}): Filtered for Official Public Service & Government Agencies.`;
        updateCategoryPillsUI('Government');
      } else {
        feedbackText.textContent = `AI Parsed Intent (near ${userCurrentLocation}): Performing semantic entity lookup for "${query}"`;
      }

      filterAndRenderListings();
    }

    function handleSearchKeyup(event) {
      if (event.key === "Enter") {
        executeAISearch();
      } else {
        filterAndRenderListings();
      }
    }

    function updateCategoryPillsUI(catName) {
      document.querySelectorAll('.cat-pill').forEach(b => {
        if (b.textContent.includes(catName) || (catName === 'All' && b.textContent.includes('All'))) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
    }

    function toggleBookmark(id) {
      const item = directoryListings.find(l => l.id === id);
      if (item) {
        item.bookmarked = !item.bookmarked;
        filterAndRenderListings();
      }
    }

    function openDetailModal(id) {
      const item = directoryListings.find(l => l.id === id);
      if (!item) return;

      activeDetailListing = item;
      const initials = getInitials(item.name);
      const logoColor = getCategoryColor(item.category);

      const logoBox = document.getElementById("modalLogo");
      logoBox.textContent = initials;
      logoBox.style.backgroundColor = logoColor;

      document.getElementById("modalTitle").textContent = item.name;
      document.getElementById("modalCategory").textContent = item.categoryLabel;
      document.getElementById("modalAddress").textContent = item.address;
      document.getElementById("modalPhone").textContent = item.phone;
      document.getElementById("modalHours").textContent = item.hours;

      const servicesBox = document.getElementById("modalServices");
      servicesBox.innerHTML = item.services.map(s => `
        <span style="font-size: 11px; background: var(--surface-gray); border: 1px solid var(--border-color); padding: 4px 10px; border-radius: 8px; font-weight: 600;">${s}</span>
      `).join('');

      renderModalReviews(item);
      openModal("detailModal");
    }

    function openRouteModal(id) {
      const item = directoryListings.find(l => l.id === id);
      if (!item) return;

      activeRouteListing = item;
      document.getElementById("routeModalTitle").textContent = `Route to ${item.name}`;
      document.getElementById("routeModalSub").textContent = item.address;
      document.getElementById("routeDistanceTime").textContent = `${item.timeEst} (${item.distance})`;

      const turnList = document.getElementById("turnByTurnList");
      if (item.turns && item.turns.length > 0) {
        turnList.innerHTML = item.turns.map((step, idx) => `
          <div style="display: flex; gap: 10px; align-items: flex-start; background: var(--surface-gray); padding: 8px 12px; border-radius: 8px;">
            <span style="background: var(--black); color: var(--emerald); font-weight: 800; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0;">${idx + 1}</span>
            <span>${step}</span>
          </div>
        `).join('');
      } else {
        turnList.innerHTML = `<p style="color: #64748b;">Turn-by-turn guidance available upon launching GPS.</p>`;
      }

      openModal("routeModal");
    }

    function setTransitMode(mode) {
      document.querySelectorAll('#routeModal .transit-mode-btn').forEach(b => b.classList.remove('active'));
      if (mode === 'drive') document.getElementById('modeDrive').classList.add('active');
      if (mode === 'transit') document.getElementById('modeTransit').classList.add('active');
      if (mode === 'walk') document.getElementById('modeWalk').classList.add('active');

      if (activeRouteListing) {
        let factor = mode === 'walk' ? 4 : mode === 'transit' ? 1.5 : 1;
        let mins = Math.round(parseInt(activeRouteListing.timeEst) * factor);
        document.getElementById("routeDistanceTime").textContent = `${mins} mins (${activeRouteListing.distance})`;
      }
    }

    function launchExternalMaps() {
      if (activeRouteListing) {
        const query = encodeURIComponent(`${activeRouteListing.name}, ${activeRouteListing.address}`);
        window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
      }
    }

    function saveBillingSettings() {
      const cycle = document.getElementById("billingCycleSelect").value;
      alert(`Billing preferences updated successfully! Current Plan set to: ${cycle.toUpperCase()}`);
      closeModal('billingModal');
    }

    function renderModalReviews(item) {
      const reviewsList = document.getElementById("modalReviewsList");
      if (!item.reviews || item.reviews.length === 0) {
        reviewsList.innerHTML = `<p style="font-size: 11px; color: #64748b;">No reviews submitted yet. Be the first to leave a review!</p>`;
        return;
      }

      reviewsList.innerHTML = item.reviews.map(r => `
        <div class="review-card">
          <div class="review-author">
            <span>${r.author}</span>
            <span style="color: #f59e0b;">★ ${r.stars}</span>
          </div>
          <p style="color: #475569;">${r.text}</p>
        </div>
      `).join('');
    }

    function setRating(stars) {
      currentSelectedRating = stars;
      const starEls = document.querySelectorAll("#starRatingRow span");
      starEls.forEach((el, index) => {
        if (index < stars) {
          el.classList.add("selected");
        } else {
          el.classList.remove("selected");
        }
      });
    }

    function submitReview() {
      const text = document.getElementById("reviewCommentInput").value;
      if (!text.trim()) {
        alert("Please enter review feedback before posting.");
        return;
      }

      if (activeDetailListing) {
        activeDetailListing.reviews.unshift({
          author: "Verified Resident",
          stars: currentSelectedRating,
          text: text
        });
        activeDetailListing.reviewCount += 1;
        document.getElementById("reviewCommentInput").value = "";
        renderModalReviews(activeDetailListing);
        filterAndRenderListings();
        alert("Review submitted successfully!");
      }
    }

    function handleBusinessSubmit(e) {
      e.preventDefault();

      const name = document.getElementById("newEntityName").value;
      const category = document.getElementById("newCategory").value;
      const phone = document.getElementById("newPhone").value;
      const address = document.getElementById("newAddress").value;
      const tier = document.getElementById("newTier").value;

      const newListing = {
        id: Date.now(),
        name: name,
        category: category,
        categoryLabel: `${category} & Verified Service`,
        verified: true,
        sponsored: tier === 'sponsored',
        rating: 5.0,
        reviewCount: 1,
        phone: phone,
        address: address,
        distance: "0.5 km",
        timeEst: "3 mins drive",
        isOpen: true,
        hours: "Mon - Sat: 8:00 AM - 6:00 PM",
        services: ["General Service", "Verified Partner"],
        bookmarked: false,
        reviews: [
          { author: "Kapita Verification Team", stars: 5, text: "Official business profile registration verified." }
        ],
        turns: [
          "Drive along main access road (300m)",
          "Arrive at destination on the right"
        ]
      };

      directoryListings.unshift(newListing);
      filterAndRenderListings();
      populateReportDropdown();
      closeModal("addBusinessModal");
      document.getElementById("addBusinessForm").reset();

      alert(`Success! '${name}' has been added to the Kapita Verified Directory.`);
    }

    function populateReportDropdown() {
      const select = document.getElementById("reportEntitySelect");
      select.innerHTML = directoryListings.map(item => `
        <option value="${item.name}">${item.name}</option>
      `).join('');
    }

    function submitReport() {
      const selected = document.getElementById("reportEntitySelect").value;
      const notes = document.getElementById("reportNotes").value;

      if (!notes.trim()) {
        alert("Please provide the corrected information before submitting.");
        return;
      }

      alert(`Report submitted successfully for '${selected}'. The AI Scanner and validation team will verify and update this record shortly.`);
      closeModal("reportModal");
      document.getElementById("reportNotes").value = "";
    }

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
      const unreadCount = document.querySelectorAll(".notif-item:not(.read)").length;
      const badge = document.getElementById("notifBadge");
      badge.textContent = unreadCount;
      if (unreadCount === 0) {
        badge.style.display = "none";
      } else {
        badge.style.display = "flex";
      }
    }