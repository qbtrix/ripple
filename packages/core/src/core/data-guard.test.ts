// data-guard.test.ts: the data guard against planted bends of a weather card.
// Each mutation is one way the A/B loop bent data; the restructure and the
// restatement cases pin that the guard compares values, not paths.
import { describe, it, expect } from 'vitest';
import { dataGuard, type Fact } from './data-guard.js';

const now = { iso: '2026-10-13T09:00:00Z', tz: 'UTC' };

/** A weather card whose numbers live in state; the metric computes a spread. */
function weather() {
	return {
		version: '1.0',
		state: {
			place: 'Lisbon',
			open: false,
			days: [
				{ day: '2026-10-12', condition: 'sunny', high: 23, low: 16, rainChance: 5 },
				{ day: '2026-10-13', condition: 'rain', high: 19, low: 14, rainChance: 80 }
			]
		},
		ui: {
			type: 'card',
			children: [
				{ type: 'weather-forecast', props: { place: '{state.place}', days: '{state.days}' } },
				{ type: 'metric', props: { label: 'Spread today', value: '{state.days[0].high - state.days[0].low}' } }
			]
		}
	};
}

const guard = (after: unknown, facts?: Fact[]) => dataGuard({ before: weather(), after, facts, now });
const codes = (r: ReturnType<typeof guard>) => r.items.map((i) => i.code);

describe('dataGuard', () => {
	it('passes an unchanged spec, with round 1 as the baseline', () => {
		expect(guard(weather())).toEqual({ ok: true, baseline: 'round1', items: [], warnings: [] });
	});

	it('fails a changed given number, pointing at where it was', () => {
		const after = weather();
		after.state.days[0].rainChance = 50;
		const r = guard(after);
		expect(r.ok).toBe(false);
		expect(r.items).toEqual([expect.objectContaining({ code: 'dataChanged', path: '/state/days/0/rainChance' })]);
	});

	it('fails a dropped number', () => {
		const after = weather();
		delete (after.state.days[1] as { rainChance?: number }).rainChance;
		expect(codes(guard(after))).toEqual(['dataChanged']);
	});

	it('fails a changed date', () => {
		const after = weather();
		after.state.days[0].day = '2026-10-11';
		expect(guard(after).items).toEqual([expect.objectContaining({ code: 'dataChanged', path: '/state/days/0/day' })]);
	});

	it('fails an invented date after today, unless the card is marked sample', () => {
		const after = weather();
		after.state.days.push({ day: '2026-10-20', condition: 'fog', high: 23, low: 16, rainChance: 5 });
		expect(guard(after).items).toEqual([expect.objectContaining({ code: 'inventedDate', path: '/state/days/2/day' })]);
		expect(guard({ ...after, meta: { sample: true } }).ok).toBe(true);
	});

	it('fails a computed number written by hand', () => {
		const after = weather();
		(after.ui.children[1].props as Record<string, unknown>).value = 7;
		expect(guard(after).items).toEqual([expect.objectContaining({ code: 'hardCoded', path: '/ui/children/1/props/value' })]);
	});

	it('passes a restructure that moves the data from state into the widget', () => {
		const before = weather();
		const after = {
			version: '1.0',
			state: { place: 'Lisbon' },
			ui: {
				type: 'card',
				children: [
					{ type: 'weather-forecast', props: { place: 'Lisbon', days: before.state.days } },
					{ type: 'metric', props: { label: 'Spread today', value: '{23 - 16}' } }
				]
			}
		};
		expect(guard(after)).toMatchObject({ ok: true, items: [] });
	});

	it('passes a number that is still on the card in rendered text', () => {
		const after = weather();
		delete (after.state.days[0] as { rainChance?: number }).rainChance;
		(after.ui.children as unknown[]).push({ type: 'text', props: { text: 'Rain today: 5%' } });
		expect(guard(after).ok).toBe(true);
	});

	it('only flags a reworded string', () => {
		const after = weather();
		after.state.place = 'Lisbon, PT';
		const r = guard(after);
		expect(r.ok).toBe(true);
		expect(r.warnings).toEqual([expect.objectContaining({ code: 'dataStringChanged', path: '/state/place' })]);
	});

	it('ignores flags and toggles in state', () => {
		const after = weather();
		after.state.open = true;
		expect(guard(after).ok).toBe(true);
	});

	it('uses given facts as the baseline when the host passes them', () => {
		const facts: Fact[] = [
			{ value: 23, kind: 'given', path: '/days/0/high' },
			{ value: 99, kind: 'invented' }
		];
		expect(guard(weather(), facts)).toMatchObject({ ok: true, baseline: 'facts' });
		const after = weather();
		after.state.days[0].high = 24;
		const r = guard(after, facts);
		expect(r).toMatchObject({ ok: false, baseline: 'facts' });
		expect(r.items).toEqual([expect.objectContaining({ code: 'dataChanged', path: '/days/0/high' })]);
	});

	it('also guards a host widget prop its entry marks data: true', () => {
		const card = (score: number) => ({ version: '1.0', state: {}, ui: { type: 'scoreboard', props: { score, width: score } } });
		const widgets = [
			{
				type: 'scoreboard',
				description: '',
				props: {
					score: { type: 'number', required: true, description: '', data: true },
					width: { type: 'number', required: false, description: '' }
				},
				example: { type: 'scoreboard' }
			}
		];
		expect(dataGuard({ before: card(3), after: card(4), now }).ok).toBe(true);
		expect(dataGuard({ before: card(3), after: card(4), now, widgets }).items).toEqual([
			expect.objectContaining({ code: 'dataChanged', path: '/ui/props/score' })
		]);
	});
});
