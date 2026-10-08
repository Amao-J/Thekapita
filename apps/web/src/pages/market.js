/* ==========================================================================
   THEKAPITA MARKETPLACE ENGINE (WITH REAL NETWORK FEEDBACK & API INTEGRATION)
   ========================================================================== */
import { addItem, subscribe as cartSubscribe, clearCart as clearCartState, getItems, getTotal } from '../state/cart.js';
import { request, ApiError } from '../api/client.js';
import { showToast } from './app.js';

let currentCategory = 'all';
let onlyVerified = false;

/* --------------------------------------------------------------------------
   0. REAL NETWORK LOADING & SKELETON RENDERER
   -------------------------------------------------------------------------- */
async function fetchAndRenderProducts() {
  const grid = document.getElementById('marketProductsGrid');
  if (!grid) return;

  // Render 4 Skeleton Shimmer Cards while fetching live data
  grid.innerHTML = Array(4).fill(0).map(() => `
    <div class="product-card skeleton-card">
      <div class="skeleton-img"></div>
      <div class="product-details">
        <div class="skeleton-text short"></div>
        <div class="skeleton-text long"></div>
        <div class="skeleton-text medium"></div>
      </div>
    </div>
  `).join('');

  try {
    // Live API call with timeout & offline error catch via client.js
    const products = await request('/marketplace/products');
    renderProductCards(products);
  } catch (err) {
    // Real Network Error Fallback Card with Retry Button
    const errorMsg = err instanceof ApiError ? err.message : 'Could not load products. Please check your network connection.';
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 48px 16px; background: #ffffff; border-radius: 18px; border: 1px solid #e2e8f0;">
        <span class="material-symbols-outlined" style="font-size: 48px; color: #ff4d4d; margin-bottom: 12px;">cloud_off</span>
        <h3 style="font-family: 'Bricolage Grotesque', sans-serif; font-size: 18px; color: #0f172a; margin: 0 0 6px 0;">Unable to connect to Marketplace API</h3>
        <p style="font-size: 13px; color: #64748b; margin: 0 0 16px 0;">${errorMsg}</p>
        <button class="filter-pill-btn active" onclick="fetchAndRenderProducts()" style="padding: 10px 20px;">
          <span class="material-symbols-outlined icon">refresh</span> Try Again
        </button>
      </div>
    `;
    if (window.showToast) {
      window.showToast(errorMsg, 'error');
    }
  }
}

function renderProductCards(products) {
  const grid = document.getElementById('marketProductsGrid');
  if (!grid) return;

  if (!products || products.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 48px 16px; background: #ffffff; border-radius: 18px; border: 1px solid #e2e8f0;">
        <span class="material-symbols-outlined" style="font-size: 48px; color: #94a3b8; margin-bottom: 12px;">storefront</span>
        <h3 style="font-family: 'Bricolage Grotesque', sans-serif; font-size: 18px; color: #0f172a; margin: 0 0 6px 0;">No products found</h3>
      </div>
    `;
    return;
  }

  grid.innerHTML = products.map(p => `
    <div class="product-card" data-category="${p.category}" data-price="${p.price}" data-verified="${p.is_verified ? 'true' : 'false'}">
      <div class="product-img-wrapper">
        <img src="${p.image_url}" alt="${p.title}" loading="lazy">
        <button class="product-fav-btn" onclick="toggleWishlist(this)"><span class="material-symbols-outlined">favorite</span></button>
        ${p.is_verified ? `<div class="seller-badge-tag"><span class="material-symbols-outlined" style="font-size: 11px;">verified</span> ${p.seller_name}</div>` : ''}
      </div>
      <div class="product-details">
        <span class="product-meta-sub">${p.category_label || p.category}</span>
        <h4 class="product-name" onclick="showProductDetails('${p.id}')">${p.title}</h4>
        <div class="product-rating-row">
          <span class="material-symbols-outlined" style="font-size: 13px;">star</span> ${p.rating || '4.8'} <span class="review-count">(${p.review_count || 12})</span>
        </div>
        <div class="product-bottom-row">
          <div class="product-price-block">
            <span class="product-price">₦${p.price.toLocaleString()}</span>
          </div>
          <button class="add-cart-btn" onclick="addToCart('${p.id}', '${p.title.replace(/'/g, "\\'")}', ${p.price}, '${p.seller_name || 'Seller'}')">
            <span class="material-symbols-outlined" style="font-size: 16px;">add_shopping_cart</span>
          </button>
        </div>
      </div>
    </div>
  `).join('');

  document.getElementById('productCount').textContent = products.length;
}

