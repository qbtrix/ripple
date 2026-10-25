// examples/smoke.mjs: drives the built embed in a real Chromium and prints what
// a host would see. Run `bun run build` first (and `bun run build` in
// examples/react for the React page), then from the repo root:
//   node examples/smoke.mjs [outDir]        (CHROMIUM=/path/to/chrome to override)
// It serves the repo root on a free port and, for the plain HTML page:
// - measures each spec's first load (gzip of the JS/CSS fetched from dist/),
// - hovers a tooltip and opens, picks from and dismisses a dropdown inside the
//   shadow root, checking the pick reached onEvent,
// - checks a Workflow diagram gets xyflow's CSS and layout inside the shadow root,
// - checks `dark:` follows the theme option, not the OS (page forced to dark
//   OS scheme, light theme),
// - screenshots every page in light and dark to outDir (default ./smoke-out).
// Exits non-zero on the first failed check.
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(process.argv[2] ?? join(ROOT, 'smoke-out'));
mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

const server = createServer((req, res) => {
	let path = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
	if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
	if (!path.startsWith(ROOT) || !existsSync(path)) return res.writeHead(404).end();
	res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(readFileSync(path));
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const failures = [];
const check = (ok, what) => {
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
	if (!ok) failures.push(what);
};

async function open(path, { colorScheme = 'light', width = 820 } = {}) {
	const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme });
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	await page.goto(base + path);
	await page.waitForSelector('html[data-ready]', { timeout: 60_000 });
	await page.waitForLoadState('networkidle');
	await page.waitForTimeout(800);
	return { page, errors };
}

async function firstLoad(page) {
	const urls = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name));
	let gz = 0, fonts = 0;
	for (const u of urls) {
		const p = decodeURIComponent(new URL(u).pathname);
		if (!p.includes('/dist/')) continue;
		const buf = readFileSync(join(ROOT, p));
		if (p.endsWith('.woff2')) fonts += buf.length;
		else gz += gzipSync(buf).length;
	}
	return `${Math.round(gz / 1024)} KB gzip JS+CSS, ${Math.round(fonts / 1024)} KB fonts`;
}

// 1. First-load size per spec, each on a fresh page.
for (const only of ['simple', 'attention', 'overlays', 'workflow']) {
	const { page, errors } = await open(`/examples/html/?only=${only}`);
	console.log(`size ${only}: ${await firstLoad(page)}`);
	check(errors.length === 0, `${only} renders without page errors ${errors.join(' | ')}`);
	await page.close();
}

// 2. Overlays inside the shadow root.
{
	const { page } = await open('/examples/html/?only=overlays');
	const host = page.locator('#overlays');
	await host.getByText('Hover me').hover();
	const tip = host.getByText('Tooltip from inside the shadow root.');
	await tip.waitFor({ timeout: 5000 }).catch(() => {});
	check(await tip.isVisible(), 'tooltip opens on hover, rendered inside the shadow root');
	const tipBg = await tip.evaluate((el) => getComputedStyle(el.closest('[data-tooltip-content],[role=tooltip]') ?? el).backgroundColor).catch(() => '');
	check(tipBg && tipBg !== 'rgba(0, 0, 0, 0)', `tooltip is styled (background ${tipBg})`);
	await page.mouse.move(0, 0);

	await host.getByRole('button', { name: 'Actions' }).click();
	const item = host.getByRole('menuitem', { name: 'Edit' });
	await item.waitFor({ timeout: 5000 }).catch(() => {});
	check(await item.isVisible(), 'dropdown opens with its items inside the shadow root');
	await item.click();
	await page.waitForTimeout(300);
	check(!(await item.isVisible()), 'dropdown closes after a pick');
	const events = await page.evaluate(() => window.rippleEvents);
	check(events.some((e) => e.type === 'emit' && JSON.stringify(e).includes('edit')), `the pick reached onEvent (${JSON.stringify(events)})`);

	await host.getByRole('button', { name: 'Actions' }).click();
	await item.waitFor({ timeout: 5000 }).catch(() => {});
	await page.waitForTimeout(300); // bits-ui ignores a dismiss in the same moment it opened
	await page.mouse.click(5, 880);
	await page.waitForTimeout(300);
	check(!(await item.isVisible()), 'dropdown closes on an outside click');
	await page.close();
}

// 3. Workflow: xyflow's own stylesheet (a side-effect CSS import) reached the
// shadow root, and xyflow laid its nodes out there.
{
	const { page } = await open('/examples/html/?only=workflow');
	await page.waitForTimeout(1500);
	const flow = await page.evaluate(() => {
		const root = document.getElementById('workflow').shadowRoot;
		const nodes = [...root.querySelectorAll('.svelte-flow__node')];
		const xs = new Set(nodes.map((n) => Math.round(n.getBoundingClientRect().x)));
		return { count: nodes.length, position: nodes[0] && getComputedStyle(nodes[0]).position, spread: xs.size };
	});
	check(flow.count === 4, `workflow renders its 4 nodes (${flow.count})`);
	check(flow.position === 'absolute', `xyflow CSS applies in the shadow root (node position: ${flow.position})`);
	check(flow.spread > 1, `xyflow laid the nodes out (${flow.spread} distinct x positions)`);
	await page.close();
}

// 4. dark: follows the theme option. The OS says dark, the card says light.
{
	const probe = async (path, colorScheme) => {
		const { page } = await open(path, { colorScheme });
		const v = await page.evaluate(() => {
			const root = document.getElementById('overlays').shadowRoot;
			const el = [...root.querySelectorAll('[class*="dark:"]')][0];
			return el ? `${el.className.match(/dark:\S+/)?.[0]} -> ${getComputedStyle(el).color}/${getComputedStyle(el).backgroundColor}` : 'none';
		});
		await page.close();
		return v;
	};
	const lightOnDarkOs = await probe('/examples/html/?only=overlays', 'dark');
	const lightOnLightOs = await probe('/examples/html/?only=overlays', 'light');
	const darkOnLightOs = await probe('/examples/html/?only=overlays&theme=dark', 'light');
	check(lightOnDarkOs === lightOnLightOs, `light theme ignores a dark OS (${lightOnDarkOs})`);
	check(darkOnLightOs !== lightOnLightOs, `dark theme turns dark: on (${darkOnLightOs})`);
}

// 5. Screenshots, light and dark.
const pages = [['html', '/examples/html/']];
if (existsSync(join(ROOT, 'examples/react/dist/index.html'))) pages.push(['react', '/examples/react/dist/']);
for (const [name, path] of pages) {
	for (const theme of ['light', 'dark']) {
		const { page, errors } = await open(`${path}?theme=${theme}`, { colorScheme: theme });
		check(errors.length === 0, `${name} ${theme} renders without page errors ${errors.join(' | ')}`);
		const file = join(OUT, `embed-${name}-${theme}.png`);
		await page.screenshot({ path: file, fullPage: true });
		console.log(`shot ${file}`);
		await page.close();
	}
}

await browser.close();
server.close();
if (failures.length) {
	console.error(`${failures.length} check(s) failed`);
	process.exit(1);
}
