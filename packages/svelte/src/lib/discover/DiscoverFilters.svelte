<!-- discover/DiscoverFilters.svelte — the Discover page's sticky type bar: the
     kind tabs on the left, the Grid / Shelves / List toggle on the right. Both
     groups draw ripple Segmented's size="sm" pill track. With callbacks the
     segments are radio buttons; when the kind options carry `href`, or
     `viewHref` is given, that group renders as links (aria-current on the
     selected one), so a server-rendered page filters with JS off. The track is
     drawn here rather than through Segmented because Segmented looks option
     icons up by name in the whole Lucide barrel (~800 KB a consumer cannot tree
     shake); the view icons here are imported one by one. The view toggle shows
     only with `onview` or `viewHref`. The bar paints bg-background; the app adds
     its glass class through `class`.

     The kind tabs scroll sideways in their own track (snap, trailing fade, no
     visible bar); the selected segment paints its own surface, so any widths
     line up and the server markup is final. The view toggle never shrinks and
     goes icon-only (labels kept for screen readers) when the bar is under
     36rem, so it stays on screen on a phone. -->
<script lang="ts">
  import { safeUrl } from '@ripple-ui/core';
  import type { Component } from 'svelte';
  import GalleryHorizontal from '@lucide/svelte/icons/gallery-horizontal';
  import LayoutGrid from '@lucide/svelte/icons/layout-grid';
  import List from '@lucide/svelte/icons/list';
  import { cn } from '$lib/utils.js';
  import { DISCOVER_VIEWS, type DiscoverOption, type DiscoverView } from './layout.js';

  let {
    kinds,
    kind,
    onkind,
    view = 'grid',
    onview,
    viewHref,
    class: className,
  }: {
    kinds: readonly DiscoverOption[];
    kind: string;
    onkind?: (kind: string) => void;
    view?: DiscoverView;
    onview?: (view: DiscoverView) => void;
    /** The address of each view, for a page that switches views by link. */
    viewHref?: (view: DiscoverView) => string;
    class?: string;
  } = $props();

  const VIEW_META: Record<DiscoverView, { label: string; Icon: Component }> = {
    grid: { label: 'Grid', Icon: LayoutGrid },
    shelves: { label: 'Shelves', Icon: GalleryHorizontal },
    list: { label: 'List', Icon: List },
  };

  const kindLinks = $derived(kinds.some((k) => k.href));
  const viewOptions = $derived(
    DISCOVER_VIEWS.map((v) => ({ value: v, label: VIEW_META[v].label, href: viewHref?.(v), Icon: VIEW_META[v].Icon })),
  );

  /** On mount, slide the kind track so a selected tab past its edge is in view
   *  (a link-mode page opened at ?kind=music). Horizontal only: the page never jumps. */
  function revealSelected(track: HTMLElement) {
    const on = track.querySelector<HTMLElement>('[aria-current="true"], [aria-checked="true"]');
    if (!on) return;
    const end = on.offsetLeft + on.offsetWidth;
    if (end > track.scrollLeft + track.clientWidth - 24) track.scrollLeft = end - track.clientWidth + 24;
  }

  function pickView(v: string) {
    const next = DISCOVER_VIEWS.find((x) => x === v);
    if (next) onview?.(next);
  }
</script>

<!-- Segmented's size="sm" track and segment classes. With `onpick` the
     segments are radios (Segmented's own semantics); without it they are links.
     The selected segment paints its own surface (no sliding thumb), so the
     server markup is already right and segments of any width line up. -->
{#snippet pills(options: readonly (DiscoverOption & { Icon?: Component })[], selected: string, onpick?: (value: string) => void, iconOnly = false)}
  <div
    role={onpick ? 'radiogroup' : undefined}
    class="inline-flex h-7 w-max items-stretch rounded-full bg-ripple-border/60 p-0.5 text-[12px] select-none"
  >
    {#each options as o (o.value)}
      {@const on = o.value === selected}
      {@const segment = cn(
        'inline-flex shrink-0 snap-start items-center justify-center gap-1.5 rounded-full px-2.5 font-medium whitespace-nowrap transition-colors duration-150 ease-ripple-out focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none',
        on ? 'bg-ripple-surface text-ripple-surface-foreground ring-1 ring-ripple-border' : 'text-ripple-muted-foreground hover:text-ripple-surface-foreground',
        iconOnly && o.Icon && 'px-2 @xl/discover-filters:px-2.5',
      )}
      {#snippet body()}
        {#if o.Icon}<o.Icon size={14} aria-hidden="true" />{/if}
        <span class={cn(iconOnly && o.Icon && 'sr-only @xl/discover-filters:not-sr-only')}>{o.label}</span>
      {/snippet}
      {#if onpick}
        <button type="button" role="radio" aria-checked={on} class={segment} title={iconOnly ? o.label : undefined} onclick={() => onpick(o.value)}>
          {@render body()}
        </button>
      {:else}
        <a href={safeUrl(o.href)} aria-current={on ? 'true' : undefined} class={segment} title={iconOnly ? o.label : undefined}>
          {@render body()}
        </a>
      {/if}
    {/each}
  </div>
{/snippet}

<div class={cn('@container/discover-filters sticky top-0 z-10 mt-6 border-b border-border bg-background', className)} data-testid="discover-filters">
  <div class="mx-auto flex w-full max-w-[1280px] items-center gap-2 px-6 py-2.5 @xl/discover-filters:gap-3">
    <div
      class="relative -my-1 min-w-0 flex-1 snap-x scroll-px-1 overflow-x-auto py-1 pr-6 [mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="group"
      aria-label="Filter by type"
      data-testid="discover-kinds"
      use:revealSelected
    >
      {@render pills(kinds, kind, kindLinks ? undefined : (v) => onkind?.(v))}
    </div>
    {#if viewHref || onview}
      <div class="shrink-0" role="group" aria-label="View">
        {@render pills(viewOptions, view, viewHref ? undefined : pickView, true)}
      </div>
    {/if}
  </div>
</div>
