import { describe as group, expect, test } from 'vitest';
import { AIR_PA, CF_VAC, EXPANSION, THROAT_M2, clampParams, describe, plumeOf, readoutsOf, stateOf } from './model.js';

group('rocket-engine model', () => {
	test('full throttle at the design mixture: 180 bar, about 1,000 kN, 20,000 rpm', () => {
		const p = clampParams({ throttle: 100, mixture: 2.6 });
		const s = stateOf(p);
		expect(s.chamberBar).toBeCloseTo(180, 6);
		expect(s.thrustKn).toBeCloseTo((CF_VAC * 180e5 * THROAT_M2 - AIR_PA * THROAT_M2 * EXPANSION) / 1000, 6);
		expect(readoutsOf(p)).toEqual({ thrust: '1,004', pressure: '180', rpm: '20,000' });
		expect(s.isp).toBeGreaterThan(290);
		expect(s.isp).toBeLessThan(330);
	});

	test('throttling down drops thrust faster than flow (the air pushes back on the exit) and slows the pump with the root of pressure', () => {
		const full = stateOf(clampParams({ throttle: 100 }));
		const low = stateOf(clampParams({ throttle: 40 }));
		expect(low.flow.total / full.flow.total).toBeCloseTo(0.4, 6);
		expect(low.thrustKn / full.thrustKn).toBeLessThan(0.4);
		expect(low.rpm / full.rpm).toBeCloseTo(Math.sqrt(0.4), 6);
	});

	test('mixture splits the flow and moves pressure the right way', () => {
		const lean = stateOf(clampParams({ mixture: 3 }));
		const rich = stateOf(clampParams({ mixture: 2.2 }));
		expect(lean.flow.oxidiser / lean.flow.fuel).toBeCloseTo(3, 6);
		expect(rich.chamberBar).toBeGreaterThan(lean.chamberBar);
		expect(plumeOf(clampParams({ mixture: 2.2 })).soot).toBeGreaterThan(plumeOf(clampParams({ mixture: 3 })).soot);
	});

	test('clamps junk to the sliders', () => {
		expect(clampParams({ throttle: 500, mixture: 9 })).toEqual({ throttle: 100, mixture: 3 });
		expect(clampParams({ throttle: Number.NaN, mixture: 'x' })).toEqual({ throttle: 100, mixture: 2.6 });
		expect(clampParams({ throttle: 3, mixture: 2.33 })).toEqual({ throttle: 40, mixture: 2.35 });
	});

	test('describes the engine in plain words', () => {
		const text = describe(clampParams({ throttle: 70 }));
		expect(text).toContain('70% throttle');
		expect(text).toContain('preburner');
		expect(text).toContain('load cell');
	});
});
