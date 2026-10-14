// widgets/data/heatmap-scale.ts: the pure half of the heatmap widget. `sanitize`
// turns the model's cells into a row-major grid the view can trust, `scale`
// assigns every value a colour class and builds the legend, and the rest sizes
// cells, thins x labels and formats numbers. Heatmap.svelte draws the result as
// a CSS grid of DOM cells. Nothing here touches the DOM; text widths come in as
// a `Measure` so jsdom tests run without fonts.
//
// Sanitize: x/y go through plain(), so `**West**` is West and 2026 is
// the column "2026". Explicit xLabels/yLabels set the order; categories found
// only in cells are appended in first-seen order, never dropped or piled onto
// index 0. A value goes through finite(); null, "n/a" or a missing value keeps
// the position as "no data". The last numeric entry for a position wins. An
// entry with no x or no y is counted in `skipped`; a non-object drops silently.
//
// Colour: sequential data (all >= 0 or all <= 0) gets five classes on equal bins
// by magnitude; when the smallest magnitude is 0, zero is its own neutral class
// and the five cover (0, max]. Data crossing zero gets seven classes symmetric
// around 0 (edges at E/7, 3E/7, 5E/7 of E = max |v|), the negative arm warm.
// HEAT/HEAT_DARK are the percent of the hue mixed into --ripple-surface;
// status-text.test.ts measures them against both inks and the card, so change
// them only with that test.
import { finite, num, plain } from '../data-kit/format.js';
import { safeArray } from '../../utils/safe-props.js';

export const HEAT = [26, 42, 60, 78, 94] as const;
export const HEAT_DARK = [28, 42, 56, 70, 82] as const;
/** HEAT indexes used by the three diverging classes on each arm. */
export const DIV_STEPS = [1, 2, 4] as const;
/** Minimum x label pitch in px. */
export const PITCH = 28;
export const DEFAULT_HEIGHT = 280;

export type Measure = (text: string) => number;
export type Grid = { xs: string[]; ys: string[]; values: (number | undefined)[][]; skipped: number };
export type Tone = { arm: 'zero' | 'accent' | 'warm'; step: number };
export type Scale = {
	mode: 'seq' | 'div';
	tone: (v: number) => Tone;
	/** Legend swatches left to right, `mark` labels one under its swatch. */
	swatches: (Tone & { mark?: string })[];
	low: string;
	high: string;
};
export type Spot = { r: number; c: number; v: number };

/** Ordered, de-duplicated labels: explicit first, then first-seen extras. */
function axis(explicit: unknown, seen: string[]): string[] {
	const out = new Set<string>();
	for (const l of safeArray(explicit)) {
		const s = plain(l);
		if (s) out.add(s);
	}
	for (const s of seen) out.add(s);
	return [...out];
}

export function sanitize(cells: unknown, xLabels?: unknown, yLabels?: unknown): Grid {
	const seenX: string[] = [];
	const seenY: string[] = [];
	const entries: { x: string; y: string; v: number | undefined }[] = [];
	let skipped = 0;
	for (const e of safeArray(cells, { widget: 'heatmap', key: 'cells' })) {
		if (!e || typeof e !== 'object') continue;
		const o = e as Record<string, unknown>;
		const x = plain(o.x);
		const y = plain(o.y);
		if (!x || !y) {
			skipped++;
			continue;
		}
		seenX.push(x);
		seenY.push(y);
		entries.push({ x, y, v: finite(o.value) });
	}
	const xs = axis(xLabels, seenX);
	const ys = axis(yLabels, seenY);
	const xi = new Map(xs.map((s, i) => [s, i]));
	const yi = new Map(ys.map((s, i) => [s, i]));
	const values = ys.map(() => xs.map((): number | undefined => undefined));
	for (const { x, y, v } of entries) if (v !== undefined) values[yi.get(y)!][xi.get(x)!] = v;
	return { xs, ys, values, skipped };
}

/** Every finite value with its position, in reading order. */
export function spots(g: Grid): Spot[] {
	const out: Spot[] = [];
	g.values.forEach((row, r) => row.forEach((v, c) => v !== undefined && out.push({ r, c, v })));
	return out;
}

/** Lowest and highest value; ties go to the first in reading order. */
export function extremes(g: Grid): { lo: Spot; hi: Spot } | undefined {
	const all = spots(g);
	if (!all.length) return undefined;
	let lo = all[0];
	let hi = all[0];
	for (const s of all) {
		if (s.v < lo.v) lo = s;
		if (s.v > hi.v) hi = s;
	}
	return { lo, hi };
}

/** In-cell and legend figures: 2 decimals under 10, 1 above, compact past 9,999. */
export function fmt(v: number): string {
	if (Number.isInteger(v)) return Math.abs(v) > 9999 ? num(v, { compact: true }) : num(v, { digits: 0 });
	return num(v, { digits: Math.abs(v) < 10 ? 2 : 1 });
}

