<!-- Sparkline.svelte: a tiny trend line through Chart's sparkline type. The
     line is --ripple-accent unless the spec passes a colour (or bull/bear
     colours), the area under it fades to nothing, and it fills the width its
     row leaves it. -->
<script lang="ts">
  import { cn } from '$lib/utils.js';
  import { safeArray } from '$lib/utils/safe-props.js';
  import Chart from './Chart.svelte';

  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    /** Numeric values, oldest → newest. */
    values?: number[];
    /** Optional matching labels for tooltip x-axis. */
    labels?: (string | number)[];
    /** Override the trend-driven color. */
    color?: string;
    bullColor?: string;
    bearColor?: string;
    height?: number;
    /** Hide tooltip on hover. */
    noTooltip?: boolean;
  }

  let {
    id,
    class: className,
    style,
    values: rawValues = [],
    labels,
    color,
    bullColor,
    bearColor,
    height = 36,
    noTooltip = false
  }: Props = $props();

  const values = $derived(safeArray<number>(rawValues, { widget: 'sparkline', key: 'values' }));

  const styleString = $derived(
    style ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
  );

  // Chart's `data` shape: [{ label, value }]
  const data = $derived(
    values.map((v, i) => ({ label: String(labels?.[i] ?? i + 1), value: v }))
  );
</script>

<div {id} class={cn('inline-block w-full min-w-0', className)} style={styleString}>
  <Chart
    type="sparkline"
    {data}
    {height}
    tooltip={!noTooltip}
    bullColor={bullColor ?? color ?? 'var(--ripple-accent)'}
    bearColor={bearColor ?? color ?? 'var(--ripple-accent)'}
    colors={color ? [color] : []}
  />
</div>
