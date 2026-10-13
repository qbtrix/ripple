// figures/particle-collider/figure.ts: a cutaway piece of a circular collider
// drawn the Anatomy way with the @ripple-ui/core/iso kit. World: x along the
// straight section, y toward the viewer, z up. The ring is a straight section
// (|s| <= S0) with an arc of radius R on each side that curves toward the
// viewer, so we look from inside the ring. Every magnet is a straight body on
// a chord of that path, as real dipoles are; pipes turn a few degrees at the
// interconnects, where the bellows are.
//
// Beam 1 (blue) runs toward +s in the outer pipe, beam 2 (red) toward -s in the
// inner one. A separation dipole on each side brings them into one pipe, the
// final-focus quadrupoles squeeze them, and they cross at s = 0 inside the
// detector, whose front-top quadrant is cut away to show its layers. The arc
// magnet at the right end is cut through and shows its twin-bore cross-section.
//
// Painter's order is a sort on depth, which grows with s along the whole ring,
// so every item sits at its slot and nothing reorders. `colliderSvg()` is pure
// (strings only). `mount()` keeps the drawing and rewrites only the live slots
// each frame: bunches on each visible pipe, the collision burst, the RF
// cavities a bunch is passing and, on update, the field gauge needle. No DOM or
// work at module top level.

import * as k from '@ripple-ui/core/iso';
import type { Flat, Point3, SolidPaths } from '@ripple-ui/core/iso';
import { PAPER_CSS } from '../paper.js';
import { frameOf, framed, percentIn, type FrameBox } from '../frame.js';
import { bunchesAt, burstsAt, clampParams, describe, fieldOf, readoutsOf, stillTime, type Burst, type ColliderParams } from './model.js';

export const WIDTH = 640;
export const HEIGHT = 420;

const TAU = Math.PI * 2;
const S0 = 118; // half the straight section
const R = 260; // arc radius
const ZB = 66; // beam height above the floor
const SEP = 5; // half the distance between the twin pipes
const PIPE_R = 2;
const FLOOR_END = 296;
const DET = { half: 56, r: 58 };
const BUNCH_HALF = 4.6;
/** Radial bands of the detector, inside out. */
const LAYERS = [
	{ id: 'tracker', r0: 3.2, r1: 16 },
	{ id: 'ecal', r0: 17, r1: 24 },
	{ id: 'hcal', r0: 25, r1: 33 },
	{ id: 'solenoid', r0: 34, r1: 38 },
	{ id: 'yoke', r0: 39, r1: 43 },
	{ id: 'chamber', r0: 43, r1: 46.5 },
	{ id: 'yoke', r0: 46.5, r1: 50 },
	{ id: 'chamber', r0: 50, r1: 53.5 },
	{ id: 'yoke', r0: 53.5, r1: 58 }
] as const;
const SILICON = [4.5, 6.5, 8.5, 11, 13, 15];

let P = null as unknown as k.Projection;
let V: Point3 = [0, 0, 1];
let K = 1;

const at = (p: Point3): Flat => k.iso(p, P);
const S = (paths: SolidPaths, style: k.SolidStyle = {}) => k.solidSvg(paths, style);
const L = (d: string, style: k.LineStyle = {}) => k.lineSvg(d, style);
const D = (points: Flat[], style: { size?: number; tone?: k.Tone } = {}) => k.dotsSvg(points, style);
const depth = (p: Point3) => k.depthOf(p, P);
const lerp3 = (a: Point3, b: Point3, f: number): Point3 => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
const ring = (pts: Point3[]) => k.pathOf(pts.map(at), true);

// ---- the ring path -----------------------------------------------------------

/** Plan position (z = 0), direction of +s, and outward normal at ring position s. */
function ringAt(s: number): { p: Point3; t: Point3; n: Point3 } {
	const a = Math.abs(s);
	let p: Point3;
	let t: Point3;
	if (a <= S0) {
		p = [s, 0, 0];
		t = [1, 0, 0];
	} else {
		const f = (a - S0) / R;
		const side = Math.sign(s);
		p = [side * (S0 + R * Math.sin(f)), R * (1 - Math.cos(f)), 0];
		t = [Math.cos(f), side * Math.sin(f), 0];
	}
	return { p, t, n: [t[1], -t[0], 0] };
}

interface Chord {
	a: Point3;
	b: Point3;
	T: Point3;
	N: Point3;
	len: number;
	F: k.Frame;
}

/** A straight body from s0 to s1 at beam height: local u points inward (toward the viewer), v up. */
function chord(s0: number, s1: number, z = ZB): Chord {
	const a = k.add3(ringAt(s0).p, [0, 0, z]);
	const b = k.add3(ringAt(s1).p, [0, 0, z]);
	const T = k.unit3(k.sub3(b, a));
	const N: Point3 = [T[1], -T[0], 0];
	return { a, b, T, N, len: k.len3(k.sub3(b, a)), F: { o: a, a: T, u: k.mul3(N, -1), v: [0, 0, 1] } };
}

/** Where beam `beam` (1 outer, 2 inner, 0 common) crosses the face of a chord at `end`. */
const boreAt = (c: Chord, end: 'a' | 'b', beam: 0 | 1 | 2): Point3 => k.add3(c[end], k.mul3(c.N, beam === 1 ? SEP : beam === 2 ? -SEP : 0));

// ---- small builders ----------------------------------------------------------

const tube = (a: Point3, b: Point3, r: number, steps = 28) => k.prismOf(k.frameAlong(a, k.sub3(b, a)), k.circlePolygon(r, steps), 0, k.len3(k.sub3(b, a)), P);
const disc = (F: k.Frame, s0: number, s1: number, r: number, steps = 48) => k.prismOf(F, k.circlePolygon(r, steps), s0, s1, P);

/** The visible half of a circle of radius r round a frame's axis at s, ending on the silhouette. */
function rimArc(F: k.Frame, s: number, r: number, from = -Infinity, to = Infinity, steps = 40): string {
	const c = Math.atan2(k.dot3(F.v, V), k.dot3(F.u, V));
	const a0 = Math.max(c - Math.PI / 2, from);
	const a1 = Math.min(c + Math.PI / 2, to);
	if (a1 <= a0) return '';
	return k.pathOf(Array.from({ length: steps + 1 }, (_, i) => at(k.pointOf(F, s, r * Math.cos(a0 + ((a1 - a0) * i) / steps), r * Math.sin(a0 + ((a1 - a0) * i) / steps)))));
}

