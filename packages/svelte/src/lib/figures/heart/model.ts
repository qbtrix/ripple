// figures/heart/model.ts: the one model behind the beating-heart figure. Pure,
// no DOM. From a heart rate and a stroke volume it gives the cycle timing, the
// stage at any moment (with the valve order a real heart keeps), the chamber
// volumes, the flow in each vessel, the readouts and the screen-reader text.
// Everything the figure draws or says reads from here.
//
// Timing follows the textbook shape: ventricular systole lasts 0.1 + 0.25 T
// seconds (T = 60 / bpm), about a third of the cycle at rest and more than
// half at 180 bpm; the atrial kick is 13% of the cycle. Valve order:
// atrial kick (AV open) -> isovolumetric contraction (all shut) -> ejection
// (pulmonary and aortic open) -> isovolumetric relaxation (all shut) ->
// filling (tricuspid and mitral open).

export interface HeartParams {
	bpm: number;
	stroke: number;
}

export interface ParamSpec {
	key: keyof HeartParams;
	label: string;
	min: number;
	max: number;
	step: number;
	unit: string;
	value: number;
}

export const PARAMS: ParamSpec[] = [
	{ key: 'bpm', label: 'Heart rate', min: 40, max: 180, step: 1, unit: 'bpm', value: 72 },
	{ key: 'stroke', label: 'Stroke volume', min: 50, max: 110, step: 1, unit: 'ml', value: 70 }
];

/** End-diastolic volume of each ventricle, ml. */
export const EDV = 130;
const RAMP = 0.035; // seconds a valve takes to swing

export type Phase = 'atrial-systole' | 'ventricular-systole' | 'diastole';
export type Stage = 'atrial-kick' | 'contraction' | 'ejection' | 'relaxation' | 'filling';

export const PHASE_NAME: Record<Phase, string> = {
	'atrial-systole': 'Atrial systole',
	'ventricular-systole': 'Ventricular systole',
	diastole: 'Diastole'
};

