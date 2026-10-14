// heatmap-scale.test.ts: the heatmap's pure rules against messy model data:
// axis order and appends, last-wins duplicates, no-data values, the skipped
// count, colour classes (sequential, zero swatch, diverging), label thinning,
// in-cell value fitting, number formats and height parsing.
import { describe, expect, test } from 'vitest';
import { sanitize, scale, extremes, fmt, full, maxHeight, cellHeight, thin, rowStep, valuesFit, gapFor, HEAT, DIV_STEPS } from './heatmap-scale.js';

// Spec 05 of the polish brief.
const HOSTILE = [
	{ x: 'Q1', y: 'North', value: 120 },
	{ x: 'Q2', y: 'North', value: '95' },
	{ x: 'Q3', y: 'North', value: null },
	{ x: 'Q4', y: 'North', value: 140 },
	{ x: 'Q1', y: 'South', value: 60 },
	{ x: 'Q2', y: 'South', value: 'n/a' },
	{ x: 'Q2', y: 'South', value: 75 },
	{ x: 'Q5', y: 'South', value: 88 },
	{ x: 'Q1', y: 'East' },
	{ x: 'Q3', y: 'East', value: 0 },
	{ x: 'Q4', value: 50 },
	{ x: 2026, y: 'West', value: 33 },
	{ y: 'West', value: 12 },
	'not a cell',
	{ x: 'Q4', y: '**West**', value: 41 }
];
const XL = ['Q1', 'Q2', 'Q3', 'Q4', 'Q6'];
const YL = ['North', 'South', 'East', 'West', 'Central'];
const at = (g: ReturnType<typeof sanitize>, y: string, x: string) => g.values[g.ys.indexOf(y)][g.xs.indexOf(x)];

describe('sanitize', () => {
	const g = sanitize(HOSTILE, XL, YL);
	test('explicit order first, unknown categories appended in first-seen order', () => {
		expect(g.xs).toEqual(['Q1', 'Q2', 'Q3', 'Q4', 'Q6', 'Q5', '2026']);
		expect(g.ys).toEqual(['North', 'South', 'East', 'West', 'Central']);
	});
	test('values land where they belong, nothing piles onto the first column', () => {
		expect(at(g, 'North', 'Q2')).toBe(95);
		expect(at(g, 'North', 'Q3')).toBeUndefined();
		expect(at(g, 'South', 'Q2')).toBe(75);
		expect(at(g, 'South', 'Q5')).toBe(88);
		expect(at(g, 'West', 'Q4')).toBe(41);
		expect(at(g, 'West', '2026')).toBe(33);
		expect(at(g, 'East', 'Q1')).toBeUndefined();
		expect(at(g, 'East', 'Q3')).toBe(0);
		expect(g.values.map((row) => row[0])).toEqual([120, 60, undefined, undefined, undefined]);
		expect(g.values[4].every((v) => v === undefined)).toBe(true);
	});
	test('entries with no row or column are counted, non-objects drop silently', () => {
		expect(g.skipped).toBe(2);
	});
	test('last numeric entry wins; a later junk value does not erase a number', () => {
		const d = sanitize([{ x: 'a', y: 'r', value: 1 }, { x: 'a', y: 'r', value: 9 }, { x: 'a', y: 'r', value: 'n/a' }]);
		expect(d.values).toEqual([[9]]);
	});
	test('junk input is an empty grid', () => {
		expect(sanitize(null)).toEqual({ xs: [], ys: [], values: [], skipped: 0 });
		expect(sanitize('x', 5, { a: 1 }).xs).toEqual([]);
	});
});

describe('extremes', () => {
	test('ties go to the first cell in reading order', () => {
		const g = sanitize([{ x: 'b', y: 'r1', value: 5 }, { x: 'a', y: 'r1', value: 5 }, { x: 'a', y: 'r2', value: 5 }]);
		expect(extremes(g)!.hi).toEqual({ r: 0, c: 0, v: 5 });
	});
});

const seq = (vals: number[]) => scale(sanitize(vals.map((value, i) => ({ x: String(i), y: 'r', value }))))!;
const m = (s: string) => s.length * 6;

