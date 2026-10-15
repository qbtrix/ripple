<!--
  Grid.svelte: Ripple CSS grid layout widget. Numeric `columns` are equal
  minmax(0,1fr) tracks, set through --rg-cols / --rg-gap so the stylesheet can
  reflow them: metric and stat children become bordered tiles (size containers)
  and a row of tiles drops to fewer columns once a cell would fall under 140px.
  Field atoms (control.ts FIELD, class `rfield`) become row subgrids, so the
  label, control and message of fields in one row share row lines and the
  controls line up whatever the label length. An optional onclick makes the
  grid a keyboard-operable role="button" (Enter/Space).
-->
<script lang="ts">
  import { safeStyle } from '@ripple-ui/core';
	import type { Snippet } from 'svelte';

	interface Props {
		id?: string;
		class?: string;
		style?: Record<string, string>;
		children?: Snippet;
		columns?: number | string;
		rows?: number | string;
		gap?: number | string;
		onclick?: (e?: unknown) => void;
	}

	let {
		id, class: className, style, children,
		columns = 1, rows, gap, onclick
	}: Props = $props();

	const gapScale: Record<string, string> = {
		xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px', '2xl': '32px'
	};
	const gapValue = $derived(
		gap == null
			? undefined
			: typeof gap === 'number'
				? `${gap * 4}px`
				: (gapScale[gap] ?? gap)
	);

	const combinedStyle = $derived.by(() => {
		const s: string[] = [];
		if (typeof columns === 'number') s.push(`--rg-cols:${columns}`);
		else s.push(`grid-template-columns:${columns}`);
		if (rows) {
			if (typeof rows === 'number') s.push(`grid-template-rows:repeat(${rows},1fr)`);
			else s.push(`grid-template-rows:${rows}`);
		}
		if (gapValue) s.push(`--rg-gap:${gapValue}`);
		if (style) s.push(...Object.entries(style).map(([k, v]) => `${k}:${v}`));
		return safeStyle(s.join(';'));
	});

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onclick?.(e); }
	}
	const interactive = $derived(
		onclick ? { role: 'button', tabindex: 0, onclick, onkeydown: handleKey } : {}
	);
</script>

<div {id} class="rgrid {className ?? ''}" style={combinedStyle} {...interactive}>
	{@render children?.()}
</div>

<style>
	.rgrid {
		display: grid;
		grid-template-columns: repeat(var(--rg-cols, 1), minmax(0, 1fr));
		gap: var(--rg-gap, 0px);
		min-width: 0;
	}
	/* A row of tiles keeps --rg-cols columns while each is at least 140px, then
	   reflows to fewer (the `- gap` keeps float error from dropping one early). */
	.rgrid:has(> :global([data-ripple-tile])) {
		grid-template-columns: repeat(auto-fit, minmax(max(140px, calc(100% / var(--rg-cols, 1) - var(--rg-gap, 0px))), 1fr));
	}
	/* Fields share row lines: label (bottom-aligned), control, message. Each
	   field spans three rows, so the row gap is halved (a message adds the
	   other half under itself) to keep field rows --rg-gap apart. */
	.rgrid:has(> :global(.rfield)) { row-gap: calc(var(--rg-gap, 0px) / 2); }
	.rgrid > :global(.rfield) {
		display: grid;
		grid-row: span 3;
		grid-template-rows: subgrid;
		grid-template-columns: minmax(0, 1fr);
		row-gap: 6px;
	}
	.rgrid > :global(.rfield > *) { grid-column: 1; grid-row: 2; }
	.rgrid > :global(.rfield > :is(label, [data-field-label]):first-child) { grid-row: 1; align-self: end; }
	.rgrid > :global(.rfield > :is([data-slot$='-error'], [data-slot$='-helper'])) {
		grid-row: 3;
		margin-bottom: calc(var(--rg-gap, 0px) / 2);
	}
	/* Metric and stat children read as tiles inside a grid. Each tile is a
	   size container, so the atom sizes its value from its own box. */
	.rgrid > :global([data-ripple-tile]) {
		border: 1px solid var(--ripple-border);
		border-radius: var(--ripple-radius);
		padding: 12px 14px;
		container-type: inline-size;
		min-width: 0;
	}
</style>
