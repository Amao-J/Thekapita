import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const json = (body, ok = true) => ({ ok, json: async () => body });

// map.js keeps call-spacing state at module level, so every test gets a fresh copy.
async function load(gapMs = 0) {
  vi.resetModules();
  vi.stubEnv('VITE_GEOCODER_MIN_GAP_MS', String(gapMs));
  return import('../map.js');
}

beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('shortLabel', () => {
  it('builds "street, area, city" and drops duplicates', async () => {
    const { shortLabel } = await load();
    expect(shortLabel({ address: { road: 'Admiralty Way', neighbourhood: 'Lekki Phase 1', city: 'Lagos' } }))
      .toBe('Admiralty Way, Lekki Phase 1, Lagos');
    expect(shortLabel({ name: 'Jos', address: { city: 'Jos' } })).toBe('Jos');
  });

  it('falls back to the first parts of display_name, then to empty', async () => {
    const { shortLabel } = await load();
    expect(shortLabel({ display_name: 'A Place, Some Ward, Some LGA, Plateau, Nigeria' })).toBe('A Place, Some Ward, Some LGA');
    expect(shortLabel(null)).toBe('');
    expect(shortLabel({})).toBe('');
  });
});

describe('geocoding lookups', () => {
  it('geocode returns numeric coordinates, or null when nothing matches or the call fails', async () => {
    const { geocode } = await load();
    fetch.mockResolvedValueOnce(json([{ lat: '9.0765', lon: '7.3986' }]));
    expect(await geocode('Wuse 2, Abuja')).toEqual({ lat: 9.0765, lng: 7.3986 });
    expect(fetch.mock.calls[0][0]).toContain('countrycodes=ng');

    fetch.mockResolvedValueOnce(json([]));
    expect(await geocode('nowhere at all')).toBeNull();

    fetch.mockRejectedValueOnce(new Error('offline'));
    expect(await geocode('Wuse 2')).toBeNull();

    const calls = fetch.mock.calls.length;
    expect(await geocode('   ')).toBeNull();
    expect(fetch.mock.calls.length).toBe(calls); // blank input never hits the network
  });

  it('reverseGeocode returns a short label, null on provider error, and never calls with bad coordinates', async () => {
    const { reverseGeocode } = await load();
    fetch.mockResolvedValueOnce(json({ address: { road: 'Ahmadu Bello Way', city: 'Abuja' } }));
    expect(await reverseGeocode(9.05, 7.49)).toBe('Ahmadu Bello Way, Abuja');
    expect(fetch.mock.calls[0][0]).toContain('lat=9.05&lon=7.49');

    fetch.mockResolvedValueOnce(json({ error: 'Unable to geocode' }));
    expect(await reverseGeocode(0, 0)).toBeNull();

    fetch.mockResolvedValueOnce(json({}, false));
    expect(await reverseGeocode(9, 7)).toBeNull();

    const calls = fetch.mock.calls.length;
    expect(await reverseGeocode(NaN, 7)).toBeNull();
    expect(await reverseGeocode(undefined, undefined)).toBeNull();
    expect(fetch.mock.calls.length).toBe(calls);
  });

  it('searchPlaces maps results, biases toward the user, and ignores tiny queries', async () => {
    const { searchPlaces } = await load();
    expect(await searchPlaces('a')).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockResolvedValueOnce(json([
      { lat: '9.9', lon: '8.9', address: { road: 'Bauchi Road', city: 'Jos' } },
      { lat: 'x', lon: 'y', address: { road: 'Broken' } },
    ]));
    const out = await searchPlaces('bauchi road', { near: { lat: 9.9, lng: 8.9 } });
    expect(out).toEqual([{ label: 'Bauchi Road, Jos', lat: 9.9, lng: 8.9 }]);
    expect(fetch.mock.calls[0][0]).toContain('viewbox=');
  });

  it('spaces consecutive lookups at least a second apart (Nominatim policy)', async () => {
    const { geocode } = await load(1100);
    vi.useFakeTimers();
    fetch.mockResolvedValue(json([{ lat: '1', lon: '2' }]));
    const first = geocode('one');
    const second = geocode('two');
    await vi.advanceTimersByTimeAsync(10);
    expect(fetch).toHaveBeenCalledTimes(1); // the second is waiting its turn
    await vi.advanceTimersByTimeAsync(1200);
    await Promise.all([first, second]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
