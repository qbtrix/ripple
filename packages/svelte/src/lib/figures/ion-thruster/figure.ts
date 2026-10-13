// figures/ion-thruster/figure.ts: a gridded ion thruster drawn the Anatomy way,
// cut in half on a thrust stand, with the @ripple-ui/core/iso kit. World: x
// along the thruster axis (the beam leaves toward +x), y toward the viewer, z
// up; 1 unit is about 5 mm, so the grids are a 30 cm thruster's.
//
// The section removes the half of the discharge chamber, magnets and grids
// that faces the camera (angles measured round the axis from +y toward +z;
// the half kept runs from KEEP to KEEP + 180 degrees, square to the view), so
// what is left is seen only from inside and never hides itself: the far wall
// with ring magnets showing their cut faces at the lips, the full back plate
// with the hollow cathode, then the plasma, the screen grid and the lit
// accelerator grid. The xenon tank, flow controller and power unit stand
// behind it; the neutraliser leans over the exit and its electrons join the
// beam; a dial indicator reads the stand's push in millinewtons.
//
// `ionSvg()` is pure (strings only) and paints back to front in one fixed
// order. `mount()` moves only what lives: ion and electron dots, xenon dashes
// in the feed lines, the plasma and beam glow, the dial needle. Colour is one
// faint blue for the xenon plasma and beam (it really glows blue). No DOM or
// work at module top level.

import * as k from '@ripple-ui/core/iso';
import type { Flat, Point3, SolidPaths } from '@ripple-ui/core/iso';
import { PAPER_CSS } from '../paper.js';
import { frameOf, framed, percentIn, type FrameBox } from '../frame.js';
import { beamSpeedOf, clampParams, densityOf, describe, readoutsOf, thrustOf, DRIFT, STILL_T, type IonParams } from './model.js';

export const WIDTH = 640;
export const HEIGHT = 420;

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

// ---- world plan ----------------------------------------------------------

const PLATE = { x: -168, y: -60, w: 250, d: 112, r: 8 };
const PLATE_H = 10;
const FOOT_H = 5;
const R_IN = 30; // grid and chamber radius (30 cm grids)
const WALL = 1.4;
const R_OUT = R_IN + WALL;
const X_BACK = -46; // inner face of the back plate
const X_END = 10; // open end of the chamber, where the grid ring sits
const SCREEN_X = X_END + 1.2;
const ACCEL_X = X_END + 3.6;
const RING_X1 = X_END + 6;
const X_EXIT = RING_X1; // beam ions start here
const BEAM_L = 118;
const BEAM_DIV = Math.tan(13 * DEG);
const STAND = { x: -64, y: -26, w: 90, d: 52, r: 3 };
const STAND_Z = 16; // platform top
const AXIS_Z = STAND_Z + 3 + R_OUT;
const TANK = { x: -134, y: -30, r: 15, h: 58 };
const FLOW = { x: -104, y: -40, w: 18, d: 16, r: 2 };
const FLOW_H = 24;
const PPU = { x: -160, y: 6, w: 38, d: 40, r: 2 };
const PPU_H = 26;
const DIAL = { x: -78, y: 22, r: 10, z: 12, h: 7 };
const MAGNETS = [X_BACK + 7, X_BACK + 27, X_END - 7];
const MAG_W = 4.4;
const MAG_T = 3.6;

// The camera is fitted on first use (ready()), so importing this module does no work.
let P = null as unknown as k.Projection;
let V: Point3 = [0, 0, 0];
let LIGHT: Point3 = [0, 0, 1];
let AWAY: [number, number] = [0, 0];
let KEEP = 0; // radians: the kept half runs KEEP..KEEP + PI round the axis
function ready() {
	if (P) return;
	P = k.fitProjection(
		[...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [0, 0, AXIS_Z + R_OUT + 8], [TANK.x, TANK.y, TANK.h + TANK.r + 10], [X_EXIT + BEAM_L, 0, AXIS_Z]],
		WIDTH,
		HEIGHT,
		{ pad: 22, azimuth: 52 }
	);
	V = k.viewOf(P);
	LIGHT = k.lightOf(P);
	const n = Math.hypot(LIGHT[0], LIGHT[1]) || 1;
	AWAY = [-LIGHT[0] / n, -LIGHT[1] / n];
	KEEP = Math.atan2(V[2], V[1]) + Math.PI / 2;
}

const at = (p: Point3): Flat => k.iso(p, P);
const S = (paths: SolidPaths, style: k.SolidStyle = {}) => k.solidSvg(paths, style);
const L = (d: string, style: k.LineStyle = {}) => k.lineSvg(d, style);
const D = (points: Flat[], style: { size?: number; tone?: k.Tone } = {}) => k.dotsSvg(points, style);
const depth = (p: Point3) => k.depthOf(p, P);
/** A point at radius r and angle a (radians, from +y toward +z) round the thruster axis, at x. */
const onAxis = (x: number, r: number, a: number): Point3 => [x, r * Math.cos(a), AXIS_Z + r * Math.sin(a)];
const AX = (x: number) => k.axisFrame([x, 0, AXIS_Z], 'x');

function shadow(plan: k.Plan, z: number, by = 2.5, spread = 1): string {
	const p = { x: plan.x + AWAY[0] * by - spread, y: plan.y + AWAY[1] * by - spread, w: plan.w + spread * 2, d: plan.d + spread * 2, r: plan.r + spread };
	return `<path class="iso-halo ion-shadow" d="${k.haloOf(p, z, 0.1, P)}"/>`;
}

