// widgets/data/map-labels.test.ts: label side picking keeps chips in the
// frame, off the controls and off the route end.
import { describe, expect, it } from 'vitest';
import { crosses, pickSide } from './map-labels';

const frame = { w: 300, h: 180 };

describe('pickSide', () => {
	it('stays below when there is room', () => {
		expect(pickSide(150, 60, 80, 20, 11, frame, [], [])).toBe('below');
	});

	it('turns right at the left edge and left at the right edge', () => {
		expect(pickSide(10, 60, 120, 20, 11, frame, [], [])).toBe('right');
		expect(pickSide(290, 60, 120, 20, 11, frame, [], [])).toBe('left');
	});

	it('goes above at the bottom edge', () => {
		expect(pickSide(150, 176, 80, 20, 11, frame, [], [])).toBe('above');
	});

	it('moves off a control', () => {
		const zoom = { x: 10, y: 10, w: 30, h: 58 };
		expect(pickSide(40, 40, 80, 20, 11, frame, [zoom], [])).toBe('right');
	});

	it('moves off the route that arrives from below', () => {
		expect(pickSide(150, 60, 80, 20, 11, frame, [], [[150, 160, 150, 60]])).toBe('right');
	});
});

describe('crosses', () => {
	const r = { x: 0, y: 0, w: 10, h: 10 };
	it('detects a pass through and a miss', () => {
		expect(crosses([-5, 5, 15, 5], r)).toBe(true);
		expect(crosses([-5, 15, 15, 15], r)).toBe(false);
	});
});

describe('pickSide priorities', () => {
	it('crosses a route rather than tuck a few pixels under a control', () => {
		const zoom = { x: 10, y: 10, w: 30, h: 57 };
		expect(pickSide(58, 51, 110, 18, 11, frame, [zoom], [[58, 51, 200, 100]])).toBe('right');
	});
});