/** A closed circle in the plane of a frame's cross-section at s. */
const faceCircle = (F: k.Frame, s: number, cu: number, cv: number, r: number, steps = 40) =>
	ring(Array.from({ length: steps }, (_, i) => k.pointOf(F, s, cu + r * Math.cos((i / steps) * TAU), cv + r * Math.sin((i / steps) * TAU))));

/** An annular sector in the cross-section plane at s, angles a0..a1. */
function faceSector(F: k.Frame, s: number, cu: number, cv: number, r0: number, r1: number, a0: number, a1: number, steps = 24): string {
	const outer = Array.from({ length: steps + 1 }, (_, i) => a0 + ((a1 - a0) * i) / steps);
	const pts: Point3[] = [...outer.map((a) => k.pointOf(F, s, cu + r1 * Math.cos(a), cv + r1 * Math.sin(a))), ...[...outer].reverse().map((a) => k.pointOf(F, s, cu + r0 * Math.cos(a), cv + r0 * Math.sin(a)))];
	return ring(pts);
}

function halo(plan: k.Plan, far = false) {
	return `<path class="iso-halo pc-shadow"${far ? ' data-far=""' : ''} d="${k.haloOf(plan, 0, 0.1, P)}"/>`;
}

/** A pipe from a to b with `bellows` thin rings in the middle; pieces painted far to near. */
function pipeSvg(a: Point3, b: Point3, bellows: number, className = ''): string {
	const len = k.len3(k.sub3(b, a));
	const parts: Array<{ key: number; svg: string }> = [];
	const pitch = 1.7;
	const first = len / 2 - ((bellows - 1) * pitch) / 2;
	const cuts: number[] = [0];
	for (let i = 0; i < bellows; i++) cuts.push((first + i * pitch - 0.45) / len, (first + i * pitch + 0.45) / len);
	cuts.push(1);
	for (let i = 0; i < cuts.length - 1; i++) {
		const p0 = lerp3(a, b, cuts[i]!);
		const p1 = lerp3(a, b, cuts[i + 1]!);
		const ringPiece = i % 2 === 1;
		parts.push({ key: depth(lerp3(p0, p1, 0.5)), svg: S(tube(p0, p1, ringPiece ? PIPE_R + 0.9 : PIPE_R, ringPiece ? 36 : 28), { tone: 'mid', crease: 'none', className }) });
	}
	return parts.sort((x, y) => x.key - y.key).map((p) => p.svg).join('');
}

// ---- elements ----------------------------------------------------------------

type Bore = 'one' | 'two';
type Kind = 'detector' | 'triplet' | 'separation' | 'dipole' | 'quad' | 'plate' | 'cavity';
interface Element {
	id: string;
	kind: Kind;
	s0: number;
	s1: number;
	r: number;
	ends: [Bore, Bore];
	cut?: boolean;
}

const CAVITIES = [-184, -171, -158, -145];
const BEAD = 4.2;
const IRIS = Math.sqrt(BEAD * BEAD - PIPE_R * PIPE_R);

const ELEMENTS: Element[] = [
	{ id: 'dipole-left', kind: 'dipole', s0: -282, s1: -232, r: 15, ends: ['two', 'two'] },
	{ id: 'quad-left', kind: 'quad', s0: -222, s1: -204, r: 12.5, ends: ['two', 'two'] },
	{ id: 'rf-plate-far', kind: 'plate', s0: -195, s1: -193, r: 13, ends: ['two', 'two'] },
	...CAVITIES.map((c, i): Element => ({ id: `cavity-${i}`, kind: 'cavity', s0: c - IRIS, s1: c + IRIS, r: BEAD, ends: ['two', 'two'] })),
	{ id: 'rf-plate-near', kind: 'plate', s0: -135, s1: -133, r: 13, ends: ['two', 'two'] },
	{ id: 'separation-left', kind: 'separation', s0: -112, s1: -96, r: 10, ends: ['two', 'one'] },
	{ id: 'triplet-left', kind: 'triplet', s0: -88, s1: -66, r: 10, ends: ['one', 'one'] },
	{ id: 'detector', kind: 'detector', s0: -DET.half, s1: DET.half, r: DET.r, ends: ['one', 'one'] },
	{ id: 'triplet-right', kind: 'triplet', s0: 66, s1: 88, r: 10, ends: ['one', 'one'] },
	{ id: 'separation-right', kind: 'separation', s0: 96, s1: 112, r: 10, ends: ['one', 'two'] },
	{ id: 'dipole-right', kind: 'dipole', s0: 124, s1: 188, r: 15, ends: ['two', 'two'] },
	{ id: 'quad-right', kind: 'quad', s0: 198, s1: 218, r: 12.5, ends: ['two', 'two'] },
	{ id: 'dipole-cut', kind: 'dipole', s0: 228, s1: 282, r: 15, ends: ['two', 'two'], cut: true }
];

/** Every stretch of visible pipe: between two elements, or the common pipe through the detector's cut. */
interface Gap {
	id: string;
	s0: number;
	s1: number;
	beams: Array<{ beam: 0 | 1 | 2; a: Point3; b: Point3 }>;
}

function gapsOf(): Gap[] {
	const out: Gap[] = [];
	for (let i = 0; i < ELEMENTS.length - 1; i++) {
		const e = ELEMENTS[i]!;
		const f = ELEMENTS[i + 1]!;
		const ce = chord(e.s0, e.s1);
		const cf = chord(f.s0, f.s1);
		const beams: Gap['beams'] = e.ends[1] === 'one' ? [{ beam: 0, a: boreAt(ce, 'b', 0), b: boreAt(cf, 'a', 0) }] : ([1, 2] as const).map((beam) => ({ beam, a: boreAt(ce, 'b', beam), b: boreAt(cf, 'a', beam) }));
		out.push({ id: `${e.id}~${f.id}`, s0: e.s1, s1: f.s0, beams });
	}
	out.push({ id: 'detector-pipe', s0: -DET.half, s1: DET.half, beams: [{ beam: 0, a: [-DET.half, 0, ZB], b: [DET.half, 0, ZB] }] });
	return out;
}

// ---- static parts ------------------------------------------------------------

interface Item {
	key: number;
	svg: string;
}

