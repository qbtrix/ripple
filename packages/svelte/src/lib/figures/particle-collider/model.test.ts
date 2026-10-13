import { describe as group, expect, test } from 'vitest';
import { betaOf, bunchesAt, burstsAt, clampParams, collisionsOf, describe, fieldOf, lagOf, readoutsOf, spacingOf, tracksOf, DRAW_SPEED } from './model.js';

group('particle-collider model', () => {
	test('at 7 TeV a proton is 3 m/s short of light and the dipoles need 8.33 T', () => {
		const p = clampParams({ energy: 7, rate: 40 });
		expect(betaOf(p)).toBeCloseTo(0.999999991, 9);
		expect(lagOf(p)).toBeGreaterThan(2.6);
		expect(lagOf(p)).toBeLessThan(2.8);
		expect(fieldOf(p)).toBeCloseTo(8.33, 2);
		expect(readoutsOf(p)).toEqual({ speed: '99.9999991', field: '8.33', energy: '14.0', collisions: '1.0 billion' });
	});

	test('at 0.5 TeV the field is under a tesla and the speed still rounds past 99.999 %', () => {
		const p = clampParams({ energy: 0.5, rate: 5 });
		expect(fieldOf(p)).toBeCloseTo(0.595, 2);
		expect(readoutsOf(p).speed).toBe('99.9998239');
		expect(collisionsOf(p)).toBe(125e6);
		expect(readoutsOf(p).collisions).toBe('125 million');
	});

	test('clamps junk to the sliders', () => {
		expect(clampParams({ energy: 99, rate: 0.2 })).toEqual({ energy: 7, rate: 5 });
		expect(clampParams({ energy: Number.NaN, rate: 'x' })).toEqual({ energy: 6.8, rate: 40 });
		expect(clampParams({ energy: 3.14159 }).energy).toBe(3.1);
	});

	test('the two beams pass the crossing point together, one bunch gap apart in time', () => {
		const p = clampParams({ rate: 20 });
		const d = spacingOf(p);
		expect(d).toBe(128);
		const t = (3 * d) / DRAW_SPEED;
		const { one, two } = bunchesAt(p, t, -300, 300);
		expect(one).toContain(0);
		expect(two).toContain(-0);
		const later = bunchesAt(p, t + 0.5, -300, 300);
		expect(later.one[0]! - one[0]!).toBeCloseTo(DRAW_SPEED * 0.5, 9);
		expect([...later.two].sort((a, b) => a - b)).toEqual(later.one.map((s) => -s).sort((a, b) => a - b));
		for (const s of [...later.one, ...later.two]) expect(Math.abs(s)).toBeLessThanOrEqual(300);
	});

	test('a burst rises then fades, and each crossing always throws the same tracks', () => {
		const p = clampParams();
		const [fresh] = burstsAt(p, 0.02);
		expect(fresh!.glow).toBeGreaterThan(0);
		expect(fresh!.reach).toBeLessThan(0.5);
		const [late] = burstsAt(p, 1.05);
		expect(late!.reach).toBe(1);
		expect(late!.glow).toBeLessThan(fresh!.glow + 1);
		expect(tracksOf(p, 4)).toEqual(tracksOf(p, 4));
		expect(tracksOf(p, 4)[0]!.kind).toBe('muon');
		expect(tracksOf(clampParams({ energy: 7 }), 1).length).toBeGreaterThan(tracksOf(clampParams({ energy: 0.5 }), 1).length);
	});

	test('describes it in plain words', () => {
		const text = describe(clampParams({ energy: 6.8, rate: 40 }));
		expect(text).toContain('8.09 tesla');
		expect(text).toContain('about 1.0 billion collisions a second');
	});
});
