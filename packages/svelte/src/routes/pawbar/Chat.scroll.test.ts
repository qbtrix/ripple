// routes/pawbar/Chat.scroll.test.ts — The chat never scrolls the page. A chip
// send and a streamed reply move only the chat's own container (scrollTo on
// .scroller); nothing calls scrollIntoView or window.scrollTo, either of which
// would walk up and move the page. jsdom has no layout, so this pins the calls,
// not the pixels (the Playwright check in the PR measures those). Before the
// first turn, growth in the `top` snippet (an alert, a note) never pins the
// chat to its bottom, so whatever it says stays in view.

import { fireEvent, render } from '@testing-library/svelte';
import { afterEach, expect, test, vi } from 'vitest';
import Chat from './Chat.svelte';
import { ChatSession } from './session.svelte.js';

afterEach(() => vi.restoreAllMocks());

test('a chip send scrolls the chat container, never the page', async () => {
	const intoView = vi.fn();
	Element.prototype.scrollIntoView = intoView;
	const pageScroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
	const scrolled: Element[] = [];
	Element.prototype.scrollTo = function (this: Element) {
		scrolled.push(this);
	};

	const session = new ChatSession(async function* () {
		yield { event: 'chunk', data: { content: 'Here you go.', type: 'text' } };
		yield { event: 'stream_end', data: { cancelled: false } };
	});
	const view = render(Chat, { session, suggestions: [{ id: 'a', title: 'Try it', prompt: 'Make me a thing' }] });
	await fireEvent.click(view.getByRole('button', { name: 'Try it' }));
	await vi.waitFor(() => expect(view.getByText('Here you go.')).toBeTruthy());

	await vi.waitFor(() => expect(scrolled.length).toBeGreaterThan(0));
	expect(scrolled.every((el) => el.classList.contains('scroller'))).toBe(true);
	expect(intoView).not.toHaveBeenCalled();
	expect(pageScroll).not.toHaveBeenCalled();
});

test('growth before the first turn leaves the chat at its top', async () => {
	const scrolled: Element[] = [];
	Element.prototype.scrollTo = function (this: Element) {
		scrolled.push(this);
	};
	const observers: (() => void)[] = [];
	vi.stubGlobal(
		'ResizeObserver',
		class {
			constructor(cb: () => void) {
				observers.push(cb);
			}
			observe() {}
			disconnect() {}
		}
	);
	try {
		// jsdom lays nothing out, so every scroller reads as at its bottom: the follow would fire.
		render(Chat, { session: new ChatSession(async function* () {}) });
		await vi.waitFor(() => expect(observers.length).toBe(1));
		observers[0]();
		expect(scrolled).toEqual([]);
	} finally {
		vi.unstubAllGlobals();
	}
});
