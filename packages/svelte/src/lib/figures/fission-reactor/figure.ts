// figures/fission-reactor/figure.ts: a pressurised water reactor plant drawn
// the Anatomy way, as a teaching model on a bench, with @ripple-ui/core/iso.
// World: x along the bench (left, the containment; right, the turbine hall and
// the cooling tower), y toward the viewer, z up; not to scale.
//
// Inside a cut-away containment wall: the reactor vessel (cut open over the
// core so the fuel assemblies and the control rod clusters show; the rods slide
// in from the drive housings on the head), the steam generator, the reactor
// coolant pump and the pressuriser, joined by the hot leg, the crossover leg,
// the cold leg and the surge line. Outside: the main steam line to the HP and
// LP turbines and the generator on one shaft, the condenser under the LP, the
// feedwater pump and line back to the steam generator, the circulating water
// pipes to a fan cooling tower, and the bus ducts to the main transformer.
// Every vessel cut is a half shell whose open side faces the camera, so its
// outer skin is never in view and one painter's order draws it.
//
// `reactorSvg()` is pure (strings only). `mount()` keeps one <g data-item> per
// part; per frame it rewrites only the core (when the rods move) and the turning
// marks, and slides the flow dashes. Look: the paper ramp, one lit part (the
// control rods), faint warm and cool tints on the primary and cooling pipes.
// No DOM or work at module top level.

import * as k from '@ripple-ui/core/iso';
import type { Flat, Point3, SolidPaths } from '@ripple-ui/core/iso';
import { PAPER_CSS } from '../paper.js';
import { frameOf, framed, percentIn, type FrameBox } from '../frame.js';
import { clampParams, describe, readoutsOf, stateOf, type ReactorParams } from './model.js';

export const WIDTH = 640;
export const HEIGHT = 420;

const TAU = Math.PI * 2;
const PLATE = { x: -252, y: -112, w: 512, d: 206, r: 10 };
const PLATE_H = 10;
const FOOT_H = 5;
const C: Flat = [-140, -10]; // containment
const R: Flat = [-172, 22]; // reactor vessel
const G: Flat = [-100, -62]; // steam generator
const U: Flat = [-172, -62]; // reactor coolant pump
const Z: Flat = [-80, 12]; // pressuriser
const F: Flat = [40, -14]; // feedwater pump
const T: Flat = [218, -60]; // cooling tower fan
const SHAFT = { y: -62, z: 72 };
const LOOP_Z = 115; // hot and cold legs
const SG_Z = 119; // steam generator channel head centre
const PZ_Z = 136; // pressuriser bottom head centre
const PUMP_Z = 107; // pump casing bottom
const HEAD_Z = 134; // vessel head centre
const VR = 21; // vessel radius
const CORE = { plate: 43, fuel0: 45.5, fuel1: 72, top: 74.5, window: 108 };
const PITCH = 5.2;
const ROD_TRAVEL = 26;

let P = null as unknown as k.Projection;
let V: Point3 = [0, 0, 1];
let LIGHT: Point3 = [0, 0, 1];
let CA = 0;
let SA = 0;
let KS = 1; // screen units per world unit
let STATIC: Item[] = [];

const at = (p: Point3): Flat => k.iso(p, P);
const S = (paths: SolidPaths, style: k.SolidStyle = {}) => k.solidSvg(paths, style);
const L = (d: string, style: k.LineStyle = {}) => k.lineSvg(d, style);
const D = (points: Flat[], style: { size?: number; tone?: k.Tone } = {}) => k.dotsSvg(points, style);
/** Painter's key: depth of a footprint on the floor. */
const key = (p: Flat | Point3) => p[0] * CA + p[1] * SA;
const cyl = (c: Flat, r: number, z0: number, z1: number, steps = 40, bevel = 0) => k.cylinder(c[0], c[1], r, z0, z1 - z0, P, steps, bevel);
/** A round bar between two points. */
const rod = (a: Point3, b: Point3, r: number, steps = 24) => k.prismOf(k.frameAlong(a, k.sub3(b, a)), k.circlePolygon(r, steps), 0, k.len3(k.sub3(b, a)), P);

interface Item {
	id: string;
	key: number;
	svg: string;
}

// ---- shapes the kit does not have ---------------------------------------------

/** The back half of a ring in plan (the half away from the camera), outer arc then inner. */
function backHalf(c: Flat, r0: number, r1: number, steps = 48): Flat[] {
	const from = Math.atan2(SA, CA) + Math.PI / 2;
	const arc = (r: number) => Array.from({ length: steps + 1 }, (_, i) => [c[0] + r * Math.cos(from + (i / steps) * Math.PI), c[1] + r * Math.sin(from + (i / steps) * Math.PI)] as Flat);
	return [...arc(r1), ...arc(r0).reverse()];
}

/** A wall cut through its axis, open toward the camera: inner face, cut faces and top. */
const halfShell = (c: Flat, r0: number, r1: number, z0: number, z1: number) => k.extrude(backHalf(c, r0, r1), z0, z1 - z0, P, { convex: false });

/** The two inner corners of a half shell's cut, where the inside meets the cut faces. */
function cutCorners(c: Flat, r: number, z0: number, z1: number): string {
	const from = Math.atan2(SA, CA) + Math.PI / 2;
	return [from, from + Math.PI].map((a) => k.segment([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), z0], [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), z1], P)).join('');
}

/** An arc on the inside of a half shell at height z (a seam that ends on both cut faces). */
function innerArc(c: Flat, r: number, z: number, steps = 48): string {
	const from = Math.atan2(SA, CA) + Math.PI / 2;
	return k.pathOf(Array.from({ length: steps + 1 }, (_, i) => at([c[0] + r * Math.cos(from + (i / steps) * Math.PI), c[1] + r * Math.sin(from + (i / steps) * Math.PI), z])));
}

/** A cone frustum on a vertical axis (r0 at z0, r1 at z1). */
function frustum(c: Flat, r0: number, r1: number, z0: number, z1: number, steps = 48): SolidPaths {
	const buckets: string[][] = [[], [], [], [], []];
	const lo: Flat[] = [];
	const hi: Flat[] = [];
	for (let i = 0; i < steps; i++) {
		const a = (i / steps) * TAU;
		lo.push(at([c[0] + r0 * Math.cos(a), c[1] + r0 * Math.sin(a), z0]));
		hi.push(at([c[0] + r1 * Math.cos(a), c[1] + r1 * Math.sin(a), z1]));
	}
	for (let i = 0; i < steps; i++) {
		const a = ((i + 0.5) / steps) * TAU;
		const n = k.unit3([Math.cos(a) * (z1 - z0), Math.sin(a) * (z1 - z0), r0 - r1]);
		if (k.dot3(n, V) <= 1e-6) continue;
		const j = (i + 1) % steps;
		buckets[k.bandOf(k.dot3(n, LIGHT))]!.push(k.pathOf([lo[i]!, lo[j]!, hi[j]!, hi[i]!], true));
	}
	buckets[k.bandOf(LIGHT[2])]!.push(k.pathOf(hi, true));
	const hull = k.pathOf(k.hullOf([...lo, ...hi]), true);
	return { fill: hull, outline: hull, crease: '', top: buckets[4]!.join(''), shades: buckets.slice(0, 4).map((b) => b.join('')) };
}

let clipN = 0;
/** The top half of a ball (a vessel head): the sphere clipped above the front half of its equator. */
function dome(c: Point3, r: number, style: k.SolidStyle = {}): string {
	const from = Math.atan2(SA, CA) - Math.PI / 2;
	const arc = Array.from({ length: 33 }, (_, i) => at([c[0] + r * Math.cos(from + (i / 32) * Math.PI), c[1] + r * Math.sin(from + (i / 32) * Math.PI), c[2]]));
	const top = at(c)[1] - r * KS - 0.6;
	const id = `fr-dome-${clipN++}`;
	const clip = k.pathOf([...arc, [arc[arc.length - 1]![0], top], [arc[0]![0], top]], true);
	return `<clipPath id="${id}"><path d="${clip}"/></clipPath><g clip-path="url(#${id})">${S(k.sphereOf(c, r, P, 48), { crease: 'none', ...style })}</g>`;
}

