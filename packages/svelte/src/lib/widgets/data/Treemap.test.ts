// Treemap.test.ts: the treemap's sanitize rules against hostile model data,
// the share format, the whole-or-absent label rule, and zoom in and out.
// Layout runs in jsdom because tile positions come from d3, not from CSS.
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import Treemap from './Treemap.svelte';
import { sanitize, share, labelTier, nameLines, fitLine, layout, CAPTION, NEST_GAP, TOP_GAP, GAP, RAMP, RAMP_DARK } from './treemap.js';

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

test('name lines follow tile height, capped at 4 above the value line', () => {
	expect(nameLines(40, 6)).toBe(1);
	expect(nameLines(61, 6)).toBe(2);
	expect(nameLines(76, 6)).toBe(3);
	expect(nameLines(225, 6)).toBe(4);
});

test('footer line: whole items that fit, largest first, keeping room for "+N more"', () => {
	const more = () => 40;
	expect(fitLine([50, 50], 10, 110, more)).toEqual([0, 1]);
	// The second item fits alone but not with the tail the third would need.
	expect(fitLine([50, 50, 50], 10, 150, more)).toEqual([0]);
	// One too wide is skipped; a shorter one after it still shows.
	expect(fitLine([200, 40, 30], 10, 140, more)).toEqual([1, 2]);
	expect(fitLine([200], 10, 100, more)).toEqual([]);
});

test('dark ramp: same steps, a higher floor', () => {
	expect(RAMP_DARK.length).toBe(RAMP.length);
	expect(RAMP_DARK[0]).toBe(RAMP[0]);
	expect(RAMP_DARK.at(-1)!).toBeGreaterThanOrEqual(22);
	for (let i = 1; i < RAMP_DARK.length; i++) expect(RAMP_DARK[i]).toBeLessThan(RAMP_DARK[i - 1]);
});

test('layout: top-level siblings sit further apart than tiles inside a group', () => {
	expect(TOP_GAP).toBeGreaterThanOrEqual(3 * GAP);
	const rects = layout(sanitize([{ name: 'g', children: [{ name: 'a', value: 5 }, { name: 'b', value: 5 }] }, { name: 'c', value: 10 }]), 600, 320);
	const g = rects.find((r) => r.name === 'g')!;
	const c = rects.find((r) => r.name === 'c')!;
	expect(Math.max(c.x0 - g.x1, g.x0 - c.x1, c.y0 - g.y1, g.y0 - c.y1)).toBeCloseTo(TOP_GAP);
});

test('layout: a group filling a zoomed view gets no caption', () => {
	const one = sanitize([{ name: 'atlas', children: [{ name: 'a', value: 5 }, { name: 'b', value: 3 }] }]);
	expect(layout(one, 600, 320).find((r) => r.name === 'atlas')!.caption).toBe(true);
	expect(layout(one, 600, 320, undefined, 6, true).find((r) => r.name === 'atlas')!.caption).toBe(false);
	// A sibling too small to see does not stop the group filling the view (spec 06).
	const two = sanitize([{ name: 'atlas', children: [{ name: 'a', value: 220000 }, { name: 'b', value: 800 }] }, { name: 'notes', value: 14 }]);
	expect(layout(two, 600, 320, undefined, 6, true).find((r) => r.name === 'atlas')!.caption).toBe(false);
});

test('layout: no root band, captions only on tall groups', () => {
	const rects = layout(sanitize(HOSTILE), 600, 320);
	expect(Math.min(...rects.map((r) => r.y0))).toBe(0);
	const tall = rects.find((r) => r.name === 'Utilities')!;
	const kids = rects.filter((r) => r.parentName === 'Utilities');
	expect(tall.caption).toBe(tall.y1 - tall.y0 >= 64 && tall.x1 - tall.x0 >= 64);
	// Deeper groups never get a caption strip.
	expect(layout(sanitize([{ name: 'a', children: [{ name: 'b', children: [{ name: 'c', value: 1 }, { name: 'd', value: 1 }] }] }]), 600, 320).filter((r) => r.caption).map((r) => r.name)).toEqual(['a']);
	if (tall.caption) for (const k of kids) expect(k.y0).toBeGreaterThanOrEqual(tall.y0 + CAPTION - 2);
	// Children share their top-level group's colour step.
	for (const k of kids) expect(k.step).toBe(tall.step);
});

// Spec 04 of the polish brief: names too long for their tiles.
const LONG = [
	{
		name: 'Contractor and freelance design services',
		children: [
			{ name: 'Illustration and editorial artwork commissions', value: 2600 },
			{ name: 'Motion graphics for the onboarding walkthrough', value: 1600 }
		]
	},
	{ name: 'Cloud infrastructure and managed databases', value: 3100 },
	{ name: 'Recruiting agency fees for senior engineering roles', value: 1900 },
	{ name: 'Conference travel, lodging and per diem', value: 800 },
	{ name: 'Miscellaneous office supplies and snacks', value: 240 }
];

