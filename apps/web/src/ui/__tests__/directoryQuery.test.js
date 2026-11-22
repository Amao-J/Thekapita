import { describe, expect, it } from 'vitest';
import { buildDirectoryQuery, DIRECTORY_PAGE_SIZE } from '@thekapita/shared/directoryQuery';

const q = (opts) => {
  const p = buildDirectoryQuery(opts);
  return p && Object.fromEntries(p);
};

describe('buildDirectoryQuery', () => {
  it('always asks only for directory rows, one page at a time', () => {
    expect(q({})).toEqual({ source: 'directory', limit: String(DIRECTORY_PAGE_SIZE), offset: '0' });
    expect(q({ offset: 60, limit: 10 })).toMatchObject({ limit: '10', offset: '60' });
  });

  it('sends a mode tab as the category; "restaurant" means the plain-restaurant bucket', () => {
    expect(q({ category: 'buka' }).category).toBe('buka');
    expect(q({ category: 'restaurant' }).category).toBe('external');
    expect(q({ category: 'all' })).not.toHaveProperty('category');
  });

  it('treats buka/fine chips as categories and any other chip as a text search', () => {
    expect(q({ chip: 'fine' }).category).toBe('fine');
    expect(q({ chip: 'swallow' }).q).toBe('swallow');
    expect(q({ chip: 'swallow' })).not.toHaveProperty('category');
    expect(q({ category: 'buka', chip: 'buka' }).category).toBe('buka');   // agreeing filters are fine
  });

  it('typed search wins over a text chip, and is trimmed', () => {
    expect(q({ chip: 'suya', q: '  amala  ' }).q).toBe('amala');
    expect(q({ q: '   ' })).not.toHaveProperty('q');
  });

  it('returns null when two filters contradict each other', () => {
    expect(buildDirectoryQuery({ category: 'buka', chip: 'fine' })).toBeNull();
    expect(buildDirectoryQuery({ category: 'grill', chip: 'buka' })).toBeNull();
  });

  it('adds the position only when both numbers are real', () => {
    expect(q({ position: { lat: 9.07, lng: 7.49 } })).toMatchObject({ lat: '9.07', lng: '7.49' });
    for (const position of [null, undefined, { lat: 9 }, { lat: NaN, lng: 7 }, { lat: 'x', lng: 'y' }]) {
      const p = q({ position });
      expect(p).not.toHaveProperty('lat');
      expect(p).not.toHaveProperty('lng');
    }
  });
});
