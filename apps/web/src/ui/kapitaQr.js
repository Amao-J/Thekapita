import QRCode from 'qrcode';

export async function renderKapitaQr(canvas, kapitaId) {
  if (!canvas || !kapitaId) return false;

  await QRCode.toCanvas(canvas, kapitaId, {
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#121212', light: '#ffffff' },
  });
  canvas.setAttribute('aria-label', `QR code containing Kapita ID ${kapitaId}`);
  return true;
}