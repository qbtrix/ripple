/**
 * @file iso/scene.ts
 * @description The `iso-scene` model: a model-written parts list turned into
 * drawn, depth-sorted items on the iso kit. Three steps, all pure:
 *   1. `normalizeScene` clamps every number, caps counts, skips unknown kinds,
 *      resolves `on` parents (cycles and dangling ids become no parent), lays
 *      a `chain` round its two gears and marks ghosts (see-through housings).
 *   2. `sceneTransforms` turns motions at time t into one affine per part
 *      (a child moves with its parent; a `link` rod rides two parts; a slide
 *      `driven` by a crank follows it). Speeds come in already resolved.
 *   3. `drawPart` + `mergeOwned` + `sortItems` draw each part from its moved
 *      frame, fold `enrichScene`'s derived detail into its owner, and order
 *      them back to front (bounding-box separation first, centre depth when
 *      boxes overlap).
 * Parts are drawn from 3D geometry every time, so a spinning gear re-shades as
 * it turns. Only numbers and plain text go in; only path data comes out.
 */

import { depthOf, fitProjection, iso, pathOf, roundedPlan, topMatrix, type Flat, type Point3, type Projection, type SolidPaths } from './kit.js';
import { add3, axisFrame, pointOf, circlePolygon, coneOf, cross3, dot3, frameAlong, gearRing, len3, mul3, prismOf, sphereOf, sub3, unit3, viewOf, type Frame } from './solids.js';

export const ISO_KINDS = ['slab', 'box', 'cylinder', 'disc', 'gear', 'tube', 'sphere', 'cone', 'rod', 'arrow', 'plate', 'chain'] as const;
export const ISO_ROLES = ['neutral', 'accent', 'red', 'blue', 'green', 'amber', 'metal'] as const;
export const ISO_MOTIONS = ['spin', 'slide', 'swing', 'pulse', 'flow', 'link'] as const;
export const ISO_LIMITS = { parts: 150, motions: 20, params: 6, readouts: 4, labels: 10, pathPoints: 64, text: 60, coord: 500, size: 400, speed: 20 } as const;

export type IsoKind = (typeof ISO_KINDS)[number];
export type IsoRole = (typeof ISO_ROLES)[number];
export type IsoMotionKind = (typeof ISO_MOTIONS)[number];
type Axis = 'x' | 'y' | 'z';

export interface IsoPart {
	id: string;
	kind: IsoKind;
	at: Point3;
	w: number;
	d: number;
	h: number;
	r: number;
	teeth: number;
	axis: Axis;
	path: Point3[];
	from: Point3;
	to: Point3;
	label: string;
	color: IsoRole;
	/**
	 * `knurl` rings a cylinder's side, `none` opts the part out of automatic
	 * detail; `bolt` (a slot) and `ruler` (ticks) are set on derived parts only.
	 */
	detail: '' | 'knurl' | 'none' | 'bolt' | 'ruler';
	texture: '' | 'guilloche' | 'ribs';
	/** Parent part index, or -1. */
	on: number;
	/** Set by `enrichScene`: draw this part's own detail strokes (gear holes, box seam and label plate). */
	rich: boolean;
	/** Part of a chain drive: a tube drawn as links, or the chainring that gets spider arms. */
	chain: boolean;
	/** Derived parts only: the model part this detail belongs to (-1 for a model part), drawn under or over it. */
	owner: number;
	under: boolean;
	/** chain: the two gears it wraps (indices), else empty. Its `path` is then the loop in world space and `w` the link pitch. */
	around: number[];
	/** Drawn see-through (faint fill and outline), so moving parts inside show. */
	ghost: boolean;
}

export interface IsoMotion {
	part: number;
	kind: IsoMotionKind;
	axis: Axis;
	/** As written: a number or an expression string. The host resolves it. */
	speed: unknown;
	/** Amplitude, and the centre it swings or slides about (a `[min, max]` range sets both). */
	range: number;
	offset: number;
	phase: number;
	/** link: the parts the rod's two ends ride on. slide: the spinning part that drives it (crank-slider) and its crank throw. */
	from: number;
	to: number;
	driven: number;
	throw: number;
}

export interface IsoScene {
	parts: IsoPart[];
	motions: IsoMotion[];
}

export interface IsoShape {
	cls: 'halo' | 'fill' | 'ghost' | 'shade' | 'top' | 'rim' | 'bevel' | 'detail' | 'screw' | 'hole' | 'texture' | 'crease' | 'edge' | 'tube-edge' | 'tube' | 'tube-hi' | 'link-edge' | 'link' | 'pin' | 'line' | 'flow' | 'text';
	d: string;
	band?: number;
	width?: number;
	dash?: number;
	/** stroke-dasharray in screen px (chain links); its period divides 240 so flow offsets wrap cleanly. */
	pattern?: string;
	text?: string;
	transform?: string;
	size?: number;
}

export interface IsoItem {
	part: number;
	role: IsoRole;
	depth: number;
	/** World AABB [min, max] and screen box [x0, y0, x1, y1], for sorting. */
	box: [Point3, Point3];
	screen: [number, number, number, number];
	shapes: IsoShape[];
	/** The part's own silhouette, for the host's contact shadow. */
	halo?: string;
}

