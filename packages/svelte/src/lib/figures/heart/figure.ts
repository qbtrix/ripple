// figures/heart/figure.ts: the beating heart drawn the Anatomy way, as a small
// two-pump machine on a bench, with the @ripple-ui/core/iso kit. The right pump
// (blue) sits at -x beside the lungs tank, the left pump (red) at +x beside the
// body tank; each pump is an atrium on a valve coupling on a ventricle.
// Vessels are tubes on axis frames with ball elbows: the pulmonary artery and
// the aorta leave low through valve bodies with hand wheels, the pulmonary
// veins bridge over the top into the left atrium, the vena cava runs behind
// and turns once into the right atrium's back face.
//
// `heartSvg()` is pure (strings only) and paints back to front in one fixed
// order; `mount()` puts it in a host element and runs the loop: chambers are
// rebuilt each frame from the model, wheel levers turn with the valves and the
// flow dashes move with the flow. No DOM at module top level.

import * as k from '@ripple-ui/core/iso';
import type { Flat, Point3, SolidPaths } from '@ripple-ui/core/iso';
import { clampParams, describe, readoutsOf, stateAt, stillTime, type HeartParams, type HeartState } from './model.js';

export const WIDTH = 640;
export const HEIGHT = 420;

// World plan: x along the bench, y toward the viewer, z up. 1 unit ~ 1 px.
const PLATE = { x: -158, y: -62, w: 316, d: 124, r: 8 };
const PLATE_H = 10;
const FOOT_H = 5;
const V_TOP = 54; // ventricle top
const A_BOT = 64; // atrium bottom
const A_TOP = 94; // atrium top
const V_W = 42; // ventricle width along x (inner edge flush on the septum)
const V_D = 40;
const A_W = 34;
const A_D = 32;
const SEPT = 4; // half thickness of the septum plate
const OUT_Z = 30; // artery outlet height
const LUNGS = { x: -146, y: -38, w: 44, d: 76, r: 14 };
const BODY = { x: 102, y: -38, w: 44, d: 76, r: 14 };
const TANK_TOP = 84;
const TUBE_R = 5.2;
const VC_Y = -30;
const VC_Z = 80;
const PV_Z = 114;

const P = k.fitProjection(
	[...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [0, 0, PV_Z + 8], [LUNGS.x, 0, TANK_TOP + 8], [BODY.x + BODY.w, 0, TANK_TOP + 8]],
	WIDTH,
	HEIGHT,
	{ pad: 22, azimuth: 58 }
);

const at = (p: Point3): Flat => k.iso(p, P);
const S = (paths: SolidPaths, style: k.SolidStyle = {}) => k.solidSvg(paths, style);
const L = (d: string, style: k.LineStyle = {}) => k.lineSvg(d, style);
const D = (points: Flat[], style: { size?: number; tone?: k.Tone } = {}) => k.dotsSvg(points, style);
const depth = (p: Point3) => k.depthOf(p, P);
const V = k.viewOf(P);

type Side = 'right' | 'left';
const sideX = (side: Side) => (side === 'right' ? -1 : 1);
const colour = (side: Side) => (side === 'right' ? 'heart-blue' : 'heart-red');

/** A ventricle or atrium plan, squeezed toward its inner (septum) edge. */
function chamberPlan(side: Side, w: number, d: number, squeeze: number) {
	const kw = 1 - 0.16 * squeeze;
	const kd = 1 - 0.12 * squeeze;
	const ww = w * kw;
	const dd = d * kd;
	const x = side === 'right' ? -SEPT - ww : SEPT;
	return { x, y: -dd / 2, w: ww, d: dd, r: 6 };
}
const centreX = (side: Side, w: number) => sideX(side) * (SEPT + w / 2);

// ---- tubes ---------------------------------------------------------------

interface Piece {
	key: number;
	svg: string;
}

