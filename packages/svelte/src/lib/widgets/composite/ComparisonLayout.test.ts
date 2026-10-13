// @file widgets/composite/ComparisonLayout.test.ts
// @description comparison-layout (design doc 2026-10-09 §3.2) in jsdom:
//   registry and bind-contract wiring, Choose as a bound edit and the
//   `on_choose` hook, a streamed spec that must match the whole-spec render,
//   junk props that must not throw, and the widget's own logic: best-cell
//   marks per `better`, the price difference from the winner, the `type`
//   fallback for `kind`, the `icon` kind, and a product_id placeholder; and
//   the first outside skill run's faults: one listing (table by default),
//   whole prices without cents, spec pills on the winner, a table that fits a
//   phone card, no photo tile without a photo, aligned icon-less rows.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/svelte';
import { tick, type ComponentProps } from 'svelte';
import {
	getBindContract,
	warnUnregisteredBindContract,
	_resetBindContractWarnings
} from '@ripple-ui/core';
import Ripple from '$lib/Ripple.svelte';
import { expectStreamParity } from '$lib/streaming/__fixtures__/stream-parity.js';
import { comparisonLayoutEntry } from '$lib/manifest/entries/comparison-layout.js';
import ComparisonLayout from './ComparisonLayout.svelte';
import { getWidget, hasWidget } from '../index.js';

afterEach(cleanup);

type Features = NonNullable<ComponentProps<typeof ComparisonLayout>['features']>;

const laptops = () => [
	{ id: 'aero', name: 'Aero 14', subtitle: '14-inch ultralight', price: 1099, product_id: 'sku-aero-14', battery: 18, weight: 1.2, ram: 16, gpu: false, ports: ['usb', 'wifi'] },
	{ id: 'nimbus', name: 'Nimbus Pro 15', subtitle: '15-inch creator', price: 1799, battery: 11, weight: 1.9, ram: 32, gpu: true, ports: ['usb', 'display'] },
	{ id: 'vertex', name: 'Vertex X13', subtitle: '13-inch business', price: 1299, battery: 18, weight: 1.1, ram: 16, gpu: false, ports: ['security'] }
];

const features = (): Features => [
	{ key: 'battery', label: 'Battery', section: 'Everyday', kind: 'number', unit: 'h', better: 'higher', icon: 'battery', highlight: true },
	{ key: 'weight', label: 'Weight', section: 'Everyday', kind: 'number', unit: 'kg', better: 'lower', icon: 'weight', highlight: true },
	{ key: 'ram', label: 'Memory', section: 'Performance', kind: 'number', unit: 'GB', better: 'higher', icon: 'memory' },
	{ key: 'gpu', label: 'Discrete GPU', section: 'Performance', kind: 'boolean' },
	{ key: 'ports', label: 'Highlights', section: 'Everyday', kind: 'icon' }
];

const winner = { id: 'aero', reason: 'Lightest of the three with the longest battery, for the least money.', runner_up: { id: 'vertex', reason: 'Same battery, a business keyboard.' } };

const table = (c: HTMLElement) => c.querySelector('[data-view="table"]') as HTMLElement;
const row = (c: HTMLElement, label: string) =>
	[...table(c).querySelectorAll('tbody tr:not([data-slot="row-label"])')].find((r) => r.querySelector('th')?.textContent?.includes(label)) as HTMLElement;
const bestCols = (r: HTMLElement) =>
	[...r.querySelectorAll('td')].flatMap((td, i) => (td.querySelector('[data-best]') ? [i] : []));

describe('comparison-layout: registry and bind contract', () => {
	it('resolves the type and both aliases to one component', () => {
		expect(hasWidget('comparison-layout')).toBe(true);
		expect(getWidget('comparison-cards')).toBe(getWidget('comparison-layout'));
		expect(getWidget('compare')).toBe(getWidget('comparison-layout'));
	});

	it.each(['comparison-layout', 'comparison-cards', 'compare'])('%s binds `chosen` through onchosenchange, silently', (type) => {
		expect(getBindContract(type)).toEqual({ prop: 'chosen', event: 'onchosenchange' });
		_resetBindContractWarnings();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		warnUnregisteredBindContract(type);
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});
});