export interface Affine {
	m: number[];
	t: Point3;
}

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function clampNum(v: unknown, lo: number, hi: number, fallback: number): number {
	const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
	return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

export function plainText(v: unknown, max: number = ISO_LIMITS.text): string {
	if (typeof v !== 'string' && typeof v !== 'number') return '';
	return String(v).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
}

function vec(v: unknown, fallback: Point3 | null): Point3 | null {
	if (!Array.isArray(v) || v.length < 2) return fallback;
	const c = ISO_LIMITS.coord;
	return [clampNum(v[0], -c, c, 0), clampNum(v[1], -c, c, 0), clampNum(v[2], -c, c, 0)];
}

const axisOf = (v: unknown, fallback: Axis): Axis => (v === 'x' || v === 'y' || v === 'z' ? v : fallback);

/** Clamp a resolved motion speed (turns or cycles per second). */
export const clampSpeed = (v: unknown) => clampNum(v, -ISO_LIMITS.speed, ISO_LIMITS.speed, 0);

export function normalizeScene(rawParts: unknown, rawMotions?: unknown): IsoScene {
	const S = ISO_LIMITS.size;
	const parts: IsoPart[] = [];
	const parents: unknown[] = [];
	const arounds: unknown[] = [];
	const ghosts: unknown[] = [];
	for (const raw of Array.isArray(rawParts) ? rawParts : []) {
		if (parts.length >= ISO_LIMITS.parts) break;
		if (!isObj(raw) || !(ISO_KINDS as readonly string[]).includes(raw.kind as string)) continue;
		const kind = raw.kind as IsoKind;
		const path = (Array.isArray(raw.path) ? raw.path : [])
			.slice(0, ISO_LIMITS.pathPoints)
			.map((p) => vec(p, null))
			.filter((p): p is Point3 => p !== null);
		if (kind === 'tube' && path.length < 2) continue;
		const from = vec(raw.from, null);
		const to = vec(raw.to, null);
		if ((kind === 'rod' || kind === 'arrow') && (!from || !to)) continue;
		const round = kind === 'cylinder' || kind === 'disc' || kind === 'gear' || kind === 'sphere' || kind === 'cone';
		parts.push({
			id: plainText(raw.id, 40) || `part-${parts.length}`,
			kind,
			at: vec(raw.at, [0, 0, 0])!,
			w: clampNum(raw.w, 0.5, S, 20),
			d: clampNum(raw.d, 0.5, S, kind === 'plate' ? 14 : 20),
			h: clampNum(raw.h, 0.5, S, kind === 'disc' || kind === 'gear' ? 3 : kind === 'plate' ? 1.2 : round ? 12 : 8),
			r: clampNum(raw.r, 0.3, S / 2, kind === 'tube' || kind === 'rod' ? 2 : kind === 'chain' ? 1.5 : kind === 'slab' ? 3 : 10),
			teeth: Math.round(clampNum(raw.teeth, 6, 64, 18)),
			axis: axisOf(raw.axis, 'z'),
			path,
			from: from ?? [0, 0, 0],
			to: to ?? [0, 0, 0],
			label: plainText(raw.label, 24),
			color: (ISO_ROLES as readonly string[]).includes(raw.color as string) ? (raw.color as IsoRole) : kind === 'gear' || kind === 'rod' ? 'metal' : 'neutral',
			detail: raw.detail === 'knurl' || raw.detail === 'knob' ? 'knurl' : raw.detail === 'none' ? 'none' : '',
			texture: raw.texture === 'guilloche' || raw.texture === 'ribs' ? raw.texture : '',
			on: -1,
			rich: false,
			chain: false,
			owner: -1,
			under: false,
			around: [],
			ghost: false
		});
		parents.push(raw.on);
		arounds.push(raw.around);
		ghosts.push(raw.ghost);
	}
	const byId = new Map(parts.map((p, i) => [p.id, i]));
	parts.forEach((p, i) => {
		const parent = typeof parents[i] === 'string' ? byId.get(parents[i] as string) : undefined;
		if (parent !== undefined && parent !== i) p.on = parent;
	});
	// Break cycles: walk up; a loop back to the start drops the link.
	parts.forEach((p, i) => {
		let at = p.on;
		for (let hops = 0; at >= 0 && hops <= parts.length; hops++) {
			if (at === i) {
				p.on = -1;
				break;
			}
			at = parts[at]!.on;
		}
	});
	// Chains: `around` two gears, or a tube the model named a chain, around the two gears nearest it.
	const gears = parts.flatMap((p, i) => (p.kind === 'gear' || p.kind === 'disc' ? [i] : []));
	parts.forEach((p, i) => {
		let around: number[] = [];
		if (p.kind === 'chain' && Array.isArray(arounds[i])) around = (arounds[i] as unknown[]).slice(0, 2).map((id) => (typeof id === 'string' ? (byId.get(id) ?? -1) : -1));
		else if (p.kind === 'tube' && gears.length >= 2 && /chain/i.test(`${p.id} ${p.label}`)) {
			const gap = (g: number) => Math.min(...p.path.map((q) => Math.abs(len3(sub3(add3(p.at, q), parts[g]!.at)) - parts[g]!.r)));
			around = [...gears].sort((a, b) => gap(a) - gap(b) || a - b).slice(0, 2).sort((a, b) => a - b);
			p.kind = 'chain';
		}
		if (p.kind !== 'chain') return;
		const ok = around.length === 2 && around[0] !== around[1] && around.every((g) => gears.includes(g));
		p.around = ok ? around : [];
		p.path = ok ? chainPath(p, parts[around[0]!]!, parts[around[1]!]!) : [];
		p.at = [0, 0, 0];
		const A = ok ? parts[around[0]!]! : undefined;
		p.w = A && A.kind === 'gear' ? (TAU * pitchRadius(A)) / A.teeth : p.r * 4;
	});
	const motions: IsoMotion[] = [];
	for (const raw of Array.isArray(rawMotions) ? rawMotions : []) {
		if (motions.length >= ISO_LIMITS.motions) break;
		if (!isObj(raw) || !(ISO_MOTIONS as readonly string[]).includes(raw.kind as string)) continue;
		const part = typeof raw.part === 'string' ? byId.get(raw.part) : undefined;
		if (part === undefined) continue;
		const kind = raw.kind as IsoMotionKind;
		const fallbackRange = kind === 'swing' ? 25 : kind === 'slide' ? 8 : kind === 'pulse' ? 0.12 : 0;
		const maxRange = kind === 'swing' ? 180 : kind === 'pulse' ? 0.6 : ISO_LIMITS.size;
		const ref = (v: unknown) => (typeof v === 'string' ? (byId.get(v) ?? -1) : -1);
		const from = ref(raw.from);
		const to = ref(raw.to);
		if (kind === 'link' && (parts[part]!.kind !== 'rod' || from < 0 || to < 0)) continue;
		// A [min, max] range oscillates between the two: amplitude half the span, about the midpoint.
		const pair = Array.isArray(raw.range) && raw.range.length >= 2 ? [clampNum(raw.range[0], -maxRange, maxRange, 0), clampNum(raw.range[1], -maxRange, maxRange, 0)] : null;
		const range = pair ? (kind === 'pulse' ? Math.min(maxRange, Math.abs(pair[1]! - pair[0]!)) : Math.abs(pair[1]! - pair[0]!) / 2) : clampNum(raw.range, 0, maxRange, fallbackRange);
		const driven = kind === 'slide' ? ref(raw.driven) : -1;
		motions.push({
			part,
			kind,
			axis: axisOf(raw.axis, parts[part]!.axis),
			speed: typeof raw.speed === 'number' || typeof raw.speed === 'string' ? raw.speed : 0.5,
			range,
			offset: pair && kind !== 'pulse' ? (pair[0]! + pair[1]!) / 2 : 0,
			phase: clampNum(raw.phase, -1, 1, 0),
			from,
			to,
			driven: driven === part ? -1 : driven,
			throw: clampNum(raw.throw, 0, ISO_LIMITS.size, range || 8)
		});
	}
	// See-through: asked for, or (unless ghost: false) a solid that fully holds a part that moves on its own.
	const scene = { parts, motions };
	const moving = movingParts(scene);
	if (moving.some(Boolean)) {
		const unit: Projection = { origin: [0, 0], scale: 1 };
		const boxes = parts.map((p, i) => drawPart(i, p, IDENTITY, unit).box);
		const rides = (j: number, i: number) => {
			for (let at = parts[j]!.on, hops = 0; at >= 0 && hops < 64; at = parts[at]!.on, hops++) if (at === i) return true;
			return false;
		};
		const holds = (i: number, j: number) => [0, 1, 2].every((k) => boxes[j]![0][k]! >= boxes[i]![0][k]! - 0.5 && boxes[j]![1][k]! <= boxes[i]![1][k]! + 0.5);
		parts.forEach((p, i) => {
			const solid = p.kind === 'box' || p.kind === 'cylinder' || p.kind === 'sphere' || p.kind === 'cone';
			p.ghost = ghosts[i] === true || (ghosts[i] !== false && solid && moving.some((m, j) => m && j !== i && !rides(j, i) && holds(i, j)));
		});
	} else parts.forEach((p, i) => (p.ghost = ghosts[i] === true));
	return scene;
}

/** Radius a chain runs on: half way down a gear's teeth, a disc's rim. */
export const pitchRadius = (g: IsoPart) => (g.kind === 'gear' ? g.r - Math.min(g.r * 0.18, 6) / 2 : g.r);

/**
 * The loop a chain makes round two gears: A's far side, the lower run, B's far
 * side, the upper run, in world space, set just in front of the nearer gear
 * faces. Points run the way the gears turn under a positive spin.
 */
function chainPath(c: IsoPart, A: IsoPart, B: IsoPart): Point3[] {
	const a = AXIS[A.axis];
	const [rA, rB] = [pitchRadius(A), pitchRadius(B)];
	const d = sub3(B.at, A.at);
	const dp = sub3(d, mul3(a, dot3(d, a)));
	const D = len3(dp);
	if (D <= Math.abs(rA - rB) + 1e-3) return [];
	const e1 = mul3(dp, 1 / D);
	const e2 = cross3(a, e1);
	const lift = (dot3(a, viewOf({ origin: [0, 0], scale: 1 })) >= 0 ? 1 : -1) * (Math.max(A.h, B.h) / 2 + c.r + 0.3);
	const beta = Math.acos(Math.max(-1, Math.min(1, (rA - rB) / D)));
	const pt = (o: Point3, r: number, t: number) => add3(add3(add3(o, mul3(e1, r * Math.cos(t))), mul3(e2, r * Math.sin(t))), mul3(a, lift));
	const arc = (o: Point3, r: number, t0: number, t1: number) => {
		const n = Math.max(4, Math.ceil(Math.abs(t1 - t0) / (TAU / 48)));
		return Array.from({ length: n + 1 }, (_, k) => pt(o, r, t0 + ((t1 - t0) * k) / n));
	};
	return [...arc(A.at, rA, beta, TAU - beta), ...arc(B.at, rB, -beta, beta), pt(A.at, rA, beta)];
}

// ── Affine transforms ─────────────────────────────────────────────────────

export const IDENTITY: Affine = { m: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] };
const mulV = (m: number[], v: Point3): Point3 => [
	m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2],
	m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2],
	m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2]
];
export const applyAffine = (A: Affine, p: Point3): Point3 => add3(mulV(A.m, p), A.t);
function compose(A: Affine, B: Affine): Affine {
	const m: number[] = [];
	for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) m.push(A.m[r * 3]! * B.m[c]! + A.m[r * 3 + 1]! * B.m[3 + c]! + A.m[r * 3 + 2]! * B.m[6 + c]!);
	return { m, t: add3(mulV(A.m, B.t), A.t) };
}
const about = (pivot: Point3, m: number[]): Affine => ({ m, t: sub3(pivot, mulV(m, pivot)) });
function rotation(axis: Axis, angle: number): number[] {
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	if (axis === 'x') return [1, 0, 0, 0, c, -s, 0, s, c];
	if (axis === 'y') return [c, 0, s, 0, 1, 0, -s, 0, c];
	return [c, -s, 0, s, c, 0, 0, 0, 1];
}
const AXIS: Record<Axis, Point3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

