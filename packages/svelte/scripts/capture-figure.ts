// scripts/capture-figure.ts: the 4x review sheet for one curated figure. Renders
// the figure's own standalone SVG (no site build, no server) in headless
// Chromium in light and dark, shoots the whole figure at 2x and each junction the
// figure names in `review.points()` at 4x, then lays every shot out on one page
// and saves it as review/<id>/contact-sheet.png. The sheet is the baseline a
// reviewer reads in a fixed order (line ends, tone steps, overlaps, empty
// corners) and the one the captain signs off; it lives outside src/lib so it
// never ships in the npm package.
//
// Run: bun run review:figure bike-gears
// Browser: Playwright's own Chromium (`bunx playwright install chromium` once);
// without it, the installed Google Chrome. A figure module must export `review`.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from '@playwright/test';

/** Crop size in CSS px of the 1x figure; at 4x DPR it comes out four times larger. */
const CROP = { w: 90, h: 66 };
const PAD = 48;

interface Review {
	svg(theme: 'light' | 'dark'): string;
	points(): Array<{ id: string; label: string; x: number; y: number }>;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cell = (src: string, label: string) => `<figure><img src="data:image/png;base64,${src}"><figcaption>${label}</figcaption></figure>`;

export async function captureFigure(id: string, browser: Browser) {
	const { review } = (await import(join(root, 'src/lib/figures', id, 'figure.ts'))) as { review?: Review };
	if (!review) throw new Error(`figures/${id}/figure.ts exports no \`review\``);
	const points = review.points();
	const shots: Array<{ theme: string; full: string; crops: Array<{ label: string; png: string }> }> = [];
	for (const theme of ['light', 'dark'] as const) {
		const svg = review.svg(theme);
		const [, , w = 0, h = 0] = svg.match(/viewBox="([^"]*)"/)?.[1]?.split(' ').map(Number) ?? [];
		const html = `<body style="margin:0;background:#777"><div style="padding:${PAD}px;display:inline-block">${svg.replace('<svg', `<svg style="display:block;width:${w}px;height:${h}px;background:var(--iso-paper)"`)}</div></body>`;
		const shoot = async (scale: number) => {
			const page = await browser.newPage({ viewport: { width: Math.ceil(w + 2 * PAD), height: Math.ceil(h + 2 * PAD) }, deviceScaleFactor: scale, reducedMotion: 'reduce' });
			await page.setContent(html);
			return page;
		};
		const page2 = await shoot(2);
		// Clip to whole CSS px inside the SVG, so a fractional width never shows a sliver of page.
		const full = (await page2.screenshot({ clip: { x: PAD, y: PAD, width: Math.floor(w), height: Math.floor(h) } })).toString('base64');
		await page2.close();
		const page4 = await shoot(4);
		const crops = [];
		for (const p of points) {
			const x = PAD + (p.x / 100) * w;
			const y = PAD + (p.y / 100) * h;
			const png = await page4.screenshot({ clip: { x: x - CROP.w / 2, y: y - CROP.h / 2, width: CROP.w, height: CROP.h } });
			crops.push({ label: p.label, png: png.toString('base64') });
		}
		await page4.close();
		shots.push({ theme, full, crops });
	}
	const sheet = `<style>body{margin:0;background:#fff;font:14px system-ui;color:#111}main{display:inline-flex;gap:32px;padding:24px}section{width:max-content}h2{margin:0 0 8px;font-size:16px}figure{margin:0}img{display:block}figcaption{margin:4px 0 12px;color:#555}.crops{display:grid;grid-template-columns:repeat(3,max-content);gap:0 12px}</style>
<main>${shots.map((s) => `<section><h2>${id}, ${s.theme}</h2>${cell(s.full, 'whole figure, 2x')}<div class="crops">${s.crops.map((c) => cell(c.png, `${c.label}, 4x`)).join('')}</div></section>`).join('')}</main>`;
	const page = await browser.newPage({ viewport: { width: 2600, height: 1000 }, deviceScaleFactor: 1 });
	await page.setContent(sheet);
	const png = await page.locator('main').screenshot();
	await page.close();
	const out = join(root, 'review', id, 'contact-sheet.png');
	await mkdir(dirname(out), { recursive: true });
	await writeFile(out, png);
	return { out, bytes: png.length, shots: 2 * (1 + points.length) };
}

if (import.meta.main) {
	const id = process.argv[2];
	if (!id) throw new Error('usage: bun run review:figure <figure-id>');
	const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
	try {
		const { out, bytes, shots } = await captureFigure(id, browser);
		console.log(`${shots} shots -> ${out} (${(bytes / 1024).toFixed(0)} KB)`);
	} finally {
		await browser.close();
	}
}
