// figures/bike-gears/model.ts: the one model behind the bike drivetrain figure.
// Pure, no DOM. From a cadence, a front ring (50 or 34 teeth) and a rear gear
// (1 = the 28-tooth cog, 7 = the 11) it gives the gear ratio, the distance one
// pedal turn rolls (ratio x 2.1 m of tyre), the road speed, the rotation
// speeds the figure turns at, and the screen-reader text. Shifts ease between
// gears over SHIFT_S seconds; the figure reads the eased pose from `poseAt`.
// The drawing runs at SLOW of real speed so the chain stays readable; the
// readouts are always the real numbers.

export interface BikeParams {
	cadence: number;
	ring: number;
	gear: number;
}

export interface ParamSpec {
	key: keyof BikeParams;
	label: string;
	min: number;
	max: number;
	step: number;
	unit: string;
	value: number;
}

export const RINGS = [34, 50] as const;
/** Rear cogs, easiest (largest) first: gear 1 is CASSETTE[0]. */
export const CASSETTE = [28, 24, 21, 17, 15, 13, 11] as const;
/** Tyre circumference, metres (a 700x28c road wheel). */
export const WHEEL_M = 2.1;
/** Fraction of real speed the drawing turns at. */
export const SLOW = 0.25;
/** Seconds a shift takes to settle. */
export const SHIFT_S = 0.7;

export const PARAMS: ParamSpec[] = [
	{ key: 'cadence', label: 'Cadence', min: 40, max: 120, step: 1, unit: 'rpm', value: 85 },
	{ key: 'ring', label: 'Chainring', min: 34, max: 50, step: 16, unit: 'teeth', value: 50 },
	{ key: 'gear', label: 'Rear gear', min: 1, max: CASSETTE.length, step: 1, unit: '', value: 4 }
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fin = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export function clampParams(p: Partial<Record<string, unknown>> = {}): BikeParams {
	const [cadence, ring, gear] = PARAMS;
	const r = fin(p.ring, ring!.value);
	return {
		cadence: clamp(Math.round(fin(p.cadence, cadence!.value)), cadence!.min, cadence!.max),
		ring: r < 42 ? 34 : 50,
		gear: clamp(Math.round(fin(p.gear, gear!.value)), gear!.min, gear!.max)
	};
}

export const cogOf = (p: BikeParams) => CASSETTE[p.gear - 1]!;
export const ratioOf = (p: BikeParams) => p.ring / cogOf(p);
/** Metres the bike rolls for one turn of the pedals. */
export const developmentOf = (p: BikeParams) => ratioOf(p) * WHEEL_M;
export const speedOf = (p: BikeParams) => (p.cadence * developmentOf(p) * 60) / 1000;

/** Where the derailleurs sit: ring 0 (34) .. 1 (50), cog index 0 (28) .. 6 (11), fractional mid-shift. */
export interface Pose {
	ring: number;
	cog: number;
}
export const poseOf = (p: BikeParams): Pose => ({ ring: p.ring === 50 ? 1 : 0, cog: p.gear - 1 });

export const ease = (s: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(s, 0, 1));

/** The pose `since` seconds into a shift from `from` to `to`. */
export function poseAt(from: Pose, to: Pose, since: number): Pose {
	const e = ease(since / SHIFT_S);
	return { ring: from.ring + (to.ring - from.ring) * e, cog: from.cog + (to.cog - from.cog) * e };
}

/** Teeth at a fractional cog index (between two cogs mid-shift). */
export function teethAt(cog: number): number {
	const i = clamp(Math.floor(cog), 0, CASSETTE.length - 1);
	const j = Math.min(CASSETTE.length - 1, i + 1);
	return CASSETTE[i]! + (CASSETTE[j]! - CASSETTE[i]!) * (cog - i);
}
export const ringTeethAt = (ring: number) => 34 + 16 * clamp(ring, 0, 1);

/** Crank speed of the drawing, radians a second (already slowed). */
export const crankSpeedOf = (p: BikeParams) => ((p.cadence / 60) * 2 * Math.PI * SLOW);

export function readoutsOf(p: BikeParams): Record<string, string> {
	return {
		gear: `${p.ring} x ${cogOf(p)}`,
		ratio: ratioOf(p).toFixed(2),
		metres: developmentOf(p).toFixed(1),
		speed: speedOf(p).toFixed(1)
	};
}

export function describe(p: BikeParams): string {
	return (
		`A bicycle drivetrain on a bench stand: pedals and cranks turn a ${p.ring}-tooth chainring, the chain carries the turn back to a ${cogOf(p)}-tooth cog on the rear wheel, ` +
		`and the derailleurs guide the chain onto the chosen ring and cog. Each pedal turn spins the wheel ${ratioOf(p).toFixed(2)} times and rolls ${developmentOf(p).toFixed(1)} metres, ` +
		`so at ${p.cadence} rpm the bike does ${speedOf(p).toFixed(1)} km/h. Shown at a quarter of real speed.`
	);
}