/** A flange ring of bolt heads on a flat top at height z (all round: the face looks up). */
const boltCircle = (c: Flat, r: number, z: number, n: number) => D(Array.from({ length: n }, (_, i) => at([c[0] + r * Math.cos((i / n) * TAU), c[1] + r * Math.sin((i / n) * TAU), z])), { size: 0.45 });

/** Vertical lines on the side of a cylinder facing the camera, from z0 to z1, faded toward the limbs. */
function sideRibs(c: Flat, r: number, z0: number, z1: number, n: number): string {
	const face = Math.atan2(SA, CA);
	const list: k.Faded[] = [];
	for (let i = 0; i < n; i++) {
		const a = face - Math.PI / 2 + ((i + 0.5) / n) * Math.PI;
		const alpha = Math.min(1, Math.cos(a - face) / 0.45);
		list.push([k.segment([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), z0], [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), z1], P), alpha]);
	}
	return k.fadedSvg(list, { tone: 'lo' });
}

/** A seam round a cylinder along x (a casing band) at x, on the half facing the camera. */
function bandX(x: number, y: number, z: number, r: number, steps = 24): string {
	const pts: Flat[] = [];
	const face = Math.atan2(V[2], V[1]); // the side of the y,z circle facing the camera
	for (let i = 0; i <= steps; i++) {
		const a = face - Math.PI / 2 + (i / steps) * Math.PI; // limb to limb over the front
		pts.push(at([x, y + r * Math.cos(a), z + r * Math.sin(a)]));
	}
	return k.pathOf(pts);
}

// ---- pipes ---------------------------------------------------------------------

type FlowKind = 'primary' | 'steam' | 'feed' | 'water';

interface PipeOpts {
	cls?: string;
	flow?: FlowKind;
	tone?: k.LineTone;
	/** Painter's key per leg, replacing the leg's own (the legs that run under or over other parts). */
	keys?: Array<number | undefined>;
	elbowKeys?: Array<number | undefined>;
	/** Screen length of flow already run before this route, so dashes run on from the last route. */
	from?: number;
	/** Inset of each leg at an interior point, in radii (0 for a straight flanged joint). */
	pad?: number;
}

/** A pipe through `route` (straight legs, ball elbows at the bends); each leg and elbow is its own item. */
function pipe(id: string, route: Point3[], r: number, opts: PipeOpts = {}): { items: Item[]; length: number } {
	const items: Item[] = [];
	let run = opts.from ?? 0;
	for (let i = 0; i < route.length - 1; i++) {
		const a = route[i]!;
		const b = route[i + 1]!;
		const dir = k.sub3(b, a);
		const len = k.len3(dir);
		const axis = k.unit3(dir);
		const pad = r * (opts.pad ?? 0.6);
		const s0 = i === 0 ? 0 : pad;
		const s1 = len - (i === route.length - 2 ? 0 : pad);
		let svg = S(k.prismOf(k.frameAlong(a, dir), k.circlePolygon(r, 28), s0, s1, P), { tone: 'mid', crease: 'none', className: opts.cls });
		if (opts.flow) {
			const off = k.sub3(V, k.mul3(axis, k.dot3(V, axis)));
			const n = k.len3(off) > 1e-6 ? k.unit3(off) : ([0, 0, 1] as Point3);
			const p0 = at(k.add3(k.add3(a, k.mul3(axis, s0)), k.mul3(n, r * 0.62)));
			const p1 = at(k.add3(k.add3(a, k.mul3(axis, s1)), k.mul3(n, r * 0.62)));
			svg += `<path class="iso-line fr-flow" data-free="" data-tone="${opts.tone ?? 'lo'}" data-flow="${opts.flow}" data-at="${run.toFixed(1)}" d="${k.pathOf([p0, p1])}"/>`;
			run += Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + r * 1.2 * KS;
		}
		items.push({ id: `${id}-${i}`, key: opts.keys?.[i] ?? key(k.add3(a, k.mul3(dir, 0.5))), svg });
	}
	for (let i = 1; i < route.length - 1; i++) {
		const c = route[i]!;
		items.push({ id: `${id}-elbow-${i}`, key: opts.elbowKeys?.[i] ?? key(c) + 0.01, svg: S(k.sphereOf(c, r * 1.22, P, 40), { tone: 'mid', crease: 'none', className: opts.cls }) });
	}
	return { items, length: run };
}

/** A flange pair on a straight pipe along `axis` at `c` (two discs and a bolt row). */
function flange(c: Point3, axis: Point3, r: number, cls?: string): string {
	const F0 = k.frameAlong(c, axis);
	const out = [S(k.prismOf(F0, k.circlePolygon(r * 1.45, 32), -1.4, 0, P), { tone: 'mid', className: cls }), S(k.prismOf(F0, k.circlePolygon(r * 1.45, 32), 0, 1.4, P), { tone: 'mid', className: cls })];
	return out.join('');
}

// ---- bench and buildings --------------------------------------------------------

function bench(): string {
	const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
	const feet = [...k.corners(PLATE, 24)].sort((a, b) => key(a) - key(b));
	for (const [x, y] of feet) {
		out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: 'lo' }));
		out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: 'lo' }));
	}
	out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: 'lo', inner: L(k.sideSeam(PLATE, -PLATE_H + 3, P), { tone: 'faint' }) }));
	out.push(L(k.planOutline(k.insetPlan(PLATE, 6), 0, P), { tone: 'faint' }));
	const screws = k.corners(PLATE, 11);
	out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(''), { tone: 'lo' }));
	out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
	const strip = { x: -30, y: PLATE.y + PLATE.d - 15, w: 240, d: 8, r: 1 };
	out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: 'lo', crease: 'none' }));
	const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 5, 5, strip.y + 0.8, 0.6, [2.2, 4], P);
	out.push(L(ticks.minor, { tone: 'lo' }), L(ticks.major, { tone: 'mid' }));
	const label = { x: -245, y: PLATE.y + PLATE.d - 24, w: 46, d: 14, r: 1.2 };
	out.push(S(k.slabOf(label, 0, 1, P, 3, 0.3), { tone: 'mid' }));
	for (const [i, yy] of [3.6, 7, 10.4].entries()) out.push(L(k.lineOnTop([label.x + 0.4, label.y + yy], [label.x + label.w - (i ? 12 : 0.4), label.y + yy], 1, P), { tone: i === 0 ? 'lo' : 'faint', free: 'end' }));
	return out.join('');
}

function containment(): Item[] {
	const pad = S(k.cylinder(C[0], C[1], 96, 0, 4, P, 96, 0.8), { tone: 'lo', inner: L(k.sideArc(C[0], C[1], 96, 2, P, 64), { tone: 'faint' }) }) + L(k.ring(C[0], C[1], 91, 4, P, 96), { tone: 'faint' });
	const seams = [30, 62].map((z) => innerArc(C, 88, z)).join('');
	const wall = S(halfShell(C, 88, 92, 4, 96), { tone: 'mid', inner: L(seams, { tone: 'faint' }) + L(cutCorners(C, 88, 4, 96), { tone: 'lo' }) });
	return [
		{ id: 'containment-pad', key: -1e8, svg: pad },
		{ id: 'containment-wall', key: -1e8 + 1, svg: wall }
	];
}

// ---- the reactor vessel ----------------------------------------------------------

const RODDED = (i: number, j: number) => (i + j) % 2 === 0;
/** The 21 assembly spots: a 5 x 5 grid without its corners. */
function assemblies(): Array<[number, number]> {
	const out: Array<[number, number]> = [];
	for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (Math.abs(i) + Math.abs(j) < 4) out.push([i, j]);
	return out;
}

