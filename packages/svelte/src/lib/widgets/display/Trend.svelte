<!-- src/lib/widgets/display/Trend.svelte -->
<script lang="ts">
  import Delta from '$lib/widgets/data-kit/Delta.svelte';
  import { money, num } from '$lib/widgets/data-kit/format.js';

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


  // One number style: format.ts, signed, no forced decimals ('+$2,400', '0', '+12.4%').
  const formatted = $derived(
    format === 'currency'
      ? money(numeric, currency, { sign: true, whole: true })
      : `${num(numeric, { digits: precision, sign: true })}${format === 'percent' ? '%' : ''}`
  );
</script>

<Delta text={formatted} dir={sign === 'flat' ? 'neutral' : sign} {arrow} class={className} {id} style={styleString} />
