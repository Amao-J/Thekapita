/* Was SELLER_CLEARED_BALANCE from the now-removed global
   js/constants.js. No seller-ledger API/state module exists yet (only the
   buyer-side wallet has one, in state/ledger.js) — this is still a
   placeholder, just no longer reaching across files for it. The real
   ceiling must be enforced server-side regardless of what a client sends. */
const SELLER_CLEARED_BALANCE = 4400000;

/* Switch Active View Pane and Toggle Active Icon States */
function switchSellerView(viewKey, btnEl) {
  // Remove active state from all desktop navigation buttons
  document.querySelectorAll('.seller-nav-btn').forEach(b => b.classList.remove('active'));
  
  // Remove active state from all mobile icon buttons
  document.querySelectorAll('.seller-mobile-icon-btn').forEach(b => b.classList.remove('active'));

  // Highlight the clicked element
  if (btnEl) {
    btnEl.classList.add('active');
  }

  // Hide all view panes
  document.querySelectorAll('.seller-view-pane').forEach(pane => {
    pane.style.display = 'none';
  });

  // Display the target view pane
  const targetId = `sellerView${viewKey.charAt(0).toUpperCase() + viewKey.slice(1)}`;
  const targetPane = document.getElementById(targetId);

  if (targetPane) {
    targetPane.style.display = 'block';
  }
}

/* --- MODAL CONTROLS --- */

// Modal 1: Add Product
function toggleAddProductModal(show) {
  const modal = document.getElementById('addProductModal');
  if (modal) modal.style.display = show ? 'flex' : 'none';
}

function saveNewProduct(event) {
  event.preventDefault();
  const title = document.getElementById('newProdTitle').value;
  const category = document.getElementById('newProdCategory').value;
  const price = parseFloat(document.getElementById('newProdPrice').value).toLocaleString();
  const stock = document.getElementById('newProdStock').value;
  const sub = document.getElementById('newProdSub').value;

  const rawPrice = document.getElementById('newProdPrice').value;
  const newId = Date.now();
  const tbody = document.getElementById('productsTableBody');

  // SECURITY: never build markup by interpolating user input into an HTML
  // string (and never into a quoted inline onclick — that is two injection
  // vectors at once: HTML content and a JS string literal). Build the row
  // with DOM APIs so every value is treated as text, and attach handlers as
  // real function references instead of string-built onclick code.
  const tr = document.createElement('tr');
  tr.id = `product-row-${newId}`;

  const cellProduct = document.createElement('td');
  cellProduct.className = 'product-cell';
  const img = document.createElement('img');
  img.src = 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=100&auto=format&fit=crop&q=60';
  img.className = 'seller-thumb-img';
  img.alt = 'Product';
  const infoDiv = document.createElement('div');
  const titleEl = document.createElement('strong');
  titleEl.className = 'product-title-text';
  titleEl.id = `p-title-${newId}`;
  titleEl.textContent = title;
  const subEl = document.createElement('span');
  subEl.className = 'product-sub-text';
  subEl.id = `p-sub-${newId}`;
  subEl.textContent = sub;
  infoDiv.append(titleEl, subEl);
  cellProduct.append(img, infoDiv);

  const cellCategory = document.createElement('td');
  const catBadge = document.createElement('span');
  catBadge.className = 'category-badge';
  catBadge.id = `p-cat-${newId}`;
  catBadge.textContent = category;
  cellCategory.appendChild(catBadge);

  const cellPrice = document.createElement('td');
  const priceEl = document.createElement('strong');
  priceEl.id = `p-price-${newId}`;
  priceEl.textContent = `₦${price}.00`;
  cellPrice.appendChild(priceEl);

  const cellStock = document.createElement('td');
  cellStock.id = `p-stock-${newId}`;
  cellStock.textContent = `${stock} Units`;

  const cellStatus = document.createElement('td');
  const statusPill = document.createElement('span');
  statusPill.className = 'status-pill status-active';
  statusPill.textContent = 'Active';
  cellStatus.appendChild(statusPill);

  const cellActions = document.createElement('td');
  cellActions.style.textAlign = 'right';
  const actionGroup = document.createElement('div');
  actionGroup.className = 'action-btn-group';

  const editBtn = document.createElement('button');
  editBtn.className = 'icon-action-btn';
  editBtn.title = 'Edit Product';
  editBtn.innerHTML = '<span class="material-symbols-outlined">edit</span>';
  editBtn.addEventListener('click', () =>
    openEditProductModal(newId, title, category, parseFloat(rawPrice), stock, sub)
  );

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'icon-action-btn danger';
  deleteBtn.title = 'Delete Listing';
  deleteBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
  deleteBtn.addEventListener('click', () => deleteProduct(newId));

  actionGroup.append(editBtn, deleteBtn);
  cellActions.appendChild(actionGroup);

  tr.append(cellProduct, cellCategory, cellPrice, cellStock, cellStatus, cellActions);
  tbody.insertBefore(tr, tbody.firstChild);

  // Safe: title is inserted as a template-literal *argument* to alert(),
  // never parsed as markup, so no escaping is required here.
  alert(`🎉 "${title}" published live to theKapita Marketplace!`);
  toggleAddProductModal(false);
}