/** The floor: the tunnel band along the ring, widened round the detector into its cavern. */
function floorRing(): Point3[] {
	const OUT = 26;
	const IN = 34;
	const CAV = { x: 92, back: -70, front: 76 };
	const steps = Math.ceil((2 * FLOOR_END) / 6);
	const ss = Array.from({ length: steps + 1 }, (_, i) => -FLOOR_END + (2 * FLOOR_END * i) / steps);
	const edge = (off: number) => ss.map((s) => {
		const { p, n } = ringAt(s);
		return k.add3(p, k.mul3(n, off));
	});
	const outer = edge(OUT).filter(([x]) => Math.abs(x) > CAV.x);
	const inner = edge(-IN).filter(([x]) => Math.abs(x) > CAV.x).reverse();
	const left = (pts: Point3[]) => pts.filter(([x]) => x < 0);
	const right = (pts: Point3[]) => pts.filter(([x]) => x > 0);
	return [
		...left(outer),
		[-CAV.x, -OUT, 0],
		[-CAV.x, CAV.back, 0],
		[CAV.x, CAV.back, 0],
		[CAV.x, -OUT, 0],
		...right(outer),
		...right(inner),
		[CAV.x, IN, 0],
		[CAV.x, CAV.front, 0],
		[-CAV.x, CAV.front, 0],
		[-CAV.x, IN, 0],
		...left(inner)
	];
}

function floor(): string {
	const ringPts = floorRing();
	const plane: k.Plane[] = ringPts.map(([x, y]) => [x, y]);
	const out: string[] = [];
	out.push(`<path class="iso-halo" d="${k.extrude(plane, -16, 16, P, { convex: false }).fill}"/>`);
	const feet: Point3[] = [-250, -170, 170, 250].map((s) => ringAt(s).p);
	feet.push([-78, -58, 0], [78, -58, 0], [-78, 64, 0], [78, 64, 0]);
	feet.sort((a, b) => depth(a) - depth(b));
	for (const [x, y] of feet) {
		out.push(S(k.cylinder(x, y, 7, -16, 1.6, P, 28), { tone: 'lo' }));
		out.push(S(k.cylinder(x, y, 5.4, -14.4, 4.4, P, 28), { tone: 'lo' }));
	}
	const seam = k.ringSeam(plane, -6, P);
	out.push(S(k.extrude(plane, -10, 10, P, { convex: false, bevel: 1.2 }), { tone: 'lo', inner: L(seam, { tone: 'faint' }) }));
	// Transport-lane line along the inner edge, cut end to cut end.
	const lane: Flat[] = [];
	for (let s = -FLOOR_END; s <= FLOOR_END + 1e-9; s += 4) {
		const { p, n } = ringAt(s);
		lane.push(at(k.add3(p, k.mul3(n, -27))));
	}
	out.push(L(k.pathOf(lane), { tone: 'faint' }));
	// Ruler strip and label plate on the cavern floor, in front of the detector.
	const strip = { x: -60, y: 62, w: 120, d: 7, r: 1 };
	out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: 'lo', crease: 'none' }));
	const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, 0.6, [2, 3.6], P);
	out.push(L(ticks.minor, { tone: 'lo' }), L(ticks.major, { tone: 'mid' }));
	const label = { x: -86, y: 56, w: 20, d: 13, r: 1.2 };
	out.push(S(k.slabOf(label, 0, 1, P, 3, 0.3), { tone: 'mid' }));
	for (const [i, yy] of [3.6, 6.6, 9.6].entries()) out.push(L(k.lineOnTop([label.x + 0.4, label.y + yy], [label.x + label.w - (i ? 6 : 0.4), label.y + yy], 1, P), { tone: i === 0 ? 'lo' : 'faint', free: 'end' }));
	out.push(D([at([label.x + 2.4, label.y + 1.8, 1]), at([label.x + label.w - 2.4, label.y + 1.8, 1])], { size: 0.45 }));
	return out.join('');
}

/** Two jacks under a horizontal body of radius r on chord c. */
function jacks(c: Chord, r: number, fractions = [0.2, 0.8]): string {
	const pts = fractions.map((f) => k.add3(c.a, k.mul3(c.T, c.len * f))).sort((p, q) => depth(p) - depth(q));
	return pts
		.map(([x, y]) => {
			const top = ZB - r;
			return S(k.cylinder(x, y, 4.8, 0, 1.4, P, 28), { tone: 'lo' }) + S(k.cylinder(x, y, 2.8, 1.4, top - 1.4, P, 24), { tone: 'mid', crease: 'none', inner: L(k.sideArc(x, y, 2.8, top * 0.5, P, 16), { tone: 'faint' }) });
		})
		.join('');
}

/** The face of a magnet at its near end: flange, bolt circle and a collar round each bore. */
function endFace(c: Chord, r: number, bores: Bore): string {
	const out: string[] = [];
	const holes = bores === 'one' ? [0] : [-SEP, SEP];
	out.push(L(holes.map((u) => faceCircle(c.F, c.len + 0.2, u, 0, PIPE_R + 1.3, 28)).join(''), { tone: 'lo' }));
	const bolts: Flat[] = [];
	for (let i = 0; i < 12; i++) bolts.push(at(k.pointOf(c.F, c.len + 0.2, (r + 0.5) * Math.cos((i / 12) * TAU), (r + 0.5) * Math.sin((i / 12) * TAU))));
	out.push(D(bolts, { size: 0.45, tone: 'mid' }));
	return out.join('');
}

function magnet(e: Element): string {
	const c = chord(e.s0, e.s1);
	const out: string[] = [jacks(c, e.r)];
	const flange = e.r + 1.1;
	out.push(S(disc(c.F, -0.2, 1.4, flange), { tone: 'mid' }));
	const seams: string[] = [];
	const bands: number[] = e.kind === 'dipole' ? [0.25, 0.5, 0.75] : [];
	for (const f of bands) seams.push(rimArc(c.F, c.len * f, e.r));
	out.push(S(disc(c.F, 0, c.len, e.r, 64), { tone: 'mid', crease: 'none', inner: L(seams.join(''), { tone: 'faint' }) }));
	if (e.kind === 'quad' || e.kind === 'triplet') {
		for (const f of [0.3, 0.7]) out.push(S(disc(c.F, c.len * f - 1.3, c.len * f + 1.3, e.r + 0.9, 64), { tone: 'mid' }));
	}
	if (e.cut) {
		out.push(cutFace(c, e.r));
	} else {
		out.push(S(disc(c.F, c.len - 1.4, c.len + 0.2, flange), { tone: 'mid' }));
		out.push(endFace(c, flange - 1.1, e.ends[1]));
	}
	return out.join('');
}

