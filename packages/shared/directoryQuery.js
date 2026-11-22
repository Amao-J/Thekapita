/**
 * How the Eats screens (web and mobile) turn their filters into a request for the restaurant directory.
 *
 * The directory can hold thousands of places, so the SERVER filters and pages them; the screens must never download
 * everything to filter locally. One implementation here keeps web and mobile identical.
 */
export const DIRECTORY_PAGE_SIZE = 30;

// Chips that name a restaurant type. Any other chip (swallow, suya, ...) is sent as a text search.
const CATEGORY_CHIPS = ['buka', 'fine'];

/**
 * category: the mode tab: 'all' | 'buka' | 'fine' | 'grill' | 'bakery' | 'external' ('restaurant' is accepted as 'external')
 * chip:     the cuisine chip: 'all' | 'buka' | 'fine' | any other word
 * q:        the search box text
 * position: { lat, lng } when known (the server then sorts nearest first and returns distance_km)
 *
 * Returns URLSearchParams, or null when the filters contradict each other (e.g. the Buka tab with the Fine Dining chip),
 * so the screen can show "nothing matches" without a pointless request.
 */
export function buildDirectoryQuery({ category = 'all', chip = 'all', q = '', offset = 0, limit = DIRECTORY_PAGE_SIZE, position = null } = {}) {
  let wanted = category === 'restaurant' ? 'external' : category;
  const chipCategory = CATEGORY_CHIPS.includes(chip) ? chip : null;
  if (chipCategory) {
    if (wanted !== 'all' && wanted !== chipCategory) return null;
    wanted = chipCategory;
  }
  const params = new URLSearchParams({ source: 'directory', limit: String(limit), offset: String(offset) });
  if (wanted !== 'all') params.set('category', wanted);
  const text = (q || '').trim() || (chip !== 'all' && !chipCategory ? chip : '');
  if (text) params.set('q', text);
  if (position && Number.isFinite(position.lat) && Number.isFinite(position.lng)) {
    params.set('lat', String(position.lat));
    params.set('lng', String(position.lng));
  }
  return params;
}
