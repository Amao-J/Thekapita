 // State Flags
    let isOnline = true;
    let requestTimer = null;
    let countdownValue = 15;
    
    // Trip States: 'idle' -> 'arriving' -> 'arrived' -> 'in_transit' -> 'completed'
    let currentTripState = 'idle';

    // 1. Online / Offline Toggle Logic
    function toggleOnlineState() {
      isOnline = !isOnline;
      const togglePill = document.getElementById('driverOnlineToggle');
      const statusLabel = document.getElementById('statusLabel');
      const banner = document.getElementById('statusBanner');
      const bannerTitle = document.getElementById('statusBannerTitle');
      const bannerSub = document.getElementById('statusBannerSub');

      if (isOnline) {
        togglePill.classList.add('online');
        statusLabel.textContent = 'ONLINE';
        banner.className = 'status-alert-banner online';
        bannerTitle.textContent = 'You are Online & Visible';
        bannerSub.textContent = 'Ready to receive nearby ride & package dispatch requests';
      } else {
        togglePill.classList.remove('online');
        statusLabel.textContent = 'OFFLINE';
        banner.className = 'status-alert-banner offline';
        bannerTitle.textContent = 'You are currently Offline';
        bannerSub.textContent = 'Switch status online to start accepting trips';
      }
    }

    // 2. Modals Control
    function openModal(id) {
      document.getElementById(id).classList.add('active');
    }

    function closeModal(id) {
      document.getElementById(id).classList.remove('active');
    }

    // 3. Dispatch Request Simulation & Timer Countdown
    function triggerSimulatedRequest() {
      if (!isOnline) {
        alert('Please toggle your status ONLINE first before receiving dispatch alerts.');
        return;
      }
      openModal('incomingRequestModal');
      startCountdownTimer();
    }

    function startCountdownTimer() {
      countdownValue = 15;
      document.getElementById('countdownSecs').textContent = countdownValue;
      document.getElementById('timerProgressFill').style.width = '100%';

      if (requestTimer) clearInterval(requestTimer);

      requestTimer = setInterval(() => {
        countdownValue--;
        document.getElementById('countdownSecs').textContent = countdownValue;
        let percent = (countdownValue / 15) * 100;
        document.getElementById('timerProgressFill').style.width = percent + '%';

        if (countdownValue <= 0) {
          clearInterval(requestTimer);
          declineRequest();
        }
      }, 1000);
    }

    function declineRequest() {
      if (requestTimer) clearInterval(requestTimer);
      closeModal('incomingRequestModal');
    }

    function acceptRequest() {
      if (requestTimer) clearInterval(requestTimer);
      closeModal('incomingRequestModal');

      currentTripState = 'arriving';
      document.getElementById('activeTripCard').classList.add('visible');
      updateTripUI();
    }

    // 4. Trip Workflow Progression
    function advanceTripState() {
      if (currentTripState === 'arriving') {
        currentTripState = 'arrived';
      } else if (currentTripState === 'arrived') {
        const otpVal = document.getElementById('otpCodeInput').value;
        if (!otpVal || otpVal.length < 4) {
          alert('Please enter and verify the 4-digit PIN / OTP code from rider first.');
          return;
        }
        currentTripState = 'in_transit';
      } else if (currentTripState === 'in_transit') {
        currentTripState = 'completed';
      }

      updateTripUI();
    }

    function verifyOTP() {
      const otpVal = document.getElementById('otpCodeInput').value;
      if (otpVal.length === 4) {
        alert('PIN Verified! Starting trip...');
        document.getElementById('otpVerifyBox').classList.add('hidden');
        currentTripState = 'in_transit';
        updateTripUI();
      } else {
        alert('Invalid PIN code format. Please check with rider.');
      }
    }

    function updateTripUI() {
      const btnText = document.getElementById('tripBtnText');
      const otpBox = document.getElementById('otpVerifyBox');
      const typePill = document.getElementById('activeTripTypePill');

      if (currentTripState === 'arriving') {
        typePill.textContent = 'NAVIGATING TO PICKUP';
        btnText.textContent = 'I Have Arrived at Pickup';
        otpBox.classList.add('hidden');
      } else if (currentTripState === 'arrived') {
        typePill.textContent = 'ARRIVED • AWAITING RIDER';
        btnText.textContent = 'Start Trip';
        otpBox.classList.remove('hidden');
      } else if (currentTripState === 'in_transit') {
        typePill.textContent = 'TRIP IN TRANSIT';
        btnText.textContent = 'Complete & End Trip';
        otpBox.classList.add('hidden');
      } else if (currentTripState === 'completed') {
        openModal('tripSummaryModal');
      }
    }

    function finishTripWorkflow() {
      closeModal('tripSummaryModal');
      document.getElementById('activeTripCard').classList.remove('visible');
      currentTripState = 'idle';
      document.getElementById('otpCodeInput').value = '';
    }

    // 5. Cashout Payout Execution
    function processCashout() {
      const amount = document.getElementById('payoutAmountInput').value;
      alert(`Payout of ₦${amount} successfully processed! Funds sent to GTBank.`);
      closeModal('payoutModal');
    }

    // 6. Navigation Tab Switcher
    function switchTab(tabId, element) {
      document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden-tab');
      });
      document.getElementById(tabId).classList.remove('hidden-tab');

      if (element) {
        document.querySelectorAll('.market-nav-btn').forEach(btn => btn.classList.remove('active'));
        element.classList.add('active');
      } else if (tabId === 'profileTab') {
        // If triggered from header, highlight correct nav btn manually
        document.querySelectorAll('.market-nav-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector('.market-nav-btn:last-child').classList.add('active');
      }
    }

    function recenterMap() {
      const marker = document.getElementById('driverMapMarker');
      marker.style.transform = 'translate(-50%, -50%) scale(1.25)';
      setTimeout(() => {
        marker.style.transform = 'translate(-50%, -50%) scale(1)';
      }, 300);
    }

    // 7. Profile Save Function
    function saveProfileSettings(event) {
      event.preventDefault(); // Prevents page reload
      alert('Profile details have been updated and securely saved.');
    }