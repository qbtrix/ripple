// vite.embed.config.ts: the standalone embed build (`bun run build:embed`).
// Plain vite-plugin-svelte, not SvelteKit: src/embed/main.ts becomes one ES
// module, embed-dist/ripple-embed.js, that a sandboxed chat iframe imports
// from jsDelivr. Code splitting stays on so mermaid, temml and the heavy
// widgets are lazy chunks under chunks/, imported by relative URL (base './').
// Component CSS is compiled as injected so it lands in the embed's shadow root.
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { transform } from 'esbuild';
import { defineConfig, type Plugin } from 'vite';

// Vite's own lib-mode minify renames a variable in mermaid's elk chunk to `of`,
// which its import-analysis parser then rejects (`x = of / n` inside a for
// head). So the build runs unminified and this pass minifies each chunk after
// import analysis. ponytail: drop it once Vite's lib minify survives elk.
const minifyAfter: Plugin = {
	name: 'ripple-embed-minify',
	apply: 'build',
	generateBundle: {
		order: 'post',
		async handler(_, bundle) {
			for (const chunk of Object.values(bundle)) {
				if (chunk.type === 'chunk') chunk.code = (await transform(chunk.code, { minify: true, format: 'esm', target: 'es2022' })).code;
			}
		}
	}
};

export default defineConfig({
	base: './',
	publicDir: false,
	plugins: [
		tailwindcss(),
		svelte({ emitCss: false, compilerOptions: { css: 'injected' } }),
		minifyAfter
	],
	resolve: { alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) } },
	define: { 'process.env.NODE_ENV': JSON.stringify('production') },
	build: {
		outDir: 'embed-dist',
		emptyOutDir: true,
		minify: false,
		cssMinify: true,
		assetsInlineLimit: 0,
		lib: { entry: 'src/embed/main.ts', formats: ['es'], fileName: () => 'ripple-embed.js' },
		rollupOptions: {
			output: {
				chunkFileNames: 'chunks/[name]-[hash].js',
				assetFileNames: 'assets/[name]-[hash][extname]'
			}
		}
	}
});
