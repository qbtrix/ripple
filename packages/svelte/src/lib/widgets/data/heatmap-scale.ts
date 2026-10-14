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
// HEAT is the percent of the hue mixed into --ripple-surface in light; HEAT_DARK
// is the hue's alpha over whatever ground the card paints in dark, so cells and
// the zero swatch climb from the same ground. status-text.test.ts measures them
// against both inks, the card and the page ground, and keeps zero below step 1
// and every ramp in order, so change them only with that test.
//
// Labels: x labels thin to every Nth column, N grown until the shown labels fit
// whole (or a 120px box), and each sits centred on its own column, clamped to
// the grid and to its left neighbour. Display figures use a true minus sign
// and, when any value is a fraction under 10, a fixed 2 decimals (`fixed2`).
import { finite, num, plain } from '../data-kit/format.js';
import { safeArray } from '../../utils/safe-props.js';

export const HEAT = [32, 48, 64, 79, 94] as const;
export const HEAT_DARK = [28, 46, 62, 78, 94] as const;
/** HEAT indexes used by the three diverging classes on each arm. */
export const DIV_STEPS = [1, 2, 4] as const;
/** Minimum x label pitch in px. */
export const PITCH = 28;
/** Widest x label box before a label ellipsizes instead of thinning further. */
export const WIDE = 120;
/** Least space between two x labels in px. */
const LABEL_GAP = 6;
/** Footnote line height in px (theme.css --lh-footnote). */
export const LINE = 13;
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

/** A display figure with a true minus sign (U+2212) in place of the hyphen. */
export const minus = (s: string) => s.replace('-', '\u2212');

/** Whether figures under 10 print a fixed 2 decimals: some value there is a fraction. */
export function fixed2(g: Grid): boolean {
	return spots(g).some((s) => Math.abs(s.v) < 10 && !Number.isInteger(s.v));
}

/**
 * In-cell and legend figures: 2 decimals under 10 (fixed with `fixed`, so a
 * column of 0.30 and 0.38 lines up), 1 above, compact past 9,999, true minus.
 */
export function fmt(v: number, fixed = false): string {
	if (fixed && Math.abs(v) < 10) return minus(v.toFixed(2));
	if (Number.isInteger(v)) return minus(Math.abs(v) > 9999 ? num(v, { compact: true }) : num(v, { digits: 0 }));
	return minus(num(v, { digits: Math.abs(v) < 10 ? 2 : 1 }));
}

/** Full precision with a hyphen, for the hidden table; the readout wraps it in `minus`. */
export function full(v: number): string {
	return num(v, { digits: 6 });
}

export function scale(g: Grid): Scale | undefined {
	const vals = spots(g).map((s) => s.v);
	if (!vals.length) return undefined;
	const min = Math.min(...vals);
	const max = Math.max(...vals);
	const f = (v: number) => fmt(v, fixed2(g));
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
			low: f(-E),
			high: f(E)
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
	const sign = (n: number) => f(neg ? -n : n);
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

export type XLabel = { i: number; w: number; dx: number };

/**
 * Which x labels show and where. Every Nth from the first, N the smallest that
 * gives a PITCH px pitch, then grown (while two labels remain) until every shown
 * label fits its N columns whole or the box reaches WIDE px. Each label box is
 * `w` px wide, centred on its column (`dx` from that column's left edge), held
 * inside the grid (`lead` px of y label column to the left) and 6px clear of
 * the label before it. N also grows while that squeezes a label; past the
 * limits a squeezed box ellipsizes. Unmeasured (colW 0): every label, laid out
 * by CSS.
 */
export function thin(labels: string[], colW: number, measure?: Measure, lead = 0): XLabel[] {
	const nc = labels.length;
	if (colW <= 0) return labels.map((_, i) => ({ i, w: 0, dx: 0 }));
	const gap = gapFor(colW);
	const pitch = colW + gap;
	const room = (n: number) => n * pitch - gap;
	const end = nc * pitch - gap;
	// Lays out every Nth label; `squeezed` when one lost width to the grid edge or a neighbour.
	const layout = (n: number) => {
		const out: XLabel[] = [];
		let floor = -lead;
		let squeezed = false;
		for (let i = 0; i < nc; i += n) {
			const want = Math.min(room(n), measure ? measure(labels[i]) + 4 : room(n));
			const x = Math.max(floor, Math.min(i * pitch + colW / 2 - want / 2, end - want));
			const w = Math.min(want, end - x);
			if (w < want) squeezed = true;
			out.push({ i, w, dx: x - i * pitch });
			floor = x + w + LABEL_GAP;
		}
		return { out, squeezed };
	};
	let n = Math.max(1, Math.ceil((PITCH + gap) / pitch));
	if (measure) {
		const need = (m: number) => Math.max(0, ...labels.filter((_, i) => i % m === 0).map(measure)) + 6;
		while (n < Math.ceil(nc / 2) && (room(n) < Math.min(WIDE, need(n)) || layout(n).squeezed)) n++;
	}
	return layout(n).out;
}

/**
 * Rows shrink toward a floor (28px with values, else 12px or the cell width)
 * so the grid fits `room` px under the label row before the body scrolls.
 */
export function fitHeight(h: number, withValues: boolean, rows: number, gap: number, room: number): number {
	if (rows <= 0 || room <= 0) return h;
	const floor = withValues ? 28 : Math.min(h, 12);
	return Math.max(floor, Math.min(h, Math.floor((room + gap) / rows - gap)));
}

/** Whether `rows` fit `room` px at the 28px in-cell value floor; if not, values drop so rows can shrink. */
export function valueRowsFit(rows: number, gap: number, room: number): boolean {
	return room <= 0 || rows * (28 + gap) <= room + gap;
}

/** Y labels show every Nth row once the row pitch is under a label line, so N rows hold one line. */
export function rowStep(cellH: number, gap: number): number {
	return cellH + gap >= LINE ? 1 : Math.ceil(LINE / (cellH + gap));
}

/**
 * Whether in-cell values draw: `show` false never, true or auto when every
 * value fits its cell with 4px padding (auto also needs 40px by 28px cells).
 * All or nothing: one value that does not fit means none draw.
 */
export function valuesFit(g: Grid, colW: number, show: unknown, measure?: Measure): boolean {
	if (show === false || colW <= 0 || !measure) return false;
	if (show !== true && (colW < 40 || cellHeight(colW, true) < 28)) return false;
	const fixed = fixed2(g);
	return spots(g).every((s) => measure(fmt(s.v, fixed)) <= colW - 8);
}
