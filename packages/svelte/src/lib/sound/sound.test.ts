// sound/sound.test.ts: the cue engine in jsdom. No AudioContext there, so
// playCue must be a silent no-op; with a stub context it plays only after a
// user gesture, on a visible page, with sounds on. The on/off flag persists in
// localStorage. Cue samples stay short and under CUE_PEAK.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fresh = async () => {
	vi.resetModules();
	return import('./index.js');
};

let store: Record<string, string>;
beforeEach(() => {
	store = {};
	vi.stubGlobal('localStorage', {
		getItem: (k: string) => store[k] ?? null,
		setItem: (k: string, v: string) => void (store[k] = v)
	});
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	delete (window as { AudioContext?: unknown }).AudioContext;
	delete (navigator as { userActivation?: unknown }).userActivation;
	delete (document as { hidden?: boolean }).hidden;
});

function stubContext() {
	const started = vi.fn();
	const made = vi.fn();
	class FakeContext {
		sampleRate = 48_000;
		state = 'running';
		destination = {};
		constructor() {
			made();
		}
		createBuffer = (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) });
		createGain = () => ({ gain: { value: 1 }, connect: (n: unknown) => n });
		createBufferSource = () => ({ buffer: null, connect: (n: unknown) => n, start: started });
		resume = () => Promise.resolve();
	}
	(window as { AudioContext?: unknown }).AudioContext = FakeContext;
	return { started, made };
}
const activate = (on: boolean) => Object.defineProperty(navigator, 'userActivation', { value: { hasBeenActive: on }, configurable: true });

describe('sound: the engine', () => {
	it('is a silent no-op without an AudioContext', async () => {
		const { playCue, CUES } = await fresh();
		for (const c of CUES) expect(() => playCue(c)).not.toThrow();
	});

	it('waits for a user gesture, and makes no context before one', async () => {
		const { started, made } = stubContext();
		const { playCue } = await fresh();
		activate(false);
		playCue('complete');
		expect(made).not.toHaveBeenCalled();
		activate(true);
		playCue('complete');
		playCue('tick');
		expect(made).toHaveBeenCalledTimes(1);
		expect(started).toHaveBeenCalledTimes(2);
	});

	it('stays quiet on a hidden page or when sounds are off', async () => {
		const { started } = stubContext();
		const { playCue, setSoundEnabled } = await fresh();
		activate(true);
		Object.defineProperty(document, 'hidden', { value: true, configurable: true });
		playCue('win');
		delete (document as { hidden?: boolean }).hidden;
		setSoundEnabled(false);
		playCue('win');
		expect(started).not.toHaveBeenCalled();
		setSoundEnabled(true);
		playCue('win');
		expect(started).toHaveBeenCalledTimes(1);
	});

	it('defaults on and persists the flag', async () => {
		let m = await fresh();
		expect(m.soundEnabled()).toBe(true);
		m.setSoundEnabled(false);
		expect(store['ripple:sound']).toBe('off');
		m = await fresh();
		expect(m.soundEnabled()).toBe(false);
	});

	it('survives blocked storage', async () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			}
		});
		const m = await fresh();
		expect(m.soundEnabled()).toBe(true);
		m.setSoundEnabled(false);
		expect(m.soundEnabled()).toBe(false);
	});

	it('renders every cue short, audible and under the peak', async () => {
		const { CUES, CUE_PEAK, renderCue } = await fresh();
		for (const c of CUES) {
			const s = renderCue(c, 44_100);
			const peak = s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
			expect(s.length / 44_100, c).toBeLessThan(0.7);
			expect(peak, c).toBeGreaterThan(0.05);
			expect(peak, c).toBeLessThanOrEqual(CUE_PEAK + 1e-6);
		}
	});
});

