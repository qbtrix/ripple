// routes/playground/playground-no-fetch.test.ts — Without PUBLIC_PAWBAR_LIVE the playground makes no request.
// Renders the page as the default build has it (vitest defines no
// PUBLIC_PAWBAR_* vars), taps a recorded prompt card and sends a typed prompt
// no recording covers, and fails if anything reached fetch. Also checks the
// page says plainly that it is replaying recordings, and that the page-level
// shortcuts reach the composer and the session (/ and Esc), and that a
// visitor's own JSON renders as they type in the CodeMirror editor (driven
// through its EditorView, as jsdom cannot type into it) and a broken edit
// keeps the last good render. The page keeps one h1 after the welcome goes,
// the example reads well before a name is typed, and Replay streams the same
// bytes the chat did.

import { fireEvent, render } from '@testing-library/svelte';
import { EditorView } from '@codemirror/view';
import { afterEach, expect, test, vi } from 'vitest';
import Playground from './+page.svelte';

vi.setConfig({ testTimeout: 30_000 });
const waitFor = <T>(fn: () => T | Promise<T>) => vi.waitFor(fn, { timeout: 15_000, interval: 50 });

afterEach(() => vi.restoreAllMocks());

test('a prompt card and a typed prompt never call fetch without the opt-in flag', async () => {
	const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in this test'));
	const view = render(Playground);
	expect(view.getByText('Recorded answers')).toBeTruthy();

	await fireEvent.click(view.getByRole('button', { name: /Watch savings grow/ }));
	await waitFor(() => expect(view.getByText(/This is a recorded answer to a request like yours/)).toBeTruthy());
	await waitFor(() => expect(view.queryByRole('button', { name: 'Stop' })).toBeNull());

	await fireEvent.input(view.getByLabelText('Describe the tool you want'), { target: { value: 'something no recording covers' } });
	await fireEvent.click(view.getByRole('button', { name: 'Send' }));
	await waitFor(() => expect(view.getByText('Nothing recorded matches that yet, so this plays the recorded bill splitter.')).toBeTruthy());
	await waitFor(() => expect(view.queryByRole('button', { name: 'Stop' })).toBeNull());

	expect(fetchSpy).not.toHaveBeenCalled();
});

test('/ focuses the composer and Esc stops a stream', async () => {
	vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in this test'));
	const view = render(Playground);
	const box = view.getByLabelText('Describe the tool you want');

	await fireEvent.keyDown(document.body, { key: '/' });
	expect(document.activeElement).toBe(box);

	await fireEvent.click(view.getByRole('button', { name: /Split the bill/ }));
	await waitFor(() => expect(view.getByRole('button', { name: 'Stop' })).toBeTruthy());
	await fireEvent.keyDown(document.body, { key: 'Escape' });
	await waitFor(() => expect(view.getByText('Stopped.')).toBeTruthy());
});

test('Paste or edit a spec renders the JSON as it is typed and keeps the last good render on a broken edit', async () => {
	const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in this test'));
	// jsdom has no modal dialogs; the phone layout opens the editor in one.
	if (!('showModal' in HTMLDialogElement.prototype)) {
		Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
			configurable: true,
			value(this: HTMLDialogElement) {
				this.open = true;
			}
		});
	}
	const view = render(Playground);

	await fireEvent.click(view.getByRole('button', { name: 'Paste or edit a spec' }));
	const box = await waitFor(() => view.getByLabelText('Edit the JSON spec'));
	const cm = EditorView.findFromDOM(box)!;
	expect(cm.state.doc.toString()).toContain('Hello, Ripple!');
	await waitFor(() => expect(view.getByRole('heading', { name: 'Hello, Ripple!' })).toBeTruthy());
	expect(view.getByText('Hello, there!')).toBeTruthy();
	const type = (text: string) => cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: text } });

	type('{"ui":{"type":"heading","props":{"text":"Edited by hand","level":2}}}');
	await waitFor(() => expect(view.getByRole('heading', { name: 'Edited by hand' })).toBeTruthy());

	type('{"ui":{"type":');
	await waitFor(() => expect(view.getByText(/This is not valid JSON/)).toBeTruthy());
	expect(box.getAttribute('aria-invalid')).toBe('true');
	expect(view.getByRole('heading', { name: 'Edited by hand' })).toBeTruthy();
	expect(fetchSpy).not.toHaveBeenCalled();
});

test('the page keeps its h1 after the first turn, and Replay keeps the size and line count', async () => {
	vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in this test'));
	const view = render(Playground);
	const h1 = () => view.getAllByRole('heading', { level: 1 }).map((h) => h.textContent);
	expect(h1()).toEqual(['Playground']);

	await fireEvent.click(view.getByRole('button', { name: /Split the bill/ }));
	await waitFor(() => expect(view.queryByRole('button', { name: 'Stop' })).toBeNull());
	expect(h1()).toEqual(['Playground']);

	const meta = () => view.container.querySelector('.json .meta')?.textContent;
	const valid = () => view.getByText(/^Valid, /).textContent;
	await waitFor(() => expect(valid()).toMatch(/ B$/));
	const before = [meta(), valid()];
	expect(meta()).toMatch(/^\d+ B · \d+ lines$/);

	const replay = view.getByRole('button', { name: 'Replay' });
	await fireEvent.click(replay);
	await waitFor(() => expect(replay.hasAttribute('disabled')).toBe(true));
	await waitFor(() => expect(replay.hasAttribute('disabled')).toBe(false));
	await waitFor(() => expect([meta(), valid()]).toEqual(before));
});
