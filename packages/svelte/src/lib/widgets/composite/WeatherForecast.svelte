<!--
  widgets/composite/WeatherForecast.svelte: `weather-forecast`: a weather app
  card the model fills with numbers. A big "now" header (animated icon,
  temperature, feels-like, humidity, wind), an hourly scroller when `hourly`
  is given, and a day strip where each day carries its icon, rain chance and
  a low..high range bar on the week's shared scale. A °C/°F toggle converts
  every number; pressing a day shows its details below the strip.

  Invariants:
  - Display only: no bind, no storage. Unit and the picked day are local
    state that a re-sent spec keeps.
  - Icons come from WeatherIcon's trusted constants by kind; an unknown
    condition draws cloudy. Model text is only ever rendered as text.
  - Below 560px the days stack as rows with horizontal bars; at 560px and
    up they sit side by side with vertical bars. Same markup, container
    queries only.
-->
<script lang="ts">
	import { safeStyle } from '@ripple-ui/core';
	import Droplets from '@lucide/svelte/icons/droplets';
	import Wind from '@lucide/svelte/icons/wind';
	import Thermometer from '@lucide/svelte/icons/thermometer';
	import Sunrise from '@lucide/svelte/icons/sunrise';
	import Sunset from '@lucide/svelte/icons/sunset';
	import { plain } from '../data-kit/index.js';
	import WeatherIcon from './WeatherIcon.svelte';
	import { at, convert, outlook, readDays, readHours, readNow, span, toUnit, type Unit } from './weather-forecast.js';

	interface Props {
		id?: string;
		class?: string;
		style?: string | Record<string, string>;
		place?: string;
		/** The unit the numbers are given in. Default 'C'. */
		unit?: 'C' | 'F';
		now?: { temp: number; condition: string; feelsLike?: number; humidity?: number; wind?: string | number };
		days?: Array<{ day: string; condition: string; high: number; low: number; rainChance?: number; sunrise?: string; sunset?: string }>;
		hourly?: Array<{ time: string; temp: number; condition: string; rainChance?: number }>;
		/** A small note, e.g. "Sample forecast". */
		note?: string;
	}

	let { id, class: className, style, place, unit, now, days, hourly, note }: Props = $props();

	const rootStyle = $derived(
		style && typeof style === 'object'
			? safeStyle(Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';'))
			: safeStyle(typeof style === 'string' ? style : '')
	);

	const src = $derived(toUnit(unit));
	let picked = $state<Unit | null>(null);
	const shown = $derived(picked ?? src);
	const t = (v: number | undefined) => (v === undefined ? '–' : `${convert(v, src, shown)}°`);

	const where = $derived(plain(place).trim());
	const noteText = $derived(plain(note).trim());
	const nowR = $derived(readNow(now));
	const dayRows = $derived(readDays(days));
	const hours = $derived(readHours(hourly));
	const range = $derived(span(dayRows));
	const today = $derived(dayRows[0]);
	const line = $derived(outlook(dayRows));

	let sel = $state(-1);
	const selDay = $derived(dayRows[sel]);

	function bar(d: (typeof dayRows)[number]) {
		if (!range || d.low === undefined || d.high === undefined) return '';
		return `--lo:${at(d.low, range)}%;--hi:${at(d.high, range)}%`;
	}
	const nowDot = $derived(range && nowR?.temp !== undefined ? `--at:${at(nowR.temp, range)}%` : '');

	const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ripple-ring';
</script>

