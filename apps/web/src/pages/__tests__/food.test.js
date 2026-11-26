/**
 * Food page directory integration, with network requests mocked.
 * Skipped automatically when jsdom is not installed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const jsdom = await import('jsdom').catch(() => null);

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../state/session.js', () => ({
  authorizedRequest: vi.fn(),
  getCurrentUser: vi.fn(),
  hydrateProfile: vi.fn(),
  isAuthenticated: () => false,
}));
vi.mock('../../api/client.js', async (importOriginal) => ({
  ...(await importOriginal()),
  request: mocks.request,
}));

const OSM = '\u00A9 OpenStreetMap contributors';
const listing = (id, over = {}) => ({
  id,
  name: `Place ${id}`,
  category: 'restaurants',
  category_label: 'Restaurant & Food',
  description: '',
  address: `Wuse ${id}, Abuja`,
  city: 'Abuja',
  phone: '',
  hours: '',
  services: [],
  image_url: 'https://bucket.example/place.jpg',
  tier: 'standard',
  is_verified: false,
  attribution: OSM,
  latitude: null,
  longitude: null,
  rating: null,
  review_count: 0,
  distance_km: null,
  ...over,
});

describe.skipIf(!jsdom)('food page directory listings', () => {
  const $ = (id) => document.getElementById(id);

  async function boot(directoryRows) {
    vi.resetModules();
    mocks.request.mockReset().mockImplementation((path) => {
      if (!path.startsWith('/food/restaurants?')) throw new Error(`Unexpected API endpoint: ${path}`);
      const offset = Number(new URL(path, 'http://localhost').searchParams.get('offset'));
      return Promise.resolve(directoryRows[offset] || []);
    });
    const dom = new jsdom.JSDOM(`<!doctype html><body>
      <div id="srAnnouncer"></div>
      <div id="restaurantCardList"></div>
      <div id="restaurantDirectoryList"></div>
      <p id="restaurantDirectoryAttribution"></p>
      <span id="merchantCountTag"></span>
      <span id="directoryCountTag"></span>
      <div class="service-mode-toggle"><button class="mode-btn"></button></div>
    </body>`, { url: 'http://localhost/food.html' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    const addEventListener = document.addEventListener.bind(document);
    document.addEventListener = (type, ...args) => {
      if (type !== 'DOMContentLoaded') addEventListener(type, ...args);
    };
    await import('../food.js');
    await window.fetchRealVendorData();
    return dom;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('loads every Eats catalogue page and renders OSM places without menu or order actions', async () => {
    const makeDirectory = (id) => listing(id, {
      slug: `directory-${id}`,
      category: 'external',
      source: 'directory',
      is_orderable: false,
    });
    const firstPage = Array.from({ length: 100 }, (_, index) => makeDirectory(index + 1));
    const secondPage = [makeDirectory(101)];
    await boot({ 0: firstPage, 100: secondPage });

    expect(document.querySelectorAll('#restaurantDirectoryList .directory-restaurant-card')).toHaveLength(101);
    expect($('#restaurantDirectoryAttribution').textContent).toBe(`Restaurant directory data: ${OSM}`);
    expect($('#directoryCountTag').textContent).toBe('101 Listings');
    expect(document.querySelector('#restaurantDirectoryList button.btn-see-menu')).toBeNull();
    expect(document.querySelector('#restaurantDirectoryList').textContent).toContain('Not orderable');
    expect(document.querySelector('#restaurantDirectoryList img').getAttribute('src')).toBe('https://bucket.example/place.jpg');
    expect(mocks.request.mock.calls.map(([path]) =>
      new URL(path, 'http://localhost').searchParams.get('offset'),
    )).toEqual(['0', '100']);
  });

  it('keeps Buka directory places in the Buka tab and filters out generic restaurants', async () => {
    await boot({
      0: [
        listing(1, { name: 'Iya Bisi Bukateria', category: 'buka', source: 'directory', is_orderable: false, services: ['Local Buka'] }),
        listing(2, { name: 'City Restaurant', category: 'external', source: 'directory', is_orderable: false }),
      ],
    });
    const button = document.querySelector('.mode-btn');
    window.switchVendorCategory('buka', button);

    const bukaCard = document.querySelector('#restaurantDirectoryList .directory-restaurant-card[data-category="buka"]');
    const genericCard = document.querySelector('#restaurantDirectoryList .directory-restaurant-card[data-category="external"]');
    expect(bukaCard.style.display).toBe('flex');
    expect(genericCard.style.display).toBe('none');
    expect($('#directoryCountTag').textContent).toBe('1 Listings');
  });

  it('labels a Google photo as Google\'s on the picture and in words, and only then', async () => {
    await boot({
      0: [
        listing(1, { name: 'With Google', source: 'directory', is_orderable: false, image_credit: 'Photo \u00A9 Google \u00B7 by Jane' }),
        listing(2, { name: 'Own photo', source: 'directory', is_orderable: false }),
      ],
    });
    const [google, own] = document.querySelectorAll('#restaurantDirectoryList .directory-restaurant-card');
    expect(google.querySelector('.photo-credit-tag').textContent).toBe('\u00A9 Google');
    expect(google.textContent).toContain('Photo \u00A9 Google \u00B7 by Jane');
    expect(own.querySelector('.photo-credit-tag')).toBeNull();
  });
});
