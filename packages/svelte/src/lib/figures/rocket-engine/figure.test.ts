import { expect, test } from 'vitest';
import { pointsOf } from '../frame.js';
import { anchorsOf, engineSvg } from './figure.js';
import { clampParams } from './model.js';

const viewBox = (svg: string) => svg.match(/viewBox="([^"]*)"/)![1]!.split(' ').map(Number) as [number, number, number, number];

test('rocket-engine: the viewBox holds every point it draws, at any throttle and shaft angle', () => {
	for (const svg of [engineSvg(clampParams({ throttle: 100, mixture: 2.2 }), { theta: 2.1, t: 3.3 }), engineSvg(clampParams({ throttle: 40, mixture: 3 }), { theta: 5, t: 0.9 })]) {
		const [x, y, w, h] = viewBox(svg);
		// One expect over the stray points: an expect per point times out under a loaded suite.
		expect(pointsOf(svg).filter(([px, py]) => px < x || px > x + w || py < y || py > y + h)).toEqual([]);
	}
});

test('rocket-engine: anchors are unique and the gauge needle is drawn', () => {
	const ids = anchorsOf().map((a) => a.id);
	expect(new Set(ids).size).toBe(ids.length);
	expect(engineSvg()).toMatch(/data-needle="" d="M/);
});
