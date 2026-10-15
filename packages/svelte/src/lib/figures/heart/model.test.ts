// figures/heart/model.test.ts: the heart model keeps real-ish timing, the
// valve order a heart keeps, the cardiac output sum, and the static figure
// builds with every anchor inside the box.
import { describe, expect, it } from 'vitest';
import { clampParams, outputOf, stateAt, stillTime, timingOf, readoutsOf, describe as say } from './model.js';
import { anchorsOf, heartSvg } from './figure.js';

const rest = clampParams({});

describe('heart model', () => {
	it('clamps params and defaults to 72 bpm, 70 ml', () => {
		expect(rest).toEqual({ bpm: 72, stroke: 70 });
		expect(clampParams({ bpm: 400, stroke: -1 })).toEqual({ bpm: 180, stroke: 50 });
		expect(clampParams({ bpm: Number.NaN })).toEqual({ bpm: 72, stroke: 70 });
	});

	it('cardiac output is bpm x stroke volume', () => {
		expect(outputOf(rest)).toBeCloseTo(5.04, 2);
		expect(readoutsOf(rest).output).toBe('5.0');
	});

	it('systole is about a third of the cycle at rest and grows with rate', () => {
		const share = (bpm: number) => {
			const T = timingOf(clampParams({ bpm }));
			return T.systole / T.period;
		};
		expect(share(72)).toBeGreaterThan(0.3);
		expect(share(72)).toBeLessThan(0.4);
		expect(share(180)).toBeGreaterThan(share(72));
	});

	it('keeps the valve order: kick, contraction, ejection, relaxation, filling', () => {
		const T = timingOf(rest);
		const seen: string[] = [];
		for (let t = 0; t < T.period; t += 0.002) {
			const s = stateAt(rest, t);
			if (seen[seen.length - 1] !== s.stage) seen.push(s.stage);
			const av = s.valves.mitral > 0;
			const sl = s.valves.aortic > 0;
			expect(av && sl).toBe(false); // never both open
			if (s.stage === 'contraction' || s.stage === 'relaxation') expect(av || sl).toBe(false);
			if (s.stage === 'ejection' && t > T.atrial + T.contraction + 0.05 && t < T.atrial + T.systole - 0.05) expect(s.valves.aortic).toBe(1);
		}
		expect(seen).toEqual(['atrial-kick', 'contraction', 'ejection', 'relaxation', 'filling']);
	});

	it('ejects one stroke volume per beat and the still frame is mid-ejection', () => {
		const T = timingOf(rest);
		const before = stateAt(rest, T.atrial + T.contraction).ventricle;
		const after = stateAt(rest, T.atrial + T.systole - 1e-6).ventricle;
		expect(before - after).toBeCloseTo(70, 0);
		expect(stateAt(rest, stillTime(rest)).stage).toBe('ejection');
		expect(say(rest, stateAt(rest, stillTime(rest)))).toContain('5.0 litres a minute');
	});
});

describe('heart figure', () => {
	it('builds an SVG with the live parts and every anchor inside the box', () => {
		const svg = heartSvg();
		expect(svg).toContain('data-live="right-ventricle"');
		expect(svg).toContain('data-lever="aortic"');
		expect((svg.match(/class="iso-solid/g) ?? []).length).toBeGreaterThanOrEqual(40);
		for (const a of anchorsOf()) {
			expect(a.x).toBeGreaterThan(0);
			expect(a.x).toBeLessThan(100);
			expect(a.y).toBeGreaterThan(0);
			expect(a.y).toBeLessThan(100);
		}
	});
});
