// gauge-value.test.ts: the gauge's data rules, one row per messy input the
// worst-case specs carry (spec 05 and 06), the rounding guards, both display
// modes, the colour allowlist and the spoken value.
import { describe, expect, it } from 'vitest';
import { gaugeView, parseNum, percentText } from './gauge-value.js';
import { safeColor } from '$lib/utils/safe-color.js';

describe('parseNum', () => {
	it('reads numbers, numeric strings, commas, % and px; rejects words', () => {
		expect(parseNum(60)).toBe(60);
		expect(parseNum('60%')).toBe(60);
		expect(parseNum(' 1,200 ')).toBe(1200);
		expect(parseNum('200px')).toBe(200);
		expect(parseNum('lots')).toBeUndefined();
		expect(parseNum(undefined)).toBeUndefined();
		expect(parseNum(NaN)).toBeUndefined();
	});
});

describe('percentText guards', () => {
	it('never prints 100% under max or 0% for a positive value', () => {
		expect(percentText(99.6, 100)).toBe('99%');
		expect(percentText(0.3, 100)).toBe('<1%');
		expect(percentText(100, 100)).toBe('100%');
		expect(percentText(0, 100)).toBe('0%');
		expect(percentText(-0.2, 100)).toBe('0%');
		expect(percentText(150, 100)).toBe('150%');
	});
});

describe('gaugeView', () => {
	it('percent mode for max 100 or absent', () => {
		const g = gaugeView({ value: 75, max: 100, label: 'Capacity', height: 240 });
		expect(g).toMatchObject({ mode: 'percent', number: '75%', target: '', fraction: 0.75, diameter: 220 });
		expect(g.ariaText).toBe('75 percent, Capacity');
		expect(gaugeView({ value: 72, label: 'CPU' }).number).toBe('72%');
	});

	it('max 1 is a ratio', () => {
		const g = gaugeView({ value: 0.734, max: 1, label: 'Cache hit rate', color: 'url(javascript:alert(1))' });
		expect(g.number).toBe('73%');
		expect(g.color).toBeUndefined();
	});

	it('value mode prints the real number and the target', () => {
		const g = gaugeView({ value: 4228, max: 10000, label: 'Steps' });
		expect(g).toMatchObject({ mode: 'value', number: '4,228', target: 'of 10,000', targetCompact: 'of 10K', meta: '42% of 10,000' });
		expect(g.ariaText).toBe('4,228 of 10,000, Steps');
	});

	it('over target fills the arc and says the overshoot', () => {
		const g = gaugeView({ value: 150, max: 120, label: 'Minutes' });
		expect(g).toMatchObject({ fraction: 1, number: '150', target: 'of 120', over: '· 30 over' });
		expect(g.ariaText).toBe('150 of 120, 30 over, Minutes');
	});

	it('spec 05 rows', () => {
		const a = gaugeView({ value: '60%', max: 0, label: '' });
		expect(a).toMatchObject({ max: 100, number: '60%', label: '', name: 'Gauge', ariaText: '60 percent' });
		const b = gaugeView({ value: -12, max: 50, label: 'Free seats', height: '200px' });
		expect(b).toMatchObject({ fraction: 0, number: '\u2212' + '12', target: 'of 50', diameter: 220 });
		const c = gaugeView({ value: 'lots', label: 'Queue depth' });
		expect(c).toMatchObject({ hasValue: false, number: 'No value', value: 0, fraction: 0, ariaText: 'No value, Queue depth' });
		const d = gaugeView({ value: 99.6, max: 100, label: '**Uptime** this month', color: 'not-a-colour' });
		expect(d).toMatchObject({ number: '99%', label: 'Uptime this month', color: undefined });
		const e = gaugeView({ max: '250', label: 'Battery', title: '' });
		expect(e).toMatchObject({ hasValue: false, max: 250, target: '', title: '', number: 'No value' });
	});

	it('spec 06 rows: zero, huge with a token colour, full; height floor and cap', () => {
		const z = gaugeView({ title: 'Storage used', value: 0, max: 500, label: 'GB', height: 80 });
		expect(z).toMatchObject({ fraction: 0, number: '0', target: 'of 500', diameter: 103 });
		const h = gaugeView({ value: 1284500, max: 2000000, color: 'var(--ripple-success)' });
		expect(h).toMatchObject({ number: '1,284,500', numberCompact: '1.3M', targetCompact: 'of 2M', color: 'var(--ripple-success)' });
		const f = gaugeView({ value: 100, max: 100, height: 1200 });
		expect(f).toMatchObject({ number: '100%', fraction: 1, diameter: 220 });
		expect(gaugeView({ value: 1, height: 10 }).diameter).toBe(88);
		expect(gaugeView({ value: 1, height: 'tall' }).diameter).toBe(220);
	});

	it('colour allowlist: literals and ripple tokens only', () => {
		expect(gaugeView({ color: '#16a34a' }).color).toBe('#16a34a');
		expect(gaugeView({ color: 'var(--foreground)' }).color).toBeUndefined();
		expect(gaugeView({ color: 'red;background:url(x)' }).color).toBeUndefined();
		expect(safeColor('var(--ripple-success)', 'black')).toBe('black');
	});

	it('name falls back to the title, then Gauge', () => {
		expect(gaugeView({ value: 5, title: 'Load' }).name).toBe('Load');
		expect(gaugeView({ value: 5 }).name).toBe('Gauge');
	});
});
