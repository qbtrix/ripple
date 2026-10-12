// widgets/composite/music-engine.ts: the sound behind the `music-player`
// widget. Framework-free Web Audio synthesis, no files and no network: eight
// generative presets (noise beds, swells, chirps, a lofi loop, a pad, slow
// piano) that loop until paused.
//
// Invariants:
// - Plain AudioNodes only (no AudioWorklet), so the landing CSP needs nothing.
// - createEngine() returns null when there is no AudioContext (SSR, jsdom);
//   callers keep their UI working without sound.
// - Create it on a user gesture: browsers start a context suspended otherwise.
// - Every change fades over FADE seconds; pause suspends the context after the
//   fade; dispose() clears every timer and closes the context.
// - Chain: voice -> master (volume) -> compressor -> analyser -> speakers.

export const PRESETS = ['rain', 'brown-noise', 'white-noise', 'ocean', 'forest', 'lofi', 'drone', 'piano'] as const;
export type Preset = (typeof PRESETS)[number];

export const toPreset = (v: unknown): Preset =>
	(PRESETS as readonly string[]).includes(v as string) ? (v as Preset) : 'drone';

export interface Engine {
	play(preset: Preset): void;
	pause(): void;
	setVolume(v: number): void;
	setMuted(m: boolean): void;
	/** RMS of what is playing, 0..1. */
	level(): number;
	/** Fills `out` with the spectrum (0..255). */
	spectrum(out: Uint8Array<ArrayBuffer>): void;
	state(): string;
	dispose(): void;
}

const FADE = 0.5;
const GAIN = 0.6;

type Voice = { out: GainNode; stop: () => void };