/** Readout figure: full precision. */
export function full(v: number): string {
	return num(v, { digits: 6 });
}

export function scale(g: Grid): Scale | undefined {
	const vals = spots(g).map((s) => s.v);
	if (!vals.length) return undefined;
	const min = Math.min(...vals);
	const max = Math.max(...vals);
	if (min < 0 && max > 0) {
		const E = Math.max(-min, max);
		const tone = (v: number): Tone => {
			const a = Math.abs(v) / E;
			if (a < 1 / 7) return { arm: 'zero', step: 0 };
			const k = a < 3 / 7 ? 0 : a < 5 / 7 ? 1 : 2;
			return { arm: v < 0 ? 'warm' : 'accent', step: DIV_STEPS[k] };
		};
		const arm = (a: 'warm' | 'accent') => DIV_STEPS.map((step) => ({ arm: a, step }));
		return {
			mode: 'div',
			tone,
			swatches: [...arm('warm').toReversed(), { arm: 'zero', step: 0, mark: '0' }, ...arm('accent')],
			low: fmt(-E),
			high: fmt(E)
		};
	}
	// Sequential by magnitude, so all-negative data darkens away from zero too.
	const neg = max <= 0 && min < 0;
	const m = (v: number) => (neg ? -v : v);
	const lo = neg ? -max : min;
	const hi = neg ? -min : max;
	const zero = lo === 0;
	const tone = (v: number): Tone => {
		const a = m(v);
		if (hi === lo) return a === 0 ? { arm: 'zero', step: 0 } : { arm: 'accent', step: 2 };
		if (zero) return a === 0 ? { arm: 'zero', step: 0 } : { arm: 'accent', step: Math.min(4, Math.ceil((a / hi) * 5) - 1) };
		return { arm: 'accent', step: Math.min(4, Math.floor(((a - lo) / (hi - lo)) * 5)) };
	};
	const ramp = HEAT.map((_, step) => ({ arm: 'accent' as const, step }));
	const sign = (n: number) => fmt(neg ? -n : n);
	if (hi === lo) return { mode: 'seq', tone, swatches: [tone(min)], low: sign(lo), high: '' };
	return { mode: 'seq', tone, swatches: zero ? [{ arm: 'zero', step: 0 }, ...ramp] : ramp, low: sign(lo), high: sign(hi) };
}

/** `height` as a max body height: a number or "<n>px", clamped to [120, 640]. */
export function maxHeight(v: unknown): number {
	const n = typeof v === 'string' ? finite(v.trim().replace(/px$/i, '')) : finite(v);
	return n === undefined || n <= 0 ? DEFAULT_HEIGHT : Math.min(640, Math.max(120, n));
}

/** Cell height for a column width: square under 12px (4px floor), else [12, 44]; 28px floor with values. */
export function cellHeight(colW: number, withValues = false): number {
	const h = colW < 12 ? Math.max(4, colW) : Math.min(44, colW);
	return withValues ? Math.max(28, h) : h;
}

/** 2px gaps, 1px once columns are under 10px wide. */
export const gapFor = (colW: number) => (colW > 0 && colW < 10 ? 1 : 2);

/**
 * Which x labels show: every Nth, N the smallest that gives a pitch of at least
 * PITCH px (and room for the widest label, up to 64px). Each shown label spans
 * its N columns, clipped at the last one.
 */
export function thin(labels: string[], colW: number, measure?: Measure): { i: number; span: number }[] {
	const gap = gapFor(colW);
	const widest = measure ? Math.max(0, ...labels.map((l) => measure(l))) + 6 : 0;
	const want = Math.min(64, Math.max(PITCH, widest));
	const n = colW > 0 ? Math.max(1, Math.ceil((want + gap) / (colW + gap))) : 1;
	const out: { i: number; span: number }[] = [];
	for (let i = 0; i < labels.length; i += n) out.push({ i, span: Math.min(n, labels.length - i) });
	// A clipped last span that cannot hold its label is dropped, not ellipsized.
	const last = out.at(-1);
	if (measure && last && out.length > 1 && measure(labels[last.i]) > last.span * (colW + gap) - gap) out.pop();
	return out;
}

/** Y labels show every Nth row once the row pitch is under a 13px label line; each spans its N rows. */
export function rowStep(cellH: number, gap: number): number {
	return cellH + gap >= 13 ? 1 : Math.ceil((13 + gap) / (cellH + gap));
}

/**
 * Whether in-cell values draw: `show` false never, true or auto when every
 * value fits its cell with 4px padding (auto also needs 40px by 28px cells).
 * All or nothing: one value that does not fit means none draw.
 */
export function valuesFit(g: Grid, colW: number, show: unknown, measure?: Measure): boolean {
	if (show === false || colW <= 0 || !measure) return false;
	if (show !== true && (colW < 40 || cellHeight(colW, true) < 28)) return false;
	return spots(g).every((s) => measure(fmt(s.v)) <= colW - 8);
}
