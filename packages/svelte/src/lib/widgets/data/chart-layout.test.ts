// chart-layout.test.ts: the pure rules behind Chart.svelte's colours, axis
// labels and pie legend, plus the option Chart.svelte hands echarts for them
// (echarts is mocked, so the assertions read the option itself).

import { render } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import Chart from './Chart.svelte';
import { CATEGORICAL, fitAxisLabels, pieLayout, pointColors, seriesColor, sliceLegendText } from './chart-layout.js';

const ec = vi.hoisted(() => ({ setOption: vi.fn() }));
vi.mock('echarts', () => ({
	init: () => ({ setOption: ec.setOption, resize: () => {}, dispose: () => {} })
}));

let boxWidth = 300;
class SizedResizeObserver {
	constructor(private cb: ResizeObserverCallback) {}
	observe() {
		this.cb([{ contentRect: { width: boxWidth, height: 200 } } as ResizeObserverEntry], this as never);
	}
	disconnect() {}
	unobserve() {}
}

beforeEach(() => {
	boxWidth = 300;
	vi.stubGlobal('ResizeObserver', SizedResizeObserver);
	ec.setOption.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

async function optionFor(props: Record<string, unknown>) {
	render(Chart, { props: props as never });
	await vi.waitFor(() => expect(ec.setOption).toHaveBeenCalled());
	return ec.setOption.mock.lastCall![0];
}

const STATUS = ['#ef4444', '#22c55e'];

describe('palette order', () => {
	test('brand first, then a categorical hue; no status colour in the palette', () => {
		expect(CATEGORICAL[0]).toBe('#3b82f6');
		for (const c of STATUS) expect(CATEGORICAL).not.toContain(c);
		expect(seriesColor(0, [])).toBe(CATEGORICAL[0]);
		expect(seriesColor(1, [])).toBe(CATEGORICAL[1]);
		expect(seriesColor(1, ['#111', '#222'])).toBe('#222');
	});

	test('a two-series bar chart: the second series is the second palette hue, not red', async () => {
		const option = await optionFor({
			type: 'bar',
			data: [
				{ label: 'W1', series: { Actual: 1, 'Target pace': 0.8 } },
				{ label: 'W2', series: { Actual: 2, 'Target pace': 1.6 } }
			]
		});
		expect(option.series.map((s: { itemStyle: { color: string } }) => s.itemStyle.color)).toEqual([CATEGORICAL[0], CATEGORICAL[1]]);
	});

	test('a reference series draws muted and dashed and takes no palette slot', async () => {
		const option = await optionFor({
			type: 'line',
			reference: 'Target',
			data: [
				{ label: 'W1', series: { Target: 1, Actual: 1.2, Forecast: 1.1 } },
				{ label: 'W2', series: { Target: 2, Actual: 1.8, Forecast: 1.9 } }
			]
		});
		const [target, actual, forecast] = option.series;
		expect(target.lineStyle.type).toBe('dashed');
		expect(CATEGORICAL).not.toContain(target.lineStyle.color);
		expect(actual.lineStyle.color).toBe(CATEGORICAL[0]);
		expect(forecast.lineStyle.color).toBe(CATEGORICAL[1]);
	});
});

describe('one series is one colour', () => {
	const pts = [{ label: 'a' }, { label: 'b' }, { label: 'c' }];

	test('no colours given: every point wears the first palette colour', () => {
		expect(pointColors(pts, [])).toEqual([CATEGORICAL[0], CATEGORICAL[0], CATEGORICAL[0]]);
	});

	test('one colour given paints every point', () => {
		expect(pointColors(pts, ['#123456'])).toEqual(['#123456', '#123456', '#123456']);
	});

	test('two or more colours, or a point colour, are per point on purpose', () => {
		expect(pointColors(pts, ['#111', '#222'])).toEqual(['#111', '#222', '#111']);
		expect(pointColors([{ color: '#f00' }, {}], [])).toEqual(['#f00', CATEGORICAL[0]]);
	});

	test('a single-series bar chart hands echarts one colour for every bar', async () => {
		const option = await optionFor({
			type: 'bar',
			data: [
				{ label: 'Enterprise', value: 1.86 },
				{ label: 'Mid-market', value: 0.87 },
				{ label: 'SMB', value: 0.37 }
			]
		});
		const color = option.series[0].itemStyle.color;
		const painted = [0, 1, 2].map((dataIndex) => (typeof color === 'function' ? color({ dataIndex }) : color));
		expect(new Set(painted)).toEqual(new Set([CATEGORICAL[0]]));
	});

	test('pie and donut slices still take a palette colour each', async () => {
		const option = await optionFor({
			type: 'donut',
			data: [
				{ label: 'A', value: 1 },
				{ label: 'B', value: 2 }
			]
		});
		expect(option.series[0].data.map((d: { itemStyle: { color: string } }) => d.itemStyle.color)).toEqual([CATEGORICAL[0], CATEGORICAL[1]]);
	});
});

describe('x-axis labels', () => {
	const weeks = ['Oct 1–4', 'Oct 5–11', 'Oct 12–18', 'Oct 19–23'];
	const byLength = (t: string) => t.length * 6;

	test('room for all: every label, flat', () => {
		expect(fitAxisLabels(weeks, 600, 10, byLength)).toEqual({ interval: 0, rotate: 0 });
	});

	test('tight: every label, rotated, none dropped', () => {
		const fit = fitAxisLabels(weeks, 200, 10, byLength)!;
		expect(fit.interval).toBe(0);
		expect(fit.rotate).toBeGreaterThan(0);
	});

	test('too many to rotate: evenly thinned, first and last kept', () => {
		const days = Array.from({ length: 31 }, (_, i) => `Oct ${i + 1}`);
		const fit = fitAxisLabels(days, 300, 10, byLength)!;
		const shown = days.map((_, i) => (fit.interval as (i: number) => boolean)(i));
		expect(shown[0]).toBe(true);
		expect(shown[30]).toBe(true);
		const idx = shown.flatMap((s, i) => (s ? [i] : []));
		const gaps = idx.slice(1).map((v, i) => v - idx[i]);
		const step = gaps[0];
		expect(gaps.slice(0, -1).every((g) => g === step)).toBe(true);
		expect(gaps.at(-1)!).toBeGreaterThanOrEqual(step);
	});

	test('unknown width leaves the default', () => {
		expect(fitAxisLabels(weeks, 0)).toBeNull();
	});

	test('the chart hands echarts the fit for its measured width', async () => {
		boxWidth = 240;
		const option = await optionFor({ type: 'bar', data: weeks.map((label) => ({ label, value: 1 })) });
		expect(option.xAxis.axisLabel.interval).toBe(0);
	});
});

describe('donut legend', () => {
	test('each slice shows its value, in the data precision, and its percent', () => {
		const text = sliceLegendText([
			{ label: 'Discovery', value: 4.8 },
			{ label: 'Proposal', value: 5.1 },
			{ label: 'Negotiation', value: 3 },
			{ label: 'Commit', value: 1.3 }
		]);
		expect(text.get('Discovery')).toBe('Discovery  4.8 · 34%');
		expect(text.get('Negotiation')).toBe('Negotiation  3.0 · 21%');
		expect(text.get('Commit')).toBe('Commit  1.3 · 9%');
	});

	test('the chart legend uses that text', async () => {
		const option = await optionFor({ type: 'donut', data: [{ label: 'A', value: 1 }, { label: 'B', value: 3 }] });
		expect(option.legend.formatter('A')).toBe('A  1 · 25%');
	});

	test('narrow: the legend moves below and the chart grows for it', () => {
		const texts = ['Negotiation  3.0 · 21%', 'Commit  1.3 · 9%'];
		expect(pieLayout(500, 180, texts).legend).toBe('right');
		const narrow = pieLayout(280, 180, texts);
		expect(narrow.legend).toBe('bottom');
		expect(narrow.extraHeight).toBeGreaterThan(0);
	});
});
