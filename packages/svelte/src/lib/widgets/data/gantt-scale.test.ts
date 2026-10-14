// gantt-scale.test.ts: the gantt widget's pure half. Messy model rows (spec 05
// of the polish brief), range padding, tick step-up so a long range never
// prints hours, label spacing, and the text the rows read out.
import { describe, expect, it } from 'vitest';
import {
	afterText,
	frac,
	overallPercent,
	parseProgress,
	labelPx,
	parseTasks,
	placeToday,
	rangeOf,
	rowDates,
	rowLabel,
	scaleOf,
	spanText
} from './gantt-scale.js';

const D = (s: string) => Date.parse(s);

const ODD = [
	{ id: 'a', name: 'Survey vendors', start: '2026-09-01', end: '2026-09-09' },
	{ id: 'b', name: 'Shortlist', start: '2026-09-08', end: '2026-09-12', progress: '60%' },
	{ id: 'c', name: 'Negotiate terms', start: '2026-09-21', end: '2026-09-14', progress: 140, dependencies: 'b, z' },
	{ id: 'd', name: 'Sign contract', start: 'next Tuesday', end: '2026-09-25', progress: 0, dependencies: 'c' },
	{ id: 'e', name: '', start: '2026-09-22', end: '2026-09-30', progress: -10 },
	{ id: 'c', name: 'Onboard vendor', start: '2026-09-28T09:00:00Z', end: '2026-10-09', progress: 10, dependencies: 'c' },
	{ id: 'f', name: 'Go-live check', start: '2026-10-09', end: '2026-10-09' }
];

describe('parseTasks', () => {
	const rows = parseTasks(ODD);

	it('keeps every row, duplicates and undated ones included', () => {
		expect(rows.map((r) => r.name)).toEqual([
			'Survey vendors',
			'Shortlist',
			'Negotiate terms',
			'Sign contract',
			'Untitled task',
			'Onboard vendor',
			'Go-live check'
		]);
		expect(rows[4].untitled).toBe(true);
	});

	it('reads progress from strings, clamps it, and leaves absent as absent', () => {
		expect(rows.map((r) => r.progress)).toEqual([undefined, 60, 100, 0, 0, 10, undefined]);
		expect(parseProgress(' 42 % '.replace(' %', '%'))).toBe(42);
		expect(parseProgress('soon')).toBeUndefined();
		expect(parseProgress(NaN)).toBeUndefined();
	});

	it('swaps reversed dates, drops unparseable ones, and spots milestones', () => {
		expect(rows[2].start).toBe(D('2026-09-14'));
		expect(rows[2].end).toBe(D('2026-09-21'));
		expect(rows[3].start).toBeUndefined();
		expect(rows[3].end).toBeUndefined();
		expect(rows[5].start).toBe(D('2026-09-28T09:00:00Z'));
		expect(rows[6].milestone).toBe(true);
		expect(rows[0].milestone).toBe(false);
	});

	it('resolves dependencies to the first row of an id, ignoring unknown ids', () => {
		expect(rows[2].deps).toEqual([1]); // b, not the unknown z
		expect(rows[3].deps).toEqual([2]);
		expect(rows[5].deps).toEqual([2]); // the second c depends on the first c
	});

	it('drops self references and edges that would close a cycle', () => {
		const r = parseTasks([
			{ id: 'x', name: 'X', start: '2026-01-01', end: '2026-01-02', dependencies: 'x, y' },
			{ id: 'y', name: 'Y', start: '2026-01-02', end: '2026-01-03', dependencies: ['x'] }
		]);
		expect(r[0].deps).toEqual([1]);
		expect(r[1].deps).toEqual([]);
	});

	it('takes junk rows without throwing', () => {
		const r = parseTasks([null, 3, 'task', { name: { nested: true } }]);
		expect(r).toHaveLength(4);
		expect(r.every((x) => x.start === undefined)).toBe(true);
	});
});

