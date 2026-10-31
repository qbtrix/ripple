// discover/discover-layout.ssr.test.ts — the Discover page layout through
// `svelte/server`, the path a prerendered public page takes: each piece renders
// its markup with no hydration, link mode renders anchors and no buttons (so
// it works with JS off), callback mode renders the app's buttons and radios,
// and a section lays its children out by the `view` prop. Runs in the `ssr`
// vitest project. Also pins the cards' type scale to the app's, and the
// narrow-container behaviour (compact header, one-row chips, scrolling tabs,
// the two-column grid, the compact tile, the creator line) as server markup.
import { createRawSnippet } from 'svelte';
import { render as ssr } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import DiscoverChips from './DiscoverChips.svelte';
import DiscoverEmpty from './DiscoverEmpty.svelte';
import DiscoverFilters from './DiscoverFilters.svelte';
import DiscoverGrid from './DiscoverGrid.svelte';
import DiscoverHeader from './DiscoverHeader.svelte';
import DiscoverPublish from './DiscoverPublish.svelte';
import DiscoverRow from './DiscoverRow.svelte';
import DiscoverSearch from './DiscoverSearch.svelte';
import DiscoverSection from './DiscoverSection.svelte';
import DiscoverSkeleton from './DiscoverSkeleton.svelte';
import DiscoverTile from './DiscoverTile.svelte';
import type { DiscoverItem } from './types.js';

/** Server render with Svelte's hydration comments stripped, so the markup reads as served. */
const render = ((...args: unknown[]) => {
  const out = (ssr as (...a: unknown[]) => ReturnType<typeof ssr>)(...args);
  return { ...out, body: out.body.replace(/<!--.*?-->/g, '') };
}) as typeof ssr;
const snip = (html: string) => createRawSnippet(() => ({ render: () => html }));
const tiles = snip('<article data-testid="child">tile</article>');

const KINDS = [
  { value: 'all', label: 'All' },
  { value: 'tool', label: 'Tools' },
  { value: 'site', label: 'Sites' },
];
const linked = (base: string) => KINDS.map((k) => ({ ...k, href: k.value === 'all' ? base : `${base}?kind=${k.value}` }));

const item: DiscoverItem = {
  id: 't1',
  kind: 'tool',
  mediaKind: null,
  title: 'Invoice maker',
  desc: 'Bill a client in a minute.',
  imageUrl: null,
  liveUrl: null,
  remixCount: 0,
  featured: false,
};