/* --------------------------------------------------------------------------
   FILTERS, CARTS, & UI ENGINE
   -------------------------------------------------------------------------- */
function filterCategory(cat, btn) {
  currentCategory = cat;
  document.querySelectorAll('.filter-pill-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  filterMarketProducts();
}

function toggleVerifiedOnly(btn) {
  onlyVerified = !onlyVerified;
  btn.classList.toggle('active');
  filterMarketProducts();
}

function filterMarketProducts() {
  const search = document.getElementById('marketSearchInput')?.value.toLowerCase() || '';
  const cards = document.querySelectorAll('#marketProductsGrid .product-card:not(.skeleton-card)');
  let count = 0;

  cards.forEach(card => {
    const title = card.querySelector('.product-name')?.textContent.toLowerCase() || '';
    const cardCategory = card.dataset.category;
    const isVerified = card.dataset.verified === 'true';

    const matchesSearch = title.includes(search);
    const matchesCategory = (currentCategory === 'all' || cardCategory === currentCategory);
    const matchesVerified = (!onlyVerified || isVerified);

    if (matchesSearch && matchesCategory && matchesVerified) {
      card.style.display = 'flex';
      count++;
    } else {
      card.style.display = 'none';
    }
  });

  const countEl = document.getElementById('productCount');
  if (countEl) countEl.textContent = count;
}

function addToCart(id, name, price, seller) {
  addItem({ id, title: name, price: parseFloat(price), sellerId: seller });
  if (window.showToast) {
    window.showToast(`${name} added to cart!`, 'success');
  } else {
    alert(`${name} added to cart!`);
  }
}

cartSubscribe((items) => {
  const badge = document.getElementById('cartCountBadge');
  const mobileBadge = document.getElementById('mobileCartBadge');
  const totalCount = items.reduce((sum, i) => sum + i.qty, 0);
  if (badge) badge.textContent = String(totalCount);
  if (mobileBadge) mobileBadge.textContent = String(totalCount);
});

function toggleWishlist(btn) {
  btn.classList.toggle('active');
}

function toggleCategoryDropdown(e) {
  e.stopPropagation();
  const menu = document.getElementById('categoryDropdownMenu');
  const wrapper = e.currentTarget.parentElement;
  const isShown = menu.classList.contains('show');

  document.querySelectorAll('.category-dropdown-menu').forEach(m => m.classList.remove('show'));
  document.querySelectorAll('.filter-dropdown-wrapper').forEach(w => w.classList.remove('active'));

  if (!isShown) {
    menu.classList.add('show');
    wrapper.classList.add('active');
  }
}

function selectDropdownCategory(catKey, catName, iconName, itemEl) {
  document.querySelectorAll('.filter-pill-btn').forEach(b => b.classList.remove('active'));
  const toggleBtn = itemEl.closest('.filter-dropdown-wrapper').querySelector('.dropdown-toggle');
  toggleBtn.classList.add('active');

  document.getElementById('categoryDropdownMenu').classList.remove('show');
  itemEl.closest('.filter-dropdown-wrapper').classList.remove('active');

  filterCategory(catKey, toggleBtn);
}

function toggleHeaderNavMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('headerNavDropdownMenu');
  const wrapper = e.currentTarget.parentElement;
  const isShown = menu.classList.contains('show');
  menu.classList.toggle('show', !isShown);
  wrapper.classList.toggle('active', !isShown);
}

