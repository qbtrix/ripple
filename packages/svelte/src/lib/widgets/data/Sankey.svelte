<!--
  widgets/data/Sankey.svelte: "how much started where, where did it go, and
  where did it stop", as one inline SVG of nodes and bands with HTML labels
  over it. sankey-layout.ts does all the data work (sanitize, ranks, figures,
  summary, readouts, label placement; read its header); this file paints it.

  Anatomy: optional title (text-headline, two lines then an ellipsis, full
  text in `title`), a muted summary line (`120 from Landing · most end at
  Active (70, 58%)`), the plot, a readout and, only when something was not
  drawn, a footnote. Summary and readout are one line with an ellipsis (full
  text in `title`); under 480px the footnote may wrap to two. No inner frame:
  the card is the only one.

  Layout follows the measured plot width: 480px and up runs left to right,
  each label just before its own bar; under 480px, or with `orient: "vertical"`, ranks are rows top to bottom with
  each label under its bar. The SVG uses a viewBox at the laid-out width and
  labels sit at a percent of it, so the SSR frame (laid out at 640px) never
  scrolls sideways. `height` is a max: past it the plot scrolls inside the
  card with a bottom fade, under the fixed title and summary.

  Colour, one hue from tokens only: nodes are solid --ripple-accent; bands are
  the accent at BAND% over the card (more in dark, under .dark or
  data-theme="dark"), LIT% when focused, the rest dimmed to DIM; the remainder
  stub ("35 stop here") is --ripple-track with a muted figure on a chip beside
  or under it.
  Labels are HTML on a surface chip, so ink always comes from tokens and the
  theme flips live.
  status-text.test.ts measures the band and node pairs on both themes.

  Interaction: hover, tap or keyboard focus on a node, or hover or tap on a
  band, lights its bands and sets the readout; Escape or a tap elsewhere
  clears it. Each node is one tab stop, in rank order: its label when shown,
  else a transparent hit target (at least 24px on its short side). The SVG is
  aria-hidden; a visually hidden list names every flow and remainder, and the
  live region speaks the readout. `tooltip` is accepted and ignored. The root
  forwards `id` and data-ripple-node.
