// routes/pawbar/landing-hero.test.ts — The landing's hero sits above the chat, and the install Copy works.
// The headline and lede render before the seeded first message, with no
// install chip of their own (the dock's strip carries the command on the
// first screen). Copy writes the command through navigator.clipboard, and
// when the clipboard is missing (jsdom has none) it selects the command.

import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, expect, test, vi } from 'vitest';
import Landing from '../+page.svelte';

// The landing's server load output (+page.server.ts); the sample's markup is not under test here.
const props = { data: { codeSample: '' } };

afterEach(() => {
	vi.restoreAllMocks();
	Reflect.deleteProperty(navigator, 'clipboard');
});

const stripCopy = () => screen.getAllByRole('button', { name: 'Copy install command' })[0];

test('the hero leads the chat column, above the first message', () => {
	const view = render(Landing, { props });
	const h1 = view.getByRole('heading', { level: 1 });
	expect(h1.textContent).toBe('Ask for a tool. Ripple builds it while the model is still typing.');
	expect(view.getByText(/Ripple is the open-source generative UI engine\./)).toBeTruthy();
	const firstMessage = view.getByText('A recorded answer, replayed. Change something in the card.');
	expect(h1.compareDocumentPosition(firstMessage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	expect(view.container.querySelector('.hero')?.textContent).not.toContain('bun add');
	expect(stripCopy().closest('.strip')?.textContent).toContain('bun add @ripple-ui/svelte');
});

test('Copy writes the install command to the clipboard', async () => {
	const writeText = vi.fn().mockResolvedValue(undefined);
	Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
	render(Landing, { props });
	await fireEvent.click(stripCopy());
	expect(writeText).toHaveBeenCalledWith('bun add @ripple-ui/svelte');
	await vi.waitFor(() => expect(stripCopy().textContent?.trim()).toBe('Copied'));
});

test('without a clipboard, Copy selects the command instead', async () => {
	render(Landing, { props });
	await fireEvent.click(stripCopy());
	await vi.waitFor(() => expect(window.getSelection()?.toString()).toContain('bun add @ripple-ui/svelte'));
});
