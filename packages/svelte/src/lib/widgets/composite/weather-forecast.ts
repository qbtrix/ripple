// widgets/composite/weather-forecast.ts: the data side of the weather-forecast
// widget. Turns model props (possibly half-streamed) into a clean forecast:
// a condition word becomes one of ten icon kinds (unknown reads as cloudy),
// temperatures convert between C and F, percentages accept "78%", full
// weekday names (and a leading one in free text) shorten to three letters,
// ISO days carry a short date when weekdays would repeat, the week's span
// (stretched to hold the current temperature) places each range bar, `ramp`
// maps a temperature to its spot on the cool-to-warm bar colour, and
// `bucketHours` thins a long hourly list to the columns that fit, keeping the
// worst sky and the wettest chance of each bucket, labelled at the worst hour
// and cued with the weekday when the hours roll past midnight.
//
// Invariants:
// - Every reader survives `{}`, missing fields and junk; lists are capped
//   (14 days, 48 hours) and text is capped generously, never cut short
//   mid-word: the component wraps it or ellipsizes it with a `title`.
// - Icons are picked by kind from trusted constants in WeatherIcon.svelte;
//   nothing here passes model text into markup.
import { finite, percent, plain } from '../data-kit/format.js';
import { list, rec } from './recipe.js';

export const MAX_DAYS = 14;
export const MAX_HOURS = 48;

export const KINDS = ['sunny', 'partly-cloudy', 'cloudy', 'rain', 'heavy-rain', 'thunder', 'snow', 'fog', 'wind', 'night-clear'] as const;
export type Kind = (typeof KINDS)[number];
export type Unit = 'C' | 'F';

const KIND_WORDS: Record<Kind, string> = {
	sunny: 'Sunny',
	'partly-cloudy': 'Partly cloudy',
	cloudy: 'Cloudy',
	rain: 'Rain',
	'heavy-rain': 'Heavy rain',
	thunder: 'Thunderstorms',
	snow: 'Snow',
	fog: 'Fog',
	wind: 'Windy',
	'night-clear': 'Clear'
};

/** "Light showers" → rain, "Partly sunny" → partly-cloudy, "???" → cloudy. */
export function toKind(v: unknown): Kind {
	const s = plain(v).toLowerCase().trim();
	if ((KINDS as readonly string[]).includes(s)) return s as Kind;
	if (/thunder|storm|lightning/.test(s)) return 'thunder';
	if (/snow|sleet|flurr|blizzard|hail/.test(s)) return 'snow';
	if (/heavy|downpour|pouring|torrential/.test(s) && /rain|shower|pour/.test(s)) return 'heavy-rain';
	if (/rain|shower|drizzle/.test(s)) return 'rain';
	if (/fog|mist|haze|smog/.test(s)) return 'fog';
	if (/wind|breez|gust|gale/.test(s)) return 'wind';
	if (/partly|partial|mostly sunny|few clouds|scattered|intervals|sun and cloud/.test(s)) return 'partly-cloudy';
	if (/night|moon/.test(s) && /clear/.test(s)) return 'night-clear';
	if (/sun|clear|fair|bright/.test(s)) return 'sunny';
	return 'cloudy';
}

export const kindWord = (k: Kind) => KIND_WORDS[k];

export const toUnit = (v: unknown): Unit => (String(v).trim().toUpperCase().startsWith('F') ? 'F' : 'C');

/** A temperature given in `from`, shown in `to`, rounded. */
export function convert(t: number, from: Unit, to: Unit): number {
	if (from === to) return Math.round(t);
	return Math.round(to === 'F' ? (t * 9) / 5 + 32 : ((t - 32) * 5) / 9);
}

const pct = (v: unknown) => {
	const n = percent(v);
	return n === undefined ? undefined : Math.round(n);
};

const ISO = /^(\d{4})-(\d{2})-(\d{2})/;
const isoDate = (s: string) => {
	const m = ISO.exec(s);
	return m ? new Date(+m[1], +m[2] - 1, +m[3]) : undefined;
};
const WEEKDAY = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const MONTH = /\b(january|february|march|april|june|july|august|september|october|november|december)\b/gi;
const short = (w: string) => w[0].toUpperCase() + w.slice(1, 3).toLowerCase();

