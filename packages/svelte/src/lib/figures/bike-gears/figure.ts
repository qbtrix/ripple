// figures/bike-gears/figure.ts: a bicycle drivetrain drawn the Anatomy way, as
// the back half of a bike clamped on a bench stand, with the @ripple-ui/core/iso
// kit. World: x toward the front of the bike, y toward the viewer (the drive
// side), z up; 1 unit is half a millimetre, so the 6.35-unit chain pitch is a
// real half-inch chain at half scale and every sprocket's pitch radius is
// teeth x pitch / 2 pi.
//
// Every part is a plate facing +y (sprockets, cage plates, crank arms, pedals)
// or a tube, so painter's order is a sort on y: the chain sits in front of the
// cogs inboard of it and behind the ones outboard, between the derailleur cage
// plates. The chain is n links of one pitch on a loop round the ring, the
// tension and guide jockeys and the cog; the rear cage swings until the loop is
// exactly n pitches long (what its spring does on a real bike), and each
// meshed sprocket's teeth are placed from the pins sitting on it, so teeth and
// rollers always mesh.
//
// `bikeSvg()` is pure (strings only). `mount()` keeps one <g data-item> per
// part, rewrites only the parts that move and reorders them only when a shift
// changes the order. Look: Anatomy's four-tone neutral ramp, thin lines, one
// lit part (the cog the chain is on). No DOM or work at module top level.

import * as k from '@ripple-ui/core/iso';
import type { Flat, Point3, SolidPaths } from '@ripple-ui/core/iso';
import { PAPER_CSS } from '../paper.js';
import { frameOf, framed, percentIn, type FrameBox } from '../frame.js';
import { clampParams, crankSpeedOf, describe, poseAt, poseOf, ratioOf, readoutsOf, ringTeethAt, teethAt, CASSETTE, RINGS, type BikeParams, type Pose } from './model.js';

export const WIDTH = 640;
export const HEIGHT = 420;

const PITCH = 6.35;
const TAU = Math.PI * 2;
const pitchR = (teeth: number) => (teeth * PITCH) / TAU;
const BBZ = 105; // bottom bracket height above the plate
const HX = -205; // rear hub
const HZ = 118;
const CRANK = 85;
const RJ = pitchR(11); // jockey wheels
const CAGE = 34; // guide to tension jockey
const RING_Y = (ring: number) => 21.8 + 6 * ring;
const COG_Y = (cog: number) => 10 + 3.5 * cog;
const RIM = { inner: 150, outer: 158, tyre: 171 };
const SECTOR: [number, number] = [(50 * Math.PI) / 180, (205 * Math.PI) / 180];
const ST: Point3 = [-0.276, 0, 0.961]; // seat tube direction
const PLATE = { x: -372, y: -104, w: 486, d: 190, r: 10 };
const PLATE_H = 10;
const FOOT_H = 5;
const POST_Y = -90;

let P = null as unknown as k.Projection;
let V: Point3 = [0, 0, 0];
let LIGHT: Point3 = [0, 0, 1];
let LINKS = 0;
let STATIC: Item[] = [];

const at = (p: Point3): Flat => k.iso(p, P);
const S = (paths: SolidPaths, style: k.SolidStyle = {}) => k.solidSvg(paths, style);
const L = (d: string, style: k.LineStyle = {}) => k.lineSvg(d, style);
const D = (points: Flat[], style: { size?: number; tone?: k.Tone } = {}) => k.dotsSvg(points, style);
const xz = (x: number, z: number, y: number): Point3 => [x, y, z];
const onSeatTube = (h: number, y = 0): Point3 => [ST[0] * h, y, BBZ + ST[2] * h];

interface Item {
	id: string;
	key: number;
	svg: string;
}

// ---- geometry helpers ------------------------------------------------------

type Ring2 = Flat[]; // a closed polygon in world (x, z)

const circle = (cx: number, cz: number, r: number, steps = 32, from = 0): Ring2 => Array.from({ length: steps }, (_, i) => [cx + r * Math.cos(from + (i / steps) * TAU), cz + r * Math.sin(from + (i / steps) * TAU)] as Flat);

function area(ring: Ring2) {
	let a = 0;
	for (let i = 0; i < ring.length; i++) {
		const [ax, az] = ring[i]!;
		const [bx, bz] = ring[(i + 1) % ring.length]!;
		a += ax * bz - bx * az;
	}
	return a;
}

/** A plate facing +y: `outer` (and optional holes) in world x,z, swept from y0 to y1. Concave outlines are fine. */
function plate(outer: Ring2, y0: number, y1: number, holes: Ring2[] = []): SolidPaths {
	const rings = [area(outer) < 0 ? [...outer].reverse() : outer, ...holes.map((h) => (area(h) > 0 ? [...h].reverse() : h))];
	const front = V[1] > 0 ? y1 : y0;
	const back = front === y1 ? y0 : y1;
	const buckets: string[][] = [[], [], [], [], []];
	const edges: Flat[][] = [];
	const creases: Flat[][] = [];
	rings.forEach((ring, ri) => {
		for (let j = 0; j < ring.length; j++) {
			const [x0, z0] = ring[j]!;
			const [x1, z1] = ring[(j + 1) % ring.length]!;
			const n = k.unit3([z1 - z0, 0, -(x1 - x0)]);
			if (k.dot3(n, V) <= 1e-6) continue;
			buckets[k.bandOf(k.dot3(n, LIGHT))]!.push(k.pathOf([at(xz(x0, z0, y0)), at(xz(x1, z1, y0)), at(xz(x1, z1, y1)), at(xz(x0, z0, y1))], true));
			(ri === 0 ? edges : creases).push([at(xz(x0, z0, back)), at(xz(x1, z1, back))]);
		}
	});
	const cap = (y: number) => rings.map((ring) => k.pathOf(ring.map(([x, z]) => at(xz(x, z, y))), true)).join('');
	buckets[k.bandOf(k.dot3([0, Math.sign(front - back), 0], LIGHT))]!.push(cap(front));
	const joinSegs = (segs: Flat[][]) => segs.map((s) => k.pathOf(s)).join('');
	return {
		fill: cap(front) + cap(back),
		outline: cap(front) + joinSegs(edges),
		crease: joinSegs(creases),
		top: buckets[4]!.join(''),
		shades: buckets.slice(0, 4).map((b) => b.join(''))
	};
}

