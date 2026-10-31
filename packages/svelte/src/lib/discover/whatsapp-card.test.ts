// discover/whatsapp-card.test.ts — the WhatsApp QR card's pure parts: calling codes
// (default from the browser's languages, matching a pasted international number),
// number parsing and E.164 validation, the wa.me link with its message, the printed
// line, file names, the QR path, and the 148 × 105 mm card as layout, SVG and print
// page. Runs in the `client` project (DOMParser checks the SVG).
import { describe, expect, it } from 'vitest';
import {
  CARD_INK,
  CARD_PAPER,
  CARD_PX,
  DIAL_CODES,
  E164_MAX,
  cardFilename,
  cardFooter,
  cardLayout,
  cardPrintHtml,
  cardSvg,
  checkPhone,
  defaultDialIso,
  dialCodeFor,
  formatLine,
  matchDialCode,
  nationalDigits,
  splitInternational,
  waLink,
} from './whatsapp-card.js';
import { qrPath } from './whatsapp-qr.js';

describe('dial codes', () => {
  it('lists at least 60 countries, sorted by name, each once', () => {
    expect(DIAL_CODES.length).toBeGreaterThanOrEqual(60);
    const names = DIAL_CODES.map((d) => d.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(new Set(DIAL_CODES.map((d) => d.iso)).size).toBe(DIAL_CODES.length);
  });

  it('defaults from the first browser language with a region we list, else India', () => {
    expect(defaultDialIso(['en-GB', 'en'])).toBe('GB');
    expect(defaultDialIso(['fr', 'pt_BR'])).toBe('BR');
    expect(defaultDialIso(['en', 'xx-ZZ'])).toBe('IN');
    expect(defaultDialIso(undefined)).toBe('IN');
    expect(dialCodeFor('nope').iso).toBe('IN');
  });

  it('prefers a passed country, then the time zone, then the language region, else India', () => {
    // An Indian user whose browser speaks en-GB: the zone wins over the language.
    expect(defaultDialIso(['en-GB', 'en'], { timeZone: 'Asia/Kolkata' })).toBe('IN');
    expect(defaultDialIso(['en-GB'], { timeZone: 'Asia/Calcutta' })).toBe('IN');
    // The workspace country beats both.
    expect(defaultDialIso(['en-GB'], { country: 'ae', timeZone: 'Asia/Kolkata' })).toBe('AE');
    expect(defaultDialIso(['en-GB'], { country: 'India' })).toBe('IN');
    // An unknown country or zone falls through to the next signal.
    expect(defaultDialIso(['en-GB'], { country: 'XX', timeZone: 'Etc/UTC' })).toBe('GB');
    expect(defaultDialIso(['en'], { country: '', timeZone: 'Mars/Olympus' })).toBe('IN');
    expect(defaultDialIso(undefined, { timeZone: 'Europe/London' })).toBe('GB');
    expect(defaultDialIso(['en-IN'], { timeZone: 'Asia/Dubai' })).toBe('AE');
    expect(defaultDialIso([], { timeZone: 'Asia/Singapore' })).toBe('SG');
    expect(defaultDialIso([], { timeZone: 'Australia/Sydney' })).toBe('AU');
    expect(defaultDialIso([], { timeZone: 'America/Chicago' })).toBe('US');
    expect(defaultDialIso([], { timeZone: 'America/Toronto' })).toBe('CA');
    expect(defaultDialIso([], { timeZone: 'America/Sao_Paulo' })).toBe('BR');
  });

  it('reads CLDR American zones by country, and lets an unknown one fall to the language', () => {
    expect(defaultDialIso(['es-AR'], { timeZone: 'America/Buenos_Aires' })).toBe('AR');
    expect(defaultDialIso([], { timeZone: 'America/Argentina/Cordoba' })).toBe('AR');
    for (const zone of ['America/Monterrey', 'America/Cancun', 'America/Tijuana']) {
      expect(defaultDialIso([], { timeZone: zone })).toBe('MX');
    }
    for (const zone of ['America/Recife', 'America/Fortaleza', 'America/Manaus', 'America/Bahia']) {
      expect(defaultDialIso([], { timeZone: zone })).toBe('BR');
    }
    for (const zone of ['America/New_York', 'America/Los_Angeles', 'America/Indiana/Indianapolis', 'America/Kentucky/Louisville', 'Pacific/Honolulu']) {
      expect(defaultDialIso([], { timeZone: zone })).toBe('US');
    }
    // An American zone we don't list says nothing: the language decides.
    expect(defaultDialIso(['es-MX'], { timeZone: 'America/Nowhere_Listed' })).toBe('MX');
    expect(defaultDialIso(['en'], { timeZone: 'America/Nowhere_Listed' })).toBe('IN');
  });

  it('matches the longest code, keeping the current country among shared ones', () => {
    expect(matchDialCode('447700900123')?.iso).toBe('GB');
    expect(matchDialCode('971501234567')?.iso).toBe('AE');
    expect(matchDialCode('14155550100', 'CA')?.iso).toBe('CA');
    expect(matchDialCode('14155550100', 'IN')?.iso).toBe('CA');
    expect(matchDialCode('999')).toBeNull();
  });
});

describe('number parsing', () => {
  it('drops separators and trunk zeros', () => {
    expect(nationalDigits(' 098765-43210 ')).toBe('9876543210');
    expect(nationalDigits('(0)20 7946 0018')).toBe('2079460018');
  });

  it('splits a pasted international number into country and number', () => {
    expect(splitInternational('+44 7700 900123', 'IN')).toEqual({ iso: 'GB', national: '7700900123' });
    expect(splitInternational('0044 (0)7700 900123')).toEqual({ iso: 'GB', national: '7700900123' });
    expect(splitInternational('+91 98765-43210')).toEqual({ iso: 'IN', national: '9876543210' });
    expect(splitInternational('+1 (415) 555-0100', 'US')).toEqual({ iso: 'US', national: '4155550100' });
    expect(splitInternational('98765 43210')).toBeNull();
    expect(splitInternational('+999 123')).toBeNull();
  });

  it('accepts 8-15 digits in all, and says why otherwise', () => {
    expect(checkPhone('91', '98765 43210')).toEqual({ ok: true, digits: '919876543210', line: '+91 98765 43210' });
    expect(checkPhone('91', '')).toEqual({ ok: false, error: null });
    expect(checkPhone('91', '---')).toEqual({ ok: false, error: 'Enter the number in digits.' });
    expect(checkPhone('91', '987')).toEqual({ ok: false, error: 'That number looks too short.' });
    expect(checkPhone('44', '1'.repeat(E164_MAX))).toEqual({ ok: false, error: 'That number is too long.' });
    expect(checkPhone('65', '8123 4567').ok).toBe(true);
  });

  it('formats the printed line: 10 digits as 5 + 5, others in fours from the end', () => {
    expect(formatLine('91', '9876543210')).toBe('+91 98765 43210');
    expect(formatLine('65', '81234567')).toBe('+65 8123 4567');
    expect(formatLine('44', '123456789')).toBe('+44 1 2345 6789');
  });
});

describe('wa.me link', () => {
  it('carries the message encoded, or none', () => {
    expect(waLink('919876543210', "Hi! I'd like to place an order.")).toBe(
      "https://wa.me/919876543210?text=Hi!%20I'd%20like%20to%20place%20an%20order.",
    );
    expect(waLink('919876543210', '  ')).toBe('https://wa.me/919876543210');
    expect(waLink('1', 'a&b=c #1')).toBe('https://wa.me/1?text=a%26b%3Dc%20%231');
  });

  it('an invalid number has no link to build', () => {
    const check = checkPhone('91', '12');
    expect(check.ok).toBe(false);
  });
});

describe('file names', () => {
  it('slugifies the shop name', () => {
    expect(cardFilename('Sharma Sweets & Co.', 'png')).toBe('sharma-sweets-co-whatsapp-qr.png');
    expect(cardFilename('!!!', 'svg')).toBe('whatsapp-qr.svg');
  });
});

describe('the printed card', () => {
  const link = 'https://wa.me/919876543210?text=Hi';
  const layout = cardLayout({ shop: 'Sharma Sweets', line: '+91 98765 43210', link });

  it('is 148 × 105 mm, 1748 × 1240 px at 300 dpi', () => {
    expect([layout.width, layout.height]).toEqual([148, 105]);
    expect(CARD_PX).toEqual({ width: 1748, height: 1240 });
  });

  it('encodes the link, sits inside the margins, and keeps text clear of the QR', () => {
    expect(layout.qr.path).toEqual(qrPath(link));
    expect(layout.qr.x + layout.qr.size).toBeLessThanOrEqual(148 - 10);
    expect(layout.qr.y).toBeGreaterThanOrEqual(10);
    for (const t of layout.texts) expect(t.x + t.maxWidth).toBeLessThanOrEqual(layout.qr.x);
  });

  it('names the host product on the foot', () => {
    expect(layout.texts[3].text).toBe('Made with Paw · pocketpaw.xyz');
    expect(cardLayout({ shop: 'A', line: '', link, brand: 'Paw OS' }).texts[3].text).toBe(cardFooter('Paw OS'));
    expect(cardFooter('Paw OS')).toBe('Made with Paw OS · pocketpaw.xyz');
  });

  it('shrinks a long shop name, and names a blank shop', () => {
    const long = cardLayout({ shop: 'A'.repeat(28), line: '', link });
    expect(long.texts[0].size).toBeLessThan(layout.texts[0].size);
    expect(cardLayout({ shop: '  ', line: '', link }).texts[0].text).toBe('Your shop');
  });

  it('SVG: millimetre size, white paper, dark ink, escaped text, the QR path', () => {
    const svg = cardSvg(cardLayout({ shop: 'Tom & <Jerry>', line: '+91 98765 43210', link }));
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="148mm" height="105mm" viewBox="0 0 148 105">/);
    expect(svg).toContain(`fill="${CARD_PAPER}"`);
    expect(svg).toContain(`fill="${CARD_INK}"`);
    expect(svg).toContain('Tom &amp; &lt;Jerry&gt;');
    expect(svg).toContain(qrPath(link).d);
    expect(svg).toContain('Made with Paw · pocketpaw.xyz');
    expect(() => new DOMParser().parseFromString(svg, 'image/svg+xml')).not.toThrow();
    expect(new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('parsererror')).toBeNull();
  });

  it('print page: one card on a 148 × 105 mm page with no margin', () => {
    const html = cardPrintHtml(layout, 'Sharma <Sweets>');
    expect(html).toContain('@page{size:148mm 105mm;margin:0}');
    expect(html).toContain('<title>Sharma Sweets></title>');
    expect(html.match(/<svg /g)).toHaveLength(1);
  });
});

