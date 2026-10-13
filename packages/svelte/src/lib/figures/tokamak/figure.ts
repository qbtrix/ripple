// figures/tokamak/figure.ts: a tokamak fusion reactor drawn the Anatomy way,
// as a scale model on a display plate, with the @ripple-ui/core/iso kit.
// World: metres, z up, the machine's axis at the origin and its midplane at
// z = 0. Angles `th` are degrees round the axis from the viewer's side
// (th = 0 points at the camera), so the cutaway stays put whatever the azimuth.
//
// The front-left wedge (th 0..70) is cut away. Every part is cut on the one
// plane at th = 70, which faces the viewer, so that face is the textbook
// cross-section: central solenoid, a toroidal field coil sliced through its
// middle, the double-walled vacuum vessel, blanket modules, the divertor and
// the poloidal field coils. The plasma alone runs on past the cut to th = 58,
// where its end shows the nested magnetic surfaces. The right end (th = 0)
// is seen edge-on.
//
// Painter's order: every part lives in an angular slot round the axis (a
// coil's thin wedge or the gap between two coils), and slots are drawn by how
// far they face away from the viewer; inside a slot, parts further out are
// further back on the far side and nearer on the near side. The central
// solenoid sits between the far half and the near half. Round bodies are
// swept profiles (`revolve`), coils are D-shaped plates with a hole (`plate`).
//
// `tokamakSvg()` is pure (strings only). `mount()` keeps one <g data-item> per
// part and per frame rewrites only the moving ones: particles streaming along
// the twisted field lines, the dots circling the magnetic surfaces at the
// plasma's end, and the heating beam. The plasma's glow is a CSS variable set
// from the model's temperature. No DOM or work at module top level.

import * as k from '@ripple-ui/core/iso';
import type { Flat, Point3, SolidPaths } from '@ripple-ui/core/iso';
import { PAPER_CSS } from '../paper.js';
import { frameOf, framed, percentIn, type FrameBox } from '../frame.js';
import { beamSpeedOf, clampParams, describe, glowOf, readoutsOf, solve, streamSpeedOf, twistAt, type TokamakParams } from './model.js';

export const WIDTH = 640;
export const HEIGHT = 420;

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const AZIMUTH = 58;
const CUT = 70; // th of the section plane
const PLASMA_END = 58; // th where the plasma's own cut sits
const COIL_T = 0.62; // toroidal thickness of a TF coil case
const COILS = Array.from({ length: 18 }, (_, i) => 10 + 20 * i); // th of each TF coil
const KEPT = COILS.filter((th) => th >= CUT); // 70 (cut through its middle) .. 350
const BASE_TOP = -8.6;
const BASE_R = 12.4;
const PLATE = { x: -13.5, y: -13.5, w: 30, d: 27.5, r: 0.8 };
const PLATE_TOP = BASE_TOP - 0.9;
const PLATE_H = 0.7;
const FOOT_H = 0.5;

type Ring2 = Flat[]; // closed polygon in (R, z)

let P = null as unknown as k.Projection;
let V: Point3 = [0, 0, 0];
let LIGHT: Point3 = [0, 0, 1];
let STATIC: Item[] = [];

interface Item {
	id: string;
	key: number;
	svg: string;
}

const at = (p: Point3): Flat => k.iso(p, P);
const S = (paths: SolidPaths, style: k.SolidStyle = {}) => k.solidSvg(paths, style);
const L = (d: string, style: k.LineStyle = {}) => k.lineSvg(d, style);
const D = (points: Flat[], style: { size?: number; tone?: k.Tone } = {}) => k.dotsSvg(points, style);
/** World point at radius R, angle th (degrees from the viewer's side), height z. */
const W = (R: number, th: number, z: number): Point3 => [R * Math.cos((AZIMUTH + th) * DEG), R * Math.sin((AZIMUTH + th) * DEG), z];
const eR = (th: number): Point3 => [Math.cos((AZIMUTH + th) * DEG), Math.sin((AZIMUTH + th) * DEG), 0];
const ePhi = (th: number): Point3 => [-Math.sin((AZIMUTH + th) * DEG), Math.cos((AZIMUTH + th) * DEG), 0];
const onCut = (R: number, z: number, th = CUT) => at(W(R, th, z));

/** Painter key of a part in the slot centred at th, `r` metres out from the axis. */
function keyOf(th: number, r: number) {
	const c = Math.cos(th * DEG);
	return c * 1e5 + (c >= 0 ? r : -r) * 10;
}

// ---- profiles (metres, R out from the axis, z up) ------------------------------

/** A D shape: flat-ish inboard side, round outboard side, top and bottom pulled inboard by `tri`. CCW from the outboard midplane. */
function dee(rIn: number, rOut: number, top: number, bot: number, tri: number, nIn = 2, nOut = 2, steps = 64): Ring2 {
	const Rc = (rIn + rOut) / 2;
	const wO = rOut - Rc;
	const wI = Rc - rIn;
	return Array.from({ length: steps }, (_, i) => {
		const t = (i / steps) * TAU;
		const c = Math.cos(t);
		const s = Math.sin(t);
		const x = c >= 0 ? wO * c ** (2 / nOut) : -wI * (-c) ** (2 / nIn);
		const R = Math.max(rIn, Rc + x - ((tri * (wI + wO)) / 2) * s * s * ((x + wI) / (wI + wO)));
		return [R, s >= 0 ? top * s : -bot * s] as Flat;
	});
}

