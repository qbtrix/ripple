<!--
  widgets/composite/WeatherIcon.svelte: the ten hand-drawn condition icons the
  weather-forecast widget uses, picked by kind. Every shape is a constant in
  this file; model text never reaches the SVG. With `animate` the sun turns,
  clouds drift, rain and snow fall, the bolt flashes and fog slides, all in
  CSS keyframes so prefers-reduced-motion stops them (SMIL would ignore it).
  Colours are fixed weather hues that read on light and dark grounds.
-->
<script lang="ts">
	import type { Kind } from './weather-forecast.js';

	interface Props {
		kind: Kind;
		size?: number;
		animate?: boolean;
		class?: string;
	}
	let { kind, size = 32, animate = false, class: className }: Props = $props();

	const RAYS = [0, 45, 90, 135, 180, 225, 270, 315];
	const drops = (n: number) => Array.from({ length: n }, (_, i) => i);
	const sunny = $derived(kind === 'sunny' || kind === 'partly-cloudy');
	const cloudy = $derived(kind !== 'sunny' && kind !== 'night-clear' && kind !== 'wind');
	const dark = $derived(kind === 'heavy-rain' || kind === 'thunder');
	// Small sun up and right when a cloud sits in front of it.
	const sun = $derived(kind === 'partly-cloudy' ? { cx: 40, cy: 22, r: 9, ray: 15 } : { cx: 32, cy: 32, r: 12, ray: 20 });
	const cloudY = $derived(kind === 'partly-cloudy' ? 4 : kind === 'cloudy' || kind === 'fog' ? 2 : -4);
</script>

<svg
	class={['wx', animate && 'wx-live', className]}
	width={size}
	height={size}
	viewBox="0 0 64 64"
	aria-hidden="true"
	data-kind={kind}
>
	{#if sunny}
		<g class="wx-rays" style="transform-origin: {sun.cx}px {sun.cy}px">
			{#each RAYS as a (a)}
				<line
					x1={sun.cx}
					y1={sun.cy - sun.r - 3}
					x2={sun.cx}
					y2={sun.cy - sun.ray}
					stroke="#f5a524"
					stroke-width="3"
					stroke-linecap="round"
					transform="rotate({a} {sun.cx} {sun.cy})"
				/>
			{/each}
		</g>
		<circle cx={sun.cx} cy={sun.cy} r={sun.r} fill="#fbbf24" />
	{/if}

	{#if kind === 'night-clear'}
		<path d="M38 14a18 18 0 1 0 12 30A15 15 0 0 1 38 14z" fill="#c7cff9" />
		<path class="wx-twinkle" d="M14 14l1.5 3.5L19 19l-3.5 1.5L14 24l-1.5-3.5L9 19l3.5-1.5z" fill="#fde68a" />
		<circle class="wx-twinkle wx-d2" cx="22" cy="40" r="1.6" fill="#fde68a" />
	{/if}

	{#if kind === 'wind'}
		<g fill="none" stroke="#7dd3fc" stroke-width="3.5" stroke-linecap="round">
			<path class="wx-gust" d="M8 24h30a7 7 0 1 0-7-7" />
			<path class="wx-gust wx-d2" d="M8 34h40a7 7 0 1 1-7 7" />
			<path class="wx-gust wx-d3" d="M8 44h18" />
		</g>
	{/if}

	{#if cloudy}
		<g class="wx-cloud" transform="translate(0 {cloudY})">
			{#if kind === 'cloudy'}
				<g fill="#8b98a9" transform="translate(-8 -8) scale(0.8)">
					<circle cx="26" cy="36" r="9" /><circle cx="37" cy="30" r="12" /><circle cx="47" cy="38" r="8" />
					<rect x="18" y="36" width="36" height="10" rx="5" />
				</g>
			{/if}
			<g fill={dark ? '#8391a3' : '#c3ccd7'}>
				<circle cx="22" cy="38" r="10" />
				<circle cx="35" cy="31" r="13" />
				<circle cx="47" cy="39" r="9" />
				<rect x="13" y="38" width="43" height="11" rx="5.5" />
			</g>
		</g>
	{/if}

	{#if kind === 'rain' || kind === 'heavy-rain'}
		<g stroke="#3b82f6" stroke-width={kind === 'rain' ? 2.5 : 3} stroke-linecap="round">
			{#each drops(kind === 'rain' ? 3 : 5) as i (i)}
				{@const x = kind === 'rain' ? 22 + i * 10 : 17 + i * 8}
				<line class="wx-drop wx-d{i % 3}" x1={x} y1="51" x2={x - 2} y2="57" />
			{/each}
		</g>
	{/if}

	{#if kind === 'thunder'}
		<path class="wx-bolt" d="M34 44l-7 11h6l-3 8 9-12h-6l3-7z" fill="#facc15" />
		<line class="wx-drop wx-d1" x1="20" y1="51" x2="18" y2="57" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" />
		<line class="wx-drop wx-d2" x1="46" y1="51" x2="44" y2="57" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" />
	{/if}

	{#if kind === 'snow'}
		<g fill="#93c5fd">
			{#each drops(4) as i (i)}
				<circle class="wx-flake wx-d{i % 3}" cx={19 + i * 9} cy={54 + (i % 2) * 3} r="2.4" />
			{/each}
		</g>
	{/if}

	{#if kind === 'fog'}
		<g stroke="#94a3b8" stroke-width="3" stroke-linecap="round">
			<line class="wx-fog" x1="12" y1="53" x2="44" y2="53" />
			<line class="wx-fog wx-d2" x1="20" y1="59" x2="52" y2="59" />
		</g>
	{/if}
</svg>

<style>
	.wx {
		flex-shrink: 0;
		overflow: visible;
	}
	.wx-live .wx-rays {
		animation: wx-spin 30s linear infinite;
	}
	.wx-live .wx-cloud {
		animation: wx-drift 7s ease-in-out infinite alternate;
	}
	.wx-live .wx-drop {
		animation: wx-fall 1.1s linear infinite;
	}
	.wx-live .wx-flake {
		animation: wx-fall 2.6s linear infinite;
	}
	.wx-live .wx-bolt {
		animation: wx-flash 3.2s ease-out infinite;
	}
	.wx-live .wx-twinkle {
		animation: wx-twinkle 3s ease-in-out infinite;
	}
	.wx-live .wx-gust {
		stroke-dasharray: 60 14;
		animation: wx-gust 2.4s linear infinite;
	}
	.wx-live .wx-fog {
		animation: wx-slide 5s ease-in-out infinite alternate;
	}
	.wx-live .wx-d1 {
		animation-delay: -0.35s;
	}
	.wx-live .wx-d2 {
		animation-delay: -0.75s;
	}
	@keyframes wx-spin {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes wx-drift {
		from {
			translate: -1.5px 0;
		}
		to {
			translate: 1.5px 0;
		}
	}
	@keyframes wx-fall {
		from {
			translate: 0 -5px;
			opacity: 0;
		}
		30% {
			opacity: 1;
		}
		to {
			translate: -2px 6px;
			opacity: 0;
		}
	}
	@keyframes wx-flash {
		0%,
		70%,
		100% {
			opacity: 1;
		}
		75%,
		85% {
			opacity: 0.2;
		}
	}
	@keyframes wx-twinkle {
		50% {
			opacity: 0.35;
		}
	}
	@keyframes wx-gust {
		to {
			stroke-dashoffset: -74;
		}
	}
	@keyframes wx-slide {
		from {
			translate: -3px 0;
		}
		to {
			translate: 3px 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.wx-live * {
			animation: none !important;
		}
	}
</style>
