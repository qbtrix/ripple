// BulkActionBar.test.ts: the sanitize rules (count, plural, actions), the
// inline-versus-More split at both container sizes, and the clear / action
// callbacks on the mounted widget.

import { fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, test, vi } from 'vitest';
import BulkActionBar from './BulkActionBar.svelte';
import { countLabel, normalizeActions, sanitizeCount, splitActions } from './bulk-action-bar.js';

describe('sanitizeCount', () => {
	test.each([
		['5', 5],
		[Number.NaN, 0],
		[0, 0],
		[-3, 0],
		[2.6, 3],
		['junk', 0],
		[null, 0]
	])('%s -> %s', (v, want) => expect(sanitizeCount(v)).toBe(want));
});

describe('countLabel', () => {
	test.each([
		[1, 'item', '1', 'item selected'],
		[1, 'category', '1', 'category selected'],
		[12480, 'category', '12,480', 'categories selected'],
		[1000000, 'box', '1,000,000', 'boxes selected'],
		[3, 'match', '3', 'matches selected'],
		[2, 'day', '2', 'days selected'],
		[5, undefined, '5', 'items selected'],
		[5, '   ', '5', 'items selected'],
		[12480, 'subscription renewal reminder', '12,480', 'subscription renewal reminders selected']
	])('%s %s', (n, noun, count, rest) => expect(countLabel(n, noun)).toEqual({ count, rest }));
});

describe('normalizeActions', () => {
	const out = normalizeActions([
		{ id: 'del', label: 'Delete', variant: 'destructive' },
		{ label: 'Export', icon: 'download' },
		{ id: 'blank', label: '   ' },
		{ id: 'odd', label: 'Duplicate', variant: 'primary' },
		null,
		{ id: 'lock', label: 'Lock', disabled: true }
	]);

	test('drops blank labels, falls back id to label, puts destructive last', () => {
		expect(out.map((a) => a.id)).toEqual(['Export', 'odd', 'lock', 'del']);
		expect(out.map((a) => a.destructive)).toEqual([false, false, false, true]);
		expect(out.find((a) => a.id === 'lock')?.disabled).toBe(true);
	});

	test('a non-array is empty', () => expect(normalizeActions('nope')).toEqual([]));
});

describe('splitActions', () => {
	const make = (labels: string[]) => normalizeActions(labels.map((label) => ({ id: label, label })));
	const menu = (labels: string[], wide: boolean) => splitActions(make(labels), wide).menu.map((a) => a.label);

	test('three short actions fit at both sizes', () => {
		expect(menu(['Assign role', 'Send email', 'Delete'], true)).toEqual([]);
		expect(menu(['Assign role', 'Send email', 'Delete'], false)).toEqual([]);
	});

	test('wide keeps 4, narrow keeps 3 once there are 5 or more', () => {
		const five = ['A', 'B', 'C', 'D', 'E'];
		expect(menu(five, true)).toEqual(['E']);
		expect(menu(five, false)).toEqual(['D', 'E']);
		expect(menu(['A', 'B', 'C', 'D'], false)).toEqual([]);
	});

	test('long labels go to More by width', () => {
		const labels = ['Reschedule all', 'Send a personalised reminder', 'Archive'];
		expect(menu(labels, true)).toEqual(['Send a personalised reminder']);
		expect(menu(labels, false)).toEqual(['Send a personalised reminder']);
		expect(menu(['Move to the folder'], false)).toEqual(['Move to the folder']);
		expect(menu(['Move to the folder'], true)).toEqual([]);
	});
});

describe('BulkActionBar', () => {
	const actions = [
		{ id: 'del', label: 'Delete', variant: 'destructive' as const },
		{ id: 'assign', label: 'Assign role' }
	];

	test('renders nothing at zero', () => {
		const { container } = render(BulkActionBar, { props: { selectedCount: 0, actions } });
		expect(container.querySelector('[role="group"]')).toBeNull();
	});

	test('destructive renders last, after a divider, and onaction gets the id', async () => {
		const onaction = vi.fn();
		const { container } = render(BulkActionBar, { props: { selectedCount: '5' as never, actions, onaction } });
		const buttons = [...container.querySelectorAll<HTMLButtonElement>('.rbab-act')];
		expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Assign role', 'Delete']);
		expect(container.querySelector('.rbab-divider')).not.toBeNull();
		expect(container.textContent).toContain('5 items selected');
		await fireEvent.click(buttons[1]);
		expect(onaction).toHaveBeenCalledWith('del');
	});

	test('the group is not a toolbar', () => {
		const { container } = render(BulkActionBar, { props: { selectedCount: 2, actions } });
		expect(container.querySelector('[role="toolbar"]')).toBeNull();
		expect(container.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Bulk actions');
	});

	test('Clear fires onclear and hides the bar until the count changes', async () => {
		const onclear = vi.fn();
		const { container, rerender } = render(BulkActionBar, { props: { selectedCount: 2, actions, onclear } });
		await fireEvent.click(container.querySelector('[aria-label="Clear selection"]')!);
		expect(onclear).toHaveBeenCalledOnce();
		expect(container.querySelector('[role="group"]')).toBeNull();
		await rerender({ selectedCount: 3, actions, onclear });
		await tick();
		expect(container.querySelector('[role="group"]')).not.toBeNull();
	});

	test('Escape inside the bar clears', async () => {
		const onclear = vi.fn();
		const { container } = render(BulkActionBar, { props: { selectedCount: 2, actions, onclear } });
		await fireEvent.keyDown(container.querySelector('.rbab-act')!, { key: 'Escape' });
		expect(onclear).toHaveBeenCalledOnce();
		expect(container.querySelector('[role="group"]')).toBeNull();
	});

	test('an unknown icon renders the label alone', () => {
		const { container } = render(BulkActionBar, {
			props: { selectedCount: 1, actions: [{ id: 'x', label: 'Launch', icon: 'rocket-ship-sparkle' }] }
		});
		const btn = container.querySelector('.rbab-act')!;
		expect(btn.querySelector('svg')).toBeNull();
		expect(btn.textContent?.trim()).toBe('Launch');
	});

	test('overflow shows a More trigger', () => {
		const many = ['A', 'B', 'C', 'D', 'E', 'F'].map((l) => ({ id: l, label: l }));
		const { container } = render(BulkActionBar, { props: { selectedCount: 9, actions: many } });
		const labels = [...container.querySelectorAll('.rbab-act')].map((b) => b.textContent?.trim());
		expect(labels).toEqual(['A', 'B', 'C', 'D', 'More']);
	});
});