describe('comparison-layout: Choose', () => {
	it('emits the chosen id and the {id, name, product_id} hook, and marks the item', async () => {
		const onchosenchange = vi.fn();
		const onchoose = vi.fn();
		const r = render(ComparisonLayout, { props: { items: laptops(), features: features(), winner, onchosenchange, onchoose } });
		const card = r.container.querySelector('[data-slot="winner"]') as HTMLElement;
		const btn = within(card).getByRole('button', { name: 'Choose' });
		expect(btn.getAttribute('aria-pressed')).toBe('false');
		await fireEvent.click(btn);
		expect(onchosenchange).toHaveBeenCalledWith('aero');
		expect(onchoose).toHaveBeenCalledWith({ id: 'aero', name: 'Aero 14', product_id: 'sku-aero-14' });
		expect(within(card).getByRole('button', { name: /chosen/i }).getAttribute('aria-pressed')).toBe('true');
	});

	it('writes the bound state path and reaches a spec on_choose handler', async () => {
		const spec = {
			state: { pick: 'nimbus' },
			ui: {
				type: 'flex',
				children: [
					{
						type: 'comparison-layout',
						bind: '{state.pick}',
						on_choose: { action: 'set', target: 'last' },
						props: { items: laptops(), features: features(), winner }
					},
					{ type: 'text', props: { text: 'picked:{state.pick} last:{state.last.name}' } }
				]
			}
		};
		const r = render(Ripple, { props: { spec } });
		await tick();
		const items = [...r.container.querySelectorAll('[data-slot="item"]')] as HTMLElement[];
		const nimbus = items.find((li) => li.textContent?.includes('Nimbus Pro 15'))!;
		// The bound value arrives as `chosen`.
		expect(within(nimbus).getByRole('button', { name: /chosen/i }).getAttribute('aria-pressed')).toBe('true');
		const vertex = items.find((li) => li.textContent?.includes('Vertex X13'))!;
		await fireEvent.click(within(vertex).getByRole('button', { name: 'Choose' }));
		await tick();
		expect(r.container.textContent).toContain('picked:vertex');
		expect(r.container.textContent).toContain('last:Vertex X13');
		expect(within(nimbus).getByRole('button', { name: 'Choose' }).getAttribute('aria-pressed')).toBe('false');
	});

	it('the picked section and differences filter survive a bound Choose that re-sends the spec', async () => {
		const spec = { state: { pick: 'nimbus' }, ui: { type: 'comparison-layout', bind: '{state.pick}', props: { items: laptops(), features: features(), winner } } };
		const r = render(Ripple, { props: { spec } });
		await tick();
		const ui = within(r.container);
		await fireEvent.click(ui.getByRole('button', { name: 'Performance' }));
		await fireEvent.click(ui.getByLabelText('Differences only'));
		const vertex = ([...r.container.querySelectorAll('[data-slot="item"]')] as HTMLElement[]).find((li) => li.textContent?.includes('Vertex X13'))!;
		await fireEvent.click(within(vertex).getByRole('button', { name: 'Choose' }));
		await tick();
		expect(within(vertex).getByRole('button', { name: /chosen/i }).getAttribute('aria-pressed')).toBe('true');
		expect(ui.getByRole('button', { name: 'Performance' }).getAttribute('aria-pressed')).toBe('true');
		expect((ui.getByLabelText('Differences only') as HTMLInputElement).checked).toBe(true);
	});

	it('still fires legacy item actions and onselect', async () => {
		const onselect = vi.fn();
		const r = render(ComparisonLayout, { props: { items: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], onselect } });
		await fireEvent.click(r.getAllByRole('button', { name: 'Choose' })[1]);
		expect(onselect).toHaveBeenCalledWith('b');
	});
});