/** A pipe through `route` (axis-aligned legs), ball elbows at the bends; pieces sorted by depth. */
function pipe(route: Point3[], r: number, className: string, flowId?: string, flowTone: k.LineTone = 'lo'): string {
	const pieces: Piece[] = [];
	for (let i = 0; i < route.length - 1; i++) {
		const a = route[i]!;
		const b = route[i + 1]!;
		const dir = k.sub3(b, a);
		const len = k.len3(dir);
		const F = k.frameAlong(a, dir);
		const startPad = i === 0 ? 0 : r * 0.6;
		const endPad = i === route.length - 2 ? 0 : r * 0.6;
		const mid = k.add3(a, k.mul3(dir, 0.5));
		pieces.push({ key: depth(mid), svg: S(k.prismOf(F, k.circlePolygon(r, 28), startPad, len - endPad, P), { tone: 'mid', crease: 'none', className }) });
	}
	for (let i = 1; i < route.length - 1; i++) {
		const c = route[i]!;
		pieces.push({ key: depth(c) + 0.01, svg: S(k.sphereOf(c, r * 1.22, P, 40), { tone: 'mid', crease: 'none', className }) });
	}
	pieces.sort((a, b) => a.key - b.key);
	let flow = '';
	if (flowId) {
		const pts: Flat[] = route.map((p, i) => {
			const prev = route[Math.max(0, i - 1)]!;
			const next = route[Math.min(route.length - 1, i + 1)]!;
			const axis = k.unit3(k.sub3(next, prev));
			const off = k.sub3(V, k.mul3(axis, k.dot3(V, axis)));
			const n = k.len3(off) > 1e-6 ? k.unit3(off) : ([0, 0, 1] as Point3);
			return at(k.add3(p, k.mul3(n, r * 0.62)));
		});
		flow = `<path class="iso-line heart-flow" data-free="" data-tone="${flowTone}" data-flow-id="${flowId}" d="${k.pathOf(pts)}"/>`;
	}
	return pieces.map((p) => p.svg).join('') + flow;
}

/** A collar where a pipe meets a face: a short wider ring along `axis`. */
function collar(o: Point3, axis: Point3, r: number, len: number, className = '') {
	return S(k.prismOf(k.frameAlong(o, axis), k.circlePolygon(r, 28), 0, len, P), { tone: 'mid', className });
}

// ---- base ----------------------------------------------------------------

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
	// Ruler strip along the front edge, ticks hanging from its back edge.
	const strip = { x: -60, y: PLATE.y + PLATE.d - 14, w: 150, d: 7, r: 1 };
	out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: 'lo', crease: 'none' }));
	const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, 0.6, [2, 3.6], P);
	out.push(L(ticks.minor, { tone: 'lo' }), L(ticks.major, { tone: 'mid' }));
	out.push(D([at([strip.x + 2, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, 0.6])], { size: 0.45 }));
	// Label plate, front left: three rule lines and two screws.
	const label = { x: -140, y: PLATE.y + PLATE.d - 20, w: 34, d: 12, r: 1.2 };
	out.push(S(k.slabOf(label, 0, 1, P, 3, 0.3), { tone: 'mid' }));
	for (const [i, yy] of [3.2, 6, 8.8].entries()) out.push(L(k.lineOnTop([label.x + 0.4, label.y + yy], [label.x + label.w - 0.4, label.y + yy], 1, P), { tone: i === 0 ? 'lo' : 'faint' }));
	out.push(D([at([label.x + 2.6, label.y + 6, 1]), at([label.x + label.w - 2.6, label.y + 6, 1])], { size: 0.45 }));
	return out.join('');
}

/** A tank (lungs or body) on a pad, with seams, ribs on its front, a lid and ports. */
function tank(plan: typeof LUNGS, ribTone: 'blue' | 'red', className: string): string {
	const out: string[] = [];
	const pad = { x: plan.x - 4, y: plan.y - 4, w: plan.w + 8, d: plan.d + 8, r: plan.r + 2 };
	out.push(S(k.slabOf(pad, 0, 4, P, 8, 0.6), { tone: 'mid' }));
	const seams = L(k.sideSeam(plan, 16, P, 10) + k.sideSeam(plan, TANK_TOP - 14, P, 10), { tone: 'lo' });
	out.push(S(k.slabOf(plan, 4, TANK_TOP - 4, P, 10, 1), { tone: 'hi', crease: 'lo', className, inner: seams }));
	// Vertical ribs on the front (+y) face, seam to seam.
	const ribs: string[] = [];
	for (let x = plan.x + plan.r + 3; x <= plan.x + plan.w - plan.r - 3 + 0.01; x += 4) ribs.push(k.segment([x, plan.y + plan.d, 16], [x, plan.y + plan.d, TANK_TOP - 14], P));
	out.push(L(ribs.join(''), { tone: ribTone }));
	// Lid with a bolt circle.
	const lid = k.insetPlan(plan, 5);
	out.push(S(k.slabOf(lid, TANK_TOP, 3, P, 10, 0.6), { tone: 'mid' }));
	const cx = plan.x + plan.w / 2;
	const cy = plan.y + plan.d / 2;
	const bolts: Flat[] = [];
	for (let i = 0; i < 8; i++) {
		const a = (i / 8) * Math.PI * 2;
		bolts.push(at([cx + Math.cos(a) * 14, cy + Math.sin(a) * 26, TANK_TOP + 3]));
	}
	out.push(D(bolts, { size: 0.5, tone: 'mid' }));
	return out.join('');
}

