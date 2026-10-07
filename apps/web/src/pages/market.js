/* ==========================================================================
   THEKAPITA MARKETPLACE ENGINE
   ========================================================================== */
import { addItem, subscribe as cartSubscribe, clearCart as clearCartState, getItems, getTotal } from '../state/cart.js';

let currentCategory = 'all';
let onlyVerified = false;

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
  const search = document.getElementById('marketSearchInput').value.toLowerCase();
  const cards = document.querySelectorAll('#marketProductsGrid .product-card');
  let count = 0;

  cards.forEach(card => {
    const title = card.querySelector('.product-name').textContent.toLowerCase();
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

  document.getElementById('productCount').textContent = count;
}

function addToCart(id, name, price, seller) {
  // BUGFIX/UPGRADE: this used to only increment a badge counter — there was
  // no cart data structure at all, so the actual Cart view in this page is
  // still static markup, not rendered from state. addItem() now gives it
  // one, and the badge below reflects that real count. Rendering the seller-
  // grouped Cart view from cartState (replacing the static HTML) is the
  // next piece of this file to convert — not done in this pass.
  addItem({ id, title: name, price: parseFloat(price), sellerId: seller });
  alert(`${name} added to cart!`);
}

cartSubscribe((items) => {
  const badge = document.getElementById('cartCountBadge');
  if (badge) badge.textContent = String(items.reduce((sum, i) => sum + i.qty, 0));
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

/* Desktop Top-Right Nav Menu Toggle */
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

/* Toggle Sort Dropdown Menu */
function toggleSortDropdown(e) {
  e.stopPropagation();
  const menu = document.getElementById('sortDropdownMenu');
  const wrapper = e.currentTarget.parentElement;
  const isShown = menu.classList.contains('show');

  // Close category dropdown if open
  const catMenu = document.getElementById('categoryDropdownMenu');
  if (catMenu) {
    catMenu.classList.remove('show');
    if (catMenu.parentElement) catMenu.parentElement.classList.remove('active');
  }

  menu.classList.toggle('show', !isShown);
  wrapper.classList.toggle('active', !isShown);
}

/* BUGFIX: selectSortOption() called sortProducts(), which did not exist
   anywhere in the codebase, so every "Sort by" option silently did nothing.
   Implemented here: reorders the existing card elements in place (via
   appendChild, which moves nodes rather than re-creating them) so no
   product markup is rebuilt from strings. */
function sortProducts(sortKey) {
  const grid = document.getElementById('marketProductsGrid');
  if (!grid) return;

  const cards = Array.from(grid.querySelectorAll('.product-card'));
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

/* Handle Sort Selection */
function selectSortOption(sortKey, sortText, itemEl) {
  document.getElementById('currentSortLabel').textContent = sortText;

  document.querySelectorAll('#sortDropdownMenu .dropdown-item').forEach(el => el.classList.remove('active'));
  itemEl.classList.add('active');

  const menu = document.getElementById('sortDropdownMenu');
  menu.classList.remove('show');
  if (menu.parentElement) menu.parentElement.classList.remove('active');

  if (typeof sortProducts === 'function') {
    sortProducts(sortKey);
  }
}

// Global outside click handler to close open dropdowns
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

/* Update Cart Item Quantity */
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

/* Smart Remove Cart Item Function (Deletes empty Seller Cards & Updates State) */
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

/* Show Empty State if all seller cards are removed from cart */
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

/* Switch Main PDP Gallery Image */
function changeMainImage(src, thumbEl) {
  document.getElementById('pdpMainImage').src = src;
  document.querySelectorAll('.pdp-thumb').forEach(t => t.classList.remove('active'));
  thumbEl.classList.add('active');
}

/* Update PDP Quantity */
function updatePdpQty(delta) {
  const input = document.getElementById('pdpQtyInput');
  let current = parseInt(input.value) || 1;
  current += delta;
  if (current < 1) current = 1;
  input.value = current;
}

/* Show Product Detail View */
function showProductDetails(productId) {
  switchMarketView('productDetail');
}

/* Direct Buy Now from PDP */
function buyNowPdp(id, name, price) {
  addToCart(id, name, price, 'HP Authorized');
  switchMarketView('checkout');
}

/* Tab Switching in PDP */
function switchPdpTab(tabKey, btnEl) {
  document.querySelectorAll('.pdp-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.pdp-tab-content').forEach(c => c.style.display = 'none');

  btnEl.classList.add('active');
  const target = document.getElementById(`pdpTab${tabKey.charAt(0).toUpperCase() + tabKey.slice(1)}`);
  if (target) target.style.display = 'block';
}

/* Filter Orders by Status */
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

/* Live Map Modal Simulation */
function showTrackModal(orderId) {
  alert(`📦 Live Tracking for ${orderId}:\nDriver: Express Courier Lagos\nStatus: Out for delivery in Yaba\nEstimated Arrival: Today before 5:00 PM`);
}

/* Review Modal Alert */
function openReviewModal(orderId) {
  alert(`⭐ Leave a review for Order ${orderId}.\nYour feedback helps secure future marketplace transactions!`);
}

/* ==========================================================================
   WISHLIST ENGINE (WITH COMPLETE SELLER CARD REMOVAL)
   ========================================================================== */

/* Remove Item from Wishlist and Clean Up Seller Card If Empty */
function removeFromWishlist(wishlistId) {
  const itemRow = document.getElementById(`wishlist-item-${wishlistId}`);
  if (!itemRow) return;

  const sellerCard = itemRow.closest('.seller-cart-card');

  // Smooth animation for row deletion
  itemRow.style.opacity = '0';
  itemRow.style.transform = 'scale(0.92)';
  itemRow.style.transition = 'all 0.2s ease';

  setTimeout(() => {
    itemRow.remove();

    // Remove the entire seller store block if no items remain for that seller
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

/* Move Item from Wishlist to Cart */
function moveToCartFromWishlist(wishlistId, name, price, seller) {
  addToCart(wishlistId, name, price, seller);
  removeFromWishlist(wishlistId);
}

/* Clear Entire Wishlist */
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

/* Empty Wishlist State Notification */
function checkEmptyWishlistState() {
  const wishlistContainer = document.querySelector('#viewWishlist .wishlist-container');
  if (!wishlistContainer) return;

  const remainingSellerCards = wishlistContainer.querySelectorAll('.seller-cart-card');
  if (remainingSellerCards.length === 0) {
    // Only render empty state if it doesn't already exist
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

/* BUGFIX: marketplace.html calls clearCart(), placeOrder() and
   openAIProductAssistant() via inline onclick, but none of the three were
   defined anywhere in the codebase — the same undefined-function bug class
   as sortProducts, filterTx and openBillPay found elsewhere in this pass. */

function clearCart() {
  if (!confirm('Remove all items from your cart?')) return;
  clearCartState();
  // The Cart view itself is still static markup (see addToCart's comment
  // above) — this clears the real data model; re-rendering the view from
  // it is the same follow-up work noted there.
  checkEmptyCartState();
}

function placeOrder() {
  const items = getItems();
  if (items.length === 0) {
    alert('Your cart is empty.');
    return;
  }
  // TODO(backend): POST to an orders endpoint with items + delivery address
  // + payment method, holding funds in escrow per the Building Plan's
  // marketplace rules (Section 3) — this stub only confirms the total so
  // the checkout button isn't dead while that endpoint doesn't exist yet.
  alert(`Order placed! Total: \u20a6${getTotal().toLocaleString()}.00. You'll get a confirmation shortly.`);
  clearCartState();
}

function openAIProductAssistant() {
  // TODO(backend): wire to the AI gateway (Building Plan Section 3/5.8) —
  // Claude Haiku 4.5 by default, escalate to Sonnet 5. Stub keeps the
  // button honest about not being wired yet, rather than silently dead.
  alert('theKapita AI product assistant is coming soon — ask a seller directly for now.');
}

/* ---- Window bridge: marketplace.html still calls these via inline
   onclick. Same pattern as auth.js/wallet.js/profile.js/app.js. */
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