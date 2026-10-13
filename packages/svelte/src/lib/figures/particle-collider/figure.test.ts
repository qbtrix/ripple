import { describe, expect, test } from 'vitest';
import { pointsOf } from '../frame.js';
import { anchorsOf, colliderSvg } from './figure.js';
import { clampParams } from './model.js';

const viewBox = (svg: string) => svg.match(/viewBox="([^"]*)"/)![1]!.split(' ').map(Number) as [number, number, number, number];

describe('particle-collider figure', () => {
	test('the viewBox holds every point it draws, through a crossing and at both slider ends', () => {
		for (const [p, t] of [[clampParams({ energy: 7, rate: 40 }), 0.2], [clampParams({ energy: 0.5, rate: 5 }), 3.3], [clampParams(), 0.9]] as const) {
			const svg = colliderSvg(p, t);
			const [x, y, w, h] = viewBox(svg);
			for (const [px, py] of pointsOf(svg)) {
				expect(px).toBeGreaterThanOrEqual(x);
				expect(px).toBeLessThanOrEqual(x + w);
				expect(py).toBeGreaterThanOrEqual(y);
				expect(py).toBeLessThanOrEqual(y + h);
			}
		}
	}, 30_000);

	test('a crossing draws bunches of both beams, tracks and the needle', () => {
		const svg = colliderSvg(clampParams(), 0.1);
		expect(svg).toContain('data-beam="1"');
		expect(svg).toContain('data-beam="2"');
		expect(svg).toContain('pc-track');
		expect(svg).toMatch(/data-needle="" d="M/);
	});

	test('anchors are unique and inside the box', () => {
		const ids = anchorsOf().map((a) => a.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const a of anchorsOf()) expect(a.x > 2 && a.x < 98 && a.y > 2 && a.y < 98, a.id).toBe(true);
	});
});