// Modal 2: Edit Product
function toggleEditProductModal(show) {
  const modal = document.getElementById('editProductModal');
  if (modal) modal.style.display = show ? 'flex' : 'none';
}

function openEditProductModal(id, title, category, price, stock, sub) {
  document.getElementById('editProdId').value = id;
  document.getElementById('editProdTitle').value = title;
  document.getElementById('editProdCategory').value = category;
  document.getElementById('editProdPrice').value = price;
  document.getElementById('editProdStock').value = stock;
  document.getElementById('editProdSub').value = sub;
  toggleEditProductModal(true);
}

function saveEditProduct(event) {
  event.preventDefault();
  const id = document.getElementById('editProdId').value;
  const title = document.getElementById('editProdTitle').value;
  const category = document.getElementById('editProdCategory').value;
  const price = parseFloat(document.getElementById('editProdPrice').value).toLocaleString();
  const stock = document.getElementById('editProdStock').value;
  const sub = document.getElementById('editProdSub').value;

  document.getElementById(`p-title-${id}`).innerText = title;
  document.getElementById(`p-sub-${id}`).innerText = sub;
  document.getElementById(`p-cat-${id}`).innerText = category;
  document.getElementById(`p-price-${id}`).innerText = `₦${price}.00`;
  document.getElementById(`p-stock-${id}`).innerText = `${stock} Units`;

  alert(`✅ Listing for "${title}" updated successfully!`);
  toggleEditProductModal(false);
}

function deleteProduct(id) {
  if (confirm("Are you sure you want to remove this product listing?")) {
    const row = document.getElementById(`product-row-${id}`);
    if (row) row.remove();
  }
}

// Modal 3: Fulfill & Tracking
function toggleFulfillModal(show) {
  const modal = document.getElementById('fulfillModal');
  if (modal) modal.style.display = show ? 'flex' : 'none';
}

function openFulfillModal(orderId, product, customer) {
  document.getElementById('fulfillOrderId').value = orderId;
  document.getElementById('fulfillOrderDisplay').value = `${orderId} — ${product} (${customer})`;
  toggleFulfillModal(true);
}

function saveFulfillStatus(event) {
  event.preventDefault();
  const courier = document.getElementById('fulfillCourier').value;
  const trackingNo = document.getElementById('fulfillTrackingNo').value;

  const note = document.getElementById('dispatch-note-894201');
  if (note) {
    // SECURITY: courier and trackingNo are raw user input; build the node
    // with textContent instead of interpolating them into innerHTML.
    note.textContent = '';
    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined icon-inline text-emerald';
    icon.textContent = 'local_shipping';
    note.append(icon, document.createTextNode(` Dispatched via ${courier} (Ref: ${trackingNo})`));
  }

  alert(`📦 Order shipping status updated! Tracking reference ${trackingNo} dispatched to customer.`);
  toggleFulfillModal(false);
}