/** Fuel assemblies on the near side of the cut are left out, so the core reads. */
const shownAssemblies = () => assemblies().filter(([i, j]) => (i * CA + j * SA) * PITCH <= PITCH * 0.55).sort((a, b) => key(a) - key(b));

/** The core at a rod insertion (0 = out, 1 = in): assemblies back to front, each with its rod cluster. */
function coreSvg(insert: number): string {
	const out: string[] = [];
	const zs = CORE.top + (1 - insert) * ROD_TRAVEL; // spider height
	for (const [i, j] of shownAssemblies()) {
		const cx = R[0] + i * PITCH;
		const cy = R[1] + j * PITCH;
		const sq = (w: number) => ({ x: cx - w / 2, y: cy - w / 2, w, d: w, r: 0.3 });
		out.push(S(k.slabOf(sq(4.8), CORE.plate, CORE.fuel0 - CORE.plate, P, 2), { tone: 'mid' }));
		const ribs: string[] = [];
		for (const f of [-1.2, 0, 1.2]) {
			ribs.push(k.segment([cx + 2.2, cy + f, CORE.fuel0], [cx + 2.2, cy + f, CORE.fuel1], P));
			ribs.push(k.segment([cx + f, cy + 2.2, CORE.fuel0], [cx + f, cy + 2.2, CORE.fuel1], P));
		}
		const grids = [52, 59, 66].map((z) => k.sideSeam(sq(4.4), z, P, 2)).join('');
		out.push(S(k.slabOf(sq(4.4), CORE.fuel0, CORE.fuel1 - CORE.fuel0, P, 2), { tone: 'hi', inner: L(ribs.join(''), { tone: 'faint' }) + L(grids, { tone: 'lo' }) }));
		out.push(S(k.slabOf(sq(4.8), CORE.fuel1, CORE.top - CORE.fuel1, P, 2, 0.3), { tone: 'mid' }));
		if (!RODDED(i, j)) continue;
		const top = Math.min(zs, CORE.window + 2);
		const pins: Array<[number, number]> = [
			[-1.2, -1.2],
			[1.2, -1.2],
			[-1.2, 1.2],
			[1.2, 1.2]
		];
		pins.sort((a, b) => a[0] * CA + a[1] * SA - (b[0] * CA + b[1] * SA));
		if (top > CORE.top + 0.3) for (const [dx, dy] of pins) out.push(S(rod([cx + dx, cy + dy, CORE.top], [cx + dx, cy + dy, top], 0.36, 12), { tone: 'mid', crease: 'none' }));
		if (zs < CORE.window + 2) {
			const hub = S(k.cylinder(cx, cy, 0.95, zs, 1.2, P, 16), { tone: 'hi', lit: true });
			const vanes = pins.map(([dx, dy]) => k.segment([cx, cy, zs + 1.2], [cx + dx, cy + dy, zs + 1.2], P)).join('');
			out.push(hub + L(vanes, { tone: 'lit' }) + D(pins.map(([dx, dy]) => at([cx + dx, cy + dy, zs + 1.2])), { size: 0.45, tone: 'hi' }));
			out.push(S(rod([cx, cy, zs + 1.2], [cx, cy, CORE.window + 4], 0.55, 12), { tone: 'hi', crease: 'none', lit: true }));
		}
	}
	return out.join('');
}

/** Control rod drive housings on the head: one over each rodded assembly, sorted far to near. */
function crdms(): string {
	const out: string[] = [];
	const head = { c: [R[0], R[1], HEAD_Z] as Point3, r: 20 };
	const spots = assemblies().filter(([i, j]) => RODDED(i, j)).sort((a, b) => key(a) - key(b));
	for (const [i, j] of spots) {
		const x = R[0] + i * PITCH * 1.25;
		const y = R[1] + j * PITCH * 1.25;
		const d = Math.hypot(x - R[0], y - R[1]);
		const z0 = head.c[2] + Math.sqrt(head.r * head.r - d * d) - 0.4;
		const h = HEAD_Z + 28;
		out.push(S(k.cylinder(x, y, 1.25, z0, h - z0, P, 16), { tone: 'mid', crease: 'none' }));
		out.push(S(k.cylinder(x, y, 2, h, 10, P, 20, 0.3), { tone: 'mid', inner: L(k.sideArc(x, y, 2, h + 5, P, 12), { tone: 'faint' }) }));
		out.push(D([at([x, y, h + 10])], { size: 0.5, tone: 'hi' }));
	}
	return out.join('');
}

function vessel(): string {
	const out: string[] = [];
	out.push(S(cyl(R, 13, 4, 11, 40, 0.5), { tone: 'mid', inner: L(k.sideArc(R[0], R[1], 13, 7.5, P, 24), { tone: 'faint' }) }));
	out.push(S(k.sphereOf([R[0], R[1], 30], VR, P, 56), { tone: 'hi', crease: 'none' }));
	out.push(S(cyl(R, VR, 30, CORE.plate, 64), { tone: 'hi', crease: 'lo' }) + L(k.ring(R[0], R[1], 16.6, CORE.plate, P, 64), { tone: 'faint' }));
	out.push(S(halfShell(R, VR - 2.4, VR, CORE.plate, CORE.window), { tone: 'hi', inner: L(innerArc(R, VR - 2.4, 70), { tone: 'faint' }) + L(cutCorners(R, VR - 2.4, CORE.plate, CORE.window), { tone: 'lo' }) }));
	out.push(S(halfShell(R, 15.9, 16.6, CORE.plate, CORE.window), { tone: 'mid', inner: L(cutCorners(R, 15.9, CORE.plate, CORE.window), { tone: 'faint' }) }));
	out.push('<g data-live="core"></g>');
	return out.join('');
}

function vesselTop(): string {
	const out: string[] = [];
	const seams = k.sideArc(R[0], R[1], VR, CORE.window + 3, P, 40);
	out.push(S(cyl(R, VR, CORE.window, HEAD_Z - 10, 64), { tone: 'hi', crease: 'lo', inner: L(seams, { tone: 'faint' }) }));
	// Outlet nozzle toward the hot leg (+x); the inlet faces the pump, round the back.
	out.push(S(k.prismOf(k.axisFrame([R[0] + VR - 2, R[1], LOOP_Z], 'x'), k.circlePolygon(6.4, 32), 0, 7, P), { tone: 'hi' }));
	out.push(S(cyl(R, 24, HEAD_Z - 10, HEAD_Z - 5, 64, 0.5), { tone: 'mid', crease: 'lo' }));
	out.push(S(cyl(R, 24, HEAD_Z - 5, HEAD_Z, 64, 0.5), { tone: 'mid', crease: 'lo' }) + boltCircle(R, 22.4, HEAD_Z, 24));
	out.push(dome([R[0], R[1], HEAD_Z], 20, { tone: 'hi' }));
	out.push(crdms());
	return out.join('');
}

// ---- primary loop components ------------------------------------------------------

function legs(c: Flat, r: number, angles: number[], z0: number, top: (x: number, y: number) => number, rr = 2.2): { back: string; front: string } {
	const back: string[] = [];
	const front: string[] = [];
	for (const a of angles) {
		const x = c[0] + r * Math.cos(a);
		const y = c[1] + r * Math.sin(a);
		const svg = S(k.cylinder(x, y, rr + 1, z0, 2, P, 20), { tone: 'mid' }) + S(k.cylinder(x, y, rr, z0 + 2, top(x, y) - z0 - 2, P, 20), { tone: 'mid', crease: 'none' });
		((x - c[0]) * CA + (y - c[1]) * SA > 0 ? front : back).push(svg);
	}
	return { back: back.join(''), front: front.join('') };
}

