// Tests for the iso audit: each check fails on a planted fault and passes the
// same drawing once the fault is fixed. Inputs are kit SVG strings, as figures write them.
import { describe, it, expect } from 'vitest';
import { auditSvg, boxShape, looseEnds, readSvg, shapeAttr, supports } from './audit.js';
import { circlePolygon, frameAlong } from './solids.js';
import type { Point3 } from './kit.js';

const group = (item: string, attrs: string) => `<g data-item="${item}"><g class="iso-solid"${attrs}><path class="iso-fill" d="M0 0L1 0L1 1Z"/></g></g>`;
const solid = (item: string, box: number[], extra = '') => group(item, shapeAttr(boxShape(box.slice(0, 3) as Point3, box.slice(3) as Point3)) + extra);
const svg = (body: string) => `<svg class="iso-svg" viewBox="0 0 100 100">${body}</svg>`;

describe('supports', () => {
	const base = solid('base', [0, 0, 0, 100, 100, 10], ' data-ground=""');
	const block = (z0: number) => solid('block', [10, 10, z0, 20, 20, z0 + 10]);

	it('passes a box sitting on the ground solid', () => {
		expect(supports(readSvg(svg(base + block(10))).solids)).toEqual({ check: 'supports', count: 0, items: [] });
	});

	it('fails a floating box and reports its gap', () => {
		const report = supports(readSvg(svg(base + block(14))).solids);
		expect(report.count).toBe(1);
		expect(report.items[0]).toEqual({ id: 'block/0', gap: 4, nearest: 'base/0' });
	});

	it('holds a chain of touching boxes and skips parts marked floating', () => {
		const label = solid('label', [50, 50, 80, 60, 60, 90], ' data-floating=""');
		const top = solid('top', [10, 10, 20, 20, 20, 30]);
		expect(supports(readSvg(svg(base + block(10) + top + label)).solids).count).toBe(0);
	});

	it('measures a slanted tube by its shape, not its box', () => {
		// A tube from (0,0,10) to (100,0,110), radius 2: its box covers (80..90, -5..5, 15..25), the tube does not.
		const tube = (r: number) => group('tube', shapeAttr({ F: frameAlong([0, 0, 10], [1, 0, 1]), rings: [circlePolygon(r, 24)], s0: 0, s1: Math.SQRT2 * 100 }));
		const cube = solid('cube', [80, -5, 15, 90, 5, 25]);
		const report = supports(readSvg(svg(base + tube(2) + cube)).solids);
		// Nearest held solid is the base, 5 below; the tube's box would have touched it.
		expect(report.items).toEqual([{ id: 'cube/0', gap: 5, nearest: 'base/0' }]);
		// A fatter tube reaches the cube's corner and holds it.
		expect(supports(readSvg(svg(base + tube(48) + cube)).solids).count).toBe(0);
	});

	it('fails a solid without a shape: not measured is never a pass', () => {
		const bare = `<g data-item="bare"><g class="iso-solid"><path class="iso-fill" d="M0 0L1 0Z"/></g></g>`;
		expect(supports(readSvg(svg(base + bare)).solids).items).toEqual([{ id: 'bare/0', gap: null, nearest: '' }]);
	});
});

describe('loose ends', () => {
	const post = '<g data-item="post"><path class="iso-line iso-edge" d="M50 10L50 90"/></g>';
	const wire = (x: number) => `<g data-item="wire"><path class="iso-line" d="M10 50L${x} 50"/></g>`;

	it('passes a wire whose ends land on an outline and a dot', () => {
		const dot = '<g class="iso-dots"><circle cx="10" cy="50" r="0.5"/></g>';
		expect(looseEnds(readSvg(svg(post + dot + wire(50))).marks).count).toBe(0);
	});

	it('fails a dangling wire end and says which end', () => {
		const report = looseEnds(readSvg(svg(post + wire(45))).marks);
		expect(report.count).toBe(2);
		expect(report.items.map((i) => [i.id, i.end, i.gap])).toEqual([
			['wire', 'start', 40],
			['wire', 'end', 5]
		]);
	});

	it('lets free ends go, and hides an end under a fill painted after it', () => {
		const free = '<g data-item="wire"><path class="iso-line" data-free="start" d="M10 50L50 50"/></g>';
		expect(looseEnds(readSvg(svg(post + free)).marks).count).toBe(0);
		const cover = '<g data-item="cap"><path class="iso-fill" d="M40 40L60 40L60 60L40 60Z"/></g>';
		expect(looseEnds(readSvg(svg(wire(45) + cover + post)).marks).items.map((i) => i.end)).toEqual(['start']);
		// A hole ring (wound the other way) leaves the end visible.
		const ring = '<g data-item="ring"><path class="iso-fill" d="M40 40L60 40L60 60L40 60ZM43 43L43 57L57 57L57 43Z"/></g>';
		expect(looseEnds(readSvg(svg(wire(45) + ring)).marks).items.map((i) => i.end)).toEqual(['start', 'end']);
	});

	it('needs only one rooted end on a short tick', () => {
		const tick = (y: number) => `<g data-item="tick"><path class="iso-line" d="M50 ${y}L55 ${y}"/></g>`;
		const edge = '<g data-item="edge"><path class="iso-line iso-edge" d="M50 0L50 100"/></g>';
		expect(looseEnds(readSvg(svg(edge + tick(40))).marks).count).toBe(0);
		expect(looseEnds(readSvg(svg(edge.replace('M50 0', 'M47 0').replace('L50 100', 'L47 100') + tick(40))).marks).count).toBe(2);
	});
});

describe('auditSvg', () => {
	it('runs both checks', () => {
		expect(auditSvg(svg('')).map((r) => [r.check, r.count])).toEqual([
			['supports', 0],
			['loose-ends', 0]
		]);
	});
});