const VO = (steps = 64) => dee(3.0, 9.45, 4.65, -5.85, 0.4, 4, 2.2, steps); // vessel outer skin
const VI = () => dee(3.45, 8.85, 4.2, -5.4, 0.4, 4, 2.2); // vessel inner skin
const TF_IN = (steps = 64) => dee(2.85, 9.8, 5.2, -6.3, 0.35, 8, 2.2, steps);
const TF_OUT = (steps = 64) => dee(2.1, 10.6, 6.0, -7.1, 0.35, 8, 2.2, steps);
const TF_WP = () => dee(2.3, 10.35, 5.75, -6.85, 0.35, 8, 2.2); // winding pack, inner edge
const TF_WP_IN = () => dee(2.65, 10.05, 5.45, -6.55, 0.35, 8, 2.2);
const CS = { r0: 1.25, r1: 2.0, top: 6.3, modules: 6 };
/** Poloidal field coils: centre R, z and the winding's width and height. */
const PF: Array<[number, number, number, number]> = [
	[3.9, 7.05, 0.9, 0.9],
	[8.3, 6.35, 0.7, 0.8],
	[11.1, 3.0, 0.7, 1.0],
	[11.4, -2.4, 0.7, 1.0],
	[8.4, -6.85, 0.9, 0.7],
	[4.3, -7.85, 1.1, 0.7]
];
const rect = (R: number, z: number, w: number, h: number): Ring2 => [
	[R + w / 2, z - h / 2],
	[R + w / 2, z + h / 2],
	[R - w / 2, z + h / 2],
	[R - w / 2, z - h / 2]
];

/** Plasma: Miller-shaped magnetic surfaces, shifted outward toward the core, the edge pinched to an X-point at the bottom. */
const PL = { R: 6.2, a: 2.0, kappa: 1.7, delta: 0.4, shift: 0.25, pinch: 0.42 };
const SURFACES = new Map<string, Ring2>();
function surface(rho: number, steps = 72): Ring2 {
	const id = `${rho}|${steps}`;
	if (!SURFACES.has(id)) SURFACES.set(id, surfaceOf(rho, steps));
	return SURFACES.get(id)!;
}
function surfaceOf(rho: number, steps: number): Ring2 {
	const { R, a, kappa, delta, shift, pinch } = PL;
	const w = 0.55;
	return Array.from({ length: steps }, (_, i) => {
		const t = (i / steps) * TAU;
		const rr = R + shift * (1 - rho * rho) + rho * a * Math.cos(t + delta * rho * Math.sin(t));
		let z = (0.9 + 0.1 * rho) * kappa * rho * a * Math.sin(t);
		const off = Math.abs(t - 1.5 * Math.PI);
		if (off < w) z -= pinch * rho ** 6 * (1 - off / w) ** 2;
		return [rr, z] as Flat;
	});
}
/** X-point and the two strike points, where the edge's open field lines meet the divertor. */
const XPT: Flat = [PL.R - PL.a * Math.sin(PL.delta), -PL.kappa * PL.a - PL.pinch];
const STRIKE_IN: Flat = [4.6, -4.35];
const STRIKE_OUT: Flat = [6.27, -4.45];

// ---- solids --------------------------------------------------------------------

function oriented(points: Flat[]) {
	let a = 0;
	for (let i = 0; i < points.length; i++) {
		const [ax, ay] = points[i]!;
		const [bx, by] = points[(i + 1) % points.length]!;
		a += ax * by - bx * ay;
	}
	return a < 0 ? [...points].reverse() : points;
}

function area(ring: Ring2) {
	let a = 0;
	for (let i = 0; i < ring.length; i++) {
		const [ax, az] = ring[i]!;
		const [bx, bz] = ring[(i + 1) % ring.length]!;
		a += ax * bz - bx * az;
	}
	return a;
}

/**
 * A profile (R, z) swept round the axis from th0 to th1: the curved skin in
 * merged tone strips, the silhouette, sharp-corner creases and, if asked, the
 * flat end caps. The fill is the union of every visible face.
 */
function revolve(profile: Ring2, th0: number, th1: number, steps: number, caps: { start?: boolean; end?: boolean; joined?: boolean; hull?: boolean } = {}): SolidPaths {
	const prof = area(profile) < 0 ? [...profile].reverse() : profile;
	const n = prof.length;
	const ths = Array.from({ length: steps + 1 }, (_, j) => th0 + ((th1 - th0) * j) / steps);
	const pts = prof.map(([R, z]) => ths.map((th) => at(W(R, th, z))));
	const buckets: string[][] = [[], [], [], [], []];
	const fills: string[] = [];
	const outline: string[] = [];
	const crease: string[] = [];
	const seen: boolean[][] = [];
	for (let j = 0; j < steps; j++) {
		const mid = (ths[j]! + ths[j + 1]!) / 2;
		const state = prof.map(([R0, z0], i) => {
			const [R1, z1] = prof[(i + 1) % n]!;
			if (R0 < 1e-6 && R1 < 1e-6) return -1; // on the axis
			const len = Math.hypot(R1 - R0, z1 - z0) || 1;
			const nR = (z1 - z0) / len;
			const nz = -(R1 - R0) / len;
			const normal = k.add3(k.mul3(eR(mid), nR), [0, 0, nz]);
			return k.dot3(normal, V) > 1e-6 ? k.bandOf(k.dot3(normal, LIGHT)) : -1;
		});
		seen.push(state.map((s) => s >= 0));
		// Runs of the same band along the profile become one strip.
		let start = state.findIndex((s, i) => s !== state[(i - 1 + n) % n]);
		if (start < 0) start = 0;
		for (let c = 0; c < n; ) {
			const i0 = (start + c) % n;
			const band = state[i0]!;
			let len = 1;
			while (len < n - c && state[(i0 + len) % n] === band) len++;
			if (band >= 0) {
				const a = Array.from({ length: len + 1 }, (_, m) => pts[(i0 + m) % n]![j]!);
				const b = Array.from({ length: len + 1 }, (_, m) => pts[(i0 + m) % n]![j + 1]!).reverse();
				const d = k.pathOf(oriented([...a, ...b]), true);
				buckets[band]!.push(d);
				fills.push(d);
			}
			c += len;
		}
	}
	// Silhouette lines run round the axis where a visible strip meets a hidden one; creases on sharp corners.
	for (let i = 0; i < n; i++) {
		const [pR, pz] = prof[(i - 1 + n) % n]!;
		const [R, z] = prof[i]!;
		const [nR, nz] = prof[(i + 1) % n]!;
		const a = [R - pR, z - pz];
		const b = [nR - R, nz - z];
		const sharp = (a[0]! * b[0]! + a[1]! * b[1]!) / (Math.hypot(a[0]!, a[1]!) * Math.hypot(b[0]!, b[1]!) || 1) < Math.cos(0.35);
		let run: Flat[] = [];
		let kind = '';
		const flush = () => {
			if (run.length > 1) (kind === 'edge' ? outline : crease).push(k.pathOf(run));
			run = [];
		};
		for (let j = 0; j < steps; j++) {
			const before = seen[j]![(i - 1 + n) % n]!;
			const after = seen[j]![i]!;
			const now = before !== after ? 'edge' : before && after && sharp ? 'crease' : '';
			if (now !== kind) {
				flush();
				kind = now;
			}
			if (now) {
				if (!run.length) run.push(pts[i]![j]!);
				run.push(pts[i]![j + 1]!);
			}
		}
		flush();
	}
	// Ends: a visible cap draws its whole ring; an open end draws only where the skin shows.
	const endOf = (j: number, th: number, sign: 1 | -1, cap?: boolean) => {
		const normal = k.mul3(ePhi(th), sign);
		const capSeen = cap && k.dot3(normal, V) > 1e-6;
		if (capSeen) {
			const ring = pts.map((row) => row[j]!);
			const d = k.pathOf(oriented(ring), true);
			buckets[k.bandOf(k.dot3(normal, LIGHT))]!.push(d);
			fills.push(d);
			outline.push(k.pathOf(ring, true));
			return;
		}
		const col = seen[Math.min(j, steps - 1)]!;
		let run: Flat[] = [];
		for (let m = 0; m <= n; m++) {
			const i = m % n;
			if (m < n && col[i]) {
				if (!run.length) run.push(pts[i]![j]!);
				run.push(pts[(i + 1) % n]![j]!);
			} else if (run.length) {
				outline.push(k.pathOf(run));
				run = [];
			}
		}
	};
	if (!caps.joined) {
		endOf(0, th0, -1, caps.start);
		endOf(steps, th1, 1, caps.end);
	}
	const fill = caps.hull ? k.pathOf(k.hullOf(pts.flat()), true) : fills.join('');
	return { fill, outline: outline.join(''), crease: crease.join(''), top: buckets[4]!.join(''), shades: buckets.slice(0, 4).map((b) => b.join('')), seamless: true };
}

