// figures/rocket-engine/figure.ts: a liquid-fuel rocket engine firing on a
// horizontal test stand, drawn the Anatomy way with the @ripple-ui/core/iso
// kit. World: x along the engine toward the nozzle exit, y toward the viewer,
// z up; 1 unit is about 1 cm. The engine hangs from a load cell on a pylon
// through its gimbal and fires off the end of the bed; the tanks stand at the
// far end; the turbopump rides on top of the chamber, cut open lengthwise on
// the side facing the viewer so its shaft, inducers, impellers and turbine show.
//
// Round parts come from `turned()` (a profile of [s, r] spun round an axis,
// faceted and shaded by facing) and must be convex, so the waisted chamber and
// nozzle are cut into convex bands drawn back to front along x (band, ring,
// band, as the Anatomy craft says). Pipes are prism legs with ball elbows, each
// ending on a flange or collar, and carry a dashed flow line tinted by what
// they carry (oxygen blue, kerosene amber, hot gas red).
//
// `engineSvg()` is pure (strings only). Static parts are built once in
// `ready()`; per frame `mount()` rebuilds only the rotor (it spins at SLOW of
// real speed), the plume (it flickers and follows the throttle) and the gauge
// needle, and moves the flow dashes. No DOM or work at module top level.

import * as k from '@ripple-ui/core/iso';
import type { Flat, Frame, Point3, SolidPaths } from '@ripple-ui/core/iso';
import { PAPER_CSS } from '../paper.js';
import { frameOf, framed, percentIn, type FrameBox } from '../frame.js';
import { clampParams, describe, plumeOf, readoutsOf, shaftSpeedOf, stateOf, type EngineParams } from './model.js';

export const WIDTH = 640;
export const HEIGHT = 420;

const TAU = Math.PI * 2;
const ZE = 72; // engine axis height
const ZT = 150; // turbopump axis height
const PLATE = { x: -262, y: -74, w: 372, d: 154, r: 10 };
const PLATE_H = 10;
const FOOT_H = 5;
const EXIT_X = 95;
const EXIT_R = 44;
const THROAT_X = 10;
const THROAT_R = 11;
const TANK = { x: -222, r: 24, top: 150 };
const OX_Y = 36; // oxygen tank in front
const FUEL_Y = -36; // kerosene tank behind
const PB = { x: -67, y: -56, r: 11, z0: 128, z1: 172 }; // preburner
const GAUGE = { x: -40, y: 62, z: 40, r: 11 };

let P = null as unknown as k.Projection;
let V: Point3 = [0, 0, 1];
let LIGHT: Point3 = [0, 0, 1];
let STATIC: { back: string; front: string } = { back: '', front: '' };

const at = (p: Point3): Flat => k.iso(p, P);
const S = (paths: SolidPaths, style: k.SolidStyle = {}) => k.solidSvg(paths, style);
const L = (d: string, style: k.LineStyle = {}) => k.lineSvg(d, style);
const D = (points: Flat[], style: { size?: number; tone?: k.Tone } = {}) => k.dotsSvg(points, style);
const depth = (p: Point3) => k.depthOf(p, P);
const radial = (F: Frame, phi: number): Point3 => k.add3(k.mul3(F.u, Math.cos(phi)), k.mul3(F.v, Math.sin(phi)));
const onRing = (F: Frame, s: number, r: number, phi: number): Point3 => k.pointOf(F, s, r * Math.cos(phi), r * Math.sin(phi));
const fx = (o: Point3) => k.axisFrame(o, 'x');
const fz = (o: Point3) => k.axisFrame(o, 'z');
const ENGINE = () => fx([0, 0, ZE]);
const PUMP = () => fx([0, 0, ZT]);

// ---- turned parts ------------------------------------------------------------

/** A convex solid of revolution: `prof` is [s, r] pairs along F.a (s ascending), closed by end caps. */
function turned(F: Frame, prof: Array<[number, number]>, steps = 64, openEnd = false): SolidPaths {
	const n = prof.length;
	const rings = prof.map(([s, r]) => Array.from({ length: steps }, (_, j) => onRing(F, s, r, (j / steps) * TAU)));
	const flat = rings.map((ring) => ring.map(at));
	const buckets: string[][] = [[], [], [], [], []];
	const seen: boolean[][] = [];
	for (let i = 0; i < n - 1; i++) {
		const [s0, r0] = prof[i]!;
		const [s1, r1] = prof[i + 1]!;
		const row: boolean[] = [];
		for (let j = 0; j < steps; j++) {
			const mid = ((j + 0.5) / steps) * TAU;
			const nrm = Math.abs(s1 - s0) < 1e-9 ? k.mul3(F.a, -Math.sign(r1 - r0)) : k.unit3(k.sub3(k.mul3(radial(F, mid), s1 - s0), k.mul3(F.a, r1 - r0)));
			const vis = k.dot3(nrm, V) > 1e-6 && Math.abs(r1 - r0) + Math.abs(s1 - s0) > 1e-9;
			row.push(vis);
			if (!vis) continue;
			const j1 = (j + 1) % steps;
			buckets[k.bandOf(k.dot3(nrm, LIGHT))]!.push(k.pathOf([flat[i]![j]!, flat[i]![j1]!, flat[i + 1]![j1]!, flat[i + 1]![j]!], true));
		}
		seen.push(row);
	}
	const creases: string[] = [];
	const cap = (i: number, normal: Point3, row: boolean[] | undefined) => {
		if (prof[i]![1] < 0.05 || k.dot3(normal, V) <= 1e-6) return;
		buckets[k.bandOf(k.dot3(normal, LIGHT))]!.push(k.pathOf(flat[i]!, true));
		if (row) creaseRun(flat[i]!, row, creases);
	};
	cap(0, k.mul3(F.a, -1), seen[0]);
	if (!openEnd) cap(n - 1, F.a, seen[n - 2]);
	// Shoulders: a ring where the profile turns sharply reads as a machined crease.
	for (let i = 1; i < n - 1; i++) {
		const [sa, ra] = prof[i - 1]!;
		const [sb, rb] = prof[i]!;
		const [sc, rc] = prof[i + 1]!;
		const a1 = Math.atan2(rb - ra, sb - sa);
		const a2 = Math.atan2(rc - rb, sc - sb);
		if (Math.abs(a2 - a1) < 0.35) continue;
		creaseRun(flat[i]!, seen[i - 1]!.map((v, j) => v && seen[i]![j]!), creases);
	}
	const hull = k.pathOf(k.hullOf(flat.flat()), true);
	return { fill: hull, outline: hull, crease: creases.join(''), top: buckets[4]!.join(''), shades: buckets.slice(0, 4).map((b) => b.join('')), seamless: true };
}

/** The runs of a ring's segments flagged true, as open paths. */
function creaseRun(ring: Flat[], on: boolean[], out: string[]) {
	const n = ring.length;
	const start = on.findIndex((v, j) => v && !on[(j - 1 + n) % n]);
	if (start < 0) {
		if (on.every(Boolean)) out.push(k.pathOf(ring, true));
		return;
	}
	let run: Flat[] = [];
	for (let c = 0; c <= n; c++) {
		const j = (start + c) % n;
		if (on[j] && c < n) {
			if (!run.length) run.push(ring[j]!);
			run.push(ring[(j + 1) % n]!);
		} else if (run.length) {
			out.push(k.pathOf(run));
			run = [];
		}
	}
}

/** The visible arc of the ring at s (radius r, profile slope dr/ds) from limb to limb, as a path. */
function arcOf(F: Frame, s: number, r: number, slope = 0, steps = 48): string {
	const A = k.dot3(F.u, V);
	const B = k.dot3(F.v, V);
	const C = slope * k.dot3(F.a, V);
	const R = Math.hypot(A, B);
	if (C / R >= 1) return '';
	const mid = Math.atan2(B, A);
	const half = C / R <= -1 ? Math.PI : Math.acos(C / R);
	return k.pathOf(Array.from({ length: steps + 1 }, (_, i) => at(onRing(F, s, r, mid - half + (2 * half * i) / steps))));
}

