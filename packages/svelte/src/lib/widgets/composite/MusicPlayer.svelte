<!--
  widgets/composite/MusicPlayer.svelte: `music-player` (aliases `music`,
  `playlist`). A focus music player whose sound is generated in the browser
  (music-engine.ts, Web Audio): the model writes a playlist of tracks, each a
  preset id and a length; the widget owns the cover art, the visualizer, the
  transport, the progress clock and the playlist.

  Invariants:
  - `value` is the one bound field (default `value` / `onchange`):
    { index, playing, shuffle, repeat }, written on events only. A bound
    value that is not our own echo is adopted, but never starts sound:
    browsers need a user gesture, so playing comes back false.
  - The engine is created lazily on the first Play (a user gesture) and
    disposed on destroy. Without an AudioContext (SSR, jsdom) the UI still
    runs: the clock, the track changes and the bound value all work.
  - The progress clock is a deadline on Date.now(), independent of audio.
    At a track's end it goes to the next one (repeat wraps, shuffle picks).
  - Nothing is seeded from props into $state, so a streamed card ends equal
    to a whole one. `autoplay` only marks the play button; it never plays.
  - Root `data-audio` mirrors the context state and the visualizer's
    `data-level` the analyser RMS (x1000), for the browser check.
-->
<script module lang="ts">
	import { PRESETS, toPreset, type Preset } from './music-engine.js';

	export interface MusicValue {
		index: number;
		playing: boolean;
		shuffle: boolean;
		repeat: boolean;
	}

	export const MAX_TRACKS = 30;
	export const MINUTES = { min: 1, max: 60, fallback: 3 } as const;

	/** Cover gradients: a palette name to two stops. Decorative, so fixed hues. */
	export const PALETTE: Record<string, [string, string]> = {
		blue: ['#1877f2', '#62b4ff'],
		violet: ['#6d4aff', '#c08bff'],
		teal: ['#0f9d9a', '#7be0c8'],
		green: ['#2f8f46', '#a6d96a'],
		amber: ['#c7741c', '#ffd27a'],
		rose: ['#d6456f', '#ffb3c1'],
		orange: ['#e2572b', '#ffb36b'],
		slate: ['#475569', '#a8b4c4']
	};
	export const PRESET_COLOR: Record<Preset, string> = {
		rain: 'blue',
		'brown-noise': 'amber',
		'white-noise': 'slate',
		ocean: 'teal',
		forest: 'green',
		lofi: 'violet',
		drone: 'orange',
		piano: 'rose'
	};
	export const PRESET_LABEL: Record<Preset, string> = {
		rain: 'Rain',
		'brown-noise': 'Brown noise',
		'white-noise': 'White noise',
		ocean: 'Ocean',
		forest: 'Forest',
		lofi: 'Lofi',
		drone: 'Drone',
		piano: 'Piano'
	};
	export { PRESETS };
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { safeStyle } from '@ripple-ui/core';
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	import SkipBack from '@lucide/svelte/icons/skip-back';
	import SkipForward from '@lucide/svelte/icons/skip-forward';
	import Shuffle from '@lucide/svelte/icons/shuffle';
	import Repeat from '@lucide/svelte/icons/repeat';
	import Volume2 from '@lucide/svelte/icons/volume-2';
	import VolumeX from '@lucide/svelte/icons/volume-x';
	import CloudRain from '@lucide/svelte/icons/cloud-rain';
	import Waves from '@lucide/svelte/icons/waves';
	import Trees from '@lucide/svelte/icons/trees';
	import Piano from '@lucide/svelte/icons/piano';
	import AudioLines from '@lucide/svelte/icons/audio-lines';
	import Wind from '@lucide/svelte/icons/wind';
	import Radio from '@lucide/svelte/icons/radio';
	import Disc3 from '@lucide/svelte/icons/disc-3';
	import { clock, finite, plain } from '../data-kit/index.js';
	import { createEngine, type Engine } from './music-engine.js';

	interface TrackIn {
		id?: string;
		title?: string;
		artist?: string;
		sound?: string;
		minutes?: number;
		color?: string;
	}

	interface Props {
		id?: string;
		class?: string;
		style?: string | Record<string, string>;
		title?: string;
		tracks?: TrackIn[];
		/** Marks the play button; sound still waits for a user gesture. */
		autoplay?: boolean;
		/** Starting volume, 0 to 1. Default 0.7. */
		volume?: number;
		value?: MusicValue;
		onchange?: (value: MusicValue) => void;
	}

	let { id, class: className, style, title, tracks, autoplay, volume, value = $bindable(), onchange }: Props = $props();

	const uid = $props.id();
	const ICONS = { rain: CloudRain, ocean: Waves, forest: Trees, piano: Piano, drone: AudioLines, 'brown-noise': Wind, 'white-noise': Radio, lofi: Disc3 };

	const rootStyle = $derived(
		style && typeof style === 'object'
			? safeStyle(Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';'))
			: safeStyle(typeof style === 'string' ? style : '')
	);
	const heading = $derived(plain(title).slice(0, 80));

	const list = $derived(
		(Array.isArray(tracks) ? tracks : [])
			.filter((t): t is TrackIn => !!t && typeof t === 'object')
			.slice(0, MAX_TRACKS)
			.map((t, i) => {
				const sound = toPreset(t.sound);
				const mins = Math.min(Math.max(finite(t.minutes) ?? MINUTES.fallback, MINUTES.min), MINUTES.max);
				const pal = PALETTE[typeof t.color === 'string' ? t.color.toLowerCase() : ''] ?? PALETTE[PRESET_COLOR[sound]];
				return {
					key: typeof t.id === 'string' && t.id ? t.id : `t${i}`,
					title: plain(t.title).slice(0, 80) || PRESET_LABEL[sound],
					artist: plain(t.artist).slice(0, 80),
					sound,
					ms: Math.round(mins * 60_000),
					pal
				};
			})
	);

	// ── Session ─────────────────────────────────────────────────────────────
	let index = $state(0);
	let playing = $state(false);
	let shuffle = $state(false);
	let repeat = $state(false);
	let posMs = $state(0);
	let startedAt = 0;
	let baseMs = 0;
	let volEdit = $state<number | null>(null);
	let muted = $state(false);
	let audioState = $state('none');
	let engine: Engine | null = null;
	let engineTried = false;

	const idx = $derived(list.length ? Math.min(index, list.length - 1) : 0);
	const track = $derived(list[idx]);
	const vol = $derived(volEdit ?? Math.min(Math.max(finite(volume) ?? 0.7, 0), 1));

	// ── Bound value ─────────────────────────────────────────────────────────
	let lastSig = '';
	const sig = (v: unknown) => {
		try {
			return JSON.stringify(v) ?? '';
		} catch {
			return '';
		}
	};
	function emit() {
		const v: MusicValue = { index: idx, playing, shuffle, repeat };
		lastSig = sig(v);
		value = v;
		onchange?.(v);
	}
	$effect(() => {
		const v = value;
		if (v === null || typeof v !== 'object' || Array.isArray(v)) return;
		if (sig(v) === lastSig) return;
		untrack(() => {
			lastSig = sig(v);
			const r = v as unknown as Record<string, unknown>;
			const i = finite(r.index);
			if (i !== undefined && Math.trunc(i) !== idx) jump(Math.max(0, Math.trunc(i)), false);
			shuffle = r.shuffle === true;
			repeat = r.repeat === true;
		});
	});

	// ── Clock and transport ─────────────────────────────────────────────────
	const now = () => Date.now();
	function at() {
		return playing ? baseMs + now() - startedAt : baseMs;
	}
	function sound() {
		if (!track) return;
		if (!engineTried) {
			engineTried = true;
			engine = createEngine();
			engine?.setVolume(vol);
			engine?.setMuted(muted);
		}
		engine?.play(track.sound);
	}
	function play() {
		if (!track || playing) return;
		startedAt = now();
		playing = true;
		sound();
		emit();
	}
	function pause() {
		if (!playing) return;
		baseMs = at();
		posMs = baseMs;
		playing = false;
		engine?.pause();
		setTimeout(readState, 800);
		emit();
	}
	const toggle = () => (playing ? pause() : play());

	function jump(i: number, write = true) {
		if (!list.length) return;
		index = ((i % list.length) + list.length) % list.length;
		baseMs = 0;
		posMs = 0;
		startedAt = now();
		if (playing) sound();
		if (write) emit();
	}
	function pick() {
		if (list.length < 2) return idx;
		let j = idx;
		while (j === idx) j = Math.floor(Math.random() * list.length);
		return j;
	}
	function next() {
		jump(shuffle ? pick() : idx + 1);
	}
	function prev() {
		if (at() > 3000) jump(idx);
		else jump(shuffle ? pick() : idx - 1);
	}
	/** A track ran out: next, wrap on repeat, else stop at the top. */
	function ended() {
		if (shuffle) return jump(pick());
		if (idx < list.length - 1 || repeat) return jump(idx + 1);
		pause();
		jump(0);
	}
	function tick() {
		if (!playing || !track) return;
		const p = at();
		if (p >= track.ms) ended();
		else posMs = p;
	}
	$effect(() => {
		if (!playing) return;
		const t = setInterval(tick, 250);
		return () => clearInterval(t);
	});

	function seek(e: Event & { currentTarget: HTMLInputElement }) {
		baseMs = Math.min(Math.max(Number(e.currentTarget.value) * 1000, 0), track?.ms ?? 0);
		startedAt = now();
		posMs = baseMs;
	}
	function setVol(e: Event & { currentTarget: HTMLInputElement }) {
		volEdit = Math.min(Math.max(Number(e.currentTarget.value) / 100, 0), 1);
		if (volEdit > 0) muted = false;
		engine?.setVolume(volEdit);
		engine?.setMuted(muted);
	}
	function toggleMute() {
		muted = !muted;
		engine?.setMuted(muted);
	}
	function choose(i: number) {
		if (i === idx && playing) return pause();
		jump(i);
		play();
	}

	// ── Visualizer ──────────────────────────────────────────────────────────
	const BARS = 28;
	let bars = $state<number[]>(Array(BARS).fill(0));
	let level = $state(0);
	function readState() {
		audioState = engine?.state() ?? 'none';
	}
	$effect(() => {
		if (!playing) return;
		const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
		const spec = new Uint8Array(128);
		let raf = 0;
		let last = 0;
		const frame = (t: number) => {
			raf = requestAnimationFrame(frame);
			if (t - last < (reduce ? 500 : 33)) return;
			last = t;
			readState();
			if (!engine) return;
			level = engine.level();
			if (reduce) return;
			engine.spectrum(spec);
			// Log-ish bins: low end gets more bars, where the energy is.
			bars = Array.from({ length: BARS }, (_, i) => {
				const a = Math.floor((i / BARS) ** 1.6 * 100);
				const b = Math.max(a + 1, Math.floor(((i + 1) / BARS) ** 1.6 * 100));
				let m = 0;
				for (let k = a; k < b; k++) m = Math.max(m, spec[k]);
				return m / 255;
			});
		};
		raf = requestAnimationFrame(frame);
		return () => {
			cancelAnimationFrame(raf);
			bars = Array(BARS).fill(0);
			level = 0;
		};
	});
	$effect(() => () => engine?.dispose());

	// ── Keyboard ────────────────────────────────────────────────────────────
	/** The root takes focus and the keys (an action, so the group role stays). */
	function keys(node: HTMLElement) {
		node.tabIndex = 0;
		node.addEventListener('keydown', onKey);
		return { destroy: () => node.removeEventListener('keydown', onKey) };
	}
	function onKey(e: KeyboardEvent) {
		const t = e.target as HTMLElement;
		if (t.tagName === 'INPUT') return;
		if (e.key === ' ' && t.tagName !== 'BUTTON') {
			e.preventDefault();
			toggle();
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			next();
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			prev();
		}
	}

	// ── What to show ────────────────────────────────────────────────────────
	const lenS = $derived(track ? track.ms / 1000 : 0);
	const posS = $derived(Math.min(posMs / 1000, lenS));
	const grad = (p: [string, string]) => `linear-gradient(135deg, ${p[0]}, ${p[1]})`;
	const totalMin = $derived(Math.round(list.reduce((s, t) => s + t.ms, 0) / 60_000));
	const live = $derived(track ? `${playing ? 'Playing' : 'Paused'}: ${track.title}` : '');
	const autoHint = $derived((autoplay === true || (autoplay as unknown) === 'true') && !playing && posMs === 0 && !engineTried);

	const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ripple-ring';
	const iconBtn = [
		'grid size-10 place-items-center rounded-full text-ripple-surface-foreground transition-colors duration-150 hover:bg-ripple-muted motion-reduce:transition-none',
		focusRing
	];
	const toggleOn = 'text-ripple-accent bg-ripple-accent/10';
	const range = 'mp-range h-1.5 w-full min-w-0 cursor-pointer accent-ripple-accent';