/** The steam generator: channel head, tube bundle shell, cone, steam drum, dome and steam nozzle. */
function steamGenerator(): string {
	const out: string[] = [];
	const head: Point3 = [G[0], G[1], SG_Z];
	const under = (x: number, y: number) => head[2] - Math.sqrt(Math.max(0, 13 * 13 - (x - G[0]) ** 2 - (y - G[1]) ** 2)) + 0.6;
	const lg = legs(G, 12, [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4], 4, under, 3);
	out.push(lg.back);
	out.push(S(k.sphereOf(head, 13, P, 48), { tone: 'mid', crease: 'none' }));
	out.push(lg.front);
	out.push(S(cyl(G, 13, SG_Z, SG_Z + 36, 56), { tone: 'mid', crease: 'none', inner: L(k.sideArc(G[0], G[1], 13, SG_Z + 4, P, 32) + k.sideArc(G[0], G[1], 13, SG_Z + 20, P, 32), { tone: 'faint' }) }));
	out.push(S(frustum(G, 13, 16, SG_Z + 36, SG_Z + 43), { tone: 'mid' }));
	out.push(S(cyl(G, 16, SG_Z + 43, SG_Z + 68, 64), { tone: 'mid', crease: 'none', inner: L(k.sideArc(G[0], G[1], 16, SG_Z + 56, P, 40), { tone: 'faint' }) }));
	// Manway on the drum, facing the camera.
	const face = Math.atan2(SA, CA);
	const mw: Point3 = [G[0] + 15.4 * Math.cos(face), G[1] + 15.4 * Math.sin(face), SG_Z + 50];
	const mF = k.frameAlong(mw, [Math.cos(face), Math.sin(face), 0]);
	out.push(S(k.prismOf(mF, k.circlePolygon(4.2, 32), 0, 2.2, P), { tone: 'mid' }) + S(k.prismOf(mF, k.circlePolygon(3.4, 32), 2.2, 3, P), { tone: 'mid' }));
	out.push(D([0, 1, 2, 3, 4, 5].map((n) => at(k.pointOf(mF, 3, 2.6 * Math.cos((n / 6) * TAU), 2.6 * Math.sin((n / 6) * TAU)))), { size: 0.35 }));
	// Feedwater nozzle on the +x side.
	out.push(S(k.prismOf(k.axisFrame([G[0] + 15, G[1], SG_Z + 48], 'x'), k.circlePolygon(4.6, 28), 0, 5, P), { tone: 'mid' }));
	out.push(dome([G[0], G[1], SG_Z + 68], 16, { tone: 'mid' }));
	out.push(S(cyl(G, 4.4, SG_Z + 82.5, SG_Z + 88, 28, 0.3), { tone: 'mid' }));
	return out.join('');
}

function pressuriser(): string {
	const out: string[] = [];
	const lg = legs(Z, 7.5, [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3], 4, (x, y) => PZ_Z - Math.sqrt(Math.max(0, 8.5 * 8.5 - (x - Z[0]) ** 2 - (y - Z[1]) ** 2)) + 0.5, 1.5);
	out.push(lg.back);
	out.push(S(k.sphereOf([Z[0], Z[1], PZ_Z], 8.5, P, 40), { tone: 'mid', crease: 'none' }));
	out.push(lg.front);
	out.push(S(cyl(Z, 8.5, PZ_Z, PZ_Z + 36, 48), { tone: 'mid', crease: 'none', inner: L(k.sideArc(Z[0], Z[1], 8.5, PZ_Z + 10, P, 24) + k.sideArc(Z[0], Z[1], 8.5, PZ_Z + 26, P, 24), { tone: 'faint' }) }));
	out.push(dome([Z[0], Z[1], PZ_Z + 36], 8.5, { tone: 'mid' }));
	// Relief valve on the top: a neck, a body and a bonnet.
	const v = PZ_Z + 44;
	out.push(S(cyl(Z, 1.6, v, v + 4, 16), { tone: 'mid', crease: 'none' }));
	out.push(S(cyl(Z, 3, v + 4, v + 8, 24, 0.3), { tone: 'mid' }) + S(cyl(Z, 1.8, v + 8, v + 12, 16, 0.2), { tone: 'mid' }) + D([at([Z[0], Z[1], v + 12])], { size: 0.5, tone: 'hi' }));
	return out.join('');
}

function coolantPump(): string {
	const out: string[] = [];
	const lg = legs(U, 8, [Math.PI / 2, Math.PI, (3 * Math.PI) / 2], 4, () => PUMP_Z, 3);
	out.push(lg.back);
	out.push(S(cyl(U, 10, PUMP_Z, PUMP_Z + 16, 48, 0.5), { tone: 'mid', inner: L(k.sideArc(U[0], U[1], 10, PUMP_Z + 7, P, 24), { tone: 'faint' }) }));
	out.push(lg.front);
	out.push(S(cyl(U, 11.2, PUMP_Z + 16, PUMP_Z + 18, 48, 0.4), { tone: 'mid' }) + boltCircle(U, 10.4, PUMP_Z + 18, 16));
	const posts = [0, 1, 2, 3].map((n) => (n / 4) * TAU + Math.PI / 4).map((a) => [U[0] + 7 * Math.cos(a), U[1] + 7 * Math.sin(a)] as Flat).sort((a, b) => key(a) - key(b));
	const post = ([x, y]: Flat) => S(k.cylinder(x, y, 1.3, PUMP_Z + 18, 12, P, 16), { tone: 'mid', crease: 'none' });
	out.push(post(posts[0]!), post(posts[1]!));
	out.push(S(cyl(U, 1.8, PUMP_Z + 18, PUMP_Z + 30, 20), { tone: 'mid', crease: 'none' }));
	out.push(S(cyl(U, 4.2, PUMP_Z + 23, PUMP_Z + 25.4, 32, 0.3), { tone: 'mid' }) + '<g data-live="pump-spin"></g>');
	out.push(post(posts[2]!), post(posts[3]!));
	out.push(S(cyl(U, 9.6, PUMP_Z + 30, PUMP_Z + 32, 48, 0.3), { tone: 'mid' }));
	out.push(S(cyl(U, 9, PUMP_Z + 32, PUMP_Z + 56, 48), { tone: 'mid', crease: 'none', inner: sideRibs(U, 9, PUMP_Z + 34, PUMP_Z + 54, 14) + L(k.sideArc(U[0], U[1], 9, PUMP_Z + 34, P, 24) + k.sideArc(U[0], U[1], 9, PUMP_Z + 54, P, 24), { tone: 'lo' }) }));
	out.push(S(cyl(U, 6.5, PUMP_Z + 56, PUMP_Z + 61, 40, 0.4), { tone: 'mid' }) + D([at([U[0], U[1], PUMP_Z + 61])], { size: 0.5, tone: 'hi' }));
	return out.join('');
}

/** A dot on a coupling rim that turns with the shaft (vertical shaft), faded on the far side. */
function spinDot(c: Flat, r: number, z: number, angle: number): string {
	const marks: Array<[number, number, number]> = [];
	for (let n = 0; n < 3; n++) {
		const a = angle + (n / 3) * TAU;
		const facing = Math.cos(a - Math.atan2(SA, CA));
		if (facing < 0.05) continue;
		const [x, y] = at([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), z]);
		marks.push([x, y, Math.min(1, facing / 0.4)]);
	}
	return D(marks, { size: 0.55, tone: 'hi' });
}

/** Marks on a coupling along x that turn with the turbine shaft. */
function shaftMarks(x: number, r: number, angle: number): string {
	const marks: Array<[number, number, number]> = [];
	for (let n = 0; n < 4; n++) {
		const a = angle + (n / 4) * TAU;
		const facing = Math.cos(a); // a = 0 faces +y, toward the camera's side
		if (facing < 0.05) continue;
		const [sx, sy] = at([x, SHAFT.y + r * Math.cos(a), SHAFT.z + r * Math.sin(a)]);
		marks.push([sx, sy, Math.min(1, facing / 0.4)]);
	}
	return D(marks, { size: 0.55, tone: 'hi' });
}

// ---- turbine hall --------------------------------------------------------------

const DECK = { x: 0, y: -90, w: 174, d: 54, r: 2 };
const COND = { x: 54, y: -80, w: 46, d: 36, r: 2 };

