// figures/rocket-engine/model.ts: the one model behind the rocket engine figure.
// Pure, no DOM. A liquid-oxygen and kerosene engine of the oxidiser-rich staged
// combustion kind, fired at sea level on a test stand. From a throttle setting
// and a mixture ratio (oxidiser mass over fuel mass) it gives the propellant
// flows, the chamber pressure, the thrust, the turbopump speed, the plume's
// shape, the readouts and the screen-reader text. Everything the figure draws
// or says reads from here.
//
// The numbers are a plausible engine, not a real one: a 0.033 m2 throat
// (about 20 cm across) with a 16:1 nozzle, 180 bar and about 1,000 kN at full
// throttle. Chamber pressure is flow x c* / throat area; c* (how much pressure
// a kilogram a second of burning propellant makes) is highest at the
// fuel-rich end of the range and falls as the mix gets richer in oxygen.
// Thrust is Cf x Pc x At less the air pressure on the nozzle exit, so it
// falls faster than the throttle. The pumps must deliver more than chamber
// pressure, and a pump's pressure rise goes with its speed squared, so the
// turbopump speed goes with the square root of chamber pressure. The drawing
// turns the shaft at SLOW of real speed; the readouts are the real numbers.

export interface EngineParams {
	throttle: number;
	mixture: number;
}

export interface ParamSpec {
	key: keyof EngineParams;
	label: string;
	min: number;
	max: number;
	step: number;
	unit: string;
	value: number;
}

export const PARAMS: ParamSpec[] = [
	{ key: 'throttle', label: 'Throttle', min: 40, max: 100, step: 1, unit: '%', value: 100 },
	{ key: 'mixture', label: 'Mixture ratio (O/F)', min: 2.2, max: 3, step: 0.05, unit: '', value: 2.6 }
];

/** Throat area, m2. */
export const THROAT_M2 = 0.033;
/** Nozzle exit area over throat area. */
export const EXPANSION = 16;
/** Thrust coefficient in vacuum for this nozzle. */
export const CF_VAC = 1.78;
/** Sea-level air pressure, Pa. */
export const AIR_PA = 101325;
export const G0 = 9.80665;
/** Chamber pressure over nozzle exit pressure for a 16:1 nozzle. */
export const EXIT_RATIO = 140;
/** Full-throttle chamber pressure at the design mixture, bar. */
export const DESIGN_BAR = 180;
/** Turbopump speed at the design point, rpm. */
export const DESIGN_RPM = 20000;
/** Oxidiser-rich preburner: oxygen over kerosene in it. */
export const PREBURNER_OF = 55;
/** Fraction of real shaft speed the drawing turns at. */
export const SLOW = 1 / 900;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fin = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export function clampParams(p: Partial<Record<string, unknown>> = {}): EngineParams {
	const [throttle, mixture] = PARAMS;
	return {
		throttle: clamp(Math.round(fin(p.throttle, throttle!.value)), throttle!.min, throttle!.max),
		mixture: clamp(Math.round(fin(p.mixture, mixture!.value) * 20) / 20, mixture!.min, mixture!.max)
	};
}

/** Characteristic velocity c*, m/s: highest at the fuel-rich end of the slider (2.2). */
export const cstarOf = (mixture: number) => 1800 * (1 - 0.05 * (mixture - 2.2) ** 2);

/** Total propellant flow at full throttle, kg/s (sets 180 bar at the design mixture). */
export const FULL_FLOW = (DESIGN_BAR * 1e5 * THROAT_M2) / cstarOf(2.6);

export interface EngineState {
	/** Propellant flow, kg/s: total, oxygen, kerosene, and the kerosene that goes to the preburner. */
	flow: { total: number; oxidiser: number; fuel: number; preburnerFuel: number };
	/** Chamber pressure, bar. */
	chamberBar: number;
	/** Nozzle exit pressure, bar. */
	exitBar: number;
	/** Thrust at sea level, kN. */
	thrustKn: number;
	/** Specific impulse at sea level, s. */
	isp: number;
	/** Turbopump shaft speed, rpm. */
	rpm: number;
}

export function stateOf(p: EngineParams): EngineState {
	const total = (FULL_FLOW * p.throttle) / 100;
	const oxidiser = (total * p.mixture) / (1 + p.mixture);
	const fuel = total - oxidiser;
	const pc = (total * cstarOf(p.mixture)) / THROAT_M2;
	const thrust = CF_VAC * pc * THROAT_M2 - AIR_PA * THROAT_M2 * EXPANSION;
	return {
		flow: { total, oxidiser, fuel, preburnerFuel: oxidiser / PREBURNER_OF },
		chamberBar: pc / 1e5,
		exitBar: pc / EXIT_RATIO / 1e5,
		thrustKn: thrust / 1000,
		isp: thrust / (total * G0),
		rpm: DESIGN_RPM * Math.sqrt(pc / (DESIGN_BAR * 1e5))
	};
}

/** Shaft speed of the drawing, radians a second (already slowed). */
export const shaftSpeedOf = (p: EngineParams) => ((stateOf(p).rpm / 60) * 2 * Math.PI * SLOW);

/**
 * The plume, in exit diameters: its length, how far apart the shock diamonds
 * sit (they spread out as the exit pressure rises past the air's), and how
 * yellow it burns (a fuel-rich mix carries more glowing soot).
 */
export function plumeOf(p: EngineParams): { length: number; spacing: number; soot: number; strength: number } {
	const s = stateOf(p);
	const pe = s.exitBar / (AIR_PA / 1e5);
	return {
		length: 0.9 + 0.8 * (p.throttle / 100),
		spacing: 0.4 * Math.sqrt(clamp(pe, 0.35, 2)),
		soot: clamp((3 - p.mixture) / 0.8, 0, 1),
		strength: 0.45 + 0.55 * (p.throttle / 100)
	};
}

const grouped = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function readoutsOf(p: EngineParams): Record<string, string> {
	const s = stateOf(p);
	return {
		thrust: grouped(s.thrustKn),
		pressure: String(Math.round(s.chamberBar)),
		rpm: grouped(Math.round(s.rpm / 10) * 10)
	};
}

export function describe(p: EngineParams): string {
	const s = stateOf(p);
	return (
		`A liquid-fuel rocket engine firing on a test stand. Liquid oxygen and kerosene run from their tanks to a turbopump, whose two pumps share one shaft with a turbine. ` +
		`All the oxygen and a little kerosene burn in the preburner, and that hot, oxygen-rich gas spins the turbine before it goes on to the main injector. ` +
		`The rest of the kerosene first cools the nozzle and chamber walls through channels, then meets the hot gas at the injector plate and burns in the combustion chamber. ` +
		`The gas speeds up through the narrow throat and the bell-shaped nozzle, and the push on the engine is measured by a load cell behind the gimbal. ` +
		`At ${p.throttle}% throttle and a mixture of ${p.mixture.toFixed(2)} parts oxygen to one of kerosene, ${Math.round(s.flow.total)} kg of propellant a second gives ${Math.round(s.chamberBar)} bar in the chamber, ` +
		`${grouped(s.thrustKn)} kN of thrust at sea level, and the turbopump turns at ${grouped(Math.round(s.rpm / 10) * 10)} rpm. The shaft is drawn far slower than it really turns.`
	);
}
