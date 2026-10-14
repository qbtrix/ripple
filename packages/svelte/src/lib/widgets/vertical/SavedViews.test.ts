// widgets/vertical/SavedViews.test.ts: jsdom coverage for SavedViews as a
// single-choice control: one tab stop, arrows select and call onchange, the
// default commit, New view only with an oncreate handler, the "N more"
// disclosure, a 0 count rendering as 0, and the inactive count ink keeping
// 4.5:1 on the site card in both themes.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import SavedViews from './SavedViews.svelte';
import SOURCE from './SavedViews.svelte?raw';
import { contrast, fromHex, mix, oklch, toRgb } from '$lib/ui/__fixtures__/contrast.js';

const VIEWS = [
	{ id: 'all', label: 'All issues', count: 142, pinned: true },
	{ id: 'assigned', label: 'Assigned to me', count: 8 },
	{ id: 'high', label: 'High priority', icon: 'alert-circle', count: 0 },
	{ id: 'closed', label: 'Closed', count: 2847 }
];

const radios = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('[role="radio"]'));

describe('SavedViews', () => {
	it('is a named radiogroup with exactly one tab stop on the selected view', () => {
		const { container, getByRole } = render(SavedViews, { props: { views: VIEWS, value: 'assigned' } });
		// The group is display: contents for layout; it must still resolve by role and name.
		expect(getByRole('radiogroup', { name: 'Saved views' })).toBeTruthy();
		const r = radios(container);
		expect(r.map((el) => el.tabIndex)).toEqual([-1, 0, -1, -1]);
		expect(r[1].getAttribute('aria-checked')).toBe('true');
		expect(r[3].getAttribute('aria-label')).toBe('Closed, 2,847 items');
	});

	it('arrows move and select with wrap; Home/End jump', async () => {
		const onchange = vi.fn();
		const { container } = render(SavedViews, { props: { views: VIEWS, value: 'all', onchange } });
		const r = radios(container);
		await fireEvent.keyDown(r[0], { key: 'ArrowLeft' });
		expect(onchange).toHaveBeenLastCalledWith('closed');
		await fireEvent.keyDown(r[0], { key: 'ArrowRight' });
		expect(onchange).toHaveBeenLastCalledWith('assigned');
		await fireEvent.keyDown(r[0], { key: 'End' });
		expect(onchange).toHaveBeenLastCalledWith('closed');
	});

	it('click selects; re-clicking the selected view is a no-op', async () => {
		const onchange = vi.fn();
		const { container } = render(SavedViews, { props: { views: VIEWS, value: 'all', onchange } });
		await fireEvent.click(radios(container)[0]);
		expect(onchange).not.toHaveBeenCalled();
		await fireEvent.click(radios(container)[3]);
		expect(onchange).toHaveBeenCalledWith('closed');
		expect(radios(container)[3].getAttribute('aria-checked')).toBe('true');
	});

	it('commits the default (first pinned) when value names no view', () => {
		const onchange = vi.fn();
		const views = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', pinned: true }];
		const { container } = render(SavedViews, { props: { views, value: 'gone', onchange } });
		expect(onchange).toHaveBeenCalledWith('b');
		expect(radios(container)[1].getAttribute('aria-checked')).toBe('true');
	});

	it('renders New view only when canCreate AND oncreate are set', async () => {
		const a = render(SavedViews, { props: { views: VIEWS, canCreate: true } });
		expect(a.queryByRole('button', { name: 'New view' })).toBeNull();
		a.unmount();
		const oncreate = vi.fn();
		const b = render(SavedViews, { props: { views: VIEWS, canCreate: true, oncreate } });
		const btn = b.getByRole('button', { name: 'New view' });
		expect(btn.closest('[role="radiogroup"]')).toBeNull();
		await fireEvent.click(btn);
		expect(oncreate).toHaveBeenCalledOnce();
	});

	it('folds past 8 views and toggles aria-expanded on N more', async () => {
		const views = Array.from({ length: 14 }, (_, i) => ({ id: `v${i}`, label: `View ${i}` }));
		const { container, getByRole } = render(SavedViews, { props: { views, value: 'v9' } });
		expect(radios(container)).toHaveLength(8);
		expect(radios(container)[7].getAttribute('aria-checked')).toBe('true');
		const more = getByRole('button', { name: /6 more/ });
		expect(more.getAttribute('aria-expanded')).toBe('false');
		await fireEvent.click(more);
		expect(radios(container)).toHaveLength(14);
		expect(getByRole('button', { name: /Show fewer/ }).getAttribute('aria-expanded')).toBe('true');
	});

	it('shows a 0 count as 0 and renders a known icon', () => {
		const { container } = render(SavedViews, { props: { views: VIEWS, value: 'all' } });
		expect(radios(container)[2].textContent).toContain('0');
		expect(radios(container)[2].querySelector('svg')).not.toBeNull();
	});

	it('shows an empty line, never a blank strip, with no views', () => {
		const { getByText } = render(SavedViews, { props: { views: [] } });
		expect(getByText('No saved views yet')).toBeTruthy();
	});

	it('keeps the quieter inactive count at 4.5:1 on the site card in both themes', () => {
		const pct = SOURCE.match(/\.sv__count\s*\{\s*color:\s*color-mix\(in oklab,\s*var\(--ripple-muted-foreground\)\s+([\d.]+)%,\s*var\(--ripple-surface\)\)/);
		expect(pct).toBeTruthy();
		const p = Number(pct![1]) / 100;
		// site.css light and dark: --muted-foreground on --card.
		const themes = {
			light: [oklch(0.43, 0.01, 95), fromHex('#efeee8')],
			dark: [oklch(0.75, 0.015, 260), fromHex('#1d1d1a')]
		} as const;
		for (const [muted, card] of Object.values(themes)) {
			expect(contrast(toRgb(mix(muted, card, p)), toRgb(card))).toBeGreaterThanOrEqual(4.5);
		}
	});
});
