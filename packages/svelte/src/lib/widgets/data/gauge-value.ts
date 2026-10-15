// widgets/data/gauge-value.ts: every decision the gauge makes about its data,
// pure and never throwing, so Gauge.svelte is template and CSS only.
//
// Props are model output: `value` may be "60%", "1,200", "lots" or missing,
// `max` may be 0 or "250", `height` may be "200px", `color` may be hostile.
// A percent scale (max 100 or 1) prints a percent with two rounding guards
// (100% only when value >= max, never 0% for a positive value); any other max
// prints the real value and a target line ("of 10,000"), plus the overshoot in
// words when over. A value that does not parse reads "No value", never NaN.
// Full and compact strings are both returned; the component's container
// query picks one, so nothing clips.
import { finite, num, plain } from '../data-kit/format.js';
import { safeThemeColor } from '$lib/utils/safe-color.js';

/** Drawn dial height over its diameter for the 240 degree arc (viewBox 100 x 78). */
export const DIAL_RATIO = 0.78;
const DIAL_MIN = 88;
const DIAL_MAX = 220;
/** Longest full number before the compact form is used at every size. */
const FULL_MAX_CHARS = 11;

export interface GaugeInput {
	value?: unknown;
	max?: unknown;
	label?: unknown;
	title?: unknown;
	color?: unknown;
	height?: unknown;
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
	/** Wide-layout line stating the scale in words ("42% of 10,000"). */
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

/** Integer percent with the guards: 100 only at or over max, never 0 for a positive value. */
export function percentText(value: number, max: number): string {
	const pct = (value / max) * 100;
	let r = Math.round(pct) || 0;
	if (value < max && r >= 100) r = 99;
	if (value > 0 && r <= 0) return '<1%';
	return `${num(r)}%`;
}

export function gaugeView(p: GaugeInput): GaugeView {
	const v = parseNum(p.value);
	const m = parseNum(p.max);
	const max = m !== undefined && m > 0 ? m : 100;
	const hasValue = v !== undefined;
	const value = v ?? 0;
	const mode = max === 100 || max === 1 ? 'percent' : 'value';
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
		spoken = number.replace('<1%', 'less than 1 percent').replace('%', ' percent');
	} else if (hasValue) {
		const full = num(value);
		const compact = num(value, { compact: true });
		number = full.length > FULL_MAX_CHARS ? compact : full;
		numberCompact = compact !== number ? compact : '';
		target = `of ${num(max)}`;
		const tc = `of ${num(max, { compact: true })}`;
		targetCompact = tc !== target ? tc : '';
		const extra = value > max ? num(value - max) : '';
		over = extra ? `· ${extra} over` : '';
		meta = `${percentText(value, max)} ${target}`;
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