/** A ring sector (r0..r1, angles a0..a1) in the frame's u,v plane: the kept half of a wall, magnet or grid. */
function sector(r0: number, r1: number, a0: number, a1: number, steps = 40): Flat[] {
	const arc = (r: number) => Array.from({ length: steps + 1 }, (_, i) => a0 + ((a1 - a0) * i) / steps).map((a) => [r * Math.cos(a), r * Math.sin(a)] as Flat);
	return r0 > 0 ? [...arc(r1), ...arc(r0).reverse()] : [...arc(r1), [0, 0]];
}
const half = (r0: number, r1: number, steps = 40) => sector(r0, r1, KEEP, KEEP + Math.PI, steps);

// ---- pipes ---------------------------------------------------------------

/** A pipe through `route` (axis-aligned legs), ball elbows at the bends; pieces sorted by depth. */
function pipe(route: Point3[], r: number, flowId?: string): string {
	const pieces: Array<{ key: number; svg: string }> = [];
	for (let i = 0; i < route.length - 1; i++) {
		const a = route[i]!;
		const b = route[i + 1]!;
		const dir = k.sub3(b, a);
		const len = k.len3(dir);
		const pad = r * 0.6;
		pieces.push({ key: depth(k.add3(a, k.mul3(dir, 0.5))), svg: S(k.prismOf(k.frameAlong(a, dir), k.circlePolygon(r, 20), i === 0 ? 0 : pad, len - (i === route.length - 2 ? 0 : pad), P), { tone: 'mid', crease: 'none' }) });
	}
	for (let i = 1; i < route.length - 1; i++) pieces.push({ key: depth(route[i]!) + 0.01, svg: S(k.sphereOf(route[i]!, r * 1.25, P, 32), { tone: 'mid', crease: 'none' }) });
	pieces.sort((a, b) => a.key - b.key);
	let flow = '';
	if (flowId) {
		const pts = route.map((p, i) => {
			const prev = route[Math.max(0, i - 1)]!;
			const next = route[Math.min(route.length - 1, i + 1)]!;
			const axis = k.unit3(k.sub3(next, prev));
			const off = k.sub3(V, k.mul3(axis, k.dot3(V, axis)));
			const n = k.len3(off) > 1e-6 ? k.unit3(off) : ([0, 0, 1] as Point3);
			return at(k.add3(p, k.mul3(n, r * 0.7)));
		});
		flow = `<path class="iso-line ion-xenon" data-free="" data-tone="blue" data-flow-id="${flowId}" d="${k.pathOf(pts)}"/>`;
	}
	return pieces.map((p) => p.svg).join('') + flow;
}

const collar = (o: Point3, axis: Point3, r: number, len: number) => S(k.prismOf(k.frameAlong(o, axis), k.circlePolygon(r, 24), 0, len, P), { tone: 'mid' });

// ---- base, stand and the units behind ------------------------------------

function bench(): string {
	const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
	const feet = [...k.corners(PLATE, 22)].sort((a, b) => depth([a[0], a[1], 0]) - depth([b[0], b[1], 0]));
	for (const [x, y] of feet) {
		out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: 'lo' }));
		out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: 'lo' }));
	}
	out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: 'lo', inner: L(k.sideSeam(PLATE, -PLATE_H + 3, P), { tone: 'faint' }) }));
	out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: 'faint' }));
	const screws = k.corners(PLATE, 10);
	out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(''), { tone: 'lo' }));
	out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
	// Ruler strip along the front edge, under the beam's start, ticks rooted on its back edge.
	const strip = { x: -40, y: PLATE.y + PLATE.d - 13, w: 110, d: 7, r: 1 };
	out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: 'lo', crease: 'none' }));
	const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, 0.6, [2, 3.6], P);
	out.push(L(ticks.minor, { tone: 'lo' }), L(ticks.major, { tone: 'mid' }));
	out.push(D([at([strip.x + 2, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, 0.6])], { size: 0.45 }));
	// Label plate, front left: three rule lines (printed text) and two screws.
	const label = { x: -112, y: PLATE.y + PLATE.d - 18, w: 34, d: 12, r: 1.2 };
	out.push(S(k.slabOf(label, 0, 1, P, 3, 0.3), { tone: 'mid' }));
	for (const [i, yy] of [3.2, 6, 8.8].entries()) out.push(L(k.lineOnTop([label.x + 5, label.y + yy], [label.x + label.w - 5 - i * 5, label.y + yy], 1, P), { tone: i === 0 ? 'lo' : 'faint', free: true }));
	out.push(D([at([label.x + 2.4, label.y + 6, 1]), at([label.x + label.w - 2.4, label.y + 6, 1])], { size: 0.45 }));
	return out.join('');
}