const PHASE_OF: Record<Stage, Phase> = {
	'atrial-kick': 'atrial-systole',
	contraction: 'ventricular-systole',
	ejection: 'ventricular-systole',
	relaxation: 'diastole',
	filling: 'diastole'
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fin = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export function clampParams(p: Partial<Record<string, unknown>> = {}): HeartParams {
	const [bpm, stroke] = PARAMS;
	return {
		bpm: clamp(Math.round(fin(p.bpm, bpm.value)), bpm.min, bpm.max),
		stroke: clamp(Math.round(fin(p.stroke, stroke.value)), stroke.min, stroke.max)
	};
}

export interface Timing {
	period: number;
	atrial: number;
	systole: number;
	contraction: number;
	relaxation: number;
	ejection: number;
}

export function timingOf({ bpm }: HeartParams): Timing {
	const period = 60 / bpm;
	const atrial = 0.13 * period;
	const systole = 0.1 + 0.25 * period;
	const contraction = 0.15 * systole;
	const relaxation = Math.min(0.08, 0.35 * (period - atrial - systole));
	return { period, atrial, systole, contraction, relaxation, ejection: systole - contraction };
}

export interface HeartState {
	t: number;
	stage: Stage;
	phase: Phase;
	/** Ventricle volume, ml (both sides pump the same). */
	ventricle: number;
	/** Atrium fullness, 0..1. */
	atrium: number;
	/** How squeezed each wall is, 0 (relaxed) .. 1 (fully contracted). */
	ventricleSqueeze: number;
	atriumSqueeze: number;
	/** Valve opening, 0 shut .. 1 open. */
	valves: { tricuspid: number; mitral: number; pulmonary: number; aortic: number };
	/** Flow, ml/s: out through the arteries, in through the veins. */
	flow: { artery: number; vein: number };
	/** Pressure, mmHg: in the aorta and in the pulmonary artery. */
	pressure: { aortic: number; pulmonary: number };
}

const ease = (s: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(s, 0, 1));
const window01 = (s: number, length: number) => clamp(s / RAMP, 0, 1) * clamp((length - s) / RAMP, 0, 1);
const mod = (v: number, m: number) => ((v % m) + m) % m;

/** The heart at time `t` seconds (any t; the cycle repeats). */
export function stateAt(params: HeartParams, t: number): HeartState {
	const T = timingOf(params);
	const sv = params.stroke;
	const esv = EDV - sv;
	const kick = 0.2 * sv; // the atrial kick tops up the last fifth
	const u = mod(t, T.period);
	const ejectAt = T.atrial + T.contraction;
	const relaxAt = T.atrial + T.systole;
	const fillAt = relaxAt + T.relaxation;
	const fillLen = T.period - fillAt;

	let stage: Stage;
	let ventricle: number;
	let atrium: number;
	let artery = 0;
	if (u < T.atrial) {
		stage = 'atrial-kick';
		ventricle = EDV - kick + kick * ease(u / T.atrial);
		atrium = 0.45 - 0.3 * ease(u / T.atrial);
	} else if (u < ejectAt) {
		stage = 'contraction';
		ventricle = EDV;
		atrium = 0.15 + 0.85 * ((u - T.atrial) / (T.period - T.atrial - fillLen));
	} else if (u < relaxAt) {
		stage = 'ejection';
		const s = (u - ejectAt) / T.ejection;
		ventricle = EDV - sv * ease(s);
		artery = ((sv * Math.PI) / (2 * T.ejection)) * Math.sin(Math.PI * s);
		atrium = 0.15 + 0.85 * ((u - T.atrial) / (T.period - T.atrial - fillLen));
	} else if (u < fillAt) {
		stage = 'relaxation';
		ventricle = esv;
		atrium = 0.15 + 0.85 * ((u - T.atrial) / (T.period - T.atrial - fillLen));
	} else {
		stage = 'filling';
		const s = (u - fillAt) / fillLen;
		ventricle = esv + (sv - kick) * (1 - (1 - s) ** 3);
		atrium = 1 - 0.55 * (1 - (1 - s) ** 2);
	}

	// AV valves open from the start of filling to the end of the atrial kick (wrapping).
	const avLen = T.period - T.systole - T.relaxation;
	const av = window01(mod(u - fillAt, T.period), avLen);
	const sl = u >= ejectAt && u < relaxAt ? window01(u - ejectAt, T.ejection) : 0;
	const ventricleSqueeze = clamp((EDV - ventricle) / (EDV - 10), 0, 1);
	const atriumSqueeze = stage === 'atrial-kick' ? Math.sin(Math.PI * (u / T.atrial)) : 0;
	return {
		t,
		stage,
		phase: PHASE_OF[stage],
		ventricle,
		atrium: clamp(atrium, 0, 1),
		ventricleSqueeze,
		atriumSqueeze,
		valves: { tricuspid: av, mitral: av, pulmonary: sl, aortic: sl },
		flow: { artery, vein: sv / T.period },
		pressure: pressuresAt(params, t)
	};
}

/**
 * Arterial pressure through the beat. Diastolic 80 mmHg in the aorta; the pulse
 * (40 mmHg at 70 ml, scaled by stroke volume) rises fast in early ejection, sags a
 * little before the valve shuts, then runs off exponentially until the next
 * ejection. The pulmonary artery follows the same shape at 9 to 25 mmHg.
 */
export function pressuresAt(params: HeartParams, t: number): { aortic: number; pulmonary: number } {
	const T = timingOf(params);
	const u = mod(t, T.period);
	const ejectAt = T.atrial + T.contraction;
	const relaxAt = T.atrial + T.systole;
	const sag = 0.25;
	let f: number;
	if (u >= ejectAt && u < relaxAt) {
		const s = (u - ejectAt) / T.ejection;
		f = Math.sin((Math.PI / 2) * Math.min(1, s / 0.45)) - sag * Math.max(0, (s - 0.45) / 0.55);
	} else {
		const x = mod(u - relaxAt, T.period) / (T.period - T.ejection);
		f = (1 - sag) * ((Math.exp(-3 * x) - Math.exp(-3)) / (1 - Math.exp(-3)));
	}
	const scale = params.stroke / 70;
	return { aortic: 80 + 40 * scale * f, pulmonary: 9 + 16 * scale * f };
}

/** A calm still frame for reduced motion: mid-ejection, valves visibly at work. */
export function stillTime(params: HeartParams): number {
	const T = timingOf(params);
	return T.atrial + T.contraction + T.ejection / 2;
}

/** Cardiac output, litres a minute. */
export const outputOf = ({ bpm, stroke }: HeartParams) => (bpm * stroke) / 1000;

export function readoutsOf(params: HeartParams, state?: HeartState): Record<string, string> {
	return {
		bpm: String(params.bpm),
		output: outputOf(params).toFixed(1),
		phase: state ? PHASE_NAME[state.phase] : PHASE_NAME['ventricular-systole'],
		pressure: state ? String(Math.round(state.pressure.aortic)) : String(80 + Math.round((40 * params.stroke) / 70))
	};
}

const OPEN_TEXT: Record<Stage, string> = {
	'atrial-kick': 'the atria squeeze the last blood through the open tricuspid and mitral valves',
	contraction: 'the ventricles tighten with all four valves shut',
	ejection: 'the pulmonary and aortic valves are open and blood leaves for the lungs and the body',
	relaxation: 'the ventricles relax with all four valves shut',
	filling: 'the tricuspid and mitral valves are open and the ventricles fill'
};

export function describe(params: HeartParams, state: HeartState): string {
	const T = timingOf(params);
	const share = Math.round((T.systole / T.period) * 100);
	return (
		`A heart drawn as two pumps on a bench. The right side (blue) takes oxygen-poor blood from the body and sends it to the lungs; ` +
		`the left side (red) takes oxygen-rich blood from the lungs and sends it to the body. ` +
		`At ${params.bpm} beats a minute and ${params.stroke} ml a beat it moves ${outputOf(params).toFixed(1)} litres a minute; ` +
		`ventricular systole takes ${share}% of each beat and aortic pressure swings between 80 and ${Math.round(80 + (40 * params.stroke) / 70)} mmHg. Now: ${PHASE_NAME[state.phase].toLowerCase()}, ${OPEN_TEXT[state.stage]}.`
	);
}