/** A frame at angle th whose axis runs round the machine: u = out from the axis, v = up. */
const coilFrame = (th: number): k.Frame => ({ o: [0, 0, 0], a: ePhi(th), u: eR(th), v: [0, 0, 1] });

/** A flat plate in frame F: `outer` (and holes) in (u, v), swept along the axis from s0 to s1. Concave outlines are fine. */
function plate(F: k.Frame, outer: Ring2, s0: number, s1: number, holes: Ring2[] = []): SolidPaths {
	const rings = [area(outer) < 0 ? [...outer].reverse() : outer, ...holes.map((h) => (area(h) > 0 ? [...h].reverse() : h))];
	const front = k.dot3(F.a, V) > 0 ? s1 : s0;
	const back = front === s1 ? s0 : s1;
	const p = (s: number, u: number, v: number) => at(k.pointOf(F, s, u, v));
	const buckets: string[][] = [[], [], [], [], []];
	const edges: Flat[][] = [];
	const creases: Flat[][] = [];
	rings.forEach((ring, ri) => {
		const m = ring.length;
		const band = ring.map(([u0, v0], j) => {
			const [u1, v1] = ring[(j + 1) % m]!;
			const nrm = k.unit3(k.add3(k.mul3(F.u, v1 - v0), k.mul3(F.v, -(u1 - u0))));
			return k.dot3(nrm, V) > 1e-6 ? k.bandOf(k.dot3(nrm, LIGHT)) : -1;
		});
		let start = band.findIndex((b, j) => b !== band[(j - 1 + m) % m]);
		if (start < 0) start = 0;
		for (let c = 0; c < m; ) {
			const j0 = (start + c) % m;
			const b = band[j0]!;
			let len = 1;
			while (len < m - c && band[(j0 + len) % m] === b) len++;
			if (b >= 0) {
				const run = Array.from({ length: len + 1 }, (_, q) => ring[(j0 + q) % m]!);
				buckets[b]!.push(k.pathOf([...run.map(([u, v]) => p(s0, u, v)), ...run.toReversed().map(([u, v]) => p(s1, u, v))], true));
				(ri === 0 ? edges : creases).push(run.map(([u, v]) => p(back, u, v)));
			}
			c += len;
		}
	});
	const cap = (s: number) => rings.map((ring) => k.pathOf(ring.map(([u, v]) => p(s, u, v)), true)).join('');
	buckets[k.bandOf(k.dot3(k.mul3(F.a, Math.sign(front - back)), LIGHT))]!.push(cap(front));
	const segs = (list: Flat[][]) => list.map((s) => k.pathOf(s)).join('');
	return { fill: cap(front) + cap(back), outline: cap(front) + segs(edges), crease: segs(creases), top: buckets[4]!.join(''), shades: buckets.slice(0, 4).map((b) => b.join('')) };
}

/** A closed (R, z) ring on the section plane, as a path. */
const onSection = (ring: Ring2, th = CUT) => k.pathOf(ring.map(([R, z]) => onCut(R, z, th)), true);
const faceSvg = (cls: string, d: string, tone: k.Tone = 'mid') => `<path class="tok-face ${cls}" fill-rule="evenodd" d="${d}"/>${L(d, { tone })}`;

// ---- static parts ----------------------------------------------------------------

