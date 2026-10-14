<!-- src/lib/widgets/display/Trend.svelte -->
<script lang="ts">
  import Delta from '$lib/widgets/data-kit/Delta.svelte';

  type Format = 'percent' | 'number' | 'currency';

  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    value: number;
    format?: Format;
    currency?: string;
    arrow?: boolean;
    precision?: number;
  }

  let {
    id, class: className, style,
    value, format = 'percent', currency = 'USD',
    arrow = true, precision = 1
  }: Props = $props();

  const styleString = $derived(
    style ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
  );

  const numeric = $derived(typeof value === 'number' ? value : Number(value) || 0);

  const sign = $derived(numeric > 0 ? 'up' : numeric < 0 ? 'down' : 'flat');


  const formatted = $derived.by(() => {
    const abs = Math.abs(numeric);
    if (format === 'percent') return `${numeric > 0 ? '+' : numeric < 0 ? '-' : ''}${abs.toFixed(precision)}%`;
    if (format === 'currency') {
      try {
        return new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency,
          maximumFractionDigits: precision
        }).format(numeric);
      } catch {
        return `${numeric > 0 ? '+' : numeric < 0 ? '-' : ''}${abs.toFixed(precision)}`;
      }
    }
    return `${numeric > 0 ? '+' : numeric < 0 ? '-' : ''}${abs.toFixed(precision)}`;
  });
</script>

<Delta text={formatted} dir={sign === 'flat' ? 'neutral' : sign} {arrow} class={className} {id} style={styleString} />