/** A sprocket outline: valleys (where rollers sit) at `rot + j * pitch` on the pitch circle. */
function sprocket(cx: number, cz: number, teeth: number, rot: number, r = pitchR(teeth)): Ring2 {
	const out: Ring2 = [];
	const p = TAU / teeth;
	const root = r - 1.3;
	const tip = r + 1.6;
	for (let j = 0; j < teeth; j++) {
		const b = rot + j * p;
		for (const [f, rad] of [[0.18, root], [0.36, tip], [0.64, tip], [0.82, root]] as const) out.push([cx + rad * Math.cos(b + f * p), cz + rad * Math.sin(b + f * p)]);
	}
	return out;
}

/** A tube between two world points. */
const tube = (a: Point3, b: Point3, r: number, steps = 24) => k.prismOf(k.frameAlong(a, k.sub3(b, a)), k.circlePolygon(r, steps), 0, k.len3(k.sub3(b, a)), P);

/** A flat bar in x,z from a to b, half-width w, round ends. */
function bar(a: Flat, b: Flat, w: number, wb = w): Ring2 {
	const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
	const half = (c: Flat, r: number, from: number) => Array.from({ length: 9 }, (_, i) => [c[0] + r * Math.cos(from + (i / 8) * Math.PI), c[1] + r * Math.sin(from + (i / 8) * Math.PI)] as Flat);
	return [...half(b, wb, ang - Math.PI / 2), ...half(a, w, ang + Math.PI / 2)];
}

/** Convex hull of circles, for cage plates and dropouts. */
const hullOfCircles = (cs: Array<[number, number, number]>): Ring2 => k.hullOf(cs.flatMap(([x, z, r]) => circle(x, z, r, 24)));

// ---- the chain loop ----------------------------------------------------------

interface Wheel {
	c: Flat;
	r: number;
	s: 1 | -1; // +1 counter-clockwise in x,z, -1 clockwise
}
interface Seg {
	len: number;
	wheel?: Wheel;
	a0?: number; // arc start angle
	p0?: Flat;
	p1?: Flat;
}
interface Loop {
	segs: Seg[];
	length: number;
}

function tangent(A: Wheel, B: Wheel): { pa: Flat; pb: Flat; aOut: number; bIn: number; len: number } {
	const dx = B.c[0] - A.c[0];
	const dz = B.c[1] - A.c[1];
	const m = Math.hypot(dx, dz);
	const c = B.s * B.r - A.s * A.r;
	const phi = Math.atan2(dz, dx) - Math.asin(Math.max(-1, Math.min(1, c / m)));
	const px = -Math.sin(phi);
	const pz = Math.cos(phi);
	const na: Flat = [-A.s * px, -A.s * pz];
	const nb: Flat = [-B.s * px, -B.s * pz];
	const pa: Flat = [A.c[0] + A.r * na[0], A.c[1] + A.r * na[1]];
	const pb: Flat = [B.c[0] + B.r * nb[0], B.c[1] + B.r * nb[1]];
	return { pa, pb, aOut: Math.atan2(na[1], na[0]), bIn: Math.atan2(nb[1], nb[0]), len: Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) };
}

const mod = (v: number, m: number) => ((v % m) + m) % m;

/** The loop in travel order: ring, tension jockey, guide jockey, cog, back to the ring. Starts on the ring's arc. */
function loopOf(wheels: Wheel[]): Loop {
	const t = wheels.map((w, i) => tangent(w, wheels[(i + 1) % wheels.length]!));
	const segs: Seg[] = [];
	wheels.forEach((w, i) => {
		const into = t[(i - 1 + wheels.length) % wheels.length]!.bIn;
		const out = t[i]!.aOut;
		const sweep = w.s > 0 ? mod(out - into, TAU) : mod(into - out, TAU);
		segs.push({ len: w.r * sweep, wheel: w, a0: into });
		segs.push({ len: t[i]!.len, p0: t[i]!.pa, p1: t[i]!.pb });
	});
	return { segs, length: segs.reduce((n, s) => n + s.len, 0) };
}

function pointOnLoop(loop: Loop, q: number): Flat {
	let rest = mod(q, loop.length);
	for (const s of loop.segs) {
		if (rest <= s.len || s === loop.segs[loop.segs.length - 1]) {
			if (s.wheel) {
				const a = s.a0! + (s.wheel.s * rest) / s.wheel.r;
				return [s.wheel.c[0] + s.wheel.r * Math.cos(a), s.wheel.c[1] + s.wheel.r * Math.sin(a)];
			}
			const f = s.len ? rest / s.len : 0;
			return [s.p0![0] + (s.p1![0] - s.p0![0]) * f, s.p0![1] + (s.p1![1] - s.p0![1]) * f];
		}
		rest -= s.len;
	}
	return [0, 0];
}

interface Rig {
	pose: Pose;
	ringR: number;
	cogR: number;
	yr: number;
	yc: number;
	G: Flat;
	T: Flat;
	loop: Loop;
	wheels: Wheel[];
}

