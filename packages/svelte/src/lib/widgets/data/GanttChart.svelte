<!--
  widgets/data/GanttChart.svelte: the `gantt` widget. A read-only schedule
  card: what happens when, how far along each task is, what waits on what.
  Native render, no chart library: rows are a CSS grid, bars are positioned
  in percent of the date range, so the whole range always fits the card and
  nothing scrolls sideways. All parsing, range and tick logic lives in
  gantt-scale.ts (pure, unit tested); this file only lays it out.

  Layout switches on the widget's own width (container query, 480px):
  - wide: name column + track, grid and today hairline over the track
    column, a muted percent (or dates) label just past each bar (the range
    stretches right until every one fits), and 1px
    elbow connectors drawn as ONE path (shared trunks never double in ink):
    down from the predecessor's end corner, along the row gap, down a clear
    column, along the gap above the successor, then into its start;
  - narrow: name and meta on one line, the meta wrapping under the name
    rather than cutting it, an optional "After X" line, then the track.
    Grid lines sit inside each track strip (16px minimum spacing); today is
    one faint accent band through all rows, so no line crosses text.
  The tick unit steps up from `viewMode` until labels fit (gantt-scale.ts),
  so the measured track width feeds the scale; unmeasured (SSR, jsdom) it
  assumes a 640px card. `height` is a maximum: the card is as tall as its
  rows and scrolls vertically under a sticky summary and scale beyond it.
  The Today label is centred on its line with a short cap down to the rows;
  only a tick label it overlaps gives way.
  Colours are --ripple-* tokens only; bars are a 40% accent tint laid on the
  surface (opaque, so grid lines stay behind it) with a 1px accent edge, and
  the done part is a solid accent fill clipped to the bar's radius.
  The root forwards `id` and data-ripple-node for the visual editor.
