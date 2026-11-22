/**
 * Live ride page: road-route ETA text and the route line on the map (ride.js). jsdom + stubbed Leaflet and
 * network. Skipped automatically when jsdom is not installed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const jsdom = await import('jsdom').catch(() => null);

const mocks = vi.hoisted(() => ({ authorizedRequest: vi.fn(), getRoadRoute: vi.fn(), geocode: vi.fn() }));
vi.mock('../../state/session.js', () => ({ authorizedRequest: mocks.authorizedRequest, isAuthenticated: () => true }));
vi.mock('../../ui/route.js', async (importOriginal) => ({ ...(await importOriginal()), getRoadRoute: mocks.getRoadRoute }));
vi.mock('../../ui/map.js', async (importOriginal) => ({ ...(await importOriginal()), geocode: mocks.geocode }));

const IDS = ['rideRequestStatus', 'rideRequestReference', 'ridePickup', 'rideDestination', 'rideType', 'rideFare',
  'rideStatusBadge', 'rideDriverDetails', 'rideDriverName', 'rideDriverVehicle', 'rideOtpBox', 'rideOtp', 'rideFareStatus'];

const base = {
  reference: 'RIDE-1', status: 'assigned', ride_type: 'go', fare: '2200.00', pickup: 'A', destination: 'B', charged: true,
  pickup_lat: 9.9, pickup_lng: 8.9, destination_lat: 9.95, destination_lng: 8.95, pickup_otp: '1234',
  driver: { name: 'Dayo', vehicle: 'Corolla', plate_number: 'ABC', phone: '080', latitude: 9.88, longitude: 8.88 },
};

function fakeLeaflet() {
  const chain = () => { const o = { addTo: () => o, on: () => o, remove: vi.fn(), setLatLng: vi.fn(), setView: () => o }; return o; };
  const L = {
    lines: [],
    map: () => ({ ...chain(), fitBounds: () => {}, invalidateSize: () => {}, removeLayer: () => {} }),
    tileLayer: chain, control: { zoom: chain }, divIcon: (o) => o, marker: chain, latLngBounds: (p) => p,
    polyline(points, opts) { const l = { ...chain(), points, opts }; L.lines.push(l); return l; },
  };
  return L;
}

describe.skipIf(!jsdom)('live ride page: road route ETA', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));
  let dom; let L;

  async function boot(booking) {
    vi.resetModules();
    mocks.authorizedRequest.mockReset();
    mocks.geocode.mockReset().mockResolvedValue(null);
    mocks.authorizedRequest.mockResolvedValue(booking); // the poll returns the same ride
    dom = new jsdom.JSDOM(`<!doctype html><body>${IDS.map((id) => `<div id="${id}"></div>`).join('')}
      <a id="rideDriverPhone"></a><button id="cancelRideRequestBtn"></button><div id="rideMap"></div></body>`,
    { url: 'http://localhost/ride-active.html', pretendToBeVisual: true });
    L = fakeLeaflet();
    dom.window.L = L;
    dom.window.localStorage.setItem('kapita.ride.active.v1', JSON.stringify(booking));
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('localStorage', dom.window.localStorage);
    vi.stubGlobal('navigator', { onLine: true });
    await import('../ride.js');
    document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    await flush();
    await flush();
  }

  const status = () => document.getElementById('rideRequestStatus').textContent;
  afterEach(() => { vi.useRealTimers(); mocks.getRoadRoute.mockReset(); vi.unstubAllGlobals(); });

  it('while the driver is coming: straight-line text first, then the road ETA, with the route drawn', async () => {
    mocks.getRoadRoute.mockResolvedValue({ source: 'road', distanceKm: 3.2, minutes: 9, traffic: true, delayMinutes: 3, geometry: [[9.88, 8.88], [9.9, 8.9]] });
    await boot(base);
    expect(mocks.getRoadRoute).toHaveBeenCalledWith({ lat: 9.88, lng: 8.88 }, { lat: 9.9, lng: 8.9 }); // driver -> pickup
    expect(status()).toBe('Your driver is about 9 min away (3.2 km by road, 3 min of it traffic).');
    expect(L.lines).toHaveLength(1);
    expect(L.lines[0].opts.dashArray).toBeNull(); // a live leg is solid, the planned trip is dashed
  });

  it('keeps the road ETA across polls, and does not ask the provider again within 20 s', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }); // only the 5 s poll timer; the rest stays real
    mocks.getRoadRoute.mockResolvedValue({ source: 'road', distanceKm: 3.2, minutes: 9, traffic: false, delayMinutes: 0, geometry: [[9.88, 8.88], [9.9, 8.9]] });
    await boot(base);
    const eta = status();
    expect(eta).toContain('9 min away');
    expect(mocks.getRoadRoute).toHaveBeenCalledTimes(1);

    // The poll fires with the driver ~150 m closer. The rough straight-line text must not flash back, and the
    // routing provider must not be hit again this soon.
    mocks.authorizedRequest.mockResolvedValue({ ...base, driver: { ...base.driver, latitude: 9.8815, longitude: 8.8815 } });
    vi.advanceTimersByTime(5000);
    await flush();
    await flush();
    expect(mocks.authorizedRequest).toHaveBeenCalledTimes(2); // boot refresh + this poll
    expect(status()).toBe(eta);
    expect(mocks.getRoadRoute).toHaveBeenCalledTimes(1);
  });

  it('falls back to the straight-line wording when the road route is unavailable', async () => {
    mocks.getRoadRoute.mockResolvedValue(null);
    await boot(base);
    expect(status()).toMatch(/km away in a straight line\.$/);
    expect(L.lines).toHaveLength(0);
  });

  it('after pickup the leg is driver -> destination', async () => {
    mocks.getRoadRoute.mockResolvedValue({ source: 'road', distanceKm: 6, minutes: 14, traffic: false, delayMinutes: 0, geometry: [[9.9, 8.9], [9.95, 8.95]] });
    await boot({ ...base, status: 'in_progress', pickup_otp: null });
    expect(mocks.getRoadRoute).toHaveBeenCalledWith({ lat: 9.88, lng: 8.88 }, { lat: 9.95, lng: 8.95 });
    expect(status()).toBe('About 14 min to your destination (6.0 km by road).');
  });

  it('while waiting for a driver it previews the planned trip as a dashed line, without touching the status text', async () => {
    mocks.getRoadRoute.mockResolvedValue({ source: 'road', distanceKm: 6, minutes: 14, traffic: false, delayMinutes: 0, geometry: [[9.9, 8.9], [9.95, 8.95]] });
    await boot({ ...base, status: 'requested', driver: null });
    expect(L.lines[0].opts.dashArray).toBe('8 8');
    expect(status()).toMatch(/queued until a compatible driver/);
  });

  it('a finished ride shows no route and asks for none', async () => {
    mocks.getRoadRoute.mockResolvedValue({ source: 'road', distanceKm: 1, minutes: 2, traffic: false, delayMinutes: 0, geometry: [[1, 1], [2, 2]] });
    await boot({ ...base, status: 'completed' });
    expect(mocks.getRoadRoute).not.toHaveBeenCalled();
    expect(L.lines).toHaveLength(0);
  });
});
