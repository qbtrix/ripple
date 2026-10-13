// Tests for the mechanism grammar in iso/scene: [min, max] ranges, chains
// around two gears, ghosts, link rods, crank-driven slides, and a fit that
// covers every pose a motion reaches.
import { describe, it, expect } from 'vitest';
import { iso } from './kit.js';
import { add3, len3, sub3 } from './solids.js';
import { IDENTITY, applyAffine, crankSlide, drawScene, fitScene, flowOffsets, normalizeScene, sceneTransforms } from './scene.js';

describe('range as [min, max]', () => {
	it('oscillates between the two about the midpoint; a number still means amplitude', () => {
		const s = normalizeScene([{ id: 'p', kind: 'box' }], [
			{ part: 'p', kind: 'slide', axis: 'z', range: [0, 30], speed: 1 },
			{ part: 'p', kind: 'swing', range: 10, speed: 1 }
		]);
		expect(s.motions[0]).toMatchObject({ range: 15, offset: 15 });
		expect(s.motions[1]).toMatchObject({ range: 10, offset: 0 });
		const z = (t: number) => sceneTransforms({ parts: s.parts, motions: [s.motions[0]!] }, t, [1])[0]!.t[2];
		expect(z(0.25)).toBeCloseTo(30);
		expect(z(0.75)).toBeCloseTo(0);
	});
});

const gears = [
	{ id: 'ring', kind: 'gear', at: [0, 0, 30], r: 22, h: 3, teeth: 40, axis: 'y' },
	{ id: 'cog', kind: 'gear', at: [110, 0, 30], r: 9, h: 3, teeth: 16, axis: 'y' }
];

describe('chain', () => {
	it('wraps both pitch circles in front of the gears and travels with the spinning gear', () => {
		const s = normalizeScene([...gears, { id: 'c', kind: 'chain', around: ['ring', 'cog'] }], [{ part: 'ring', kind: 'spin', axis: 'y', speed: 1 }]);
		const c = s.parts[2]!;
		expect(c.around).toEqual([0, 1]);
		expect(c.path.length).toBeGreaterThan(20);
		expect(c.path.every((q) => q[1] > 1.5)).toBe(true); // in front of the near faces (camera on +y)
		const onRing = c.path.filter((q) => Math.abs(len3(sub3([q[0], 0, q[2]], [0, 0, 30])) - 20.02) < 0.1);
		expect(onRing.length).toBeGreaterThan(5);
		expect(flowOffsets(s, 0.25, [1])[2]).toBeCloseTo((Math.PI / 2) * 20.02, 1);
		const items = drawScene(s, fitScene(s, 640, 380), sceneTransforms(s, 0, [1]));
		expect(items.at(-1)!.part).toBe(2);
		expect(items.at(-1)!.shapes.map((x) => x.cls)).toEqual(expect.arrayContaining(['link', 'pin']));
	});

	it('a tube the model named a chain becomes one around the nearest two gears', () => {
		const s = normalizeScene([...gears, { id: 'bigger', kind: 'gear', at: [0, 0, 200], r: 30 }, { id: 'drive-chain', kind: 'tube', path: [[0, 0, 52], [110, 0, 39]] }]);
		expect(s.parts[3]!.kind).toBe('chain');
		expect(s.parts[3]!.around).toEqual([0, 1]);
		expect(normalizeScene([...gears, { id: 'hose', kind: 'tube', path: [[0, 0, 52], [110, 0, 39]] }]).parts[2]!.kind).toBe('tube');
	});
});

