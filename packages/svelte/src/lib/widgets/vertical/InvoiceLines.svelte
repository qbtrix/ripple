<!-- src/lib/widgets/vertical/InvoiceLines.svelte: invoice line items with
     subtotal, summary rows (tax, discount, shipping) and a grand total. Also
     composed by invoice-layout. Amounts are model output: a summary row reads
     `value`, then `amount`, then `total`; a line reads `total`, then `amount`,
     then quantity x unitPrice. Numeric strings count. `currency` is a symbol
     to prefix ("$") or an ISO code ("USD") formatted through Intl. A row whose amount is not
     a number renders "—" and drops out of the computed total; nothing ever
     paints "NaN". -->
<script lang="ts">
  import { cn } from '$lib/utils.js';
  import { finite, money } from '$lib/widgets/data-kit/format.js';

  type Line = {
    id?: string | number;
    description: string;
    quantity?: number;
    unitPrice?: number;
    /** Pre-computed total. If omitted, computed as quantity * unitPrice. */
    total?: number;
    /** Alias for `total`. */
    amount?: number;
    /** Optional secondary text under description. */
    note?: string;
  };

  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    lines?: Line[];
    /** Currency symbol. */
    currency?: string;
    /** Tax/discount/shipping rows shown after subtotal. */
    summary?: { label: string; value?: number; amount?: number; total?: number; isNegative?: boolean }[];
    /** Override the auto-computed subtotal. */
    subtotal?: number;
    /** Override the auto-computed grand total. */
    total?: number;
    /** Show row totals column. */
    showRowTotals?: boolean;
  }

  let {
    id,
    class: className,
    style,
    lines = [],
    currency = '$',
    summary = [],
    subtotal,
    total,
    showRowTotals = true
  }: Props = $props();

  const styleString = $derived(
    style ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
  );

  function rowTotal(l: Line): number {
    const t = finite(l.total) ?? finite(l.amount);
    if (t !== undefined) return t;
    const q = finite(l.quantity);
    const u = finite(l.unitPrice);
    return q !== undefined && u !== undefined ? q * u : 0;
  }

  // A summary row's signed amount, or undefined when it is not a number.
  function summaryValue(s: NonNullable<Props['summary']>[number]): number | undefined {
    const v = finite(s.value) ?? finite(s.amount) ?? finite(s.total);
    return v === undefined ? undefined : s.isNegative ? -Math.abs(v) : v;
  }

  function format(n: number | undefined): string {
    if (n === undefined || !Number.isFinite(n)) return '—';
    // An ISO code ("USD") formats as money ($761.40), not "USD761.40".
    if (/^[A-Za-z]{3}$/.test(currency)) return money(n, currency);
    const sign = n < 0 ? '-' : '';
    return `${sign}${currency}${Math.abs(n).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }

  // One Subtotal row, ever: an explicit `subtotal` wins, then a summary row
  // labelled like "Subtotal" (it replaces the auto row and stays out of the
  // arithmetic), then the sum of the lines. An explicit `total` always wins.
  const isSubtotal = (s: { label?: unknown }) => /subtotal/i.test(String(s.label ?? ''));
  const modelSubtotal = $derived(summary.find(isSubtotal));
  const extras = $derived(summary.filter((s) => !isSubtotal(s)));
  const computedSubtotal = $derived(
    finite(subtotal) ??
      (modelSubtotal ? summaryValue(modelSubtotal) : undefined) ??
      lines.reduce((acc, l) => acc + rowTotal(l), 0)
  );
  const subtotalLabel = $derived(finite(subtotal) === undefined && modelSubtotal ? String(modelSubtotal.label) : 'Subtotal');
  const computedTotal = $derived(
    finite(total) ??
      computedSubtotal + extras.reduce((acc, s) => acc + (summaryValue(s) ?? 0), 0)
  );
</script>

<!-- Rows are a grid, not a table, so the layout follows the card's width:
     under 480px it is two columns (description with "qty × unit" as a muted
     second line, amount right-aligned); wider, four. Nothing is clipped. -->
<div
  {id}
  class={cn('ril @container rounded-md border border-border', className)}
  style={styleString}
>
  <div class="ril-row ril-head" class:ril-nototal={!showRowTotals}>
    <span>Description</span>
    <span class="ril-wide">Qty</span>
    <span class="ril-wide">Unit</span>
    {#if showRowTotals}<span>Amount</span>{:else}<span class="ril-narrow">Unit</span>{/if}
  </div>
  <!-- Keyed by id AND position: a streamed item can lack its id, or carry a half-written one equal to a finished id, and a duplicate key throws. -->
  {#each lines as line, i (`${line.id}:${i}`)}
    {@const hasQty = typeof line.quantity === 'number'}
    {@const hasUnit = typeof line.unitPrice === 'number'}
    <div class="ril-row ril-line" class:ril-nototal={!showRowTotals}>
      <div class="min-w-0">
        <div class="ril-desc">{line.description}</div>
        {#if hasQty && hasUnit && showRowTotals}
          <div class="ril-narrow ril-sub">{line.quantity} × {format(line.unitPrice)}</div>
        {:else if hasQty}
          <div class="ril-narrow ril-sub">Qty {line.quantity}</div>
        {/if}
        {#if line.note}<div class="ril-sub">{line.note}</div>{/if}
      </div>
      <span class="ril-wide ril-num">{hasQty ? line.quantity : ''}</span>
      <span class="ril-wide ril-num">{hasUnit ? format(line.unitPrice) : ''}</span>
      {#if showRowTotals}
        <span class="ril-num font-medium">{format(rowTotal(line))}</span>
      {:else}
        <span class="ril-narrow ril-num">{hasUnit ? format(line.unitPrice) : ''}</span>
      {/if}
    </div>
  {/each}
  <div class="ril-foot">
    <div class="ril-sum"><span>{subtotalLabel}</span><span class="ril-num">{format(computedSubtotal)}</span></div>
    {#each extras as s, idx (`${s.label}:${idx}`)}
      <div class="ril-sum ril-muted"><span>{s.label}</span><span class="ril-num">{format(summaryValue(s))}</span></div>
    {/each}
    <div class="ril-sum ril-total"><span>Total</span><span class="ril-num">{format(computedTotal)}</span></div>
  </div>
</div>

<style>
  .ril { container-type: inline-size; font-size: 13px; }
  .ril-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: 12px;
    padding: 8px 12px;
    align-items: start;
  }
  .ril-line { border-top: 1px solid var(--ripple-border); }
  .ril-head {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ripple-muted-foreground);
  }
  .ril-head > :not(:first-child) { text-align: right; }
  .ril-desc { overflow-wrap: anywhere; }
  .ril-sub { margin-top: 2px; font-size: 12px; color: var(--ripple-muted-foreground); }
  .ril-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ril-wide { display: none; }
  .ril-foot { border-top: 1px solid var(--ripple-border); padding: 6px 12px 10px; }
  .ril-sum {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 4px 0;
  }
  .ril-sum > :first-child { min-width: 0; color: var(--ripple-muted-foreground); }
  .ril-muted .ril-num { color: var(--ripple-muted-foreground); }
  .ril-total {
    margin-top: 4px;
    padding-top: 8px;
    border-top: 1px solid var(--ripple-border);
    font-size: 15px;
    font-weight: 600;
  }
  .ril-total > :first-child { color: inherit; }
  @container (min-width: 480px) {
    .ril-row { grid-template-columns: minmax(0, 1fr) 4rem 6.5rem 7.5rem; }
    .ril-row.ril-nototal { grid-template-columns: minmax(0, 1fr) 4rem 6.5rem; }
    .ril-wide { display: block; }
    .ril-narrow { display: none; }
    .ril-foot { padding-left: 40%; }
  }
</style>
