#!/usr/bin/env node
// render.mjs: renders one Ripple spec through a Ripple playground and audits it.
// Part of the Ripple skill (skills/ripple); run `node render.mjs --help`.
//
// It opens <base>/playground?s=<base64url spec> (the playground's share-link
// format), shoots ONLY the preview surface that holds the rendered
// `.ripple-root`, once per width x theme, and prints one JSON object of audit
// counts to stdout (also written to <outdir>/audit.json). Exit code: 0 when
// every count is 0, 1 when any is not, 2 on a usage or setup error (no
// Playwright, no Chromium, no server, bad spec), with the fix in the message.
//
// It is also a module: `renderer(spec, { base, widths, themes, outdir })`
// does the same shots and returns one RenderResult per width x theme (the
// shape `@ripple-ui/core/build` takes, with offender boxes), throwing on a
// setup error instead of exiting. build.mjs uses it. The CLI and renderer()
// share one code path.
//
// The page audit is not in this file: it is the site's own
// `<base>/page-audit.js` (built from packages/svelte/src/lib/build/page-audit.ts),
// fetched once per call and evaluated in each page, so the skill, the worker
// and the chat page run one audit. A site without that file is a setup error
// (exit 2): deploy the site before releasing a skill that needs it. axe-core
// stays here.
//
// Invariants: one browser per call and only paths under <outdir>, so several
// calls can run at once. It never starts a server. Theme is set the way a
// visitor's choice is (localStorage `ripple-theme`), so the whole page, not
// just the frame, is in it. Playwright (and axe-core, if present) resolve from
// the caller's project (the current directory), never from this machine's
// paths; the skill ships no dependencies of its own.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const DEFAULT_BASE = 'https://ripple-site.pawsites.workers.dev'; // ripple.pocketpaw.xyz once its DNS is live
const USAGE = `usage: node render.mjs <spec.json> <outdir> [options]

Renders a Ripple spec at each width and theme, writes <outdir>/<width>-<theme>.png
and <outdir>/audit.json, and prints the audit JSON.

options:
  --base <url>      Ripple site to render through (env RIPPLE_BASE)
                    default ${DEFAULT_BASE}
  --widths <list>   viewport widths, default 380,1024
  --themes <list>   light,dark (default both)
  --help            this text

needs: Playwright with Chromium in the current project
       npm i -D playwright && npx playwright install chromium
       optional: npm i -D axe-core (else axeViolations is null)
env:   RIPPLE_PLAYWRIGHT=<dir of the playwright package>, RIPPLE_AXE=<path to axe.min.js>,
       CHROME_PATH=<chromium binary>

exit:  0 clean, 1 faults found, 2 usage or setup error`;

/** A usage or setup problem: the CLI prints it and exits 2, renderer() throws it. */
export class SetupError extends Error {}
const fail = (msg) => {
	throw new SetupError(msg);
};

/** Checks the spec is one Ripple can render and packs it as a share link; throws SetupError. */
function pack(spec) {
	if (!spec || typeof spec !== 'object' || !('ui' in spec || 'intent' in spec)) fail('not a Ripple spec (needs "ui")');
	const packed = Buffer.from(JSON.stringify(spec), 'utf8').toString('base64url');
	if (packed.length > 64 * 1024) fail(`spec is ${packed.length} chars as base64url, over the playground's 64 KB link cap`);
	return packed;
}

// --- playwright and axe-core, from the caller's project ---------------------
const INSTALL = 'npm i -D playwright && npx playwright install chromium';
const fromCwd = () => createRequire(join(process.cwd(), 'package.json'));
function load(name, envDir) {
	const tries = [envDir && (() => createRequire(join(resolve(envDir), 'package.json'))('.')), () => fromCwd()(name)];
	for (const t of tries.filter(Boolean)) {
		try {
			return t();
		} catch {}
	}
	return null;
}
function loadChromium() {
	const pw = load('playwright', process.env.RIPPLE_PLAYWRIGHT);
	if (!pw?.chromium) fail(`Playwright not found from ${process.cwd()}. Install it in this project:\n  ${INSTALL}\nor set RIPPLE_PLAYWRIGHT to a playwright package dir.`);
	return pw.chromium;
}
function loadAxe() {
	for (const p of [process.env.RIPPLE_AXE, (() => { try { return fromCwd().resolve('axe-core/axe.min.js'); } catch { return null; } })()]) {
		if (!p) continue;
		try {
			return readFileSync(p, 'utf8');
		} catch {}
	}
	return null;
}
const AXE_HINT = 'axe-core is not installed: npm i -D axe-core (or set RIPPLE_AXE=/path/to/axe.min.js)';

