// routes/pawbar/play-cards.test.ts: Every answer the chat can replay (answerPool:
// the gallery runs and the chat-only recordings) is a real model recording, and
// each one's final card renders through <Ripple> the way the chat shows it: its
// top widget mounts with visible content and nothing logs an error. The figure
// modules load before any test, so none resolves after the environment is gone.

import { render } from '@testing-library/svelte';
import { beforeAll, expect, test, vi } from 'vitest';
import Ripple from '$lib/Ripple.svelte';
import { FIGURES } from '$lib/figures/index.js';
import { answerPool, cardChunks } from './recorded.js';

// A figure card lazy-loads its geometry; load every one up front, so no import
// is still in flight when a test unmounts or the file's environment tears down.
beforeAll(() => Promise.all(Object.values(FIGURES).map((f) => f.load())));

const waitFor = <T>(fn: () => T | Promise<T>) => vi.waitFor(fn, { timeout: 8000 });

test('no chat answer is hand-written', () => {
	expect(answerPool.filter((s) => s.fixture.model === 'hand-written').map((s) => s.id)).toEqual([]);
	for (const s of answerPool) expect(s.fixture.model, s.id).toMatch(/^(sonnet|opus)$/);
});

test.each(answerPool.map((s) => [s.id, s] as const))('%s renders its final card', async (_id, s) => {
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const card = JSON.parse(cardChunks(s.fixture).map((c) => c.text).join(''));
	const view = render(Ripple, { props: { spec: { version: '1.0', ...card } } });
	await waitFor(() => expect(view.container.textContent?.trim().length ?? 0).toBeGreaterThan(10));
	expect(errors.mock.calls.map((c) => String(c[0]))).toEqual([]);
	errors.mockRestore();
	view.unmount();
});
