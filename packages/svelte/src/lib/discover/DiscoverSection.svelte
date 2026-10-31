<!-- discover/DiscoverSection.svelte — one titled shelf of the Discover page: the
     heading and its blurb, an optional "see all" link, then the items in a
     DiscoverGrid for the given view. Children are the tiles (or rows, for the
     list view). The "see all" control is a link with `moreHref` and a button
     with `onmore`; with neither it is not drawn. It sits on the title's row,
     right-aligned, and wraps under the title (still right-aligned) only when
     the row is too narrow; the blurb runs under both. It paints text-primary,
     the host's own accent, which reads on the app's and the public site's
     surfaces alike (the link button's ripple accent token is the light set's
     dark blue on a host that only defines its own tokens). Ids follow the app:
     discover-h-{id} on the heading, discover-section-{id} as the test id. -->
<script lang="ts">
  import { safeUrl } from '@ripple-ui/core';
  import type { Snippet } from 'svelte';
  import { Button } from '../components/ui/button/index.js';
  import { cn } from '$lib/utils.js';
  import DiscoverGrid from './DiscoverGrid.svelte';
  import type { DiscoverView } from './layout.js';

  let {
    id,
    title,
    blurb,
    more,
    moreHref,
    onmore,
    view = 'grid',
    class: className,
    children,
  }: {
    /** Section key: builds the heading id and the test id. */
    id: string;
    title: string;
    blurb?: string;
    /** The "see all" label, drawn with a trailing arrow. */
    more?: string;
    moreHref?: string;
    onmore?: () => void;
    view?: DiscoverView;
    class?: string;
    children: Snippet;
  } = $props();

  // No side padding (the label lines up with the grid's edge), the host accent.
  const moreClass = 'ml-auto h-auto px-0 text-primary';
</script>

<section class={cn('flex flex-col gap-4', className)} aria-labelledby={`discover-h-${id}`} data-testid={`discover-section-${id}`}>
  <div class="flex flex-col gap-0.5">
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id={`discover-h-${id}`} class="min-w-0 text-title-3 font-semibold text-foreground">{title}</h2>
      {#if more && moreHref}
        <Button variant="link" size="sm" class={moreClass} href={safeUrl(moreHref)} data-testid={`discover-more-${id}`}>{more} →</Button>
      {:else if more && onmore}
        <Button variant="link" size="sm" class={moreClass} onclick={onmore} data-testid={`discover-more-${id}`}>{more} →</Button>
      {/if}
    </div>
    {#if blurb}<p class="m-0 text-subheadline text-muted-foreground">{blurb}</p>{/if}
  </div>
  <DiscoverGrid {view} label={title}>{@render children()}</DiscoverGrid>
</section>
