import { describe as group, expect, test } from 'vitest';
import { clampParams, describe, q95Of, reactivity, readoutsOf, solve, twistAt } from './model.js';

group('tokamak model', () => {
	test('D-T reactivity matches Bosch-Hale (about 1.1e-22 m3/s at 10 keV, 4.2e-22 at 20)', () => {
		expect(reactivity(10)).toBeCloseTo(1.136e-22, 24);
		expect(reactivity(20)).toBeCloseTo(4.33e-22, 23);
	});

	test('15 MA with 50 MW of heating is the reactor design point: Q about 10, about 500 MW', () => {
		const s = solve(clampParams());
		expect(s.gain).toBeGreaterThan(9);
		expect(s.gain).toBeLessThan(11);
		expect(s.fusion).toBeGreaterThan(450);
		expect(s.fusion).toBeLessThan(550);
		expect(s.core * 11.6).toBeGreaterThan(150);
		expect(s.core * 11.6).toBeLessThan(250);
		expect(q95Of(clampParams())).toBeCloseTo(3, 0);
	});

	test('more heating or more current makes a hotter plasma and more fusion', () => {
		const a = solve(clampParams({ current: 10, heating: 30 }));
		const b = solve(clampParams({ current: 10, heating: 60 }));
		const c = solve(clampParams({ current: 16, heating: 60 }));
		expect(b.core).toBeGreaterThan(a.core);
		expect(c.fusion).toBeGreaterThan(b.fusion);
	});

	test('a small, lightly heated plasma stays far below breakeven', () => {
		expect(solve(clampParams({ current: 5, heating: 10 })).gain).toBeLessThan(0.5);
	});

	test('readouts and the plain description', () => {
		const r = readoutsOf(clampParams());
		expect(Number(r.temperature)).toBeGreaterThan(150);
		expect(Number(r.gain)).toBeGreaterThan(9);
		expect(describe(clampParams())).toContain('deuterium-tritium');
	});

	test('clamps and snaps junk to the sliders', () => {
		expect(clampParams({ current: 99, heating: -4 })).toEqual({ current: 17, heating: 10 });
		expect(clampParams({ current: Number.NaN, heating: 'x' })).toEqual({ current: 15, heating: 50 });
		expect(clampParams({ current: 12.3, heating: 52 })).toEqual({ current: 12.5, heating: 50 });
	});

	test('field lines twist more on the axis and with more current', () => {
		const p = clampParams();
		expect(twistAt(p, 0)).toBe(1);
		expect(twistAt(p, 1)).toBeCloseTo(1 / q95Of(p), 6);
		expect(twistAt(clampParams({ current: 17 }), 1)).toBeGreaterThan(twistAt(clampParams({ current: 8 }), 1));
	});
});