-->
<script lang="ts">
	import { safeStyle } from '@ripple-ui/core';
	import { onMount } from 'svelte';
	import { cn } from '$lib/utils.js';
	import { safeArray } from '$lib/utils/safe-props.js';
	import { plain } from '../data-kit/format.js';
	import {
		BAND,
		LIT,
		DIM,
		WIDE_MIN,
		SSR_WIDTH,
		sanitize,
		stats,
		summary,
		footnote,
		layout,
		nodeReadout,
		nodeName,
		linkReadout,
		restReadout,
		parseHeight,
		parseCurve,
		full,
		guess,
		type Measure
	} from './sankey-layout.js';

	interface Props {
		id?: string;
		class?: string;
		style?: Record<string, string>;
		nodes?: Array<{ name: string }>;
		links?: Array<{ source: string; target: string; value: number }>;
		/** Max plot height in px; the plot scrolls past it. */
		height?: number | string;
		title?: string;
		/** Vertical runs top to bottom at every width; the default flips to it under 480px. */
		orient?: 'horizontal' | 'vertical';
		/** Band curve, 0 (straight) to 1 (full S). */
		curveness?: number;
		/** Accepted and ignored: the readout line replaces it. */
		tooltip?: boolean;
	}

	let { id, class: className, style, nodes = [], links = [], height, title, orient, curveness }: Props = $props();

	const g = $derived(sanitize(safeArray(nodes, { widget: 'sankey', key: 'nodes' }), safeArray(links, { widget: 'sankey', key: 'links' })));
	const st = $derived(stats(g));
	const heading = $derived(plain(title));
	const maxH = $derived(parseHeight(height));
	const curve = $derived(parseCurve(curveness));
	const said = $derived(summary(g, st));
	const note = $derived(footnote(g));

	let width = $state(0);
	let probe: HTMLSpanElement | undefined = $state();
	let fonts = $state(0);
	onMount(() => {
		const bump = () => fonts++;
		document.fonts?.ready.then(bump);
		document.fonts?.addEventListener?.('loadingdone', bump);
		return () => document.fonts?.removeEventListener?.('loadingdone', bump);
	});
	// Real text widths from a hidden probe in the label type; jsdom measures 0, so it keeps the guess.
	const measure = $derived.by((): Measure | undefined => {
		void fonts;
		const p = probe;
		if (!p) return undefined;
		return (t, bold) => {
			p.style.fontWeight = bold ? 'var(--weight-medium, 500)' : '';
			p.textContent = t;
			const w = p.getBoundingClientRect().width;
			return w > 0 ? Math.ceil(w) + 1 : guess(t, bold);
		};
	});

	const W = $derived(width > 0 ? width : SSR_WIDTH);
	const vertical = $derived(orient === 'vertical' || W < WIDE_MIN);
	const L = $derived(layout(g, st, { width: W, maxH, vertical, curve, measure }));
	const labelOf = $derived(new Map(L.labels.filter((l) => l.kind === 'node').map((l) => [l.i, l])));
	// Tab order: ranks, then plot order inside a rank.
	const tabOrder = $derived(
		L.nodes.toSorted((a, b) => (vertical ? a.y - b.y || a.x - b.x : a.x - b.x || a.y - b.y))
	);
	const pct = (x: number) => `${(x / L.W) * 100}%`;

	type Active = { node: number } | { link: number } | null;
	let active = $state<Active>(null);
	const litLinks = $derived.by(() => {
		if (!active) return null;
		const a = active;
		return new Set(g.links.flatMap((l, k) => ('link' in a ? k === a.link : l.s === a.node || l.t === a.node) ? [k] : []));
	});
	const readout = $derived(
		!active ? restReadout(g, st) : 'node' in active ? nodeReadout(g, st, active.node) : linkReadout(g, st, active.link)
	);

	const enter = (a: Active) => () => (active = a);
	const leave = (e: PointerEvent) => {
		// A tap's pointerleave fires on lift; keep the tapped readout.
		if (e.pointerType !== 'touch') active = null;
	};
	function onRootDown(e: PointerEvent) {
		if (!(e.target as Element | null)?.closest?.('[data-sk-hit]')) active = null;
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && active) {
			active = null;
			(document.activeElement as HTMLElement | null)?.blur?.();
		}
	}

	let frameEl: HTMLDivElement | undefined = $state();
	let more = $state(false);
	const checkMore = () => {
		more = !!frameEl && frameEl.scrollTop + frameEl.clientHeight < frameEl.scrollHeight - 1;
	};
	$effect(() => {
		void L.H;
		void maxH;
		queueMicrotask(checkMore);
	});

	const rootStyle = $derived(safeStyle(Object.entries(style ?? {}).map(([k, v]) => `${k}:${v}`).join(';')));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	{id}
	data-ripple-node={id}
	class={cn('sk', className)}
	style={rootStyle}
	style:--sk-band="{BAND.light}%"
	style:--sk-band-dark="{BAND.dark}%"
	style:--sk-lit="{LIT}%"
	style:--sk-dim={DIM}
	onpointerdown={onRootDown}
	onkeydown={onKey}
