<!--
  BulkActionBar: "N things selected, what can you do to all of them?"

  A selection-state strip, not a card: brand-blue tint, one border, a shadow
  only when `position` is "sticky-bottom" (it then sticks 12px above the bottom
  of a scrolling host). Left block: Clear (X, 32px target) next to the count
  line ("**5** users selected"). Right block: the actions.

  The outer element is the size container. At 520px and wider the bar is one
  row of ghost buttons (icon + label). Narrower, it is two rows: Clear + count,
  then equal-width columns with the icon above the label. Which actions sit in
  the row and which go to the More menu is a fixed rule on label length and
  that same width (bulk-action-bar.ts, splitActions), read from the element's
  own clientWidth because the menu content is portalled and CSS cannot reach it.

  Props are normalised in bulk-action-bar.ts: a string or fractional count is
  rounded, 0 or junk renders nothing, blank labels drop, a missing id falls
  back to the label, destructive actions always go last (after a divider, or
  after a separator in the menu) in error-text red. "outline" and unknown
  variants render as the ghost button. Icons come from the closed BULK_ICONS
  map; an unknown name shows the label alone.

  Clear or Escape inside the bar calls `onclear` and hides the bar until the
  count changes. `onaction(id)` fires per action.
-->
<script lang="ts">
  import { on } from 'svelte/events';
  import { cn } from '$lib/utils.js';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
  import * as Tooltip from '$lib/components/ui/tooltip/index.js';
  import { BULK_ICONS, ICON } from '../data-kit/icons.js';
  import { WIDE_AT, countLabel, normalizeActions, sanitizeCount, splitActions, type BulkAction } from './bulk-action-bar.js';
  import XIcon from '@lucide/svelte/icons/x';
  import EllipsisIcon from '@lucide/svelte/icons/ellipsis';

  type Action = {
    id: string;
    label: string;
    icon?: string;
    variant?: 'default' | 'destructive' | 'outline';
    disabled?: boolean;
  };

  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    /** Currently selected count. The bar shows when selectedCount > 0. */
    selectedCount?: number;
    /** Singular noun, pluralised by the bar. Default "item". */
    noun?: string;
    actions?: Action[];
    /** 'inline' renders in flow; 'sticky-bottom' floats at the bottom of a scrolling host. */
    position?: 'inline' | 'sticky-bottom';
    onaction?: (id: string) => void;
    onclear?: () => void;
  }

  let {
    id,
    class: className,
    style,
    selectedCount = 0,
    noun = 'item',
    actions = [],
    position = 'inline',
    onaction,
    onclear
  }: Props = $props();

  const styleString = $derived(
    style ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
  );

  const count = $derived(sanitizeCount(selectedCount));
  const line = $derived(countLabel(count, noun));
  const all = $derived(normalizeActions(actions));

  // 0 = not measured yet (SSR, jsdom): use the wide rule.
  let width = $state(0);
  const wide = $derived(width === 0 || width >= WIDE_AT);
  const split = $derived(splitActions(all, wide));
  const safe = $derived(split.inline.filter((a) => !a.destructive));
  const danger = $derived(split.inline.filter((a) => a.destructive));
  const menuSafe = $derived(split.menu.filter((a) => !a.destructive));
  const menuDanger = $derived(split.menu.filter((a) => a.destructive));

  // Hidden for the count it was cleared at; a new count shows the bar again.
  let clearedAt = $state<number | null>(null);
  const visible = $derived(count > 0 && clearedAt !== count);

  function clear() {
    clearedAt = count;
    onclear?.();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') clear();
  }
</script>