function rigAt(pose: Pose, links = LINKS, fixed = 0.6): Rig {
	const ringR = pitchR(ringTeethAt(pose.ring));
	const cogR = pitchR(teethAt(pose.cog));
	const G: Flat = [HX - 3, HZ - cogR - 6 - RJ];
	const wheelsAt = (alpha: number): Wheel[] => [
		{ c: [0, BBZ], r: ringR, s: -1 },
		{ c: [G[0] + CAGE * Math.sin(alpha), G[1] - CAGE * Math.cos(alpha)], r: RJ, s: -1 },
		{ c: G, r: RJ, s: 1 },
		{ c: [HX, HZ], r: cogR, s: -1 }
	];
	let lo = links > 0 ? -0.5 : fixed;
	let hi = links > 0 ? 1.3 : fixed;
	if (links > 0) {
		const want = links * PITCH;
		const f = (a: number) => loopOf(wheelsAt(a)).length - want;
		const flo = f(lo);
		if (Math.sign(flo) === Math.sign(f(hi))) hi = lo = Math.abs(flo) < Math.abs(f(hi)) ? lo : hi;
		for (let i = 0; i < 40 && hi - lo > 1e-5; i++) {
			const mid = (lo + hi) / 2;
			if (Math.sign(f(mid)) === Math.sign(flo)) lo = mid;
			else hi = mid;
		}
	}
	const wheels = wheelsAt((lo + hi) / 2);
	return { pose, ringR, cogR, yr: RING_Y(pose.ring), yc: COG_Y(pose.cog), G, T: wheels[1]!.c, loop: loopOf(wheels), wheels };
}

// ---- static parts -------------------------------------------------------------

function bench(): string {
	const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
	const feet = [...k.corners(PLATE, 24)].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
	for (const [x, y] of feet) {
		out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: 'lo' }));
		out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: 'lo' }));
	}
	out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: 'lo', inner: L(k.sideSeam(PLATE, -PLATE_H + 3, P), { tone: 'faint' }) }));
	out.push(L(k.planOutline(k.insetPlan(PLATE, 6), 0, P), { tone: 'faint' }));
	const screws = k.corners(PLATE, 11);
	out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(''), { tone: 'lo' }));
	out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
	const strip = { x: -150, y: PLATE.y + PLATE.d - 16, w: 230, d: 8, r: 1 };
	out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: 'lo', crease: 'none' }));
	const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 5, 5, strip.y + 0.8, 0.6, [2.2, 4], P);
	out.push(L(ticks.minor, { tone: 'lo' }), L(ticks.major, { tone: 'mid' }));
	const label = { x: -350, y: PLATE.y + PLATE.d - 24, w: 44, d: 14, r: 1.2 };
	out.push(S(k.slabOf(label, 0, 1, P, 3, 0.3), { tone: 'mid' }));
	for (const [i, yy] of [3.6, 7, 10.4].entries()) out.push(L(k.lineOnTop([label.x + 0.4, label.y + yy], [label.x + label.w - (i ? 10 : 0.4), label.y + yy], 1, P), { tone: i === 0 ? 'lo' : 'faint', free: 'end' }));
	return out.join('');
}

function halo(plan: k.Plan, far = false) {
	return `<path class="iso-halo bike-shadow"${far ? ' data-far=""' : ''} d="${k.haloOf(plan, 0, 0.1, P)}"/>`;
}