describe('comparison-layout: streamed', () => {
	it('matches the whole-spec render with id-less items, a late winner and picks', async () => {
		const items = laptops();
		delete (items[2] as { id?: string }).id;
		const spec = {
			ui: {
				type: 'comparison-layout',
				props: {
					title: 'Three laptops for a designer who travels',
					verdict: { text: 'Aero 14 for battery; Nimbus Pro 15 if you edit video.', status: 'good' },
					items: [...items, { name: 'Draft 12', price: 'Ask in store' }, {}],
					features: [...features(), { label: 'Half-written' }],
					picks: [{ id: 'nimbus', label: 'Best for video' }, { id: 'aero', label: 'Lightest' }],
					winner,
					defaultView: 'table'
				}
			}
		};
		const { whole } = await expectStreamParity(spec);
		expect(whole.querySelector('[data-slot="winner"]')?.textContent).toContain('Aero 14');
		expect(whole.textContent).toContain('Ask in store');
	});

	it('streams the manifest example (the one the concierge copies)', async () => {
		const { whole } = await expectStreamParity({ state: { pick: '' }, ui: comparisonLayoutEntry.example });
		expect(whole.querySelector('[data-slot="winner"]')?.textContent).toContain('Aero 14');
		expect(whole.querySelectorAll('[data-best]').length).toBeGreaterThan(0);
	});
});

describe('comparison-layout: junk props', () => {
	it.each([
		['items not an array', { items: 'x', features: 42 }],
		['empty and non-object items', { items: [{}, null, 3, 'a', []] }],
		['winner id that matches nothing', { items: laptops(), winner: { id: 'none', reason: 'x' } }],
		['winner and picks of the wrong type', { items: laptops(), winner: 'aero', picks: null }],
		['junk features', { items: laptops(), features: [{}, null, { key: 5 }, { key: 'battery', kind: 'nope', better: 'up' }] }],
		['junk scalars', { items: laptops(), verdict: 'yes', currency: '$', defaultView: 'grid', chosen: 42, style: 'color:red' }],
		['non-finite numbers', { items: [{ id: 'a', name: 'A', price: Number.NaN, battery: 'n/a' }, { id: 'b', name: 'B', price: Infinity, battery: 9 }], features: [{ key: 'battery', kind: 'number', better: 'higher' }], winner: { id: 'a', reason: 'r' } }]
	])('%s renders without throwing', (_name, props) => {
		expect(() => render(ComparisonLayout, { props: props as never })).not.toThrow();
	});

	it('shows no winner card until its id matches an item', () => {
		const r = render(ComparisonLayout, { props: { items: laptops(), winner: { id: 'aer', reason: 'half-written' } } });
		expect(r.container.querySelector('[data-slot="winner"]')).toBeNull();
		expect(r.container.querySelectorAll('[data-slot="item"]')).toHaveLength(3);
	});
});

