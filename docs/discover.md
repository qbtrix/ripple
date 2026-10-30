<!-- docs/discover.md: the ./discover export subpath, a server-renderable Discover library (cards, the item view, the page layout, the shared catalogue copy) for a public catalogue. Lists the surface, the purity rule, link mode, the item view, the live frame's sandbox and the type scale. -->

# Discover

`@ripple-ui/svelte/discover` is the Discover library as components: the cards
(a tile for a grid or shelf, a row for a list, the 16:9 picture both share),
the item view (`ItemDetail`, with the studio player and the live frame), the
shared catalogue copy and grouping, and the page layout around them (header,
search, audience chips, the sticky type bar, titled sections, the loading
skeleton, the empty states and the publish band). paw-enterprise's /discover
and the public site render from these, so the two look the same. Everything
renders fully on the server. There is no store, no fetch and no `$effect`; a prerendered
page gets complete HTML, and a hydrated page gets the callbacks.

```svelte
<script>
  import { DiscoverTile, itemHref } from '@ripple-ui/svelte/discover';
  let { items } = $props();
</script>

{#each items as item (item.id)}
  <DiscoverTile {item} href={itemHref(item.kind, item.slug ?? item.id)} onremix={remix} />
{/each}
```

## The purity rule

Props in, markup out. A component derives everything it shows from the
`DiscoverItem` it is given, through the pure helpers below. It never reads
`window` or `document`, never fetches, and never keeps state a server cannot
produce (the exceptions only change things after hydration: `ItemArt`'s
load-failure flag, `LiveFrame`'s load button and width toggle, and
`ItemDetail`'s "Link copied" note; the server frame is the same either way).
Only `http(s)` urls reach an `href` or a `src`: `imageUrl`, `mediaUrl` and
`liveUrl` all pass through `httpUrl`, so a `javascript:`, `data:` or
protocol-relative value renders the placeholder, no media, or no action.

Buttons render only when their callback is passed, so a static page shows
just the links. The `href` prop is the consumer's own route and is not
guarded; relative routes work there. Consumers whose item pages are
off-site pass `target="_blank" rel="noopener"` to the tile and row.

## Callbacks or links

Every control takes either a callback (the app) or an `href` (a prerendered
page with JS off). `DiscoverFilters` renders link pills when any kind option
has an `href` or `viewHref` is given, and ripple's `Segmented` radios
otherwise. `Segmented` itself takes no `href`: it is a spec widget whose
options can be model-authored, so it stays free of an unguarded URL sink.
`DiscoverChips` renders links with `aria-current` or buttons with
`aria-pressed`. `DiscoverSearch` with `action` is a plain GET form that
submits `q` and keeps the other filters as hidden inputs.

```svelte
<script>
  import { DiscoverFilters, DiscoverSection, DiscoverTile, itemHref } from '@ripple-ui/svelte/discover';
  let { kinds, kind, sections } = $props(); // kinds: { value, label, href }[]
</script>

<DiscoverFilters {kinds} {kind} />
{#each sections as s (s.key)}
  <DiscoverSection id={s.key} title={s.title} blurb={s.blurb} more={s.more} moreHref={s.moreHref}>
    {#each s.items as item (item.id)}
      <DiscoverTile {item} href={itemHref(item.kind, item.slug ?? item.id)} />
    {/each}
  </DiscoverSection>
{/each}
```

`DiscoverFilters` paints `bg-background`; a host with its own surface passes
it through `class` (the app passes its `feature-surface` glass). The shelves
view bleeds into a `px-6` page gutter (`-mx-6 px-6`), so put sections in a
`px-6` column, as the app does.

## Item pages and the overlay

Every item lives at `/discover/<slug>`: `itemHref(kind, slug)` returns that for
every kind. The old per-kind folders are in `LEGACY_ITEM_PREFIXES`
(`{ tool: '/free-tools/', game: '/play/', site: '/templates/' }`) so the
website can redirect them.

`ItemDetail` is one item in full, and the same body serves two places:

- `layout="page"`: the item's own route. Wide (`max-w-4xl`, padded), `h1`.
- `layout="overlay"`: inside the consumer's `Dialog` (desktop) or bottom
  `Sheet` (narrow). No outer padding, `h2`. ItemDetail never draws the
  overlay itself. Pass `compact` in the narrow sheet: a site, game or tool
  then shows its picture and an **Open** link to `href` (the full page)
  instead of loading the live frame there. Studio media still plays.

```svelte
<script>
  import { DiscoverTile, ItemDetail, itemHref } from '@ripple-ui/svelte/discover';
  import { Dialog } from '@ripple-ui/svelte/ui';
  let { items } = $props();
  let open = $state(null);
</script>

{#each items as item (item.id)}
  <DiscoverTile {item} href={itemHref(item.kind, item.slug ?? item.id)} onopen={(it) => (open = it)} />
{/each}
<Dialog.Root open={!!open} onOpenChange={(o) => !o && (open = null)}>
  <Dialog.Content>
    {#if open}<ItemDetail item={open} layout="overlay" href={itemHref(open.kind, open.slug ?? open.id)} onremix={remix} />{/if}
  </Dialog.Content>
</Dialog.Root>
```

The body is picked by `rendererFor(item)`: `'media'` (a studio item with a
playable `mediaUrl`, via `DetailMedia`), `'frame'` (a site, game or tool with
an http(s) `liveUrl`, via `LiveFrame`), else `'art'` (`ItemArt`). Below it:
title, line, "By <name>" when `creator` is set, the usage line when
`showUsage(item)` (never "No remixes yet"), "Remixed from <title>" linking to
that item's page, and `tags` as chips.

Actions: the primary from `primaryFor` (Use / Play link to the live page;
Claim / Use this recipe as the `remixHref` link or the `onremix` button), a
**Remix in Paw OS** for tools and games only (for a site or a studio item the
primary already is the remix), and a ⋯ menu with Copy link (with `href` or
`oncopylink`; without `oncopylink` it copies `href` resolved against the
page) and Report (with `onreport`). The website passes `remixHref` (a link
into the app); the app passes `onremix`.

On a card, `onopen` with `href` makes a plain left click on the art or title
call `onopen(item)` and `preventDefault`; ctrl/cmd/shift/alt and middle clicks
still follow the link, and with JS off the link is all there is
(`isPlainClick` is the rule). The card ⋯ menu holds Report and, with `href`
and `oncopylink`, Copy link. Site cards have no Remix icon: Claim already
copies.

### The live frame

`LiveFrame` shows the poster first and creates no iframe until the visitor
presses "Load site", "Play" or "Open tool". That button appears after
hydration, so with JS off the page shows the poster and the "Open full
screen" link, which always points at the live page (`target="_blank"`,
`rel="nofollow ugc noopener noreferrer"`). Sites get a Desktop / Phone width
toggle (phone is a 390px centred frame) once loaded.

