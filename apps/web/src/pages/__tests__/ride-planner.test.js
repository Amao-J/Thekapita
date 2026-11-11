/**
 * Ride booking form glue (ride.js): map-picked points, typed addresses, swap, same-place guard.
 * Uses jsdom with the picker and network mocked. Skipped automatically when jsdom is not installed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const jsdom = await import('jsdom').catch(() => null);

const mocks = vi.hoisted(() => ({
  authorizedRequest: vi.fn(),
  pickLocation: vi.fn(),
  geocode: vi.fn(),
  currentPosition: vi.fn(),
  reverseGeocode: vi.fn(),
  locationAlreadyGranted: vi.fn(),
}));

vi.mock('../../state/session.js', () => ({ authorizedRequest: mocks.authorizedRequest, isAuthenticated: () => true }));
vi.mock('../../ui/picker.js', () => ({ pickLocation: mocks.pickLocation }));
vi.mock('../../ui/map.js', async (importOriginal) => ({
  ...(await importOriginal()),
  geocode: mocks.geocode,
  currentPosition: mocks.currentPosition,
  reverseGeocode: mocks.reverseGeocode,
  locationAlreadyGranted: mocks.locationAlreadyGranted,
}));

const JOS = { lat: 9.9, lng: 8.9, address: 'Bauchi Road, Jos' };
const FAR = { lat: 9.95, lng: 8.95, address: 'Rayfield, Jos' };

describe.skipIf(!jsdom)('ride planner form', () => {
  let dom;
  const $ = (id) => document.getElementById(id);
  const booked = () => mocks.authorizedRequest.mock.calls.find(([path]) => String(path).includes('/rides'))?.[1];

  async function boot({ granted = false, setup = () => {} } = {}) {
    vi.resetModules();
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.authorizedRequest.mockResolvedValue({ reference: 'RIDE-1', balance: '0' });
    mocks.locationAlreadyGranted.mockResolvedValue(granted);
    setup();
    dom = new jsdom.JSDOM(`<!doctype html><body>
      <input id="rideOriginInput"><input id="rideDestinationInput">
      <p id="rideRouteSummary" hidden></p><button id="requestRideBtn"></button>
      <div id="globalErrorNotice" style="display:none"><span id="globalErrorText"></span></div>
    </body>`, { url: 'http://localhost/ride.html' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('localStorage', dom.window.localStorage);
    vi.stubGlobal('navigator', { onLine: true });
    await import('../ride.js');
    document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    await Promise.resolve();
  }

  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {})); // jsdom "navigation not implemented" noise
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('map-picked points fill the boxes, show distance, and are sent exactly (no geocoding)', async () => {
    await boot();
    mocks.pickLocation.mockResolvedValueOnce(JOS).mockResolvedValueOnce(FAR);
    await window.pickRideLocation('pickup');
    await window.pickRideLocation('destination');
    expect($('rideOriginInput').value).toBe('Bauchi Road, Jos');
    expect($('rideDestinationInput').value).toBe('Rayfield, Jos');
    expect($('rideRouteSummary').hidden).toBe(false);
    expect($('rideRouteSummary').textContent).toMatch(/\d+\.\d km apart .* roughly \d+ min/);
    // the second picker opens near the first choice and with the right title
    expect(mocks.pickLocation.mock.calls[1][0]).toMatchObject({ title: 'Choose destination', near: { lat: 9.9, lng: 8.9 } });

    await window.confirmRideBooking();
    expect(mocks.geocode).not.toHaveBeenCalled();
    expect(booked().body).toMatchObject({
      pickup: 'Bauchi Road, Jos', destination: 'Rayfield, Jos',
      pickup_lat: 9.9, pickup_lng: 8.9, destination_lat: 9.95, destination_lng: 8.95,
    });
  });

  it('editing the text by hand drops the old map point and falls back to looking the address up', async () => {
    await boot();
    mocks.pickLocation.mockResolvedValueOnce(JOS).mockResolvedValueOnce(FAR);
    await window.pickRideLocation('pickup');
    await window.pickRideLocation('destination');
    const input = $('rideOriginInput');
    input.value = 'Terminus Market, Jos';
    input.dispatchEvent(new dom.window.Event('input'));
    expect($('rideRouteSummary').hidden).toBe(true); // distance no longer known
    mocks.geocode.mockResolvedValueOnce({ lat: 9.92, lng: 8.88 });

    await window.confirmRideBooking();
    expect(mocks.geocode).toHaveBeenCalledTimes(1);
    expect(mocks.geocode).toHaveBeenCalledWith('Terminus Market, Jos');
    expect(booked().body).toMatchObject({ pickup_lat: 9.92, pickup_lng: 8.88, destination_lat: 9.95, destination_lng: 8.95 });
  });

  it('a failed address lookup still lets the ride be booked (without coordinates)', async () => {
    await boot();
    $('rideOriginInput').value = 'Somewhere typed';
    $('rideDestinationInput').value = 'Elsewhere typed';
    mocks.geocode.mockResolvedValue(null);
    await window.confirmRideBooking();
    expect(booked().body).toMatchObject({ pickup_lat: null, destination_lng: null, pickup: 'Somewhere typed' });
  });

  it('swap carries the coordinates along with the text', async () => {
    await boot();
    mocks.pickLocation.mockResolvedValueOnce(JOS).mockResolvedValueOnce(FAR);
    await window.pickRideLocation('pickup');
    await window.pickRideLocation('destination');
    window.swapLocations();
    expect($('rideOriginInput').value).toBe('Rayfield, Jos');
    await window.confirmRideBooking();
    expect(booked().body).toMatchObject({ pickup_lat: 9.95, pickup_lng: 8.95, destination_lat: 9.9, destination_lng: 8.9 });
  });

  it('refuses a ride whose pickup and destination are the same spot', async () => {
    await boot();
    mocks.pickLocation.mockResolvedValueOnce(JOS).mockResolvedValueOnce({ ...JOS, lat: 9.90001 });
    await window.pickRideLocation('pickup');
    await window.pickRideLocation('destination');
    await window.confirmRideBooking();
    expect(booked()).toBeUndefined();
    expect($('globalErrorText').textContent).toMatch(/same place/);
  });

  it('cancelling the picker changes nothing', async () => {
    await boot();
    $('rideOriginInput').value = 'Typed already';
    mocks.pickLocation.mockResolvedValueOnce(null);
    await window.pickRideLocation('pickup');
    expect($('rideOriginInput').value).toBe('Typed already');
  });

  it('pre-fills pickup from GPS only when location was already allowed, and never overwrites typing', async () => {
    await boot({ granted: false });
    expect($('rideOriginInput').value).toBe('');
    expect(mocks.currentPosition).not.toHaveBeenCalled(); // no surprise permission prompt

    await boot({
      granted: true,
      setup: () => {
        mocks.currentPosition.mockResolvedValue({ lat: 9.91, lng: 8.91 });
        mocks.reverseGeocode.mockResolvedValue('Gwong Road, Jos');
      },
    });
    await new Promise((r) => setTimeout(r, 10));
    expect($('rideOriginInput').value).toBe('Gwong Road, Jos');
    expect($('rideRouteSummary').hidden).toBe(true); // only one end known

    // The GPS fix lands, then the person starts typing while the street name is still being looked up.
    let finishLookup;
    await boot({
      granted: true,
      setup: () => {
        mocks.currentPosition.mockResolvedValue({ lat: 9.91, lng: 8.91 });
        mocks.reverseGeocode.mockImplementation(() => new Promise((res) => { finishLookup = res; }));
      },
    });
    await new Promise((r) => setTimeout(r, 10));
    $('rideOriginInput').value = 'My own text';
    $('rideOriginInput').dispatchEvent(new dom.window.Event('input'));
    finishLookup('Gwong Road, Jos');
    await new Promise((r) => setTimeout(r, 10));
    expect($('rideOriginInput').value).toBe('My own text');
  });
});
