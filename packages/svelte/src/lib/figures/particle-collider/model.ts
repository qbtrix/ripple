// figures/particle-collider/model.ts: the one model behind the particle
// collider figure. Pure, no DOM. From the beam energy (TeV per proton) and the
// bunch rate (million bunch crossings a second at the detector) it gives the
// proton's speed as a share of light speed, the dipole field that bends it,
// the collision energy, the collisions a second, where every bunch is on the
// drawn ring at time t, the collision bursts (seeded, so a frame is
// reproducible) and the screen-reader text.
//
// Physics, with LHC numbers: gamma = E / 0.938272 GeV, beta = sqrt(1 - 1/g^2);
// B [T] = p [GeV/c] / (0.2998 x 2804 m), the dipoles' bending radius, so
// 7 TeV needs 8.33 T; head-on beams collide at twice the beam energy; about 25
// proton pairs collide each time two bunches cross (PILEUP), so 40 million
// crossings a second give about a billion collisions. The drawing runs hugely
// slowed: bunches move DRAW_SPEED units of ring a second, and the gap between
// bunches grows as the rate falls (fewer bunches, same speed).

export interface ColliderParams {
	energy: number;
	rate: number;
}

export interface ParamSpec {
	key: keyof ColliderParams;
	label: string;
	min: number;
	max: number;
	step: number;
	unit: string;
	value: number;
}

export const PARAMS: ParamSpec[] = [
	{ key: 'energy', label: 'Beam energy', min: 0.5, max: 7, step: 0.1, unit: 'TeV', value: 6.8 },
	{ key: 'rate', label: 'Bunches a second', min: 5, max: 40, step: 1, unit: 'million', value: 40 }
];

/** Proton rest energy, GeV. */
export const PROTON_GEV = 0.938272;
/** Bending radius of the arc dipoles, metres (the LHC's). */
export const BEND_M = 2804;
/** Speed of light, m/s. */
export const C = 299_792_458;
/** Proton pairs that collide each time two bunches cross. */
export const PILEUP = 25;
/** Ring units a bunch moves per second in the drawing. */
export const DRAW_SPEED = 60;
/** Drawn gap between bunches at 40 million a second; it scales as 40 / rate. */
export const SPACING_40 = 64;
/** Seconds a collision burst lasts in the drawing. */
export const BURST_S = 1.1;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fin = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export function clampParams(p: Partial<Record<string, unknown>> = {}): ColliderParams {
	const [energy, rate] = PARAMS;
	return {
		energy: clamp(Math.round(fin(p.energy, energy!.value) * 10) / 10, energy!.min, energy!.max),
		rate: clamp(Math.round(fin(p.rate, rate!.value)), rate!.min, rate!.max)
	};
}

export const gammaOf = (p: ColliderParams) => (p.energy * 1000) / PROTON_GEV;
/** 1 - v/c, computed without cancelling: 1 / (gamma^2 (1 + beta)). */
export function shortfallOf(p: ColliderParams): number {
	const g = gammaOf(p);
	const beta = Math.sqrt(1 - 1 / (g * g));
	return 1 / (g * g * (1 + beta));
}
export const betaOf = (p: ColliderParams) => 1 - shortfallOf(p);
/** How much slower than light, m/s. */
export const lagOf = (p: ColliderParams) => shortfallOf(p) * C;
/** Dipole field that keeps the proton on the ring, tesla. */
export function fieldOf(p: ColliderParams): number {
	const momentum = Math.sqrt((p.energy * 1000) ** 2 - PROTON_GEV ** 2);
	return momentum / (0.299792458 * BEND_M);
}
export const collisionEnergyOf = (p: ColliderParams) => 2 * p.energy;
export const collisionsOf = (p: ColliderParams) => p.rate * 1e6 * PILEUP;

export function bigNumber(n: number): string {
	return n >= 1e9 ? `${(n / 1e9).toFixed(1)} billion` : `${Math.round(n / 1e6)} million`;
}

export function readoutsOf(p: ColliderParams): Record<string, string> {
	return {
		speed: (100 - shortfallOf(p) * 100).toFixed(7),
		field: fieldOf(p).toFixed(2),
		energy: collisionEnergyOf(p).toFixed(1),
		collisions: bigNumber(collisionsOf(p))
	};
}

// ---- motion ------------------------------------------------------------------

/** Drawn gap between bunches, ring units. */
export const spacingOf = (p: ColliderParams) => (SPACING_40 * 40) / p.rate;

/** Seconds into the loop for the still frame: a burst well under way, bunches just past the crossing. */
export const stillTime = () => 0.24;