// Modal 4: Order Details
function toggleOrderDetailsModal(show) {
  const modal = document.getElementById('orderDetailsModal');
  if (modal) modal.style.display = show ? 'flex' : 'none';
}

function openOrderDetailsModal(orderId, product, customer, amount, escrow, courier, tracking) {
  document.getElementById('detModalTitle').innerText = `Order Details ${orderId}`;
  document.getElementById('detCustomer').innerText = customer;
  document.getElementById('detProduct').innerText = product;
  document.getElementById('detAmount').innerText = amount;
  document.getElementById('detEscrow').innerText = escrow;
  document.getElementById('detCourier').innerText = courier;
  document.getElementById('detTracking').innerText = tracking;
  toggleOrderDetailsModal(true);
}

// Modal 5: Change Bank
function toggleChangeBankModal(show) {
  const modal = document.getElementById('changeBankModal');
  if (modal) modal.style.display = show ? 'flex' : 'none';
}

function openChangeBankModal() {
  toggleChangeBankModal(true);
}

function saveBankDetails(event) {
  event.preventDefault();
  const bank = document.getElementById('inputBankName').value;
  const accNo = document.getElementById('inputAccountNo').value;
  const accName = document.getElementById('inputAccountName').value;

  document.getElementById('displayBankName').innerText = bank;
  document.getElementById('displayAccountNo').innerText = accNo;
  document.getElementById('displayAccountName').innerText = accName;

  alert(`🏦 Bank account successfully updated to ${bank} (${accNo})!`);
  toggleChangeBankModal(false);
}

// Modal 6: Withdrawal
function toggleWithdrawalModal(show) {
  const modal = document.getElementById('withdrawalModal');
  if (modal) modal.style.display = show ? 'flex' : 'none';
}

function openWithdrawalModal() {
  toggleWithdrawalModal(true);
}

function processWithdrawal(event) {
  event.preventDefault();
  const amount = parseFloat(document.getElementById('withdrawAmount').value);
  
  if (amount > SELLER_CLEARED_BALANCE) {
    alert("❌ Amount exceeds available cleared balance.");
    return;
  }

  const remaining = SELLER_CLEARED_BALANCE - amount;
  document.getElementById('payoutAvailableBalance').innerText = `₦${remaining.toLocaleString()}.00`;

  alert(`💸 Payout request of ₦${amount.toLocaleString()}.00 submitted! Transferred to linked commercial bank account.`);
  toggleWithdrawalModal(false);
}

// Store Settings Form Handler
function saveStoreSettings(event) {
  event.preventDefault();
  alert("💾 Store Profile, CAC verification, and Shipping Policy settings saved successfully!");
}

/* ---- Window bridge: seller-dashboard.html still calls these via inline
   onclick/onsubmit. Same pattern used throughout this pass — see auth.js
   for the full explanation. saveNewProduct's inline handlers were already
   removed as part of the earlier XSS fix (real addEventListener calls
   attached in that function itself), so it isn't re-bridged here. */
window.switchSellerView = switchSellerView;
window.toggleAddProductModal = toggleAddProductModal;
window.deleteProduct = deleteProduct;
window.openEditProductModal = openEditProductModal;
window.toggleEditProductModal = toggleEditProductModal;
window.saveEditProduct = saveEditProduct;
window.openFulfillModal = openFulfillModal;
window.toggleFulfillModal = toggleFulfillModal;
window.saveFulfillStatus = saveFulfillStatus;
window.openOrderDetailsModal = openOrderDetailsModal;
window.toggleOrderDetailsModal = toggleOrderDetailsModal;
window.openWithdrawalModal = openWithdrawalModal;
window.toggleWithdrawalModal = toggleWithdrawalModal;
window.processWithdrawal = processWithdrawal;
window.openChangeBankModal = openChangeBankModal;
window.toggleChangeBankModal = toggleChangeBankModal;
window.saveBankDetails = saveBankDetails;
window.saveStoreSettings = saveStoreSettings;