describe('scale', () => {
	test('zero gets the neutral swatch when the data starts at zero; an outlier leaves the rest in class 1', () => {
		const s = seq([0, 1, 9, 4800]);
		expect(s.mode).toBe('seq');
		expect(s.tone(0)).toEqual({ arm: 'zero', step: 0 });
		expect(s.tone(1)).toEqual({ arm: 'accent', step: 0 });
		expect(s.tone(9)).toEqual({ arm: 'accent', step: 0 });
		expect(s.tone(4800)).toEqual({ arm: 'accent', step: 4 });
		expect(s.swatches.map((w) => w.arm)).toEqual(['zero', 'accent', 'accent', 'accent', 'accent', 'accent']);
		expect([s.low, s.high]).toEqual(['0', '4,800']);
	});
	test('five equal bins from min to max without a zero swatch', () => {
		const s = seq([12, 18, 22, 25]);
		expect([12, 18, 22, 25].map((v) => s.tone(v).step)).toEqual([0, 2, 3, 4]);
		expect(s.swatches).toHaveLength(HEAT.length);
		expect([s.low, s.high]).toEqual(['12', '25']);
	});
	test('one distinct value takes the middle class and shows once', () => {
		const s = seq([7, 7]);
		expect(s.tone(7)).toEqual({ arm: 'accent', step: 2 });
		expect(s.swatches).toHaveLength(1);
		expect([s.low, s.high]).toEqual(['7', '']);
	});
	test('data crossing zero is diverging, seven classes symmetric around 0', () => {
		const s = seq([-0.94, 0.1, 0.2, 0.5, 0.8, 1]);
		expect(s.mode).toBe('div');
		expect(s.tone(0.1)).toEqual({ arm: 'zero', step: 0 });
		expect(s.tone(0.2)).toEqual({ arm: 'accent', step: DIV_STEPS[0] });
		expect(s.tone(0.5)).toEqual({ arm: 'accent', step: DIV_STEPS[1] });
		expect(s.tone(0.8)).toEqual({ arm: 'accent', step: DIV_STEPS[2] });
		expect(s.tone(-0.94)).toEqual({ arm: 'warm', step: DIV_STEPS[2] });
		expect(s.swatches.map((w) => w.arm)).toEqual(['warm', 'warm', 'warm', 'zero', 'accent', 'accent', 'accent']);
		expect(s.swatches[3].mark).toBe('0');
		expect([s.low, s.high]).toEqual(['-1', '1']);
	});
	test('all-negative data darkens away from zero', () => {
		const s = seq([-50, -10, 0]);
		expect(s.mode).toBe('seq');
		expect(s.tone(0).arm).toBe('zero');
		expect(s.tone(-50).step).toBe(4);
		expect([s.low, s.high]).toEqual(['0', '-50']);
	});
	test('no finite value is no scale', () => {
		expect(scale(sanitize([{ x: 'a', y: 'b', value: null }]))).toBeUndefined();
	});
});

describe('format', () => {
	test('cells: 2 decimals under 10, 1 above, compact past 9,999', () => {
		expect([fmt(0.846647), fmt(-0.94), fmt(12.345), fmt(25), fmt(12800), fmt(4800)]).toEqual(['0.85', '-0.94', '12.3', '25', '12.8K', '4,800']);
	});
	test('readout keeps full precision', () => {
		expect(full(0.846647)).toBe('0.846647');
	});
});

describe('sizing', () => {
	test('height is a max, a number or "<n>px", clamped, else 280', () => {
		expect([maxHeight(undefined), maxHeight(160), maxHeight('300px'), maxHeight('tall'), maxHeight(40), maxHeight(5000), maxHeight(-1)]).toEqual([280, 160, 300, 280, 120, 640, 280]);
	});
	test('cells are square under 12px, else clamped to [12, 44], 28 with values', () => {
		expect([cellHeight(5), cellHeight(2), cellHeight(20), cellHeight(140), cellHeight(20, true)]).toEqual([5, 4, 20, 44, 28]);
		expect([gapFor(5), gapFor(20)]).toEqual([1, 2]);
	});
	test('x labels thin to every Nth so the pitch reaches 28px, spans clipped at the end', () => {
		const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
		expect(thin(hours, 30).every((l) => l.span === 1)).toBe(true);
		const t = thin(hours, 11);
		expect(t.map((l) => l.i)).toEqual([0, 3, 6, 9, 12, 15, 18, 21]);
		expect(thin(['a', 'b', 'c', 'd', 'e'], 11).at(-1)).toEqual({ i: 3, span: 2 });
		// A wide measured label asks for more room, up to 64px.
		expect(thin(['September 2026', 'October 2026'], 40, (s) => s.length * 6)[0].span).toBe(2);
		expect(thin(hours, 0)).toHaveLength(24);
	});
	test('a clipped last x label that cannot fit is dropped', () => {
		const weeks = Array.from({ length: 53 }, (_, i) => `W${i + 1}`);
		const t = thin(weeks, 5, (s) => s.length * 6);
		expect(t.at(-1)).toEqual({ i: 45, span: 5 });
		expect(thin(weeks, 12, (s) => s.length * 6).at(-1)).toEqual({ i: 51, span: 2 });
	});
	test('y labels thin once rows are shorter than a label line', () => {
		expect([rowStep(20, 2), rowStep(12, 2), rowStep(5, 1)]).toEqual([1, 1, 3]);
	});
	test('in-cell values are all or nothing', () => {
		const g = sanitize([{ x: 'a', y: 'r', value: 5 }, { x: 'b', y: 'r', value: 120 }]);
		expect(valuesFit(g, 60, undefined, m)).toBe(true);
		expect(valuesFit(g, 30, undefined, m)).toBe(false);
		expect(valuesFit(g, 30, true, m)).toBe(true);
		expect(valuesFit(g, 24, true, m)).toBe(false);
		expect(valuesFit(g, 60, false, m)).toBe(false);
		expect(valuesFit(g, 60, true, undefined)).toBe(false);
	});
});
