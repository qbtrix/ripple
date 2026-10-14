<!--
  SavedViews: "which saved slice of this list am I looking at, how big is each
  slice, and how do I switch?"

  A wrapping row of chips in the shared selected-option look (chip.ts, as tabs
  and segmented): the selected view is a raised chip with medium weight, the
  rest are quiet muted labels. Each chip is [icon] label count [pin]. On the
  selected chip count and pin keep the label ink (muted ink on the dark raised
  fill drops under 3:1) and the count is set apart by weight. On the other
  chips the count shares the muted label ink: one step quieter (80% muted into
  the surface) measures 3.3:1 on the light card, under 4.5:1, so the gap is
  the only cue there. Counts read 2,847 grouped, 12.4K compact from 10,000; the
  full number is in the accessible name. A label never wraps inside its chip:
  it ellipses (full text in title and aria-label) and the row wraps between
  chips, so nothing ever scrolls sideways.

  Chips, "N more" and New view share one flex flow: the radiogroup element is
  `display: contents`, so it groups the radios for assistive tech without
  boxing them, and the two buttons follow the last chip on its line (New view
  pushed to the end by an auto margin). The root is the size container. Below
  480px chips get tighter padding; below 400px view icons are dropped; below
  280px New view is an icon-only square. More than COLLAPSE_AT views fold to
  the first seven plus the selected one and an "N more" disclosure
  (saved-views.ts holds the rule and the normaliser).

  Selection: `value` when it names a view, else the first pinned view, else the
  first; a default is committed once through onchange so state agrees. It is a
  radiogroup (no panels): one tab stop, arrows move and select with wrap,
  Home/End jump, and arrowing into folded views unfolds them. "N more" and
  New view are buttons outside the group. New view renders only when
  `canCreate` is true AND the spec has an `on_create` handler (`oncreate`), so
  it is never a dead control.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { safeStyle } from '@ripple-ui/core';
  import { cn } from '$lib/utils.js';
  import { CHIP_RADIUS, SELECTED_CHIP } from '$lib/components/ui/chip.js';
  import { uniqueKeys } from '$lib/utils/safe-props.js';
  import * as icons from '@lucide/svelte';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import PinIcon from '@lucide/svelte/icons/pin';
  import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
  import { countText, normalizeViews, selectedIndex, viewName, visibleIndexes } from './saved-views.js';

  type View = {
    id: string;
    label: string;
    /** Optional icon (lucide kebab-case). */
    icon?: string;
    /** Pinned view; also the default when `value` names no view. */
    pinned?: boolean;
    /** Optional item count shown after the label. */
    count?: number;
  };

  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    views?: View[];
    /** Selected view id. Bind via `bind: "<state-path>"`. */
    value?: string | null;
    /** Show a "New view" button (needs an `on_create` handler). */
    canCreate?: boolean;
    onchange?: (id: string) => void;
    oncreate?: () => void;
  }

  let {
    id,
    class: className,
    style,
    views = [],
    value = null,
    canCreate = false,
    onchange,
    oncreate
  }: Props = $props();

  const styleString = $derived(
    style ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
  );

  const list = $derived(normalizeViews(views));
  const keys = $derived(uniqueKeys(list, (v) => v.id));
  // Follows `value`, but a click still moves the selection when no bind is wired.
  let current: unknown = $derived(value);
  const selected = $derived(selectedIndex(list, current));
  // A missing or unknown `value` falls back to a default; commit it once so state agrees.
  const fallback = $derived(selectedIndex(list, value));
  const valueMatches = $derived(list.some((v) => v.id === String(value ?? '').trim()));
  $effect(() => {
    if (!valueMatches && fallback >= 0) onchange?.(list[fallback].id);
  });

  let expanded = $state(false);
  const shown = $derived(visibleIndexes(list.length, selected, expanded));
  const folded = $derived(list.length - shown.length);
  const foldable = $derived(expanded || folded > 0);
  const showCreate = $derived(!!canCreate && typeof oncreate === 'function');

  function pick(i: number) {
    const v = list[i];
    if (!v || i === selected) return;
    current = v.id;
    onchange?.(v.id);
  }

  let group = $state<HTMLDivElement | null>(null);
  const ARROW: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

  async function onkeydown(e: KeyboardEvent, from: number) {
    const n = list.length;
    const step = ARROW[e.key];
    let to: number;
    if (step) to = (((from + step) % n) + n) % n;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = n - 1;
    else return;
    e.preventDefault();
    if (!shown.includes(to)) expanded = true;
    pick(to);
    await tick();
    for (const el of group?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []) {
      if (el.dataset.index === String(to)) el.focus();
    }
  }

  function getIcon(name?: string) {
    if (!name) return null;
    const camel = name
      .split('-')
      .map((p) => (p[0]?.toUpperCase() ?? '') + p.slice(1))
      .join('');
    return ((icons as unknown) as Record<string, import('svelte').Component<any, any, any>>)[camel] ?? null;
  }

  const motion = 'transition-colors duration-150 ease-ripple-out motion-reduce:transition-none';
  const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ripple-ring';
