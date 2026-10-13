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
// Invariants: one browser per call and only paths under <outdir>, so several
// calls can run at once. It never starts a server. Theme is set the way a
// visitor's choice is (localStorage `ripple-theme`), so the whole page, not
// just the frame, is in it. Playwright (and axe-core, if present) resolve from
// the caller's project (the current directory), never from this machine's
// paths; the skill ships no dependencies of its own.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { createRequire } from 'node:module';

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

// --- the spec -------------------------------------------------------------
let spec;
try {
	spec = JSON.parse(readFileSync(specPath, 'utf8'));
} catch (e) {
	die(`cannot read ${specPath} as JSON: ${e.message}`);
}
// A gallery recording ({chunks:[{text}]}) is accepted too: its spec is the joined text.
if (Array.isArray(spec?.chunks)) spec = JSON.parse(spec.chunks.map((c) => c.text).join(''));
if (!spec || typeof spec !== 'object' || !('ui' in spec || 'intent' in spec)) die('not a Ripple spec (needs "ui")');
const packed = Buffer.from(JSON.stringify(spec), 'utf8').toString('base64url');
if (packed.length > 64 * 1024) die(`spec is ${packed.length} chars as base64url, over the playground's 64 KB link cap`);

// --- playwright and axe-core, from the caller's project ---------------------
const INSTALL = 'npm i -D playwright && npx playwright install chromium';
const fromCwd = createRequire(join(process.cwd(), 'package.json'));
function load(name, envDir) {
	const tries = [envDir && (() => createRequire(join(resolve(envDir), 'package.json'))('.')), () => fromCwd(name)];
	for (const t of tries.filter(Boolean)) {
		try {
			return t();
		} catch {}
	}
	return null;
}
const pw = load('playwright', process.env.RIPPLE_PLAYWRIGHT);
if (!pw?.chromium) die(`Playwright not found from ${process.cwd()}. Install it in this project:\n  ${INSTALL}\nor set RIPPLE_PLAYWRIGHT to a playwright package dir.`);
const { chromium } = pw;

let axeSource = null;
for (const p of [process.env.RIPPLE_AXE, (() => { try { return fromCwd.resolve('axe-core/axe.min.js'); } catch { return null; } })()]) {
	if (!p) continue;
	try {
		axeSource = readFileSync(p, 'utf8');
		break;
	} catch {}
}
const AXE_HINT = 'axe-core is not installed: npm i -D axe-core (or set RIPPLE_AXE=/path/to/axe.min.js)';

// --- the server must already be up ----------------------------------------
try {
	const r = await fetch(`${base}/playground`, { signal: AbortSignal.timeout(5000) });
	if (!r.ok) die(`${base}/playground answered ${r.status}`);
} catch {
	die(`nothing answered at ${base}/playground. Check your network, or for a local build serve it first (in a ripple checkout: cd packages/svelte && bun run build:site && bunx vite preview --port 4790) and pass --base http://localhost:4790`);
}

const outdir = resolve(outArg);
mkdirSync(outdir, { recursive: true });
const url = `${base}/playground?s=${packed}`;

