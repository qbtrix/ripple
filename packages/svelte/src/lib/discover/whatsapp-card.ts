// discover/whatsapp-card.ts — the WhatsApp QR card (WhatsAppQrCard) as pure logic,
// shared by the app's /discover hero and the public Discover page:
//   - the calling codes offered (sorted by country name), the default country (the
//     host's country, then the time zone, then the browser languages, else India),
//     and the country a pasted
//     international number starts with (longest code wins; a code several countries
//     share, like +1, keeps the country already picked);
//   - the number: a pasted "+44 7700 900123" or "0044…" splits into country and
//     number; separators and trunk zeros go; the whole E.164 number is 8-15 digits;
//   - the wa.me link (with the optional pre-filled message), the line printed under
//     the shop name, and the download file names;
//   - the printed card: a 148 × 105 mm counter card laid out once in millimetres
//     (cardLayout) and drawn from that layout as SVG (cardSvg) and print page
//     (cardPrintHtml) here, and as a PNG by ./whatsapp-card-export. The card is
//     always dark ink on white paper, whatever the host theme.
// Nothing here touches the DOM, so it runs on the server too.

import { qrPath, type QrPath } from './whatsapp-qr.js';

// ── Calling codes ───────────────────────────────────────────────────────────

export interface DialCode {
  /** ISO 3166-1 alpha-2. */
  iso: string;
  name: string;
  /** Calling code digits, no '+'. */
  code: string;
}

export const DIAL_CODES: readonly DialCode[] = [
  { iso: 'AF', name: 'Afghanistan', code: '93' },
  { iso: 'DZ', name: 'Algeria', code: '213' },
  { iso: 'AR', name: 'Argentina', code: '54' },
  { iso: 'AU', name: 'Australia', code: '61' },
  { iso: 'AT', name: 'Austria', code: '43' },
  { iso: 'BH', name: 'Bahrain', code: '973' },
  { iso: 'BD', name: 'Bangladesh', code: '880' },
  { iso: 'BE', name: 'Belgium', code: '32' },
  { iso: 'BR', name: 'Brazil', code: '55' },
  { iso: 'CA', name: 'Canada', code: '1' },
  { iso: 'CL', name: 'Chile', code: '56' },
  { iso: 'CN', name: 'China', code: '86' },
  { iso: 'CO', name: 'Colombia', code: '57' },
  { iso: 'CZ', name: 'Czechia', code: '420' },
  { iso: 'DK', name: 'Denmark', code: '45' },
  { iso: 'EG', name: 'Egypt', code: '20' },
  { iso: 'ET', name: 'Ethiopia', code: '251' },
  { iso: 'FI', name: 'Finland', code: '358' },
  { iso: 'FR', name: 'France', code: '33' },
  { iso: 'DE', name: 'Germany', code: '49' },
  { iso: 'GH', name: 'Ghana', code: '233' },
  { iso: 'GR', name: 'Greece', code: '30' },
  { iso: 'HK', name: 'Hong Kong', code: '852' },
  { iso: 'HU', name: 'Hungary', code: '36' },
  { iso: 'IN', name: 'India', code: '91' },
  { iso: 'ID', name: 'Indonesia', code: '62' },
  { iso: 'IQ', name: 'Iraq', code: '964' },
  { iso: 'IE', name: 'Ireland', code: '353' },
  { iso: 'IL', name: 'Israel', code: '972' },
  { iso: 'IT', name: 'Italy', code: '39' },
  { iso: 'JP', name: 'Japan', code: '81' },
  { iso: 'JO', name: 'Jordan', code: '962' },
  { iso: 'KE', name: 'Kenya', code: '254' },
  { iso: 'KW', name: 'Kuwait', code: '965' },
  { iso: 'LB', name: 'Lebanon', code: '961' },
  { iso: 'MY', name: 'Malaysia', code: '60' },
  { iso: 'MX', name: 'Mexico', code: '52' },
  { iso: 'MA', name: 'Morocco', code: '212' },
  { iso: 'NP', name: 'Nepal', code: '977' },
  { iso: 'NL', name: 'Netherlands', code: '31' },
  { iso: 'NZ', name: 'New Zealand', code: '64' },
  { iso: 'NG', name: 'Nigeria', code: '234' },
  { iso: 'NO', name: 'Norway', code: '47' },
  { iso: 'OM', name: 'Oman', code: '968' },
  { iso: 'PK', name: 'Pakistan', code: '92' },
  { iso: 'PE', name: 'Peru', code: '51' },
  { iso: 'PH', name: 'Philippines', code: '63' },
  { iso: 'PL', name: 'Poland', code: '48' },
  { iso: 'PT', name: 'Portugal', code: '351' },
  { iso: 'QA', name: 'Qatar', code: '974' },
  { iso: 'RO', name: 'Romania', code: '40' },
  { iso: 'RU', name: 'Russia', code: '7' },
  { iso: 'SA', name: 'Saudi Arabia', code: '966' },
  { iso: 'SG', name: 'Singapore', code: '65' },
  { iso: 'ZA', name: 'South Africa', code: '27' },
  { iso: 'KR', name: 'South Korea', code: '82' },
  { iso: 'ES', name: 'Spain', code: '34' },
  { iso: 'LK', name: 'Sri Lanka', code: '94' },
  { iso: 'SE', name: 'Sweden', code: '46' },
  { iso: 'CH', name: 'Switzerland', code: '41' },
  { iso: 'TW', name: 'Taiwan', code: '886' },
  { iso: 'TZ', name: 'Tanzania', code: '255' },
  { iso: 'TH', name: 'Thailand', code: '66' },
  { iso: 'TR', name: 'Türkiye', code: '90' },
  { iso: 'UG', name: 'Uganda', code: '256' },
  { iso: 'UA', name: 'Ukraine', code: '380' },
  { iso: 'AE', name: 'United Arab Emirates', code: '971' },
  { iso: 'GB', name: 'United Kingdom', code: '44' },
  { iso: 'US', name: 'United States', code: '1' },
  { iso: 'VN', name: 'Vietnam', code: '84' },
  { iso: 'ZW', name: 'Zimbabwe', code: '263' },
];

