#!/usr/bin/env node
// acceptance/run.mjs: the crafted-mode acceptance run. Builds each task in
// tasks.json (the six A/B asks) through build.mjs with its default model,
// two at a time, and writes <outdir>/results.json: per task `{ faults, clean,
// seconds, tokens, rounds, stopped, guardHits, guardRejects }` plus the gate
// verdict. guardHits (accepted rounds that failed the data guard) must be 0;
// guardRejects counts every round the guard refused, as telemetry.
//   node skills/ripple/scripts/acceptance/run.mjs <outdir> [build.mjs options]
// Run it from a project where Playwright resolves (packages/svelte works).
// Extra options (--base, --model, --model-cmd) pass through to build.mjs.
//
// The gate (CL-8): mean faults <= 1.3, clean in 5 of 6 or better, no accepted
// round with a guard hit, every card under 300 s and 200k tokens. `faults` is
// the best round's pure plus render audit items after waivers, summed over
// the 4 shots; `clean` means that is 0. `tasks.json` also carries each ask's
// given facts for hosts that pass them (the worker); build.mjs does not, so
// the guard baselines on round 1 here. Exit 0 when the gate holds.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const [outArg, ...pass] = process.argv.slice(2);
if (!outArg) {
	console.error('usage: node acceptance/run.mjs <outdir> [build.mjs options]');
	process.exit(2);
}
const out = resolve(outArg);
const tasks = Object.entries(JSON.parse(readFileSync(join(here, 'tasks.json'), 'utf8')));
const PARALLEL = 2; // one Chromium per build; more swamps a 16 GB box

/** One task through build.mjs; resolves its summary row. */
function build(name, ask) {
	const dir = join(out, name);
	mkdirSync(dir, { recursive: true });
	const started = Date.now();
	return new Promise((ok) => {
		const child = spawn(process.execPath, [join(here, '../build.mjs'), ask, dir, ...pass], { stdio: ['ignore', 'ignore', 'pipe'] });
		let err = '';
		child.stderr.on('data', (d) => {
			err += d;
			process.stderr.write(`[${name}] ${d}`);
		});
		child.on('close', (code) => {
			const seconds = Math.round((Date.now() - started) / 100) / 10;
			const file = join(dir, 'result.json');
			if (!existsSync(file)) return ok({ name, error: `build.mjs exited ${code}: ${err.trim().split('\n').pop()}`, seconds });
			const r = JSON.parse(readFileSync(file, 'utf8'));
			const rounds = existsSync(join(dir, 'rounds.json')) ? JSON.parse(readFileSync(join(dir, 'rounds.json'), 'utf8')) : [];
			ok({
				name,
				faults: r.faults,
				clean: r.faults === 0,
				seconds,
				tokens: r.tokens,
				rounds: r.rounds,
				stopped: r.stopped,
				guardHits: rounds.filter((x) => x.accepted && x.guard && !x.guard.ok).length,
				guardRejects: rounds.filter((x) => x.guard && !x.guard.ok).length,
				waived: rounds.find((x) => x.n === r.bestRound)?.waived.length ?? 0,
				widgetFaults: r.widgetFaults.map((f) => `${f.rule ?? f.code}: ${f.message}`)
			});
		});
	});
}

const rows = [];
const queue = [...tasks];
await Promise.all(
	Array.from({ length: PARALLEL }, async () => {
		for (let t = queue.shift(); t; t = queue.shift()) rows.push(await build(t[0], t[1].ask));
	})
);
rows.sort((a, b) => tasks.findIndex(([n]) => n === a.name) - tasks.findIndex(([n]) => n === b.name));

const ok = rows.filter((r) => !r.error);
const meanFaults = ok.length ? ok.reduce((s, r) => s + (r.faults ?? 0), 0) / ok.length : null;
const gate = {
	meanFaults,
	clean: ok.filter((r) => r.clean).length,
	guardHits: ok.reduce((s, r) => s + r.guardHits, 0),
	maxSeconds: Math.max(...rows.map((r) => r.seconds)),
	maxTokens: Math.max(...ok.map((r) => r.tokens)),
	errors: rows.filter((r) => r.error).length
};
gate.pass = gate.errors === 0 && meanFaults <= 1.3 && gate.clean >= 5 && gate.guardHits === 0 && gate.maxSeconds < 300 && gate.maxTokens < 200_000;
writeFileSync(join(out, 'results.json'), JSON.stringify({ args: pass, gate, tasks: rows }, null, 2));
console.log(JSON.stringify(gate, null, 2));
process.exit(gate.pass ? 0 : 1);