/** How squarely a surface point faces the viewer, 0..1 (for fading textures toward the limbs). */
const facing = (n: Point3) => Math.max(0, k.dot3(k.unit3(n), V));

// ---- the cut-open turbopump housing ---------------------------------------------

/** The direction across the axis that points at the viewer: the cut removes the half on this side. */
const cutNormal = (F: Frame) => k.unit3(k.sub3(V, k.mul3(F.a, k.dot3(V, F.a))));
const backOf = (F: Frame) => {
	const w = cutNormal(F);
	return Math.atan2(k.dot3(F.v, w), k.dot3(F.u, w)) + Math.PI; // centre of the half that stays
};

/** A housing section from s0 to s1 (outer radius R, wall t) with its viewer-side half cut away. */
function cutShell(F: Frame, s0: number, s1: number, R: number, t: number, wall: { s0?: boolean; s1?: boolean } = {}, hole = 4): string {
	const N = 40;
	const c = backOf(F);
	const phis = Array.from({ length: N + 1 }, (_, i) => c - Math.PI / 2 + (Math.PI * i) / N);
	const ri = R - t;
	const buckets: string[][] = [[], [], [], [], []];
	const put = (n: Point3, pts: Point3[]) => {
		if (k.dot3(n, V) <= 1e-6) return;
		buckets[k.bandOf(k.dot3(n, LIGHT))]!.push(k.pathOf(pts.map(at), true));
	};
	// Inner surface of the half that stays.
	for (let i = 0; i < N; i++) put(k.mul3(radial(F, (phis[i]! + phis[i + 1]!) / 2), -1), [onRing(F, s0, ri, phis[i]!), onRing(F, s0, ri, phis[i + 1]!), onRing(F, s1, ri, phis[i + 1]!), onRing(F, s1, ri, phis[i]!)]);
	// The far end wall (inside face, toward +s) and the near end (the cut wall's outer face).
	const halfDisc = (s: number, r0: number) => [...phis.map((p) => onRing(F, s, R, p)), ...[...phis].reverse().map((p) => onRing(F, s, r0, p))];
	if (wall.s0) put(F.a, halfDisc(s0, hole));
	// Cut faces: two strips along the cut, facing the viewer, bare machined metal.
	const cut = [phis[0]!, phis[N]!].map((p) => k.pathOf([onRing(F, s0, ri, p), onRing(F, s0, R, p), onRing(F, s1, R, p), onRing(F, s1, ri, p)].map(at), true)).join('');
	const endWall = wall.s1 ? halfDisc(s1, hole) : halfDisc(s1, ri);
	put(F.a, endWall);
	const outer = [...phis.map((p) => at(onRing(F, s0, R, p))), ...phis.map((p) => at(onRing(F, s1, R, p)))];
	const hull = k.pathOf(k.hullOf(outer), true);
	const crease = [
		...[phis[0]!, phis[N]!].map((p) => k.pathOf([at(onRing(F, s0, ri, p)), at(onRing(F, s1, ri, p))])),
		k.pathOf(phis.map((p) => at(onRing(F, s1, wall.s1 ? hole : ri, p)))),
		k.pathOf(phis.map((p) => at(onRing(F, s0, ri, p))))
	].join('');
	const inner = `<path class="rk-cutface" d="${cut}"/>` + L(crease, { tone: 'lo', className: 'iso-crease' });
	return S({ fill: hull, outline: hull, crease: '', top: buckets[4]!.join(''), shades: buckets.slice(0, 4).map((b) => b.join('')) }, { tone: 'mid', crease: 'none', className: 'rk-cut', inner });
}

// ---- pipes --------------------------------------------------------------------

interface Piece {
	key: number;
	svg: string;
}

type Fluid = 'ox' | 'fuel' | 'hot';

/** A pipe through `route` (straight legs), ball elbows at the bends, flanges at both ends; pieces sorted by depth. */
function pipe(route: Point3[], r: number, fluid: Fluid | null, flowId?: string, ends: [boolean, boolean] = [true, true]): string {
	const pieces: Piece[] = [];
	const cls = fluid ? `rk-${fluid}` : '';
	for (let i = 0; i < route.length - 1; i++) {
		const a = route[i]!;
		const b = route[i + 1]!;
		const dir = k.sub3(b, a);
		const len = k.len3(dir);
		const F = k.frameAlong(a, dir);
		const startPad = i === 0 ? 0 : r * 0.6;
		const endPad = i === route.length - 2 ? 0 : r * 0.6;
		pieces.push({ key: depth(k.add3(a, k.mul3(dir, 0.5))), svg: S(k.prismOf(F, k.circlePolygon(r, 28), startPad, len - endPad, P), { tone: 'mid', crease: 'none', className: cls }) });
		const flange = (o: Point3, along: Point3, key: number) => pieces.push({ key, svg: S(k.prismOf(k.frameAlong(o, along), k.circlePolygon(r + 2, 32), 0, 2.4, P), { tone: 'mid', className: cls }) });
		if (i === 0 && ends[0]) flange(a, dir, depth(a) + 0.02);
		if (i === route.length - 2 && ends[1]) flange(b, k.mul3(dir, -1), depth(b) + 0.02);
	}
	for (let i = 1; i < route.length - 1; i++) pieces.push({ key: depth(route[i]!) + 0.01, svg: S(k.sphereOf(route[i]!, r * 1.22, P, 40), { tone: 'mid', crease: 'none', className: cls }) });
	pieces.sort((a, b) => a.key - b.key);
	let flow = '';
	if (flowId && fluid) {
		// The dashes ride the side of the pipe nearest the viewer, from flange face to flange face.
		const pts: Flat[] = [];
		route.forEach((p, i) => {
			const prev = route[Math.max(0, i - 1)]!;
			const next = route[Math.min(route.length - 1, i + 1)]!;
			const axis = k.unit3(k.sub3(next, prev));
			const off = k.sub3(V, k.mul3(axis, k.dot3(V, axis)));
			const n = k.len3(off) > 1e-6 ? k.unit3(off) : ([0, 0, 1] as Point3);
			let q = p;
			if (i === 0 && ends[0]) q = k.add3(p, k.mul3(axis, 2.4));
			if (i === route.length - 1 && ends[1]) q = k.add3(p, k.mul3(axis, -2.4));
			pts.push(at(k.add3(q, k.mul3(n, r * 0.62))));
		});
		flow = `<path class="iso-line rk-flow rk-flow-${fluid}" data-flow-id="${flowId}" d="${k.pathOf(pts)}"/>` + D([pts[0]!, pts[pts.length - 1]!], { size: 0.5, tone: 'mid' });
	}
	return pieces.map((p) => p.svg).join('') + flow;
}

/** A valve body on a straight leg (centre `o`, along `axis`), with an actuator can standing out along `side`. */
function valve(o: Point3, axis: Point3, r: number, side: Point3, fluid: Fluid): string {
	const F = k.frameAlong(o, axis);
	const body = turned(F, [[-9, r + 1.6], [-7, r + 3.4], [-3, r + 5], [3, r + 5], [7, r + 3.4], [9, r + 1.6]], 48);
	const out: string[] = [S(body, { tone: 'mid', className: `rk-${fluid}`, inner: L(arcOf(F, 0, r + 5), { tone: 'faint' }) })];
	const neck = k.add3(o, k.mul3(side, r + 4.6));
	const G = k.frameAlong(neck, side);
	out.push(S(turned(G, [[0, 2.2], [5, 2.2]], 24), { tone: 'mid', crease: 'none' }));
	out.push(S(turned(G, [[5, 5.4], [6, 6], [13, 6], [14, 5.2]], 40), { tone: 'mid', inner: L(arcOf(G, 9.5, 6), { tone: 'faint' }) }));
	out.push(D([at(k.add3(neck, k.mul3(side, 14)))], { size: 0.55, tone: 'hi' }));
	return out.join('');
}

// ---- base and stand -----------------------------------------------------------

