// Tests for iso/enrich: detail is opt-out and exact, never moves model parts,
// is deterministic, rides its owner's motion, sorts with its owner and stays
// within the shape budget.
import { describe, it, expect } from 'vitest';
import { ISO_DETAIL_SHAPES, enrichScene } from './enrich.js';
import { IDENTITY, drawScene, fitScene, normalizeScene, sceneTransforms } from './scene.js';

// The sparse drivetrain a small model writes: base, chainring, cog, chain.
const chain = [[0, 0, 53], [-23, 0, 30], [0, 0, 7], [110, 0, 21], [119, 0, 30], [110, 0, 39], [0, 0, 53]];
const bike = () =>
	normalizeScene(
		[
			{ id: 'base', kind: 'slab', at: [55, 0, -6], w: 190, d: 60, h: 4 },
			{ id: 'ring', kind: 'gear', at: [0, 0, 30], r: 22, h: 3, teeth: 40, axis: 'y' },
			{ id: 'cog', kind: 'gear', at: [110, 0, 30], r: 9, h: 3, teeth: 16, axis: 'y' },
			{ id: 'chain', kind: 'tube', path: chain, r: 1.5 }
		],
		[{ part: 'ring', kind: 'spin', axis: 'y', speed: 1 }]
	);
const shapesOf = (scene: ReturnType<typeof bike>) => {
	const P = fitScene(scene, 640, 380);
	return drawScene(scene, P, sceneTransforms(scene, 0, scene.motions.map(() => 1)));
};

describe('enrichScene', () => {
	it('"none" on the scene or on every part draws exactly what the model wrote', () => {
		const plain = bike();
		expect(enrichScene(plain, 'none')).toBe(plain);
		const off = normalizeScene(bike().parts.map((p) => ({ ...p, path: p.path, detail: 'none' })), []);
		expect(enrichScene(off).parts).toHaveLength(4);
		expect(shapesOf(enrichScene(off))).toEqual(shapesOf(off));
	});

	it('turns four parts into a drivetrain on a bench without touching the model parts', () => {
		const plain = bike();
		const rich = enrichScene(plain);
		expect(rich.parts.slice(0, 4).map((p) => [p.at, p.w, p.d, p.h, p.r])).toEqual(plain.parts.map((p) => [p.at, p.w, p.d, p.h, p.r]));
		const derived = rich.parts.slice(4);
		const by = (id: string, kind: string) => derived.filter((p) => p.id.startsWith(`${id}~${kind}`)).length;
		expect(by('base', 'cylinder')).toBe(4); // feet
		expect(by('base', 'plate')).toBe(1); // ruler strip
		expect(by('ring', 'rod')).toBe(5); // spider arms
		expect(rich.parts[3]!.kind).toBe('chain'); // a tube named chain wraps the two gears
		expect(rich.parts[3]!.around).toEqual([1, 2]);
		expect(rich.parts[1]!.chain).toBe(true);
		expect(rich.parts[2]!.chain).toBe(false);
		expect(derived.every((p) => p.owner >= 0 && p.on === p.owner)).toBe(true);
		const items = shapesOf(rich);
		expect(items).toHaveLength(4); // derived parts fold into their owners
		const kinds = new Set(items.flatMap((i) => i.shapes.map((s) => s.cls)));
		expect([...kinds]).toEqual(expect.arrayContaining(['link', 'pin', 'detail', 'screw']));
	});

	it('is deterministic', () => {
		expect(JSON.stringify(shapesOf(enrichScene(bike())))).toBe(JSON.stringify(shapesOf(enrichScene(bike()))));
	});

	it('spider arms turn with the chainring', () => {
		const rich = enrichScene(bike());
		const P = fitScene(rich, 640, 380);
		const arm = rich.parts.findIndex((p) => p.id.startsWith('ring~rod'));
		const at = (t: number) => drawScene(rich, P, sceneTransforms(rich, t, [1])).find((i) => i.part === 1)!.shapes.length;
		expect(arm).toBeGreaterThan(3);
		const tf = sceneTransforms(rich, 0.1, [1]);
		expect(tf[arm]).toEqual(tf[1]);
		expect(at(0.1)).toBeGreaterThan(0);
	});

	it('stays within the shape budget on a crowded scene', () => {
		const parts = Array.from({ length: 18 }, (_, i) => ({ id: `g${i}`, kind: i % 3 ? 'gear' : 'box', at: [(i % 6) * 40, Math.floor(i / 6) * 40, 10], r: 14, w: 20, d: 20, h: 12 }));
		const rich = enrichScene(normalizeScene([{ id: 'base', kind: 'slab', at: [100, 80, 0], w: 260, d: 220, h: 4 }, ...parts]));
		const total = drawScene(rich, fitScene(rich, 640, 380), rich.parts.map(() => IDENTITY)).reduce((n, i) => n + i.shapes.length, 0);
		expect(total).toBeLessThanOrEqual(ISO_DETAIL_SHAPES);
		expect(rich.parts.length).toBeGreaterThan(19);
	});
});
