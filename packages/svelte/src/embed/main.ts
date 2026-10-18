// embed/main.ts: entry of the standalone embed build (vite.embed.config.ts ->
// embed-dist/ripple-embed.js). One ES module a host page imports from a CDN:
//   const { mount } = await import('.../ripple-embed.js');
//   const card = mount(el, spec, { theme: 'dark' }); card.update(next);
// - The card renders inside an open shadow root on `el`, so host CSS and the
//   embed's Tailwind never meet. Svelte component styles are compiled as
//   injected CSS, which Svelte appends to the shadow root on its own.
// - Shadow roots ignore @property and @font-face, so those rules are lifted
//   into one document.head <style> (once per page). The site's /fonts/ faces
//   are dropped and re-declared against the bundled woff2 URLs, which resolve
//   next to this module wherever it is served from.
// - :root matches nothing in a shadow tree; it is rewritten to the wrapper
//   (.ripple-embed-root, in Embed.svelte), which carries `dark` for the theme.
// - Heavy widgets (mermaid, temml, charts, maps) stay lazy chunks fetched by
//   relative URL. Widgets that import their own library CSS (Workflow, C4)
//   would land it in document.head, not the shadow root: unstyled here.
import { mount as svelteMount, unmount } from 'svelte';
import Embed from './Embed.svelte';
import css from './embed.css?inline';
import inter from '../../static/fonts/inter-latin-wght-normal.woff2?url';
import mono from '../../static/fonts/jetbrains-mono-latin-wght-normal.woff2?url';
import display from '../../static/fonts/bricolage-grotesque-latin-wght-normal.woff2?url';

type Theme = 'light' | 'dark';

const LIFTED = /@(?:property|font-face)\b[^{]*\{[^}]*\}/g;
const shadowCss = css.replace(LIFTED, '').replace(/:root\b/g, '.ripple-embed-root');

function face(family: string, url: string, weight: string) {
	return `@font-face{font-family:'${family}';src:url('${url}') format('woff2');font-weight:${weight};font-style:normal;font-display:swap}`;
}

function liftDocumentCss() {
	if (document.getElementById('ripple-embed-global')) return;
	const style = document.createElement('style');
	style.id = 'ripple-embed-global';
	style.textContent =
		(css.match(LIFTED) ?? []).filter((r) => r.startsWith('@property')).join('\n') +
		face('Inter Variable', new URL(inter, import.meta.url).href, '100 900') +
		face('JetBrains Mono Variable', new URL(mono, import.meta.url).href, '100 800') +
		face('Bricolage Grotesque Variable', new URL(display, import.meta.url).href, '200 800');
	document.head.append(style);
}

export function mount(el: HTMLElement, spec: object, opts: { theme?: Theme } = {}) {
	liftDocumentCss();
	const theme = opts.theme ?? 'light';
	const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
	root.replaceChildren();
	const style = document.createElement('style');
	style.textContent = shadowCss;
	root.append(style);
	el.style.colorScheme = theme;
	const app = svelteMount(Embed, { target: root, props: { spec, theme } }) as { update(s: object): void };
	return {
		update: (next: object) => app.update(next),
		destroy: () => {
			void unmount(app);
			root.replaceChildren();
		}
	};
}
