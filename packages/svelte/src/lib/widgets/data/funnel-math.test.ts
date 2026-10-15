// funnel-math.test.ts: the funnel's pure rules (parsing, order, step rates,
// worst step, rate format, summary fallbacks, count format) on the polish
// specs' own rows, plus a DOM pass over the messy spec and the empty state.
import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/svelte';
import Funnel from './Funnel.svelte';
import {
	funnelRows,
	funnelSummary,
	formatRate,
	countFormat,
	parseValue,
	parseHeight,
	parseSort,
	rowName,
	capName
} from './funnel-math.js';

const typical = [
	{ label: 'Leads', value: 1000 },
	{ label: 'Qualified', value: 620 },
	{ label: 'Proposal', value: 280 },
	{ label: 'Closed', value: 105 }
];

const messy: unknown[] = [
	{ label: 'Opened the app', value: '5,000' },
	{ label: '**Viewed plans**', value: '1200' },
	{ label: 'Started trial', value: 1400 },
	{ value: 300 },
	{ label: 'Started trial', value: 'lots' },
	null,
	{ label: 'Paid', value: -5 },
	{ label: 'Referred a friend', value: 0 }
];

const checkout = [48210, 31877, 22950, 15402, 9876, 8120, 6355, 5980, 5011, 4870, 2105, 3902, 3640, 3518, 402].map(
	(value, i) => ({ label: `S${i + 1}`, value })
);

describe('parsing', () => {
	test('values: grouped strings, junk, negatives', () => {
		expect(parseValue('5,000')).toBe(5000);
		expect(parseValue('1_200')).toBe(1200);
		expect(parseValue(' 12 000 ')).toBe(12000);
		expect(parseValue('lots')).toBeUndefined();
		expect(parseValue(NaN)).toBeUndefined();
		expect(parseValue(null)).toBeUndefined();
		expect(parseValue(-5)).toBe(0);
	});
	test('height is a max with a floor and a px suffix', () => {
		expect(parseHeight('300px')).toBe(300);
		expect(parseHeight(200)).toBe(200);
		expect(parseHeight(40)).toBe(120);
		expect(parseHeight('tall')).toBeUndefined();
		expect(parseHeight(undefined)).toBeUndefined();
	});
	test('sort defaults to authored order', () => {
		expect(parseSort(undefined)).toBe('none');
		expect(parseSort('sideways')).toBe('none');
		expect(parseSort('ascending')).toBe('ascending');
	});
});

describe('rows', () => {
	test('typical: rates, ghosts, worst step, honest widths', () => {
		const rows = funnelRows(typical);
		expect(rows.map((r) => r.rate)).toEqual([undefined, 0.62, 280 / 620, 0.375]);
		// Spec 01's lowest rate is Closed (37.5%), not Proposal (45%) as the polish brief states.
		expect(rows.map((r) => r.worst)).toEqual([false, false, false, true]);
		expect(rows[3].pct).toBeCloseTo(10.5);
		expect(rows[3].ghostPct).toBeCloseTo(28);
		expect(rows[0].ghostPct).toBeUndefined();
	});

	test('messy spec: skips null, keeps n/a, rates skip it, Stage N fallback', () => {
		const rows = funnelRows(messy);
		expect(rows.map((r) => r.label)).toEqual([
			'Opened the app',
			'Viewed plans',
			'Started trial',
			'Stage 4',
			'Started trial',
			'Paid',
			'Referred a friend'
		]);
		expect(rows[3].unnamed).toBe(true);
		expect(rows.map((r) => r.value)).toEqual([5000, 1200, 1400, 300, undefined, 0, 0]);
		// The rise has a rate above 100% and no ghost.
		expect(formatRate(rows[2].rate!)).toBe('117%');
		expect(rows[2].ghostPct).toBeUndefined();
		// n/a has no rate; Paid compares to Stage 4; after a 0 there is no rate.
		expect(rows[4].rate).toBeUndefined();
		expect(rows[5].rate).toBe(0);
		// Paid's base is named, since the row above it has no count.
		expect(rows[5].skipped).toBe(true);
		expect(rows.filter((r) => r.skipped).length).toBe(1);
		expect(rows[6].rate).toBeUndefined();
		expect(rows.find((r) => r.worst)?.label).toBe('Paid');
	});

	test('sort modes on the checkout spec stay distinct; growth keeps authored order by default', () => {
		const none = funnelRows(checkout).map((r) => r.value);
		const desc = funnelRows(checkout, 'descending').map((r) => r.value);
		const asc = funnelRows(checkout, 'ascending').map((r) => r.value);
		expect(none).toEqual(checkout.map((s) => s.value));
		expect(desc).toEqual(none.toSorted((a, b) => b! - a!));
		expect(asc).toEqual(none.toSorted((a, b) => a! - b!));
		expect(formatRate(funnelRows(checkout)[11].rate!)).toBe('185%');
	});

	test('worst step: lowest rate under 100%; ties pick the earliest; one rate is not enough', () => {
		const tie = funnelRows([10, 5, 5, 2.5].map((value, i) => ({ label: `${i}`, value })));
		expect(tie.map((r) => r.worst)).toEqual([false, true, false, false]);
		expect(funnelRows([{ label: 'a', value: 10 }, { label: 'b', value: 1 }]).some((r) => r.worst)).toBe(false);
	});

	test('all zero: no rates, no bars', () => {
		const rows = funnelRows([{ label: 'Invited', value: 0 }, { label: 'Joined', value: 0 }]);
		expect(rows.map((r) => [r.rate, r.pct])).toEqual([[undefined, 0], [undefined, 0]]);
	});
});