/** The point a part turns, swings or scales about. */
export function pivotOf(p: IsoPart): Point3 {
	if (p.kind === 'rod' || p.kind === 'arrow') return add3(p.at, p.from);
	if (p.kind === 'tube') return add3(p.at, p.path[0]!);
	return p.at;
}

function motionAffine(m: IsoMotion, p: IsoPart, t: number, speed: number): Affine {
	const w = TAU * (speed * t + m.phase);
	const pivot = pivotOf(p);
	if (m.kind === 'spin') return about(pivot, rotation(m.axis, w));
	if (m.kind === 'swing') return about(pivot, rotation(m.axis, (m.offset + m.range * Math.sin(w)) * DEG));
	if (m.kind === 'slide') return { m: IDENTITY.m, t: mul3(AXIS[m.axis], m.offset + m.range * Math.sin(w)) };
	if (m.kind === 'pulse') {
		const k = 1 + m.range * (0.5 + 0.5 * Math.sin(w));
		return about(pivot, [k, 0, 0, 0, k, 0, 0, 0, k]);
	}
	return IDENTITY;
}

/**
 * Crank-slider travel from the start: a crank of `throw` r at angle a pushing
 * a rod of length L (no rod: a pure cosine). Zero at a = 0.
 */
export function crankSlide(a: number, r: number, L: number): number {
	if (L <= r) return r * Math.cos(a) - r;
	return r * Math.cos(a) + Math.sqrt(L * L - r * r * Math.sin(a) ** 2) - r - L;
}

