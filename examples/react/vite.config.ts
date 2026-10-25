// examples/react/vite.config.ts: plain Vite, no React plugin needed (esbuild
// handles JSX). base './' so the built page also works from a sub-path.
import { defineConfig } from 'vite';

export default defineConfig({
	base: './',
	esbuild: { jsx: 'automatic' }
});
