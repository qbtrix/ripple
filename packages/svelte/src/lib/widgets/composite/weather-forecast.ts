// widgets/composite/weather-forecast.ts: the data side of the weather-forecast
// widget. Turns model props (possibly half-streamed) into a clean forecast:
// a condition word becomes one of ten icon kinds (unknown reads as cloudy),
// temperatures convert between C and F, and the week's low..high span gives
// each day's range bar its start and end as percentages.
//
// Invariants:
// - Every reader survives `{}`, missing fields and junk; lists are capped
//   (14 days, 48 hours) so a runaway model cannot grow the DOM.
// - Icons are picked by kind from trusted constants in WeatherIcon.svelte;
//   nothing here passes model text into markup.
import { finite, plain } from '../data-kit/format.js';
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
	const n = finite(v);
	return n === undefined ? undefined : Math.min(Math.max(Math.round(n), 0), 100);
};

/** "2026-10-13" → "Tue"; anything else as written, trimmed. */
export function dayLabel(v: unknown): string {
	const s = plain(v).trim();
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
	if (!m) return s.slice(0, 24);
	return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-GB', { weekday: 'short' });
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
	return list(v)
		.slice(0, MAX_DAYS)
		.map((x) => {
			const r = rec(x);
			const kind = toKind(r.condition);
			let high = finite(r.high);
			let low = finite(r.low);
			if (high !== undefined && low !== undefined && low > high) [high, low] = [low, high];
			return {
				day: dayLabel(r.day),
				kind,
				label: label(r.condition, kind),
				high,
				low,
				rain: pct(r.rainChance),
				sunrise: plain(r.sunrise).trim().slice(0, 8),
				sunset: plain(r.sunset).trim().slice(0, 8)
			};
		});
}

export function readHours(v: unknown): Hour[] {
	return list(v)
		.slice(0, MAX_HOURS)
		.map((x) => {
			const r = rec(x);
			return { time: plain(r.time).trim().slice(0, 8), temp: finite(r.temp), kind: toKind(r.condition), rain: pct(r.rainChance) };
		});
}

/** The week's lowest low and highest high, for the range bars. */
export function span(days: Day[]): [number, number] | undefined {
	const ts = days.flatMap((d) => [d.low, d.high]).filter((t): t is number => t !== undefined);
	if (!ts.length) return undefined;
	return [Math.min(...ts), Math.max(...ts)];
}

/** Where `t` sits in the span, 0 to 100. */
export function at(t: number, [lo, hi]: [number, number]): number {
	return hi === lo ? 50 : Math.min(Math.max(((t - lo) / (hi - lo)) * 100, 0), 100);
}

/** One line on the days ahead: which days are wet, or that it stays dry. */
export function outlook(days: Day[]): string {
	if (!days.length) return '';
	const wet = days.filter((d) => (d.rain ?? 0) >= 50 || ['rain', 'heavy-rain', 'thunder', 'snow'].includes(d.kind));
	if (!wet.length) return days.length > 1 ? `Dry for the next ${days.length} days.` : 'Dry.';
	const names = wet.slice(0, 3).map((d) => d.day);
	const more = wet.length > 3 ? ` and ${wet.length - 3} more` : '';
	return `${wet.some((d) => d.kind === 'snow') ? 'Snow or rain' : 'Rain'} likely on ${names.join(', ')}${more}.`;
}