export const DEFAULT_DIAL_ISO = 'IN';

export const dialCodeFor = (iso: string): DialCode =>
  DIAL_CODES.find((d) => d.iso === iso) ?? DIAL_CODES.find((d) => d.iso === DEFAULT_DIAL_ISO)!;

/** Common IANA zones → the country they mean. A zone outside this map (or a whole
 *  region in ZONE_REGIONS) says nothing, and the next signal decides. */
const ZONE_COUNTRY: Readonly<Record<string, string>> = {
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Dubai': 'AE', 'Asia/Singapore': 'SG',
  'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Kathmandu': 'NP', 'Asia/Katmandu': 'NP',
  'Asia/Colombo': 'LK', 'Asia/Tokyo': 'JP', 'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'HK',
  'Asia/Seoul': 'KR', 'Asia/Taipei': 'TW', 'Asia/Bangkok': 'TH', 'Asia/Jakarta': 'ID',
  'Asia/Kuala_Lumpur': 'MY', 'Asia/Manila': 'PH', 'Asia/Ho_Chi_Minh': 'VN', 'Asia/Saigon': 'VN',
  'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW', 'Asia/Bahrain': 'BH',
  'Asia/Muscat': 'OM', 'Asia/Jerusalem': 'IL', 'Asia/Baghdad': 'IQ', 'Asia/Amman': 'JO',
  'Asia/Beirut': 'LB', 'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR',
  'Europe/Berlin': 'DE', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL',
  'Europe/Brussels': 'BE', 'Europe/Vienna': 'AT', 'Europe/Zurich': 'CH', 'Europe/Lisbon': 'PT',
  'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI',
  'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ', 'Europe/Budapest': 'HU', 'Europe/Athens': 'GR',
  'Europe/Bucharest': 'RO', 'Europe/Istanbul': 'TR', 'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA',
  'Europe/Moscow': 'RU', 'Africa/Lagos': 'NG', 'Africa/Nairobi': 'KE', 'Africa/Johannesburg': 'ZA',
  'Africa/Cairo': 'EG', 'Africa/Accra': 'GH', 'Africa/Casablanca': 'MA', 'Africa/Algiers': 'DZ',
  'Africa/Addis_Ababa': 'ET', 'Africa/Dar_es_Salaam': 'TZ', 'Africa/Kampala': 'UG', 'Africa/Harare': 'ZW',
  'Pacific/Auckland': 'NZ', 'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA',
  'America/Winnipeg': 'CA', 'America/Halifax': 'CA', 'America/Regina': 'CA', 'America/St_Johns': 'CA',
  'America/Bogota': 'CO', 'America/Lima': 'PE', 'America/Santiago': 'CL',
  // The United States, listed: browsers report CLDR ids, and America/* spans the
  // whole continent, so a catch-all would make Argentina or Mexico read as US.
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US',
  'America/Phoenix': 'US', 'America/Anchorage': 'US', 'America/Detroit': 'US', 'America/Boise': 'US',
  'America/Juneau': 'US', 'America/Adak': 'US', 'Pacific/Honolulu': 'US',
  'America/Buenos_Aires': 'AR', 'America/Cordoba': 'AR',
  'America/Mexico_City': 'MX', 'America/Monterrey': 'MX', 'America/Cancun': 'MX', 'America/Tijuana': 'MX',
  'America/Merida': 'MX', 'America/Chihuahua': 'MX', 'America/Hermosillo': 'MX', 'America/Mazatlan': 'MX',
  'America/Matamoros': 'MX', 'America/Bahia_Banderas': 'MX',
  'America/Sao_Paulo': 'BR', 'America/Recife': 'BR', 'America/Fortaleza': 'BR', 'America/Manaus': 'BR',
  'America/Bahia': 'BR', 'America/Belem': 'BR', 'America/Maceio': 'BR', 'America/Cuiaba': 'BR',
  'America/Campo_Grande': 'BR', 'America/Porto_Velho': 'BR', 'America/Rio_Branco': 'BR', 'America/Araguaina': 'BR',
};
/** Zone prefixes that mean one country when no exact zone matched. Any other
 *  America/* zone says nothing, and the language decides. */
