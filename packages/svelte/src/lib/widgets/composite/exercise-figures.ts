// widgets/composite/exercise-figures.ts — the curated library of animated
// exercise figures for `interval-workout`. Each figure is a line person posed
// by joint angles (keyframes below) and turned into a fixed SVG string at
// module load: our code, never model output. The widget picks one by name
// (matchFigure) or by an explicit `figure` id.
//
// Invariants:
// - Every string is built here from numbers only. Nothing from a spec or a
//   prop ever reaches these strings, so rendering them with {@html} is safe.
// - Animation is SMIL only (<animate> on path `d` and circle cx/cy). No
//   scripts, no external refs, no event attributes.
// - `still` is the same figure with no animation elements, frozen on the key
//   pose: list rows and reduced motion use it.
// - Angles: 0 points down, 90 forward (right, the way side-view figures
//   face), 180 up, -90 back. Each limb segment is absolute, not relative.

type Seg = [number, number];
type Pt = [number, number];
type Joint = 'ankle' | 'wrist' | 'hip';

interface Pose {
	/** Torso, hip to shoulders. */
	t: number;
	/** Spine bend in px (+ sags toward the belly side when lying face down). */
	b?: number;
	/** Head angle relative to the torso. */
	h?: number;
	/** Near arm [upper, forearm] and leg [thigh, shin]; far ones default to near (side view) or mirror (front view). */
	a: Seg;
	A?: Seg;
	l: Seg;
	L?: Seg;
	/** Lift off the floor in px (jumps). */
	y?: number;
	/** Joint that holds still between the previous frame and this one. */
	k?: Joint;
}

interface Def {
	aliases: string[];
	dur: number;
	poses: Pose[];
	/** Front view: far limbs mirror the near ones and draw at full strength. */
	front?: boolean;
	/** Default joint that stays planted frame to frame. */
	anchor?: Joint;
	/** Pose index for the static frame. */
	key?: number;
	wall?: boolean;
}

const TORSO = 18;
const UPPER = 10;
const FORE = 9;
const THIGH = 12;
const SHIN = 12;
const HEAD_R = 4.5;
const HEAD_OFF = 7.5;
const SHOULDER_W = 4.5;
const HIP_W = 2.5;
const GROUND = 56;
const ACCENT = '#1877F2';

const STAND: Pick<Pose, 't' | 'l'> = { t: 180, l: [0, 0] };
const RUN_A: Seg = [-35, 50];
const RUN_B: Seg = [40, 130];
const PLANK: Pick<Pose, 't' | 'l'> = { t: 117, l: [-63, -63] };

