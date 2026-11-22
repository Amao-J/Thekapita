/**
 * Vendor dashboard (food-vendor.js) against the REAL food-vendor-dashboard.html, with a fake API behind it.
 * Skipped automatically when jsdom is not installed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const jsdom = await import('jsdom').catch(() => null);

const mocks = vi.hoisted(() => ({ authorizedRequest: vi.fn(), pickLocation: vi.fn(), uploadPhoto: vi.fn() }));
vi.mock('../../state/session.js', () => ({ authorizedRequest: mocks.authorizedRequest, isAuthenticated: () => true }));
vi.mock('../../ui/picker.js', () => ({ pickLocation: mocks.pickLocation }));
vi.mock('../../ui/image.js', () => ({ uploadPhoto: mocks.uploadPhoto }));

const html = fs.readFileSync(path.resolve(import.meta.dirname, '../../../food-vendor-dashboard.html'), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '');

const STORE = {
  id: 1, slug: 'iya-basira', name: 'Iya Basira', category: 'buka', category_label: 'Authentic Local Buka', address: '1 Road', phone: '0800',
  hours: '', image_url: null, is_open: true, is_active: true, latitude: null, longitude: null, tags: [], delivery_fee: 500,
};

describe.skipIf(!jsdom)('vendor dashboard', () => {
  const $ = (id) => document.getElementById(id);
  const flush = () => new Promise((r) => setTimeout(r, 0));
  let dom;
  let store;
  let menu;
  const sent = () => mocks.authorizedRequest.mock.calls.map(([url, opts]) => `${(opts?.method || 'GET')} ${url}`);
  const bodyOf = (method, url) => mocks.authorizedRequest.mock.calls.find(([u, o]) => u === url && (o?.method || 'GET') === method)?.[1]?.body;

  async function boot({ storeOver = {}, menuRows = [] } = {}) {
    vi.resetModules();
    Object.values(mocks).forEach((m) => m.mockReset());
    store = { ...STORE, ...storeOver };
    menu = menuRows.map((m) => ({ ...m }));
    mocks.authorizedRequest.mockImplementation(async (url, opts = {}) => {
      const method = opts.method || 'GET';
      if (url === '/food/vendor/me') return store;
      if (url === '/food/vendor/orders') return [];
      if (url === '/food/vendor/summary') return { sales_today: 0, active_orders: 0, completed_today: 0, balance: 0 };
      if (url === '/food/vendor/menu' && method === 'GET') return menu;
      if (url === '/food/vendor/menu' && method === 'POST') { const d = { id: 77, is_available: true, image_url: null, ...opts.body }; return d; }
      if (url === '/food/vendor/store' && method === 'PATCH') { store = { ...store, ...opts.body }; return store; }
      if (url === '/food/vendor/store/image' && method === 'DELETE') { store = { ...store, image_key: '', image_url: null }; return { image_key: '', image_url: null }; }
      return {};
    });
    dom = new jsdom.JSDOM(html, { url: 'http://localhost/food-vendor-dashboard.html' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('setInterval', () => 0);
    await import('../food-vendor.js');
    await flush();
    await flush();
  }
  afterEach(() => vi.unstubAllGlobals());

  it('loads the store, orders, menu and summary for a vendor', async () => {
    await boot();
    expect(sent()).toEqual(expect.arrayContaining(['GET /food/vendor/me', 'GET /food/vendor/orders', 'GET /food/vendor/menu', 'GET /food/vendor/summary']));
    expect($('storeNameInput').value).toBe('Iya Basira');
    expect($('storePinStatus').textContent).toMatch(/Not pinned yet/);
    expect($('storePinBtn').textContent).toBe('Pin on map');
    expect($('storePhotoRemove').hidden).toBe(true);
  });

  it('pinning the store sends ONLY the coordinates and keeps unsaved edits in the form', async () => {
    await boot();
    $('storeNameInput').value = 'Typed but not saved yet';
    mocks.pickLocation.mockResolvedValueOnce({ lat: 9.0765, lng: 7.4951, address: 'Wuse 2' });
    await window.pinStoreOnMap();
    expect(bodyOf('PATCH', '/food/vendor/store')).toEqual({ latitude: 9.0765, longitude: 7.4951 });
    expect($('storeNameInput').value).toBe('Typed but not saved yet');
    expect($('storePinStatus').textContent).toContain('Pinned (9.0765, 7.4951)');
    expect($('storePinBtn').textContent).toBe('Move pin');
    expect(mocks.pickLocation.mock.calls[0][0].initial).toBeNull();
  });

  it('moving an existing pin starts the map on the current one; cancelling changes nothing', async () => {
    await boot({ storeOver: { latitude: 9.05, longitude: 7.49 } });
    expect($('storePinBtn').textContent).toBe('Move pin');
    mocks.pickLocation.mockResolvedValueOnce(null);
    await window.pinStoreOnMap();
    expect(mocks.pickLocation.mock.calls[0][0].initial).toEqual({ lat: 9.05, lng: 7.49 });
    expect(sent().filter((s) => s.startsWith('PATCH'))).toEqual([]);
  });

  it('uploading a store photo uses the store endpoints, updates the sidebar, and offers Remove', async () => {
    await boot();
    mocks.uploadPhoto.mockImplementationOnce(async (file, { issue, confirm }) => {
      await issue({ filename: 'a.jpg', content_type: 'image/jpeg', size: 10 });
      await confirm('k1');
      return { image_key: 'k1', image_url: 'https://img/store.jpg' };
    });
    const file = new dom.window.File(['x'], 'a.jpg', { type: 'image/jpeg' });
    await window.uploadStorePhoto({ target: { files: [file], value: 'x' } });
    expect(sent()).toEqual(expect.arrayContaining(['POST /food/vendor/store/image/upload-url', 'POST /food/vendor/store/image']));
    expect(bodyOf('POST', '/food/vendor/store/image')).toEqual({ key: 'k1' });
    expect($('sidebarStoreAvatar').getAttribute('src')).toBe('https://img/store.jpg');
    expect($('storePhotoRemove').hidden).toBe(false);
    expect($('storePhotoStatus').textContent).toBe('Photo saved.');

    await window.removeStorePhoto();
    expect(sent()).toContain('DELETE /food/vendor/store/image');
    expect($('storePhotoRemove').hidden).toBe(true);
  });

  it('a failed store photo shows the reason in place and keeps the form usable', async () => {
    await boot();
    mocks.uploadPhoto.mockRejectedValueOnce(new Error('That photo is too large (8 MB maximum).'));
    await window.uploadStorePhoto({ target: { files: [new dom.window.File(['x'], 'a.jpg', { type: 'image/jpeg' })], value: 'x' } });
    expect($('storePhotoStatus').textContent).toBe('That photo is too large (8 MB maximum).');
    expect($('storePhotoRemove').hidden).toBe(true);
  });

  it('adding a dish with a photo saves the dish first, then uploads the photo to THAT dish', async () => {
    await boot();
    $('newDishName').value = 'Jollof';
    $('newDishPrice').value = '1500';
    $('dishCategoryHidden').value = 'Rice';
    Object.defineProperty($('newDishPhoto'), 'files', { value: [new dom.window.File(['x'], 'j.jpg', { type: 'image/jpeg' })], configurable: true });
    mocks.uploadPhoto.mockImplementationOnce(async (file, { issue, confirm }) => {
      await issue({ filename: 'j.jpg', content_type: 'image/jpeg', size: 1 });
      await confirm('dk');
      return { image_key: 'dk', image_url: 'https://img/jollof.jpg' };
    });
    await window.handleAddNewDish({ preventDefault() {}, target: $('addDishForm') || dom.window.document.createElement('form') });
    expect(bodyOf('POST', '/food/vendor/menu')).toEqual({ name: 'Jollof', price: 1500, category: 'Rice' }); // no image link sent
    expect(sent()).toEqual(expect.arrayContaining(['POST /food/vendor/menu/77/image/upload-url', 'POST /food/vendor/menu/77/image']));
    expect($('vendor-menu-list').textContent).toContain('Jollof');
    expect($('vendor-menu-list').querySelector('img').getAttribute('src')).toBe('https://img/jollof.jpg');
  });

  it('if only the dish photo fails, the dish is still on the menu and the vendor is told how to retry', async () => {
    await boot();
    $('newDishName').value = 'Amala';
    $('newDishPrice').value = '2000';
    $('dishCategoryHidden').value = 'Swallow';
    Object.defineProperty($('newDishPhoto'), 'files', { value: [new dom.window.File(['x'], 'a.jpg', { type: 'image/jpeg' })], configurable: true });
    mocks.uploadPhoto.mockRejectedValueOnce(new Error('Could not reach photo storage.'));
    await window.handleAddNewDish({ preventDefault() {}, target: dom.window.document.createElement('form') });
    expect($('vendor-menu-list').textContent).toContain('Amala');
    expect($('vendor-menu-list').textContent).toContain('Add photo');            // a retry button is right there on the row
    expect($('toastContainer')?.textContent || document.body.textContent).toMatch(/dish was added, but its photo was not/i);
  });

  it('every dish row has a photo button, labelled by whether it already has one', async () => {
    await boot({ menuRows: [
      { id: 1, name: 'With Pic', price: 1000, category: 'x', is_available: true, image_url: 'https://img/a.jpg' },
      { id: 2, name: 'No Pic', price: 1000, category: 'x', is_available: true, image_url: null },
    ] });
    const labels = [...$('vendor-menu-list').querySelectorAll('button')].map((b) => b.textContent);
    expect(labels).toEqual(['Change photo', 'Add photo']);
  });
});
