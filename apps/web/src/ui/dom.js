/** Tiny DOM helpers shared by the page scripts. No framework, no innerHTML with data. */

export function $(id) {
  return document.getElementById(id);
}

export function setText(id, value) {
  const node = $(id);
  if (node) node.textContent = value;
}

/** Build an element safely: text goes in via textContent, never as HTML. */
export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function money(value) {
  return `\u20A6${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function moneyShort(value) {
  return `\u20A6${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}

let toastTimer;
export function toast(message, type = 'info') {
  let box = $('kapitaToast');
  if (!box) {
    box = h('div', { id: 'kapitaToast', role: 'status', 'aria-live': 'polite' });
    Object.assign(box.style, {
      position: 'fixed', left: '50%', bottom: '88px', transform: 'translateX(-50%)', zIndex: 9999,
      maxWidth: '90vw', padding: '12px 18px', borderRadius: '12px', fontSize: '13px', fontWeight: 600,
      color: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,.25)', transition: 'opacity .2s', opacity: 0,
    });
    document.body.append(box);
  }
  box.style.background = type === 'error' ? '#b91c1c' : type === 'success' ? '#008a57' : '#0f172a';
  box.textContent = message;
  box.style.opacity = 1;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.style.opacity = 0; }, 3800);
}

export function openModal(id) {
  const modal = $(id);
  if (!modal) return;
  modal.classList.add('active');
  modal.querySelector('input:not([readonly]), select, textarea, button')?.focus();
}

export function closeModal(id) {
  $(id)?.classList.remove('active');
}

export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  return err?.message || fallback;
}
