<!--
  ModelViewer.svelte — the `model-viewer` widget: a GLB/GLTF model with orbit
  controls, AR and lighting, wrapping Google's `<model-viewer>` (lazy-loaded on
  first mount so the core bundle stays thin).

  A spec names a built-in model with `asset` (catalog in model-assets.ts, files
  under the asset base) or gives a raw `src`; `asset` wins when both are set.
  An unknown asset, a missing src or a failed load shows a quiet "3D model not
  available" placeholder, never an error.

  `annotations` pin numbered labels on the model as native hotspots. On an
  asset they name the asset's anchors (positions are ours, never the model's);
  raw `position` is honoured only on `src` models. A pin or its row in the list
  under the viewer opens the note, aims the camera at the point (and the
  anchor's orbit), and fires the spec's `on_select` with { anchor, label }.
  Clicking again or Esc closes it. `focus` opens one at start.

  The stage has a toned backdrop and a ground shadow (default 1), so a white
  model still reads on the light theme; dark keeps a quiet tint. A pin label
  flips to the pin's left when it would cross the viewer's right edge.

  Invariants: everything derives from props ($derived), so a streamed spec
  that grows its annotations never remounts or reloads the model. Under
  prefers-reduced-motion there is no auto-rotate and camera moves jump.
-->
<script lang="ts">
	import { safeUrl } from '@ripple-ui/core';
	import { prefersReducedMotion } from 'svelte/motion';
	import { plain } from '../data-kit/index.js';
	import { MODEL_ASSETS } from './model-assets.js';
	import { resolveModelAsset } from './model-asset-types.js';

	interface Annotation {
		anchor?: string;
		position?: string;
		normal?: string;
		label?: string;
		note?: string;
	}

	interface Props {
		id?: string;
		class?: string;
		style?: Record<string, string>;
		/** GLB / GLTF model URL. Ignored when `asset` is set. */
		src?: string;
		/** Built-in model id from the catalog. */
		asset?: string;
		/** Numbered labels on the model. */
		annotations?: Annotation[];
		/** Anchor whose note is open at start. */
		focus?: string;
		/** A spec's `on_select`: fires when a label is opened. */
		onselect?: (detail: { anchor: string; label: string }) => void;
		poster?: string;
		alt?: string;
		cameraControls?: boolean;
		autoRotate?: boolean;
		ar?: boolean;
		environmentImage?: string;
		exposure?: number;
		shadowIntensity?: number;
	}

	let {
		id,
		class: className,
		style,
		src,
		asset,
		annotations,
		focus,
		onselect,
		poster,
		alt = '3D model',
		cameraControls = true,
		autoRotate = false,
		ar = false,
		environmentImage,
		exposure,
		shadowIntensity
	}: Props = $props();

	const uid = $props.id();
	const MAX_NOTES = 12;
	const NUM = String.raw`-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?(?:m|cm|mm)?`;
	const VEC = new RegExp(String.raw`^\s*${NUM}\s+${NUM}\s+${NUM}\s*$`, 'i');
	const vec = (v: unknown) => (typeof v === 'string' && VEC.test(v) ? v.trim().split(/\s+/).join(' ') : undefined);
	/** camera-target wants units; data-position numbers are metres. */
	const metres = (v: string) => v.split(' ').map((t) => (/[a-z]$/i.test(t) ? t : `${t}m`)).join(' ');

	// Defined already (an earlier mount, or a test stub): render straight away.
	let loaded = $state(typeof customElements !== 'undefined' && !!customElements.get('model-viewer'));
	let loadFailed = $state(false);

	$effect(() => {
		if (loaded) return;
		let cancelled = false;
		import('@google/model-viewer')
			.then(() => {
				if (!cancelled) loaded = true;
			})
			.catch((err) => {
				console.error('[Ripple] Failed to load @google/model-viewer', err);
				if (!cancelled) loadFailed = true;
			});
		return () => {
			cancelled = true;
		};
	});

	const reduced = $derived(prefersReducedMotion.current);

	const model = $derived.by(() => {
		if (asset != null && asset !== '') {
			const r = resolveModelAsset(asset, MODEL_ASSETS);
			if (!r) return null;
			const url = safeUrl(r.src, { kind: 'resource' });
			return url
				? {
						src: url,
						poster: safeUrl(r.poster ?? poster, { kind: 'resource' }),
						orbit: r.asset.orbit,
						anchors: r.asset.anchors
					}
				: null;
		}
		const url = safeUrl(src, { kind: 'resource' });
		return url ? { src: url, poster: safeUrl(poster, { kind: 'resource' }), orbit: undefined, anchors: null } : null;
	});

	const notes = $derived.by(() => {
		const out: { key: string; position: string; normal: string; orbit?: string; label: string; note: string }[] = [];
		if (!model || !Array.isArray(annotations)) return out;
		const seen = new Set<string>();
		annotations.forEach((a, i) => {
			if (out.length >= MAX_NOTES || !a || typeof a !== 'object') return;
			let key: string, position: string | undefined, normal: string | undefined, orbit: string | undefined, label: string;
			if (model.anchors) {
				const anchor = model.anchors.find((x) => x.name === a.anchor);
				if (!anchor) return;
				({ name: key, position, normal, orbit, label } = anchor);
			} else {
				key = `point-${i + 1}`;
				position = a.position;
				normal = a.normal;
				label = '';
			}
			position = vec(position);
			key = key.toLowerCase().replace(/[^a-z0-9-]/g, '-');
			if (!position || seen.has(key)) return;
			seen.add(key);
			out.push({
				key,
				position,
				normal: vec(normal) ?? '0 1 0',
				orbit,
				label: plain(a.label).slice(0, 40) || label || `Point ${out.length + 1}`,
				note: plain(a.note).slice(0, 280)
			});
		});
		return out;
	});

	/** undefined until the visitor picks: follows `focus` while it streams in. */
	let picked = $state<string | null | undefined>(undefined);
	const activeKey = $derived(picked === undefined ? (typeof focus === 'string' ? focus : null) : picked);
	const active = $derived(notes.find((n) => n.key === activeKey) ?? null);
	const cameraTarget = $derived(active ? metres(active.position) : undefined);
	const cameraOrbit = $derived(active?.orbit ?? model?.orbit);

	// A failed load belongs to its src: a later (or fully streamed) src retries.
	let failedSrc = $state<string | null>(null);
	const unavailable = $derived(!model || loadFailed || failedSrc === model.src);

	function onError(e: Event) {
		const type = (e as CustomEvent<{ type?: string }>).detail?.type;
		if (type && type !== 'loadfailure') return;
		failedSrc = model?.src ?? null;
	}

	type Viewer = HTMLElement & { jumpCameraToGoal?: () => void; updateComplete?: Promise<unknown> };
	let viewer = $state<Viewer>();
	$effect(() => {
		void cameraTarget;
		void cameraOrbit;
		const el = viewer;
		if (!el || !reduced) return;
		void Promise.resolve(el.updateComplete).then(() => el.jumpCameraToGoal?.());
	});

	// A pin's label sits right of it unless that would cross the viewer's
	// right edge; then it flips left. Re-checked on every camera move.
	let flipped = $state<Record<string, boolean>>({});
	$effect(() => {
		const el = viewer;
		if (!el) return;
		let frame = 0;
		const place = () => {
			frame = 0;
			const box = el.getBoundingClientRect();
			if (!box.width) return; // not laid out (hidden, or no layout engine)
			const edge = box.right;
			const next: Record<string, boolean> = {};
			for (const pin of el.querySelectorAll<HTMLElement>('[data-slot="pin"]')) {
				const label = pin.querySelector<HTMLElement>('[data-slot="pin-label"]');
				if (label && pin.dataset.anchor) next[pin.dataset.anchor] = pin.getBoundingClientRect().right + 6 + label.offsetWidth > edge;
			}
			if (JSON.stringify(next) !== JSON.stringify(flipped)) flipped = next;
		};
		const schedule = () => (frame ||= requestAnimationFrame(place));
		el.addEventListener('camera-change', schedule);
		el.addEventListener('load', schedule);
		schedule();
		return () => {
			el.removeEventListener('camera-change', schedule);
			el.removeEventListener('load', schedule);
			if (frame) cancelAnimationFrame(frame);
		};
	});

	let figure = $state<HTMLElement>();
	let trigger: HTMLElement | null = null;

	function toggle(n: { key: string; label: string }, e: Event) {
		trigger = e.currentTarget as HTMLElement;
		if (activeKey === n.key) {
			picked = null;
			return;
		}
		picked = n.key;
		onselect?.({ anchor: n.key, label: n.label });
	}
	function close() {
		picked = null;
		if (trigger?.isConnected) trigger.focus();
	}
	function onWindowKey(e: KeyboardEvent) {
		if (e.key !== 'Escape' || !active || !figure) return;
		const focused = figure.ownerDocument.activeElement;
		if (focused && focused !== figure.ownerDocument.body && !figure.contains(focused)) return;
		e.preventDefault();
		close();
	}

	const styleString = $derived(
		style && typeof style === 'object' ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
	);
</script>

<svelte:window onkeydown={onWindowKey} />

<figure
	bind:this={figure}
	{id}
	class={['ripple-model-viewer m-0 flex min-w-0 flex-col gap-2 text-ripple-surface-foreground', className]}
	data-widget="model-viewer"
>
	<div class="relative">
		{#if unavailable}
			<div
				class="ripple-model-viewer-missing flex h-80 items-center justify-center rounded-ripple bg-ripple-muted/50 text-callout text-ripple-muted-foreground"
				style={styleString}
				data-slot="placeholder"
			>
				3D model not available
			</div>
		{:else if loaded && model}
			<model-viewer
				bind:this={viewer}
				class="ripple-model-stage block h-80 w-full rounded-ripple"
				style={styleString}
				src={safeUrl(model.src, { kind: 'resource' })}
				poster={safeUrl(model.poster, { kind: 'resource' })}
				{alt}
				camera-controls={cameraControls ? '' : undefined}
				auto-rotate={autoRotate && !reduced ? '' : undefined}
				ar={ar ? '' : undefined}
				environment-image={safeUrl(environmentImage, { kind: 'resource' })}
				exposure={exposure != null ? String(exposure) : undefined}
				shadow-intensity={String(shadowIntensity ?? 1)}
				camera-orbit={cameraOrbit}
				camera-target={cameraTarget}
				interpolation-decay={reduced ? '1' : undefined}
				onerror={onError}
			>
				{#each notes as n, i (n.key)}
					<button
						type="button"
						slot="hotspot-{n.key}"
						data-position={n.position}
						data-normal={n.normal}
						class={[
							'relative inline-flex size-6 items-center justify-center rounded-full border-2 border-ripple-surface bg-ripple-accent text-[11px] font-semibold text-ripple-accent-foreground shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ripple-ring',
							activeKey === n.key && 'ring-2 ring-ripple-ring'
						]}
						aria-label="{i + 1}. {n.label}"
						aria-expanded={activeKey === n.key}
						aria-controls="{uid}-note"
						data-slot="pin"
						data-anchor={n.key}
						onclick={(e) => toggle(n, e)}
					>
						{i + 1}
						<span
							class="pointer-events-none absolute top-1/2 {flipped[n.key] ? 'right-full mr-1.5' : 'left-full ml-1.5'} -translate-y-1/2 whitespace-nowrap rounded-full border border-ripple-border bg-ripple-surface/90 px-2 py-0.5 text-footnote font-medium text-ripple-surface-foreground shadow-sm"
							aria-hidden="true"
							data-slot="pin-label">{n.label}</span
						>
					</button>
				{/each}
			</model-viewer>
		{:else}
			<div class="ripple-model-viewer-loading flex h-80 items-center justify-center text-callout text-ripple-muted-foreground" aria-busy="true">
				Loading 3D model…
			</div>
		{/if}
		{#if active && !unavailable}
			<div
				id="{uid}-note"
				class="absolute right-2 bottom-2 left-2 z-10 max-w-xs rounded-ripple border border-ripple-border bg-ripple-popover p-3 text-ripple-surface-foreground shadow-md"
				aria-live="polite"
				data-slot="note"
			>
				<div class="flex items-start justify-between gap-2">
					<p class="m-0 text-callout font-semibold" data-slot="note-label">{active.label}</p>
					<button
						type="button"
						class="-m-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-ripple-muted-foreground hover:text-ripple-surface-foreground focus-visible:outline-2 focus-visible:outline-ripple-ring"
						aria-label="Close note"
						onclick={close}>×</button
					>
				</div>
				{#if active.note}<p class="m-0 mt-1 text-callout text-ripple-muted-foreground" data-slot="note-text">{active.note}</p>{/if}
			</div>
		{/if}
	</div>
	{#if notes.length && !unavailable}
		<ol class="m-0 flex list-none flex-col gap-1 p-0" aria-label="Labelled points" data-slot="legend">
			{#each notes as n, i (n.key)}
				<li>
					<button
						type="button"
						class={[
							'flex w-full items-center gap-2 rounded-ripple px-1.5 py-1 text-left text-callout hover:bg-ripple-muted/60 focus-visible:outline-2 focus-visible:outline-ripple-ring',
							activeKey === n.key && 'bg-ripple-muted/60'
						]}
						aria-expanded={activeKey === n.key}
						aria-controls="{uid}-note"
						data-slot="legend-item"
						onclick={(e) => toggle(n, e)}
					>
						<span class="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-ripple-accent text-[10px] font-semibold text-ripple-accent-foreground" aria-hidden="true">{i + 1}</span>
						<span>{n.label}</span>
					</button>
				</li>
			{/each}
		</ol>
	{/if}
</figure>

<style>
	/* Light: a mid tone a white model reads against. Dark: a quiet tint. */
	.ripple-model-stage {
		background: radial-gradient(
			ellipse at 50% 40%,
			color-mix(in oklab, var(--ripple-muted-foreground) 14%, var(--ripple-surface)),
			color-mix(in oklab, var(--ripple-muted-foreground) 34%, var(--ripple-surface))
		);
	}
	:global(.dark) .ripple-model-stage,
	:global([data-theme='dark']) .ripple-model-stage {
		background: color-mix(in oklab, var(--ripple-muted) 60%, transparent);
	}
</style>