function bench(): string {
	const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
	const feet = [...k.corners(PLATE, 24), [PLATE.x + PLATE.w / 2, PLATE.y + 24] as Flat, [PLATE.x + PLATE.w / 2, PLATE.y + PLATE.d - 24] as Flat].sort((a, b) => depth([a[0], a[1], 0]) - depth([b[0], b[1], 0]));
	for (const [x, y] of feet) {
		out.push(S(k.cylinder(x, y, 8, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: 'lo' }));
		out.push(S(k.cylinder(x, y, 6.2, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: 'lo' }));
	}
	out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: 'lo', inner: L(k.sideSeam(PLATE, -PLATE_H + 3, P), { tone: 'faint' }) }));
	out.push(L(k.planOutline(k.insetPlan(PLATE, 6), 0, P), { tone: 'faint' }));
	const screws = k.corners(PLATE, 12);
	out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.6, 0, P, 16)).join(''), { tone: 'lo' }));
	out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
	// Ruler strip along the front edge, under the engine, ticks rooted on its back edge.
	const strip = { x: -120, y: PLATE.y + PLATE.d - 16, w: 210, d: 8, r: 1 };
	out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: 'lo', crease: 'none' }));
	const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 5, 5, strip.y + 0.8, 0.6, [2.2, 4], P);
	out.push(L(ticks.minor, { tone: 'lo' }), L(ticks.major, { tone: 'mid' }));
	// Label plate, front left, three rule lines standing for print.
	const label = { x: -250, y: PLATE.y + PLATE.d - 22, w: 40, d: 13, r: 1.2 };
	out.push(S(k.slabOf(label, 0, 1, P, 3, 0.3), { tone: 'mid' }));
	for (const [i, yy] of [3.4, 6.6, 9.8].entries()) out.push(L(k.lineOnTop([label.x + 3, label.y + yy], [label.x + label.w - (i ? 12 : 3), label.y + yy], 1, P), { tone: i === 0 ? 'lo' : 'faint', free: true }));
	out.push(D([at([label.x + 1.6, label.y + 6.6, 1]), at([label.x + label.w - 1.6, label.y + 6.6, 1])], { size: 0.45 }));
	return out.join('');
}

function shadow(plan: k.Plan, z = 0): string {
	return `<path class="iso-halo rk-shadow" d="${k.haloOf(plan, z, 0.1, P)}"/>`;
}

/** A propellant tank on a pad: shell with weld seams, a domed lid with a bolt ring, a level port and an outlet boss. */
function tank(y: number, fluid: Fluid): string {
	const { x, r, top } = TANK;
	const out: string[] = [];
	out.push(S(k.cylinder(x, y, r + 5, 0, 4, P, 48, 0.6), { tone: 'mid' }));
	out.push(shadow({ x: x - r, y: y - r, w: 2 * r, d: 2 * r, r }, 4));
	const seams = L(k.sideArc(x, y, r, 30, P, 32) + k.sideArc(x, y, r, 90, P, 32) + k.sideArc(x, y, r, top - 12, P, 32), { tone: 'lo' });
	out.push(S(k.cylinder(x, y, r, 4, top - 4, P, 64), { tone: 'hi', crease: 'lo', className: `rk-${fluid}`, inner: seams }));
	const F = fz([x, y, top]);
	out.push(S(turned(F, Array.from({ length: 13 }, (_, i) => [16 * Math.sin((i / 12) * 1.32), Math.max(4, r * Math.cos((i / 12) * 1.32))] as [number, number]), 64), { tone: 'mid', className: `rk-${fluid}` }));
	out.push(D(Array.from({ length: 14 }, (_, i) => (i / 14) * TAU).filter((a) => Math.cos(a) * k.towardViewer(P)[0] + Math.sin(a) * k.towardViewer(P)[1] > 0.1).map((a) => at([x + Math.cos(a) * (r - 2.5), y + Math.sin(a) * (r - 2.5), top + 4])), { size: 0.45, tone: 'mid' }));
	out.push(S(k.cylinder(x, y, 4.6, top + 16, 4, P, 28), { tone: 'mid' }));
	out.push(D([at([x, y, top + 20])], { size: 0.55, tone: 'hi' }));
	// Level sight port on the front: a short boss with a ring.
	for (const z of [58, 112]) out.push(S(turned(fx([x + r - 0.5, y, z]), [[0, 3.2], [4.5, 3.2]], 28), { tone: 'mid' }));
	out.push(S(k.cylinder(x + r + 2.6, y, 1.5, 58, 54, P, 20), { tone: 'mid', crease: 'none', className: `rk-${fluid}` }));
	return out.join('');
}

function pylon(): string {
	const out: string[] = [];
	const base = { x: -158, y: -38, w: 32, d: 76, r: 2 };
	out.push(shadow(base));
	out.push(S(k.slabOf(base, 0, 5, P, 4, 0.6), { tone: 'mid' }));
	out.push(D(k.corners(base, 4).map(([x, y]) => at([x, y, 5])), { size: 0.5, tone: 'mid' }));
	// Gussets either side of the post.
	for (const y of [-30, 27]) {
		const F = k.axisFrame([0, y, 0], 'y');
		out.push(S(k.prismOf(F, [[5, -132], [5, -128], [70, -132]], 0, 3, P), { tone: 'mid' }));
	}
	const post = { x: -152, y: -32, w: 20, d: 64, r: 2 };
	const seam = L(k.sideSeam(post, 40, P, 4) + k.sideSeam(post, 100, P, 4), { tone: 'faint' });
	out.push(S(k.slabOf(post, 5, 105, P, 4, 1), { tone: 'mid', inner: seam }));
	out.push(D([-24, -8, 8, 24].flatMap((y) => [at([-132, y, 92]), at([-132, y, 52])]), { size: 0.5, tone: 'mid' }));
	// Access panel on the front face: a raised plate with four screws.
	const panel = k.prismOf(k.axisFrame([0, 32, 0], 'y'), [[22, -148], [22, -136], [78, -136], [78, -148]], 0, 0.8, P);
	out.push(S(panel, { tone: 'mid' }));
	out.push(D([[26, -146], [26, -138], [74, -146], [74, -138]].map(([z, x]) => at([x!, 32.8, z!])), { size: 0.45, tone: 'mid' }));
	return out.join('');
}

/** Load cell, mount plate and gimbal: the engine's only tie to the stand, so the load cell feels all the thrust. */
function thrustMount(): string {
	const E = ENGINE();
	const out: string[] = [];
	out.push(S(turned(E, [[-132, 10.5], [-130, 10.5]], 48), { tone: 'mid' }));
	out.push(S(turned(E, [[-130, 8], [-118, 8]], 48), { tone: 'hi', crease: 'lo', inner: L(arcOf(E, -126, 8) + arcOf(E, -122, 8), { tone: 'faint' }) }));
	out.push(S(turned(E, [[-118, 10.5], [-116, 10.5]], 48), { tone: 'mid' }));
	// Connector on top of the load cell body.
	out.push(S(k.cylinder(-124, 0, 2.4, ZE + 7.6, 5, P, 20), { tone: 'mid' }) + D([at([-124, 0, ZE + 12.6])], { size: 0.5, tone: 'hi' }));
	// Square mount plate with four bolts.
	const plate = k.prismOf(fx([-116, 0, ZE]), [[-15, -15], [15, -15], [15, 15], [-15, 15]], 0, 3.5, P);
	out.push(S(plate, { tone: 'mid' }));
	out.push(D([[-11, -11], [11, -11], [-11, 11], [11, 11]].map(([y, z]) => at([-112.5, y!, ZE + z!])), { size: 0.5, tone: 'mid' }));
	// Gimbal: a cross of trunnion pins in a ring between two knuckles.
	out.push(S(turned(E, [[-112.5, 6], [-101, 6]], 40), { tone: 'mid', crease: 'none' }));
	for (const [o, axis] of [[[-107, 0, ZE] as Point3, [0, 1, 0] as Point3]]) out.push(S(k.prismOf(k.frameAlong(k.add3(o, k.mul3(axis, -14)), axis), k.circlePolygon(2.6, 20), 0, 28, P), { tone: 'mid', crease: 'none' }));
	out.push(S(turned(E, [[-110, 11], [-109, 12], [-105, 12], [-104, 11]], 56), { tone: 'mid' }));
	out.push(S(k.prismOf(k.frameAlong([-107, 13.5, ZE], [0, 1, 0]), k.circlePolygon(3.6, 24), 0, 2, P), { tone: 'mid' }) + D([at([-107, 15.5, ZE])], { size: 0.55, tone: 'hi' }));
	out.push(S(k.prismOf(k.frameAlong([-107, 0, ZE + 11.5], [0, 0, 1]), k.circlePolygon(3.6, 24), 0, 2.4, P), { tone: 'mid' }));
	return out.join('');
}