</script>

<div
  {id}
  data-ripple-node={id}
  class={cn('sv', className)}
  style={safeStyle(styleString)}
>
  <div class="sv__row">
    {#if list.length}
      <div bind:this={group} role="radiogroup" aria-label="Saved views" class="sv__group">
        {#each shown as i (keys[i])}
          {@const view = list[i]}
          {@const on = i === selected}
          {@const Icon = getIcon(view.icon)}
          <button
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={viewName(view)}
            title={view.label}
            data-index={i}
            tabindex={on ? 0 : -1}
            onclick={() => pick(i)}
            onkeydown={(e) => onkeydown(e, i)}
            class={cn(
              'sv__chip inline-flex h-8 min-w-0 items-center gap-1.5 whitespace-nowrap text-[13px]',
              CHIP_RADIUS,
              motion,
              focus,
              on
                ? cn(SELECTED_CHIP, 'font-medium')
                : 'text-ripple-muted-foreground hover:bg-ripple-track hover:text-ripple-surface-foreground'
            )}
          >
            {#if Icon}<span class="sv__icon" aria-hidden="true"><Icon size={14} strokeWidth={1.75} /></span>{/if}
            <span class="min-w-0 truncate">{view.label}</span>
            {#if view.count !== undefined}
              <span class={cn('shrink-0 tabular-nums font-normal', !on && 'text-ripple-muted-foreground')} aria-hidden="true"
                >{countText(view.count)}</span
              >
            {/if}
            {#if view.pinned}
              <span class={cn('sv__pin shrink-0', !on && 'text-ripple-muted-foreground')} title="Pinned" aria-hidden="true"
                ><PinIcon size={12} strokeWidth={1.75} /></span
              >
            {/if}
          </button>
        {/each}
      </div>
    {:else}
      <p class="sv__empty text-[13px] text-ripple-muted-foreground">No saved views yet</p>
    {/if}

    {#if foldable}
      <button
        type="button"
        aria-expanded={expanded}
        onclick={() => (expanded = !expanded)}
        class={cn(
          'sv__chip inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap text-[13px] text-ripple-muted-foreground hover:bg-ripple-track hover:text-ripple-surface-foreground',
          CHIP_RADIUS,
          motion,
          focus
        )}
      >
        {expanded ? 'Show fewer' : `${folded} more`}
        <span class={cn('inline-flex transition-transform duration-150 motion-reduce:transition-none', expanded && 'rotate-180')} aria-hidden="true"
          ><ChevronDownIcon size={14} strokeWidth={1.75} /></span
        >
      </button>
    {/if}

    {#if showCreate}
      <button
        type="button"
        aria-label="New view"
        title="New view"
        onclick={() => oncreate?.()}
        class={cn(
          'sv__new inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap border border-ripple-control-border text-[13px] text-ripple-surface-foreground hover:bg-ripple-track',
          CHIP_RADIUS,
          motion,
          focus
        )}
      >
        <PlusIcon size={14} strokeWidth={1.75} aria-hidden="true" />
        <span class="sv__new-text">New view</span>
      </button>
    {/if}
  </div>
</div>

<style>
  .sv {
    container-type: inline-size;
    min-width: 0;
  }

  .sv__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  /* Groups the radios for assistive tech; layout belongs to .sv__row. */
  .sv__group {
    display: contents;
  }

  .sv__chip {
    max-width: 100%;
    padding-inline: 8px;
  }

  .sv__empty {
    display: flex;
    align-items: center;
    min-height: 2rem;
    margin: 0;
  }

  .sv__icon,
  .sv__pin {
    display: inline-flex;
    flex-shrink: 0;
  }

  .sv__new {
    margin-inline-start: auto;
    padding-inline: 10px;
  }

  /* Tiny containers: New view is an icon-only square. */
  @container (max-width: 279px) {
    .sv__new {
      width: 2rem;
      padding-inline: 0;
    }

    .sv__new-text {
      display: none;
    }
  }

  @container (max-width: 399px) {
    .sv__icon {
      display: none;
    }
  }

  @container (min-width: 480px) {
    .sv__chip {
      max-width: min(100%, 240px);
      padding-inline: 10px;
    }
  }
</style>