/**
 * "2026-10-13" → "Tue", "wednesday" → "Wed", "Saturday 17 October (x)" →
 * "Sat 17 Oct (x)"; anything else as written, trimmed and capped.
 */
export function dayLabel(v: unknown): string {
	const s = plain(v).trim();
	const d = isoDate(s);
	if (d) return d.toLocaleDateString('en-GB', { weekday: 'short' });
	const w = WEEKDAY.exec(s);
	if (w) return (short(w[1]) + s.slice(w[1].length).replace(MONTH, short)).slice(0, 40);
	return s.slice(0, 40);
}

export interface Now {
	temp?: number;
	kind: Kind;
	label: string;
	feelsLike?: number;
	humidity?: number;
	wind: string;
}
export interface Day {
	day: string;
	/** The day in full ("Thursday 15 October" for an ISO date), for the title and accessible name. */
	full: string;
	/** "23 Oct", only for ISO days when weekdays would repeat (8+ days or a repeat). */
	date?: string;
	kind: Kind;
	label: string;
	high?: number;
	low?: number;
	rain?: number;
	sunrise: string;
	sunset: string;
}
export interface Hour {
	time: string;
	temp?: number;
	kind: Kind;
	rain?: number;
	/** A folded bucket's full span, "22:00 to 05:00". */
	span?: string;
	/** The weekday, on the first column past each midnight. */
	cue?: string;
}

const label = (raw: unknown, k: Kind) => {
	const s = plain(raw).trim().slice(0, 40);
	return !s || (KINDS as readonly string[]).includes(s.toLowerCase()) ? kindWord(k) : s;
};

export function readNow(v: unknown): Now | undefined {
	const r = rec(v);
	if (!Object.keys(r).length) return undefined;
	const kind = toKind(r.condition);
	const wind = typeof r.wind === 'number' ? `${Math.round(r.wind)} km/h` : plain(r.wind).trim().slice(0, 24);
	return { temp: finite(r.temp), kind, label: label(r.condition, kind), feelsLike: finite(r.feelsLike), humidity: pct(r.humidity), wind };
}

export function readDays(v: unknown): Day[] {
	const rows = list(v)
		.slice(0, MAX_DAYS)
		.map((x, i) => {
			const r = rec(x);
			const kind = toKind(r.condition);
			let high = finite(r.high);
			let low = finite(r.low);
			if (high !== undefined && low !== undefined && low > high) [high, low] = [low, high];
			const raw = plain(r.day).trim();
			const iso = isoDate(raw);
			return {
				day: dayLabel(raw) || `Day ${i + 1}`,
				full: iso?.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) ?? (raw.slice(0, 40) || `Day ${i + 1}`),
				date: iso?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
				kind,
				label: label(r.condition, kind),
				high,
				low,
				rain: pct(r.rainChance),
				sunrise: plain(r.sunrise).trim().slice(0, 24),
				sunset: plain(r.sunset).trim().slice(0, 24)
			};
		});
	const names = rows.map((d) => d.day);
	const repeats = rows.length >= 8 || new Set(names).size < names.length;
	return rows.map((d) => (repeats ? d : { ...d, date: undefined }));
}

export function readHours(v: unknown): Hour[] {
	return list(v)
		.slice(0, MAX_HOURS)
		.map((x) => {
			const r = rec(x);
			return { time: plain(r.time).trim().slice(0, 24), temp: finite(r.temp), kind: toKind(r.condition), rain: pct(r.rainChance) };
		});
}

/**
 * The week's lowest low and highest high, for the range bars. A current
 * temperature at or past either end stretches the scale a little beyond it
 * (at least 1 degree), so the now dot sits on the track, never off its end.
 */
export function span(days: Day[], now?: number): [number, number] | undefined {
	const ts = days.flatMap((d) => [d.low, d.high]).filter((t): t is number => t !== undefined);
	if (!ts.length) return now === undefined ? undefined : [now, now];
	let lo = Math.min(...ts);
	let hi = Math.max(...ts);
	if (now === undefined) return [lo, hi];
	const pad = Math.max(1, (Math.max(hi, now) - Math.min(lo, now)) * 0.04);
	if (now <= lo) lo = now - pad;
	if (now >= hi) hi = now + pad;
	return [lo, hi];
}

