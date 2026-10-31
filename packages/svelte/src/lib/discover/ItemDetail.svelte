<!-- discover/ItemDetail.svelte — one Discover item in full: the renderer picked
     by rendererFor (the studio player, the live page in a LiveFrame, or the
     picture), the title and line, the creator row (avatar, name, "Published
     <date>" and "· Updated <date>" when it changed more than a day later;
     dates are fixed-locale UTC so hydration never rewrites them), the usage
     line (left out at zero), the `madeWith` line, what it was remixed from,
     its tags (links with `tagHref`, plain chips otherwise) and the actions.

     Two layouts. layout="page" is the item's own route: one bordered card
     (container `item-page`) with the preview large on the left (a site, game
     or tool autoloads in a tall LiveFrame) and a sticky info panel on the
     right (title, actions, then the metadata) from 56rem of container;
     narrower, the panel stacks under the preview. h1. layout="overlay" is the
     body of a consumer's Dialog or Sheet: one column, no side padding, h2, a
     top inset that keeps the media clear of the close button, click-to-load
     frames, actions last. It never draws the Dialog or Sheet itself.
     `compact` is the narrow overlay: a framed item shows its picture instead
     of loading the frame; media still plays. `pageHref` (overlay only) adds
     "See full page", a link to the item's page; `onpage` takes a plain click
     on it so a consumer can close its overlay and navigate (modified clicks
     follow the link).

     Actions: the primary (Use / Play link to the live page; Claim / Use this
     recipe as `remixHref` link or `onremix` button), a "Remix in Paw OS" for
     tools and games only (a studio or site primary already is the remix), and
     a ⋯ menu with Copy link (`href` or `oncopylink`) and Report (`onreport`).
     Without `oncopylink`, Copy link writes `href` resolved against the page to
     the clipboard. Renders fully on the server. -->
<script lang="ts">
  import { safeUrl } from '@ripple-ui/core';
  import GitFork from '@lucide/svelte/icons/git-fork';
  import Maximize2 from '@lucide/svelte/icons/maximize-2';
  import Chip from '../widgets/display/Chip.svelte';
  import { Button } from '../components/ui/button/index.js';
  import { cn } from '$lib/utils.js';
  import CreatorAvatar from './CreatorAvatar.svelte';
  import DetailMedia from './DetailMedia.svelte';
  import ItemArt from './ItemArt.svelte';
  import ItemMenu from './ItemMenu.svelte';
  import LiveFrame from './LiveFrame.svelte';
  import { initialFor, tintFor } from './art.js';
  import { isPlainClick, itemHref } from './href.js';
  import { httpUrl, isStudioKind, primaryFor, publishedDate, rendererFor, showUsage, updatedDate, usageLabel } from './item.js';
  import type { DiscoverItem } from './types.js';

  let {
    item,
    layout,
    compact = false,
    href,
    remixHref,
    onremix,
    onreport,
    oncopylink,
    busy = false,
    headingLevel,
    madeWith,
    tagHref,
    pageHref,
    onpage,
    class: className,
  }: {
    item: DiscoverItem;
    /** 'page': the item's own route, two columns. 'overlay': inside a consumer's Dialog or Sheet. */
    layout: 'page' | 'overlay';
    /** Narrow overlay: framed items show the picture, not the live frame. */
    compact?: boolean;
    /** The item's own page (Copy link; the compact Open when there is no `pageHref`). */
    href?: string;
    /** Remix as a link (the website, to the app). Wins over `onremix`. */
    remixHref?: string;
    /** Remix as a callback (the app). */
    onremix?: (item: DiscoverItem) => void;
    onreport?: (item: DiscoverItem) => void;
    /** Replaces the built-in clipboard copy of `href`. */
    oncopylink?: (item: DiscoverItem) => void;
    busy?: boolean;
    /** Defaults to h1 for a page, h2 for an overlay. */
    headingLevel?: 'h1' | 'h2';
    /** A line naming the tool it was made with, e.g. "Made with Paw Sites". */
    madeWith?: string;
    /** Makes each tag a link to this address (a filtered Discover page). */
    tagHref?: (tag: string) => string;
    /** Overlay only: draws "See full page", a link to the item's own page. */
    pageHref?: string;
    /** Takes a plain click on "See full page" (the link's default is prevented). */
    onpage?: (item: DiscoverItem) => void;
    class?: string;
  } = $props();

  const renderer = $derived(rendererFor(item));
  const primary = $derived(primaryFor(item));
  const isPage = $derived(layout === 'page');
  const heading = $derived(headingLevel ?? (isPage ? 'h1' : 'h2'));
  const tint = $derived(tintFor(item.id));
  const initial = $derived(initialFor(item.title));
  const liveUrl = $derived(httpUrl(item.liveUrl));
  // A studio or site primary is already the remix; a second button would repeat it.
  const remixButton = $derived(!isStudioKind(item.kind) && item.kind !== 'site' && Boolean(remixHref || onremix));
  const canCopy = $derived(Boolean(href || oncopylink));
  const creator = $derived(item.creator?.name ? item.creator : null);
  const published = $derived(publishedDate(item));
  const updated = $derived(updatedDate(item));
  const pageLink = $derived(!isPage && pageHref ? pageHref : undefined);
  // The compact sheet's Open predates pageHref; with pageHref, See full page leads instead.
  const compactOpen = $derived(compact && renderer === 'frame' && Boolean(href) && !pageLink);
  const leadsWithPage = $derived(compact && Boolean(pageLink));
  const primaryVariant = $derived(compactOpen || leadsWithPage ? 'outline' : 'default');
  // The page panel has room for callout-size metadata; the overlay keeps it small.
  const metaText = $derived(isPage ? 'text-callout' : 'text-footnote');
  let copied = $state(false);

  async function copyLink() {
    if (oncopylink) return oncopylink(item);
    if (!href) return;
    try {
      await navigator.clipboard.writeText(new URL(href, location.href).href);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      // No clipboard (insecure context, denied): nothing to undo.
    }
  }

  function openPage(e: MouseEvent) {
    if (!onpage || !isPlainClick(e)) return;
    e.preventDefault();
    onpage(item);
  }