describe('DiscoverFilters', () => {
  it('with hrefs renders link pills for kind and view, and no buttons', () => {
    const { body } = render(DiscoverFilters, {
      props: { kinds: linked('/discover'), kind: 'tool', view: 'list', viewHref: (v: string) => `/discover?view=${v}` },
    });
    expect(body).not.toContain('<button');
    expect(body).not.toContain('role="radio');
    expect(body).toContain('href="/discover"');
    expect(body).toContain('href="/discover?kind=tool"');
    expect(body).toContain('href="/discover?view=shelves"');
    expect(body).toMatch(/<a [^>]*href="\/discover\?kind=tool"[^>]*aria-current="true"/);
    expect(body).toMatch(/<a [^>]*href="\/discover\?view=list"[^>]*aria-current="true"/);
    expect(body).not.toMatch(/<a [^>]*href="\/discover\?kind=site"[^>]*aria-current/);
    expect(body).toContain('aria-label="Filter by type"');
    expect(body).toContain('aria-label="View"');
    expect(body).toContain('<svg');
  });

  it('with callbacks renders radio buttons in the Segmented track, view icons included', () => {
    const { body } = render(DiscoverFilters, { props: { kinds: KINDS, kind: 'all', onkind: () => {}, view: 'grid', onview: () => {} } });
    expect(body).toContain('role="radiogroup"');
    expect(body).toMatch(/<button type="button" role="radio"[^>]*aria-checked="true"/);
    expect(body).toMatch(/<\/svg>(<!--[^>]*-->)*\s*<span[^>]*>Shelves<\/span>\s*<\/button>/);
    expect(body).not.toContain('<a ');
  });

  it('marks the selected tab with its own surface (no sliding thumb), in links and radios alike', () => {
    const links = render(DiscoverFilters, { props: { kinds: linked('/d'), kind: 'site' } }).body;
    expect(links).toMatch(/<a [^>]*href="\/d\?kind=site"[^>]*aria-current="true"/);
    expect(links).toMatch(/<a [^>]*href="\/d\?kind=site"[^>]*class="[^"]*bg-ripple-surface[^"]*"/);
    expect(links).not.toMatch(/<a [^>]*href="\/d\?kind=tool"[^>]*class="[^"]*bg-ripple-surface[^"]*"/);
    expect(links).not.toContain('translateX');
    const radios = render(DiscoverFilters, { props: { kinds: KINDS, kind: 'tool', onkind: () => {} } }).body;
    expect(radios).toMatch(/<button type="button" role="radio" aria-checked="true" class="[^"]*bg-ripple-surface/);
  });

  it('scrolls the kind tabs in their own faded track and keeps the view toggle from shrinking, icon-only when narrow', () => {
    const { body } = render(DiscoverFilters, { props: { kinds: linked('/d'), kind: 'all', view: 'grid', viewHref: (v: string) => `/d?view=${v}` } });
    expect(body).toContain('@container/discover-filters');
    expect(body).toContain('data-testid="discover-kinds"');
    expect(body).toMatch(/class="[^"]*min-w-0 flex-1 [^"]*overflow-x-auto[^"]*mask-image[^"]*"/);
    expect(body).toMatch(/<div class="shrink-0" role="group" aria-label="View">/);
    // View labels stay for screen readers and show from 36rem; kind labels are never hidden.
    expect(body).toMatch(/<span class="sr-only @xl\/discover-filters:not-sr-only">Grid<\/span>/);
    expect(body).not.toMatch(/<span class="sr-only[^"]*">All<\/span>/);
    expect(body).toContain('title="Shelves"');
  });

  it('hides the view toggle with neither onview nor viewHref, and takes the host surface class', () => {
    const { body } = render(DiscoverFilters, { props: { kinds: linked('/d'), kind: 'all', class: 'feature-surface' } });
    expect(body).not.toContain('aria-label="View"');
    expect(body).toContain('sticky top-0 z-10');
    expect(body).toContain('feature-surface');
  });
});

describe('DiscoverChips', () => {
  it('with hrefs renders links, the selected one aria-current', () => {
    const options = [
      { value: 'shop', label: 'For my shop', href: '/discover' },
      { value: 'fun', label: 'Just for fun', href: '/discover?audience=fun' },
    ];
    const { body } = render(DiscoverChips, { props: { options, value: 'shop' } });
    expect(body).not.toContain('<button');
    expect(body).toMatch(/<a [^>]*href="\/discover"[^>]*aria-current="true"/);
    expect(body).toContain('href="/discover?audience=fun"');
    expect(body).toContain('aria-label="Who is it for"');
  });

  it('keeps every chip on one sideways-scrolling row with a trailing fade', () => {
    const { body } = render(DiscoverChips, { props: { options: [{ value: 'shop', label: 'For my shop' }], onchange: () => {} } });
    expect(body).toContain('data-testid="discover-chips"');
    expect(body).toContain('flex-nowrap');
    expect(body).toContain('overflow-x-auto');
    expect(body).toContain('snap-x');
    expect(body).toContain('mask-image');
    expect(body).not.toMatch(/\bflex-wrap\b/);
  });

  it('without hrefs renders pressed-state buttons', () => {
    const { body } = render(DiscoverChips, { props: { options: [{ value: 'shop', label: 'For my shop' }], value: 'shop', onchange: () => {} } });
    expect(body).toMatch(/<button[^>]*aria-pressed="true"/);
  });
});