// ---- chambers (live) -----------------------------------------------------

const LIVE_KEYS = ['fill', 'shade0', 'shade1', 'shade2', 'shade3', 'top', 'crease', 'inner', 'edge'] as const;

function liveSolid(id: string, className: string): string {
	return (
		`<g class="iso-solid ${className}" data-live="${id}">` +
		`<path class="iso-fill" data-k="fill"/>` +
		[0, 1, 2, 3].map((s) => `<path class="iso-shade" data-shade="${s}" data-k="shade${s}"/>`).join('') +
		`<path class="iso-top" data-k="top"/><path class="iso-line iso-crease" data-tone="lo" data-k="crease"/>` +
		`<path class="iso-line" data-tone="lo" data-k="inner"/><path class="iso-line iso-edge" data-tone="hi" data-k="edge"/></g>`
	);
}

function chamberPaths(kind: 'ventricle' | 'atrium', side: Side, squeeze: number): Record<(typeof LIVE_KEYS)[number], string> {
	const isV = kind === 'ventricle';
	const plan = chamberPlan(side, isV ? V_W : A_W, isV ? V_D : A_D, squeeze);
	const z = isV ? 4 : A_BOT;
	const h = isV ? V_TOP - 4 : A_TOP - A_BOT;
	const paths = k.slabOf(plan, z, h, P, 8, 1);
	const inner = isV ? k.sideSeam(plan, 18, P) + k.sideSeam(plan, 36, P) : k.sideSeam(plan, A_BOT + 15, P);
	return {
		fill: paths.fill,
		shade0: paths.shades[0] ?? '',
		shade1: paths.shades[1] ?? '',
		shade2: paths.shades[2] ?? '',
		shade3: paths.shades[3] ?? '',
		top: paths.top,
		crease: paths.crease + (paths.bevel ?? ''),
		inner,
		edge: paths.outline
	};
}

// ---- valves --------------------------------------------------------------

/** AV valve: a coupling between atrium and ventricle with a hand wheel facing the viewer. */
function avValve(side: Side): string {
	const cx = centreX(side, A_W);
	const out: string[] = [];
	out.push(S(k.cylinder(cx, 0, 9, V_TOP, A_BOT - V_TOP, P, 36, 0.5), { tone: 'mid', className: colour(side) }));
	out.push(L(k.sideArc(cx, 0, 9, V_TOP + 5, P, 24), { tone: 'faint' }));
	return out.join('');
}

const AV_WHEEL_Y = V_D / 2 + 6;
const AV_WHEEL_Z = (V_TOP + A_BOT) / 2;

function avWheel(side: Side, id: string): string {
	const cx = centreX(side, A_W);
	const out: string[] = [];
	out.push(S(k.prismOf(k.axisFrame([cx, 8, AV_WHEEL_Z], 'y'), k.circlePolygon(1.6, 16), 0, AV_WHEEL_Y - 8, P), { tone: 'mid', crease: 'none' }));
	out.push(S(k.prismOf(k.axisFrame([cx, AV_WHEEL_Y, AV_WHEEL_Z], 'y'), k.circlePolygon(4.6, 32), 0, 2, P), { tone: 'hi' }));
	out.push(`<path class="iso-line heart-lever" data-tone="mid" data-lever="${id}" style="stroke-width:1.1"/>`);
	out.push(D([at([cx, AV_WHEEL_Y + 2, AV_WHEEL_Z])], { size: 0.6, tone: 'hi' }));
	return out.join('');
}

