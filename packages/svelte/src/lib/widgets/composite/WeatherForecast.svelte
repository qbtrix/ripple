<!--
  widgets/composite/WeatherForecast.svelte: `weather-forecast`: a weather app
  card the model fills with numbers. A "now" hero (animated icon, temperature,
  condition, today's high and low, feels-like / humidity / wind), an hourly
  band when `hourly` is given, and the days, each with its icon, rain chance
  and a low..high range bar on one shared scale. A °C/°F toggle converts every
  number; pressing a day shows its details below the days.

  Invariants:
  - Display only: no bind, no storage. Unit and the picked day are local
    state that a re-sent spec keeps.
  - One frame, the host card's: no border or surface of its own.
  - Icons come from WeatherIcon's trusted constants by kind; an unknown
    condition draws cloudy. Model text is only ever rendered as text. The
    place wraps to two lines, hour times and freeform day labels to one, each
    then ellipsized with the full text in a `title`.
  - Nothing scrolls sideways: the hourly band fits the card width by folding
    hours into buckets (bucketHours), never by scrolling. A column is
    labelled at its bucket's first hour (full span in its `title`), and the
    first column past each midnight carries the weekday above its time.
  - Bar position and colour come from the source unit, so toggling °C/°F
    moves nothing. Colour means temperature: each bar end is its own
    temperature's spot on one cool-to-warm ramp mixed in oklch from the info
    and warning tokens in thirds (blue, teal, yellow, amber); only the warm
    stop is darkened (lightness, not chroma) so mild weeks stay clean.
  - Negative temperatures use the minus sign (U+2212), not a hyphen.
  - Days are rows below 560px, for 1-2 days and for 8-14 days; 3-7 days at
    560px and up stand side by side with vertical bars. Same markup,
    container queries only. Row 1 always reads "Today". The low and high
    columns are as wide as the widest value, the same on every row, so the
    numbers line up and the bar gets the rest. ISO days show a short date
    under the weekday when weekdays would repeat.
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
	import { at, bucketHours, convert, outlook, ramp, readDays, readHours, readNow, span, toUnit, type Unit } from './weather-forecast.js';

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
	const t = (v: number | undefined) => {
		if (v === undefined) return '–';
		const n = convert(v, src, shown);
		return `${n < 0 ? '\u2212' : ''}${Math.abs(n)}°`;
	};

	const where = $derived(plain(place).trim());
	const noteText = $derived(plain(note).trim());
	const nowR = $derived(readNow(now));
	const dayRows = $derived(readDays(days));
	const hours = $derived(readHours(hourly));
	const range = $derived(span(dayRows, nowR?.temp));
	const today = $derived(dayRows[0]);
	const line = $derived(outlook(dayRows));
	const anyDayRain = $derived(dayRows.some((d) => (d.rain ?? 0) >= 10));

	// The hourly band shows as many columns as fit (48px each, at most 12);
	// unmeasured (SSR, first paint, jsdom) it assumes a phone-width card.
	let bandW = $state(0);
	const fit = $derived(bandW ? Math.min(12, Math.max(1, Math.floor(bandW / 48))) : 6);
	const cols = $derived(bucketHours(hours, fit, dayRows.map((d) => d.day)));
	const anyCue = $derived(cols.some((h) => h.cue));
	const anyHourRain = $derived(cols.some((h) => (h.rain ?? 0) >= 10));

	let sel = $state(-1);
	const selDay = $derived(dayRows[sel]);

	const toC = (v: number) => (src === 'F' ? ((v - 32) * 5) / 9 : v);
	function bar(d: (typeof dayRows)[number]) {
		const lo = d.low ?? d.high;
		const hi = d.high ?? d.low;
		if (!range || lo === undefined || hi === undefined) return { css: '', dot: false };
		return {
			css: `--lo:${at(lo, range)}%;--hi:${at(hi, range)}%;--p0:${ramp(toC(lo))}%;--p1:${ramp(toC(hi))}%`,
			dot: lo === hi
		};
	}
	const nowDot = $derived(range && nowR?.temp !== undefined ? `--at:${at(nowR.temp, range)}%` : '');
	// Low/high column widths: the widest shown value, in digit widths, on every row.
	const widest = (pick: (d: (typeof dayRows)[number]) => number | undefined) => Math.max(2, ...dayRows.map((d) => t(pick(d)).length));
	const numCols = $derived(`--wf-lo:${widest((d) => d.low)}ch;--wf-hi:${widest((d) => d.high)}ch`);
	const hasConditions = $derived(!!nowR && (nowR.feelsLike !== undefined || nowR.humidity !== undefined || !!nowR.wind));

	const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ripple-ring';
</script>

<div {id} class={['@container text-ripple-surface-foreground', className]} style={safeStyle(rootStyle)} data-widget="weather-forecast">
	<section class="wf flex flex-col" aria-label={where ? `Weather for ${where}` : 'Weather forecast'}>
		<header class="flex items-start gap-3">
			<div class="min-w-0 flex-1">
				{#if where}<h2 class="line-clamp-2 text-title-3 font-semibold break-words" title={where} data-slot="place">{where}</h2>{/if}
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
			<div class="wf-hero" data-slot="now">
				<WeatherIcon kind={nowR.kind} size={76} animate />
				<div class="min-w-0">
					{#if nowR.temp !== undefined}<p class="wf-temp font-semibold tabular-nums" data-slot="now-temp">{t(nowR.temp)}</p>{/if}
					<p class="text-body-emph">{nowR.label}</p>
					{#if today && (today.high !== undefined || today.low !== undefined)}
						<p class="text-footnote text-ripple-muted-foreground tabular-nums">H {t(today.high)} · L {t(today.low)}</p>
					{/if}
				</div>
				{#if hasConditions}
					<ul class="wf-cond text-footnote text-ripple-muted-foreground" aria-label="Conditions now">
						{#if nowR.feelsLike !== undefined}<li class="flex min-w-0 items-center gap-1"><Thermometer size={14} aria-hidden="true" />Feels like <span class="text-ripple-surface-foreground tabular-nums">{t(nowR.feelsLike)}</span></li>{/if}
						{#if nowR.humidity !== undefined}<li class="flex min-w-0 items-center gap-1"><Droplets size={14} aria-hidden="true" />Humidity <span class="text-ripple-surface-foreground tabular-nums">{nowR.humidity}%</span></li>{/if}
						{#if nowR.wind}<li class="flex min-w-0 items-center gap-1"><Wind size={14} class="shrink-0" aria-hidden="true" />Wind <span class="text-ripple-surface-foreground">{nowR.wind}</span></li>{/if}
					</ul>
				{/if}
			</div>
		{/if}

		{#if hours.length}
			<div bind:clientWidth={bandW} data-slot="hourly">
				<ul class="grid" style={safeStyle(`grid-template-columns:repeat(${cols.length},minmax(0,1fr))`)} aria-label="Hourly forecast">
					{#each cols as h, i (i)}
						<li class="flex min-w-0 flex-col items-center gap-1 py-1 text-center">
							{#if anyCue}<span class="h-3.5 text-caption-2 font-semibold" data-slot="day-cue">{h.cue ?? ''}</span>{/if}
							<span class="w-full truncate text-caption-1 text-ripple-muted-foreground" title={h.span ?? h.time}>{h.time || '–'}</span>
							<WeatherIcon kind={h.kind} size={26} />
							<span class="text-callout font-medium tabular-nums">{t(h.temp)}</span>
							{#if anyHourRain}<span class="wf-rain h-3.5 text-caption-2 tabular-nums">{h.rain !== undefined && h.rain >= 10 ? `${h.rain}%` : ''}</span>{/if}
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if dayRows.length}
			<div class="flex flex-col gap-2">
				<div
					class="wf-days"
					data-many={dayRows.length >= 3 && dayRows.length <= 7 ? 'true' : 'false'}
					data-rain={anyDayRain ? 'true' : 'false'}
					style={safeStyle(numCols)}
					role="group"
					aria-label="{dayRows.length}-day forecast"
					data-slot="days"
				>
					{#each dayRows as d, i (i)}
						{@const b = bar(d)}
						<button
							type="button"
							class={['wf-day rounded-ripple text-left transition-colors hover:bg-ripple-muted', focusRing, sel === i && 'bg-ripple-muted']}
							aria-pressed={sel === i}
							aria-label="{i === 0 ? `Today, ${d.full}` : d.full}: {d.label}, high {t(d.high)}, low {t(d.low)}{d.rain !== undefined ? `, ${d.rain}% chance of rain` : ''}"
							onclick={() => (sel = sel === i ? -1 : i)}
						>
							<span class="wf-name min-w-0"><span class="block truncate text-callout font-medium" title={d.full}>{i === 0 ? 'Today' : d.day}</span>{#if d.date}<span class="block text-caption-2 text-ripple-muted-foreground tabular-nums">{d.date}</span>{/if}</span>
							<span class="wf-icon">
								<WeatherIcon kind={d.kind} size={28} />
								{#if anyDayRain}<span class="wf-rain wf-pct text-caption-2 font-medium tabular-nums">{d.rain !== undefined && d.rain >= 10 ? `${d.rain}%` : ''}</span>{/if}
							</span>
							<span class="wf-lo text-callout text-ripple-muted-foreground tabular-nums">{t(d.low)}</span>
							<span class="wf-track" style={safeStyle(b.css)} data-dot={b.dot ? 'true' : 'false'} aria-hidden="true">
								{#if b.css}<span class="wf-fill"></span>{/if}
								{#if i === 0 && nowDot}<span class="wf-now" style={safeStyle(nowDot)}></span>{/if}
							</span>
							<span class="wf-hi text-callout font-semibold tabular-nums">{t(d.high)}</span>
						</button>
					{/each}
				</div>
				{#if selDay}
					<div class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-ripple bg-ripple-muted px-3 py-2 text-footnote" data-slot="day-detail" aria-live="polite">
						<span class="max-w-full truncate font-semibold" title={selDay.full}>{selDay.full}</span>
						<span>{selDay.label}</span>
						<span class="tabular-nums">{t(selDay.low)} to {t(selDay.high)}</span>
						{#if selDay.rain !== undefined}<span class="flex items-center gap-1 tabular-nums"><Droplets size={13} aria-hidden="true" />{selDay.rain}% rain</span>{/if}
						{#if selDay.sunrise}<span class="flex min-w-0 items-center gap-1 tabular-nums"><Sunrise size={13} class="shrink-0" aria-hidden="true" /><span class="max-w-[12ch] truncate" title={selDay.sunrise}>{selDay.sunrise}</span></span>{/if}
						{#if selDay.sunset}<span class="flex min-w-0 items-center gap-1 tabular-nums"><Sunset size={13} class="shrink-0" aria-hidden="true" /><span class="max-w-[12ch] truncate" title={selDay.sunset}>{selDay.sunset}</span></span>{/if}
					</div>
				{/if}
				{#if line}<p class="text-footnote text-ripple-muted-foreground" data-slot="outlook">{line}</p>{/if}
			</div>
		{/if}
	</section>
</div>

<style>
	.wf {
		gap: 0.875rem;
		/* Ramp stops between the info (cold) and warning (warm) tokens, in oklch
		   so the hue runs the short way (blue, teal, yellow) at full chroma. */
		--wf-cool: color-mix(in oklch, var(--ripple-info) 70%, var(--ripple-warning));
		--wf-mild: color-mix(in oklch, var(--ripple-info) 18%, var(--ripple-warning));
		/* The warm end, a touch darker at full chroma, so it never washes out. */
		--wf-warm: oklch(from var(--ripple-warning) calc(l - 0.06) c h);
	}
	.wf-temp {
		font-size: 3.5rem;
		line-height: 1;
		letter-spacing: -0.03em;
	}
	.wf-rain {
		color: var(--ripple-info-text);
	}
	/* Hero: icon and number, the conditions wrap underneath. */
	.wf-hero {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		column-gap: 1rem;
		row-gap: 0.625rem;
	}
	.wf-cond {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
	}

	/* Rows: day | icon (rain under it) | low | bar | high. Fixed number columns. */
	.wf-days {
		display: flex;
		flex-direction: column;
	}
	.wf-day {
		display: grid;
		grid-template-columns: minmax(2.75rem, 3rem) 2rem var(--wf-lo, 2.5rem) minmax(0, 1fr) var(--wf-hi, 2.5rem);
		align-items: center;
		position: relative;
		gap: 0.375rem;
		min-height: 2.75rem;
		padding: 0.1875rem 0.375rem;
	}
	.wf-day + .wf-day::before {
		content: '';
		position: absolute;
		inset-inline: 0.375rem;
		top: 0;
		border-top: 1px solid var(--ripple-border);
	}
	.wf-icon {
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 1;
	}
	.wf-pct {
		line-height: 1;
		min-height: 0.6875rem;
	}
	.wf-lo {
		text-align: right;
	}
	.wf-hi {
		text-align: left;
	}
	.wf-track {
		position: relative;
		height: 0.375rem;
		border-radius: 999px;
		background: var(--ripple-track);
	}
	/* --p is 0..100% along the ramp; each third mixes one pair of stops in oklch
	   (blue, teal, yellow, amber). */
	.wf-fill {
		--c0: color-mix(in oklch, var(--wf-warm) clamp(0%, var(--p0) * 3 - 200%, 100%), color-mix(in oklch, var(--wf-mild) clamp(0%, var(--p0) * 3 - 100%, 100%), color-mix(in oklch, var(--wf-cool) clamp(0%, var(--p0) * 3, 100%), var(--ripple-info))));
		--c1: color-mix(in oklch, var(--wf-warm) clamp(0%, var(--p1) * 3 - 200%, 100%), color-mix(in oklch, var(--wf-mild) clamp(0%, var(--p1) * 3 - 100%, 100%), color-mix(in oklch, var(--wf-cool) clamp(0%, var(--p1) * 3, 100%), var(--ripple-info))));
		position: absolute;
		inset-block: 0;
		left: var(--lo, 0%);
		right: calc(100% - var(--hi, 0%));
		border-radius: inherit;
		background: linear-gradient(90deg, var(--c0), var(--c1));
	}
	/* Low equals high, or one side only: a dot at that temperature. */
	[data-dot='true'] .wf-fill {
		inset-block: auto;
		top: 50%;
		right: auto;
		width: 0.5rem;
		height: 0.5rem;
		transform: translate(-50%, -50%);
	}
	.wf-now {
		position: absolute;
		top: 50%;
		left: var(--at);
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 999px;
		background: var(--ripple-surface-foreground);
		box-shadow: 0 0 0 2px var(--ripple-surface);
		transform: translate(-50%, -50%);
	}

	@container (max-width: 399px) {
		.wf {
			gap: 0.75rem;
		}
	}
	/* Wider hero: the conditions take a right column beside the number. */
	@container (min-width: 480px) {
		.wf-hero {
			grid-template-columns: auto 1fr auto;
		}
		.wf-cond {
			grid-column: auto;
			flex-direction: column;
			align-items: flex-start;
		}
	}
	/* 3 to 7 days at 560px and up: side by side, bars stand up between high (top) and low. */
	@container (min-width: 560px) {
		.wf-days[data-many='true'] {
			flex-direction: row;
			gap: 0.25rem;
		}
		[data-many='true'] .wf-day {
			flex: 1 1 0;
			min-width: 0;
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto auto auto 4.5rem auto;
			justify-items: center;
			gap: 0.375rem;
			padding: 0.5rem 0.25rem;
			text-align: center;
		}
		[data-many='true'] .wf-day::before {
			content: none;
		}
		[data-many='true'] .wf-name {
			max-width: 100%;
		}
		[data-many='true'] .wf-icon {
			gap: 0.25rem;
		}
		[data-many='true'] .wf-hi {
			order: 3;
			text-align: center;
		}
		[data-many='true'] .wf-track {
			order: 4;
			width: 0.375rem;
			height: 100%;
		}
		[data-many='true'] .wf-lo {
			order: 5;
			text-align: center;
		}
		[data-many='true'] .wf-fill {
			left: 0;
			right: 0;
			bottom: var(--lo, 0%);
			top: calc(100% - var(--hi, 0%));
			background: linear-gradient(0deg, var(--c0), var(--c1));
		}
		[data-many='true'] [data-dot='true'] .wf-fill {
			top: auto;
			left: 50%;
			right: auto;
			width: 0.5rem;
			height: 0.5rem;
			transform: translate(-50%, 50%);
		}
		[data-many='true'] .wf-now {
			top: auto;
			left: 50%;
			bottom: var(--at);
			transform: translate(-50%, 50%);
		}
	}
</style>