function turbineHallStatic(): Item[] {
	const items: Item[] = [];
	const add = (id: string, k0: number, svg: string) => items.push({ id, key: k0, svg });
	const kDeck = key([87, SHAFT.y]);
	for (const [n, [x, y]] of ([[3, -87], [87, -87], [171, -87], [3, -39], [87, -39], [171, -39]] as Flat[]).entries()) {
		const front = y > SHAFT.y;
		add(`column-${n}`, front ? kDeck - 2 : kDeck - 40, S(k.slabOf({ x: x - 3, y: y - 3, w: 6, d: 6, r: 0.6 }, 4, 40, P, 2, 0.4), { tone: 'lo' }));
	}
	add('condenser', kDeck - 30, condenser());
	add('deck', kDeck, S(k.slabOf(DECK, 44, 6, P, 4, 0.6), { tone: 'mid', inner: L(k.sideSeam(DECK, 46.5, P, 4), { tone: 'faint' }) }) + L(k.planOutline(k.insetPlan(DECK, 3), 50, P, 4), { tone: 'faint' }));
	const kT = kDeck + 2;
	add('shaft', kT, S(rod([2, SHAFT.y, SHAFT.z], [172, SHAFT.y, SHAFT.z], 2.2, 20), { tone: 'mid', crease: 'none' }));
	for (const x of [4, 47, 103, 150, 167]) add(`bearing-${x}`, kT + 0.1, S(k.slabOf({ x: x - 3, y: SHAFT.y - 8, w: 6, d: 16, r: 1 }, 50, 15, P, 3, 0.4), { tone: 'mid' }) + S(k.prismOf(k.axisFrame([x - 3.4, SHAFT.y, SHAFT.z], 'x'), k.circlePolygon(5.6, 28), 0, 6.8, P), { tone: 'mid' }));
	const casing = (x0: number, x1: number, r: number, tone: k.Tone, bands: number[], extra = '') => {
		const lines = bands.map((x) => bandX(x, SHAFT.y, SHAFT.z, r)).join('');
		const joint = k.segment([x0, SHAFT.y + r, SHAFT.z], [x1, SHAFT.y + r, SHAFT.z], P);
		return S(k.prismOf(k.axisFrame([x0, SHAFT.y, SHAFT.z], 'x'), k.circlePolygon(r, 48), 0, x1 - x0, P), { tone, inner: L(lines, { tone: 'faint' }) + L(joint, { tone: 'lo' }) + extra });
	};
	add('hp', kT + 0.3, casing(12, 42, 12, 'mid', [20, 34]) + S(k.prismOf(k.axisFrame([42, SHAFT.y, SHAFT.z], 'x'), k.circlePolygon(8, 32), 0, 2, P), { tone: 'mid' }));
	add('coupling-1', kT + 0.2, S(k.prismOf(k.axisFrame([50.5, SHAFT.y, SHAFT.z], 'x'), k.circlePolygon(4.6, 28), 0, 2, P), { tone: 'mid' }) + '<g data-live="turbine-spin-1"></g>');
	add('lp', kT + 0.4, S(k.prismOf(k.axisFrame([54, SHAFT.y, SHAFT.z], 'x'), k.circlePolygon(10, 36), 0, 2, P), { tone: 'mid' }) + casing(56, 100, 20, 'mid', [66, 78, 90]) + S(k.prismOf(k.axisFrame([100, SHAFT.y, SHAFT.z], 'x'), k.circlePolygon(10, 36), 0, 2, P), { tone: 'mid' }));
	add('coupling-2', kT + 0.2, S(k.prismOf(k.axisFrame([106.5, SHAFT.y, SHAFT.z], 'x'), k.circlePolygon(4.6, 28), 0, 2, P), { tone: 'mid' }) + '<g data-live="turbine-spin-2"></g>');
	add('generator', kT + 0.5, casing(110, 146, 14, 'mid', [116, 128, 140]) + S(k.prismOf(k.axisFrame([146, SHAFT.y, SHAFT.z], 'x'), k.circlePolygon(9, 32), 0, 1.5, P), { tone: 'mid' }));
	add('exciter', kT + 0.6, casing(154, 164, 7.5, 'mid', [159]));
	// HP to LP crossover over the coupling.
	for (const it of pipe('crossover-steam', [[36, SHAFT.y, SHAFT.z + 11.4], [36, SHAFT.y, 98], [78, SHAFT.y, 98], [78, SHAFT.y, SHAFT.z + 19.4]], 3.2, { flow: 'steam', keys: [kT + 0.7, kT + 0.7, kT + 0.7], elbowKeys: [undefined, kT + 0.71, kT + 0.71] }).items) items.push(it);
	return items;
}

function condenser(): string {
	const out: string[] = [];
	const seam = k.sideSeam(COND, 14, P, 2);
	out.push(S(k.slabOf(COND, 4, 36, P, 2, 0.6), { tone: 'mid', inner: L(seam + k.sideSeam(COND, 30, P, 2), { tone: 'faint' }) }));
	// Ribs on the front face, seam to seam.
	const ribs: string[] = [];
	for (let x = COND.x + 6; x <= COND.x + COND.w - 6; x += 6) ribs.push(k.segment([x, COND.y + COND.d, 14], [x, COND.y + COND.d, 30], P));
	out.push(L(ribs.join(''), { tone: 'lo' }));
	// Water box on the +x end, with a bolted cover.
	const wb = k.axisFrame([COND.x + COND.w, SHAFT.y, 21], 'x');
	out.push(S(k.prismOf(wb, k.circlePolygon(13, 48), 0, 5, P), { tone: 'mid' }));
	out.push(S(k.prismOf(wb, k.circlePolygon(14, 48), 5, 7, P), { tone: 'mid' }));
	out.push(D(Array.from({ length: 12 }, (_, i) => at(k.pointOf(wb, 7, 12.8 * Math.cos((i / 12) * TAU), 12.8 * Math.sin((i / 12) * TAU)))), { size: 0.4 }));
	// Hotwell outlet on the front.
	out.push(S(k.prismOf(k.axisFrame([62, COND.y + COND.d, 10], 'y'), k.circlePolygon(3.6, 24), 0, 2, P), { tone: 'mid' }));
	return out.join('');
}

function feedPump(): string {
	const out: string[] = [];
	out.push(S(k.slabOf({ x: F[0] - 9, y: F[1] - 9, w: 18, d: 18, r: 1.5 }, 0, 4, P, 3, 0.5), { tone: 'lo' }) + D(k.corners({ x: F[0] - 9, y: F[1] - 9, w: 18, d: 18, r: 1.5 }, 2.4).map(([x, y]) => at([x, y, 4])), { size: 0.45 }));
	out.push(S(cyl(F, 6, 4, 18, 36, 0.4), { tone: 'mid', inner: L(k.sideArc(F[0], F[1], 6, 11, P, 20), { tone: 'faint' }) }));
	out.push(S(cyl(F, 7, 18, 20, 36, 0.3), { tone: 'mid' }));
	out.push(S(cyl(F, 5, 20, 36, 32), { tone: 'mid', crease: 'none', inner: sideRibs(F, 5, 22, 34, 9) + L(k.sideArc(F[0], F[1], 5, 22, P, 20) + k.sideArc(F[0], F[1], 5, 34, P, 20), { tone: 'lo' }) }));
	out.push(S(cyl(F, 3.6, 36, 39, 28, 0.3), { tone: 'mid' }) + D([at([F[0], F[1], 39])], { size: 0.45, tone: 'hi' }));
	return out.join('');
}

