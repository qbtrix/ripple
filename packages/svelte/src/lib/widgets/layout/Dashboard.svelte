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
    /** Target min column width; a column may shrink to 80% of it so a row of three never leaves a lone orphan. */
    columnMin?: string;
    gap?: string;
  }

  let {
    id, class: className, children,
    columnMin = '240px', gap = '12px',
  }: Props = $props();
</script>

<div
  {id}
  class={cn('rdash', className)}
  style={safeStyle(`display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,calc(${columnMin} * 0.8)),1fr)); gap:${gap};`)}
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
