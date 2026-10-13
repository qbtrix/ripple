/**
 * @file iso/enrich.ts
 * @description Automatic detail for an `iso-scene`: given the model's parts,
 * derive the small parts that belong to them, so four model parts can read as
 * a real machine. Following Anatomy's craft rule, every detail belongs to a
 * part and ends on an edge; nothing is texture for its own sake.
 *   - base slab/plate (the lowest, big one): feet, a ruler strip on the front edge
 *   - gear/disc: hub and centre bolt (slot); a chainring gets spider arms and bolts
 *   - upright cylinder: a flange under it; a tiny one is knurled
 *   - tube: collars where an end meets a part, clamps where it runs over a slab;
 *     a tube looped over two gears becomes a chain of links
 *   - rod: a pivot pin at an end that touches a part, a rounded cap at a free end
 * In-part strokes (gear holes, box seam and label plate, chain links) are drawn
 * by `drawPart` when enrichment sets `rich`.
 *
 * Invariants: pure and deterministic (same parts in, same parts out); model
 * parts are never moved or resized; derived parts are appended after the model
 * parts with `on: owner`, so they inherit its motion, and `owner` so
 * `mergeOwned` sorts them with it; a derived part that would sit inside another
 * solid is dropped; the drawn shape count stays within ISO_DETAIL_SHAPES.
 * `detail: "none"` on the scene returns it untouched; on a part, skips that part.
 */

import { depthOf, type Point3, type Projection } from './kit.js';
import { add3, axisFrame, dot3, len3, mul3, sub3, unit3, viewOf } from './solids.js';
import { IDENTITY, drawPart, fitScene, type IsoPart, type IsoScene } from './scene.js';

/** Most shapes a scene may draw once detail is added. */
export const ISO_DETAIL_SHAPES = 300;

type Box = [Point3, Point3];
const UNIT: Projection = { origin: [0, 0], scale: 1 };
const TAU = Math.PI * 2;
const AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] } as const satisfies Record<string, Point3>;
const LONG = new Set(['rod', 'tube', 'arrow']);

const pad = (b: Box, by: number): Box => [b[0].map((v) => v - by) as Point3, b[1].map((v) => v + by) as Point3];
const inside = (q: Point3, b: Box) => [0, 1, 2].every((k) => q[k]! >= b[0][k]! && q[k]! <= b[1][k]!);
/** Share of `a`'s volume that lies inside `b`. */
function within(a: Box, b: Box): number {
	let shared = 1;
	let own = 1;
	for (let k = 0; k < 3; k++) {
		shared *= Math.max(0, Math.min(a[1][k]!, b[1][k]!) - Math.max(a[0][k]!, b[0][k]!));
		own *= Math.max(1e-6, a[1][k]! - a[0][k]!);
	}
	return shared / own;
}

function toSegment(q: Point3, a: Point3, b: Point3): number {
	const ab = sub3(b, a);
	const t = Math.min(1, Math.max(0, dot3(sub3(q, a), ab) / (dot3(ab, ab) || 1)));
	return len3(sub3(q, add3(a, mul3(ab, t))));
}

/** Rest-pose world position of a model-space point under a part's parent chain (parents don't move at rest). */
const world = (p: IsoPart, q: Point3) => add3(p.at, q);

function derived(owner: number, base: IsoPart, fields: Partial<IsoPart> & Pick<IsoPart, 'kind'>, under = false): IsoPart {
	return {
		id: `${base.id}~${fields.kind}`,
		at: [0, 0, 0],
		w: 1,
		d: 1,
		h: 1,
		r: 1,
		teeth: 18,
		axis: 'z',
		path: [],
		from: [0, 0, 0],
		to: [0, 0, 0],
		label: '',
		color: 'metal',
		detail: '',
		texture: '',
		on: owner,
		rich: false,
		chain: false,
		owner,
		under,
		...fields
	};
}

