// discover/discover-detail.ssr.test.ts — the item view through `svelte/server`,
// the path the website's item page takes: ItemDetail renders each renderer
// (media, frame, art) in page and overlay layouts; the page is two regions
// (preview, info panel) with the live frame already in the server HTML; the
// overlay keeps click-to-load, and the compact overlay swaps the frame for an
// Open link (or See full page with pageHref); the actions follow the primary
// rules without doubling up; LiveFrame serves the poster and the full-screen
// link with no iframe and no load button unless `autoload` is set. Also
// checks the card ⋯ menu renders its trigger on the server. Runs in the `ssr`
// vitest project.
import { render as ssr } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import DiscoverTile from './DiscoverTile.svelte';
import ItemActions from './ItemActions.svelte';
import ItemDetail from './ItemDetail.svelte';
import LiveFrame from './LiveFrame.svelte';
import type { DiscoverItem } from './types.js';

/** Server render with Svelte's hydration comments stripped. */
const render = ((...args: unknown[]) => {
  const out = (ssr as (...a: unknown[]) => ReturnType<typeof ssr>)(...args);
  return { ...out, body: out.body.replace(/<!--.*?-->/g, '') };
}) as typeof ssr;

const site: DiscoverItem = {
  id: 'site-1',
  slug: 'dentist',
  kind: 'site',
  mediaKind: null,
  title: 'Bright Smile Dental',
  desc: 'A clinic site with booking.',
  imageUrl: 'https://cdn.example.com/dentist.png',
  liveUrl: 'https://dentist.pawsites.workers.dev',
  remixCount: 12,
  featured: false,
  creator: { name: 'Asha', handle: 'asha' },
  tags: ['health', 'booking'],
  remixedFrom: { slug: 'clinic-base', title: 'Clinic base' },
};
const game: DiscoverItem = { ...site, id: 'game-1', slug: 'snake', kind: 'game', title: 'Snake', liveUrl: 'https://snake.pawsites.workers.dev', creator: null, tags: [], remixedFrom: null };
const tool: DiscoverItem = { ...game, id: 'tool-1', slug: 'invoice', kind: 'tool', title: 'Invoice maker', liveUrl: 'https://invoice.pawsites.workers.dev', remixCount: 0 };
const video: DiscoverItem = {
  id: 'vid-1',
  kind: 'video',
  mediaKind: 'video',
  title: 'Sunset loop',
  desc: 'Eight seconds of sky.',
  imageUrl: 'https://cdn.example.com/sunset.jpg',
  mediaUrl: 'https://cdn.example.com/sunset.mp4',
  remixCount: 3,
  featured: false,
};

const count = (body: string, re: RegExp) => (body.match(re) ?? []).length;

