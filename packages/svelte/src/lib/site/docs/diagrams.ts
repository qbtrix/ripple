// site/docs/diagrams.ts — Draws the docs' ```mermaid figures in the browser.
// markdown.ts ships each one as <figure class="diagram"> holding the source in
// a <pre>; attachDiagrams swaps that for an SVG when the figure nears the
// viewport. mermaid is a dynamic import, so its chunk is fetched only by a
// page that has a diagram, and only once one is about to be seen.
// - Loading, theming and the render queue live in $lib/utils/mermaid.ts
//   (shared with the markdown widget); this file supplies the site palette
//   (--site-*, --primary, --code-bg, --font-sans) over --site-ground.
// - Toggling the html `dark` class redraws every drawn figure from the source
//   kept here. securityLevel 'strict'. A diagram that fails to render
//   keeps its source on screen; diagrams.test.ts parses every fence so that cannot ship.
// - Size: the SVG shrinks to fit its column. On phones the page CSS stops it
//   at --diagram-min (70% of its natural width, set here) and the canvas
//   scrolls sideways instead of the page.

import { mermaidConfig, renderMermaid, resolveColors } from '$lib/utils/mermaid.js';

const isDark = () => document.documentElement.classList.contains('dark');

function siteConfig() {
	const c = resolveColors(
		{
			ground: 'var(--site-ground)',
			ink: 'var(--site-ink)',
			soft: 'var(--site-soft)',
			border: 'color-mix(in oklch, var(--site-ink-base) 24%, transparent)',
			card: 'var(--site-card)',
			panel: 'var(--site-panel)',
			inset: 'var(--code-bg)',
			primary: 'var(--primary)',
			tint: 'color-mix(in oklch, var(--primary) 14%, transparent)',
			onPrimary: 'var(--site-on-primary)'
		},
		document.body,
		'var(--site-ground)'
	);
	if (!c) throw new Error('no 2D canvas to resolve diagram colours');
	const font = getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim() || 'sans-serif';
	return mermaidConfig(c, font);
}

async function draw(canvas: HTMLElement, source: string, alive: () => boolean) {
	const svg = await renderMermaid(source, siteConfig());
	if (!alive()) return;
	canvas.innerHTML = svg;
	const el = canvas.querySelector('svg');
	const natural = el?.viewBox.baseVal?.width;
	if (el && natural) el.style.setProperty('--diagram-min', `${Math.round(natural * 0.7)}px`);
	canvas.dataset.drawn = '';
}

/** Draw every diagram figure under `root` as it nears the viewport. Returns the cleanup. */
export function attachDiagrams(root: HTMLElement): () => void {
	const canvases = [...root.querySelectorAll<HTMLElement>('figure.diagram .diagram-canvas')];
	if (!canvases.length) return () => {};
	const sources = new Map(canvases.map((c) => [c, c.querySelector('code')?.textContent ?? '']));
	const drawn = new Set<HTMLElement>();
	let alive = true;
	const redraw = (canvas: HTMLElement) =>
		draw(canvas, sources.get(canvas)!, () => alive).catch((e: unknown) => console.warn('diagram failed to render', e));

	const io = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				const canvas = entry.target;
				if (!entry.isIntersecting || !(canvas instanceof HTMLElement)) continue;
				io.unobserve(canvas);
				drawn.add(canvas);
				void redraw(canvas);
			}
		},
		{ rootMargin: '400px 0px' }
	);
	for (const c of canvases) io.observe(c);

	let dark = isDark();
	const mo = new MutationObserver(() => {
		if (isDark() === dark) return;
		dark = isDark();
		for (const c of drawn) void redraw(c);
	});
	mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

	return () => {
		alive = false;
		io.disconnect();
		mo.disconnect();
	};
}
