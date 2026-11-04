// scripts/recorder-widgets.test.ts — Every widget a /live gallery run or widget
// demo uses is one record-scenario.ts offers the model, so any gallery example
// can be recorded for real.
import { expect, test } from 'vitest';
import { liveRuns } from '../src/routes/live/gallery.js';
import { offered } from './recorder-widgets.js';
import manifest from '../static/manifest.json';

const demos = import.meta.glob('/src/routes/live/demos/*.svelte', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const widgets = new Map(manifest.widgets.map((w) => [w.type, w]));

test('the recorder offers every widget type the gallery uses', () => {
	const used = new Set<string>();
	for (const s of liveRuns) for (const m of s.fixture.chunks.map((c) => c.text).join('').matchAll(/"type"\s*:\s*"([a-z0-9-]+)"/g)) used.add(m[1]);
	for (const src of Object.values(demos)) for (const m of src.matchAll(/type:\s*'([a-z0-9-]+)'/g)) used.add(m[1]);
	const hidden = [...used].filter((t) => widgets.has(t) && !offered(widgets.get(t)!));
	expect(hidden).toEqual([]);
	expect(used.has('figure')).toBe(true);
});
