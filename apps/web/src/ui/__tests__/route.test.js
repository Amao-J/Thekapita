import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authorizedRequest: vi.fn(), isAuthenticated: vi.fn(() => true) }));
vi.mock('../../state/session.js', () => mocks);

const A = { lat: 9.9, lng: 8.9 };
const B = { lat: 9.95, lng: 8.95 };
const api = (over = {}) => ({ distance_km: 12.4, duration_min: 28, duration_no_traffic_min: 22, traffic_delay_min: 6, traffic: true, provider: 'tomtom', geometry: [[9.9, 8.9], [9.95, 8.95]], ...over });

let route;
beforeEach(async () => {
  vi.resetModules();
  mocks.authorizedRequest.mockReset();
  mocks.isAuthenticated.mockReturnValue(true);
  route = await import('../route.js');
});

describe('getRoadRoute', () => {
  it('maps the API response and asks for the right points', async () => {
    mocks.authorizedRequest.mockResolvedValue(api());
    const r = await route.getRoadRoute(A, B);
    expect(r).toMatchObject({ distanceKm: 12.4, minutes: 28, minutesNoTraffic: 22, delayMinutes: 6, traffic: true, provider: 'tomtom', source: 'road' });
    const url = mocks.authorizedRequest.mock.calls[0][0];
    expect(url).toContain('/routing/route?');
    expect(url).toContain('from_lat=9.9');
    expect(url).toContain('to_lng=8.95');
  });

  it('returns null (never throws) when signed out, offline, or the data is malformed', async () => {
    mocks.isAuthenticated.mockReturnValue(false);
    expect(await route.getRoadRoute(A, B)).toBeNull();
    expect(mocks.authorizedRequest).not.toHaveBeenCalled();
    mocks.isAuthenticated.mockReturnValue(true);
    mocks.authorizedRequest.mockRejectedValueOnce(new Error('502'));
    expect(await route.getRoadRoute(A, { lat: 9.96, lng: 8.96 })).toBeNull();
    mocks.authorizedRequest.mockResolvedValueOnce({ nonsense: true });
    expect(await route.getRoadRoute(A, { lat: 9.97, lng: 8.97 })).toBeNull();
    expect(await route.getRoadRoute(null, B)).toBeNull();
    expect(await route.getRoadRoute({ lat: NaN, lng: 1 }, B)).toBeNull();
  });

  it('shares one request between identical lookups and caches the answer', async () => {
    mocks.authorizedRequest.mockResolvedValue(api());
    const [x, y] = await Promise.all([route.getRoadRoute(A, B), route.getRoadRoute(A, B)]);
    expect(x).toBe(y);
    await route.getRoadRoute(A, B);
    expect(mocks.authorizedRequest).toHaveBeenCalledTimes(1);
  });

  it('does not cache failures', async () => {
    mocks.authorizedRequest.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(api());
    expect(await route.getRoadRoute(A, B)).toBeNull();
    expect(await route.getRoadRoute(A, B)).not.toBeNull();
  });
});

describe('describeRoute / estimateRoute', () => {
  it('words traffic honestly for each provider outcome', () => {
    const road = { source: 'road', distanceKm: 12.4, minutes: 28, traffic: true, delayMinutes: 6 };
    expect(route.describeRoute(road)).toBe('12 km by road \u2022 about 28 min (includes 6 min of traffic delay)');
    expect(route.describeRoute({ ...road, delayMinutes: 0 })).toContain('live traffic, clear roads');
    expect(route.describeRoute({ ...road, traffic: false })).toContain('no live traffic');
    expect(route.describeRoute({ ...road, distanceKm: 34.6 })).toContain('35 km by road'); // 10 km and over: whole km
    expect(route.describeRoute({ ...road, distanceKm: 3.24 })).toContain('3.2 km by road'); // under 10 km: one decimal
  });

  it('labels the fallback as an estimate, never as a road route', () => {
    const e = route.estimateRoute(A, B);
    expect(e.source).toBe('estimate');
    expect(e.distanceKm).toBeGreaterThan(6);
    expect(route.describeRoute(e)).toMatch(/straight line.*\(estimate\)$/);
    expect(route.describeRoute(e)).not.toMatch(/by road \u2022/);
  });
});

describe('live tracking helpers', () => {
  const trip = { pickup_lat: 9.9, pickup_lng: 8.9, destination_lat: 9.95, destination_lng: 8.95 };
  const driver = { lat: 9.88, lng: 8.88 };

  it('picks the leg that matches where the ride is', () => {
    expect(route.pickLeg({ ...trip, status: 'assigned' }, driver)).toMatchObject({ kind: 'to_pickup', from: driver, to: { lat: 9.9, lng: 8.9 } });
    expect(route.pickLeg({ ...trip, status: 'in_progress' }, driver)).toMatchObject({ kind: 'to_destination', to: { lat: 9.95, lng: 8.95 } });
    expect(route.pickLeg({ ...trip, status: 'requested' }, null)).toMatchObject({ kind: 'trip' });
    expect(route.pickLeg({ ...trip, status: 'arrived' }, driver)).toMatchObject({ kind: 'trip' });
    expect(route.pickLeg({ ...trip, status: 'assigned' }, null)).toMatchObject({ kind: 'trip' }); // driver has not reported a position yet
    expect(route.pickLeg({ ...trip, status: 'completed' }, driver)).toBeNull();
    expect(route.pickLeg({ status: 'in_progress' }, driver)).toBeNull();      // no destination coordinates
  });

  it('only re-routes when the leg changes, or the driver moved and 20 s passed', () => {
    const leg = route.pickLeg({ ...trip, status: 'assigned' }, driver);
    const prev = { kind: 'to_pickup', key: route.legKey(leg), at: 1_000_000 };
    expect(route.shouldRecalculate(null, leg, 1_000_000)).toBe(true);
    expect(route.shouldRecalculate(prev, leg, 1_030_000)).toBe(false);                       // same spot
    const moved = { ...leg, from: { lat: 9.885, lng: 8.885 } };
    expect(route.shouldRecalculate(prev, moved, 1_005_000)).toBe(false);                     // moved, but too soon
    expect(route.shouldRecalculate(prev, moved, 1_025_000)).toBe(true);                      // moved and 20 s passed
    expect(route.shouldRecalculate(prev, { ...moved, kind: 'to_destination' }, 1_001_000)).toBe(true); // new leg: immediately
    expect(route.shouldRecalculate(prev, null, 1_030_000)).toBe(false);
  });

  it('writes an ETA sentence only for the driver legs and only from a real road route', () => {
    const r = { source: 'road', distanceKm: 3.2, minutes: 9, traffic: true, delayMinutes: 3 };
    expect(route.legMessage({ kind: 'to_pickup' }, r)).toBe('Your driver is about 9 min away (3.2 km by road, 3 min of it traffic).');
    expect(route.legMessage({ kind: 'to_destination' }, { ...r, delayMinutes: 0 })).toBe('About 9 min to your destination (3.2 km by road).');
    expect(route.legMessage({ kind: 'trip' }, r)).toBeNull();
    expect(route.legMessage({ kind: 'to_pickup' }, { source: 'estimate' })).toBeNull();
  });
});
