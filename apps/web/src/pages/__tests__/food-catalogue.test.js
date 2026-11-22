/**
 * Food page catalogue loading (food.js): vendors in one request, directory a page at a time with server-side filters.
 * jsdom + mocked network. Skipped automatically when jsdom is not installed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const jsdom = await import('jsdom').catch(() => null);

const mocks = vi.hoisted(() => ({
  request: vi.fn(), authorizedRequest: vi.fn(), locationAlreadyGranted: vi.fn(), currentPosition: vi.fn(), signedIn: false,
}));
vi.mock('../../state/session.js', () => ({
  authorizedRequest: mocks.authorizedRequest, isAuthenticated: () => mocks.signedIn, getCurrentUser: () => null, hydrateProfile: vi.fn(),
}));
vi.mock('../../api/client.js', async (importOriginal) => ({ ...(await importOriginal()), request: mocks.request }));
vi.mock('../../ui/map.js', async (importOriginal) => ({
  ...(await importOriginal()), locationAlreadyGranted: mocks.locationAlreadyGranted, currentPosition: mocks.currentPosition,
}));

const vendor = (id, over = {}) => ({
  id, slug: `v${id}`, name: `Vendor ${id}`, category: 'buka', category_label: 'Local Buka', tags: [], description: '', image_url: null,
  address: 'x', phone: '', hours: '', delivery_fee: 500, eta_min: 15, eta_max: 30, is_open: true, rating: null,
  source: 'food', is_orderable: true, attribution: null, services: [], review_count: 0, latitude: null, longitude: null, distance_km: null, ...over,
});
const place = (id, over = {}) => ({
  ...vendor(-id, over), slug: `directory-${id}`, name: `Place ${id}`, category: 'external', source: 'directory', is_orderable: false,
  is_open: false, delivery_fee: 0, eta_min: 0, eta_max: 0, ...over,
});
const places = (from, n, over = {}) => Array.from({ length: n }, (_, i) => place(from + i, over));

describe.skipIf(!jsdom)('food page catalogue', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  const calls = () => mocks.request.mock.calls.map(([url]) => new URL(url, 'http://x'));
  const directoryCalls = () => calls().filter((u) => u.searchParams.get('source') === 'directory');
  let dom;

  /** serve: vendors for source=food, `pages` (array of arrays) for successive source=directory calls */
  async function boot({ vendors = [vendor(1), vendor(2, { category: 'fine', category_label: 'Fine Dining' })], pages = [places(1, 30)], withSection = false, granted = false, signedIn = false, position = { lat: 9.07, lng: 7.49 } } = {}) {
    vi.resetModules();
    Object.values(mocks).forEach((m) => typeof m.mockReset === 'function' && m.mockReset());
    mocks.signedIn = signedIn;
    mocks.locationAlreadyGranted.mockResolvedValue(granted);
    mocks.currentPosition.mockImplementation(() => (position ? Promise.resolve(position) : new Promise(() => {}))); // null = GPS never answers
    let directoryIndex = 0;
    mocks.request.mockImplementation(async (url) => {
      const u = new URL(url, 'http://x');
      if (u.searchParams.get('source') === 'food') return vendors;
      return pages[Math.min(directoryIndex++, pages.length - 1)];
    });
    dom = new jsdom.JSDOM(`<!doctype html><body>
      <span id="merchantCountTag"></span><input id="foodSearchInput">
      <div class="service-mode-toggle"><button class="mode-btn active" id="tab-all"></button><button class="mode-btn" id="tab-buka"></button><button class="mode-btn" id="tab-fine"></button></div>
      <div class="cuisine-filter-bar"><button class="cuisine-chip active" id="chip-all"></button><button class="cuisine-chip" id="chip-swallow"></button><button class="cuisine-chip" id="chip-fine"></button></div>
      <div id="restaurantCardList"></div>
      ${withSection ? '<div id="restaurantDirectoryList"></div><p id="restaurantDirectoryAttribution" hidden></p>' : ''}
      <div id="fullMenuModal"><h3 id="fullMenuVendorName"></h3><div id="fullMenuList"></div></div>
      <select id="reservationRestaurant"></select><div id="toastContainer"></div><div id="srAnnouncer"></div></body>`, { url: 'http://localhost/food.html' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('navigator', { onLine: true });
    await import('../food.js');
    document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    await flush();
    await flush();
  }
  afterEach(() => vi.unstubAllGlobals());

  it('loads vendors in ONE request and the directory in ONE small page (never the whole catalogue)', async () => {
    await boot();
    const urls = calls();
    expect(urls).toHaveLength(2);
    expect(urls[0].searchParams.get('source')).toBe('food');
    expect(urls[0].searchParams.get('limit')).toBe('100');
    expect(urls[1].searchParams.get('source')).toBe('directory');
    expect(urls[1].searchParams.get('limit')).toBe('30');
    expect(urls[1].searchParams.get('offset')).toBe('0');
    expect(document.querySelectorAll('.restaurant-option-card:not(.directory-restaurant-card)')).toHaveLength(2);
    expect(document.querySelectorAll('.directory-restaurant-card')).toHaveLength(30);
  });

  it('creates the directory section itself when the page does not have one, and uses it when it does', async () => {
    await boot();
    expect($('restaurantDirectorySection')).not.toBeNull();
    expect($('restaurantDirectoryList').children).toHaveLength(30);
    expect($('directoryLoadMore')).not.toBeNull();
    await boot({ withSection: true });
    expect($('restaurantDirectorySection')).toBeNull();
    expect($('restaurantDirectoryList').children).toHaveLength(30);
  });

  it('"Show more" asks for the next page, appends without duplicates, and disappears at the end', async () => {
    await boot({ pages: [places(1, 30), [...places(28, 5)]] }); // second page overlaps ids 28-30
    expect($('directoryLoadMore').hidden).toBe(false);
    $('directoryLoadMore').click();
    await flush();
    await flush();
    expect(directoryCalls().at(-1).searchParams.get('offset')).toBe('30');
    expect(document.querySelectorAll('.directory-restaurant-card')).toHaveLength(30 + 2);
    expect($('directoryLoadMore').hidden).toBe(true); // a short page is the end
  });

  it('mode tabs filter vendors on the page and the directory on the server', async () => {
    await boot();
    window.switchVendorCategory('buka', $('tab-buka'));
    await wait(30);
    const cards = [...document.querySelectorAll('.restaurant-option-card:not(.directory-restaurant-card)')];
    expect(cards.map((c) => c.style.display)).toEqual(['flex', 'none']); // only the buka vendor stays
    const last = directoryCalls().at(-1);
    expect(last.searchParams.get('category')).toBe('buka');
    expect(last.searchParams.get('offset')).toBe('0');
    window.switchVendorCategory('all', $('tab-all'));
    await wait(30);
    expect(directoryCalls().at(-1).searchParams.has('category')).toBe(false);
  });

  it('cuisine chips: buka/fine are categories, other chips become a text search', async () => {
    await boot();
    window.filterByCuisine('swallow', $('chip-swallow'));
    await wait(30);
    expect(directoryCalls().at(-1).searchParams.get('q')).toBe('swallow');
    window.filterByCuisine('fine', $('chip-fine'));
    await wait(30);
    expect(directoryCalls().at(-1).searchParams.get('category')).toBe('fine');
    expect(directoryCalls().at(-1).searchParams.has('q')).toBe(false);
  });

  it('filters that cannot both be true show an honest empty message instead of asking the server', async () => {
    await boot();
    window.switchVendorCategory('buka', $('tab-buka'));
    await wait(30);
    const before = directoryCalls().length;
    window.filterByCuisine('fine', $('chip-fine'));   // "buka" tab + "fine dining" chip
    await wait(30);
    expect(directoryCalls().length).toBe(before);
    expect($('restaurantDirectoryList').textContent).toMatch(/No directory restaurants match/);
  });

  it('typing in search waits for a pause, then sends ONE request with the text', async () => {
    await boot();
    const before = directoryCalls().length;
    for (const text of ['s', 'su', 'suya']) {
      $('foodSearchInput').value = text;
      window.handleFilterSearch();
    }
    await wait(500);
    expect(directoryCalls().length).toBe(before + 1);
    expect(directoryCalls().at(-1).searchParams.get('q')).toBe('suya');
  });

  it('an older, slower directory answer cannot overwrite a newer one', async () => {
    await boot();
    let releaseSlow;
    mocks.request.mockReset();
    mocks.request
      .mockImplementationOnce(() => new Promise((resolve) => { releaseSlow = () => resolve(places(500, 3)); }))
      .mockResolvedValueOnce(places(900, 2));
    window.switchVendorCategory('buka', $('tab-buka'));
    await wait(20);                                   // slow request is in flight
    window.switchVendorCategory('fine', $('tab-fine'));
    await wait(30);                                   // newer one answers
    releaseSlow();
    await flush();
    expect([...document.querySelectorAll('.directory-restaurant-card h4')].map((n) => n.textContent)).toEqual(['Place 900', 'Place 901']);
  });

  it('uses the right picture rules: real photo if there is one; a neutral tile (not a stock photo) for places; stock for vendors', async () => {
    await boot({ vendors: [vendor(1)], pages: [[place(1, { image_url: 'https://img/p.jpg' }), place(2)]] });
    const dirImgs = [...document.querySelectorAll('.directory-restaurant-card img')];
    expect(dirImgs[0].getAttribute('src')).toBe('https://img/p.jpg');
    expect(dirImgs[0].alt).toBe('Place 1');
    expect(dirImgs[1].getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(dirImgs[1].alt).toBe('');                                      // decorative, not a claim about the place
    expect(document.querySelector('.restaurant-option-card:not(.directory-restaurant-card) img').getAttribute('src')).toMatch(/unsplash/);
  });

  it('asks for location only when the browser already allows it, then sends it and shows distance', async () => {
    await boot();
    expect(mocks.currentPosition).not.toHaveBeenCalled();           // no surprise permission prompt
    expect(calls().every((u) => !u.searchParams.has('lat'))).toBe(true);

    await boot({ granted: true, vendors: [vendor(1, { distance_km: 1.2 })], pages: [[place(1, { distance_km: 0.4 })]] });
    expect(calls().length).toBe(2);
    expect(calls().every((u) => u.searchParams.get('lat') === '9.07' && u.searchParams.get('lng') === '7.49')).toBe(true);
    expect(document.querySelector('.restaurant-option-card:not(.directory-restaurant-card)').textContent).toContain('1.2 km');
    expect(document.querySelector('.directory-restaurant-card').textContent).toContain('0.4 km away');
    window.switchVendorCategory('buka', $('tab-buka'));            // later directory requests keep the location too
    await wait(30);
    expect(directoryCalls().at(-1).searchParams.get('lat')).toBe('9.07');
  });

  it('a location request that never answers cannot block the restaurant list', async () => {
    const started = Date.now();
    await boot({ granted: true, position: null });
    await wait(2800);                                               // the page gives up on location after 2.5 s...
    expect(Date.now() - started).toBeLessThan(5000);                // ...and carries on without it
    expect(calls().every((u) => !u.searchParams.has('lat'))).toBe(true);
    expect(document.querySelectorAll('.directory-restaurant-card').length).toBe(30);
  }, 10000);

  describe('delivery estimate in the menu view', () => {
    const detail = (over = {}) => ({ ...vendor(1, { name: 'Pinned Buka', latitude: 9.05, longitude: 7.49, ...over }), menu: [{ id: 5, name: 'Amala', price: 1500, image_url: null }] });
    const open = async (opts, over, answer = { distance_km: 3.4, minutes: 12, source: 'road', traffic: true, provider: 'tomtom' }) => {
      await boot({ vendors: [vendor(1, { name: 'Pinned Buka', latitude: 9.05, longitude: 7.49, ...over })], granted: true, ...opts });
      if (answer instanceof Error) mocks.authorizedRequest.mockRejectedValue(answer);
      else mocks.authorizedRequest.mockResolvedValue(answer);   // set AFTER boot(), which resets every mock
      mocks.request.mockResolvedValueOnce(detail(over));
      await window.openFullVendorMenu('v1');
      await wait(20);
    };

    it('shows the road time when signed in, location is known and the restaurant is pinned', async () => {
      await open({ signedIn: true });
      expect(mocks.authorizedRequest.mock.calls[0][0]).toMatch(/\/food\/restaurants\/v1\/delivery-estimate\?lat=9\.07&lng=7\.49$/);
      expect($('fullMenuEta').textContent).toBe('About 12 min away by road, 3.4 km');
      expect($('fullMenuList').textContent).toContain('Amala');
    });

    it('labels a fallback as an estimate', async () => {
      await open({ signedIn: true }, {}, { distance_km: 3.4, minutes: 11, source: 'estimate', traffic: false, provider: 'none' });
      expect($('fullMenuEta').textContent).toBe('About 11 min away (estimate), 3.4 km');
    });

    it('stays quiet (and never blocks the menu) when it cannot apply or fails', async () => {
      await open({ signedIn: false });                                   // signed out
      expect(mocks.authorizedRequest).not.toHaveBeenCalled();
      expect($('fullMenuEta')).toBeNull();
      await open({ signedIn: true, granted: false });                    // location not allowed
      expect(mocks.authorizedRequest).not.toHaveBeenCalled();
      await open({ signedIn: true }, {}, new Error('502'));              // provider error
      expect(mocks.authorizedRequest).toHaveBeenCalled();
      expect($('fullMenuEta')).toBeNull();
      expect($('fullMenuList').textContent).toContain('Amala');
    });

    it('does not estimate for a restaurant that has not pinned its location', async () => {
      await open({ signedIn: true }, { latitude: null, longitude: null });
      expect(mocks.authorizedRequest).not.toHaveBeenCalled();
    });
  });

  it('shows the directory credit, and a retry button when loading fails', async () => {
    await boot({ pages: [[place(1, { attribution: '\u00A9 OpenStreetMap contributors' })]] });
    expect($('restaurantDirectoryAttribution').hidden).toBe(false);
    expect($('restaurantDirectoryAttribution').textContent).toContain('OpenStreetMap');
    await boot();
    mocks.request.mockReset().mockRejectedValue(new Error('offline'));
    window.switchVendorCategory('buka', $('tab-buka'));
    await wait(30);
    expect(document.querySelector('.directory-load-error')).not.toBeNull();
  });
});
