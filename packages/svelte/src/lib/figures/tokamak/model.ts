// figures/tokamak/model.ts: the one model behind the fusion reactor figure.
// Pure, no DOM. A zero-dimensional power balance for a reactor-scale tokamak
// (major radius 6.2 m, minor radius 2 m, elongation 1.7, 5.3 T on axis,
// deuterium-tritium fuel): from the plasma current and the outside heating
// power it finds the steady temperature where the heat leaking out (the
// IPB98(y,2) confinement-time scaling, plus bremsstrahlung) equals the heat
// going in (the heating beams plus the 3.5 MeV alpha particles that stay
// inside). Fusion power uses the Bosch-Hale D-T reactivity over a parabolic
// temperature profile; density sits at 85% of the Greenwald limit, so more
// current holds more fuel; 18% of the electrons belong to helium ash and
// impurities. The confinement factor H is tuned so 15 MA with 50 MW of
// heating gives Q = 10 and about 500 MW, the usual reactor-scale design point.
// When the solution has more than one temperature, the lowest one wins: a
// plasma heats up from cold, so a plasma that radiates more than it is
// heated stays cold, the way a real one does.

export interface TokamakParams {
	current: number;
	heating: number;
}

export interface ParamSpec {
	key: keyof TokamakParams;
	label: string;
	min: number;
	max: number;
	step: number;
	unit: string;
	value: number;
}

export const PARAMS: ParamSpec[] = [
	{ key: 'current', label: 'Plasma current', min: 5, max: 17, step: 0.5, unit: 'MA', value: 15 },
	{ key: 'heating', label: 'Heating power', min: 10, max: 75, step: 5, unit: 'MW', value: 50 }
];

/** Machine: metres and tesla. */
export const MACHINE = { R: 6.2, a: 2, kappa: 1.7, B: 5.3, mass: 2.5, zeff: 1.7, greenwald: 0.85, fuel: 0.82, H: 1.15 } as const;
/** Plasma volume, m3 (a torus of elliptical cross-section). */
export const VOLUME = 2 * Math.PI * MACHINE.R * Math.PI * MACHINE.a * MACHINE.a * MACHINE.kappa;
const KEV = 1.602e-16; // joules
const MEV_DT = 17.6e3; // keV released per reaction
/** Million degrees per keV. */
export const MK_PER_KEV = 11.6;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fin = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const snap = (v: number, s: ParamSpec) => clamp(Math.round((v - s.min) / s.step) * s.step + s.min, s.min, s.max);

export function clampParams(p: Partial<Record<string, unknown>> = {}): TokamakParams {
	const [current, heating] = PARAMS;
	return { current: snap(fin(p.current, current!.value), current!), heating: snap(fin(p.heating, heating!.value), heating!) };
}

/** Bosch-Hale D-T reactivity <sigma v>, m3/s, T in keV. */
export function reactivity(T: number): number {
	const [BG, MRC2, C1, C2, C3, C4, C5, C6, C7] = [34.3827, 1124656, 1.17302e-9, 1.51361e-2, 7.51886e-2, 4.60643e-3, 1.35e-2, -1.0675e-4, 1.366e-5];
	const th = T / (1 - (T * (C2 + T * (C4 + T * C6))) / (1 + T * (C3 + T * (C5 + T * C7))));
	const xi = Math.cbrt((BG * BG) / (4 * th));
	return C1 * th * Math.sqrt(xi / (MRC2 * T ** 3)) * Math.exp(-3 * xi) * 1e-6;
}

/** Electron density, m^-3: 85% of the Greenwald limit Ip / (pi a^2). */
export const densityOf = (p: TokamakParams) => ((MACHINE.greenwald * p.current) / (Math.PI * MACHINE.a ** 2)) * 1e20;

/** Edge safety factor q95: how many times a field line goes round the long way for once round the short way. */
export const q95Of = (p: TokamakParams) => (1.3 * 5 * MACHINE.a ** 2 * MACHINE.B * (1 + MACHINE.kappa ** 2)) / (2 * MACHINE.R * p.current);

/** Profile sums at core temperature T0 (keV): fusion and bremsstrahlung power (MW) and stored energy (MJ). */
function profile(T0: number, n: number) {
	let fusion = 0;
	let brems = 0;
	let energy = 0;
	const N = 32;
	const nd = MACHINE.fuel * n;
	for (let i = 0; i < N; i++) {
		const r = (i + 0.5) / N;
		const w = (2 * r) / N; // volume weight of the shell
		const T = Math.max(0.05, T0 * (1 - r * r));
		fusion += w * 0.25 * nd * nd * reactivity(T) * MEV_DT * KEV;
		brems += w * 5.35e-37 * MACHINE.zeff * n * n * Math.sqrt(T);
		energy += w * 3 * n * T * KEV;
	}
	return { fusion: (fusion * VOLUME) / 1e6, brems: (brems * VOLUME) / 1e6, energy: (energy * VOLUME) / 1e6 };
}

