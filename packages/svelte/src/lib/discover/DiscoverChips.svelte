<!-- discover/DiscoverChips.svelte — the "who is it for" toggle chips under the
     Discover search. The selected chip is the secondary button, the rest
     outlined. A chip with `href` is a link (aria-current on the selected one) for
     a server-rendered page; to make it toggle off, point the selected chip's href
     at the address without that filter. A chip without `href` is a button
     (aria-pressed) that calls `onchange` with its value; the consumer decides
     what a second press means.

     The chips sit in ONE row that scrolls sideways (snap, no visible bar) with
     a fade on the trailing edge; the end padding keeps the last chip clear of
     the fade once scrolled to. Every chip is a real link or button, so Tab
     reaches each one and the browser scrolls it into view. -->
<script lang="ts">
  import { safeUrl } from '@ripple-ui/core';
  import { Button } from '../components/ui/button/index.js';
  import { cn } from '$lib/utils.js';
  import type { DiscoverOption } from './layout.js';

  let {
    options,
    value = null,
    onchange,
    label = 'Who is it for',
    class: className,
  }: {
    options: readonly DiscoverOption[];
    value?: string | null;
    onchange?: (value: string) => void;
    label?: string;
    class?: string;
  } = $props();
</script>

<div
  class={cn(
    '-m-1 flex snap-x scroll-px-1 flex-nowrap gap-2 overflow-x-auto p-1 pr-8 [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] [scrollbar-width:none] *:shrink-0 *:snap-start [&::-webkit-scrollbar]:hidden',
    className,
  )}
  role="group"
  aria-label={label}
  data-testid="discover-chips"
>
  {#each options as o (o.value)}
    {@const on = value === o.value}
    {#if o.href}
      <Button size="sm" variant={on ? 'secondary' : 'outline'} href={safeUrl(o.href)} aria-current={on ? 'true' : undefined}>{o.label}</Button>
    {:else}
      <Button size="sm" variant={on ? 'secondary' : 'outline'} aria-pressed={on} onclick={() => onchange?.(o.value)}>{o.label}</Button>
    {/if}
  {/each}
</div>
