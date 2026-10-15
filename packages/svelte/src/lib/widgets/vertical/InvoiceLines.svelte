<!-- src/lib/widgets/vertical/InvoiceLines.svelte: invoice line items with
     subtotal, summary rows (tax, discount, shipping) and one grand total. Also
     composed by invoice-layout, which shares its arithmetic (invoice-math.ts)
     so the hero amount and this Total always match.

     Amounts are model output; invoice-math.ts holds the rules. A line with no
     usable amount shows a dash and stays out of the sum (never $0.00). The
     model's Subtotal / Total win (props, then a summary row so labelled, which
     never prints twice); when one disagrees with its rows, a muted note says
     what they add to. Blank descriptions read "Item <n>".

     More than 12 lines collapse to the first 8 with a "Show all N lines" row;
     totals always show, and print shows every line. Layout keys off the
     widget's own width: two columns under 480px, four from 480px. -->
<script lang="ts">
  import { cn } from '$lib/utils.js';
  import Icon from '$lib/widgets/display/Icon.svelte';
  import { finite, num } from '$lib/widgets/data-kit/format.js';
  import { formatAmount, invoiceTotals, lineAmount, summaryValue, type InvoiceLine, type SummaryRow } from './invoice-math.js';

  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    lines?: InvoiceLine[];
    /** Currency symbol. */
    currency?: string;
    /** Tax/discount/shipping rows shown after subtotal. */
    summary?: SummaryRow[];
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
    lines: rawLines = [],
    currency = '$',
    summary: rawSummary = [],
    subtotal,
    total,
    showRowTotals = true
  }: Props = $props();

  const COLLAPSE_OVER = 12;
  const COLLAPSED_SHOWS = 8;

  const lines = $derived(Array.isArray(rawLines) ? rawLines.filter((l) => l && typeof l === 'object') : []);
  const summary = $derived(Array.isArray(rawSummary) ? rawSummary.filter((s) => s && typeof s === 'object') : []);
  const totals = $derived(invoiceTotals({ lines, summary, subtotal, total }));
  const collapsible = $derived(lines.length > COLLAPSE_OVER);
  let expanded = $state(false);

  const styleString = $derived(
    style ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
  );

  const format = (n: number | undefined) => formatAmount(n, currency);
  const text = (v: unknown) => (v == null ? '' : String(v).trim());
</script>