function staticItems(): Item[] {
	const items: Item[] = [];
	const add = (id: string, key: number, svg: string) => items.push({ id, key, svg });
	add('bench', -1e3, bench());
	// Stand: a post under the axle and a post with an arm clamping the seat tube, both behind the bike.
	const seatPostTop = 172;
	const clampAt = onSeatTube(seatPostTop - 6);
	for (const [id, x, top] of [['post-rear', HX, HZ - 9], ['post-seat', clampAt[0], clampAt[2] + 6]] as const) {
		const parts = [halo({ x: x - 9, y: POST_Y - 9, w: 18, d: 18, r: 9 })];
		parts.push(S(k.cylinder(x, POST_Y, 9, 0, 3, P, 32, 0.5), { tone: 'mid' }));
		parts.push(S(k.cylinder(x, POST_Y, 4.5, 3, top - 3, P, 28), { tone: 'mid', crease: 'none', inner: L(k.sideArc(x, POST_Y, 4.5, 20, P, 16), { tone: 'faint' }) }));
		add(id, -1e3 + 1, parts.join(''));
	}
	add('cup-rear', POST_Y + 12, S(plate([[HX - 7, HZ - 14], [HX + 7, HZ - 14], [HX + 7, HZ - 2.4], [HX - 7, HZ - 2.4]], POST_Y - 4, -44), { tone: 'mid' }));
	add('arm-seat', POST_Y + 12, S(plate([[clampAt[0] - 4, clampAt[2] - 3], [clampAt[0] + 4, clampAt[2] - 3], [clampAt[0] + 4, clampAt[2] + 3], [clampAt[0] - 4, clampAt[2] + 3]], POST_Y - 4, -9), { tone: 'mid' }));
	add('clamp-seat', 0.4, S(k.prismOf(k.frameAlong(onSeatTube(seatPostTop - 12), ST), k.circlePolygon(10, 32), 0, 12, P), { tone: 'mid' }) + D([at([clampAt[0] + 9.5, 6, clampAt[2]])], { size: 0.6 }));
	// Frame: seat tube, bottom bracket shell, stays and dropouts on each side.
	add('seat-tube', 0, S(tube(onSeatTube(0), onSeatTube(seatPostTop + 18), 7, 32), { tone: 'mid', crease: 'none' }));
	add('bb-shell', 0.2, S(plate(circle(0, BBZ, 10, 36), -17, 17), { tone: 'mid' }) + L(k.pathOf(circle(0, BBZ, 6.5, 36).map(([x, z]) => at(xz(x, z, 17))), true), { tone: 'faint' }));
	for (const side of [-1, 1]) {
		const y = side * 36;
		const dropout = hullOfCircles([[HX, HZ, 5.2], [HX + 16, HZ - 3, 4.4], [HX + 8, HZ + 14, 3.8], ...(side > 0 ? ([[HX - 6, HZ - 14, 4.6]] as Array<[number, number, number]>) : [])]);
		add(`dropout-${side}`, y + side * 0.5, S(plate(dropout, y - 1.3, y + 1.3), { tone: 'mid' }) + D([at(xz(HX + 12, HZ + 4, y + 1.3 * side))], { size: 0.45 }));
		const csA: Point3 = [4, side * 13, BBZ - 1];
		const csB: Point3 = [HX + 16, y, HZ - 3];
		const mid = k.add3(csA, k.mul3(k.sub3(csB, csA), 0.5));
		const dir = k.unit3(k.sub3(csB, csA));
		add(`stay-c-front-${side}`, side * 16, S(tube(csA, mid, 4.6), { tone: 'mid', crease: 'none' }));
		add(`stay-c-rear-${side}`, side * 34, S(tube(mid, csB, 4.6), { tone: 'mid', crease: 'none' }));
		add(`stay-c-band-${side}`, side * (side > 0 ? 34.1 : 16.1), S(k.prismOf(k.frameAlong(k.add3(mid, k.mul3(dir, -8)), dir), k.circlePolygon(5.4, 24), 0, 16, P), { tone: 'lo' }));
		add(`stay-s-${side}`, side * 33, S(tube(onSeatTube(150, side * 8), [HX + 8, y, HZ + 14], 3.6), { tone: 'mid', crease: 'none' }));
	}
	// Axle, nuts and hub shell.
	add('axle', 35, S(plate(circle(HX, HZ, 2.4, 20), -44, 41), { tone: 'mid', crease: 'none' }));
	add('nut', 40, S(plate(circle(HX, HZ, 4.6, 6, Math.PI / 6), 37.6, 41), { tone: 'mid' }));
	add('nut-nd', -40, S(plate(circle(HX, HZ, 4.6, 6, Math.PI / 6), -44, -37.6), { tone: 'mid' }));
	add('hub', 0.3, S(plate(circle(HX, HZ, 5.5, 28), -16, 8), { tone: 'mid', crease: 'none' }) + S(plate(circle(HX, HZ, 10, 32), -16, -14.4), { tone: 'mid' }) + S(plate(circle(HX, HZ, 10, 32), 5, 6.6), { tone: 'mid' }));
	add('lockring', 32.8, S(plate(sprocket(HX, HZ, 12, 0, 8.4), 31.6, 33.4), { tone: 'mid' }));
	// Rim and tyre: a cut-away sector of the rear wheel.
	const arc = (r: number, a0: number, a1: number, steps = 64): Ring2 => Array.from({ length: steps + 1 }, (_, i) => [HX + r * Math.cos(a0 + ((a1 - a0) * i) / steps), HZ + r * Math.sin(a0 + ((a1 - a0) * i) / steps)] as Flat);
	const sector = (r0: number, r1: number) => [...arc(r1, SECTOR[0], SECTOR[1]), ...arc(r0, SECTOR[1], SECTOR[0])];
	const rimSeam = L(k.pathOf(arc(RIM.inner + 3, SECTOR[0], SECTOR[1]).map(([x, z]) => at(xz(x, z, 4)))), { tone: 'faint' });
	add('rim', -0.6, S(plate(sector(RIM.inner, RIM.outer), -4, 4), { tone: 'mid', inner: rimSeam }));
	const wall = L(k.pathOf(arc(RIM.outer + 6, SECTOR[0], SECTOR[1]).map(([x, z]) => at(xz(x, z, 6.5)))), { tone: 'faint' });
	add('tyre', -0.5, S(plate(sector(RIM.outer, RIM.tyre), -6.5, 6.5), { tone: 'mid', inner: wall }));
	return items;
}

// ---- moving parts -------------------------------------------------------------

export interface DriveState {
	params: BikeParams;
	pose: Pose;
	/** Crank angle, radians (decreasing = pedalling forward). */
	theta: number;
	/** Chain travel, world units. */
	chain: number;
	/** Wheel angle, radians. */
	wheel: number;
}

/** Angle of the first pin on wheel segment `i` of the loop (a roller sits in a valley there). */
function pinAngle(rig: Rig, seg: number, chain: number, spacing: number): number {
	let start = 0;
	for (let i = 0; i < seg; i++) start += rig.loop.segs[i]!.len;
	const s = rig.loop.segs[seg]!;
	const into = mod(start - chain, spacing); // first pin at or after the arc start
	return s.a0! + (s.wheel!.s * into) / s.wheel!.r;
}

