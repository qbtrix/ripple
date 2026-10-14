<!--
  widgets/data/Heatmap.svelte: a matrix of values drawn as a CSS grid of DOM
  cells. heatmap-scale.ts does the data work (sanitize, axis order, colour
  classes, label thinning, number format); this file lays it out and handles
  the readout.

  Anatomy: optional title (two lines, then ellipsis), a sticky x label row
  above the grid, y labels in a capped left column (container query: 34% up to
  96px under 480px, 30% up to 140px above), the cells, a one-line legend (low
  figure, stepped swatches, high figure, "No data" when a position is empty), a
  one-line readout and, when entries had no row or column, a footnote.

  Size: the column width is measured (grid width minus the label column), cell
  height follows it (heatmap-scale `cellHeight`), and `height` caps the body,
  which then scrolls under the sticky label row. Never scrolls sideways.

  Colour: --ripple-accent (warm oklch arm below zero) mixed into
  --ripple-surface at HEAT, or HEAT_DARK under .dark / data-theme="dark", the
  same switch Treemap uses. Zero is --ripple-track, no data is an outlined
  empty cell. `colorRange` is ignored: the widget owns colour. In-cell ink is
  --ripple-surface-foreground in light and --ripple-accent-foreground on the
  ramp in dark; status-text.test.ts measures both.

  Interaction: hover, tap or keyboard focus sets the readout and rings the
  cell. The grid is one tab stop; arrows rove, Home/End jump within a row.
  Cells are aria-hidden; a visually hidden table carries every value.
  `tooltip: false` turns the hover readout off and keeps the peak line.
  The root forwards `id` and data-ripple-node.