/** IPB98(y,2) energy confinement time, s, at loss power P (MW). */
function tauOf(p: TokamakParams, n: number, P: number) {
	const { R, a, kappa, B, mass, H } = MACHINE;
	return H * 0.0562 * p.current ** 0.93 * B ** 0.15 * Math.max(P, 1) ** -0.69 * (n / 1e19) ** 0.41 * mass ** 0.19 * R ** 1.97 * (a / R) ** 0.58 * kappa ** 0.78;
}

export interface PlasmaState {
	/** Core temperature, keV. */
	core: number;
	/** Fusion power, MW. */
	fusion: number;
	/** Gain: fusion power over heating power. */
	gain: number;
	/** Electron density, m^-3. */
	density: number;
	/** Energy confinement time, s. */
	tau: number;
	q95: number;
}

const cache = new Map<string, PlasmaState>();

export function solve(p: TokamakParams): PlasmaState {
	const key = `${p.current}|${p.heating}`;
	const hit = cache.get(key);
	if (hit) return hit;
	const n = densityOf(p);
	const gap = (T0: number) => {
		const s = profile(T0, n);
		const heat = p.heating + s.fusion / 5; // alphas carry a fifth of each reaction's energy
		return s.energy / tauOf(p, n, heat) + s.brems - heat;
	};
	let T = 0.5;
	let prev = gap(T);
	for (let x = 1; x <= 60; x += 0.5) {
		const g = gap(x);
		if (prev < 0 && g >= 0) {
			let [lo, hi] = [x - 0.5, x];
			for (let i = 0; i < 40; i++) {
				const mid = (lo + hi) / 2;
				if (gap(mid) < 0) lo = mid;
				else hi = mid;
			}
			T = (lo + hi) / 2;
			break;
		}
		prev = g;
		T = x;
	}
	const s = profile(T, n);
	const out = { core: T, fusion: s.fusion, gain: s.fusion / p.heating, density: n, tau: tauOf(p, n, p.heating + s.fusion / 5), q95: q95Of(p) };
	cache.set(key, out);
	return out;
}

export const millionDegrees = (s: PlasmaState) => s.core * MK_PER_KEV;

export function readoutsOf(p: TokamakParams): Record<string, string> {
	const s = solve(p);
	return {
		temperature: Math.round(millionDegrees(s)).toString(),
		fusion: Math.round(s.fusion).toString(),
		gain: s.gain < 10 ? s.gain.toFixed(1) : Math.round(s.gain).toString()
	};
}

export function describe(p: TokamakParams): string {
	const s = solve(p);
	return (
		`A tokamak fusion reactor, cut open: a ring-shaped vacuum vessel inside 18 D-shaped toroidal field coils, with the central solenoid in the hole of the ring, ` +
		`poloidal field coils around the outside, blanket modules lining the vessel, the divertor at its floor and a heating beam injector at the side. ` +
		`Inside, a ring of deuterium-tritium plasma carries ${p.current} million amps and takes ${p.heating} MW of heating. ` +
		`Its core reaches about ${Math.round(millionDegrees(s))} million degrees, hot enough for the nuclei to fuse into helium and fast neutrons, ` +
		`making ${Math.round(s.fusion)} MW of fusion power, ${s.gain < 10 ? s.gain.toFixed(1) : Math.round(s.gain)} times the heating put in.`
	);
}

// ---- motion -----------------------------------------------------------------

/** Glow 0..1 of the plasma, from its core temperature (cold below 2 keV, full at 20). */
export const glowOf = (s: PlasmaState) => clamp((s.core - 2) / 18, 0, 1);

/**
 * Field-line pitch: the poloidal turn per toroidal turn on flux surface rho
 * (0 = magnetic axis, 1 = edge), 1 / q with q rising from 1 on axis to q95.
 */
export const twistAt = (p: TokamakParams, rho: number) => 1 / (1 + (q95Of(p) - 1) * rho * rho);

/** Toroidal drift of the drawn particles, radians a second (the drawing is slowed far below real speed). */
export const streamSpeedOf = (s: PlasmaState) => 0.12 + 0.05 * Math.sqrt(Math.max(s.core, 0));

/** Beam dash speed, units a second, from the heating power. */
export const beamSpeedOf = (p: TokamakParams) => 6 + p.heating * 0.4;