-->
<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import { safeStyle } from '@ripple-ui/core';
	import { cn } from '$lib/utils.js';
	import { safeArray, uniqueKeys } from '$lib/utils/safe-props.js';
	import {
		afterText,
		day,
		frac,
		labelPx,
		overallPercent,
		parseTasks,
		percentText,
		placeToday,
		rangeOf,
		rowDates,
		rowLabel,
		scaleOf,
		spanText,
		type GanttRow,
		type ViewMode
	} from './gantt-scale.js';

	type Task = {
		id: string;
		name: string;
		/** ISO date YYYY-MM-DD or full ISO datetime. */
		start: string;
		end: string;
		/** Percent complete 0-100 (a "60%" string is read too). */
		progress?: number | string;
		/** Comma-separated ids of the tasks this one waits on. */
		dependencies?: string;
	};

	interface Props {
		id?: string;
		class?: string;
		style?: Record<string, string>;
		tasks?: Task[];
		viewMode?: ViewMode;
		/** Maximum height; the rows scroll inside it. */
		height?: string | number;
		onclick?: (task: Task) => void;
	}

	let {
		id,
		class: className,
		style,
		tasks = [],
		viewMode = 'Day',
		height = '320px',
		onclick
	}: Props = $props();

	const DAY = 86_400_000;
	const TODAY = Math.floor(Date.now() / DAY) * DAY;

	const rows = $derived(parseTasks(safeArray(tasks, { widget: 'gantt', key: 'tasks' })));
	const keys = $derived(uniqueKeys(rows, (r, i) => r.id || `row-${i}`));
	const base = $derived(rangeOf(rows));
	const percent = $derived(overallPercent(rows));
	const summary = $derived(
		[
			base && spanText(base.start, base.end),
			`${rows.length} ${rows.length === 1 ? 'task' : 'tasks'}`,
			percent !== undefined && `${percent}% done`
		]
			.filter(Boolean)
			.join(' · ')
	);

	let rootEl = $state<HTMLDivElement | null>(null);
	let axisEl = $state<HTMLDivElement | null>(null);
	let scrollEl = $state<HTMLDivElement | null>(null);
	let overflowing = $state(false);
	let rootW = $state(640);
	let axisW = $state(0);

	$effect(() => {
		if (!rootEl || typeof ResizeObserver === 'undefined') return;
		const measure = () => {
			if (rootEl?.clientWidth) rootW = rootEl.clientWidth;
			if (axisEl?.clientWidth) axisW = axisEl.clientWidth;
			overflowing = !!scrollEl && scrollEl.scrollHeight > scrollEl.clientHeight + 1;
		};
		const ro = new ResizeObserver(measure);
		ro.observe(rootEl);
		if (axisEl) ro.observe(axisEl);
		if (scrollEl) ro.observe(scrollEl);
		measure();
		return () => ro.disconnect();
	});

	const narrow = $derived(rootW < 480);
	const width = $derived(axisW || (narrow ? rootW : rootW - Math.min(rootW * 0.36, 220) - 12));

	// Wide rows carry a muted label just past each bar: "60%", "Done", or the
	// dates when there is no progress.
	const endText = (r: GanttRow) =>
		r.start === undefined || r.end === undefined
			? ''
			: r.progress !== undefined
				? percentText(r.progress)
				: r.milestone
					? day(r.start)
					: rowDates(r.start, r.end);
	const endGap = (r: GanttRow) => (r.milestone ? 12 : 6);

	// The drawn range. Wide stretches its right end until every end label fits
	// after its bar, so a label never has to sit before a bar (where the
	// incoming connector arrives).
	const range = $derived.by(() => {
		if (!base || narrow) return base;
		let max = base.max;
		for (const r of rows) {
			if (r.start === undefined || r.end === undefined) continue;
			const room = width - endGap(r) - labelPx(endText(r)) - 6; // 6px slack: labelPx is an estimate
			if (room > 0) max = Math.max(max, base.min + ((r.milestone ? r.start : r.end) - base.min) * (width / room));
		}
		return { ...base, max };
	});
	const rowH = $derived(rows.length > 12 ? 28 : 32);
	const scale = $derived(
		range ? scaleOf(range, viewMode, width, narrow ? { minGap: 64, maxLabels: 4, minLine: 16 } : {}) : undefined
	);

	// Today shows only inside the data's own range, not the label stretch.
	const today = $derived(range && base && TODAY >= base.min && TODAY <= base.max ? frac(TODAY, range) : undefined);
	// Tick labels give way to the Today label.
	const axis = $derived(
		today === undefined
			? { labels: scale?.labels ?? [], align: 'center' as const }
			: placeToday(scale?.labels ?? [], today, width)
	);

	const pos = (t: number) => (range ? frac(t, range) * 100 : 0);

	// px each wide row's bar and end label cover, so connectors keep clear of both.
	const ends = $derived.by(() =>
		rows.map((r) => {
			if (narrow || !range || r.start === undefined || r.end === undefined) return undefined;
			const text = endText(r);
			const a = frac(r.start, range) * width - (r.milestone ? 6 : 0);
			const b = r.milestone ? a + 6 : Math.max(frac(r.end, range) * width, a + 4);
			const to = b + endGap(r) + labelPx(text);
			return to <= width + 0.5 ? { text, from: a, to } : undefined;
		})
	);

	// Elbow connectors in px over the track, wide layout only, as one path:
	// down from the predecessor's end corner to the row gap, along it to a
	// column no row in between covers, down to the gap beside the successor,
	// along it to just before the successor, then into its start. Marks are
	// [left, right] px per row, bar plus end label.
	const links = $derived.by(() => {
		if (!range || narrow) return { line: '', head: '' };
		const px = (t: number) => frac(t, range) * width;
		const crisp = (v: number) => Math.round(v) + 0.5;
		const marks = rows.map((r, j): [number, number] =>
			r.start === undefined || r.end === undefined
				? [0, 64]
				: ends[j]
					? [ends[j]!.from, ends[j]!.to]
					: r.milestone
						? [px(r.start) - 7, px(r.start) + 7]
						: [px(r.start), Math.max(px(r.end), px(r.start) + 4)]
		);
		let line = '';
		let head = '';
		rows.forEach((r, i) => {
			if (r.start === undefined) return;
			for (const d of r.deps) {
				const p = rows[d];
				if (p.start === undefined || p.end === undefined) continue;
				const down = i > d;
				const pa = px(p.start);
				const x1 = crisp(p.milestone ? pa : Math.max(pa + 2, Math.max(px(p.end), pa + 4) - 4));
				const y1 = d * rowH + rowH / 2 + (down ? 7 : -7);
				const g1 = (down ? d + 1 : d) * rowH - 0.5;
				const g2 = (down ? i : i + 1) * rowH - 0.5;
				const x2 = Math.round(r.milestone ? px(r.start) - 7 : px(r.start));
				const xs = crisp(x2 - 8);
				const y2 = i * rowH + rowH / 2;
				const between = rows.map((_, j) => j).filter((j) => j > Math.min(d, i) && j < Math.max(d, i));
				// The drop column: xs if clear, else the clear edge of a row in
				// between that keeps the elbow shortest.
				const clear = (x: number) => x >= 1 && x <= width - 1 && between.every((j) => x < marks[j][0] - 6 || x > marks[j][1] + 6);
				const cost = (x: number) => Math.abs(x - x1) + Math.abs(x - xs);
				const xc =
					[xs, ...between.flatMap((j) => [crisp(marks[j][0] - 8), crisp(marks[j][1] + 8)])]
						.filter(clear)
						.sort((p, q) => cost(p) - cost(q))[0] ?? 1.5;
				line += `M${x1} ${y1}V${g1}H${xc}V${g2}H${xs}V${y2}H${x2 - 1}`;
				head += `M${x2} ${y2}l-4 -3v6z`;
			}
		});
		return { line, head };
	});

	function meta(r: GanttRow): string {
		if (r.start === undefined || r.end === undefined) return percentText(r.progress);
		return [rowDates(r.start, r.end), percentText(r.progress)].filter(Boolean).join(' · ');
	}

	const maxH = $derived(/^\d+(\.\d+)?$/.test(String(height).trim()) ? `${String(height).trim()}px` : String(height || '320px'));
	const rootStyle = $derived(
		safeStyle([`max-height: ${maxH}`, ...Object.entries(style ?? {}).map(([k, v]) => `${k}:${v}`)].join(';'))
	);
