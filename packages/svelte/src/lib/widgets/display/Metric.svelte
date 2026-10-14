<!-- 2026-06-27: forward node id — bind id + data-ripple-node on each variant's root div
     so the visual editor can select this widget directly (SP-0 id-forwarding codemod). -->
<script lang="ts">
  import { cn } from '$lib/utils.js';
  import { asText } from '$lib/widgets/text-coerce';
  import { num } from '$lib/widgets/data-kit/format.js';
  import Delta from '$lib/widgets/data-kit/Delta.svelte';

  interface Props {
    id?: string;
    label: string;
    value: string | number;
    trend?: string;
    description?: string;
    /** Layout direction */
    variant?: 'default' | 'compact' | 'horizontal';
    class?: string;
  }

  let {
    id, label, value, trend, description,
    variant = 'default', class: className
  }: Props = $props();

  // A numeric binding has no .startsWith, so coerce before the sign check.
  const trendText = $derived(asText(trend));
  const dir = $derived(
    trendText.startsWith('+') ? 'up' as const
    : trendText.startsWith('-') || trendText.startsWith('\u2212') ? 'down' as const
    : 'neutral' as const
  );
  // Numbers get thousands separators; strings ("$48.2k", "1h 12m") are the model's own format.
  const shown = $derived(typeof value === 'number' ? num(value) : value);
</script>

{#if variant === 'horizontal'}
  <div {id} data-ripple-node={id} data-ripple-tile class={cn('flex items-center justify-between gap-4', className)}>
    <span class="text-sm text-muted-foreground">{label}</span>
    <div class="flex items-center gap-2">
      <span class="text-body font-semibold tabular-nums">{shown}</span>
      {#if trend}<Delta text={trendText} {dir} />{/if}
    </div>
  </div>
{:else if variant === 'compact'}
  <div {id} data-ripple-node={id} data-ripple-tile class={cn('flex items-baseline gap-2', className)}>
    <span class="text-title-3 font-semibold tabular-nums">{shown}</span>
    {#if trend}<Delta text={trendText} {dir} />{/if}
    <span class="text-xs text-muted-foreground ml-auto">{label}</span>
  </div>
{:else}
  <div {id} data-ripple-node={id} data-ripple-tile class={cn('flex flex-col gap-1', className)}>
    <span class="text-xs font-medium text-muted-foreground">{label}</span>
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span class="text-title-2 font-semibold tabular-nums">{shown}</span>
      {#if trend}<Delta text={trendText} {dir} />{/if}
    </div>
    {#if description}<span class="text-xs text-muted-foreground">{description}</span>{/if}
  </div>
{/if}