describe('rangeOf', () => {
	it('is undefined with no dated rows', () => {
		expect(rangeOf(parseTasks([]))).toBeUndefined();
		expect(rangeOf(parseTasks([{ name: 'x', start: 'soon', end: 'later' }]))).toBeUndefined();
	});

	it('pads the dated span 4% a side and skips undated rows', () => {
		const r = rangeOf(parseTasks(ODD))!;
		expect(r.start).toBe(D('2026-09-01'));
		expect(r.end).toBe(D('2026-10-09'));
		const pad = (r.end - r.start) * 0.04;
		expect(r.min).toBeCloseTo(r.start - pad);
		expect(r.max).toBeCloseTo(r.end + pad);
	});

	it('gives a lone milestone a span to sit in', () => {
		const r = rangeOf(parseTasks([{ name: 'Ship', start: '2026-08-24', end: '2026-08-24' }]))!;
		expect(r.max - r.min).toBeGreaterThan(0);
		expect(r.min).toBeLessThan(r.start);
	});
});

describe('scaleOf', () => {
	const EXTREME = parseTasks([
		{ name: 'Program', start: '2025-03-01', end: '2028-02-29' },
		{ name: 'Permit', start: '2026-10-14', end: '2026-10-14' }
	]);

	it('steps Quarter Day over three years up to quarters or years, never hours or days', () => {
		const r = rangeOf(EXTREME)!;
		for (const [w, gap, max] of [
			[600, 44, Infinity],
			[340, 64, 4]
		] as const) {
			const s = scaleOf(r, 'Quarter Day', w, { minGap: gap, maxLabels: max });
			expect(['quarter', 'year']).toContain(s.unit);
			expect(s.labels.length).toBeGreaterThan(1);
			expect(s.labels.length).toBeLessThanOrEqual(max);
			for (const l of s.labels) expect(l.text).toMatch(/^(Q\d )?\d{4}$/);
		}
	});

	it('keeps labels apart and inside the track', () => {
		const r = rangeOf(EXTREME)!;
		for (const w of [200, 340, 480, 700]) {
			const s = scaleOf(r, 'Day', w);
			const xs = s.labels.map((l) => l.x * w);
			for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(44);
			for (const l of s.labels) {
				const from = l.x * w - (l.end ? labelPx(l.text) : 0);
				expect(from).toBeGreaterThanOrEqual(0);
				expect(from + labelPx(l.text)).toBeLessThanOrEqual(w);
			}
			expect(s.lines.length).toBeLessThan(w / 6);
		}
	});

	it('uses hour ticks for Quarter Day only on a short range', () => {
		const r = rangeOf(parseTasks([{ name: 'Kickoff', start: '2026-06-08', end: '2026-06-10' }]))!;
		expect(scaleOf(r, 'Quarter Day', 2000).unit).toBe('h6');
		expect(scaleOf(r, 'Day', 600).unit).toBe('day');
		expect(scaleOf(r, 'Day', 600).labels.map((l) => l.text)).toEqual(['Mon 8', 'Tue 9', 'Wed 10']);
	});

	it('labels months with the year at a year boundary', () => {
		const r = rangeOf(parseTasks([{ name: 'Run', start: '2026-08-03', end: '2027-02-15' }]))!;
		const texts = scaleOf(r, 'Month', 480).labels.map((l) => l.text);
		expect(texts).toContain('Sep');
		expect(texts).toContain('Jan 2027');
	});

	it('steps by two units before the next unit, so a narrow month range keeps three labels', () => {
		const r = rangeOf(parseTasks([{ name: 'Run', start: '2026-08-03', end: '2027-01-04' }]))!;
		const s = scaleOf(r, 'Month', 300, { minGap: 64, maxLabels: 4 });
		expect(s.labels.map((l) => l.text)).toEqual(['Aug', 'Oct', 'Dec']);
	});

	it('spaces week labels evenly instead of dropping every other one', () => {
		const r = rangeOf(parseTasks([{ name: 'Run', start: '2026-07-06', end: '2026-08-28' }]))!;
		const w = 380;
		const xs = scaleOf(r, 'Week', w).labels.filter((l) => !l.end).map((l) => l.x * w);
		const gaps = xs.slice(1).map((x, i) => Math.round(x - xs[i]));
		expect(new Set(gaps).size).toBe(1);
	});

	it('centres Today on its line and drops only the tick label it overlaps', () => {
		const labels = [
			{ x: 0.1, text: 'Aug' },
			{ x: 0.3, text: 'Sep' },
			{ x: 0.5, text: 'Oct' },
			{ x: 0.7, text: 'Nov' }
		];
		const mid = placeToday(labels, 0.52, 400);
		expect(mid.align).toBe('center');
		expect(mid.labels.map((l) => l.text)).toEqual(['Aug', 'Sep', 'Nov']);
		// Clear of every tick: nothing gives way.
		expect(placeToday(labels, 0.4, 400).labels).toHaveLength(4);
		expect(placeToday(labels, 0.99, 400).align).toBe('end');
		expect(placeToday(labels, 0.01, 400).align).toBe('start');
	});

	it('keeps 2026, 2027 and 2028 beside Today on a three-year range in a phone card', () => {
		const r = rangeOf(EXTREME)!;
		const today = frac(Date.UTC(2026, 9, 14), r);
		for (const w of [296, 324]) {
			const s = scaleOf(r, 'Quarter Day', w, { minGap: 64, maxLabels: 4, minLine: 16 });
			const placed = placeToday(s.labels, today, w);
			expect(placed.labels.map((l) => l.text)).toEqual(['2026', '2027', '2028']);
		}
	});

	it('right-aligns a last tick that would cross the track end instead of dropping it', () => {
		const r = rangeOf(EXTREME)!;
		const w = 296;
		const s = scaleOf(r, 'Year', w, { minGap: 64, maxLabels: 4 });
		const last = s.labels[s.labels.length - 1];
		expect(last).toMatchObject({ text: '2028', end: true });
		for (const l of s.labels) {
			const from = l.x * w - (l.end ? labelPx(l.text) : 0);
			expect(from).toBeGreaterThanOrEqual(0);
			expect(from + labelPx(l.text)).toBeLessThanOrEqual(w);
		}
	});

	it('spaces faint lines at least minLine apart', () => {
		const r = rangeOf(parseTasks([{ name: 'Run', start: '2026-09-01', end: '2026-10-09' }]))!;
		const w = 300;
		const xs = scaleOf(r, 'Day', w, { minGap: 64, maxLabels: 4, minLine: 16 })
			.lines.map((l) => l.x * w)
			.sort((a, b) => a - b);
		for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(16);
	});

	it('keeps viewMode visible on a six-week range: day lines in Day, fewer in Week', () => {
		const r = rangeOf(parseTasks([{ name: 'A', start: '2026-05-01', end: '2026-06-15' }]))!;
		const dayLines = scaleOf(r, 'Day', 460).lines.length;
		const weekLines = scaleOf(r, 'Week', 460).lines.length;
		expect(scaleOf(r, 'Day', 460).lines.some((l) => !l.major)).toBe(true);
		const month = scaleOf(r, 'Month', 460);
		expect(dayLines).toBeGreaterThan(weekLines);
		expect(month.unit).toBe('month');
	});
});

