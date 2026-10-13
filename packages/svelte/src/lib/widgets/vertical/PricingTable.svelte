<!--
  widgets/vertical/PricingTable.svelte: `pricing-table`, plan cards side by
  side with a price, a feature checklist and a CTA each.

  Invariants:
  - The grid sizes off its own width: every tier in one row when each gets
    11rem, else one column (a phone-width card). A node `style` lands after
    it and still wins.
  - A CTA click fires the tier's own `actions` when it has them, else
    `onselect(id)` (what a spec's `on_select` becomes; the event value is
    { id, name }).
  - `currency` is an ISO 4217 code (formatted with Intl, no cents on whole
    numbers) or a symbol prefixed as written.
-->
<script lang="ts">
  import { getContext } from 'svelte';
  import { safeStyle } from '@ripple-ui/core';
  import type { EventDispatcher, EventHandler, EventHandlerOrArray } from '@ripple-ui/core';
  import type { StateManager } from '$lib/core/state-manager.svelte.js';
  import { cn } from '$lib/utils.js';
  import CheckIcon from '@lucide/svelte/icons/check';
  import XIcon from '@lucide/svelte/icons/x';

  type Tier = {
    id: string;
    name: string;
    price: string | number;
    period?: string;
    description?: string;
    features?: (string | { label: string; included?: boolean })[];
    cta?: string;
    popular?: boolean;
    /** Fired on this tier's CTA instead of `on_select`. */
    actions?: EventHandlerOrArray;
  };

  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    tiers?: Tier[];
    /** ISO 4217 code ("EUR") or a symbol ("$") for numeric prices. */
    currency?: string;
    /** A spec's `on_select`; NodeRenderer passes the clicked tier as the event value. */
    onselect?: (detail: { id: string; name: string }) => void;
  }

  let {
    id,
    class: className,
    style,
    tiers = [],
    currency = '$',
    onselect
  }: Props = $props();

  const styleString = $derived(
    style ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
  );

  const eventDispatcher = getContext<EventDispatcher | undefined>('ui-events');
  const stateManager = getContext<StateManager | undefined>('ui-state');

  function formatPrice(p: string | number): string {
    if (typeof p !== 'number') return p;
    if (/^[A-Za-z]{3}$/.test(currency)) {
      try {
        const whole = Number.isInteger(p) ? 0 : 2;
        return new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: currency.toUpperCase(),
          minimumFractionDigits: whole,
          maximumFractionDigits: whole
        }).format(p);
      } catch {
        /* not a known code: fall through to a prefix */
      }
    }
    return `${currency}${p}`;
  }

  /** "/month", "per month" and "month" all read as "/month". */
  const periodText = (p: string) => (/^\s*(\/|per\b)/i.test(p) ? p.trim() : `/${p.trim()}`);

  function choose(tier: Tier) {
    if (tier.actions && eventDispatcher) {
      const handlers = (Array.isArray(tier.actions) ? tier.actions : [tier.actions]) as EventHandler[];
      void eventDispatcher.dispatch(handlers, { state: stateManager?.state ?? {}, item: tier }, tier);
      return;
    }
    onselect?.({ id: tier.id, name: tier.name });
  }

  // One row of every tier when each gets 11rem, else one column: never a
  // 2 + 1 orphan. clamp() flips between the two on the grid's own width (the
  // (T - 100%) * 999 term is hugely positive below T, negative above it), so
  // no container query and no shrink-to-fit collapse inside a centred flex.
  const gridColumns = $derived.by(() => {
    const n = Math.min(Math.max(1, tiers.length), 4);
    const share = `calc((100% - ${n - 1}rem) / ${n} - 0.1px)`;
    const flip = `calc((${n * 11 + n - 1}rem - 100%) * 999)`;
    return `repeat(auto-fit, minmax(clamp(${share}, ${flip}, 100%), 1fr))`;
  });

  function normalizeFeature(f: string | { label: string; included?: boolean }) {
    return typeof f === 'string' ? { label: f, included: true } : { included: true, ...f };
  }
</script>

<div
  {id}
  class={cn('grid w-full gap-4', className)}
  data-widget="pricing-table"
  style={safeStyle(`grid-template-columns: ${gridColumns}; ${styleString ?? ''}`)}
>
  <!-- Keyed by id AND position: a streamed item can lack its id, or carry a half-written one equal to a finished id, and a duplicate key throws. -->
  {#each tiers as tier, tierIdx (`${tier.id}:${tierIdx}`)}
    <div
      class={cn(
        'relative flex flex-col rounded-xl border bg-card p-6 transition-shadow',
        tier.popular ? 'border-primary shadow-md ring-1 ring-primary/20' : 'border-border'
      )}
    >
      {#if tier.popular}
        <span
          class="absolute -top-2.5 right-6 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground"
        >
          Most popular
        </span>
      {/if}

      <div class="mb-4">
        <h3 class="text-lg font-semibold">{tier.name}</h3>
        {#if tier.description}
          <p class="text-sm text-muted-foreground mt-1">{tier.description}</p>
        {/if}
      </div>

      <div class="mb-4">
        <span class="text-3xl font-bold tabular-nums">{formatPrice(tier.price)}</span>
        {#if tier.period}
          <span class="text-sm text-muted-foreground ml-1">{periodText(tier.period)}</span>
        {/if}
      </div>

      <ul class="flex flex-col gap-2 mb-6 m-0 p-0 list-none flex-1">
        {#each (tier.features ?? []) as raw, featIdx (`${typeof raw === 'string' ? raw : raw.label}:${featIdx}`)}
          {@const f = normalizeFeature(raw)}
          <li class={cn('flex items-start gap-2 text-sm', !f.included && 'text-muted-foreground')}>
            {#if f.included}
              <CheckIcon size={16} class="text-primary mt-0.5 shrink-0" />
            {:else}
              <XIcon size={16} class="opacity-40 mt-0.5 shrink-0" />
            {/if}
            <span>{f.label}</span>
          </li>
        {/each}
      </ul>

      <button
        type="button"
        onclick={() => choose(tier)}
        class={cn(
          'w-full rounded-md px-4 py-2 text-sm font-medium transition-colors',
          tier.popular
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'border border-border hover:bg-muted/60'
        )}
      >
        {tier.cta ?? 'Choose plan'}
      </button>
    </div>
  {/each}
</div>