function bench(): string {
	const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, PLATE_TOP - PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
	const feet = [...k.corners(PLATE, 1.6)].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
	for (const [x, y] of feet) {
		out.push(S(k.cylinder(x, y, 0.7, PLATE_TOP - PLATE_H - FOOT_H, 0.16, P, 28), { tone: 'lo' }));
		out.push(S(k.cylinder(x, y, 0.54, PLATE_TOP - PLATE_H - FOOT_H + 0.16, FOOT_H - 0.16, P, 28), { tone: 'lo' }));
	}
	out.push(S(k.slabOf(PLATE, PLATE_TOP - PLATE_H, PLATE_H, P, 8, 0.12), { tone: 'lo', inner: L(k.sideSeam(PLATE, PLATE_TOP - PLATE_H + 0.22, P), { tone: 'faint' }) }));
	out.push(L(k.planOutline(k.insetPlan(PLATE, 0.5), PLATE_TOP, P), { tone: 'faint' }));
	const screws = k.corners(PLATE, 0.95);
	out.push(L(screws.map(([x, y]) => k.ring(x, y, 0.22, PLATE_TOP, P, 16)).join(''), { tone: 'lo' }));
	out.push(D(screws.map(([x, y]) => at([x, y, PLATE_TOP])), { size: 0.5 }));
	// A ruler in metres along the front edge, and a label plate.
	const strip = { x: -6, y: PLATE.y + PLATE.d - 1.5, w: 21, d: 0.8, r: 0.1 };
	out.push(S(k.slabOf(strip, PLATE_TOP, 0.06, P, 3), { tone: 'lo', crease: 'none' }));
	const ticks = k.topTicks(strip.x + 0.5, strip.x + strip.w - 0.5, 1, 5, strip.y + 0.08, PLATE_TOP + 0.06, [0.24, 0.42], P);
	out.push(L(ticks.minor, { tone: 'lo' }), L(ticks.major, { tone: 'mid' }));
	const label = { x: PLATE.x + 1.8, y: PLATE.y + PLATE.d - 3.2, w: 4.6, d: 1.5, r: 0.12 };
	out.push(S(k.slabOf(label, PLATE_TOP, 0.1, P, 3, 0.03), { tone: 'mid' }));
	for (const [i, yy] of [0.38, 0.74, 1.1].entries()) out.push(L(k.lineOnTop([label.x + 0.05, label.y + yy], [label.x + label.w - (i ? 1.1 : 0.05), label.y + yy], PLATE_TOP + 0.1, P), { tone: i === 0 ? 'lo' : 'faint', free: 'end' }));
	return out.join('');
}

function base(): string {
	const out = [`<path class="iso-halo" d="${k.haloOf({ x: -BASE_R, y: -BASE_R, w: BASE_R * 2, d: BASE_R * 2, r: BASE_R }, BASE_TOP - 0.8, 0.8, P)}"/>`];
	out.push(S(k.cylinder(0, 0, BASE_R, BASE_TOP - 0.8, 0.8, P, 96, 0.1), { tone: 'mid', inner: L(k.sideArc(0, 0, BASE_R, BASE_TOP - 0.3, P, 64), { tone: 'faint' }) }));
	out.push(L(k.ring(0, 0, BASE_R - 0.5, BASE_TOP, P, 96), { tone: 'faint' }));
	const bolts = Array.from({ length: 36 }, (_, i) => at(W(BASE_R - 0.25, i * 10 + 5, BASE_TOP)));
	out.push(D(bolts, { size: 0.45 }));
	return out.join('');
}

function staticItems(): Item[] {
	const items: Item[] = [];
	const add = (id: string, key: number, svg: string) => items.push({ id, key, svg });
	add('bench', -1e9, bench());
	add('base', -1e9 + 1, base());
	// Central solenoid: a support core inside six stacked modules, cut on the section plane.
	add('cs', 0, S(revolve([[0, -CS.top], [CS.r1, -CS.top], [CS.r1, CS.top], [0, CS.top]], CUT, 360, 58), { tone: 'mid' }) + csSeams());
	// Toroidal field coils: D-shaped plates; the one at the cut keeps only its back half.
	for (const th of KEPT) {
		const s0 = th === CUT ? 0 : -COIL_T / 2;
		const paths = plate(coilFrame(th), TF_OUT(40), s0, COIL_T / 2, [TF_IN(40)]);
		add(`tf-${th}`, keyOf(th, PL.R), S(paths, { tone: 'mid' }));
		if (th !== CUT) add(`support-${th}`, keyOf(th, 6) - 30, support(th));
	}
	// Vessel: one swept piece per gap between coils, plus ports between the coils.
	const gaps: Array<[number, number]> = [];
	for (let i = 0; i < KEPT.length; i++) gaps.push([KEPT[i]!, KEPT[i + 1] ?? 360]);
	for (const [a, b] of gaps) {
		const d0 = 1.9;
		const d1 = b === 360 ? 0 : 1.9;
		add(`vessel-${a}`, keyOf((a + b) / 2, PL.R), S(revolve(VO(40), a + d0, b - d1, 3, { hull: true }), { tone: 'mid' }));
	}
	// Poloidal field coils: rings cut at the section, in pieces that follow the slots.
	const cuts = [CUT, ...KEPT.flatMap((th) => (th === CUT ? [] : [th - 2.5, th + 2.5])), 360];
	PF.forEach(([R, z, w, h], pi) => {
		for (let i = 0; i < cuts.length - 1; i++) {
			const [a, b] = [cuts[i]!, cuts[i + 1]!];
			add(`pf${pi + 1}-${i}`, keyOf((a + b) / 2, R), S(revolve(rect(R, z, w, h), a, b, Math.max(1, Math.round((b - a) / 5)), { joined: true, hull: true }), { tone: 'mid' }));
		}
	});
	add('section', keyOf(CUT, 0) + 900, section());
	return items;
}

function csSeams(): string {
	// Joints between the six modules: arcs round the visible skin, ending on the cut and on the far silhouette.
	const out: string[] = [];
	for (let m = 1; m < CS.modules; m++) {
		const z = -CS.top + (2 * CS.top * m) / CS.modules;
		const pts: Flat[] = [];
		for (let th = CUT; th <= 360; th += 4) if (k.dot3(eR(th), V) > 0) pts.push(at(W(CS.r1, th, z)));
		out.push(L(k.pathOf(pts), { tone: 'faint' }));
	}
	return out.join('');
}

function support(th: number): string {
	const F = coilFrame(th);
	const foot = plate(F, rect(6.0, BASE_TOP + 0.08, 2.6, 0.16), -0.7, 0.7);
	const leg = plate(F, rect(6.0, (BASE_TOP + 0.16 - 7.0) / 2, 1.4, -7.0 - BASE_TOP - 0.16 + 0.02), -0.4, 0.4);
	return S(foot, { tone: 'lo' }) + S(leg, { tone: 'mid' });
}