describe('ghost', () => {
	const parts = [
		{ id: 'bore', kind: 'cylinder', at: [0, 0, 30], r: 16, h: 50 },
		{ id: 'piston', kind: 'cylinder', at: [0, 0, 30], r: 12, h: 12 }
	];
	const motions = [{ part: 'piston', kind: 'slide', axis: 'z', range: 8, speed: 1 }];
	it('a solid holding a moving part is drawn see-through, unless ghost is false', () => {
		const s = normalizeScene(parts, motions);
		expect(s.parts.map((p) => p.ghost)).toEqual([true, false]);
		const bore = drawScene(s, fitScene(s, 400, 300), s.parts.map(() => IDENTITY)).find((i) => i.part === 0)!;
		expect(bore.shapes.map((x) => x.cls)).not.toContain('shade');
		expect(bore.shapes.map((x) => x.cls)).toContain('ghost');
		expect(normalizeScene([{ ...parts[0], ghost: false }, parts[1]], motions).parts[0]!.ghost).toBe(false);
		expect(normalizeScene([{ id: 'a', kind: 'box', ghost: true }]).parts[0]!.ghost).toBe(true);
	});
});

describe('link and crank-driven slide', () => {
	const s = normalizeScene(
		[
			{ id: 'crank', kind: 'disc', at: [0, 0, 0], r: 10, axis: 'y' },
			{ id: 'pin', kind: 'cylinder', at: [0, 0, 8], r: 2, h: 4, axis: 'y', on: 'crank' },
			{ id: 'piston', kind: 'cylinder', at: [0, 0, 38], r: 6, h: 8 },
			{ id: 'rod', kind: 'rod', from: [0, 0, 8], to: [0, 0, 38], r: 1.5 }
		],
		[
			{ part: 'crank', kind: 'spin', axis: 'y', speed: 1 },
			{ part: 'piston', kind: 'slide', axis: 'z', driven: 'crank', throw: 8, speed: 1 },
			{ part: 'rod', kind: 'link', from: 'pin', to: 'piston' }
		]
	);
	it('the piston follows the crank and the rod ends stay on the pin and the piston', () => {
		expect(s.motions[1]).toMatchObject({ driven: 0, throw: 8 });
		expect(s.motions[2]).toMatchObject({ from: 1, to: 2 });
		for (const t of [0, 0.1, 0.25, 0.4, 0.5, 0.8]) {
			const tf = sceneTransforms(s, t, [1, 1, 0]);
			expect(tf[2]!.t[2]).toBeCloseTo(crankSlide(Math.PI * 2 * t, 8, 30));
			const rodA = applyAffine(tf[3]!, [0, 0, 8]);
			const rodB = applyAffine(tf[3]!, [0, 0, 38]);
			expect(len3(sub3(rodA, applyAffine(tf[1]!, [0, 0, 8])))).toBeLessThan(1e-6);
			expect(len3(sub3(rodB, applyAffine(tf[2]!, [0, 0, 38])))).toBeLessThan(1e-6);
		}
	});
	it('a link without both ends, or on a part that is not a rod, is dropped', () => {
		const bad = normalizeScene([{ id: 'r', kind: 'box' }], [{ part: 'r', kind: 'link', from: 'r', to: 'nope' }]);
		expect(bad.motions).toHaveLength(0);
	});
});

describe('fitScene', () => {
	it('frames every pose a motion reaches, not just the rest pose', () => {
		const parts = [
			{ id: 'mast', kind: 'box', at: [0, 0, 30], w: 8, d: 8, h: 60 },
			{ id: 'jib', kind: 'box', at: [40, 0, 62], w: 80, d: 3, h: 3 }
		];
		const still = normalizeScene(parts);
		const turning = normalizeScene(parts, [{ part: 'jib', kind: 'swing', axis: 'y', range: 60, speed: 1 }]);
		const P = fitScene(turning, 640, 380);
		expect(P.scale).toBeLessThan(fitScene(still, 640, 380).scale);
		for (const t of [0, 0.1, 0.25, 0.5, 0.75]) {
			const tf = sceneTransforms(turning, t, [1]);
			const tip = iso(applyAffine(tf[1]!, add3([80, 0, 62], [0, 0, 0])), P);
			expect(tip[1]).toBeGreaterThanOrEqual(0);
			expect(tip[0]).toBeLessThanOrEqual(640);
		}
	});
});