/** The arc dipole cut through: vacuum vessel, iron yoke, two collared coils round the twin beam pipes. */
function cutFace(c: Chord, r: number): string {
	const F = c.F;
	const s = c.len;
	const out: string[] = [];
	out.push(`<path class="pc-void" d="${faceCircle(F, s, 0, 0, r - 1.4, 64)}"/>`);
	out.push(L(faceCircle(F, s, 0, 0, r - 1.4, 64), { tone: 'mid' }));
	out.push(L(faceCircle(F, s, 0, 0, r - 2.6, 64), { tone: 'faint' }));
	// Support post the cold mass sits on.
	const post = ring([k.pointOf(F, s, -1.6, -(r - 1.4)), k.pointOf(F, s, 1.6, -(r - 1.4)), k.pointOf(F, s, 1.6, -10.4), k.pointOf(F, s, -1.6, -10.4)]);
	out.push(`<path class="pc-yoke" d="${post}"/>`, L(post, { tone: 'lo' }));
	out.push(`<path class="pc-yoke" d="${faceCircle(F, s, 0, 0, 10.6, 64)}"/>`, L(faceCircle(F, s, 0, 0, 10.6, 64), { tone: 'mid' }));
	// Heat-exchanger pipe and two bus-bar channels through the yoke.
	for (const [u, v, rr] of [[0, 7.6, 1.2], [-6.4, -6, 0.8], [6.4, -6, 0.8]] as const) out.push(`<path class="pc-void" d="${faceCircle(F, s, u, v, rr, 20)}"/>`, L(faceCircle(F, s, u, v, rr, 20), { tone: 'lo' }));
	for (const u of [-SEP, SEP]) {
		out.push(`<path class="pc-collar" d="${faceCircle(F, s, u, 0, 4.3, 40)}"/>`, L(faceCircle(F, s, u, 0, 4.3, 40), { tone: 'lo' }));
		for (const [a0, a1] of [[0.12, Math.PI - 0.12], [Math.PI + 0.12, TAU - 0.12]]) {
			const d = faceSector(F, s, u, 0, PIPE_R + 0.4, 3.7, a0!, a1!);
			out.push(`<path class="pc-coil" d="${d}"/>`, L(d, { tone: 'hi' }));
		}
		out.push(`<path class="pc-void" d="${faceCircle(F, s, u, 0, PIPE_R - 0.4, 24)}"/>`, L(faceCircle(F, s, u, 0, PIPE_R, 24), { tone: 'mid' }));
	}
	return out.join('');
}

function plate(e: Element): string {
	const c = chord(e.s0, e.s1);
	const w = 10;
	const top = 10;
	const shape: Flat[] = [];
	for (let i = 0; i <= 8; i++) {
		const a = (i / 8) * (Math.PI / 2);
		shape.push([w - 3 + 3 * Math.cos(a), top - 3 + 3 * Math.sin(a)]);
	}
	for (let i = 0; i <= 8; i++) {
		const a = Math.PI / 2 + (i / 8) * (Math.PI / 2);
		shape.push([-w + 3 + 3 * Math.cos(a), top - 3 + 3 * Math.sin(a)]);
	}
	shape.push([-w - 3, -ZB], [w + 3, -ZB]);
	const out = [halo({ x: c.a[0] - w, y: c.a[1] - 3, w: w * 2, d: 6, r: 2 }, true)];
	out.push(S(k.prismOf(c.F, shape, 0, c.len, P), { tone: 'mid' }));
	out.push(L([-SEP, SEP].map((u) => faceCircle(c.F, c.len, u, 0, PIPE_R + 1.2, 28)).join(''), { tone: 'lo' }));
	out.push(D([at(k.pointOf(c.F, c.len, -w + 1, -ZB + 5)), at(k.pointOf(c.F, c.len, w - 1, -ZB + 5)), at(k.pointOf(c.F, c.len, -w + 2.6, top - 2.6)), at(k.pointOf(c.F, c.len, w - 2.6, top - 2.6))], { size: 0.5 }));
	return out.join('');
}

/** One RF cavity per beam: a bead on each pipe with a power coupler standing on top. */
function cavity(e: Element, i: number): string {
	const c = chord(e.s0, e.s1);
	const mid = (beam: 1 | 2) => k.add3(lerp3(c.a, c.b, 0.5), k.mul3(c.N, beam === 1 ? SEP : -SEP));
	return ([1, 2] as const)
		.map((beam) => ({ beam, p: mid(beam) }))
		.sort((a, b) => depth(a.p) - depth(b.p))
		.map(({ beam, p }) => {
			const [x, y, z] = p;
			const base = z + Math.sqrt(BEAD * BEAD - 1.3 * 1.3);
			const coupler = S(k.cylinder(x, y, 1.3, base, ZB + 13 - base, P, 20), { tone: 'mid', crease: 'none' }) + S(k.cylinder(x, y, 2.3, ZB + 13, 1.2, P, 28), { tone: 'mid' }) + D([at([x, y, ZB + 14.2])], { size: 0.5, tone: 'hi' });
			return `<g class="pc-cavity" data-cavity="${beam}-${i}">${S(k.sphereOf(p, BEAD, P, 48), { tone: 'mid' })}</g>${coupler}`;
		})
		.join('');
}

// ---- the detector ------------------------------------------------------------

const DF: k.Frame = { o: [0, 0, ZB], a: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] };
const arcPts = (r: number, a0: number, a1: number, steps = 48): Flat[] => Array.from({ length: steps + 1 }, (_, i) => [r * Math.cos(a0 + ((a1 - a0) * i) / steps), r * Math.sin(a0 + ((a1 - a0) * i) / steps)] as Flat);
const onWall = (x: number, along: 'y' | 'z', r: number): Point3 => (along === 'y' ? [x, r, ZB] : [x, 0, ZB + r]);