<div {id} class={['@container text-ripple-surface-foreground', className]} style={rootStyle} data-widget="weather-forecast">
	<section class="wf flex flex-col gap-4 rounded-ripple border border-ripple-border bg-ripple-surface p-4" aria-label={where ? `Weather for ${where}` : 'Weather forecast'}>
		<header class="flex items-start gap-3">
			<div class="min-w-0 flex-1">
				{#if where}<h2 class="truncate text-title-3 font-semibold" data-slot="place">{where}</h2>{/if}
				{#if noteText}<p class="text-caption-1 text-ripple-muted-foreground" data-slot="note">{noteText}</p>{/if}
			</div>
			<div class="flex shrink-0 rounded-full bg-ripple-muted p-0.5" role="group" aria-label="Temperature unit">
				{#each ['C', 'F'] as const as u (u)}
					<button
						type="button"
						class={['h-7 min-w-9 rounded-full px-2 text-footnote font-medium transition-colors', focusRing, shown === u ? 'bg-ripple-surface text-ripple-surface-foreground shadow-sm' : 'text-ripple-muted-foreground hover:text-ripple-surface-foreground']}
						aria-pressed={shown === u}
						onclick={() => (picked = u)}>°{u}</button
					>
				{/each}
			</div>
		</header>

		{#if nowR}
			<div class="flex items-center gap-4" data-slot="now">
				<WeatherIcon kind={nowR.kind} size={84} animate />
				<div class="min-w-0">
					<p class="wf-temp font-semibold tabular-nums" data-slot="now-temp">{t(nowR.temp)}</p>
					<p class="text-body-emph">{nowR.label}</p>
					{#if today && (today.high !== undefined || today.low !== undefined)}
						<p class="text-footnote text-ripple-muted-foreground tabular-nums">H {t(today.high)} · L {t(today.low)}</p>
					{/if}
				</div>
			</div>
			{#if nowR.feelsLike !== undefined || nowR.humidity !== undefined || nowR.wind}
				<ul class="flex flex-wrap gap-x-4 gap-y-1 text-footnote text-ripple-muted-foreground" aria-label="Conditions now">
					{#if nowR.feelsLike !== undefined}<li class="flex items-center gap-1"><Thermometer size={14} aria-hidden="true" />Feels like <span class="text-ripple-surface-foreground tabular-nums">{t(nowR.feelsLike)}</span></li>{/if}
					{#if nowR.humidity !== undefined}<li class="flex items-center gap-1"><Droplets size={14} aria-hidden="true" />Humidity <span class="text-ripple-surface-foreground tabular-nums">{nowR.humidity}%</span></li>{/if}
					{#if nowR.wind}<li class="flex items-center gap-1"><Wind size={14} aria-hidden="true" />Wind <span class="text-ripple-surface-foreground">{nowR.wind}</span></li>{/if}
				</ul>
			{/if}
		{/if}

		{#if hours.length}
			<div class="-mx-4 overflow-x-auto px-4 pb-1" data-slot="hourly">
				<ul class="flex w-max gap-1" aria-label="Hourly forecast">
					{#each hours as h, i (i)}
						<li class="flex w-14 flex-col items-center gap-1 rounded-ripple py-2 text-center" aria-label="{h.time || `Hour ${i + 1}`}, {t(h.temp)}{h.rain ? `, ${h.rain}% rain` : ''}">
							<span class="text-caption-1 text-ripple-muted-foreground">{h.time}</span>
							<WeatherIcon kind={h.kind} size={28} />
							<span class="text-callout font-medium tabular-nums">{t(h.temp)}</span>
							<span class="wf-rain h-3.5 text-caption-2 tabular-nums">{h.rain && h.rain >= 10 ? `${h.rain}%` : ''}</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if dayRows.length}
			<div class="flex flex-col gap-2">
				<div class="wf-days" role="group" aria-label="{dayRows.length}-day forecast" data-slot="days">
					{#each dayRows as d, i (i)}
						<button
							type="button"
							class={['wf-day rounded-ripple text-left transition-colors hover:bg-ripple-muted', focusRing, sel === i && 'bg-ripple-muted']}
							aria-pressed={sel === i}
							aria-label="{d.day}: {d.label}, high {t(d.high)}, low {t(d.low)}{d.rain !== undefined ? `, ${d.rain}% chance of rain` : ''}"
							onclick={() => (sel = sel === i ? -1 : i)}
						>
							<span class="wf-name text-callout font-medium">{i === 0 && nowR ? 'Today' : d.day}</span>
							<span class="wf-icon"><WeatherIcon kind={d.kind} size={30} /></span>
							<span class="wf-rain wf-pct text-caption-1 font-medium tabular-nums">{d.rain && d.rain >= 10 ? `${d.rain}%` : ''}</span>
							<span class="wf-lo text-callout text-ripple-muted-foreground tabular-nums">{t(d.low)}</span>
							<span class="wf-track" style={bar(d)} aria-hidden="true">
								<span class="wf-fill"></span>
								{#if i === 0 && nowDot}<span class="wf-now" style={nowDot}></span>{/if}
							</span>
							<span class="wf-hi text-callout font-semibold tabular-nums">{t(d.high)}</span>
						</button>
					{/each}
				</div>
				{#if selDay}
					<div class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-ripple bg-ripple-muted px-3 py-2 text-footnote" data-slot="day-detail" aria-live="polite">
						<span class="font-semibold">{selDay.day}</span>
						<span>{selDay.label}</span>
						<span class="tabular-nums">{t(selDay.low)} to {t(selDay.high)}</span>
						{#if selDay.rain !== undefined}<span class="flex items-center gap-1 tabular-nums"><Droplets size={13} aria-hidden="true" />{selDay.rain}% rain</span>{/if}
						{#if selDay.sunrise}<span class="flex items-center gap-1 tabular-nums"><Sunrise size={13} aria-hidden="true" />{selDay.sunrise}</span>{/if}
						{#if selDay.sunset}<span class="flex items-center gap-1 tabular-nums"><Sunset size={13} aria-hidden="true" />{selDay.sunset}</span>{/if}
					</div>
				{/if}
				{#if line}<p class="text-footnote text-ripple-muted-foreground" data-slot="outlook">{line}</p>{/if}
			</div>
		{/if}
	</section>
</div>

<style>
	.wf-temp {
		font-size: 3.5rem;
		line-height: 1;
		letter-spacing: -0.03em;
	}
	.wf-rain {
		color: #3b82f6;
	}
	:global(.dark) .wf-rain,
	:global([data-theme='dark']) .wf-rain {
		color: #7cb4ff;
	}
	/* Narrow: one row per day. Day, icon, rain, low, bar, high. */
	.wf-days {
		display: flex;
		flex-direction: column;
	}
	.wf-day {
		display: grid;
		grid-template-columns: 3.5rem 2rem 2.5rem 2.75rem minmax(3rem, 1fr) 2.75rem;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.5rem;
	}
	.wf-lo,
	.wf-hi {
		text-align: right;
	}
	.wf-track {
		position: relative;
		height: 0.375rem;
		border-radius: 999px;
		background: var(--color-ripple-muted, rgb(127 127 127 / 0.15));
	}
	.wf-fill {
		position: absolute;
		inset-block: 0;
		left: var(--lo, 0%);
		right: calc(100% - var(--hi, 0%));
		border-radius: inherit;
		background: linear-gradient(90deg, #5ac8fa, #a3e635, #fbbf24, #fb923c);
	}
	.wf-now {
		position: absolute;
		top: 50%;
		left: var(--at);
		width: 0.625rem;
		height: 0.625rem;
		border-radius: 999px;
		background: var(--color-ripple-surface, #fff);
		border: 2px solid currentColor;
		transform: translate(-50%, -50%);
	}
	/* Wide: days side by side, bars stand up between high (top) and low. */
	@container (min-width: 560px) {
		.wf-days {
			flex-direction: row;
			gap: 0.25rem;
		}
		.wf-day {
			flex: 1 1 0;
			min-width: 0;
			grid-template-columns: 1fr;
			grid-template-rows: auto auto 1rem auto 4.5rem auto;
			justify-items: center;
			gap: 0.25rem;
			padding: 0.5rem 0.25rem;
			text-align: center;
		}
		.wf-name {
			order: 0;
		}
		.wf-icon {
			order: 1;
		}
		.wf-pct {
			order: 2;
		}
		.wf-hi {
			order: 3;
			text-align: center;
		}
		.wf-track {
			order: 4;
			width: 0.375rem;
			height: 100%;
		}
		.wf-lo {
			order: 5;
			text-align: center;
		}
		.wf-fill {
			inset-block: auto;
			inset-inline: 0;
			left: 0;
			right: 0;
			bottom: var(--lo, 0%);
			top: calc(100% - var(--hi, 0%));
			background: linear-gradient(0deg, #5ac8fa, #a3e635, #fbbf24, #fb923c);
		}
		.wf-now {
			top: auto;
			left: 50%;
			bottom: var(--at);
			transform: translate(-50%, 50%);
		}
	}
</style>
