<!-- Dashboard.svelte: the auto-fill tile grid (no drag; DashboardRenderer is
     the interactive one). A column may shrink to 70% of `columnMin`, so three
     tiles share a row in a chat card. Once measured, the column count is
     balanced so no row ends with one lone tile: 5 tiles lay out 3+2, not 4+1,
     and when only two columns fit, an odd last tile spans the row. Tiles in a
     row stretch to the row height (align-items: stretch), so a row of
     tiles has one bottom edge. Before the
     first measure (SSR, prerender) it is plain CSS auto-fill. Metric and stat
     children are bordered tiles and size containers. -->
<script lang="ts" module>
  /** Columns that fit, lowered until the last row holds more than one tile. */
  export function balance(fit: number, n: number): { cols: number; spanLast: boolean } {
    let c = Math.max(1, Math.min(fit, n));
    while (c > 2 && n % c === 1) c--;
    return { cols: c, spanLast: c === 2 && n % 2 === 1 && n > 1 };
  }
</script>

<script lang="ts">
  import { safeStyle } from '@ripple-ui/core';
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils.js';

  interface Props {
    id?: string;
    class?: string;
    children?: Snippet;
    /** Target min column width (px); a column may shrink to 70% of it so three tiles share a row in a chat card. */
    columnMin?: string;
    gap?: string;
  }

  let {
    id, class: className, children,
    columnMin = '240px', gap = '12px',
  }: Props = $props();

  const minPx = $derived.by(() => {
    const m = /^(\d+(?:\.\d+)?)px$/.exec(String(columnMin).trim());
    return m ? Math.round(Number(m[1]) * 0.7) : undefined;
  });
  const minCol = $derived(minPx !== undefined ? `${minPx}px` : columnMin);

  let el: HTMLDivElement | undefined = $state();
  let cols = $state(0);
  let spanLast = $state(false);

  $effect(() => {
    const min = minPx;
    if (!el || min === undefined || typeof ResizeObserver === 'undefined') return;
    const node = el;
    const measure = () => {
      const g = parseFloat(getComputedStyle(node).columnGap) || 0;
      const fit = Math.floor((node.clientWidth + g) / (min + g));
      const b = balance(fit, node.children.length);
      cols = b.cols;
      spanLast = b.spanLast;
    };
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    const mo = new MutationObserver(measure);
    mo.observe(node, { childList: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  });

  const template = $derived(
    cols > 0 ? `repeat(${cols},minmax(0,1fr))` : `repeat(auto-fill,minmax(${minCol},1fr))`
  );
</script>

<div
  bind:this={el}
  {id}
  class={cn('rdash', spanLast && 'rdash-span-last', className)}
  style={safeStyle(`display:grid; grid-template-columns:${template}; gap:${gap};`)}
>
  {@render children?.()}
</div>

<style>
  .rdash {
    width: 100%;
    align-content: start;
    align-items: stretch;
  }
  .rdash-span-last > :global(:last-child) {
    grid-column: 1 / -1;
  }
  /* Metric and stat children read as tiles; each tile is a size container. */
  .rdash > :global([data-ripple-tile]) {
    border: 1px solid var(--ripple-border);
    border-radius: var(--ripple-radius);
    padding: 12px 14px;
    container-type: inline-size;
    min-width: 0;
  }
</style>
