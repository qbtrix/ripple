<!-- discover/ItemDetail.svelte — one Discover item in full: the renderer picked
     by rendererFor (the studio player, the live page in a LiveFrame, or the
     picture), then the title, the line, who made it, the usage line (left out
     at zero), what it was remixed from, its tags, and the actions. The same
     body serves the item's own page (layout="page": wide, h1) and the in-app
     overlay (layout="overlay": no outer padding, h2). It never draws the
     Dialog or Sheet itself; consumers wrap it. `compact` is the narrow
     overlay: a framed item shows its picture and an Open link to its page
     instead of loading the frame there; media still plays.

     Actions: the primary (Use / Play link to the live page; Claim / Use this
     recipe as `remixHref` link or `onremix` button), a "Remix in Paw OS" for
     tools and games only (a studio or site primary already is the remix), and
     a ⋯ menu with Copy link (`href` or `oncopylink`) and Report (`onreport`).
     Without `oncopylink`, Copy link writes `href` resolved against the page to
     the clipboard. Renders fully on the server. -->
<script lang="ts">
  import { safeUrl } from '@ripple-ui/core';
  import GitFork from '@lucide/svelte/icons/git-fork';
  import Chip from '../widgets/display/Chip.svelte';
  import { Button } from '../components/ui/button/index.js';
  import { cn } from '$lib/utils.js';
  import DetailMedia from './DetailMedia.svelte';
  import ItemArt from './ItemArt.svelte';
  import ItemMenu from './ItemMenu.svelte';
  import LiveFrame from './LiveFrame.svelte';
  import { initialFor, tintFor } from './art.js';
  import { itemHref } from './href.js';
  import { httpUrl, isStudioKind, primaryFor, rendererFor, showUsage, usageLabel } from './item.js';
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
    class: className,
  }: {
    item: DiscoverItem;
    /** 'page': the item's own route, wide. 'overlay': inside a consumer's Dialog or Sheet. */
    layout: 'page' | 'overlay';
    /** Narrow overlay: framed items show the picture and an Open link to `href`. */
    compact?: boolean;
    /** The item's own page (Open in compact mode; Copy link). */
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
    class?: string;
  } = $props();

  const renderer = $derived(rendererFor(item));
  const primary = $derived(primaryFor(item));
  const heading = $derived(headingLevel ?? (layout === 'page' ? 'h1' : 'h2'));
  const tint = $derived(tintFor(item.id));
  const initial = $derived(initialFor(item.title));
  const liveUrl = $derived(httpUrl(item.liveUrl));
  // A studio or site primary is already the remix; a second button would repeat it.
  const remixButton = $derived(!isStudioKind(item.kind) && item.kind !== 'site' && Boolean(remixHref || onremix));
  const canCopy = $derived(Boolean(href || oncopylink));
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
</script>

<article
  class={cn('flex min-w-0 flex-col', layout === 'page' ? 'mx-auto w-full max-w-4xl gap-6 px-6 py-10' : 'gap-4', className)}
  data-testid={`discover-detail-${item.id}`}
  data-renderer={renderer}
>
  {#if renderer === 'media'}
    <DetailMedia {item} />
  {:else if renderer === 'frame' && liveUrl && !compact}
    <LiveFrame url={liveUrl} title={item.title} kind={item.kind} poster={safeUrl(item.imageUrl ?? undefined, { kind: 'resource' })} {tint} {initial} />
  {:else}
    <ItemArt imageUrl={item.imageUrl} title={item.title} mediaKind={item.mediaKind} {tint} {initial} />
  {/if}

  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-1">
      <svelte:element this={heading} class={cn('m-0 text-foreground', layout === 'page' ? 'text-title-1' : 'text-title-2')}>{item.title}</svelte:element>
      {#if item.desc}<p class="m-0 text-body text-muted-foreground">{item.desc}</p>{/if}
      {#if item.creator?.name}
        <p class="m-0 text-footnote text-muted-foreground" data-testid="discover-detail-creator">By {item.creator.name}</p>
      {/if}
      {#if showUsage(item)}
        <p class="m-0 flex items-center gap-1.5 text-caption-1 text-muted-foreground tabular-nums">
          <GitFork class="size-3" aria-hidden="true" />{usageLabel(item)}
        </p>
      {/if}
      {#if item.remixedFrom}
        <p class="m-0 text-footnote text-muted-foreground" data-testid="discover-detail-remixed-from">
          Remixed from <a class="text-foreground hover:underline" href={safeUrl(itemHref(item.kind, item.remixedFrom.slug))}>{item.remixedFrom.title}</a>
        </p>
      {/if}
    </div>

    {#if item.tags?.length}
      <ul class="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Tags">
        {#each item.tags as tag (tag)}
          <li><Chip size="sm" label={tag} /></li>
        {/each}
      </ul>
    {/if}

    <div class="flex flex-wrap items-center gap-2">
      {#if compact && renderer === 'frame' && href}
        <Button class="rounded-full px-5" href={safeUrl(href)}>Open</Button>
      {/if}
      {#if primary?.href}
        <Button
          variant={compact && renderer === 'frame' && href ? 'outline' : 'default'}
          class="rounded-full px-5"
          href={safeUrl(primary.href)}
          target="_blank"
          rel="nofollow ugc noopener noreferrer"
          aria-label={`${primary.label} ${item.title} (opens in a new tab)`}>{primary.label}</Button
        >
      {:else if primary && remixHref}
        <Button class="rounded-full px-5" href={safeUrl(remixHref)}>{primary.label}</Button>
      {:else if primary && onremix}
        <Button class="rounded-full px-5" disabled={busy} onclick={() => onremix(item)}>{primary.label}</Button>
      {/if}
      {#if remixButton}
        {#if remixHref}
          <Button variant="outline" class="rounded-full px-5" href={safeUrl(remixHref)}><GitFork aria-hidden="true" />Remix in Paw OS</Button>
        {:else if onremix}
          <Button variant="outline" class="rounded-full px-5" disabled={busy} onclick={() => onremix(item)}><GitFork aria-hidden="true" />Remix in Paw OS</Button>
        {/if}
      {/if}
      <ItemMenu title={item.title} oncopy={canCopy ? copyLink : undefined} onreport={onreport ? () => onreport(item) : undefined} />
      <span class="text-caption-1 text-muted-foreground" aria-live="polite">{copied ? 'Link copied' : ''}</span>
    </div>
  </div>
</article>