-->
<script lang="ts">
	import { safeStyle } from '@ripple-ui/core';
	import { onMount } from 'svelte';
	import { cn } from '$lib/utils.js';
	import { plain } from '../data-kit/format.js';
	import {
		HEAT,
		HEAT_DARK,
		sanitize,
		scale,
		extremes,
		fmt,
		full,
		maxHeight,
		cellHeight,
		gapFor,
		thin,
		valuesFit,
		type Measure,
		type Tone
	} from './heatmap-scale.js';

	type Cell = { x: string | number; y: string | number; value: number };

	interface Props {
		id?: string;
		class?: string;
		style?: Record<string, string>;
		cells?: Cell[];
		/** Explicit x-axis labels, in order (categories found only in cells are appended). */
		xLabels?: (string | number)[];
		/** Explicit y-axis labels, top to bottom. */
		yLabels?: (string | number)[];
		/** Max body height in px (or "300px"); the rows scroll past it. */
		height?: number | string;
		title?: string;
		/** Ignored: the widget owns colour in both themes. */
		colorRange?: [string, string];
		/** true or false forces in-cell values on or off; absent means when they fit. */
		showLabels?: boolean;
		/** false turns the hover readout off; the peak line stays. */
		tooltip?: boolean;
	}

	let { id, class: className, style, cells = [], xLabels, yLabels, height, title, showLabels, tooltip = true }: Props = $props();

	const grid = $derived(sanitize(cells, xLabels, yLabels));
	const sc = $derived(scale(grid));
	const ext = $derived(extremes(grid));
	const nr = $derived(grid.ys.length);
	const nc = $derived(grid.xs.length);
	const heading = $derived(plain(title));
	const maxH = $derived(maxHeight(height));
	const live = $derived(tooltip !== false);
	const hasEmpty = $derived(grid.values.some((row) => row.some((v) => v === undefined)));

	let rootEl: HTMLDivElement | undefined = $state();
	let gridW = $state(0);
	let labelW = $state(0);
	let fontsReady = $state(false);
	onMount(() => {
		document.fonts?.ready.then(() => (fontsReady = true));
	});
	// Text widths at the footnote size, once webfonts are in (jsdom: none).
	const measure = $derived.by((): Measure | undefined => {
		if (!fontsReady || !rootEl) return undefined;
		const ctx = document.createElement('canvas').getContext('2d');
		if (!ctx) return undefined;
		ctx.font = `10px ${getComputedStyle(rootEl).fontFamily}`;
		return (t) => ctx.measureText(t).width;
	});

	const colW = $derived.by(() => {
		if (!nc || gridW <= 0) return 0;
		const w = (g: number) => (gridW - labelW - g * nc) / nc;
		return Math.max(0, w(gapFor(w(2))));
	});
	const gap = $derived(gapFor(colW));
	const showValues = $derived(valuesFit(grid, colW, showLabels, measure));
	const cellH = $derived(cellHeight(colW, showValues));
	const radius = $derived(Math.min(4, 0.25 * Math.min(colW || 4, cellH)));
	const xShown = $derived(thin(grid.xs, colW, measure));

	const tone = (v: number | undefined): Tone | undefined => (v === undefined || !sc ? undefined : sc.tone(v));
	const toneClass = (t: Tone | undefined) => (!t ? 'hm-e' : t.arm === 'zero' ? 'hm-z' : t.arm === 'warm' ? 'hm-w' : 'hm-a');

	type Pos = { r: number; c: number };
	let hover: Pos | null = $state(null);
	let kb: Pos = $state({ r: 0, c: 0 });
	let focused = $state(false);
	const active = $derived(!live ? null : (hover ?? (focused ? kb : null)));
	const isActive = (r: number, c: number) => active?.r === r && active?.c === c;

	let gridEl: HTMLDivElement | undefined = $state();

	function posOf(e: Event): Pos | null {
		const el = (e.target as HTMLElement | null)?.closest?.('[data-r]') as HTMLElement | null;
		if (!el) return null;
		return { r: Number(el.dataset.r), c: Number(el.dataset.c) };
	}

	function onPointer(e: PointerEvent) {
		if (!live) return;
		hover = posOf(e);
	}

	function onLeave(e: PointerEvent) {
		// A tap's pointerleave fires on lift; keep the tapped cell's readout.
		if (e.pointerType !== 'touch') hover = null;
	}

	function onKey(e: KeyboardEvent) {
		if (!live || !nr || !nc) return;
		let { r, c } = kb;
		if (e.key === 'ArrowRight') c++;
		else if (e.key === 'ArrowLeft') c--;
		else if (e.key === 'ArrowDown') r++;
		else if (e.key === 'ArrowUp') r--;
		else if (e.key === 'Home') c = 0;
		else if (e.key === 'End') c = nc - 1;
		else return;
		e.preventDefault();
		kb = { r: Math.max(0, Math.min(nr - 1, r)), c: Math.max(0, Math.min(nc - 1, c)) };
		hover = null;
		gridEl?.querySelectorAll('.hm-cell')[kb.r * nc + kb.c]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
	}

	const rootStyle = $derived(safeStyle(Object.entries(style ?? {}).map(([k, v]) => `${k}:${v}`).join(';')));
	const cellAt = (p: Pos) => grid.values[p.r]?.[p.c];
</script>