function detector(): string {
	const { half, r } = DET;
	const out: string[] = [];
	// Two saddle cradles, the far one first.
	for (const x of [-34, 34]) {
		const w = 44;
		const saddle: Flat[] = [[-w, 0], [w, 0], ...Array.from({ length: 25 }, (_, i) => w - (2 * w * i) / 24).map((y) => [y, ZB - Math.sqrt(r * r - y * y)] as Flat)];
		out.push(halo({ x: x - 7, y: -w, w: 14, d: w * 2, r: 2 }, true));
		const F: k.Frame = { o: [x - 6, 0, 0], a: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] };
		out.push(S(k.prismOf(F, saddle, 0, 12, P), { tone: 'mid' }));
		out.push(D([at([x + 6, w - 4, 2]), at([x + 6, -w + 4, 2])], { size: 0.5 }));
	}
	// Bottom half, then the back-top quarter: what the cut leaves.
	const seamsLow: string[] = [];
	const seamsHigh: string[] = [];
	for (const x of [-33.6, -11.2, 11.2, 33.6]) {
		seamsLow.push(rimArc({ ...DF, o: [x, 0, ZB] }, 0, r, -Math.PI, 0));
		seamsHigh.push(rimArc({ ...DF, o: [x, 0, ZB] }, 0, r, Math.PI / 2, Math.PI));
	}
	out.push(S(k.prismOf(DF, arcPts(r, Math.PI, TAU, 96), -half, half, P), { tone: 'hi', inner: L(seamsLow.join(''), { tone: 'lo' }) }));
	out.push(S(k.prismOf(DF, [[0, 0], ...arcPts(r, Math.PI / 2, Math.PI, 48)], -half, half, P), { tone: 'hi', inner: L(seamsHigh.join(''), { tone: 'lo' }) }));
	out.push(layers());
	return out.join('');
}

/** The layers as they show on the two cut walls and the near end cap. */
function layers(): string {
	const { half } = DET;
	const out: string[] = [];
	const quad = (pts: Point3[]) => ring(pts);
	const walls = (r0: number, r1: number) =>
		(['y', 'z'] as const).map((w) => quad([onWall(-half, w, r0), onWall(half, w, r0), onWall(half, w, r1), onWall(-half, w, r1)])).join('');
	const cap = (r0: number, r1: number) => {
		const outer = arcPts(r1, Math.PI / 2, TAU, 72);
		const inner = arcPts(r0, TAU, Math.PI / 2, 72);
		return ring([...outer, ...inner].map(([u, v]) => k.pointOf(DF, half, u, v)));
	};
	for (const band of LAYERS) out.push(`<path class="pc-layer" data-l="${band.id}" d="${walls(band.r0, band.r1)}${cap(band.r0, band.r1)}"/>`);
	// Boundaries: along both walls and round the cap.
	const edges = new Set<number>();
	for (const band of LAYERS) edges.add(band.r0).add(band.r1);
	const lines: string[] = [];
	for (const rr of edges) {
		if (rr >= DET.r) continue;
		for (const w of ['y', 'z'] as const) lines.push(k.segment(onWall(-half, w, rr), onWall(half, w, rr), P));
		lines.push(k.pathOf(arcPts(rr, Math.PI / 2, TAU, 72).map(([u, v]) => at(k.pointOf(DF, half, u, v)))));
	}
	out.push(L(lines.join(''), { tone: 'lo' }));
	// Silicon layers of the tracker.
	const silicon: string[] = [];
	for (const rr of SILICON) {
		for (const w of ['y', 'z'] as const) silicon.push(k.segment(onWall(-half, w, rr), onWall(half, w, rr), P));
		silicon.push(k.pathOf(arcPts(rr, Math.PI / 2, TAU, 60).map(([u, v]) => at(k.pointOf(DF, half, u, v)))));
	}
	out.push(L(silicon.join(''), { tone: 'mid' }));
	// Crystals (ECAL), absorber plates (HCAL) and coil turns (solenoid): rungs across each band.
	const rungs = (r0: number, r1: number, step: number, capStep: number) => {
		const d: string[] = [];
		for (let x = -half + step; x < half - 0.5; x += step) for (const w of ['y', 'z'] as const) d.push(k.segment(onWall(x, w, r0), onWall(x, w, r1), P));
		for (let a = Math.PI / 2 + capStep; a < TAU - 1e-6; a += capStep) d.push(k.segment(k.pointOf(DF, half, r0 * Math.cos(a), r0 * Math.sin(a)), k.pointOf(DF, half, r1 * Math.cos(a), r1 * Math.sin(a)), P));
		return d.join('');
	};
	out.push(L(rungs(17, 24, 3.5, (5 * Math.PI) / 180), { tone: 'faint' }));
	out.push(L(rungs(25, 33, 7, (10 * Math.PI) / 180), { tone: 'lo' }));
	out.push(L(rungs(34, 38, 1.75, (60 * Math.PI) / 180), { tone: 'faint' }));
	// Drift-tube rows in the muon chambers.
	const tubes: Flat[] = [];
	for (const rr of [44.75, 51.75]) {
		for (let x = -half + 2; x < half - 1; x += 3) for (const w of ['y', 'z'] as const) tubes.push(at(onWall(x, w, rr)));
		for (let a = Math.PI / 2 + 0.05; a < TAU - 0.03; a += 0.07) tubes.push(at(k.pointOf(DF, half, rr * Math.cos(a), rr * Math.sin(a))));
	}
	out.push(D(tubes, { size: 0.42, tone: 'mid' }));
	return out.join('');
}

// ---- the field gauge -----------------------------------------------------------

const GAUGE = { s: 156, off: 24, r: 4.8, z: 10, max: 10 };
const SWEEP = (130 * Math.PI) / 180;
function gaugeFrame() {
	const c = chord(124, 188);
	const centre = k.add3(k.add3(c.a, k.mul3(c.T, GAUGE.s - 124)), [0, 0, -ZB]);
	return { c, centre };
}
/** A point on the dial face, angle 0 straight up, positive clockwise as seen. */
function onDial(r: number, a: number, lift = 0): Point3 {
	const { c, centre } = gaugeFrame();
	const face = k.add3(centre, k.mul3(c.N, -(GAUGE.off + 3.5 + lift)));
	return k.add3(face, k.add3(k.mul3(c.T, Math.sin(a) * r), [0, 0, GAUGE.z + Math.cos(a) * r]));
}
const needleAngle = (b: number) => -SWEEP + (Math.min(GAUGE.max, Math.max(0, b)) / GAUGE.max) * SWEEP * 2;