/** Ring positions (s) of every bunch of each beam inside [lo, hi] at time t. Beam 1 runs toward +s, beam 2 toward -s; both pass s = 0 together. */
export function bunchesAt(p: ColliderParams, t: number, lo: number, hi: number): { one: number[]; two: number[] } {
	const d = spacingOf(p);
	const q = DRAW_SPEED * t;
	const phase = ((q % d) + d) % d;
	const along = (a: number, b: number) => {
		const out: number[] = [];
		for (let k = Math.ceil((a - phase) / d); phase + k * d <= b; k++) out.push(phase + k * d);
		return out;
	};
	return { one: along(lo, hi), two: along(-hi, -lo).map((s) => -s) };
}

export type TrackKind = 'muon' | 'hadron' | 'electron';

export interface Track {
	kind: TrackKind;
	/** Direction in the cut quadrant: 0 = toward the viewer, PI/2 = straight up. */
	angle: number;
	/** Drift along the beam per unit of radius. */
	slope: number;
	/** Bend in the solenoid field, 1/units (sign = charge). */
	curl: number;
	/** Radius where it stops: calorimeter or muon chamber, units of the drawing. */
	reach: number;
}

export interface Burst {
	/** Seconds since this crossing. */
	age: number;
	/** 0..1 how far the tracks have flown out. */
	reach: number;
	/** 0..1 brightness envelope (attack then decay). */
	glow: number;
	tracks: Track[];
}

const smooth = (a: number, b: number, x: number) => {
	const u = clamp((x - a) / (b - a), 0, 1);
	return u * u * (3 - 2 * u);
};

/** A small seeded generator so each crossing always throws the same tracks. */
function rng(seed: number) {
	let s = (seed * 2654435761) >>> 0 || 1;
	return () => {
		s ^= s << 13;
		s >>>= 0;
		s ^= s >>> 17;
		s ^= s << 5;
		s >>>= 0;
		return s / 4294967296;
	};
}

/** Radii of the detector layers the tracks stop in (drawing units). Kept in step with the figure's LAYERS. */
export const STOP = { ecal: [18, 23], hcal: [26, 32], muon: [50, 56] } as const;

export function tracksOf(p: ColliderParams, crossing: number): Track[] {
	const r = rng(crossing + 7919);
	const count = 8 + Math.round((10 * p.energy) / 7);
	const out: Track[] = [];
	for (let i = 0; i < count; i++) {
		const roll = r();
		const kind: TrackKind = i === 0 || roll < 0.06 ? 'muon' : roll < 0.55 ? 'hadron' : 'electron';
		const [a, b] = kind === 'muon' ? STOP.muon : kind === 'hadron' ? STOP.hcal : STOP.ecal;
		const reach = a + r() * (b - a);
		const curl = (r() < 0.5 ? -1 : 1) * (kind === 'muon' ? 0.001 + r() * 0.003 : 0.003 + r() * 0.011);
		// Keep the whole bent track inside the cut-away quadrant, clear of both walls.
		const turn = curl * reach;
		const lo = Math.max(0.16, 0.16 - turn);
		const hi = Math.min(Math.PI / 2 - 0.16, Math.PI / 2 - 0.16 - turn);
		out.push({ kind, angle: lo + r() * Math.max(0, hi - lo), slope: (r() - 0.5) * 0.5, curl, reach });
	}
	return out;
}

/** The bursts still showing at time t (the newest and, while it fades, the one before). */
export function burstsAt(p: ColliderParams, t: number): Burst[] {
	const d = spacingOf(p);
	const q = DRAW_SPEED * t;
	const n = Math.floor(q / d);
	const out: Burst[] = [];
	for (let i = n; i >= n - 2; i--) {
		const age = (q - i * d) / DRAW_SPEED;
		if (age < 0 || age > BURST_S) continue;
		out.push({ age, reach: 1 - (1 - Math.min(1, age / 0.22)) ** 3, glow: smooth(0, 0.04, age) * (1 - smooth(0.25, BURST_S, age)), tracks: tracksOf(p, i) });
	}
	return out;
}

export function describe(p: ColliderParams): string {
	const lag = lagOf(p);
	return (
		`A cutaway piece of a circular particle collider. Two beams of protons travel in opposite directions in twin beam pipes: ` +
		`superconducting dipole magnets bend them round the ring, quadrupole magnets focus them, and radio-frequency cavities push them along. ` +
		`At ${p.energy.toFixed(1)} TeV a proton moves at ${readoutsOf(p).speed} percent of light speed, about ${lag < 10 ? lag.toFixed(1) : Math.round(lag)} metres a second slower than light, ` +
		`and the dipoles need ${fieldOf(p).toFixed(2)} tesla to bend it round. Where the beams cross inside the detector, ${p.rate} million bunch crossings a second, ` +
		`about ${PILEUP} proton pairs each, make about ${bigNumber(collisionsOf(p))} collisions a second at ${collisionEnergyOf(p).toFixed(1)} TeV; ` +
		`the tracker, calorimeters and muon chambers record what flies out. Shown hugely slowed down.`
	);
}