The iframe is fixed at `sandbox="allow-scripts allow-forms allow-popups
allow-pointer-lock"`, `allow="fullscreen; gamepad; autoplay"`,
`referrerpolicy="no-referrer"`, `loading="lazy"`. `allow-same-origin` is
left out: items sit on their own origin, but the url is listing data, and
scripts plus same-origin on a url that ever named the host's origin would let
the page lift its own sandbox. The cost is that a framed page runs in an
opaque origin, where `localStorage`, cookies and IndexedDB throw; such a page
still works through "Open full screen".

## Shared catalogue copy

The app and the website group and label the catalogue the same way:

- `DISCOVER_TYPES`: the type tabs, `all` first.
- `DISCOVER_AUDIENCES`: `shop`, `design`, `everyone`, `fun` with their chip labels.
- `discoverSections(brand)`: each section's `title`, `blurb` and `more`, with
  the product name injected. The app passes `'Paw'`, the website `'Paw OS'`.
- `groupSections(items)`: each item into its first matching section, in the
  order picks, studio, shop, design, everyone, play, site, more; empty
  sections dropped. Takes any item with `featured`, `kind` and optional
  `audiences`, and returns your type unchanged.
- `sectionFilter(key)`: the filter a section's "All …" link sets
  (`shop` → tools for shops, `design` / `everyone` → that audience, `play` →
  games, `site` → sites), or `null` for picks, studio and more.
