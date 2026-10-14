// Treemap.test.ts: the treemap's sanitize rules against hostile model data,
// the share format, the whole-or-absent label rule, and zoom in and out.
// Layout runs in jsdom because tile positions come from d3, not from CSS.
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import Treemap from './Treemap.svelte';
import { sanitize, share, labelTier, layout, CAPTION } from './treemap.js';

// Spec 05 of the polish brief: no title, string value, nameless node, zero,
// negative, empty children, parents with and without their own value.
const HOSTILE = [
	{ name: 'Groceries', children: [{ name: 'Produce', value: 120 }, { name: 'Bakery' }, { name: 'Dairy', value: '45' }] },
	{ value: 80 },
	{ name: 'Rent', value: 1400 },
	{ name: 'Transport', value: 0 },
	{ name: 'Refund', value: -60 },
	{ name: 'Subscriptions', children: [] },
	{ name: 'Utilities', value: 999, children: [{ name: 'Power', value: 140 }, { name: 'Water', value: 70 }] }
];

describe('sanitize', () => {
	const tree = sanitize(HOSTILE);
	test('keeps only nodes that sum above zero, with summed groups', () => {
		expect(tree.map((n) => [n.name, n.value])).toEqual([
			['Groceries', 165],
			['Unnamed', 80],
			['Rent', 1400],
			['Utilities', 210]
		]);
		expect(tree[0].children!.map((c) => c.name)).toEqual(['Produce', 'Dairy']);
	});
	test('a group whose children all drop is dropped', () => {
		expect(sanitize([{ name: 'g', children: [{ name: 'x', value: -1 }] }])).toEqual([]);
	});
	test('junk input is an empty tree', () => {
		expect(sanitize(null)).toEqual([]);
		expect(sanitize([null, 4, 'x', { name: 'n', value: 'abc' }])).toEqual([]);
	});
});

test('share: whole from 10%, one decimal below, <1% under 1%, never 0%', () => {
	expect(share(18, 100)).toBe('18%');
	expect(share(42, 1000)).toBe('4.2%');
	expect(share(5, 100)).toBe('5%');
	expect(share(1, 1000)).toBe('<1%');
	expect(share(2, 383_000)).toBe('<1%');
	expect(share(0, 100)).toBe('<1%');
	expect(share(99.96, 100)).toBe('100%');
});

test('label tiers: name and value, name only, nothing', () => {
	expect(labelTier(64, 40)).toBe('full');
	expect(labelTier(63, 40)).toBe('name');
	expect(labelTier(48, 24)).toBe('name');
	expect(labelTier(47, 60)).toBe('none');
});

test('layout: no root band, captions only on tall groups', () => {
	const rects = layout(sanitize(HOSTILE), 600, 320);
	expect(Math.min(...rects.map((r) => r.y0))).toBe(0);
	const tall = rects.find((r) => r.name === 'Utilities')!;
	const kids = rects.filter((r) => r.parentName === 'Utilities');
	expect(tall.caption).toBe(tall.y1 - tall.y0 >= 64);
	if (tall.caption) for (const k of kids) expect(k.y0).toBeGreaterThanOrEqual(tall.y0 + CAPTION - 2);
	// Children share their top-level group's colour step.
	for (const k of kids) expect(k.step).toBe(tall.step);
});

class SizedResizeObserver {
	constructor(private cb: ResizeObserverCallback) {}
	observe() {
		this.cb([{ contentRect: { width: 600, height: 320 } } as ResizeObserverEntry], this as never);
	}
	disconnect() {}
	unobserve() {}
}

