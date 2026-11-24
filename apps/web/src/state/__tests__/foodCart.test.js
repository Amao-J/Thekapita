import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as cart from '../foodCart.js';

const mama = { slug: 'mama', name: 'Mama Put' };
const jollof = { id: 11, name: 'Jollof', price: 1500 };
const rice = { id: 12, name: 'Fried Rice', price: 2000 };

describe('food cart', () => {
  beforeEach(() => cart.clearCart());

  it('holds several dishes from one restaurant and totals them', () => {
    cart.addItem(mama, jollof);
    cart.addItem(mama, rice, 2);
    cart.addItem(mama, jollof);
    expect(cart.getCart().lines.map((l) => [l.id, l.qty])).toEqual([[11, 2], [12, 2]]);
    expect(cart.itemCount()).toBe(4);
    expect(cart.subtotal()).toBe(7000);
  });

  it('builds ONE order payload for the whole cart', () => {
    cart.addItem(mama, jollof);
    cart.addItem(mama, rice, 3);
    expect(cart.orderPayload('12 Wuse')).toEqual({
      restaurant: 'mama',
      items: [{ id: 11, qty: 1 }, { id: 12, qty: 3 }],
      address: '12 Wuse',
    });
  });

  it('never mixes restaurants: reports a conflict and leaves the cart alone until replaced', () => {
    cart.addItem(mama, jollof);
    expect(cart.addItem({ slug: 'other', name: 'Other' }, { id: 21, name: 'Suya', price: 3000 })).toEqual({ conflict: true });
    expect(cart.getCart().slug).toBe('mama');
    expect(cart.replaceWith({ slug: 'other', name: 'Other' }, { id: 21, name: 'Suya', price: 3000 })).toEqual({ ok: true });
    expect(cart.getCart().lines.map((l) => l.id)).toEqual([21]);
  });

  it('changes quantity, drops a line at zero, and empties the cart with the last line', () => {
    cart.addItem(mama, jollof);
    cart.addItem(mama, rice);
    cart.changeQty(11, 1);
    expect(cart.getCart().lines[0].qty).toBe(2);
    cart.changeQty(11, -2);
    expect(cart.getCart().lines.map((l) => l.id)).toEqual([12]);
    cart.removeItem(12);
    expect(cart.isEmpty()).toBe(true);
    expect(cart.getCart().slug).toBe('');
  });

  it('caps a line at the server limit of 50', () => {
    cart.addItem(mama, jollof, 49);
    cart.addItem(mama, jollof, 5);
    expect(cart.getCart().lines[0].qty).toBe(cart.MAX_QTY);
  });

  it('notifies subscribers and hands out copies, not the live cart', () => {
    const seen = vi.fn();
    const off = cart.subscribe(seen);
    cart.addItem(mama, jollof);
    expect(seen).toHaveBeenCalledTimes(1);
    cart.getCart().lines[0].qty = 99;
    expect(cart.itemCount()).toBe(1);
    off();
    cart.addItem(mama, rice);
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