// ---- engine body ------------------------------------------------------------------

/** Bell radius at x (throat to exit): a parabola-like curve from 34 deg at the throat to 10 deg at the lip. */
export function bellR(x: number): number {
	const L = EXIT_X - THROAT_X;
	const u = Math.min(L, Math.max(0, x - THROAT_X));
	const a = Math.tan((34 * Math.PI) / 180);
	const b = Math.tan((10 * Math.PI) / 180);
	const raw = (v: number) => a * v + ((b - a) * v * v) / (2 * L);
	return THROAT_R + ((EXIT_R - THROAT_R) * raw(u)) / raw(L);
}
const bellSlope = (x: number) => (bellR(x + 0.5) - bellR(x - 0.5)) / 1;
const bellProfile = (x0: number, x1: number, step = 3): Array<[number, number]> => {
	const n = Math.max(2, Math.ceil((x1 - x0) / step));
	return Array.from({ length: n + 1 }, (_, i) => {
		const x = x0 + ((x1 - x0) * i) / n;
		return [x, bellR(x)] as [number, number];
	});
};
const RINGS = { stiffener: [48, 52], manifold: [82, 88] } as const;

/** Cooling channels on a bell band: faint meridians that fade toward the limbs and end on the band's seams. */
function channels(x0: number, x1: number, count = 72): string {
	const E = ENGINE();
	const list: k.Faded[] = [];
	for (let j = 0; j < count; j++) {
		const phi = (j / count) * TAU;
		const mid = (x0 + x1) / 2;
		const n = k.sub3(radial(E, phi), k.mul3(E.a, bellSlope(mid)));
		const f = facing(n);
		if (f < 0.08) continue;
		const pts: Flat[] = [];
		for (let i = 0; i <= 8; i++) {
			const x = x0 + ((x1 - x0) * i) / 8;
			pts.push(at(onRing(E, x, bellR(x) + 0.05, phi)));
		}
		list.push([k.pathOf(pts), Math.min(1, (f - 0.08) / 0.35)]);
	}
	return k.fadedSvg(list, { tone: 'lo', className: 'rk-channel' });
}

