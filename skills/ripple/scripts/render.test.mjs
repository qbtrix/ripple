// render.test.mjs: render.mjs as a CLI and as a module.
// Run from a project with Playwright (the ripple root works):
//   node --test skills/ripple/scripts/render.test.mjs
// It compares this render.mjs against a baseline copy from git
// (RENDER_BASELINE_REF, default origin/main) on the same specs at 380 (the
// phone layout both share): same stderr on a usage error, and the same
// audit.json once this file's own type counts (smallText, wideMeasure) are set
// aside; the exit code differs only when those counts are not 0. It checks
// renderer() reports the same counts as the CLI, returns an offender box per
// page-audit item, that a 1440 shot gives the card the whole width, and runs
// typeAudit() on a hand-built page. The render cases skip when Playwright,
// Chromium or the site is not reachable (the CLI exits 2); set CHROME_PATH
// when this Playwright's Chromium build is missing. The site must serve
// page-audit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { renderer, SetupError, typeAudit } from './render.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const NEW = join(here, 'render.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'render-test-'));
const OLD = join(tmp, 'render.old.mjs');
const ref = process.env.RENDER_BASELINE_REF || 'origin/main';
writeFileSync(OLD, execFileSync('git', ['show', `${ref}:skills/ripple/scripts/render.mjs`], { cwd: here }));

// Until the deployed site ships page-audit.js, the render cases skip there (NEW
// would exit 2 while OLD renders) instead of failing on an ordering gap.
const BASE = (process.env.RIPPLE_BASE || 'https://ripple-site.pawsites.workers.dev').replace(/\/$/, '');
const NO_AUDIT = (await fetch(`${BASE}/page-audit.js`, { signal: AbortSignal.timeout(5000) }).then((r) => r.ok, () => false))
	? null
	: `${BASE}/page-audit.js is missing: run bun run build:site && bunx vite preview in packages/svelte and set RIPPLE_BASE`;

const cli = (script, args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
const TYPE = ['smallText', 'wideMeasure'];
const read = (dir) => JSON.parse(readFileSync(join(dir, 'audit.json'), 'utf8').replaceAll(dir, 'OUT'));
/** audit.json without the type counts (and `clean`, which they feed), to compare with the baseline. */
const shared = (r) => {
	const { clean, counts, shots, ...rest } = r;
	const strip = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !TYPE.includes(k)));
	return { ...rest, counts: strip(counts), shots: shots.map(strip) };
};

const CLEAN = join(here, '../references/examples/bill-splitter.json');
const FAULTY = join(tmp, 'faulty.json');
writeFileSync(FAULTY, JSON.stringify({ version: '1.0', ui: { type: 'card', children: [{ type: 'lsit' }] }, state: {} }));
// Four metrics in a row that does not wrap: wider than a phone.
const metric = (id, label, value) => ({ id, type: 'metric', props: { label, value } });
const OVERFLOW = {
	version: '1.0',
	state: {},
	ui: {
		type: 'flex',
		props: { direction: 'row', gap: '16px', wrap: false },
		children: [metric('m1', 'Revenue this quarter', '$1,234,567'), metric('m2', 'Customers active', '12,345'), metric('m3', 'Churn rate monthly', '3.4%'), metric('m4', 'Net promoter score', '72')]
	}
};

test('usage error: same exit 2 and the same first line, and the help names the new counts', () => {
	const a = cli(OLD, []);
	const b = cli(NEW, []);
	assert.equal(b.status, 2);
	assert.equal(b.status, a.status);
	assert.equal(b.stderr.split('\n')[0], a.stderr.split('\n')[0]);
	assert.match(b.stderr, /default 380,1024,1440/);
	for (const k of TYPE) assert.match(b.stderr, new RegExp(`\\b${k}\\b`));
});