/** The xenon tank: a wrapped cylinder with a domed top, a neck and a hand valve. */
function tank(): string {
	const { x, y, r, h } = TANK;
	const out: string[] = [];
	out.push(S(k.cylinder(x, y, r + 3, 0, 3, P, 40, 0.6), { tone: 'mid' }));
	out.push(shadow({ x: x - r, y: y - r, w: r * 2, d: r * 2, r }, 3));
	const seams = [14, 30, 46].map((z) => k.sideArc(x, y, r, z, P, 32)).join('');
	out.push(S(k.cylinder(x, y, r, 3, h - 3, P, 48), { tone: 'hi', crease: 'none', inner: L(seams, { tone: 'faint' }) }));
	// Dome: a sphere on the cylinder top, clipped to what lies above the top rim's near arc.
	const rim = Array.from({ length: 49 }, (_, i) => at([x + r * Math.cos((i / 48) * TAU), y + r * Math.sin((i / 48) * TAU), h]));
	const left = rim.reduce((a, b) => (b[0] < a[0] ? b : a));
	const right = rim.reduce((a, b) => (b[0] > a[0] ? b : a));
	const near = rim.filter((p) => p[1] >= (left[1] + right[1]) / 2 - 0.01).sort((a, b) => a[0] - b[0]);
	const sphere = k.sphereOf([x, y, h], r, P, 48);
	const top = Math.min(...rim.map((p) => p[1])) - r * 2;
	const clip = k.pathOf([...near, [right[0] + 0.5, near[near.length - 1]![1]], [right[0] + 0.5, top], [left[0] - 0.5, top], [left[0] - 0.5, near[0]![1]]], true);
	out.push(`<clipPath id="ion-dome"><path d="${clip}"/></clipPath><g clip-path="url(#ion-dome)">${S(sphere, { tone: 'hi', crease: 'none' })}</g>`);
	// Neck, valve body and hand wheel on the crown.
	const crown = h + r;
	out.push(S(k.cylinder(x, y, 3.4, crown - 1, 5, P, 24), { tone: 'mid' }));
	out.push(S(k.cylinder(x, y, 5.2, crown + 4, 4, P, 28, 0.4), { tone: 'mid' }));
	out.push(S(k.cylinder(x, y, 1.2, crown + 8, 3, P, 12), { tone: 'mid', crease: 'none' }));
	out.push(S(k.cylinder(x, y, 6, crown + 11, 1.8, P, 32), { tone: 'hi' }));
	out.push(L(k.knurl(x, y, 6, crown + 11, crown + 12.8, 28, P), { tone: 'lo' }));
	out.push(D([at([x, y, crown + 12.8])], { size: 0.6, tone: 'hi' }));
	return out.join('');
}

/** The flow controller: a block with a regulator knob, a label line and four screws. */
function flowController(): string {
	const out: string[] = [];
	out.push(shadow(FLOW, 0, 2.5));
	const seam = L(k.sideSeam(FLOW, 6, P, 4), { tone: 'faint' });
	out.push(S(k.slabOf(FLOW, 0, FLOW_H, P, 4, 0.8), { tone: 'mid', inner: seam }));
	const cx = FLOW.x + FLOW.w / 2;
	const cy = FLOW.y + FLOW.d / 2;
	out.push(D(k.corners(FLOW, 2.6).map(([px, py]) => at([px, py, FLOW_H])), { size: 0.45 }));
	out.push(S(k.cylinder(cx - 3, cy, 3.6, FLOW_H, 3, P, 28), { tone: 'mid' }));
	out.push(S(k.cylinder(cx - 3, cy, 3, FLOW_H + 3, 4, P, 28), { tone: 'hi' }));
	out.push(L(k.knurl(cx - 3, cy, 3, FLOW_H + 3, FLOW_H + 7, 20, P), { tone: 'lo' }));
	out.push(L(k.lineOnTop([cx - 3, cy], [cx - 3 + 2.6, cy], FLOW_H + 7, P), { tone: 'hi' }));
	// One tiny engraved label on the front face: what flows here.
	out.push(k.faceTextSvg(k.sideMatrix([FLOW.x + 3, FLOW.y + FLOW.d], FLOW_H - 9, P, 'left'), 'XE', { size: 4, tone: 'lo' }));
	return out.join('');
}

/** The power processing unit: a finned box. */
function ppu(): string {
	const out: string[] = [];
	out.push(shadow(PPU, 0, 3));
	out.push(S(k.slabOf(PPU, 0, PPU_H, P, 4, 1), { tone: 'mid', inner: L(k.sideSeam(PPU, 8, P, 4), { tone: 'faint' }) }));
	// Cooling fins on top, edge to edge across the lid.
	const lid = k.insetPlan(PPU, 4);
	out.push(S(k.slabOf(lid, PPU_H, 1, P, 3, 0.3), { tone: 'mid' }));
	const fins: string[] = [];
	for (let x = lid.x + 3; x <= lid.x + lid.w - 3 + 0.01; x += 3) fins.push(S(k.slabOf({ x: x - 0.5, y: lid.y + 2, w: 1, d: lid.d - 4, r: 0.3 }, PPU_H + 1, 3.2, P, 2), { tone: 'mid', crease: 'none' }));
	out.push(fins.join(''));
	// Three connectors on the +x face, where the cables leave.
	for (const cy of PPU_PLUGS) out.push(S(k.prismOf(k.axisFrame([PPU.x + PPU.w, cy, 12], 'x'), k.circlePolygon(2.2, 20), 0, 2.4, P), { tone: 'hi' }));
	return out.join('');
}
const PPU_PLUGS = [PPU.y + 10, PPU.y + 20, PPU.y + 30];