describe('words', () => {
	test('rate bounds', () => {
		expect(formatRate(0)).toBe('0%');
		expect(formatRate(0.0004)).toBe('<0.1%');
		expect(formatRate(0.042)).toBe('4.2%');
		expect(formatRate(0.62)).toBe('62%');
		expect(formatRate(1.85)).toBe('185%');
		expect(formatRate(9.99)).toBe('999%');
		expect(formatRate(12)).toBe('>999%');
		expect(formatRate(0.105, true)).toBe('10.5%');
		// A real loss or gain never prints as a flat 100%.
		expect(formatRate(11_999_000 / 12_000_000)).toBe('<100%');
		expect(formatRate(0.997)).toBe('<100%');
		expect(formatRate(0.997, true)).toBe('99.7%');
		expect(formatRate(0.9999, true)).toBe('<100%');
		expect(formatRate(12_000_000 / 11_999_000)).toBe('>100%');
		expect(formatRate(1)).toBe('100%');
	});

	test('counts switch to compact at 100,000 for the whole column', () => {
		expect(countFormat(funnelRows(checkout))(48210)).toBe('48,210');
		const big = funnelRows([{ label: 'a', value: 12_000_000 }, { label: 'b', value: 3 }]);
		expect(countFormat(big)(12_000_000)).toBe('12M');
		expect(countFormat(big)(3)).toBe('3');
		expect(countFormat(big)(undefined)).toBe('n/a');
	});

	test('summary and its fallbacks', () => {
		expect(funnelSummary(funnelRows(typical))).toEqual({
			text: '10.5% of Leads reached Closed',
			drop: 'Biggest drop: Proposal to Closed (38% carried on)'
		});
		// The step's start is the last numbered stage, skipping n/a rows.
		expect(funnelSummary(funnelRows(messy))?.drop).toBe('Biggest drop: Stage 4 to Paid (0% carried on)');
		expect(funnelSummary(funnelRows([{ label: 'Signed up', value: 86 }]))).toBeUndefined();
		expect(funnelSummary(funnelRows([{ label: 'a', value: 0 }, { label: 'b', value: 0 }]))?.text).toBe(
			'Nothing recorded yet'
		);
		const asc = funnelRows([12_000_000, 11_999_000, 9_100_000, 845_000, 61_000, 3].map((value, i) => ({ label: `${i}`, value })), 'ascending');
		expect(asc.slice(1, 4).map((r) => formatRate(r.rate!))).toEqual(['>999%', '>999%', '>999%']);
		expect(funnelSummary(asc)).toEqual({ text: '6 stages · largest: 0, 12M' });
	});

	test('summary names are capped at 24 characters', () => {
		// A cut never ends on a small joining word.
		expect(capName('Saw the poster at the library')).toBe('Saw the poster…');
		expect(capName('Saw it at the library, then left')).toBe('Saw it at the library…');
		expect(capName('Supercalifragilisticexpialidocious')).toBe('Supercalifragilisticexp…');
		expect(capName('Came back')).toBe('Came back');
	});

	test('accessible row names', () => {
		const rows = funnelRows(typical);
		const count = countFormat(rows);
		expect(rowName(rows[2], count)).toBe('Proposal, 280, 45 percent of previous');
		expect(rowName(rows[3], count)).toBe('Closed, 105, 38 percent of previous, biggest drop');
		expect(rowName(rows[0], count)).toBe('Leads, 1,000');
		expect(rowName(funnelRows(messy)[4], count)).toBe('Started trial, no count');
		expect(rowName(funnelRows(messy)[5], count)).toBe('Paid, 0, 0 percent of Stage 4, biggest drop');
	});
});

describe('Funnel DOM', () => {
	test('messy spec renders every row, n/a without a bar, a tick for zero', () => {
		const { container } = render(Funnel, { props: { data: messy as never, colors: ['#ff0000'], height: '300px' } });
		const items = container.querySelectorAll('li');
		expect(items).toHaveLength(7);
		expect(container.querySelectorAll('.fn-count')[4].textContent).toBe('n/a');
		expect(items[4].querySelector('.fn-bar, .fn-tick')).toBeNull();
		expect(items[5].querySelector('.fn-tick')).not.toBeNull();
		// After an n/a row the rate names its base instead of `previous`.
		expect(items[5].querySelector('.fn-conn')!.textContent).toContain('0% of Stage 4');
		expect(items[5].querySelector('.fn-vs')!.textContent).toBe('vs Stage 4');
		expect(items[3].querySelector('.fn-conn')!.textContent).toContain('of previous');
		expect(container.textContent).not.toMatch(/NaN|Infinity|undefined|\*\*/);
		expect(container.querySelector<HTMLElement>('.fn-root')!.style.maxHeight).toBe('300px');
		// Without a model-set height the widget fits its content.
		const fitted = render(Funnel, { props: { data: typical } });
		expect(fitted.container.querySelector<HTMLElement>('.fn-root')!.style.maxHeight).toBe('');
	});

	test('no data is a designed empty state; one stage has no summary', () => {
		const empty = render(Funnel, { props: { data: 'nope' as never, title: 'Funnel' } });
		expect(empty.container.textContent).toContain('No stages to show');
		const one = render(Funnel, { props: { data: [{ label: 'Signed up', value: 86 }] } });
		expect(one.container.querySelector('.fn-summary')).toBeNull();
		expect(one.container.querySelector('.fn-top')).toBeNull();
	});

	test('bar width is percent of the widest stage', () => {
		const { container } = render(Funnel, { props: { data: typical } });
		const bars = [...container.querySelectorAll<HTMLElement>('.fn-bar')].map((b) => b.style.width);
		expect(bars).toEqual(['100%', '62%', '28%', '10.5%']);
	});
});