function chainItems(rig: Rig, chain: number, spacing: number): Item[] {
	const n = Math.round(rig.loop.length / spacing);
	const pins: Flat[] = Array.from({ length: n }, (_, i) => pointOnLoop(rig.loop, i * spacing + chain));
	const yAt = (x: number) => rig.yc + (rig.yr - rig.yc) * Math.min(1, Math.max(0, (x - (HX + 40)) / (-70 - (HX + 40))));
	const groups = [
		{ id: 'chain-rear', key: rig.yc + 0.6, test: (x: number) => x < HX + 45 },
		{ id: 'chain-mid', key: (rig.yc + rig.yr) / 2 + 0.6, test: (x: number) => x >= HX + 45 && x <= -70 },
		{ id: 'chain-front', key: rig.yr + 0.6, test: (x: number) => x > -70 }
	];
	const side = k.sub3([...at([0, -1.6, 0]), 0] as Point3, [...at([0, 0, 0]), 0] as Point3);
	return groups.map((g) => {
		const faces: string[][] = [[], []];
		const sides: string[][] = [[], []];
		const dots: Flat[] = [];
		for (let i = 0; i < n; i++) {
			const a = pins[i]!;
			const b = pins[(i + 1) % n]!;
			const mx = (a[0] + b[0]) / 2;
			if (!g.test(mx)) continue;
			const outer = i % 2 === 0 ? 1 : 0;
			const y = yAt(mx) + (outer ? 1.7 : 1.1);
			const shape = bar(a, b, outer ? 2.7 : 2.2);
			const face = shape.map(([x, z]) => at(xz(x, z, y)));
			faces[outer]!.push(k.pathOf(face, true));
			sides[outer]!.push(k.pathOf(face.map(([x, yy]) => [x + side[0], yy + side[1]] as Flat), true));
			dots.push(at(xz(a[0], a[1], y)));
		}
		const layer = (o: number) =>
			`<path class="iso-shade" data-shade="0" d="${sides[o]!.join('')}"/><path class="iso-shade" data-shade="${o ? 3 : 2}" d="${faces[o]!.join('')}"/><path class="iso-line iso-edge" data-tone="mid" d="${faces[o]!.join('')}"/>`;
		return { id: g.id, key: g.key, svg: `<g class="iso-solid bike-chain">${layer(0)}${layer(1)}${D(dots, { size: 0.55, tone: 'hi' })}</g>` };
	});
}

function crankItems(theta: number): Item[] {
	const items: Item[] = [];
	for (const side of [1, -1]) {
		const a = side > 0 ? theta : theta + Math.PI;
		const end: Flat = [CRANK * Math.cos(a), BBZ + CRANK * Math.sin(a)];
		const y0 = side > 0 ? 32 : -36;
		const arm = S(plate(bar([0, BBZ], end, 7.5, 5.2), y0, y0 + 4), { tone: 'mid' });
		const cap = side > 0 ? S(plate(circle(0, BBZ, 6, 28), 36, 37.2), { tone: 'mid' }) + D([at([0, 37.2, BBZ])], { size: 0.6, tone: 'hi' }) : '';
		items.push({ id: `crank-${side}`, key: side * 34, svg: arm + cap });
		const py0 = side > 0 ? 36 : -44;
		const spindle = S(plate(circle(end[0], end[1], 2.4, 16), py0, py0 + 8), { tone: 'mid', crease: 'none' });
		const body = [[-11, -3.5], [11, -3.5], [11, 3.5], [-11, 3.5]].map(([dx, dz]) => [end[0] + dx!, end[1] + dz!] as Flat);
		const by0 = side > 0 ? 44 : -72;
		const pins: Flat[] = [];
		for (const f of [-8, -2.7, 2.7, 8]) pins.push(at(xz(end[0] + f, end[1] + 3.5, side > 0 ? by0 + 4 : by0 + 24)), at(xz(end[0] + f, end[1] + 3.5, side > 0 ? by0 + 24 : by0 + 4)));
		const pedal = S(plate(body, by0, by0 + 28), { tone: 'mid', inner: L(k.pathOf([at(xz(end[0] - 11, end[1], by0 + 28)), at(xz(end[0] + 11, end[1], by0 + 28))]), { tone: 'faint' }) }) + D(pins, { size: 0.5, tone: 'mid' });
		items.push({ id: `pedal-${side}`, key: side > 0 ? 50 : -58, svg: (side > 0 ? spindle + pedal : pedal + spindle) });
	}
	return items;
}

function ringItems(rig: Rig, state: DriveState, spacing: number): Item[] {
	const meshed = Math.round(state.pose.ring);
	const items: Item[] = RINGS.map((teeth, i) => {
		const r = pitchR(teeth);
		const rot = i === meshed ? pinAngle(rig, 0, state.chain, spacing) : state.theta;
		const y0 = RING_Y(i) - 0.8;
		const inner = teeth === 50 ? tabbedHole(state.theta, r - 9) : circle(0, BBZ, 23, 48);
		return { id: `ring-${teeth}`, key: RING_Y(i), svg: S(plate(sprocket(0, BBZ, teeth, rot), y0, y0 + 1.6, [inner]), { tone: 'mid', crease: 'none' }) };
	});
	const arms: string[] = [];
	const bolts: Flat[] = [];
	for (let j = 0; j < 4; j++) {
		const a = state.theta + Math.PI / 4 + (j * Math.PI) / 2;
		const end: Flat = [27.5 * Math.cos(a), BBZ + 27.5 * Math.sin(a)];
		arms.push(S(plate(bar([0, BBZ], end, 4.5, 3.6), 28.6, 31), { tone: 'mid' }));
		arms.push(S(plate(circle(end[0], end[1], 2.6, 16), 31, 32), { tone: 'mid' }));
		bolts.push(at(xz(end[0], end[1], 32)));
	}
	items.push({ id: 'spider', key: 30, svg: S(plate(circle(0, BBZ, 11, 32), 28.6, 31.2), { tone: 'mid' }) + arms.join('') + D(bolts, { size: 0.5, tone: 'hi' }) });
	return items;
}

/** The big ring's hole: a circle of radius r with four tabs reaching in to the chainring bolts. */
function tabbedHole(theta: number, r: number): Ring2 {
	return Array.from({ length: 96 }, (_, i) => {
		const a = (i / 96) * TAU;
		const rel = mod(a - theta, Math.PI / 2) - Math.PI / 4;
		const w = Math.max(0, 1 - Math.abs(rel) / 0.17);
		const rr = r - (r - 24) * Math.min(1, w * 1.8);
		return [rr * Math.cos(a), BBZ + rr * Math.sin(a)] as Flat;
	});
}