export function createEngine(): Engine | null {
	const AC =
		typeof window === 'undefined'
			? undefined
			: (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
	if (!AC) return null;
	let ctx: AudioContext;
	try {
		ctx = new AC();
	} catch {
		return null;
	}

	const master = ctx.createGain();
	const comp = ctx.createDynamicsCompressor();
	comp.threshold.value = -18;
	comp.knee.value = 12;
	comp.ratio.value = 6;
	comp.attack.value = 0.01;
	comp.release.value = 0.3;
	const analyser = ctx.createAnalyser();
	analyser.fftSize = 256;
	analyser.smoothingTimeConstant = 0.8;
	master.connect(comp).connect(analyser).connect(ctx.destination);

	let volume = 0.7;
	let muted = false;
	const applyVolume = () => master.gain.setTargetAtTime(muted ? 0 : volume * GAIN, ctx.currentTime, 0.05);
	master.gain.value = volume * GAIN;

	const buffers = new Map<string, AudioBuffer>();
	function noise(kind: 'white' | 'brown'): AudioBuffer {
		const hit = buffers.get(kind);
		if (hit) return hit;
		const len = ctx.sampleRate * 4;
		const b = ctx.createBuffer(1, len, ctx.sampleRate);
		const d = b.getChannelData(0);
		let last = 0;
		for (let i = 0; i < len; i++) {
			const w = Math.random() * 2 - 1;
			if (kind === 'white') d[i] = w;
			else d[i] = last = (last + 0.02 * w) / 1.02;
		}
		if (kind === 'brown') {
			// Tilt the walk so the loop seam does not click, then normalise.
			const drift = d[len - 1] - d[0];
			let peak = 0;
			for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs((d[i] -= (drift * i) / (len - 1))));
			for (let i = 0; i < len; i++) d[i] /= peak || 1;
		}
		buffers.set(kind, b);
		return b;
	}

	/** A voice: its own gain, the sources to stop, the timers to clear. */
	function voice(build: (bus: GainNode, v: { src: AudioScheduledSourceNode[]; timers: ReturnType<typeof setInterval>[] }) => void): Voice {
		const out = ctx.createGain();
		out.gain.value = 0;
		out.connect(master);
		const v = { src: [] as AudioScheduledSourceNode[], timers: [] as ReturnType<typeof setInterval>[] };
		build(out, v);
		for (const s of v.src) s.start();
		return {
			out,
			stop() {
				v.timers.forEach(clearInterval);
				for (const s of v.src) {
					try {
						s.stop();
					} catch {
						/* already stopped */
					}
				}
				out.disconnect();
			}
		};
	}

	function loop(kind: 'white' | 'brown') {
		const s = ctx.createBufferSource();
		s.buffer = noise(kind);
		s.loop = true;
		return s;
	}
	function filter(type: BiquadFilterType, freq: number, q = 0.7) {
		const f = ctx.createBiquadFilter();
		f.type = type;
		f.frequency.value = freq;
		f.Q.value = q;
		return f;
	}
	function gain(g: number) {
		const n = ctx.createGain();
		n.gain.value = g;
		return n;
	}
	function lfo(rate: number, depth: number, target: AudioParam) {
		const o = ctx.createOscillator();
		o.frequency.value = rate;
		o.connect(gain(depth)).connect(target);
		return o;
	}
	/** A short note or burst: `make` builds and starts the source at `t`. */
	function blip(dest: AudioNode, t: number, peak: number, attack: number, decay: number, src: AudioScheduledSourceNode, via?: AudioNode) {
		const g = ctx.createGain();
		g.gain.setValueAtTime(0, t);
		g.gain.linearRampToValueAtTime(peak, t + attack);
		g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
		(via ? src.connect(via) : src).connect(g).connect(dest);
		src.start(t);
		src.stop(t + attack + decay + 0.05);
	}
	function burst(dest: AudioNode, t: number, peak: number, decay: number, type: BiquadFilterType, freq: number, q = 1) {
		const s = ctx.createBufferSource();
		s.buffer = noise('white');
		blip(dest, t, peak, 0.002, decay, s, filter(type, freq, q));
	}
	function tone(dest: AudioNode, t: number, freq: number, peak: number, decay: number, type: OscillatorType = 'sine', attack = 0.01) {
		const o = ctx.createOscillator();
		o.type = type;
		o.frequency.value = freq;
		blip(dest, t, peak, attack, decay, o);
	}
	/** A feedback delay with a dark tail: the reverb-ish send. */
	function echo(dest: AudioNode, time: number, fb: number) {
		const d = ctx.createDelay(2);
		d.delayTime.value = time;
		const f = filter('lowpass', 2400);
		const g = gain(fb);
		d.connect(f).connect(g).connect(d);
		f.connect(dest);
		return d;
	}
	const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
	const every = (v: { timers: ReturnType<typeof setInterval>[] }, ms: number, fn: () => void) => v.timers.push(setInterval(fn, ms));

	const builders: Record<Preset, () => Voice> = {
		'white-noise': () =>
			voice((bus, v) => {
				const s = loop('white');
				s.connect(filter('lowpass', 7000)).connect(gain(0.22)).connect(bus);
				v.src.push(s);
			}),
		'brown-noise': () =>
			voice((bus, v) => {
				const s = loop('brown');
				s.connect(filter('lowpass', 900)).connect(gain(0.9)).connect(bus);
				v.src.push(s);
			}),
		rain: () =>
			voice((bus, v) => {
				const hiss = loop('white');
				hiss.connect(filter('highpass', 500)).connect(filter('lowpass', 5000)).connect(gain(0.16)).connect(bus);
				const bed = loop('brown');
				bed.connect(filter('lowpass', 600)).connect(gain(0.5)).connect(bus);
				v.src.push(hiss, bed);
				every(v, 50, () => {
					if (Math.random() < 0.35) burst(bus, ctx.currentTime + Math.random() * 0.05, 0.05 + Math.random() * 0.08, 0.03, 'bandpass', 1500 + Math.random() * 4000, 6);
				});
			}),
		ocean: () =>
			voice((bus, v) => {
				const s = loop('brown');
				const f = filter('lowpass', 700);
				const swell = gain(0.55);
				s.connect(f).connect(swell).connect(bus);
				const a = lfo(0.09, 450, f.frequency);
				const b = lfo(0.09, 0.4, swell.gain);
				const foam = loop('white');
				const ff = filter('bandpass', 2500, 0.5);
				const fg = gain(0.04);
				foam.connect(ff).connect(fg).connect(bus);
				const c = lfo(0.09, 0.035, fg.gain);
				v.src.push(s, a, b, foam, c);
			}),
		forest: () =>
			voice((bus, v) => {
				const wind = loop('brown');
				const f = filter('bandpass', 500, 0.6);
				wind.connect(f).connect(gain(0.45)).connect(bus);
				const a = lfo(0.05, 250, f.frequency);
				v.src.push(wind, a);
				const room = echo(bus, 0.23, 0.3);
				every(v, 450, () => {
					if (Math.random() > 0.22) return;
					const t = ctx.currentTime + 0.02;
					const base = 2600 + Math.random() * 1600;
					const n = 2 + Math.floor(Math.random() * 3);
					for (let i = 0; i < n; i++) {
						const o = ctx.createOscillator();
						const at = t + i * 0.11;
						o.frequency.setValueAtTime(base, at);
						o.frequency.exponentialRampToValueAtTime(base * 1.5, at + 0.07);
						const g = ctx.createGain();
						g.gain.setValueAtTime(0, at);
						g.gain.linearRampToValueAtTime(0.05, at + 0.01);
						g.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
						o.connect(g);
						g.connect(bus);
						g.connect(room);
						o.start(at);
						o.stop(at + 0.1);
					}
				});
			}),
		drone: () =>
			voice((bus, v) => {
				const f = filter('lowpass', 520, 1);
				const g = gain(0.09);
				f.connect(g).connect(bus);
				for (const [m, det] of [
					[45, -6],
					[45, 6],
					[52, -3],
					[57, 4],
					[33, 0]
				]) {
					const o = ctx.createOscillator();
					o.type = m === 33 ? 'sine' : 'sawtooth';
					o.frequency.value = hz(m);
					o.detune.value = det;
					if (m === 33) o.connect(gain(0.2)).connect(bus);
					else o.connect(f);
					v.src.push(o);
				}
				v.src.push(lfo(0.04, 220, f.frequency));
			}),
		lofi: () =>
			voice((bus, v) => {
				const keys = filter('lowpass', 1400);
				const kg = gain(1);
				keys.connect(kg).connect(bus);
				keys.connect(echo(bus, 0.4, 0.25));
				const crackle = loop('white');
				crackle.connect(filter('highpass', 3000)).connect(gain(0.012)).connect(bus);
				v.src.push(crackle);
				// Cmaj7, Am7, Dm7, G7 as MIDI; one bar each at 76 bpm.
				const chords = [
					[48, 55, 59, 64],
					[45, 52, 55, 60],
					[50, 57, 60, 65],
					[43, 50, 53, 59]
				];
				const step = 60 / 76 / 2;
				let n = 0;
				let next = ctx.currentTime + 0.1;
				every(v, 50, () => {
					while (next < ctx.currentTime + 0.25) {
						const s = n % 8;
						const bar = Math.floor(n / 8) % chords.length;
						if (s === 0) for (const m of chords[bar]) tone(keys, next, hz(m), 0.05, step * 7.5, 'triangle', 0.04);
						if (s === 3 || s === 6) tone(keys, next, hz(chords[bar][2] + 12), 0.025, step * 2, 'sine', 0.02);
						if (s === 0 || s === 5) {
							const o = ctx.createOscillator();
							o.frequency.setValueAtTime(110, next);
							o.frequency.exponentialRampToValueAtTime(45, next + 0.12);
							blip(bus, next, 0.35, 0.003, 0.25, o);
						}
						if (s === 2 || s === 6) burst(bus, next, 0.07, 0.12, 'bandpass', 1800, 0.8);
						burst(bus, next, s % 2 ? 0.015 : 0.025, 0.04, 'highpass', 7000);
						next += step;
						n++;
					}
				});
			}),
		piano: () =>
			voice((bus, v) => {
				const dry = gain(1);
				dry.connect(bus);
				dry.connect(echo(bus, 0.37, 0.42));
				const scale = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81];
				let wait = 0;
				let i = 4;
				every(v, 100, () => {
					if ((wait -= 0.1) > 0) return;
					wait = 0.7 + Math.random() * 1.1;
					i = Math.min(Math.max(i + Math.round((Math.random() - 0.5) * 4), 0), scale.length - 1);
					const t = ctx.currentTime + 0.02;
					const f = hz(scale[i]);
					tone(dry, t, f, 0.12, 2.8, 'sine', 0.005);
					tone(dry, t, f * 2, 0.03, 1.2, 'triangle', 0.005);
					if (Math.random() < 0.3) tone(dry, t, f / 2, 0.06, 3, 'sine', 0.01);
				});
				// A held low note under it, so a gap is never silence.
				const pad = ctx.createOscillator();
				pad.frequency.value = hz(48);
				pad.connect(gain(0.03)).connect(bus);
				v.src.push(pad);
			})
	};

	let current: Voice | null = null;
	let currentPreset: Preset | null = null;
	let suspendTimer: ReturnType<typeof setTimeout> | undefined;

	function fadeOut(v: Voice) {
		const t = ctx.currentTime;
		v.out.gain.cancelScheduledValues(t);
		v.out.gain.setValueAtTime(v.out.gain.value, t);
		v.out.gain.linearRampToValueAtTime(0, t + FADE);
		setTimeout(v.stop, FADE * 1000 + 100);
	}

	return {
		play(preset) {
			clearTimeout(suspendTimer);
			if (ctx.state !== 'running') void ctx.resume().catch(() => {});
			if (current && currentPreset === preset) {
				const t = ctx.currentTime;
				current.out.gain.cancelScheduledValues(t);
				current.out.gain.setValueAtTime(current.out.gain.value, t);
				current.out.gain.linearRampToValueAtTime(1, t + FADE);
				return;
			}
			if (current) fadeOut(current);
			current = builders[preset]();
			currentPreset = preset;
			current.out.gain.setValueAtTime(0, ctx.currentTime);
			current.out.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE);
		},
		pause() {
			if (current) fadeOut(current);
			current = null;
			currentPreset = null;
			clearTimeout(suspendTimer);
			suspendTimer = setTimeout(() => void ctx.suspend().catch(() => {}), FADE * 1000 + 150);
		},
		setVolume(v) {
			volume = Math.min(Math.max(v, 0), 1);
			applyVolume();
		},
		setMuted(m) {
			muted = m;
			applyVolume();
		},
		level() {
			const d = new Float32Array(analyser.fftSize);
			analyser.getFloatTimeDomainData(d);
			let s = 0;
			for (const x of d) s += x * x;
			return Math.sqrt(s / d.length);
		},
		spectrum(out) {
			analyser.getByteFrequencyData(out);
		},
		state: () => ctx.state,
		dispose() {
			clearTimeout(suspendTimer);
			current?.stop();
			current = null;
			void ctx.close().catch(() => {});
		}
	};
}
