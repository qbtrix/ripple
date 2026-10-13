import { describe as group, expect, test } from 'vitest';
import { CASSETTE, clampParams, describe, developmentOf, poseAt, poseOf, ratioOf, readoutsOf, speedOf, teethAt } from './model.js';

group('bike-gears model', () => {
	test('ratio, metres a pedal turn and speed follow ring / cog x 2.1 m', () => {
		const p = clampParams({ cadence: 90, ring: 50, gear: 7 });
		expect(ratioOf(p)).toBeCloseTo(50 / 11, 6);
		expect(developmentOf(p)).toBeCloseTo((50 / 11) * 2.1, 6);
		expect(speedOf(p)).toBeCloseTo((90 * (50 / 11) * 2.1 * 60) / 1000, 6);
		expect(readoutsOf(p)).toEqual({ gear: '50 x 11', ratio: '4.55', metres: '9.5', speed: '51.5' });
	});

	test('the easiest gear rolls under 3 m a turn', () => {
		expect(developmentOf(clampParams({ ring: 34, gear: 1 }))).toBeCloseTo((34 / 28) * 2.1, 6);
	});

	test('clamps junk to the sliders and snaps the ring to 34 or 50', () => {
		expect(clampParams({ cadence: 500, ring: 40, gear: 99 })).toEqual({ cadence: 120, ring: 34, gear: CASSETTE.length });
		expect(clampParams({ cadence: Number.NaN, ring: 'x', gear: -3 })).toEqual({ cadence: 85, ring: 50, gear: 1 });
	});

	test('a shift eases from one pose to the next and settles', () => {
		const a = poseOf(clampParams({ ring: 34, gear: 2 }));
		const b = poseOf(clampParams({ ring: 50, gear: 5 }));
		expect(poseAt(a, b, 0)).toEqual(a);
		expect(poseAt(a, b, 10)).toEqual(b);
		const mid = poseAt(a, b, 0.35);
		expect(mid.cog).toBeGreaterThan(a.cog);
		expect(mid.cog).toBeLessThan(b.cog);
		expect(teethAt(1.5)).toBeCloseTo((24 + 21) / 2, 6);
	});

	test('describes the gear in plain words', () => {
		expect(describe(clampParams({ cadence: 80, ring: 34, gear: 1 }))).toContain('34-tooth chainring');
	});
});
