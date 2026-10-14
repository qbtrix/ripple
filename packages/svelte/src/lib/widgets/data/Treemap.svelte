<!--
  widgets/data/Treemap.svelte: "what is this whole made of, and which parts
  matter", as DOM tiles on d3's squarify layout (treemap.ts holds the sanitize,
  layout and number rules; read its header for them).

  Frame: an optional header (title left, compact total right in muted
  tabular figures), then the plot, edge to edge, `height` px (min 160). No
  chrome at root. A group gets a 20px caption strip in card colour, only when
  it is at least 64px tall. Tiles are one hue: --ripple-accent mixed into
  --ripple-surface on treemap.ts's RAMP, gaps show the card. Ink is always the
  surface ink; the value line is that ink at INK_ALPHA.

  Labels sit top-left and are whole or absent: after each layout every label
  is measured once; one that overflows its tile drops its value line, then
  hides. Never an ellipsis. `showLabels: false` hides leaf labels only.

  Zoom: a caption, or a nested tile, zooms into its top-level group; a
  top-level leaf only shows its readout (tap on touch). While zoomed a
  breadcrumb row shows (a back button instead when `showBreadcrumb` is false)
  and Escape goes up one level. Zoom resets when `data` changes. One shared
  readout follows the hovered, focused or tapped tile and stays in the plot.
  `colors` and node `color` are accepted and ignored.
-->
<script module lang="ts">
	export type Node = {
		name: string;
		value?: number;
		children?: Node[];
		color?: string;
	};
</script>

<script lang="ts">
	import { safeStyle } from '@ripple-ui/core';
	import { onMount, tick } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';
	import { safeArray } from '$lib/utils/safe-props.js';
	import { finite, num, plain } from '../data-kit/format.js';
	import { RAMP, LIFT, INK_ALPHA, sanitize, find, layout, share, labelTier, type Rect } from './treemap.js';

	interface Props {
		id?: string;
		class?: string;
		style?: Record<string, string>;
		data?: Node[];
		height?: number;
		title?: string;
		/** Show breadcrumb navigation while zoomed. */
		showBreadcrumb?: boolean;
		/** Show leaf labels. */
		showLabels?: boolean;
		tooltip?: boolean;
		/** Accepted for compatibility; the treemap draws one hue. */
		colors?: string[];
	}

	let {
		id,
		class: className,
		style,
		data: rawData = [],
		height = 320,
		title,
		showBreadcrumb = true,
		showLabels = true,
		tooltip = true
	}: Props = $props();

	const tree = $derived(sanitize(safeArray<Node>(rawData, { widget: 'treemap', key: 'data' })));
	const heading = $derived(plain(title));
	const plotH = $derived(Math.min(1200, Math.max(160, finite(height) ?? 320)));
	const styleString = $derived(
		style ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
	);

	let width = $state(0);
	let focusId = $state('');
	let active = $state<string | null>(null);
	let plotEl = $state<HTMLDivElement>();

	// A new tree starts at the root.
	let seen: unknown;
	$effect.pre(() => {
		if (tree !== seen) {
			seen = tree;
			focusId = '';
			active = null;
		}
	});

	const focusNode = $derived(focusId ? find(tree, focusId) : undefined);
	const nodes = $derived(focusNode?.children ?? tree);
	const total = $derived(nodes.reduce((s, n) => s + n.value, 0));
	// Before the first measure (SSR, first paint) lay out at a typical card width.
	const W = $derived(width || 600);
	const rects = $derived(layout(nodes, W, plotH));
	const crumbs = $derived.by(() => {
		if (!focusNode) return [];
		const parts = focusId.split('.');
		return parts.map((_, i) => {
			const cid = parts.slice(0, i + 1).join('.');
			return { id: cid, name: find(tree, cid)?.name ?? '' };
		});
	});
	const activeRect = $derived(active ? rects.find((r) => r.id === active) : undefined);

	onMount(() => {
		if (typeof ResizeObserver === 'undefined' || !plotEl) return;
		const ro = new ResizeObserver((entries) => {
			const w = entries[0]?.contentRect.width;
			if (w && Math.abs(w - width) > 0.5) width = w;
		});
		ro.observe(plotEl);
		return () => ro.disconnect();
	});

	// Whole or absent: measure every label once per layout. jsdom measures 0,
	// so there every label stays.
	$effect(() => {
		void rects;
		void showLabels;
		const el = plotEl;
		if (!el) return;
		tick().then(() => {
			for (const label of el.querySelectorAll<HTMLElement>('[data-tm-label]')) fit(label);
		});
	});

	function overflows(e: Element | null): boolean {
		return !!e && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1);
	}

	function fit(label: HTMLElement) {
		label.dataset.fit = 'full';
		const bad = () => overflows(label) || overflows(label.querySelector('.tm-name'));
		if (!bad()) return;
		if (label.querySelector('.tm-meta')) {
			label.dataset.fit = 'name';
			if (!bad()) return;
		}
		label.dataset.fit = 'none';
	}

	async function zoom(to: string) {
		focusId = to;
		active = null;
		await tick();
		plotEl?.querySelector<HTMLElement>('button')?.focus();
	}

	function up() {
		if (focusId) zoom(focusId.split('.').slice(0, -1).join('.'));
	}

	function onTile(r: Rect) {
		if (r.group) zoom(r.id);
		else if (r.depth > 1) zoom(r.top);
		else active = active === r.id ? null : r.id;
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && focusId) {
			e.preventDefault();
			up();
		}
	}

	const pct = (v: number) => `${(v / W) * 100}%`;
	const ofTotal = (r: Rect) => `${share(r.value, total)} of total`;
	function aria(r: Rect): string {
		const where = r.depth > 1 && r.parentName ? `, in ${r.parentName}` : '';
		return `${r.name}, ${num(r.value)}, ${ofTotal(r)}${where}${r.group || r.depth > 1 ? ', open group' : ''}`;
	}

	function tileStyle(r: Rect): string {
		const mix = RAMP[r.step];
		return (
			`left:${pct(r.x0)};top:${r.y0}px;width:${pct(r.x1 - r.x0)};height:${r.y1 - r.y0}px;` +
			`--tm-mix:${mix}%;--tm-lift:${mix + LIFT}%;--tm-meta:${INK_ALPHA}%`
		);
	}

	function readoutStyle(r: Rect): string {
		const x = r.x0 > W / 2 ? `right:${Math.max(0, W - r.x1)}px` : `left:${Math.max(0, r.x0)}px`;
		const y =
			plotH - r.y1 >= 72 ? `top:${r.y1 + 4}px` : r.y0 >= 72 ? `bottom:${plotH - r.y0 + 4}px` : `top:${r.y0 + 4}px`;
		return `${x};${y}`;
	}

	function zoomIn(_node: Element) {
		const still = prefersReducedMotion.current;
		return {
			duration: 200,
			easing: cubicOut,
			css: (t: number) => (still ? `opacity:${t}` : `opacity:${t};transform:scale(${0.97 + 0.03 * t})`)
		};
	}
