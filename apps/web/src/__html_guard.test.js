/**
 * Guard: an element with the `hidden` attribute AND its own inline `display` value is never actually hidden (the inline
 * style beats the browser's [hidden] rule). It already caused an upload form to show for everyone. Fails if it recurs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const pages = fs.readdirSync(root).filter((f) => f.endsWith('.html'));

describe('html pages', () => {
  it('has pages to check', () => expect(pages.length).toBeGreaterThan(5));

  it.each(pages)('%s: no element combines hidden with an inline display', (page) => {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const offenders = [...html.matchAll(/<[a-z0-9-]+\b[^>]*>/gi)]
      .map((m) => m[0])
      .filter((tag) => /\shidden(\s|>|=)/i.test(tag) && /style\s*=\s*"[^"]*\bdisplay\s*:/i.test(tag));
    expect(offenders).toEqual([]);
  });
});