</script>

{#snippet content(r: GanttRow, i: number)}
	{@const after = afterText(r, rows)}
	{@const m = meta(r)}
	<span class="g-label">
		<span class={['g-name text-body', r.untitled && 'g-untitled']} title={r.name}>{r.name}</span>
		{#if m}<span class="g-meta text-callout">{m}</span>{/if}
	</span>
	{#if after}<span class="g-after text-callout">{after}</span>{/if}
	<span class="g-track">
		{#if narrow}
			{#each scale?.lines ?? [] as l (l.x)}
				<span class={['g-line', !l.major && 'g-line--minor']} style="left: {l.x * 100}%"></span>
			{/each}
		{/if}
		{#if r.start === undefined || r.end === undefined}
			<span class="g-chip text-callout">No dates</span>
		{:else if r.milestone}
			<span class="g-diamond" style="left: {pos(r.start)}%"></span>
		{:else}
			{@const left = pos(r.start)}
			{@const w = pos(r.end) - left}
			<span
				class={['g-bar', r.progress !== undefined && r.progress >= 100 && 'g-bar--done']}
				style="left: min({left}%, calc(100% - 4px)); width: {w}%"
			>
				{#if r.progress !== undefined && r.progress > 0 && r.progress < 100}
					<span class="g-done" style="width: {r.progress}%"></span>
				{/if}
				{#if r.progress !== undefined && r.progress >= 100 && (w / 100) * width >= 28}
					<span class="g-check"><Check size={12} strokeWidth={3} aria-hidden="true" /></span>
				{/if}
			</span>
		{/if}
		{#if ends[i] && r.start !== undefined && r.end !== undefined}
			{@const e = ends[i]!}
			<span class="g-end" aria-hidden="true" style="left: calc({pos(r.end)}% + {endGap(r)}px)">{e.text}</span>
		{/if}
	</span>
{/snippet}

<div {id} data-ripple-node={id} bind:this={rootEl} class={cn('gantt', className)} style={rootStyle}>
	{#if rows.length === 0}
		<p class="g-empty text-callout">No tasks to show</p>
	{:else}
		<div class="g-head" class:g-gutter={overflowing}>
			<p class="g-summary text-callout">{summary}</p>
			<div class="g-scale" aria-hidden="true">
				<span class="g-pad"></span>
				<div class="g-axis" bind:this={axisEl}>
					{#each axis.labels as l (l.x)}
						<span class={['g-tick', l.end && 'g-tick--end']} style="left: {l.x * 100}%">{l.text}</span>
					{/each}
					{#if today !== undefined}
						<span class="g-tick g-tick--today g-today--{axis.align}" style="left: {today * 100}%">Today</span>
						<span class="g-today-cap" style="left: {today * 100}%"></span>
					{/if}
				</div>
			</div>
		</div>
		<div class="g-scroll" class:g-gutter={overflowing} bind:this={scrollEl}>
			<div class="g-body" role="list" style="--row-h: {rowH}px">
				<div class="g-grid" aria-hidden="true">
					{#if !narrow}
						{#each scale?.lines ?? [] as l (l.x)}
							<span class={['g-line', !l.major && 'g-line--minor']} style="left: {l.x * 100}%"></span>
						{/each}
					{/if}
					{#if today !== undefined}
						<span class={['g-today', narrow && 'g-today--band']} style="left: {today * 100}%"></span>
					{/if}
					{#if links.line}
						<svg class="g-links" width={width} height={rows.length * rowH} viewBox="0 0 {width} {rows.length * rowH}">
							<path d={links.line} class="g-link" />
							<path d={links.head} class="g-head-arrow" />
						</svg>
					{/if}
				</div>
				{#each rows as r, i (keys[i])}
					<div class="g-item" role="listitem" aria-label={rowLabel(r, rows)}>
						{#if onclick}
							<button type="button" class="g-row g-row--button" onclick={() => onclick(r.task as Task)}>
								{@render content(r, i)}
							</button>
						{:else}
							<div class="g-row">{@render content(r, i)}</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.gantt {
		container-type: inline-size;
		display: flex;
		flex-direction: column;
		width: 100%;
		min-width: 0;
		color: var(--ripple-surface-foreground);
	}

	.g-empty {
		display: flex;
		align-items: center;
		height: 64px;
		margin: 0;
		color: var(--ripple-muted-foreground);
	}

	.g-head,
	.g-scroll {
		--g-name-w: 0px;
		--g-col-gap: 0px;
	}

	/* Only the rows scroll; the summary and scale stay put above them. */
	.g-scroll {
		flex: 1 1 auto;
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.g-head {
		flex: none;
	}

	/* While the rows scroll, the head reserves the same scrollbar gutter so ticks line up. */
	.g-gutter {
		scrollbar-gutter: stable;
	}

	.g-head.g-gutter {
		overflow-y: hidden;
	}

	.g-summary {
		margin: 0 0 6px;
		color: var(--ripple-muted-foreground);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.g-scale {
		display: grid;
		grid-template-columns: var(--g-name-w) minmax(0, 1fr);
		column-gap: var(--g-col-gap);
		height: 20px;
		border-bottom: 1px solid var(--ripple-border);
	}

	.g-axis {
		position: relative;
		overflow: hidden;
	}

	.g-tick {
		position: absolute;
		top: 2px;
		padding-left: 3px;
		font-size: 11px;
		line-height: 14px;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
		color: var(--ripple-muted-foreground);
	}

	.g-tick--end {
		padding: 0 3px 0 0;
		transform: translateX(-100%);
	}

	.g-tick--today {
		padding: 0;
		font-weight: 500;
		color: var(--ripple-accent-text);
	}

	.g-today--center {
		transform: translateX(-50%);
	}

	.g-today--end {
		transform: translateX(-100%);
	}

	.g-today-cap {
		position: absolute;
		top: 16px;
		bottom: 0;
		width: 1px;
		background: var(--ripple-accent-text);
	}

	.g-body {
		position: relative;
		margin: 0;
		padding: 0;
	}

	.g-grid {
		position: absolute;
		inset: 0 0 0 calc(var(--g-name-w) + var(--g-col-gap));
		pointer-events: none;
	}

	.g-line,
	.g-today {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--ripple-border);
	}

	.g-line--minor {
		background: color-mix(in oklab, var(--ripple-border) 50%, transparent);
	}

	.g-today {
		background: var(--ripple-accent-text);
	}

	.g-today--band {
		width: 4px;
		transform: translateX(-50%);
		background: color-mix(in oklab, var(--ripple-accent) 14%, transparent);
	}

	.g-links {
		position: absolute;
		top: 0;
		left: 0;
		overflow: visible;
	}

	.g-link {
		fill: none;
		stroke: var(--ripple-control-border);
		stroke-width: 1;
	}

	.g-head-arrow {
		fill: var(--ripple-control-border);
	}

	.g-item {
		position: relative;
		border-bottom: 1px solid var(--ripple-border);
	}

	.g-item:last-child {
		border-bottom: 0;
	}

	/* Narrow: name line, then the bar. */
	.g-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		row-gap: 5px;
		width: 100%;
		padding: 7px 0;
		box-sizing: border-box;
	}

	.g-row--button {
		margin: 0;
		border: 0;
		background: none;
		font: inherit;
		color: inherit;
		text-align: left;
		cursor: pointer;
		border-radius: 4px;
		transition: background-color 120ms var(--ripple-ease-out);
	}

	.g-row--button:hover {
		background: var(--ripple-track);
	}

	.g-row--button:focus-visible {
		outline: 2px solid var(--ripple-ring);
		outline-offset: -2px;
	}

	/* Name left, meta right; when both do not fit the meta wraps under the
	   name (space-between puts a lone item at the start), so the name is cut
	   only when it alone is wider than the row. */
	.g-label {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: baseline;
		column-gap: 8px;
		row-gap: 2px;
		min-width: 0;
	}

	.g-name {
		flex: 0 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.g-untitled {
		font-style: italic;
		color: var(--ripple-muted-foreground);
	}

	.g-after {
		display: block;
		min-width: 0;
		margin-top: -3px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--ripple-muted-foreground);
	}

	.g-meta {
		flex: 0 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
		color: var(--ripple-muted-foreground);
	}

	.g-track {
		position: relative;
		display: block;
		height: 12px;
	}

	.g-bar {
		position: absolute;
		top: 50%;
		height: 10px;
		min-width: 4px;
		transform: translateY(-50%);
		border-radius: 3px;
		overflow: hidden;
		background:
			linear-gradient(color-mix(in srgb, var(--ripple-accent) 40%, transparent) 0 0),
			var(--ripple-surface);
		box-shadow: inset 0 0 0 1px var(--ripple-accent);
	}

	.g-bar--done {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		background: var(--ripple-accent);
		color: var(--ripple-accent-foreground);
	}

	.g-done {
		position: absolute;
		inset: 0 auto 0 0;
		background: var(--ripple-accent);
	}

	.g-end {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		font-size: 11px;
		line-height: 14px;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
		color: var(--ripple-muted-foreground);
	}

	.g-check {
		display: inline-flex;
		margin-right: 3px;
	}

	.g-diamond {
		position: absolute;
		top: 50%;
		width: 9px;
		height: 9px;
		background: var(--ripple-accent);
		border-radius: 1px;
		transform: translate(-50%, -50%) rotate(45deg);
	}

	.g-chip {
		position: absolute;
		top: 50%;
		left: 0;
		transform: translateY(-50%);
		padding: 0 6px;
		border-radius: 9999px;
		font-size: 11px;
		line-height: 16px;
		background: var(--ripple-muted);
		color: var(--ripple-muted-foreground);
	}

	/* Wide: a name column beside the track, one fixed-height row per task. */
	@container (min-width: 480px) {
		.g-head,
		.g-scroll {
			--g-name-w: min(36cqw, 220px);
			--g-col-gap: 12px;
		}

		.g-row {
			grid-template-columns: var(--g-name-w) minmax(0, 1fr);
			column-gap: var(--g-col-gap);
			align-items: center;
			height: 100%;
			padding: 0;
		}

		.g-item {
			height: var(--row-h);
			box-sizing: border-box;
		}

		.g-after,
		.g-meta {
			display: none;
		}

		.g-track {
			height: 100%;
		}

		.g-bar {
			height: 14px;
			border-radius: 4px;
		}

		.g-diamond {
			width: 10px;
			height: 10px;
		}

	}
</style>