function coolingTower(): string {
	const out: string[] = [];
	const basin = { x: 188, y: -90, w: 60, d: 58, r: 2 };
	const body = { x: 192, y: -86, w: 52, d: 50, r: 1.5 };
	out.push(S(k.slabOf(basin, 0, 8, P, 3, 0.5), { tone: 'lo' }));
	const panels: string[] = [];
	for (let x = body.x + 13; x < body.x + body.w - 1; x += 13) panels.push(k.segment([x, body.y + body.d, 8], [x, body.y + body.d, 58], P));
	for (let y = body.y + 12.5; y < body.y + body.d - 1; y += 12.5) panels.push(k.segment([body.x + body.w, y, 8], [body.x + body.w, y, 58], P));
	const band = k.sideSeam(body, 30, P, 2) + k.sideSeam(body, 14, P, 2);
	out.push(S(k.slabOf(body, 8, 50, P, 2, 0.6), { tone: 'mid', inner: L(panels.join(''), { tone: 'faint' }) + L(band, { tone: 'lo' }) }));
	// Inlet louvres between the two bands: closed slots on both faces.
	const slots: string[] = [];
	for (let x = body.x + 3; x + 8 < body.x + body.w; x += 13) for (const dx of [0, 4.6]) slots.push(k.pathOf([[x + dx, 16.5], [x + dx + 3, 16.5], [x + dx + 3, 27.5], [x + dx, 27.5]].map(([u, z]) => at([u!, body.y + body.d, z!])), true));
	for (let y = body.y + 2.5; y + 8 < body.y + body.d; y += 12.5) for (const dy of [0, 4.6]) slots.push(k.pathOf([[y + dy, 16.5], [y + dy + 3, 16.5], [y + dy + 3, 27.5], [y + dy, 27.5]].map(([u, z]) => at([body.x + body.w, u!, z!])), true));
	out.push(L(slots.join(''), { tone: 'lo' }));
	// Fan stack on the deck, open on top, with a fan guard ring and a turning fan.
	out.push(S(cyl(T, 16, 58, 70, 64, 0.6), { tone: 'mid', inner: L(k.sideArc(T[0], T[1], 16, 62, P, 40), { tone: 'faint' }) }));
	out.push(`<path class="fr-void" d="${k.pathOf(k.circleRing(T[0], T[1], 14, 64).map(([x, y]) => at([x, y, 70])), true)}"/>`);
	out.push(L(k.ring(T[0], T[1], 14, 70, P, 64), { tone: 'mid' }));
	out.push('<g data-live="fan"></g>');
	return out.join('');
}

function fanSvg(angle: number): string {
	const blades: string[] = [];
	for (let n = 0; n < 5; n++) {
		const a = angle + (n / 5) * TAU;
		blades.push(k.segment([T[0] + 2.2 * Math.cos(a), T[1] + 2.2 * Math.sin(a), 70], [T[0] + 13.9 * Math.cos(a), T[1] + 13.9 * Math.sin(a), 70], P));
	}
	return L(blades.join(''), { tone: 'mid' }) + S(k.cylinder(T[0], T[1], 2.2, 69, 1.4, P, 20), { tone: 'mid' });
}

function transformer(): string {
	const out: string[] = [];
	const tank = { x: 118, y: 22, w: 28, d: 22, r: 1.5 };
	out.push(S(k.slabOf({ x: 114, y: 18, w: 42, d: 30, r: 1.5 }, 0, 3, P, 3, 0.4), { tone: 'lo' }));
	out.push(S(k.slabOf(tank, 3, 29, P, 2, 0.6), { tone: 'mid', inner: L(k.sideSeam(tank, 8, P, 2) + k.sideSeam(tank, 27, P, 2), { tone: 'faint' }) }));
	// Radiator fins on the +x side, far to near.
	for (let n = 0; n < 6; n++) out.push(S(k.slabOf({ x: 146, y: 24 + n * 3.4, w: 7, d: 1.2, r: 0.2 }, 7, 20, P, 1), { tone: 'mid' }));
	// Conservator on two brackets, behind the bushings.
	for (const x of [123, 141]) out.push(S(k.slabOf({ x: x - 1, y: 25, w: 2, d: 2, r: 0.3 }, 32, 4, P, 1), { tone: 'mid' }));
	out.push(S(k.prismOf(k.axisFrame([120, 26, 40], 'x'), k.circlePolygon(4, 32), 0, 24, P), { tone: 'mid' }));
	for (const x of BUS_X) {
		out.push(S(k.cylinder(x, 36, 2.6, 32, 2, P, 20), { tone: 'mid' }));
		out.push(S(k.cylinder(x, 36, 1.6, 34, 10, P, 20), { tone: 'mid', inner: L([36, 38, 40, 42].map((z) => k.sideArc(x, 36, 1.6, z, P, 12)).join(''), { tone: 'lo' }) }));
	}
	return out.join('');
}

const BUS_X = [124, 132, 140];

// ---- assembly ------------------------------------------------------------------

function staticItems(): Item[] {
	const items: Item[] = [];
	const add = (id: string, k0: number, svg: string) => items.push({ id, key: k0, svg });
	const push = (list: Item[]) => items.push(...list);
	add('bench', -1e9, bench());
	push(containment());
	const kR = key(R);
	const kG = key(G);
	const kU = key(U);
	add('vessel', kR, vessel());
	add('vessel-top', kR + 0.5, vesselTop());
	add('steam-generator', kG, steamGenerator());
	add('pump', kU, coolantPump());
	add('pressuriser', key(Z), pressuriser());
	// Primary loop: hot leg vessel -> steam generator, crossover steam generator -> pump, cold leg pump -> vessel.
	const hot = pipe('hot-leg', [[R[0] + VR + 5, R[1], LOOP_Z], [G[0], R[1], LOOP_Z], [G[0], G[1] + 12.4, LOOP_Z]], 4.5, { cls: 'fr-hot', flow: 'primary', tone: 'red' });
	push(hot.items);
	const cross = pipe('crossover', [[G[0], G[1], SG_Z - 12.5], [G[0], G[1], 72], [U[0], U[1], 72], [U[0], U[1], PUMP_Z]], 4.5, { cls: 'fr-cold', flow: 'primary', tone: 'blue', from: hot.length, keys: [kG - 0.5, undefined, kU - 0.5], elbowKeys: [undefined, kG - 0.4, kU - 0.4] });
	push(cross.items);
	push(pipe('cold-leg', [[U[0], U[1] + 9.6, LOOP_Z], [R[0], R[1] - VR + 0.6, LOOP_Z]], 4.5, { cls: 'fr-cold', flow: 'primary', tone: 'blue', from: cross.length }).items);
	add('outlet-flange', key([R[0] + VR + 5, R[1]]) + 0.02, flange([R[0] + VR + 5, R[1], LOOP_Z], [1, 0, 0], 4.5, 'fr-hot'));
	// Surge line from a tee on the hot leg up into the pressuriser's bottom head.
	const tee: Point3 = [G[0], Z[1], LOOP_Z];
	add('surge-tee', key(tee) + 0.03, S(k.sphereOf(tee, 6, P, 40), { tone: 'mid', crease: 'none', className: 'fr-hot' }));
	push(pipe('surge-line', [[G[0] + 5.6, Z[1], LOOP_Z], [Z[0], Z[1], LOOP_Z], [Z[0], Z[1], PZ_Z - 7.8]], 2, { cls: 'fr-hot', keys: [key(tee) + 0.04, key(Z) - 0.5], elbowKeys: [undefined, key(Z) - 0.45] }).items);
	// Main steam: up out of the dome, over to the HP turbine, down through the stop valve.
	const kT = key([87, SHAFT.y]) + 2;
	const steam = pipe('steam-line', [[G[0], G[1], SG_Z + 88], [G[0], G[1], SG_Z + 96], [26, G[1], SG_Z + 96], [26, G[1], SHAFT.z + 11.6]], 3.5, { flow: 'steam', keys: [kG + 0.1, kG + 0.2, kT + 0.8], elbowKeys: [undefined, kG + 0.21, kT + 0.79] });
	push(steam.items);
	add('stop-valve', kT + 0.9, stopValve([26, G[1], 128]));
	push(turbineHallStatic());
	// Condensate to the feed pump, then feedwater back into the steam generator.
	const kF = key(F);
	const cond = pipe('condensate', [[62, COND.y + COND.d + 2, 10], [62, F[1], 10], [F[0] + 6, F[1], 10]], 2.6, { flow: 'feed', tone: 'blue', cls: 'fr-water', keys: [key([62, -24]), kF + 0.5], elbowKeys: [undefined, kF + 0.6] });
	push(cond.items);
	add('feed-pump', kF, feedPump());
	push(pipe('feedwater', [[F[0] - 6, F[1], 12], [G[0] + 26, F[1], 12], [G[0] + 26, G[1], 12], [G[0] + 26, G[1], SG_Z + 48], [G[0] + 20, G[1], SG_Z + 48]], 2.8, { flow: 'feed', tone: 'blue', cls: 'fr-water', from: cond.length, keys: [kF + 0.4, key([G[0] + 26, (F[1] + G[1]) / 2]), key([G[0] + 26, G[1]]), key([G[0] + 23, G[1]])] }).items);
	// Circulating water between the condenser's water box and the cooling tower.
	const kDeck = key([87, SHAFT.y]);
	for (const [id, y, z, kind] of [['warm-water', SHAFT.y - 6, 30, 'out'], ['cold-water', SHAFT.y + 6, 13, 'in']] as const) {
		const route: Point3[] = [[COND.x + COND.w + 7, y, z], [DECK.x + DECK.w + 1.5, y, z], [192, y, z]];
		const r = pipe(id, kind === 'out' ? route : [...route].reverse(), 3.4, { flow: 'water', tone: 'blue', cls: 'fr-water', pad: 0, keys: kind === 'out' ? [kDeck - 1, key([182, y])] : [key([182, y]), kDeck - 1] });
		push(r.items.filter((i) => !i.id.includes('elbow')));
		add(`${id}-flange`, key([DECK.x + DECK.w + 1.5, y]) + 0.5, flange([DECK.x + DECK.w + 1.5, y, z], [1, 0, 0], 3.4, 'fr-water'));
	}
	add('cooling-tower', key(T), coolingTower());
	// Bus ducts from the generator to the transformer's bushings.
	const kX = key([132, 33]);
	for (const [n, x] of BUS_X.entries()) push(pipe(`bus-${n}`, [[x, SHAFT.y + 13.3, 70], [x, 36, 70], [x, 36, 44]], 1.9, { keys: [kT + 1 + n * 0.01, kX + 1], elbowKeys: [undefined, kX + 0.9] }).items);
	add('transformer', kX, transformer());
	return items;
}