const DEFS: Record<string, Def> = {
	// ── Yoga ────────────────────────────────────────────────────────────────
	'mountain-pose': {
		aliases: ['mountain', 'tadasana', 'upward salute', 'samasthiti'],
		dur: 4,
		front: true,
		key: 1,
		poses: [
			{ t: 180, a: [12, 6], l: [4, 2] },
			{ t: 180, a: [165, 175], l: [4, 2] }
		]
	},
	'cat-cow': {
		aliases: ['cat cow', 'cat and cow', 'cat camel', 'marjaryasana', 'bitilasana', 'cat', 'cow'],
		dur: 4,
		anchor: 'hip',
		key: 1,
		poses: [
			{ t: 110, b: 3.5, h: 45, a: [0, 0], l: [0, -90] },
			{ t: 110, b: -4.5, h: -70, a: [0, 0], l: [0, -90] }
		]
	},
	'downward-dog': {
		aliases: ['downward dog', 'down dog', 'downdog', 'downward facing dog', 'adho mukha svanasana'],
		dur: 3,
		anchor: 'wrist',
		poses: [
			{ t: 55, h: -10, a: [55, 55], l: [-12, -55], L: [-25, -25] },
			{ t: 55, h: -10, a: [55, 55], l: [-25, -25], L: [-12, -55] }
		]
	},
	'childs-pose': {
		aliases: ['childs pose', 'child', 'balasana', 'extended child'],
		dur: 4.5,
		anchor: 'hip',
		poses: [
			{ t: 68, b: -2.5, h: -20, a: [92, 90], l: [35, -90] },
			{ t: 74, b: -4, h: -18, a: [91, 90], l: [35, -90] }
		]
	},
	cobra: {
		aliases: ['cobra', 'bhujangasana', 'baby cobra', 'sphinx', 'upward dog', 'upward facing dog'],
		dur: 3.5,
		anchor: 'ankle',
		key: 1,
		poses: [
			{ t: 100, a: [-114, 37], l: [-90, -90] },
			{ t: 140, h: 25, a: [-30, 55], l: [-90, -90] }
		]
	},
	'warrior-one': {
		aliases: ['warrior one', 'warrior 1', 'warrior i', 'virabhadrasana i', 'virabhadrasana 1', 'crescent lunge', 'high lunge'],
		dur: 3.5,
		key: 1,
		poses: [
			{ t: 180, a: [20, 150], l: [60, 0], L: [-45, -45] },
			{ t: 180, h: 10, a: [172, 178], l: [60, 0], L: [-45, -45] }
		]
	},
	'warrior-two': {
		aliases: ['warrior two', 'warrior 2', 'warrior ii', 'virabhadrasana ii', 'virabhadrasana 2'],
		dur: 3.5,
		front: true,
		anchor: 'hip',
		key: 1,
		poses: [
			{ t: 180, a: [15, 10], l: [35, 35], L: [-35, -35] },
			{ t: 180, a: [90, 90], l: [62, 10], L: [-38, -38] }
		]
	},
	'tree-pose': {
		aliases: ['tree', 'vrksasana', 'vriksasana'],
		dur: 4,
		front: true,
		key: 1,
		poses: [
			{ t: 180, a: [25, -145], A: [-25, 145], l: [0, 0], L: [-95, 50] },
			{ t: 180, a: [155, -160], A: [-155, 160], l: [0, 0], L: [-95, 50] }
		]
	},
	bridge: {
		aliases: ['bridge', 'setu bandhasana', 'setu bandha sarvangasana'],
		dur: 4,
		key: 1,
		poses: [
			{ t: -90, a: [90, 90], l: [145, 5] },
			{ t: -56, h: -34, a: [90, 90], l: [99, -4] }
		]
	},
	'seated-forward-fold': {
		aliases: ['seated forward fold', 'seated forward bend', 'paschimottanasana', 'forward fold', 'forward bend', 'hamstring stretch', 'sit and reach'],
		dur: 4.5,
		anchor: 'hip',
		key: 1,
		poses: [
			{ t: 175, a: [168, 175], l: [90, 90] },
			{ t: 132, b: -3, h: -20, a: [108, 100], l: [90, 90] }
		]
	},
	triangle: {
		aliases: ['triangle', 'trikonasana', 'extended triangle'],
		dur: 4,
		front: true,
		anchor: 'hip',
		key: 1,
		poses: [
			{ t: 180, a: [90, 90], A: [-90, -90], l: [32, 32], L: [-32, -32] },
			{ t: 115, a: [25, 25], A: [205, 205], l: [32, 32], L: [-32, -32] }
		]
	},
	plank: {
		aliases: ['plank', 'high plank', 'forearm plank', 'plank hold', 'shoulder tap', 'plank shoulder tap', 'phalakasana'],
		dur: 2.4,
		poses: [
			{ ...PLANK, h: 5, a: [0, 0], A: [0, 0] },
			{ ...PLANK, h: 5, a: [60, -120], A: [0, 0] }
		]
	},

	// ── HIIT and strength ───────────────────────────────────────────────────
	'jumping-jacks': {
		aliases: ['jumping jack', 'star jump', 'jack'],
		dur: 1.2,
		front: true,
		anchor: 'hip',
		key: 2,
		poses: [
			{ t: 180, a: [10, 5], l: [3, 0] },
			{ t: 180, a: [90, 100], l: [13, 12], y: 4 },
			{ t: 180, a: [160, 170], l: [24, 24] },
			{ t: 180, a: [90, 100], l: [13, 12], y: 4 }
		]
	},
	squat: {
		aliases: ['squat', 'air squat', 'bodyweight squat', 'goblet squat', 'sumo squat', 'chair', 'utkatasana'],
		dur: 2.4,
		key: 1,
		poses: [
			{ ...STAND, a: [5, 10] },
			{ t: 145, h: 25, a: [90, 90], l: [85, -20] }
		]
	},
	lunge: {
		aliases: ['lunge', 'reverse lunge', 'forward lunge', 'walking lunge', 'alternating lunge', 'split squat'],
		dur: 2.6,
		key: 1,
		poses: [
			{ ...STAND, a: [10, 5] },
			{ t: 180, a: [10, 5], l: [85, 0], L: [-15, -80] }
		]
	},
	'push-up': {
		aliases: ['push up', 'pushup', 'press up', 'knee push up', 'incline push up', 'tricep push up', 'chaturanga'],
		dur: 2,
		poses: [
			{ ...PLANK, h: 5, a: [0, 0] },
			{ t: 100, h: 5, a: [-86, 43], l: [-80, -80] }
		]
	},
	burpee: {
		aliases: ['burpee', 'half burpee', 'squat thrust'],
		dur: 3,
		key: 2,
		poses: [
			{ ...STAND, a: [10, 5] },
			{ t: 110, h: 20, a: [0, 0], l: [75, -35] },
			{ ...PLANK, a: [0, 0], k: 'wrist' },
			{ t: 110, h: 20, a: [0, 0], l: [75, -35], k: 'wrist' },
			{ ...STAND, a: [10, 5] },
			{ ...STAND, a: [170, 175], y: 6 }
		]
	},
	'mountain-climbers': {
		aliases: ['mountain climber', 'climber', 'cross body mountain climber'],
		dur: 1,
		anchor: 'wrist',
		poses: [
			{ t: 117, a: [0, 0], l: [75, -60], L: [-63, -63] },
			{ t: 117, a: [0, 0], l: [-63, -63], L: [75, -60] }
		]
	},
	'high-knees': {
		aliases: ['high knee', 'knee raise', 'marching', 'march in place', 'high knee run'],
		dur: 0.8,
		anchor: 'hip',
		poses: [
			{ t: 180, a: RUN_A, A: RUN_B, l: [90, 0], L: [0, 0] },
			{ t: 180, a: RUN_B, A: RUN_A, l: [0, 0], L: [90, 0] }
		]
	},
	'sit-up': {
		aliases: ['sit up', 'situp', 'crunch', 'ab crunch', 'abdominal crunch', 'curl up', 'v up'],
		dur: 2.2,
		key: 1,
		poses: [
			{ t: -90, a: [-70, 60], l: [140, 10] },
			{ t: -135, a: [-115, 15], l: [140, 10] }
		]
	},
	'glute-bridge': {
		aliases: ['glute bridge', 'hip bridge', 'hip raise', 'hip thrust', 'butt bridge'],
		dur: 2.2,
		key: 1,
		poses: [
			{ t: -90, a: [90, 90], l: [145, 5] },
			{ t: -56, h: -34, a: [90, 90], l: [99, -4] }
		]
	},
	'side-plank': {
		aliases: ['side plank', 'side plank hold', 'vasisthasana'],
		dur: 3,
		poses: [
			{ ...PLANK, a: [0, 0], A: [180, 180] },
			{ ...PLANK, b: 3, a: [0, 0], A: [150, 150] }
		]
	},
	'jump-squat': {
		aliases: ['jump squat', 'squat jump', 'plyo squat', 'frog jump'],
		dur: 1.6,
		poses: [
			{ t: 145, h: 25, a: [-25, -15], l: [85, -20] },
			{ t: 180, a: [160, 170], l: [0, 5], y: 7 }
		]
	},
	'butt-kicks': {
		aliases: ['butt kick', 'butt kicker', 'heel kick', 'heel flick'],
		dur: 0.8,
		anchor: 'hip',
		poses: [
			{ t: 180, a: RUN_A, A: RUN_B, l: [-8, -165], L: [0, 0] },
			{ t: 180, a: RUN_B, A: RUN_A, l: [0, 0], L: [-8, -165] }
		]
	},
	'arm-circles': {
		aliases: ['arm circle', 'shoulder circle', 'arm swing', 'arm rotation'],
		dur: 1.2,
		front: true,
		anchor: 'hip',
		poses: [
			{ t: 180, a: [80, 80], l: [4, 2] },
			{ t: 180, a: [90, 96], l: [4, 2] },
			{ t: 180, a: [100, 100], l: [4, 2] },
			{ t: 180, a: [90, 84], l: [4, 2] }
		]
	},
	'wall-sit': {
		aliases: ['wall sit', 'wall squat', 'wall chair'],
		dur: 3,
		wall: true,
		poses: [
			{ t: 180, a: [80, 90], l: [90, 0] },
			{ t: 180, b: 0.8, a: [76, 92], l: [90, 0] }
		]
	},
	superman: {
		aliases: ['superman', 'superman hold', 'swimmer', 'back extension', 'locust', 'salabhasana'],
		dur: 2.6,
		anchor: 'hip',
		key: 1,
		poses: [
			{ t: 93, a: [95, 95], l: [-93, -93] },
			{ t: 108, h: 12, a: [122, 122], l: [-110, -110] }
		]
	},
	'bicycle-crunch': {
		aliases: ['bicycle crunch', 'bicycle', 'bicycle kick', 'bicycle sit up'],
		dur: 1.4,
		anchor: 'hip',
		poses: [
			{ t: -125, h: -10, a: [-105, 25], l: [150, 80], L: [100, 95] },
			{ t: -125, h: -10, a: [-105, 25], l: [100, 95], L: [150, 80] }
		]
	},
	'running-in-place': {
		aliases: ['running in place', 'run in place', 'jog in place', 'jogging', 'jog', 'running', 'run', 'sprint'],
		dur: 0.7,
		anchor: 'hip',
		poses: [
			{ t: 175, a: RUN_A, A: RUN_B, l: [40, -20], L: [-20, -80] },
			{ t: 175, a: RUN_B, A: RUN_A, l: [-20, -80], L: [40, -20] }
		]
	},
	stretch: {
		aliases: ['stretch', 'stretching', 'side stretch', 'standing stretch', 'overhead stretch', 'side bend', 'cool down', 'cooldown', 'warm up', 'warmup'],
		dur: 4,
		front: true,
		anchor: 'hip',
		key: 1,
		poses: [
			{ t: 180, a: [170, 178], l: [4, 2] },
			{ t: 160, a: [140, 150], A: [170, 165], l: [4, 2] },
			{ t: 180, a: [170, 178], l: [4, 2] },
			{ t: 200, a: [-170, -165], A: [-140, -150], l: [4, 2] }
		]
	},
	rest: {
		aliases: ['rest', 'break', 'recover', 'recovery', 'breathe', 'breathing', 'breath', 'water break', 'relax', 'meditation', 'meditate', 'easy pose', 'sukhasana'],
		dur: 4.5,
		front: true,
		anchor: 'hip',
		poses: [
			{ t: 180, a: [15, 0], l: [75, -100] },
			{ t: 180, a: [19, 3], l: [75, -100], y: 1 }
		]
	}
};