// Runs in the page: the counts for one render. `root` is the shot surface.
function auditInPage() {
	const surface = [...document.querySelectorAll('.surface')].find((s) => s.querySelector('.ripple-root'));
	const out = { surfaceWidth: 0, surfaceHeight: 0, errorBoxes: [], overflow: [], clippedText: [], emptyContainers: [], badText: [] };
	if (!surface) return out;
	const root = surface.querySelector('.ripple-root');
	const r = surface.getBoundingClientRect();
	out.surfaceWidth = Math.round(r.width);
	out.surfaceHeight = Math.round(r.height);
	const where = (el) => {
		const node = el.closest('[data-ripple-node]')?.getAttribute('data-ripple-node');
		const w = el.closest('[data-widget]')?.getAttribute('data-widget');
		const cls = typeof el.className === 'string' ? el.className.split(/\s+/).slice(0, 2).join('.') : '';
		return [w && `widget=${w}`, node && `node=${node}`, `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`].filter(Boolean).join(' ');
	};
	const visible = (el) => {
		const s = getComputedStyle(el);
		if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
		const b = el.getBoundingClientRect();
		return b.width > 0 && b.height > 0;
	};
	const text = (el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 50);

	// Render errors: the node boundary, an unknown type, the pane's own alerts.
	for (const el of document.querySelectorAll('[data-ripple-node-error], [data-ripple-unknown-widget], .pane .alert, .url-error'))
		out.errorBoxes.push(`${where(el)}: ${text(el)}`);

	// Drawing internals (paths, groups inside an svg) are not layout boxes; the svg itself is.
	const all = [...root.querySelectorAll('*')].filter((el) => !el.parentElement?.closest('svg') && visible(el));
	const clips = (el) => ['hidden', 'clip', 'auto', 'scroll'].includes(getComputedStyle(el).overflowX);
	const clippedByAncestor = (el) => {
		for (let p = el.parentElement; p && p !== surface; p = p.parentElement) if (clips(p)) return true;
		return false;
	};

	// Horizontal overflow: the surface or a box inside it scrolls sideways, or an
	// unclipped element pokes past the surface edge (outermost offender only).
	if (surface.scrollWidth > surface.clientWidth + 1) out.overflow.push(`surface scrollWidth ${surface.scrollWidth} > ${surface.clientWidth}`);
	for (const el of all) {
		const s = getComputedStyle(el);
		if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1)
			out.overflow.push(`${where(el)} scrolls sideways ${el.scrollWidth} > ${el.clientWidth}`);
		const b = el.getBoundingClientRect();
		if ((b.right > r.right + 1 || b.left < r.left - 1) && !clippedByAncestor(el)) {
			const p = el.parentElement?.getBoundingClientRect();
			if (p && (p.right > r.right + 1 || p.left < r.left - 1)) continue;
			out.overflow.push(`${where(el)} spans ${Math.round(b.left - r.left)}..${Math.round(b.right - r.left)} of ${Math.round(r.width)}`);
		}
	}

	// Clipped text: an element's own text runs past its box and the box cuts it
	// (overflow hidden/clip, ellipsis, a line clamp). overflow:hidden does not
	// excuse it: the reader still loses the words. Measured on the text itself
	// (a Range), so positioned children do not count.
	for (const el of all) {
		const nodes = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
		if (!nodes.length || el.closest('svg, canvas, [aria-hidden="true"]')) continue;
		const s = getComputedStyle(el);
		// Visually hidden screen-reader text (sr-only: 1px box, clipped) is meant to be clipped.
		if (el.clientWidth <= 2 || el.clientHeight <= 2 || (s.clip && s.clip !== 'auto') || s.clipPath.startsWith('inset(50%')) continue;
		const cutsX = s.overflowX !== 'visible' || s.textOverflow === 'ellipsis';
		const cutsY = s.overflowY !== 'visible' || s.webkitLineClamp !== 'none';
		if (!cutsX && !cutsY) continue;
		const box = el.getBoundingClientRect();
		let wide = 0, tall = 0;
		for (const n of nodes) {
			const range = document.createRange();
			range.selectNodeContents(n);
			const t = range.getBoundingClientRect();
			wide = Math.max(wide, t.right - box.right, box.left - t.left);
			tall = Math.max(tall, t.bottom - box.bottom);
		}
		// A clipped single line still lays out at full width inside its box, so scrollWidth tells it.
		if (cutsX && s.whiteSpace.includes('nowrap')) wide = Math.max(wide, el.scrollWidth - el.clientWidth);
		if (s.webkitLineClamp !== 'none') tall = Math.max(tall, el.scrollHeight - el.clientHeight);
		if ((cutsX && wide > 1) || (cutsY && tall > 2))
			out.clippedText.push(`${where(el)} "${text(el)}" (${wide > 1 ? `${Math.round(wide)}px cut sideways` : `${Math.round(tall)}px cut below`})`);
	}

	// Inputs hold their words in a value, not a text node: a value wider than its
	// box is cut the same way (a 20-character name in a narrow name field).
	for (const el of root.querySelectorAll('input, textarea')) {
		if (!visible(el) || !el.value || ['checkbox', 'radio', 'range', 'color', 'hidden', 'file'].includes(el.type)) continue;
		const cut = el.scrollWidth - el.clientWidth;
		if (cut > 1) out.clippedText.push(`${where(el)} value "${el.value.slice(0, 40)}" (${Math.round(cut)}px cut sideways)`);
	}

	// Chart and drawing labels: svg text cut by its own svg's edge (a last axis tick "14:2").
	for (const t of root.querySelectorAll('svg text')) {
		const svg = t.ownerSVGElement;
		if (!svg || !visible(svg) || !(t.textContent ?? '').trim()) continue;
		const sb = svg.getBoundingClientRect();
		const tb = t.getBoundingClientRect();
		if (tb.width === 0) continue;
		const cut = Math.max(tb.right - sb.right, sb.left - tb.left, tb.bottom - sb.bottom, sb.top - tb.top);
		if (cut > 1 && getComputedStyle(svg).overflow !== 'visible')
			out.clippedText.push(`${where(svg)} svg text "${t.textContent.trim().slice(0, 30)}" (${Math.round(cut)}px past the svg edge)`);
	}

	// Empty containers: a visible in-flow box of real size with no text, no media, no control, no drawing.
	const MEDIA = 'img, svg, canvas, video, iframe, input, textarea, select, button, [role="img"], [role="slider"], [role="progressbar"], [role="separator"], hr';
	for (const el of all) {
		const b = el.getBoundingClientRect();
		if (b.width < 40 || b.height < 40) continue;
		if (el.matches(MEDIA) || el.querySelector(MEDIA)) continue;
		if ((el.textContent ?? '').trim()) continue;
		const s = getComputedStyle(el);
		if (s.backgroundImage !== 'none') continue;
		// Decoration (rings, glows, overlays) is positioned or hidden from assistive tech.
		if (s.position === 'absolute' || s.position === 'fixed' || el.closest('[aria-hidden="true"]')) continue;
		if (el.parentElement && !el.parentElement.textContent.trim() && el.parentElement !== root && root.contains(el.parentElement)) {
			const pb = el.parentElement.getBoundingClientRect();
			if (pb.width >= 40 && pb.height >= 40) continue; // report the outermost only
		}
		out.emptyContainers.push(`${where(el)} ${Math.round(b.width)}x${Math.round(b.height)}`);
	}

	// Leaked values in visible text.
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const BAD = /\bNaN\b|\bundefined\b|\[object Object\]|\bnull\b|\{state\.|Infinity/;
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		const el = n.parentElement;
		if (!el || !visible(el) || !BAD.test(n.textContent)) continue;
		out.badText.push(`${where(el)} "${n.textContent.trim().slice(0, 60)}"`);
	}
	// Text that looks like a JSON object or array printed raw (F2).
	for (const el of all) {
		const t = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
		if (/^[{[]\s*"[^"]+"\s*:/.test(t)) out.badText.push(`${where(el)} raw JSON "${t.slice(0, 60)}"`);
	}
	return out;
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

async function launch() {
	try {
		return await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
	} catch (e) {
		if (/Executable doesn't exist/.test(String(e.message)))
			die(`Playwright has no Chromium to launch. Run: npx playwright install chromium (or set CHROME_PATH)\n${String(e.message).split('\n')[0]}${chromiumBuilds(String(e.message))}`);
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
const browser = await launch();
const shots = [];
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
			const a = await page.evaluate(auditInPage);
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