/** Bolt heads round a flange rim, fading toward the limbs. */
function rimBolts(F: Frame, s: number, r: number, count: number): string {
	const out: string[] = [];
	for (let j = 0; j < count; j++) {
		const phi = (j / count) * TAU;
		const f = facing(radial(F, phi));
		if (f < 0.15) continue;
		const [x, y] = at(onRing(F, s, r, phi));
		out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="0.5" fill-opacity="${Math.min(1, (f - 0.15) / 0.3).toFixed(2)}"/>`);
	}
	return `<g class="iso-dots" data-tone="mid">${out.join('')}</g>`;
}

function engineBody(): string {
	const E = ENGINE();
	const out: string[] = [];
	out.push(S(turned(E, [[-101, 9], [-96, 9]], 48), { tone: 'mid' })); // thrust puck
	out.push(S(turned(E, [[-96, 8], [-93, 11.5], [-89, 14], [-84, 15.8], [-78, 17], [-73, 17.4]], 64), { tone: 'hi', crease: 'lo', className: 'rk-hot' })); // injector dome
	out.push(S(turned(E, [[-73, 23], [-70, 23]], 64), { tone: 'mid' }) + rimBolts(E, -71.5, 23, 24));
	out.push(S(turned(E, [[-70, 24.2], [-68.6, 24.2]], 64), { tone: 'mid', crease: 'lo' })); // injector plate edge
	out.push(S(turned(E, [[-68.6, 23], [-65.6, 23]], 64), { tone: 'mid' }) + rimBolts(E, -67.1, 23, 24));
	// Chamber: three bands between two cooling-jacket rings.
	const band = (x0: number, x1: number) => S(turned(E, [[x0, 19], [x1, 19]], 64), { tone: 'hi', crease: 'lo' });
	const ring = (x0: number, x1: number) => S(turned(E, [[x0, 20.6], [x0 + 0.8, 21.4], [x1 - 0.8, 21.4], [x1, 20.6]], 64), { tone: 'mid' });
	out.push(band(-65.6, -51.5), ring(-51.5, -48.5), band(-48.5, -31.5), ring(-31.5, -28.5), band(-28.5, -10));
	// Pressure tap boss on the chamber, low on the front, where the gauge's sense line starts.
	out.push(S(k.prismOf(k.frameAlong(onRing(E, -40, 18.4, Math.PI * -0.3), radial(E, Math.PI * -0.3)), k.circlePolygon(3.4, 24), 0, 3, P), { tone: 'mid' }));
	// Converging section, then the bell in bands round its two rings.
	const conv = Array.from({ length: 25 }, (_, i) => [-10 + (20 * i) / 24, 19 - (19 - THROAT_R) * (i / 24) ** 1.6] as [number, number]);
	out.push(S(turned(E, conv, 64), { tone: 'hi', crease: 'lo' }));
	const bell = (x0: number, x1: number) => S(turned(E, bellProfile(x0, x1), 72), { tone: 'hi', crease: 'lo', inner: channels(x0 + 0.4, x1) });
	const hoop = (x0: number, x1: number, h: number) => {
		const r0 = bellR(x0) + h;
		const r1 = bellR(x1) + h;
		return S(turned(E, [[x0, bellR(x0) + 0.4], [x0 + 0.6, r0], [x1 - 0.6, r1], [x1, bellR(x1) + 0.4]], 72), { tone: 'mid' });
	};
	out.push(bell(THROAT_X, RINGS.stiffener[0]), hoop(RINGS.stiffener[0], RINGS.stiffener[1], 1.8));
	out.push(bell(RINGS.stiffener[1], RINGS.manifold[0]), hoop(RINGS.manifold[0], RINGS.manifold[1], 4.2) + rimBolts(E, (RINGS.manifold[0] + RINGS.manifold[1]) / 2, bellR(85) + 4.3, 36));
	// Last band to the lip; the lip is open, so its end cap is the hot interior.
	out.push(S(turned(E, bellProfile(RINGS.manifold[1], EXIT_X, 2), 72, true), { tone: 'hi', crease: 'lo', inner: channels(RINGS.manifold[1] + 0.4, EXIT_X - 0.6) }));
	out.push(`<path class="rk-interior" d="${lipPath()}"/>`);
	out.push(`<clipPath id="rk-lip"><path d="${lipPath(0.985)}"/></clipPath><g clip-path="url(#rk-lip)"><path class="rk-glow" d="${lipPath(0.62, THROAT_X + 30)}"/></g>`);
	out.push(L(arcInside(), { tone: 'lo' }));
	return out.join('');
}

/** The lip ellipse (or a smaller one, for the glow deep in the throat). */
function lipPath(scale = 1, x = EXIT_X): string {
	const E = ENGINE();
	return k.pathOf(Array.from({ length: 72 }, (_, j) => at(onRing(E, x, EXIT_R * scale, (j / 72) * TAU))), true);
}
/** The back of the bell's inside seen through the lip: the throat ring, as an arc. */
function arcInside(): string {
	const E = ENGINE();
	const c = backOf(E);
	return k.pathOf(Array.from({ length: 33 }, (_, i) => at(onRing(E, THROAT_X + 2, THROAT_R + 0.6, c - Math.PI / 2 + (Math.PI * i) / 32))));
}

// ---- turbopump, preburner and lines -----------------------------------------------

const SECTIONS = {
	ox: { s0: -116, s1: -88, R: 19 },
	brg1: { s0: -88, s1: -81, R: 11 },
	turbine: { s0: -81, s1: -53, R: 25 },
	brg2: { s0: -53, s1: -46, R: 11 },
	fuel: { s0: -46, s1: -16, R: 18 }
} as const;

function preburner(): string {
	const F = fz([PB.x, PB.y, 0]);
	const out: string[] = [];
	out.push(S(turned(F, [[PB.z0 - 3, PB.r + 2], [PB.z0, PB.r + 2]], 48), { tone: 'mid' }));
	out.push(S(turned(F, [[PB.z0, PB.r], [PB.z1, PB.r]], 56), { tone: 'hi', crease: 'lo', className: 'rk-hot', inner: L(k.sideArc(PB.x, PB.y, PB.r, PB.z0 + 14, P, 24) + k.sideArc(PB.x, PB.y, PB.r, PB.z0 + 30, P, 24), { tone: 'faint' }) }));
	out.push(S(turned(F, [[PB.z1, PB.r + 1.6], [PB.z1 + 2.6, PB.r + 1.6]], 48), { tone: 'mid' }));
	out.push(S(turned(F, [[PB.z1 + 2.6, PB.r], [PB.z1 + 6, PB.r * 0.9], [PB.z1 + 9, PB.r * 0.66], [PB.z1 + 11, PB.r * 0.35]], 56), { tone: 'hi', crease: 'lo', className: 'rk-hot' }));
	// Igniter: a plug on a boss at the top of the dome.
	out.push(S(k.cylinder(PB.x, PB.y, 3.4, PB.z1 + 11, 3, P, 24), { tone: 'mid' }));
	out.push(S(k.cylinder(PB.x, PB.y, 2, PB.z1 + 14, 4, P, 20, 0.3), { tone: 'mid' }));
	out.push(L(k.knurl(PB.x, PB.y, 3.4, PB.z1 + 11, PB.z1 + 14, 16, P), { tone: 'lo' }));
	out.push(D([at([PB.x, PB.y, PB.z1 + 18])], { size: 0.55, tone: 'hi' }));
	return out.join('');
}

/** The lines behind the turbopump, back to front. */
function backLines(): string {
	const R = SECTIONS;
	const out: string[] = [];
	// Fuel tank to the fuel pump: out of the tank, up through the main fuel valve, along the back, in behind the pump.
	const fuelRoute: Point3[] = [[TANK.x + TANK.r, FUEL_Y, 22], [-184, FUEL_Y, 22], [-184, FUEL_Y, 138], [-38, FUEL_Y, 138], [-38, -R.fuel.R * 0.8, 138]];
	out.push(pipe(fuelRoute, 4, 'fuel', 'fuel-feed'));
	out.push(valve([-184, FUEL_Y, 80], [0, 0, 1], 4, [1, 0, 0], 'fuel'));
	out.push(preburner());
	// Hot gas from the preburner into the back of the turbine.
	out.push(pipe([[PB.x, PB.y + PB.r - 0.5, 156], [PB.x, -R.turbine.R + 1, 156]], 6, 'hot', 'preburner-gas'));
	// Oxygen and a little kerosene into the preburner, from ports on the back of each pump.
	out.push(pipe([[-100, -R.ox.R + 0.5, 150], [-100, PB.y, 150], [PB.x - PB.r + 0.5, PB.y, 150]], 3, 'ox', 'preburner-ox'));
	out.push(pipe([[-28, -R.fuel.R + 0.5, 150], [-28, PB.y, 150], [PB.x + PB.r - 0.5, PB.y, 150]], 2.4, 'fuel', 'preburner-fuel'));
	// Main fuel: down from the fuel pump, back, along behind the chamber to the nozzle's coolant manifold.
	const mx = (RINGS.manifold[0] + RINGS.manifold[1]) / 2;
	const mr = bellR(mx) + 4.2;
	const my = -28;
	out.push(pipe([[-24, 0, ZT - R.fuel.R + 0.5], [-24, 0, 120], [-24, my, 120], [mx, my, 120], [mx, my, ZE + Math.sqrt(mr * mr - my * my) - 0.5]], 4, 'fuel', 'coolant'));
	return out.join('');
}

/** Oxygen tank to the oxygen pump's inlet, over the pylon. */
function oxFeed(): string {
	const route: Point3[] = [[TANK.x + TANK.r, OX_Y, 22], [-172, OX_Y, 22], [-172, OX_Y, ZT], [-172, 0, ZT], [SECTIONS.ox.s0 - 2, 0, ZT]];
	return pipe(route, 4.4, 'ox', 'ox-feed') + valve([-172, OX_Y, 80], [0, 0, 1], 4.4, [1, 0, 0], 'ox');
}

/** Hot oxygen-rich gas from the turbine down into the injector dome. */
function hotDuct(): string {
	return pipe([[-77, 0, ZT - SECTIONS.turbine.R + 0.5], [-77, 0, ZE + 16.6]], 6, 'hot', 'turbine-exhaust');
}

/** The sense line from the chamber tap to the pressure gauge on its post. */
function gauge(): string {
	const E = ENGINE();
	const out: string[] = [];
	const tap = onRing(E, -40, 21.4, Math.PI * -0.3);
	out.push(pipe([tap, [tap[0], tap[1], GAUGE.z], [tap[0], GAUGE.y - 4.6, GAUGE.z]], 1.2, null, undefined, [false, true]));
	const post = { x: GAUGE.x - 3, y: GAUGE.y - 3, w: 6, d: 6, r: 1.5 };
	out.push(S(k.slabOf({ x: GAUGE.x - 7, y: GAUGE.y - 7, w: 14, d: 14, r: 2 }, 0, 2, P, 4, 0.4), { tone: 'mid' }));
	out.push(S(k.slabOf(post, 2, GAUGE.z - GAUGE.r - 2, P, 4), { tone: 'mid', crease: 'none' }));
	const F = k.axisFrame([GAUGE.x, GAUGE.y - 3, GAUGE.z], 'y');
	out.push(S(k.prismOf(F, k.circlePolygon(GAUGE.r, 48), 0, 4.4, P), { tone: 'mid' }));
	out.push(S(k.prismOf(F, k.circlePolygon(GAUGE.r - 1.4, 48), 4.4, 4.8, P), { tone: 'hi', crease: 'none' }));
	const y = GAUGE.y + 1.8;
	const ringR = GAUGE.r - 3;
	const sweep = (135 * Math.PI) / 180;
	const onDial = (r: number, a: number): Point3 => [GAUGE.x + Math.sin(a) * r, y, GAUGE.z + Math.cos(a) * r];
	out.push(L(k.pathOf(Array.from({ length: 49 }, (_, i) => at(onDial(ringR, -sweep + (i / 48) * sweep * 2)))), { tone: 'lo' }));
	const minor: string[] = [];
	const major: string[] = [];
	for (let i = 0; i <= 20; i++) {
		const a = -sweep + (i / 20) * sweep * 2;
		(i % 5 === 0 ? major : minor).push(k.segment(onDial(ringR, a), onDial(ringR - (i % 5 === 0 ? 2.2 : 1.2), a), P));
	}
	out.push(L(minor.join(''), { tone: 'lo' }), L(major.join(''), { tone: 'mid' }));
	const [ux, uy] = k.sub3([...at([1, 0, 0]), 0] as Point3, [...at([0, 0, 0]), 0] as Point3);
	const [vx, vy] = k.sub3([...at([0, 0, -1]), 0] as Point3, [...at([0, 0, 0]), 0] as Point3);
	for (const [n, label] of [[0, '0'], [100, '100'], [200, '200']] as const) {
		const [ox, oy] = at(onDial(ringR - 4.4, gaugeAngle(n)));
		out.push(k.faceTextSvg(`matrix(${ux.toFixed(4)} ${uy.toFixed(4)} ${vx.toFixed(4)} ${vy.toFixed(4)} ${ox.toFixed(2)} ${(oy + vy * 0.7).toFixed(2)})`, label, { size: 1.8, tone: 'lo', anchor: 'middle' }));
	}
	out.push(`<path class="iso-line rk-needle" data-tone="hi" data-free="end" data-needle="" style="stroke-width:1"/>`);
	out.push(D([at([GAUGE.x, y, GAUGE.z])], { size: 0.9, tone: 'hi' }));
	return out.join('');
}

const gaugeAngle = (bar: number) => {
	const sweep = (135 * Math.PI) / 180;
	return -sweep + (Math.min(200, Math.max(0, bar)) / 200) * sweep * 2;
};
function needlePath(bar: number): string {
	const y = GAUGE.y + 1.8;
	const a = gaugeAngle(bar);
	const on = (r: number, b: number): Point3 => [GAUGE.x + Math.sin(b) * r, y, GAUGE.z + Math.cos(b) * r];
	return k.segment(on(1.4, a + Math.PI), on(GAUGE.r - 3.6, a), P);
}

// ---- the rotor (rebuilt each frame) --------------------------------------------------

/** Paths of thin surfaces split by which half of the axis they sit in. */
interface Sheet {
	back: string[][];
	front: string[][];
	edgeBack: string[];
	edgeFront: string[];
}
const sheet = (): Sheet => ({ back: [[], [], [], [], []], front: [[], [], [], [], []], edgeBack: [], edgeFront: [] });
const paint = (b: string[][]) => b.map((list, i) => (list.length ? (i === 4 ? `<path class="iso-top" d="${list.join('')}"/>` : `<path class="iso-shade" data-shade="${i}" d="${list.join('')}"/>`) : '')).join('');

/** An inducer: three helical blades on a hub from s0 to s1, turned to `theta`. */
function inducer(F: Frame, s0: number, s1: number, hub: number, tip: number, turns: number, theta: number, out: Sheet) {
	const w = cutNormal(F);
	const M = 16;
	for (let b = 0; b < 3; b++) {
		const phiAt = (s: number) => theta + (b * TAU) / 3 + (turns * TAU * (s - s0)) / (s1 - s0);
		// Each blade's outline, closed, one per half it passes through: tip helix out, hub helix back.
		let run: Array<[Flat, Flat]> = [];
		let side: boolean | null = null;
		const flush = () => {
			if (run.length > 1) (side ? out.edgeFront : out.edgeBack).push(k.pathOf([...run.map((r) => r[0]), ...[...run].reverse().map((r) => r[1])], true));
		};
		for (let i = 0; i < M; i++) {
			const sa = s0 + ((s1 - s0) * i) / M;
			const sb = s0 + ((s1 - s0) * (i + 1)) / M;
			const pa = phiAt(sa);
			const pb = phiAt(sb);
			const q = [onRing(F, sa, hub, pa), onRing(F, sa, tip, pa), onRing(F, sb, tip, pb), onRing(F, sb, hub, pb)];
			let n = k.unit3(k.cross3(k.sub3(q[2]!, q[0]!), k.sub3(q[1]!, q[3]!)));
			if (k.dot3(n, V) < 0) n = k.mul3(n, -1);
			const front = k.dot3(radial(F, (pa + pb) / 2), w) > 0;
			(front ? out.front : out.back)[k.bandOf(k.dot3(n, LIGHT))]!.push(k.pathOf(q.map(at), true));
			if (side !== null && front !== side) {
				flush();
				run = [run[run.length - 1]!];
			}
			if (!run.length) run.push([at(q[1]!), at(q[0]!)]);
			run.push([at(q[2]!), at(q[3]!)]);
			side = front;
		}
		flush();
	}
}

/** A turbine's blade row: thin radial blades round the rim of a disc, turned to `theta`. */
function bladeRow(F: Frame, s0: number, s1: number, r0: number, r1: number, count: number, theta: number, out: Sheet) {
	const w = cutNormal(F);
	for (let j = 0; j < count; j++) {
		const phi = theta + (j / count) * TAU;
		const lean = 0.18; // blades are twisted a little across the flow
		const q = [onRing(F, s0, r0, phi - lean), onRing(F, s0, r1, phi - lean), onRing(F, s1, r1, phi + lean), onRing(F, s1, r0, phi + lean)];
		let n = k.unit3(k.cross3(k.sub3(q[2]!, q[0]!), k.sub3(q[1]!, q[3]!)));
		if (k.dot3(n, V) < 0) n = k.mul3(n, -1);
		const front = k.dot3(radial(F, phi), w) > 0;
		(front ? out.front : out.back)[k.bandOf(k.dot3(n, LIGHT))]!.push(k.pathOf(q.map(at), true));
		(front ? out.edgeFront : out.edgeBack).push(k.pathOf(q.map(at), true));
	}
}

/** Vane exits round an impeller's rim: short marks across the rim, fading toward the limbs. */
function vaneMarks(F: Frame, s0: number, s1: number, r: number, count: number, theta: number): string {
	const list: k.Faded[] = [];
	for (let j = 0; j < count; j++) {
		const phi = theta + (j / count) * TAU;
		const f = facing(radial(F, phi));
		if (f < 0.12) continue;
		list.push([k.pathOf([at(onRing(F, s0, r, phi)), at(onRing(F, s1, r, phi - 0.35))]), Math.min(1, (f - 0.12) / 0.3)]);
	}
	return k.fadedSvg(list, { tone: 'mid' });
}

const prevOf = (id: keyof typeof SECTIONS) => {
	const ids = Object.keys(SECTIONS) as Array<keyof typeof SECTIONS>;
	return ids[Math.max(0, ids.indexOf(id) - 1)]!;
};

function rotorSvg(theta: number): string {
	const F = PUMP();
	const T = SECTIONS;
	const parts: string[] = [];
	const section = (id: keyof typeof SECTIONS, wall: { s0?: boolean; s1?: boolean }, inside: () => string) => {
		const s = T[id];
		const flange = id === 'ox' ? '' : cutShell(F, s.s0 - 1.4, s.s0 + 1.4, Math.max(s.R, T[prevOf(id)].R) + 2.6, 2.6, { s1: true }, Math.min(s.R, T[prevOf(id)].R) - 3);
		parts.push(`<g data-part="${id}">${flange}${cutShell(F, s.s0, s.s1, s.R, 3, wall)}${inside()}</g>`);
	};
	const shaft = (s0: number, s1: number) => S(turned(F, [[s0, 3.2], [s1, 3.2]], 32), { tone: 'mid', crease: 'none' });
	const sheetSvg = (sh: Sheet, middle: string) =>
		`<g class="rk-sheet">${paint(sh.back)}${L(sh.edgeBack.join(''), { tone: 'mid' })}</g>${middle}<g class="rk-sheet">${paint(sh.front)}${L(sh.edgeFront.join(''), { tone: 'hi' })}</g>`;
	// Oxygen pump: inducer at the inlet, then the impeller.
	section('ox', { s0: true, s1: true }, () => {
		const sh = sheet();
		inducer(F, -114, -102, 3.6, 13, 0.45, theta, sh);
		const hub = S(turned(F, [[-115, 1.5], [-113, 3.6], [-103, 3.6]], 32), { tone: 'mid', crease: 'none' });
		const wheel = S(turned(F, [[-99, 5], [-98, 11], [-96.6, 15], [-92, 15], [-92, 5]], 64), { tone: 'mid' }) + vaneMarks(F, -96.2, -92.4, 15, 14, theta);
		return shaft(-103, -88) + sheetSvg(sh, hub) + wheel;
	});
	section('brg1', { s1: true }, () => shaft(-88, -81) + S(turned(F, [[-86, 6], [-83, 6]], 40), { tone: 'mid' }));
	section('turbine', { s1: true }, () => {
		const sh = sheet();
		bladeRow(F, -70, -64, 15.5, 20, 24, theta, sh);
		const disc = S(turned(F, [[-72, 4], [-70.5, 15.5], [-63.5, 15.5], [-62, 4]], 72), { tone: 'mid', lit: true });
		// Stator: a fixed nozzle ring ahead of the blades.
		const stator = S(turned(F, [[-76, 21.8], [-73, 21.8]], 64), { tone: 'mid' });
		return shaft(-81, -53) + `<g class="rk-sheet">${paint(sh.back)}${L(sh.edgeBack.join(''), { tone: 'lo' })}</g>` + stator + disc + `<g class="rk-sheet">${paint(sh.front)}${L(sh.edgeFront.join(''), { tone: 'mid' })}</g>`;
	});
	section('brg2', { s1: true }, () => shaft(-53, -46) + S(turned(F, [[-51, 6], [-48, 6]], 40), { tone: 'mid' }));
	// Fuel pump: inlet at its left, inducer, then the impeller; a nut on the shaft end.
	section('fuel', { s1: true }, () => {
		const sh = sheet();
		inducer(F, -44, -32, 3.6, 12, -0.45, theta, sh);
		const wheel = S(turned(F, [[-29, 5], [-28, 10], [-26.6, 14], [-22, 14], [-22, 5]], 64), { tone: 'mid' }) + vaneMarks(F, -26.2, -22.4, 14, 12, theta);
		return shaft(-46, -18) + sheetSvg(sh, S(turned(F, [[-44, 3.6], [-33, 3.6]], 32), { tone: 'mid', crease: 'none' })) + wheel;
	});
	return parts.join('');
}

// ---- the plume (rebuilt each frame) -------------------------------------------------

/** The exhaust: a soft envelope, a brighter core and a row of shock diamonds, along +x from the lip. */
function plumeSvg(params: EngineParams, t: number): string {
	const E = ENGINE();
	const pl = plumeOf(params);
	const D0 = EXIT_R * 2;
	const flick = (f: number, a: number) => 1 + a * (Math.sin(t * f) * 0.6 + Math.sin(t * f * 2.31 + 1.3) * 0.4);
	const len = pl.length * D0 * flick(9, 0.025);
	const ringPts = (x: number, r: number, n = 40) => Array.from({ length: n }, (_, j) => at(onRing(E, x, r, (j / n) * TAU)));
	const body = (len: number, r0: number, r1: number, bulge: number) => {
		const pts: Flat[] = [];
		for (let i = 0; i <= 10; i++) {
			const u = i / 10;
			const r = r0 + (r1 - r0) * u + bulge * Math.sin(Math.PI * u);
			pts.push(...ringPts(EXIT_X + len * u, Math.max(1, r)));
		}
		return k.pathOf(k.hullOf(pts), true);
	};
	const [ax, ay] = at([EXIT_X, 0, ZE]);
	const [bx, by] = at([EXIT_X + len, 0, ZE]);
	const grad = (id: string, stops: Array<[number, string, number]>) =>
		`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}">${stops.map(([o, c, a]) => `<stop offset="${o}" style="stop-color:var(${c})" stop-opacity="${a.toFixed(3)}"/>`).join('')}</linearGradient>`;
	const s = pl.strength;
	const defs = `<defs>${grad('rk-plume-outer', [[0, '--rk-flame', 0.18 * s], [0.12, '--rk-flame', 0.42 * s], [0.5, '--rk-flame', 0.26 * s], [1, '--rk-flame', 0]])}${grad('rk-plume-core', [[0, '--rk-core', 0.5 * s], [0.15, '--rk-core', 0.9 * s], [0.6, '--rk-core', 0.45 * s], [1, '--rk-core', 0]])}</defs>`;
	const outer = `<path class="rk-plume" fill="url(#rk-plume-outer)" d="${body(len, EXIT_R * 0.98, EXIT_R * 1.55, EXIT_R * 0.12)}"/>`;
	const core = `<path class="rk-plume-core" fill="url(#rk-plume-core)" d="${body(len * 0.72, EXIT_R * 0.8, EXIT_R * 0.35, EXIT_R * 0.08)}"/>`;
	// Shock diamonds: double cones along the axis, fading with distance.
	const step = pl.spacing * D0;
	const diamonds: string[] = [];
	for (let i = 0; i < 6; i++) {
		const x0 = EXIT_X + step * (i + 0.35);
		if (x0 + step * 0.75 > EXIT_X + len * 0.85) break;
		const r = EXIT_R * (0.2 - i * 0.022) * flick(13 + i, 0.05);
		const pts = [at([x0, 0, ZE]), at([x0 + step * 0.75, 0, ZE]), ...ringPts(x0 + step * 0.32, r, 24)];
		const a = (0.9 - i * 0.15) * s;
		diamonds.push(`<path class="rk-diamond" style="opacity:${Math.max(0, a).toFixed(2)}" d="${k.pathOf(k.hullOf(pts), true)}"/>`);
	}
	return `<g class="rk-plume-group" style="--rk-soot:${(pl.soot * 100).toFixed(0)}%">${defs}${outer}${core}${diamonds.join('')}</g>`;
}

