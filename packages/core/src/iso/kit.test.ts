// Tests for the iso kit port: projection, closed solids with four tones,
// depth order, and that no file under iso/ touches the DOM or svelte.
import { describe, it, expect } from 'vitest';
import { cylinder, depthOf, extrude, iso, roundedPlan, slabOf, type Projection } from './kit.js';
import { axisFrame, circlePolygon, coneOf, gearRing, prismOf, sphereOf } from './solids.js';

const P: Projection = { origin: [100, 50], scale: 1 };

describe('iso kit', () => {
	it('projects known points', () => {
		expect(iso([0, 0, 0], P)).toEqual([100, 50]);
		const unit = Math.sqrt(1.6);
		const [x, y] = iso([1, 0, 0], P);
		expect(x).toBeCloseTo(100 + Math.SQRT1_2 * unit, 6);
		expect(y).toBeCloseTo(50 + Math.SQRT1_2 * 0.5 * unit, 6);
		const [, upY] = iso([0, 0, 1], P);
		expect(upY).toBeCloseTo(50 - (Math.sqrt(3) / 2) * unit, 6);
	});

	it('extrude and cylinder give closed paths with four shade tones', () => {
		for (const solid of [cylinder(0, 0, 10, 0, 8, P), extrude(roundedPlan({ x: -5, y: -5, w: 10, d: 10, r: 2 }), 0, 6, P)]) {
			expect(solid.fill).toMatch(/^M.*Z$/);
			expect(solid.top).toMatch(/Z$/);
			expect(solid.shades).toHaveLength(4);
			expect(solid.shades.filter(Boolean).length).toBeGreaterThan(0);
		}
	});

	it('prisms, gears, cones and spheres on any axis are closed with four shades', () => {
		const solids = [
			prismOf(axisFrame([0, 0, 0], 'y'), gearRing(20, 24), -2, 2, P),
			prismOf(axisFrame([0, 0, 0], 'x'), circlePolygon(6), -10, 10, P),
			coneOf(axisFrame([0, 0, 0], 'z'), 8, -6, 6, P),
			sphereOf([0, 0, 0], 10, P)
		];
		for (const solid of solids) {
			expect(solid.fill).toMatch(/^M.*Z$/);
			expect(solid.shades).toHaveLength(4);
		}
		expect(gearRing(20, 24)).toHaveLength(96);
	});

	it('orders a stacked solid in front of the one under it', () => {
		const below = slabOf({ x: -10, y: -10, w: 20, d: 20, r: 0 }, 0, 10, P);
		const above = slabOf({ x: -10, y: -10, w: 20, d: 20, r: 0 }, 10, 10, P);
		expect(below.fill).not.toEqual(above.fill);
		expect(depthOf([0, 0, 15], P)).toBeGreaterThan(depthOf([0, 0, 5], P));
		expect(depthOf([10, 10, 0], P)).toBeGreaterThan(depthOf([-10, -10, 0], P));
	});
});

const SOURCES = import.meta.glob('./*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('iso purity', () => {
	it('no iso source imports svelte or touches the DOM at module level', () => {
		const files = Object.entries(SOURCES).filter(([key]) => !key.endsWith('.test.ts'));
		expect(files.length).toBeGreaterThan(1);
		for (const [, source] of files) {
			expect(source).not.toMatch(/from\s+['"]svelte/);
			expect(source).not.toMatch(/^\s*(document|window|navigator)\b/m);
			expect(source).not.toMatch(/querySelector|setAttribute/);
		}
	});
});