/** Cables from the power unit to the back of the thruster (their far ends land behind the back plate). */
function cables(): string {
	const out: string[] = [];
	PPU_PLUGS.forEach((cy, i) => {
		const z = 12;
		const sx = PPU.x + PPU.w + 2.4;
		// Out along x, back toward the thruster's line in parallel lanes (no crossings), up behind the dial, into the back plate.
		const lane = -6 + i * 3;
		const turn = -96 + i * 3;
		const pts: Point3[] = [
			[sx, cy, z],
			[turn, cy, z],
			[turn, lane, z],
			[-72, lane, z],
			[-72, lane, AXIS_Z - 12 - i * 4],
			[X_BACK - 3, lane, AXIS_Z - 12 - i * 4]
		];
		out.push(k.wireSvg(at(pts[0]!), at(pts[pts.length - 1]!), { via: pts.slice(1, -1).map(at), tone: i === 0 ? 'mid' : 'lo', size: 0.9 }));
	});
	return out.join('');
}

/** The thrust stand: a base block, four slender legs (an inverted pendulum) and the platform. */
function stand(): string {
	const out: string[] = [];
	const base = k.insetPlan(STAND, -2);
	out.push(shadow(base, 0, 3));
	out.push(S(k.slabOf(base, 0, 3, P, 4, 0.6), { tone: 'mid' }));
	const legs = [...k.corners(STAND, 5)].sort((a, b) => depth([a[0], a[1], 0]) - depth([b[0], b[1], 0]));
	for (const [x, y] of legs) out.push(S(k.cylinder(x, y, 1.6, 3, STAND_Z - 4 - 3, P, 16), { tone: 'mid', crease: 'none' }));
	out.push(S(k.slabOf(STAND, STAND_Z - 4, 4, P, 4, 0.6), { tone: 'mid', inner: L(k.sideSeam(STAND, STAND_Z - 2, P, 4), { tone: 'faint' }) }));
	out.push(D(k.corners(STAND, 5).map(([x, y]) => at([x, y, STAND_Z])), { size: 0.5 }));
	return out.join('');
}

/** A cradle under the chamber at x, from the platform up to the shell (its top follows the shell). */
function cradle(x: number): string {
	const w = 18;
	const lo = -R_OUT - 3;
	const poly: Flat[] = [[-w, lo], [w, lo]];
	for (let i = 0; i <= 16; i++) {
		const u = w - (2 * w * i) / 16;
		poly.push([u, -Math.sqrt(R_OUT * R_OUT - u * u)]);
	}
	return S(k.prismOf(k.axisFrame([x, 0, AXIS_Z], 'x'), poly, -3, 3, P), { tone: 'mid' });
}

// ---- dial indicator --------------------------------------------------------

const DIAL_MAX = 150; // mN, full scale
const DIAL_TOP = DIAL.z + DIAL.h;
const dialAngle = (mn: number) => (Math.min(DIAL_MAX, Math.max(0, mn)) / DIAL_MAX) * 300 * DEG - 150 * DEG;

function dial(): string {
	const { x, y, r, z, h } = DIAL;
	const out: string[] = [];
	out.push(S(k.cylinder(x, y, 5, 0, 1.2, P, 24), { tone: 'lo' }));
	out.push(S(k.cylinder(x, y, 2.4, 1.2, z - 1.2, P, 16), { tone: 'mid', crease: 'none' }));
	// Plunger along +x from the housing to the platform's end face (it reads the stand's push).
	out.push(S(k.prismOf(k.axisFrame([x, y, z + h / 2], 'x'), k.circlePolygon(1.1, 16), r - 0.5, STAND.x - x, P), { tone: 'mid', crease: 'none' }));
	out.push(S(k.prismOf(k.axisFrame([x + r - 0.5, y, z + h / 2], 'x'), k.circlePolygon(2.2, 20), 0, 3, P), { tone: 'mid' }));
	out.push(S(k.cylinder(x, y, r, z, h, P, 64, 0.8), { tone: 'hi', crease: 'lo' }));
	out.push(L(k.knurl(x, y, r, DIAL_TOP - 3, DIAL_TOP, 72, P, 0.3), { tone: 'lo' }));
	out.push(L(k.ring(x, y, r - 2, DIAL_TOP, P, 64), { tone: 'lo' }));
	const t = k.radialTicks(x, y, r - 2.2, 30, 5, DIAL_TOP, [1, 2.2], P, -150 * DEG, 300 * DEG);
	out.push(L(t.minor, { tone: 'lo' }), L(t.major, { tone: 'mid' }));
	out.push(`<path class="iso-line ion-needle" data-tone="lit" data-free="end" data-needle="" style="stroke-width:1.1"/>`);
	out.push(L(k.ring(x, y, 1.3, DIAL_TOP, P, 16), { tone: 'hi' }));
	return out.join('');
}

function needlePath(mn: number): string {
	const a = dialAngle(mn);
	const { x, y, r } = DIAL;
	return k.lineOnTop([x - Math.sin(a) * 1.3, y + Math.cos(a) * 1.3], [x + Math.sin(a) * (r - 3.4), y - Math.cos(a) * (r - 3.4)], DIAL_TOP + 0.2, P);
}

// ---- the thruster ----------------------------------------------------------

