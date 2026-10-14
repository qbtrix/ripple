<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils.js';

  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    /** Default body slot — main content. */
    children?: Snippet;
    /** Sidebar slot. Pass a child with `slot: "sidebar"`. */
    sidebar?: Snippet;
    /** Topbar slot. Pass a child with `slot: "topbar"`. */
    topbar?: Snippet;
  }

  let {
    id, class: className, style, children, sidebar, topbar
  }: Props = $props();

  const styleString = $derived(
    style ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
  );
</script>

<div
  {id}
  class={cn(
    'grid w-full min-h-[420px] rounded-lg border border-border overflow-hidden',
    sidebar
      ? 'grid-cols-[auto_1fr] grid-rows-[auto_1fr]'
      : 'grid-cols-1 grid-rows-[auto_1fr]',
    className
  )}
  style={styleString}
>
  {#if typeof topbar === 'function'}
    <header class={cn('col-span-full row-start-1 border-b border-border bg-card/40 px-4 py-2')}>
      {@render topbar()}
    </header>
  {/if}
  {#if typeof sidebar === 'function'}
    <div class={cn(typeof topbar === 'function' ? 'row-start-2' : 'row-start-1', 'col-start-1')}>
      {@render sidebar()}
    </div>
  {/if}
  <main
    class={cn(
      'p-4 overflow-auto',
      typeof topbar === 'function' ? 'row-start-2' : 'row-start-1',
      typeof sidebar === 'function' ? 'col-start-2' : 'col-start-1'
    )}
  >
    {@render children?.()}
  </main>
</div>
