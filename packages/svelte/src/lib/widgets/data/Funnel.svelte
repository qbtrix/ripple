<!--
  widgets/data/Funnel.svelte: "of everyone who started, how many reached each
  stage, and where did most of them leave", as native DOM rows (funnel-math.ts
  holds the parsing, order, rate and summary rules; read its header).

  Frame: optional title (text-headline), one muted summary line, then an <ol>
  of stages split by hairlines. No inner panel; the card is the only frame.
  Height: the widget is as tall as its content. Only a model-set `height` caps
  it; then the list scrolls under the fixed title, summary and caption, its
  height snapped to whole rows (no glyph is ever sliced), and a muted
  `+N more stages, scroll` line under it counts the rows still below.

  Layout follows the root's own width (container query at 480px):
  - wide: one grid for every row (name | bar track | count | rate of previous),
    a caption over the two number columns, and the worst step's clause on the
    summary line;
  - narrow: each stage is name + count, then a full-width bar, with the step
    rate as a connector line (`62% of previous`) between two stages. Its arrow
    points down, or up when the stage grew, so it never reads as the opposite.

  Bars share a left baseline and scale to the widest stage (3px floor above 0,
  a 2px tick at 0, nothing for `n/a`). Behind each bar the previous stage's
  length shows as an accent tint (the ghost), so the gap is the loss. One hue:
  bars are --ripple-accent; the worst step's rate is the only accent ink.
  The ghost starts 2px past the bar's end, so the bar always meets the card.
  `colors` and `tooltip` are accepted and ignored. The root forwards `id` and
  data-ripple-node for the visual editor.