function gauge(): string {
	const { c, centre } = gaugeFrame();
	const out: string[] = [];
	const F: k.Frame = { o: k.add3(centre, k.mul3(c.T, -7)), a: c.T, u: k.mul3(c.N, -1), v: [0, 0, 1] };
	const box: Flat[] = [[GAUGE.off - 3.5, 0], [GAUGE.off + 3.5, 0], [GAUGE.off + 3.5, 17], [GAUGE.off - 3.5, 17]];
	const foot = k.add3(F.o, k.mul3(c.N, -GAUGE.off));
	out.push(halo({ x: foot[0] - 2, y: foot[1] - 5, w: 18, d: 10, r: 2 }));
	const seam = k.pathOf([at(k.pointOf(F, 0.01, GAUGE.off + 3.5, 3)), at(k.pointOf(F, 14, GAUGE.off + 3.5, 3))]);
	out.push(S(k.prismOf(F, box, 0, 14, P), { tone: 'mid', inner: L(seam, { tone: 'faint' }) }));
	const DFace: k.Frame = { o: onDial(0, 0, 0), a: k.mul3(c.N, -1), u: k.mul3(c.T, -1), v: [0, 0, 1] };
	out.push(S(disc(DFace, 0, 1.2, GAUGE.r, 48), { tone: 'mid' }));
	out.push(S(disc(DFace, 1.2, 1.5, GAUGE.r - 0.9, 48), { tone: 'hi', crease: 'none' }));
	const minor: string[] = [];
	const major: string[] = [];
	for (let i = 0; i <= 20; i++) {
		const a = -SWEEP + (i / 20) * SWEEP * 2;
		const long = i % 5 === 0;
		(long ? major : minor).push(k.segment(onDial(GAUGE.r - 1.2, a, 1.6), onDial(GAUGE.r - (long ? 2.4 : 1.8), a, 1.6), P));
	}
	out.push(L(k.pathOf(Array.from({ length: 41 }, (_, i) => at(onDial(GAUGE.r - 1.2, -SWEEP + (i / 40) * SWEEP * 2, 1.6)))), { tone: 'lo' }));
	out.push(L(minor.join(''), { tone: 'lo' }), L(major.join(''), { tone: 'mid' }));
	out.push(`<path class="iso-line" data-tone="lit" data-free="end" data-needle="" style="stroke-width:1"/>`);
	out.push(D([at(onDial(0, 0, 1.7))], { size: 0.8, tone: 'hi' }));
	return out.join('');
}

const needlePath = (b: number) => k.segment(onDial(0.9, needleAngle(b) + Math.PI, 1.7), onDial(GAUGE.r - 1.6, needleAngle(b), 1.7), P);

// ---- assembly ------------------------------------------------------------------

let ITEMS: Item[] = [];
let GAPS: Gap[] = [];

function ready() {
	if (P) return;
	const ends = [ringAt(-FLOOR_END), ringAt(FLOOR_END)].flatMap(({ p, n }) => [k.add3(p, k.mul3(n, 26)), k.add3(p, k.mul3(n, -34)), k.add3(p, [0, 0, ZB + 16])]);
	P = k.fitProjection([...ends, [0, -70, -16], [0, 76, -16], [0, -DET.r, ZB + DET.r], [0, 0, ZB + DET.r], [-92, 76, -16], [92, -70, -16]], WIDTH, HEIGHT, { pad: 16, azimuth: 45, elevation: 30 });
	V = k.viewOf(P);
	K = k.cameraOf(P).k;
	GAPS = gapsOf();
	const items: Item[] = [{ key: -1e6, svg: floor() }];
	ELEMENTS.forEach((e) => {
		const c = chord(e.s0, e.s1);
		const key = depth(lerp3(c.a, c.b, 0.5));
		if (e.kind === 'detector') items.push({ key, svg: detector() });
		else if (e.kind === 'plate') items.push({ key, svg: plate(e) });
		else if (e.kind === 'cavity') items.push({ key, svg: cavity(e, CAVITIES.indexOf(Math.round((e.s0 + e.s1) / 2))) });
		else items.push({ key, svg: `<g class="pc-magnet" data-kind="${e.kind}">${magnet(e)}</g>` });
	});
	for (const g of GAPS) {
		const pipes = g.beams
			.map((b) => ({ ...b, key: depth(lerp3(b.a, b.b, 0.5)) }))
			.sort((x, y) => x.key - y.key)
			.map((b) => pipeSvg(b.a, b.b, g.id === 'detector-pipe' || k.len3(k.sub3(b.b, b.a)) < 9 ? 0 : 3) + `<g data-bunch="${g.id}|${b.beam}"></g>`)
			.join('');
		const mid = lerp3(g.beams[0]!.a, g.beams[0]!.b, 0.5);
		// The pipe through the detector lies in the cut, so it paints after the detector body.
		items.push({ key: g.id === 'detector-pipe' ? depth(mid) + 0.5 : depth(mid), svg: pipes });
	}
	items.push({ key: depth([0, 0, ZB]) + 1, svg: '<g class="pc-burst" data-burst=""></g>' });
	const dipole = chord(124, 188);
	items.push({ key: depth(lerp3(dipole.a, dipole.b, 0.5)) + 0.1, svg: gauge() });
	ITEMS = items.sort((a, b) => a.key - b.key);
}

// ---- live slots ----------------------------------------------------------------

function capsule(a: Flat, b: Flat, w: number): string {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const l = Math.hypot(dx, dy) || 1;
	const nx = (-dy / l) * w;
	const ny = (dx / l) * w;
	const f = (v: number) => v.toFixed(1);
	return `M${f(a[0] + nx)} ${f(a[1] + ny)}L${f(b[0] + nx)} ${f(b[1] + ny)}A${f(w)} ${f(w)} 0 0 1 ${f(b[0] - nx)} ${f(b[1] - ny)}L${f(a[0] - nx)} ${f(a[1] - ny)}A${f(w)} ${f(w)} 0 0 1 ${f(a[0] + nx)} ${f(a[1] + ny)}Z`;
}

/** The bunch marks on each visible pipe at time t, keyed by slot. */
function bunchSlots(params: ColliderParams, t: number): Map<string, string> {
	const { one, two } = bunchesAt(params, t, -FLOOR_END, FLOOR_END);
	const out = new Map<string, string>();
	for (const g of GAPS) {
		for (const b of g.beams) {
			const list: Array<[number, 1 | 2]> = [];
			if (b.beam !== 2) for (const s of one) list.push([s, 1]);
			if (b.beam !== 1) for (const s of two) list.push([s, 2]);
			const parts: string[] = [];
			for (const [s, beam] of list) {
				const lo = Math.max(g.s0, s - BUNCH_HALF);
				const hi = Math.min(g.s1, s + BUNCH_HALF);
				if (hi - lo < 0.3) continue;
				const pa = at(lerp3(b.a, b.b, (lo - g.s0) / (g.s1 - g.s0)));
				const pb = at(lerp3(b.a, b.b, (hi - g.s0) / (g.s1 - g.s0)));
				parts.push(`<path class="pc-bunch pc-glow" data-beam="${beam}" d="${capsule(pa, pb, 3.4 * K)}"/><path class="pc-bunch" data-beam="${beam}" d="${capsule(pa, pb, 1.7 * K)}"/>`);
			}
			out.set(`${g.id}|${b.beam}`, parts.join(''));
		}
	}
	return out;
}

