/* ==========================================================================
   THEKAPITA MARKETPLACE ENGINE (WITH REAL NETWORK FEEDBACK & API INTEGRATION)
   ========================================================================== */
import { addItem, subscribe as cartSubscribe, clearCart as clearCartState, getItems, getTotal, removeItem as removeCartItem, setQty } from '../state/cart.js';
import { request, ApiError } from '../api/client.js';
import { authorizedRequest, isAuthenticated } from '../state/session.js';
import { showToast } from './app.js';
import { refreshBalance, getBalanceDisplay } from '../state/ledger.js';

let currentCategory = 'all';
let checkoutKey = null; // Idempotency-Key for the current cart state
let products = [];
let wishlist = new Set();
let selectedProduct = null;
let dropdownCategoryKeys = new Set();

try {
  wishlist = new Set(JSON.parse(localStorage.getItem('kapita.market.wishlist') || '[]').map(String));
} catch {
  wishlist = new Set();
}

// Seller-supplied text goes into innerHTML, so escape it.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let onlyVerified = false;

function setHtml(element, markup) {
  // eslint-disable-next-line no-restricted-properties -- Marketplace data is escaped before dynamic templates are rendered.
  element.innerHTML = markup;
}

/* --------------------------------------------------------------------------
   0. REAL NETWORK LOADING & SKELETON RENDERER
   -------------------------------------------------------------------------- */
async function fetchAndRenderProducts() {
  const grid = document.getElementById('marketProductsGrid');
  if (!grid) return;

  // Render 4 Skeleton Shimmer Cards while fetching live data
  setHtml(grid, Array(4).fill(0).map(() => `
    <div class="product-card skeleton-card">
      <div class="skeleton-img"></div>
      <div class="product-details">
        <div class="skeleton-text short"></div>
        <div class="skeleton-text long"></div>
        <div class="skeleton-text medium"></div>
      </div>
    </div>
  `).join(''));

  try {
    const pageSize = 100;
    const allProducts = [];
    for (let offset = 0; ; offset += pageSize) {
      const page = await request(`/marketplace/products?limit=${pageSize}&offset=${offset}`);
      allProducts.push(...page);
      if (page.length < pageSize) break;
    }
    products = allProducts;
    renderCategoryFilters(products);
    renderProductCards(products);
  } catch (err) {
    // Real Network Error Fallback Card with Retry Button
    const errorMsg = err instanceof ApiError ? err.message : 'Could not load products. Please check your network connection.';
    setHtml(grid, `
      <div style="grid-column: 1 / -1; text-align: center; padding: 48px 16px; background: #ffffff; border-radius: 18px; border: 1px solid #e2e8f0;">
        <span class="material-symbols-outlined" style="font-size: 48px; color: #ff4d4d; margin-bottom: 12px;">cloud_off</span>
        <h3 style="font-family: 'Bricolage Grotesque', sans-serif; font-size: 18px; color: #0f172a; margin: 0 0 6px 0;">Unable to connect to Marketplace API</h3>
        <p style="font-size: 13px; color: #64748b; margin: 0 0 16px 0;">${esc(errorMsg)}</p>
        <button class="filter-pill-btn active" onclick="fetchAndRenderProducts()" style="padding: 10px 20px;">
          <span class="material-symbols-outlined icon">refresh</span> Try Again
        </button>
      </div>
    `);
    if (window.showToast) {
      window.showToast(errorMsg, 'error');
    }
  }
}