const ZONE_REGIONS: readonly (readonly [string, string])[] = [
  ['America/Argentina/', 'AR'],
  ['America/Indiana/', 'US'],
  ['America/Kentucky/', 'US'],
  ['America/North_Dakota/', 'US'],
  ['Australia/', 'AU'],
];

const listed = (iso: string | undefined): string | null =>
  iso && DIAL_CODES.some((d) => d.iso === iso) ? iso : null;

/** The country an IANA time zone means (Asia/Kolkata → IN), or null. */
export function countryFromTimeZone(zone: string | undefined): string | null {
  if (!zone) return null;
  if (ZONE_COUNTRY[zone]) return listed(ZONE_COUNTRY[zone]);
  return listed(ZONE_REGIONS.find(([prefix]) => zone.startsWith(prefix))?.[1]);
}

/** A host-supplied country, as an ISO code ("in", "IN") or a listed name ("India"). */
function countryFromHost(country: string | undefined): string | null {
  const t = country?.trim();
  if (!t) return null;
  return listed(t.toUpperCase()) ?? DIAL_CODES.find((d) => d.name.toLowerCase() === t.toLowerCase())?.iso ?? null;
}

/** The default country: the host's (workspace or user) country, then the time zone,
 *  then the first browser language with a region we list (en-GB → GB), else India.
 *  The zone outranks the language because an Indian user's browser often speaks
 *  en-GB or en-US. */
export function defaultDialIso(
  languages: readonly string[] | undefined,
  hints: { country?: string; timeZone?: string } = {},
): string {
  const fromHints = countryFromHost(hints.country) ?? countryFromTimeZone(hints.timeZone);
  if (fromHints) return fromHints;
  for (const tag of languages ?? []) {
    const region = listed(tag.split(/[-_]/)[1]?.toUpperCase());
    if (region) return region;
  }
  return DEFAULT_DIAL_ISO;
}

