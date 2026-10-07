/**
 * SINGLE OWNER of the marketplace cart. The original market.js "stored"
 * the cart by editing DOM nodes directly — there was no cart data
 * structure anywhere, just whatever the page currently rendered. That
 * meant nothing else (a future checkout summary, an order-review step)
 * could read the cart without re-parsing the DOM. Now there's one array,
 * and the DOM is a *view* of it, not the storage for it.
 */
let items = []; // { id, title, price, sellerId, qty }
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => fn(items));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getItems() {
  return items;
}

export function addItem(product) {
  const existing = items.find((i) => i.id === product.id);
  if (existing) {
    existing.qty += 1;
  } else {
    items = [...items, { ...product, qty: 1 }];
  }
  notify();
}

export function removeItem(productId) {
  items = items.filter((i) => i.id !== productId);
  notify();
}

export function setQty(productId, qty) {
  items = items.map((i) => (i.id === productId ? { ...i, qty: Math.max(1, qty) } : i));
  notify();
}

export function clearCart() {
  items = [];
  notify();
}

export function getItemsBySeller() {
  return items.reduce((bySeller, item) => {
    (bySeller[item.sellerId] ||= []).push(item);
    return bySeller;
  }, {});
}

export function getTotal() {
  return items.reduce((sum, i) => sum + i.price * i.qty, 0);
}