function switchMarketView(viewKey, btn) {
  document.querySelectorAll('.market-view-pane').forEach(pane => pane.style.display = 'none');

  if (btn) {
    document.querySelectorAll('.market-nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  } else {
    document.querySelectorAll('.market-nav-btn').forEach(b => {
      if (b.getAttribute('onclick') && b.getAttribute('onclick').includes(`'${viewKey}'`)) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
  }

  const target = document.getElementById(`view${viewKey.charAt(0).toUpperCase() + viewKey.slice(1)}`);
  if (target) target.style.display = 'block';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleSortDropdown(e) {
  e.stopPropagation();
  const menu = document.getElementById('sortDropdownMenu');
  const wrapper = e.currentTarget.parentElement;
  const isShown = menu.classList.contains('show');

  const catMenu = document.getElementById('categoryDropdownMenu');
  if (catMenu) {
    catMenu.classList.remove('show');
    if (catMenu.parentElement) catMenu.parentElement.classList.remove('active');
  }

  menu.classList.toggle('show', !isShown);
  wrapper.classList.toggle('active', !isShown);
}

function sortProducts(sortKey) {
  const grid = document.getElementById('marketProductsGrid');
  if (!grid) return;

  const cards = Array.from(grid.querySelectorAll('.product-card:not(.skeleton-card)'));
  if (grid.dataset.originalOrderCaptured !== 'true') {
    cards.forEach((card, i) => { card.dataset.originalIndex = i; });
    grid.dataset.originalOrderCaptured = 'true';
  }

  const getRating = (card) => {
    const row = card.querySelector('.product-rating-row');
    const match = row && row.textContent.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : 0;
  };

  const sorted = cards.slice().sort((a, b) => {
    switch (sortKey) {
      case 'price-low':
        return Number(a.dataset.price) - Number(b.dataset.price);
      case 'price-high':
        return Number(b.dataset.price) - Number(a.dataset.price);
      case 'rating':
        return getRating(b) - getRating(a);
      case 'featured':
      default:
        return Number(a.dataset.originalIndex) - Number(b.dataset.originalIndex);
    }
  });

  sorted.forEach(card => grid.appendChild(card));
}

function selectSortOption(sortKey, sortText, itemEl) {
  document.getElementById('currentSortLabel').textContent = sortText;

  document.querySelectorAll('#sortDropdownMenu .dropdown-item').forEach(el => el.classList.remove('active'));
  itemEl.classList.add('active');

  const menu = document.getElementById('sortDropdownMenu');
  menu.classList.remove('show');
  if (menu.parentElement) menu.parentElement.classList.remove('active');

  sortProducts(sortKey);
}

document.addEventListener('click', () => {
  const catMenu = document.getElementById('categoryDropdownMenu');
  if (catMenu) {
    catMenu.classList.remove('show');
    if (catMenu.parentElement) catMenu.parentElement.classList.remove('active');
  }

  const headerMenu = document.getElementById('headerNavDropdownMenu');
  if (headerMenu) {
    headerMenu.classList.remove('show');
    if (headerMenu.parentElement) headerMenu.parentElement.classList.remove('active');
  }

  const sortMenu = document.getElementById('sortDropdownMenu');
  if (sortMenu) {
    sortMenu.classList.remove('show');
    if (sortMenu.parentElement) sortMenu.parentElement.classList.remove('active');
  }
});

function updateCartQty(itemId, delta) {
  const itemRow = document.getElementById(`cart-item-${itemId}`);
  if (!itemRow) return;

  const input = itemRow.querySelector('.cart-qty-input');
  let currentQty = parseInt(input.value) || 1;
  currentQty += delta;

  if (currentQty < 1) {
    removeItem(itemId);
    return;
  }

  input.value = currentQty;
}

function removeItem(itemId) {
  const itemRow = document.getElementById(`cart-item-${itemId}`);
  if (!itemRow) return;

  const sellerCard = itemRow.closest('.seller-cart-card');

  itemRow.style.opacity = '0';
  itemRow.style.transform = 'scale(0.95)';
  itemRow.style.transition = 'all 0.2s ease';

  setTimeout(() => {
    itemRow.remove();

    if (sellerCard) {
      const remainingItems = sellerCard.querySelectorAll('.cart-item-row');
      if (remainingItems.length === 0) {
        sellerCard.style.opacity = '0';
        sellerCard.style.transform = 'translateY(-8px)';
        sellerCard.style.transition = 'all 0.2s ease';
        
        setTimeout(() => {
          sellerCard.remove();
          checkEmptyCartState();
        }, 200);
      }
    }
  }, 200);
}

function checkEmptyCartState() {
  const remainingSellers = document.querySelectorAll('#viewCart .seller-cart-card');
  if (remainingSellers.length === 0) {
    const cartColumn = document.querySelector('.cart-items-column');
    if (cartColumn) {
      cartColumn.innerHTML = `
        <div style="text-align: center; padding: 48px 16px; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0;">
          <span class="material-symbols-outlined" style="font-size: 48px; color: #94a3b8; margin-bottom: 12px;">shopping_cart_off</span>
          <h3 style="font-family: 'Bricolage Grotesque', sans-serif; font-size: 18px; color: #0f172a; margin: 0 0 6px 0;">Your cart is empty</h3>
          <p style="font-size: 13px; color: #64748b; margin: 0 0 16px 0;">Explore the marketplace and discover premium items.</p>
          <button class="filter-pill-btn active" onclick="switchMarketView('browse')" style="padding: 10px 20px;">
            <span class="material-symbols-outlined icon">storefront</span> Continue Shopping
          </button>
        </div>
      `;
    }
  }
}

function changeMainImage(src, thumbEl) {
  document.getElementById('pdpMainImage').src = src;
  document.querySelectorAll('.pdp-thumb').forEach(t => t.classList.remove('active'));
  thumbEl.classList.add('active');
}

function updatePdpQty(delta) {
  const input = document.getElementById('pdpQtyInput');
  let current = parseInt(input.value) || 1;
  current += delta;
  if (current < 1) current = 1;
  input.value = current;
}

function showProductDetails(productId) {
  switchMarketView('productDetail');
}

function buyNowPdp(id, name, price) {
  addToCart(id, name, price, 'HP Authorized');
  switchMarketView('checkout');
}

function switchPdpTab(tabKey, btnEl) {
  document.querySelectorAll('.pdp-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.pdp-tab-content').forEach(c => c.style.display = 'none');

  btnEl.classList.add('active');
  const target = document.getElementById(`pdpTab${tabKey.charAt(0).toUpperCase() + tabKey.slice(1)}`);
  if (target) target.style.display = 'block';
}

function filterOrders(statusKey, btnEl) {
  document.querySelectorAll('.order-filter-btn').forEach(b => b.classList.remove('active'));
  btnEl.classList.add('active');

  const cards = document.querySelectorAll('.order-card');
  cards.forEach(card => {
    if (statusKey === 'all' || card.dataset.status === statusKey) {
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  });
}

function showTrackModal(orderId) {
  alert(`📦 Live Tracking for ${orderId}:\nDriver: Express Courier Lagos\nStatus: Out for delivery in Yaba\nEstimated Arrival: Today before 5:00 PM`);
}

function openReviewModal(orderId) {
  alert(`⭐ Leave a review for Order ${orderId}.\nYour feedback helps secure future marketplace transactions!`);
}

function removeFromWishlist(wishlistId) {
  const itemRow = document.getElementById(`wishlist-item-${wishlistId}`);
  if (!itemRow) return;

  const sellerCard = itemRow.closest('.seller-cart-card');

  itemRow.style.opacity = '0';
  itemRow.style.transform = 'scale(0.92)';
  itemRow.style.transition = 'all 0.2s ease';

  setTimeout(() => {
    itemRow.remove();

    if (sellerCard) {
      const remainingItems = sellerCard.querySelectorAll('.cart-item-row');
      if (remainingItems.length === 0) {
        sellerCard.style.opacity = '0';
        sellerCard.style.transform = 'translateY(-8px)';
        sellerCard.style.transition = 'all 0.2s ease';

        setTimeout(() => {
          sellerCard.remove();
          checkEmptyWishlistState();
        }, 200);
      }
    } else {
      checkEmptyWishlistState();
    }
  }, 200);
}

function moveToCartFromWishlist(wishlistId, name, price, seller) {
  addToCart(wishlistId, name, price, seller);
  removeFromWishlist(wishlistId);
}

function clearWishlist() {
  if (confirm("Are you sure you want to clear your saved wishlist?")) {
    const wishlistContainer = document.querySelector('#viewWishlist .wishlist-container');
    if (!wishlistContainer) return;

    const sellerCards = wishlistContainer.querySelectorAll('.seller-cart-card');
    sellerCards.forEach(card => {
      card.style.opacity = '0';
      card.style.transition = 'opacity 0.2s ease';
      setTimeout(() => card.remove(), 200);
    });

    setTimeout(() => checkEmptyWishlistState(), 250);
  }
}

function checkEmptyWishlistState() {
  const wishlistContainer = document.querySelector('#viewWishlist .wishlist-container');
  if (!wishlistContainer) return;

  const remainingSellerCards = wishlistContainer.querySelectorAll('.seller-cart-card');
  if (remainingSellerCards.length === 0) {
    if (!document.getElementById('emptyWishlistState')) {
      const emptyDiv = document.createElement('div');
      emptyDiv.id = 'emptyWishlistState';
      emptyDiv.style.cssText = 'text-align: center; padding: 48px 16px; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; margin-top: 16px;';
      emptyDiv.innerHTML = `
        <span class="material-symbols-outlined" style="font-size: 48px; color: #94a3b8; margin-bottom: 12px;">favorite_border</span>
        <h3 style="font-family: 'Bricolage Grotesque', sans-serif; font-size: 18px; color: #0f172a; margin: 0 0 6px 0;">Your wishlist is empty</h3>
        <p style="font-size: 13px; color: #64748b; margin: 0 0 16px 0;">Save items you'd like to purchase or track for price drops.</p>
        <button class="filter-pill-btn active" onclick="switchMarketView('browse')" style="padding: 10px 20px;">
          <span class="material-symbols-outlined icon">storefront</span> Explore Products
        </button>
      `;
      wishlistContainer.appendChild(emptyDiv);
    }
  }
}

function clearCart() {
  if (!confirm('Remove all items from your cart?')) return;
  clearCartState();
  checkEmptyCartState();
}

/* REAL NETWORK ORDER PLACEMENT WITH DISABLED BUTTON & SPINNER */
async function placeOrder() {
  const items = getItems();
  const btn = document.querySelector('.checkout-submit-btn');

  if (items.length === 0) {
    if (window.showToast) window.showToast('Your cart is empty.', 'error');
    else alert('Your cart is empty.');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-spinner"></span> Placing Order...`;
  }

  try {
    // API Call to create live order in escrow
    const response = await request('/marketplace/orders', {
      method: 'POST',
      body: { items, total_amount: getTotal() }
    });

    if (window.showToast) window.showToast('Order placed successfully! Funds secured in escrow.', 'success');
    else alert('Order placed! Funds secured in escrow.');

    clearCartState();
    switchMarketView('orders');
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : 'Order creation failed. Check network connection.';
    if (window.showToast) window.showToast(msg, 'error');
    else alert(msg);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `Confirm & Pay ₦${getTotal().toLocaleString()}.00 <span class="material-symbols-outlined">lock</span>`;
    }
  }
}

function openAIProductAssistant() {
  alert('theKapita AI product assistant is coming soon — ask a seller directly for now.');
}

document.addEventListener('DOMContentLoaded', () => {
  // Load products dynamically on page load
  fetchAndRenderProducts();
});

// Window Bridge Bindings
window.fetchAndRenderProducts = fetchAndRenderProducts;
window.filterCategory = filterCategory;
window.toggleVerifiedOnly = toggleVerifiedOnly;
window.addToCart = addToCart;
window.toggleWishlist = toggleWishlist;
window.toggleCategoryDropdown = toggleCategoryDropdown;
window.selectDropdownCategory = selectDropdownCategory;
window.toggleHeaderNavMenu = toggleHeaderNavMenu;
window.switchMarketView = switchMarketView;
window.toggleSortDropdown = toggleSortDropdown;
window.selectSortOption = selectSortOption;
window.updateCartQty = updateCartQty;
window.removeItem = removeItem;
window.changeMainImage = changeMainImage;
window.updatePdpQty = updatePdpQty;
window.showProductDetails = showProductDetails;
window.buyNowPdp = buyNowPdp;
window.switchPdpTab = switchPdpTab;
window.filterOrders = filterOrders;
window.showTrackModal = showTrackModal;
window.openReviewModal = openReviewModal;
window.moveToCartFromWishlist = moveToCartFromWishlist;
window.removeFromWishlist = removeFromWishlist;
window.clearWishlist = clearWishlist;
window.clearCart = clearCart;
window.placeOrder = placeOrder;
window.openAIProductAssistant = openAIProductAssistant;