// site/docs/diagrams.ts — Draws the docs' ```mermaid figures in the browser.
// markdown.ts ships each one as <figure class="diagram"> holding the source in
// a <pre>; attachDiagrams swaps that for an SVG when the figure nears the
// viewport. mermaid is a dynamic import, so its chunk is fetched only by a
// page that has a diagram, and only once one is about to be seen.
// - Theme: 'base' with themeVariables read from the site tokens (--site-*,
//   --primary, --code-bg, --font-sans). The tokens are oklch / color-mix,
//   which mermaid's colour maths cannot parse, so each is resolved to an
//   opaque hex through a 1px canvas, composited over --site-ground.
// - Toggling the html `dark` class re-initializes mermaid and redraws every
//   drawn figure from the source kept here.
// - securityLevel 'strict'. A diagram that fails to render keeps its source
//   on screen; diagrams.test.ts parses every fence so that cannot ship.
// - Size: the SVG shrinks to fit its column. On phones the page CSS stops it
//   at --diagram-min (70% of its natural width, set here) and the canvas
//   scrolls sideways instead of the page.

type Mermaid = (typeof import('mermaid'))['default'];

let loading: Promise<Mermaid> | undefined;
let initializedFor: boolean | undefined;
let seq = 0;

const isDark = () => document.documentElement.classList.contains('dark');

/** CSS colours (any syntax the browser knows) to opaque #rrggbb over the page ground. */
function resolveColors<K extends string>(css: Record<K, string>): Record<K, string> {
	const probe = document.createElement('span');
	probe.style.display = 'none';
	document.body.append(probe);
	const computed = (value: string) => {
		probe.style.color = value;
		return getComputedStyle(probe).color;
	};
	const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
	const ground = computed('var(--site-ground)');
	const out = {} as Record<K, string>;
	for (const key of Object.keys(css) as K[]) {
		ctx.fillStyle = ground;
		ctx.fillRect(0, 0, 1, 1);
		ctx.fillStyle = computed(css[key]);
		ctx.fillRect(0, 0, 1, 1);
		const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
		out[key] = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
	}
	probe.remove();
	return out;
}

function config(dark: boolean) {
	const c = resolveColors({
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
	});
	const font = getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim() || 'sans-serif';
	return {
		startOnLoad: false,
		securityLevel: 'strict' as const,
		suppressErrorRendering: true,
		theme: 'base' as const,
		fontFamily: font,
		flowchart: { wrappingWidth: 260 },
		sequence: { actorFontFamily: font, messageFontFamily: font, noteFontFamily: font },
		themeVariables: {
			darkMode: dark,
			fontFamily: font,
			fontSize: '14px',
			background: c.ground,
			textColor: c.ink,
			titleColor: c.ink,
			lineColor: c.soft,
			primaryColor: c.card,
			primaryTextColor: c.ink,
			primaryBorderColor: c.border,
			secondaryColor: c.inset,
			secondaryTextColor: c.ink,
			secondaryBorderColor: c.border,
			tertiaryColor: c.panel,
			tertiaryTextColor: c.ink,
			tertiaryBorderColor: c.border,
			mainBkg: c.card,
			nodeBorder: c.border,
			nodeTextColor: c.ink,
			clusterBkg: c.panel,
			clusterBorder: c.border,
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

async function draw(canvas: HTMLElement, source: string, alive: () => boolean) {
	loading ??= import('mermaid').then((m) => m.default);
	const mermaid = await loading;
	await document.fonts.ready;
	const dark = isDark();
	if (initializedFor !== dark) {
		mermaid.initialize(config(dark));
		initializedFor = dark;
	}
	const { svg } = await mermaid.render(`diagram-${++seq}`, source);
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