/** The affine that carries a rod from p0..p1 onto q0..q1: a rotation, then a stretch along the rod only, so its radius holds. */
function stretchTo(p0: Point3, p1: Point3, q0: Point3, q1: Point3): Affine {
	const l0 = len3(sub3(p1, p0)) || 1;
	const l1 = len3(sub3(q1, q0));
	const u = mul3(sub3(p1, p0), 1 / l0);
	const v = l1 > 1e-9 ? mul3(sub3(q1, q0), 1 / l1) : u;
	const c = dot3(u, v);
	const [k0, k1, k2] = cross3(u, v);
	const K = [0, -k2, k1, k2, 0, -k0, -k1, k0, 0];
	const K2 = compose({ m: K, t: [0, 0, 0] }, { m: K, t: [0, 0, 0] }).m;
	const R = c < -0.9999 ? [-1, 0, 0, 0, -1, 0, 0, 0, 1] : IDENTITY.m.map((x, i) => x + K[i]! + K2[i]! / (1 + c));
	const s = l1 / l0 - 1;
	const S = IDENTITY.m.map((x, i) => x + s * v[Math.floor(i / 3)]! * v[i % 3]!);
	const M = compose({ m: S, t: [0, 0, 0] }, { m: R, t: [0, 0, 0] }).m;
	return { m: M, t: sub3(q0, mulV(M, p0)) };
}

/** One world affine per part at time t (seconds). `speeds` is per motion. */
export function sceneTransforms(scene: IsoScene, t: number, speeds: number[]): Affine[] {
	const own: Affine[] = scene.parts.map(() => IDENTITY);
	const rodLength = (part: number) => {
		const link = scene.motions.find((m) => m.kind === 'link' && (m.from === part || m.to === part));
		const rod = link && scene.parts[link.part]!;
		return rod ? len3(sub3(rod.to, rod.from)) : 0;
	};
	scene.motions.forEach((m, i) => {
		let A = motionAffine(m, scene.parts[m.part]!, t, speeds[i] ?? 0);
		const crank = m.kind === 'slide' && m.driven >= 0 ? scene.motions.findIndex((q) => q.part === m.driven && q.kind === 'spin') : -1;
		if (crank >= 0) {
			const a = TAU * ((speeds[crank] ?? 0) * t + scene.motions[crank]!.phase);
			A = { m: IDENTITY.m, t: mul3(AXIS[m.axis], m.offset + crankSlide(a, m.throw, rodLength(m.part))) };
		}
		own[m.part] = compose(A, own[m.part]!);
	});
	const world: Array<Affine | undefined> = [];
	const of = (i: number): Affine => {
		if (world[i]) return world[i]!;
		const parent = scene.parts[i]!.on;
		world[i] = parent >= 0 ? compose(of(parent), own[i]!) : own[i]!;
		return world[i]!;
	};
	const out = scene.parts.map((_, i) => of(i));
	// Link rods: each end rides its own part. ponytail: parts riding on a link rod don't follow the stretch; add when one needs to.
	for (const m of scene.motions) {
		if (m.kind !== 'link') continue;
		const rod = scene.parts[m.part]!;
		const [p0, p1] = [add3(rod.at, rod.from), add3(rod.at, rod.to)];
		out[m.part] = stretchTo(p0, p1, applyAffine(out[m.from]!, p0), applyAffine(out[m.to]!, p1));
	}
	return out;
}

/** Which parts move: those with a motion, and everything riding on them. */
export function movingParts(scene: IsoScene): boolean[] {
	const direct = scene.parts.map((_, i) => scene.motions.some((m) => m.part === i));
	const moves = (i: number, hops = 0): boolean => direct[i]! || (scene.parts[i]!.on >= 0 && hops < 64 && moves(scene.parts[i]!.on, hops + 1));
	return scene.parts.map((_, i) => moves(i));
}

/** Dash offset per part for `flow` motions at time t; for a chain, how far it has travelled (world units) with its spinning gear. */
export function flowOffsets(scene: IsoScene, t: number, speeds: number[]): number[] {
	const out = scene.parts.map(() => NaN);
	scene.motions.forEach((m, i) => {
		if (m.kind === 'flow') out[m.part] = -((speeds[i] ?? 0) * t * 24) % 240;
	});
	scene.parts.forEach((p, i) => {
		for (const g of p.kind === 'chain' ? p.around : []) {
			const k = scene.motions.findIndex((m) => m.part === g && m.kind === 'spin');
			if (k < 0) continue;
			out[i] = TAU * ((speeds[k] ?? 0) * t + scene.motions[k]!.phase) * pitchRadius(scene.parts[g]!);
			break;
		}
	});
	return out;
}

/** Parts redrawn every frame: moving ones, flowing ones and chains on a moving gear. */
export function animatedParts(scene: IsoScene): boolean[] {
	const moving = movingParts(scene);
	return scene.parts.map((p, i) => moving[i]! || scene.motions.some((m) => m.kind === 'flow' && m.part === i) || (p.kind === 'chain' && p.around.some((g) => moving[g])));
}

// ── Drawing ───────────────────────────────────────────────────────────────

const moveFrame = (A: Affine, F: Frame): Frame => ({ o: applyAffine(A, F.o), a: mulV(A.m, F.a), u: mulV(A.m, F.u), v: mulV(A.m, F.v) });

function solidShapes(s: SolidPaths): IsoShape[] {
	const out: IsoShape[] = [{ cls: 'fill', d: s.fill }];
	s.shades.forEach((d, band) => d && out.push({ cls: 'shade', d, band }));
	if (s.top) out.push({ cls: 'top', d: s.top });
	if (s.crease) out.push({ cls: 'crease', d: s.crease });
	out.push({ cls: 'edge', d: s.outline });
	return out;
}

function boxOf(points: Point3[], pad = 0): [Point3, Point3] {
	const lo: Point3 = [Infinity, Infinity, Infinity];
	const hi: Point3 = [-Infinity, -Infinity, -Infinity];
	for (const p of points)
		for (let k = 0; k < 3; k++) {
			lo[k] = Math.min(lo[k]!, p[k]! - pad);
			hi[k] = Math.max(hi[k]!, p[k]! + pad);
		}
	return [lo, hi];
}

function polygonCorners(F: Frame, poly: Flat[], s0: number, s1: number): Point3[] {
	const xs = poly.map((p) => p[0]);
	const ys = poly.map((p) => p[1]);
	const out: Point3[] = [];
	for (const s of [s0, s1])
		for (const x of [Math.min(...xs), Math.max(...xs)])
			for (const y of [Math.min(...ys), Math.max(...ys)]) out.push(add3(add3(add3(F.o, mul3(F.a, s)), mul3(F.u, x)), mul3(F.v, y)));
	return out;
}

const stepsFor = (r: number) => Math.round(Math.min(56, Math.max(20, r * 2)));