// ── Geometry ──────────────────────────────────────────────────────────────

const RAD = Math.PI / 180;
const dir = (deg: number, len: number): Pt => [Math.sin(deg * RAD) * len, Math.cos(deg * RAD) * len];
const add = (p: Pt, q: Pt): Pt => [p[0] + q[0], p[1] + q[1]];
const mirror = (s: Seg): Seg => [-s[0], -s[1]];
const neg = (q: Pt): Pt => [-q[0], -q[1]];

interface Frame {
	hip: Pt;
	ctrl: Pt;
	sh: Pt;
	head: Pt;
	arms: [Pt[], Pt[]];
	legs: [Pt[], Pt[]];
	low: Pt;
}

/** Root, joint offset (shoulder or hip width in front view), elbow or knee, wrist or ankle. */
function limb(root: Pt, off: Pt, [u, f]: Seg, l1: number, l2: number): Pt[] {
	const from = add(root, off);
	const mid = add(from, dir(u, l1));
	return [root, from, mid, add(mid, dir(f, l2))];
}

function skeleton(p: Pose, front: boolean): Frame {
	const hip: Pt = [0, 0];
	const sh = dir(p.t, TORSO);
	const bend = dir(p.t - 90, p.b ?? 0);
	const half = dir(p.t, TORSO / 2);
	const far = (s: Seg | undefined, near: Seg) => s ?? (front ? mirror(near) : near);
	const shW = front ? dir(p.t - 90, SHOULDER_W) : ([0, 0] as Pt);
	const hipW = front ? dir(p.t - 90, HIP_W) : ([0, 0] as Pt);
	return {
		hip,
		sh,
		ctrl: add(half, [bend[0] * 2, bend[1] * 2]),
		low: add(half, bend),
		head: add(sh, dir(p.t + (p.h ?? 0), HEAD_OFF)),
		arms: [limb(sh, neg(shW), far(p.A, p.a), UPPER, FORE), limb(sh, shW, p.a, UPPER, FORE)],
		legs: [limb(hip, neg(hipW), far(p.L, p.l), THIGH, SHIN), limb(hip, hipW, p.l, THIGH, SHIN)]
	};
}