{#snippet seg(key: string, p: Pos, v: number)}
	<span class="hm-seg"><span class="hm-muted">{key}</span>
		<span class="hm-lbl hm-muted">{grid.ys[p.r]} · {grid.xs[p.c]}</span><span class="hm-muted">,</span>
		<span class="hm-v">{fmt(v)}</span></span
	>
{/snippet}

{#snippet swatch(t: Tone)}
	<span
		class="hm-sw {toneClass(t)}"
		style:--hm-m="{HEAT[t.step]}%"
		style:--hm-md="{HEAT_DARK[t.step]}%"
		aria-hidden="true"
	></span>
{/snippet}

<div {id} data-ripple-node={id} bind:this={rootEl} class={cn('hm', className)} style={rootStyle}>
	{#if heading}
		<div class="hm-title text-headline" title={heading}>{heading}</div>
	{/if}

	{#if !sc || !ext}
		<div class="hm-empty text-callout">No data to show</div>
	{:else}
		<div class="hm-frame" style:max-height="{maxH}px">
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				bind:this={gridEl}
				class="hm-grid"
				bind:clientWidth={gridW}
				style:grid-template-columns="fit-content(var(--hm-cap)) repeat({nc}, minmax(0, 1fr))"
				style:gap="{gap}px"
				style:--hm-h="{cellH}px"
				style:--hm-r="{radius}px"
				role={live ? 'application' : undefined}
				tabindex={live ? 0 : undefined}
				aria-label="{heading ? `${heading}, ` : ''}heatmap{live ? ', use arrow keys' : ''}"
				onpointermove={onPointer}
				onpointerdown={onPointer}
				onpointerleave={onLeave}
				onkeydown={onKey}
				onfocus={() => (focused = true)}
				onblur={() => (focused = false)}
			>
				<div class="hm-corner" style:grid-row="1" style:grid-column="1" bind:clientWidth={labelW} aria-hidden="true"></div>
				{#each xShown as l (l.i)}
					<div
						class="hm-x text-footnote"
						class:is-span={l.span > 1}
						style:grid-row="1"
						style:grid-column="{l.i + 2} / span {l.span}"
						title={grid.xs[l.i]}
						aria-hidden="true"
					>
						{grid.xs[l.i]}
					</div>
				{/each}
				{#each grid.ys as y, r (y)}
					<div class="hm-y text-footnote" style:grid-row={r + 2} style:grid-column="1" title={y} aria-hidden="true">{y}</div>
					{#each grid.xs as x, c (x)}
						{@const v = grid.values[r][c]}
						{@const t = tone(v)}
						<div
							class="hm-cell text-footnote {toneClass(t)}"
							class:is-active={isActive(r, c)}
							style:--hm-m={t ? `${HEAT[t.step]}%` : undefined}
							style:--hm-md={t ? `${HEAT_DARK[t.step]}%` : undefined}
							data-r={r}
							data-c={c}
							data-value={v}
							aria-hidden="true"
						>
							{#if showValues && v !== undefined}{fmt(v)}{/if}
						</div>
					{/each}
				{/each}
			</div>
		</div>

		<div class="hm-legend text-footnote" class:has-mark={sc.mode === 'div'} aria-hidden="true">
			<span class="hm-fig">{sc.low}</span>
			<span class="hm-sws">
				{#each sc.swatches as s, i (i)}
					<span class="hm-swc">{@render swatch(s)}{#if s.mark}<span class="hm-mark">{s.mark}</span>{/if}</span>
				{/each}
			</span>
			{#if sc.high}<span class="hm-fig">{sc.high}</span>{/if}
			{#if hasEmpty}<span class="hm-nodata"><span class="hm-sw hm-e"></span>No data</span>{/if}
		</div>

		<div class="hm-readout text-callout" aria-live="polite">
			{#if active}
				{@const v = cellAt(active)}
				<span class="hm-seg"
					><span class="hm-lbl hm-muted">{grid.ys[active.r]} · {grid.xs[active.c]}</span><span class="hm-muted">:</span>
					<span class="hm-v">{v === undefined ? 'No data' : full(v)}</span></span
				>
			{:else if sc.mode === 'div'}
				{@render seg('Lowest:', ext.lo, ext.lo.v)}<span class="hm-muted hm-dot">·</span>{@render seg('Highest:', ext.hi, ext.hi.v)}
			{:else}
				{@render seg('Highest:', ext.hi, ext.hi.v)}
			{/if}
		</div>

		<table class="sr-only">
			<caption>{heading || 'Heatmap'}</caption>
			<thead>
				<tr><td></td>{#each grid.xs as x (x)}<th scope="col">{x}</th>{/each}</tr>
			</thead>
			<tbody>
				{#each grid.ys as y, r (y)}
					<tr>
						<th scope="row">{y}</th>
						{#each grid.values[r] as v, c (c)}<td>{v === undefined ? 'No data' : full(v)}</td>{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}

	{#if grid.skipped}
		<div class="hm-note text-footnote">{grid.skipped} {grid.skipped === 1 ? 'cell' : 'cells'} skipped (no row or column)</div>
	{/if}
</div>

<style>
	.hm {
		container-type: inline-size;
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
		min-width: 0;
		color: var(--ripple-surface-foreground);
	}
	.hm-title {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		overflow-wrap: anywhere;
	}
	.hm-empty {
		display: grid;
		place-items: center;
		height: 64px;
		color: var(--ripple-muted-foreground);
	}
	.hm-frame {
		overflow-x: hidden;
		overflow-y: auto;
		min-width: 0;
	}
	.hm-grid {
		--hm-cap: min(34%, 96px);
		display: grid;
		outline: none;
		border-radius: 4px;
	}
	@container (min-width: 480px) {
		.hm-grid {
			--hm-cap: min(30%, 140px);
		}
	}
	.hm-grid:focus-visible {
		box-shadow: 0 0 0 2px var(--ripple-ring);
	}
	.hm-corner,
	.hm-x {
		position: sticky;
		top: 0;
		z-index: 2;
		background: var(--ripple-surface);
	}
	.hm-x,
	.hm-y {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--ripple-muted-foreground);
		font-variant-numeric: tabular-nums;
	}
	.hm-x {
		text-align: center;
		padding-bottom: 2px;
	}
	.hm-x.is-span {
		text-align: start;
	}
	.hm-y {
		align-self: center;
		text-align: end;
		padding-right: 6px;
	}
	.hm-cell {
		height: var(--hm-h);
		min-width: 0;
		border-radius: var(--hm-r);
		display: grid;
		place-items: center;
		overflow: hidden;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
		color: var(--ripple-surface-foreground);
	}
	.hm-cell.is-active {
		outline: 2px solid var(--ripple-ring);
		outline-offset: 1px;
		position: relative;
		z-index: 1;
	}

	/* Colour classes, shared by cells and legend swatches. */
	.hm-a {
		--hm-hue: var(--ripple-accent);
	}
	.hm-w {
		--hm-hue: oklch(0.62 0.15 45);
	}
	.hm-a,
	.hm-w {
		background-color: color-mix(in oklab, var(--hm-hue) var(--hm-m), var(--ripple-surface));
	}
	:global(.dark) .hm-a,
	:global(.dark) .hm-w,
	:global([data-theme='dark']) .hm-a,
	:global([data-theme='dark']) .hm-w {
		background-color: color-mix(in oklab, var(--hm-hue) var(--hm-md), var(--ripple-surface));
		color: var(--ripple-accent-foreground);
	}
	.hm-z {
		background-color: var(--ripple-track);
	}
	.hm-e {
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--ripple-surface-foreground) 30%, transparent);
	}

	.hm-legend {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--ripple-muted-foreground);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		min-width: 0;
	}
	.hm-legend.has-mark {
		padding-bottom: 12px;
	}
	.hm-sws {
		display: inline-flex;
		gap: 2px;
	}
	.hm-swc {
		position: relative;
		display: inline-flex;
	}
	.hm-sw {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 2px;
	}
	.hm-mark {
		position: absolute;
		top: 12px;
		left: 50%;
		transform: translateX(-50%);
	}
	.hm-nodata {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-left: 6px;
	}

	.hm-readout {
		display: flex;
		align-items: baseline;
		gap: 6px;
		min-width: 0;
		height: var(--lh-callout, 16px);
		overflow: hidden;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.hm-seg {
		display: inline-flex;
		align-items: baseline;
		gap: 4px;
		min-width: 0;
	}
	.hm-lbl {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.hm-muted {
		color: var(--ripple-muted-foreground);
	}
	.hm-v {
		flex: none;
		color: var(--ripple-surface-foreground);
	}
	.hm-dot {
		flex: none;
	}
	.hm-note {
		color: var(--ripple-muted-foreground);
	}
</style>
