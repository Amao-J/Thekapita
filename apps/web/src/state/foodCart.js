/**
 * The Eats cart: several dishes from ONE restaurant, placed as a single escrow order.
 *
 * The backend (POST /food/orders) has always accepted many items for one restaurant, but the page used to open a
 * one-dish modal per click, so a customer could only ever order one dish at a time. This module is the single owner
 * of the cart; the page renders it and sends it, nothing else keeps a copy.
 *
 * Escrow pays one restaurant per order, so a cart never mixes restaurants: adding from a different restaurant returns
 * { conflict: true } and the page asks before replacing the cart.
 */
export const MAX_QTY = 50; // matches OrderItemIn.qty (le=50) on the server
export const MAX_LINES = 50; // matches OrderCreateIn.items max_length

const STORAGE_KEY = 'kapita.foodCart.v1';
const listeners = new Set();
let cart = { slug: '', vendor: '', lines: [] }; // lines: { id, name, price, img, qty }

function store() {
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}

function persist() {
  try {
    const s = store();
    if (!s) return;
    if (cart.lines.length) s.setItem(STORAGE_KEY, JSON.stringify(cart));
    else s.removeItem(STORAGE_KEY);
  } catch {
    /* storage is only a convenience */
  }
}

function notify() {
  persist();
  listeners.forEach((fn) => fn(getCart()));
}

/** Restore a cart saved earlier in this browser tab (so a page refresh does not lose it). */
export function restoreCart() {
  try {
    const raw = store()?.getItem(STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && typeof saved.slug === 'string' && Array.isArray(saved.lines)) {
      const lines = saved.lines
        .filter((l) => Number.isInteger(l?.id) && Number.isFinite(Number(l.price)) && Number(l.qty) >= 1)
        .map((l) => ({ id: l.id, name: String(l.name), price: Number(l.price), img: l.img || '', qty: Math.min(MAX_QTY, Math.floor(Number(l.qty))) }));
      cart = lines.length ? { slug: saved.slug, vendor: String(saved.vendor || ''), lines } : { slug: '', vendor: '', lines: [] };
    }
  } catch {
    cart = { slug: '', vendor: '', lines: [] };
  }
  notify();
  return getCart();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getCart() {
  return { slug: cart.slug, vendor: cart.vendor, lines: cart.lines.map((l) => ({ ...l })) };
}

export function isEmpty() {
  return cart.lines.length === 0;
}

export function itemCount() {
  return cart.lines.reduce((n, l) => n + l.qty, 0);
}

export function subtotal() {
  return cart.lines.reduce((sum, l) => sum + l.price * l.qty, 0);
}

/**
 * Add `qty` of a dish. `restaurant` is { slug, name }; `item` is { id, name, price, img }.
 * Returns { ok: true } or { conflict: true } (cart holds another restaurant) or { full: true }.
 */
export function addItem(restaurant, item, qty = 1) {
  if (cart.lines.length && cart.slug !== restaurant.slug) return { conflict: true };
  const existing = cart.lines.find((l) => l.id === item.id);
  if (!existing && cart.lines.length >= MAX_LINES) return { full: true };
  if (existing) {
    existing.qty = Math.min(MAX_QTY, existing.qty + qty);
  } else {
    cart.lines.push({ id: item.id, name: item.name, price: Number(item.price), img: item.img || '', qty: Math.min(MAX_QTY, Math.max(1, qty)) });
  }
  cart.slug = restaurant.slug;
  cart.vendor = restaurant.name;
  notify();
  return { ok: true };
}

/** Throw away the current cart and start a new one (after the customer agreed to switch restaurants). */
export function replaceWith(restaurant, item, qty = 1) {
  cart = { slug: '', vendor: '', lines: [] };
  return addItem(restaurant, item, qty);
}

export function changeQty(id, delta) {
  const line = cart.lines.find((l) => l.id === id);
  if (!line) return;
  line.qty = Math.min(MAX_QTY, line.qty + delta);
  if (line.qty < 1) cart.lines = cart.lines.filter((l) => l.id !== id);
  if (!cart.lines.length) cart = { slug: '', vendor: '', lines: [] };
  notify();
}

export function removeItem(id) {
  cart.lines = cart.lines.filter((l) => l.id !== id);
  if (!cart.lines.length) cart = { slug: '', vendor: '', lines: [] };
  notify();
}

export function clearCart() {
  cart = { slug: '', vendor: '', lines: [] };
  notify();
}

/** The body fields POST /food/orders needs for this cart. */
export function orderPayload(address) {
  return { restaurant: cart.slug, items: cart.lines.map((l) => ({ id: l.id, qty: l.qty })), address };
}