for (const [name, spec, code] of [
	['clean', CLEAN, 0],
	['faulty', FAULTY, 1]
]) {
	test(`${name} spec: same exit code and the same audit.json as ${ref}`, async (t) => {
		if (NO_AUDIT) return t.skip(NO_AUDIT);
		const oldDir = join(tmp, `${name}-old`);
		const newDir = join(tmp, `${name}-new`);
		const a = cli(OLD, [spec, oldDir, '--widths', '380']);
		if (a.status === 2) return t.skip(`cannot render here: ${a.stderr.split('\n')[0]}`);
		const b = cli(NEW, [spec, newDir, '--widths', '380']);
		assert.equal(a.status, code);
		const now = read(newDir);
		const typeFaults = TYPE.reduce((n, k) => n + now.counts[k], 0);
		assert.equal(b.status, typeFaults ? 1 : a.status);
		assert.deepEqual(shared(now), shared(read(oldDir)));

		const results = await renderer(JSON.parse(readFileSync(spec, 'utf8')), { widths: [380], outdir: join(tmp, `${name}-module`) });
		const counts = now.counts;
		for (const [check, n] of Object.entries(counts)) {
			if (n === null) continue;
			const got = results.reduce((s, r) => s + (r.audit.find((x) => x.check === check)?.count ?? 0), 0);
			assert.equal(got, n, `renderer() ${check}`);
		}
		assert.ok(results.every((r) => r.png && Array.isArray(r.boxes)));
	});
}

test('renderer() returns a box for every page-audit item on an overflowing row', async (t) => {
	if (NO_AUDIT) return t.skip(NO_AUDIT);
	let results;
	try {
		results = await renderer(OVERFLOW, { widths: [380], themes: ['light'], outdir: join(tmp, 'overflow') });
	} catch (e) {
		if (e instanceof SetupError) return t.skip(`cannot render here: ${e.message.split('\n')[0]}`);
		throw e;
	}
	const [r] = results;
	const overflow = r.audit.find((x) => x.check === 'overflow');
	assert.ok(overflow.count > 0, 'the row overflows at 380');
	const boxes = r.boxes.filter((b) => b.check === 'overflow');
	assert.equal(boxes.length, overflow.count);
	assert.ok(boxes.every((b) => b.w > 0 && b.h > 0 && Number.isFinite(b.x) && Number.isFinite(b.y)));
	assert.ok(boxes.some((b) => b.path?.startsWith('/ui/children/')), 'an offender maps to its node');
});

test('a 1440 shot gives the card the whole width (the chat and JSON panes are hidden)', (t) => {
	if (NO_AUDIT) return t.skip(NO_AUDIT);
	const dir = join(tmp, 'wide');
	const r = cli(NEW, [CLEAN, dir, '--widths', '1440', '--themes', 'light']);
	if (r.status === 2) return t.skip(`cannot render here: ${r.stderr.split('\n')[0]}`);
	const [shot] = read(dir).shots;
	assert.ok(shot.surfaceWidth > 1300, `surface ${shot.surfaceWidth}px at 1440`);
});

test('typeAudit() flags small text and over-long lines, and skips sr-only and aria-hidden text', async (t) => {
	let chromium;
	try {
		chromium = createRequire(join(process.cwd(), 'package.json'))('playwright').chromium;
	} catch {
		return t.skip('Playwright not installed here');
	}
	let browser;
	try {
		browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
	} catch (e) {
		return t.skip(`no Chromium: ${String(e.message).split('\n')[0]}`);
	}
	try {
		const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
		const long = 'A sentence that keeps going across the whole card without a break. '.repeat(4);
		await page.setContent(`<div class="surface"><div class="ripple-root" style="font: 14px sans-serif">
			<p style="font-size:10px">Tiny meta</p>
			<p style="font-size:12px">Chip size is fine</p>
			<span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">screen reader only</span>
			<span aria-hidden="true" style="font-size:9px">decor</span>
			<p style="width:1400px">${long}</p>
			<p style="max-inline-size:70ch">${long}</p>
		</div></div>`);
		const out = await page.evaluate(typeAudit);
		assert.equal(out.smallText.length, 1, out.smallText.join('\n'));
		assert.match(out.smallText[0], /10px "Tiny meta"/);
		assert.equal(out.wideMeasure.length, 1, out.wideMeasure.join('\n'));
		assert.equal(out.boxes.length, 2);
		assert.ok(out.boxes.every((b) => b.w > 0 && b.h > 0));
	} finally {
		await browser.close();
	}
});