</script>

<div
	{id}
	class={cn('tm-root w-full min-w-0 text-ripple-surface-foreground', className)}
	style={safeStyle(styleString ?? '')}
>
	{#if heading}
		<div class="tm-head">
			<h3 class="tm-title text-headline">{heading}</h3>
			{#if rects.length}
				<span class="tm-total text-callout">{num(total, { compact: true })}</span>
			{/if}
		</div>
	{/if}

	{#if !rects.length}
		<p class="tm-empty text-callout">Nothing to show yet</p>
	{:else}
		{#if focusNode}
			<nav class="tm-crumbs text-callout" aria-label="Treemap level">
				{#if showBreadcrumb}
					<button type="button" class="tm-crumb" onclick={() => zoom('')}>All</button>
					{#each crumbs as c, i (c.id)}
						<ChevronRight size={12} aria-hidden="true" class="tm-sep" />
						{#if i === crumbs.length - 1}
							<span class="tm-crumb is-current" aria-current="page">{c.name}</span>
						{:else}
							<button type="button" class="tm-crumb" onclick={() => zoom(c.id)}>{c.name}</button>
						{/if}
					{/each}
				{:else}
					<button type="button" class="tm-crumb" onclick={up}>
						<ChevronLeft size={12} aria-hidden="true" />Back
					</button>
				{/if}
			</nav>
		{/if}

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			bind:this={plotEl}
			class="tm-plot"
			style="height:{plotH}px"
			onkeydown={onKey}
			onpointerleave={() => (active = null)}
			onfocusout={(e) => {
				if (!plotEl?.contains(e.relatedTarget as HTMLElement | null)) active = null;
			}}
		>
			{#key focusId}
				<div class="tm-layer" in:zoomIn>
					{#each rects as r (r.id)}
						{@const w = r.x1 - r.x0}
						{@const h = r.y1 - r.y0}
						{#if r.group}
							{#if r.caption && w >= 48}
								<button
									type="button"
									class="tm-caption text-subheadline"
									style="left:{pct(r.x0)};top:{r.y0}px;width:{pct(r.x1 - r.x0)}"
									aria-label={aria(r)}
									onclick={() => onTile(r)}
									onpointerenter={() => (active = r.id)}
									onfocus={() => (active = r.id)}
								>
									<span data-tm-label class="tm-caption-text">{r.name} · {share(r.value, total)}</span>
								</button>
							{/if}
						{:else}
							{@const tier = showLabels ? labelTier(w, h) : 'none'}
							<button
								type="button"
								class={['tm-tile', active === r.id && 'is-active']}
								style={tileStyle(r)}
								aria-label={aria(r)}
								onclick={() => onTile(r)}
								onpointerenter={() => (active = r.id)}
								onfocus={() => (active = r.id)}
							>
								{#if tier !== 'none'}
									<span data-tm-label class="tm-label" aria-hidden="true">
										<span class="tm-name">{r.name}</span>
										{#if tier === 'full'}
											<span class="tm-meta">{num(r.value, { compact: true })} · {share(r.value, total)}</span>
										{/if}
									</span>
								{/if}
							</button>
						{/if}
					{/each}
				</div>
			{/key}

			{#if tooltip && activeRect}
				<div class="tm-readout text-callout" role="tooltip" style={readoutStyle(activeRect)}>
					<div class="tm-readout-name">{activeRect.name}</div>
					<div class="tm-readout-row"><span>{num(activeRect.value)}</span><span>{ofTotal(activeRect)}</span></div>
					{#if activeRect.parentName && activeRect.parentValue}
						<div class="tm-readout-row">
							<span>{share(activeRect.value, activeRect.parentValue)} of {activeRect.parentName}</span>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.tm-root {
		container-type: inline-size;
		--tm-inset: 6px;
	}
	@container (min-width: 560px) {
		.tm-plot {
			--tm-inset: 8px;
		}
	}
	.tm-head {
		display: flex;
		align-items: baseline;
		gap: 12px;
		margin-bottom: 10px;
	}
	.tm-title {
		flex: 1 1 auto;
		min-width: 0;
		margin: 0;
		font-weight: var(--weight-semibold, 600);
		color: var(--ripple-surface-foreground);
		overflow-wrap: break-word;
	}
	.tm-total,
	.tm-empty {
		color: var(--ripple-muted-foreground);
		font-variant-numeric: tabular-nums;
	}
	.tm-total {
		flex: none;
	}
	.tm-empty {
		margin: 0;
		padding: 8px 0;
	}

	.tm-crumbs {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px;
		margin: -4px 0 6px;
		color: var(--ripple-muted-foreground);
	}
	.tm-crumb {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		min-height: 24px;
		padding: 0 4px;
		border-radius: 4px;
		color: var(--ripple-accent-text);
		background: none;
		border: 0;
		font: inherit;
		cursor: pointer;
	}
	.tm-crumb:hover {
		text-decoration: underline;
	}
	.tm-crumb.is-current {
		color: var(--ripple-surface-foreground);
		cursor: default;
		text-decoration: none;
	}

	.tm-plot {
		position: relative;
		width: 100%;
	}
	.tm-layer {
		position: absolute;
		inset: 0;
		transform-origin: top left;
	}
	.tm-tile,
	.tm-caption {
		position: absolute;
		display: block;
		margin: 0;
		padding: 0;
		border: 0;
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition-property: left, top, width, height, background-color;
		transition-duration: 200ms;
		transition-timing-function: var(--ripple-ease-out);
	}
	.tm-tile {
		border-radius: 3px;
		background-color: color-mix(in oklab, var(--ripple-accent) var(--tm-mix), var(--ripple-surface));
		color: var(--ripple-surface-foreground);
	}
	.tm-tile:hover,
	.tm-tile:focus-visible,
	.tm-tile.is-active {
		background-color: color-mix(in oklab, var(--ripple-accent) var(--tm-lift), var(--ripple-surface));
	}
	.tm-tile:focus-visible,
	.tm-caption:focus-visible,
	.tm-crumb:focus-visible {
		outline: 2px solid var(--ripple-ring);
		outline-offset: -2px;
	}
	.tm-label {
		position: absolute;
		inset: var(--tm-inset);
		display: flex;
		flex-direction: column;
		gap: 1px;
		overflow: hidden;
		pointer-events: none;
	}
	.tm-name {
		font-size: 12px;
		line-height: 15px;
		font-weight: var(--weight-medium, 500);
		max-height: 30px;
		overflow: hidden;
		overflow-wrap: normal;
	}
	.tm-meta {
		font-size: 11px;
		line-height: 14px;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		color: color-mix(in oklab, var(--ripple-surface-foreground) var(--tm-meta), transparent);
	}
	.tm-label:global([data-fit='name']) .tm-meta {
		display: none;
	}
	[data-tm-label]:global([data-fit='none']) {
		visibility: hidden;
	}

	.tm-caption {
		height: 20px;
		padding: 0 var(--tm-inset) 0 2px;
		background: none;
		color: var(--ripple-muted-foreground);
		border-radius: 3px;
	}
	.tm-caption:hover {
		color: var(--ripple-surface-foreground);
	}
	.tm-caption-text {
		display: block;
		overflow: hidden;
		white-space: nowrap;
		line-height: 20px;
		font-variant-numeric: tabular-nums;
	}

	.tm-readout {
		position: absolute;
		z-index: 2;
		max-width: min(240px, 100%);
		padding: 6px 8px;
		border-radius: 6px;
		background: var(--ripple-popover);
		color: var(--ripple-popover-foreground);
		border: 1px solid var(--ripple-border);
		pointer-events: none;
		font-variant-numeric: tabular-nums;
	}
	.tm-readout-name {
		font-weight: var(--weight-semibold, 600);
		overflow-wrap: anywhere;
	}
	.tm-readout-row {
		display: flex;
		gap: 10px;
		justify-content: space-between;
		opacity: 0.85;
	}

	@media (prefers-reduced-motion: reduce) {
		.tm-tile,
		.tm-caption {
			transition: none;
		}
	}
</style>
