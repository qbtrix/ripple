// src/shadow-css.ts: stylesheets that must reach every embed's shadow root.
// The base sheet (embed.css) is added by index.svelte.ts; widget libraries'
// side-effect CSS imports (xyflow for Workflow and C4) are rewritten by the
// build into addShadowCss() calls, which run when the widget's lazy chunk
// loads. Each sheet lands in every live root and in any root attached later,
// in the order added. Shadow roots ignore :root, so it is rewritten to the
// embed wrapper here, and @property/@font-face are lifted to document.head.
const sheets: string[] = [];
const roots = new Set<ShadowRoot>();
const LIFTED = /@(?:property|font-face)\b[^{]*\{[^}]*\}/g;

function liftToDocument(rules: string[]) {
	if (!rules.length || typeof document === 'undefined') return;
	const style = document.createElement('style');
	style.dataset.rippleEmbed = '';
	style.textContent = rules.join('\n');
	document.head.append(style);
}

function append(root: ShadowRoot, css: string) {
	const style = document.createElement('style');
	style.textContent = css;
	root.append(style);
}

/** Adds a sheet to every embed root, current and future. */
export function addShadowCss(css: string, { liftFonts = true } = {}): void {
	const lifted = css.match(LIFTED) ?? [];
	liftToDocument(liftFonts ? lifted : lifted.filter((r) => r.startsWith('@property')));
	const scoped = css.replace(LIFTED, '').replace(/:root\b/g, '.ripple-embed-root');
	sheets.push(scoped);
	for (const root of roots) append(root, scoped);
}

/** Puts every sheet so far into `root` and keeps it current; returns the detach. */
export function attachShadowCss(root: ShadowRoot): () => void {
	for (const css of sheets) append(root, css);
	roots.add(root);
	return () => roots.delete(root);
}