// --- the server must already be up ----------------------------------------
async function checkServer(base) {
	let r;
	try {
		r = await fetch(`${base}/playground`, { signal: AbortSignal.timeout(5000) });
	} catch {
		fail(`nothing answered at ${base}/playground. Check your network, or for a local build serve it first (in a ripple checkout: cd packages/svelte && bun run build:site && bunx vite preview --port 4790) and pass --base http://localhost:4790`);
	}
	if (!r.ok) fail(`${base}/playground answered ${r.status}`);
}

/** The site's shared page audit (a script that sets globalThis.ripplePageAudit); throws SetupError without it. */
async function loadPageAudit(base) {
	let r;
	try {
		r = await fetch(`${base}/page-audit.js`, { signal: AbortSignal.timeout(5000) });
	} catch {}
	if (!r?.ok)
		fail(`${base}/page-audit.js is missing (${r ? r.status : 'no answer'}): this Ripple site predates the shared page audit. Deploy the ripple site first (in a ripple checkout: cd packages/svelte && bun run deploy:site), or for a local build run bun run build:site && bunx vite preview --port 4790 and pass --base http://localhost:4790`);
	return r.text();
}

/** Ripple node id -> JSON Pointer into the spec, for the nodes that carry an id. */
function nodePaths(spec) {
	const paths = new Map();
	const walk = (n, p) => {
		if (!n || typeof n !== 'object') return;
		if (typeof n.id === 'string') paths.set(n.id, p);
		if (Array.isArray(n.children)) n.children.forEach((c, i) => walk(c, `${p}/children/${i}`));
	};
	walk(spec?.ui, '/ui');
	return paths;
}

async function settle(page) {
	// Rendered = the root holds a visible box (primitive trees carry no data-widget), or the pane says why not.
	await page.waitForFunction(
		() =>
			document.querySelector('.pane .alert, .url-error') ||
			[...document.querySelectorAll('.surface .ripple-root *')].some((el) => el.getBoundingClientRect().height > 8),
		null,
		{ timeout: 15000 }
	);
	await page
		.waitForFunction(() => !document.querySelector('.surface [data-ripple-node-pending]'), null, { timeout: 8000 })
		.catch(() => {});
	await page.evaluate(async () => {
		await document.fonts.ready;
		await Promise.all([...document.querySelectorAll('.surface img')].map((i) => (i.complete ? null : i.decode().catch(() => null))));
		await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
	});
	await page.waitForTimeout(600); // charts and maps draw a beat after mount
}


