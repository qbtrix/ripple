import { describe, expect, test } from 'vitest';
import { pointsOf } from '../frame.js';
import { clampParams } from './model.js';
import { driveAt, tokamakSvg } from './figure.js';

const viewBox = (svg: string) => svg.match(/viewBox="([^"]*)"/)![1]!.split(' ').map(Number) as [number, number, number, number];

describe('tokamak figure', () => {
	const hot = clampParams();
	const cold = clampParams({ current: 5, heating: 10 });

	test('the viewBox holds every point it draws, at any moment', () => {
		for (const svg of [tokamakSvg(hot, driveAt(hot, 0.7)), tokamakSvg(cold, driveAt(cold, 9.3)), tokamakSvg(hot, driveAt(hot, 40))]) {
			const [x, y, w, h] = viewBox(svg);
			for (const [px, py] of pointsOf(svg)) {
				expect(px).toBeGreaterThanOrEqual(x);
				expect(px).toBeLessThanOrEqual(x + w);
				expect(py).toBeGreaterThanOrEqual(y);
				expect(py).toBeLessThanOrEqual(y + h);
			}
		}
	});

	test('motion is a pure function of time, and it moves', () => {
		expect(tokamakSvg(hot, driveAt(hot, 2))).toBe(tokamakSvg(hot, driveAt(hot, 2)));
		expect(tokamakSvg(hot, driveAt(hot, 2))).not.toBe(tokamakSvg(hot, driveAt(hot, 3)));
	});

	test('a hot plasma streams faster than a cold one', () => {
		expect(driveAt(hot, 10).stream).toBeGreaterThan(driveAt(cold, 10).stream);
		expect(driveAt(hot, 10).beam).toBeGreaterThan(driveAt(cold, 10).beam);
	});

	test('stays a reasonable size for a chat card', () => {
		expect(tokamakSvg().length).toBeLessThan(450_000);
	});
});