describe('component', () => {
	beforeEach(() => vi.stubGlobal('ResizeObserver', SizedResizeObserver));
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	const BUDGET = [
		{ name: 'Product', value: 50, children: [{ name: 'Dev', value: 30 }, { name: 'Design', value: 20 }] },
		{ name: 'Operations', value: 30 },
		{ name: 'Marketing', value: 20 }
	];
	const tile = (c: HTMLElement, name: string) =>
		[...c.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.getAttribute('aria-label')?.startsWith(name + ','))!;

	test('hostile data renders calmly: real tiles only, no NaN, no error', () => {
		const { container } = render(Treemap, { props: { data: HOSTILE as any, showLabels: false } });
		const labels = [...container.querySelectorAll('.tm-tile')].map((b) => b.getAttribute('aria-label'));
		expect(labels.some((l) => l?.startsWith('Unnamed, 80'))).toBe(true);
		expect(container.textContent).not.toMatch(/NaN|Transport|Refund|Subscriptions/);
		expect(labels.join()).not.toMatch(/Transport|Refund|Subscriptions|NaN/);
		expect(container.querySelector('h3')).toBeNull();
		// showLabels: false hides leaf labels.
		expect(container.querySelector('.tm-label')).toBeNull();
	});

	test('empty after sanitize shows one muted line, not a box', () => {
		const { container } = render(Treemap, { props: { title: 'Spend', data: [{ name: 'x', value: 0 }] } });
		expect(container.textContent).toContain('Nothing to show yet');
		expect(container.querySelector('.tm-plot')).toBeNull();
	});

	test('header shows the title and the compact total; labels show value and share', () => {
		const { container } = render(Treemap, { props: { title: 'Budget', data: BUDGET } });
		expect(container.querySelector('h3')!.textContent).toBe('Budget');
		expect(container.querySelector('.tm-total')!.textContent).toBe('100');
		expect(tile(container, 'Dev').getAttribute('aria-label')).toBe('Dev, 30, 30% of total, in Product, open group');
		expect(tile(container, 'Operations').textContent).toContain('30 · 30%');
	});

	test('zoom: a group zooms and re-bases, Escape and the crumb return, a leaf does not zoom', async () => {
		const { container } = render(Treemap, { props: { title: 'Budget', data: BUDGET } });
		expect(container.querySelector('nav')).toBeNull();

		await fireEvent.click(tile(container, 'Operations'));
		expect(container.querySelector('nav')).toBeNull();
		expect(container.querySelector('[role="tooltip"]')!.textContent).toContain('30% of total');

		await fireEvent.click(tile(container, 'Product'));
		await tick();
		expect(container.querySelector('nav')!.textContent).toContain('Product');
		expect(container.querySelector('.tm-total')!.textContent).toBe('50');
		expect(tile(container, 'Dev').getAttribute('aria-label')).toBe('Dev, 30, 60% of total');

		await fireEvent.keyDown(tile(container, 'Dev'), { key: 'Escape' });
		await tick();
		expect(container.querySelector('nav')).toBeNull();
		expect(container.querySelector('.tm-total')!.textContent).toBe('100');

		await fireEvent.click(tile(container, 'Design'));
		await tick();
		const all = [...container.querySelectorAll('nav button')].find((b) => b.textContent === 'All')!;
		await fireEvent.click(all);
		expect(container.querySelector('nav')).toBeNull();
	});

	test('showBreadcrumb: false still leaves a way back', async () => {
		const { container } = render(Treemap, { props: { data: BUDGET, showBreadcrumb: false } });
		await fireEvent.click(tile(container, 'Dev'));
		await tick();
		const nav = container.querySelector('nav')!;
		expect(nav.textContent).not.toContain('All');
		await fireEvent.click(nav.querySelector('button')!);
		expect(container.querySelector('nav')).toBeNull();
	});

	test('a label that overflows its tile is hidden, not clamped', async () => {
		// jsdom measures nothing, so fake an overflowing label box.
		const sh = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
			return this.classList.contains('tm-label') ? 200 : 0;
		});
		const { container } = render(Treemap, { props: { data: BUDGET } });
		await tick();
		await tick();
		const labels = [...container.querySelectorAll<HTMLElement>('.tm-label')];
		expect(labels.length).toBeGreaterThan(0);
		for (const l of labels) expect(l.dataset.fit).toBe('none');
		expect(container.textContent).not.toContain('…');
		sh.mockRestore();
	});
});
