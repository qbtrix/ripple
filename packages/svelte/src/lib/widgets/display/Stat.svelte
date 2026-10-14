<!--
  Stat.svelte: single metric display (label + formatted value + optional delta).
  Values are model output, so formatValue never paints "NaN" (non-finite
  numbers render blank, strings pass through verbatim) and a plain number is
  rounded for display by magnitude (0 decimals from 100, 1 from 10, else 2)
  unless `decimals` / `precision` pins the digits. Status-coloured text uses
  the readable text tokens (text-ripple-*-text); raw tones are fills only.
-->
<script lang="ts">
  import { tv } from 'tailwind-variants';
  import { cn } from '$lib/utils.js';
  import Delta from '$lib/widgets/data-kit/Delta.svelte';

  type DirectionInput = 'up' | 'down' | 'neutral' | 'auto' | 'up-good' | 'down-good';
  type DirectionResolved = 'up' | 'down' | 'neutral';
  type Sentiment = 'positive' | 'negative' | 'neutral';

  interface Props {
    id?: string;
    class?: string;
    label?: string;
    value: number | string;
    format?: 'number' | 'currency' | 'percent' | 'compact';
    currency?: string;
    locale?: string;
    precision?: number;
    /** Max fraction digits for the value and delta. Overrides the magnitude-based default. */
    decimals?: number;
    delta?: number;
    deltaPercent?: number;
    deltaFormat?: 'absolute' | 'percent' | 'both';
    direction?: DirectionInput;
    size?: 'sm' | 'md' | 'lg';
    align?: 'left' | 'right';
  }

  let {
    id,
    class: className,
    label,
    value,
    format = 'number',
    currency = 'USD',
    locale,
    precision,
    decimals,
    delta,
    deltaPercent,
    deltaFormat = 'percent',
    direction = 'auto',
    size = 'md',
    align = 'left',
  }: Props = $props();

  function formatValue(v: number | string): string {
    // Strings pass through untouched (existing behavior): a numeric string
    // like "125000" (httpbin echoes query params as strings) renders as
    // "125000", and a non-numeric string ("pending") renders verbatim.
    if (typeof v === 'string') return v;
    // Guard against undefined / null / objects — a binding resolving to a
    // non-number (e.g. before an async source hydrates, or a missing response
    // field). Intl.NumberFormat.format() would coerce these to NaN and paint
    // the literal "NaN"; a widget must never do that. Render blank instead.
    if (typeof v !== 'number' || !Number.isFinite(v)) return '';
    const opts: Intl.NumberFormatOptions = {};
    if (decimals !== undefined) {
      opts.maximumFractionDigits = decimals;
    } else if (precision !== undefined) {
      opts.minimumFractionDigits = precision;
      opts.maximumFractionDigits = precision;
    } else if (format === 'number') {
      const a = Math.abs(v);
      opts.maximumFractionDigits = a >= 100 ? 0 : a >= 10 ? 1 : 2;
    }
    switch (format) {
      case 'currency':
        opts.style = 'currency';
        opts.currency = currency;
        if (precision === undefined && decimals === undefined) {
          opts.minimumFractionDigits = 2;
          opts.maximumFractionDigits = 2;
        }
        break;
      case 'percent':
        opts.style = 'percent';
        if (precision === undefined && decimals === undefined) {
          opts.maximumFractionDigits = 1;
        }
        break;
      case 'compact':
        opts.notation = 'compact';
        break;
    }
    return new Intl.NumberFormat(locale, opts).format(v);
  }

  function resolveDirection(): { dir: DirectionResolved; sentiment: Sentiment } {
    const referenceDelta = delta ?? deltaPercent ?? 0;
    if (direction === 'up') return { dir: 'up', sentiment: 'positive' };
    if (direction === 'down') return { dir: 'down', sentiment: 'negative' };
    if (direction === 'neutral') return { dir: 'neutral', sentiment: 'neutral' };
    if (direction === 'auto') {
      if (referenceDelta > 0) return { dir: 'up', sentiment: 'positive' };
      if (referenceDelta < 0) return { dir: 'down', sentiment: 'negative' };
      return { dir: 'neutral', sentiment: 'neutral' };
    }
    if (direction === 'up-good') {
      if (referenceDelta > 0) return { dir: 'up', sentiment: 'positive' };
      if (referenceDelta < 0) return { dir: 'down', sentiment: 'negative' };
      return { dir: 'neutral', sentiment: 'neutral' };
    }
    // down-good: up = bad, down = good
    if (referenceDelta > 0) return { dir: 'up', sentiment: 'negative' };
    if (referenceDelta < 0) return { dir: 'down', sentiment: 'positive' };
    return { dir: 'neutral', sentiment: 'neutral' };
  }

  function formatDelta(): string {
    const absPart =
      delta !== undefined ? `${delta > 0 ? '+' : ''}${formatValue(delta)}` : '';
    const pctPart =
      deltaPercent !== undefined
        ? `${deltaPercent > 0 ? '+' : ''}${deltaPercent}%`
        : '';
    if (deltaFormat === 'absolute') return absPart || pctPart;
    if (deltaFormat === 'percent') return pctPart || absPart;
    if (absPart && pctPart) return `${absPart} (${pctPart})`;
    return absPart || pctPart;
  }

  const resolved = $derived(resolveDirection());
  const hasDelta = $derived(delta !== undefined || deltaPercent !== undefined);
  const displayValue = $derived(formatValue(value));
  const displayDelta = $derived(hasDelta ? formatDelta() : '');

  const root = tv({
    base: 'flex flex-col min-w-0',
    variants: {
      size: {
        sm: 'gap-[2px]',
        md: 'gap-1',
        lg: 'gap-1.5',
      },
      align: {
        left: 'items-start text-left',
        right: 'items-end text-right',
      },
    },
    defaultVariants: { size: 'md', align: 'left' },
  });

  const labelCls = tv({
    base: 'text-muted-foreground font-medium',
    variants: {
      size: { sm: 'text-[11px]', md: 'text-xs', lg: 'text-sm' },
    },
    defaultVariants: { size: 'md' },
  });

  const valueCls = tv({
    base: 'font-semibold tabular-nums leading-tight',
    variants: {
      size: { sm: 'text-body', md: 'text-title-3', lg: 'text-title-2' },
    },
    defaultVariants: { size: 'md' },
  });


  const iconSize = $derived(size === 'sm' ? 12 : size === 'lg' ? 14 : 12);
</script>

<div
  {id}
  class={cn(root({ size, align }), className)}
  data-size={size}
  data-direction={resolved.dir}
  data-sentiment={resolved.sentiment}
>
  {#if label}
    <span class={labelCls({ size })}>{label}</span>
  {/if}
  <div data-ripple-tile-value class="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
    <span data-slot="stat-value" class={valueCls({ size })}>{displayValue}</span>
    {#if hasDelta}
      <Delta text={displayDelta} dir={resolved.dir} sentiment={resolved.sentiment} size={iconSize} slot="stat-delta" />
    {/if}
  </div>
</div>