function avLever(side: Side, open: number): string {
	const cx = centreX(side, A_W);
	const a = (open * Math.PI) / 2;
	const y = AV_WHEEL_Y + 2;
	return k.segment([cx - Math.cos(a) * 4.6, y, AV_WHEEL_Z - Math.sin(a) * 4.6], [cx + Math.cos(a) * 4.6, y, AV_WHEEL_Z + Math.sin(a) * 4.6], P);
}

/** Outlet valve on an artery: flange, body, flange, with a stem and a knurled wheel on top. */
const OUT_X = { start: V_W + SEPT, f1: 58, b0: 62, b1: 72, f2: 76 };

function outletValve(side: Side, id: string, className: string): string {
	const s = sideX(side);
	const axis: Point3 = [s, 0, 0];
	const out: string[] = [];
	const parts: Array<[number, number, number, k.Tone]> = [
		[OUT_X.f1, OUT_X.b0, 8.4, 'mid'],
		[OUT_X.b0, OUT_X.b1, 7, 'hi'],
		[OUT_X.b1, OUT_X.f2, 8.4, 'mid']
	];
	// Paint the far flange first (the viewer sits toward +x).
	const ordered = side === 'right' ? [...parts].reverse() : parts;
	for (const [a, b, r, tone] of ordered) out.push(S(k.prismOf(k.frameAlong([s * a, 0, OUT_Z], axis), k.circlePolygon(r, 36), 0, b - a, P), { tone, className: tone === 'hi' ? className : '' }));
	const bx = s * ((OUT_X.b0 + OUT_X.b1) / 2);
	const boltRows: Flat[] = [];
	for (const fx of [OUT_X.f1 + 2, OUT_X.f2 - 2]) for (const a of [-0.9, 0, 0.9]) boltRows.push(at([s * fx, Math.sin(a) * 6.8, OUT_Z + Math.cos(a) * 6.8]));
	out.push(D(boltRows, { size: 0.45, tone: 'mid' }));
	out.push(S(k.cylinder(bx, 0, 1.6, OUT_Z + 6.6, 7, P, 16), { tone: 'mid', crease: 'none' }));
	out.push(S(k.cylinder(bx, 0, 5.2, OUT_Z + 13.6, 2.4, P, 36), { tone: 'hi' }));
	out.push(L(k.knurl(bx, 0, 5.2, OUT_Z + 13.6, OUT_Z + 16, 30, P), { tone: 'lo' }));
	out.push(`<path class="iso-line heart-lever" data-tone="mid" data-lever="${id}" style="stroke-width:1.1"/>`);
	out.push(D([at([bx, 0, OUT_Z + 16])], { size: 0.6, tone: 'hi' }));
	return out.join('');
}

function outletLever(side: Side, open: number): string {
	const bx = sideX(side) * ((OUT_X.b0 + OUT_X.b1) / 2);
	const a = (open * Math.PI) / 2;
	return k.lineOnTop([bx - Math.cos(a) * 5.2, -Math.sin(a) * 5.2], [bx + Math.cos(a) * 5.2, Math.sin(a) * 5.2], OUT_Z + 16, P);
}

// ---- assembly ------------------------------------------------------------