/** A stop valve on a vertical pipe: a ball body, a bonnet out to +x and an actuator box. */
function stopValve(c: Point3): string {
	const out = [S(k.sphereOf(c, 6.2, P, 40), { tone: 'mid', crease: 'none' })];
	out.push(S(k.prismOf(k.axisFrame([c[0] + 5, c[1], c[2]], 'x'), k.circlePolygon(2.4, 24), 0, 5, P), { tone: 'mid', crease: 'none' }));
	const box = { x: c[0] + 10, y: c[1] - 4.5, w: 8, d: 9, r: 0.8 };
	out.push(S(k.slabOf(box, c[2] - 6, 12, P, 2, 0.4), { tone: 'mid', inner: L(k.sideSeam(box, c[2] + 3, P, 2), { tone: 'faint' }) }) + D(k.corners(box, 1.6).map(([x, y]) => at([x, y, c[2] + 6])), { size: 0.4 }));
	return out.join('');
}

// ---- live state ----------------------------------------------------------------

export interface DriveState {
	/** Rod insertion shown, 0..100 (eased toward the slider). */
	rods: number;
	/** Pump speed shown, % (eased). */
	pump: number;
	/** Angles of the turning parts, radians. */
	pumpAngle: number;
	turbineAngle: number;
	fanAngle: number;
}

function liveItems(d: DriveState): Record<string, string> {
	return {
		core: coreSvg(d.rods / 100),
		'pump-spin': spinDot(U, 4.2, PUMP_Z + 25.4, d.pumpAngle),
		'turbine-spin-1': shaftMarks(52.5, 4.6, d.turbineAngle),
		'turbine-spin-2': shaftMarks(108.5, 4.6, d.turbineAngle),
		fan: fanSvg(d.fanAngle)
	};
}

function ready() {
	if (P) return;
	P = k.fitProjection(
		[...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [G[0], G[1], SG_Z + 100], [26, G[1], SG_Z + 100], [R[0], R[1], HEAD_Z + 40], [T[0], T[1], 72]],
		WIDTH,
		HEIGHT,
		{ pad: 14, azimuth: 55 }
	);
	V = k.viewOf(P);
	LIGHT = k.lightOf(P);
	const [vx, vy] = k.towardViewer(P);
	CA = vx;
	SA = vy;
	const a = at([0, 0, 0]);
	const b = at([SA, -CA, 0]);
	KS = Math.hypot(b[0] - a[0], b[1] - a[1]);
	clipN = 0;
	STATIC = staticItems().sort((x, y) => x.key - y.key);
}

/** Still frame for reduced motion and the default export. */
export const STILL = { pumpAngle: 0.6, turbineAngle: 0.5, fanAngle: 0.3 };

export const REACTOR_CSS = `
.iso[data-figure-host]{--fr-tint:8%}
.iso[data-theme="dark"][data-figure-host]{--fr-tint:18%}
.fr-hot>.iso-edge{stroke:color-mix(in srgb,var(--anatomy-red) 35%,var(--anatomy-hi));stroke-opacity:.8}
.fr-cold>.iso-edge,.fr-water>.iso-edge{stroke:color-mix(in srgb,var(--anatomy-blue) 35%,var(--anatomy-hi));stroke-opacity:.8}
.fr-hot>.iso-top{fill:color-mix(in srgb,var(--anatomy-red) var(--fr-tint),var(--anatomy-top))}
.fr-cold>.iso-top,.fr-water>.iso-top{fill:color-mix(in srgb,var(--anatomy-blue) var(--fr-tint),var(--anatomy-top))}
.fr-hot>.iso-shade{fill:color-mix(in srgb,var(--anatomy-red) calc(var(--fr-tint) * .8),var(--anatomy-shade-2))}
.fr-cold>.iso-shade,.fr-water>.iso-shade{fill:color-mix(in srgb,var(--anatomy-blue) calc(var(--fr-tint) * .8),var(--anatomy-shade-2))}
.fr-hot>.iso-shade[data-shade="0"],.fr-hot>.iso-shade[data-shade="1"]{fill:color-mix(in srgb,var(--anatomy-red) calc(var(--fr-tint) * .6),var(--anatomy-shade-0))}
.fr-cold>.iso-shade[data-shade="0"],.fr-cold>.iso-shade[data-shade="1"],.fr-water>.iso-shade[data-shade="0"],.fr-water>.iso-shade[data-shade="1"]{fill:color-mix(in srgb,var(--anatomy-blue) calc(var(--fr-tint) * .6),var(--anatomy-shade-0))}
.fr-flow{stroke-dasharray:2 5;stroke-width:1;stroke-opacity:.75}
.fr-void{fill:color-mix(in srgb,var(--anatomy-shade-0) 55%,var(--anatomy-halo));stroke:none}
`;

export const LABEL = 'A pressurised water reactor plant on a bench: the reactor vessel cut open over its core, the steam generator, pump and pressuriser, the turbine and generator, the condenser and a cooling tower.';

const wrap = (item: Item) => `<g data-item="${item.id}">${item.svg}</g>`;

function fillLive(svg: string, d: DriveState): string {
	let out = svg;
	for (const [id, inner] of Object.entries(liveItems(d))) out = out.replace(`<g data-live="${id}"></g>`, `<g data-live="${id}">${inner}</g>`);
	return out;
}

const driveOf = (p: ReactorParams, d: Partial<DriveState> = {}): DriveState => ({ rods: p.rods, pump: p.pump, ...STILL, ...d });