async function launch(chromium) {
	try {
		return await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
	} catch (e) {
		if (/Executable doesn't exist/.test(String(e.message)))
			fail(`Playwright has no Chromium to launch. Run: npx playwright install chromium (or set CHROME_PATH)\n${String(e.message).split('\n')[0]}${chromiumBuilds(String(e.message))}`);
		throw e;
	}
}

/** Which Chromium builds sit beside the one Playwright wanted, so CHROME_PATH is one copy away. */
function chromiumBuilds(message) {
	const wanted = /at (\S+)/.exec(message)?.[1];
	const parts = wanted ? wanted.split(sep) : [];
	const i = parts.findIndex((p) => /^chromium(_headless_shell)?-\d+$/.test(p));
	if (i < 1) return '';
	const root = parts.slice(0, i).join(sep);
	let found = [];
	try {
		found = readdirSync(root).filter((d) => d.startsWith('chromium'));
	} catch {}
	const lines = [`\nwanted build: ${parts[i]} (this Playwright)`, `found in ${root}: ${found.join(', ') || 'none'}`];
	const hit = found.find((d) => d.startsWith(parts[i].replace(/-\d+$/, '-')) && d !== parts[i]);
	if (hit) lines.push(`try: CHROME_PATH=${join(root, hit, ...parts.slice(i + 1))}`);
	return lines.join('\n');
}

/**
 * The shared path: Playwright, server check, one browser, every width x theme.
 * Returns the raw per-shot audits plus the page-wide console errors, axe
 * results (null without axe-core) and the playground's spec status line.
 */
async function run(packed, { base, widths, themes, outdir }) {
	const chromium = loadChromium();
	const axeSource = loadAxe();
	await checkServer(base);
	const auditSource = await loadPageAudit(base);
	mkdirSync(outdir, { recursive: true });
	const url = `${base}/playground?s=${packed}`;
	const browser = await launch(chromium);
	const shots = [];
	const boxes = []; // per shot, beside `shots` so audit.json keeps its shape
	const consoleErrors = [];
	let axeResult = axeSource ? [] : null;
	let status = null;
	try {
		for (const theme of themes) {
			for (const width of widths) {
				const ctx = await browser.newContext({
					viewport: { width, height: 900 },
					deviceScaleFactor: 2,
					colorScheme: theme === 'dark' ? 'dark' : 'light',
					reducedMotion: 'reduce'
				});
				await ctx.addInitScript((t) => {
					try {
						localStorage.setItem('ripple-theme', t);
					} catch {}
				}, theme);
				const page = await ctx.newPage();
				const tag = `${width}-${theme}`;
				page.on('console', (m) => m.type() === 'error' && consoleErrors.push(`[${tag}] ${m.text().slice(0, 300)}`));
				page.on('pageerror', (e) => consoleErrors.push(`[${tag}] pageerror: ${String(e.message ?? e).slice(0, 300)}`));
				await page.goto(url, { waitUntil: 'networkidle' });
				// Let the card be as tall as it is: the preview stage is a scroll container.
				await page.addStyleTag({
					content: `.pg,.work,.preview,.pane,.stage,.chat-col,.inline-preview{height:auto!important;max-height:none!important;overflow:visible!important}`
				});
				let rendered = true;
				try {
					await settle(page);
				} catch {
					rendered = false;
				}
				const themeOk = await page.evaluate((t) => document.documentElement.classList.contains('dark') === (t === 'dark'), theme);
				await page.evaluate(auditSource);
				const res = await page.evaluate(() => {
					const s = [...document.querySelectorAll('.surface')].find((x) => x.querySelector('.ripple-root'));
					return s ? globalThis.ripplePageAudit(s, { documentErrors: '.pane .alert, .url-error' }) : null;
				});
				const a = { surfaceWidth: res?.width ?? 0, surfaceHeight: res?.height ?? 0 };
				for (const k of LISTS) a[k] = res?.items[k] ?? [];
				boxes.push(res?.boxes ?? []);
				status ??= await page.evaluate(() => {
					const s = document.querySelector('.surface .ripple-root')?.closest('.pane')?.querySelector('.strip .state');
					return s ? s.textContent.replace(/\s+/g, ' ').trim() : null;
				});
				const file = join(outdir, `${tag}.png`);
				const surface = page.locator('.surface:has(.ripple-root)');
				const n = await surface.count();
				if (n >= 1) await surface.first().screenshot({ path: file, animations: 'disabled' });
				if (axeSource && n >= 1) {
					await page.addScriptTag({ content: axeSource });
					const v = await page.evaluate(async () => {
						const res = await window.axe.run(document.querySelector('.surface .ripple-root'), { resultTypes: ['violations'] });
						return res.violations.map((x) => `${x.id} (${x.impact}) x${x.nodes.length}`);
					});
					axeResult.push(...v.map((x) => `[${tag}] ${x}`));
				}
				shots.push({ file: n >= 1 ? file : null, width, theme, rendered, themeApplied: themeOk, surfaces: n, ...a });
				await ctx.close();
			}
		}
	} finally {
		await browser.close();
	}
	return { shots, boxes, consoleErrors, axeResult, axeSource, status };
}

const DEFAULTS = { widths: [380, 1024], themes: ['light', 'dark'] };
const LISTS = ['errorBoxes', 'overflow', 'clippedText', 'emptyContainers', 'badText'];

/**
 * Renders `spec` at each width x theme into `outdir` (PNG per shot, no
 * audit.json) and returns one RenderResult per shot: `{ width, theme, png,
 * audit, boxes }`, where `audit` is one `{ check, count, items }` report per
 * audit count (axe only when axe-core is present), and `boxes` is one
 * `{ check, path?, x, y, w, h }` per page-audit item: CSS px from the shot's
 * top left (the PNG is at device scale 2), `path` a JSON Pointer to the node
 * when the node has an id.
 * Throws SetupError on a usage or setup problem.
 */
export async function renderer(spec, { base = process.env.RIPPLE_BASE || DEFAULT_BASE, widths = DEFAULTS.widths, themes = DEFAULTS.themes, outdir } = {}) {
	if (!outdir) fail('renderer() needs an outdir');
	const out = await run(pack(spec), { base: base.replace(/\/$/, ''), widths, themes, outdir: resolve(outdir) });
	const paths = nodePaths(spec);
	return out.shots.map((s, i) => {
		const tag = `${s.width}-${s.theme}`;
		const report = (check, messages) => ({
			check,
			count: messages.length,
			items: messages.map((message) => ({ code: check, path: '', message }))
		});
		const mine = (list) => list.filter((x) => x.startsWith(`[${tag}] `)).map((x) => x.slice(tag.length + 3));
		const audit = [
			report('notRendered', !s.rendered || !s.surfaces ? ['the card did not render (no visible surface, or the pane showed an error)'] : []),
			report('themeNotApplied', s.themeApplied ? [] : [`the ${s.theme} theme was not applied to the page`]),
			...LISTS.map((k) => report(k, s[k])),
			report('consoleErrors', mine(out.consoleErrors))
		];
		if (out.axeResult) audit.push(report('axeViolations', mine(out.axeResult)));
		const boxes = out.boxes[i].map(({ node, ...b }) => (paths.has(node) ? { ...b, path: paths.get(node) } : b));
		return { width: s.width, theme: s.theme, png: s.file, audit, boxes };
	});
}

// --- the CLI ----------------------------------------------------------------
async function main() {
	const args = process.argv.slice(2);
	if (args.includes('--help') || args.includes('-h')) {
		console.log(USAGE);
		process.exit(0);
	}
	const flag = (name, dflt) => {
		const i = args.indexOf(`--${name}`);
		if (i < 0) return dflt;
		const v = args[i + 1];
		args.splice(i, 2);
		return v;
	};
	const base = flag('base', process.env.RIPPLE_BASE || DEFAULT_BASE).replace(/\/$/, '');
	const widths = flag('widths', '380,1024').split(',').map(Number);
	const themes = flag('themes', 'light,dark').split(',');
	const [specPath, outArg] = args;
	const die = (msg) => {
		console.error(`render.mjs: ${msg}`);
		process.exit(2);
	};
	if (!specPath || !outArg) die(`missing arguments\n\n${USAGE}`);
	if (widths.some((w) => !Number.isFinite(w) || w < 200)) die('--widths takes numbers like 380,1024');

	let spec;
	try {
		spec = JSON.parse(readFileSync(specPath, 'utf8'));
	} catch (e) {
		die(`cannot read ${specPath} as JSON: ${e.message}`);
	}
	// A gallery recording ({chunks:[{text}]}) is accepted too: its spec is the joined text.
	if (Array.isArray(spec?.chunks)) spec = JSON.parse(spec.chunks.map((c) => c.text).join(''));

	const outdir = resolve(outArg);
	let packed, out;
	try {
		packed = pack(spec);
		out = await run(packed, { base, widths, themes, outdir });
	} catch (e) {
		if (e instanceof SetupError) die(e.message);
		throw e;
	}
	const { shots, consoleErrors, axeResult, axeSource, status } = out;

	const sum = (k) => shots.reduce((s, x) => s + (Array.isArray(x[k]) ? x[k].length : 0), 0);
	const counts = {
		notRendered: shots.filter((s) => !s.rendered || !s.surfaces).length,
		themeNotApplied: shots.filter((s) => !s.themeApplied).length,
		errorBoxes: sum('errorBoxes'),
		consoleErrors: consoleErrors.length,
		overflow: sum('overflow'),
		clippedText: sum('clippedText'),
		emptyContainers: sum('emptyContainers'),
		badText: sum('badText'),
		axeViolations: Array.isArray(axeResult) ? axeResult.length : null
	};
	const clean = Object.values(counts).every((v) => v === 0 || v === null);
	const report = {
		spec: resolve(specPath),
		base,
		url: `${base}/playground?s=…(${packed.length} chars)`,
		specStatus: status,
		clean,
		counts,
		consoleErrors,
		axe: axeResult,
		axeHint: axeSource ? null : AXE_HINT,
		shots
	};
	writeFileSync(join(outdir, 'audit.json'), JSON.stringify(report, null, 2));
	console.log(JSON.stringify(report, null, 2));
	process.exit(clean ? 0 : 1);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (isMain) await main();