describe('comparison-layout: logic', () => {
	const mount = (extra: Record<string, unknown> = {}) =>
		render(ComparisonLayout, { props: { items: laptops(), features: features(), winner, ...extra } }).container;

	it('marks the best cell per `better`, all ties, in the table and the cards', () => {
		const c = mount();
		expect(bestCols(row(c, 'Battery'))).toEqual([0, 2]); // higher, a tie at 18
		expect(bestCols(row(c, 'Weight'))).toEqual([2]); // lower
		const card = c.querySelector('[data-view="card"] article') as HTMLElement;
		expect(card.querySelectorAll('[data-best]')).toHaveLength(1); // Aero: battery only
	});

	it('marks nothing when every value is equal, and skips non-finite values', () => {
		const items = [
			{ id: 'a', name: 'A', battery: 10, ram: 'n/a' },
			{ id: 'b', name: 'B', battery: 10, ram: Number.NaN },
			{ id: 'c', name: 'C', battery: 10, ram: 8 }
		];
		const f: Features = [
			{ key: 'battery', label: 'Battery', kind: 'number', better: 'higher' },
			{ key: 'ram', label: 'Memory', kind: 'number', better: 'higher' }
		];
		const c = render(ComparisonLayout, { props: { items, features: f } }).container;
		expect(bestCols(row(c, 'Battery'))).toEqual([]);
		// One finite value is not a comparison.
		expect(bestCols(row(c, 'Memory'))).toEqual([]);
	});

	it('shows each other item’s price difference from the winner, signed', () => {
		const c = mount();
		const deltas = [...c.querySelectorAll('[data-slot="delta"]')].map((n) => n.textContent);
		expect(deltas).toEqual(['+$700 vs Aero 14', '+$200 vs Aero 14']);
		const cheaper = render(ComparisonLayout, {
			props: { items: laptops(), winner: { id: 'nimbus', reason: 'r' } }
		}).container;
		const d = [...cheaper.querySelectorAll('[data-slot="delta"]')].map((n) => n.textContent);
		expect(d).toEqual(['-$700 vs Nimbus Pro 15', '-$500 vs Nimbus Pro 15']);
	});

	it('renders the winner card with reason, price, picks and runner-up', () => {
		const c = mount({ picks: [{ id: 'aero', label: 'Lightest' }, { id: 'aero', label: 'Best value' }, { id: 'nimbus', label: 'Video' }, { id: 'vertex', label: 'Dropped: over 3' }] });
		const card = c.querySelector('[data-slot="winner"]') as HTMLElement;
		expect(card.querySelector('[data-slot="reason"]')?.textContent).toBe(winner.reason);
		expect(card.querySelector('[data-slot="price"]')?.textContent).toBe('$1,099');
		expect([...card.querySelectorAll('[data-slot="pick"]')].map((n) => n.textContent)).toEqual(['Lightest', 'Best value']);
		expect(card.querySelector('[data-slot="runner-up"]')?.textContent).toContain('Vertex X13');
		expect(c.textContent).not.toContain('Dropped: over 3');
		// The winner is not repeated among the other cards.
		expect(c.querySelectorAll('[data-slot="item"]')).toHaveLength(2);
	});

	it('renders a string price as written, without a difference', () => {
		const items = [{ id: 'a', name: 'A', price: 1000 }, { id: 'b', name: 'B', price: '$15 / host / mo' }];
		const c = render(ComparisonLayout, { props: { items, winner: { id: 'a', reason: 'r' } } }).container;
		expect(c.textContent).toContain('$15 / host / mo');
		expect(c.querySelector('[data-slot="delta"]')).toBeNull();
	});

	it('reads the legacy `type` when `kind` is missing; `kind` wins', () => {
		const items = [{ id: 'a', name: 'A', sso: true, seats: 5 }, { id: 'b', name: 'B', sso: 'no', seats: 10 }];
		const f: Features = [
			{ key: 'sso', label: 'SSO', type: 'boolean' },
			{ key: 'seats', label: 'Seats', type: 'boolean', kind: 'number', better: 'higher' }
		];
		const c = render(ComparisonLayout, { props: { items, features: f } }).container;
		expect([...row(c, 'SSO').querySelectorAll('td')].map((td) => td.textContent?.trim())).toEqual(['Yes', 'No']);
		expect([...row(c, 'Seats').querySelectorAll('td')].map((td) => td.textContent?.trim())).toEqual(['5', 'Best: 10']);
	});

	it('renders the `icon` kind as an icon plus a word', () => {
		const c = mount();
		const cells = [...row(c, 'Highlights').querySelectorAll('td')];
		expect(cells[0].querySelectorAll('svg')).toHaveLength(2);
		expect(cells[0].textContent).toContain('Usb');
		expect(cells[2].textContent).toContain('Security');
	});

	it('shows a placeholder for a product_id item the server has not filled yet', () => {
		const items = [{ id: 'p1', product_id: 'sku-1' }, { id: 'b', name: 'B' }];
		const c = render(ComparisonLayout, { props: { items } }).container;
		expect(c.querySelector('[data-slot="name-pending"]')).not.toBeNull();
		// Nothing to choose until the server has named it.
		expect(c.querySelectorAll('[data-slot="choose"]')).toHaveLength(1);
	});

	it('infers features from item keys when none are given (legacy specs)', () => {
		const items = [{ id: 'a', title: 'A', seats: 1, sso: false, product_id: 'x' }, { id: 'b', title: 'B', seats: 2, sso: true }];
		const c = render(ComparisonLayout, { props: { items } }).container;
		const labels = [...table(c).querySelectorAll('tbody th[scope="row"]')].map((th) => th.textContent?.trim());
		expect(labels).toEqual(['Seats', 'Sso']);
	});
});

