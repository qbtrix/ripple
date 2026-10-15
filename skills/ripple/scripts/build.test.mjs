// build.test.mjs: build.mjs's crafted-mode budgets and render-tier waivers.
//   node --test skills/ripple/scripts/build.test.mjs   (from a project with Playwright)
// - Crafted prompt size: the model's prompt (rules plus a `prior` of about
//   30k chars plus feedback) and the critic's prompt each fit their own
//   ceiling. This is the crafted budget, not the 32,000-char chat prompt
//   test in pocketpaw: a crafted prompt does not fit that and never shares it.
// - Waiver liveness: the weather-forecast and wide-table fixtures in
//   acceptance/ go through renderer() and buildSpec, and every waiver in
//   core's craft data must take at least one live render item. A waiver
//   that matches nothing fails. Skips when Playwright, Chromium, a built
//   core or a site serving page-audit.js is missing (set RIPPLE_BASE to a
//   local `bun run build:site` preview).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { systemPrompt, userPrompt, criticSystem, criticPrompt } from './build.mjs';
import { renderer, SetupError } from './render.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const NOW = { iso: '2026-10-13T09:00:00.000Z', tz: 'Europe/Lisbon' };
const CORE = join(here, '../../../packages/core/dist');

// The token cap is 200k per card over 4 rounds: 50k tokens a round for the
// model and the critic together. Half of that for a prompt is about 100k
// chars at 4 chars a token, which leaves the reply and the other call room.
const CRAFTED_PROMPT_CAP = 100_000;
// The rules alone (skill sections, widgets.md, craft.md) are about 29k today.
// This is the line where they start crowding out the prior.
const RULES_CAP = 40_000;

/** A spec of about `chars` JSON chars: a data-grid with as many rows as it takes. */
function bigSpec(chars) {
	const rows = [];
	const spec = { version: '1.0', state: {}, ui: { type: 'data-grid', props: { columns: [{ key: 'name', label: 'Name' }, { key: 'note', label: 'Note' }], rows } } };
	while (JSON.stringify(spec).length < chars) rows.push({ id: rows.length + 1, name: `Row ${rows.length + 1}`, note: 'a sample note that pads the row to a real length' });
	return spec;
}
const FEEDBACK = Array.from({ length: 30 }, (_, i) => `- [overflow] /ui/children/${i}: widget=data-grid div.overflow-x-auto scrolls sideways 808 > 294`).join('\n');

test('the crafted model prompt fits its own ceiling with a 30k prior and feedback, all of it sent', () => {
	const system = systemPrompt(NOW);
	assert.ok(system.length <= RULES_CAP, `rules are ${system.length} chars, over ${RULES_CAP}`);
	const prior = bigSpec(30_000);
	const user = userPrompt({ prompt: 'Revenue by region for this year, with sample data.', prior, feedback: FEEDBACK });
	assert.ok(user.includes(JSON.stringify(prior)), 'the whole prior is sent');
	assert.ok(user.includes(FEEDBACK), 'the whole feedback is sent');
	const total = system.length + user.length;
	assert.ok(total <= CRAFTED_PROMPT_CAP, `crafted prompt is ${total} chars, over ${CRAFTED_PROMPT_CAP}`);
});

test('the critic prompt fits the same ceiling with a 30k spec and four shots', async (t) => {
	if (!existsSync(join(CORE, 'manifest/index.js'))) return t.skip('build core first: cd packages/core && bun run build');
	const { craft: rules } = await import(pathToFileURL(join(CORE, 'manifest/index.js')).href);
	assert.ok(rules.rules.length && rules.lenses.length);
	const renders = [380, 1024].flatMap((width) =>
		['light', 'dark'].map((theme) => ({ width, theme, png: `/out/round-4/${width}-${theme}.png`, audit: [], boxes: Array.from({ length: 10 }, () => ({ check: 'overflow', path: '/ui', x: 1, y: 2, w: 300, h: 40 })) }))
	);
	const total = criticSystem(rules).length + criticPrompt({ prompt: 'x', spec: bigSpec(30_000), renders }).length;
	assert.ok(total <= CRAFTED_PROMPT_CAP, `critic prompt is ${total} chars, over ${CRAFTED_PROMPT_CAP}`);
});

/** Waivers in `list` that no item in `rounds` was waived under. */
export function deadWaivers(list, rounds) {
	const waived = rounds.flatMap((r) => r.waived);
	return list.filter((w) => !waived.some((i) => i.code === w.check && i.widget === w.widget));
}

// Every waiver needs a fixture whose render shows its fault.
const FIXTURES = { 'weather-forecast': 'weather-forecast.json', 'data-grid': 'wide-table.json' };

test('every render-tier waiver takes a live item from its fixture', async (t) => {
	if (!existsSync(join(CORE, 'build/index.js'))) return t.skip('build core first: cd packages/core && bun run build');
	const { buildSpec } = await import(pathToFileURL(join(CORE, 'build/index.js')).href);
	const { waivers } = await import(pathToFileURL(join(CORE, 'manifest/index.js')).href);
	const base = (process.env.RIPPLE_BASE || 'https://ripple-site.pawsites.workers.dev').replace(/\/$/, '');
	const out = mkdtempSync(join(tmpdir(), 'build-test-'));
	const rounds = [];
	for (const w of waivers) {
		assert.ok(FIXTURES[w.widget], `no acceptance fixture for the ${w.widget} waiver: add one to FIXTURES`);
		const text = readFileSync(join(here, 'acceptance', FIXTURES[w.widget]), 'utf8');
		try {
			const res = await buildSpec({
				preset: 'card',
				prompt: w.widget,
				model: async () => ({ text, tokens: 1 }),
				renderer: (spec) => renderer(spec, { base, widths: [380], themes: ['light'], outdir: join(out, w.widget) }),
				now: NOW,
				limits: { rounds: 1 }
			});
			rounds.push(...res.rounds);
		} catch (e) {
			if (e instanceof SetupError) return t.skip(`cannot render here: ${e.message.split('\n')[0]}`);
			throw e;
		}
	}
	assert.deepEqual(deadWaivers(waivers, rounds), [], 'a waiver matched no live item');
	// The check itself: a waiver for a fault the fixtures do not have is dead.
	assert.equal(deadWaivers([{ widget: 'weather-forecast', check: 'clippedText', reason: 'planted' }], rounds).length, 1);
});
