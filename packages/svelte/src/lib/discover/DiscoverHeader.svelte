<!-- discover/DiscoverHeader.svelte — the top of the Discover page: the pitch
     (a title whose `accent` half is painted in the primary colour, then a lead
     paragraph), the search and audience chips as children, and an optional
     `aside` beside it on wide containers (the app's QR card). The heading is
     an h2 under an app page header; a page without one passes as="h1".

     It sizes off its own box (container `discover-header`), not the viewport,
     because the app shell and the public page give it different widths. Narrow
     (under 36rem): a title-2 heading, the lead hidden (it stays in the markup;
     `narrowLead="full"` keeps it, for a landing hero whose lead is the pitch),
     tighter gaps, and the aside stacked under the pitch; the QR card collapses
     itself to a teaser row there. From 56rem the aside sits beside the pitch.
     `class` lands on the inner grid (so `lg:items-start` and the like still
     work); the container is a plain full-width wrapper around it. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils.js';

  let {
    title,
    accent,
    lead,
    as = 'h2',
    narrowLead = 'hide',
    class: className,
    children,
    aside,
  }: {
    title: string;
    /** Drawn after the title in the primary colour. */
    accent?: string;
    /** Shown on containers 36rem and wider; below that, see `narrowLead`. */
    lead?: string;
    as?: 'h1' | 'h2';
    /** The lead under 36rem: 'hide' (default; Discover's search and chips come first) or 'full'. */
    narrowLead?: 'hide' | 'full';
    class?: string;
    /** Search, chips: stacked under the lead. */
    children?: Snippet;
    aside?: Snippet;
  } = $props();
</script>

<div class="@container/discover-header w-full" data-testid="discover-header">
  <div
    class={cn(
      'mx-auto grid w-full max-w-[1280px] items-center gap-4 px-6 pt-2 @xl/discover-header:gap-9 @xl/discover-header:pt-4 @4xl/discover-header:grid-cols-[1.1fr_0.9fr]',
      className,
    )}
  >
    <div class="flex min-w-0 flex-col gap-3 @xl/discover-header:gap-4">
      <svelte:element this={as} class="text-title-2 font-semibold tracking-tight text-balance text-foreground @xl/discover-header:text-title-1">
        {title}{#if accent}{' '}<span class="text-primary">{accent}</span>{/if}
      </svelte:element>
      {#if lead}
        <!-- Not cn(): tailwind-merge reads text-body and text-muted-foreground as one group. -->
        <p class={`max-w-prose text-body text-muted-foreground${narrowLead === 'hide' ? ' hidden @xl/discover-header:block' : ''}`}>{lead}</p>
      {/if}
      {@render children?.()}
    </div>
    {@render aside?.()}
  </div>
</div>