/** Offset a polygon inward by `by` along its corner bisectors (smooth shapes, rounded plans). */
function insetPoly(poly: Flat[], by: number): Flat[] {
	const n = poly.length;
	let area = 0;
	for (let i = 0; i < n; i++) area += poly[i]![0] * poly[(i + 1) % n]![1] - poly[(i + 1) % n]![0] * poly[i]![1];
	const sign = area > 0 ? 1 : -1;
	const normal = (i: number): Flat => {
		const [ax, ay] = poly[i]!;
		const [bx, by2] = poly[(i + 1) % n]!;
		const l = Math.hypot(bx - ax, by2 - ay) || 1;
		return [(sign * (by2 - ay)) / l, (-sign * (bx - ax)) / l];
	};
	return poly.map(([x, y], i) => {
		const a = normal((i - 1 + n) % n);
		const b = normal(i);
		const l = Math.hypot(a[0] + b[0], a[1] + b[1]) || 1;
		return [x - ((a[0] + b[0]) / l) * by, y - ((a[1] + b[1]) / l) * by] as Flat;
	});
}

/** Parts resting on the scene's lowest level: the host draws a soft contact shadow under them (their fill, blurred). */
export function groundParts(scene: IsoScene): boolean[] {
	const unit: Projection = { origin: [0, 0], scale: 1 };
	const lows = scene.parts.map((p, i) => (p.owner < 0 ? drawPart(i, p, IDENTITY, unit).box[0][2] : Infinity));
	const floor = Math.min(...lows);
	return lows.map((z) => z <= floor + 0.5);
}

/**
 * Small detail that belongs to a prism part, on its visible cap: a highlight
 * rim, a bevel line, a seam and corner screws on big slabs, knurl, textures.
 * Capped by construction (fixed counts per part).
 */
function capDetail(p: IsoPart, F: Frame, poly: Flat[], s0: number, s1: number, P: Projection): IsoShape[] {
	const V = viewOf(P);
	const s = dot3(F.a, V) > 0 ? s1 : s0;
	const at = (x: number, y: number) => iso(pointOf(F, s, x, y), P);
	const ring = (pts: Flat[]) => pathOf(pts.map(([x, y]) => at(x, y)), true);
	const out: IsoShape[] = [{ cls: 'rim', d: ring(poly) }];
	const flat = p.kind === 'slab' || p.kind === 'plate' || p.kind === 'box';
	const span = p.kind === 'gear' ? 0 : flat ? Math.min(p.w, p.d) : p.r * 2;
	if (span) out.push({ cls: 'bevel', d: ring(insetPoly(poly, Math.min(1.8, Math.max(0.5, span * 0.035)))) });
	if (flat && p.kind !== 'box' && span >= 30) out.push({ cls: 'detail', d: ring(insetPoly(poly, Math.max(3.5, span * 0.09))) });
	if (flat && span >= 40) {
		const sr = Math.min(2.4, Math.max(1, span * 0.022));
		const c = Math.max(sr * 3, span * 0.06, p.kind === 'slab' ? p.r * 0.6 : 0);
		const screws: string[] = [];
		const slots: string[] = [];
		for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
			const x = sx * (p.w / 2 - c);
			const y = sy * (p.d / 2 - c);
			screws.push(ring(circlePolygon(sr, 12).map(([u, v]) => [x + u, y + v] as Flat)));
			slots.push(pathOf([at(x - sr * 0.6, y - sr * 0.45), at(x + sr * 0.6, y + sr * 0.45)]));
		}
		out.push({ cls: 'screw', d: screws.join('') }, { cls: 'detail', d: slots.join('') });
	}
	if (flat && p.texture === 'ribs') {
		const inset = Math.max(3, span * 0.12);
		const count = Math.min(36, Math.max(4, Math.floor((p.d - inset * 2) / 3)));
		const bands: string[][] = [[], [], []];
		for (let i = 0; i <= count; i++) {
			const y = -p.d / 2 + inset + ((p.d - inset * 2) * i) / count;
			const t = Math.abs((i / count) * 2 - 1);
			bands[t > 0.8 ? 0 : t > 0.5 ? 1 : 2]!.push(pathOf([at(-p.w / 2 + inset, y), at(p.w / 2 - inset, y)]));
		}
		bands.forEach((list, band) => list.length && out.push({ cls: 'texture', d: list.join(''), band }));
	}
	if (flat && p.texture === 'guilloche') {
		const R = span * 0.2;
		const loops = Array.from({ length: 12 }, (_, i) => {
			const a = (i / 12) * Math.PI * 2;
			return ring(circlePolygon(R, 32).map(([u, v]) => [u + Math.cos(a) * R * 0.55, v + Math.sin(a) * R * 0.55] as Flat));
		});
		out.push({ cls: 'texture', d: loops.join(''), band: 1 });
	}
	if (p.detail === 'bolt') out.push({ cls: 'detail', d: pathOf([at(-p.r * 0.62, -p.r * 0.2), at(p.r * 0.62, p.r * 0.2)]) });
	if (p.detail === 'ruler') {
		// Ticks hang from the strip's outer edge: every 5th long, the rest short.
		const count = Math.min(48, Math.floor(p.w / 2.5));
		const y0 = Math.sign(dot3(F.v, V) || 1) * (p.d / 2);
		const ticks: string[] = [];
		for (let i = 1; i < count; i++) {
			const x = -p.w / 2 + (p.w * i) / count;
			ticks.push(pathOf([at(x, y0), at(x, y0 * (i % 5 === 0 ? 0.1 : 0.45))]));
		}
		out.push({ cls: 'detail', d: ticks.join('') });
	}
	if (p.detail === 'knurl' && (p.kind === 'cylinder' || p.kind === 'disc')) {
		const count = Math.round(Math.min(48, Math.max(16, p.r * 2.5)));
		const lines: string[] = [];
		for (let i = 0; i < count; i++) {
			const a = (i / count) * Math.PI * 2;
			const nrm = add3(mul3(F.u, Math.cos(a)), mul3(F.v, Math.sin(a)));
			if (dot3(nrm, V) / (len3(nrm) || 1) < 0.12) continue;
			const x = p.r * Math.cos(a);
			const y = p.r * Math.sin(a);
			lines.push(pathOf([iso(pointOf(F, s0 + 0.4, x, y), P), iso(pointOf(F, s1 - 0.4, x, y), P)]));
		}
		out.push({ cls: 'detail', d: lines.join('') });
	}
	return out;
}

