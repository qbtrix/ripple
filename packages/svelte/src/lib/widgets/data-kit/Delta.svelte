<!-- Delta.svelte: the one delta treatment shared by metric, stat and trend.
     An arrow and a signed value in the tone's readable text colour on a soft
     tint of that tone (never a solid accent pill). `sentiment` picks the tone,
     `dir` the arrow, so "response time down" can be good news in green. -->
<script lang="ts">
  import { cn } from '$lib/utils.js';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import Minus from '@lucide/svelte/icons/minus';

  interface Props {
    text: string;
    dir: 'up' | 'down' | 'neutral';
    sentiment?: 'positive' | 'negative' | 'neutral';
    arrow?: boolean;
    size?: number;
    class?: string;
    id?: string;
    style?: string;
    /** Extra data-slot for the host widget's tests and styling. */
    slot?: string;
  }

  let { text, dir, sentiment, arrow = true, size = 12, class: className, id, style, slot }: Props = $props();

  const tone = $derived(sentiment ?? (dir === 'up' ? 'positive' : dir === 'down' ? 'negative' : 'neutral'));
</script>

<span
  {id}
  {style}
  data-slot={slot ?? 'delta'}
  data-sentiment={tone}
  class={cn(
    'inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4 tabular-nums',
    tone === 'positive' && 'bg-ripple-success/12 text-ripple-success-text',
    tone === 'negative' && 'bg-ripple-error/10 text-ripple-error-text',
    tone === 'neutral' && 'bg-ripple-track text-ripple-muted-foreground',
    className
  )}
>
  {#if arrow}
    {#if dir === 'up'}<ArrowUp size={size} strokeWidth={2.5} />{:else if dir === 'down'}<ArrowDown size={size} strokeWidth={2.5} />{:else}<Minus size={size} strokeWidth={2.5} />{/if}
  {/if}
  <span>{text}</span>
</span>
