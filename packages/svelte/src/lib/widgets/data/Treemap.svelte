<!--
  widgets/data/Treemap.svelte: "what is this whole made of, and which parts
  matter", as DOM tiles on d3's squarify layout (treemap.ts holds the sanitize,
  layout and number rules; read its header for them).

  Frame: an optional header (title left, compact total right in muted
  tabular figures), then the plot, edge to edge, `height` px (min 160). No
  chrome at root. Only groups directly under the current root get a caption
  (zoom shows deeper ones): one 20px line in card colour, only when the group
  is at least 64px tall and wide, reading `name · share` when that fits (measured
  on a canvas at the caption font) and the share alone when it does not. Tiles
  are one hue: --ripple-accent mixed into --ripple-surface on treemap.ts's RAMP
  (RAMP_DARK under .dark or data-theme="dark"), gaps show the card. Ink is
  always the surface ink; the value line is that ink at INK_ALPHA.

  Labels sit top-left and are whole or absent. A name wraps to as many lines
  as the tile height pays for, up to four (treemap.ts `nameLines`). After each
  layout every label is measured once and steps down until it fits: name and
  `value · share`, name and share, name only, share alone, hidden. Never an
  ellipsis. Every tile whose name is not drawn (leaves at any depth, and a
  top-level group whose caption is share-only) is listed largest first on one
  muted 11px line under the plot (one too long for it is skipped), each a button with a swatch in its tile's
  tint, ending in "+N more" when the line runs out; hovering or focusing an
  entry lights its tile and readout (click acts as the tile), and the active
  tile lights its entry. `showLabels: false` hides
  leaf labels and that line.

  Zoom: a caption, or a nested tile, zooms into its top-level group, one level
  at a time; a top-level leaf only shows its readout (tap on touch). While
  zoomed a breadcrumb row shows (when `showBreadcrumb` is false: a Back button
  that goes up one level, then the current group's name and re-based total)
  and Escape goes up one level. Zoom resets when
  `data` changes. One shared readout (`value · share`, plus share of parent
  on nested tiles) follows the hovered, focused or tapped tile; it sits below
  or above the tile, else inside it under the label, and stays in the plot.
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
	import { RAMP, RAMP_DARK, LIFT, INK_ALPHA, NAME_LINE, MAX_NAME_LINES, sanitize, find, layout, share, labelTier, nameLines, fitLine, type Measure, type Rect } from './treemap.js';

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
	let fontsReady = $state(false);
	// Ids of tiles whose name survived the last fit pass; null before the first.
	let named = $state<Set<string> | null>(null);

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
	// Caption widths at the caption font, once webfonts are in (jsdom: none).
	const measure = $derived.by((): Measure | undefined => {
		if (!fontsReady || !plotEl) return undefined;
		const ctx = document.createElement('canvas').getContext('2d');
		if (!ctx) return undefined;
		ctx.font = `11px ${getComputedStyle(plotEl).fontFamily}`;
		return (t) => ctx.measureText(t).width;
	});
	// The inset mirrors the --tm-inset container query below.
	const inset = $derived(W >= 560 ? 8 : 6);
	const rects = $derived(layout(nodes, W, plotH, measure, inset, !!focusNode));
	const crumbs = $derived.by(() => {
		if (!focusNode) return [];
		const parts = focusId.split('.');
		return parts.map((_, i) => {
			const cid = parts.slice(0, i + 1).join('.');
			return { id: cid, name: find(tree, cid)?.name ?? '' };
		});
	});
	const activeRect = $derived(active ? rects.find((r) => r.id === active) : undefined);
	// Tiles whose name is not drawn, largest first; the footer names them.
	const unlabeled = $derived(
		showLabels && named
			? rects
					.filter((r) => (r.group ? r.caption && !r.captionLabel.startsWith(r.name) : !named!.has(r.id)))
					.sort((a, b) => b.value - a.value)
			: []
	);
	// The ones that fit one line, largest first, then "+N more". jsdom measures nothing: all of them.
	const footer = $derived.by(() => {
		const widths = unlabeled.map((r) => 12 + (measure ? measure(`${r.name} ${share(r.value, total)}`) : 0));
		const items = measure ? fitLine(widths, 12, W - 2, (k) => measure(`+${k} more`)).map((i) => unlabeled[i]) : unlabeled;
		return { items, more: unlabeled.length - items.length };
	});
	const backTo = $derived(focusId.includes('.') ? (find(tree, focusId.split('.').slice(0, -1).join('.'))?.name ?? 'All') : 'All');

	onMount(() => {
		document.fonts?.ready.then(() => (fontsReady = true));
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
		// After the DOM update and once webfonts are in, so widths are final.
		Promise.all([tick(), document.fonts?.ready]).then(() => {
			const ok = new Set<string>();
			for (const label of el.querySelectorAll<HTMLElement>('[data-tm-label]')) {
				fit(label);
				const id = label.closest<HTMLElement>('[data-tm-id]')?.dataset.tmId;
				if (id && ['full', 'share', 'name'].includes(label.dataset.fit!)) ok.add(id);
			}
			named = ok;
		});
	});

	function overflows(e: Element | null): boolean {
		return !!e && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1);
	}

	/**
	 * Steps down until the label fits: name and `value · share`, name and share,
	 * name only, share alone, hidden. (Stacking value over share never fits
	 * where share alone does not, so it is not a step.)
	 */
	function fit(label: HTMLElement) {
		const bad = () =>
			overflows(label) ||
			(label.dataset.fit !== 'pct' && overflows(label.querySelector('[data-tm-name]'))) ||
			overflows(label.querySelector('[data-tm-meta]'));
		const steps = label.dataset.tier === 'full' ? ['full', 'share', 'name', 'pct'] : ['name', 'pct'];
		for (const f of steps) {
			label.dataset.fit = f;
			if (!bad()) return;
		}
		label.dataset.fit = 'none';
	}

	async function zoom(to: string) {
		focusId = to;
		active = null;
		await tick();
		plotEl?.querySelector<HTMLElement>('button')?.focus();
		// Moving focus is not a request for a readout; it would cover the first label.
		active = null;
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

	// The tile's tint in both themes; swatches in the footer reuse it.
	const tint = (r: Rect) => `--tm-mix:${RAMP[r.step]}%;--tm-mix-d:${RAMP_DARK[r.step]}%;--tm-lift:${RAMP[r.step] + LIFT}%;--tm-lift-d:${RAMP_DARK[r.step] + LIFT}%`;

	function tileStyle(r: Rect): string {
		return `left:${pct(r.x0)};top:${r.y0}px;width:${pct(r.x1 - r.x0)};height:${r.y1 - r.y0}px;${tint(r)};--tm-meta:${INK_ALPHA}%`;
	}

	// Below the tile, else above it, else inside it under its own label.
	function readoutStyle(r: Rect): string {
		const x = r.x0 > W / 2 ? `right:${Math.max(0, W - r.x1)}px` : `left:${Math.max(0, r.x0)}px`;
		if (plotH - r.y1 >= 72) return `${x};top:${r.y1 + 4}px`;
		if (r.y0 >= 72) return `${x};bottom:${plotH - r.y0 + 4}px`;
		const label = [...(plotEl?.querySelectorAll<HTMLElement>('[data-tm-id]') ?? [])]
			.find((t) => t.dataset.tmId === String(r.id))
			?.querySelector<HTMLElement>("[data-tm-label]:not([data-fit='none'])");
		const under = r.y0 + (label ? label.offsetTop + label.offsetHeight : 0) + 4;
		return `${x};top:${Math.max(0, Math.min(under, plotH - 72))}px`;
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
					<button type="button" class="tm-crumb" aria-label="Back to {backTo}" onclick={up}>
						<ChevronLeft size={12} aria-hidden="true" />Back
					</button>
					<span class="tm-scope">{focusNode.name} · {num(total, { compact: true })}</span>
				{/if}
			</nav>
		{/if}

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			bind:this={plotEl}
			class="tm-plot"
			style:height="{plotH}px"
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
							{#if r.caption}
								<button
									type="button"
									class={['tm-caption', active === r.id && 'is-active']}
									style:left={pct(r.x0)}
									style:top="{r.y0}px"
									style:width={pct(r.x1 - r.x0)}
									style:height="{r.captionH}px"
									aria-label={aria(r)}
									onclick={() => onTile(r)}
									onpointerenter={() => (active = r.id)}
									onfocus={() => (active = r.id)}
								>
									<span data-tm-label class="tm-caption-text" aria-hidden="true">{r.captionLabel}</span>
								</button>
							{/if}
						{:else}
							{@const tier = showLabels ? labelTier(w, h) : 'none'}
							{@const lines = tier === 'full' ? nameLines(h, inset) : Math.max(1, Math.floor((h - 2 * inset) / NAME_LINE))}
							<button
								type="button"
								class={['tm-tile', active === r.id && 'is-active']}
								style={safeStyle(tileStyle(r))}
								data-tm-id={r.id}
								aria-label={aria(r)}
								onclick={() => onTile(r)}
								onpointerenter={() => (active = r.id)}
								onfocus={() => (active = r.id)}
							>
								{#if tier !== 'none'}
									<span data-tm-label class="tm-label" aria-hidden="true" data-tier={tier} data-fit={tier}>
										<span class="tm-name" data-tm-name style:max-height="{Math.min(MAX_NAME_LINES, lines) * NAME_LINE}px">{r.name}</span>
										<span class="tm-meta" data-tm-meta
											><span class="tm-v">{num(r.value, { compact: true })}</span><span class="tm-v">{' · '}</span><span
												>{share(r.value, total)}</span
											></span
										>
									</span>
								{/if}
							</button>
						{/if}
					{/each}
				</div>
			{/key}

			{#if tooltip && activeRect}
				<div class="tm-readout text-callout" role="tooltip" style={safeStyle(readoutStyle(activeRect))}>
					<div class="tm-readout-name">{activeRect.name}</div>
					<div class="tm-readout-row">{num(activeRect.value)} · {ofTotal(activeRect)}</div>
					{#if activeRect.parentName && activeRect.parentValue}
						<div class="tm-readout-row">{share(activeRect.value, activeRect.parentValue)} of {activeRect.parentName}</div>
					{/if}
				</div>
			{/if}
		</div>

		{#if footer.items.length || footer.more}
			<p class="tm-more">
				{#each footer.items as r (r.id)}
					<button
						type="button"
						class={['tm-more-item', active === r.id && 'is-active']}
						style={safeStyle(tint(r))}
						onclick={() => onTile(r)}
						onpointerenter={() => (active = r.id)}
						onpointerleave={() => (active = null)}
						onfocus={() => (active = r.id)}
						onblur={() => (active = null)}
						><i class="tm-swatch" aria-hidden="true"></i>{r.name} <span class="tm-more-share">{share(r.value, total)}</span></button
					>
				{/each}
				{#if footer.more}<span>+{footer.more} more</span>{/if}
			</p>
		{/if}
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
	.tm-scope {
		margin-left: 4px;
		font-variant-numeric: tabular-nums;
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
		/* Colour only: a moving box would be measured mid-flight by fit(). */
		transition-property: background-color, color;
		transition-duration: 160ms;
		transition-timing-function: var(--ripple-ease-out);
	}
	.tm-tile {
		border-radius: 3px;
		color: var(--ripple-surface-foreground);
	}
	.tm-tile,
	.tm-swatch {
		background-color: color-mix(in oklab, var(--ripple-accent) var(--tm-mix), var(--ripple-surface));
	}
	.tm-tile:hover,
	.tm-tile:focus-visible,
	.tm-tile.is-active {
		background-color: color-mix(in oklab, var(--ripple-accent) var(--tm-lift), var(--ripple-surface));
	}
	/* Dark: a higher floor so the smallest step still separates from the card. */
	:global(.dark) .tm-tile,
	:global(.dark) .tm-swatch,
	:global([data-theme='dark']) .tm-tile,
	:global([data-theme='dark']) .tm-swatch {
		background-color: color-mix(in oklab, var(--ripple-accent) var(--tm-mix-d), var(--ripple-surface));
	}
	:global(.dark) .tm-tile:is(:hover, :focus-visible, .is-active),
	:global([data-theme='dark']) .tm-tile:is(:hover, :focus-visible, .is-active) {
		background-color: color-mix(in oklab, var(--ripple-accent) var(--tm-lift-d), var(--ripple-surface));
	}
	.tm-tile:focus-visible,
	.tm-caption:focus-visible,
	.tm-crumb:focus-visible,
	.tm-more-item:focus-visible {
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
		/* max-height is set per tile (nameLines); a longer name overflows and fit() hides the label. */
		flex: none;
		overflow: hidden;
		overflow-wrap: normal;
	}
	.tm-meta {
		font-size: 11px;
		line-height: 14px;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		overflow: hidden;
		color: color-mix(in oklab, var(--ripple-surface-foreground) var(--tm-meta), transparent);
	}
	/* Fit steps (see fit()); hidden parts take no room, so overflow checks skip them. */
	[data-tm-label]:global([data-fit='name']) [data-tm-meta],
	[data-tm-label]:global([data-fit='pct']) [data-tm-name],
	[data-tm-label]:global(:is([data-fit='share'], [data-fit='pct'])) .tm-v {
		display: none;
	}
	[data-tm-label]:global([data-fit='none']) {
		visibility: hidden;
	}

	.tm-caption {
		font-size: 11px;
		padding: 0 var(--tm-inset) 0 2px;
		background: none;
		color: var(--ripple-muted-foreground);
		border-radius: 3px;
	}
	.tm-caption:hover,
	.tm-caption.is-active {
		color: var(--ripple-surface-foreground);
	}
	.tm-caption-text {
		display: block;
		overflow: hidden;
		white-space: nowrap;
		line-height: 20px;
		font-variant-numeric: tabular-nums;
	}

	/* One line of whole items at the caption font (the footer derived measures 11px);
	   a wrapped row is clipped as a guard only. */
	.tm-more {
		display: flex;
		flex-wrap: wrap;
		column-gap: 12px;
		margin: 6px 0 0;
		font-size: 11px;
		line-height: 18px;
		max-height: 18px;
		overflow: hidden;
		color: var(--ripple-muted-foreground);
	}
	.tm-more > * {
		white-space: nowrap;
	}
	.tm-more-item {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: 3px;
		background: none;
		font: inherit;
		color: inherit;
		cursor: pointer;
		transition: color 160ms var(--ripple-ease-out);
	}
	.tm-more-item:hover,
	.tm-more-item.is-active {
		color: var(--ripple-surface-foreground);
	}
	.tm-swatch {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 2px;
	}
	.tm-more-share {
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
		opacity: 0.85;
	}

	@media (prefers-reduced-motion: reduce) {
		.tm-tile,
		.tm-caption,
		.tm-more-item {
			transition: none;
		}
	}
</style>