const points = (f: Frame): Pt[] => [f.hip, f.sh, f.low, ...f.arms.flat(), ...f.legs.flat()];
const joint = (f: Frame, j: Joint): Pt => (j === 'hip' ? f.hip : j === 'wrist' ? f.arms[1][3] : f.legs[1][3]);

function move(f: Frame, fn: (p: Pt) => Pt): Frame {
	return {
		hip: fn(f.hip),
		ctrl: fn(f.ctrl),
		sh: fn(f.sh),
		head: fn(f.head),
		low: fn(f.low),
		arms: [f.arms[0].map(fn), f.arms[1].map(fn)],
		legs: [f.legs[0].map(fn), f.legs[1].map(fn)]
	};
}

/** Frames on the floor, chained so the anchor joint holds still, then fit to the 64 box. */
function layout(def: Def): Frame[] {
	const placed: Frame[] = [];
	def.poses.forEach((pose, i) => {
		const f = skeleton(pose, !!def.front);
		const lowest = Math.max(...points(f).map((p) => p[1]), f.head[1] + HEAD_R);
		const dy = GROUND - lowest - (pose.y ?? 0);
		const j = pose.k ?? def.anchor ?? 'ankle';
		const dx = i === 0 ? 0 : joint(placed[i - 1], j)[0] - joint(f, j)[0];
		placed.push(move(f, (p) => [p[0] + dx, p[1] + dy]));
	});
	const all = placed.flatMap((f) => [...points(f), [f.head[0] - HEAD_R, f.head[1] - HEAD_R] as Pt, [f.head[0] + HEAD_R, f.head[1] + HEAD_R] as Pt]);
	const xs = all.map((p) => p[0]);
	const top = Math.min(...all.map((p) => p[1]));
	const left = Math.min(...xs);
	const right = Math.max(...xs);
	const s = Math.min(1, 52 / (right - left), (GROUND - 4) / (GROUND - top));
	const cx = (left + right) / 2;
	return placed.map((f) => move(f, (p) => [32 + (p[0] - cx) * s, GROUND - (GROUND - p[1]) * s]));
}

