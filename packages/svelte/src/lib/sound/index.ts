// sound/index.ts: subtle sound cues for moments in widgets (a workout done, a
// quiz answer, a habit ticked). Each cue is a few ZzFX notes mixed into one
// buffer and normalised to a quiet peak, so no cue is louder than CUE_PEAK.
//
// Invariants:
// - Nothing runs at import. The AudioContext is created on the first cue,
//   one per page, and only after the page has had a user gesture.
// - playCue never throws and is a no-op on the server, in jsdom (no
//   AudioContext), on a hidden page, or when sounds are off.
// - The on/off flag lives in localStorage under STORAGE_KEY, default on.
//   Storage errors fall back to the in-memory value.
// - Only call it for discrete moments, never per keystroke or stream update.

import { zzfxSamples, type ZzfxParams } from './zzfx.js';

export const CUES = ['complete', 'tick', 'correct', 'wrong', 'win', 'check', 'sent', 'phase'] as const;
export type CueName = (typeof CUES)[number];

const STORAGE_KEY = 'ripple:sound';
/** Loudest sample any cue reaches, out of 1. */
export const CUE_PEAK = 0.22;

type Note = [at: number, params: ZzfxParams];
const note = (at: number, hz: number, release: number, vol = 1, shape = 0, extra: ZzfxParams = []): Note => [
	at,
	[vol, 0, hz, 0.008, 0.02, release, shape, 1, ...extra],
];

// Hand-tuned: sine and triangle only, mid register, short tails.
const SPEC: Record<CueName, { gain: number; notes: Note[] }> = {
	complete: { gain: 1, notes: [note(0, 523, 0.22), note(0.1, 659, 0.22), note(0.2, 784, 0.4)] },
	tick: { gain: 0.35, notes: [note(0, 880, 0.04)] },
	correct: { gain: 0.8, notes: [note(0, 659, 0.12), note(0.08, 880, 0.22)] },
	wrong: { gain: 0.7, notes: [note(0, 220, 0.18, 1, 1, [-0.4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -900])] },
	win: { gain: 1, notes: [note(0, 523, 0.15), note(0.07, 659, 0.15), note(0.14, 784, 0.15), note(0.21, 1047, 0.35, 0.8)] },
	check: { gain: 0.65, notes: [note(0, 784, 0.1, 1, 0, [0, 0, 262, 0.04])] },
	sent: { gain: 0.6, notes: [note(0, 300, 0.1, 0.6, 0, [12]), note(0.09, 740, 0.08)] },
	phase: { gain: 0.6, notes: [note(0, 587, 0.12), note(0.13, 587, 0.18)] },
};

const rendered = new Map<string, Float32Array>();

/** The cue's samples at `sampleRate`: pure, cached, peak = CUE_PEAK * gain. */
export function renderCue(name: CueName, sampleRate: number): Float32Array {
	const key = `${name}@${sampleRate}`;
	const hit = rendered.get(key);
	if (hit) return hit;
	const parts = SPEC[name].notes.map(([at, p]) => [Math.round(at * sampleRate), zzfxSamples(sampleRate, p)] as const);
	const out = new Float32Array(Math.max(...parts.map(([o, s]) => o + s.length)));
	for (const [o, s] of parts) for (let i = 0; i < s.length; i++) out[o + i] += s[i];
	let peak = 0;
	for (const v of out) peak = Math.max(peak, Math.abs(v));
	const scale = peak ? (CUE_PEAK * SPEC[name].gain) / peak : 0;
	for (let i = 0; i < out.length; i++) out[i] *= scale;
	rendered.set(key, out);
	return out;
}

let enabled: boolean | undefined;

export function soundEnabled(): boolean {
	if (enabled === undefined) {
		try {
			enabled = globalThis.localStorage?.getItem(STORAGE_KEY) !== 'off';
		} catch {
			enabled = true;
		}
	}
	return enabled;
}

export function setSoundEnabled(on: boolean): void {
	enabled = on;
	try {
		globalThis.localStorage?.setItem(STORAGE_KEY, on ? 'on' : 'off');
	} catch {
		// private mode or blocked storage: keep the in-memory value
	}
}

let ctx: AudioContext | null | undefined;

function context(): AudioContext | null {
	if (ctx !== undefined) return ctx;
	const AC =
		window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	try {
		ctx = AC ? new AC() : null;
	} catch {
		ctx = null;
	}
	return ctx;
}

/** Plays a short, quiet cue. Safe to call anywhere; does nothing when it can't or shouldn't. */
export function playCue(name: CueName): void {
	if (typeof window === 'undefined' || typeof document === 'undefined') return;
	if (!soundEnabled() || document.hidden || !SPEC[name]) return;
	// Browsers block audio before a gesture; don't even make the context then.
	const ua = (navigator as { userActivation?: { hasBeenActive: boolean } }).userActivation;
	if (ua && !ua.hasBeenActive) return;
	const c = context();
	if (!c) return;
	try {
		if (c.state === 'suspended') void c.resume().catch(() => {});
		const samples = renderCue(name, c.sampleRate);
		const buf = c.createBuffer(1, samples.length, c.sampleRate);
		buf.getChannelData(0).set(samples);
		const src = c.createBufferSource();
		src.buffer = buf;
		src.connect(c.destination);
		src.start();
	} catch {
		// a closed or broken context: stay silent
	}
}
