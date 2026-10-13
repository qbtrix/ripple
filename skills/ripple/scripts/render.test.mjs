// render.test.mjs: render.mjs stays the same CLI now that it is also a module.
// Run from a project with Playwright (the ripple root works):
//   node --test skills/ripple/scripts/render.test.mjs
// It compares this render.mjs against a baseline copy from git
// (RENDER_BASELINE_REF, default origin/main) on the same specs: same exit
// code, same stderr on a usage error, same audit.json. It also checks that
// renderer() reports the same counts as the CLI. The render cases skip when
// Playwright, Chromium or the site is not reachable (the CLI exits 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderer } from './render.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const NEW = join(here, 'render.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'render-test-'));
const OLD = join(tmp, 'render.old.mjs');
const ref = process.env.RENDER_BASELINE_REF || 'origin/main';
writeFileSync(OLD, execFileSync('git', ['show', `${ref}:skills/ripple/scripts/render.mjs`], { cwd: here }));

const cli = (script, args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
const audit = (dir) => readFileSync(join(dir, 'audit.json'), 'utf8').replaceAll(dir, 'OUT');

const CLEAN = join(here, '../references/examples/bill-splitter.json');
const FAULTY = join(tmp, 'faulty.json');
writeFileSync(FAULTY, JSON.stringify({ version: '1.0', ui: { type: 'card', children: [{ type: 'lsit' }] }, state: {} }));

test('usage error: same exit 2 and the same message', () => {
	const a = cli(OLD, []);
	const b = cli(NEW, []);
	assert.equal(b.status, 2);
	assert.equal(b.status, a.status);
	assert.equal(b.stderr, a.stderr);
});

for (const [name, spec, code] of [
	['clean', CLEAN, 0],
	['faulty', FAULTY, 1]
]) {
	test(`${name} spec: same exit code and the same audit.json as ${ref}`, async (t) => {
		const oldDir = join(tmp, `${name}-old`);
		const newDir = join(tmp, `${name}-new`);
		const a = cli(OLD, [spec, oldDir]);
		if (a.status === 2) return t.skip(`cannot render here: ${a.stderr.split('\n')[0]}`);
		const b = cli(NEW, [spec, newDir]);
		assert.equal(b.status, code);
		assert.equal(b.status, a.status);
		assert.equal(audit(newDir), audit(oldDir));

		const results = await renderer(JSON.parse(readFileSync(spec, 'utf8')), { outdir: join(tmp, `${name}-module`) });
		const counts = JSON.parse(readFileSync(join(newDir, 'audit.json'), 'utf8')).counts;
		for (const [check, n] of Object.entries(counts)) {
			if (n === null) continue;
			const got = results.reduce((s, r) => s + (r.audit.find((x) => x.check === check)?.count ?? 0), 0);
			assert.equal(got, n, `renderer() ${check}`);
		}
		assert.ok(results.every((r) => r.png && Array.isArray(r.boxes)));
	});
}