describe('ItemDetail — renderers', () => {
  it('frame item in overlay layout: poster, full-screen link, no iframe, h2 heading', () => {
    const { body } = render(ItemDetail, { props: { item: site, layout: 'overlay' } });
    expect(body).toContain('data-renderer="frame"');
    expect(body).toContain('discover-live-frame');
    expect(body).not.toContain('<iframe');
    expect(body).toContain('src="https://cdn.example.com/dentist.png"');
    expect(body).toMatch(/<a [^>]*href="https:\/\/dentist\.pawsites\.workers\.dev\/"[^>]*>.*Open full screen/s);
    expect(body).toContain('<h2 ');
    expect(body).not.toContain('discover-page-card');
  });

  it.each([site, game, tool])('page layout for a $kind: preview and info regions, the frame loaded on the server, h1', (item) => {
    const { body } = render(ItemDetail, { props: { item, layout: 'page' } });
    expect(body).toContain('data-layout="page"');
    expect(body).toContain('data-testid="discover-page-card"');
    const preview = body.indexOf('data-testid="discover-page-preview"');
    const info = body.indexOf('data-testid="discover-page-info"');
    const frame = body.indexOf('<iframe');
    expect(preview).toBeGreaterThan(-1);
    expect(info).toBeGreaterThan(preview);
    // The iframe sits in the preview region, before the info panel.
    expect(frame).toBeGreaterThan(preview);
    expect(frame).toBeLessThan(info);
    const tag = body.slice(frame, body.indexOf('>', frame));
    expect(tag).toContain(`src="${new URL(item.liveUrl!).href}"`);
    expect(tag).toContain('sandbox="allow-scripts allow-forms allow-popups allow-pointer-lock allow-same-origin"');
    expect(tag).toContain('allow="fullscreen; gamepad; autoplay"');
    expect(tag).toContain('referrerpolicy="no-referrer"');
    expect(body).toContain('<h1 ');
    // The info panel carries the title, then the actions, then the metadata.
    const panel = body.slice(info);
    expect(panel).toContain(item.title);
    expect(panel).toContain('discover-detail-actions');
  });

  it('page layout keeps media and art in the preview region, with no iframe', () => {
    for (const item of [video, { ...tool, liveUrl: null }]) {
      const { body } = render(ItemDetail, { props: { item, layout: 'page' } });
      expect(body).toContain('discover-page-preview');
      expect(body).not.toContain('<iframe');
    }
  });

  it('page layout queries its own container and ignores pageHref; overlay has no outer padding', () => {
    const page = render(ItemDetail, { props: { item: site, layout: 'page', pageHref: '/discover/dentist' } }).body;
    expect(page).toMatch(/<article [^>]*class="[^"]*@container\/item-page/);
    expect(page).not.toContain('See full page');
    expect(render(ItemDetail, { props: { item: site, layout: 'overlay' } }).body).not.toMatch(/<article [^>]*class="[^"]*px-6/);
  });

  it('overlay with pageHref links See full page to the item page; compact leads with it instead of Open', () => {
    const wide = render(ItemDetail, { props: { item: site, layout: 'overlay', href: '/discover/dentist', pageHref: '/discover/dentist' } }).body;
    expect(wide).toMatch(/<a [^>]*href="\/discover\/dentist"[^>]*data-testid="discover-detail-page-link"[^>]*>.*See full page<\/a>/s);
    const sheet = render(ItemDetail, { props: { item: game, layout: 'overlay', compact: true, href: '/discover/snake', pageHref: '/discover/snake' } }).body;
    expect(sheet).toContain('See full page');
    expect(sheet).not.toMatch(/>Open<\/a>/);
    expect(count(sheet, /See full page/g)).toBe(1);
    const unsafe = render(ItemDetail, { props: { item: game, layout: 'overlay', pageHref: 'javascript:alert(1)' } }).body;
    expect(unsafe).not.toContain('javascript:');
  });

  it('headingLevel overrides the layout default', () => {
    expect(render(ItemDetail, { props: { item: site, layout: 'page', headingLevel: 'h2' } }).body).not.toContain('<h1');
  });

  it('compact overlay shows the art and an Open link to the item page instead of the frame', () => {
    const { body } = render(ItemDetail, { props: { item: game, layout: 'overlay', compact: true, href: '/discover/snake' } });
    expect(body).not.toContain('discover-live-frame');
    expect(body).toContain('src="https://cdn.example.com/dentist.png"');
    expect(body).toMatch(/<a [^>]*href="\/discover\/snake"[^>]*>Open<\/a>/);
    expect(body).toMatch(/<a [^>]*href="https:\/\/snake\.pawsites\.workers\.dev\/"[^>]*>Play<\/a>/);
  });

  it.each(['page', 'overlay'] as const)('media item plays in %s layout, compact or not', (layout) => {
    for (const compact of [false, true]) {
      const { body } = render(ItemDetail, { props: { item: video, layout, compact } });
      expect(body).toContain('data-renderer="media"');
      expect(body).toContain('<video');
      expect(body).toContain('src="https://cdn.example.com/sunset.mp4"');
    }
  });

  it('an item with nothing to play gets the art', () => {
    const { body } = render(ItemDetail, { props: { item: { ...tool, liveUrl: null }, layout: 'page' } });
    expect(body).toContain('data-renderer="art"');
    expect(body).not.toContain('discover-live-frame');
    expect(body).toContain('<img');
  });

  it('a non-http live url never reaches a frame or a link', () => {
    const { body } = render(ItemDetail, { props: { item: { ...game, liveUrl: 'javascript:alert(1)' }, layout: 'page' } });
    expect(body).toContain('data-renderer="art"');
    expect(body).not.toContain('javascript:');
  });
});

