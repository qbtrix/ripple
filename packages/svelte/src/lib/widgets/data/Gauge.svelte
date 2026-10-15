<!--
  Gauge.svelte: one value against its whole, as a native SVG meter that
  server-renders in its final state (no canvas, no lazy chart library).
  A 240 degree open arc (gap at the bottom): the full sweep on --ripple-track,
  the value drawn over it on the accent or a validated `color` (arc only; every
  glyph stays a token). Centre stack: the number in surface ink with tabular
  figures, and on a non-percent scale the muted target line ("of 10,000",
  "of 120 · 30 over"). Every data decision lives in gauge-value.ts.

  Layout keys on the widget's own width (container queries, never the
  viewport): 440px and up puts the dial left and the words right; below that
  it stacks title, dial, label (two lines at most then an ellipsis, one for the
  label under 160px; full text in `title`). The dial is its own container, so
  stroke weight, number size and the full/compact number swap follow the
  dial's drawn size. `height` caps the dial's drawn height, it never reserves
  an empty box.

  Invariants: the root forwards `id` and `data-ripple-node`; it is the
  role="meter" with a name and aria-valuetext in words; the SVG is
  aria-hidden. Zero or no value draws no value path at all (a round cap would
  read as a dot of progress). The arc transitions only when `value` changes,
  and not under reduced motion.
-->
<script lang="ts">
  import { safeStyle } from '@ripple-ui/core';
  import { cn } from '$lib/utils.js';
  import { gaugeView, DIAL_RATIO } from './gauge-value.js';

  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    /** Current value 0..max. */
    value?: number | string;
    max?: number | string;
    label?: string;
    color?: string;
    /** Max height in px of the drawn dial. */
    height?: number | string;
    title?: string;
  }

  let { id, class: className, style, value, max, label, color, height, title }: Props = $props();

  const g = $derived(gaugeView({ value, max, label, title, color, height }));
  const styleString = $derived(
    style ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : ''
  );
  // 240 degree arc on a 100-wide viewBox, centre (50, 50), radius sized for
  // the thickest stroke tier so a round cap never clips.
  const R = 45.5;
  const ARC = `M ${50 - R * Math.sin(Math.PI / 3)} ${50 + R / 2} A ${R} ${R} 0 1 1 ${50 + R * Math.sin(Math.PI / 3)} ${50 + R / 2}`;
  const VB_H = DIAL_RATIO * 100;
  const uid = $props.id();
  const maskId = `gauge-cut-${uid}`;
  const dash = $derived(g.fraction > 0 ? Math.max(g.fraction * 100, 0.5) : 0);
</script>

<div
  {id}
  data-ripple-node={id}
  class={cn('gauge w-full min-w-0', className)}
  style={safeStyle(`--gd:${g.diameter}px;${styleString}`)}
  role="meter"
  aria-label={g.name}
  aria-valuemin={0}
  aria-valuemax={g.max}
  aria-valuenow={g.value}
  aria-valuetext={g.ariaText}