describe('text', () => {
	const rows = parseTasks([
		{ id: '1', name: 'Design', start: '2026-05-03', end: '2026-05-10', progress: 100 },
		{ id: '2', name: 'Development', start: '2026-05-10', end: '2026-05-24', progress: 60, dependencies: '1' },
		{ id: '3', name: 'Testing', start: '2026-05-24', end: '2026-05-31', progress: 0, dependencies: '1,2' }
	]);

	it('weights the overall percent by duration', () => {
		expect(overallPercent(rows)).toBe(55);
		expect(overallPercent(parseTasks([{ name: 'x', start: '2026-01-01', end: '2026-01-02' }]))).toBeUndefined();
	});

	it('formats spans and row dates in UTC', () => {
		expect(spanText(rows[0].start!, rows[2].end!)).toBe('May 3 – May 31, 2026');
		expect(spanText(D('2025-03-01'), D('2028-02-29'))).toBe('Mar 1, 2025 – Feb 29, 2028');
		expect(rowDates(rows[1].start!, rows[1].end!)).toBe('May 10 – 24');
		expect(rowDates(D('2026-05-24'), D('2026-06-02'))).toBe('May 24 – Jun 2');
		expect(rowDates(D('2026-12-07'), D('2027-01-04'))).toBe('Dec 7, 2026 – Jan 4, 2027');
		expect(rowDates(D('2025-03-01'), D('2028-02-29'))).toBe('Mar 2025 – Feb 2028');
	});

	it('builds the accessible name and the narrow After line from data', () => {
		expect(rowLabel(rows[1], rows)).toBe('Development, May 10, 2026 to May 24, 2026, 60 percent done, after Design');
		expect(rowLabel(rows[0], rows)).toContain('done');
		expect(afterText(rows[1], rows)).toBe('After Design');
		expect(afterText(rows[2], rows)).toBe('After Design +1');
		expect(afterText(rows[0], rows)).toBe('');
	});
});
