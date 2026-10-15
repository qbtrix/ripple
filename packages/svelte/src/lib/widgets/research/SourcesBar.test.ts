// SourcesBar.test.ts: the component half of sources-bar. Copy reports only
// what actually happened, `onclick` swaps the disclosure for a host-owned
// button without nesting interactive elements, and odd data renders cleanly.
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SourcesBar from './SourcesBar.svelte';

const SOURCES = [
	{ name: 'Lanternpost', url: 'https://lanternpost.example.com/a' },
	{ name: 'Harbor Ledger', url: 'harborledger.example.org/b' },
	{ name: 'Ironvale Briefing', url: 'javascript:alert(1)' }
];

function mockClipboard(writeText: (t: string) => Promise<void>) {
	const write = vi.fn(writeText);
	Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
	return write;
}

const settle = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('sources-bar', () => {
	it('names the sources in the closed row and links only absolute http(s) URLs', () => {
		const { container } = render(SourcesBar, { props: { sources: SOURCES } });
		const summary = container.querySelector('summary')!;
		expect(summary.getAttribute('aria-label')).toBe('3 sources: Lanternpost, Harbor Ledger, Ironvale Briefing');
		expect(summary.textContent).toContain('Lanternpost, Harbor Ledger');
		const links = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
		expect(links).toEqual(['https://lanternpost.example.com/a', 'https://harborledger.example.org/b']);
		for (const a of container.querySelectorAll('a')) expect(a.getAttribute('rel')).toBe('noopener noreferrer');
		expect(summary.querySelector('button, a')).toBeNull();
	});

	it('copy writes the numbered list and says so after the write resolves', async () => {
		const write = mockClipboard(() => Promise.resolve());
		const { container, getByLabelText } = render(SourcesBar, { props: { sources: SOURCES } });
		await fireEvent.click(getByLabelText('Copy sources'));
		await settle();
		expect(write).toHaveBeenCalledWith('1. Lanternpost, https://lanternpost.example.com/a\n2. Harbor Ledger, https://harborledger.example.org/b\n3. Ironvale Briefing');
		expect(container.querySelector('[role="status"]')!.textContent).toBe('Sources copied');
	});

	it('copy reports failure when the clipboard write rejects', async () => {
		mockClipboard(() => Promise.reject(new Error('denied')));
		const { container, getByLabelText } = render(SourcesBar, { props: { sources: SOURCES } });
		await fireEvent.click(getByLabelText('Copy sources'));
		await settle();
		expect(container.querySelector('[role="status"]')!.textContent).toBe('Could not copy sources');
	});

	it('with onclick renders a plain button, no details, nothing nested', async () => {
		const onclick = vi.fn();
		const { container } = render(SourcesBar, { props: { sources: SOURCES, onclick } });
		expect(container.querySelector('details')).toBeNull();
		const root = container.querySelector('.rsbar')!;
		expect(root.getAttribute('role')).toBeNull();
		for (const b of container.querySelectorAll('button')) expect(b.parentElement!.closest('button, a')).toBeNull();
		await fireEvent.click(container.querySelector('.rsbar-summary')!);
		expect(onclick).toHaveBeenCalledOnce();
	});

	it('empty sources: a designed line and no live buttons', () => {
		const { container } = render(SourcesBar, { props: { sources: [], share: true, copy: true } });
		expect(container.textContent).toContain('No sources');
		expect(container.querySelector('button')).toBeNull();
	});

	it('count over the listed entries shows +N and the unlisted line', () => {
		const sources = ['Kestrel', 'Oakmere', 'Rivergate', 'Saltmarsh', 'Copperline'].map((name) => ({ name }));
		const { container } = render(SourcesBar, { props: { sources, count: 48, label: 'pages read' } });
		const text = (container.textContent ?? '').replace(/\s+/g, ' ');
		expect(text).toContain('48 pages read');
		expect(text).toContain('+45');
		expect(text).toContain('and 43 more not listed');
	});
});