>
  <div class="g-body">
    {#if g.title}
      <h3 class="g-title text-headline text-ripple-surface-foreground" title={g.title}>{g.title}</h3>
    {/if}
    <div class="g-dial">
      <svg viewBox="0 0 100 {VB_H}" aria-hidden="true" focusable="false">
        {#if dash > 0}
          <!-- The track is cut a little past the value's end, so the arc meets
               the card there instead of the track: the accent reaches 3:1
               against the card but not against the track. A mask, not a
               painted halo, so the cut shows whatever the card is. -->
          <mask id={maskId} maskUnits="userSpaceOnUse" x="-5" y="-5" width="110" height="95">
            <rect x="-5" y="-5" width="110" height="95" fill="white" />
            <path
              class="g-arc g-cut transition-[stroke-dashoffset] duration-[400ms] ease-ripple-out motion-reduce:transition-none"
              d={ARC}
              fill="none"
              stroke="black"
              stroke-linecap="round"
              pathLength="100"
              stroke-dasharray="100 200"
              stroke-dashoffset={100 - Math.min(100, dash + 2.5)}
            />
          </mask>
        {/if}
        <path class="g-arc stroke-ripple-track" d={ARC} fill="none" stroke-linecap="round" mask={dash > 0 ? `url(#${maskId})` : undefined} />
        {#if dash > 0}
          <path
            class={cn(
              'g-arc transition-[stroke-dashoffset] duration-[400ms] ease-ripple-out motion-reduce:transition-none',
              !g.color && 'stroke-ripple-accent'
            )}
            style:stroke={g.color}
            d={ARC}
            fill="none"
            stroke-linecap="round"
            pathLength="100"
            stroke-dasharray="100 200"
            stroke-dashoffset={100 - dash}
          />
        {/if}
      </svg>
      <div class="g-centre">
        {#if g.hasValue}
          <span class={cn('g-num', g.numberCompact && 'g-full')} style:--gl={g.number.length}>{g.number}</span>
          {#if g.numberCompact}
            <span class="g-num g-compact" style:--gl={g.numberCompact.length}>{g.numberCompact}</span>
          {/if}
          {#if g.target}
            <span class="g-target text-ripple-muted-foreground">
              <span class={cn(g.targetCompact && 'g-full')}>{g.target}</span>
              {#if g.targetCompact}<span class="g-compact">{g.targetCompact}</span>{/if}
              {#if g.over}<span class="g-over">{g.over}</span>{/if}
            </span>
          {/if}
        {:else}
          <span class="g-none text-callout text-ripple-muted-foreground">No value</span>
        {/if}
      </div>
    </div>
    {#if g.label}
      <p class="g-label text-body text-ripple-surface-foreground" title={g.label}>{g.label}</p>
    {/if}
    {#if g.meta}
      <p class="g-meta text-callout text-ripple-muted-foreground">{g.meta}</p>
    {/if}
  </div>
</div>

<style>
  .gauge { container: gauge / inline-size; }
  .g-body {
    display: grid;
    grid-template-areas: 'title' 'dial' 'label';
    justify-items: center;
    min-width: 0;
  }
  .g-title {
    grid-area: title;
    justify-self: stretch;
    margin: 0 0 8px;
    text-align: left;
  }
  .g-title, .g-label {
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  .g-label { grid-area: label; margin: 4px 0 0; text-align: center; }
  .g-meta { grid-area: meta; display: none; margin: 4px 0 0; }

  .g-dial {
    grid-area: dial;
    container: gdial / inline-size;
    position: relative;
    width: min(100%, var(--gd));
  }
  .g-dial svg { display: block; width: 100%; height: auto; overflow: visible; }
  .g-dial svg { --gsw: 6.4px; }
  .g-arc { stroke-width: var(--gsw); }
  /* Wider than the arc so no anti-aliased track edge survives in the cut. */
  .g-cut { stroke-width: calc(var(--gsw) + 2px); }
  /* Centred on the circle's centre (y 50 of the 78-high viewBox), not the box. */
  .g-centre {
    position: absolute;
    left: 14%;
    right: 14%;
    top: calc(50% / 0.78);
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    min-width: 0;
  }
  .g-num {
    color: var(--ripple-surface-foreground);
    font-weight: var(--weight-semibold, 600);
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
    white-space: nowrap;
    font-size: clamp(17px, min(22cqi, calc(117cqi / var(--gl))), 34px);
  }
  .g-target, .g-none { white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .g-target { font-size: var(--text-callout); line-height: var(--lh-callout); font-variant-numeric: tabular-nums; }
  .g-compact { display: none; }

  @container gdial (max-width: 179px) {
    .g-dial svg { --gsw: 7.5px; }
  }
  @container gdial (max-width: 159px) {
    .g-full { display: none; }
    .g-compact { display: inline; }
    .g-over { display: none; }
    .g-target { font-size: var(--text-caption-1); line-height: var(--lh-caption); }
  }
  @container gdial (max-width: 119px) {
    .g-dial svg { --gsw: 9px; }
  }

  @container gauge (max-width: 159px) {
    .g-label { -webkit-line-clamp: 1; line-clamp: 1; }
  }
  @container gauge (min-width: 440px) {
    .g-body {
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-rows: 1fr auto auto auto 1fr;
      grid-template-areas: 'dial .' 'dial title' 'dial label' 'dial meta' 'dial .';
      column-gap: 24px;
      justify-items: start;
      align-items: start;
    }
    .g-dial { width: min(168px, var(--gd)); align-self: center; }
    .g-title { margin-bottom: 4px; }
    .g-label { text-align: left; margin-top: 0; }
    .g-meta { display: block; }
  }
</style>
