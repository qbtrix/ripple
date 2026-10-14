<!--
  Rating.svelte: a row of stars bound to a number. Filled stars use the gold
  warning tone, empty ones a control-border outline. Clicking the current star
  clears it. With showValue, a set value reads "4 / 5" and an unset one "Not
  rated".
-->
<script lang="ts">
  import { cn } from '$lib/utils.js';
  import { FIELD_LABEL } from '$lib/components/ui/control.js';
  import StarIcon from '@lucide/svelte/icons/star';

  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    label?: string;
    value?: number;
    /** Number of stars in the scale (default 5). */
    max?: number;
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    showValue?: boolean;
    onchange?: (value?: unknown) => void;
  }

  let {
    id, class: className, style, label, value = 0, max = 5,
    size = 'md', disabled = false, showValue = false, onchange
  }: Props = $props();

  const numericValue = $derived(typeof value === 'number' ? value : Number(value) || 0);

  const styleString = $derived(
    style ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
  );

  const iconSize = $derived({ sm: 14, md: 18, lg: 22 }[size]);

  function handleClick(rank: number) {
    // Click the same star twice to clear (rate=0).
    const next = rank === numericValue ? 0 : rank;
    onchange?.(next);
  }
</script>

<div class={cn('flex flex-col gap-1', className)} style={styleString} {id}>
  {#if label}
    <span class={FIELD_LABEL}>{label}</span>
  {/if}
  <div class="flex items-center gap-0.5" role="radiogroup" aria-label={label ?? 'Rating'}>
    {#each Array(max) as _, i}
      {@const rank = i + 1}
      {@const filled = rank <= numericValue}
      <button
        type="button"
        role="radio"
        aria-checked={filled}
        aria-label={`Rate ${rank}`}
        {disabled}
        onclick={() => !disabled && handleClick(rank)}
        class={cn(
          'inline-flex items-center justify-center rounded-md p-0.5 transition-colors',
          'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          'active:scale-90 disabled:cursor-not-allowed disabled:opacity-50'
        )}
      >
        <!-- Stars are graphics, not text: gold fill+stroke when filled, a
             control-border outline when empty (3:1 non-text contrast). -->
        <StarIcon
          size={iconSize}
          strokeWidth={1.5}
          fill="none"
          class={filled ? 'fill-ripple-warning stroke-ripple-warning' : 'stroke-ripple-control-border'}
        />
      </button>
    {/each}
    {#if showValue}
      <!-- Unset (0 after a clear, or never bound) reads "Not rated", never "0 / 5". -->
      <span class="ml-2 text-xs text-muted-foreground tabular-nums">{numericValue > 0 ? `${numericValue} / ${max}` : 'Not rated'}</span>
    {/if}
  </div>
</div>
