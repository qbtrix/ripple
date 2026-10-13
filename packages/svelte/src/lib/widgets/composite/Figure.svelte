<!--
  widgets/composite/Figure.svelte: `figure`. Shows a curated, hand-built
  isometric figure from the FIGURES catalog (lib/figures) by id: the title, the
  live drawing, a slider per parameter, the live readouts, and numbered pins
  with a list for the labels the model chose from the figure's anchors.

  Invariants:
  - The model never sends markup: only an id, numbers, and plain-text labels.
    The figure module (code) draws the SVG; Svelte renders every label as text.
  - The figure module is lazy-loaded in the browser. The server renders the
    frame, title, caption and label list; an unknown id renders a quiet
    placeholder and loads nothing.
  - `value` is the one bound field (default `value` / `onchange`): the current
    parameter values, written when a slider moves. Nothing is seeded from props
    into $state, so a streamed card ends equal to a whole one.
  - Pins sit in percent of the stage, which has no padding, so they stay on
    their anchors at any width. Labels are capped at 10. Sliders and
    readouts lay out by the card's own width (container queries): on a phone a
    slider sits under its label and value.
  - The stage keeps the `iso` class in its own class list (mount adds it
    too), so a class re-render never drops the figure CSS scope.
  - Light or dark follows Ripple's theme (a `.dark` class or data-theme on an
    ancestor, as the site's toggle sets it), live, never prefers-color-scheme.
  - The stage element carries the mounted handle as `rippleFigure` (seek for
    captures and tests).
-->
<script module lang="ts">
	export const MAX_LABELS = 10;
	export const MAX_TEXT = 140;
</script>

<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { FIGURES, type FigureHandle, type FigureMeta, type FigureTheme } from '$lib/figures/index.js';

	interface Label {
		anchor: string;
		label?: string;
		note?: string;
	}
	interface Props {
		id?: string;
		class?: string;
		figure?: string;
		params?: Record<string, number>;
		labels?: Label[];
		caption?: string;
		value?: Record<string, number>;
		onchange?: (value: Record<string, number>) => void;
	}

	let { id, class: className, figure, params, labels, caption, value = $bindable(), onchange }: Props = $props();

	const uid = $props.id();
	const entry = $derived(typeof figure === 'string' ? FIGURES[figure] : undefined);
	let meta = $state<FigureMeta | null>(null);
	let readouts = $state<Record<string, string>>({});
	let overrides = $state<Record<string, number>>({});
	let active = $state<string | null>(null);
	let stage = $state<HTMLDivElement>();
	let handle: FigureHandle | null = null;

	const text = (v: unknown, max = MAX_TEXT) => (typeof v === 'string' ? v.slice(0, max) : '');

	/** Current value of each slider: the visitor's move, else the bound value, else the spec, else the figure's default. */
	const values = $derived.by(() => {
		const out: Record<string, number> = {};
		for (const p of meta?.params ?? []) {
			const pick = [overrides[p.key], value?.[p.key], params?.[p.key], p.value].find((v) => typeof v === 'number' && Number.isFinite(v)) as number;
			out[p.key] = Math.min(p.max, Math.max(p.min, pick));
		}
		return out;
	});

	const notes = $derived.by(() => {
		const list = Array.isArray(labels) ? labels.slice(0, MAX_LABELS) : [];
		return list
			.filter((l): l is Label => !!l && typeof l.anchor === 'string')
			.map((l, i) => {
				const anchor = meta?.anchors.find((a) => a.id === l.anchor);
				return { key: `${i}-${l.anchor}`, anchor, label: text(l.label, 60) || anchor?.label || l.anchor, note: text(l.note) };
			});
	});
	const activeNote = $derived(notes.find((n) => n.key === active));

	/** Ripple's theme, the way the site and other widgets read it: a `.dark` class (or data-theme) on an ancestor, else light. */
	function themeOf(host: HTMLElement): FigureTheme {
		const marked = host.parentElement?.closest<HTMLElement>('.dark, .light, [data-theme="dark"], [data-theme="light"]');
		return marked && (marked.classList.contains('dark') || marked.dataset.theme === 'dark') ? 'dark' : 'light';
	}

	$effect(() => {
		const current = entry;
		const host = stage;
		if (!current || !host) return;
		let cancelled = false;
		current.load().then((mod) => {
			if (cancelled) return;
			meta = mod.meta;
			handle = mod.mount(host, {
				theme: themeOf(host),
				params: untrack(() => values),
				onReadout: (r) => (readouts = r)
			});
			(host as HTMLDivElement & { rippleFigure?: FigureHandle }).rippleFigure = handle;
		});
		// A theme toggle flips a class on <html> (or an ancestor): follow it live.
		const flip = () => handle?.setTheme(themeOf(host));
		const mo = new MutationObserver(flip);
		for (let n: HTMLElement | null = host.parentElement; n; n = n.parentElement) mo.observe(n, { attributes: true, attributeFilter: ['class', 'data-theme'] });
		return () => {
			cancelled = true;
			mo.disconnect();
			handle?.destroy();
			handle = null;
		};
	});

	$effect(() => {
		const v = values;
		handle?.update(v);
	});

	onDestroy(() => handle?.destroy());

	function slide(key: string, e: Event) {
		const n = Number((e.currentTarget as HTMLInputElement).value);
		overrides = { ...overrides, [key]: n };
		const next = { ...values, [key]: n };
		value = next;
		onchange?.(next);
	}

	const fmt = (key: string, unit?: string) => {
		const v = readouts[key];
		return v === undefined ? '–' : unit ? `${v} ${unit}` : v;
	};