/** The cut face at th = CUT: every part's section, flush in one plane. */
function section(): string {
	const out: string[] = [];
	// Toroidal field coil: case, and the winding pack inside it.
	out.push(faceSvg('tok-case', onSection(TF_OUT()) + onSection(TF_IN())));
	out.push(faceSvg('tok-wp', onSection(TF_WP()) + onSection(TF_WP_IN()), 'lo'));
	// Vessel: two skins with shielding between.
	out.push(faceSvg('tok-cut', onSection(VO()) + onSection(VI())));
	out.push(faceSvg('tok-shield', onSection(dee(3.1, 9.35, 4.55, -5.75, 0.4, 4, 2.2)) + onSection(dee(3.35, 8.95, 4.3, -5.5, 0.4, 4, 2.2)), 'lo'));
	// Inside the vessel: the dark hollow, the blanket modules and the divertor.
	out.push(`<path class="tok-face tok-cavity" d="${onSection(VI())}"/>`);
	out.push(blanketFace());
	out.push(divertorFace());
	// Poloidal field coils and the central solenoid.
	for (const [R, z, w, h] of PF) {
		out.push(faceSvg('tok-wp', onSection(rect(R, z, w, h))));
		const dots: Flat[] = [];
		for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) dots.push(onCut(R - w / 3 + (w / 3) * i, z - h / 3 + (h / 3) * j));
		out.push(D(dots, { size: 0.45, tone: 'mid' }));
	}
	out.push(faceSvg('tok-core', onSection(rect(CS.r0 / 2, 0, CS.r0, CS.top * 2))));
	for (let m = 0; m < CS.modules; m++) {
		const h = (2 * CS.top) / CS.modules;
		out.push(faceSvg('tok-wp', onSection(rect((CS.r0 + CS.r1) / 2, -CS.top + h * (m + 0.5), CS.r1 - CS.r0, h - 0.08))));
	}
	return `<g class="tok-section">${out.join('')}</g>`;
}

function blanketFace(): string {
	const out: string[] = [];
	const fw = dee(3.95, 8.4, 3.75, -4.7, 0.4, 4, 2.2, 360);
	const vi = dee(3.45, 8.85, 4.2, -5.4, 0.4, 4, 2.2, 360);
	// Modules run from the outboard foot of the blanket, over the top, to the inboard foot.
	const from = (-28 * Math.PI) / 180;
	const to = Math.PI + (32 * Math.PI) / 180;
	const count = 16;
	const gap = 0.012;
	const pick = (ring: Ring2, t: number) => ring[Math.round((((t % TAU) + TAU) % TAU) / TAU * 360) % 360]!;
	for (let m = 0; m < count; m++) {
		const t0 = from + ((to - from) * m) / count + gap;
		const t1 = from + ((to - from) * (m + 1)) / count - gap;
		const ts = Array.from({ length: 7 }, (_, i) => t0 + ((t1 - t0) * i) / 6);
		const ring = [...ts.map((t) => pick(fw, t)), ...ts.reverse().map((t) => pick(vi, t))];
		out.push(faceSvg('tok-blanket', onSection(ring)));
	}
	return out.join('');
}

function divertorFace(): string {
	const out: string[] = [];
	const thick = (pts: Ring2, w: number): Ring2 => {
		// A polyline thickened to one side (away from the plasma, +R inboard, -R outboard handled by sign of w).
		const side = pts.map(([R, z], i) => {
			const [a, b] = [pts[Math.max(0, i - 1)]!, pts[Math.min(pts.length - 1, i + 1)]!];
			const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
			return [R + (w * (b[1] - a[1])) / len, z - (w * (b[0] - a[0])) / len] as Flat;
		});
		return [...pts, ...side.reverse()];
	};
	out.push(faceSvg('tok-div', onSection([[4.15, -5.36], [6.75, -5.36], [6.75, -4.9], [4.15, -4.9]])));
	out.push(faceSvg('tok-div', onSection(thick([[4.0, -3.5], [4.35, -3.95], [4.88, -4.9]], -0.24))));
	out.push(faceSvg('tok-div', onSection(thick([[7.25, -3.72], [6.55, -4.05], [6.0, -4.9]], 0.24))));
	// The edge's open field lines (the separatrix legs) run from the X-point down onto the targets.
	out.push(`<g class="tok-legs">${L(k.pathOf([onCut(...XPT), onCut(...STRIKE_IN)]) + k.pathOf([onCut(...XPT), onCut(...STRIKE_OUT)]), { tone: 'lit' })}${D([onCut(...STRIKE_IN), onCut(...STRIKE_OUT)], { size: 0.7, tone: 'hi' })}</g>`);
	out.push(faceSvg('tok-div', onSection([[5.0, -4.42], [5.42, -4.32], [5.84, -4.46], [5.84, -4.6], [5.5, -4.52], [5.5, -4.9], [5.34, -4.9], [5.34, -4.52], [5.0, -4.58]])));
	return out.join('');
}

// ---- heating beam injector -----------------------------------------------------

/** The beam runs tangent to a circle of radius BEAM.rt round the axis, entering through the port between the coils at th 290 and 310. */
const BEAM = { rt: 5.3, psi: 241.6, port: 9.3, valve: 10.9, box: 12.4, end: 15.6, w: 1.1, h: 1.4 };
const beamS = (r: number) => Math.sqrt(r * r - BEAM.rt * BEAM.rt);
const beamFrame = (): k.Frame => ({ o: k.mul3(eR(BEAM.psi), BEAM.rt), a: ePhi(BEAM.psi), u: eR(BEAM.psi), v: [0, 0, 1] });
const beamAt = (r: number, u = 0, v = 0) => k.pointOf(beamFrame(), beamS(r), u, v);
const box2 = (w: number, h: number, z = 0): Ring2 => rect(0, z, w, h);