describe('ItemDetail — meta', () => {
  it('shows the creator, usage, remix source and tags when present', () => {
    const { body } = render(ItemDetail, { props: { item: site, layout: 'page' } });
    expect(body).toContain('By Asha');
    expect(body).toContain('12 remixes');
    expect(body).toMatch(/Remixed from <a [^>]*href="\/discover\/clinic-base"[^>]*>Clinic base<\/a>/);
    expect(body).toContain('aria-label="Tags"');
    expect(body).toContain('health');
    expect(body).toContain('booking');
  });

  it('draws the creator row: avatar, name, published and (a day later) updated dates', () => {
    const item = { ...site, creator: { name: 'Asha Rao', avatarUrl: 'https://cdn.example.com/a.png' }, createdAt: '2026-10-01T09:00:00Z', updatedAt: '2026-10-22T09:00:00Z' };
    const { body } = render(ItemDetail, { props: { item, layout: 'page' } });
    expect(body).toContain('data-testid="discover-detail-creator"');
    expect(body).toContain('data-testid="discover-creator-avatar"');
    expect(body).toContain('>AR<');
    expect(body).toContain('By Asha Rao');
    expect(body).toMatch(/data-testid="discover-detail-dates"[^>]*>Published Oct 1, 2026 · Updated Oct 22, 2026</);
    const same = render(ItemDetail, { props: { item: { ...item, updatedAt: '2026-10-01T18:00:00Z' }, layout: 'page' } }).body;
    expect(same).toContain('Published Oct 1, 2026');
    expect(same).not.toContain('Updated');
  });

  it('draws the madeWith line only when the consumer passes one', () => {
    expect(render(ItemDetail, { props: { item: site, layout: 'page' } }).body).not.toContain('discover-detail-made-with');
    const { body } = render(ItemDetail, { props: { item: site, layout: 'page', madeWith: 'Made with Paw Sites' } });
    expect(body).toMatch(/data-testid="discover-detail-made-with">Made with Paw Sites</);
  });

  it('links each tag with tagHref, and leaves them plain without it', () => {
    const plain = render(ItemDetail, { props: { item: site, layout: 'page' } }).body;
    expect(plain).not.toMatch(/<a [^>]*href="\/discover\?tag=/);
    const { body } = render(ItemDetail, { props: { item: site, layout: 'page', tagHref: (t: string) => `/discover?tag=${t}` } });
    expect(body).toMatch(/<a [^>]*href="\/discover\?tag=health"[^>]*>.*health/s);
    expect(body).toMatch(/<a [^>]*href="\/discover\?tag=booking"/);
    const bad = render(ItemDetail, { props: { item: site, layout: 'page', tagHref: () => 'javascript:alert(1)' } }).body;
    expect(bad).not.toContain('javascript:');
  });

  it('leaves them out when absent, and hides usage at zero', () => {
    const { body } = render(ItemDetail, { props: { item: tool, layout: 'page' } });
    expect(body).not.toContain('discover-detail-creator');
    expect(body).not.toContain('No remixes yet');
    expect(body).not.toContain('Remixed from');
    expect(body).not.toContain('aria-label="Tags"');
  });
});

describe('ItemDetail — actions', () => {
  it('a site: Claim is the remix, so no second Remix in Paw OS', () => {
    const link = render(ItemDetail, { props: { item: site, layout: 'page', remixHref: 'https://app.example.com/remix/dentist' } }).body;
    expect(link).toMatch(/<a [^>]*href="https:\/\/app\.example\.com\/remix\/dentist"[^>]*>Claim<\/a>/);
    expect(link).not.toContain('Remix in Paw OS');
    const cb = render(ItemDetail, { props: { item: site, layout: 'overlay', onremix: () => {} } }).body;
    expect(cb).toMatch(/<button[^>]*>Claim<\/button>/);
    expect(cb).not.toContain('Remix in Paw OS');
  });

  it('a studio item: Use this recipe, no second remix button', () => {
    const { body } = render(ItemDetail, { props: { item: video, layout: 'page', onremix: () => {} } });
    expect(body).toContain('Use this recipe');
    expect(body).not.toContain('Remix in Paw OS');
  });

  it('a game: Play links to the live page with the ugc rel, plus Remix in Paw OS', () => {
    const { body } = render(ItemDetail, { props: { item: game, layout: 'page', remixHref: '/remix/snake' } });
    expect(body).toMatch(/<a [^>]*href="https:\/\/snake\.pawsites\.workers\.dev\/"[^>]*rel="nofollow ugc noopener noreferrer"[^>]*>Play<\/a>/);
    expect(body).toMatch(/<a [^>]*href="\/remix\/snake"[^>]*>.*Remix in Paw OS<\/a>/s);
    expect(count(body, /Remix in Paw OS/g)).toBe(1);
  });

  it('a tool with a callback gets a Remix in Paw OS button', () => {
    const { body } = render(ItemDetail, { props: { item: tool, layout: 'overlay', onremix: () => {}, busy: true } });
    expect(body).toMatch(/<button[^>]*disabled[^>]*>.*Remix in Paw OS<\/button>/s);
  });

  it('the ⋯ menu shows with href or a report callback, and not without', () => {
    expect(render(ItemDetail, { props: { item: tool, layout: 'page' } }).body).not.toContain('More for Invoice maker');
    expect(render(ItemDetail, { props: { item: tool, layout: 'page', href: '/discover/invoice' } }).body).toContain('aria-label="More for Invoice maker"');
    expect(render(ItemDetail, { props: { item: tool, layout: 'page', onreport: () => {} } }).body).toContain('aria-label="More for Invoice maker"');
  });

  it('without callbacks renders no buttons but the static links', () => {
    const { body } = render(ItemDetail, { props: { item: game, layout: 'page' } });
    expect(body).not.toContain('<button');
    expect(body).toContain('>Play</a>');
  });
});

describe('LiveFrame on the server', () => {
  const props = { url: 'https://snake.pawsites.workers.dev', title: 'Snake', kind: 'game' as const, poster: null, tint: 'var(--ripple-accent)', initial: 'S' };

  it('renders the poster and the full-screen link, and no iframe or load button', () => {
    const { body } = render(LiveFrame, { props });
    expect(body).not.toContain('<iframe');
    expect(body).not.toContain('<button');
    expect(body).toContain('>S<');
    expect(body).toMatch(/<a [^>]*href="https:\/\/snake\.pawsites\.workers\.dev\/"[^>]*target="_blank"[^>]*rel="nofollow ugc noopener noreferrer"/);
  });

  it('a non-http url leaves only the poster', () => {
    const { body } = render(LiveFrame, { props: { ...props, url: 'javascript:alert(1)' } });
    expect(body).not.toContain('<a ');
    expect(body).not.toContain('javascript:');
  });

  it('autoload puts the sandboxed iframe in the server HTML, eager, and no load button', () => {
    const { body } = render(LiveFrame, { props: { ...props, autoload: true } });
    expect(body).toMatch(
      /<iframe [^>]*src="https:\/\/snake\.pawsites\.workers\.dev\/"[^>]*sandbox="allow-scripts allow-forms allow-popups allow-pointer-lock allow-same-origin"[^>]*allow="fullscreen; gamepad; autoplay"[^>]*loading="eager"[^>]*referrerpolicy="no-referrer"/,
    );
    expect(body).not.toContain('<button');
  });

  it('autoload never frames a non-http url', () => {
    const { body } = render(LiveFrame, { props: { ...props, url: 'javascript:alert(1)', autoload: true } });
    expect(body).not.toContain('<iframe');
    expect(body).not.toContain('javascript:');
  });

  it('tall sizes the frame for the page, not 16:9', () => {
    const { body } = render(LiveFrame, { props: { ...props, autoload: true, tall: true } });
    expect(body).toContain('h-[min(72vh,760px)]');
    expect(body).not.toContain('aspect-video');
  });
});

describe('card ⋯ menu', () => {
  it('ItemActions renders the trigger on the server, not the menu', () => {
    const { body } = render(ItemActions, { props: { item: tool, onreport: () => {} } });
    expect(body).toContain('aria-label="More for Invoice maker"');
    expect(body).not.toContain('>Report<');
    expect(body).not.toContain('aria-label="Report');
  });

  it('Copy link needs both href and oncopylink', () => {
    expect(render(ItemActions, { props: { item: tool, pageHref: '/discover/invoice' } }).body).not.toContain('More for');
    expect(render(ItemActions, { props: { item: tool, pageHref: '/discover/invoice', oncopylink: () => {} } }).body).toContain('More for');
  });

  it('a site card has no Remix icon; a game card keeps it', () => {
    expect(render(ItemActions, { props: { item: site, onremix: () => {} } }).body).not.toContain('aria-label="Remix ');
    expect(render(ItemActions, { props: { item: game, onremix: () => {} } }).body).toContain('aria-label="Remix Snake"');
  });

  it('DiscoverTile passes its href through, so Copy link works on a card', () => {
    const { body } = render(DiscoverTile, { props: { item: tool, href: '/discover/invoice', oncopylink: () => {} } });
    expect(body).toContain('aria-label="More for Invoice maker"');
  });
});