describe('the QR path', () => {
  const dark = (p: { size: number; d: string }) => {
    const set = new Set<string>();
    for (const m of p.d.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) set.add(`${m[1]},${m[2]}`);
    return set;
  };

  it('is a square of 4v+17 modules, one 1×1 square per dark module', () => {
    const p = qrPath('https://wa.me/919876543210?text=Hi');
    expect((p.size - 17) % 4).toBe(0);
    expect(p.d).toMatch(/^(M\d+ \d+h1v1h-1z)+$/);
  });

  it('has the three finder patterns upright (top-left, top-right, bottom-left)', () => {
    const p = qrPath("https://wa.me/447700900123?text=Hi!%20I'd%20like%20to%20place%20an%20order.");
    const on = dark(p);
    const finder = (x0: number, y0: number) => {
      for (let i = 0; i < 7; i++) {
        for (const [x, y] of [[x0 + i, y0], [x0 + i, y0 + 6], [x0, y0 + i], [x0 + 6, y0 + i]]) expect(on.has(`${x},${y}`)).toBe(true);
      }
      expect(on.has(`${x0 + 3},${y0 + 3}`)).toBe(true);
      expect(on.has(`${x0 + 1},${y0 + 1}`)).toBe(false);
    };
    finder(0, 0);
    finder(p.size - 7, 0);
    finder(0, p.size - 7);
    // The dark module next to the bottom-left finder (row size-8, col 8) pins the orientation.
    expect(on.has(`8,${p.size - 8}`)).toBe(true);
  });

  it('grows with the text, the same text gives the same path', () => {
    expect(qrPath('https://wa.me/1').size).toBeLessThan(qrPath(`https://wa.me/1?text=${'a'.repeat(200)}`).size);
    expect(qrPath('x')).toEqual(qrPath('x'));
  });
});