function injector(): Item[] {
	const F = beamFrame();
	const [s0, s1, s2, s3] = [beamS(BEAM.port), beamS(BEAM.valve), beamS(BEAM.box), beamS(BEAM.end)];
	const items: Item[] = [];
	const duct = S(plate(F, box2(BEAM.w, BEAM.h), s0, s1 - 0.25), { tone: 'mid' });
	const flange = S(plate(F, box2(BEAM.w + 0.5, BEAM.h + 0.5), s0 + 0.35, s0 + 0.55), { tone: 'mid' });
	const valve = S(plate(F, box2(BEAM.w + 0.7, BEAM.h + 0.9), s1 - 0.25, s1 + 0.35), { tone: 'mid' });
	const bellows: string[] = [];
	for (let i = 0; i < 4; i++) bellows.push(S(plate(F, box2(BEAM.w + 0.22, BEAM.h + 0.22), s1 + 0.55 + i * 0.28, s1 + 0.67 + i * 0.28), { tone: 'mid', crease: 'none' }));
	const neck = S(plate(F, box2(BEAM.w, BEAM.h), s1 + 0.35, s2), { tone: 'mid', crease: 'none' });
	items.push({ id: 'nbi-duct', key: keyOf(300, 11.9), svg: duct + flange + valve + neck + bellows.join('') + beamLine() });
	// The beam box (neutraliser and ion dump) on a stand, and the ion source can at its back.
	const BOX = { w: 2.6, h: 2.8 };
	const legs: string[] = [];
	for (const s of [s2 + 0.7, s3 - 0.7])
		for (const u of [-0.8, 0.8]) {
			const o = k.pointOf(F, s, u, 0);
			legs.push(S(k.prismOf(k.axisFrame([o[0], o[1], PLATE_TOP], 'z'), k.circlePolygon(0.22, 16), 0, -BOX.h / 2 - PLATE_TOP, P), { tone: 'lo', crease: 'none' }));
			legs.push(S(k.prismOf(k.axisFrame([o[0], o[1], PLATE_TOP], 'z'), k.circlePolygon(0.42, 20), 0, 0.12, P), { tone: 'lo' }));
		}
	const box = S(plate(F, box2(BOX.w, BOX.h), s2, s3), { tone: 'mid', inner: '' });
	const seams = [s2 + 1.1, s3 - 1.1].map((s) => L(k.pathOf([at(k.pointOf(F, s, -BOX.w / 2, BOX.h / 2)), at(k.pointOf(F, s, BOX.w / 2, BOX.h / 2)), at(k.pointOf(F, s, BOX.w / 2, -BOX.h / 2))]), { tone: 'faint' })).join('');
	const lid = S(plate(F, box2(BOX.w + 0.24, 0.16, BOX.h / 2 + 0.08), s2 - 0.12, s3 + 0.12), { tone: 'mid' });
	const can = S(k.prismOf(F, k.circlePolygon(0.95, 28), s3, s3 + 1.1, P), { tone: 'mid' }) + S(k.prismOf(F, k.circlePolygon(1.12, 28), s3 + 1.1, s3 + 1.3, P), { tone: 'mid' });
	const bolts = Array.from({ length: 10 }, (_, i) => at(k.pointOf(F, s3 + 1.3, 0.98 * Math.cos((i / 10) * TAU), 0.98 * Math.sin((i / 10) * TAU))));
	items.push({ id: 'nbi-stand', key: keyOf(310, 13.9), svg: legs.join('') });
	items.push({ id: 'nbi-box', key: keyOf(310, 14), svg: box + seams + lid + can + D(bolts, { size: 0.45 }) });
	return items;
}

/** The beam's path, drawn as dashes along the duct's roof from the gate valve to the port flange. */
function beamLine(): string {
	const pts = [BEAM.valve - 0.3, BEAM.port + 0.6].map((r) => at(beamAt(r, 0, BEAM.h / 2)));
	return `<path class="iso-line tok-beam" data-flow-id="beam" d="${k.pathOf(pts)}"/>`;
}

/** Equatorial ports: short ducts out through the gaps between coils, closed by bolted flanges. */
function port(th: number): Item {
	const F: k.Frame = { o: [0, 0, 0], a: eR(th), u: ePhi(th), v: [0, 0, 1] };
	const duct = S(plate(F, box2(1.0, 1.5), 9.0, 10.15), { tone: 'mid' });
	const flange = S(plate(F, box2(1.5, 2.0), 10.15, 10.35), { tone: 'mid' });
	const bolts: Flat[] = [];
	for (const [u, v] of [[-0.6, -0.85], [0, -0.85], [0.6, -0.85], [-0.6, 0.85], [0, 0.85], [0.6, 0.85], [-0.6, 0], [0.6, 0]] as const) bolts.push(at(k.pointOf(F, 10.35, u, v)));
	return { id: `port-${th}`, key: keyOf(th, 9.8), svg: duct + flange + D(bolts, { size: 0.45 }) };
}

// ---- moving parts -----------------------------------------------------------------

export interface Drive {
	/** Particle travel round the ring, in turns of the visible stub. */
	stream: number;
	/** Poloidal turn of the dots on the plasma's end, in turns at q = 1. */
	turn: number;
	/** Beam dash travel, figure units. */
	beam: number;
}

/** Still frame for reduced motion and the default export. */
export const STILL: Drive = { stream: 0.15, turn: 0.1, beam: 0 };

/** Drive `t` seconds in at steady parameters. */
export function driveAt(params: TokamakParams, t: number): Drive {
	const s = solve(params);
	return { stream: STILL.stream + t * streamSpeedOf(s), turn: STILL.turn + t * 0.05, beam: STILL.beam + t * beamSpeedOf(params) };
}

/** A point on magnetic surface rho at poloidal angle u (radians), at th. */
function onSurface(rho: number, u: number, th: number): Point3 {
	const ring = surface(rho, 360);
	const [R, z] = ring[Math.floor(((((u / TAU) % 1) + 1) % 1) * 360) % 360]!;
	return W(R, th, z);
}

const STREAM_LINES = 14;

let BODY = '';
function plasmaItems(params: TokamakParams, drive: Drive): Item[] {
	BODY ||= S(revolve(surface(1), PLASMA_END, CUT, 4, { start: true }), { tone: 'hi', lit: true, className: 'tok-plasma' });
	return [{ id: 'plasma', key: keyOf((PLASMA_END + CUT) / 2, PL.R), svg: BODY + fieldLines(params, drive) + plasmaFace(params, drive) }];
}