describe('DiscoverSearch', () => {
  it('with action is a GET form that submits q and keeps the other filters', () => {
    const { body } = render(DiscoverSearch, { props: { value: 'menu', action: '/discover', hidden: { kind: 'tool', audience: null } } });
    expect(body).toMatch(/<form [^>]*method="get"/);
    expect(body).toContain('action="/discover"');
    expect(body).toMatch(/<input [^>]*name="q"/);
    expect(body).toContain('value="menu"');
    expect(body).toMatch(/<input type="hidden" name="kind" value="tool"/);
    expect(body).not.toContain('name="audience"');
    expect(body).toContain('placeholder="Search tools, games and sites"');
  });

  it('without action is the bare search box', () => {
    const { body } = render(DiscoverSearch, { props: { value: '' } });
    expect(body).not.toContain('<form');
    expect(body).not.toContain('name="q"');
    expect(body).toContain('aria-label="Search Discover"');
  });
});

describe('DiscoverSection', () => {
  it('lays children out in the grid by default, with the app ids', () => {
    const { body } = render(DiscoverSection, { props: { id: 'picks', title: 'Staff picks', blurb: 'Picked by us.', children: tiles } });
    expect(body).toContain('data-testid="discover-section-picks"');
    expect(body).toContain('aria-labelledby="discover-h-picks"');
    expect(body).toMatch(/<h2 id="discover-h-picks"[^>]*>Staff picks<\/h2>/);
    // Never under two columns: each track's floor is half the grid less the gap.
    expect(body).toContain('grid-cols-[repeat(auto-fill,minmax(min(240px,calc((100%-1.25rem)/2)),1fr))]');
    expect(body).toContain('data-testid="child"');
    expect(body).not.toContain('role="list"');
  });

  it('renders the list view as a named list', () => {
    const { body } = render(DiscoverSection, { props: { id: 'play', title: 'Play', view: 'list', children: tiles } });
    expect(body).toContain('role="list"');
    expect(body).toContain('aria-label="Play"');
    expect(body).not.toContain('grid-cols-');
  });

  it('renders the shelves view as a snapping sideways scroller that sizes its children', () => {
    const { body } = render(DiscoverSection, { props: { id: 'play', title: 'Play', view: 'shelves', children: tiles } });
    expect(body).toContain('snap-x');
    expect(body).toContain('*:w-64');
    expect(body).toContain('aria-label="Play, scroll sideways for more"');
  });

  it('draws "see all" as a link with moreHref, a button with onmore, nothing with neither', () => {
    const link = render(DiscoverSection, { props: { id: 's', title: 'S', more: 'All sites', moreHref: '/templates', children: tiles } }).body;
    expect(link).toMatch(/<a [^>]*href="\/templates"[^>]*>All sites →<\/a>/);
    expect(link).not.toContain('<button');
    const button = render(DiscoverSection, { props: { id: 's', title: 'S', more: 'All sites', onmore: () => {}, children: tiles } }).body;
    expect(button).toMatch(/<button[^>]*>All sites →<\/button>/);
    const none = render(DiscoverSection, { props: { id: 's', title: 'S', more: 'All sites', children: tiles } }).body;
    expect(none).not.toContain('All sites');
  });

  it('keeps "see all" on the title row, right-aligned, in the host accent, with the blurb below', () => {
    const { body } = render(DiscoverSection, { props: { id: 's', title: 'S', blurb: 'Blurb.', more: 'All sites', moreHref: '/t', children: tiles } });
    expect(body).toMatch(/<h2 [^>]*>S<\/h2>\s*<a [^>]*class="[^"]*ml-auto[^"]*"[^>]*href="\/t"/);
    expect(body).toMatch(/<a [^>]*class="[^"]*\btext-primary\b[^"]*"[^>]*href="\/t"/);
    expect(body).not.toContain('text-ripple-accent-text');
    expect(body.indexOf('Blurb.')).toBeGreaterThan(body.indexOf('All sites'));
  });
});