// ---- assembly ---------------------------------------------------------------------

function ready() {
	if (P) return;
	const pts: Point3[] = [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [TANK.x, OX_Y + TANK.r, TANK.top + 22], [TANK.x, FUEL_Y, TANK.top + 22], [PB.x, PB.y, PB.z1 + 20], [-60, 0, ZT + 30], [EXIT_X + 160, 0, ZE + EXIT_R * 1.7], [EXIT_X + 160, 0, ZE - EXIT_R * 1.7]];
	P = k.fitProjection(pts, WIDTH, HEIGHT, { pad: 14, azimuth: 64 });
	V = k.viewOf(P);
	LIGHT = k.lightOf(P);
	const back = [bench(), tank(FUEL_Y, 'fuel'), backLines(), pylon(), tank(OX_Y, 'ox'), oxFeed(), thrustMount(), engineBody(), hotDuct()].join('');
	STATIC = { back, front: gauge() };
}

export const ENGINE_CSS = `
.iso[data-figure-host="rocket-engine"]{
  --rk-ox:#3e63dd;--rk-fuel:#c27c0e;--rk-hot:#e5484d;--rk-tint:8%;--rk-cavity:#000000;--rk-depth:16%;
  --rk-flame:#f08c00;--rk-core:#ffb224;--rk-diamond:#fff1c2;--rk-glow:#ff8b3e;--rk-interior:#5a4a40
}
.iso[data-theme="dark"][data-figure-host="rocket-engine"]{
  --rk-ox:#7b9bff;--rk-fuel:#f0b54a;--rk-hot:#ff7b72;--rk-tint:16%;--rk-depth:38%;
  --rk-flame:#ff8a2a;--rk-core:#ffd27a;--rk-diamond:#fff6dc;--rk-glow:#ff9a4d;--rk-interior:#120c09
}
.rk-ox{--rk-c:var(--rk-ox)}
.rk-fuel{--rk-c:var(--rk-fuel)}
.rk-hot{--rk-c:var(--rk-hot)}
${[0, 1, 2, 3].map((n) => `:is(.rk-ox,.rk-fuel,.rk-hot)>.iso-shade[data-shade="${n}"]{fill:color-mix(in srgb,var(--rk-c) calc(var(--rk-tint) * ${(0.7 + n * 0.1).toFixed(1)}),var(--anatomy-shade-${n}));stroke:none}
:is(.rk-ox,.rk-fuel,.rk-hot)[data-seamless]>.iso-shade[data-shade="${n}"]{stroke:color-mix(in srgb,var(--rk-c) calc(var(--rk-tint) * ${(0.7 + n * 0.1).toFixed(1)}),var(--anatomy-shade-${n}))}
.rk-cut>.iso-shade[data-shade="${n}"]{fill:color-mix(in srgb,var(--rk-cavity) var(--rk-depth),var(--anatomy-shade-${n}))}`).join('\n')}
:is(.rk-ox,.rk-fuel,.rk-hot)>.iso-top{fill:color-mix(in srgb,var(--rk-c) var(--rk-tint),var(--anatomy-top))}
:is(.rk-ox,.rk-fuel,.rk-hot)[data-seamless]>.iso-top{stroke:color-mix(in srgb,var(--rk-c) var(--rk-tint),var(--anatomy-top))}
.rk-cut>.iso-top{fill:color-mix(in srgb,var(--rk-cavity) var(--rk-depth),var(--anatomy-top))}
.rk-cutface{fill:var(--anatomy-top);stroke:none}
.rk-flow{stroke-dasharray:2 5;stroke-width:1;stroke-opacity:.85}
.rk-flow-ox{stroke:var(--rk-ox)}
.rk-flow-fuel{stroke:var(--rk-fuel)}
.rk-flow-hot{stroke:var(--rk-hot)}
.rk-channel{stroke-opacity:.8}
.rk-interior{fill:var(--rk-interior);stroke:none}
.rk-glow{fill:var(--rk-glow);stroke:none;filter:blur(4px);opacity:.9}
.rk-plume{filter:blur(4px)}
.rk-plume-core{filter:blur(2.5px)}
.rk-diamond{fill:var(--rk-diamond);filter:blur(2.2px)}
.iso-halo.rk-shadow{filter:blur(2.5px);opacity:calc(var(--anatomy-halo-opacity) * .5);transform:none}
`;

