// widgets/data/gauge-value.ts: every decision the gauge makes about its data,
// pure and never throwing, so Gauge.svelte is template and CSS only.
//
// Props are model output: `value` may be "60%", "1,200", "lots" or missing,
// `max` may be 0 or "250", `height` may be "200px", `color` may be hostile.
// Every share the gauge prints goes through percentText: up to one decimal
// ("72.8%", "75%"), 100% only when value >= max, never 0% for a positive value.
// A percent scale (max 100 or 1, no currency or unit) prints that share; any
// other gauge prints the real value and a target line ("of 10,000"), plus the
// overshoot when over, and a wide-layout meta line with the share and what is
// left to go. `currency` (ISO 4217, through money) or `unit` (a plain suffix)
// is applied to every amount: value, target, over, to go and the spoken text.
// Negatives print a true minus sign. A value that does not parse reads
// "No value", never NaN.
// Full and compact strings are both returned; the component's container
// query picks one, so nothing clips.
import { finite, money, num, plain } from '../data-kit/format.js';
import { safeThemeColor } from '$lib/utils/safe-color.js';

/** Drawn dial height over its diameter for the 240 degree arc (viewBox 100 x 78). */
export const DIAL_RATIO = 0.78;
const DIAL_MIN = 88;
const DIAL_MAX = 220;
/** Longest full number before the compact form is used at every size. */
const FULL_MAX_CHARS = 11;
/** A true minus sign (U+2212): a hyphen with tabular figures reads as "- 12". */
const minus = (s: string) => s.replace(/^-/, '\u2212');

export interface GaugeInput {
	value?: unknown;
	max?: unknown;
	label?: unknown;
	title?: unknown;
	color?: unknown;
	height?: unknown;
	currency?: unknown;
	unit?: unknown;
}

export interface GaugeView {
	hasValue: boolean;
	/** Parsed numbers; `value` is 0 when there is none (for aria-valuenow). */
	value: number;
	max: number;
	mode: 'percent' | 'value';
	/** Arc fill 0..1. */
	fraction: number;
	number: string;
	/** Narrow-dial form, '' when it equals `number`. */
	numberCompact: string;
	/** "of 10,000", '' in percent mode or with no value. */
	target: string;
	targetCompact: string;
	/** "· 30 over", dropped on narrow dials. */
	over: string;
	/** Wide-layout line: the share and what is left ("42.3% · 5,772 to go"), or "150% of 120" when over. */
	meta: string;
	title: string;
	label: string;
	name: string;
	ariaText: string;
	color: string | undefined;
	/** Largest dial diameter in px the `height` cap allows. */
	diameter: number;
}

/** A finite number from a number or a string with spaces, thousands commas and a trailing % or px. */
export function parseNum(v: unknown): number | undefined {
	if (typeof v === 'string') return finite(v.replace(/[\s,]/g, '').replace(/(%|px)$/i, ''));
	return finite(v);
}

/** The one share rule: up to one decimal, 100 only at or over max, never 0 for a positive value. */
export function percentText(value: number, max: number): string {
	let r = Math.round((value / max) * 1000) / 10 || 0;
	if (value < max && r >= 100) r = 99.9;
	if (value > 0 && r <= 0) return '<0.1%';
	return `${minus(num(r, { digits: 1 }))}%`;
}

/** Full and compact amount formatters for a currency code or a unit suffix. */
function amounts(currency: unknown, unit: unknown) {
	const code = plain(currency);
	const u = plain(unit);
	const suffix = u && u !== '%' ? ` ${u}` : '';
	if (code) {
		return {
			full: (n: number) => minus(money(n, code, { whole: true })),
			compact: (n: number) => minus(money(n, code, { compact: true }))
		};
	}
	return {
		full: (n: number) => minus(num(n)) + suffix,
		compact: (n: number) => minus(num(n, { compact: true })) + suffix
	};
}

export function gaugeView(p: GaugeInput): GaugeView {
	const v = parseNum(p.value);
	const m = parseNum(p.max);
	const max = m !== undefined && m > 0 ? m : 100;
	const hasValue = v !== undefined;
	const value = v ?? 0;
	const fmt = amounts(p.currency, p.unit);
	const scaled = plain(p.currency) !== '' || (plain(p.unit) !== '' && plain(p.unit) !== '%');
	const mode = !scaled && (max === 100 || max === 1) ? 'percent' : 'value';
	const fraction = hasValue ? Math.min(1, Math.max(0, value / max)) : 0;

	const title = plain(p.title);
	const label = plain(p.label);
	const name = label || title || 'Gauge';

	let number = 'No value';
	let numberCompact = '';
	let target = '';
	let targetCompact = '';
	let over = '';
	let meta = '';
	let spoken = 'No value';
	if (hasValue && mode === 'percent') {
		number = percentText(value, max);
		spoken = number.replace('<', 'less than ').replace('%', ' percent');
	} else if (hasValue) {
		const full = fmt.full(value);
		const compact = fmt.compact(value);
		number = full.length > FULL_MAX_CHARS ? compact : full;
		numberCompact = compact !== number ? compact : '';
		target = `of ${fmt.full(max)}`;
		const tc = `of ${fmt.compact(max)}`;
		targetCompact = tc !== target ? tc : '';
		const extra = value > max ? fmt.full(value - max) : '';
		over = extra ? `· ${extra} over` : '';
		const pct = percentText(value, max);
		meta = value < max ? `${pct} · ${fmt.full(max - value)} to go` : `${pct} ${target}`;
		spoken = `${full} ${target}${extra ? `, ${extra} over` : ''}`;
	}

	const h = parseNum(p.height);
	const cap = h !== undefined && h > 0 ? h : 200;
	const diameter = Math.round(Math.min(DIAL_MAX, Math.max(DIAL_MIN, cap / DIAL_RATIO)));

	return {
		hasValue,
		value,
		max,
		mode,
		fraction,
		number,
		numberCompact,
		target,
		targetCompact,
		over,
		meta,
		title,
		label,
		name,
		ariaText: name === 'Gauge' ? spoken : `${spoken}, ${name}`,
		color: safeThemeColor(p.color),
		diameter
	};
}
