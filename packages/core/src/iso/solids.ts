/**
 * @file iso/solids.ts
 * @description Solids on an arbitrary axis for the iso kit: a frame (origin,
 * axis, two cross vectors), prisms along it (boxes, cylinders, gears, rods),
 * spheres, cones, and the gear tooth ring. Every solid returns the kit's
 * `SolidPaths` (hull fill, four shade bands plus a lit `top` band, creases),
 * so moving parts are re-drawn by moving their frame, never by CSS transform.
 * Pure functions, no DOM.
 *
 * Frame, light, band, hull, prism and sphere are ported from Anatomy's
 * kit/lathe.mjs by Ryan (https://github.com/wheresryan22/anatomy), MIT; cone
 * and gear ring are new here. Full license: THIRD_PARTY_NOTICES.md.
 */

import { cameraOf, iso, pathOf, type Flat, type Point3, type Projection, type SolidPaths } from './kit.js';

const TAU = Math.PI * 2;
const LIGHT_UP = 1.2;
const BANDS = [0, 0.2, 0.42, 0.62];

export interface Frame {
	o: Point3;
	a: Point3;
	u: Point3;
	v: Point3;
}

export const dot3 = (a: Point3, b: Point3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const add3 = (a: Point3, b: Point3): Point3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a: Point3, b: Point3): Point3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul3 = (a: Point3, k: number): Point3 => [a[0] * k, a[1] * k, a[2] * k];
export const len3 = (a: Point3) => Math.hypot(a[0], a[1], a[2]);
export const unit3 = (a: Point3): Point3 => {
	const length = len3(a) || 1;
	return [a[0] / length, a[1] / length, a[2] / length];
};
export const cross3 = (a: Point3, b: Point3): Point3 => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0]
];

/** Unit vector from the scene toward the camera. */
export function viewOf(P: Projection): Point3 {
	const { sinA, cosA, sinE, cosE } = cameraOf(P);
	return [cosA * cosE, sinA * cosE, sinE];
}

/** The key light: from the upper left of the view. */
export function lightOf(P: Projection): Point3 {
	const { sinA, cosA } = cameraOf(P);
	return unit3([-sinA, cosA, LIGHT_UP]);
}

/** Light score to band: 0..3 are shade bands, 4 is the lit top. */
export function bandOf(score: number) {
	let tone = 0;
	while (tone < BANDS.length && score >= BANDS[tone]!) tone++;
	return tone;
}

/** A right-handed frame whose axis is `a` (u x v = a). */
export function frameAlong(o: Point3, a: Point3): Frame {
	const axis = unit3(a);
	const helper: Point3 = Math.abs(axis[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
	const u = unit3(cross3(helper, axis));
	const v = cross3(axis, u);
	return { o, a: axis, u, v };
}

/** The frame for a world axis, with stable cross vectors. */
export function axisFrame(o: Point3, axis: 'x' | 'y' | 'z'): Frame {
	if (axis === 'x') return { o, a: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] };
	if (axis === 'y') return { o, a: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] };
	return { o, a: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] };
}

export function pointOf(F: Frame, s: number, x: number, y: number): Point3 {
	return [
		F.o[0] + F.a[0] * s + F.u[0] * x + F.v[0] * y,
		F.o[1] + F.a[1] * s + F.u[1] * x + F.v[1] * y,
		F.o[2] + F.a[2] * s + F.u[2] * x + F.v[2] * y
	];
}

export function hullOf(points: Flat[]): Flat[] {
	const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	if (sorted.length < 3) return sorted;
	const cross = (o: Flat, a: Flat, b: Flat) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
	const lower: Flat[] = [];
	for (const point of sorted) {
		while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 1e-9) lower.pop();
		lower.push(point);
	}
	const upper: Flat[] = [];
	for (let index = sorted.length - 1; index >= 0; index--) {
		const point = sorted[index]!;
		while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 1e-9) upper.pop();
		upper.push(point);
	}
	return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function oriented(points: Flat[]): Flat[] {
	let area = 0;
	for (let i = 0; i < points.length; i++) {
		const [ax, ay] = points[i]!;
		const [bx, by] = points[(i + 1) % points.length]!;
		area += ax * by - bx * ay;
	}
	return area < 0 ? [...points].reverse() : points;
}

