/**
 * Directory page (directory.js) with the network mocked. Skipped automatically when jsdom is not installed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const jsdom = await import('jsdom').catch(() => null);

const mocks = vi.hoisted(() => ({ request: vi.fn(), authorizedRequest: vi.fn(), uploadPhoto: vi.fn(), signedIn: false }));
vi.mock('../../state/session.js', () => ({ authorizedRequest: mocks.authorizedRequest, isAuthenticated: () => mocks.signedIn }));
vi.mock('../../ui/image.js', () => ({ uploadPhoto: mocks.uploadPhoto }));
vi.mock('../../api/client.js', async (importOriginal) => ({ ...(await importOriginal()), request: mocks.request }));

const IDS = ['directoryGrid', 'aiParsedFeedback', 'aiParsedText', 'directorySearchInput', 'gridViewBtn', 'listViewBtn',
  'reportEntitySelect', 'currentLocationLabel', 'detailModal', 'modalLogo', 'modalTitle', 'modalCategory', 'modalAddress',
  'modalPhone', 'modalHours', 'modalServices', 'modalAttribution', 'reviewCommentInput', 'modalReviewsList',
  'directoryAttribution', 'modalVerifiedBanner'];

const listing = (id, over = {}) => ({
  id, name: `Place ${id}`, category: 'restaurants', category_label: 'Restaurant & Food', description: '', address: 'Wuse 2, Abuja',
  city: 'Abuja', phone: '', hours: '', services: [], tier: 'standard', is_verified: false, attribution: null,
  image_url: null, can_upload_image: false,
  latitude: null, longitude: null, rating: null, review_count: 0, distance_km: null, ...over,
});
const OSM = '\u00A9 OpenStreetMap contributors';
const page = (from, n, over = {}) => Array.from({ length: n }, (_, i) => listing(from + i, over));

describe.skipIf(!jsdom)('directory page', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const $ = (id) => document.getElementById(id);
  const cards = () => document.querySelectorAll('#directoryGrid .directory-card');
  const lastUrl = () => new URL(mocks.request.mock.calls.at(-1)[0], 'http://x');

  let dom;
  async function boot(firstPage) {
    vi.resetModules();
    mocks.request.mockReset().mockResolvedValueOnce(firstPage);
    mocks.authorizedRequest.mockReset();
    mocks.uploadPhoto.mockReset();
    mocks.signedIn = false;
    dom = new jsdom.JSDOM(`<!doctype html><body>
      ${IDS.map((id) => (id === 'reportEntitySelect' ? `<select id="${id}"></select>` : id === 'directorySearchInput' ? `<input id="${id}">` : `<div id="${id}"></div>`)).join('')}
      <button id="loadMoreBtn" hidden></button><div id="starRatingRow"></div>
      <img id="modalImage" hidden><form id="modalImageUploadForm" hidden><input id="modalImageInput" type="file">
      <button type="submit">Upload photo</button><button type="button" id="modalImageRemoveBtn" hidden></button></form></body>`, { url: 'http://localhost/directories.html' });
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

  it('renders an uploaded listing photo in its card', async () => {
    await boot([listing(1, { image_url: 'https://bucket.example/photo.jpg' })]);
    const image = document.querySelector('.entity-logo-box img');
    expect(image.getAttribute('src')).toBe('https://bucket.example/photo.jpg');
    expect(image.getAttribute('alt')).toBe('Place 1 photo');
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

  describe('photos and the verified badge in the detail view', () => {
    const open = async (over, { signedIn = false } = {}) => {
      await boot([listing(1)]);
      mocks.signedIn = signedIn;
      const detail = { ...listing(1, over), reviews: [] };
      (signedIn ? mocks.authorizedRequest : mocks.request).mockResolvedValueOnce(detail);
      document.querySelector('.directory-card button').click();
      await flush();
    };

    it('shows the photo when there is one and drops the src attribute (not src="") when there is none', async () => {
      await open({ image_url: 'https://img.example/a.jpg' });
      expect($('modalImage').getAttribute('src')).toBe('https://img.example/a.jpg');
      expect($('modalImage').hidden).toBe(false);
      await open({ image_url: null });
      expect($('modalImage').hasAttribute('src')).toBe(false);
      expect($('modalImage').hidden).toBe(true);
    });

    it('only people who may edit the listing see the upload form, and Remove only when there is a photo', async () => {
      await open({ image_url: 'https://img.example/a.jpg', can_upload_image: false });
      expect($('modalImageUploadForm').hidden).toBe(true);
      await open({ image_url: null, can_upload_image: true }, { signedIn: true });
      expect($('modalImageUploadForm').hidden).toBe(false);
      expect($('modalImageRemoveBtn').hidden).toBe(true);
      await open({ image_url: 'https://img.example/a.jpg', can_upload_image: true }, { signedIn: true });
      expect($('modalImageRemoveBtn').hidden).toBe(false);
    });

    it('claims "verified" only for listings staff verified', async () => {
      await open({ is_verified: false });
      expect($('modalVerifiedBanner').hidden).toBe(true);
      await open({ is_verified: true });
      expect($('modalVerifiedBanner').hidden).toBe(false);
    });

    it('removing the photo calls DELETE for that listing and refreshes the view', async () => {
      await open({ image_url: 'https://img.example/a.jpg', can_upload_image: true }, { signedIn: true });
      mocks.authorizedRequest
        .mockResolvedValueOnce({ id: 1, image_key: '', image_url: null })             // the DELETE
        .mockResolvedValueOnce({ ...listing(1, { image_url: null, can_upload_image: true }), reviews: [] }); // re-open
      mocks.request.mockResolvedValue([listing(1)]);                                    // list refresh
      document.defaultView.removeSelectedListingImage();
      await flush();
      await flush();
      expect(mocks.authorizedRequest.mock.calls[1]).toEqual(['/directory/listings/1/image', { method: 'DELETE' }]);
      expect($('modalImage').hidden).toBe(true);
    });

    it('uploading goes through the shared resize-and-upload helper with this listing\'s endpoints', async () => {
      await open({ can_upload_image: true }, { signedIn: true });
      mocks.uploadPhoto.mockImplementationOnce(async (file, { issue, confirm }) => {
        await issue({ filename: 'a.jpg', content_type: 'image/jpeg', size: 10 });
        await confirm('the-key');
      });
      mocks.authorizedRequest.mockResolvedValue({ ...listing(1), reviews: [] });
      Object.defineProperty($('modalImageInput'), 'files', { value: [new dom.window.File(['x'], 'a.jpg', { type: 'image/jpeg' })] });
      document.defaultView.uploadSelectedListingImage({ preventDefault() {}, target: $('modalImageUploadForm') });
      await flush();
      await flush();
      const urls = mocks.authorizedRequest.mock.calls.map((c) => c[0]);
      expect(urls).toContain('/directory/listings/1/image/upload-url');
      expect(mocks.authorizedRequest.mock.calls.find((c) => c[0] === '/directory/listings/1/image')[1]).toEqual({ method: 'POST', body: { key: 'the-key' } });
    });
  });
});