function chamberBack(): string {
	const out: string[] = [];
	// Magnet rings round the outside of the wall: only their cut faces show, at the lips.
	for (const mx of MAGNETS) out.push(S(k.prismOf(AX(mx - MAG_W / 2), half(R_OUT, R_OUT + MAG_T, 40), 0, MAG_W, P), { tone: 'mid' }));
	// The far half of the chamber wall (it is the anode), seen from inside.
	const seams = [X_BACK + 17, X_BACK + 37].map((sx) => k.pathOf(Array.from({ length: 41 }, (_, i) => at(onAxis(sx, R_IN, KEEP + (Math.PI * i) / 40))))).join('');
	out.push(S(k.prismOf(AX(X_BACK), half(R_IN, R_OUT, 48), 0, X_END - X_BACK, P), { tone: 'hi', inner: L(seams, { tone: 'faint' }) }));
	// Back plate, whole: the chamber's back wall.
	out.push(S(k.prismOf(AX(X_BACK - 2.4), k.circlePolygon(R_OUT + 1.2, 64), 0, 2.4, P), { tone: 'hi' }));
	// Gas injector holes in a ring, and the ring of block magnets on the back plate.
	const holes: Flat[] = [];
	for (let i = 0; i < 24; i++) holes.push(at(onAxis(X_BACK, 25, (i / 24) * TAU)));
	out.push(D(holes, { size: 0.5, tone: 'mid' }));
	// Ring-cusp magnets on the back plate: round button magnets, painted far to near.
	const buttons = Array.from({ length: 12 }, (_, i) => onAxis(X_BACK, 16, (i / 12) * TAU)).sort((a, b) => depth(a) - depth(b));
	for (const c of buttons) out.push(S(k.prismOf(k.axisFrame(c, 'x'), k.circlePolygon(2.4, 20), 0, 2.2, P), { tone: 'mid' }));
	return out.join('');
}

function cathode(): string {
	const out: string[] = [];
	out.push(S(k.prismOf(AX(X_BACK), k.circlePolygon(7.5, 36), 0, 1.2, P), { tone: 'mid' }));
	out.push(S(k.prismOf(AX(X_BACK + 1.2), k.circlePolygon(4.6, 36), 0, 11, P), { tone: 'hi', inner: L(k.pathOf(Array.from({ length: 25 }, (_, i) => at(onAxis(X_BACK + 5, 4.6, KEEP + (Math.PI * i) / 24)))), { tone: 'faint' }) }));
	// Keeper face with its orifice.
	const tip = X_BACK + 12.2;
	out.push(L(k.pathOf(Array.from({ length: 25 }, (_, i) => at(onAxis(tip, 1.4, (i / 24) * TAU))), true), { tone: 'mid' }));
	out.push(`<circle class="ion-orifice" cx="${at([tip, 0, AXIS_Z])[0].toFixed(1)}" cy="${at([tip, 0, AXIS_Z])[1].toFixed(1)}" r="0.9"/>`);
	return out.join('');
}

function grids(): string {
	const out: string[] = [];
	// Grid mounting ring (kept half), bolt heads on its face.
	out.push(S(k.prismOf(AX(X_END), half(R_IN, R_OUT + 3, 48), 0, RING_X1 - X_END, P), { tone: 'mid' }));
	const bolts: Flat[] = [];
	for (let i = 1; i < 12; i++) bolts.push(at(onAxis(RING_X1, R_IN + (WALL + 3) / 2, KEEP + (Math.PI * i) / 12)));
	out.push(D(bolts, { size: 0.55, tone: 'mid' }));
	// Screen grid (thin, at the plasma's potential) then the thicker accelerator grid in front.
	out.push(S(k.prismOf(AX(SCREEN_X), half(0, R_IN, 48), 0, 0.6, P), { tone: 'hi', className: 'ion-screen' }));
	out.push(S(k.prismOf(AX(ACCEL_X), half(0, R_IN, 48), 0, 1.2, P), { tone: 'hi', lit: true }));
	// Apertures: a hexagonal field of holes on the accelerator grid's face.
	const holes: Flat[] = [];
	const pitch = 3.4;
	for (let row = -9; row <= 9; row++)
		for (let col = -9; col <= 9; col++) {
			const u = (col + (row % 2 ? 0.5 : 0)) * pitch;
			const v = row * pitch * 0.866;
			const rr = Math.hypot(u, v);
			const a = Math.atan2(v, u);
			const rel = (((a - KEEP) % TAU) + TAU) % TAU;
			if (rr > R_IN - 2.2 || rel < 0.08 || rel > Math.PI - 0.08 || rr < 1) continue;
			holes.push(at([ACCEL_X + 1.2, u, AXIS_Z + v]));
		}
	out.push(D(holes, { size: 0.55, tone: 'lo' }));
	return out.join('');
}

/** The neutraliser: a small hollow cathode on a bracket, aimed into the beam's edge. */
const NEUT_BASE = () => onAxis(RING_X1 + 4, R_OUT + 13, KEEP + 16 * DEG);
const NEUT_AIM = () => onAxis(X_EXIT + 26, R_IN * 0.75, KEEP + 22 * DEG);
const NEUT_LEN = 12;
const neutTip = (): Point3 => k.add3(NEUT_BASE(), k.mul3(k.unit3(k.sub3(NEUT_AIM(), NEUT_BASE())), NEUT_LEN + 2.6));

