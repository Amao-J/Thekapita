/**
 * Photo upload helpers shared by the directory and the vendor dashboard.
 *
 * prepareImage():  shrinks a phone photo (often 3-8 MB) to a web-sized JPEG before upload. Faster on mobile data, cheaper to
 *                  store, and re-encoding through a canvas also drops hidden metadata such as the GPS position a phone
 *                  writes into every photo.
 * uploadPhoto():   asks the server for a one-use signed upload, sends the file straight to storage, then confirms it.
 */
import { ApiError } from '../api/client.js';

export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_BYTES = 8 * 1024 * 1024; // keep in step with the server limit
const MAX_EDGE = 1600;
const QUALITY = 0.82;

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function prepareImage(file, { maxEdge = MAX_EDGE, quality = QUALITY } = {}) {
  if (!file || !ALLOWED_TYPES.includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP photo.');

  let bitmap = null;
  try {
    bitmap = typeof createImageBitmap === 'function' ? await createImageBitmap(file, { imageOrientation: 'from-image' }) : null;
  } catch {
    bitmap = null; // unreadable image: the server will reject it with a clearer message than a canvas error would
  }
  if (!bitmap) {
    if (file.size > MAX_BYTES) throw new Error('That photo is too large (8 MB maximum).');
    return file; // very old browser: upload as is
  }

  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // JPEG has no transparency: flatten PNG/WebP onto white instead of black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await toBlob(canvas, 'image/jpeg', quality);
    if (!blob) return file;
    if (blob.size > MAX_BYTES) throw new Error('That photo is still too large after resizing (8 MB maximum).');
    const base = (file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } finally {
    if (typeof bitmap.close === 'function') bitmap.close();
  }
}

/**
 * issue(spec)    -> POST that returns { key, upload_url, fields }   (spec = { filename, content_type, size })
 * confirm(key)   -> POST that saves the uploaded key on the record and returns its result
 */
export async function uploadPhoto(file, { issue, confirm }) {
  const photo = await prepareImage(file);
  const { key, upload_url: uploadUrl, fields } = await issue({ filename: photo.name, content_type: photo.type, size: photo.size });
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  form.append('file', photo); // storage requires the file to be the LAST field
  let response;
  try {
    response = await fetch(uploadUrl, { method: 'POST', body: form });
  } catch {
    throw new ApiError(0, 'Could not reach photo storage. Check your connection and try again.');
  }
  if (!response.ok) throw new ApiError(response.status, 'The photo could not be uploaded. Please try again.');
  return confirm(key);
}
