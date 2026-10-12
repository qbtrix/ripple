<!--
  widgets/composite/IsoScene.svelte: `iso-scene` (aliases `iso`, `isometric`).
  A live isometric drawing: the model writes a parts list, motions over a few
  params, readouts and numbered labels; @ripple-ui/core/iso draws it (one
  camera, four tones per color role, painter's order). No model SVG, no URLs.

  Invariants:
  - `value` is the one bound field (default `value` / `onchange`): the param
    values `{ key: number }`, written when a slider moves. Nothing is seeded
    from props into $state, so a streamed card ends equal to a whole one.
  - Static parts are drawn once per scene; only moving parts (a motion, or
    riding `on` one) are redrawn per frame, then the list is re-sorted.
  - The rAF loop runs only while on screen (IntersectionObserver), the tab is
    visible and reduced motion is off; otherwise the card holds a still frame.
  - Speeds, readouts: a number or an expression over params, resolved by the
    Ripple expression resolver (never eval), then clamped.
-->
<script module lang="ts">
	import { ISO_LIMITS, clampNum, plainText } from '@ripple-ui/core/iso';

	export interface IsoParam {
		key: string;
		label: string;
		min: number;
		max: number;
		step: number;
		unit: string;
		value: number;
	}

	/** Params: up to 6, keys are identifiers so expressions can name them. */
	export function toParams(raw: unknown): IsoParam[] {
		const out: IsoParam[] = [];
		for (const p of Array.isArray(raw) ? raw : []) {
			if (out.length >= ISO_LIMITS.params) break;
			if (!p || typeof p !== 'object') continue;
			const r = p as Record<string, unknown>;
			const key = typeof r.key === 'string' && /^[A-Za-z_]\w{0,30}$/.test(r.key) ? r.key : '';
			if (!key || out.some((q) => q.key === key)) continue;
			const min = clampNum(r.min, -1e6, 1e6, 0);
			const max = Math.max(min + 1e-6, clampNum(r.max, -1e6, 1e6, min + 100));
			const step = clampNum(r.step, 1e-6, max - min, (max - min) / 100);
			out.push({ key, label: plainText(r.label, 40) || key, min, max, step, unit: plainText(r.unit, 12), value: clampNum(r.value, min, max, min) });
		}
		return out;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { evaluateExpression, safeStyle } from '@ripple-ui/core';
	import {
		IDENTITY,
		clampSpeed,
		drawPart,
		fitScene,
		flowOffsets,
		movingParts,
		normalizeScene,
		pinPoint,
		sceneTransforms,
		sortItems,
		type IsoItem
	} from '@ripple-ui/core/iso';

	interface Props {
		id?: string;
		class?: string;
		style?: string | Record<string, string>;
		title?: string;
		caption?: string;
		scale?: number;
		params?: unknown;
		parts?: unknown;
		motions?: unknown;
		readouts?: unknown;
		labels?: unknown;
		value?: Record<string, number>;
		onchange?: (value: Record<string, number>) => void;
	}

	let { id, class: className, style, title, caption, scale, params, parts, motions, readouts, labels, value = $bindable(), onchange }: Props = $props();

	const W = 640;
	const H = 380;

	const rootStyle = $derived(
		style && typeof style === 'object'
			? safeStyle(Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';'))
			: safeStyle(typeof style === 'string' ? style : '')
	);
	const heading = $derived(plainText(title, 80));
	const note = $derived(plainText(caption, 200));
	const paramList = $derived(toParams(params));
	const scene = $derived(normalizeScene(parts, motions));

	// ── Params: slider edits over the bound value over the authored value ──
	let edits = $state<Record<string, number>>({});
	const vals = $derived(
		Object.fromEntries(paramList.map((p) => [p.key, clampNum(edits[p.key] ?? value?.[p.key], p.min, p.max, p.value)]))
	);
	function setParam(key: string, raw: string) {
		edits[key] = Number(raw);
		const next = { ...vals, [key]: Number(raw) };
		value = next;
		onchange?.(next);
	}

	/** A number, or `{expr}` / bare expression over the params. */
	function evalNum(v: unknown): number {
		if (typeof v === 'number') return v;
		if (typeof v !== 'string') return NaN;
		const expr = v.trim().replace(/^\{([\s\S]*)\}$/, '$1');
		try {
			const out = evaluateExpression(expr, { state: {}, params: vals, ...vals });
			return typeof out === 'number' ? out : Number(out);
		} catch {
			return NaN;
		}
	}

	const speeds = $derived(scene.motions.map((m) => clampSpeed(evalNum(m.speed))));
	const readoutList = $derived(
		(Array.isArray(readouts) ? readouts : []).slice(0, ISO_LIMITS.readouts).flatMap((r) => {
			if (!r || typeof r !== 'object') return [];
			const o = r as Record<string, unknown>;
			const n = evalNum(o.value);
			const digits = Math.round(clampNum(o.decimals, 0, 4, 1));
			return [{ label: plainText(o.label, 40), text: Number.isFinite(n) ? n.toFixed(digits) : '–', unit: plainText(o.unit, 12) }];
		})
	);

	// ── Projection and drawing ──
	const P = $derived.by(() => {
		const fit = fitScene(scene, W, H);
		const k = clampNum(scale, 0.4, 2.5, 1);
		return { ...fit, scale: fit.scale * k, origin: [W / 2 + (fit.origin[0] - W / 2) * k, H / 2 + (fit.origin[1] - H / 2) * k] as [number, number] };
	});
	const moving = $derived(movingParts(scene));
	const flowing = $derived(scene.parts.map((_, i) => scene.motions.some((m) => m.kind === 'flow' && m.part === i)));
	const animated = $derived(moving.some(Boolean) || flowing.some(Boolean));
	const still = $derived(scene.parts.map((p, i) => (moving[i] || flowing[i] ? null : drawPart(i, p, IDENTITY, P))));

	let time = $state(0);
	const frame = $derived.by(() => {
		const tf = sceneTransforms(scene, time, speeds);
		const dashes = flowOffsets(scene, time, speeds);
		const list: IsoItem[] = scene.parts.map((p, i) => still[i] ?? drawPart(i, p, tf[i]!, P, dashes[i]));
		return { items: sortItems(list, P), tf };
	});

	const pins = $derived.by(() => {
		const byId = new Map(scene.parts.map((p, i) => [p.id, i]));
		return (Array.isArray(labels) ? labels : []).slice(0, ISO_LIMITS.labels).flatMap((l) => {
			if (!l || typeof l !== 'object') return [];
			const o = l as Record<string, unknown>;
			const part = typeof o.part === 'string' ? byId.get(o.part) : undefined;
			const at = Array.isArray(o.at) ? ([0, 1, 2].map((k) => clampNum((o.at as unknown[])[k], -ISO_LIMITS.coord, ISO_LIMITS.coord, 0)) as [number, number, number]) : null;
			const label = plainText(o.label, 40);
			if ((part === undefined && !at) || !label) return [];
			return [{ label, note: plainText(o.note, 160), part: part ?? -1, at }];
		});
	});
	const pinXY = $derived(pins.map((p) => pinPoint(scene, frame.tf, P, p.part, p.at)));

	// ── Animation loop: on screen, visible, motion allowed ──
	let root: HTMLElement | undefined = $state();
	let onScreen = $state(false);
	let pageVisible = $state(true);
	let reduced = $state(false);
	const running = $derived(animated && onScreen && pageVisible && !reduced);

	onMount(() => {
		const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
		reduced = !!mq?.matches;
		const onMq = () => (reduced = !!mq?.matches);
		mq?.addEventListener?.('change', onMq);
		const onVis = () => (pageVisible = document.visibilityState !== 'hidden');
		document.addEventListener('visibilitychange', onVis);
		let io: IntersectionObserver | undefined;
		if (typeof IntersectionObserver === 'function' && root) {
			io = new IntersectionObserver((entries) => (onScreen = entries.some((e) => e.isIntersecting)));
			io.observe(root);
		}
		return () => {
			mq?.removeEventListener?.('change', onMq);
			document.removeEventListener('visibilitychange', onVis);
			io?.disconnect();
		};
	});

	$effect(() => {
		if (!running) return;
		let raf = 0;
		let last = performance.now();
		const tick = (now: number) => {
			time += Math.min(0.1, (now - last) / 1000);
			last = now;
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	});
</script>

<figure
	bind:this={root}
	{id}
	class={['iso-scene @container m-0 flex flex-col gap-3 text-ripple-surface-foreground', className]}
	style={rootStyle}
	data-widget="iso-scene"
	data-running={running ? 'true' : 'false'}
	aria-label={heading || 'Isometric drawing'}
>
	{#if heading}<h3 class="text-sm font-semibold" data-slot="title">{heading}</h3>{/if}
	<svg viewBox="0 0 {W} {H}" class="iso-svg" role="img" aria-label={heading || 'Isometric drawing'} data-slot="drawing">
		{#each frame.items as item (item.part)}
			<g data-role={item.role} data-part={scene.parts[item.part]?.id}>
				{#each item.shapes as s, i (i)}
					{#if s.cls === 'text'}
						<text data-cls="text" transform={s.transform} font-size={s.size} text-anchor="middle">{s.text}</text>
					{:else}
						<path data-cls={s.cls} data-band={s.band} d={s.d} stroke-width={s.width} stroke-dashoffset={s.dash} />
					{/if}
				{/each}
			</g>
		{/each}
		{#each pins as pin, i (i)}
			<g class="iso-pin" data-slot="pin" transform="translate({pinXY[i]?.[0] ?? 0} {pinXY[i]?.[1] ?? 0})">
				<circle r="8" />
				<text text-anchor="middle" dy="3.5">{i + 1}</text>
			</g>
		{/each}
	</svg>

	{#if paramList.length || readoutList.length}
		<div class="grid gap-3 @md:grid-cols-[1fr_auto]">
			{#if paramList.length}
				<div class="grid gap-2" data-slot="params">
					{#each paramList as p (p.key)}
						<label class="grid grid-cols-[minmax(6rem,auto)_1fr_auto] items-center gap-3 text-xs">
							<span class="text-ripple-muted-foreground">{p.label}</span>
							<input
								type="range"
								class="accent-[var(--ripple-accent)]"
								min={p.min}
								max={p.max}
								step={p.step}
								value={vals[p.key]}
								oninput={(e) => setParam(p.key, e.currentTarget.value)}
								data-slot="param"
							/>
							<span class="tabular-nums" data-slot="param-value">{vals[p.key]}{p.unit ? ` ${p.unit}` : ''}</span>
						</label>
					{/each}
				</div>
			{/if}
			{#if readoutList.length}
				<dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs @md:grid-cols-1" data-slot="readouts">
					{#each readoutList as r, i (i)}
						<div>
							<dt class="text-ripple-muted-foreground">{r.label}</dt>
							<dd class="m-0 text-base font-semibold tabular-nums" data-slot="readout">{r.text}{r.unit ? ` ${r.unit}` : ''}</dd>
						</div>
					{/each}
				</dl>
			{/if}
		</div>
	{/if}

	{#if pins.length}
		<ol class="m-0 grid list-none gap-1 p-0 text-xs @md:grid-cols-2" data-slot="labels">
			{#each pins as pin, i (i)}
				<li class="flex gap-2">
					<span class="iso-pin-num">{i + 1}</span>
					<span><span class="font-medium">{pin.label}</span>{#if pin.note}<span class="text-ripple-muted-foreground"> {pin.note}</span>{/if}</span>
				</li>
			{/each}
		</ol>
	{/if}
	{#if note}<figcaption class="text-xs text-ripple-muted-foreground" data-slot="caption">{note}</figcaption>{/if}
</figure>

<style>
	.iso-scene {
		--iso-ground: var(--ripple-surface, var(--card, var(--background, #fff)));
		--iso-ink: var(--ripple-surface-foreground, var(--foreground, #111));
	}
	.iso-svg {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
	}
	g[data-role] {
		--base: color-mix(in oklab, var(--iso-ground) 80%, var(--iso-ink));
		--t0: color-mix(in oklab, var(--base) 58%, black);
		--t1: color-mix(in oklab, var(--base) 80%, black);
		--t2: var(--base);
		--t3: color-mix(in oklab, var(--base) 68%, white);
		--edge: color-mix(in oklab, var(--base) 35%, var(--iso-ink));
	}
	g[data-role='metal'] {
		--base: color-mix(in oklab, var(--iso-ground) 58%, var(--iso-ink));
	}
	g[data-role='accent'] {
		--base: var(--ripple-accent, #1877f2);
	}
	g[data-role='red'] {
		--base: var(--ripple-error, #e5484d);
	}
	g[data-role='blue'] {
		--base: var(--ripple-info, #3e8ee6);
	}
	g[data-role='green'] {
		--base: var(--ripple-success, #30a46c);
	}
	g[data-role='amber'] {
		--base: var(--ripple-warning, #e0a020);
	}
	path {
		vector-effect: non-scaling-stroke;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	path[data-cls='fill'] {
		fill: var(--t1);
	}
	path[data-cls='shade'] {
		fill: var(--t1);
		stroke: var(--t1);
		stroke-width: 0.4;
	}
	path[data-cls='shade'][data-band='0'] {
		fill: var(--t0);
		stroke: var(--t0);
	}
	path[data-cls='shade'][data-band='2'] {
		fill: var(--t2);
		stroke: var(--t2);
	}
	path[data-cls='shade'][data-band='3'] {
		fill: color-mix(in oklab, var(--t2) 55%, var(--t3));
		stroke: color-mix(in oklab, var(--t2) 55%, var(--t3));
	}
	path[data-cls='top'] {
		fill: var(--t3);
		stroke: var(--t3);
		stroke-width: 0.4;
	}
	path[data-cls='crease'] {
		fill: none;
		stroke: var(--edge);
		stroke-width: 0.6;
		opacity: 0.45;
	}
	path[data-cls='edge'] {
		fill: none;
		stroke: var(--edge);
		stroke-width: 1;
	}
	path[data-cls='tube-edge'],
	path[data-cls='tube'],
	path[data-cls='tube-hi'] {
		fill: none;
		vector-effect: none;
	}
	path[data-cls='tube-edge'] {
		stroke: var(--edge);
	}
	path[data-cls='tube'] {
		stroke: var(--t1);
	}
	path[data-cls='tube-hi'] {
		stroke: var(--t3);
		opacity: 0.7;
	}
	path[data-cls='line'] {
		fill: none;
		stroke: var(--edge);
		stroke-width: 1.6;
	}
	path[data-cls='flow'] {
		fill: none;
		stroke: var(--t3);
		stroke-width: 1.6;
		stroke-dasharray: 3 9;
	}
	g[data-role] text {
		fill: var(--edge);
		font-family: ui-monospace, 'SF Mono', Menlo, monospace;
	}
	.iso-pin circle {
		fill: var(--ripple-accent, #1877f2);
		stroke: var(--iso-ground);
		stroke-width: 2;
	}
	.iso-pin text {
		fill: var(--ripple-accent-foreground, #fff);
		font-size: 10px;
		font-weight: 600;
	}
	.iso-pin-num {
		display: inline-grid;
		place-items: center;
		flex: none;
		width: 1.25rem;
		height: 1.25rem;
		border-radius: 999px;
		background: var(--ripple-accent, #1877f2);
		color: var(--ripple-accent-foreground, #fff);
		font-size: 0.65rem;
		font-weight: 600;
	}
</style>
