<!-- Dashboard.svelte — Legacy auto-fill grid layout widget.
     Note: Drag-to-swap (Swapy) removed. Use DashboardRenderer (Muuri) for interactive dashboards.
-->
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

  // ponytail: a fixed 0.7 shrink, not row balancing; balance rows if 4+1 orphans start to matter.
  const minCol = $derived.by(() => {
    const m = /^(\d+(?:\.\d+)?)px$/.exec(String(columnMin).trim());
    return m ? `${Math.round(Number(m[1]) * 0.7)}px` : columnMin;
  });
</script>

<div
  {id}
  class={cn('rdash', className)}
  style={safeStyle(`display:grid; grid-template-columns:repeat(auto-fill,minmax(${minCol},1fr)); gap:${gap};`)}
>
  {@render children?.()}
</div>

<style>
  .rdash {
    width: 100%;
    align-content: start;
  }
  /* Metric and stat children read as tiles. */
  .rdash > :global([data-ripple-tile]) {
    border: 1px solid var(--ripple-border);
    border-radius: var(--ripple-radius);
    padding: 12px 14px;
  }
</style>