// A live Haiku turn ("Help me pick a laptop") put each feature's definition AND
// its value inside every item instead of top-level `features` + keyed values.
const drifted = () => {
	const f = (gpu: string, ram: number, storage: number, hz: number, kg: number) => [
		{ key: 'gpu', label: 'Graphics', kind: 'text', value: gpu },
		{ key: 'ram', label: 'Memory', kind: 'number', value: ram, unit: 'GB', better: 'higher' },
		{ key: 'storage', label: 'Storage', kind: 'number', value: storage, unit: 'GB', better: 'higher' },
		{ key: 'refresh', label: 'Display refresh', kind: 'number', value: hz, unit: 'Hz', better: 'higher' },
		{ key: 'weight', label: 'Weight', kind: 'number', value: kg, unit: 'kg', better: 'lower' }
	];
	return {
		title: 'Help me pick a laptop',
		winner: { id: 'c', reason: 'Fastest graphics and the best screen.' },
		items: [
			{ id: 'a', name: 'Laptop A', price: 949, features: f('Integrated graphics', 8, 256, 60, 1.4) },
			{ id: 'b', name: 'Laptop B', price: 1199, features: f('RTX 4050 class', 16, 512, 120, 1.8) },
			{ id: 'c', name: 'Laptop C', price: 1449, features: f('RTX 4060 class', 16, 1024, 165, 2.1) }
		]
	};
};