/** The whole figure as an SVG string, framed to everything it draws. */
export function reactorSvg(params: ReactorParams = clampParams(), drive: Partial<DriveState> = {}, standalone: k.Theme | false = false): string {
	return framed(rawSvg(params, drive, standalone), frame());
}

function rawSvg(params: ReactorParams, drive: Partial<DriveState>, standalone: k.Theme | false): string {
	ready();
	const svg = fillLive(k.figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL, body: STATIC.map(wrap).join(''), standalone }), driveOf(params, drive));
	return standalone ? svg.replace('</style>', `${PAPER_CSS}${REACTOR_CSS}</style>`).replace('class="iso-svg iso"', 'class="iso-svg iso" data-figure-host="fission-reactor"') : svg;
}

let FRAME: FrameBox | null = null;
/** The viewBox: rods out and in, plus the pins. */
function frame(): FrameBox {
	if (FRAME) return FRAME;
	const svgs = [0, 100].map((rods) => rawSvg(clampParams({ rods }), {}, false));
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
	const face = Math.atan2(SA, CA);
	const on = (c: Flat, r: number, z: number, turn = 0): Point3 => [c[0] + r * Math.cos(face + turn), c[1] + r * Math.sin(face + turn), z];
	return [
		['reactor-vessel', 'Reactor vessel', on(R, VR, 98, -0.5)],
		['fuel', 'Fuel assemblies', [R[0] - PITCH * 0.6, R[1] - PITCH * 0.6, 58]],
		['control-rods', 'Control rods', [R[0], R[1], HEAD_Z + 40]],
		['pressuriser', 'Pressuriser', on(Z, 8.5, PZ_Z + 18)],
		['steam-generator', 'Steam generator', on(G, 16, SG_Z + 60, -0.6)],
		['coolant-pump', 'Reactor coolant pump', on(U, 9, PUMP_Z + 44, 0.5)],
		['hot-leg', 'Hot leg', [G[0] + 3, -14, LOOP_Z + 4.5]],
		['cold-leg', 'Cold leg', [U[0] + 3, -30, LOOP_Z + 4.5]],
		['containment', 'Containment', [C[0] - 40, C[1] - 78, 90]],
		['steam-line', 'Main steam line', [-30, G[1], SG_Z + 99.5]],
		['turbine', 'Turbine', [78, SHAFT.y + 14, SHAFT.z + 14]],
		['generator', 'Generator', [128, SHAFT.y + 10, SHAFT.z + 10]],
		['condenser', 'Condenser', [COND.x + 10, COND.y + COND.d, 22]],
		['feedwater-pump', 'Feedwater pump', on(F, 5, 30)],
		['cooling-tower', 'Cooling tower', [T[0], T[1] + 26, 40]],
		['transformer', 'Transformer', [132, 44, 20]]
	];
}

// ---- live mount ----------------------------------------------------------------

export interface MountOptions {
	theme?: k.Theme;
	params?: Partial<ReactorParams>;
	onReadout?: (values: Record<string, string>) => void;
}

export interface FigureHandle {
	update(params: Partial<Record<string, number>>): void;
	setTheme(theme: k.Theme): void;
	/** Park the plant `t` seconds in, rods and pumps settled, and stop the loop (captures, tests). */
	seek(t: number): void;
	destroy(): void;
}

const STYLE_ID = 'ripple-iso-reactor-css';
/** Drawing speeds: flow dashes in screen px a second at full flow, turns in radians a second. */
const FLOW = { primary: 14, steam: 18, feed: 7, water: 9 };
const SPIN = { pump: 5, turbine: 6, fan: 2.4 };
const DASH = 7;

export function mount(el: HTMLElement, { theme = 'dark', params: initial, onReadout }: MountOptions = {}): FigureHandle {
	const doc = el.ownerDocument;
	if (!doc.getElementById(STYLE_ID)) {
		const style = doc.createElement('style');
		style.id = STYLE_ID;
		style.textContent = k.ISO_CSS + PAPER_CSS + REACTOR_CSS;
		doc.head.appendChild(style);
	}
	let params = clampParams(initial);
	const svg = doc.importNode(new DOMParser().parseFromString(reactorSvg(params), 'image/svg+xml').documentElement, true) as unknown as SVGSVGElement;
	el.classList.add('iso');
	el.dataset.figureHost = 'fission-reactor';
	el.dataset.theme = theme;
	el.replaceChildren(svg);
	const live = new Map<string, SVGGElement>();
	for (const g of svg.querySelectorAll<SVGGElement>('[data-live]')) live.set(g.dataset.live!, g);
	const flows = [...svg.querySelectorAll<SVGPathElement>('[data-flow]')].map((p) => ({ el: p, kind: p.dataset.flow as FlowKind, at: Number(p.dataset.at) || 0 }));
	const shownLive = new Map<string, string>();

	const win = doc.defaultView;
	const still = win?.matchMedia?.('(prefers-reduced-motion: reduce)');
	const drive: DriveState = driveOf(params);
	const phase: Record<FlowKind, number> = { primary: 0, steam: 0, feed: 0, water: 0 };
	let turbineSpeed = stateOf(params).electricMW > 1 ? 1 : 0;
	let parked = false;
	let lastKey = '';

	function draw() {
		for (const [id, inner] of Object.entries(liveItems(drive))) {
			const g = live.get(id);
			if (g && shownLive.get(id) !== inner) {
				g.innerHTML = inner;
				shownLive.set(id, inner);
			}
		}
		for (const f of flows) f.el.setAttribute('stroke-dashoffset', ((f.at - phase[f.kind]) % DASH).toFixed(2));
		const shown = { rods: drive.rods, pump: drive.pump };
		const readouts = readoutsOf(shown);
		const key2 = JSON.stringify(readouts);
		if (key2 !== lastKey) {
			lastKey = key2;
			onReadout?.(readouts);
			svg.setAttribute('aria-label', describe(shown));
		}
	}

	function advance(dt: number) {
		const follow = (from: number, to: number, tau: number) => from + (to - from) * (1 - Math.exp(-dt / tau));
		drive.rods = follow(drive.rods, params.rods, 0.7);
		drive.pump = follow(drive.pump, params.pump, 1.2);
		if (Math.abs(drive.rods - params.rods) < 0.02) drive.rods = params.rods;
		if (Math.abs(drive.pump - params.pump) < 0.02) drive.pump = params.pump;
		const s = stateOf({ rods: drive.rods, pump: drive.pump });
		turbineSpeed = follow(turbineSpeed, s.electricMW > 1 ? 1 : 0, 1.5);
		phase.primary += FLOW.primary * s.flow * dt;
		phase.steam += FLOW.steam * s.power * dt;
		phase.feed += FLOW.feed * s.power * dt;
		phase.water += FLOW.water * turbineSpeed * dt;
		drive.pumpAngle += SPIN.pump * s.flow * dt;
		drive.turbineAngle += SPIN.turbine * turbineSpeed * dt;
		drive.fanAngle += SPIN.fan * turbineSpeed * dt;
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
	const settle = () => {
		drive.rods = params.rods;
		drive.pump = params.pump;
	};
	const onStill = () => {
		if (still?.matches) settle();
		draw();
		sync();
	};
	still?.addEventListener?.('change', onStill);
	draw();
	run();

	return {
		update(next) {
			params = clampParams({ ...params, ...next });
			if (still?.matches || parked) settle();
			draw();
		},
		setTheme(next) {
			el.dataset.theme = next;
		},
		seek(time) {
			parked = true;
			stop();
			settle();
			const s = stateOf(params);
			const on = s.electricMW > 1 ? 1 : 0;
			phase.primary = FLOW.primary * s.flow * time;
			phase.steam = FLOW.steam * s.power * time;
			phase.feed = FLOW.feed * s.power * time;
			phase.water = FLOW.water * on * time;
			drive.pumpAngle = STILL.pumpAngle + SPIN.pump * s.flow * time;
			drive.turbineAngle = STILL.turbineAngle + SPIN.turbine * on * time;
			drive.fanAngle = STILL.fanAngle + SPIN.fan * on * time;
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