function heartBody(): string {
	const out: string[] = [bench()];
	// Vena cava: body tank -> behind the heart -> one elbow into the right atrium's back face.
	const raCx = centreX('right', A_W);
	out.push(pipe([[BODY.x, VC_Y, VC_Z], [raCx, VC_Y, VC_Z], [raCx, -A_D / 2, VC_Z]], TUBE_R, 'heart-blue', 'vena-cava', 'blue'));
	// Lungs tank, then the pulmonary artery from the right ventricle into its inner face.
	out.push(tank(LUNGS, 'blue', 'heart-lung'));
	const lungFace = LUNGS.x + LUNGS.w;
	out.push(collar([lungFace, 0, OUT_Z], [1, 0, 0], 7.2, 3));
	out.push(pipe([[lungFace + 3, 0, OUT_Z], [-OUT_X.f2, 0, OUT_Z]], TUBE_R, 'heart-blue', 'pulmonary-artery', 'blue'));
	out.push(outletValve('right', 'pulmonary', 'heart-blue'));
	out.push(pipe([[-OUT_X.f1, 0, OUT_Z], [-OUT_X.start, 0, OUT_Z]], TUBE_R, 'heart-blue'));
	// Right pump: pad, ventricle, coupling, atrium.
	for (const side of ['right', 'left'] as Side[]) {
		const pad = { x: side === 'right' ? -SEPT - V_W - 3 : SEPT - 1, y: -V_D / 2 - 3, w: V_W + 4, d: V_D + 6, r: 4 };
		if (side === 'left') out.push(S(k.slabOf({ x: -SEPT, y: -A_D / 2 - 2, w: SEPT * 2, d: A_D + 4, r: 1 }, 0, A_TOP + 2, P, 3, 0.4), { tone: 'mid' }));
		out.push(S(k.slabOf(pad, 0, 4, P, 6, 0.5), { tone: 'mid' }));
		out.push(liveSolid(`${side}-ventricle`, colour(side)));
		out.push(avValve(side));
		out.push(liveSolid(`${side}-atrium`, colour(side)));
		if (side === 'left') {
			// Aorta: from the left ventricle through the aortic valve into the body tank.
			out.push(pipe([[OUT_X.start, 0, OUT_Z], [OUT_X.f1, 0, OUT_Z]], TUBE_R, 'heart-red'));
			out.push(outletValve('left', 'aortic', 'heart-red'));
			out.push(pipe([[OUT_X.f2, 0, OUT_Z], [BODY.x - 3, 0, OUT_Z]], TUBE_R, 'heart-red', 'aorta', 'red'));
			out.push(collar([BODY.x - 3, 0, OUT_Z], [1, 0, 0], 7.2, 3));
		}
	}
	out.push(tank(BODY, 'red', 'heart-body'));
	out.push(avWheel('right', 'tricuspid'), avWheel('left', 'mitral'));
	// Pulmonary veins: up out of the lungs lid, over the top, down into the left atrium.
	const lungX = LUNGS.x + LUNGS.w / 2;
	const laX = centreX('left', A_W);
	out.push(collar([lungX, 0, TANK_TOP + 3], [0, 0, 1], 7.2, 3));
	out.push(collar([laX, 0, A_TOP], [0, 0, 1], 7.2, 3));
	out.push(pipe([[lungX, 0, TANK_TOP + 6], [lungX, 0, PV_Z], [laX, 0, PV_Z], [laX, 0, A_TOP + 3]], TUBE_R, 'heart-red', 'pulmonary-veins', 'red'));
	return out.join('');
}

export interface Anchor {
	id: string;
	label: string;
	/** Percent of the figure box. */
	x: number;
	y: number;
}

const ANCHOR_POINTS: Array<[string, string, Point3]> = [
	['right-atrium', 'Right atrium', [centreX('right', A_W) - 6, A_D / 2, A_BOT + 20]],
	['right-ventricle', 'Right ventricle', [centreX('right', V_W) - 6, V_D / 2, 30]],
	['left-atrium', 'Left atrium', [centreX('left', A_W) + 6, A_D / 2, A_BOT + 20]],
	['left-ventricle', 'Left ventricle', [centreX('left', V_W) + 6, V_D / 2, 30]],
	['tricuspid', 'Tricuspid valve', [centreX('right', A_W), AV_WHEEL_Y + 2, AV_WHEEL_Z]],
	['mitral', 'Mitral valve', [centreX('left', A_W), AV_WHEEL_Y + 2, AV_WHEEL_Z]],
	['pulmonary-valve', 'Pulmonary valve', [-(OUT_X.b0 + OUT_X.b1) / 2, 0, OUT_Z + 16]],
	['aortic-valve', 'Aortic valve', [(OUT_X.b0 + OUT_X.b1) / 2, 0, OUT_Z + 16]],
	['aorta', 'Aorta', [90, 0, OUT_Z + TUBE_R]],
	['vena-cava', 'Vena cava', [60, VC_Y, VC_Z + TUBE_R]],
	['pulmonary-artery', 'Pulmonary artery', [-90, 0, OUT_Z + TUBE_R]],
	['pulmonary-veins', 'Pulmonary veins', [-50, 0, PV_Z + TUBE_R]],
	['lungs', 'Lungs', [LUNGS.x + LUNGS.w / 2, LUNGS.y + LUNGS.d, 60]],
	['body', 'Body', [BODY.x + BODY.w / 2, BODY.y + BODY.d, 60]]
];

