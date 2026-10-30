// discover/whatsapp-qr.ts — the one QR encoder behind WhatsAppQrCard: text in, an
// SVG path out (one 1×1 square per dark module, in module units, no quiet zone). The
// same path draws the on-screen preview, the downloadable SVG and, through Path2D,
// the PNG, so all three come from the same code. Synchronous and DOM-free, so a
// $derived can call it and the server renders a real QR.
//
// Uses the package's existing `qrcode-svg` dependency for the module matrix only
// (its own SVG writer is not used), error correction M. Its matrix is indexed
// [row][col]; the path draws x = col, y = row (qrcode-svg's own writer transposes).
import QRCode from 'qrcode-svg';

export interface QrPath {
  /** Modules per side. */
  size: number;
  /** SVG path data in module units. */
  d: string;
}

export function qrPath(text: string): QrPath {
  const modules = new QRCode({ content: text, ecl: 'M', padding: 0 }).qrcode.modules as boolean[][];
  let d = '';
  for (let r = 0; r < modules.length; r++) {
    for (let c = 0; c < modules.length; c++) if (modules[r][c]) d += `M${c} ${r}h1v1h-1z`;
  }
  return { size: modules.length, d };
}
