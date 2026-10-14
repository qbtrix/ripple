<!--
  Metric.svelte: a labelled value with an optional trend pill and description.
  Variants: default (label, value, trend, description stacked), compact (value
  and trend with the label at the right) and horizontal (label left, value
  right). Every variant forwards the node id (id + data-ripple-node).
  As a tile (a direct child of grid or dashboard, which make tiles containers)
  every variant stacks label first, top-aligned, with the one tile value size
  (title-3, stepping down in a narrow tile) that stat tiles share, so a sheet of
  tiles sets every number in one style.
  A 7-figure number steps its font down with the tile and, under 100px, swaps
  to the compact form ('12.8M'). The value is never clipped.
-->
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
    : trendText.startsWith('-') || trendText.startsWith('−') ? 'down' as const
    : 'neutral' as const
  );
  // Numbers get thousands separators; strings ("$48.2k", "1h 12m") are the model's own format.
  const shown = $derived(typeof value === 'number' ? num(value) : value);
  const compact = $derived.by(() => {
    if (typeof value !== 'number') return '';
    const c = num(value, { compact: true });
    return c !== shown ? c : '';
  });
</script>

{#snippet val(cls: string)}
  <span class={cn(cls, 'm-fit font-semibold tabular-nums', compact && 'm-full')}>{shown}</span>
  {#if compact}<span class={cn(cls, 'm-fit m-compact font-semibold tabular-nums')}>{compact}</span>{/if}
  {#if trend}<Delta text={trendText} {dir} />{/if}
{/snippet}

{#if variant === 'horizontal'}
  <div {id} data-ripple-node={id} data-ripple-tile data-variant="horizontal" class={cn('m-root flex items-center justify-between gap-4', className)}>
    <span class="m-label text-sm text-muted-foreground">{label}</span>
    <div class="m-row flex min-w-0 items-center gap-2">{@render val('text-body')}</div>
  </div>
{:else if variant === 'compact'}
  <div {id} data-ripple-node={id} data-ripple-tile data-variant="compact" class={cn('m-root flex items-baseline gap-2', className)}>
    <div class="m-row flex min-w-0 items-baseline gap-2">{@render val('text-title-3')}</div>
    <span class="m-label ml-auto text-xs text-muted-foreground">{label}</span>
  </div>
{:else}
  <div {id} data-ripple-node={id} data-ripple-tile data-variant="default" class={cn('m-root flex min-w-0 flex-col gap-1', className)}>
    <span class="m-label text-xs font-medium text-muted-foreground">{label}</span>
    <div class="m-row flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">{@render val('text-title-2')}</div>
    {#if description}<span class="text-xs text-muted-foreground">{description}</span>{/if}
  </div>
{/if}

<style>
  .m-compact { display: none; }
  /* As a tile: label first, top-aligned, one value size from the tile's box. */
  :global(:is(.rdash, .rgrid)) > .m-root {
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    gap: 4px;
    min-width: 0;
  }
  :global(:is(.rdash, .rgrid)) > .m-root > .m-label {
    order: -1;
    margin-left: 0;
    font-size: var(--text-callout);
    line-height: var(--lh-callout);
    font-weight: 500;
  }
  :global(:is(.rdash, .rgrid)) > .m-root > .m-row {
    flex-wrap: wrap;
    align-items: center;
    row-gap: 4px;
    max-width: 100%;
  }
  :global(:is(.rdash, .rgrid)) > .m-root .m-fit {
    font-size: clamp(var(--text-body), 22cqi, var(--text-title-3));
    line-height: 1.25;
  }
  @container (max-width: 99px) {
    .m-full { display: none; }
    .m-compact { display: inline; }
  }
</style>
