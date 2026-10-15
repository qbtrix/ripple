// routes/pawbar/landing-chips.test.ts — Replay mode (no PUBLIC_PAWBAR_LIVE, as in vitest) shows every chip.
// The expanded panel lists every live chip, store chips included, in their
// groups; the chips that replay here sort first (so the collapsed row leads
// with them and groups with none come last). A chip with a recorded or
// hand-written answer replays it; any other opens Paw OS with its prompt, the
// same handoff a typed message takes, and is described as "Opens in Paw OS".

import { fireEvent, render } from '@testing-library/svelte';
import { afterEach, expect, test, vi } from 'vitest';
import Landing from '../+page.svelte';
import { chatPrompts, groupedSuggestions } from '../live/scenarios.js';
import { answerPool } from './recorded.js';
import { pawosHandoffUrl } from './session.svelte.js';

// The landing's server load output (+page.server.ts); the sample's markup is not under test here.
const props = { data: { codeSample: '' } };

vi.setConfig({ testTimeout: 30_000 });
const waitFor = <T>(fn: () => T | Promise<T>) => vi.waitFor(fn, { timeout: 15_000, interval: 50 });

afterEach(() => vi.restoreAllMocks());

const chipTitle = (b: Element) =>
	[...b.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('').trim();

test('replay mode renders every live chip, the ones that replay here first', async () => {
	const view = render(Landing, { props });
	const toggle = view.getByRole('button', { name: 'Show all suggestions' });
	expect(toggle.getAttribute('aria-expanded')).toBe('false');
	// The collapsed row opens on chips that replay on the page; handoffs follow.
	const row = [...view.container.querySelectorAll('#ripple-suggestions button.chip')];
	expect(row.length).toBeGreaterThan(0);
	expect(row[0].hasAttribute('aria-describedby')).toBe(false);
	const out = row.findIndex((b) => b.hasAttribute('aria-describedby'));
	if (out >= 0) expect(row.slice(out).every((b) => b.hasAttribute('aria-describedby'))).toBe(true);
	await fireEvent.click(toggle);
	const shown: [string | null | undefined, string[]][] = [...view.container.querySelectorAll('.chip-group')].map((g) => [
		g.querySelector('.chips')?.getAttribute('aria-label'),
		[...g.querySelectorAll('button.chip')].map(chipTitle)
	]);
	const local = new Set(answerPool.filter((s) => !s.needsStore).map((s) => s.id));
	const all = groupedSuggestions([...answerPool, ...chatPrompts]);
	const expected: [string, string[]][] = [];
	for (const c of [...all.filter((c) => local.has(c.id)), ...all.filter((c) => !local.has(c.id))]) {
		const at = expected.find(([g]) => g === c.group);
		if (at) at[1].push(c.title);
		else expected.push([c.group, [c.title]]);
	}
	expect(shown).toEqual(expected);
	// Groups with no chip that replays here (Browse & discover leads live) come last.
	expect(shown.at(-1)?.[1].every((t) => !all.some((c) => c.title === t && local.has(c.id)))).toBe(true);
	for (const t of ['Order a burger', 'Book a table', 'Help me pick a laptop', 'Plan a trip with me']) expect(shown.flatMap(([, ts]) => ts)).toContain(t);
});

test('a chip with no recording hands its prompt to Paw OS; a recorded chip still replays', async () => {
	const open = vi.spyOn(window, 'open').mockReturnValue(null);
	const view = render(Landing, { props });
	await fireEvent.click(view.getByRole('button', { name: 'Show all suggestions' }));

	const table = view.getByRole('button', { name: 'Book a table step by step' });
	expect(document.getElementById(table.getAttribute('aria-describedby')!)?.textContent).toBe('Opens in Paw OS, free early-access credits');
	await fireEvent.click(table);
	expect(open).toHaveBeenCalledOnce();
	expect(open.mock.calls[0][0]).toBe(pawosHandoffUrl('Book a table for 4 on Saturday evening').url);
	await waitFor(() => expect(view.getByRole('link', { name: /Continue in Paw OS/ })).toBeTruthy());
	// No bill splitter fallback stood in for it.
	expect(view.queryByText('No recording matches that yet, so here is the bill splitter.')).toBeNull();

	await fireEvent.click(view.getByRole('button', { name: 'Show all suggestions' }));
	const savings = view.getByRole('button', { name: 'Watch savings grow' });
	expect(savings.hasAttribute('aria-describedby')).toBe(false);
	await fireEvent.click(savings);
	await waitFor(() => expect(view.getAllByText('Replaying a recorded answer that matches.')).toHaveLength(1));
	expect(open).toHaveBeenCalledOnce();
});
