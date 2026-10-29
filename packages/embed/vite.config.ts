/// <reference types="vitest/config" />
// vite.config.ts: the @ripple-ui/embed build, and the vitest config for its tests.
// Compiles the Svelte renderer straight from ../svelte/src (and the engine from
// ../core/src) into dist/ripple-embed.js plus lazy chunks under dist/chunks/,
// imported by relative URL (base './'), so the folder works from any CDN path.
// The embed-only behaviour lives in plugins here; the Svelte package is unchanged:
// - lazyRegistry: the eager widget registry (svelte/src/lib/widgets/index.ts)
//   becomes src/registry.ts, fed by `virtual:ripple-widget-loaders` (one dynamic
//   import per widget file, read from the registry by
//   ../svelte/scripts/widget-sources.ts), and the intent, dashboard, flow and
//   organism renderers become on-demand stand-ins (src/deferred/).
// - embedFile: `x?embed-file` emits x as its own file (lib mode would inline the
//   fonts as base64).
// - lucideLazy: namespace and dynamic imports of the lucide barrel become
//   src/lucide.ts, one chunk per icon. The `echarts` alias trims Chart's echarts.
// - shadowCss: side-effect CSS imports (xyflow, leaflet) become text handed to
//   src/shadow-css.ts, which puts it in every embed's shadow root.
// - minifyAfter: minifies chunks after import analysis (Vite's lib minify breaks
//   mermaid's elk chunk), whitespace and names only: syntax minification folds
//   `var` lists into for-loop heads, which a consumer's Rollup then mis-renders
//   when it tree-shakes one declarator.
// - licenses: writes dist/THIRD_PARTY_LICENSES.txt for every bundled package and font.
// - analyze: RIPPLE_EMBED_ANALYZE=<file> writes what the first load is made of.
// Core declares no sideEffects, so treeshake treats its modules as pure (it has
// no import-time effects); otherwise its zod schemas ship in the first load.
// Component CSS is compiled as injected, so Svelte appends it to the shadow root.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { transform } from 'esbuild';
import { defineConfig, normalizePath, type Plugin } from 'vite';
import { widgetSources } from '../svelte/scripts/widget-sources.js';

const here = dirname(fileURLToPath(import.meta.url));
const SVELTE_LIB = resolve(here, '../svelte/src/lib');
const CORE = resolve(here, '../core');
const EMBED_SRC = resolve(here, 'src');
// Compared with Vite module ids, which use forward slashes on Windows too.
const WIDGETS_INDEX = normalizePath(join(SVELTE_LIB, 'widgets/index.ts'));
const REGISTRY = normalizePath(join(EMBED_SRC, 'registry.ts'));
const LOADERS_ID = 'virtual:ripple-widget-loaders';

// @ripple-ui/core and each subpath it exports resolve to its source, as in the
// Svelte package's vitest config, so the embed needs no prior core build and
// never picks up bun's stale nested copy of core.
const coreExports = JSON.parse(readFileSync(join(CORE, 'package.json'), 'utf8')).exports as Record<string, { source?: string }>;
const coreAlias = Object.entries(coreExports)
	.filter(([, v]) => v && typeof v === 'object' && v.source)
	.map(([key, v]) => ({
		find: new RegExp(`^@ripple-ui/core${key.slice(1).replace(/[/.]/g, '\\$&')}$`),
		replacement: join(CORE, v.source!)
	}));

// importer -> the imports of it that become on-demand stand-ins (src/deferred/).
const DEFERRED: Record<string, RegExp> = {
	[normalizePath(join(SVELTE_LIB, 'Ripple.svelte'))]: /^\.\/intent\/(IntentRenderer|DashboardRenderer|FlowRunner)\.svelte$/,
	[normalizePath(join(SVELTE_LIB, 'components/NodeRenderer.svelte'))]: /^\.\.\/organisms\/(OrganismRenderer)\.svelte$/
};

const lazyRegistry: Plugin = {
	name: 'ripple-embed-lazy-registry',
	enforce: 'pre',
	async resolveId(source, importer, opts) {
		if (source === LOADERS_ID) return '\0' + LOADERS_ID;
		if (!importer) return null;
		const deferred = DEFERRED[importer] && source.match(DEFERRED[importer]);
		if (deferred) return join(EMBED_SRC, 'deferred', `${deferred[1]}.svelte`);
		if (importer === REGISTRY || !/index(\.[jt]s)?$/.test(source)) return null;
		const hit = await this.resolve(source, importer, { ...opts, skipSelf: true });
		return hit?.id === WIDGETS_INDEX ? REGISTRY : null;
	},
	load(id) {
		if (id !== '\0' + LOADERS_ID) return null;
		const sources = widgetSources(join(SVELTE_LIB, 'widgets'));
		const files = [...new Set(Object.values(sources))];
		const lines = files.map((f, i) => `const L${i} = () => import(${JSON.stringify(f)});`);
		const map = Object.entries(sources).map(([type, f]) => `${JSON.stringify(type)}: L${files.indexOf(f)}`);
		return `${lines.join('\n')}\nexport const loaders = {\n${map.join(',\n')}\n};\n`;
	}
};

