// discover/whatsapp-card-export.ts — getting the WhatsApp QR card out of the page,
// browser only (call these from event handlers, never at render): a 300 dpi PNG
// painted on a canvas from the same millimetre layout the SVG uses (./whatsapp-card
// cardLayout; the QR through Path2D, so it is the same path), the SVG as a blob,
// the default save (an anchor download of a blob URL, revoked a minute later since
// WebKit may read the blob after click() returns), and Print, which prints just the
// card on one 148 × 105 mm page from a hidden iframe so no host chrome or theme
// reaches the paper. A host with its own save path passes `ondownload` to the card.

import {
  CARD_EDGE,
  CARD_FONT,
  CARD_INK,
  CARD_PAPER,
  CARD_PX,
  PX_PER_MM,
  cardPrintHtml,
  cardSvg,
  type CardLayout,
} from './whatsapp-card.js';

/** Paint the card at 300 dpi. Text that would run into the QR is narrowed to fit. */
export function paintCard(ctx: CanvasRenderingContext2D, layout: CardLayout): void {
  const s = PX_PER_MM;
  ctx.fillStyle = CARD_PAPER;
  ctx.fillRect(0, 0, CARD_PX.width, CARD_PX.height);
  ctx.strokeStyle = CARD_EDGE;
  ctx.lineWidth = 0.3 * s;
  ctx.strokeRect(0.15 * s, 0.15 * s, (layout.width - 0.3) * s, (layout.height - 0.3) * s);
  for (const t of layout.texts) {
    ctx.font = `${t.weight} ${t.size * s}px ${CARD_FONT}`;
    ctx.fillStyle = t.color;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(t.text, t.x * s, t.y * s, t.maxWidth * s);
  }
  const { qr } = layout;
  ctx.save();
  ctx.translate(qr.x * s, qr.y * s);
  ctx.scale((qr.size * s) / qr.path.size, (qr.size * s) / qr.path.size);
  ctx.fillStyle = CARD_INK;
  ctx.fill(new Path2D(qr.path.d));
  ctx.restore();
}

export async function cardPng(layout: CardLayout): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_PX.width;
  canvas.height = CARD_PX.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the card.');
  paintCard(ctx, layout);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The card could not be saved.'))), 'image/png'),
  );
}

export const cardSvgBlob = (layout: CardLayout): Blob => new Blob([cardSvg(layout)], { type: 'image/svg+xml' });

/** The default save: an anchor download of a blob URL. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Print just the card, from a hidden iframe removed once printing is done. */
export function printCard(layout: CardLayout, title: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) return frame.remove();
    win.addEventListener('afterprint', () => frame.remove(), { once: true });
    win.focus();
    win.print();
    // Some engines never fire afterprint; don't leave the frame behind for good.
    setTimeout(() => frame.remove(), 60_000);
  };
  frame.srcdoc = cardPrintHtml(layout, title);
  document.body.appendChild(frame);
}