/** Draw one part under its world affine. `dash` is its flow offset (NaN: no flow). */
export function drawPart(index: number, p: IsoPart, A: Affine, P: Projection, dash = NaN): IsoItem {
	const shapes: IsoShape[] = [];
	let points: Point3[] = [];
	// Size scale across the part (a link rod stretches only along itself).
	const across: Point3 = p.kind === 'rod' ? unit3(cross3(sub3(p.to, p.from), Math.abs(p.to[2] - p.from[2]) < 0.9 * len3(sub3(p.to, p.from)) ? [0, 0, 1] : [1, 0, 0])) : [1, 0, 0];
	const k = len3(mulV(A.m, across)) || 1;
	const kScreen = P.scale * Math.sqrt(1.6);
	const prism = (F0: Frame, poly: Flat[], s0: number, s1: number) => {
		const F = moveFrame(A, F0);
		const solid = solidShapes(prismOf(F, poly, s0, s1, P));
		solid.splice(solid.length - 1, 0, ...capDetail(p, F, poly, s0, s1, P));
		shapes.push(...solid);
		points = polygonCorners(F, poly, s0, s1);
		return F;
	};
	const line = (pts: Point3[], cls: IsoShape['cls'], width?: number) => shapes.push({ cls, d: pathOf(pts.map((q) => iso(q, P))), width });
	switch (p.kind) {
		case 'box':
		case 'slab':
		case 'plate': {
			const r = p.kind === 'box' ? 0 : p.kind === 'plate' ? 1 : Math.min(p.r, p.w / 2, p.d / 2);
			const F = prism(axisFrame(p.at, 'z'), roundedPlan({ x: -p.w / 2, y: -p.d / 2, w: p.w, d: p.d, r }, 6), -p.h / 2, p.h / 2);
			if (p.kind === 'box' && p.rich) shapes.splice(shapes.length - 1, 0, ...boxDetail(p, F, P));
			if (p.kind === 'plate' && p.label) {
				const c = applyAffine(A, p.at);
				const size = Math.min(p.d * 0.45, (p.w / Math.max(p.label.length, 1)) * 1.6, 9);
				shapes.push({ cls: 'text', d: '', text: p.label, size, transform: topMatrix([c[0], c[1] + size * 0.35], c[2] + p.h / 2, P) });
			}
			break;
		}
		case 'cylinder':
		case 'disc':
			prism(axisFrame(p.at, p.axis), circlePolygon(p.r, stepsFor(p.r)), -p.h / 2, p.h / 2);
			break;
		case 'gear': {
			const F = prism(axisFrame(p.at, p.axis), gearRing(p.r, p.teeth), -p.h / 2, p.h / 2);
			const front = dot3(F.a, viewOf(P)) > 0 ? p.h / 2 : -p.h / 2;
			const ring = (rr: number) =>
				circlePolygon(rr, 40).map(([x, y]) => add3(add3(add3(F.o, mul3(F.a, front)), mul3(F.u, x)), mul3(F.v, y)));
			shapes.splice(shapes.length - 1, 0, { cls: 'crease', d: pathOf(ring(p.r * 0.62).map((q) => iso(q, P)), true) + pathOf(ring(p.r * 0.18).map((q) => iso(q, P)), true) });
			const holes = p.rich && !p.chain && p.r >= 14;
			if (p.rich) shapes.splice(shapes.length - 1, 0, { cls: 'crease', d: pathOf(ring(p.r - Math.min(p.r * 0.18, 6)).map((q) => iso(q, P)), true) });
			if (holes) {
				// Lightening holes between the hub and the web ring, more on a bigger gear.
				const n = p.r >= 30 ? 6 : p.r >= 20 ? 5 : 4;
				const d = Array.from({ length: n }, (_, i) => {
					const a = ((i + 0.5) / n) * TAU;
					const pts = circlePolygon(p.r * 0.12, 16).map(([x, y]) => add3(add3(add3(F.o, mul3(F.a, front)), mul3(F.u, x + p.r * 0.4 * Math.cos(a))), mul3(F.v, y + p.r * 0.4 * Math.sin(a))));
					return pathOf(pts.map((q) => iso(q, P)), true);
				}).join('');
				shapes.splice(shapes.length - 1, 0, { cls: 'hole', d });
			} else {
				// Spokes make the turn visible.
				const spokes = [0, 1, 2, 3, 4].map((i) => [ring(p.r * 0.18)[i * 8]!, ring(p.r * 0.62)[i * 8]!]);
				shapes.splice(shapes.length - 1, 0, { cls: 'crease', d: spokes.map((s) => pathOf(s.map((q) => iso(q, P)))).join('') });
			}
			break;
		}
		case 'cone': {
			const F = moveFrame(A, axisFrame(p.at, p.axis));
			shapes.push(...solidShapes(coneOf(F, p.r, -p.h / 2, p.h / 2, P)));
			points = polygonCorners(F, [[-p.r, -p.r], [p.r, p.r]], -p.h / 2, p.h / 2);
			break;
		}
		case 'sphere': {
			const c = applyAffine(A, p.at);
			shapes.push(...solidShapes(sphereOf(c, p.r * k, P)));
			points = [sub3(c, [p.r * k, p.r * k, p.r * k]), add3(c, [p.r * k, p.r * k, p.r * k])];
			break;
		}
		case 'rod': {
			const a = applyAffine(A, add3(p.at, p.from));
			const b = applyAffine(A, add3(p.at, p.to));
			const length = len3(sub3(b, a));
			if (length < 1e-6) break;
			const F = frameAlong(a, sub3(b, a));
			shapes.push(...solidShapes(prismOf(F, circlePolygon(p.r * k, stepsFor(p.r)), 0, length, P)));
			points = [a, b];
			if (!Number.isNaN(dash)) shapes.push({ cls: 'flow', d: pathOf([iso(a, P), iso(b, P)]), dash });
			break;
		}
		case 'arrow': {
			const a = applyAffine(A, add3(p.at, p.from));
			const b = applyAffine(A, add3(p.at, p.to));
			const [ax, ay] = iso(a, P);
			const [bx, by] = iso(b, P);
			const len = Math.hypot(bx - ax, by - ay) || 1;
			const [ux, uy] = [(bx - ax) / len, (by - ay) / len];
			const head = Math.min(7, len * 0.4);
			const wing = (s: number): Flat => [bx - head * (ux * 0.88 - uy * 0.47 * s), by - head * (uy * 0.88 + ux * 0.47 * s)];
			shapes.push({ cls: Number.isNaN(dash) ? 'line' : 'flow', d: pathOf([[ax, ay], [bx, by]]), dash: Number.isNaN(dash) ? undefined : dash });
			shapes.push({ cls: 'line', d: pathOf([wing(1), [bx, by], wing(-1)]) });
			points = [a, b];
			break;
		}
		case 'tube': {
			const pts = p.path.map((q) => applyAffine(A, add3(p.at, q)));
			const width = 2 * p.r * k * kScreen;
			const d = pathOf(pts.map((q) => iso(q, P)));
			shapes.push({ cls: 'tube-edge', d, width: width + 1.4 });
			shapes.push({ cls: 'tube', d, width });
			const lift = p.r * k * kScreen * 0.38;
			shapes.push({ cls: 'tube-hi', d: pathOf(pts.map((q) => iso(q, P)).map(([x, y]) => [x - lift * 0.3, y - lift] as Flat)), width: width * 0.32 });
			if (!Number.isNaN(dash)) shapes.push({ cls: 'flow', d, dash });
			points = pts;
			break;
		}
	}
	if (p.kind === 'chain' && p.path.length > 1) {
		const pts = p.path.map((q) => applyAffine(A, q));
		const flat = pts.map((q) => iso(q, P));
		let world = 0;
		let screen = 0;
		for (let j = 1; j < pts.length; j++) {
			world += len3(sub3(pts[j]!, pts[j - 1]!));
			screen += Math.hypot(flat[j]![0] - flat[j - 1]![0], flat[j]![1] - flat[j - 1]![1]);
		}
		const ratio = world ? screen / world : 1;
		const pitch = Math.max(2, p.w * ratio);
		const width = Math.min(2 * p.r * k * kScreen, pitch * 0.55);
		const d = pathOf(flat, true);
		const off = Number.isNaN(dash) ? 0 : (-dash * ratio) % (2 * pitch);
		shapes.push({ cls: 'tube-edge', d, width: width + 1.4 }, { cls: 'tube', d, width }, ...chainLinks(d, width, off, pitch));
		points = pts;
	}
	if (!points.length) points = [applyAffine(A, p.at)];
	const box = boxOf(points, p.kind === 'tube' || p.kind === 'rod' || p.kind === 'chain' ? p.r * k : 0);
	const flat = [box[0], box[1], [box[0][0], box[1][1], box[0][2]], [box[1][0], box[0][1], box[1][2]], [box[0][0], box[0][1], box[1][2]], [box[1][0], box[1][1], box[0][2]]].map((q) => iso(q as Point3, P));
	const xs = flat.map((q) => q[0]);
	const ys = flat.map((q) => q[1]);
	const centre = mul3(add3(box[0], box[1]), 0.5);
	// A ghost keeps its outline, creases and a faint fill, so whatever moves inside it shows.
	const drawn = p.ghost ? shapes.flatMap((s) => (s.cls === 'fill' ? [{ ...s, cls: 'ghost' as const }] : s.cls === 'edge' || s.cls === 'crease' ? [s] : [])) : shapes;
	const halo = !p.ghost && shapes[0]?.cls === 'fill' ? shapes[0].d : undefined;
	return { part: index, role: p.color, depth: depthOf(centre, P), box, screen: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], shapes: drawn, halo };
}

