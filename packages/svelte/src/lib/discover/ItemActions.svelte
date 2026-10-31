<!-- discover/ItemActions.svelte — the action cluster a tile and a row share: the
     primary pill (a link when the item has a live page, a button otherwise),
     Play / View for studio media, a Remix icon for tools and games, then a ⋯
     overflow holding Remix (tools and games, with `onremix`), Copy link (with
     a `pageHref` and `oncopylink`) and Report. In a compact tile (under 15rem,
     the tile's container query) the Remix icon hides, the ⋯ copy covers it,
     and the primary pill narrows.
     Site cards get no Remix icon: their primary, Claim, already copies. Each
     control renders only when its callback is passed, so a static page gets
     just the links. The live link points at user-submitted content, so it
     carries rel="nofollow ugc noopener noreferrer": no rank, no window handle,
     no catalogue url in the Referer. Item-page links (the href prop on the
     tile and row) carry whatever rel the consumer passes. -->
<script lang="ts">
  import { safeUrl } from '@ripple-ui/core';
  import GitFork from '@lucide/svelte/icons/git-fork';
  import Maximize2 from '@lucide/svelte/icons/maximize-2';
  import Play from '@lucide/svelte/icons/play';
  import { Button } from '../components/ui/button/index.js';
  import { cn } from '$lib/utils.js';
  import ItemMenu from './ItemMenu.svelte';
  import { isStudioKind, mediaFor, primaryFor } from './item.js';
  import type { DiscoverItem } from './types.js';

  let {
    item,
    pageHref,
    onremix,
    onreport,
    onopen,
    oncopylink,
    busy = false,
    class: className,
  }: {
    item: DiscoverItem;
    /** The item's own page; Copy link shows only with this and `oncopylink`. */
    pageHref?: string;
    onremix?: (item: DiscoverItem) => void;
    onreport?: (item: DiscoverItem) => void;
    onopen?: (item: DiscoverItem) => void;
    oncopylink?: (item: DiscoverItem, href: string) => void;
    busy?: boolean;
    class?: string;
  } = $props();

  const primary = $derived(primaryFor(item));
  const media = $derived(mediaFor(item));
  const remixIcon = $derived(!isStudioKind(item.kind) && item.kind !== 'site');
</script>

<div class={cn('flex shrink-0 items-center gap-0.5', className)}>
  {#if primary?.href}
    <Button size="sm" class="rounded-full px-4 @max-[15rem]/tile:px-3" href={safeUrl(primary.href)} target="_blank" rel="nofollow ugc noopener noreferrer" aria-label={`${primary.label} ${item.title} (opens in a new tab)`}>{primary.label}</Button>
  {:else if primary && onremix}
    <Button size="sm" class="rounded-full px-4 @max-[15rem]/tile:px-3" disabled={busy} onclick={() => onremix(item)}>{primary.label}</Button>
  {/if}
  {#if media && onopen}
    {@const playable = media.kind !== 'image'}
    <Button size="icon-sm" variant="ghost" aria-label={`${playable ? 'Play' : 'View'} ${item.title}`} title={playable ? 'Play' : 'View'} onclick={() => onopen(item)}>
      {#if playable}<Play class="size-4" />{:else}<Maximize2 class="size-4" />{/if}
    </Button>
  {/if}
  {#if remixIcon && onremix}
    <Button size="icon-sm" variant="ghost" class="@max-[15rem]/tile:hidden" aria-label={`Remix ${item.title}`} title="Remix" disabled={busy} onclick={() => onremix(item)}>
      <GitFork class="size-4" />
    </Button>
  {/if}
  <ItemMenu
    title={item.title}
    onremix={remixIcon && onremix && !busy ? () => onremix(item) : undefined}
    oncopy={pageHref && oncopylink ? () => oncopylink(item, pageHref) : undefined}
    onreport={onreport ? () => onreport(item) : undefined}
  />
</div>