function cassetteItems(rig: Rig, state: DriveState, spacing: number): Item[] {
	const meshed = Math.round(state.pose.cog);
	const cogSeg = 6; // ring, line, tension, line, guide, line, cog
	return CASSETTE.map((teeth, i) => {
		const rot = i === meshed ? pinAngle(rig, cogSeg, state.chain, spacing) : state.wheel;
		const y = COG_Y(i);
		const hole = circle(HX, HZ, 7.5, 24);
		return { id: `cog-${teeth}`, key: y, svg: S(plate(sprocket(HX, HZ, teeth, rot), y - 0.8, y + 0.8, [hole]), { tone: 'mid', crease: 'none', lit: i === meshed }) };
	});
}

function rearDerailleur(rig: Rig, state: DriveState, spacing: number): Item[] {
	const { G, T, yc } = rig;
	const items: Item[] = [];
	const cage = hullOfCircles([[G[0], G[1], RJ - 2.2], [T[0], T[1], RJ - 2.2]]);
	items.push({ id: 'rd-cage-in', key: yc - 4, svg: S(plate(cage, yc - 4.6, yc - 3.4), { tone: 'mid' }) });
	for (const [id, c, seg] of [['rd-jockey-guide', G, 4], ['rd-jockey-tension', T, 2]] as const) {
		const rot = pinAngle(rig, seg, state.chain, spacing);
		items.push({ id, key: yc - 0.2, svg: S(plate(sprocket(c[0], c[1], 11, rot, RJ), yc - 1.1, yc + 1.1), { tone: 'mid', crease: 'none' }) + S(plate(circle(c[0], c[1], 4.2, 20), yc - 3.4, yc + 3.4), { tone: 'mid', crease: 'none' }) });
	}
	const bolts = [G, T].map((c) => at(xz(c[0], c[1], yc + 4.6)));
	items.push({ id: 'rd-cage-out', key: yc + 4, svg: S(plate(cage, yc + 3.4, yc + 4.6), { tone: 'mid' }) + D(bolts, { size: 0.65, tone: 'hi' }) });
	const B: Point3 = [HX - 6, 39, HZ - 14];
	const K: Point3 = [G[0], yc + 7, G[1]];
	const arms: string[] = [];
	for (const dz of [3.5, -3.5]) {
		const a = k.add3(B, [0, 2, dz]);
		const b = k.add3(K, [0, 2, dz]);
		const F = k.frameAlong(a, k.sub3(b, a));
		arms.push(S(k.prismOf(F, [[-1.4, -2.6], [1.4, -2.6], [1.4, 2.6], [-1.4, 2.6]], 0, k.len3(k.sub3(b, a)), P), { tone: 'mid', crease: 'none' }));
	}
	const knuckle = (c: Point3, r: number, y0: number, y1: number) => S(plate(circle(c[0], c[2], r, 28), y0, y1), { tone: 'mid' });
	items.push({ id: 'rd-body', key: Math.max(yc + 6, 39), svg: knuckle(B, 5.5, 37.6, 44) + arms.join('') + knuckle(K, 6, yc + 5, yc + 10) + D([at([B[0], 44, B[2]]), at([K[0], yc + 10, K[2]])], { size: 0.6, tone: 'hi' }) });
	return items;
}

function frontDerailleur(rig: Rig): Item[] {
	const R = pitchR(50);
	const yf = rig.yr;
	const arc = (r: number, a0: number, a1: number): Ring2 => Array.from({ length: 17 }, (_, i) => [r * Math.cos(a0 + ((a1 - a0) * i) / 16), BBZ + r * Math.sin(a0 + ((a1 - a0) * i) / 16)] as Flat);
	const a0 = (96 * Math.PI) / 180;
	const a1 = (140 * Math.PI) / 180;
	const shape = [...arc(R + 12, a0, a1), ...arc(R + 3, a1, a0)];
	const band = onSeatTube(70);
	const top: Flat = [(R + 12) * Math.cos(1.95), BBZ + (R + 12) * Math.sin(1.95)];
	const body = S(k.prismOf(k.frameAlong(onSeatTube(64), ST), k.circlePolygon(9.4, 32), 0, 11, P), { tone: 'mid' });
	const link = S(plate([[top[0] - 5, top[1]], [top[0] + 5, top[1]], [band[0] + 4, band[2] + 3], [band[0] - 6, band[2] + 3]], 6, yf + 4.6), { tone: 'mid' });
	return [
		{ id: 'fd-cage-in', key: yf - 4, svg: S(plate(shape, yf - 4.6, yf - 3.4), { tone: 'mid' }) },
		{ id: 'fd-body', key: 0.5, svg: body },
		{ id: 'fd-link', key: yf + 4.2, svg: link },
		{ id: 'fd-cage-out', key: yf + 4, svg: S(plate(shape, yf + 3.4, yf + 4.6), { tone: 'mid' }) + D([at(xz(top[0], top[1] - 2, yf + 4.6))], { size: 0.6, tone: 'hi' }) }
	];
}