// ── SVG ───────────────────────────────────────────────────────────────────

const n = (v: number) => String(Math.round(v * 10) / 10);
const xy = (p: Pt) => `${n(p[0])} ${n(p[1])}`;
const line = (ps: Pt[]) => `M${xy(ps[0])}L${ps.slice(1).map(xy).join(' ')}`;
const spine = (f: Frame) => `M${xy(f.hip)}Q${xy(f.ctrl)} ${xy(f.sh)}`;

function anim(attr: string, values: string[], dur: number): string {
	const v = [...values, values[0]];
	const steps = v.length - 1;
	const times = v.map((_, i) => n(i / steps)).join(';');
	const splines = Array.from({ length: steps }, () => '.42 0 .58 1').join(';');
	return `<animate attributeName="${attr}" dur="${dur}s" repeatCount="indefinite" calcMode="spline" keyTimes="${times}" keySplines="${splines}" values="${v.join(';')}"/>`;
}

function build(def: Def, animated: boolean): string {
	const frames = layout(def);
	const key = frames[def.key ?? 0];
	const go = animated && frames.length > 1;
	const path = (get: (f: Frame) => string, extra = '') =>
		`<path${extra} d="${get(key)}">${go ? anim('d', frames.map(get), def.dur) : ''}</path>`;
	const head = `<circle cx="${n(key.head[0])}" cy="${n(key.head[1])}" r="${HEAD_R}">${
		go ? anim('cx', frames.map((f) => n(f.head[0])), def.dur) + anim('cy', frames.map((f) => n(f.head[1])), def.dur) : ''
	}</circle>`;
	const back = def.front ? '' : ' stroke-opacity=".4"';
	const wallX = def.wall ? Math.min(...frames.flatMap((f) => [f.hip[0], f.sh[0]])) - 3.5 : 0;
	return [
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">',
		`<path d="M6 59H58" stroke="${ACCENT}" stroke-width="2"/>`,
		def.wall ? `<path d="M${n(wallX)} 10V59" stroke="${ACCENT}" stroke-width="2"/>` : '',
		path((f) => line(f.legs[0]), back),
		path((f) => line(f.arms[0]), back),
		path(spine),
		head,
		path((f) => line(f.legs[1])),
		path((f) => line(f.arms[1])),
		'</svg>'
	].join('');
}