{#snippet actionButton(a: BulkAction, idx: number)}
  {@const Icon = a.icon ? BULK_ICONS[a.icon as keyof typeof BULK_ICONS] : undefined}
  <button
    type="button"
    class="rbab-act"
    data-destructive={a.destructive || undefined}
    data-idx={idx}
    disabled={a.disabled}
    onclick={() => onaction?.(a.id)}
  >
    {#if Icon}<Icon {...ICON.row} aria-hidden="true" />{/if}
    <span class="rbab-label">{a.label}</span>
  </button>
{/snippet}

{#if visible}
  <div
    {id}
    class={cn('rbab-wrap', className)}
    data-position={position === 'sticky-bottom' ? 'sticky-bottom' : 'inline'}
    data-layout={wide ? 'wide' : 'narrow'}
    style={styleString}
    bind:clientWidth={width}
  >
    <!-- Escape is bound as an attachment: role="group" is not interactive, and the a11y lint rejects an inline keydown on it. -->
    <div class="rbab" role="group" aria-label="Bulk actions" {@attach (el) => on(el, 'keydown', onkeydown)}>
      <div class="rbab-lead">
        <Tooltip.Root delayDuration={400}>
          <Tooltip.Trigger class="rbab-clear" aria-label="Clear selection" onclick={clear}>
            <XIcon {...ICON.row} aria-hidden="true" />
          </Tooltip.Trigger>
          <Tooltip.Content side="top" sideOffset={6}>Clear selection</Tooltip.Content>
        </Tooltip.Root>
        <p class="rbab-count" aria-live="polite"><strong>{line.count}</strong> {line.rest}</p>
      </div>

      {#if all.length > 0}
        <div class="rbab-actions">
          <!-- Keyed by id AND position: a streamed item can lack its id, or carry a half-written one equal to a finished id, and a duplicate key throws. -->
          {#each safe as a, idx (`${a.id}:${idx}`)}
            {@render actionButton(a, idx)}
          {/each}
          {#if split.menu.length > 0}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger class="rbab-act rbab-more">
                <EllipsisIcon {...ICON.row} aria-hidden="true" />
                <span class="rbab-label">More</span>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end" sideOffset={6} class="rbab-menu w-64">
                {#each menuSafe as a, idx (`${a.id}:${idx}`)}
                  {@const Icon = a.icon ? BULK_ICONS[a.icon as keyof typeof BULK_ICONS] : undefined}
                  <DropdownMenu.Item disabled={a.disabled} onSelect={() => onaction?.(a.id)} class="items-start">
                    {#if Icon}<Icon {...ICON.row} aria-hidden="true" class="mt-0.5" />{/if}
                    <span class="min-w-0 whitespace-normal">{a.label}</span>
                  </DropdownMenu.Item>
                {/each}
                {#if menuSafe.length > 0 && menuDanger.length > 0}
                  <DropdownMenu.Separator />
                {/if}
                {#each menuDanger as a, idx (`${a.id}:${idx}`)}
                  {@const Icon = a.icon ? BULK_ICONS[a.icon as keyof typeof BULK_ICONS] : undefined}
                  <DropdownMenu.Item variant="destructive" disabled={a.disabled} onSelect={() => onaction?.(a.id)} class="items-start">
                    {#if Icon}<Icon {...ICON.row} aria-hidden="true" class="mt-0.5" />{/if}
                    <span class="min-w-0 whitespace-normal">{a.label}</span>
                  </DropdownMenu.Item>
                {/each}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          {/if}
          {#if danger.length > 0}
            {#if safe.length > 0 || split.menu.length > 0}<span class="rbab-divider" aria-hidden="true"></span>{/if}
            {#each danger as a, idx (`${a.id}:${idx}`)}
              {@render actionButton(a, idx)}
            {/each}
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .rbab-wrap {
    container-type: inline-size;
    width: 100%;
  }
  .rbab-wrap[data-position='sticky-bottom'] {
    position: sticky;
    bottom: 12px;
    z-index: 10;
  }
  .rbab {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
    padding: 6px 8px 6px 6px;
    border: 1px solid color-mix(in oklab, var(--ripple-accent) 28%, var(--ripple-surface));
    border-radius: var(--ripple-radius);
    background: color-mix(in oklab, var(--ripple-accent) 8%, var(--ripple-surface));
    color: var(--ripple-surface-foreground);
    font-size: 13px;
    line-height: 1.35;
    animation: rbab-in 160ms var(--ripple-ease-out);
  }
  [data-position='sticky-bottom'] > .rbab {
    box-shadow: 0 8px 24px -10px oklch(0 0 0 / 0.28);
  }
  @keyframes rbab-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .rbab {
      animation: none;
    }
  }

  .rbab-lead {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    flex: 1 1 auto;
  }
  .rbab-count {
    margin: 0;
    min-width: 0;
    color: var(--ripple-muted-foreground);
    text-wrap: pretty;
    overflow-wrap: anywhere;
  }
  .rbab-count strong {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--ripple-surface-foreground);
  }

  .rbab-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    margin-left: auto;
  }
  .rbab-divider {
    align-self: stretch;
    width: 1px;
    margin: 4px 2px;
    background: var(--ripple-border);
  }

  .rbab :global(.rbab-clear),
  .rbab :global(.rbab-act) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 32px;
    border: 0;
    border-radius: calc(var(--ripple-radius) - 2px);
    background: transparent;
    color: var(--ripple-surface-foreground);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
    transition:
      background-color 120ms var(--ripple-ease-out),
      color 120ms var(--ripple-ease-out);
  }
  .rbab :global(.rbab-clear) {
    flex: none;
    width: 32px;
    color: var(--ripple-muted-foreground);
  }
  .rbab :global(.rbab-act) {
    padding: 0 10px;
    white-space: nowrap;
  }
  .rbab :global(.rbab-clear:hover),
  .rbab :global(.rbab-act:hover:not(:disabled)),
  .rbab :global(.rbab-act[aria-expanded='true']) {
    background: var(--ripple-muted);
    color: var(--ripple-surface-foreground);
  }
  .rbab :global(.rbab-act[data-destructive]) {
    color: var(--ripple-error-text);
  }
  .rbab :global(.rbab-act[data-destructive]:hover:not(:disabled)) {
    background: color-mix(in oklab, var(--ripple-error) 12%, transparent);
    color: var(--ripple-error-text);
  }
  .rbab :global(.rbab-act:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .rbab :global(.rbab-clear:focus-visible),
  .rbab :global(.rbab-act:focus-visible) {
    outline: 2px solid var(--ripple-ring);
    outline-offset: 1px;
  }

  /* Narrow card: count row, then a quiet row of equal-width columns. */
  @container (max-width: 519.98px) {
    .rbab {
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
      padding: 6px;
    }
    .rbab-actions {
      flex-wrap: nowrap;
      align-items: stretch;
      gap: 4px;
      margin-left: 0;
    }
    .rbab :global(.rbab-act) {
      flex: 1 1 0;
      min-width: 0;
      flex-direction: column;
      gap: 4px;
      min-height: 48px;
      padding: 6px 4px;
      font-size: 12px;
      line-height: 1.25;
      white-space: normal;
      text-align: center;
    }
    .rbab :global(.rbab-act .rbab-label) {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      overflow: hidden;
      overflow-wrap: anywhere;
    }
    .rbab-divider {
      margin: 6px 0;
    }
  }
</style>