/** A polygon (in the frame's u,v plane) swept along the axis from s0 to s1. */
export function prismOf(F: Frame, polygon: Flat[], s0: number, s1: number, P: Projection): SolidPaths {
	const V = viewOf(P);
	const L = lightOf(P);
	const ring = oriented(polygon);
	const n = ring.length;
	const low = ring.map(([x, y]) => iso(pointOf(F, s0, x, y), P));
	const high = ring.map(([x, y]) => iso(pointOf(F, s1, x, y), P));
	const buckets: string[][] = [[], [], [], [], []];
	const seen: boolean[] = [];
	for (let j = 0; j < n; j++) {
		const [x0, y0] = ring[j]!;
		const [x1, y1] = ring[(j + 1) % n]!;
		const normal = unit3(add3(mul3(F.u, y1 - y0), mul3(F.v, -(x1 - x0))));
		const visible = dot3(normal, V) > 1e-6;
		seen.push(visible);
		if (visible) buckets[bandOf(dot3(normal, L))]!.push(pathOf([low[j]!, low[(j + 1) % n]!, high[(j + 1) % n]!, high[j]!], true));
	}
	const ends: Array<[Flat[], Point3]> = [
		[low, mul3(F.a, -1)],
		[high, F.a]
	];
	const capSeen = ends.map(([, normal]) => dot3(unit3(normal), V) > 1e-6);
	ends.forEach(([points, normal], index) => {
		if (capSeen[index]) buckets[bandOf(dot3(unit3(normal), L))]!.push(pathOf(points, true));
	});
	const hull = hullOf([...low, ...high]);
	const creases: string[] = [];
	for (let j = 0; j < n; j++) {
		const prev = (j - 1 + n) % n;
		const a = [ring[j]![0] - ring[prev]![0], ring[j]![1] - ring[prev]![1]];
		const b = [ring[(j + 1) % n]![0] - ring[j]![0], ring[(j + 1) % n]![1] - ring[j]![1]];
		const sharp = (a[0]! * b[0]! + a[1]! * b[1]!) / (Math.hypot(a[0]!, a[1]!) * Math.hypot(b[0]!, b[1]!) || 1) < Math.cos(0.35);
		if (sharp && seen[j] && seen[prev]) creases.push(pathOf([low[j]!, high[j]!]));
		ends.forEach(([points], index) => {
			if (capSeen[index] && seen[j]) creases.push(pathOf([points[j]!, points[(j + 1) % n]!]));
		});
	}
	return {
		fill: pathOf(hull, true),
		outline: pathOf(hull, true),
		crease: creases.join(''),
		top: buckets[4]!.join(''),
		shades: buckets.slice(0, 4).map((list) => list.join(''))
	};
}

/** A sphere as nested light caps: no facets, so it reads as round. */
export function sphereOf(centre: Point3, r: number, P: Projection, steps = 48): SolidPaths {
	const V = viewOf(P);
	const L = lightOf(P);
	const F = frameAlong(centre, V);
	const flat = (p: Point3) => iso(p, P);
	const rim = Array.from({ length: steps }, (_, i) => pointOf(F, 0, r * Math.cos((i / steps) * TAU), r * Math.sin((i / steps) * TAU)));
	const outline = pathOf(rim.map(flat), true);
	const capOf = (threshold: number) => {
		const points = rim.filter((p) => dot3(sub3(p, centre), L) / r >= threshold).map(flat);
		const LF = frameAlong(add3(centre, mul3(L, r * threshold)), L);
		const radius = r * Math.sqrt(Math.max(0, 1 - threshold * threshold));
		for (let i = 0; i < steps; i++) {
			const p = pointOf(LF, 0, radius * Math.cos((i / steps) * TAU), radius * Math.sin((i / steps) * TAU));
			if (dot3(sub3(p, centre), V) >= -1e-9) points.push(flat(p));
		}
		if (dot3(L, V) > threshold) points.push(flat(add3(centre, mul3(V, r))));
		return points.length > 2 ? pathOf(hullOf(points), true) : '';
	};
	return { fill: outline, outline, crease: '', top: capOf(0.8), shades: [outline, capOf(BANDS[1]!), capOf(BANDS[2]!), capOf(BANDS[3]!)], seamless: true };
}

/** A cone: base circle at s0, apex at s1. */
export function coneOf(F: Frame, r: number, s0: number, s1: number, P: Projection, steps = 36): SolidPaths {
	const V = viewOf(P);
	const L = lightOf(P);
	const rim3 = Array.from({ length: steps }, (_, i) => pointOf(F, s0, r * Math.cos((i / steps) * TAU), r * Math.sin((i / steps) * TAU)));
	const apex3 = pointOf(F, s1, 0, 0);
	const rim = rim3.map((p) => iso(p, P));
	const apex = iso(apex3, P);
	const buckets: string[][] = [[], [], [], [], []];
	for (let j = 0; j < steps; j++) {
		const a = rim3[j]!;
		const b = rim3[(j + 1) % steps]!;
		const normal = unit3(cross3(sub3(b, a), sub3(apex3, a)));
		const facing = dot3(normal, sub3(a, F.o)) < 0 ? mul3(normal, -1) : normal;
		if (dot3(facing, V) > 1e-6) buckets[bandOf(dot3(facing, L))]!.push(pathOf([rim[j]!, rim[(j + 1) % steps]!, apex], true));
	}
	const base = mul3(F.a, s1 > s0 ? -1 : 1);
	if (dot3(unit3(base), V) > 1e-6) buckets[bandOf(dot3(unit3(base), L))]!.push(pathOf(rim, true));
	const hull = pathOf(hullOf([...rim, apex]), true);
	return { fill: hull, outline: hull, crease: '', top: buckets[4]!.join(''), shades: buckets.slice(0, 4).map((list) => list.join('')) };
}

export function circlePolygon(r: number, steps = 32): Flat[] {
	return Array.from({ length: steps }, (_, i) => [r * Math.cos((i / steps) * TAU), r * Math.sin((i / steps) * TAU)] as Flat);
}

/** A spur gear outline: `teeth` trapezoid teeth on a root circle. */
export function gearRing(r: number, teeth: number, depth = Math.min(r * 0.18, 6)): Flat[] {
	const out: Flat[] = [];
	const root = r - depth;
	const pitch = TAU / teeth;
	for (let t = 0; t < teeth; t++) {
		const a = t * pitch;
		for (const [f, rad] of [
			[0, root],
			[0.2, r],
			[0.5, r],
			[0.7, root]
		] as const) {
			out.push([rad * Math.cos(a + f * pitch), rad * Math.sin(a + f * pitch)]);
		}
	}
	return out;
}
