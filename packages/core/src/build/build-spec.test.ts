// build-spec.test.ts: the build loop against a fake model and renderer. Pins
// the stop rules (clean, no-progress, round cap, abort as cap, a parse failure
// never ending the run, the data guard), strict-better acceptance, waivers,
// token summing, feedback folding and that the module never reads a clock.
import { describe, it, expect } from 'vitest';
import { buildSpec, parseSpecText, type Model, type ModelRequest, type RenderResult, type Renderer } from './index.js';
import clean from '../core/__fixtures__/audit-corpus/clean.json';

// Read as text the way purity.test.ts does (no @types/node here).
const source = Object.values(
	import.meta.glob('./build-spec.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
)[0];
const CLEAN = JSON.stringify(clean.spec);
const UNKNOWN = JSON.stringify({ ...clean.spec, ui: { type: 'card', children: [{ type: 'lsit' }] } });
const TWO_UNKNOWN = JSON.stringify({ ...clean.spec, ui: { type: 'card', children: [{ type: 'lsit' }, { type: 'txet' }] } });
const now = { iso: '2026-10-13T09:00:00Z', tz: 'UTC' };

/** A model that replies with `texts` in order (the last repeats) and records what it was asked. */
function fakeModel(texts: string[], tokens = 100) {
	const calls: ModelRequest[] = [];
	const model: Model = async (req) => {
		calls.push(req);
		return { text: texts[Math.min(calls.length - 1, texts.length - 1)], tokens };
	};
	return { model, calls };
}

/** A renderer that reports `faults(round)` overflow items on one shot. */
function fakeRenderer(faults: (n: number) => number = () => 0) {
	let n = 0;
	const renderer: Renderer = async () => {
		const k = faults(++n);
		const items = Array.from({ length: k }, (_, i) => ({ code: 'overflow', path: '', message: `box ${i} spills` }));
		const shot: RenderResult = { width: 380, theme: 'light', png: null, boxes: [], audit: [{ check: 'overflow', count: k, items }] };
		return [shot];
	};
	return renderer;
}

const base = { preset: 'card' as const, prompt: 'a card', widgetTypes: ['card', 'text'], now };

describe('buildSpec', () => {
	it('stops clean on a clean first round', async () => {
		const { model, calls } = fakeModel([CLEAN]);
		const res = await buildSpec({ ...base, model, renderer: fakeRenderer() });
		expect(res.stopped).toBe('clean');
		expect(res.rounds).toHaveLength(1);
		expect(res.spec).toEqual(clean.spec);
		expect(res.rounds[0]).toMatchObject({ faults: 0, score: 100, accepted: true, feedback: '' });
		expect(calls[0]).toMatchObject({ round: 1, feedback: '', prior: undefined });
	});

	it('feeds the faults back and stops clean once the model fixes them', async () => {
		const { model, calls } = fakeModel([UNKNOWN, CLEAN]);
		const res = await buildSpec({ ...base, model, renderer: fakeRenderer() });
		expect(res.stopped).toBe('clean');
		expect(res.rounds.map((r) => r.score)).toEqual([90, 100]);
		expect(calls[1].feedback).toContain('/ui/children/0 (unknownWidget)');
		expect(calls[1].prior).toEqual(JSON.parse(UNKNOWN));
	});

	it('folds render faults into the score and the feedback, tagged by shot', async () => {
		const { model, calls } = fakeModel([CLEAN]);
		const res = await buildSpec({ ...base, model, renderer: fakeRenderer((n) => (n === 1 ? 2 : 0)) });
		expect(res.rounds[0].score).toBe(80);
		expect(calls[1].feedback).toContain('spec (overflow): [380-light] box 1 spills');
		expect(res.stopped).toBe('clean');
	});

	it('stops no-progress when a round does not beat the best, and keeps the best', async () => {
		const { model } = fakeModel([UNKNOWN, UNKNOWN]);
		const res = await buildSpec({ ...base, model, renderer: fakeRenderer() });
		expect(res.stopped).toBe('no-progress');
		expect(res.rounds.map((r) => r.accepted)).toEqual([true, false]);
		expect(res.spec).toEqual(JSON.parse(UNKNOWN));
	});

	it('never returns a worse round', async () => {
		const { model } = fakeModel([UNKNOWN, TWO_UNKNOWN]);
		const res = await buildSpec({ ...base, model, renderer: fakeRenderer() });
		expect(res.stopped).toBe('no-progress');
		expect(res.spec).toEqual(JSON.parse(UNKNOWN));
	});

	it('stops at the round cap (4) while every round improves', async () => {
		const { model } = fakeModel([CLEAN]);
		const res = await buildSpec({ ...base, model, renderer: fakeRenderer((n) => 10 - n) });
		expect(res.stopped).toBe('cap');
		expect(res.rounds.map((r) => r.score)).toEqual([10, 20, 30, 40]);
		expect(res.spec).toEqual(clean.spec);
	});

	it('records an unparseable round but never returns it, and keeps going', async () => {
		const { model, calls } = fakeModel(['sorry, no JSON here', '```json\n' + CLEAN + '\n```']);
		const res = await buildSpec({ ...base, model, renderer: fakeRenderer() });
		expect(res.rounds[0]).toMatchObject({ spec: null, accepted: false, faults: 1 });
		expect(calls[1].feedback).toContain('spec (parse)');
		expect(calls[1].prior).toBeUndefined();
		expect(res.stopped).toBe('clean');
		expect(res.spec).toEqual(clean.spec);
	});

	it('does not stop no-progress on an unparseable round after an accepted one', async () => {
		const { model, calls } = fakeModel([UNKNOWN, 'not json', CLEAN]);
		const res = await buildSpec({ ...base, model, renderer: fakeRenderer() });
		expect(res.rounds.map((r) => r.accepted)).toEqual([true, false, true]);
		expect(calls[2].feedback).toContain('spec (parse)');
		expect(calls[2].prior).toEqual(JSON.parse(UNKNOWN));
		expect(res.stopped).toBe('clean');
		expect(res.spec).toEqual(clean.spec);
	});

	it('returns a null spec when no round parses', async () => {
		const { model } = fakeModel(['nope']);
		const res = await buildSpec({ ...base, model, renderer: fakeRenderer() });
		expect(res).toMatchObject({ spec: null, stopped: 'cap' });
		expect(res.rounds).toHaveLength(4);
	});

	it('returns the best round with stopped cap when aborted mid-run', async () => {
		const ctl = new AbortController();
		let n = 0;
		const model: Model = async ({ signal }) => {
			n += 1;
			if (n === 2) {
				ctl.abort();
				if (signal?.aborted) throw new Error('aborted');
			}
			return { text: UNKNOWN, tokens: 50 };
		};
		const res = await buildSpec({ ...base, model, renderer: fakeRenderer(), signal: ctl.signal });
		expect(res.stopped).toBe('cap');
		expect(res.rounds).toHaveLength(1);
		expect(res.spec).toEqual(JSON.parse(UNKNOWN));
	});

	it('checks the signal between steps: an abort during render skips the rest', async () => {
		const ctl = new AbortController();
		const { model, calls } = fakeModel([CLEAN]);
		const renderer: Renderer = async () => {
			ctl.abort();
			return [];
		};
		const res = await buildSpec({ ...base, model, renderer, signal: ctl.signal });
		expect(res.stopped).toBe('cap');
		expect(res.rounds).toHaveLength(0);
		expect(res.spec).toBeNull();
		expect(calls).toHaveLength(1);
	});

	it('rethrows a host error that is not an abort', async () => {
		const model: Model = async () => {
			throw new Error('provider down');
		};
		await expect(buildSpec({ ...base, model, renderer: fakeRenderer() })).rejects.toThrow('provider down');
	});

	it('sums tokens from the model and the critic, and moves widget issues aside', async () => {
		const { model } = fakeModel([UNKNOWN, CLEAN], 100);
		const seen: number[] = [];
		const res = await buildSpec({
			...base,
			model,
			renderer: fakeRenderer(),
			critic: async () => ({
				tokens: 7,
				issues: [{ code: 'scroller', path: '/ui', message: 'scrolls by design', lens: 'fit', severity: 1, fixable: 'widget' }]
			}),
			onRound: (r) => seen.push(r.n)
		});
		expect(res.tokens).toBe(214);
		expect(res.rounds.map((r) => r.tokens)).toEqual([107, 107]);
		expect(res.widgetFaults).toHaveLength(1);
		expect(res.stopped).toBe('clean');
		expect(seen).toEqual([1, 2]);
	});

	it('honours limits.rounds', async () => {
		const { model } = fakeModel([CLEAN]);
		const res = await buildSpec({ ...base, model, renderer: fakeRenderer((n) => 10 - n), limits: { rounds: 2 } });
		expect(res.rounds).toHaveLength(2);
		expect(res.stopped).toBe('cap');
	});

	it('never reads a clock', () => {
		expect(source).not.toMatch(/Date\.now|new Date|performance\.now/);
	});
});

/** A weather card with one unknown widget, so round 1 is not clean and the loop asks for a fix. */
function weather(extra: unknown[] = [{ type: 'lsit' }]) {
	return {
		version: '1.0',
		state: { days: [{ day: '2026-10-12', condition: 'sunny', high: 23, low: 16, rainChance: 5 }] },
		ui: { type: 'card', children: [{ type: 'weather-forecast', props: { place: 'Lisbon', days: '{state.days}' } }, ...extra] }
	};
}
const W = { ...base, widgetTypes: ['card', 'text', 'weather-forecast'] };

describe('buildSpec data guard', () => {
	const bends: [string, (s: ReturnType<typeof weather>) => void, string][] = [
		['a dropped number', (s) => delete (s.state.days[0] as { rainChance?: number }).rainChance, 'dataChanged'],
		['a changed date', (s) => (s.state.days[0].day = '2026-10-11'), 'dataChanged'],
		['an invented future date', (s) => s.state.days.push({ ...s.state.days[0], day: '2026-11-02' }), 'inventedDate']
	];
	it.each(bends)('stops guard on %s in round 2 and keeps round 1', async (_, bend, code) => {
		const bent = weather([]);
		bend(bent);
		const { model } = fakeModel([JSON.stringify(weather()), JSON.stringify(bent)]);
		let renders = 0;
		const renderer: Renderer = async (spec) => (renders++, fakeRenderer()(spec));
		const res = await buildSpec({ ...W, model, renderer });
		expect(res.stopped).toBe('guard');
		expect(res.spec).toEqual(weather());
		expect(res.rounds.map((r) => r.accepted)).toEqual([true, false]);
		expect(res.rounds[1].guard).toMatchObject({ ok: false, baseline: 'round1' });
		expect(res.widgetFaults).toEqual([expect.objectContaining({ code, fixable: 'widget', lens: 'data truth' })]);
		expect(renders).toBe(1); // a disqualified round is never rendered
	});

	it('stops guard on an appointment moved to a later time the same day', async () => {
		const at = (start: string) => ({
			version: '1.0',
			state: { events: [{ title: 'Dentist', start }] },
			ui: { type: 'card', children: [{ type: 'text', props: { text: 'Dentist' } }, { type: 'lsit' }] }
		});
		const moved = at('2026-10-14T15:30');
		moved.ui.children.pop();
		const { model } = fakeModel([JSON.stringify(at('2026-10-14T10:00')), JSON.stringify(moved)]);
		const res = await buildSpec({ ...W, model, renderer: fakeRenderer() });
		expect(res.stopped).toBe('guard');
		expect(res.widgetFaults).toEqual([expect.objectContaining({ code: 'dataChanged' })]);
	});

	it('passes a round that restructures state but keeps every value', async () => {
		const moved = weather([]);
		moved.state = {} as never;
		(moved.ui.children[0] as { props: Record<string, unknown> }).props.days = weather().state.days;
		const { model } = fakeModel([JSON.stringify(weather()), JSON.stringify(moved)]);
		const res = await buildSpec({ ...W, model, renderer: fakeRenderer() });
		expect(res.stopped).toBe('clean');
		expect(res.spec).toEqual(moved);
	});

	it('returns no spec when round 1 already breaks a given fact', async () => {
		const { model } = fakeModel([JSON.stringify(weather())]);
		const res = await buildSpec({ ...W, model, renderer: fakeRenderer(), facts: [{ value: 24, kind: 'given' }] });
		expect(res).toMatchObject({ spec: null, stopped: 'guard' });
		expect(res.rounds[0].guard?.baseline).toBe('facts');
	});
});

describe('buildSpec waivers', () => {
	const overflowAt = (...paths: string[]): Renderer =>
		async () => [
			{
				width: 380,
				theme: 'light',
				png: null,
				boxes: [],
				audit: [{ check: 'overflow', count: paths.length, items: paths.map((path) => ({ code: 'overflow', path, message: 'scrolls sideways' })) }]
			}
		];
	const spec = JSON.stringify(weather([{ type: 'text', props: { text: 'hi' } }]));

	it('takes a waived item out of the count, keeps it in the record, and costs 2', async () => {
		const { model } = fakeModel([spec]);
		const res = await buildSpec({ ...W, model, renderer: overflowAt('/ui/children/0/div') });
		expect(res.stopped).toBe('clean');
		expect(res.rounds[0]).toMatchObject({ faults: 0, score: 98, waived: [expect.objectContaining({ code: 'overflow' })] });
		expect(res.rounds[0].renders[0].audit[0]).toMatchObject({ count: 0, items: [], waived: [expect.anything()] });
	});

	it('still counts the same check on a widget with no waiver', async () => {
		const { model } = fakeModel([spec]);
		const res = await buildSpec({ ...W, model, renderer: overflowAt('/ui/children/0', '/ui/children/1'), limits: { rounds: 1 } });
		expect(res.rounds[0]).toMatchObject({ faults: 1, score: 88 });
	});

	it('drops a waiver past its until date', async () => {
		const { model } = fakeModel([spec]);
		const waivers = [{ widget: 'weather-forecast', check: 'overflow', reason: 'test', until: '2026-10-01' }];
		const res = await buildSpec({ ...W, model, renderer: overflowAt('/ui/children/0'), waivers, limits: { rounds: 1 } });
		expect(res.rounds[0]).toMatchObject({ faults: 1, waived: [] });
	});
});

describe('parseSpecText', () => {
	it('takes a fenced block, or the outermost braces around prose', () => {
		expect(parseSpecText('Here:\n```json\n{"a":1}\n```\nDone')).toEqual({ spec: { a: 1 } });
		expect(parseSpecText('Sure! {"a":{"b":2}} hope it helps')).toEqual({ spec: { a: { b: 2 } } });
		expect(parseSpecText('no')).toHaveProperty('error');
	});
});