</script>

<div
	{id}
	class={['@container text-ripple-surface-foreground', focusRing, 'rounded-ripple', className]}
	style={rootStyle}
	data-widget="music-player"
	data-audio={audioState}
	role="group"
	aria-label={heading || 'Music player'}
	use:keys
>
	<div class="flex flex-col gap-3">
		{#if heading}
			<header class="flex min-w-0 items-baseline justify-between gap-2">
				<h2 class="text-title-3 font-semibold text-pretty">{heading}</h2>
				<p class="text-footnote text-ripple-muted-foreground tabular-nums">
					{list.length}
					{list.length === 1 ? 'track' : 'tracks'} · {totalMin} min
				</p>
			</header>
		{/if}

		<section class="flex flex-col gap-4 rounded-ripple border border-ripple-border bg-ripple-surface p-4" aria-label="Now playing" data-slot="player" data-playing={playing}>
			<div class="grid items-center gap-4 @min-[520px]:grid-cols-[auto_minmax(0,1fr)]">
				<div
					class="relative mx-auto grid size-36 place-items-center overflow-hidden rounded-xl shadow-sm @min-[520px]:size-40"
					style:background-image={grad(track?.pal ?? PALETTE.slate)}
					data-slot="cover"
					aria-hidden="true"
				>
					<span class="mp-sheen absolute inset-0 opacity-60"></span>
					{#if track}
						{@const Icon = ICONS[track.sound]}
						<Icon size={44} strokeWidth={1.5} class="relative text-white/90 drop-shadow" />
					{/if}
				</div>

				<div class="flex min-w-0 flex-col gap-3">
					<div class="flex min-w-0 flex-col gap-0.5 text-center @min-[520px]:text-left">
						<p class="truncate text-title-3 font-semibold" data-slot="track-title">{track?.title ?? 'No tracks yet'}</p>
						<p class="truncate text-callout text-ripple-muted-foreground" data-slot="track-sub">
							{track ? [track.artist, PRESET_LABEL[track.sound]].filter(Boolean).join(' · ') : 'Add tracks to play'}
						</p>
					</div>

					<div
						class="flex h-12 items-end gap-[3px]"
						data-slot="visualizer"
						data-level={Math.round(level * 1000)}
						data-active={playing || undefined}
						aria-hidden="true"
					>
						{#each bars as b, i (i)}
							<span
								class={['mp-bar min-w-0 flex-1 origin-bottom rounded-full bg-ripple-accent', !playing && 'mp-idle motion-reduce:animate-none']}
								style:height="100%"
								style:transform={playing ? `scaleY(${Math.max(b, 0.06)})` : undefined}
								style:animation-delay="{(i % 7) * -0.23}s"
								style:opacity={playing ? 0.55 + b * 0.45 : 0.35}
							></span>
						{/each}
					</div>
				</div>
			</div>

			<div class="flex flex-col gap-1">
				<input
					type="range"
					class={range}
					min="0"
					max={Math.round(lenS)}
					step="1"
					value={Math.floor(posS)}
					oninput={seek}
					aria-label="Seek"
					aria-valuetext="{clock(posS)} of {clock(lenS)}"
					disabled={!track}
					data-slot="seek"
				/>
				<div class="flex justify-between text-footnote text-ripple-muted-foreground tabular-nums">
					<span data-slot="elapsed">{clock(Math.floor(posS))}</span><span data-slot="length">{clock(lenS)}</span>
				</div>
			</div>

			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="flex items-center gap-1">
					<button type="button" class={[iconBtn, shuffle && toggleOn]} aria-label="Shuffle" aria-pressed={shuffle} onclick={() => ((shuffle = !shuffle), emit())}>
						<Shuffle size={17} strokeWidth={1.75} aria-hidden="true" />
					</button>
					<button type="button" class={iconBtn} aria-label="Previous track" onclick={prev} disabled={!track}>
						<SkipBack size={18} strokeWidth={1.75} aria-hidden="true" />
					</button>
					<button
						type="button"
						class={[
							'grid size-14 place-items-center rounded-full bg-ripple-accent text-ripple-accent-foreground transition-transform duration-150 hover:scale-105 active:scale-95 motion-reduce:transition-none disabled:opacity-50',
							focusRing,
							autoHint && 'ring-4 ring-ripple-accent/30'
						]}
						aria-label={playing ? 'Pause' : 'Play'}
						onclick={toggle}
						disabled={!track}
						data-slot="play"
						data-autoplay={autoHint || undefined}
					>
						{#if playing}<Pause size={22} strokeWidth={2} aria-hidden="true" />{:else}<Play size={22} strokeWidth={2} aria-hidden="true" class="translate-x-px" />{/if}
					</button>
					<button type="button" class={iconBtn} aria-label="Next track" onclick={next} disabled={!track}>
						<SkipForward size={18} strokeWidth={1.75} aria-hidden="true" />
					</button>
					<button type="button" class={[iconBtn, repeat && toggleOn]} aria-label="Repeat playlist" aria-pressed={repeat} onclick={() => ((repeat = !repeat), emit())}>
						<Repeat size={17} strokeWidth={1.75} aria-hidden="true" />
					</button>
				</div>
				<div class="flex min-w-32 flex-1 items-center gap-2 @min-[520px]:max-w-48">
					<button type="button" class={[iconBtn, 'size-8']} aria-label={muted ? 'Unmute' : 'Mute'} aria-pressed={muted} onclick={toggleMute}>
						{#if muted || vol === 0}<VolumeX size={16} strokeWidth={1.75} aria-hidden="true" />{:else}<Volume2 size={16} strokeWidth={1.75} aria-hidden="true" />{/if}
					</button>
					<input type="range" class={range} min="0" max="100" step="1" value={Math.round((muted ? 0 : vol) * 100)} oninput={setVol} aria-label="Volume" data-slot="volume" />
				</div>
			</div>
		</section>

		{#if list.length}
			<section class="rounded-ripple border border-ripple-border bg-ripple-surface p-1.5" aria-labelledby="{uid}-list" data-slot="playlist">
				<h3 id="{uid}-list" class="sr-only">Playlist</h3>
				<ol class="flex flex-col">
					{#each list as t, i (t.key)}
						{@const Icon = ICONS[t.sound]}
						{@const on = i === idx}
						<li>
							<button
								type="button"
								class={[
									'grid w-full grid-cols-[1.5rem_auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-150 hover:bg-ripple-muted motion-reduce:transition-none',
									on && 'bg-ripple-muted',
									focusRing
								]}
								aria-current={on ? 'true' : undefined}
								aria-label="{on && playing ? 'Pause' : 'Play'} {t.title}"
								onclick={() => choose(i)}
								data-slot="track"
							>
								<span class="grid h-4 place-items-center text-footnote text-ripple-muted-foreground tabular-nums" aria-hidden="true">
									{#if on && playing}
										<span class="flex h-3 items-end gap-[2px]" data-slot="eq">
											{#each [0, 1, 2] as k (k)}
												<span class="mp-eq w-[3px] rounded-full bg-ripple-accent motion-reduce:animate-none" style:height="100%"
													style:animation-delay="{k * -0.3}s"></span>
											{/each}
										</span>
									{:else}{i + 1}{/if}
								</span>
								<span class="grid size-8 place-items-center rounded-md" style:background-image={grad(t.pal)} aria-hidden="true">
									<Icon size={15} strokeWidth={1.75} class="text-white" />
								</span>
								<span class="flex min-w-0 flex-col">
									<span class={['truncate text-callout font-medium', on && 'text-ripple-accent']}>{t.title}</span>
									<span class="truncate text-footnote text-ripple-muted-foreground">{[t.artist, PRESET_LABEL[t.sound]].filter(Boolean).join(' · ')}</span>
								</span>
								<span class="text-footnote text-ripple-muted-foreground tabular-nums">{clock(t.ms / 1000)}</span>
							</button>
						</li>
					{/each}
				</ol>
			</section>
		{/if}

		<p class="sr-only" aria-live="polite" data-slot="live">{live}</p>
	</div>
</div>

<style>
	.mp-sheen {
		background:
			radial-gradient(circle at 25% 20%, rgb(255 255 255 / 0.45), transparent 45%),
			repeating-linear-gradient(45deg, rgb(255 255 255 / 0.07) 0 6px, transparent 6px 14px);
	}
	.mp-bar {
		transform: scaleY(0.12);
		transition: transform 80ms linear;
	}
	.mp-idle {
		animation: mp-breathe 2.4s ease-in-out infinite;
	}
	.mp-eq {
		animation: mp-eq 0.9s ease-in-out infinite;
		transform-origin: bottom;
	}
	@keyframes mp-breathe {
		0%,
		100% {
			transform: scaleY(0.08);
		}
		50% {
			transform: scaleY(0.22);
		}
	}
	@keyframes mp-eq {
		0%,
		100% {
			transform: scaleY(0.3);
		}
		50% {
			transform: scaleY(1);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.mp-bar,
		.mp-idle,
		.mp-eq {
			animation: none;
			transition: none;
		}
	}
</style>