/** A box's seam round its two visible sides near the top, and a label plate with rule lines on its wider visible side. */
function boxDetail(p: IsoPart, F: Frame, P: Projection): IsoShape[] {
	if (p.h < 8 || Math.max(p.w, p.d) < 16) return [];
	const V = viewOf(P);
	const su = dot3(F.u, V) >= 0 ? 1 : -1;
	const sv = dot3(F.v, V) >= 0 ? 1 : -1;
	const [hw, hd, z0] = [p.w / 2, p.d / 2, -p.h / 2];
	const zs = p.h / 2 - Math.min(4, p.h * 0.22);
	const at = (s: number, x: number, y: number) => iso(pointOf(F, s, x, y), P);
	// Corner to corner, so the seam ends on the outline.
	const out: IsoShape[] = [{ cls: 'detail', d: pathOf([at(zs, -su * hw, sv * hd), at(zs, su * hw, sv * hd), at(zs, su * hw, -sv * hd)]) }];
	const alongX = p.w >= p.d;
	const faceW = alongX ? p.w : p.d;
	const pw = Math.min(faceW * 0.55, 44);
	const ph = Math.min((zs - z0) * 0.55, 14);
	if (pw < 12 || ph < 6) return out;
	const sc = (z0 + zs) / 2;
	const on = (t: number, s: number) => (alongX ? at(s, t, sv * hd) : at(s, su * hw, -t * sv * su));
	const x0 = -pw / 2;
	out.push({ cls: 'top', d: pathOf([on(x0, sc - ph / 2), on(-x0, sc - ph / 2), on(-x0, sc + ph / 2), on(x0, sc + ph / 2)], true) });
	const rules = [0.7, 0.5, 0.6].map((k, i) => {
		const s = sc + ph / 2 - (ph * (i + 1)) / 4;
		return pathOf([on(x0 + pw * 0.15, s), on(x0 + pw * (0.15 + k * 0.7), s)]);
	});
	out.push({ cls: 'detail', d: rules.join('') + pathOf([on(x0, sc - ph / 2), on(-x0, sc - ph / 2), on(-x0, sc + ph / 2), on(x0, sc + ph / 2)], true) });
	return out;
}

/**
 * Chain links on a loop path: outer plates every other pitch (round-capped
 * dashes, pin to pin) over the inner plates (the tube stroke), and a pin at
 * every pitch. All in screen px; `offset` moves them along together.
 */
function chainLinks(d: string, width: number, offset: number, pitch: number): IsoShape[] {
	const plate = width * 1.15;
	const len = Math.max(0.1, pitch * 1.05 - plate);
	const f = (n: number) => n.toFixed(2);
	const pattern = `${f(len)} ${f(2 * pitch - len)}`;
	return [
		{ cls: 'link-edge', d, width: plate + 1.4, pattern, dash: offset },
		{ cls: 'link', d, width: plate, pattern, dash: offset },
		{ cls: 'pin', d, width: width * 0.45, pattern: `0 ${f(pitch)}`, dash: offset - len / 2 + pitch / 2 }
	];
}

/**
 * Fold every derived part's shapes into its owner's item: `under` ones before
 * the owner's own shapes, the rest after, each group in emission order. The
 * owner's box grows to cover them, so detail always sorts with its owner.
 */