/** Twisted field lines on the plasma's skin, and particles running along them. */
function fieldLines(params: TokamakParams, drive: Drive): string {
	const twist = twistAt(params, 1);
	const lines: string[] = [];
	const dots: Flat[] = [];
	const steps = 12;
	const facing = (u: number, th: number) => {
		const a = onSurface(1, u - 0.02, th);
		const b = onSurface(1, u + 0.02, th);
		const tangent = k.sub3(b, a);
		const normal = k.cross3(tangent, ePhi(th));
		return k.dot3(normal, V) > 0;
	};
	for (let i = 0; i < STREAM_LINES; i++) {
		const u0 = (i / STREAM_LINES) * TAU;
		const uAt = (th: number) => u0 + (th - PLASMA_END) * DEG * twist;
		let run: Flat[] = [];
		const flush = () => {
			if (run.length > 1) lines.push(k.fadeLineSvg(run, { fade: [1.5, 1.5], tone: 'lit' }));
			run = [];
		};
		for (let j = 0; j <= steps; j++) {
			const th = PLASMA_END + ((CUT - PLASMA_END) * j) / steps;
			if (facing(uAt(th), th)) run.push(at(onSurface(1, uAt(th), th)));
			else flush();
		}
		flush();
		for (let m = 0; m < 2; m++) {
			const f = ((((drive.stream + m / 2 + i * 0.37) % 1) + 1) % 1);
			const th = CUT - f * (CUT - PLASMA_END);
			if (facing(uAt(th), th)) dots.push(at(onSurface(1, uAt(th), th)));
		}
	}
	return `<g class="tok-field">${lines.join('')}${D(dots, { size: 0.7, tone: 'hi' })}</g>`;
}

function plasmaFace(params: TokamakParams, drive: Drive): string {
	const out: string[] = [];
	[0.8, 0.6, 0.4, 0.2].forEach((rho, i) => out.push(`<path class="tok-flux" data-level="${i + 1}" d="${onSection(surface(rho), PLASMA_END)}"/>`));
	// Dots on each surface, turning at that surface's field-line pitch: faster near the core, the magnetic shear.
	const dots: Flat[] = [];
	for (const rho of [0.9, 0.7, 0.5, 0.3]) {
		const turn = drive.turn * twistAt(params, rho);
		const ring = surface(rho, 360);
		const count = Math.round(4 + rho * 10);
		for (let i = 0; i < count; i++) {
			const a = ((((i / count + turn) % 1) + 1) % 1);
			const [R, z] = ring[Math.floor(a * 360) % 360]!;
			dots.push(onCut(R, z, PLASMA_END));
		}
	}
	out.push(D(dots, { size: 0.6, tone: 'hi' }));
	out.push(D([onCut(PL.R + PL.shift, 0, PLASMA_END)], { size: 0.9, tone: 'hi' }));
	return `<g class="tok-core-face">${out.join('')}</g>`;
}

// ---- assembly ------------------------------------------------------------------

function ready() {
	if (P) return;
	const probe: Point3[] = [...k.boxCorners(PLATE, PLATE_TOP - PLATE_H - FOOT_H, PLATE_TOP)];
	for (let th = 0; th < 360; th += 15) probe.push(W(11.8, th, 7.5), W(11.8, th, -7));
	P = k.fitProjection(probe, WIDTH, HEIGHT, { pad: 14, azimuth: AZIMUTH });
	V = k.viewOf(P);
	LIGHT = k.lightOf(P);
	STATIC = [...staticItems(), ...injector(), ...KEPT.slice(0, -1).map((th) => th + 10).filter((th) => th !== 300).map(port)];
}

function itemsOf(params: TokamakParams, drive: Drive): Item[] {
	ready();
	return [...STATIC, ...plasmaItems(params, drive)].sort((a, b) => a.key - b.key);
}

export const TOKAMAK_CSS = `
.iso[data-figure-host]{--tok-plasma:#d4357f;--tok-cavity:#d2d2cd;--tok-heat:.85}
.iso[data-theme="dark"][data-figure-host]{--tok-plasma:#ff74c0;--tok-cavity:#141412}
.tok-face{stroke:none}
.tok-cut{fill:var(--anatomy-top)}
.tok-case{fill:var(--anatomy-shade-1)}
.tok-wp{fill:var(--anatomy-shade-2)}
.tok-shield{fill:var(--anatomy-shade-3)}
.tok-core{fill:var(--anatomy-shade-0)}
.tok-blanket{fill:var(--anatomy-shade-2)}
.tok-div{fill:var(--anatomy-shade-0)}
.tok-cavity{fill:var(--tok-cavity)}
.iso-solid.tok-plasma>.iso-fill,.iso-solid.tok-plasma[data-lit]>.iso-shade,.iso-solid.tok-plasma[data-lit]>.iso-top{fill:color-mix(in srgb,var(--tok-plasma) calc(var(--tok-heat) * 34%),var(--anatomy-paper))}
.iso-solid.tok-plasma[data-lit]>.iso-shade[data-shade="0"],.iso-solid.tok-plasma[data-lit]>.iso-shade[data-shade="1"]{fill:color-mix(in srgb,var(--tok-plasma) calc(var(--tok-heat) * 48%),var(--anatomy-paper))}
.iso-solid.tok-plasma[data-lit]>.iso-shade,.iso-solid.tok-plasma[data-lit]>.iso-top{stroke:none}
.iso-solid.tok-plasma[data-lit]>.iso-edge{stroke:color-mix(in srgb,var(--tok-plasma) 70%,var(--anatomy-hi))}
.tok-flux{fill:color-mix(in srgb,var(--tok-plasma) calc(var(--tok-heat) * 28%),transparent);stroke:color-mix(in srgb,var(--tok-plasma) 60%,transparent);stroke-width:.5}
.tok-field{--anatomy-lit:color-mix(in srgb,var(--tok-plasma) 75%,var(--anatomy-hi))}
.tok-field .iso-line{stroke-opacity:.6}
.tok-field .iso-dots circle,.tok-core-face .iso-dots circle{fill:color-mix(in srgb,var(--tok-plasma) 30%,var(--anatomy-hi))}
.tok-legs .iso-line{stroke:var(--tok-plasma);stroke-opacity:.8}
.tok-legs .iso-dots circle{fill:var(--tok-plasma)}
.tok-beam{stroke:var(--tok-plasma);stroke-dasharray:1.6 3;stroke-width:1}
`;

export const LABEL = 'A tokamak fusion reactor cut open: central solenoid, D-shaped toroidal field coils, poloidal field coils, the vacuum vessel with its blanket and divertor, a heating beam injector, and a ring of glowing plasma.';