export const ANCHORS: Anchor[] = ANCHOR_POINTS.map(([id, label, p]) => {
	const [x, y] = at(p);
	return { id, label, x: Math.round((x / WIDTH) * 1000) / 10, y: Math.round((y / HEIGHT) * 1000) / 10 };
});

export const HEART_CSS = `
.heart-blue>.iso-edge{stroke:color-mix(in srgb,var(--anatomy-blue) 80%,var(--anatomy-hi))}
.heart-red>.iso-edge{stroke:color-mix(in srgb,var(--anatomy-red) 80%,var(--anatomy-hi))}
.heart-blue>.iso-top{fill:color-mix(in srgb,var(--anatomy-blue) 20%,var(--anatomy-top))}
.heart-red>.iso-top{fill:color-mix(in srgb,var(--anatomy-red) 20%,var(--anatomy-top))}
.heart-blue>.iso-shade[data-shade="3"],.heart-blue>.iso-shade[data-shade="2"]{fill:color-mix(in srgb,var(--anatomy-blue) 14%,var(--anatomy-shade-2))}
.heart-red>.iso-shade[data-shade="3"],.heart-red>.iso-shade[data-shade="2"]{fill:color-mix(in srgb,var(--anatomy-red) 14%,var(--anatomy-shade-2))}
.heart-blue>.iso-shade[data-shade="0"],.heart-blue>.iso-shade[data-shade="1"]{fill:color-mix(in srgb,var(--anatomy-blue) 10%,var(--anatomy-shade-0))}
.heart-red>.iso-shade[data-shade="0"],.heart-red>.iso-shade[data-shade="1"]{fill:color-mix(in srgb,var(--anatomy-red) 10%,var(--anatomy-shade-0))}
.heart-flow{stroke-dasharray:2 5;stroke-width:1.1}
`;

export const LABEL = 'A heart drawn as two pumps on a bench: blue right side to the lungs, red left side to the body.';

/** The whole figure as an SVG string at the given state (chambers and levers filled in). */
export function heartSvg(params: HeartParams = clampParams(), t?: number, standalone: k.Theme | false = false): string {
	const svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL, body: heartBody(), standalone });
	const state = stateAt(params, t ?? stillTime(params));
	return fillLive(svg, state);
}

/** String version of the per-frame update, for static exports and SSR-free checks. */
function fillLive(svg: string, s: HeartState): string {
	let out = svg;
	for (const side of ['right', 'left'] as Side[]) {
		for (const kind of ['ventricle', 'atrium'] as const) {
			const paths = chamberPaths(kind, side, kind === 'ventricle' ? s.ventricleSqueeze : s.atriumSqueeze);
			for (const key of LIVE_KEYS) out = out.replace(new RegExp(`(data-live="${side}-${kind}"[^]*?)data-k="${key}"`), `$1data-k="${key}" d="${paths[key]}"`);
		}
	}
	for (const [id, d] of leverPaths(s)) out = out.replace(`data-lever="${id}"`, `data-lever="${id}" d="${d}"`);
	return out;
}

function leverPaths(s: HeartState): Array<[string, string]> {
	return [
		['tricuspid', avLever('right', s.valves.tricuspid)],
		['mitral', avLever('left', s.valves.mitral)],
		['pulmonary', outletLever('right', s.valves.pulmonary)],
		['aortic', outletLever('left', s.valves.aortic)]
	];
}

// ---- live mount ----------------------------------------------------------

export interface MountOptions {
	theme?: k.Theme;
	params?: Partial<HeartParams>;
	onReadout?: (values: Record<string, string>) => void;
}

export interface FigureHandle {
	update(params: Partial<Record<string, number>>): void;
	setTheme(theme: k.Theme): void;
	/** Park the figure at `t` seconds into the cycle and stop the loop (captures, tests). */
	seek(t: number): void;
	destroy(): void;
}