/** Where `t` sits in the span, 0 to 100. */
export function at(t: number, [lo, hi]: [number, number]): number {
	return hi === lo ? 50 : Math.min(Math.max(((t - lo) / (hi - lo)) * 100, 0), 100);
}

// The bar colour ramp: COLD_C and below is the cool end (the info hue), WARM_C
// and above the warm end (the warning hue), so the same temperature is the
// same colour on every row, in both units. The CSS mixes it in oklch in
// thirds, blue to teal to yellow to amber, so 15 to 20 °C reads teal, green,
// yellow and keeps its chroma (5 °C blue, 25 °C amber-yellow).
export const COLD_C = 4;
export const WARM_C = 28;

/** Where a temperature in °C sits on the colour ramp, 0 (cool) to 100 (warm). */
export function ramp(tempC: number): number {
	return Math.round(Math.min(Math.max((tempC - COLD_C) / (WARM_C - COLD_C), 0), 1) * 100);
}

const SEVERITY: Kind[] = ['thunder', 'heavy-rain', 'snow', 'rain', 'fog', 'wind', 'cloudy', 'partly-cloudy', 'sunny', 'night-clear'];

/** "14:00", "2 PM", "3am" → minutes past midnight; other text → undefined. */
function clock(s: string): number | undefined {
	const m = /^(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?m\.?)?$/i.exec(s);
	if (!m) return undefined;
	const h = m[3] ? (+m[1] % 12) + (m[3].toLowerCase() === 'p' ? 12 : 0) : +m[1];
	return h * 60 + +(m[2] ?? 0);
}

/**
 * At most `fit` columns: every k-th hour with the skipped hours folded in.
 * A bucket shows its most severe hour (the first one when none is worse),
 * with that hour's time and temperature, and the highest rain chance, so a
 * lone storm hour is never thinned away or shown at the wrong time; `span`
 * holds the bucket's full range. When clock times run backwards the hours
 * have passed midnight: the first column of each new day gets a `cue`, its
 * weekday from `dayNames` (row n of the days), or "Day n".
 */
export function bucketHours(hours: Hour[], fit: number, dayNames: string[] = []): Hour[] {
	const k = Math.max(1, Math.ceil(hours.length / Math.max(1, Math.floor(fit))));
	let day = 0;
	let prev: number | undefined;
	const dayOf = hours.map((h) => {
		const c = clock(h.time);
		if (c !== undefined) {
			if (prev !== undefined && c < prev) day++;
			prev = c;
		}
		return day;
	});
	const out: Hour[] = [];
	let shownDay = 0;
	for (let i = 0; i < hours.length; i += k) {
		const b = hours.slice(i, i + k);
		const w = b.reduce((w, h, j) => (SEVERITY.indexOf(h.kind) < SEVERITY.indexOf(b[w].kind) ? j : w), 0);
		const rains = b.map((h) => h.rain).filter((r): r is number => r !== undefined);
		const d = dayOf[i + w];
		const name = dayNames[d];
		const col: Hour = { time: b[w].time, temp: b[w].temp, kind: b[w].kind, rain: rains.length ? Math.max(...rains) : undefined };
		if (b.length > 1) col.span = `${b[0].time || '–'} to ${b[b.length - 1].time || '–'}`;
		if (d > shownDay) col.cue = name && /^[A-Z][a-z]{2}$/.test(name) ? name : `Day ${d + 1}`;
		shownDay = d;
		out.push(col);
	}
	return out;
}

/** One line on the days ahead: which days are wet, or that it stays dry. Day 1 reads "today", as its row does. */
export function outlook(days: Day[]): string {
	if (!days.length) return '';
	const wet = days.filter((d) => (d.rain ?? 0) >= 50 || ['rain', 'heavy-rain', 'thunder', 'snow'].includes(d.kind));
	if (!wet.length) return days.length > 1 ? `Dry for the next ${days.length} days.` : 'Dry.';
	const names = wet.slice(0, 3).map((d) => (d === days[0] ? 'today' : d.day));
	if (wet.length > 3) names.push(`${wet.length - 3} more`);
	const on = names[0] === 'today' ? '' : 'on ';
	return `${wet.some((d) => d.kind === 'snow') ? 'Snow or rain' : 'Rain'} likely ${on}${new Intl.ListFormat('en-GB').format(names)}.`;
}
