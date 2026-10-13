// figures/ion-thruster/model.ts: the one model behind the gridded ion thruster
// figure. Pure, no DOM. From the beam voltage on the screen grid and the
// xenon flow it gives the ion exhaust speed (v = sqrt(2qV/m)), the beam
// current (the flow that gets ionised, as charge a second), the thrust
// (ionised mass flow x speed, less a little for beam spread) and the
// electrical power (beam power plus what it costs to make the plasma), plus
// the screen-reader text and the speeds the figure moves its particles at.
// The drawing slows the ions hugely (40 km/s would cross the card in a few
// microseconds); the readouts are always the real numbers. UTIL, SPREAD,
// DISCHARGE_W_PER_A and FIXED_W are calibration knobs, set so 1100 V and
// 2.6 mg/s land near a flown 30 cm thruster's 2.3 kW and ~90 mN.

export interface IonParams {
	voltage: number;
	flow: number;
}

export interface ParamSpec {
	key: keyof IonParams;
	label: string;
	min: number;
	max: number;
	step: number;
	unit: string;
	value: number;
}

/** Elementary charge, coulombs. */
export const Q = 1.602177e-19;
/** One xenon atom, kg (131.29 u). */
export const XE_KG = 131.29 * 1.660539e-27;
/** Share of the xenon that leaves as beam ions (propellant utilisation). */
export const UTIL = 0.9;
/** Thrust lost to the beam's spread and a few doubly charged ions. */
export const SPREAD = 0.96;
/** Watts spent making the plasma, per amp of beam (about 180 eV an ion). */
export const DISCHARGE_W_PER_A = 180;
/** Cathode keeper, heaters and neutraliser, watts. */
export const FIXED_W = 50;
/** Exhaust speed of a good chemical rocket, km/s, for the comparison. */
export const CHEMICAL_KMS = 4.4;
/** Standard gravity, for grams-weight and specific impulse. */
export const G0 = 9.80665;

export const PARAMS: ParamSpec[] = [
	{ key: 'voltage', label: 'Grid voltage', min: 600, max: 1800, step: 50, unit: 'V', value: 1100 },
	{ key: 'flow', label: 'Xenon flow', min: 0.5, max: 3, step: 0.1, unit: 'mg/s', value: 2 }
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fin = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const snap = (v: number, step: number) => Math.round(v / step) * step;

export function clampParams(p: Partial<Record<string, unknown>> = {}): IonParams {
	const [voltage, flow] = PARAMS;
	return {
		voltage: clamp(snap(fin(p.voltage, voltage!.value), voltage!.step), voltage!.min, voltage!.max),
		flow: Math.round(clamp(fin(p.flow, flow!.value), flow!.min, flow!.max) * 10) / 10
	};
}

/** Speed an ion leaves the grids at, m/s: all of qV turned into motion. */
export const exhaustOf = (p: IonParams) => Math.sqrt((2 * Q * p.voltage) / XE_KG);
/** Xenon flow, kg/s. */
const kgPerS = (p: IonParams) => p.flow * 1e-6;
/** Beam current, amps: the ionised share of the flow, as charge per second. */
export const beamCurrentOf = (p: IonParams) => (UTIL * kgPerS(p) * Q) / XE_KG;
/** Thrust, newtons. */
export const thrustOf = (p: IonParams) => SPREAD * UTIL * kgPerS(p) * exhaustOf(p);
/** Electrical power in, watts. */
export const powerOf = (p: IonParams) => beamCurrentOf(p) * (p.voltage + DISCHARGE_W_PER_A) + FIXED_W;
/** Specific impulse, seconds: thrust per weight of propellant used a second. */
export const ispOf = (p: IonParams) => thrustOf(p) / (kgPerS(p) * G0);

export function readoutsOf(p: IonParams): Record<string, string> {
	return {
		speed: (exhaustOf(p) / 1000).toFixed(1),
		thrust: (thrustOf(p) * 1000).toFixed(0),
		power: (powerOf(p) / 1000).toFixed(2)
	};
}

// ---- motion (drawing units a second; the drawing is about 1 unit = 5 mm) ----

/** Ions drift to the grids at the plasma's own pace, whatever the voltage. */
export const DRIFT = 9;
/** Beam ions in the drawing, units a second, per km/s of real speed. */
export const BEAM_PER_KMS = 2.4;
export const beamSpeedOf = (p: IonParams) => (exhaustOf(p) / 1000) * BEAM_PER_KMS;
/** How full the beam looks, 0..1: beam current (so flow) over the most the slider allows. */
export const densityOf = (p: IonParams) => p.flow / PARAMS[1]!.max;
/** A moment that reads well as a still frame (reduced motion, captures). */
export const STILL_T = 2.35;

export function describe(p: IonParams): string {
	const kms = exhaustOf(p) / 1000;
	const mn = thrustOf(p) * 1000;
	const grams = (thrustOf(p) / G0) * 1000;
	return (
		`A gridded ion thruster cut in half on a test stand. Xenon from the tank is fed into the discharge chamber, where electrons from the hollow cathode knock electrons off the atoms and ring magnets hold the plasma off the walls. ` +
		`The screen grid at ${p.voltage} volts and the negative accelerator grid behind it pull the ions out and throw them at ${kms.toFixed(1)} km/s, and the neutraliser adds electrons so the beam leaves no charge behind. ` +
		`At ${p.flow.toFixed(1)} mg of xenon a second that is ${mn.toFixed(0)} millinewtons, the weight of about ${grams.toFixed(0)} grams, for ${(powerOf(p) / 1000).toFixed(2)} kilowatts. ` +
		`Tiny, but the exhaust is about ${Math.round(kms / CHEMICAL_KMS)} times faster than a chemical rocket's, so each kilogram of xenon pushes that many times longer.`
	);
}