/** The browser's IANA time zone, or undefined where Intl can't say. */
export function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** The listed country an international number's digits start with, longest code
 *  first; `current` wins among countries that share the matched code. */
export function matchDialCode(digits: string, current?: string): DialCode | null {
  for (let len = 3; len >= 1; len--) {
    const code = digits.slice(0, len);
    const hits = DIAL_CODES.filter((d) => d.code === code);
    if (hits.length) return hits.find((d) => d.iso === current) ?? hits[0];
  }
  return null;
}

// ── The number and the link ─────────────────────────────────────────────────

export const SHOP_MAX = 28;
export const MESSAGE_MAX = 200;
export const DEFAULT_SHOP = 'Sharma Sweets';
export const DEFAULT_MESSAGE = "Hi! I'd like to place an order.";
/** The example number the server renders, so a page with JS off shows a real card. */
export const EXAMPLE_PHONE = '98765 43210';

/** E.164 allows at most 15 digits; below 8 no real number is complete. */
export const E164_MIN = 8;
export const E164_MAX = 15;

/** The national part as digits: separators dropped, trunk zeros dropped. */
export const nationalDigits = (raw: string): string => raw.replace(/\D/g, '').replace(/^0+/, '');

/** A pasted international number ("+44 7700 900123", "0044 7700 900123") split into
 *  the listed country it starts with and the rest. Null for a national number, or an
 *  international one whose code we don't list. */
export function splitInternational(raw: string, currentIso?: string): { iso: string; national: string } | null {
  const t = raw.trim();
  if (!t.startsWith('+') && !t.startsWith('00')) return null;
  const digits = t.replace(/\D/g, '').replace(/^00/, '');
  const match = matchDialCode(digits, currentIso);
  if (!match) return null;
  return { iso: match.iso, national: nationalDigits(digits.slice(match.code.length)) };
}

export type PhoneCheck =
  | { ok: true; digits: string; line: string }
  /** `error` is null while the field is empty: nothing to complain about yet. */
  | { ok: false; error: string | null };

/** "+91 98765 43210": ten-digit numbers split 5 + 5, others in fours from the end. */
export function formatLine(code: string, national: string): string {
  const groups =
    national.length === 10 ? [national.slice(0, 5), national.slice(5)] : (national.match(/\d{1,4}(?=(\d{4})*$)/g) ?? []);
  return `+${code} ${groups.join(' ')}`;
}

export function checkPhone(code: string, raw: string): PhoneCheck {
  const national = nationalDigits(raw);
  if (!national) return { ok: false, error: raw.trim() ? 'Enter the number in digits.' : null };
  const total = code.length + national.length;
  if (total < E164_MIN || national.length < 4) return { ok: false, error: 'That number looks too short.' };
  if (total > E164_MAX) return { ok: false, error: 'That number is too long.' };
  return { ok: true, digits: code + national, line: formatLine(code, national) };
}