function renderCategoryFilters(items) {
  const quickFilters = document.getElementById('categoryQuickFilters');
  const dropdownMenu = document.getElementById('categoryDropdownMenu');
  if (!quickFilters || !dropdownMenu) return;

  const categoriesBySlug = new Map();
  items.forEach((product) => {
    const slug = String(product.category || '');
    if (!slug) return;
    const category = categoriesBySlug.get(slug) || {
      slug,
      label: product.category_label || slug,
      count: 0,
    };
    category.count += 1;
    categoriesBySlug.set(slug, category);
  });

  const categories = [...categoriesBySlug.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const quickCategories = categories.slice(0, 3);
  dropdownCategoryKeys = new Set(categories.map((category) => category.slug));

  setHtml(quickFilters, quickCategories.map((category) => `
    <button type="button" class="filter-pill-btn" data-category-filter="${esc(category.slug)}"
      onclick="filterCategory('${esc(category.slug)}', this)" aria-pressed="false">
      ${esc(category.label)}
    </button>
  `).join(''));
  setHtml(dropdownMenu, categories.map((category) => `
    <button type="button" class="dropdown-item" data-category-filter="${esc(category.slug)}"
      onclick="selectDropdownCategory('${esc(category.slug)}', this)"
      role="menuitem" aria-pressed="false">
      <span class="material-symbols-outlined icon" aria-hidden="true">category</span> ${esc(category.label)}
    </button>
  `).join(''));
  updateCategoryFilterState();
}

function renderProductCards(products) {
  const grid = document.getElementById('marketProductsGrid');
  if (!grid) return;

  if (!products || products.length === 0) {
    setHtml(grid, `
      <div style="grid-column: 1 / -1; text-align: center; padding: 48px 16px; background: #ffffff; border-radius: 18px; border: 1px solid #e2e8f0;">
        <span class="material-symbols-outlined" style="font-size: 48px; color: #94a3b8; margin-bottom: 12px;">storefront</span>
        <h3 style="font-family: 'Bricolage Grotesque', sans-serif; font-size: 18px; color: #0f172a; margin: 0 0 6px 0;">No products found</h3>
      </div>
    `);
    const count = document.getElementById('productCount');
    if (count) count.textContent = '0';
    return;
  }

  setHtml(grid, products.map(p => `
    <article class="product-card" data-category="${esc(p.category)}" data-price="${p.price}" data-verified="${p.is_verified ? 'true' : 'false'}" data-in-stock="${p.stock > 0 ? 'true' : 'false'}">
      <div class="product-img-wrapper">
        ${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.title)}" loading="lazy">` : ''}
        <button class="product-fav-btn ${wishlist.has(String(p.id)) ? 'active' : ''}" data-wishlist-id="${esc(p.id)}" onclick="toggleWishlist(this)" aria-label="Toggle ${esc(p.title)} in wishlist"><span class="material-symbols-outlined">favorite</span></button>
        ${p.is_verified ? `<div class="seller-badge-tag"><span class="material-symbols-outlined" style="font-size: 11px;">verified</span> ${esc(p.seller_name)}</div>` : ''}
      </div>
      <div class="product-details">
        <span class="product-meta-sub">${esc(p.category_label || p.category)}</span>
        <button type="button" class="product-name product-title-btn" onclick="showProductDetails('${esc(p.id)}')">${esc(p.title)}</button>
        ${p.rating ? `<div class="product-rating-row">
          <span class="material-symbols-outlined" style="font-size: 13px;">star</span> ${p.rating} <span class="review-count">(${p.review_count || 0})</span>
        </div>` : ''}
        <div class="product-bottom-row">
          <div class="product-price-block">
            <span class="product-price">₦${p.price.toLocaleString()}</span>
          </div>
          <button class="add-cart-btn" data-add-to-cart data-id="${p.id}" data-title="${esc(p.title)}" data-price="${p.price}" data-seller="${esc(p.seller_name)}" data-category="${esc(p.category_label || p.category)}" data-image="${esc(p.image_url || '')}" ${p.in_stock ? '' : 'disabled title="Out of stock"'}>
            <span class="material-symbols-outlined" style="font-size: 16px;">add_shopping_cart</span>
          </button>
        </div>
      </div>
    </article>
  `).join(''));

  filterMarketProducts();
  renderWishlist();
}

/* --------------------------------------------------------------------------
   FILTERS, CARTS, & UI ENGINE
   -------------------------------------------------------------------------- */
function filterCategory(cat, btn) {
  currentCategory = cat;
  updateCategoryFilterState(btn);
  filterMarketProducts();
}

function updateCategoryFilterState(selectedButton) {
  const toolbar = document.getElementById('marketCategoryFilters');
  if (!toolbar) return;

  toolbar.querySelectorAll('[data-category-filter]').forEach((button) => {
    const active = button.dataset.categoryFilter === currentCategory;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  const dropdownToggle = document.getElementById('categoryDropdownToggle');
  dropdownToggle?.classList.toggle('active', dropdownCategoryKeys.has(currentCategory));
  if (selectedButton?.matches('.dropdown-item')) {
    selectedButton.closest('.filter-dropdown-wrapper')?.classList.remove('active');
  }
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
      if (card.dataset.inStock === 'true') count++;
    } else {
      card.style.display = 'none';
    }
  });

  const countEl = document.getElementById('productCount');
  if (countEl) countEl.textContent = count;
}

function addToCart(id, name, price, seller) {
  const product = products.find((item) => String(item.id) === String(id));
  const existing = getItems().find((item) => String(item.id) === String(id));
  const maxQty = product ? Math.min(Number(product.stock), 50) : 50;
  if (product && (!product.in_stock || (existing && existing.qty >= maxQty))) {
    showToast(product.in_stock ? `Only ${Number(product.stock)} of ${name} are in stock.` : `${name} is out of stock.`, 'info');
    return;
  }
  addItem({
    id: Number(id),
    title: name,
    price: Number(price),
    sellerId: seller,
    category: product?.category_label || product?.category || '',
    image: product?.image_url || '',
  });
  if (window.showToast) {
    window.showToast(`${name} added to cart!`, 'success');
  } else {
    alert(`${name} added to cart!`);
  }
}

cartSubscribe((items) => {
  checkoutKey = null; // cart changed: next checkout is a new purchase
  const badge = document.getElementById('cartCountBadge');
  const mobileBadge = document.getElementById('mobileCartBadge');
  const totalCount = items.reduce((sum, i) => sum + i.qty, 0);
  if (badge) badge.textContent = String(totalCount);
  if (mobileBadge) mobileBadge.textContent = String(totalCount);
  renderCart();
});

function toggleWishlist(btn) {
  const id = String(btn.dataset.wishlistId || '');
  if (!id) return;
  if (wishlist.has(id)) wishlist.delete(id);
  else wishlist.add(id);
  localStorage.setItem('kapita.market.wishlist', JSON.stringify([...wishlist]));
  document.querySelectorAll('[data-wishlist-id]').forEach((button) => {
    button.classList.toggle('active', wishlist.has(button.dataset.wishlistId));
  });
  renderWishlist();
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
  e.currentTarget.setAttribute('aria-expanded', String(!isShown));
}

function selectDropdownCategory(catKey, itemEl) {
  const menu = document.getElementById('categoryDropdownMenu');
  const wrapper = itemEl.closest('.filter-dropdown-wrapper');
  menu?.classList.remove('show');
  wrapper?.classList.remove('active');
  document.getElementById('categoryDropdownToggle')?.setAttribute('aria-expanded', 'false');
  filterCategory(catKey, itemEl);
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
  if (viewKey === 'checkout' && getItems().length === 0) {
    showToast('Add at least one product before checkout.', 'info');
    return;
  }
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
  if (viewKey === 'cart') renderCart();
  if (viewKey === 'checkout') {
    renderCheckoutSummary();
    hydrateMarketplaceBalance();
  }
  if (viewKey === 'orders') loadOrders();
  if (viewKey === 'wishlist') renderWishlist();

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
  const item = getItems().find((entry) => String(entry.id) === String(itemId));
  if (!item) return;
  const product = products.find((entry) => String(entry.id) === String(itemId));
  const maxQty = product ? Math.min(Number(product.stock), 50) : 50;
  if (item.qty + delta > maxQty) {
    showToast(`Only ${maxQty} of ${item.title} can be ordered at once.`, 'info');
    return;
  }
  if (item.qty + delta < 1) removeCartItem(item.id);
  else setQty(item.id, item.qty + delta);
}

function removeItem(itemId) {
  removeCartItem(Number(itemId));
}

function formatMoney(amount) {
  return `₦${Number(amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderCart() {
  const container = document.getElementById('cartItems');
  if (!container) return;
  const items = getItems();
  const empty = document.getElementById('cartEmptyState');
  const proceed = document.getElementById('proceedCheckout');
  if (empty) empty.hidden = items.length > 0;
  if (proceed) proceed.disabled = items.length === 0;
  setHtml(container, items.length ? items.map((item) => `
    <article class="seller-cart-card">
      <div class="seller-card-header">
        <div class="seller-info">
          <span class="material-symbols-outlined seller-icon" aria-hidden="true">storefront</span>
          <span class="seller-name">${esc(item.sellerId)}</span>
        </div>
      </div>
      <div class="cart-item-row" id="cart-item-${Number(item.id)}">
        ${item.image ? `<img src="${esc(item.image)}" class="cart-item-img" alt="${esc(item.title)}">` : ''}
        <div class="cart-item-details">
          <span class="cart-item-category">${esc(item.category)}</span>
          <h3 class="cart-item-title">${esc(item.title)}</h3>
          <div class="cart-item-price-mobile">${formatMoney(item.price)}</div>
        </div>
        <div class="cart-item-price-desktop">${formatMoney(item.price)}</div>
        <div class="cart-qty-control">
          <button type="button" class="cart-qty-btn" onclick="updateCartQty(${Number(item.id)}, -1)" aria-label="Decrease quantity">-</button>
          <label class="sr-only" for="qtyInput${Number(item.id)}">Quantity for ${esc(item.title)}</label>
          <input type="number" id="qtyInput${Number(item.id)}" value="${Number(item.qty)}" class="cart-qty-input" min="1" readonly>
          <button type="button" class="cart-qty-btn" onclick="updateCartQty(${Number(item.id)}, 1)" aria-label="Increase quantity">+</button>
        </div>
        <button type="button" class="cart-remove-btn" onclick="removeItem(${Number(item.id)})" aria-label="Remove ${esc(item.title)}">
          <span class="material-symbols-outlined" aria-hidden="true">delete</span>
        </button>
      </div>
    </article>
  `).join('') : '');

  const total = getTotal();
  const count = items.reduce((sum, item) => sum + item.qty, 0);
  document.getElementById('cartItemCount').textContent = String(count);
  document.getElementById('cartSubtotal').textContent = formatMoney(total);
  document.getElementById('cartTotal').textContent = formatMoney(total);
  renderCheckoutSummary();
}

function renderCheckoutSummary() {
  const itemsContainer = document.getElementById('checkoutItems');
  if (!itemsContainer) return;
  const items = getItems();
  setHtml(itemsContainer, items.map((item) => `
    <div class="mini-item">
      ${item.image ? `<img src="${esc(item.image)}" alt="${esc(item.title)}">` : ''}
      <div class="mini-item-info">
        <h4>${esc(item.title)}</h4>
        <span>Qty: ${Number(item.qty)} · ${formatMoney(item.price * item.qty)}</span>
      </div>
    </div>
  `).join(''));
  const total = getTotal();
  document.getElementById('checkoutSubtotal').textContent = formatMoney(total);
  document.getElementById('checkoutTotal').textContent = formatMoney(total);
  const submit = document.querySelector('#viewCheckout .checkout-submit-btn');
  if (submit) submit.disabled = items.length === 0;
  if (submit && !submit.disabled) {
    setHtml(submit, `Confirm &amp; Pay ${formatMoney(total)} <span class="material-symbols-outlined" aria-hidden="true">lock</span>`);
  }
}

async function hydrateMarketplaceBalance() {
  const balance = document.getElementById('checkoutWalletBalance');
  const headerBalance = document.getElementById('marketWalletBalance');
  try {
    await refreshBalance();
    if (balance) balance.textContent = getBalanceDisplay();
    if (headerBalance) headerBalance.textContent = getBalanceDisplay();
  } catch (err) {
    if (balance) balance.textContent = 'Unavailable';
    if (headerBalance) headerBalance.textContent = 'Unavailable';
    showToast(err instanceof ApiError ? err.message : 'Could not load your wallet balance.', 'error');
  }
}

function changeMainImage(src, thumbEl) {
  const image = document.getElementById('pdpMainImage');
  if (image) image.src = src;
  document.querySelectorAll('.pdp-thumb').forEach(t => t.classList.remove('active'));
  if (thumbEl) thumbEl.classList.add('active');
}

function updatePdpQty(delta) {
  const input = document.getElementById('pdpQtyInput');
  if (!input) return;
  let current = parseInt(input.value) || 1;
  current = Math.max(1, Math.min(Number(input.max) || Infinity, current + delta));
  input.value = String(current);
}

async function showProductDetails(productId) {
  try {
    selectedProduct = await request(`/marketplace/products/${encodeURIComponent(productId)}`);
  } catch (err) {
    showToast(err instanceof ApiError ? err.message : 'Could not load this product.', 'error');
    return;
  }
  renderProductDetail();
  switchMarketView('productDetail');
}

function renderProductDetail() {
  const container = document.getElementById('productDetailContent');
  if (!container || !selectedProduct) return;
  const product = selectedProduct;
  setHtml(container, `
    <nav class="pdp-breadcrumbs" aria-label="Breadcrumb">
      <ol class="breadcrumb-list">
        <li><button type="button" class="breadcrumb-btn" onclick="switchMarketView('browse')">Browse</button></li>
        <li><span class="material-symbols-outlined icon" aria-hidden="true">chevron_right</span></li>
        <li><span class="breadcrumb-text">${esc(product.category_label || product.category)}</span></li>
        <li><span class="material-symbols-outlined icon" aria-hidden="true">chevron_right</span></li>
        <li><span class="breadcrumb-text active" aria-current="page">${esc(product.title)}</span></li>
      </ol>
    </nav>
    <div class="pdp-main-grid">
      <div class="pdp-gallery-card">
        <div class="pdp-main-img-wrapper">
          ${product.image_url ? `<img id="pdpMainImage" src="${esc(product.image_url)}" alt="${esc(product.title)}">` : '<div class="pdp-main-img-placeholder"></div>'}
          <button type="button" class="pdp-fav-btn ${wishlist.has(String(product.id)) ? 'active' : ''}" data-wishlist-id="${esc(product.id)}" onclick="toggleWishlist(this)" aria-label="Toggle wishlist">
            <span class="material-symbols-outlined" aria-hidden="true">favorite</span>
          </button>
        </div>
      </div>
      <div class="pdp-buy-card">
        <div class="pdp-seller-pill"><strong>${esc(product.seller_name)}</strong>${product.is_verified ? ' · Verified seller' : ''}</div>
        <h1 class="pdp-title">${esc(product.title)}</h1>
        <p class="pdp-description">${esc(product.short_description || '')}</p>
        <div class="pdp-price-box"><div class="pdp-current-price">${formatMoney(product.price)}</div></div>
        <p class="stock-badge ${product.in_stock ? 'in-stock' : 'out-of-stock'}">${product.in_stock ? `${Number(product.stock)} in stock` : 'Out of stock'}</p>
        <div class="pdp-action-row">
          <div class="cart-qty-control pdp-qty">
            <button type="button" class="cart-qty-btn" onclick="updatePdpQty(-1)" aria-label="Decrease quantity">-</button>
            <label for="pdpQtyInput" class="sr-only">Product quantity</label>
            <input type="number" id="pdpQtyInput" value="1" class="cart-qty-input" min="1" max="${Math.min(Number(product.stock) || 1, 50)}" readonly>
            <button type="button" class="cart-qty-btn" onclick="updatePdpQty(1)" aria-label="Increase quantity">+</button>
          </div>
          <button type="button" class="pdp-add-cart-btn" onclick="buyNowPdp()" ${product.in_stock ? '' : 'disabled'}>
            <span class="material-symbols-outlined" aria-hidden="true">add_shopping_cart</span> Add to Cart
          </button>
          <button type="button" class="pdp-buy-now-btn" onclick="buyNowPdp(true)" ${product.in_stock ? '' : 'disabled'}>Buy Now</button>
        </div>
        <p>Order payments are held in escrow until delivery is confirmed.</p>
      </div>
    </div>
  `);
}

function buyNowPdp(goToCheckout = false) {
  if (!selectedProduct) return;
  const stock = Math.min(Number(selectedProduct.stock), 50);
  const quantity = Math.min(stock, Math.max(1, Number(document.getElementById('pdpQtyInput')?.value) || 1));
  const existing = getItems().find((item) => String(item.id) === String(selectedProduct.id));
  const quantityToAdd = Math.min(quantity, Math.max(0, stock - (existing?.qty || 0)));
  if (!quantityToAdd) {
    showToast(`Only ${stock} of ${selectedProduct.title} are in stock.`, 'info');
    return;
  }
  addToCart(selectedProduct.id, selectedProduct.title, selectedProduct.price, selectedProduct.seller_name);
  if (quantityToAdd > 1) setQty(Number(selectedProduct.id), (existing?.qty || 0) + quantityToAdd);
  if (goToCheckout) switchMarketView('checkout');
}

function switchPdpTab(tabKey, btnEl) {
  document.querySelectorAll('.pdp-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.pdp-tab-content').forEach(c => c.style.display = 'none');

  btnEl.classList.add('active');
  const target = document.getElementById(`pdpTab${tabKey.charAt(0).toUpperCase() + tabKey.slice(1)}`);
  if (target) target.style.display = 'block';
}

function renderWishlist() {
  const root = document.querySelector('#viewWishlist .wishlist-container');
  if (!root) return;
  const saved = products.filter((product) => wishlist.has(String(product.id)));
  setHtml(root, `
    <div class="wishlist-header-row">
      <div>
        <h2 class="cart-title" id="wishlist-heading">Saved Wishlist</h2>
        <p class="cart-subtitle">Saved in this browser. Wishlist sync is not available yet.</p>
      </div>
      <button type="button" class="cart-clear-btn" onclick="clearWishlist()" ${saved.length ? '' : 'disabled'}>
        <span class="material-symbols-outlined" aria-hidden="true">delete_sweep</span> Clear Wishlist
      </button>
    </div>
    ${saved.length ? saved.map((product) => `
      <article class="seller-cart-card">
        <div class="cart-item-row">
          ${product.image_url ? `<img src="${esc(product.image_url)}" class="cart-item-img" alt="${esc(product.title)}">` : ''}
          <div class="cart-item-details">
            <span class="cart-item-category">${esc(product.category_label || product.category)}</span>
            <h3 class="cart-item-title">${esc(product.title)}</h3>
            <div class="cart-item-price-mobile">${formatMoney(product.price)}</div>
          </div>
          <div class="cart-item-price-desktop">${formatMoney(product.price)}</div>
          <button type="button" class="wishlist-move-cart-btn" data-add-to-cart data-id="${Number(product.id)}" data-title="${esc(product.title)}" data-price="${Number(product.price)}" data-seller="${esc(product.seller_name)}" ${product.in_stock ? '' : 'disabled'}>
            <span class="material-symbols-outlined" aria-hidden="true">shopping_cart</span> Add to Cart
          </button>
          <button type="button" class="cart-remove-btn" data-wishlist-id="${Number(product.id)}" onclick="removeFromWishlist('${Number(product.id)}')" aria-label="Remove ${esc(product.title)} from wishlist">
            <span class="material-symbols-outlined" aria-hidden="true">delete</span>
          </button>
        </div>
      </article>
    `).join('') : '<p class="cart-subtitle">Your wishlist is empty. Use the heart on a product to save it here.</p>'}
  `);
}

function removeFromWishlist(productId) {
  wishlist.delete(String(productId));
  localStorage.setItem('kapita.market.wishlist', JSON.stringify([...wishlist]));
  document.querySelectorAll('[data-wishlist-id]').forEach((button) => {
    button.classList.toggle('active', wishlist.has(button.dataset.wishlistId));
  });
  renderWishlist();
}

function clearWishlist() {
  wishlist.clear();
  localStorage.removeItem('kapita.market.wishlist');
  document.querySelectorAll('[data-wishlist-id]').forEach((button) => button.classList.remove('active'));
  renderWishlist();
}

async function loadOrders() {
  const root = document.querySelector('#viewOrders .orders-container');
  if (!root) return;
  setHtml(root, '<h2 class="cart-title">My Orders &amp; Tracking</h2><p class="cart-subtitle">Loading your orders…</p>');
  try {
    const orders = await authorizedRequest('/marketplace/orders');
    setHtml(root, `
      <div class="orders-header-row">
        <div><h2 class="cart-title">My Orders &amp; Tracking</h2><p class="cart-subtitle">Orders placed using your Kapita Pay wallet.</p></div>
      </div>
      ${orders.length ? orders.map((order) => `
        <article class="order-card">
          <div class="order-card-header">
            <div class="order-meta-left">
              <span class="order-id">Order ${esc(order.reference)}</span>
              <span class="order-date">${esc(new Date(order.created_at).toLocaleString())}</span>
            </div>
            <div class="order-status-badge">${esc(order.status_label)}</div>
          </div>
          <div class="order-items-list">
            ${order.items.map((item) => `
              <div class="order-item-row">
                <div class="order-item-info">
                  <h3>${esc(item.name)}</h3>
                  <p>Qty: ${Number(item.qty)}</p>
                  <div class="order-item-price">${formatMoney(item.unit_price)}</div>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="order-card-footer">
            <div class="escrow-status-pill">${esc(order.status_label)}</div>
            <div class="order-total-block"><span>Total:</span><strong>${formatMoney(order.total)}</strong></div>
          </div>
          ${['in_escrow', 'shipped'].includes(order.status) ? `
            <button type="button" class="order-action-btn-sub" onclick="confirmOrder('${esc(order.reference)}')">Confirm delivery</button>
            ${order.status === 'in_escrow' ? `<button type="button" class="order-action-btn-sub" onclick="cancelOrder('${esc(order.reference)}')">Cancel order</button>` : ''}
          ` : ''}
        </article>
      `).join('') : '<p class="cart-subtitle">You have no marketplace orders yet.</p>'}
    `);
  } catch (err) {
    setHtml(root, `<p class="cart-subtitle">${isUnauthorized(err) ? 'Sign in to view your marketplace orders.' : esc(err instanceof ApiError ? err.message : 'Could not load orders.')}</p>
      <button type="button" class="filter-pill-btn" onclick="loadOrders()">Try again</button>`);
  }
}

function isUnauthorized(err) {
  return err instanceof ApiError && err.status === 401;
}

async function confirmOrder(reference) {
  try {
    await authorizedRequest(`/marketplace/orders/${encodeURIComponent(reference)}/confirm`, { method: 'POST' });
    showToast('Delivery confirmed. Funds released to the seller.', 'success');
    loadOrders();
  } catch (err) {
    showToast(err instanceof ApiError ? err.message : 'Could not confirm delivery.', 'error');
  }
}

async function cancelOrder(reference) {
  try {
    await authorizedRequest(`/marketplace/orders/${encodeURIComponent(reference)}/cancel`, { method: 'POST' });
    showToast('Order cancelled and wallet refunded.', 'success');
    loadOrders();
  } catch (err) {
    showToast(err instanceof ApiError ? err.message : 'Could not cancel this order.', 'error');
  }
}

function clearCart() {
  if (!confirm('Remove all items from your cart?')) return;
  clearCartState();
}

/* REAL NETWORK ORDER PLACEMENT WITH DISABLED BUTTON & SPINNER */
async function placeOrder() {
  const items = getItems();
  const btn = document.querySelector('#viewCheckout .checkout-submit-btn');
  const deliveryForm = document.getElementById('checkoutDelivery');

  if (items.length === 0) {
    showToast('Your cart is empty.', 'error');
    return;
  }
  if (!deliveryForm?.reportValidity()) {
    return;
  }

  if (btn) {
    btn.disabled = true;
    setHtml(btn, `<span class="btn-spinner"></span> Placing Order...`);
  }

  try {
    // API Call to create live order in escrow
    // The server re-prices everything from its own catalog; only ids and quantities are sent.
    // One key per cart state, so a retry after a lost response can't charge twice.
    checkoutKey ||= crypto.randomUUID();
    const delivery = Object.fromEntries(new FormData(deliveryForm).entries());
    await authorizedRequest('/marketplace/orders', {
      method: 'POST',
      body: { items: items.map((i) => ({ id: Number(i.id), qty: i.qty })), delivery },
      headers: { 'Idempotency-Key': checkoutKey },
    });
    checkoutKey = null;

    if (window.showToast) window.showToast('Order placed successfully! Funds secured in escrow.', 'success');
    else alert('Order placed! Funds secured in escrow.');

    clearCartState();
    await fetchAndRenderProducts();
    switchMarketView('orders');
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : 'Order creation failed. Check network connection.';
    if (window.showToast) window.showToast(msg, 'error');
    else alert(msg);
  } finally {
    renderCheckoutSummary();
  }
}

function openAIProductAssistant() {
  alert('theKapita AI product assistant is coming soon — ask a seller directly for now.');
}

document.addEventListener('DOMContentLoaded', () => {
  const handleAddToCart = (e) => {
    const btn = e.target.closest('[data-add-to-cart]');
    if (btn && !btn.disabled) addToCart(btn.dataset.id, btn.dataset.title, btn.dataset.price, btn.dataset.seller);
  };
  document.getElementById('marketProductsGrid')?.addEventListener('click', handleAddToCart);
  document.getElementById('viewWishlist')?.addEventListener('click', handleAddToCart);
  const detailContainer = document.querySelector('#viewProductDetail .product-detail-container');
  if (detailContainer) {
    detailContainer.id = 'productDetailContent';
    detailContainer.replaceChildren();
  }
  renderCart();
  renderWishlist();
  if (isAuthenticated()) hydrateMarketplaceBalance();
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
window.removeFromWishlist = removeFromWishlist;
window.clearWishlist = clearWishlist;
window.clearCart = clearCart;
window.placeOrder = placeOrder;
window.confirmOrder = confirmOrder;
window.cancelOrder = cancelOrder;
window.loadOrders = loadOrders;
window.openAIProductAssistant = openAIProductAssistant;