const wrap = (item: Item) => `<g data-item="${item.id}">${item.svg}</g>`;
const heatOf = (params: TokamakParams) => (0.3 + 0.7 * glowOf(solve(params))).toFixed(2);

/** The whole figure as an SVG string, framed to everything it draws. */
export function tokamakSvg(params: TokamakParams = clampParams(), drive: Drive = STILL, standalone: k.Theme | false = false): string {
	return framed(rawSvg(params, drive, standalone), frame());
}

function rawSvg(params: TokamakParams, drive: Drive, standalone: k.Theme | false): string {
	ready();
	const svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL, body: itemsOf(params, drive).map(wrap).join(''), standalone });
	if (!standalone) return svg;
	return svg
		.replace('</style>', `${PAPER_CSS}${TOKAMAK_CSS}</style>`)
		.replace('class="iso-svg iso"', `class="iso-svg iso" data-figure-host="tokamak" style="--tok-heat:${heatOf(params)};--beam-at:${(-drive.beam).toFixed(1)}"`)
		.replace('data-flow-id="beam"', `data-flow-id="beam" stroke-dashoffset="${(-drive.beam).toFixed(1)}"`);
}

let FRAME: FrameBox | null = null;
/** The viewBox: the still frame plus the pins (the moving parts stay inside the plasma's outline). */
function frame(): FrameBox {
	if (FRAME) return FRAME;
	FRAME = frameOf([rawSvg(clampParams(), STILL, false)], anchorPoints().map(([, , p]) => at(p)));
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
	return [
		['plasma', 'Plasma', W(PL.R + PL.shift, PLASMA_END, 0)],
		['central-solenoid', 'Central solenoid', W(1.6, CUT, 3)],
		['tf-coil', 'Toroidal field coil', W(10.2, CUT, 1.5)],
		['pf-coil', 'Poloidal field coil', W(PF[2]![0], CUT, PF[2]![1])],
		['vacuum-vessel', 'Vacuum vessel', W(9.15, CUT, -2)],
		['blanket', 'Blanket', W(8.6, CUT, 1.8)],
		['divertor', 'Divertor', W(5.9, CUT, -5.1)],
		['heating-beam', 'Heating beam', beamAt((BEAM.box + BEAM.end) / 2, 0, 1.4)],
		['port', 'Port', W(10.35, 340, 0)]
	];
}

// ---- live mount ---------------------------------------------------------------

export interface MountOptions {
	theme?: k.Theme;
	params?: Partial<TokamakParams>;
	onReadout?: (values: Record<string, string>) => void;
}

export interface FigureHandle {
	update(params: Partial<Record<string, number>>): void;
	setTheme(theme: k.Theme): void;
	/** Park the plasma `t` seconds in and stop the loop (captures, tests). */
	seek(t: number): void;
	destroy(): void;
}

const STYLE_ID = 'ripple-iso-tokamak-css';

export function mount(el: HTMLElement, { theme = 'dark', params: initial, onReadout }: MountOptions = {}): FigureHandle {
	const doc = el.ownerDocument;
	if (!doc.getElementById(STYLE_ID)) {
		const style = doc.createElement('style');
		style.id = STYLE_ID;
		style.textContent = k.ISO_CSS + PAPER_CSS + TOKAMAK_CSS;
		doc.head.appendChild(style);
	}
	let params = clampParams(initial);
	const svg = doc.importNode(new DOMParser().parseFromString(tokamakSvg(params), 'image/svg+xml').documentElement, true) as unknown as SVGSVGElement;
	el.classList.add('iso');
	el.dataset.figureHost = 'tokamak';
	el.dataset.theme = theme;
	el.replaceChildren(svg);
	const plasma = svg.querySelector<SVGGElement>('[data-item="plasma"]');
	const beam = svg.querySelector<SVGPathElement>('[data-flow-id="beam"]');
	let shown = '';

	const win = doc.defaultView;
	const still = win?.matchMedia?.('(prefers-reduced-motion: reduce)');
	const drive: Drive = { ...STILL };
	let parked = false;
	let lastKey = '';

	function draw() {
		const body = plasmaItems(params, drive)[0]!.svg;
		if (plasma && body !== shown) {
			plasma.innerHTML = body;
			shown = body;
		}
		beam?.setAttribute('stroke-dashoffset', (-drive.beam).toFixed(1));
		const readouts = readoutsOf(params);
		const key = JSON.stringify(readouts);
		if (key !== lastKey) {
			lastKey = key;
			el.style.setProperty('--tok-heat', heatOf(params));
			onReadout?.(readouts);
			svg.setAttribute('aria-label', describe(params));
		}
	}

	function advance(dt: number) {
		const next = driveAt(params, dt);
		drive.stream += next.stream - STILL.stream;
		drive.turn += next.turn - STILL.turn;
		drive.beam += next.beam - STILL.beam;
	}

	let raf = 0;
	let last = 0;
	let visible = true;
	const loop = (now: number) => {
		const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
		last = now;
		advance(dt);
		draw();
		raf = win!.requestAnimationFrame(loop);
	};
	const stop = () => {
		if (raf) win?.cancelAnimationFrame(raf);
		raf = 0;
	};
	const run = () => {
		if (raf || parked || !visible || doc.hidden || still?.matches || !win?.requestAnimationFrame) return;
		last = 0;
		raf = win.requestAnimationFrame(loop);
	};
	const sync = () => (visible && !doc.hidden && !still?.matches && !parked ? run() : stop());
	const io = win && 'IntersectionObserver' in win ? new win.IntersectionObserver((entries) => ((visible = entries[entries.length - 1]!.isIntersecting), sync())) : null;
	io?.observe(el);
	doc.addEventListener('visibilitychange', sync);
	const onStill = () => {
		draw();
		sync();
	};
	still?.addEventListener?.('change', onStill);
	draw();
	run();

	return {
		update(next) {
			params = clampParams({ ...params, ...next });
			draw();
		},
		setTheme(next) {
			el.dataset.theme = next;
		},
		seek(t) {
			parked = true;
			stop();
			Object.assign(drive, driveAt(params, t));
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