export const LABEL = 'A liquid-fuel rocket engine firing on a test stand: two propellant tanks, a cut-open turbopump on top, the preburner, injector, combustion chamber and bell nozzle, hung from a load cell through its gimbal.';

export interface DriveState {
	/** Shaft angle, radians. */
	theta: number;
	/** Seconds, for the plume's flicker. */
	t: number;
}

export const STILL: DriveState = { theta: 0.5, t: 0.4 };

/** The whole figure as an SVG string, framed to everything it draws. */
export function engineSvg(params: EngineParams = clampParams(), drive: Partial<DriveState> = {}, standalone: k.Theme | false = false): string {
	return framed(rawSvg(params, drive, standalone), frame());
}

function rawSvg(params: EngineParams, drive: Partial<DriveState>, standalone: k.Theme | false): string {
	ready();
	const d = { ...STILL, ...drive };
	const body =
		STATIC.back +
		`<g data-item="rotor">${rotorSvg(d.theta)}</g>` +
		STATIC.front.replace('data-needle=""', `data-needle="" d="${needlePath(stateOf(params).chamberBar)}"`) +
		`<g data-item="plume">${plumeSvg(params, d.t)}</g>`;
	const svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL, body, standalone });
	return standalone ? svg.replace('</style>', `${PAPER_CSS}${ENGINE_CSS}</style>`).replace('class="iso-svg iso"', 'class="iso-svg iso" data-figure-host="rocket-engine"') : svg;
}

