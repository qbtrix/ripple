import { describe as group, expect, test } from 'vitest';
import { clampParams, describe, readoutsOf, rodWorth, stateOf, EFFICIENCY, RATED_MW } from './model.js';

group('fission-reactor model', () => {
	test('rods out and full flow: rated heat, a third of it as electricity, a 32 K rise near 325 C', () => {
		const s = stateOf(clampParams({ rods: 0, pump: 100 }));
		expect(s.thermalMW).toBeCloseTo(RATED_MW, 6);
		expect(s.electricMW).toBeCloseTo(RATED_MW * EFFICIENCY, 6);
		expect(s.hot - s.cold).toBeCloseTo(32, 6);
		expect(readoutsOf(clampParams({ rods: 0, pump: 100 }))).toEqual({ thermal: '3000', electric: '990', coolant: '326' });
	});

	test('rods all the way in shut the chain reaction down; the water idles at 291 C', () => {
		const s = stateOf(clampParams({ rods: 100 }));
		expect(s.thermalMW).toBeCloseTo(0, 6);
		expect(s.electricMW).toBeCloseTo(0, 6);
		expect(s.hot).toBeCloseTo(291, 6);
		expect(describe(clampParams({ rods: 100 }))).toContain('chain reaction stops');
	});

	test('rod worth is an S-curve: little at the ends of travel, most through the middle', () => {
		expect(rodWorth(0.1)).toBeLessThan(0.01);
		expect(rodWorth(0.5)).toBeCloseTo(0.5, 6);
		expect(rodWorth(0.9)).toBeGreaterThan(0.99);
		let last = -1;
		for (let x = 0; x <= 1.0001; x += 0.05) {
			expect(rodWorth(x)).toBeGreaterThanOrEqual(last);
			last = rodWorth(x);
		}
	});

	test('slower pumps run the core hotter, so it settles at lower power, and never near boiling', () => {
		const full = stateOf(clampParams({ rods: 0, pump: 100 }));
		const slow = stateOf(clampParams({ rods: 0, pump: 40 }));
		expect(slow.power).toBeLessThan(full.power);
		expect(slow.hot - slow.cold).toBeGreaterThan(full.hot - full.cold);
		for (let rods = 0; rods <= 100; rods += 5)
			for (let pump = 40; pump <= 100; pump += 5) {
				const s = stateOf(clampParams({ rods, pump }));
				expect(s.hot).toBeLessThan(340); // saturation at 155 bar is about 345 C
				expect(s.electricMW).toBeLessThanOrEqual(s.thermalMW);
			}
	});

	test('clamps junk to the sliders', () => {
		expect(clampParams({ rods: 500, pump: 5 })).toEqual({ rods: 100, pump: 40 });
		expect(clampParams({ rods: Number.NaN, pump: 'x' })).toEqual({ rods: 20, pump: 100 });
	});
});