export function mergeOwned(items: IsoItem[], scene: IsoScene): IsoItem[] {
	const byPart = new Map(items.map((it) => [it.part, it]));
	const under = new Map<number, IsoShape[]>();
	const over = new Map<number, IsoShape[]>();
	const grow = new Map<number, IsoItem[]>();
	for (const it of items) {
		const p = scene.parts[it.part];
		if (!p || p.owner < 0 || !byPart.has(p.owner)) continue;
		const bucket = p.under ? under : over;
		bucket.set(p.owner, [...(bucket.get(p.owner) ?? []), ...it.shapes]);
		grow.set(p.owner, [...(grow.get(p.owner) ?? []), it]);
	}
	const out: IsoItem[] = [];
	for (const it of items) {
		const p = scene.parts[it.part];
		if (p && p.owner >= 0 && byPart.has(p.owner)) continue;
		const extra = grow.get(it.part);
		if (!extra) {
			out.push(it);
			continue;
		}
		const all = [it, ...extra];
		const box: [Point3, Point3] = [
			[0, 1, 2].map((k) => Math.min(...all.map((x) => x.box[0][k]!))) as Point3,
			[0, 1, 2].map((k) => Math.max(...all.map((x) => x.box[1][k]!))) as Point3
		];
		const screen = [0, 1, 2, 3].map((k) => (k < 2 ? Math.min : Math.max)(...all.map((x) => x.screen[k]!))) as IsoItem['screen'];
		out.push({ ...it, box, screen, shapes: [...(under.get(it.part) ?? []), ...it.shapes, ...(over.get(it.part) ?? [])] });
	}
	return out;
}

/**
 * Painter's order. A is behind B when their boxes are apart along an axis and
 * A sits on the far side; intersecting boxes compare centres along the axis of
 * least overlap, then centre depth.
 * ponytail: O(n^2) pair checks, fine for the 150-part cap; a sweep line if the cap grows.
 */
export function sortItems(items: IsoItem[], P: Projection): IsoItem[] {
	const n = items.length;
	const V = viewOf(P);
	const eps = 0.01;
	const behind = (a: IsoItem, b: IsoItem): number => {
		for (let k = 0; k < 3; k++) {
			if (Math.abs(V[k]!) < 1e-6) continue;
			const near = V[k]! > 0;
			if (near ? a.box[1][k]! <= b.box[0][k]! + eps : a.box[0][k]! >= b.box[1][k]! - eps) return -1;
			if (near ? b.box[1][k]! <= a.box[0][k]! + eps : b.box[0][k]! >= a.box[1][k]! - eps) return 1;
		}
		// Boxes intersect: compare centres along the axis they overlap least on.
		let axis = -1;
		let least = Infinity;
		for (let k = 0; k < 3; k++) {
			if (Math.abs(V[k]!) < 1e-6) continue;
			const overlap = Math.min(a.box[1][k]!, b.box[1][k]!) - Math.max(a.box[0][k]!, b.box[0][k]!);
			if (overlap < least) [least, axis] = [overlap, k];
		}
		if (axis < 0) return 0;
		const d = ((a.box[0][axis]! + a.box[1][axis]!) / 2 - (b.box[0][axis]! + b.box[1][axis]!) / 2) * Math.sign(V[axis]!);
		return Math.abs(d) > eps ? Math.sign(d) : 0;
	};
	const after: number[][] = items.map(() => []);
	const indegree = new Array(n).fill(0);
	for (let i = 0; i < n; i++)
		for (let j = i + 1; j < n; j++) {
			const a = items[i]!;
			const b = items[j]!;
			if (a.screen[2] < b.screen[0] || b.screen[2] < a.screen[0] || a.screen[3] < b.screen[1] || b.screen[3] < a.screen[1]) continue;
			const order = behind(a, b) || Math.sign(a.depth - b.depth);
			if (order < 0) {
				after[i]!.push(j);
				indegree[j]++;
			} else if (order > 0) {
				after[j]!.push(i);
				indegree[i]++;
			}
		}
	const done = new Array(n).fill(false);
	const out: IsoItem[] = [];
	while (out.length < n) {
		let pick = -1;
		for (let i = 0; i < n; i++) if (!done[i] && indegree[i] === 0 && (pick < 0 || items[i]!.depth < items[pick]!.depth)) pick = i;
		// A cycle: break it at the farthest remaining item.
		if (pick < 0) for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || items[i]!.depth < items[pick]!.depth)) pick = i;
		done[pick] = true;
		out.push(items[pick]!);
		for (const j of after[pick]!) indegree[j]--;
	}
	return out;
}

/** Draw every part at rest-or-time-t and return them in painter's order. */
export function drawScene(scene: IsoScene, P: Projection, transforms: Affine[], dashes: number[] = []): IsoItem[] {
	return sortItems(
		mergeOwned(
			scene.parts.map((p, i) => drawPart(i, p, transforms[i] ?? IDENTITY, P, dashes[i] ?? NaN)),
			scene
		),
		P
	);
}

/** A projection that fits the resting scene into width x height. */
export function fitScene(scene: IsoScene, width: number, height: number, pad = 28): Projection {
	const unit: Projection = { origin: [0, 0], scale: 1 };
	const points: Point3[] = [];
	// Every pose a motion reaches, not just the rest pose: twelve samples round each cycle.
	const moving = movingParts(scene);
	const poses = moving.some(Boolean) ? Array.from({ length: 12 }, (_, k) => sceneTransforms(scene, k / 12, scene.motions.map(() => 1))) : [];
	scene.parts.forEach((p, i) => {
		for (const A of [IDENTITY, ...(moving[i] ? poses.map((tf) => tf[i]!) : [])]) {
			const { box } = drawPart(i, p, A, unit);
			points.push(box[0], box[1], [box[0][0], box[1][1], box[0][2]], [box[1][0], box[0][1], box[1][2]], [box[0][0], box[0][1], box[1][2]], [box[1][0], box[1][1], box[0][2]]);
		}
	});
	if (!points.length) points.push([-10, -10, 0], [10, 10, 10]);
	return fitProjection(points, width, height, { pad });
}

/** Screen point for a label pin: a part's pivot under its transform, or a fixed point. */
export function pinPoint(scene: IsoScene, transforms: Affine[], P: Projection, part: number, at: Point3 | null): Flat {
	if (at) return iso(at, P);
	const p = scene.parts[part]!;
	const centre = p.kind === 'rod' || p.kind === 'arrow' ? mul3(add3(add3(p.at, p.from), add3(p.at, p.to)), 0.5) : (p.kind === 'tube' || p.kind === 'chain') && p.path.length ? add3(p.at, p.path[Math.floor(p.path.length / 2)]!) : p.at;
	return iso(applyAffine(transforms[part] ?? IDENTITY, centre), P);
}