function wheelItems(angle: number): Item[] {
	const spokes: string[] = [];
	const tread: string[] = [];
	const fade = (a: number) => Math.min(1, Math.max(0, Math.min(a - SECTOR[0], SECTOR[1] - a) / 0.22));
	for (let j = 0; j < 32; j++) {
		const a = SECTOR[0] + mod(angle + (j * TAU) / 32 - SECTOR[0], TAU);
		const o = fade(a);
		if (o <= 0.01) continue;
		const y = j % 2 ? 5.8 : -15.2;
		const hubPt = at([HX + 9.4 * Math.cos(a + 0.35), y, HZ + 9.4 * Math.sin(a + 0.35)]);
		const rimPt = at([HX + (RIM.inner + 1.5) * Math.cos(a), 0, HZ + (RIM.inner + 1.5) * Math.sin(a)]);
		spokes.push(`<path class="iso-line" data-tone="lo" style="opacity:${o.toFixed(2)}" d="${k.pathOf([hubPt, rimPt])}"/>`);
	}
	for (let j = 0; j < 90; j++) {
		const a = SECTOR[0] + mod(angle + (j * TAU) / 90 - SECTOR[0], TAU);
		const o = fade(a);
		if (o <= 0.01) continue;
		for (const y of [-2.6, 2.6]) {
			const [x, z] = [HX + RIM.tyre * Math.cos(a), HZ + RIM.tyre * Math.sin(a)];
			const [sx, sy] = at([x, y + (j % 2 ? 0.8 : -0.8), z]);
			tread.push(`<circle class="iso-dot bike-tread" style="opacity:${(o * 0.8).toFixed(2)}" cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="0.55"/>`);
		}
	}
	return [
		{ id: 'spokes', key: -0.7, svg: spokes.join('') },
		{ id: 'tread', key: -0.45, svg: tread.join('') }
	];
}

// ---- assembly -----------------------------------------------------------------

function ready() {
	if (P) return;
	P = k.fitProjection(
		[...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [HX, 0, HZ + RIM.tyre + 2], [HX - RIM.tyre, 0, HZ], onSeatTube(200), [CRANK + 12, 72, BBZ], [CRANK, 72, BBZ + CRANK + 4]],
		WIDTH,
		HEIGHT,
		{ pad: 16, azimuth: 64 }
	);
	V = k.viewOf(P);
	LIGHT = k.lightOf(P);
	// The chain is as long as the 50 x 28 loop with the cage nearly upright, in whole links.
	LINKS = Math.floor(rigAt({ ring: 1, cog: 0 }, 0, 0.12).loop.length / PITCH);
	STATIC = staticItems();
}

function itemsOf(state: DriveState): Item[] {
	ready();
	const rig = rigAt(state.pose);
	const spacing = rig.loop.length / LINKS;
	return [...STATIC, ...wheelItems(state.wheel), ...cassetteItems(rig, state, spacing), ...ringItems(rig, state, spacing), ...chainItems(rig, state.chain, spacing), ...rearDerailleur(rig, state, spacing), ...frontDerailleur(rig), ...crankItems(state.theta)].sort(
		(a, b) => a.key - b.key
	);
}

/** Still frame for reduced motion and the default export: pedal down and forward. */
export const STILL = { theta: -1.05, chain: 0, wheel: 0.4 };

export const BIKE_CSS = `
.bike-chain .iso-edge{stroke-opacity:.7}
.bike-tread{fill:var(--anatomy-lo)}
.iso-halo.bike-shadow{filter:blur(2.5px);opacity:calc(var(--anatomy-halo-opacity) * .5);transform:none}
`;

export const LABEL = 'A bicycle drivetrain on a bench stand: crank, two chainrings, chain, a seven-cog cassette, both derailleurs and part of the rear wheel.';

const wrap = (item: Item) => `<g data-item="${item.id}">${item.svg}</g>`;

/** The whole figure as an SVG string, framed to everything it draws. */
export function bikeSvg(params: BikeParams = clampParams(), drive: Partial<Omit<DriveState, 'params'>> = {}, standalone: k.Theme | false = false): string {
	return framed(rawSvg(params, drive, standalone), frame());
}

function rawSvg(params: BikeParams, drive: Partial<Omit<DriveState, 'params'>>, standalone: k.Theme | false): string {
	ready();
	const state: DriveState = { params, pose: drive.pose ?? poseOf(params), theta: drive.theta ?? STILL.theta, chain: drive.chain ?? STILL.chain, wheel: drive.wheel ?? STILL.wheel };
	const svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL, body: itemsOf(state).map(wrap).join(''), standalone });
	return standalone ? svg.replace('</style>', `${PAPER_CSS}${BIKE_CSS}</style>`).replace('class="iso-svg iso"', 'class="iso-svg iso" data-figure-host="bike-gears"') : svg;
}

let FRAME: FrameBox | null = null;
/** The viewBox: a full crank turn in the easiest and the hardest gear, plus the pins. */
function frame(): FrameBox {
	if (FRAME) return FRAME;
	const svgs: string[] = [];
	const gears = [clampParams({ ring: 34, gear: 1 }), clampParams({ ring: 50, gear: CASSETTE.length })];
	for (let i = 0; i < 4; i++) svgs.push(rawSvg(gears[i % 2]!, { theta: STILL.theta - (i * Math.PI) / 2 }, false));
	FRAME = frameOf(svgs, anchorPoints().map(([, , p]) => at(p)));
	return FRAME;
}

export interface Anchor {
	id: string;
	label: string;
	x: number;
	y: number;
}

export function anchorsOf(): Anchor[] {
	return anchorPoints().map(([id, label, p]) => ({ id, label, ...percentIn(frame(), at(p)) }));
}

