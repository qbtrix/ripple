// Tests for the iso-scene model: clamping and caps, unknown kinds, parent
// cycles, motion transforms moving geometry, and painter's order.
import { describe, it, expect } from 'vitest';
import { evaluateExpression } from '../core/expression-resolver.js';
import { ISO_LIMITS, IDENTITY, drawScene, fitScene, movingParts, normalizeScene, sceneTransforms } from './scene.js';

describe('normalizeScene', () => {
	it('caps parts and motions, skips unknown kinds and clamps numbers', () => {
		const parts = [{ kind: 'teapot' }, ...Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, kind: 'box', w: 1e9, at: [1e9, 'x', -3] }))];
		const motions = Array.from({ length: 40 }, () => ({ part: 'p0', kind: 'spin', speed: 1 }));
		const scene = normalizeScene(parts, motions);
		expect(scene.parts).toHaveLength(ISO_LIMITS.parts);
		expect(scene.motions).toHaveLength(ISO_LIMITS.motions);
		expect(scene.parts[0]!.w).toBe(ISO_LIMITS.size);
		expect(scene.parts[0]!.at).toEqual([ISO_LIMITS.coord, 0, -3]);
	});

	it('drops parent cycles, keeps text plain and ignores bad colors', () => {
		const scene = normalizeScene([
			{ id: 'a', kind: 'box', on: 'b', label: '<b>hi</b>', color: 'url(x)' },
			{ id: 'b', kind: 'box', on: 'a' },
			{ id: 'c', kind: 'plate', on: 'a', label: 'Valve\u0000' }
		]);
		expect(scene.parts.map((p) => p.on).filter((on) => on >= 0).length).toBeLessThanOrEqual(2);
		expect(scene.parts[0]!.on === -1 || scene.parts[1]!.on === -1).toBe(true);
		expect(scene.parts[0]!.label).toBe('bhi/b');
		expect(scene.parts[0]!.color).toBe('neutral');
		expect(scene.parts[2]!.label).toBe('Valve');
	});
});

describe('motion and drawing', () => {
	const scene = normalizeScene(
		[
			{ id: 'ring', kind: 'gear', r: 20, teeth: 32, axis: 'y', at: [0, 0, 30] },
			{ id: 'crank', kind: 'rod', from: [0, 4, 0], to: [0, 4, -18], r: 2, on: 'ring', at: [0, 0, 30] },
			{ id: 'base', kind: 'slab', w: 80, d: 40, h: 6, at: [0, 0, 0] }
		],
		[{ part: 'ring', kind: 'spin', speed: 1 }]
	);
	const P = fitScene(scene, 400, 300);

	it('a child moves with its spinning parent', () => {
		expect(movingParts(scene)).toEqual([true, true, false]);
		const rest = drawScene(scene, P, sceneTransforms(scene, 0, [1]));
		const later = drawScene(scene, P, sceneTransforms(scene, 0.25, [1]));
		const crank = (items: typeof rest) => items.find((i) => i.part === 1)!.shapes.find((s) => s.cls === 'edge')!.d;
		expect(crank(later)).not.toEqual(crank(rest));
		const base = (items: typeof rest) => items.find((i) => i.part === 2)!.shapes.find((s) => s.cls === 'edge')!.d;
		expect(base(later)).toEqual(base(rest));
	});

	it('draws a stacked solid after the one under it, whatever the input order', () => {
		const stack = normalizeScene([
			{ id: 'top', kind: 'box', w: 20, d: 20, h: 10, at: [0, 0, 15] },
			{ id: 'bottom', kind: 'box', w: 20, d: 20, h: 10, at: [0, 0, 5] },
			{ id: 'back', kind: 'box', w: 6, d: 6, h: 6, at: [-30, -30, 3] }
		]);
		const items = drawScene(stack, fitScene(stack, 300, 300), stack.parts.map(() => IDENTITY));
		expect(items.map((i) => stack.parts[i.part]!.id)).toEqual(['back', 'bottom', 'top']);
		const tones = items[0]!.shapes.filter((s) => s.cls === 'shade' || s.cls === 'top');
		expect(tones.length).toBeGreaterThan(0);
	});

	it('speed expressions resolve over params with the expression resolver', () => {
		expect(evaluateExpression('cadence / 60', { state: {}, cadence: 90 })).toBe(1.5);
	});
});
