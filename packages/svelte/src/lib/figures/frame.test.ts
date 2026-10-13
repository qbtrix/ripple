import { describe, expect, test } from 'vitest';
import { FIGURES } from './index.js';
import { frameOf, pointsOf } from './frame.js';
import { heartSvg } from './heart/figure.js';
import { bikeSvg } from './bike-gears/figure.js';
import { clampParams as heartParams } from './heart/model.js';
import { clampParams as bikeParams } from './bike-gears/model.js';

const viewBox = (svg: string) => svg.match(/viewBox="([^"]*)"/)![1]!.split(' ').map(Number) as [number, number, number, number];

describe('figure framing', () => {
	test.each(Object.keys(FIGURES))('%s: every anchor (and its pin) sits inside the viewBox', async (id) => {
		const { meta } = await FIGURES[id]!.load();
		expect(meta.anchors.length).toBeGreaterThan(0);
		for (const a of meta.anchors) {
			expect(a.x, a.id).toBeGreaterThan(2);
			expect(a.x, a.id).toBeLessThan(98);
			expect(a.y, a.id).toBeGreaterThan(2);
			expect(a.y, a.id).toBeLessThan(98);
		}
	});

	const frames: Array<[string, string[]]> = [
		['heart', [heartSvg(heartParams({ bpm: 40, stroke: 110 }), 0.3), heartSvg(heartParams({ bpm: 180 }), 0.1)]],
		['bike-gears', [bikeSvg(bikeParams({ ring: 50, gear: 7 }), { theta: 0.7 }), bikeSvg(bikeParams({ ring: 34, gear: 1 }), { theta: 2.9, pose: { ring: 0.5, cog: 2.5 } })]]
	];
	test.each(frames)('%s: the viewBox holds every point it draws, at any moment', (_, svgs) => {
		for (const svg of svgs) {
			const [x, y, w, h] = viewBox(svg);
			for (const [px, py] of pointsOf(svg)) {
				expect(px).toBeGreaterThanOrEqual(x);
				expect(px).toBeLessThanOrEqual(x + w);
				expect(py).toBeGreaterThanOrEqual(y);
				expect(py).toBeLessThanOrEqual(y + h);
			}
		}
	});

	test('frameOf pads round points and pins', () => {
		expect(frameOf(['<path d="M10 20L30 40"/>'], [[50, 20]], 5, 2)).toEqual({ x: 5, y: 13, w: 52, h: 32 });
	});
});