describe('comparison-layout: per-item feature definitions (shape drift)', () => {
	const cells = (c: HTMLElement, label: string) =>
		[...row(c, label).querySelectorAll('td')].map((td) => td.textContent?.replace('Best:', '').trim());

	it('lifts item `features` [{key,label,value}] into rows and never prints raw JSON', () => {
		const c = render(ComparisonLayout, { props: drifted() as never }).container;
		expect(c.textContent).not.toContain('{"key"');
		expect(c.innerHTML).not.toContain('&quot;key&quot;');
		const labels = [...table(c).querySelectorAll('tbody th[scope="row"]')].map((th) => th.textContent?.trim());
		expect(labels).toEqual(['Graphics', 'Memory', 'Storage', 'Display refresh', 'Weight']);
		expect(cells(c, 'Graphics')).toEqual(['Integrated graphics', 'RTX 4050 class', 'RTX 4060 class']);
		expect(cells(c, 'Memory')).toEqual(['8 GB', '16 GB', '16 GB']);
		expect(cells(c, 'Storage')).toEqual(['256 GB', '512 GB', '1,024 GB']);
		expect(cells(c, 'Display refresh')).toEqual(['60 Hz', '120 Hz', '165 Hz']);
		expect(cells(c, 'Weight')).toEqual(['1.4 kg', '1.8 kg', '2.1 kg']);
		expect(bestCols(row(c, 'Weight'))).toEqual([0]);
		// All three present: C as the best pick, A and B as the other cards, three table columns.
		expect(c.querySelector('[data-slot="winner"]')?.textContent).toContain('Laptop C');
		expect(c.querySelector('[data-slot="winner"]')?.textContent).toContain('$1,449');
		const others = [...c.querySelectorAll('[data-slot="item"]')].map((li) => li.textContent);
		expect(others).toHaveLength(2);
		expect(others[0]).toContain('$949');
		expect(others[1]).toContain('$1,199');
		expect(table(c).querySelectorAll('thead th')).toHaveLength(4);
	});

	it('accepts an item `specs` object map and keeps explicit top-level features first', () => {
		const items = [
			{ id: 'a', name: 'A', specs: { gpu: 'RTX 4050', ram: 16 } },
			{ id: 'b', name: 'B', specs: { gpu: 'RTX 4060', ram: 32 } }
		];
		const c = render(ComparisonLayout, { props: { items, features: [{ key: 'ram', label: 'Memory', kind: 'number', unit: 'GB' }] } }).container;
		expect(cells(c, 'Memory')).toEqual(['16 GB', '32 GB']);
		expect(c.textContent).not.toContain('{"');
	});

	it('never prints a stringified object or array in a cell or card row', () => {
		const items = [
			{ id: 'a', name: 'A', gpu: { model: 'RTX' }, ports: ['USB-C', 'HDMI'], misc: [{ x: 1 }] },
			{ id: 'b', name: 'B', gpu: 'RTX 4060', ports: ['USB-C'], misc: 'ok' }
		];
		const c = render(ComparisonLayout, { props: { items } }).container;
		expect(c.textContent).not.toMatch(/[{[]"/);
		expect(cells(c, 'Gpu')).toEqual(['—', 'RTX 4060']);
		expect(cells(c, 'Ports')).toEqual(['USB-C, HDMI', 'USB-C']);
		expect(cells(c, 'Misc')).toEqual(['—', 'ok']);
	});

	it('streams the drifted shape to the same render as the whole spec', async () => {
		const { whole } = await expectStreamParity({ ui: { type: 'comparison-layout', props: { ...drifted(), defaultView: 'table' } } });
		expect(whole.textContent).not.toContain('{"key"');
		expect(whole.textContent).toContain('Display refresh');
	});
});

// The first outside run of the Ripple skill (an e-bike comparison) found these.
const bikes = () => [
	{ id: 'corvo', name: 'Corvo Metro 2', price: 1890, range: 70, weight: 21, motor: 'Rear hub', torque: 50 },
	{ id: 'lind', name: 'Lindqvist Stride', price: 2640, range: 95, weight: 19.5, motor: 'Mid-drive', torque: 65 },
	{ id: 'pell', name: 'Pell Urban Fold', price: 1390, range: 45, weight: 17, motor: 'Front hub', torque: 35 }
];
const bikeFeatures = (): Features => [
	{ key: 'range', label: 'Range', kind: 'number', unit: 'km', better: 'higher', icon: 'battery', highlight: true },
	{ key: 'weight', label: 'Weight', kind: 'number', unit: 'kg', better: 'lower', icon: 'weight', highlight: true },
	{ key: 'motor', label: 'Motor', kind: 'text', icon: 'motor' },
	{ key: 'torque', label: 'Torque', kind: 'number', unit: 'Nm', better: 'higher' }
];
const view = (c: HTMLElement, v: string) => c.querySelector(`[data-view="${v}"]`) as HTMLElement;
const pills = (el: Element) => el.querySelector('[data-slot="specs"]')?.textContent?.replace(/\s+/g, ' ').trim();

describe('comparison-layout: one listing, clean prices, phone-width table', () => {
	const mountBikes = (extra: Partial<ComponentProps<typeof ComparisonLayout>> = {}) =>
		render(ComparisonLayout, { props: { items: bikes(), features: bikeFeatures(), winner: { id: 'corvo', reason: 'r' }, ...extra } }).container;

	it('shows the table below the cards by default, so the items are not listed twice', () => {
		const c = mountBikes();
		expect(view(c, 'card').className).toContain('hidden');
		expect(view(c, 'card').className).not.toContain('@min-[720px]:hidden');
		expect(view(c, 'table').className).not.toContain('hidden');
	});

	it('keeps the per-item cards one tap away and honours defaultView "card"', async () => {
		const c = mountBikes();
		await fireEvent.click(within(c).getByRole('button', { name: /cards/i }));
		expect(view(c, 'card').className).not.toMatch(/(^|\s)hidden/);
		const d = mountBikes({ defaultView: 'card' });
		expect(view(d, 'table').className).toContain('hidden');
	});

	it('drops the cents of whole prices and deltas, and keeps real cents', () => {
		const c = mountBikes();
		expect(c.querySelector('[data-slot="winner"] [data-slot="price"]')?.textContent).toBe('$1,890');
		expect([...c.querySelectorAll('[data-slot="delta"]')].map((n) => n.textContent)).toEqual(['+$750 vs Corvo Metro 2', '-$500 vs Corvo Metro 2']);
		const items = [{ id: 'a', name: 'A', price: 19.5 }, { id: 'b', name: 'B', price: 20 }];
		const d = render(ComparisonLayout, { props: { items } }).container;
		expect([...d.querySelectorAll('[data-slot="price"]')].map((n) => n.textContent)).toEqual(['$19.50', '$20']);
	});

	it('gives the winner card the same spec pills as the other cards', () => {
		const c = mountBikes();
		expect(pills(c.querySelector('[data-slot="winner"]')!)).toBe('Range 70 km Weight 21 kg');
		expect(pills(c.querySelector('[data-slot="item"]')!)).toBe('Range 95 km Weight 19.5 kg');
	});

	it('fits three items in a phone card: a label line per row, no label column, no fixed 420px floor', () => {
		const c = mountBikes();
		const t = table(c).querySelector('table') as HTMLTableElement;
		expect(t.className).not.toContain('min-w-[420px]');
		expect(t.style.getPropertyValue('--cmp-n')).toBe('3');
		const labels = [...t.querySelectorAll('[data-slot="row-label"] th')];
		expect(labels.map((th) => th.textContent?.trim())).toEqual(['Range', 'Weight', 'Motor', 'Torque']);
		expect(labels.every((th) => th.getAttribute('colspan') === '3')).toBe(true);
		// The side label column is for 560px+ only.
		const side = (t.querySelector('tbody th[scope="row"]') as HTMLElement).classList;
		expect(side.contains('hidden') && side.contains('@min-[560px]:table-cell')).toBe(true);
		// Names wrap in the narrow header instead of being cut.
		expect(t.querySelector('thead span.block')?.className).not.toContain('truncate');
	});

	it('draws no photo tile when no item has a photo, and one per item when any has', () => {
		expect(mountBikes().querySelector('[data-state]')).toBeNull();
		const items = bikes().map((b, i) => (i === 0 ? { ...b, image: 'https://example.com/corvo.jpg' } : b));
		const c = render(ComparisonLayout, { props: { items, features: bikeFeatures(), winner: { id: 'corvo', reason: 'r' } } }).container;
		expect(c.querySelectorAll('[data-slot="winner"] [data-state]')).toHaveLength(1);
		expect(c.querySelectorAll('[data-slot="item"] [data-state]')).toHaveLength(2);
	});

	it('maps a `motor` icon and keeps an icon-less row aligned with a spacer', () => {
		const c = mountBikes();
		const label = (name: string) =>
			[...table(c).querySelectorAll('[data-slot="row-label"] th')].find((th) => th.textContent?.includes(name)) as HTMLElement;
		expect(label('Motor').querySelector('svg')).not.toBeNull();
		expect(label('Torque').querySelector('[data-slot="icon-spacer"]')).not.toBeNull();
		// No spacers when no row has an icon.
		const plainRows = bikeFeatures().map(({ icon: _i, ...f }) => f);
		const d = render(ComparisonLayout, { props: { items: bikes(), features: plainRows } }).container;
		expect(d.querySelector('[data-slot="icon-spacer"]')).toBeNull();
	});
});
