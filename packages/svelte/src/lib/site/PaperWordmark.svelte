<!--
  @file lib/site/PaperWordmark.svelte
  @description The site bar's "Ripple" wordmark drawn as a sheet of calm paper:
    a slow, shallow wave (amplitude 0.07em, wavelength 2.4em, 0.35 Hz) bends
    the glyphs, the slopes catch light and shade (x0.55 under 24px), and a soft
    shadow sits under the parts that lift. It takes the font, size, letter
    spacing and colour of its parent (the bar's .wordmark).
    The server and the first paint render the plain text. Once the fonts are
    ready the canvas (aria-hidden, sized at device pixel ratio) is laid over the
    text, which stays as an invisible spacer so the box never changes size.
    Reduced motion draws one flat frame and runs no loop. The loop is capped at
    about 30 fps and pauses while the tab is hidden. A theme flip (the root's
    class or data-theme) or an OS scheme change redraws with the new ink.
    Without document.fonts or a 2D context (jsdom) it stays as text.
-->
<script lang="ts">
	import { onMount } from 'svelte';

	const TEXT = 'Ripple';
	const TAU = Math.PI * 2;
	const AMP = 0.07; // × font size
	const WAVE = 2.4; // × font size
	const SPEED = 0.35; // Hz
	const FRAME_MS = 1000 / 30;

	let host: HTMLSpanElement;
	let text: HTMLSpanElement;
	let canvas: HTMLCanvasElement;
	let ready = $state(false);

	type Paper = {
		ctx: CanvasRenderingContext2D;
		work: CanvasRenderingContext2D;
		src: HTMLCanvasElement;
		shadow: HTMLCanvasElement;
		fs: number;
		dpr: number;
		amp: number;
		k: number;
		slopes: Float32Array;
	};

	function build(): Paper | undefined {
		const cs = getComputedStyle(host);
		const fs = parseFloat(cs.fontSize);
		const dpr = Math.min(window.devicePixelRatio || 1, 3);
		const font = `${cs.fontWeight} ${fs}px ${cs.fontFamily}`;
		const amp = fs * AMP;
		const hp = Math.ceil(fs * 0.08);
		const vp = Math.ceil(amp * 1.6 + fs * 0.12);
		const W = Math.ceil(text.offsetWidth) + hp * 2;
		const H = Math.ceil(fs * 1.25) + vp * 2;
		const make = () => {
			const c = document.createElement('canvas');
			c.width = Math.ceil(W * dpr);
			c.height = Math.ceil(H * dpr);
			return c;
		};
		canvas.width = Math.ceil(W * dpr);
		canvas.height = Math.ceil(H * dpr);
		canvas.style.width = `${W}px`;
		canvas.style.height = `${H}px`;
		canvas.style.left = `${-hp}px`;
		const ctx = canvas.getContext('2d');
		const workCanvas = make();
		const work = workCanvas.getContext('2d');
		if (!ctx || !work) return undefined;
		const src = make();
		const shadow = make();
		const ink = (c: HTMLCanvasElement, fill: string, blur: number) => {
			const x = c.getContext('2d');
			if (!x) return;
			x.scale(dpr, dpr);
			x.font = font;
			x.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
			x.textBaseline = 'middle';
			x.fillStyle = fill;
			if (blur) x.filter = `blur(${blur}px)`;
			x.fillText(TEXT, hp, H / 2 + fs * 0.04);
		};
		ink(src, cs.color, 0);
		ink(shadow, '#000', Math.max(1, fs * 0.06));
		return { ctx, work, src, shadow, fs, dpr, amp, k: TAU / (fs * WAVE), slopes: new Float32Array(canvas.width) };
	}

	/** One frame at time `t` (seconds); `flat` draws the word at rest. */
	function draw(p: Paper, t: number, flat: boolean) {
		const { ctx, work, src, shadow, fs, dpr, amp, k, slopes } = p;
		const Wd = canvas.width;
		const Hd = canvas.height;
		ctx.globalAlpha = 1;
		ctx.clearRect(0, 0, Wd, Hd);
		if (flat) {
			ctx.drawImage(src, 0, 0);
			return;
		}
		work.clearRect(0, 0, Wd, Hd);
		const lift = fs * 0.07 * dpr;
		for (let X = 0; X < Wd; X++) {
			const ph = k * (X / dpr) - TAU * SPEED * t;
			const dy = amp * Math.sin(ph);
			slopes[X] = amp * k * Math.cos(ph);
			const up = Math.max(0, -dy) / amp;
			if (up > 0.02) {
				ctx.globalAlpha = up * 0.32;
				ctx.drawImage(shadow, X, 0, 1, Hd, X, lift, 1, Hd);
			}
			work.drawImage(src, X, 0, 1, Hd, X, dy * dpr, 1, Hd);
		}
		work.globalCompositeOperation = 'source-atop';
		const sf = fs < 24 ? 0.55 : 1;
		for (let X = 0; X < Wd; X++) {
			const sl = slopes[X];
			if (Math.abs(sl) < 0.01) continue;
			work.fillStyle = sl > 0 ? `rgba(0,0,0,${sf * Math.min(0.42, sl * 1.3)})` : `rgba(255,255,255,${sf * Math.min(0.3, -sl)})`;
			work.fillRect(X, 0, 1, Hd);
		}
		work.globalCompositeOperation = 'source-over';
		ctx.globalAlpha = 1;
		ctx.drawImage(work.canvas, 0, 0);
	}

	onMount(() => {
		if (!document.fonts || !window.matchMedia) return;
		const reduce = matchMedia('(prefers-reduced-motion: reduce)');
		const scheme = matchMedia('(prefers-color-scheme: dark)');
		let paper: Paper | undefined;
		let raf = 0;
		let last = -Infinity;
		let alive = true;

		const loop = (now: number) => {
			raf = requestAnimationFrame(loop);
			if (now - last < FRAME_MS - 1) return;
			last = now;
			if (paper) draw(paper, now / 1000, false);
		};
		const stop = () => {
			cancelAnimationFrame(raf);
			raf = 0;
		};
		const start = () => {
			if (!raf && paper && !reduce.matches && !document.hidden) raf = requestAnimationFrame(loop);
		};
		const refresh = () => {
			if (!alive) return;
			stop();
			paper = build();
			if (!paper) return;
			draw(paper, performance.now() / 1000, reduce.matches);
			ready = true;
			start();
		};
		const onVisibility = () => (document.hidden ? stop() : start());

		const cs = getComputedStyle(host);
		Promise.all([document.fonts.ready, document.fonts.load(`${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`)])
			.catch(() => {})
			.then(refresh);

		const themeWatch = new MutationObserver(refresh);
		themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
		scheme.addEventListener('change', refresh);
		reduce.addEventListener('change', refresh);
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			alive = false;
			stop();
			themeWatch.disconnect();
			scheme.removeEventListener('change', refresh);
			reduce.removeEventListener('change', refresh);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});
</script>

<span class="paper" bind:this={host}
	><span class="text" class:spacer={ready} bind:this={text}>{TEXT}</span><canvas bind:this={canvas} aria-hidden="true" hidden={!ready}
	></canvas></span
>

<style>
	.paper {
		position: relative;
		display: inline-block;
	}
	/* Kept in flow under the canvas so the box keeps the text's size. */
	.spacer {
		visibility: hidden;
	}
	canvas {
		position: absolute;
		top: 50%;
		translate: 0 -50%;
		pointer-events: none;
	}
	canvas[hidden] {
		display: none;
	}
</style>
