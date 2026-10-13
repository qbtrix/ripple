// core-build.test.ts: the `@ripple-ui/core/build` subpath resolves from the
// svelte package. It goes through the alias in vitest.config.ts; without it,
// the nested `file:../core` copy (no dist/) fails the import.
import { describe, it, expect } from 'vitest';
import { buildSpec, parseSpecText } from '@ripple-ui/core/build';

describe('@ripple-ui/core/build', () => {
	it('imports cleanly', () => {
		expect(typeof buildSpec).toBe('function');
		expect(parseSpecText('{"ui":{"type":"card"}}')).toEqual({ spec: { ui: { type: 'card' } } });
	});
});
