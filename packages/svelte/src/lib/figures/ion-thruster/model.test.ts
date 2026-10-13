import { describe as group, expect, test } from 'vitest';
import { beamCurrentOf, clampParams, describe, exhaustOf, ispOf, powerOf, readoutsOf, thrustOf } from './model.js';

group('ion-thruster model', () => {
	test('ions leave at sqrt(2qV/m): about 40 km/s at 1100 V', () => {
		expect(exhaustOf(clampParams({ voltage: 1100 })) / 1000).toBeCloseTo(40.2, 1);
		expect(exhaustOf(clampParams({ voltage: 1800 })) / exhaustOf(clampParams({ voltage: 600 }))).toBeCloseTo(Math.sqrt(3), 6);
	});

	test('a flown 30 cm thruster at full power: about 1.9 A, 90 mN and 2.3 kW', () => {
		const p = clampParams({ voltage: 1100, flow: 2.6 });
		expect(beamCurrentOf(p)).toBeGreaterThan(1.6);
		expect(beamCurrentOf(p)).toBeLessThan(2.0);
		expect(thrustOf(p) * 1000).toBeGreaterThan(80);
		expect(thrustOf(p) * 1000).toBeLessThan(100);
		expect(powerOf(p) / 1000).toBeGreaterThan(2.1);
		expect(powerOf(p) / 1000).toBeLessThan(2.5);
		// Specific impulse in the thousands of seconds, ten times a chemical rocket's.
		expect(ispOf(p)).toBeGreaterThan(3000);
	});

	test('thrust grows with flow and with the square root of voltage', () => {
		const a = clampParams({ voltage: 1000, flow: 1 });
		expect(thrustOf(clampParams({ voltage: 1000, flow: 2 })) / thrustOf(a)).toBeCloseTo(2, 6);
		expect(thrustOf(clampParams({ voltage: 1600, flow: 1 })) / thrustOf(clampParams({ voltage: 1000, flow: 1 }))).toBeCloseTo(Math.sqrt(1.6), 6);
	});

	test('readouts at the defaults', () => {
		expect(readoutsOf(clampParams())).toEqual({ speed: '40.2', thrust: '69', power: '1.74' });
	});

	test('clamps junk to the sliders', () => {
		expect(clampParams({ voltage: 5000, flow: 9 })).toEqual({ voltage: 1800, flow: 3 });
		expect(clampParams({ voltage: Number.NaN, flow: 'x' })).toEqual({ voltage: 1100, flow: 2 });
		expect(clampParams({ voltage: 1013, flow: 0.04 })).toEqual({ voltage: 1000, flow: 0.5 });
	});

	test('describes it in plain words', () => {
		const text = describe(clampParams());
		expect(text).toContain('neutraliser');
		expect(text).toContain('69 millinewtons');
		expect(text).toContain('9 times faster');
	});
});
