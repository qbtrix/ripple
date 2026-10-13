// widgets/composite/Agenda.test.ts: the agenda widget: registry and bind
// contract, start times from `start`, ticking, reordering, inline minutes,
// run mode counting down and Next closing the item, bound state through
// Ripple, and streamed parity with id-less and field-less items.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import Ripple from '$lib/Ripple.svelte';
import { expectStreamParity } from '$lib/streaming/__fixtures__/stream-parity.js';
import { getWidget } from '../index.js';
import { getBindContract } from '@ripple-ui/core';
import Agenda from './Agenda.svelte';
import { move, readItems, startLabels } from './agenda.js';
import { playCue } from '$lib/sound/index.js';

vi.mock('$lib/sound/index.js', () => ({ playCue: vi.fn() }));
const cues = () => vi.mocked(playCue).mock.calls.map((c) => c[0]);


afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

const items = [
	{ id: 'wins', title: 'Wins', owner: 'Maya Chen', minutes: 5 },
	{ id: 'metrics', title: 'Metrics', minutes: 10, notes: 'Signups and churn' },
	{ id: 'blockers', title: 'Blockers', minutes: 15 }
];
const order = (c: HTMLElement) => [...c.querySelectorAll('[data-item]')].map((n) => n.getAttribute('data-item'));

describe('agenda: data', () => {
	it('registers under its type and aliases, bound on value', () => {
		expect(getWidget('agenda')).toBe(Agenda);
		expect(getWidget('meeting-agenda')).toBe(Agenda);
		expect(getWidget('run-of-show')).toBe(Agenda);
		expect(getBindContract('agenda')).toEqual({ prop: 'value', event: 'onchange' });
	});

	it('reads items, times and moves', () => {
		const rows = readItems([...items, {}, { id: 'wins', minutes: 999 }]);
		expect(rows.map((r) => r.id)).toEqual(['wins', 'metrics', 'blockers', 'i3', 'wins-4']);
		expect(rows[4].minutes).toBe(240);
		expect(startLabels(rows.slice(0, 3), 9 * 60 + 50)).toEqual(['09:50', '09:55', '10:05']);
		expect(startLabels(rows.slice(0, 2), undefined)).toEqual(['+0:00', '+0:05']);
		expect(move([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
	});
});

describe('agenda: behaviour', () => {
	it('ticks, reorders and retimes, reporting new arrays', async () => {
		const onchange = vi.fn();
		const { container } = render(Agenda, { props: { title: 'Sync', start: '10:00', items, onchange } });
		expect(container.querySelector('[data-slot="meta"]')?.textContent).toContain('10:00 to 10:30 · 30 min · 0 of 3 done');
		await fireEvent.click(screen.getByRole('button', { name: 'Wins, not done' }));
		expect(onchange.mock.lastCall![0][0].done).toBe(true);
		await fireEvent.click(screen.getByRole('button', { name: 'Move Blockers up' }));
		expect(order(container)).toEqual(['wins', 'blockers', 'metrics']);
		await fireEvent.click(screen.getByRole('button', { name: '15 minutes, change' }));
		const input = screen.getByRole('textbox', { name: 'Minutes for Blockers' }) as HTMLInputElement;
		input.value = '20';
		await fireEvent.keyDown(input, { key: 'Enter' });
		expect(container.querySelector('[data-slot="meta"]')?.textContent).toContain('10:00 to 10:35');
		const starts = [...container.querySelectorAll('[data-slot="start"]')].map((n) => n.textContent);
		expect(starts).toEqual(['10:00', '10:05', '10:25']);
	});

	it('runs the meeting: counts down the current item, Next closes it', async () => {
		vi.useFakeTimers();
		const { container } = render(Agenda, { props: { title: 'Sync', items } });
		await fireEvent.click(screen.getByRole('button', { name: 'Start meeting' }));
		vi.advanceTimersByTime(3000);
		await tick();
		expect(container.querySelector('[data-item="wins"]')?.getAttribute('aria-current')).toBe('step');
		expect(container.querySelector('[data-slot="countdown"]')?.textContent?.trim()).toBe('4:57 left');
		await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
		expect(container.querySelector('[data-item="wins"]')?.getAttribute('data-done')).toBe('true');
		expect(container.querySelector('[data-item="metrics"]')?.getAttribute('aria-current')).toBe('step');
		expect(container.querySelector('[data-slot="countdown"]')?.textContent?.trim()).toBe('10:00 left');
	});

	it('writes the edited items to bound state', async () => {
		const { container } = render(Ripple, {
			props: { spec: { state: {}, ui: { type: 'flex', children: [{ type: 'agenda', bind: '{state.agenda}', props: { title: 'Sync', items } }, { type: 'text', props: { text: '{state.agenda[0].done}' } }] } } }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Wins, not done' }));
		await tick();
		expect(container.textContent).toContain('true');
		expect(container.querySelector('[data-item="wins"]')?.getAttribute('data-done')).toBe('true');
	});

	it('streams with id-less and field-less items and ends equal to the whole render', async () => {
		await expectStreamParity({ ui: { type: 'agenda', props: { title: 'Sync', start: '10:00', items: [items[0], {}, { title: 'Blockers' }, items[1]] } } });
	});
});

describe('agenda: sound', () => {
	it("chimes when the running item's time is up", async () => {
		vi.useFakeTimers();
		vi.mocked(playCue).mockClear();
		render(Agenda, { props: { title: 'Sync', items } });
		await fireEvent.click(screen.getByRole('button', { name: 'Start meeting' }));
		vi.advanceTimersByTime(299_000);
		expect(playCue).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1000);
		expect(cues()).toEqual(['phase']);
		vi.useRealTimers();
	});
});