function neutraliser(): string {
	const out: string[] = [];
	const base = NEUT_BASE();
	const dir = k.unit3(k.sub3(NEUT_AIM(), base));
	const F = k.frameAlong(base, dir);
	// Bracket from the grid ring up to the body.
	const foot = onAxis(RING_X1 - 2, R_OUT + 3, KEEP + 16 * DEG);
	out.push(S(k.prismOf(k.frameAlong(foot, k.sub3(base, foot)), [[-1.6, -1], [1.6, -1], [1.6, 1], [-1.6, 1]], 0, k.len3(k.sub3(base, foot)), P), { tone: 'mid' }));
	out.push(S(k.prismOf(F, k.circlePolygon(2.6, 24), 0, NEUT_LEN, P), { tone: 'hi' }));
	out.push(S(k.prismOf(F, k.circlePolygon(3.4, 28), NEUT_LEN, NEUT_LEN + 2.6, P), { tone: 'mid' }));
	const tip = neutTip();
	out.push(`<circle class="ion-orifice" cx="${at(tip)[0].toFixed(1)}" cy="${at(tip)[1].toFixed(1)}" r="0.7"/>`);
	return out.join('');
}

/** Feed lines: tank valve to the flow controller, controller to the back plate and up to the neutraliser. */
function feeds(): string {
	const out: string[] = [];
	const crown = TANK.h + TANK.r + 7.4;
	const fx = FLOW.x + FLOW.w / 2 + 4;
	out.push(pipe([[TANK.x + 5.2, TANK.y, crown], [fx, TANK.y, crown], [fx, TANK.y, FLOW_H]], 1.6, 'tank'));
	out.push(collar([fx, TANK.y, FLOW_H], [0, 0, 1], 2.6, 1.6));
	const out1: Point3 = [FLOW.x + FLOW.w, FLOW.y + 5, 10];
	out.push(collar(out1, [1, 0, 0], 2.6, 1.6));
	out.push(pipe([k.add3(out1, [1.6, 0, 0]), [X_BACK - 12, out1[1], 10], [X_BACK - 12, out1[1], AXIS_Z - 6], [X_BACK - 2.4, out1[1], AXIS_Z - 6]], 1.6, 'main'));
	const n0 = NEUT_BASE();
	const back = k.sub3(n0, k.mul3(k.unit3(k.sub3(NEUT_AIM(), n0)), 0));
	const out2: Point3 = [FLOW.x + FLOW.w, FLOW.y + 11, 18];
	out.push(collar(out2, [1, 0, 0], 2.2, 1.4));
	out.push(pipe([k.add3(out2, [1.4, 0, 0]), [X_BACK - 18, out2[1], 18], [X_BACK - 18, out2[1], back[2]], [back[0], out2[1], back[2]], [back[0], back[1], back[2]]], 1.1, 'neutraliser'));
	return out.join('');
}

// ---- live: plasma, ions, electrons ------------------------------------------

const N_CHAMBER = 30;
const N_BEAM = 80;
const N_ELECTRON = 14;
const hash = (i: number, salt: number) => {
	const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
	return s - Math.floor(s);
};

function plasmaPath(): string {
	const pts: Flat[] = [];
	for (const x of [X_BACK + 8, X_END - 1]) for (let i = 0; i <= 24; i++) pts.push(at(onAxis(x, R_IN * 0.86, KEEP + (Math.PI * i) / 24)));
	for (const x of [X_BACK + 8, X_END - 1]) pts.push(at(onAxis(x, R_IN * 0.5, KEEP - 0.6)));
	return k.pathOf(k.hullOf(pts), true);
}

function beamPath(): string {
	const pts: Flat[] = [];
	for (let i = 0; i < 36; i++) {
		const a = (i / 36) * TAU;
		pts.push(at(onAxis(X_EXIT, R_IN * 0.85, a)), at(onAxis(X_EXIT + BEAM_L, R_IN * 0.85 + BEAM_L * BEAM_DIV, a)));
	}
	return k.pathOf(k.hullOf(pts), true);
}

export interface Dot {
	x: number;
	y: number;
	a: number;
}

const smooth = (e: number) => Math.min(1, Math.max(0, e)) ** 2 * (3 - 2 * Math.min(1, Math.max(0, e)));

/** Every live dot's screen position and opacity at time t. */
export function dotsAt(params: IonParams, t: number): { chamber: Dot[]; beam: Dot[]; electrons: Dot[] } {
	const density = densityOf(params);
	const chamber: Dot[] = [];
	const x0 = X_BACK + 14;
	const run = X_END - 0.5 - x0;
	for (let i = 0; i < N_CHAMBER; i++) {
		const rho = R_IN * 0.78 * Math.sqrt(hash(i, 1));
		const a = KEEP + Math.PI * hash(i, 2) * 1.25 - 0.4;
		const s = (hash(i, 3) * run + t * DRIFT) % run;
		const on = i < Math.round(N_CHAMBER * (0.25 + 0.75 * density));
		const [x, y] = at(onAxis(x0 + s, rho, a));
		chamber.push({ x, y, a: on ? smooth(s / 6) * smooth((run - s) / 3) * 0.9 : 0 });
	}
	const beam: Dot[] = [];
	const speed = beamSpeedOf(params);
	for (let i = 0; i < N_BEAM; i++) {
		const rho = R_IN * 0.85 * Math.sqrt(hash(i, 4));
		const a = TAU * hash(i, 5);
		const s = (hash(i, 6) * BEAM_L + t * speed) % BEAM_L;
		const on = i < Math.round(N_BEAM * density);
		const [x, y] = at(onAxis(X_EXIT + s, rho * (1 + (s * BEAM_DIV) / (R_IN * 0.85)), a));
		beam.push({ x, y, a: on ? smooth(s / 4) * smooth((BEAM_L - s) / (BEAM_L * 0.45)) : 0 });
	}
	const electrons: Dot[] = [];
	const from = neutTip();
	const to = NEUT_AIM();
	const len = k.len3(k.sub3(to, from));
	for (let i = 0; i < N_ELECTRON; i++) {
		const s = ((i / N_ELECTRON) * len + t * 26) % len;
		const p = k.add3(from, k.mul3(k.unit3(k.sub3(to, from)), s));
		const jit = (hash(i, 7) - 0.5) * 2.4;
		const [x, y] = at([p[0], p[1] + jit, p[2] + jit * 0.5]);
		const on = i < Math.round(N_ELECTRON * (0.3 + 0.7 * density));
		electrons.push({ x, y, a: on ? smooth(s / 3) * smooth((len - s) / (len * 0.4)) : 0 });
	}
	return { chamber, beam, electrons };
}

