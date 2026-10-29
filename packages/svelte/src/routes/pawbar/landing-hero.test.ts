// routes/pawbar/landing-hero.test.ts — The landing's hero sits above the chat, the install Copy works, and the band's framework switch swaps what it shows.
// The headline and lede render before the seeded first message, with no
// install chip of their own (the dock's strip carries the command on the
// first screen). Copy writes the command through navigator.clipboard, and
// when the clipboard is missing (jsdom has none) it selects the command.

import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, expect, test, vi } from 'vitest';
import Landing from '../+page.svelte';

// The landing's server load output (+page.server.ts); the sample's markup is not under test here.
const props = { data: { codeSamples: { svelte: '', react: '', html: '' } } };

afterEach(() => {
	vi.restoreAllMocks();
	Reflect.deleteProperty(navigator, 'clipboard');
	try {
		localStorage.removeItem('ripple-landing-framework');
	} catch {
		// no storage in this environment
	}
});

const stripCopy = () => screen.getAllByRole('button', { name: 'Copy install command' })[0];

test('the hero leads the chat column, above the first message', () => {
	const view = render(Landing, { props });
	const h1 = view.getByRole('heading', { level: 1 });
	expect(h1.textContent).toBe('The open-source generative UI engine');
	expect(view.getByText(/Open-source alternative to ChatGPT's Intelligent UI and Claude Dashboards/)).toBeTruthy();
	expect(view.getByText(/Ask for a tool and Ripple builds it while the model is still typing\./)).toBeTruthy();
	expect(view.getByRole('link', { name: 'Svelte, React or plain HTML' }).getAttribute('href')).toBe('#install');
	expect(view.container.querySelector('.context')?.textContent?.trim()).toBe('Recorded demo');
	expect(view.queryByText('The card is live now. Change something and see.')).toBeNull();
	const firstMessage = view.getByText('A recorded answer, replayed. Change something in the card.');
	// A replay's spoken line is status: the chat shows it as a quiet meta line.
	expect(firstMessage.classList.contains('meta')).toBe(true);
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

const bandCopy = (name: string) => screen.getAllByRole('button', { name }).at(-1)!;

test('the framework switch swaps the band install command, usage snippet and copy', async () => {
	const writeText = vi.fn().mockResolvedValue(undefined);
	Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
	const view = render(Landing, { props });
	const band = view.container.querySelector('#install')!;
	expect(view.getByRole('button', { name: 'Svelte' }).getAttribute('aria-pressed')).toBe('true');
	expect(band.textContent).toContain('bun add @ripple-ui/svelte');

	await fireEvent.click(view.getByRole('button', { name: 'React' }));
	expect(view.getByRole('button', { name: 'React' }).getAttribute('aria-pressed')).toBe('true');
	expect(band.textContent).toContain('npm i @ripple-ui/react');
	expect(band.textContent).toContain('<Ripple spec={spec} />');
	await fireEvent.click(bandCopy('Copy install command'));
	expect(writeText).toHaveBeenLastCalledWith('npm i @ripple-ui/react');

	await fireEvent.click(view.getByRole('button', { name: 'HTML' }));
	expect(band.textContent).toContain('npm i @ripple-ui/embed');
	await fireEvent.click(bandCopy('Copy usage snippet'));
	expect(writeText).toHaveBeenLastCalledWith("import { mount } from '@ripple-ui/embed';\n\nmount(document.querySelector('#card'), spec);");
	// The dock's strip stays on the Svelte command.
	expect(stripCopy().closest('.strip')?.textContent).toContain('bun add @ripple-ui/svelte');
});
