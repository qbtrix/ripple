<!-- docs/discover.md: the ./discover export subpath, a server-renderable Discover library (cards, the item view, the page layout, the hero's WhatsApp QR card, the shared catalogue copy) for a public catalogue. Lists the surface, the purity rule, link mode, the item view, creator and dates, narrow-container behaviour, the live frame's sandbox, the QR card and the type scale. -->

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
produce (`WhatsAppQrCard` is a form, the one stateful component, and reads
the browser languages on mount; the other exceptions only change things after
hydration: `ItemArt`'s load-failure flag, `LiveFrame`'s load button and
width toggle, `ItemDetail`'s "Link copied" note, and `DiscoverFilters` sliding a selected tab into view; the server frame is the same either way).
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
title and line; a creator row when `creator` is set (avatar, "By <name>",
"Published <date>", and "· Updated <date>" when the update is more than a day
after the first publish); the usage line when `showUsage(item)` (never "No
remixes yet"); "Remixed from <title>" linking to that item's page; the
`madeWith` line when the consumer passes one ("Made with Paw Sites"); and
`tags` as chips, each a link when `tagHref(tag)` is given.

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
(`isPlainClick` is the rule). The card ⋯ menu holds Remix (tools and games,
with `onremix`), Report and, with `href` and `oncopylink`, Copy link. Site
cards have no Remix icon: Claim already copies.

## Creator and dates

`DiscoverItem` carries optional `creator: { name, handle?, avatarUrl? }`,
`createdAt` and `updatedAt` (ISO timestamps). A tile and a row draw a creator
line under the title (a small round avatar, the picture only when
`avatarUrl` is http(s), the name's initials otherwise, then "by <name>");
without a creator there is no line and no placeholder. The meta line under
it is the usage (only when `showUsage`) and the published date
(`createdAt`, else `updatedAt`).

Dates are absolute, English and UTC: `formatDiscoverDate(iso)` prints
"Oct 22, 2026" on the server and in every browser, so hydration never
rewrites a card. There is no relative "3 days ago"; the server's clock and
the visitor's differ. `publishedDate(item)` and `updatedDate(item)` (null
unless more than a day after the first publish) are the rules the detail
view uses.

## Narrow containers

Every piece sizes off its own box (Tailwind container queries), not the
viewport, because the app shell and the public page give the same component
different widths.

- `DiscoverHeader` (container `discover-header`): under 36rem the title is
  `text-title-2`, the lead is hidden (still in the HTML; pass
  `narrowLead="full"` to keep it, as a landing hero should) and the gaps
  tighten. From 56rem the `aside` sits beside the pitch. `class` lands on the
  inner grid.
- `DiscoverChips`: one row that scrolls sideways (snap, no visible bar, a fade
  on the trailing edge). Tab reaches every chip.
- `DiscoverFilters` (container `discover-filters`): the kind tabs scroll in
  their own faded track; the selected segment paints its own surface, so it
  is right in the server markup and lines up at any width. On mount the track
  slides a selected tab past its edge into view. The view toggle never
  shrinks and is icon-only under 36rem (labels stay for screen readers and as
  `title`).
- The grid (`DiscoverGrid`, `DiscoverSkeleton`) never drops below two
  columns: each track's floor is the smaller of 240px and half the grid less
  the gap, so a phone gets two columns and wider containers auto-fill 240px
  tracks as before. No container query, so the class works anywhere.
- `DiscoverTile` (container `tile`, on the tile itself): under 15rem it goes
  compact. The title clamps to two lines, the description and the meta line
  hide, and the actions drop under the text: a small primary and the ⋯ menu
  (the Remix icon hides; Remix is in ⋯). A shelf (16rem tiles) and a wide
  grid keep the full tile.
- `DiscoverSection`: the "All … →" link stays on the title's row,
  right-aligned (it wraps under the title, still right-aligned, only when the
  row is too narrow), painted `text-primary`, the host's accent, which reads
  on the app's and the public site's surfaces alike.
- `WhatsAppQrCard` (container `qr-card`, see below) collapses to a teaser.

### The live frame

`LiveFrame` shows the poster first and creates no iframe until the visitor
presses "Load site", "Play" or "Open tool". That button appears after
hydration, so with JS off the page shows the poster and the "Open full
screen" link, which always points at the live page (`target="_blank"`,
`rel="nofollow ugc noopener noreferrer"`). Sites get a Desktop / Phone width
toggle (phone is a 390px centred frame) once loaded.

The iframe gets `sandbox="allow-scripts allow-forms allow-popups
allow-pointer-lock"`, `allow="fullscreen; gamepad; autoplay"`,
`referrerpolicy="no-referrer"`, `loading="lazy"`. `allow-same-origin` is added
only when the url is https and its hostname ends in
`LIVE_FRAME_TRUSTED_HOST_SUFFIX` (`.pawsites.workers.dev`, a subdomain match:
the bare domain, `pawsites.workers.dev.evil.com` and http do not qualify).
`frameSandbox(url)` is the rule. Scripts plus same-origin only let a page lift
its sandbox when it shares the embedder's origin. Each published site is its
own subdomain on a registrable domain apart from `pocketpaw.xyz` and the app,
so it keeps its own origin and storage, which games need for saved scores.
Every other host runs in an opaque origin, where `localStorage`, cookies and
IndexedDB throw; such a page still works through "Open full screen". To trust
another host, extend the constant.

## The WhatsApp QR card

`WhatsAppQrCard` is the hero's "Try one · no sign-up" widget, and the one
stateful component here: a form that turns a shop name and a WhatsApp number
into a printable counter card. The app's /discover and the public Discover page
mount the same component in `DiscoverHeader`'s `aside` (with
`class="lg:items-start"` on the header so the card lines up with the title).

```svelte
<script>
  import { DiscoverHeader, WhatsAppQrCard } from '@ripple-ui/svelte/discover';
</script>

<DiscoverHeader title="Free things you can" accent="use right now." class="lg:items-start">
  {#snippet aside()}<WhatsAppQrCard brand="Paw OS" makeHref="https://app.example.com/" />{/snippet}
</DiscoverHeader>
```

- **Number.** 71 calling codes (`Select`), defaulting on mount from
  `navigator.languages` (`en-GB` gives GB), else India. A pasted
  `+44 7700 900123` or `0044 …` switches the country. The whole E.164 number must
  be 8 to 15 digits; the reason shows under the field (`aria-live`) once it is
  left. Until the number is valid the preview shows a placeholder, there is no
  link, and every export is disabled.
- **Link.** `https://wa.me/<digits>?text=<message>`, the message optional
  (default `Hi! I'd like to place an order.`, at most 200 characters), with Copy
  and "Test it".
- **Card.** 148 × 105 mm, always dark ink on white paper whatever the theme. The
  preview is the same card, tilted (flat with reduced motion). PNG at 300 dpi
  (1748 × 1240), SVG sized in mm, and Print as one 148 × 105 mm page from a
  hidden iframe. Files are named from the slugified shop
  (`sharma-sweets-whatsapp-qr.png`). One QR path (`qrcode-svg`'s matrix, error
  correction M) draws the preview, the SVG and the PNG.
- **Server render.** India and the example `Sharma Sweets` / `98765 43210`: a
  real QR and link, so a page with JS off shows a
  meaningful example ("Test it" is a plain link). On mount the number clears and
  the country follows the browser.
- **Collapsed on phones.** The card sits in a `<details>` whose `<summary>` is
  a one-line teaser ("Make a WhatsApp QR card for your shop" and a chevron).
  Under 30rem of the card's own box the details start closed and the teaser
  opens them. From 30rem the teaser hides and the body shows while the
  details stay closed, through `::details-content`, so the server markup is
  identical at every width and nothing jumps on hydration; it all works with
  JS off. A browser without `::details-content` keeps the teaser at every
  width, and on mount a wide card there opens itself.

Props, all optional: `brand` (`'Paw'`; named in "Make a full menu or site with
…" and on the card's foot), `oncopy(text)` (default: the clipboard API),
`onopenlink(url)` (default: a `target="_blank"` link), `ondownload(blob,
filename)` (default: an anchor download of a blob URL), `onmake(shop)` or
`makeHref` (the make action renders only when one is given), `class`.

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
| `DiscoverTile` | component | One item in a grid or shelf: art, title, one line, the creator line, usage (hidden at zero) and published date, actions; compact under 15rem. Props: `item`, `href?`, `target?`, `rel?`, `onremix?`, `onreport?`, `onopen?`, `oncopylink?` (`(item, href) => void`), `busy?`, `class?`. |
| `DiscoverRow` | component | The same item as a list row (`role="listitem"`). Same props as the tile. |
| `ItemArt` | component | The 16:9 picture: the image, a tinted placeholder with the title's initial, a music cover, or a play badge on a video. Props: `imageUrl`, `title`, `mediaKind?`, `tint`, `initial`, `class?`. |
| `DetailMedia` | component | The detail view's media: `<video>` with poster, music cover plus `<audio>`, or the full image. Props: `item`, `class?`. |
| `ItemDetail` | component | One item in full, for its page or an overlay body. Props: `item`, `layout` (`'page'` or `'overlay'`), `compact?`, `href?`, `remixHref?`, `onremix?`, `onreport?`, `oncopylink?` (`(item) => void`), `busy?`, `headingLevel?` (`'h1'` or `'h2'`), `madeWith?` (a line such as "Made with Paw Sites"), `tagHref?` (`(tag) => string`; tags become links), `class?`. |
| `LiveFrame` | component | A live page behind a poster: click to load the sandboxed iframe, a width toggle for sites, an "Open full screen" link. Props: `url`, `title`, `kind`, `poster?`, `tint`, `initial`, `class?`. |
| `DiscoverHeader` | component | The pitch: a title with an optional primary-coloured `accent`, a lead, children (search, chips) and an `aside` beside it on wide containers; compact under 36rem. Props: `title`, `accent?`, `lead?`, `as?` (`'h2'` default, `'h1'` on a page without its own header), `narrowLead?` (`'hide'` default, `'full'`), `children?`, `aside?`, `class?` (on the inner grid). |
| `DiscoverSearch` | component | Search in filter mode. Props: `value?`, `oninput?`, `action?` (GET form target), `name?` (`q`), `hidden?` (kept params), `placeholder?`, `class?`. |
| `DiscoverChips` | component | Audience toggle chips. Props: `options` (`{ value, label, href? }[]`), `value?`, `onchange?`, `label?`, `class?`. |
| `DiscoverFilters` | component | The sticky type bar: kind tabs and the Grid / Shelves / List toggle. Props: `kinds`, `kind`, `onkind?`, `view?`, `onview?`, `viewHref?`, `class?`. The toggle shows only with `onview` or `viewHref`. |
| `DiscoverSection` | component | A titled shelf: heading (`discover-h-{id}`), blurb, a "see all" link or button, then its children in a `DiscoverGrid`. Props: `id`, `title`, `blurb?`, `more?`, `moreHref?`, `onmore?`, `view?`, `children`, `class?`. |
| `DiscoverGrid` | component | The items container by view: auto-fill grid, snapping shelf, or a bordered `role="list"`. Props: `view?`, `label?`, `children`, `class?`. |
| `DiscoverSkeleton` | component | The loading state, one `role="status"`: tile skeletons, or row skeletons for the list view. Props: `view?`, `count?` (8), `label?`, `class?`. |
| `DiscoverEmpty` | component | `Nothing here yet`, `Nothing matches that yet.` or the load error. Props: `state?` (`'empty'`, `'filtered'`, `'error'`), `title?` and `description?` (replace the state's copy), `actions?`, `class?`. |
| `DiscoverPublish` | component | The publish band. Props: `title?`, `body?`, `cta?` (the button label), `href?` or `onpublish?`, `class?`. |
| `WhatsAppQrCard` | component | The hero's WhatsApp QR card (see above). Props: `brand?`, `oncopy?`, `onopenlink?`, `ondownload?`, `onmake?` (`(shop) => void`), `makeHref?`, `class?`. |
| `DISCOVER_VIEWS` | constant | `['grid', 'shelves', 'list']`, the toggle order. |
| `itemHref(kind, idOrSlug)` | helper | The item's page: `/discover/<slug>` for every kind. |
| `LEGACY_ITEM_PREFIXES` | constant | The old per-kind folders, for redirects: `{ tool: '/free-tools/', game: '/play/', site: '/templates/' }`. |
| `isPlainClick(event)` | helper | True for an unmodified primary-button click, the one a card may take over. |
| `rendererFor(item)` | helper | `'media'`, `'frame'` or `'art'`: what the detail view shows. |
| `showUsage(item)` | helper | False at zero, so the usage line can be left out. |
| `httpUrl(raw)` | helper | The url when it is http(s), else `null`. |
| `frameSandbox(url)`, `isTrustedFrameHost(url)`, `LIVE_FRAME_TRUSTED_HOST_SUFFIX` | helper | The live frame's sandbox: `allow-same-origin` only for https on a `.pawsites.workers.dev` subdomain. |
| `DISCOVER_TYPES`, `DISCOVER_AUDIENCES` | constant | The type tabs and the audience chips. |
| `discoverSections(brand)`, `groupSections(items)`, `sectionFilter(key)`, `relatedHeading(kind)` | helper | The shared section copy, grouping, "All …" filters and related heading (see above). |
| `primaryFor(item)` | helper | The primary action: `Use` or `Play` with an http(s) `href`, `Claim` or `Use this recipe` needing an account, or `null`. |
| `mediaFor(item)` | helper | The playable media `{ kind, url }` for a studio item, or `null`. |
| `usageLabel(item)`, `remixLabel(n)`, `usedLabel(n)` | helper | The usage line: `No remixes yet`, `1 remix`, `1.2k remixes`; `Not used yet`, `1 used`, `1.2k used`. |
| `isStudioKind(kind)` | helper | True for `image`, `video` and `music`. |
| `formatDiscoverDate(iso)`, `publishedDate(item)`, `updatedDate(item)` | helper | Hydration-stable dates: "Oct 22, 2026" in English and UTC, or `null`; the published date (`createdAt`, else `updatedAt`); the update date only when more than a day after the first publish. |
| `creatorInitials(name)` | helper | Up to two initials for the avatar fallback: `Asha Rao` gives `AR`. |
| `tintFor(id)`, `initialFor(title)`, `CARD_PALETTE` | helper | Placeholder art: a stable coloured theme token per id and the title's first letter. |
| `DiscoverItem`, `DiscoverKind`, `DiscoverMediaKind`, `StudioKind`, `DiscoverPrimary` | type | The item shape and its unions. Consumers map their wire format onto `DiscoverItem`. |
| `DiscoverView`, `DiscoverOption` | type | A view mode; a filter choice `{ value, label, href? }`. |
| `DiscoverRenderer`, `DiscoverSectionKey`, `DiscoverAudience`, `DiscoverSectionCopy`, `GroupableItem` | type | The renderer union; a section key; an audience; a section's copy; what `groupSections` needs. |

The exact runtime list is frozen by `src/lib/discover/discover-contract.test.ts`;
the server markup by `src/lib/discover/discover.ssr.test.ts` (cards),
`src/lib/discover/discover-detail.ssr.test.ts` (item view) and
`src/lib/discover/discover-layout.ssr.test.ts` (layout); the section rules by
`src/lib/discover/sections.test.ts` and the frame sandbox by
`src/lib/discover/frame.test.ts`.