describe('DiscoverGrid, DiscoverSkeleton, DiscoverEmpty', () => {
  it('DiscoverGrid without a label names nothing', () => {
    const { body } = render(DiscoverGrid, { props: { view: 'list', children: tiles } });
    expect(body).toContain('role="list"');
    expect(body).not.toContain('aria-label');
  });

  it('DiscoverSkeleton is one labelled status, rows for list and tiles otherwise', () => {
    const grid = render(DiscoverSkeleton, { props: {} }).body;
    expect(grid).toContain('role="status"');
    expect(grid).toContain('aria-label="Loading Discover"');
    expect(grid).toContain('data-testid="discover-loading"');
    expect(grid.match(/aspect-video w-full rounded-2xl/g)).toHaveLength(8);
    expect(grid.match(/@container\/tile/g)).toHaveLength(8);
    expect(grid).toContain('@max-[15rem]/tile:block');
    const list = render(DiscoverSkeleton, { props: { view: 'list', count: 3 } }).body;
    expect(list.match(/aspect-video w-24/g)).toHaveLength(3);
    expect(list).toContain('divide-y');
  });

  it.each([
    ['empty', 'discover-empty', 'Nothing here yet'],
    ['filtered', 'discover-empty', 'Nothing matches that yet.'],
    ['error', 'discover-error', 'Discover didn&#39;t load.'],
  ] as const)('DiscoverEmpty %s', (state, testid, title) => {
    const { body } = render(DiscoverEmpty, { props: { state, actions: snip('<a href="/new">Act</a>') } });
    expect(body).toContain(`data-testid="${testid}"`);
    expect(body.replace(/'/g, '&#39;')).toContain(title);
    expect(body).toContain('href="/new"');
  });
});

describe('DiscoverHeader and DiscoverPublish', () => {
  it('DiscoverHeader paints the accent and renders children and aside', () => {
    const { body } = render(DiscoverHeader, {
      props: { title: 'Free things you can', accent: 'use right now.', lead: 'Tools.', as: 'h1', children: snip('<div>search</div>'), aside: snip('<aside>qr</aside>') },
    });
    expect(body).toMatch(/<h1 class="text-title-2 [^"]*@xl\/discover-header:text-title-1[^"]*">\s*Free things you can <span class="text-primary">use right now\.<\/span>/);
    expect(body).toMatch(/<p class="[^"]*\bhidden @xl\/discover-header:block">Tools\.<\/p>/);
    expect(body).toContain('@container/discover-header');
    expect(body).toContain('@4xl/discover-header:grid-cols-[1.1fr_0.9fr]');
    const full = render(DiscoverHeader, { props: { title: 'T', lead: 'Pitch.', narrowLead: 'full', class: 'lg:items-start' } }).body;
    expect(full).toMatch(/<p class="max-w-prose text-body text-muted-foreground">Pitch\.<\/p>/);
    // `class` lands on the grid, where alignment classes take effect.
    expect(full).toMatch(/<div class="[^"]*grid [^"]*lg:items-start[^"]*">/);
    expect(body).toContain('<div>search</div>');
    expect(body).toContain('<aside>qr</aside>');
  });

  it('DiscoverPublish is a link with href and shows no button without an action', () => {
    expect(render(DiscoverPublish, { props: { href: '/signup' } }).body).toMatch(/<a [^>]*href="\/signup"[^>]*>Publish your work<\/a>/);
    const bare = render(DiscoverPublish, { props: {} }).body;
    expect(bare).toContain('Made something with Paw OS?');
    expect(bare).not.toContain('Publish your work');
  });

  it('DiscoverPublish takes its title, body and button label as props', () => {
    const { body } = render(DiscoverPublish, { props: { title: 'Built a tool?', body: 'Share it.', cta: 'Share', href: '/app' } });
    expect(body).toContain('>Built a tool?</h2>');
    expect(body).toContain('>Share it.</p>');
    expect(body).toMatch(/<a [^>]*href="\/app"[^>]*>Share<\/a>/);
  });
});

describe('built-in copy', () => {
  // Brand rule: a product is "Paw OS" (or Paw Sites, Paw Studio), never a bare "Paw".
  const BARE_PAW = /\bPaw\b(?!\s+(OS|Sites|Studio)\b)/;

  it.each(['empty', 'filtered', 'error'] as const)('DiscoverEmpty %s defaults never say a bare Paw', (state) => {
    expect(render(DiscoverEmpty, { props: { state } }).body).not.toMatch(BARE_PAW);
  });

  it('DiscoverPublish defaults never say a bare Paw', () => {
    expect(render(DiscoverPublish, { props: { onpublish: () => {} } }).body).not.toMatch(BARE_PAW);
  });

  it('DiscoverEmpty takes a title and description over the state copy', () => {
    const { body } = render(DiscoverEmpty, { props: { state: 'filtered', title: 'No luck.', description: 'Try again.' } });
    expect(body).toContain('No luck.');
    expect(body).toContain('Try again.');
    expect(body).not.toContain('Nothing matches that yet.');
    expect(body).toContain('data-testid="discover-empty"');
  });
});

describe('card type scale', () => {
  it('the tile and row use the app type utilities, not text-sm / text-xs', () => {
    const tile = render(DiscoverTile, { props: { item: { ...item, remixCount: 3 }, href: '/discover/t1' } }).body;
    expect(tile).toMatch(/<h3 class="m-0 truncate text-headline text-foreground[ "]/);
    expect(tile).toContain('text-footnote');
    expect(tile).toContain('text-caption-1');
    expect(tile).toContain('rounded-[10px]');
    const row = render(DiscoverRow, { props: { item } }).body;
    expect(row).toContain('text-body font-semibold');
    for (const html of [tile, row]) expect(html).not.toMatch(/\btext-(sm|xs)\b/);
  });
});

describe('compact tile and the creator line', () => {
  const made: DiscoverItem = {
    ...item,
    id: 'g1',
    kind: 'game',
    liveUrl: 'https://snake.example.com',
    remixCount: 4,
    creator: { name: 'Asha Rao', avatarUrl: 'https://cdn.example.com/asha.png' },
    createdAt: '2026-10-22T23:30:00Z',
  };

  it('the tile queries its own width: clamped title, hidden line and meta, actions under the text', () => {
    const tile = render(DiscoverTile, { props: { item: made, onremix: () => {}, onreport: () => {} } }).body;
    expect(tile).toContain('@container/tile');
    expect(tile).toContain('@max-[15rem]/tile:line-clamp-2');
    expect(tile).toMatch(/<p class="[^"]*@max-\[15rem\]\/tile:hidden">Bill a client/);
    expect(tile).toMatch(/<p class="[^"]*@max-\[15rem\]\/tile:hidden" data-testid="discover-meta"/);
    expect(tile).toContain('@max-[15rem]/tile:flex-col');
    // The Remix icon hides on a compact tile; the ⋯ menu (which holds Remix) stays.
    expect(tile).toMatch(/<button[^>]*class="[^"]*@max-\[15rem\]\/tile:hidden[^"]*"[^>]*aria-label="Remix Invoice maker"/);
    expect(tile).toContain('aria-label="More for Invoice maker"');
  });

  it('draws "by <name>" with an initials avatar, and the published date in UTC', () => {
    const tile = render(DiscoverTile, { props: { item: made } }).body;
    expect(tile).toContain('data-testid="discover-creator"');
    expect(tile).toContain('by Asha Rao');
    expect(tile).toContain('>AR<');
    expect(tile).toContain('4 remixes');
    expect(tile).toContain('Oct 22, 2026');
    const row = render(DiscoverRow, { props: { item: made } }).body;
    expect(row).toContain('by Asha Rao');
    expect(row).toContain('Oct 22, 2026');
  });

  it('leaves the creator line and the date out when the listing has none', () => {
    for (const C of [DiscoverTile, DiscoverRow]) {
      const body = render(C as typeof DiscoverTile, { props: { item } }).body;
      expect(body).not.toContain('discover-creator');
      expect(body).not.toMatch(/\b20\d\d\b/);
    }
  });

  it('never points the avatar at a non-http url', () => {
    const body = render(DiscoverTile, { props: { item: { ...made, creator: { name: 'X', avatarUrl: 'javascript:alert(1)' } } } }).body;
    expect(body).not.toContain('javascript:');
  });
});