</script>

<figure {id} class={['ripple-figure @container m-0 flex flex-col gap-3 rounded-ripple border border-ripple-border bg-ripple-surface p-3 text-ripple-surface-foreground', className]} data-figure={figure}>
	{#if !entry}
		<div class="flex h-48 items-center justify-center rounded-ripple text-callout text-ripple-muted-foreground" data-slot="placeholder">This figure is not available.</div>
	{:else}
		<header class="flex items-baseline justify-between gap-2">
			<h3 class="m-0 text-headline font-semibold" data-slot="title">{meta?.title ?? entry.title}</h3>
		</header>
		<div class="relative overflow-hidden rounded-ripple">
			<div bind:this={stage} class={['ripple-figure-stage iso relative', !meta && 'min-h-48']} data-slot="figure-stage"></div>
			{#each notes as n, i (n.key)}
				{#if n.anchor}
					<button
						type="button"
						class={[
							'absolute inline-flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-ripple-surface bg-ripple-accent text-[10px] font-semibold text-ripple-accent-foreground shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ripple-ring',
							active === n.key && 'ring-2 ring-ripple-ring'
						]}
						style:left="{n.anchor.x}%"
						style:top="{n.anchor.y}%"
						aria-label="{i + 1}. {n.label}"
						aria-expanded={active === n.key}
						aria-controls="{uid}-note"
						data-slot="pin"
						data-anchor={n.anchor.id}
						onclick={() => (active = active === n.key ? null : n.key)}>{i + 1}</button
					>
				{/if}
			{/each}
		</div>
		{#if meta}
			<dl class="m-0 grid grid-cols-2 gap-2 @lg:grid-cols-4" data-slot="readouts">
				{#each meta.readouts as r (r.key)}
					<div class="rounded-ripple border border-ripple-border px-2 py-1">
						<dt class="text-footnote text-ripple-muted-foreground">{r.label}</dt>
						<dd class="m-0 text-callout font-semibold tabular-nums" data-slot="readout" data-key={r.key}>{fmt(r.key, r.unit)}</dd>
					</div>
				{/each}
			</dl>
			<div class="grid gap-2" data-slot="params">
				{#each meta.params as p (p.key)}
					<label class="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1 text-callout @md:grid-cols-[8rem_1fr_4.5rem]">
						<span>{p.label}</span>
						<input
							type="range"
							class="col-span-2 row-start-2 w-full accent-ripple-accent @md:col-span-1 @md:col-start-2 @md:row-start-1"
							min={p.min}
							max={p.max}
							step={p.step}
							value={values[p.key]}
							data-slot="param"
							data-key={p.key}
							oninput={(e) => slide(p.key, e)}
						/>
						<span class="col-start-2 row-start-1 text-right tabular-nums text-ripple-muted-foreground @md:col-start-3">{values[p.key]}{p.unit ? ` ${p.unit}` : ''}</span>
					</label>
				{/each}
			</div>
		{/if}
		{#if notes.length}
			<ol class="m-0 grid list-none gap-1 p-0" data-slot="labels">
				{#each notes as n, i (n.key)}
					<li>
						<button type="button" class="flex w-full items-baseline gap-2 rounded px-1 text-left text-callout hover:bg-ripple-muted" data-slot="label" onclick={() => (active = active === n.key ? null : n.key)}>
							<span class="font-semibold tabular-nums">{i + 1}.</span><span>{n.label}</span>
						</button>
					</li>
				{/each}
			</ol>
		{/if}
		{#if activeNote}
			<div id="{uid}-note" class="rounded-ripple border border-ripple-border bg-ripple-popover p-2 text-callout" aria-live="polite" data-slot="note">
				<p class="m-0 font-semibold">{activeNote.label}</p>
				{#if activeNote.note}<p class="m-0 mt-1 text-ripple-muted-foreground">{activeNote.note}</p>{/if}
			</div>
		{/if}
		{#if caption}<figcaption class="text-footnote text-ripple-muted-foreground" data-slot="caption">{text(caption, 280)}</figcaption>{/if}
	{/if}
</figure>

<style>
	.ripple-figure-stage {
		background: var(--iso-card, transparent);
	}
	.ripple-figure-stage :global(.iso-svg) {
		width: 100%;
		height: auto;
	}
	.ripple-figure-stage:global(.iso) {
		--iso-paper: var(--iso-card);
	}
</style>
