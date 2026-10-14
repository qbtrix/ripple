<!--
  CheckboxGroup.svelte: a labelled column of checkbox rows. Each row is
  role=checkbox and owns focus and keys (Space/Enter toggle, arrows, Home/End).
  The box sits on the group label's left edge, the same x as radio-group and a
  standalone checkbox; labels are body ink at normal weight whether or not they
  are checked, so an unchecked row never reads as disabled. A checked row has
  no fill of its own: the box says it.
  A hover highlight and a focus ring glide between rows through the shared
  `movingIndicator` action on the FF `fast` (80ms) token; the hover fill is the
  row's own box, so it never reaches left of the label edge.
  Mechanism and timing ported from Fluid Functionalism's checkbox-group
  (github.com/mickadesign/fluid-functionalism, MIT).
-->

<script lang="ts">
  import { Checkbox as CheckboxPrimitive } from '$lib/components/ui/checkbox/index.js';
  import { cn } from '$lib/utils.js';
  import { canonicalOptions } from '$lib/utils/safe-props.js';
  import { FF_SPRING_TOKENS } from '@ripple-ui/core';
  import { movingIndicator, type IndicatorRect } from '$lib/motion/moving-indicator.js';
  import { FIELD_LABEL } from '$lib/components/ui/control.js';

  type Option = { value: string | number; label: string; disabled?: boolean };

  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    label?: string;
    /** Options to show. Strings or { value, label, disabled }. */
    options?: (string | Option)[];
    /** Array of checked values. Bind via `bind: "<state-path>"`. */
    value?: (string | number)[];
    disabled?: boolean;
    onchange?: (value: (string | number)[]) => void;
  }

  let {
    id,
    class: className,
    style,
    label,
    options: rawOptions = [],
    value = [],
    disabled = false,
    onchange
  }: Props = $props();

  const options = $derived(
    canonicalOptions(rawOptions, { widget: 'checkbox-group', key: 'options' }) as Option[]
  );

  const styleString = $derived(
    style ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
  );

  const checked = $derived(Array.isArray(value) ? value : []);
  const checkedSet = $derived(new Set(checked));

  // The indicators measure for themselves; this measure feeds the nearest-on-y
  // hit test that maps the cursor to activeIndex before any indicator mounts.
  type Rect = IndicatorRect;

  let container: HTMLDivElement | null = $state(null);
  const itemEls: (HTMLElement | null)[] = [];
  let itemRects = $state<Rect[]>([]);
  let activeIndex = $state<number | null>(null);
  let focusedIndex = $state<number | null>(null);
  let prefersReduced = $state(false);
  let frame = 0;

  function measure() {
    const rects: Rect[] = [];
    for (let i = 0; i < itemEls.length; i++) {
      const el = itemEls[i];
      if (el) rects[i] = { top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight };
    }
    itemRects = rects;
  }

  // Re-measure whenever the option set changes (and once on mount). $effect runs
  // after the DOM updates, so itemEls are populated. SSR-safe: $effect is
  // client-only, and itemRects starts [] so SSR paints no highlight (correct —
  // the highlight is a hover affordance, not initial content).
  $effect(() => {
    void options.length; // re-run when the list changes
    measure();
  });

  $effect(() => {
    // jsdom (unit tests) and older runtimes may not implement matchMedia — guard
    // so the widget renders without a layout/media engine. Defaults to motion on.
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReduced = mq.matches;
    const onChange = () => (prefersReduced = mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  });

  // Nearest-on-y-axis active detection (FF parity): prefer the item the cursor
  // is vertically inside; fall back to the closest item center. rAF-throttled.
  function onPointerMove(e: PointerEvent) {
    if (disabled || !container) return;
    if (frame) return;
    const y = e.clientY;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      let containing: number | null = null;
      let closest: number | null = null;
      let closestDist = Infinity;
      for (let i = 0; i < itemRects.length; i++) {
        const r = itemRects[i];
        if (!r) continue;
        const start = cRect.top + r.top;
        const end = start + r.height;
        if (y >= start && y <= end) containing = i;
        const dist = Math.abs(y - (start + r.height / 2));
        if (dist < closestDist) { closestDist = dist; closest = i; }
      }
      activeIndex = containing ?? closest;
    });
  }

  function onPointerLeave() {
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    activeIndex = null;
  }

  const hoverActiveIndex = $derived(activeIndex);

  // Enumerate the item elements for the indicators (re-read each apply).
  const enumerateItems = () => itemEls;

  function toggle(opt: Option, i: number) {
    if (disabled || opt.disabled) return;
    const next = checkedSet.has(opt.value)
      ? checked.filter((v) => v !== opt.value)
      : [...checked, opt.value];
    onchange?.(next);
  }

  function onItemKeydown(e: KeyboardEvent, opt: Option, i: number) {
    const items = itemEls.filter((el): el is HTMLElement => !!el);
    const here = items.indexOf(e.currentTarget as HTMLElement);
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggle(opt, i);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (here === -1) return;
      const n = e.key === 'ArrowDown' ? (here + 1) % items.length : (here - 1 + items.length) % items.length;
      items[n]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    }
  }
