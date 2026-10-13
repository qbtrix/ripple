// scripts/score-figure.ts: one figure's quality and cost on a page of text. Runs
// the iso audit (`auditSvg` from @ripple-ui/core/iso) on every audit frame the
// figure's `review` names, counts solids and drawn paths, times a render, and
// prints the cost of the round. The score is explainable on purpose:
//   100, minus 10 per unwaived audit fault, minus 2 per waiver, floored at 0.
// A figure module must export `review` (see figures/bike-gears/figure.ts).
//
// Run: bun run score:figure bike-gears [--tokens 180000] [--minutes 40]
// Token and agent-time figures come from the caller (the factory run knows
// them); without them the cost line says n/a and gives this run's wall-clock.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { auditSvg, readSvg } from '@ripple-ui/core/iso';

interface Review {
	waivers: Array<{ check: string; id: string; reason: string }>;
	auditFrames(): Array<[string, string]>;
	svg(theme: 'light' | 'dark'): string;
}

const started = performance.now();
const { positionals, values } = parseArgs({ allowPositionals: true, options: { tokens: { type: 'string' }, minutes: { type: 'string' } } });
const id = positionals[0];
if (!id) throw new Error('usage: bun run score:figure <figure-id> [--tokens N] [--minutes M]');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { review } = (await import(join(root, 'src/lib/figures', id, 'figure.ts'))) as { review?: Review };
if (!review) throw new Error(`figures/${id}/figure.ts exports no \`review\``);

const rows = new Map<string, { faults: number; waived: number; worst: string[] }>();
let auditMs = 0;
const frames = review.auditFrames();
for (const [, svg] of frames) {
	const t = performance.now();
	const reports = auditSvg(svg);
	auditMs += performance.now() - t;
	for (const r of reports) {
		const waived = new Set(review.waivers.filter((w) => w.check === r.check).map((w) => w.id));
		const row = rows.get(r.check) ?? { faults: 0, waived: 0, worst: [] };
		for (const item of r.items) {
			if (waived.has(item.id)) row.waived++;
			else {
				row.faults++;
				row.worst.push(JSON.stringify(item));
			}
		}
		rows.set(r.check, row);
	}
}

const live = review.svg('light');
review.svg('dark');
const N = 20;
const t0 = performance.now();
for (let i = 0; i < N; i++) review.svg(i % 2 ? 'dark' : 'light');
const renderMs = (performance.now() - t0) / N;
const solids = frames.length ? readSvg(frames[0][1]).solids.length : 0;
const paths = (live.match(/<path\b/g) ?? []).length;
const dots = (live.match(/<circle\b/g) ?? []).length;

const faults = [...rows.values()].reduce((n, r) => n + r.faults, 0);
const waivers = review.waivers.length;
const score = Math.max(0, 100 - 10 * faults - 2 * waivers);
const wall = (performance.now() - started) / 1000;

console.log(`figure      ${id}  (${frames.length} audit frames: ${frames.map(([name]) => name).join(', ')})`);
for (const [check, r] of rows) {
	console.log(`audit       ${check.padEnd(11)} ${r.faults} faults, ${r.waived} waived across frames`);
	for (const line of r.worst.slice(0, 5)) console.log(`              ${line}`);
}
for (const w of review.waivers) console.log(`waiver      ${w.check} ${w.id}: ${w.reason}`);
console.log(`parts       ${solids} solids, ${paths} paths, ${dots} dots, ${(live.length / 1024).toFixed(0)} KB svg`);
console.log(`time        render ${renderMs.toFixed(1)} ms (mean of ${N}), audit ${(auditMs / frames.length).toFixed(0)} ms per frame`);
console.log(`cost        tokens ${values.tokens ?? 'n/a'}, agent time ${values.minutes ? `${values.minutes} min` : 'n/a'}, this run ${wall.toFixed(1)} s`);
console.log(`score       ${score}/100 = 100 - 10 x ${faults} faults - 2 x ${waivers} waivers`);
process.exitCode = faults ? 1 : 0;