/** Which RF cavities a bunch is inside right now. */
function cavitiesOn(params: ColliderParams, t: number): Set<string> {
	const { one, two } = bunchesAt(params, t, -200, -120);
	const on = new Set<string>();
	CAVITIES.forEach((c, i) => {
		if (one.some((s) => Math.abs(s - c) < BEAD + 1)) on.add(`1-${i}`);
		if (two.some((s) => Math.abs(s - c) < BEAD + 1)) on.add(`2-${i}`);
	});
	return on;
}

/** A track: a helix seen in the cut quadrant, from the crossing point out to where it stops. */
function trackPoints(tr: Burst['tracks'][number], upTo: number): Point3[] {
	const pts: Point3[] = [];
	const steps = 18;
	for (let i = 0; i <= steps; i++) {
		const l = 1.2 + ((upTo - 1.2) * i) / steps;
		const th = tr.angle + tr.curl * l;
		const y = Math.abs(tr.curl) < 1e-6 ? l * Math.cos(tr.angle) : (Math.sin(th) - Math.sin(tr.angle)) / tr.curl;
		const z = Math.abs(tr.curl) < 1e-6 ? l * Math.sin(tr.angle) : (Math.cos(tr.angle) - Math.cos(th)) / tr.curl;
		pts.push([tr.slope * l, y, ZB + z]);
	}
	return pts;
}

function burstSvg(params: ColliderParams, t: number): string {
	return burstsAt(params, t)
		.map((b) => {
			if (b.glow < 0.01) return '';
			const lines: string[] = [];
			const heads: Flat[] = [];
			const hits: Flat[] = [];
			for (const tr of b.tracks) {
				const upTo = Math.max(1.4, tr.reach * b.reach);
				const pts = trackPoints(tr, upTo);
				lines.push(k.pathOf(pts.map(at)));
				heads.push(at(pts[pts.length - 1]!));
				for (const rr of SILICON) if (rr < upTo - 0.5) hits.push(at(trackPoints(tr, rr)[18]!));
			}
			const flash = Math.max(0, 1 - b.age / 0.35);
			return (
				`<g opacity="${b.glow.toFixed(2)}">` +
				`<circle class="pc-flash" cx="${at([0, 0, ZB])[0].toFixed(1)}" cy="${at([0, 0, ZB])[1].toFixed(1)}" r="${(K * (1.3 + 1.5 * flash)).toFixed(2)}"/>` +
				L(lines.join(''), { tone: 'lit', className: 'pc-track' }) +
				D(hits, { size: 0.45, tone: 'hi' }) +
				D(heads, { size: 0.85, tone: 'hi' }) +
				`</g>`
			);
		})
		.join('');
}

// ---- svg -------------------------------------------------------------------------

export const COLLIDER_CSS = `
.pc-bunch[data-beam="1"]{fill:var(--anatomy-blue)}
.pc-bunch[data-beam="2"]{fill:var(--anatomy-red)}
.pc-bunch.pc-glow{opacity:.22}
.pc-flash{fill:var(--anatomy-lit);opacity:.9}
.pc-track{stroke-width:1}
.pc-layer{stroke:none;fill:var(--anatomy-shade-2)}
.pc-layer[data-l="tracker"]{fill:var(--anatomy-top)}
.pc-layer[data-l="ecal"]{fill:var(--anatomy-shade-3)}
.pc-layer[data-l="hcal"]{fill:var(--anatomy-shade-2)}
.pc-layer[data-l="solenoid"]{fill:var(--anatomy-lit-top)}
.pc-layer[data-l="yoke"]{fill:var(--anatomy-shade-0)}
.pc-layer[data-l="chamber"]{fill:var(--anatomy-shade-3)}
.pc-void{fill:var(--anatomy-shade-0)}
.pc-yoke{fill:var(--anatomy-shade-1)}
.pc-collar{fill:var(--anatomy-shade-3)}
.pc-coil{fill:var(--anatomy-top)}
.pc-cavity>.iso-edge{transition:stroke .25s}
.pc-cavity[data-on="1"]>.iso-edge{stroke:var(--anatomy-blue)}
.pc-cavity[data-on="2"]>.iso-edge{stroke:var(--anatomy-red)}
.iso-halo.pc-shadow{filter:blur(2.5px);opacity:calc(var(--anatomy-halo-opacity) * .5);transform:none}
.iso-halo.pc-shadow[data-far]{filter:blur(4px);opacity:calc(var(--anatomy-halo-opacity) * .3)}
@media (prefers-reduced-motion:reduce){.pc-cavity>.iso-edge{transition:none}}
`;

export const LABEL = 'A cutaway piece of a circular particle collider: twin beam pipes through dipole and quadrupole magnets and radio-frequency cavities, and a detector where the two beams cross.';

/** The whole figure at time t as an SVG string, framed to everything it draws. */
export function colliderSvg(params: ColliderParams = clampParams(), t: number = stillTime(), standalone: k.Theme | false = false): string {
	return framed(rawSvg(params, t, standalone), frame());
}

function rawSvg(params: ColliderParams, t: number, standalone: k.Theme | false): string {
	ready();
	let body = ITEMS.map((i) => i.svg).join('');
	for (const [slot, svg] of bunchSlots(params, t)) body = body.replace(`data-bunch="${slot}"></g>`, `data-bunch="${slot}">${svg}</g>`);
	body = body.replace('data-burst=""></g>', `data-burst="">${burstSvg(params, t)}</g>`);
	body = body.replace('data-needle=""', `data-needle="" d="${needlePath(fieldOf(params))}"`);
	for (const id of cavitiesOn(params, t)) body = body.replace(`data-cavity="${id}"`, `data-cavity="${id}" data-on="${id[0]}"`);
	const svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL, body, standalone });
	return standalone ? svg.replace('</style>', `${PAPER_CSS}${COLLIDER_CSS}</style>`).replace('class="iso-svg iso"', 'class="iso-svg iso" data-figure-host="particle-collider"') : svg;
}

