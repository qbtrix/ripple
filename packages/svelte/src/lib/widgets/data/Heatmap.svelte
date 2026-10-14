<!--
  widgets/data/Heatmap.svelte: a matrix of values drawn as a CSS grid of DOM
  cells. heatmap-scale.ts does the data work (sanitize, axis order, colour
  classes, label thinning and placement, number format); this file lays it out
  and handles the readout.

  Anatomy: optional title (two lines, then an ellipsis; full text in `title`), a sticky x label row above
  the grid, y labels in a capped left column (container query: 34% up to 96px
  under 480px, 30% up to 140px above; ellipsis, full text in `title`), the
  cells, a one-line legend (low figure, stepped swatches, high figure, "No
  data" when a position is empty), a readout (one line; diverging data under
  480px gets two fixed lines, lowest then highest, at rest and on hover; labels
  over 6 characters ellipsize longest first, figures never; aria-hidden, a
  visually hidden live line speaks it whole) and, when entries had no row or
  column, a footnote.
  X labels thin to every Nth column and sit centred on their own column. Y
  labels sit in their own row track (rows are fixed `grid-auto-rows`, so a
  label taller than its row overflows evenly instead of stretching it) and
  thin to every Nth row once rows are shorter than a label line.

  Size: the column width is measured (grid width minus the label column), cell
  height follows it (heatmap-scale `cellHeight`), then shrinks toward a floor
  so the rows fit `height` (`fitHeight`). In-cell values hold rows at 28px, so
  when that floor would overflow `height` the values drop and rows shrink
  instead (`valueRowsFit`). Past the 12px floor the body scrolls under the
  sticky label row, its height snapped to whole rows, with a "Rows a to b of n"
  line while rows are hidden. Never scrolls sideways.

  Colour: in light, --ripple-accent (warm oklch arm below zero) mixed into
  --ripple-surface at HEAT. Under .dark / data-theme="dark" (the switch Treemap
  uses) the hue goes over whatever the card paints at HEAT_DARK alpha, the
  accent's lightness capped at 0.59 so a light host accent still carries white
  ink, and the warm arm takes a cleaner dark literal. Zero is a thin
  --ripple-track wash (half in light, a third in dark), always quieter than
  step 1; no data is an outlined empty cell. `colorRange` is ignored.
  status-text.test.ts measures every pair and the ramp order.

  Interaction: hover, tap or keyboard focus sets the readout and rings the
  cell. The grid is one tab stop (ring on its frame); arrows rove, Home/End
  jump within a row. Cells are aria-hidden; a visually hidden table carries
  every value. `tooltip: false` drops the hover readout, keeps the peak line.
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
		minus,
		maxHeight,
		cellHeight,
		fitHeight,
		gapFor,
		thin,
		rowStep,
		valuesFit,
		valueRowsFit,
		fixed2,
		LINE,
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
	let headH = $state(0);
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
	const fx = $derived(fixed2(grid));
	const showValues = $derived(valuesFit(grid, colW, showLabels, measure) && valueRowsFit(nr, gap, maxH - headH - gap));
	const cellH = $derived(fitHeight(cellHeight(colW, showValues), showValues, nr, gap, maxH - headH - gap));
	const pitch = $derived(cellH + gap);
	const radius = $derived(Math.min(4, 0.25 * Math.min(colW || 4, cellH)));
	const xShown = $derived(thin(grid.xs, colW, measure, labelW + gap));
	const yStep = $derived(colW > 0 ? rowStep(cellH, gap) : 1);
	// Whole rows that fit under the label row; past that the frame snaps to them and scrolls.
	const fitRows = $derived(Math.max(1, Math.floor((maxH - headH) / pitch)));
	const clipped = $derived(colW > 0 && fitRows < nr);
	const frameH = $derived(clipped ? headH + fitRows * pitch : maxH);
	// A row label taller than its row spills below the last row; pad so it stays inside the frame.
	const padB = $derived(Math.max(0, (LINE - cellH) / 2));

	const tone = (v: number | undefined): Tone | undefined => (v === undefined || !sc ? undefined : sc.tone(v));
	const toneClass = (t: Tone | undefined) => (!t ? 'hm-e' : t.arm === 'zero' ? 'hm-z' : t.arm === 'warm' ? 'hm-w' : 'hm-a');

	type Pos = { r: number; c: number };
	let hover: Pos | null = $state(null);
	let kb: Pos = $state({ r: 0, c: 0 });
	let focused = $state(false);
	let scrollTop = $state(0);
	const scrolled = $derived(scrollTop > 0);
	const firstRow = $derived(clipped ? Math.min(nr - fitRows, Math.round(scrollTop / pitch)) + 1 : 1);
	const lastRow = $derived(clipped ? firstRow + fitRows - 1 : nr);
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
	// The spoken readout: whole labels and full figures; the visible line may ellipsize.
	const said = (p: Pos) => `${grid.ys[p.r]} · ${grid.xs[p.c]}`;
	const spoken = $derived.by(() => {
		if (!ext || !sc) return '';
		if (active) {
			const v = cellAt(active);
			return `${said(active)}: ${v === undefined ? 'No data' : full(v)}`;
		}
		const hi = `Highest: ${said(ext.hi)}, ${full(ext.hi.v)}`;
		return sc.mode === 'div' ? `Lowest: ${said(ext.lo)}, ${full(ext.lo.v)}. ${hi}` : hi;
	});
