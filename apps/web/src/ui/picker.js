/**
 * Map location picker: a dialog with a Leaflet map where the person taps (or drags the pin) to choose a
 * place, can search for an address, or use their GPS position.
 *
 *   const spot = await pickLocation({ title: 'Choose pickup', initial: {lat, lng}, near: {lat, lng} });
 *   // -> { lat, lng, address } or null if they cancelled
 *
 * Leaflet is loaded by a <script> tag in the page (window.L). If it failed to load, the dialog says so
 * and resolves null, so typing an address still works.
 */
import { DEFAULT_CENTER, createMap, currentPosition, hasCoords, locationAlreadyGranted, pin, reverseGeocode, searchPlaces } from './map.js';
import { h } from './dom.js';

let active = null; // only one picker can be open at a time

const coordsLabel = (p) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;

export function pickLocation({ title = 'Choose location', initial = null, near = null, emoji = '\uD83D\uDCCD', color = '#008a57' } = {}) {
  if (active) return active;

  active = new Promise((resolve) => {
    const opener = document.activeElement;
    let map = null;
    let marker = null;
    let point = null;           // {lat, lng} currently pinned
    let address = '';
    let lookupToken = 0;        // ignore reverse-geocode answers that arrive after a newer pin move
    let settleTimer = null;

    const status = h('p', { class: 'map-picker-status', 'aria-live': 'polite' }, 'Tap the map to drop a pin.');
    const confirmBtn = h('button', { type: 'button', class: 'map-picker-confirm', disabled: true, onclick: () => finish({ ...point, address: address || coordsLabel(point) }) }, 'Confirm location');
    const results = h('ul', { class: 'map-picker-results', hidden: true });
    const searchInput = h('input', { type: 'search', class: 'map-picker-search', placeholder: 'Search a street, area or landmark', 'aria-label': 'Search for a place', autocomplete: 'off' });
    const canvas = h('div', { class: 'map-picker-canvas', id: 'mapPickerCanvas', role: 'application', 'aria-label': 'Map. Tap to choose a location.' });
    const useGpsBtn = h('button', { type: 'button', class: 'map-picker-gps', onclick: useMyLocation }, 'Use my location');

    const dialog = h('div', { class: 'map-picker', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mapPickerTitle' },
      h('div', { class: 'map-picker-head' },
        h('h2', { id: 'mapPickerTitle' }, title),
        h('button', { type: 'button', class: 'map-picker-close', 'aria-label': 'Close map', onclick: () => finish(null) }, '\u00D7'),
      ),
      h('form', { class: 'map-picker-searchrow', onsubmit: runSearch }, searchInput, h('button', { type: 'submit', class: 'map-picker-searchbtn' }, 'Search')),
      results,
      canvas,
      status,
      h('div', { class: 'map-picker-foot' }, useGpsBtn, confirmBtn),
    );
    const overlay = h('div', { class: 'map-picker-overlay', onmousedown: (e) => { if (e.target === overlay) finish(null); } }, dialog);

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); finish(null); }
      else if (e.key === 'Tab') trapFocus(e);
    }

    function trapFocus(e) {
      const items = [...dialog.querySelectorAll('button:not([disabled]), input')].filter((el) => !el.closest('[hidden]'));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    function finish(value) {
      clearTimeout(settleTimer);
      lookupToken += 1;
      document.removeEventListener('keydown', onKey, true);
      if (map) map.remove();
      overlay.remove();
      active = null;
      if (opener && typeof opener.focus === 'function') opener.focus();
      resolve(value);
    }

    function placePin(p, { recenter = false, zoom } = {}) {
      point = { lat: p.lat, lng: p.lng };
      address = '';
      const L = window.L;
      if (!marker) {
        marker = L.marker([p.lat, p.lng], { draggable: true, icon: pin(emoji, color), keyboard: true, title: 'Drag to adjust' }).addTo(map);
        marker.on('dragend', () => placePin(marker.getLatLng()));
      } else {
        marker.setLatLng([p.lat, p.lng]);
      }
      if (recenter) map.setView([p.lat, p.lng], zoom ?? Math.max(map.getZoom(), 16));
      confirmBtn.disabled = false;
      status.textContent = 'Finding the address...';
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => resolveAddress(point), 400); // wait until the pin stops moving
    }

    async function resolveAddress(p) {
      const token = ++lookupToken;
      const label = await reverseGeocode(p.lat, p.lng);
      if (token !== lookupToken) return; // a newer pin position superseded this answer
      address = label || '';
      status.textContent = label || `No street name found here. We will use the pin position (${coordsLabel(p)}).`;
    }

    async function useMyLocation() {
      useGpsBtn.disabled = true;
      status.textContent = 'Getting your location...';
      const here = await currentPosition();
      useGpsBtn.disabled = false;
      if (!here) { status.textContent = 'Could not read your location. Check your browser permission, or tap the map instead.'; return; }
      placePin(here, { recenter: true, zoom: 17 });
    }

    async function runSearch(e) {
      e.preventDefault();
      const q = searchInput.value.trim();
      if (q.length < 2) return;
      status.textContent = 'Searching...';
      results.replaceChildren();
      results.hidden = true;
      const hits = await searchPlaces(q, { near: point || near });
      if (!hits.length) { status.textContent = 'No matches. Try a nearby landmark, or tap the map.'; return; }
      status.textContent = 'Choose a result, or tap the map.';
      results.replaceChildren(...hits.map((hit) => h('li', {},
        h('button', { type: 'button', class: 'map-picker-result', onclick: () => {
          results.hidden = true;
          placePin(hit, { recenter: true, zoom: 17 });
          address = hit.label;
          clearTimeout(settleTimer); // we already know the name; don't overwrite it with a reverse lookup
          status.textContent = hit.label;
        } }, hit.label))));
      results.hidden = false;
    }

    document.body.append(overlay);
    document.addEventListener('keydown', onKey, true);

    if (!window.L) {
      status.textContent = 'The map could not be loaded. Close this and type the address instead.';
      useGpsBtn.disabled = true;
      searchInput.disabled = true;
      dialog.querySelector('.map-picker-close').focus();
      canvas.hidden = true;
      return;
    }

    const start = hasCoords(initial?.lat, initial?.lng) ? initial : hasCoords(near?.lat, near?.lng) ? near : null;
    map = createMap('mapPickerCanvas', { center: start ? [start.lat, start.lng] : DEFAULT_CENTER, zoom: start ? 16 : 13 });
    map.on('click', (e) => placePin(e.latlng));
    setTimeout(() => map.invalidateSize(), 0); // the dialog was just inserted; Leaflet needs a real size
    searchInput.focus();

    if (hasCoords(initial?.lat, initial?.lng)) {
      placePin(initial);
    } else {
      // Centre on the person when the browser already allows it; never trigger a surprise permission prompt here.
      locationAlreadyGranted().then(async (granted) => {
        if (!granted || point) return;
        const here = await currentPosition();
        if (here && !point && map) map.setView([here.lat, here.lng], 16);
      });
    }
  });

  return active;
}
