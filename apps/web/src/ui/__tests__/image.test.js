import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const file = (name, type, size = 100) => new File([new Uint8Array(size)], name, { type });

describe('prepareImage / uploadPhoto', () => {
  let image;
  let drawn;
  let encodeTo;

  beforeEach(async () => {
    vi.resetModules();
    drawn = [];
    encodeTo = (size) => new Blob([new Uint8Array(size)], { type: 'image/jpeg' });
    const ctx = { fillStyle: '', fillRect: (...a) => drawn.push(['fill', ctx.fillStyle, ...a]), drawImage: (...a) => drawn.push(['draw', ...a.slice(1)]) };
    const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob: (cb) => cb(encodeTo(canvas.width)) };
    vi.stubGlobal('document', { createElement: () => canvas });
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 3000, height: 2000, close: vi.fn() })));
    image = await import('../image.js');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shrinks big photos to 1600px on the long edge, keeps the shape, and outputs a JPEG', async () => {
    const out = await image.prepareImage(file('IMG_0001.HEIC.png', 'image/png', 6_000_000));
    expect(drawn.find((d) => d[0] === 'draw').slice(3)).toEqual([1600, 1067]); // width, height drawn
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('IMG_0001.HEIC.jpg');
    expect(createImageBitmap).toHaveBeenCalledWith(expect.anything(), { imageOrientation: 'from-image' }); // rotates like the phone showed it
  });

  it('never enlarges small photos, and flattens transparency onto white', async () => {
    createImageBitmap.mockResolvedValueOnce({ width: 800, height: 600, close: vi.fn() });
    await image.prepareImage(file('logo.png', 'image/png'));
    expect(drawn.find((d) => d[0] === 'draw').slice(3)).toEqual([800, 600]);
    expect(drawn[0]).toEqual(['fill', '#ffffff', 0, 0, 800, 600]);
  });

  it('refuses things that are not JPEG, PNG or WebP', async () => {
    for (const bad of [file('a.gif', 'image/gif'), file('a.svg', 'image/svg+xml'), file('a.pdf', 'application/pdf'), null]) {
      await expect(image.prepareImage(bad)).rejects.toThrow(/JPEG, PNG, or WebP/);
    }
  });

  it('refuses a result that is still too large', async () => {
    encodeTo = () => new Blob([new Uint8Array(9 * 1024 * 1024)]);
    await expect(image.prepareImage(file('huge.jpg', 'image/jpeg'))).rejects.toThrow(/too large/);
  });

  it('falls back to the original when the browser cannot decode or encode', async () => {
    createImageBitmap.mockRejectedValueOnce(new Error('decode failed'));
    const original = file('odd.jpg', 'image/jpeg', 500);
    expect(await image.prepareImage(original)).toBe(original);
    vi.stubGlobal('createImageBitmap', undefined);
    expect(await image.prepareImage(original)).toBe(original);
    await expect(image.prepareImage(file('big.jpg', 'image/jpeg', 9 * 1024 * 1024))).rejects.toThrow(/too large/);
  });

  it('uploads in the order the storage service requires: policy fields first, the file last, then confirm', async () => {
    const issue = vi.fn(async () => ({ key: 'k1', upload_url: 'https://storage.example/up', fields: { key: 'k1', policy: 'p' } }));
    const confirm = vi.fn(async (key) => ({ image_url: `https://img/${key}` }));
    const post = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', post);
    const result = await image.uploadPhoto(file('shop.jpg', 'image/jpeg', 2_000_000), { issue, confirm });
    expect(issue).toHaveBeenCalledWith({ filename: 'shop.jpg', content_type: 'image/jpeg', size: 1600 });
    const body = post.mock.calls[0][1].body;
    expect([...body.keys()]).toEqual(['key', 'policy', 'file']);
    expect(post.mock.calls[0][0]).toBe('https://storage.example/up');
    expect(confirm).toHaveBeenCalledWith('k1');
    expect(result).toEqual({ image_url: 'https://img/k1' });
  });

  it('does not confirm a photo the storage service rejected or could not be reached', async () => {
    const issue = vi.fn(async () => ({ key: 'k1', upload_url: 'https://storage.example/up', fields: {} }));
    const confirm = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403 })));
    await expect(image.uploadPhoto(file('a.jpg', 'image/jpeg'), { issue, confirm })).rejects.toMatchObject({ status: 403 });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(image.uploadPhoto(file('a.jpg', 'image/jpeg'), { issue, confirm })).rejects.toThrow(/bucket CORS/);
    expect(confirm).not.toHaveBeenCalled();
  });
});