-->
<script lang="ts">
	import { safeStyle } from '@ripple-ui/core';
	import { ArrowDown, ArrowUp } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';
	import { safeArray, uniqueKeys } from '$lib/utils/safe-props.js';
	import { plain } from '../data-kit/format.js';
	import { funnelRows, funnelSummary, countFormat, formatRate, rowName, parseHeight, parseSort } from './funnel-math.js';

	interface Props {
		id?: string;
		class?: string;
		style?: Record<string, string>;
		data?: Array<{ label: string; value: number }>;
		/** Max height in px; rows scroll past it. Absent: fit the content. */
		height?: number | string;
		title?: string;
		/** Accepted for compatibility; the funnel draws one hue. */
		colors?: string[];
		/** Default keeps the authored order. */
		sort?: 'descending' | 'ascending' | 'none';
		/** Accepted and ignored: every number is printed. */
		tooltip?: boolean;
	}

	let { id, class: className, style, data: rawData = [], height, title, sort }: Props = $props();

	const rows = $derived(funnelRows(safeArray(rawData, { widget: 'funnel', key: 'data' }), parseSort(sort)));
	const keys = $derived(uniqueKeys(rows, (r) => r.label));
	const count = $derived(countFormat(rows));
	const summary = $derived(funnelSummary(rows));
	const heading = $derived(plain(title));
	const maxH = $derived(parseHeight(height));
	const dense = $derived(rows.length > 10);
	const rated = $derived(rows.some((r) => r.rate !== undefined));
	// Cue line under a capped list: caption-1 line height plus its top padding.
	const CUE_H = 17;
	let topEl = $state<HTMLElement>();
	let listEl = $state<HTMLOListElement>();
	let listMax = $state<number>();
	let hidden = $state(0);

	/** Rows whose bottom sits below the visible edge of the list. */
	function countHidden(visible: number) {
		if (!listEl) return;
		const edge = listEl.scrollTop + visible + 1;
		hidden = [...listEl.children].filter((li) => {
			const el = li as HTMLElement;
			return el.offsetTop + el.offsetHeight > edge;
		}).length;
	}

	/** Snap the capped list to whole rows; no cap when everything fits. */
	function fit() {
		if (maxH === undefined || !listEl) {
			listMax = undefined;
			hidden = 0;
			return;
		}
		const bottoms = [...listEl.children].map((li) => (li as HTMLElement).offsetTop + (li as HTMLElement).offsetHeight);
		const top = topEl?.offsetHeight ?? 0;
		if (!bottoms.length || top + bottoms[bottoms.length - 1] <= maxH) {
			listMax = undefined;
			hidden = 0;
			return;
		}
		const room = maxH - top - CUE_H;
		let k = 1;
		while (k < bottoms.length && bottoms[k] <= room) k++;
		const h = bottoms[k - 1];
		listMax = h;
		countHidden(h);
	}

	$effect(() => {
		void rows;
		if (!listEl) return;
		fit();
		if (typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(() => fit());
		ro.observe(listEl.parentElement ?? listEl);
		document.fonts?.ready.then(() => fit());
		return () => ro.disconnect();
	});

	const styleString = $derived(
		style ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
	);
</script>

<div
	{id}
	data-ripple-node={id}
	class={cn('fn-root w-full min-w-0 text-ripple-surface-foreground', className)}
	style={safeStyle(styleString ?? '')}
	style:max-height={maxH === undefined ? undefined : `${maxH}px`}
>
	{#if heading || summary || rated}
		<div class="fn-top" bind:this={topEl}>
			{#if heading}
				<h3 class="fn-title text-headline">{heading}</h3>
			{/if}
			{#if summary}
				<p class="fn-summary text-callout">
					{summary.text}{#if summary.drop}<span class="fn-drop">{` · ${summary.drop}`}</span>{/if}
				</p>
			{/if}
			{#if rated}
				<div class="fn-caption text-caption-1" aria-hidden="true">
					<span class="fn-c-count">Count</span><span class="fn-c-rate">of previous</span>
				</div>
			{/if}
		</div>
	{/if}

	{#if !rows.length}
		<p class="fn-empty text-callout">No stages to show</p>
	{:else}
		<ol
			bind:this={listEl}
			class={cn('fn-list', dense && 'is-dense')}
			aria-label={heading || 'Funnel'}
			style:max-height={listMax === undefined ? undefined : `${listMax}px`}
			onscroll={() => countHidden(listEl?.clientHeight ?? 0)}
		>
			{#each rows as r, i (keys[i])}
				<li class={cn('fn-row', r.worst && 'is-worst')} aria-label={rowName(r, count)}>
					{#if r.rate !== undefined}
						<span class="fn-conn text-caption-1" aria-hidden="true">
							{#if r.rate > 1}<ArrowUp size={12} aria-hidden="true" />{:else}<ArrowDown size={12} aria-hidden="true" />{/if}{formatRate(r.rate)} of previous
						</span>
					{/if}
					<span class={cn('fn-name', r.unnamed && 'is-unnamed')} title={r.label} aria-hidden="true">{r.label}</span>
					<span class="fn-track" aria-hidden="true">
						{#if r.ghostPct !== undefined}
							<span class="fn-ghost" style:left="calc({r.pct}% + 2px)" style:width="calc({r.ghostPct - r.pct}% - 2px)"></span>
						{/if}
						{#if r.value === 0}
							<span class="fn-tick"></span>
						{:else if r.value !== undefined}
							<span class="fn-bar" style:width="{r.pct}%" style:animation-delay="{Math.min(i * 30, 300)}ms"></span>
						{/if}
					</span>
					<span class={cn('fn-count', r.value === undefined && 'is-na')} aria-hidden="true">{count(r.value)}</span>
					<span class="fn-rate" aria-hidden="true">{r.rate !== undefined ? formatRate(r.rate) : ''}</span>
				</li>
			{/each}
		</ol>
		{#if listMax !== undefined}
			<p class="fn-more text-caption-1" aria-hidden="true">
				{hidden ? `+${hidden} more ${hidden === 1 ? 'stage' : 'stages'}, scroll` : ''}
			</p>
		{/if}
	{/if}
</div>

<style>
	/* A model-set height caps the root; only the list scrolls, so nothing paints a ground. */
	.fn-root {
		container-type: inline-size;
		display: flex;
		flex-direction: column;
	}
	.fn-top {
		flex: none;
		padding-bottom: 8px;
	}
	.fn-title {
		margin: 0;
		font-weight: var(--weight-semibold, 600);
		color: var(--ripple-surface-foreground);
		overflow-wrap: break-word;
	}
	.fn-summary,
	.fn-empty {
		margin: 0;
		color: var(--ripple-muted-foreground);
		font-variant-numeric: tabular-nums;
		overflow-wrap: break-word;
	}
	.fn-drop {
		display: none;
	}
	.fn-empty {
		display: flex;
		align-items: center;
		min-height: 64px;
	}
	.fn-caption {
		display: none;
	}

	.fn-list {
		position: relative;
		flex: 0 1 auto;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--text-callout, 12px);
		line-height: var(--lh-callout, 15px);
	}

	/* Narrow: each stage is a block; the rate is a connector between two stages. */
	.fn-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.fn-more {
		flex: none;
		margin: 0;
		padding-top: 4px;
		min-height: 17px;
		color: var(--ripple-muted-foreground);
	}
	.fn-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-areas: 'conn conn' 'name count' 'track track';
		column-gap: 12px;
		align-items: baseline;
	}
	.fn-conn {
		grid-area: conn;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-bottom: 2px;
		color: var(--ripple-muted-foreground);
		font-variant-numeric: tabular-nums;
	}
	.fn-name {
		grid-area: name;
		min-width: 0;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
		overflow-wrap: anywhere;
		color: var(--ripple-surface-foreground);
	}
	.fn-name.is-unnamed {
		color: var(--ripple-muted-foreground);
		font-style: italic;
	}
	.fn-count {
		grid-area: count;
		text-align: right;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
		color: var(--ripple-surface-foreground);
	}
	.fn-count.is-na {
		color: var(--ripple-muted-foreground);
	}
	.fn-track {
		grid-area: track;
		position: relative;
		height: 10px;
		margin-top: 4px;
	}
	.fn-rate {
		display: none;
	}
	.is-worst .fn-conn,
	.is-worst .fn-rate {
		color: var(--ripple-accent-text);
		font-weight: var(--weight-medium, 500);
	}

	.fn-bar,
	.fn-ghost,
	.fn-tick {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		border-radius: min(4px, calc(var(--ripple-radius, 8px) / 2));
	}
	/* The lost part: starts 2px past the bar so the bar's end meets the card,
	   not the tint. A light accent tint, so it reads as the same stage, faded.
	   On a dark card a pure tint sinks into it, so a light ink wash lifts it. */
	.fn-ghost {
		background: color-mix(in oklab, var(--ripple-accent) 20%, var(--ripple-surface));
	}
	:global(.dark) .fn-ghost,
	:global([data-theme='dark']) .fn-ghost {
		background: color-mix(
			in oklab,
			var(--ripple-accent) 18%,
			color-mix(in oklab, var(--ripple-surface-foreground) 10%, var(--ripple-surface))
		);
	}
	.fn-bar {
		min-width: 3px;
		background: var(--ripple-accent);
		transform-origin: left center;
		transition: width 240ms var(--ripple-ease-out);
		animation: fn-grow 240ms var(--ripple-ease-out) both;
	}
	.fn-tick {
		width: 2px;
		border-radius: 1px;
		background: var(--ripple-accent);
	}
	@keyframes fn-grow {
		from {
			transform: scaleX(0);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.fn-bar {
			transition: none;
			animation: none;
		}
	}

	/* Wide: one grid, every row a subgrid, numbers in their own columns. A
	   stable gutter on both grids keeps the caption over its columns when the
	   list scrolls. */
	@container (min-width: 480px) {
		.fn-drop {
			display: inline;
		}
		.fn-caption,
		.fn-list {
			display: grid;
			grid-template-columns: minmax(0, min(34%, 200px)) minmax(0, 1fr) auto 64px;
			column-gap: 12px;
			gap: 0 12px;
			scrollbar-gutter: stable;
		}
		.fn-caption {
			overflow: hidden;
			padding-top: 4px;
			color: var(--ripple-muted-foreground);
		}
		.fn-c-count,
		.fn-c-rate {
			grid-row: 1;
			text-align: right;
			white-space: nowrap;
		}
		.fn-c-count {
			grid-column: 3;
		}
		.fn-c-rate {
			grid-column: 4;
		}
		.fn-row {
			grid-column: 1 / -1;
			grid-template-columns: subgrid;
			grid-template-areas: none;
			align-items: center;
			min-height: 36px;
			border-top: 1px solid var(--ripple-border);
		}
		.is-dense .fn-row {
			min-height: 28px;
		}
		.fn-conn {
			display: none;
		}
		.fn-name {
			grid-area: 1 / 1;
			display: block;
			white-space: nowrap;
			text-overflow: ellipsis;
		}
		.fn-track {
			grid-area: 1 / 2;
			height: 18px;
			margin: 0;
		}
		.is-dense .fn-track {
			height: 14px;
		}
		.fn-count {
			grid-area: 1 / 3;
		}
		.fn-rate {
			grid-area: 1 / 4;
			display: block;
			text-align: right;
			white-space: nowrap;
			color: var(--ripple-muted-foreground);
			font-variant-numeric: tabular-nums;
		}
	}
</style>