let FRAME: FrameBox | null = null;
/** The viewBox: full and low throttle, a couple of shaft angles, plus the pins. */
function frame(): FrameBox {
	if (FRAME) return FRAME;
	const svgs = [rawSvg(clampParams({ throttle: 100, mixture: 2.2 }), { theta: 0, t: 0 }, false), rawSvg(clampParams({ throttle: 40 }), { theta: 1, t: 0.3 }, false)];
	// The plume's flicker reaches a few percent past its rest length.
	svgs.push(`<path d="M${at([EXIT_X + 1.06 * plumeOf(clampParams({ throttle: 100 })).length * EXIT_R * 2, 0, ZE]).join(' ')}"/>`);
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
	const E = ENGINE();
	return [
		['oxidiser-tank', 'Oxidiser tank', [TANK.x + TANK.r * 0.7, OX_Y + TANK.r * 0.7, 110]],
		['fuel-tank', 'Fuel tank', [TANK.x, FUEL_Y, TANK.top + 16]],
		['turbopump', 'Turbopump', [-100, 0, ZT + 12]],
		['turbine', 'Turbine', [-67, 6, ZT + 18]],
		['oxidiser-pump', 'Oxidiser pump', [-95, 4, ZT - 14]],
		['fuel-pump', 'Fuel pump', [-25, 4, ZT - 13]],
		['preburner', 'Preburner', [PB.x + PB.r * 0.5, PB.y + PB.r, PB.z1 + 4]],
		['injector', 'Injector plate', onRing(E, -69.3, 24.2, 1.1)],
		['combustion-chamber', 'Combustion chamber', onRing(E, -20, 19, 0.9)],
		['throat', 'Throat', onRing(E, THROAT_X, THROAT_R, 1.2)],
		['nozzle', 'Nozzle', onRing(E, 65, bellR(65), 0.7)],
		['cooling-channels', 'Cooling channels', onRing(E, 30, bellR(30), 0.2)],
		['gimbal', 'Gimbal', [-107, 15.5, ZE]],
		['load-cell', 'Load cell', [-124, 0, ZE + 12.6]],
		['plume', 'Exhaust plume', [EXIT_X + 90, 0, ZE + 20]],
		['pressure-gauge', 'Chamber pressure gauge', [GAUGE.x, GAUGE.y + 2, GAUGE.z + GAUGE.r]]
	];
}

// ---- live mount -------------------------------------------------------------------

export interface MountOptions {
	theme?: k.Theme;
	params?: Partial<EngineParams>;
	onReadout?: (values: Record<string, string>) => void;
}

export interface FigureHandle {
	update(params: Partial<Record<string, number>>): void;
	setTheme(theme: k.Theme): void;
	/** Park the engine `t` seconds into the run and stop the loop (captures, tests). */
	seek(t: number): void;
	destroy(): void;
}

const STYLE_ID = 'ripple-iso-rocket-css';
const FLOW_PX = 0.08; // dash px a second per kg/s

export function mount(el: HTMLElement, { theme = 'dark', params: initial, onReadout }: MountOptions = {}): FigureHandle {
	const doc = el.ownerDocument;
	if (!doc.getElementById(STYLE_ID)) {
		const style = doc.createElement('style');
		style.id = STYLE_ID;
		style.textContent = k.ISO_CSS + PAPER_CSS + ENGINE_CSS;
		doc.head.appendChild(style);
	}
	let params = clampParams(initial);
	const svg = doc.importNode(new DOMParser().parseFromString(engineSvg(params), 'image/svg+xml').documentElement, true) as unknown as SVGSVGElement;
	el.classList.add('iso');
	el.dataset.figureHost = 'rocket-engine';
	el.dataset.theme = theme;
	el.replaceChildren(svg);
	const rotor = svg.querySelector<SVGGElement>('[data-item="rotor"]')!;
	const plume = svg.querySelector<SVGGElement>('[data-item="plume"]')!;
	const needle = svg.querySelector<SVGPathElement>('[data-needle]');
	const flows = [...svg.querySelectorAll<SVGPathElement>('[data-flow-id]')];
	const offsets = new Map<SVGPathElement, number>();

	const win = doc.defaultView;
	const still = win?.matchMedia?.('(prefers-reduced-motion: reduce)');
	const drive: DriveState = { ...STILL };
	let parked = false;
	let lastKey = '';

	const rateOf = (id: string) => {
		const s = stateOf(params);
		if (id === 'ox-feed' || id === 'preburner-ox') return s.flow.oxidiser;
		if (id === 'fuel-feed') return s.flow.fuel;
		if (id === 'preburner-fuel') return s.flow.preburnerFuel * 6;
		if (id === 'coolant') return s.flow.fuel - s.flow.preburnerFuel;
		return s.flow.oxidiser + s.flow.preburnerFuel;
	};

	function draw(dt: number) {
		rotor.innerHTML = rotorSvg(drive.theta);
		plume.innerHTML = plumeSvg(params, drive.t);
		for (const path of flows) {
			const next = ((offsets.get(path) ?? 0) - rateOf(path.dataset.flowId!) * FLOW_PX * dt) % 7;
			offsets.set(path, next);
			path.setAttribute('stroke-dashoffset', next.toFixed(2));
		}
		const readouts = readoutsOf(params);
		const key = JSON.stringify(readouts);
		if (key !== lastKey) {
			lastKey = key;
			needle?.setAttribute('d', needlePath(stateOf(params).chamberBar));
			onReadout?.(readouts);
			svg.setAttribute('aria-label', describe(params));
		}
	}

	function advance(dt: number) {
		drive.theta += shaftSpeedOf(params) * dt;
		drive.t += dt;
	}

	let frameId = 0;
	let last = 0;
	let visible = true;
	const loop = (now: number) => {
		const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
		last = now;
		advance(dt);
		draw(dt);
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
		if (still?.matches) Object.assign(drive, STILL);
		draw(0);
		sync();
	};
	still?.addEventListener?.('change', onStill);
	draw(0);
	run();

	return {
		update(next) {
			params = clampParams({ ...params, ...next });
			draw(0);
		},
		setTheme(next) {
			el.dataset.theme = next;
		},
		seek(time) {
			parked = true;
			stop();
			drive.theta = STILL.theta + shaftSpeedOf(params) * time;
			drive.t = STILL.t + time;
			draw(0);
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