>
	<span class="sk-probe text-callout" aria-hidden="true" bind:this={probe}></span>
	{#if heading}
		<div class="sr-only">{heading}</div>
		<div class="sk-title text-headline" aria-hidden="true" title={heading}>{heading}</div>
	{/if}
	{#if said}
		<p class="sr-only">{said}</p>
		<p class="sk-summary text-callout" aria-hidden="true" title={said}>{said}</p>
	{/if}

	{#if !g.links.length}
		<p class="sk-empty text-callout">No flows to show</p>
	{:else}
		<div
			class="sk-frame"
			class:has-more={more}
			bind:this={frameEl}
			bind:clientWidth={width}
			style:max-height="{maxH}px"
			onscroll={checkMore}
		>
			<div class="sk-plot" style:height="{L.H}px">
				<svg class="sk-svg" aria-hidden="true" viewBox="0 0 {L.W} {L.H}" preserveAspectRatio="none" width="100%" height={L.H}>
					{#each L.links as b (b.k)}
						<path
							class="sk-band"
							class:is-lit={litLinks?.has(b.k)}
							class:is-dim={litLinks && !litLinks.has(b.k)}
							d={b.d}
							data-sk-hit
							onpointerenter={enter({ link: b.k })}
							onpointerdown={enter({ link: b.k })}
							onpointerleave={leave}
						/>
					{/each}
					{#each L.stubs as s (s.i)}
						<path class="sk-stub" d={s.d} />
					{/each}
					{#each L.nodes as nd (nd.i)}
						<rect class="sk-node" x={nd.x} y={nd.y} width={nd.w} height={nd.h} rx="2" />
					{/each}
				</svg>

				{#each tabOrder as nd (nd.i)}
					{@const lb = labelOf.get(nd.i)}
					{@const hw = Math.max(24, nd.w)}
					{@const hh = Math.max(24, nd.h)}
					{@const hit = {
						left: pct(Math.min(L.W - hw, Math.max(0, nd.x + nd.w / 2 - hw / 2))),
						top: `${Math.min(L.H - hh, Math.max(0, nd.y + nd.h / 2 - hh / 2))}px`,
						width: `${hw}px`,
						height: `${hh}px`
					}}
					{#if lb?.lines}
						<div
							class="sk-hit"
							data-sk-hit
							aria-hidden="true"
							style:left={hit.left}
							style:top={hit.top}
							style:width={hit.width}
							style:height={hit.height}
							onpointerenter={enter({ node: nd.i })}
							onpointerdown={enter({ node: nd.i })}
							onpointerleave={leave}
						></div>
						<button
							type="button"
							class="sk-label sk-chip text-callout"
							class:is-end={lb.align === 'end'}
							class:is-one={lb.lines === 1}
							data-sk-hit
							aria-label={nodeName(g, st, nd.i)}
							title={g.nodes[nd.i].name}
							style:left={pct(lb.x)}
							style:top="{lb.y}px"
							style:width="{lb.w}px"
							onpointerenter={enter({ node: nd.i })}
							onpointerdown={enter({ node: nd.i })}
							onpointerleave={leave}
							onfocus={enter({ node: nd.i })}
							onblur={() => (active = null)}
						>
							{#if lb.text}
								<span class="sk-name" aria-hidden="true" title={g.nodes[nd.i].name}>{lb.text}</span>
							{/if}
							<span class="sk-fig" aria-hidden="true">{lb.fig}</span>
						</button>
					{:else}
						<button
							type="button"
							class="sk-hit"
							data-sk-hit
							aria-label={nodeName(g, st, nd.i)}
							title={g.nodes[nd.i].name}
							style:left={hit.left}
							style:top={hit.top}
							style:width={hit.width}
							style:height={hit.height}
							onpointerenter={enter({ node: nd.i })}
							onpointerdown={enter({ node: nd.i })}
							onpointerleave={leave}
							onfocus={enter({ node: nd.i })}
							onblur={() => (active = null)}
						></button>
					{/if}
				{/each}

				{#each L.labels as lb (lb.key)}
					{#if lb.kind === 'stub' && lb.lines}
						<span
							class="sk-stop sk-chip text-callout"
							class:is-end={lb.align === 'end'}
							aria-hidden="true"
							style:left={pct(lb.x)}
							style:top="{lb.y}px"
							style:width="{lb.w}px">{lb.text}</span
						>
					{/if}
				{/each}
			</div>
		</div>

		<div class="sr-only" aria-live="polite">{readout}</div>
		<p class="sk-readout text-callout" aria-hidden="true" title={readout}>{readout}</p>

		<ul class="sr-only">
			{#each g.links as l, k (k)}
				<li>{g.nodes[l.s].name} to {g.nodes[l.t].name}, {full(l.value)}</li>
			{/each}
			{#each g.nodes as nd, i (i)}
				{#if st.rem[i]}<li>{full(st.rem[i])} stop at {nd.name}</li>{/if}
			{/each}
		</ul>
	{/if}

	{#if note}
		<p class="sr-only">{note}</p>
		<p class="sk-note text-footnote" aria-hidden="true" title={note}>{note}</p>
	{/if}
</div>

<style>
	.sk {
		position: relative;
		container-type: inline-size;
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 100%;
		min-width: 0;
		color: var(--ripple-surface-foreground);
	}
	.sk-probe {
		position: absolute;
		top: 0;
		left: 0;
		visibility: hidden;
		white-space: pre;
		font-variant-numeric: tabular-nums;
		pointer-events: none;
	}
	.sk-title {
		font-weight: var(--weight-semibold, 600);
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
		overflow-wrap: anywhere;
	}
	.sk-summary,
	.sk-readout,
	.sk-note,
	.sk-empty {
		margin: 0;
		min-width: 0;
		color: var(--ripple-muted-foreground);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	/* A phone card gives the footnote two lines; summary and readout stay one, full text in `title`. */
	@container (max-width: 479px) {
		.sk-note {
			white-space: normal;
			display: -webkit-box;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 2;
			line-clamp: 2;
		}
	}
	.sk-readout {
		color: var(--ripple-surface-foreground);
	}
	.sk-empty {
		display: flex;
		align-items: center;
		min-height: 64px;
	}

	.sk-frame {
		position: relative;
		min-width: 0;
		overflow-x: hidden;
		overflow-y: auto;
		overscroll-behavior: contain;
		margin-top: 4px;
	}
	.sk-frame.has-more {
		mask-image: linear-gradient(to bottom, #000 calc(100% - 24px), transparent);
	}
	.sk-plot {
		position: relative;
		width: 100%;
	}
	.sk-svg {
		display: block;
		overflow: visible;
	}

	.sk-node {
		fill: var(--ripple-accent);
	}
	.sk-stub {
		fill: var(--ripple-track);
	}
	.sk-band {
		fill: color-mix(in oklab, var(--ripple-accent) var(--sk-band), transparent);
		transition:
			opacity 150ms var(--ripple-ease-out),
			fill 150ms var(--ripple-ease-out);
	}
	:global(.dark) .sk-band,
	:global([data-theme='dark']) .sk-band {
		fill: color-mix(in oklab, var(--ripple-accent) var(--sk-band-dark), transparent);
	}
	.sk-band.is-lit {
		fill: color-mix(in oklab, var(--ripple-accent) var(--sk-lit), transparent);
	}
	.sk-band.is-dim {
		opacity: var(--sk-dim);
	}
	@media (prefers-reduced-motion: reduce) {
		.sk-band {
			transition: none;
		}
	}

	.sk-hit {
		position: absolute;
		padding: 0;
		border: 0;
		background: transparent;
		border-radius: 4px;
		cursor: pointer;
	}
	.sk-chip {
		position: absolute;
		box-sizing: border-box;
		padding: 2px 6px;
		border-radius: 4px;
		background: color-mix(in oklab, var(--ripple-surface) 90%, transparent);
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.sk-label {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		border: 0;
		margin: 0;
		font: inherit;
		font-size: var(--text-callout, 12px);
		line-height: var(--lh-callout, 15px);
		text-align: left;
		color: var(--ripple-surface-foreground);
		cursor: pointer;
	}
	.sk-label.is-end {
		align-items: flex-end;
		text-align: right;
	}
	.sk-label.is-one {
		flex-direction: row;
		align-items: baseline;
		gap: 4px;
	}
	.sk-label.is-one.is-end {
		justify-content: flex-end;
	}
	.sk-name,
	.sk-fig {
		max-width: 100%;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sk-name {
		font-weight: var(--weight-medium, 500);
	}
	.is-one .sk-name {
		flex: 0 1 auto;
	}
	.is-one .sk-fig {
		flex: none;
	}
	.sk-fig,
	.sk-stop {
		color: var(--ripple-muted-foreground);
	}
	.sk-stop {
		overflow: hidden;
		text-overflow: ellipsis;
		pointer-events: none;
	}
	.sk-stop.is-end {
		text-align: right;
	}
	.sk-label:focus-visible,
	.sk-hit:focus-visible {
		outline: 2px solid var(--ripple-ring);
		outline-offset: 1px;
	}
</style>