- `relatedHeading(kind)`: "More sites", "More music", … or "More like this".

## Built-in copy

`DiscoverPublish` and `DiscoverEmpty` ship default copy that names the product
"Paw OS", never a bare "Paw" (the brand rule: PocketPaw is the maker, the
products are Paw OS, Paw Sites and Paw Studio). Pass your own through
`DiscoverPublish`'s `title`, `body` and `cta`, or `DiscoverEmpty`'s `title`
and `description`. The empty state's call to action is the `actions` snippet.

## Type scale

The components use paw-enterprise's Apple-style type utilities
(`text-title-1`, `text-title-2`, `text-title-3`, `text-headline`,
`text-body`, `text-body-emph`, `text-callout`, `text-subheadline`,
`text-footnote`, `text-caption-1`, `text-caption-2`), not `text-sm` and
`text-xs`. `theme.css` defines them as `@utility` blocks over `--text-*`,
`--lh-*` and `--weight-*` custom properties, a verbatim copy of the app's
`global.css`. The properties sit on `:where(:root)`, so a host's own `:root`
values win; they are kept out of `@theme`, where a `--text-*` token would
mint a second, functional `text-*` utility. A host that defines the same
utilities (paw-enterprise does, after importing `theme.css`) emits both rules
with identical declarations, so nothing changes. Hosts must scan ripple's
`dist` with `@source` for the classes to generate.

## Exports