function anchorPoints(): Array<[string, string, Point3]> {
	ready();
	const params = clampParams();
	const rig = rigAt(poseOf(params));
	const a = STILL.theta;
	const R = pitchR(50);
	return [
		['chainring', 'Chainring', [R * Math.cos(0.5), 28, BBZ + R * Math.sin(0.5)]],
		['crank', 'Crank', [(CRANK / 2) * Math.cos(a), 36, BBZ + (CRANK / 2) * Math.sin(a)]],
		['pedal', 'Pedal', [CRANK * Math.cos(a), 72, BBZ + CRANK * Math.sin(a)]],
		['chain', 'Chain', [-110, rig.yc + 6, HZ + (BBZ - HZ) * 0.47 + (rig.cogR + R) / 2]],
		['cassette', 'Cassette', [HX, COG_Y(6), HZ + rig.cogR + 3]],
		['rear-derailleur', 'Rear derailleur', [HX - 4, 42, HZ - 24]],
		['front-derailleur', 'Front derailleur', [-30, rig.yr + 4.6, BBZ + R + 8]],
		['jockey-wheels', 'Jockey wheels', [rig.T[0], rig.yc + 4.6, rig.T[1]]],
		['rear-hub', 'Rear hub', [HX, 41, HZ]],
		['wheel', 'Wheel', [HX + RIM.tyre * Math.cos(1.9), 6, HZ + RIM.tyre * Math.sin(1.9)]]
	];
}

// ---- live mount ---------------------------------------------------------------

export interface MountOptions {
	theme?: k.Theme;
	params?: Partial<BikeParams>;
	onReadout?: (values: Record<string, string>) => void;
}

export interface FigureHandle {
	update(params: Partial<Record<string, number>>): void;
	setTheme(theme: k.Theme): void;
	/** Park the drivetrain `t` seconds into the ride and stop the loop (captures, tests). */
	seek(t: number): void;
	destroy(): void;
}

const STYLE_ID = 'ripple-iso-bike-css';

export function mount(el: HTMLElement, { theme = 'dark', params: initial, onReadout }: MountOptions = {}): FigureHandle {
	const doc = el.ownerDocument;
	if (!doc.getElementById(STYLE_ID)) {
		const style = doc.createElement('style');
		style.id = STYLE_ID;
		style.textContent = k.ISO_CSS + PAPER_CSS + BIKE_CSS;
		doc.head.appendChild(style);
	}
	let params = clampParams(initial);
	const svg = doc.importNode(new DOMParser().parseFromString(bikeSvg(params), 'image/svg+xml').documentElement, true) as unknown as SVGSVGElement;
	el.classList.add('iso');
	el.dataset.figureHost = 'bike-gears';
	el.dataset.theme = theme;
	el.replaceChildren(svg);
	const groups = new Map<string, SVGGElement>();
	for (const g of svg.querySelectorAll<SVGGElement>('[data-item]')) groups.set(g.dataset.item!, g);
	const shown = new Map<string, string>();
	let order = '';

	const win = doc.defaultView;
	const still = win?.matchMedia?.('(prefers-reduced-motion: reduce)');
	const drive = { theta: STILL.theta, chain: STILL.chain, wheel: STILL.wheel };
	let from: Pose = poseOf(params);
	let to: Pose = from;
	let since = Infinity;
	let parked = false;
	let lastKey = '';

	function draw() {
		const pose = poseAt(from, to, since);
		const items = itemsOf({ params, pose, ...drive });
		const ids = items.map((i) => i.id).join(' ');
		for (const item of items) {
			const g = groups.get(item.id);
			if (g && shown.get(item.id) !== item.svg) {
				g.innerHTML = item.svg;
				shown.set(item.id, item.svg);
			}
		}
		if (ids !== order) {
			order = ids;
			for (const item of items) {
				const g = groups.get(item.id);
				if (g) svg.appendChild(g);
			}
		}
		const readouts = readoutsOf(params);
		const key = JSON.stringify(readouts);
		if (key !== lastKey) {
			lastKey = key;
			onReadout?.(readouts);
			svg.setAttribute('aria-label', describe(params));
		}
	}

	function advance(dt: number) {
		const w = crankSpeedOf(params);
		drive.theta -= w * dt;
		drive.chain += w * pitchR(params.ring) * dt;
		drive.wheel -= w * ratioOf(params) * dt;
		since += dt;
	}

	let frame = 0;
	let last = 0;
	let visible = true;
	const loop = (now: number) => {
		const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
		last = now;
		advance(dt);
		draw();
		frame = win!.requestAnimationFrame(loop);
	};
	const stop = () => {
		if (frame) win?.cancelAnimationFrame(frame);
		frame = 0;
	};
	const run = () => {
		if (frame || parked || !visible || doc.hidden || still?.matches || !win?.requestAnimationFrame) return;
		last = 0;
		frame = win.requestAnimationFrame(loop);
	};
	const sync = () => (visible && !doc.hidden && !still?.matches && !parked ? run() : stop());
	const io = win && 'IntersectionObserver' in win ? new win.IntersectionObserver((entries) => ((visible = entries[entries.length - 1]!.isIntersecting), sync())) : null;
	io?.observe(el);
	doc.addEventListener('visibilitychange', sync);
	const onStill = () => {
		if (still?.matches) since = Infinity;
		draw();
		sync();
	};
	still?.addEventListener?.('change', onStill);
	draw();
	run();

	return {
		update(next) {
			const prev = params;
			params = clampParams({ ...params, ...next });
			if (prev.ring !== params.ring || prev.gear !== params.gear) {
				from = poseAt(from, to, since);
				to = poseOf(params);
				since = still?.matches ? Infinity : 0;
			}
			draw();
		},
		setTheme(next) {
			el.dataset.theme = next;
		},
		seek(time) {
			parked = true;
			stop();
			const w = crankSpeedOf(params);
			drive.theta = STILL.theta - w * time;
			drive.chain = STILL.chain + w * pitchR(params.ring) * time;
			drive.wheel = STILL.wheel - w * ratioOf(params) * time;
			since = Infinity;
			draw();
		},
		destroy() {
			stop();
			io?.disconnect();
			doc.removeEventListener('visibilitychange', sync);
			still?.removeEventListener?.('change', onStill);
			el.replaceChildren();
		}
	};
}
