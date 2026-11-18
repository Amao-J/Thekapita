/**
 * Directory page (directory.js) with the network mocked. Skipped automatically when jsdom is not installed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const jsdom = await import('jsdom').catch(() => null);

const mocks = vi.hoisted(() => ({ request: vi.fn(), authorizedRequest: vi.fn() }));
vi.mock('../../state/session.js', () => ({ authorizedRequest: mocks.authorizedRequest, isAuthenticated: () => false }));
vi.mock('../../api/client.js', async (importOriginal) => ({ ...(await importOriginal()), request: mocks.request }));

const IDS = ['directoryGrid', 'aiParsedFeedback', 'aiParsedText', 'directorySearchInput', 'gridViewBtn', 'listViewBtn',
  'reportEntitySelect', 'currentLocationLabel', 'detailModal', 'modalLogo', 'modalTitle', 'modalCategory', 'modalAddress',
  'modalPhone', 'modalHours', 'modalServices', 'modalAttribution', 'reviewCommentInput', 'modalReviewsList',
  'directoryAttribution'];

const listing = (id, over = {}) => ({
  id, name: `Place ${id}`, category: 'restaurants', category_label: 'Restaurant & Food', description: '', address: 'Wuse 2, Abuja',
  city: 'Abuja', phone: '', hours: '', services: [], tier: 'standard', is_verified: false, attribution: null,
  latitude: null, longitude: null, rating: null, review_count: 0, distance_km: null, ...over,
});
const OSM = '\u00A9 OpenStreetMap contributors';
const page = (from, n, over = {}) => Array.from({ length: n }, (_, i) => listing(from + i, over));

describe.skipIf(!jsdom)('directory page', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const $ = (id) => document.getElementById(id);
  const cards = () => document.querySelectorAll('#directoryGrid .directory-card');
  const lastUrl = () => new URL(mocks.request.mock.calls.at(-1)[0], 'http://x');

  async function boot(firstPage) {
    vi.resetModules();
    mocks.request.mockReset().mockResolvedValueOnce(firstPage);
    const dom = new jsdom.JSDOM(`<!doctype html><body>
      ${IDS.map((id) => (id === 'reportEntitySelect' ? `<select id="${id}"></select>` : id === 'directorySearchInput' ? `<input id="${id}">` : `<div id="${id}"></div>`)).join('')}
      <button id="loadMoreBtn" hidden></button><div id="starRatingRow"></div></body>`, { url: 'http://localhost/directories.html' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('navigator', {});
    await import('../directory.js');
    await flush();
    return dom;
  }
  afterEach(() => vi.unstubAllGlobals());

  it('loads the first page, then "Show more" appends the next one using the right offset', async () => {
    await boot(page(1, 60));
    expect(cards()).toHaveLength(60);
    expect(lastUrl().searchParams.get('limit')).toBe('60');
    expect(lastUrl().searchParams.get('offset')).toBe('0');
    expect($('loadMoreBtn').hidden).toBe(false);

    mocks.request.mockResolvedValueOnce(page(61, 25));
    $('loadMoreBtn').click();
    await flush();
    expect(lastUrl().searchParams.get('offset')).toBe('60');
    expect(cards()).toHaveLength(85);
    expect($('loadMoreBtn').hidden).toBe(true); // a short page means the end
  });

  it('never shows the same listing twice if a page overlaps', async () => {
    await boot(page(1, 60));
    mocks.request.mockResolvedValueOnce([...page(58, 5), ...page(100, 3)]); // ids 58-62 overlap 58-60
    $('loadMoreBtn').click();
    await flush();
    expect(cards()).toHaveLength(60 + 2 + 3);
  });

  it('a failed "Show more" keeps what is already on screen and lets you retry', async () => {
    await boot(page(1, 60));
    mocks.request.mockRejectedValueOnce(new Error('offline'));
    $('loadMoreBtn').click();
    await flush();
    expect(cards()).toHaveLength(60);
    expect($('loadMoreBtn').hidden).toBe(false);
    expect($('loadMoreBtn').disabled).toBe(false);
  });

  it('shows the licence credit only when imported listings are on screen', async () => {
    await boot([listing(1), listing(2, { attribution: OSM }), listing(3, { attribution: OSM })]);
    expect($('directoryAttribution').hidden).toBe(false);
    expect($('directoryAttribution').textContent).toBe(`Some listings: ${OSM}`); // one credit, not one per listing
    expect($('loadMoreBtn').hidden).toBe(true);

    await boot([listing(1), listing(2)]);
    expect($('directoryAttribution').hidden).toBe(true);
  });

  it('the detail view handles a listing with no phone, shows its credit, and cannot be used to inject HTML', async () => {
    await boot([listing(1, { name: '<img src=x onerror=alert(1)>Evil Buka', attribution: OSM })]);
    expect(document.querySelector('#directoryGrid img')).toBeNull(); // rendered as text, not parsed as HTML
    expect(document.querySelector('.entity-name').textContent).toContain('<img src=x');

    mocks.request.mockResolvedValueOnce({ ...listing(1, { attribution: OSM, services: ['Delivery', 'Cafe'] }), reviews: [] });
    document.querySelector('.directory-card button').click(); // "Details"
    await flush();
    expect($('modalPhone').textContent).toBe('Phone not listed');
    expect($('modalHours').textContent).toBe('Hours not provided');
    expect($('modalAttribution').hidden).toBe(false);
    expect($('modalAttribution').textContent).toBe(OSM);
    expect([...$('modalServices').children].map((n) => n.textContent)).toEqual(['Delivery', 'Cafe']);
  });

  it('switching the filter starts again from page 1 and an older, slower answer cannot overwrite it', async () => {
    await boot(page(1, 60));
    let releaseSlow;
    mocks.request.mockImplementationOnce(() => new Promise((res) => { releaseSlow = () => res(page(500, 3)); }));
    document.defaultView.setCategoryFilter('Restaurants', null);     // slow request starts
    mocks.request.mockResolvedValueOnce(page(900, 2));
    document.defaultView.setCategoryFilter('Schools', null);         // newer request answers first
    await flush();
    releaseSlow();
    await flush();
    expect(cards()).toHaveLength(2);
    expect(document.querySelector('.entity-name').textContent).toBe('Place 900');
    expect(lastUrl().searchParams.get('category')).toBe('schools');
    expect(lastUrl().searchParams.get('offset')).toBe('0');
  });
});
