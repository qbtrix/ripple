// craft.test.ts: the craft data stays honest. Every waiver names a known check
// id, every pure audit check is a known id, and the data-props table names each
// widget once. That each waived widget and data prop exists in the full
// manifest is checked on the svelte side (manifest/craft.test.ts there), and a
// waiver with no live item is caught by the browser acceptance run.
import { describe, it, expect } from 'vitest';
import { CHECK_IDS, DATA_PROPS, waivers } from './craft.js';
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
});
