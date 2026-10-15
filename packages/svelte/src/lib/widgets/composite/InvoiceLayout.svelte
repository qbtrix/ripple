<!--
  @file InvoiceLayout.svelte
  @description Invoice / quote / receipt / credit note as one chat card. It
  answers "how much, to whom, by when" first: a hero with the doc label and
  number, the status chip, the grand total and a due (or paid / valid-until /
  void) sentence. Parties, a label/value meta list, the line table
  (`invoice-lines`, flush, sharing invoice-math.ts so the hero equals the
  table's Total), payment methods, notes and action buttons follow.

  Model strings are trimmed; blank means absent, and no label renders without
  its value. Unknown statuses get a neutral chip. One leading `#` is stripped
  from the number, never added. Actions with a blank label are dropped; one
  without an id gets it from its label so `onaction` still fires.

  Colours are --ripple-* tokens only. Layout keys off the card's own width
  (480px, the same break invoice-lines uses). Print hides the actions and the
  collapse toggle and shows every line.
-->
<script lang="ts">
  import { asText, safeUrl } from '@ripple-ui/core';
  import { getContext } from 'svelte';
  import { cn } from '$lib/utils.js';
  import { safeArray } from '$lib/utils/safe-props.js';
  import Icon from '$lib/widgets/display/Icon.svelte';
  import InvoiceLines from '$lib/widgets/vertical/InvoiceLines.svelte';
  import { formatAmount, invoiceTotals, type InvoiceLine, type SummaryRow } from '$lib/widgets/vertical/invoice-math.js';
  import type { EventHandler, EventHandlerOrArray } from '@ripple-ui/core';
  import type { EventDispatcher } from '@ripple-ui/core';
  import type { StateManager } from '$lib/core/state-manager.svelte.js';

  type Status = 'draft' | 'sent' | 'paid' | 'overdue' | 'void';

  interface Party {
    name: string;
    logo?: string;
    address?: string;
    email?: string;
    phone?: string;
    taxId?: string;
  }

  interface PaymentMethod {
    label: string;
    detail?: string;
  }

  interface Action {
    id?: string;
    label: string;
    icon?: string;
    variant?: 'default' | 'outline' | 'ghost';
    actions?: EventHandlerOrArray;
  }

  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    docType?: 'Invoice' | 'Quote' | 'Receipt' | 'Credit note';
    from: Party;
    billTo: Party;
    shipTo?: Party;
    invoiceNumber: string;
    issueDate: string;
    dueDate?: string;
    status?: Status;
    currency?: string;
    lines: InvoiceLine[];
    summary?: SummaryRow[];
    subtotal?: number;
    total?: number;
    notes?: string;
    paymentTerms?: string;
    paymentMethods?: PaymentMethod[];
    actions?: Action[];
    onaction?: (id: string) => void;
  }

  let {
    id,
    class: className,
    style,
    docType,
    from,
    billTo,
    shipTo,
    invoiceNumber,
    issueDate,
    dueDate,
    status,
    currency = '$',
    lines: rawLines,
    summary: rawSummary = [],
    subtotal,
    total,
    notes,
    paymentTerms,
    paymentMethods: rawPaymentMethods = [],
    actions: rawActions = [],
    onaction
  }: Props = $props();

  /** Model text, trimmed; blank and non-text both read as absent. */
  const t = (v: unknown) => (v === null || typeof v === 'object' ? '' : asText(v).trim());

  const lines = $derived(safeArray<InvoiceLine>(rawLines, { widget: 'invoice-layout', key: 'lines' }).filter((l) => l && typeof l === 'object'));
  const summary = $derived(safeArray<SummaryRow>(rawSummary, { widget: 'invoice-layout', key: 'summary' }).filter((s) => s && typeof s === 'object'));
  const totals = $derived(invoiceTotals({ lines, summary, subtotal, total }));
  const fmt = (n: number | undefined) => formatAmount(n, t(currency) || '$');
  const heroAmount = $derived(lines.length > 0 ? totals.total : undefined);

  const kind = $derived(t(docType) || 'Invoice');
  const docNumber = $derived(t(invoiceNumber).replace(/^#/, '').trim());
  const issued = $derived(t(issueDate));
  const due = $derived(t(dueDate));
  const terms = $derived(t(paymentTerms));
  const statusKey = $derived(t(status).toLowerCase());
  const isQuote = $derived(/^quote$/i.test(kind));
  const validUntil = $derived(due.replace(/^valid\s+until\s*:?\s*/i, ''));

  const STATUS: Record<Status, { label: string; tone: string }> = {
    draft: { label: 'Draft', tone: 'neutral' },
    sent: { label: 'Sent', tone: 'accent' },
    paid: { label: 'Paid', tone: 'success' },
    overdue: { label: 'Overdue', tone: 'error' },
    void: { label: 'Void', tone: 'neutral' }
  };
  const chip = $derived.by(() => {
    if (!statusKey) return undefined;
    const known = STATUS[statusKey as Status];
    if (known) return known;
    const word = t(status).slice(0, 16).trim();
    return { label: word.charAt(0).toUpperCase() + word.slice(1), tone: 'neutral' };
  });

  // The sentence under the amount. No date to carry, no sentence.
  const when = $derived.by(() => {
    const issuedPart = (lead: string) => (issued ? `${lead} · issued ${issued}` : '');
    if (statusKey === 'void') return issuedPart('Void');
    if (statusKey === 'paid' || /^receipt$/i.test(kind)) return issuedPart('Paid');
    if (isQuote) return validUntil ? `Valid until ${validUntil}` : issued ? `Issued ${issued}` : '';
    if (/^credit\s*note$/i.test(kind)) return issued ? `Credit issued ${issued}` : '';
    if (due) return terms ? `Due ${due} · ${terms}` : `Due ${due}`;
    return issued ? `Issued ${issued}` : '';
  });

  /** Emails break after `@` and before each `.`, not inside a word. */
  const breakable = (s: string) => (/^\S+@\S+$/.test(s) ? s.split(/(?<=@)|(?=\.)/) : [s]);

  type PartyView = { label: string; name: string; logo: string; rows: string[] };
  function party(label: string, p: Partial<Party> | undefined, withLogo = false): PartyView | undefined {
    const name = t(p?.name);
    const tax = t(p?.taxId);
    const rows = [t(p?.address), t(p?.email), t(p?.phone), tax ? `Tax ID ${tax}` : ''].filter(Boolean);
    const logo = withLogo ? t(p?.logo) : '';
    if (!name && rows.length === 0) return undefined;
    return { label, name, logo, rows };
  }
  const parties = $derived(
    [party('From', from, true), party('Bill to', billTo), party('Ship to', shipTo)].filter((p): p is PartyView => !!p)
  );

  const meta = $derived(
    [
      ['Issue date', issued],
      [isQuote ? 'Valid until' : 'Due date', isQuote ? validUntil : due],
      ['Terms', terms]
    ].filter(([, v]) => v)
  );

  const paymentMethods = $derived(
    safeArray<PaymentMethod>(rawPaymentMethods, { widget: 'invoice-layout', key: 'paymentMethods' })
      .map((m) => ({ label: t(m?.label), detail: t(m?.detail) }))
      .filter((m) => m.label || m.detail)
  );
  const notesText = $derived(t(notes));

  const actions = $derived(
    safeArray<Action>(rawActions, { widget: 'invoice-layout', key: 'actions' })
      .filter((a) => a && typeof a === 'object' && t(a.label))
      .map((a) => ({ ...a, label: t(a.label), id: t(a.id) || t(a.label).toLowerCase().replace(/\s+/g, '-') }))
  );

  const styleString = $derived(
    style ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
  );

  const eventDispatcher = getContext<EventDispatcher | undefined>('ui-events');
  const stateManager = getContext<StateManager | undefined>('ui-state');

  const VARIANT_CLASS: Record<string, string> = {
    default: 'rinv-btn-primary',
    outline: 'rinv-btn-outline',
    ghost: 'rinv-btn-ghost'
  };

  function fireAction(a: Action & { id: string }) {
    if (a.actions && eventDispatcher) {
      const handlers = Array.isArray(a.actions) ? a.actions : [a.actions];
      void eventDispatcher.dispatch(handlers as EventHandler[], { state: stateManager?.state ?? {} }, a.id);
      return;
    }
    onaction?.(a.id);
  }
</script>

<div {id} class={cn('rinv', className)} style={styleString}>
  <section class="rinv-hero">
    <div class="rinv-idrow">
      <div class="rinv-id">
        <span class="rinv-kind">{kind}</span>{#if docNumber}<span class="rinv-dot" aria-hidden="true">·</span><span class="rinv-num">{docNumber}</span>{/if}
      </div>
      {#if chip}
        <span class="rinv-chip" data-tone={chip.tone}>{chip.label}</span>
      {/if}
    </div>
    <div class="rinv-amount" class:rinv-void={statusKey === 'void'}>{fmt(heroAmount)}</div>
    {#if when}
      <div class="rinv-when" class:rinv-late={statusKey === 'overdue'}>{when}</div>
    {/if}
  </section>

  {#if parties.length > 0 || meta.length > 0}
    <section class="rinv-record">
      {#if parties.length > 0}
        <div class="rinv-parties">
          {#each parties as p (p.label)}
            <div class="rinv-party">
              <div class="rinv-label">{p.label}</div>
              {#if p.logo}
                <img src={safeUrl(p.logo, { kind: 'resource' })} alt={p.name} class="rinv-logo" />
              {/if}
              {#if p.name}<div class="rinv-name">{p.name}</div>{/if}
              {#each p.rows as row, i (i)}<div class="rinv-line">{#each breakable(row) as seg, j (j)}{#if j}<wbr />{/if}{seg}{/each}</div>{/each}
            </div>
          {/each}
        </div>
      {/if}
      {#if meta.length > 0}
        <dl class="rinv-meta">
          {#each meta as [label, value] (label)}
            <div class="rinv-pair">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          {/each}
        </dl>
      {/if}
    </section>
  {/if}

  <section class="rinv-lines">
    {#if lines.length > 0}
      <InvoiceLines class="ril-flush" {lines} currency={t(currency) || '$'} {summary} {subtotal} {total} />
    {:else}
      <p class="rinv-empty">No line items</p>
    {/if}
  </section>

  {#if paymentMethods.length > 0 || notesText}
    <section class="rinv-bottom">
      {#if paymentMethods.length > 0}
        <div>
          <div class="rinv-label">Payment</div>
          <ul class="rinv-pay">
            {#each paymentMethods as m, i (i)}
              <li>
                {#if m.label}<span class="rinv-pay-label">{m.label}</span>{/if}
                {#if m.detail}<span class="rinv-pay-detail">{m.detail}</span>{/if}
              </li>
            {/each}
          </ul>
        </div>
      {/if}
      {#if notesText}
        <div>
          <div class="rinv-label">Notes</div>
          <p class="rinv-notes">{notesText}</p>
        </div>
      {/if}
    </section>
  {/if}

  {#if actions.length > 0}
    <div class="rinv-actions rinv-print-hide">
      {#each actions as a, i (`${a.id}:${i}`)}
        <button
          type="button"
          class={cn('rinv-btn', VARIANT_CLASS[a.variant ?? 'default'] ?? 'rinv-btn-primary')}
          data-action-id={a.id}
          onclick={() => fireAction(a)}
        >
          <span class="rinv-btn-label">{#if a.icon}<span class="rinv-btn-icon"><Icon name={a.icon} size={14} /></span>{/if}{a.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .rinv {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    padding: 16px;
    border: 1px solid var(--ripple-border);
    border-radius: var(--ripple-radius);
    background: var(--ripple-surface);
    color: var(--ripple-surface-foreground);
    font-size: 13px;
    line-height: 1.45;
    min-width: 0;
  }
  .rinv > * + * {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--ripple-border);
  }
  /* The table carries its own header row; no rule above it. */
  .rinv > .rinv-lines {
    border-top: 0;
    padding-top: 0;
  }

  /* Hero: label + number and chip, then the amount, then when. */
  .rinv-idrow {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px 12px;
  }
  .rinv-id {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--ripple-muted-foreground);
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .rinv-kind {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .rinv-dot {
    margin: 0 6px;
  }
  .rinv-num {
    font-variant-numeric: tabular-nums;
  }
  .rinv-chip {
    flex: none;
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 600;
    line-height: 18px;
    white-space: nowrap;
    background: var(--ripple-muted);
    color: var(--ripple-muted-foreground);
  }
  .rinv-chip[data-tone='accent'] {
    background: color-mix(in oklab, var(--ripple-accent) 13%, var(--ripple-surface));
    color: var(--ripple-accent-text);
  }
  .rinv-chip[data-tone='success'] {
    background: color-mix(in oklab, var(--ripple-success) 13%, var(--ripple-surface));
    color: var(--ripple-success-text);
  }
  .rinv-chip[data-tone='error'] {
    background: color-mix(in oklab, var(--ripple-error) 13%, var(--ripple-surface));
    color: var(--ripple-error-text);
  }
  .rinv-amount {
    margin-top: 6px;
    font-size: var(--text-title-2, 22px);
    line-height: 1.2;
    font-weight: 600;
    letter-spacing: -0.01em;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .rinv-void {
    color: var(--ripple-muted-foreground);
    text-decoration: line-through;
  }
  .rinv-when {
    margin-top: 2px;
    color: var(--ripple-muted-foreground);
    overflow-wrap: anywhere;
  }
  .rinv-when.rinv-late {
    color: var(--ripple-error-text);
    font-weight: 500;
  }

  /* Parties and meta. */
  .rinv-record {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .rinv-parties {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px 24px;
  }
  .rinv-party {
    min-width: 0;
  }
  .rinv-label {
    margin-bottom: 4px;
    color: var(--ripple-muted-foreground);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .rinv-logo {
    display: block;
    height: 28px;
    width: auto;
    max-width: 100%;
    margin-bottom: 6px;
    object-fit: contain;
  }
  .rinv-name {
    font-weight: 600;
    overflow-wrap: break-word;
  }
  .rinv-line {
    color: var(--ripple-muted-foreground);
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  /* Under 480: a label column and a value column, values on one left edge
     so a wrapping value never goes ragged. */
  .rinv-meta {
    margin: 0;
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 6px 16px;
  }
  .rinv-pair {
    display: contents;
  }
  .rinv-pair dt {
    flex: none;
    white-space: nowrap;
    color: var(--ripple-muted-foreground);
  }
  .rinv-pair dd {
    margin: 0;
    min-width: 0;
    font-weight: 500;
    overflow-wrap: break-word;
  }

  .rinv-empty {
    margin: 0;
    padding: 12px 0;
    color: var(--ripple-muted-foreground);
  }

  /* Payment and notes. */
  .rinv-bottom {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px 24px;
  }
  .rinv-pay {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .rinv-pay li {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .rinv-pay-label {
    font-weight: 500;
  }
  .rinv-pay-detail {
    color: var(--ripple-muted-foreground);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .rinv-notes {
    margin: 0;
    font-size: var(--text-callout, 12px);
    line-height: 1.55;
    overflow-wrap: break-word;
  }

  /* Actions: stacked full width with the primary first, then a right-aligned row. */
  .rinv-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .rinv-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 36px;
    padding: 7px 14px;
    border: 1px solid transparent;
    border-radius: calc(var(--ripple-radius) - 2px);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s;
  }
  /* The icon is inline at the start of the label, so a wrapped label keeps
     it beside its first line and both centre as one run of text. */
  .rinv-btn-label {
    min-width: 0;
    text-align: center;
    text-wrap: balance;
  }
  .rinv-btn-icon {
    display: inline-flex;
    width: 14px;
    height: 14px;
    margin-right: 8px;
    vertical-align: -2px;
  }
  .rinv-btn:focus-visible {
    outline: 2px solid var(--ripple-ring);
    outline-offset: 2px;
  }
  .rinv-btn-primary {
    order: -1;
    background: var(--ripple-accent);
    color: var(--ripple-accent-foreground);
  }
  .rinv-btn-primary:hover {
    background: color-mix(in oklab, var(--ripple-accent) 88%, var(--ripple-surface-foreground));
  }
  .rinv-btn-outline {
    background: transparent;
    border-color: var(--ripple-border);
    color: var(--ripple-surface-foreground);
  }
  .rinv-btn-ghost {
    background: transparent;
    color: var(--ripple-surface-foreground);
  }
  .rinv-btn-outline:hover,
  .rinv-btn-ghost:hover {
    background: color-mix(in oklab, var(--ripple-surface-foreground) 6%, transparent);
  }
  .rinv-btn:active {
    transform: translateY(0.5px);
  }

  @container (min-width: 480px) {
    .rinv {
      padding: 24px;
    }
    .rinv > * + * {
      margin-top: 20px;
      padding-top: 20px;
    }
    .rinv > .rinv-lines {
      padding-top: 0;
    }
    /* Parties and meta share one 3-track grid so every label starts on a
       column edge used above it. */
    .rinv-parties,
    .rinv-meta {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      column-gap: 24px;
    }
    .rinv-meta {
      row-gap: 12px;
    }
    .rinv-pair {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .rinv-pair dt {
      font-size: 12px;
    }
    .rinv-bottom {
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    }
    .rinv-actions {
      flex-direction: row;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .rinv-btn-primary {
      order: 0;
    }
  }

  @media print {
    .rinv {
      border: 0;
      padding: 0;
    }
    .rinv-print-hide {
      display: none !important;
    }
  }
</style>
