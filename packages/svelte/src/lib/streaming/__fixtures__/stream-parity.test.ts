// @file streaming/__fixtures__/stream-parity.test.ts
// @description expectStreamParity() on a composite DW-0 already hardened, so
//   the data-widget agents start from a helper known to pass on a good widget,
//   and the cut points mountStreamed() streams at by default.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/svelte';
import { parsePartialSpec } from '$lib/streaming/json-parse.js';
import { stateCuts } from './mount-streamed.js';
import { expectStreamParity } from './stream-parity.js';

afterEach(cleanup);

describe('expectStreamParity', () => {
	it('passes for checklist-layout streamed with id-less items', async () => {
		await expectStreamParity({
			ui: {
				type: 'checklist-layout',
				props: {
					title: 'Launch gate',
					items: [
						{ label: 'Pick a domain', state: 'done' },
						{ label: 'Write the copy', state: 'in-progress', owner: { name: 'Ana Ruiz' } },
						{ id: 'task-1', label: 'Security review', state: 'blocked' }
					]
				}
			}
		});
	});

	it('streams at every new partial-parse state: empty and 1-char strings, empty containers', () => {
		const json = JSON.stringify({ ui: { type: 'text', props: { text: 'Hello', n: 12, items: [{ a: 'x' }, {}] } } });
		const cuts = stateCuts(json);
		const states = cuts.map((c) => JSON.stringify(parsePartialSpec(json.slice(0, c)).value));
		expect(cuts.at(-1)).toBe(json.length);
		for (const s of ['"text":""', '"text":"H"', '"n":12', '"items":[]', '"items":[{}]', '"a":"x"', '{"a":"x"},{}']) {
			expect(states.some((v) => v.includes(s)), s).toBe(true);
		}
		// One render per state: no cut before the last (which delivers the rest)
		// parses the same as the one before it.
		expect(states.slice(0, -1).every((v, i) => v !== states[i - 1])).toBe(true);
	});
});