/** https://wa.me/<digits>, with ?text= when there is a message. */
export function waLink(digits: string, message: string): string {
  const text = message.trim().slice(0, MESSAGE_MAX);
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** `<shop>-whatsapp-qr.<ext>`, slugified; `whatsapp-qr.<ext>` for a name with no letters. */
export function cardFilename(shop: string, ext: 'png' | 'svg'): string {
  const slug = shop
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return `${slug ? `${slug}-` : ''}whatsapp-qr.${ext}`;
}

// ── The printed card ────────────────────────────────────────────────────────

export const CARD_MM = { width: 148, height: 105 } as const;
export const PNG_DPI = 300;
/** Pixels per millimetre at the PNG's resolution. */
export const PX_PER_MM = PNG_DPI / 25.4;
/** 148 × 105 mm at 300 dpi. */
export const CARD_PX = {
  width: Math.round(CARD_MM.width * PX_PER_MM),
  height: Math.round(CARD_MM.height * PX_PER_MM),
} as const;

export const CARD_INK = '#111111';
export const CARD_PAPER = '#ffffff';
export const CARD_MUTED = '#555555';
export const CARD_EDGE = '#d4d4d4';
export const CARD_FONT = 'Helvetica, Arial, sans-serif';
export const CARD_CTA = 'Scan to order on WhatsApp →';
export const DEFAULT_BRAND = 'Paw';
/** The small print at the card's foot, naming the host's product. */
export const cardFooter = (brand: string = DEFAULT_BRAND): string => `Made with ${brand} · pocketpaw.xyz`;

export interface CardText {
  text: string;
  /** Left edge and baseline, in mm. */
  x: number;
  y: number;
  /** Font size in mm. */
  size: number;
  weight: 400 | 700;
  color: string;
  /** Widest the text may run, in mm (the column beside the QR). */
  maxWidth: number;
}

export interface CardLayout {
  width: number;
  height: number;
  texts: CardText[];
  /** QR square: top-left and side, in mm. */
  qr: { x: number; y: number; size: number; path: QrPath };
}

const MARGIN = 10;
const QR_SIDE = 56;
const COLUMN = CARD_MM.width - MARGIN * 3 - QR_SIDE;
/** A rough average glyph width for a bold sans, as a share of the font size. */
const BOLD_GLYPH = 0.6;

export function cardLayout(input: { shop: string; line: string; link: string; brand?: string }): CardLayout {
  const shop = input.shop.trim() || 'Your shop';
  const shopSize = Math.min(10, COLUMN / (BOLD_GLYPH * Math.max(1, shop.length)));
  return {
    width: CARD_MM.width,
    height: CARD_MM.height,
    texts: [
      { text: shop, x: MARGIN, y: 34, size: shopSize, weight: 700, color: CARD_INK, maxWidth: COLUMN },
      { text: input.line, x: MARGIN, y: 46, size: 5, weight: 400, color: CARD_INK, maxWidth: COLUMN },
      { text: CARD_CTA, x: MARGIN, y: 62, size: 3.6, weight: 700, color: CARD_INK, maxWidth: COLUMN },
      { text: cardFooter(input.brand), x: MARGIN, y: CARD_MM.height - MARGIN, size: 3, weight: 400, color: CARD_MUTED, maxWidth: COLUMN },
    ],
    qr: { x: CARD_MM.width - MARGIN - QR_SIDE, y: (CARD_MM.height - QR_SIDE) / 2, size: QR_SIDE, path: qrPath(input.link) },
  };
}

const xml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v: number): string => String(Math.round(v * 1000) / 1000);

/** The card as a standalone SVG document, sized in millimetres for print. */
export function cardSvg(layout: CardLayout): string {
  const { qr } = layout;
  const texts = layout.texts
    .map(
      (t) =>
        `<text x="${n(t.x)}" y="${n(t.y)}" font-family="${CARD_FONT}" font-size="${n(t.size)}" font-weight="${t.weight}" fill="${t.color}">${xml(t.text)}</text>`,
    )
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}mm" height="${layout.height}mm" viewBox="0 0 ${layout.width} ${layout.height}">` +
    `<rect x="0.15" y="0.15" width="${n(layout.width - 0.3)}" height="${n(layout.height - 0.3)}" rx="3" fill="${CARD_PAPER}" stroke="${CARD_EDGE}" stroke-width="0.3"/>` +
    texts +
    `<g transform="translate(${n(qr.x)} ${n(qr.y)}) scale(${n(qr.size / qr.path.size)})"><path d="${qr.path.d}" fill="${CARD_INK}" shape-rendering="crispEdges"/></g>` +
    `</svg>`
  );
}

/** The print document: one card on a 148 × 105 mm page, nothing else. */
export function cardPrintHtml(layout: CardLayout, title: string): string {
  const safeTitle = title.replace(/[<&]/g, '');
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title>` +
    `<style>@page{size:148mm 105mm;margin:0}html,body{margin:0;padding:0;background:${CARD_PAPER}}svg{display:block;width:148mm;height:105mm}</style>` +
    `</head><body>${cardSvg(layout)}</body></html>`
  );
}
