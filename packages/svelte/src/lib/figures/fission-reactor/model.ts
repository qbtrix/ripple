// figures/fission-reactor/model.ts: the one model behind the reactor figure, a
// pressurised water reactor plant. Pure, no DOM. From the control rod
// insertion and the reactor coolant pump speed it gives the thermal power, the
// electric power, the coolant temperatures, how fast each loop's water moves
// and the screen-reader text.
//
// A teaching model of a typical large PWR, not a simulator: 3000 MW of heat at
// full power, a third of it turned into electricity (990 MW). The rods follow
// the classic S-shaped integral rod worth curve, W(x) = x - sin(2 pi x) / 2 pi,
// so the first and last tenths of travel do little. Coolant runs 291 C at no
// load up to an average of 310 C at full power, and the rise across the core is
// 32 K at full power and full flow. Slower pumps make the core run hotter; the
// hotter water slows fewer neutrons (a negative temperature coefficient), so
// the power settles lower: p = rods / (1 + FEEDBACK x extra heating). That
// keeps the hot leg near 335 C even at the lowest pump speed, under the 345 C
// boiling point at the 155 bar the pressuriser holds. Decay heat after a
// shutdown is left out.

export interface ReactorParams {
	rods: number;
	pump: number;
}

export interface ParamSpec {
	key: keyof ReactorParams;
	label: string;
	min: number;
	max: number;
	step: number;
	unit: string;
	value: number;
}

/** Thermal power at 100%, MW. */
export const RATED_MW = 3000;
/** Share of the heat the turbine and generator turn into electricity. */
export const EFFICIENCY = 0.33;
/** Coolant temperature with no power, C (hot standby). */
export const T_NO_LOAD = 291;
/** Rise of the average coolant temperature from no load to full power, K. */
export const T_PROGRAM = 19;
/** Temperature rise across the core at full power and full flow, K. */
export const DT_FULL = 32;
/** Share of full power lost per kelvin the coolant runs above its usual average. */
export const FEEDBACK = 0.035;
/** Pressure the pressuriser holds, bar. */
export const PRESSURE_BAR = 155;

export const PARAMS: ParamSpec[] = [
	{ key: 'rods', label: 'Control rods in', min: 0, max: 100, step: 1, unit: '%', value: 20 },
	{ key: 'pump', label: 'Coolant pump speed', min: 40, max: 100, step: 1, unit: '%', value: 100 }
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fin = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export function clampParams(p: Partial<Record<string, unknown>> = {}): ReactorParams {
	const [rods, pump] = PARAMS;
	return {
		rods: clamp(fin(p.rods, rods!.value), rods!.min, rods!.max),
		pump: clamp(fin(p.pump, pump!.value), pump!.min, pump!.max)
	};
}

/** Share of the rods' total worth inserted at fraction x of their travel (S-curve). */
export const rodWorth = (x: number) => {
	const c = clamp(x, 0, 1);
	return c - Math.sin(2 * Math.PI * c) / (2 * Math.PI);
};

export interface PlantState {
	/** Thermal power, share of rated (0..1). */
	power: number;
	thermalMW: number;
	electricMW: number;
	/** Coolant temperatures, C. */
	hot: number;
	cold: number;
	average: number;
	/** Primary flow, share of full (the pump speed). */
	flow: number;
}

/** The steady state the plant settles to for these rods and this pump speed (fractional params fine mid-move). */
export function stateOf(p: ReactorParams): PlantState {
	const flow = clamp(p.pump, 1, 100) / 100;
	const fromRods = 1 - rodWorth(p.rods / 100);
	// Extra heating of the average above the usual program is (DT_FULL / 2) * power * (1 / flow - 1).
	const power = fromRods / (1 + FEEDBACK * (DT_FULL / 2) * (1 / flow - 1));
	const rise = (DT_FULL * power) / flow;
	const average = T_NO_LOAD + T_PROGRAM * power + (DT_FULL / 2) * power * (1 / flow - 1);
	return {
		power,
		thermalMW: RATED_MW * power,
		electricMW: RATED_MW * power * EFFICIENCY,
		hot: average + rise / 2,
		cold: average - rise / 2,
		average,
		flow
	};
}

/** The coolant readout is the hot leg: the water as it leaves the core. */
export function readoutsOf(p: ReactorParams): Record<string, string> {
	const s = stateOf(p);
	return {
		thermal: String(Math.round(s.thermalMW)),
		electric: String(Math.round(s.electricMW)),
		coolant: String(Math.round(s.hot))
	};
}

export function describe(p: ReactorParams): string {
	const s = stateOf(p);
	const rods = Math.round(p.rods);
	const work =
		s.power < 0.005
			? 'The rods soak up enough neutrons that the chain reaction stops, so the core makes no power.'
			: `The fuel makes ${Math.round(s.thermalMW)} MW of heat and the generator ${Math.round(s.electricMW)} MW of electricity.`;
	return (
		`A pressurised water reactor plant on a bench. Control rods, ${rods}% in, slide into the fuel from above and soak up neutrons. ` +
		`Pumps push water under ${PRESSURE_BAR} bar through the core, where it heats to ${Math.round(s.hot)} C without boiling, then through the steam generator, where it boils a second loop of water. ` +
		`That steam spins the turbine and generator, is cooled back to water in the condenser, and is pumped back. ${work}`
	);
}
