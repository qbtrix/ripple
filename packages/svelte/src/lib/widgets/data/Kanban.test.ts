// widgets/data/Kanban.test.ts: the kanban widget in jsdom. Read-only without
// onchange (no drag, no move buttons); with onchange every card moves through
// its Move menu, by index, with onchange/onmove, a live announcement and focus
// returned to the moved card.
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import Kanban from './Kanban.svelte';

const columns = [
	{ id: 'todo', title: 'To do' },
	{ id: 'in-progress', title: 'In progress' },
	{ id: 'done', title: 'Done' }
];

const cards = [
	{ id: 1, title: 'Paint the fence', status: 'todo' },
	{ id: 2, title: 'Fix the gate latch', status: 'in_progress' },
	{ id: 3, title: 'Order seed packets', status: 'todo' },
	{ id: 4, title: 'Sweep the porch', status: 'done' }
];

async function openMenu(button: Element) {
	await fireEvent.pointerDown(button, { button: 0, pointerType: 'mouse' });
	flushSync();
}

describe('Kanban', () => {
	it('names each lane with its count, matching statuses loosely', () => {
		const { getByRole } = render(Kanban, { props: { columns, value: cards } });
		expect(getByRole('region', { name: 'To do, 2 cards' })).toBeTruthy();
		expect(getByRole('region', { name: 'In progress, 1 card' })).toBeTruthy();
		expect(getByRole('region', { name: 'Done, 1 card' })).toBeTruthy();
	});

	it('is read-only without onchange: nothing draggable, no move buttons', () => {
		const { container, queryAllByRole } = render(Kanban, { props: { columns, value: cards } });
		expect(container.querySelectorAll('[draggable]').length).toBe(0);
		expect(queryAllByRole('button', { name: /^Move / }).length).toBe(0);
	});

	it('puts unmatched and status-less cards in Other instead of dropping them', () => {
		const { getByRole, getByText } = render(Kanban, {
			props: { columns, value: [...cards, { id: 9, title: 'Call the plumber', status: 'blocked' }, { title: 'Loose card' }] }
		});
		expect(getByRole('region', { name: 'Other, 2 cards' })).toBeTruthy();
		expect(getByText('Call the plumber')).toBeTruthy();
		expect(getByText('Loose card')).toBeTruthy();
	});

	it('caps a lane at 4 cards with Show more, and the count still counts all', async () => {
		const many = Array.from({ length: 7 }, (_, i) => ({ id: i, title: `Task ${i + 1}`, status: 'todo' }));
		const { getByRole, queryByText } = render(Kanban, { props: { columns, value: many } });
		expect(getByRole('region', { name: 'To do, 7 cards' })).toBeTruthy();
		expect(queryByText('Task 5')).toBeNull();
		const more = getByRole('button', { name: 'Show 3 more' });
		await fireEvent.click(more);
		expect(queryByText('Task 7')).not.toBeNull();
		expect(getByRole('button', { name: 'Show less' })).toBeTruthy();
	});

	it('shows Untitled card, empty lanes and the empty-board line', () => {
		const a = render(Kanban, { props: { columns, value: [{ id: 1, title: '', status: 'todo' }] } });
		expect(a.getByText('Untitled card')).toBeTruthy();
		expect(a.getAllByText('No cards').length).toBe(2);
		a.unmount();
		const b = render(Kanban, { props: { columns, value: [] } });
		expect(b.getByText('No cards yet')).toBeTruthy();
		expect(b.queryByText('No cards')).toBeNull();
	});

	it('with onchange, moves a card through its menu by index', async () => {
		const onchange = vi.fn();
		const onmove = vi.fn();
		const twins = [
			{ id: 5, title: 'First twin', status: 'todo' },
			{ id: 5, title: 'Second twin', status: 'todo' }
		];
		const { container, getByRole, getAllByRole } = render(Kanban, { props: { columns, value: twins, onchange, onmove } });
		expect(container.querySelectorAll('[draggable="true"]').length).toBe(2);
		await openMenu(getByRole('button', { name: 'Move Second twin' }));
		const items = getAllByRole('menuitem');
		expect(items.map((i) => i.textContent?.trim())).toEqual(['In progress', 'Done']);
		await fireEvent.click(items[1]);
		expect(onchange).toHaveBeenCalledTimes(1);
		const next = onchange.mock.calls[0][0];
		expect(next).toHaveLength(2);
		expect(next[0].status).toBe('todo');
		expect(next[1].status).toBe('done');
		expect(onmove).toHaveBeenCalledWith({ id: 5, from: 'todo', to: 'done' });
		expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe('Moved Second twin to Done.');
	});

	it('returns focus to the moved card in its new lane', async () => {
		const { getByRole, getAllByRole, rerender } = render(Kanban, {
			props: { columns, value: cards, onchange: () => {} }
		});
		await openMenu(getByRole('button', { name: 'Move Paint the fence' }));
		await fireEvent.click(getAllByRole('menuitem')[1]);
		await rerender({ columns, value: cards.map((c, i) => (i === 0 ? { ...c, status: 'done' } : c)), onchange: () => {} });
		await new Promise((r) => setTimeout(r, 0));
		expect(getByRole('region', { name: 'Done, 2 cards' })).toBeTruthy();
		expect(document.activeElement).toBe(getByRole('button', { name: 'Move Paint the fence' }));
	});

	it('does not offer Other as a move target', async () => {
		const { getByRole, getAllByRole } = render(Kanban, {
			props: { columns, value: [{ id: 1, title: 'Stray', status: 'zzz' }], onchange: () => {} }
		});
		await openMenu(getByRole('button', { name: 'Move Stray' }));
		expect(getAllByRole('menuitem').map((i) => i.textContent?.trim())).toEqual(['To do', 'In progress', 'Done']);
	});
});