<div
  {id}
  class={cn('ril @container rounded-md border border-ripple-border', className)}
  class:ril-collapsed={collapsible && !expanded}
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
    {@const qty = finite(line.quantity)}
    {@const unit = finite(line.unitPrice)}
    {@const desc = text(line.description)}
    {@const note = text(line.note)}
    <div
      class="ril-row ril-line"
      class:ril-nototal={!showRowTotals}
      class:ril-extra={collapsible && i >= COLLAPSED_SHOWS}
    >
      <div class="min-w-0">
        <div class="ril-desc" class:ril-placeholder={!desc}>{desc || `Item ${i + 1}`}</div>
        {#if qty !== undefined && unit !== undefined && showRowTotals}
          <div class="ril-narrow ril-sub ril-figs">{num(qty)} × {format(unit)}</div>
        {:else if qty !== undefined}
          <div class="ril-narrow ril-sub ril-figs">Qty {num(qty)}</div>
        {/if}
        {#if note}<div class="ril-sub">{note}</div>{/if}
      </div>
      <span class="ril-wide ril-num">{qty !== undefined ? num(qty) : ''}</span>
      <span class="ril-wide ril-num">{unit !== undefined ? format(unit) : ''}</span>
      {#if showRowTotals}
        <span class="ril-num font-medium">{format(lineAmount(line))}</span>
      {:else}
        <span class="ril-narrow ril-num">{unit !== undefined ? format(unit) : ''}</span>
      {/if}
    </div>
  {/each}
  {#if collapsible}
    <button type="button" class="ril-toggle" aria-expanded={expanded} onclick={() => (expanded = !expanded)}>
      <span>{expanded ? 'Show fewer' : `Show all ${lines.length} lines`}</span>
      <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} />
    </button>
  {/if}
  <div class="ril-foot">
    <div class="ril-sum"><span>{totals.subtotalLabel}</span><span class="ril-num">{format(totals.subtotal)}</span></div>
    {#if totals.linesAddTo !== undefined}
      <div class="ril-note">Lines add to {format(totals.linesAddTo)}</div>
    {/if}
    {#each totals.extras as s, idx (`${s.label}:${idx}`)}
      <div class="ril-sum ril-muted"><span>{s.label}</span><span class="ril-num">{format(summaryValue(s))}</span></div>
    {/each}
    <div class="ril-sum ril-total"><span>Total</span><span class="ril-num">{format(totals.total)}</span></div>
    {#if totals.rowsAddTo !== undefined}
      <div class="ril-note">Rows add to {format(totals.rowsAddTo)}</div>
    {/if}
  </div>
</div>

<style>
  .ril { container-type: inline-size; font-size: 13px; color: var(--ripple-surface-foreground); }
  .ril-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: 12px;
    padding: 8px 12px;
    align-items: start;
  }
  .ril-line { border-top: 1px solid var(--ripple-border); }
  .ril-collapsed .ril-extra { display: none; }
  .ril-head {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ripple-muted-foreground);
  }
  .ril-head > :not(:first-child) { text-align: right; }
  .ril-desc { overflow-wrap: anywhere; }
  .ril-placeholder { color: var(--ripple-muted-foreground); }
  .ril-sub { margin-top: 2px; font-size: 12px; color: var(--ripple-muted-foreground); overflow-wrap: anywhere; }
  .ril-figs { font-variant-numeric: tabular-nums; }
  .ril-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ril-wide { display: none; }
  .ril-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    min-height: 36px;
    padding: 8px 12px;
    border: 0;
    border-top: 1px solid var(--ripple-border);
    background: transparent;
    color: var(--ripple-muted-foreground);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }
  .ril-toggle:hover { color: var(--ripple-surface-foreground); background: color-mix(in oklab, var(--ripple-surface-foreground) 5%, transparent); }
  .ril-toggle:focus-visible { outline: 2px solid var(--ripple-ring); outline-offset: -2px; }
  .ril-foot { border-top: 1px solid var(--ripple-border); padding: 6px 12px 10px; }
  .ril-sum {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 4px 0;
  }
  .ril-sum > :first-child { min-width: 0; color: var(--ripple-muted-foreground); overflow-wrap: anywhere; }
  .ril-muted .ril-num { color: var(--ripple-muted-foreground); }
  .ril-note {
    margin-top: -2px;
    padding-bottom: 4px;
    font-size: 12px;
    text-align: right;
    color: var(--ripple-muted-foreground);
    font-variant-numeric: tabular-nums;
  }
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
    .ril-foot { padding-left: 30%; }
    .ril-sum { display: grid; grid-template-columns: minmax(0, 1fr) minmax(7.5rem, auto); column-gap: 16px; }
    .ril-sum > :first-child { text-align: right; }
  }
  /* invoice-layout passes `ril-flush`: no frame of its own (the card is the
     one surface) and rows align with the card's text edge. */
  .ril:global(.ril-flush) { border: 0; border-radius: 0; }
  .ril:global(.ril-flush) .ril-row,
  .ril:global(.ril-flush) .ril-toggle,
  .ril:global(.ril-flush) .ril-foot { padding-left: 0; padding-right: 0; }
  .ril:global(.ril-flush) .ril-foot { padding-bottom: 0; }
  @container (min-width: 480px) {
    .ril:global(.ril-flush) .ril-foot { padding-left: 30%; }
  }
  @media print {
    .ril-collapsed .ril-extra { display: grid; }
    .ril-toggle { display: none; }
  }
</style>