// ── Library and matching ──────────────────────────────────────────────────

/** Lowercase words, no punctuation, no "pose", plurals made singular. */
export function normalizeExerciseName(name: string): string {
	return name
		.toLowerCase()
		.replace(/['’]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.split(' ')
		.filter((w) => w && w !== 'pose' && w !== 'position')
		.map((w) => (/(ch|sh|x)es$/.test(w) ? w.slice(0, -2) : w.length > 2 && /[^s]s$/.test(w) ? w.slice(0, -1) : w))
		.join(' ');
}

export interface ExerciseFigure {
	id: string;
	/** Normalized names that pick this figure (the id's words included). */
	aliases: string[];
	/** Animated SVG markup. */
	svg: string;
	/** The key pose, no animation. */
	still: string;
}

export const EXERCISE_FIGURES: Record<string, ExerciseFigure> = Object.fromEntries(
	Object.entries(DEFS).map(([id, def]) => [
		id,
		{
			id,
			aliases: [...new Set([id, ...def.aliases].map(normalizeExerciseName))],
			svg: build(def, true),
			still: build(def, false)
		}
	])
);

export const FIGURE_IDS = Object.keys(EXERCISE_FIGURES);

const ALIASES = FIGURE_IDS.flatMap((id) => EXERCISE_FIGURES[id].aliases.map((alias) => ({ id, alias }))).toSorted(
	(a, b) => b.alias.length - a.alias.length
);

/**
 * The figure id for an exercise: a known explicit id wins, else the longest
 * alias found as whole words in the name ("Jump squats" picks jump-squat over
 * squat), else null.
 */
export function matchFigure(name: string, explicit?: string): string | null {
	if (explicit && Object.hasOwn(EXERCISE_FIGURES, explicit)) return explicit;
	if (typeof name !== 'string') return null;
	const hay = ` ${normalizeExerciseName(name)} `;
	return ALIASES.find(({ alias }) => hay.includes(` ${alias} `))?.id ?? null;
}