test('layout: a caption that does not fit its group falls back to the share, one line (spec 04 at 360)', () => {
	const group = (rects: ReturnType<typeof layout>) => rects.find((r) => r.name.startsWith('Contractor'))!;
	const kids = (rects: ReturnType<typeof layout>) => rects.filter((r) => r.parentName?.startsWith('Contractor'));
	// The box alone would pay for a caption...
	const plain = layout(sanitize(LONG), 360, 320);
	expect(group(plain).caption).toBe(true);
	expect(Math.min(...kids(plain).map((k) => k.y0))).toBe(group(plain).y0 + CAPTION);
	expect(group(plain).captionLabel).toBe('Contractor and freelance design services\u00a0·\u00a041%');
	// ...the measured line is wider than the tile, so the caption is the share alone, still one strip.
	const measured = layout(sanitize(LONG), 360, 320, (t) => t.length * 6);
	expect(group(measured).captionLabel).toBe('41%');
	expect(group(measured).captionH).toBe(CAPTION);
	expect(Math.min(...kids(measured).map((k) => k.y0))).toBe(group(measured).y0 + CAPTION);
	// A short caption that fits keeps its name.
	expect(layout(sanitize(HOSTILE), 600, 320, (t) => t.length * 6).find((r) => r.name === 'Utilities')!.captionLabel).toMatch(/^Utilities/);
});

test('layout: nested groups that hold groups get the wider gap', () => {
	const rects = layout(
		sanitize([{ name: 'p', children: [{ name: 'a', children: [{ name: 'g', children: [{ name: 'x', value: 5 }, { name: 'y', value: 3 }] }, { name: 'b', value: 4 }] }] }, { name: 'q', value: 9 }]),
		600,
		320
	);
	const g = rects.find((r) => r.name === 'g')!;
	const b = rects.find((r) => r.name === 'b')!;
	const gap = Math.max(b.x0 - g.x1, g.x0 - b.x1, b.y0 - g.y1, g.y0 - b.y1);
	expect(gap).toBeCloseTo(NEST_GAP);
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
		expect(container.querySelector('[role="tooltip"]')!.textContent).toContain('30 · 30% of total');

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
		// The back button names where it goes; the scope line names where the reader is.
		expect(nav.querySelector('button')!.textContent).toBe('Back');
		expect(nav.querySelector('button')!.getAttribute('aria-label')).toBe('Back to All');
		expect(nav.textContent).toContain('Product · 50');
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

	test('a name keeps its label up to four lines; past that the tile shows its share and the footer names it', async () => {
		// jsdom has no layout: a name's box is its per-tile max-height; give names a line count.
		const two = 'Cloud infrastructure';
		const three = 'Cloud infrastructure and managed databases';
		const six = 'Illustration and editorial artwork commissions for the spring catalogue';
		const ch = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
			return this.classList.contains('tm-name') ? parseFloat(this.style.maxHeight) : this.classList.contains('tm-label') ? 200 : 0;
		});
		const sh = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
			if (!this.classList.contains('tm-name')) return 0;
			return this.textContent === six ? 90 : this.textContent === three ? 45 : this.textContent === two ? 30 : 15;
		});
		const { container } = render(Treemap, {
			props: { data: [{ name: two, value: 30 }, { name: three, value: 28 }, { name: six, value: 25 }, { name: 'Recruiting', value: 20 }] }
		});
		await tick();
		await tick();
		const label = (name: string) => tile(container, name).querySelector<HTMLElement>('.tm-label')!;
		expect(label(two).dataset.fit).toBe('full');
		expect(label(three).dataset.fit).toBe('full');
		expect(label(six).dataset.fit).toBe('pct');
		expect(label('Recruiting').dataset.fit).toBe('full');
		// A tile without its name is listed under the plot with a swatch in its tint.
		const more = container.querySelector('.tm-more')!;
		expect(more.textContent).toContain(`${six} 24%`);
		expect(more.textContent).not.toContain(three);
		expect(more.textContent).not.toContain('Recruiting');
		const entry = more.querySelector<HTMLElement>('.tm-more-item')!;
		expect(entry.querySelector('.tm-swatch')).not.toBeNull();
		expect(entry.getAttribute('style')).toContain('--tm-mix:');
		// Hovering the entry lights its tile and opens the readout.
		await fireEvent.pointerEnter(entry);
		expect(tile(container, six).classList.contains('is-active')).toBe(true);
		expect(entry.classList.contains('is-active')).toBe(true);
		expect(container.querySelector('[role="tooltip"]')!.textContent).toContain(six);
		ch.mockRestore();
		sh.mockRestore();
	});

	test('a value line that does not fit falls back to the share alone under the name', async () => {
		// Only the one-line "value · share" is too wide.
		const sw = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
			return this.closest('[data-fit="full"]') && this.classList.contains('tm-meta') ? 80 : 0;
		});
		const cw = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 49);
		const { container } = render(Treemap, { props: { data: BUDGET } });
		await tick();
		await tick();
		const l = tile(container, 'Operations').querySelector<HTMLElement>('.tm-label')!;
		expect(l.dataset.fit).toBe('share');
		sw.mockRestore();
		cw.mockRestore();
	});
});