const dotsMarkup = (id: string, list: Dot[], r: number) => `<g class="ion-dots" data-dots="${id}">${list.map((d) => `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${r}" fill-opacity="${d.a.toFixed(2)}"/>`).join('')}</g>`;

// ---- assembly ------------------------------------------------------------

function body(params: IonParams, t: number): string {
	const dots = dotsAt(params, t);
	return [
		bench(),
		tank(),
		ppu(),
		flowController(),
		cables(),
		feeds(),
		stand(),
		dial(),
		cradle(X_BACK + 10),
		cradle(X_END - 14),
		chamberBack(),
		cathode(),
		`<path class="ion-plasma" data-plasma="" d="${plasmaPath()}"/>`,
		dotsMarkup('chamber', dots.chamber, 0.8),
		grids(),
		neutraliser(),
		`<path class="ion-beam" data-beam="" d="${beamPath()}"/>`,
		dotsMarkup('beam', dots.beam, 0.75),
		dotsMarkup('electrons', dots.electrons, 0.5)
	].join('');
}

export interface Anchor {
	id: string;
	label: string;
	/** Percent of the figure box. */
	x: number;
	y: number;
}

function anchorPoints(): Array<[string, string, Point3]> {
	ready();
	return [
		['xenon-tank', 'Xenon tank', [TANK.x, TANK.y + TANK.r, TANK.h * 0.55]],
		['flow-controller', 'Flow controller', [FLOW.x + FLOW.w / 2, FLOW.y + FLOW.d, FLOW_H * 0.6]],
		['power-unit', 'Power unit', [PPU.x + PPU.w / 2, PPU.y + PPU.d, PPU_H * 0.6]],
		['discharge-chamber', 'Discharge chamber', onAxis(X_BACK + 24, R_IN, KEEP + Math.PI * 0.62)],
		['magnets', 'Ring magnets', onAxis(MAGNETS[1]!, R_OUT + MAG_T, KEEP)],
		['cathode', 'Hollow cathode', onAxis(X_BACK + 8, 4.6, KEEP - 0.3)],
		['plasma', 'Plasma', onAxis(X_BACK + 32, 12, KEEP + Math.PI * 0.75)],
		['screen-grid', 'Screen grid', onAxis(SCREEN_X, R_IN * 0.5, KEEP + Math.PI)],
		['accel-grid', 'Accelerator grid', onAxis(ACCEL_X + 1.2, R_IN * 0.55, KEEP + Math.PI * 0.6)],
		['neutraliser', 'Neutraliser', NEUT_BASE()],
		['ion-beam', 'Ion beam', [X_EXIT + 70, 0, AXIS_Z]],
		['thrust-dial', 'Thrust dial', [DIAL.x, DIAL.y, DIAL_TOP]]
	];
}

/** Named anchors in percent of the figure box, for the widget's pins. */
export function anchorsOf(): Anchor[] {
	return anchorPoints().map(([id, label, p]) => ({ id, label, ...percentIn(frame(), at(p)) }));
}

let FRAME: FrameBox | null = null;
/** The viewBox: everything drawn, the whole beam and the pins. */
function frame(): FrameBox {
	if (FRAME) return FRAME;
	ready();
	FRAME = frameOf([rawSvg(clampParams({ flow: 3 }), STILL_T, false)], anchorPoints().map(([, , p]) => at(p)));
	return FRAME;
}

export const ION_CSS = `
.iso[data-figure-host]{--ion-glow:var(--anatomy-blue)}
.ion-plasma{fill:var(--ion-glow);stroke:none;filter:blur(5px);mix-blend-mode:normal}
.ion-beam{fill:url(#ion-beam-fade);stroke:none;filter:blur(4px)}
.ion-dots circle{fill:var(--ion-glow)}
.ion-dots[data-dots="electrons"] circle{fill:var(--anatomy-hi)}
.ion-orifice{fill:var(--ion-glow);stroke:none}
.ion-xenon{stroke-dasharray:1.6 4.4;stroke-width:.9;stroke-opacity:.8}
.iso-halo.ion-shadow{filter:blur(2.5px);opacity:calc(var(--anatomy-halo-opacity) * .5);transform:none}
`;

export const LABEL = 'A gridded ion thruster cut in half on a thrust stand, with its xenon tank, flow controller and power unit.';

/** The whole figure as an SVG string at time t, framed to all it draws. */
export function ionSvg(params: IonParams = clampParams(), t = STILL_T, standalone: k.Theme | false = false): string {
	return framed(rawSvg(params, t, standalone), frame());
}

