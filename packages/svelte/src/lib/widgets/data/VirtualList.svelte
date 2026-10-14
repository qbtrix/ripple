<!-- src/lib/widgets/data/VirtualList.svelte
     Virtualized list: only the rows in the scroll window (plus overscan) mount.
     Rows are fixed-height (itemHeight). Default rows show `label` (or `name`)
     with an optional muted `description` line, a hairline divider and a hover
     fill. Without an explicit `height` the box hugs its content up to 320px,
     so three items do not leave an empty slab. role="option" rows carry
     aria-selected="false" (required ARIA prop). -->
<script lang="ts">
  import { safeStyle } from '@ripple-ui/core';
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils.js';
  import { safeArray } from '$lib/utils/safe-props.js';
  import NodeRenderer from '$lib/components/NodeRenderer.svelte';

  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    items?: unknown[];
    /** Fixed row height in pixels. */
    itemHeight?: number;
    /** Container height (e.g. "320px" or 320 for px). */
    height?: string | number;
    /** Extra rows rendered above/below the visible window. */
    overscan?: number;
    /** Per-item template — receives `item` and `index` in loop context. */
    item?: any;
    emptyText?: string;
    children?: Snippet;
  }

  let {
    id,
    class: className,
    style,
    items: rawItems = [],
    itemHeight: rawItemHeight,
    height,
    overscan = 5,
    item,
    emptyText = 'No items',
    children
  }: Props = $props();

  const items = $derived(safeArray(rawItems, { widget: 'virtual-list', key: 'items' }));

  const styleString = $derived(
    style ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
  );

  const field = (v: unknown, k: string): unknown =>
    v != null && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined;
  const hasDescriptions = $derived(items.some((v) => field(v, 'description') != null));
  const itemHeight = $derived(
    typeof rawItemHeight === 'number' && rawItemHeight > 0 ? rawItemHeight : hasDescriptions ? 52 : 36
  );

  const containerHeight = $derived(
    height != null && height !== ''
      ? typeof height === 'number' ? `${height}px` : height
      : `${items.length === 0 ? 120 : items.length * itemHeight}px; max-height: 320px`
  );

  let scrollTop = $state(0);
  let viewportHeight = $state(320);
  let viewportEl = $state<HTMLDivElement | null>(null);

  $effect(() => {
    if (!viewportEl) return;
    viewportHeight = viewportEl.clientHeight;
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      viewportHeight = viewportEl?.clientHeight ?? 0;
    });
    ro.observe(viewportEl);
    return () => ro.disconnect();
  });

  const total = $derived(items.length);
  const totalHeight = $derived(total * itemHeight);

  const start = $derived(Math.max(0, Math.floor(scrollTop / itemHeight) - overscan));
  const visibleCount = $derived(Math.ceil(viewportHeight / itemHeight) + overscan * 2);
  const end = $derived(Math.min(total, start + visibleCount));

  const visible = $derived.by(() => {
    const out: { item: unknown; index: number }[] = [];
    for (let i = start; i < end; i++) out.push({ item: items[i], index: i });
    return out;
  });

  const offsetY = $derived(start * itemHeight);

  function onScroll(e: Event) {
    scrollTop = (e.target as HTMLDivElement).scrollTop;
  }

  function isSpec(v: unknown): boolean {
    return v != null && typeof v === 'object' && !Array.isArray(v) && typeof (v as any).type === 'string';
  }
</script>

<div
  {id}
  bind:this={viewportEl}
  onscroll={onScroll}
  class={cn('relative overflow-auto rounded-md border border-border', className)}
  style={safeStyle(`height: ${containerHeight}; ${styleString ?? ''}`)}
  role="listbox"
>
  {#if total === 0}
    <div class="h-full grid place-items-center text-sm text-muted-foreground">{emptyText}</div>
  {:else}
    <div style={safeStyle(`height: ${totalHeight}px; position: relative;`)}>
      <div style={safeStyle(`position: absolute; top: 0; left: 0; right: 0; transform: translateY(${offsetY}px);`)}>
        {#each visible as v (v.index)}
          <div class="border-b border-border/70 last:border-b-0 hover:bg-muted/50 transition-colors" style={safeStyle(`height: ${itemHeight}px;`)} role="option" aria-selected="false" aria-posinset={v.index + 1} aria-setsize={total}>
            {#if isSpec(item)}
              <NodeRenderer node={item} loopContext={{ item: v.item, index: v.index }} />
            {:else if children}
              {@render children()}
            {:else}
              {@const desc = field(v.item, 'description')}
              <div class="flex h-full min-w-0 flex-col justify-center px-3">
                <div class="truncate text-sm font-medium">{String(field(v.item, 'label') ?? field(v.item, 'name') ?? v.item)}</div>
                {#if desc != null}
                  <div class="truncate text-xs text-muted-foreground">{String(desc)}</div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
