// routes/pawbar/Chat.scroll.test.ts — Who scrolls. By default (the playground)
// the chat never scrolls the page: a chip send and a streamed reply move only
// the chat's own container (scrollTo on .scroller); nothing calls
// scrollIntoView or window.scrollTo. Before the first turn, growth in the `top`
// snippet never pins the chat to its bottom. With `pageScroll` (the landing)
// it is the reverse: no inner container is scrolled, and the visitor's new
// message (or a replay) scrolls the window to that turn's top, once, never
// following the streamed reply. jsdom has no layout, so this pins the calls,
// not the pixels.

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

test('pageScroll: a chip send brings the new turn into view in the page, nothing else', async () => {
	const intoView: { el: Element; opts: unknown }[] = [];
	Element.prototype.scrollIntoView = function (this: Element, opts?: unknown) {
		intoView.push({ el: this, opts });
	};
	const scrolled: Element[] = [];
	Element.prototype.scrollTo = function (this: Element) {
		scrolled.push(this);
	};
	const session = new ChatSession(async function* () {
		yield { event: 'chunk', data: { content: 'Here you go.', type: 'text' } };
		yield { event: 'stream_end', data: { cancelled: false } };
	});
	const view = render(Chat, { session, pageScroll: true, suggestions: [{ id: 'a', title: 'Try it', prompt: 'Make me a thing' }] });
	expect(view.container.querySelector('.chat')?.hasAttribute('data-page-scroll')).toBe(true);
	await fireEvent.click(view.getByRole('button', { name: 'Try it' }));
	await vi.waitFor(() => expect(view.getByText('Here you go.')).toBeTruthy());

	await vi.waitFor(() => expect(intoView.length).toBe(1));
	const [{ el, opts }] = intoView;
	expect(el.matches('li.turn[data-role="user"]')).toBe(true);
	expect(el.textContent).toContain('Make me a thing');
	expect(opts).toMatchObject({ block: 'start' });
	expect(scrolled).toEqual([]);
});

test('pageScroll: smooth, or a jump under reduced motion', async () => {
	const opts: ScrollIntoViewOptions[] = [];
	Element.prototype.scrollIntoView = function (o?: ScrollIntoViewOptions | boolean) {
		if (typeof o === 'object') opts.push(o);
	};
	vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} }));
	try {
		const session = new ChatSession(async function* () {
			yield { event: 'stream_end', data: { cancelled: false } };
		});
		const view = render(Chat, { session, pageScroll: true, suggestions: [{ id: 'a', title: 'Try it', prompt: 'Go' }] });
		await fireEvent.click(view.getByRole('button', { name: 'Try it' }));
		await vi.waitFor(() => expect(opts.length).toBe(1));
		expect(opts[0].behavior).toBe('auto');
	} finally {
		vi.unstubAllGlobals();
	}
});

test('without pageScroll the chat keeps its own scroll box', () => {
	const view = render(Chat, { session: new ChatSession(async function* () {}) });
	expect(view.container.querySelector('.chat')?.hasAttribute('data-page-scroll')).toBe(false);
	expect(view.container.querySelector('.scroller')).toBeTruthy();
});