</script>

{#snippet preview()}
  {#if renderer === 'media'}
    <DetailMedia {item} />
  {:else if renderer === 'frame' && liveUrl && !compact}
    <LiveFrame
      url={liveUrl}
      title={item.title}
      kind={item.kind}
      poster={safeUrl(item.imageUrl ?? undefined, { kind: 'resource' })}
      {tint}
      {initial}
      autoload={isPage}
      tall={isPage}
    />
  {:else}
    <ItemArt imageUrl={item.imageUrl} title={item.title} mediaKind={item.mediaKind} {tint} {initial} />
  {/if}
{/snippet}

{#snippet titleBlock()}
  <div class="flex flex-col gap-1.5">
    <svelte:element this={heading} class={cn('m-0 text-foreground', isPage ? 'text-title-1' : 'text-title-2')}>{item.title}</svelte:element>
    {#if item.desc}<p class="m-0 text-body text-muted-foreground">{item.desc}</p>{/if}
  </div>
{/snippet}

{#snippet meta()}
  {#if creator || published}
    <div class="flex min-w-0 items-center gap-3" data-testid="discover-detail-creator">
      {#if creator}<CreatorAvatar name={creator.name} avatarUrl={creator.avatarUrl} size="lg" />{/if}
      <div class="flex min-w-0 flex-col">
        {#if creator}<span class="truncate text-callout font-medium text-foreground">By {creator.name}</span>{/if}
        {#if published}
          <span class={cn(metaText, 'text-muted-foreground tabular-nums')} data-testid="discover-detail-dates"
            >Published {published}{#if updated}{' '}· Updated {updated}{/if}</span
          >
        {/if}
      </div>
    </div>
  {/if}

  {#if showUsage(item) || item.remixedFrom || madeWith}
    <div class={cn('flex flex-col', isPage ? 'gap-1.5' : 'gap-1')}>
      {#if showUsage(item)}
        <p class={cn('m-0 flex items-center gap-1.5 text-muted-foreground tabular-nums', isPage ? 'text-callout' : 'text-caption-1')}>
          <GitFork class={isPage ? 'size-3.5' : 'size-3'} aria-hidden="true" />{usageLabel(item)}
        </p>
      {/if}
      {#if item.remixedFrom}
        <p class={cn('m-0 text-muted-foreground', metaText)} data-testid="discover-detail-remixed-from">
          Remixed from <a class="text-foreground hover:underline" href={safeUrl(itemHref(item.kind, item.remixedFrom.slug))}>{item.remixedFrom.title}</a>
        </p>
      {/if}
      {#if madeWith}<p class={cn('m-0 text-muted-foreground', metaText)} data-testid="discover-detail-made-with">{madeWith}</p>{/if}
    </div>
  {/if}

  {#if item.tags?.length}
    <ul class="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Tags">
      {#each item.tags as tag (tag)}
        <li>
          {#if tagHref}
            <a class="rounded-md focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none underline-offset-2 hover:underline" href={safeUrl(tagHref(tag))}><Chip size="sm" label={tag} /></a>
          {:else}
            <Chip size="sm" label={tag} />
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

{#snippet pageButton(variant: 'default' | 'outline')}
  <Button {variant} class="rounded-full px-5" href={safeUrl(pageLink)} onclick={openPage} data-testid="discover-detail-page-link"
    ><Maximize2 aria-hidden="true" />See full page</Button
  >
{/snippet}

{#snippet actions()}
  <div class="flex flex-wrap items-center gap-2" data-testid="discover-detail-actions">
    {#if compactOpen && href}
      <Button class="rounded-full px-5" href={safeUrl(href)}>Open</Button>
    {/if}
    {#if leadsWithPage}{@render pageButton('default')}{/if}
    {#if primary?.href}
      <Button
        variant={primaryVariant}
        class="rounded-full px-5"
        href={safeUrl(primary.href)}
        target="_blank"
        rel="nofollow ugc noopener noreferrer"
        aria-label={`${primary.label} ${item.title} (opens in a new tab)`}>{primary.label}</Button
      >
    {:else if primary && remixHref}
      <Button variant={primaryVariant} class="rounded-full px-5" href={safeUrl(remixHref)}>{primary.label}</Button>
    {:else if primary && onremix}
      <Button variant={primaryVariant} class="rounded-full px-5" disabled={busy} onclick={() => onremix(item)}>{primary.label}</Button>
    {/if}
    {#if remixButton}
      {#if remixHref}
        <Button variant="outline" class="rounded-full px-5" href={safeUrl(remixHref)}><GitFork aria-hidden="true" />Remix in Paw OS</Button>
      {:else if onremix}
        <Button variant="outline" class="rounded-full px-5" disabled={busy} onclick={() => onremix(item)}><GitFork aria-hidden="true" />Remix in Paw OS</Button>
      {/if}
    {/if}
    {#if pageLink && !leadsWithPage}{@render pageButton('outline')}{/if}
    <ItemMenu title={item.title} oncopy={canCopy ? copyLink : undefined} onreport={onreport ? () => onreport(item) : undefined} />
    <span class="text-caption-1 text-muted-foreground" aria-live="polite">{copied ? 'Link copied' : ''}</span>
  </div>
{/snippet}

{#if isPage}
  <article
    class={cn('@container/item-page mx-auto w-full max-w-7xl min-w-0', className)}
    data-testid={`discover-detail-${item.id}`}
    data-renderer={renderer}
    data-layout="page"
  >
    <div
      class="grid grid-cols-1 items-start rounded-2xl border border-border bg-card @4xl/item-page:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]"
      data-testid="discover-page-card"
    >
      <div
        class="min-w-0 rounded-t-2xl border-b border-border bg-muted/40 p-3 @lg/item-page:p-4 @4xl/item-page:rounded-tr-none @4xl/item-page:rounded-bl-2xl @4xl/item-page:border-r @4xl/item-page:border-b-0"
        data-testid="discover-page-preview"
      >
        {@render preview()}
      </div>
      <aside
        class="flex min-w-0 flex-col gap-5 p-5 @lg/item-page:p-6 @4xl/item-page:sticky @4xl/item-page:top-4"
        aria-label="About this item"
        data-testid="discover-page-info"
      >
        {@render titleBlock()}
        {@render actions()}
        <div class="flex flex-col gap-4 border-t border-border pt-5">{@render meta()}</div>
      </aside>
    </div>
  </article>
{:else}
  <article class={cn('flex min-w-0 flex-col gap-4 pt-8', className)} data-testid={`discover-detail-${item.id}`} data-renderer={renderer} data-layout="overlay">
    {@render preview()}
    <div class="flex flex-col gap-4">
      {@render titleBlock()}
      {@render meta()}
      {@render actions()}
    </div>
  </article>
{/if}
