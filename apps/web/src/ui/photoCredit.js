/**
 * The label Google requires on its photos: a small "© Google" tag on the picture itself, and the full line
 * ("Photo © Google · by <photographer>") next to it. Only listings whose photo came from Google have `image_credit`.
 */
const TAG_STYLE = 'position:absolute;left:4px;bottom:4px;max-width:calc(100% - 8px);padding:1px 6px;border-radius:6px;'
  + 'background:rgba(15,23,42,.78);color:#fff;font-size:10px;font-weight:700;line-height:16px;white-space:nowrap;'
  + 'overflow:hidden;text-overflow:ellipsis;pointer-events:none;';

/** The short on-picture tag. Put it inside a `position:relative` box that wraps the <img>. */
export function photoCreditTag(credit) {
  if (!credit) return null;
  const tag = document.createElement('span');
  tag.className = 'photo-credit-tag';
  tag.style.cssText = TAG_STYLE;
  tag.title = credit;
  tag.textContent = '© Google';
  return tag;
}

/** Wrap an <img> so the tag can sit on it. Without a credit the image is returned untouched. */
export function withPhotoCredit(img, credit) {
  if (!credit) return img;
  const box = document.createElement('div');
  box.className = 'photo-credit-box';
  box.style.cssText = 'position:relative;display:inline-block;flex-shrink:0;line-height:0;';
  box.append(img, photoCreditTag(credit));
  return box;
}