| Name | Kind | What it is |
|---|---|---|
| `DiscoverTile` | component | One item in a grid or shelf: art, title, one line, usage (hidden at zero), actions. Props: `item`, `href?`, `target?`, `rel?`, `onremix?`, `onreport?`, `onopen?`, `oncopylink?` (`(item, href) => void`), `busy?`, `class?`. |
| `DiscoverRow` | component | The same item as a list row (`role="listitem"`). Same props as the tile. |
| `ItemArt` | component | The 16:9 picture: the image, a tinted placeholder with the title's initial, a music cover, or a play badge on a video. Props: `imageUrl`, `title`, `mediaKind?`, `tint`, `initial`, `class?`. |
| `DetailMedia` | component | The detail view's media: `<video>` with poster, music cover plus `<audio>`, or the full image. Props: `item`, `class?`. |
| `ItemDetail` | component | One item in full, for its page or an overlay body. Props: `item`, `layout` (`'page'` or `'overlay'`), `compact?`, `href?`, `remixHref?`, `onremix?`, `onreport?`, `oncopylink?` (`(item) => void`), `busy?`, `headingLevel?` (`'h1'` or `'h2'`), `class?`. |
| `LiveFrame` | component | A live page behind a poster: click to load the sandboxed iframe, a width toggle for sites, an "Open full screen" link. Props: `url`, `title`, `kind`, `poster?`, `tint`, `initial`, `class?`. |
| `DiscoverHeader` | component | The pitch: a title with an optional primary-coloured `accent`, a lead, children (search, chips) and an `aside` beside it on wide screens. Props: `title`, `accent?`, `lead?`, `as?` (`'h2'` default, `'h1'` on a page without its own header), `children?`, `aside?`, `class?`. |
| `DiscoverSearch` | component | Search in filter mode. Props: `value?`, `oninput?`, `action?` (GET form target), `name?` (`q`), `hidden?` (kept params), `placeholder?`, `class?`. |
| `DiscoverChips` | component | Audience toggle chips. Props: `options` (`{ value, label, href? }[]`), `value?`, `onchange?`, `label?`, `class?`. |
| `DiscoverFilters` | component | The sticky type bar: kind tabs and the Grid / Shelves / List toggle. Props: `kinds`, `kind`, `onkind?`, `view?`, `onview?`, `viewHref?`, `class?`. The toggle shows only with `onview` or `viewHref`. |
| `DiscoverSection` | component | A titled shelf: heading (`discover-h-{id}`), blurb, a "see all" link or button, then its children in a `DiscoverGrid`. Props: `id`, `title`, `blurb?`, `more?`, `moreHref?`, `onmore?`, `view?`, `children`, `class?`. |
| `DiscoverGrid` | component | The items container by view: auto-fill grid, snapping shelf, or a bordered `role="list"`. Props: `view?`, `label?`, `children`, `class?`. |
| `DiscoverSkeleton` | component | The loading state, one `role="status"`: tile skeletons, or row skeletons for the list view. Props: `view?`, `count?` (8), `label?`, `class?`. |
| `DiscoverEmpty` | component | `Nothing here yet`, `Nothing matches that yet.` or the load error. Props: `state?` (`'empty'`, `'filtered'`, `'error'`), `title?` and `description?` (replace the state's copy), `actions?`, `class?`. |
| `DiscoverPublish` | component | The publish band. Props: `title?`, `body?`, `cta?` (the button label), `href?` or `onpublish?`, `class?`. |
| `DISCOVER_VIEWS` | constant | `['grid', 'shelves', 'list']`, the toggle order. |
| `itemHref(kind, idOrSlug)` | helper | The item's page: `/discover/<slug>` for every kind. |
| `LEGACY_ITEM_PREFIXES` | constant | The old per-kind folders, for redirects: `{ tool: '/free-tools/', game: '/play/', site: '/templates/' }`. |
| `isPlainClick(event)` | helper | True for an unmodified primary-button click, the one a card may take over. |
| `rendererFor(item)` | helper | `'media'`, `'frame'` or `'art'`: what the detail view shows. |
| `showUsage(item)` | helper | False at zero, so the usage line can be left out. |
| `httpUrl(raw)` | helper | The url when it is http(s), else `null`. |
| `DISCOVER_TYPES`, `DISCOVER_AUDIENCES` | constant | The type tabs and the audience chips. |
| `discoverSections(brand)`, `groupSections(items)`, `sectionFilter(key)`, `relatedHeading(kind)` | helper | The shared section copy, grouping, "All …" filters and related heading (see above). |
| `primaryFor(item)` | helper | The primary action: `Use` or `Play` with an http(s) `href`, `Claim` or `Use this recipe` needing an account, or `null`. |
| `mediaFor(item)` | helper | The playable media `{ kind, url }` for a studio item, or `null`. |
| `usageLabel(item)`, `remixLabel(n)`, `usedLabel(n)` | helper | The usage line: `No remixes yet`, `1 remix`, `1.2k remixes`; `Not used yet`, `1 used`, `1.2k used`. |
| `isStudioKind(kind)` | helper | True for `image`, `video` and `music`. |
| `tintFor(id)`, `initialFor(title)`, `CARD_PALETTE` | helper | Placeholder art: a stable coloured theme token per id and the title's first letter. |
| `DiscoverItem`, `DiscoverKind`, `DiscoverMediaKind`, `StudioKind`, `DiscoverPrimary` | type | The item shape and its unions. Consumers map their wire format onto `DiscoverItem`. |
| `DiscoverView`, `DiscoverOption` | type | A view mode; a filter choice `{ value, label, href? }`. |
| `DiscoverRenderer`, `DiscoverSectionKey`, `DiscoverAudience`, `DiscoverSectionCopy`, `GroupableItem` | type | The renderer union; a section key; an audience; a section's copy; what `groupSections` needs. |

The exact runtime list is frozen by `src/lib/discover/discover-contract.test.ts`;
the server markup by `src/lib/discover/discover.ssr.test.ts` (cards),
`src/lib/discover/discover-detail.ssr.test.ts` (item view) and
`src/lib/discover/discover-layout.ssr.test.ts` (layout); the section rules by
`src/lib/discover/sections.test.ts`.