const STYLE_ID = 'ripple-iso-heart-css';
const FLOW_PX = 0.22; // dash px per ml/s

export function mount(el: HTMLElement, { theme = 'dark', params: initial, onReadout }: MountOptions = {}): FigureHandle {
	const doc = el.ownerDocument;
	if (!doc.getElementById(STYLE_ID)) {
		const style = doc.createElement('style');
		style.id = STYLE_ID;
		style.textContent = k.ISO_CSS + HEART_CSS;
		doc.head.appendChild(style);
	}
	let params = clampParams(initial);
	const parsed = new DOMParser().parseFromString(heartSvg(params), 'image/svg+xml').documentElement;
	const svg = doc.importNode(parsed, true) as unknown as SVGSVGElement;
	el.classList.add('iso');
	el.dataset.theme = theme;
	el.replaceChildren(svg);

	const live = new Map<string, Map<string, SVGPathElement>>();
	for (const g of svg.querySelectorAll<SVGGElement>('[data-live]')) {
		const parts = new Map<string, SVGPathElement>();
		for (const p of g.querySelectorAll<SVGPathElement>('[data-k]')) parts.set(p.dataset.k!, p);
		live.set(g.dataset.live!, parts);
	}
	const levers = new Map<string, SVGPathElement>();
	for (const p of svg.querySelectorAll<SVGPathElement>('[data-lever]')) levers.set(p.dataset.lever!, p);
	const flows = [...svg.querySelectorAll<SVGPathElement>('[data-flow-id]')];
	const offsets = new Map<SVGPathElement, number>();

	const win = doc.defaultView;
	const still = win?.matchMedia?.('(prefers-reduced-motion: reduce)');
	let t = still?.matches ? stillTime(params) : 0;
	let lastPhase = '';
	let lastKey = '';
	let parked = false;

	function draw(state: HeartState, dt: number) {
		for (const side of ['right', 'left'] as Side[]) {
			for (const kind of ['ventricle', 'atrium'] as const) {
				const parts = live.get(`${side}-${kind}`);
				if (!parts) continue;
				const paths = chamberPaths(kind, side, kind === 'ventricle' ? state.ventricleSqueeze : state.atriumSqueeze);
				for (const key of LIVE_KEYS) parts.get(key)?.setAttribute('d', paths[key]);
			}
		}
		for (const [id, d] of leverPaths(state)) {
			const lever = levers.get(id);
			if (!lever) continue;
			lever.setAttribute('d', d);
			const open = state.valves[id === 'pulmonary' ? 'pulmonary' : id === 'aortic' ? 'aortic' : id === 'mitral' ? 'mitral' : 'tricuspid'];
			lever.dataset.tone = open > 0.5 ? 'lit' : 'mid';
		}
		for (const path of flows) {
			const artery = path.dataset.flowId === 'aorta' || path.dataset.flowId === 'pulmonary-artery';
			const rate = artery ? state.flow.artery : state.flow.vein;
			const next = ((offsets.get(path) ?? 0) - rate * FLOW_PX * dt) % 7;
			offsets.set(path, next);
			path.setAttribute('stroke-dashoffset', next.toFixed(2));
		}
		const readouts = readoutsOf(params, state);
		const key = JSON.stringify(readouts);
		if (key !== lastKey) {
			lastKey = key;
			onReadout?.(readouts);
		}
		if (state.phase !== lastPhase) {
			lastPhase = state.phase;
			svg.setAttribute('aria-label', describe(params, state));
		}
	}

	let frame = 0;
	let last = 0;
	let visible = true;
	const loop = (now: number) => {
		const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
		last = now;
		t += dt;
		draw(stateAt(params, t), dt);
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
		if (still?.matches) t = stillTime(params);
		draw(stateAt(params, t), 0);
		sync();
	};
	still?.addEventListener?.('change', onStill);
	draw(stateAt(params, t), 0);
	run();

	return {
		update(next) {
			params = clampParams({ ...params, ...next });
			if (still?.matches) t = stillTime(params);
			lastPhase = '';
			draw(stateAt(params, t), 0);
		},
		setTheme(next) {
			el.dataset.theme = next;
		},
		seek(time) {
			parked = true;
			stop();
			t = time;
			draw(stateAt(params, t), 0);
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
