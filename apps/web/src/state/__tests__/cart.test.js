import { describe, it, expect, beforeEach } from 'vitest';
import { addItem, removeItem, setQty, clearCart, getItems, getItemsBySeller, getTotal, subscribe } from '../cart.js';

// cart.js holds module-level state, so every test needs a clean slate —
// this is exactly the "one owner" property being tested: if two tests
// could see each other's leftover items, that owner wouldn't be reliable.
beforeEach(() => {
  clearCart();
});

describe('cart state (single owner)', () => {
  it('starts empty', () => {
    expect(getItems()).toEqual([]);
    expect(getTotal()).toBe(0);
  });

  it('adds a new item with quantity 1', () => {
    addItem({ id: 'p1', title: 'Sneakers', price: 15000, sellerId: 's1' });
    expect(getItems()).toHaveLength(1);
    expect(getItems()[0]).toMatchObject({ id: 'p1', qty: 1 });
  });

  it('increments quantity instead of duplicating when the same item is added twice', () => {
    addItem({ id: 'p1', title: 'Sneakers', price: 15000, sellerId: 's1' });
    addItem({ id: 'p1', title: 'Sneakers', price: 15000, sellerId: 's1' });
    expect(getItems()).toHaveLength(1);
    expect(getItems()[0].qty).toBe(2);
  });

  it('computes the total across quantities and items', () => {
    addItem({ id: 'p1', title: 'Sneakers', price: 15000, sellerId: 's1' });
    addItem({ id: 'p1', title: 'Sneakers', price: 15000, sellerId: 's1' }); // qty 2
    addItem({ id: 'p2', title: 'Cap', price: 4000, sellerId: 's2' });
    expect(getTotal()).toBe(15000 * 2 + 4000);
  });

  it('setQty never lets quantity drop below 1', () => {
    addItem({ id: 'p1', title: 'Sneakers', price: 15000, sellerId: 's1' });
    setQty('p1', 0);
    expect(getItems()[0].qty).toBe(1);
    setQty('p1', -5);
    expect(getItems()[0].qty).toBe(1);
  });

  it('removeItem takes exactly that item out, nothing else', () => {
    addItem({ id: 'p1', title: 'Sneakers', price: 15000, sellerId: 's1' });
    addItem({ id: 'p2', title: 'Cap', price: 4000, sellerId: 's2' });
    removeItem('p1');
    expect(getItems().map((i) => i.id)).toEqual(['p2']);
  });

  it('groups items by seller, the shape marketplace.html\'s per-seller cart cards need', () => {
    addItem({ id: 'p1', title: 'Sneakers', price: 15000, sellerId: 'sellerA' });
    addItem({ id: 'p2', title: 'Cap', price: 4000, sellerId: 'sellerA' });
    addItem({ id: 'p3', title: 'Bag', price: 20000, sellerId: 'sellerB' });

    const bySeller = getItemsBySeller();
    expect(Object.keys(bySeller).sort()).toEqual(['sellerA', 'sellerB']);
    expect(bySeller.sellerA).toHaveLength(2);
    expect(bySeller.sellerB).toHaveLength(1);
  });

  it('notifies subscribers on every change — this is what keeps the cart badge in sync', () => {
    const seen = [];
    const unsubscribe = subscribe((items) => seen.push(items.length));

    addItem({ id: 'p1', title: 'Sneakers', price: 15000, sellerId: 's1' });
    addItem({ id: 'p2', title: 'Cap', price: 4000, sellerId: 's2' });
    removeItem('p1');

    expect(seen).toEqual([1, 2, 1]);
    unsubscribe();

    addItem({ id: 'p3', title: 'Bag', price: 20000, sellerId: 's3' });
    expect(seen).toEqual([1, 2, 1]); // no new entry after unsubscribe
  });
});
