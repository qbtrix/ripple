// sound/exports.test.ts: the package root exports the cue API for host apps.
import { expect, it } from 'vitest';
import * as root from '$lib/index.js';

it('exports playCue, setSoundEnabled and soundEnabled from the package root', () => {
	expect(typeof root.playCue).toBe('function');
	expect(typeof root.setSoundEnabled).toBe('function');
	expect(typeof root.soundEnabled).toBe('function');
});
