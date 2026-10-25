// vitest.config.ts: jsdom for the component test; the embed itself is mocked there.
import { defineConfig } from 'vitest/config';

export default defineConfig({
	esbuild: { jsx: 'automatic' },
	test: { environment: 'jsdom', include: ['src/**/*.test.tsx'] }
});
