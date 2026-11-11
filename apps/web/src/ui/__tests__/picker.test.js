/**
 * Drives the real picker.js against jsdom with a stubbed Leaflet. Skipped automatically when jsdom is not
 * installed (`npm i -D jsdom` to run it). It cannot judge how the map *looks*; that needs a real browser.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const jsdom = await import('jsdom').catch(() => null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (body) => ({ ok: true, json: async () => body });

function fakeLeaflet() {
  const handlers = (o) => { o._h = {}; o.on = (e, fn) => { (o._h[e] ||= []).push(fn); return o; }; o.fire = (e, a) => (o._h[e] || []).forEach((fn) => fn(a)); return o; };
  const L = {
    maps: [], markers: [],
    map(el) {
      const m = handlers({ el, view: null, removed: false, zoom: 13,
        setView(c, z) { m.view = c; m.zoom = z ?? m.zoom; return m; }, getZoom: () => m.zoom,
        invalidateSize() {}, remove() { m.removed = true; } });
      L.maps.push(m);
      return m;
    },
    tileLayer: () => ({ addTo() {} }),
    control: { zoom: () => ({ addTo() {} }) },
    divIcon: (o) => o,
    marker(latlng, opts) {
      const mk = handlers({ latlng, opts, addTo() { return mk; }, setLatLng(ll) { mk.latlng = ll; }, getLatLng: () => ({ lat: mk.latlng[0] ?? mk.latlng.lat, lng: mk.latlng[1] ?? mk.latlng.lng }) });
      L.markers.push(mk);
      return mk;
    },
  };
  return L;
}

describe.skipIf(!jsdom)('map location picker', () => {
  let dom; let L; let pickLocation; let opener;

  async function boot({ withLeaflet = true, geo = null, granted = false } = {}) {
    vi.resetModules();
    vi.stubEnv('VITE_GEOCODER_MIN_GAP_MS', '0');
    dom = new jsdom.JSDOM('<!doctype html><body><button id="opener">open</button></body>');
    L = fakeLeaflet();
    if (withLeaflet) dom.window.L = L;
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('navigator', {
      permissions: { query: async () => ({ state: granted ? 'granted' : 'prompt' }) },
      geolocation: geo ? { getCurrentPosition: (ok, bad) => (geo === 'deny' ? bad(new Error('denied')) : ok({ coords: geo })) } : undefined,
    });
    ({ pickLocation } = await import('../picker.js'));
    opener = document.getElementById('opener');
    opener.focus();
  }

  const q = (sel) => document.querySelector(sel);
  const tap = (lat, lng) => L.maps[0].fire('click', { latlng: { lat, lng } });
  const key = (k) => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('tap the map, wait for the address, confirm -> resolves lat/lng/address and cleans up', async () => {
    await boot();
    fetch.mockResolvedValue(json({ address: { road: 'Bauchi Road', city: 'Jos' } }));
    const result = pickLocation({ title: 'Choose pickup point' });
    expect(q('#mapPickerTitle').textContent).toBe('Choose pickup point');
    expect(q('.map-picker-confirm').disabled).toBe(true); // nothing chosen yet
    tap(9.92, 8.89);
    expect(q('.map-picker-confirm').disabled).toBe(false);
    await sleep(500);
    expect(q('.map-picker-status').textContent).toBe('Bauchi Road, Jos');
    q('.map-picker-confirm').click();
    expect(await result).toEqual({ lat: 9.92, lng: 8.89, address: 'Bauchi Road, Jos' });
    expect(q('.map-picker-overlay')).toBeNull();
    expect(L.maps[0].removed).toBe(true);
    expect(document.activeElement).toBe(opener);
  });

  it('falls back to the coordinates when no address can be found', async () => {
    await boot();
    fetch.mockResolvedValue(json({ error: 'Unable to geocode' }));
    const result = pickLocation({});
    tap(9.5, 8.5);
    await sleep(500);
    expect(q('.map-picker-status').textContent).toContain('9.50000, 8.50000');
    q('.map-picker-confirm').click();
    expect(await result).toEqual({ lat: 9.5, lng: 8.5, address: '9.50000, 8.50000' });
  });

  it('Escape and the close button cancel with null', async () => {
    await boot();
    const a = pickLocation({});
    key('Escape');
    expect(await a).toBeNull();
    expect(q('.map-picker-overlay')).toBeNull();
    const b = pickLocation({});
    q('.map-picker-close').click();
    expect(await b).toBeNull();
  });

  it('only keeps the address of the most recent pin when answers arrive out of order', async () => {
    await boot();
    let releaseSlow;
    fetch
      .mockImplementationOnce(() => new Promise((res) => { releaseSlow = () => res(json({ address: { road: 'Old Pin Street' } })); }))
      .mockImplementationOnce(async () => json({ address: { road: 'New Pin Street' } }));
    const result = pickLocation({});
    tap(1, 1);
    await sleep(450);         // first lookup starts and hangs
    tap(2, 2);
    await sleep(450);         // second lookup answers immediately
    releaseSlow();            // the first answer limps in late
    await sleep(20);
    expect(q('.map-picker-status').textContent).toBe('New Pin Street');
    q('.map-picker-confirm').click();
    expect(await result).toEqual({ lat: 2, lng: 2, address: 'New Pin Street' });
  });

  it('dragging the pin moves the chosen point', async () => {
    await boot();
    fetch.mockResolvedValue(json({ address: { road: 'Somewhere' } }));
    const result = pickLocation({});
    tap(1, 1);
    L.markers[0].setLatLng([3, 4]);
    L.markers[0].fire('dragend');
    await sleep(500);
    q('.map-picker-confirm').click();
    expect(await result).toMatchObject({ lat: 3, lng: 4 });
  });

  it('"Use my location" pins the GPS position; a denied permission explains itself and pins nothing', async () => {
    await boot({ geo: { latitude: 9.9, longitude: 8.9 } });
    fetch.mockResolvedValue(json({ address: { road: 'Gwong Road', city: 'Jos' } }));
    const ok = pickLocation({});
    q('.map-picker-gps').click();
    await sleep(500);
    expect(L.maps[0].view).toEqual([9.9, 8.9]);
    q('.map-picker-confirm').click();
    expect(await ok).toEqual({ lat: 9.9, lng: 8.9, address: 'Gwong Road, Jos' });

    await boot({ geo: 'deny' });
    const denied = pickLocation({});
    q('.map-picker-gps').click();
    await sleep(20);
    expect(q('.map-picker-status').textContent).toMatch(/Could not read your location/);
    expect(q('.map-picker-confirm').disabled).toBe(true);
    key('Escape');
    expect(await denied).toBeNull();
  });

  it('search results can be chosen, and the chosen name is kept without a reverse lookup', async () => {
    await boot();
    fetch.mockResolvedValue(json([{ lat: '9.93', lon: '8.88', address: { road: 'Murtala Mohammed Way', city: 'Jos' } }]));
    const result = pickLocation({ near: { lat: 9.9, lng: 8.9 } });
    q('.map-picker-search').value = 'murtala';
    q('.map-picker-searchrow').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    await sleep(30);
    q('.map-picker-result').click();
    await sleep(500); // longer than the pin-settle delay: a reverse lookup must NOT fire
    expect(fetch).toHaveBeenCalledTimes(1);
    q('.map-picker-confirm').click();
    expect(await result).toEqual({ lat: 9.93, lng: 8.88, address: 'Murtala Mohammed Way, Jos' });
  });

  it('starts on the initial point and opens only one picker at a time', async () => {
    await boot();
    fetch.mockResolvedValue(json({ address: { road: 'Start Road' } }));
    const first = pickLocation({ initial: { lat: 9.1, lng: 7.2 } });
    expect(pickLocation({})).toBe(first);
    expect(document.querySelectorAll('.map-picker-overlay').length).toBe(1);
    expect(q('.map-picker-confirm').disabled).toBe(false); // initial point is already pinned
    key('Escape');
    await first;
  });

  it('degrades gracefully when Leaflet did not load', async () => {
    await boot({ withLeaflet: false });
    const result = pickLocation({});
    expect(q('.map-picker-status').textContent).toMatch(/could not be loaded/);
    expect(q('.map-picker-confirm').disabled).toBe(true);
    q('.map-picker-close').click();
    expect(await result).toBeNull();
  });
});
