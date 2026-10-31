// discover/whatsapp-card.ssr.test.ts — WhatsAppQrCard through `svelte/server`, the
// path the public Discover page takes: it renders without touching window or
// navigator, and the server frame is a meaningful example (India, "Sharma Sweets",
// "98765 43210", a real QR path and wa.me link, exports enabled), so a page with JS
// off still shows a working card. The make action renders only when the host gives
// one, and `brand` names the product. The card sits in a closed <details> whose
// summary is the phone teaser; the markup carries no `open`, at any width, so
// hydration never changes it (CSS shows the body from 30rem). Runs in the `ssr`
// vitest project.
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import WhatsAppQrCard from './WhatsAppQrCard.svelte';
import { cardLayout, waLink, DEFAULT_MESSAGE } from './whatsapp-card.js';

const link = waLink('919876543210', DEFAULT_MESSAGE);

describe('WhatsAppQrCard — SSR', () => {
  it('renders the example card: shop, line, QR, link and live exports', () => {
    const { body } = render(WhatsAppQrCard);
    expect(body).toContain('Sharma Sweets');
    expect(body).toContain('+91 98765 43210');
    expect(body).toContain('IN +91');
    expect(body).toContain('data-testid="discover-qr-code"');
    expect(body).not.toContain('data-testid="discover-qr-placeholder"');
    const d = cardLayout({ shop: 'Sharma Sweets', line: '+91 98765 43210', link }).qr.path.d;
    expect(body).toContain(`d="${d}"`);
    // "Test it" is a real link with no callback, escaped the way Svelte escapes attributes.
    expect(body).toContain('href="https://wa.me/919876543210?text=Hi!%20I\'d%20like%20to%20place%20an%20order."');
    expect(body).toContain('target="_blank"');
    expect(body).not.toMatch(/data-testid="discover-qr-png"[^>]*disabled/);
    expect(body).toContain('Free · runs in your browser');
    expect(body).toContain('Made with Paw · pocketpaw.xyz');
  });

  it('wraps the card in a closed details with the one-line teaser as its summary', () => {
    const { body } = render(WhatsAppQrCard);
    expect(body).toContain('@container/qr-card');
    expect(body).toMatch(/<details class="qr-details[^"]*"[^>]*data-testid="discover-qr-details"/);
    expect(body).not.toMatch(/<details[^>]*\bopen\b/);
    expect(body).toMatch(/<summary[^>]*data-testid="discover-qr-teaser"[^>]*>[\s\S]*Make a WhatsApp QR card for your shop[\s\S]*<\/summary>/);
    // Everything else lives after the summary, inside the details.
    const summaryEnd = body.indexOf('</summary>');
    expect(body.indexOf('data-testid="discover-qr-preview"')).toBeGreaterThan(summaryEnd);
    expect(body.indexOf('</details>')).toBeGreaterThan(body.indexOf('data-testid="discover-qr-png"'));
  });

  it('shows the make action only when the host gives one, as a link with makeHref', () => {
    expect(render(WhatsAppQrCard).body).not.toContain('Make a full menu or site');
    const { body } = render(WhatsAppQrCard, { props: { makeHref: 'https://app.example.com/', brand: 'Paw OS' } });
    expect(body).toMatch(/<a[^>]*href="https:\/\/app\.example\.com\/"[^>]*>(<!---->)?Make a full menu or site with Paw OS(<!---->)?<\/a>/);
    expect(body).toContain('Made with Paw OS · pocketpaw.xyz');
  });

  it('a javascript: makeHref never reaches the markup', () => {
    const { body } = render(WhatsAppQrCard, { props: { makeHref: 'javascript:alert(1)' } });
    expect(body).not.toContain('javascript:');
  });
});