/** A tube touches a gear when one of its points lies on the gear's rim, in the gear's plane. */
function onRim(tube: IsoPart, gear: IsoPart): boolean {
	const a = AXES[gear.axis] as Point3;
	return tube.path.some((q) => {
		const d = sub3(world(tube, q), gear.at);
		const along = dot3(d, a);
		const radial = len3(sub3(d, mul3(a, along)));
		return Math.abs(along) <= gear.h / 2 + tube.r + 2 && Math.abs(radial - gear.r) <= tube.r + Math.max(3, gear.r * 0.15);
	});
}

export function enrichScene(scene: IsoScene, mode: unknown = 'auto'): IsoScene {
	if (mode === 'none' || !scene.parts.length) return scene;
	const V = viewOf(UNIT);
	const parts = scene.parts.map((p) => (p.detail === 'none' ? p : { ...p, rich: true }));
	const on = (i: number) => parts[i]!.detail !== 'none';

	// Chain drives: a tube looped over two gears becomes links; the bigger gear is the chainring.
	parts.forEach((t, i) => {
		if (t.kind !== 'tube' || !on(i)) return;
		const gears = parts.map((g, j) => j).filter((j) => (parts[j]!.kind === 'gear' || parts[j]!.kind === 'disc') && onRim(t, parts[j]!));
		if (gears.length < 2) return;
		parts[i] = { ...t, chain: true };
		const ring = gears.reduce((a, b) => (parts[b]!.r > parts[a]!.r ? b : a));
		if (parts[ring]!.kind === 'gear' && on(ring)) parts[ring] = { ...parts[ring]!, chain: true };
	});
	// A tiny upright cylinder is a knob: knurl it.
	parts.forEach((p, i) => {
		if (on(i) && p.kind === 'cylinder' && p.axis === 'z' && p.r <= 3 && p.h >= p.r) parts[i] = { ...p, detail: 'knurl' };
	});

	// Count shapes at the card's own fit; small shade bands come and go with scale and motion, hence the headroom.
	const FIT = fitScene(scene, 640, 380);
	const budget = ISO_DETAIL_SHAPES * 0.92;
	const drawn = parts.map((p, i) => drawPart(i, p, IDENTITY, UNIT));
	let total = parts.reduce((n, p, i) => n + drawPart(i, p, IDENTITY, FIT).shapes.length, 0);
	if (total > budget) return scene;
	const boxes: Box[] = drawn.map((it) => it.box);
	const solids = parts.map((p, i) => i).filter((i) => !LONG.has(parts[i]!.kind));
	const extra: IsoPart[] = [];
	const extraBoxes: Box[] = [];

	/** Add a derived part unless it would sit inside another solid or go over the shape budget. */
	const add = (part: IsoPart, skip: number[] = [], limit = 0.5): boolean => {
		const item = drawPart(parts.length + extra.length, part, IDENTITY, UNIT);
		const count = drawPart(0, part, IDENTITY, FIT).shapes.length;
		if (total + count > budget) return false;
		const box = pad(item.box, -0.05);
		if (solids.some((j) => j !== part.owner && !skip.includes(j) && within(box, pad(boxes[j]!, 0.25)) > limit)) return false;
		if (extraBoxes.some((b) => within(box, b) > 0.5)) return false;
		total += count;
		extra.push({ ...part, id: `${part.id}${extra.length}` });
		extraBoxes.push(item.box);
		return true;
	};
	/** Model parts (other than `self`) that a point touches: within `by` of a rod or tube's line, or of a solid's box. */
	const touching = (q: Point3, self: number, by: number) =>
		parts
			.map((_, j) => j)
			.filter((j) => {
				const o = parts[j]!;
				if (j === self || o.kind === 'arrow') return false;
				if (o.kind === 'rod') return toSegment(q, world(o, o.from), world(o, o.to)) <= o.r + by;
				if (o.kind === 'tube') return o.path.slice(1).some((b, k) => toSegment(q, world(o, o.path[k]!), world(o, b)) <= o.r + by);
				return inside(q, pad(boxes[j]!, by));
			});

	// 1. The base: the lowest big slab or plate.
	const floor = Math.min(...boxes.map((b) => b[0][2]));
	const base = parts
		.map((p, i) => i)
		.filter((i) => on(i) && (parts[i]!.kind === 'slab' || parts[i]!.kind === 'plate') && boxes[i]![0][2] <= floor + 0.5 && parts[i]!.w >= 30 && parts[i]!.d >= 30)
		.sort((a, b) => parts[b]!.w * parts[b]!.d - parts[a]!.w * parts[a]!.d)[0];
	if (base !== undefined) {
		const p = parts[base]!;
		const bottom = boxes[base]![0][2];
		const top = boxes[base]![1][2];
		const rF = Math.min(5, Math.max(2, Math.min(p.w, p.d) * 0.05));
		const hF = Math.min(4, Math.max(1.6, rF * 0.8));
		const c = rF + Math.max(2, Math.min(p.w, p.d) * 0.06);
		const feet = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const)
			.map(([sx, sy]) => [p.at[0] + sx * (p.w / 2 - c), p.at[1] + sy * (p.d / 2 - c), bottom - hF / 2] as Point3)
			.sort((a, b) => depthOf(a, UNIT) - depthOf(b, UNIT));
		for (const at of feet) add(derived(base, p, { kind: 'cylinder', at, r: rF, h: hF, color: 'neutral' }, true));
		if (p.w >= 90) {
			// A ruler strip along the front long edge, only where nothing stands on it.
			const sd = Math.min(9, Math.max(5, p.d * 0.12));
			const sy = V[1] >= 0 ? 1 : -1;
			const margin = Math.max(3, Math.min(p.w, p.d) * 0.08);
			const strip = derived(base, p, {
				kind: 'plate',
				at: [p.at[0], p.at[1] + sy * (p.d / 2 - sd / 2 - margin), top + 0.4],
				w: Math.min(p.w * 0.55, 120),
				d: sd,
				h: 0.8,
				color: 'neutral',
				detail: 'ruler'
			});
			add(strip, [base], 0.01);
		}
	}

	// 2. Gears and discs: hub, centre bolt, and spider arms on a chainring.
	parts.forEach((p, i) => {
		if (!on(i) || (p.kind !== 'gear' && p.kind !== 'disc') || p.r < 6) return;
		const F = axisFrame(p.at, p.axis);
		const fs = dot3(F.a, V) >= 0 ? 1 : -1;
		const face = (lift: number, x = 0, y = 0) => add3(add3(add3(p.at, mul3(F.a, fs * (p.h / 2 + lift))), mul3(F.u, x)), mul3(F.v, y));
		const hubR = Math.max(1.5, p.r * 0.2);
		if (p.kind === 'gear' || p.r >= 14) add(derived(i, p, { kind: 'cylinder', axis: p.axis, at: face(0.8), r: hubR, h: 1.6, color: 'neutral' }));
		add(derived(i, p, { kind: 'cylinder', axis: p.axis, at: face(2.2), r: Math.max(1, p.r * 0.08), h: 1.2, color: 'metal', detail: 'bolt' }));
		if (!p.chain) return;
		const n = p.teeth >= 30 ? 5 : 4;
		const armR = Math.max(0.8, p.r * 0.06);
		for (let k = 0; k < n; k++) {
			const a = (k / n) * TAU;
			const [c, s] = [Math.cos(a), Math.sin(a)];
			add(derived(i, p, { kind: 'rod', from: face(armR * 0.6, hubR * c, hubR * s), to: face(armR * 0.6, p.r * 0.66 * c, p.r * 0.66 * s), r: armR, color: 'metal' }));
		}
		for (let k = 0; k < n; k++) {
			const a = (k / n) * TAU;
			add(derived(i, p, { kind: 'cylinder', axis: p.axis, at: face(armR * 1.4 + 0.5, p.r * 0.66 * Math.cos(a), p.r * 0.66 * Math.sin(a)), r: Math.max(0.8, p.r * 0.05), h: 1, color: 'neutral', detail: 'bolt' }));
		}
	});

	// 3. Rods: a pivot pin where an end meets another part, a rounded cap at a free end.
	parts.forEach((p, i) => {
		if (!on(i) || p.kind !== 'rod') return;
		const dir = unit3(sub3(p.to, p.from));
		for (const end of [p.from, p.to]) {
			const q = world(p, end);
			const hit = touching(q, i, p.r + 0.5).filter((j) => parts[j]!.owner < 0);
			if (!hit.length) {
				add(derived(i, p, { kind: 'sphere', at: q, r: p.r, color: p.color }));
				continue;
			}
			const other = parts[hit[0]!]!;
			const round = other.kind === 'gear' || other.kind === 'disc' || other.kind === 'cylinder';
			// The pin runs across the rod: along a round part's axis when that is square to it, else the axis the rod leans along least.
			const axis = round && Math.abs(dot3(AXES[other.axis] as Point3, dir)) < 0.5 ? other.axis : (['x', 'y', 'z'] as const).reduce((a, b) => (Math.abs(dot3(AXES[b] as Point3, dir)) < Math.abs(dot3(AXES[a] as Point3, dir)) ? b : a));
			add(derived(i, p, { kind: 'cylinder', axis, at: q, r: p.r * 1.3 + 0.3, h: p.r * 2 + 2.4, color: 'neutral' }), hit);
		}
	});

	// 4. Tubes: collars where an end meets a part, clamps where the run passes just over a slab.
	parts.forEach((p, i) => {
		if (!on(i) || p.kind !== 'tube' || p.chain) return;
		const pts = p.path.map((q) => world(p, q));
		const ends: Array<[Point3, Point3]> = [
			[pts[0]!, unit3(sub3(pts[1]!, pts[0]!))],
			[pts[pts.length - 1]!, unit3(sub3(pts[pts.length - 2]!, pts[pts.length - 1]!))]
		];
		for (const [q, t] of ends) {
			const hit = touching(q, i, p.r + 1);
			if (!hit.length) continue;
			const L = Math.min(8, Math.max(2, p.r * 1.6));
			add(derived(i, p, { kind: 'rod', from: q, to: add3(q, mul3(t, L)), r: p.r * 1.35 + 0.4, color: 'neutral' }), hit);
		}
		let clamps = 0;
		for (let k = 1; k < pts.length - 1 && clamps < 2; k++) {
			const q = pts[k]!;
			const slab = solids.find((j) => (parts[j]!.kind === 'slab' || parts[j]!.kind === 'plate') && inside([q[0], q[1], boxes[j]![1][2]], boxes[j]!) && q[2] - p.r - boxes[j]![1][2] >= 0 && q[2] - p.r - boxes[j]![1][2] <= 6);
			if (slab === undefined) continue;
			const t = unit3(sub3(pts[k + 1]!, pts[k - 1]!));
			const L = Math.max(2, p.r * 1.2);
			const ok = add(derived(i, p, { kind: 'rod', from: sub3(q, mul3(t, L / 2)), to: add3(q, mul3(t, L / 2)), r: p.r * 1.3 + 0.3, color: 'neutral' }));
			const gap = q[2] - p.r - boxes[slab]![1][2];
			if (ok && gap >= 0.5) add(derived(i, p, { kind: 'box', at: [q[0], q[1], boxes[slab]![1][2] + gap / 2], w: p.r * 1.2, d: p.r * 1.2, h: gap, color: 'neutral' }, true), [slab]);
			if (ok) clamps++;
		}
	});

	// 5. Upright cylinders: a flange under the foot.
	parts.forEach((p, i) => {
		if (!on(i) || p.kind !== 'cylinder' || p.axis !== 'z' || p.r < 3 || p.h < 6) return;
		const hc = Math.min(2, p.h * 0.15);
		add(derived(i, p, { kind: 'cylinder', at: [p.at[0], p.at[1], p.at[2] - p.h / 2 - hc / 2], r: p.r * 1.15 + 0.6, h: hc, color: p.color === 'neutral' ? 'metal' : 'neutral' }, true), touching([p.at[0], p.at[1], p.at[2] - p.h / 2 - hc], i, 0.5));
	});

	return { parts: [...parts, ...extra], motions: scene.motions };
}
