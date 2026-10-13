// craft.test.ts: the craft data stays honest. Every waiver names a known check
// id, every pure audit check is a known id, the data-props table names each
// widget once, there are 11 lenses, every rule has a unique id, a known lens
// and a known check, and each widget has one intent entry. That each waived
// widget and data prop exists in the full manifest is checked on the svelte
// side (manifest/craft.test.ts there), and a waiver with no live item is
// caught by the browser acceptance run.
import { describe, it, expect } from 'vitest';
import { CHECK_IDS, DATA_PROPS, intents, lenses, rules, waivers } from './craft.js';
import { specAudit } from '../core/spec-audit.js';

const known = new Set<string>(CHECK_IDS);

describe('craft data', () => {
	it('every waiver names a known check id and gives a reason', () => {
		expect(waivers.length).toBeGreaterThan(0);
		for (const w of waivers) {
			expect(known.has(w.check), `${w.widget}: ${w.check}`).toBe(true);
			expect(w.reason.length).toBeGreaterThan(10);
		}
	});

	it('every pure audit check id is listed, in report order', () => {
		const ids = specAudit({}, { widgets: [], now: { iso: '2026-10-13T00:00:00Z', tz: 'UTC' } }).map((r) => r.check);
		expect(CHECK_IDS.slice(0, ids.length)).toEqual(ids);
	});

	it('lists each data prop once', () => {
		for (const [type, props] of Object.entries(DATA_PROPS)) expect(new Set(props).size, type).toBe(props.length);
	});

	it('has the 11 lenses, each with a question', () => {
		expect(lenses.map((l) => l.id)).toEqual([
			'archetype',
			'answer',
			'data-truth',
			'dates',
			'numbers',
			'layout',
			'hierarchy',
			'density',
			'states',
			'themes',
			'interaction'
		]);
		for (const l of lenses) expect(l.question.endsWith('?'), l.id).toBe(true);
	});

	it('every rule has a unique kebab id, a known lens and a known check', () => {
		const lensIds = new Set(lenses.map((l) => l.id));
		expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
		for (const r of rules) {
			expect(r.id, r.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
			expect(lensIds.has(r.lens), `${r.id}: ${r.lens}`).toBe(true);
			if (r.check !== undefined) expect(known.has(r.check), `${r.id}: ${r.check}`).toBe(true);
		}
		// Every lens has at least one rule to cite.
		expect([...lensIds].filter((id) => !rules.some((r) => r.lens === id))).toEqual([]);
	});

	it('has one intent per widget, each with something to say', () => {
		expect(new Set(intents.map((i) => i.widget)).size).toBe(intents.length);
		for (const i of intents) expect(i.ask.length + i.hints.length, i.widget).toBeGreaterThan(0);
	});
});
