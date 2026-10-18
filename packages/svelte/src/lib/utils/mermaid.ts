// utils/mermaid.ts — Draws mermaid source as SVG for the docs site
// (site/docs/diagrams.ts) and the markdown widget. Browser only: call it from
// an effect or an attachment, never at module top level.
// - mermaid is a dynamic import, fetched the first time anything renders, so a
//   bundle (or a chat card) with no diagram never loads it.
// - mermaidConfig maps a palette of opaque hex colours onto mermaid's 'base'
//   theme in the neo look: rounded nodes with brand (palette.primary) strokes
//   on a soft card fill, curved (basis) flowchart edges in the soft ink.
//   Callers resolve their own tokens with resolveColors: mermaid's colour maths
//   cannot parse oklch or color-mix, so each token is painted over the ground
//   on a 1px canvas and read back as #rrggbb.
// - mermaid.initialize is global, and the site and a widget can draw on one
//   page with different palettes, so every render goes through one promise
//   chain and re-initializes only when the config changed. securityLevel is
//   always 'strict'.

type Mermaid = (typeof import('mermaid'))['default'];
export type MermaidConfig = ReturnType<typeof mermaidConfig>;
export type Palette = Record<
	'ground' | 'ink' | 'soft' | 'border' | 'card' | 'panel' | 'inset' | 'primary' | 'tint' | 'onPrimary',
	string
>;

let loading: Promise<Mermaid> | undefined;
let queue: Promise<unknown> = Promise.resolve();
let initialized = '';
let seq = 0;

/**
 * CSS colours (any syntax, var() resolved at `scope`) to opaque #rrggbb, each
 * painted over `ground` (itself over the page background). Null without a 2D canvas.
 */
export function resolveColors<K extends string>(
	css: Record<K, string>,
	scope: HTMLElement = document.body,
	ground = 'var(--background, Canvas)'
): Record<K, string> | null {
	const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
	if (!ctx) return null;
	const probe = document.createElement('span');
	probe.style.display = 'none';
	scope.append(probe);
	const computed = (value: string) => {
		probe.style.color = '';
		probe.style.color = value;
		return getComputedStyle(probe).color;
	};
	const layers = [computed('var(--background, Canvas)'), computed(ground)];
	const out = {} as Record<K, string>;
	for (const key of Object.keys(css) as K[]) {
		for (const fill of [...layers, computed(css[key])]) {
			ctx.fillStyle = fill;
			ctx.fillRect(0, 0, 1, 1);
		}
		const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
		out[key] = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
	}
	probe.remove();
	return out;
}

/** True when a #rrggbb colour is dark (relative luminance under 0.4). */
export function isDarkHex(hex: string): boolean {
	const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4;
}

/**
 * mermaid's config for one palette. `htmlLabels: false` keeps labels as SVG
 * text (no foreignObject), which a caller drawing untrusted source needs so it
 * can run the result through an SVG sanitizer.
 */
export function mermaidConfig(c: Palette, font: string, { htmlLabels = true } = {}) {
	return {
		startOnLoad: false,
		securityLevel: 'strict' as const,
		suppressErrorRendering: true,
		theme: 'base' as const,
		fontFamily: font,
		htmlLabels,
		look: 'neo' as const,
		// mermaid 12 defaults to elk, which forces orthogonal edges; dagre honours `curve`.
		layout: 'dagre',
		// Rounded nodes even where the neo look keeps a square shape; lives in the SVG's own <style>.
		themeCSS: '.node rect, .cluster rect { rx: 10px; ry: 10px; } .edgePath .path, .flowchart-link { stroke-width: 1.5px; }',
		flowchart: { wrappingWidth: 260, htmlLabels, curve: 'basis' as const, nodeSpacing: 36, rankSpacing: 44, padding: 14 },
		sequence: { actorFontFamily: font, messageFontFamily: font, noteFontFamily: font },
		themeVariables: {
			darkMode: isDarkHex(c.ground),
			fontFamily: font,
			fontSize: '14px',
			background: c.ground,
			textColor: c.ink,
			titleColor: c.ink,
			lineColor: c.soft,
			primaryColor: c.card,
			primaryTextColor: c.ink,
			primaryBorderColor: c.primary,
			secondaryColor: c.inset,
			secondaryTextColor: c.ink,
			secondaryBorderColor: c.border,
			tertiaryColor: c.panel,
			tertiaryTextColor: c.ink,
			tertiaryBorderColor: c.border,
			mainBkg: c.card,
			nodeBorder: c.primary,
			nodeTextColor: c.ink,
			clusterBkg: c.panel,
			clusterBorder: c.border,
			arrowheadColor: c.soft,
			edgeLabelBackground: c.ground,
			actorBkg: c.tint,
			actorBorder: c.primary,
			actorTextColor: c.ink,
			actorLineColor: c.border,
			signalColor: c.soft,
			signalTextColor: c.ink,
			labelBoxBkgColor: c.card,
			labelBoxBorderColor: c.border,
			labelTextColor: c.ink,
			loopTextColor: c.ink,
			noteBkgColor: c.inset,
			noteTextColor: c.ink,
			noteBorderColor: c.border,
			activationBkgColor: c.tint,
			activationBorderColor: c.primary,
			sequenceNumberColor: c.onPrimary,
			stateBkg: c.card,
			stateLabelColor: c.ink,
			stateBorder: c.border,
			labelColor: c.ink,
			transitionColor: c.soft,
			transitionLabelColor: c.ink,
			compositeBackground: c.panel,
			compositeTitleBackground: c.card,
			altBackground: c.inset,
			specialStateColor: c.primary,
			innerEndBackground: c.primary
		}
	};
}

/** Render mermaid `source` to an SVG string. Rejects when the source does not parse. */
export function renderMermaid(source: string, config: MermaidConfig): Promise<string> {
	loading ??= import('mermaid').then((m) => m.default);
	const run = queue.then(async () => {
		const mermaid = await loading!;
		await document.fonts?.ready;
		const key = JSON.stringify(config);
		if (key !== initialized) {
			mermaid.initialize(config);
			initialized = key;
		}
		const { svg } = await mermaid.render(`ripple-mermaid-${++seq}`, source);
		return svg;
	});
	queue = run.catch(() => {});
	return run;
}