</script>

<!-- Labels over 6 characters ellipsize, the longer one first (shrink weight grows with length). -->
{#snippet lbl(t: string)}
	<span class="hm-lbl hm-muted" class:hm-long={t.length > 6} style:flex-shrink={t.length > 6 ? t.length : 0}>{t}</span>
{/snippet}

{#snippet where(p: Pos)}
	{@render lbl(grid.ys[p.r])}<span class="hm-key hm-muted">{' · '}</span>{@render lbl(grid.xs[p.c])}
{/snippet}

{#snippet seg(key: string, p: Pos, v: number)}
	<span class="hm-seg"><span class="hm-muted hm-key">{key}{' '}</span>{@render where(p)}<span class="hm-v"><span class="hm-muted">,</span> {fmt(v, fx)}</span></span>
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
		<div
			class="hm-frame"
			class:is-scrolled={scrolled}
			style:max-height="{frameH}px"
			style:scroll-padding-top="{headH}px"
			onscroll={(e) => (scrollTop = e.currentTarget.scrollTop)}
		>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				bind:this={gridEl}
				class="hm-grid"
				bind:clientWidth={gridW}
				style:grid-template-columns="fit-content(var(--hm-cap)) repeat({nc}, minmax(0, 1fr))"
				style:gap="{gap}px"
				style:--hm-h="{cellH}px"
				style:--hm-r="{radius}px"
				style:padding-bottom="{padB}px"
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
				<div class="hm-head" style:grid-row="1" style:grid-column="1 / -1" bind:clientHeight={headH} aria-hidden="true"></div>
				<div class="hm-corner" style:grid-row="1" style:grid-column="1" bind:clientWidth={labelW} aria-hidden="true"></div>
				{#each xShown as l (l.i)}
					<div class="hm-x text-footnote" style:grid-row="1" style:grid-column={l.i + 2} title={grid.xs[l.i]} aria-hidden="true">
						<span class="hm-xt" style:width={l.w ? `${l.w}px` : undefined} style:margin-left={l.w ? `${l.dx}px` : undefined}>{grid.xs[l.i]}</span>
					</div>
				{/each}
				{#each grid.ys as y, r (y)}
					{#if r % yStep === 0}
						<div class="hm-y text-footnote" style:grid-row={r + 2} style:grid-column="1" title={y} aria-hidden="true">
							{y}
						</div>
					{/if}
					{#each grid.xs as x, c (x)}
						{@const v = grid.values[r][c]}
						{@const t = tone(v)}
						<div
							class="hm-cell text-footnote {toneClass(t)}"
							class:is-active={isActive(r, c)}
							style:grid-row={r + 2}
							style:grid-column={c + 2}
							style:--hm-m={t ? `${HEAT[t.step]}%` : undefined}
							style:--hm-md={t ? `${HEAT_DARK[t.step]}%` : undefined}
							data-r={r}
							data-c={c}
							data-value={v}
							aria-hidden="true"
						>
							{#if showValues && v !== undefined}{fmt(v, fx)}{/if}
						</div>
					{/each}
				{/each}
			</div>
		</div>

		{#if clipped}
			<div class="hm-more text-footnote">Rows {firstRow} to {lastRow} of {nr}{lastRow < nr ? ', scroll for more' : ''}</div>
		{/if}

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

		<div class="sr-only" aria-live="polite">{spoken}</div>
		<div class="hm-readout text-callout" class:is-div={sc.mode === 'div'} aria-hidden="true">
			{#if active}
				{@const v = cellAt(active)}
				<span class="hm-seg">{@render where(active)}<span class="hm-v"><span class="hm-muted">:</span> {v === undefined ? 'No data' : minus(full(v))}</span></span>
			{:else if sc.mode === 'div'}
				{@render seg('Lowest:', ext.lo, ext.lo.v)}<span class="hm-muted hm-dot">·</span>{@render seg('Highest:', ext.hi, ext.hi.v)}
			{:else}
				{@render seg('Highest:', ext.hi, ext.hi.v)}
			{/if}
		</div>

		<div class="sr-only">
		<table>
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
		</div>
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
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
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
		border-radius: 4px;
	}
	/* The ring sits on the frame: the frame's overflow would clip a ring on the grid. */
	.hm-frame:has(> .hm-grid:focus-visible) {
		outline: 2px solid var(--ripple-ring);
		outline-offset: 2px;
	}
	.hm-more {
		color: var(--ripple-muted-foreground);
		margin-top: -4px;
	}
	.hm-grid {
		--hm-cap: min(34%, 96px);
		display: grid;
		grid-template-rows: auto;
		grid-auto-rows: var(--hm-h);
		outline: none;
		border-radius: 4px;
	}
	@container (min-width: 480px) {
		.hm-grid {
			--hm-cap: min(30%, 140px);
		}
	}
	.hm-head,
	.hm-x {
		position: sticky;
		top: 0;
		z-index: 2;
	}
	.hm-head {
		z-index: 1;
	}
	/* Opaque only while rows scroll under the labels, so at rest they sit on whatever the card paints. */
	.is-scrolled .hm-head {
		background: var(--ripple-surface);
	}
	/* Proportional figures, so the canvas measure in heatmap-scale `thin` matches. */
	.hm-xt,
	.hm-y {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--ripple-muted-foreground);
	}
	/* The label box is placed by heatmap-scale `thin`; it may reach past its column. */
	.hm-x {
		min-width: 0;
		padding-bottom: 2px;
	}
	.hm-xt {
		display: block;
		text-align: center;
	}
	/* Centred on its own row; a label taller than the row overflows it evenly. */
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
	:global([data-theme='dark']) .hm-a {
		--hm-hue: oklch(from var(--ripple-accent) min(l, 0.59) c h);
	}
	:global(.dark) .hm-w,
	:global([data-theme='dark']) .hm-w {
		--hm-hue: oklch(0.6 0.17 45);
	}
	/* Dark: the hue at HEAT_DARK alpha over whatever the card paints, the same ground the zero wash sits on. */
	:global(.dark) .hm-a,
	:global(.dark) .hm-w,
	:global([data-theme='dark']) .hm-a,
	:global([data-theme='dark']) .hm-w {
		background-color: color-mix(in oklab, var(--hm-hue) var(--hm-md), transparent);
		color: var(--ripple-accent-foreground);
	}
	.hm-z {
		background-color: color-mix(in oklab, var(--ripple-track) 50%, transparent);
	}
	:global(.dark) .hm-z,
	:global([data-theme='dark']) .hm-z {
		background-color: color-mix(in oklab, var(--ripple-track) 33%, transparent);
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

	/* One line at rest and on hover: labels ellipsize, keys, figures and dots never shrink. */
	.hm-readout {
		display: flex;
		align-items: baseline;
		column-gap: 6px;
		min-width: 0;
		height: var(--lh-callout, 15px);
		overflow: hidden;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.hm-seg {
		display: flex;
		align-items: baseline;
		flex: 0 1 auto;
		min-width: 0;
	}
	.hm-lbl {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.hm-lbl.hm-long {
		min-width: 6ch;
	}
	/* Narrow diverging readout: lowest and highest each get a line, reserved at rest and on hover. */
	@container (max-width: 479px) {
		.hm-readout.is-div {
			flex-wrap: wrap;
			height: calc(2 * var(--lh-callout, 15px));
		}
		.hm-readout.is-div > .hm-seg {
			flex-basis: 100%;
		}
		.hm-readout.is-div > .hm-dot {
			display: none;
		}
	}
	.hm-key,
	.hm-v {
		flex: none;
		white-space: pre;
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