let FRAME: FrameBox | null = null;
/** The viewBox: the drawing with a burst at full reach, plus the pins. */
function frame(): FrameBox {
	if (FRAME) return FRAME;
	ready();
	const p = clampParams({ energy: 7, rate: 40 });
	FRAME = frameOf([0.3, 0.6].map((t) => rawSvg(p, t, false)), anchorPoints().map(([, , pt]) => at(pt)));
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
	const top = (s0: number, s1: number, r: number, f = 0.5): Point3 => {
		const c = chord(s0, s1);
		return k.add3(lerp3(c.a, c.b, f), [0, 0, r]);
	};
	const cut = chord(228, 282);
	const capPoint = (r: number, a: number): Point3 => k.pointOf(DF, DET.half, r * Math.cos(a), r * Math.sin(a));
	return [
		['collision-point', 'Collision point', [16, 3, ZB]],
		['detector', 'Detector', [-20, DET.r * Math.cos(2.05), ZB + DET.r * Math.sin(2.05)]],
		['tracker', 'Tracker', [-48, 0, ZB + 9.5]],
		['ecal', 'Electromagnetic calorimeter', [-14, 0, ZB + 20.5]],
		['hcal', 'Hadron calorimeter', [26, 0, ZB + 29]],
		['solenoid', 'Solenoid magnet', capPoint(36, (258 * Math.PI) / 180)],
		['muon-chambers', 'Muon chambers', capPoint(51.75, (300 * Math.PI) / 180)],
		['beam-pipes', 'Beam pipes', boreAt(chord(112, 124), 'a', 2).map((v, i) => (i === 2 ? v + PIPE_R : v)) as Point3],
		['dipole', 'Dipole magnet', top(124, 188, 15, 0.4)],
		['quadrupole', 'Quadrupole magnet', top(198, 218, 13.4)],
		['final-focus', 'Final focus magnets', top(66, 88, 10.9)],
		['separation-magnet', 'Separation magnet', top(96, 112, 10)],
		['rf-cavities', 'RF cavities', top(CAVITIES[2]! - IRIS, CAVITIES[2]! + IRIS, 14.2)],
		['magnet-coils', 'Superconducting coils', k.pointOf(cut.F, cut.len, SEP, 3.7)],
		['field-gauge', 'Field gauge', onDial(0, 0, 1.7)]
	];
}

// ---- live mount ------------------------------------------------------------------

export interface MountOptions {
	theme?: k.Theme;
	params?: Partial<ColliderParams>;
	onReadout?: (values: Record<string, string>) => void;
}

export interface FigureHandle {
	update(params: Partial<Record<string, number>>): void;
	setTheme(theme: k.Theme): void;
	/** Park the figure `t` seconds into the loop and stop it (captures, tests). */
	seek(t: number): void;
	destroy(): void;
}

const STYLE_ID = 'ripple-iso-collider-css';

export function mount(el: HTMLElement, { theme = 'dark', params: initial, onReadout }: MountOptions = {}): FigureHandle {
	const doc = el.ownerDocument;
	if (!doc.getElementById(STYLE_ID)) {
		const style = doc.createElement('style');
		style.id = STYLE_ID;
		style.textContent = k.ISO_CSS + PAPER_CSS + COLLIDER_CSS;
		doc.head.appendChild(style);
	}
	let params = clampParams(initial);
	const win = doc.defaultView;
	const still = win?.matchMedia?.('(prefers-reduced-motion: reduce)');
	let t = stillTime();
	const svg = doc.importNode(new DOMParser().parseFromString(colliderSvg(params, t), 'image/svg+xml').documentElement, true) as unknown as SVGSVGElement;
	el.classList.add('iso');
	el.dataset.figureHost = 'particle-collider';
	el.dataset.theme = theme;
	el.replaceChildren(svg);
	const slots = new Map<string, SVGGElement>();
	for (const g of svg.querySelectorAll<SVGGElement>('[data-bunch]')) slots.set(g.dataset.bunch!, g);
	const burst = svg.querySelector<SVGGElement>('[data-burst]');
	const needle = svg.querySelector<SVGPathElement>('[data-needle]');
	const cavities = [...svg.querySelectorAll<SVGGElement>('[data-cavity]')];
	const shown = new Map<string, string>();
	let lastKey = '';
	let parked = false;

	function draw() {
		for (const [id, html] of bunchSlots(params, t)) {
			if (shown.get(id) === html) continue;
			shown.set(id, html);
			const g = slots.get(id);
			if (g) g.innerHTML = html;
		}
		if (burst) burst.innerHTML = burstSvg(params, t);
		const on = cavitiesOn(params, t);
		for (const g of cavities) {
			const id = g.dataset.cavity!;
			if (on.has(id)) g.dataset.on = id[0];
			else delete g.dataset.on;
		}
		const readouts = readoutsOf(params);
		const key = JSON.stringify(readouts);
		if (key !== lastKey) {
			lastKey = key;
			needle?.setAttribute('d', needlePath(fieldOf(params)));
			onReadout?.(readouts);
			svg.setAttribute('aria-label', describe(params));
		}
	}

	let frameId = 0;
	let last = 0;
	let visible = true;
	const loop = (now: number) => {
		const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
		last = now;
		t += dt;
		draw();
		frameId = win!.requestAnimationFrame(loop);
	};
	const stop = () => {
		if (frameId) win?.cancelAnimationFrame(frameId);
		frameId = 0;
	};
	const run = () => {
		if (frameId || parked || !visible || doc.hidden || still?.matches || !win?.requestAnimationFrame) return;
		last = 0;
		frameId = win.requestAnimationFrame(loop);
	};
	const sync = () => (visible && !doc.hidden && !still?.matches && !parked ? run() : stop());
	const io = win && 'IntersectionObserver' in win ? new win.IntersectionObserver((entries) => ((visible = entries[entries.length - 1]!.isIntersecting), sync())) : null;
	io?.observe(el);
	doc.addEventListener('visibilitychange', sync);
	const onStill = () => {
		if (still?.matches) t = stillTime();
		draw();
		sync();
	};
	still?.addEventListener?.('change', onStill);
	draw();
	run();

	return {
		update(next) {
			params = clampParams({ ...params, ...next });
			if (still?.matches) t = stillTime();
			draw();
		},
		setTheme(next) {
			el.dataset.theme = next;
		},
		seek(time) {
			parked = true;
			stop();
			t = time;
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