function rawSvg(params: IonParams, t: number, standalone: k.Theme | false): string {
	ready();
	const a = at([X_EXIT, 0, AXIS_Z]);
	const b = at([X_EXIT + BEAM_L, 0, AXIS_Z]);
	const defs = `<defs><linearGradient id="ion-beam-fade" gradientUnits="userSpaceOnUse" x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}"><stop offset="0" style="stop-color:var(--ion-glow)" stop-opacity=".1"/><stop offset=".14" style="stop-color:var(--ion-glow)" stop-opacity=".38"/><stop offset=".5" style="stop-color:var(--ion-glow)" stop-opacity=".15"/><stop offset="1" style="stop-color:var(--ion-glow)" stop-opacity="0"/></linearGradient></defs>`;
	const svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL, body: defs + body(params, t), standalone });
	return fillLive(svg, params, t);
}

const glowOf = (params: IonParams, t: number) => {
	const d = densityOf(params);
	return { plasma: (0.07 + 0.15 * d) * (0.92 + 0.08 * Math.sin(t * 7.3) * Math.sin(t * 2.1)), beam: 0.35 + 0.65 * d };
};

function fillLive(svg: string, params: IonParams, t: number): string {
	const g = glowOf(params, t);
	return svg
		.replace('data-needle=""', `data-needle="" d="${needlePath(thrustOf(params) * 1000)}"`)
		.replace('data-plasma=""', `data-plasma="" opacity="${g.plasma.toFixed(3)}"`)
		.replace('data-beam=""', `data-beam="" opacity="${g.beam.toFixed(3)}"`);
}

// ---- live mount ----------------------------------------------------------

export interface MountOptions {
	theme?: k.Theme;
	params?: Partial<IonParams>;
	onReadout?: (values: Record<string, string>) => void;
}

export interface FigureHandle {
	update(params: Partial<Record<string, number>>): void;
	setTheme(theme: k.Theme): void;
	/** Park the figure at `t` seconds and stop the loop (captures, tests). */
	seek(t: number): void;
	destroy(): void;
}

const STYLE_ID = 'ripple-iso-ion-thruster-css';
const XENON_PX = 5; // dash px a second per mg/s

export function mount(el: HTMLElement, { theme = 'dark', params: initial, onReadout }: MountOptions = {}): FigureHandle {
	const doc = el.ownerDocument;
	if (!doc.getElementById(STYLE_ID)) {
		const style = doc.createElement('style');
		style.id = STYLE_ID;
		style.textContent = k.ISO_CSS + PAPER_CSS + ION_CSS;
		doc.head.appendChild(style);
	}
	let params = clampParams(initial);
	const svg = doc.importNode(new DOMParser().parseFromString(ionSvg(params), 'image/svg+xml').documentElement, true) as unknown as SVGSVGElement;
	el.classList.add('iso');
	el.dataset.figureHost = 'ion-thruster';
	el.dataset.theme = theme;
	el.replaceChildren(svg);

	const groups = Object.fromEntries((['chamber', 'beam', 'electrons'] as const).map((id) => [id, [...svg.querySelectorAll<SVGCircleElement>(`[data-dots="${id}"] circle`)]])) as Record<'chamber' | 'beam' | 'electrons', SVGCircleElement[]>;
	const needle = svg.querySelector<SVGPathElement>('[data-needle]');
	const plasma = svg.querySelector<SVGPathElement>('[data-plasma]');
	const beam = svg.querySelector<SVGPathElement>('[data-beam]');
	const flows = [...svg.querySelectorAll<SVGPathElement>('[data-flow-id]')];
	let offset = 0;
	let shownMn = NaN;

	const win = doc.defaultView;
	const still = win?.matchMedia?.('(prefers-reduced-motion: reduce)');
	let t = STILL_T;
	let lastKey = '';
	let parked = false;

	function draw(dt: number) {
		const dots = dotsAt(params, t);
		for (const id of ['chamber', 'beam', 'electrons'] as const) {
			const list = dots[id];
			groups[id].forEach((c, i) => {
				const d = list[i]!;
				c.setAttribute('cx', d.x.toFixed(1));
				c.setAttribute('cy', d.y.toFixed(1));
				c.setAttribute('fill-opacity', d.a.toFixed(2));
			});
		}
		const g = glowOf(params, t);
		plasma?.setAttribute('opacity', g.plasma.toFixed(3));
		beam?.setAttribute('opacity', g.beam.toFixed(3));
		// The needle follows the thrust with a short damped lag, like a real dial.
		const target = thrustOf(params) * 1000;
		const follow = dt > 0 ? 1 - Math.exp(-dt / 0.25) : 1;
		shownMn = Number.isNaN(shownMn) ? target : shownMn + (target - shownMn) * follow;
		needle?.setAttribute('d', needlePath(shownMn));
		offset = (offset - params.flow * XENON_PX * dt) % 6;
		for (const f of flows) f.setAttribute('stroke-dashoffset', offset.toFixed(2));
		const readouts = readoutsOf(params);
		const key = JSON.stringify(readouts);
		if (key !== lastKey) {
			lastKey = key;
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
		if (still?.matches) t = STILL_T;
		draw(0);
		sync();
	};
	still?.addEventListener?.('change', onStill);
	draw(0);
	run();

	return {
		update(next) {
			params = clampParams({ ...params, ...next });
			if (still?.matches) t = STILL_T;
			draw(still?.matches || parked ? 0 : 1 / 60);
		},
		setTheme(next) {
			el.dataset.theme = next;
		},
		seek(time) {
			parked = true;
			stop();
			t = time;
			shownMn = NaN;
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