// `x?embed-file` is a URL to x emitted as its own file next to the chunks (lib
// mode would otherwise inline it as base64, which put 170 KB of fonts in the entry).
const embedFile: Plugin = {
	name: 'ripple-embed-file',
	enforce: 'pre',
	async resolveId(source, importer) {
		if (!source.endsWith('?embed-file') || !importer) return null;
		return resolve(dirname(importer), source.slice(0, -11)) + '?embed-file';
	},
	load(id) {
		if (!id.endsWith('?embed-file')) return null;
		const file = id.slice(0, -11);
		if (this.meta.watchMode || !('emitFile' in this)) return `export default ${JSON.stringify('/@fs' + file)};`;
		const ref = this.emitFile({ type: 'asset', name: file.split('/').pop(), source: readFileSync(file) });
		return `export default import.meta.ROLLUP_FILE_URL_${ref};`;
	}
};

// Namespace and dynamic imports of the lucide barrel become src/lucide.ts, whose
// icons each load on first render; `virtual:ripple-lucide-icons` maps every
// lucide export name to a dynamic import of its .svelte file. Every name,
// canonical or alias, has a dist/icons/<kebab>.js that re-exports one .svelte.
const LUCIDE_ID = 'virtual:ripple-lucide-icons';
const LUCIDE_NS = /import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s+from\s*(['"])@lucide\/svelte\2/g;
const LUCIDE_DYNAMIC = /\bimport\(\s*(['"])@lucide\/svelte\1\s*\)/g;
const pascal = (kebab: string) => kebab.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('');
const lucideLazy: Plugin = {
	name: 'ripple-embed-lucide',
	enforce: 'post',
	resolveId: (source) => (source === LUCIDE_ID ? '\0' + LUCIDE_ID : null),
	async load(id) {
		if (id !== '\0' + LUCIDE_ID) return null;
		const barrel = await this.resolve('@lucide/svelte', join(SVELTE_LIB, 'index.ts'));
		const dir = join(dirname(barrel!.id.split('?')[0]), 'icons');
		const files: string[] = [];
		const map: string[] = [];
		for (const f of readdirSync(dir).filter((f) => f.endsWith('.js')).sort()) {
			const target = readFileSync(join(dir, f), 'utf8').match(/from\s*["']\.\/([^"']+\.svelte)["']/)?.[1];
			if (!target) continue;
			let i = files.indexOf(target);
			if (i < 0) i = files.push(target) - 1;
			map.push(`${pascal(f.slice(0, -3))}:L${i}`);
		}
		const lines = files.map((f, i) => `const L${i}=()=>import(${JSON.stringify(join(dir, f))});`);
		return `${lines.join('\n')}\nexport const icons={${map.join(',')}};\n`;
	},
	transform(code, id) {
		if (id.startsWith(EMBED_SRC) || id.includes('?') || !code.includes('@lucide/svelte')) return null;
		const lucide = JSON.stringify(join(EMBED_SRC, 'lucide.ts'));
		const out = code
			.replace(LUCIDE_NS, (_, name) => `import ${name} from ${lucide}`)
			.replace(LUCIDE_DYNAMIC, () => `import(${lucide}).then((m) => m.default)`);
		return out === code ? null : { code: out, map: null };
	}
};

const SIDE_EFFECT_CSS = /^[ \t]*import\s*(['"])([^'"]+\.css)\1[ \t]*;?/gm;
const DYNAMIC_CSS = /\bimport\(\s*(['"])([^'"]+\.css)\1\s*\)/g;
const shadowCss: Plugin = {
	name: 'ripple-embed-shadow-css',
	enforce: 'post',
	transform(code, id) {
		if (id.startsWith(EMBED_SRC) || id.includes('?') || !/\.(svelte|[cm]?[jt]sx?)$/.test(id)) return null;
		SIDE_EFFECT_CSS.lastIndex = DYNAMIC_CSS.lastIndex = 0;
		if (!SIDE_EFFECT_CSS.test(code) && !DYNAMIC_CSS.test(code)) return null;
		let n = 0;
		const head = [`import { addShadowCss as __addShadowCss } from ${JSON.stringify(join(EMBED_SRC, 'shadow-css.ts'))};`];
		const out = code.replace(SIDE_EFFECT_CSS, (_, _q, spec) => {
			const name = `__shadowCss${n++}`;
			head.push(`import ${name} from ${JSON.stringify(spec + '?inline')};`, `__addShadowCss(${name});`);
			return '';
		}).replace(DYNAMIC_CSS, (_, _q, spec) => `import(${JSON.stringify(spec + '?inline')}).then((m) => __addShadowCss(m.default))`);
		return { code: head.join('\n') + '\n' + out, map: null };
	}
};

const minifyAfter: Plugin = {
	name: 'ripple-embed-minify',
	apply: 'build',
	generateBundle: {
		order: 'post',
		async handler(_, bundle) {
			for (const chunk of Object.values(bundle)) {
				if (chunk.type === 'chunk') {
					chunk.code = (await transform(chunk.code, { minifyWhitespace: true, minifyIdentifiers: true, format: 'esm', target: 'es2022', legalComments: 'none' })).code;
				}
			}
		}
	}
};

function packageRoot(id: string): string | null {
	const i = id.lastIndexOf('/node_modules/');
	if (i < 0) return null;
	const rest = id.slice(i + 14).split('/');
	return id.slice(0, i + 14) + (rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0]);
}

const licenses: Plugin = {
	name: 'ripple-embed-licenses',
	apply: 'build',
	generateBundle(_, bundle) {
		const roots = new Set<string>();
		for (const chunk of Object.values(bundle)) {
			if (chunk.type !== 'chunk') continue;
			for (const id of Object.keys(chunk.modules)) {
				const root = packageRoot(id.replace(/^\0/, ''));
				if (root) roots.add(root);
			}
		}
		const parts = ['Third-party software bundled in @ripple-ui/embed. Ripple itself is MIT (see LICENSE).\n'];
		for (const root of [...roots].sort()) {
			const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
			const texts = readdirSync(root)
				.filter((f) => /^(licen[cs]e|notice|copying)/i.test(f) && statSync(join(root, f)).isFile())
				.map((f) => readFileSync(join(root, f), 'utf8').trim());
			parts.push(`${'='.repeat(79)}\n${pkg.name}@${pkg.version} (${pkg.license ?? 'see text'})\n${'='.repeat(79)}\n${texts.join('\n\n') || 'No licence file shipped; licence field: ' + pkg.license}\n`);
		}
		const fonts = resolve(here, '../svelte/static/fonts');
		for (const f of readdirSync(fonts).filter((f) => f.startsWith('OFL-'))) {
			parts.push(`${'='.repeat(79)}\nFont ${f.slice(4, -4)} (SIL Open Font License 1.1)\n${'='.repeat(79)}\n${readFileSync(join(fonts, f), 'utf8').trim()}\n`);
		}
		this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_LICENSES.txt', source: parts.join('\n') });
	}
};

// RIPPLE_EMBED_ANALYZE=<file> bunx vite build: writes to <file> what the entry's static closure is made of.
const analyze: Plugin = {
	name: 'ripple-embed-analyze',
	apply: 'build',
	generateBundle(_, bundle) {
		const chunks = Object.values(bundle).filter((c) => c.type === 'chunk');
		const entry = chunks.find((c) => c.isEntry)!;
		const closure = new Set<string>();
		const visit = (f: string) => {
			if (closure.has(f)) return;
			closure.add(f);
			for (const i of (bundle[f] as { imports?: string[] }).imports ?? []) visit(i);
		};
		visit(entry.fileName);
		const groups = new Map<string, number>();
		for (const f of closure) {
			for (const [id, m] of Object.entries((bundle[f] as { modules: Record<string, { renderedLength: number }> }).modules)) {
				const key = packageRoot(id)?.split('/node_modules/').pop() ?? id.replace(resolve(here, '..') + '/', '').split('/').slice(0, 5).join('/');
				groups.set(key, (groups.get(key) ?? 0) + m.renderedLength);
			}
		}
		const rows = [...groups].sort((a, b) => b[1] - a[1]).slice(0, 60);
		if (process.env.RIPPLE_EMBED_ANALYZE) writeFileSync(process.env.RIPPLE_EMBED_ANALYZE, rows.map(([k, n]) => `${(n / 1024).toFixed(1).padStart(8)}K  ${k}`).join('\n'));
	}
};

export default defineConfig({
	base: './',
	publicDir: false,
	plugins: [lazyRegistry, embedFile, tailwindcss(), svelte({ emitCss: false, compilerOptions: { css: 'injected' } }), lucideLazy, shadowCss, minifyAfter, licenses, analyze],
	resolve: {
		alias: [
			{ find: '$lib', replacement: SVELTE_LIB },
			// Chart's import('echarts') gets only the series it draws (src/echarts.ts).
			{ find: /^echarts$/, replacement: join(EMBED_SRC, 'echarts.ts') },
			...coreAlias
		],
		dedupe: ['svelte'],
		// vitest resolves for node by default; the card needs Svelte's client build.
		conditions: process.env.VITEST ? ['browser'] : undefined
	},
	define: { 'process.env.NODE_ENV': JSON.stringify('production') },
	build: {
		outDir: 'dist',
		emptyOutDir: true,
		minify: false,
		cssMinify: true,
		assetsInlineLimit: 0,
		lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'ripple-embed.js' },
		rollupOptions: {
			// Core declares no sideEffects, so every module its barrel re-exports (zod
			// schemas included) would ship. It has no import-time effects; unused modules drop.
			treeshake: { moduleSideEffects: (id) => !id.startsWith(join(CORE, 'src') + '/') },
			output: {
				chunkFileNames: 'chunks/[name]-[hash].js',
				assetFileNames: 'assets/[name]-[hash][extname]'
			}
		}
	},
	test: {
		environment: 'jsdom',
		include: ['src/**/*.test.ts'],
		testTimeout: 90_000
	}
});