</script>

<div class={cn('flex flex-col gap-1.5', className)} style={styleString}>
  {#if label}
    <span class={FIELD_LABEL}>{label}</span>
  {/if}

  <div
    bind:this={container}
    {id}
    role="group"
    aria-label={label}
    class={cn('relative flex flex-col w-fit max-w-full select-none', disabled && 'opacity-60')}
    onpointermove={onPointerMove}
    onpointerleave={onPointerLeave}
  >
    <!-- Hover highlight: one element gliding to the active row's box. -->
    {#if hoverActiveIndex !== null}
      <div
        class="absolute rounded-md bg-ripple-track/60 pointer-events-none z-0"
        data-checkbox-group-highlight
        use:movingIndicator={{
          container: () => container,
          items: enumerateItems,
          active: hoverActiveIndex,
          token: FF_SPRING_TOKENS.fast,
          axis: 'both',
          reducedMotion: prefersReduced
        }}
      ></div>
    {/if}

    <!-- Focus ring — sits 2px OUTSIDE the focused item (inset: -2), also glides on
         the FF `fast` token via the same primitive. Mounts only while focused. -->
    {#if focusedIndex !== null}
      <div
        class="absolute rounded-md pointer-events-none z-20 border border-[var(--ring)]"
        data-checkbox-group-focus
        use:movingIndicator={{
          container: () => container,
          items: enumerateItems,
          active: focusedIndex,
          token: FF_SPRING_TOKENS.fast,
          axis: 'both',
          inset: -2,
          reducedMotion: prefersReduced
        }}
      ></div>
    {/if}

    {#each options as opt, i (opt.value)}
      {@const isChecked = checkedSet.has(opt.value)}
      {@const isActive = activeIndex === i}
      {@const itemDisabled = disabled || opt.disabled}
      <div
        bind:this={itemEls[i]}
        data-checkbox-group-item={i}
        role="checkbox"
        aria-checked={isChecked}
        aria-label={opt.label}
        aria-disabled={itemDisabled}
        tabindex={itemDisabled ? -1 : 0}
        class={cn(
          'relative z-10 flex items-start gap-2 rounded-md py-1 pr-2 outline-none',
          itemDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
        )}
        onclick={() => toggle(opt, i)}
        onkeydown={(e) => onItemKeydown(e, opt, i)}
        onfocus={(e) => { activeIndex = i; focusedIndex = (e.currentTarget as HTMLElement).matches(':focus-visible') ? i : null; }}
        onblur={(e) => { if (container?.contains(e.relatedTarget as Node)) return; focusedIndex = null; activeIndex = null; }}
      >
        <!-- Box — our shared Checkbox primitive (atomic block) for a11y. tabindex
             -1 + aria-hidden: the ROW owns focus + keyboard, the box is visual. -->
        <span class="pointer-events-none flex h-[1.35em] shrink-0 items-center text-sm">
          <CheckboxPrimitive
            checked={isChecked}
            disabled={itemDisabled}
            tabindex={-1}
            aria-hidden="true"
          />
        </span>

        <span class="text-sm leading-[1.35] text-ripple-surface-foreground">{opt.label}</span>
      </div>
    {/each}
  </div>
</div>
