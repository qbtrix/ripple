// widgets/composite/MenuOrder.test.ts — menu-order: registry and bind wiring,
// the store-mirrored money math (menu-order.ts), the four stages end to end
// (add, customise with priced options, details, review, on_checkout), the
// display-only mode, junk props, and streamed parity.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { getBindContract, warnUnregisteredBindContract, _resetBindContractWarnings } from '@ripple-ui/core';
import Ripple from '$lib/Ripple.svelte';
import { expectStreamParity } from '$lib/streaming/__fixtures__/stream-parity.js';
import { getWidget, hasWidget } from '../index.js';
import MenuOrder from './MenuOrder.svelte';
import {
	MAX_LINES,
	buildCart,
	contactErrors,
	idWords,
	toItems,
	toLines,
	totalOf,
	unitPrice,
	type CartDraft,
	type MenuItem
} from './menu-order.js';

afterEach(cleanup);

// Store-shaped (tasty-bite-demo FL-5): required size, extras up to 3, optional sauce.
const burger: MenuItem = {
	id: 'smash',
	product_id: 'smash-burger',
	name: 'Double Smash Burger',
	price: 11.99,
	kind: 'main',
	category: 'Burgers',
	groups: [
		{ id: 'size', name: 'Size', choose: 'one', required: true, options: [{ id: 'regular', name: 'Regular', price_delta: 0 }, { id: 'large', name: 'Large', price_delta: 2 }] },
		{
			id: 'extras',
			name: 'Extras',
			choose: 'many',
			max: 3,
			options: [
				{ id: 'extra-cheese', name: 'Extra cheese', price_delta: 1 },
				{ id: 'bacon', name: 'Bacon', price_delta: 2 },
				{ id: 'avocado', name: 'Avocado', price_delta: 1.5 },
				{ id: 'jalapenos', name: 'Jalapeños', price_delta: 0.75 }
			]
		},
		{ id: 'sauce', name: 'Sauce', choose: 'one', options: [{ id: 'aioli', name: 'Garlic aioli', price_delta: 0.5 }, { id: 'no-sauce', name: 'No sauce', price_delta: 0 }] }
	]
};
const fries: MenuItem = { id: 'fries', product_id: 'shoestring-fries', name: 'Shoestring Fries', price: 3.49, kind: 'side', category: 'Sides' };
const shake: MenuItem = { product_id: 'malted-shake', name: 'Malted Shake', price: 5.25, kind: 'dessert', category: 'Shakes' };
const items = [burger, fries, shake];

describe('menu-order — registry and bind contract', () => {
	it('registers the type and its aliases to one component', () => {
		expect(hasWidget('menu-order')).toBe(true);
		expect(getWidget('food-menu')).toBe(getWidget('menu-order'));
		expect(getWidget('order-menu')).toBe(getWidget('menu-order'));
	});

	it('binds `cart` through oncartchange, silently', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		_resetBindContractWarnings();
		for (const t of ['menu-order', 'food-menu', 'order-menu']) {
			expect(getBindContract(t)).toEqual({ prop: 'cart', event: 'oncartchange' });
			warnUnregisteredBindContract(t);
		}
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});
});

describe('menu-order — money math (mirrors the store)', () => {
	const menu = toItems(items);
	const smash = menu[0];

	it('prices options in integer cents: 11.99 + 1.50 + 0.75 = 14.24', () => {
		expect(unitPrice(smash, ['regular', 'avocado', 'jalapenos'])).toBe(14.24);
		expect(unitPrice(smash, ['large'])).toBe(13.99);
	});

	it('recomputes unit_price, cleans option ids and fills a missing required choice', () => {
		const [line] = toLines([{ product_id: 'smash-burger', qty: 2, option_ids: ['bacon', 'nope', 'large'], unit_price: 0.01 }], menu);
		expect(line).toEqual({ product_id: 'smash-burger', name: 'Double Smash Burger', qty: 2, option_ids: ['large', 'bacon'], unit_price: 15.99 });
		const [plain] = toLines([{ product_id: 'smash-burger', qty: 1 }], menu);
		expect(plain.option_ids).toEqual(['regular']);
	});

	it('caps a many group at its max and a one group at one choice', () => {
		const [line] = toLines([{ product_id: 'smash-burger', option_ids: ['regular', 'large', 'extra-cheese', 'bacon', 'avocado', 'jalapenos'] }], menu);
		expect(line.option_ids).toEqual(['regular', 'extra-cheese', 'bacon', 'avocado']);
	});

	it('clamps qty to 20, drops qty < 1 and unknown products, merges repeats, holds 30 lines', () => {
		const lines = toLines(
			[
				{ product_id: 'shoestring-fries', qty: 15 },
				{ product_id: 'shoestring-fries', qty: 9 },
				{ product_id: 'malted-shake', qty: 0 },
				{ product_id: 'ghost', qty: 1 },
				{ product_id: 7, qty: 1 }
			],
			menu
		);
		expect(lines).toHaveLength(1);
		expect(lines[0].qty).toBe(20);
		const many = Array.from({ length: 40 }, (_, i) => ({ id: `x${i}`, product_id: `p${i}`, name: `Dish ${i}`, price: 1 }));
		expect(toLines(many.map((m) => ({ product_id: m.product_id })), toItems(many))).toHaveLength(MAX_LINES);
	});

	it('adds the delivery fee only for delivery', () => {
		const lines = toLines([{ product_id: 'shoestring-fries', qty: 2 }, { product_id: 'smash-burger', option_ids: ['large'] }], menu);
		expect(totalOf(lines, 'pickup', 3.99)).toBe(20.97);
		expect(totalOf(lines, 'delivery', 3.99)).toBe(24.96);
	});

	it('needs a name, an email and a phone, and an address for delivery', () => {
		const empty = { name: '', email: '', phone: '', address: '' };
		expect(Object.keys(contactErrors(empty, 'pickup')).sort()).toEqual(['email', 'name', 'phone']);
		expect(Object.keys(contactErrors({ ...empty, name: 'Ada', phone: '+1 555 0100' }, 'pickup'))).toEqual(['email']);
		expect(Object.keys(contactErrors({ ...empty, name: 'Ada', email: 'ada@example.com' }, 'pickup'))).toEqual(['phone']);
		expect(contactErrors({ ...empty, name: 'Ada', email: 'ada@example.com', phone: '+1 555 0100' }, 'pickup')).toEqual({});
		expect(contactErrors({ ...empty, name: 'Ada', email: 'ada@' }, 'pickup').email).toBeTruthy();
		expect(contactErrors({ ...empty, name: 'Ada', phone: '12' }, 'pickup').phone).toBeTruthy();
		expect(contactErrors({ ...empty, name: 'Ada', email: 'ada@example.com' }, 'delivery').address).toBeTruthy();
	});

	it('builds the checkout cart without the address for pickup', () => {
		const lines = toLines([{ product_id: 'shoestring-fries' }], menu);
		const cart = buildCart(lines, 'pickup', { name: ' Ada ', email: 'ada@example.com', phone: '', address: '1 Pier St' }, 3.99);
		expect(cart).toEqual({ lines, fulfilment: 'pickup', customer: { name: 'Ada', email: 'ada@example.com' }, total: 3.49 });
	});
});

const btn = (name: string | RegExp) => screen.getByRole('button', { name });

describe('menu-order — stages', () => {
	it('adds an item, then a bound edit emits a new cart', async () => {
		const oncartchange = vi.fn();
		render(MenuOrder, { props: { items, checkout: true, oncartchange } });
		await fireEvent.click(btn('Add Shoestring Fries'));
		expect(oncartchange).toHaveBeenLastCalledWith({
			lines: [{ product_id: 'shoestring-fries', name: 'Shoestring Fries', qty: 1, option_ids: [], unit_price: 3.49 }],
			fulfilment: 'pickup',
			total: 3.49
		});
		await fireEvent.click(btn('Add one Shoestring Fries'));
		const next = oncartchange.mock.lastCall![0] as CartDraft;
		expect(next.lines[0].qty).toBe(2);
		expect(next.total).toBe(6.98);
	});

	it('renders a bound cart and steps from it', async () => {
		const oncartchange = vi.fn();
		const cart: CartDraft = { lines: [{ product_id: 'malted-shake', name: 'x', qty: 3, option_ids: [], unit_price: 99 }] };
		render(MenuOrder, { props: { items, checkout: true, cart, oncartchange } });
		expect(screen.getByText('3 items')).toBeTruthy();
		expect(screen.getByText('$15.75')).toBeTruthy();
		await fireEvent.click(btn('Remove one Malted Shake'));
		expect((oncartchange.mock.lastCall![0] as CartDraft).lines[0]).toMatchObject({ qty: 2, unit_price: 5.25, name: 'Malted Shake' });
	});

	it('writes the bound state path through Ripple', async () => {
		const spec = {
			state: {},
			ui: {
				type: 'flex',
				children: [
					{ type: 'menu-order', bind: '{state.cart}', props: { items, checkout: true } },
					{ type: 'text', props: { text: 'Bound total {state.cart.total}' } }
				]
			}
		};
		const { container } = render(Ripple, { props: { spec } });
		await tick();
		await fireEvent.click(btn('Add Malted Shake'));
		await vi.waitFor(() => expect(container.textContent).toContain('Bound total 5.25'));
	});

	it('the stage and typed details survive a bound fulfilment change that re-sends the spec', async () => {
		const onStateChange = vi.fn();
		const props = { items, checkout: true, fulfilment: ['pickup', 'delivery'], fee: { delivery: 3.99 } };
		const { container } = render(Ripple, { props: { spec: { state: {}, ui: { type: 'menu-order', bind: '{state.cart}', props } }, onStateChange } });
		await tick();
		await fireEvent.click(btn('Add Shoestring Fries'));
		await fireEvent.click(btn('Checkout'));
		await fireEvent.input(screen.getByLabelText(/^Name/), { target: { value: 'Ada Park' } });
		await fireEvent.click(screen.getByLabelText(/Delivery/));
		expect(onStateChange).toHaveBeenLastCalledWith('cart', expect.objectContaining({ fulfilment: 'delivery' }), expect.anything());
		expect(container.querySelector('[data-stage="details"]')).not.toBeNull();
		expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Ada Park');
	});

	it('customises with priced options, caps extras, and adds the line in menu order', async () => {
		const oncartchange = vi.fn();
		const { container } = render(MenuOrder, { props: { items, checkout: true, oncartchange } });
		await fireEvent.click(btn('Choose options for Double Smash Burger'));
		expect(container.querySelector('[data-stage="customise"]')).not.toBeNull();
		expect((screen.getByLabelText(/Regular/) as HTMLInputElement).checked).toBe(true);
		expect(btn(/^Add · \$11\.99$/)).toBeTruthy();
		for (const o of [/Avocado/, /Extra cheese/, /Jalapeños/]) await fireEvent.click(screen.getByLabelText(o));
		expect((screen.getByLabelText(/Bacon/) as HTMLInputElement).disabled).toBe(true);
		expect(screen.getByText('Optional · 3 of 3')).toBeTruthy();
		await fireEvent.click(screen.getByLabelText(/Large/));
		await fireEvent.click(btn('Add one Double Smash Burger'));
		expect(btn(/^Add · \$34\.48$/)).toBeTruthy(); // (11.99 + 2 + 1 + 1.5 + 0.75) × 2
		await fireEvent.click(btn(/^Add · /));
		expect(container.querySelector('[data-stage="menu"]')).not.toBeNull();
		expect((oncartchange.mock.lastCall![0] as CartDraft).lines).toEqual([
			{ product_id: 'smash-burger', name: 'Double Smash Burger', qty: 2, option_ids: ['large', 'extra-cheese', 'avocado', 'jalapenos'], unit_price: 17.24 }
		]);
		expect(screen.getByText('2 in order')).toBeTruthy();
	});

	it('blocks Add while a required group is empty and says why', async () => {
		const wrap: MenuItem = {
			product_id: 'wrap',
			name: 'Garden Wrap',
			price: 9,
			groups: [{ id: 'side', name: 'Side', choose: 'many', required: true, max: 2, options: [{ id: 'slaw', name: 'Slaw' }, { id: 'chips', name: 'Chips' }] }]
		};
		render(MenuOrder, { props: { items: [wrap], checkout: true } });
		await fireEvent.click(btn('Choose options for Garden Wrap'));
		await fireEvent.click(screen.getByLabelText(/Slaw/)); // the default; unchecking empties the group
		expect((btn(/^Add · /) as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByText('Side is required. Pick one to add this.')).toBeTruthy();
	});

	it('runs details and review, then emits on_checkout with the cart', async () => {
		const oncheckout = vi.fn();
		const { container } = render(MenuOrder, {
			props: { items, checkout: true, fulfilment: ['pickup', 'delivery'], fee: { delivery: 3.99 }, oncheckout }
		});
		await fireEvent.click(btn('Add Shoestring Fries'));
		await fireEvent.click(btn('Checkout'));
		expect(container.querySelector('[data-stage="details"]')).not.toBeNull();
		await fireEvent.click(btn('Review order'));
		expect(screen.getByText('Add a name for the order.')).toBeTruthy();
		await fireEvent.click(screen.getByLabelText(/Delivery/));
		await fireEvent.input(screen.getByLabelText(/^Name/), { target: { value: 'Ada Park' } });
		await fireEvent.input(screen.getByLabelText(/^Email/), { target: { value: 'ada@example.com' } });
		await fireEvent.click(btn('Review order'));
		expect(screen.getByText('Add a phone number so the kitchen can reach you.')).toBeTruthy();
		await fireEvent.input(screen.getByLabelText(/^Phone/), { target: { value: '+1 555 0100' } });
		await fireEvent.input(screen.getByLabelText(/^Delivery address/), { target: { value: '12 Pier Road' } });
		await fireEvent.click(btn('Review order'));
		expect(container.querySelector('[data-stage="review"]')).not.toBeNull();
		expect(screen.getAllByText('$7.48').length).toBeGreaterThan(0);
		await fireEvent.click(btn('Continue to payment'));
		expect(oncheckout).toHaveBeenCalledWith({
			lines: [{ product_id: 'shoestring-fries', name: 'Shoestring Fries', qty: 1, option_ids: [], unit_price: 3.49 }],
			fulfilment: 'delivery',
			customer: { name: 'Ada Park', email: 'ada@example.com', phone: '+1 555 0100', address: '12 Pier Road' },
			total: 7.48
		});
	});

	it('is display only without checkout: no rail, no controls, no bar', () => {
		const { container } = render(MenuOrder, { props: { items, featured: { id: 'fries', reason: 'Crisp and salty.' } } });
		expect(screen.queryByRole('button', { name: /Add|Choose|Checkout/ })).toBeNull();
		expect(container.querySelector('nav[aria-label="Progress"]')).toBeNull();
		expect(screen.getByText('Crisp and salty.')).toBeTruthy();
	});

	it('treats an item without product_id as display only', () => {
		render(MenuOrder, { props: { items: [{ name: 'Chef special', price: 14 }, fries], checkout: true } });
		expect(screen.queryByRole('button', { name: 'Add Chef special' })).toBeNull();
		expect(btn('Add Shoestring Fries')).toBeTruthy();
	});

	it('pre-fills from preset until the first edit', () => {
		render(MenuOrder, { props: { items, checkout: true, preset: [{ id: 'fries', qty: 2 }, { id: 'smash', qty: 1 }] } });
		expect(screen.getByText('3 items')).toBeTruthy();
		expect(screen.getByText('$18.97')).toBeTruthy();
	});

	it('renders junk props without throwing', () => {
		const junk = [
			{ items: 'nope', fee: 'x', fulfilment: 'delivery', cart: 'junk', featured: 7, checkout: true },
			{ items: [null, 5, 'a', { groups: null, price: '11.99', product_id: 'p1' }, { name: 'Odd', groups: [{ options: [{ name: 'no id' }, null] }] }], checkout: true },
			{ items: [{ product_id: 'p2', name: 'Lone', price: 'NaN', tags: 'x' }], currency: '$', preset: 'two', checkout: 'yes' }
		];
		for (const props of junk) {
			expect(() => render(MenuOrder, { props: props as never })).not.toThrow();
			cleanup();
		}
	});
});

const tile = (name: RegExp) => screen.getByLabelText(name).closest('label')!;

describe('menu-order — menu layout', () => {
	const modelOnly: MenuItem[] = [
		{ product_id: 'smash-burger', name: 'Double Smash Burger', kind: 'main', category: 'Burgers' },
		{ product_id: 'mushroom-swiss', name: 'Mushroom Swiss', kind: 'main', category: 'Burgers' },
		{ product_id: 'shoestring-fries', name: 'Shoestring Fries', kind: 'side', category: 'Sides' },
		{ product_id: 'malted-shake', name: 'Malted Vanilla Shake', kind: 'dessert', category: 'Shakes' }
	];
	const many = (n: number): MenuItem[] =>
		Array.from({ length: n }, (_, i) => ({ product_id: `p${i}`, name: `Dish ${i}`, category: i % 2 ? 'Mains' : 'Sides' }));

	it('names an item by its id in words when the name is missing', () => {
		expect(idWords('garlic-knots')).toBe('Garlic knots');
		expect(idWords('only_an id')).toBe('Only an id');
		expect(idWords('  ')).toBe('');
		expect(idWords(7)).toBe('');
	});

	it('draws a settled card with no placeholders, and named rows for nameless items', () => {
		const { container } = render(MenuOrder, {
			props: { items: [...modelOnly, { product_id: 'garlic-knots', name: '' }, { id: 'only-an-id' }, { description: 'x' }] }
		});
		expect(container.querySelector('[data-placeholder]')).toBeNull();
		expect(container.querySelector('.bg-ripple-muted[aria-hidden="true"]')).toBeNull();
		expect(screen.getByText('Garlic knots')).toBeTruthy();
		expect(screen.getByText('Only an id')).toBeTruthy();
		expect(screen.getByText('Unnamed item')).toBeTruthy();
		expect(container.textContent).not.toMatch(/n\/a|NaN|undefined/);
	});

	it('shows placeholders only while the spec streams in', () => {
		const { container } = render(MenuOrder, { props: { items: [{ product_id: 'p1' }] }, context: new Map([['ui-streaming', () => 'active']]) });
		expect(container.querySelectorAll('[data-placeholder]').length).toBe(2);
	});

	it('groups a model-only menu under category headings with a count headline and no chips', () => {
		const { container } = render(MenuOrder, { props: { items: modelOnly, featured: { id: 'mushroom-swiss', reason: 'Vegetarian.' } } });
		expect(screen.getByText('4 items · 3 categories')).toBeTruthy();
		expect(screen.queryByRole('group', { name: 'Categories' })).toBeNull();
		expect(screen.getByRole('article', { name: 'Picked for you' })).toBeTruthy();
		expect(screen.getByRole('list', { name: 'Burgers' }).querySelectorAll('li')).toHaveLength(1); // the pick is not listed twice
		expect(screen.getByRole('list', { name: 'Sides' })).toBeTruthy();
		expect(container.querySelector('article:not([aria-label])')).toBeNull(); // rows, not boxed cards
	});

	it('draws one pick and no list for a one-item menu', () => {
		const { container } = render(MenuOrder, { props: { items: [modelOnly[0]], featured: { id: 'smash-burger' } } });
		expect(screen.getByRole('article', { name: 'Picked for you' })).toBeTruthy();
		expect(container.querySelector('ul')).toBeNull();
	});

	it('shows wrapping category chips only from 8 items', () => {
		render(MenuOrder, { props: { items: many(7) } });
		expect(screen.queryByRole('group', { name: 'Categories' })).toBeNull();
		cleanup();
		render(MenuOrder, { props: { items: many(8) } });
		const chips = screen.getByRole('group', { name: 'Categories' });
		expect(chips.className).toContain('flex-wrap');
		expect(chips.className).not.toContain('overflow-x-auto');
	});

	it('reads a zero price as Free and still lets it be ordered', () => {
		render(MenuOrder, { props: { items: [{ product_id: 'water', name: 'Tap Water', price: 0 }], checkout: true } });
		expect(screen.getByText('Free')).toBeTruthy();
		expect(btn('Add Tap Water')).toBeTruthy();
	});

	it('uses photo cards in one ungrouped grid once any item has a photo, each with a photo slot', async () => {
		const { container } = render(MenuOrder, {
			props: { items: [{ ...fries, image: 'https://images.unsplash.com/photo-1' }, { ...fries, id: 'curly', product_id: 'curly', name: 'Curly Fries', image: 'https://img.example/2' }, shake] }
		});
		expect(container.querySelectorAll('article')).toHaveLength(3);
		expect(screen.getByRole('list', { name: 'Menu' }).querySelectorAll('li')).toHaveLength(3);
		expect(container.querySelector('h3')).toBeNull(); // no per-category headings stranding single cards
		await fireEvent.error(container.querySelectorAll('img')[1]);
		expect([...container.querySelectorAll('[data-state]')].map((t) => t.getAttribute('data-state'))).toEqual(['loading', 'fallback', 'fallback']);
	});

	it('falls back to the list once every photo fails, with no grey tiles', async () => {
		const { container } = render(MenuOrder, { props: { items: [{ ...fries, image: 'https://img.example/1' }, { ...shake, image: 'https://img.example/2' }] } });
		for (const img of container.querySelectorAll('img')) await fireEvent.error(img);
		expect(container.querySelector('article')).toBeNull();
		expect(container.querySelector('[data-state]')).toBeNull();
	});

	it('clamps names to two lines with the full name in title, behind a bare muted kind glyph', () => {
		const { container } = render(MenuOrder, { props: { items: [fries, { ...shake, kind: 'pizza' }] } });
		const name = screen.getByText('Shoestring Fries');
		expect(name.className).toContain('line-clamp-2');
		expect(name.getAttribute('title')).toBe('Shoestring Fries');
		const glyphs = container.querySelectorAll('li svg[aria-hidden="true"]');
		expect(glyphs).toHaveLength(2); // an unknown kind still gets the fallback glyph
		expect(glyphs[0].getAttribute('class')).toContain('text-ripple-muted-foreground');
	});

	it('starts the headline at the lowest price above 0, and drops "from" when none is', () => {
		render(MenuOrder, { props: { items: [fries, { product_id: 'water', name: 'Tap Water', price: 0 }, { product_id: 'credit', name: 'Credit', price: -2 }] } });
		expect(screen.getByText('3 items · from $3.49')).toBeTruthy();
		cleanup();
		render(MenuOrder, { props: { items: [{ product_id: 'water', name: 'Tap Water', price: 0 }] } });
		expect(screen.getByText('1 item')).toBeTruthy();
	});

	it('splits a group into two columns only when it has 2+ items', () => {
		render(MenuOrder, { props: { items: [fries, { ...fries, product_id: 'curly', name: 'Curly Fries' }, shake] } });
		expect(screen.getByRole('list', { name: 'Sides' }).className).toContain('grid-cols-2');
		expect(screen.getByRole('list', { name: 'Shakes' }).className).not.toContain('grid-cols-2');
	});

	it('explains a maxed-out stepper and shows the price of an item that cannot be ordered in normal ink', () => {
		render(MenuOrder, { props: { items: [fries, { name: 'Ask the server', price: 16 }], checkout: true, preset: [{ id: 'shoestring-fries', qty: 20 }] } });
		const plus = btn('Add one Shoestring Fries') as HTMLButtonElement;
		expect(plus.disabled).toBe(true);
		expect(plus.title).toBe('Up to 20');
		expect(screen.getByText('$16.00').className).not.toContain('text-ripple-muted-foreground');
		expect(screen.getByText('$3.49').className).not.toContain('text-ripple-muted-foreground');
	});

	it('shows the item subtotal in the bar; the review adds the delivery fee', () => {
		render(MenuOrder, { props: { items, checkout: true, fulfilment: ['delivery'], fee: 4.5, preset: [{ id: 'fries', qty: 2 }] } });
		expect(screen.getByText('2 items')).toBeTruthy();
		expect(screen.getByText('$6.98')).toBeTruthy();
	});

	it('highlights a repeated product_id once, though both rows share its line', () => {
		const { container } = render(MenuOrder, { props: { items: [fries, { ...fries, id: 'fries-2' }], checkout: true, preset: [{ id: 'fries', qty: 2 }] } });
		expect(container.querySelectorAll('[role="group"][aria-label^="Quantity"]')).toHaveLength(1);
		expect(container.querySelectorAll('li > div.before\\:bg-ripple-accent')).toHaveLength(1);
	});
});

describe('menu-order — customise tiles', () => {
	const openBurger = async (props: Record<string, unknown> = {}) => {
		const r = render(MenuOrder, { props: { items, checkout: true, ...props } });
		await fireEvent.click(btn('Choose options for Double Smash Burger'));
		return r;
	};

	it('gives every store option an icon from its name, and an unknown name its group icon', async () => {
		await openBurger();
		expect(tile(/Large/).querySelector('.lucide-maximize-2')).not.toBeNull();
		expect(tile(/Regular/).querySelector('.lucide-ruler')).not.toBeNull(); // unknown → Size's icon
		expect(tile(/Extra cheese/).querySelector('.lucide-milk')).not.toBeNull();
		expect(tile(/Bacon/).querySelector('.lucide-ham')).not.toBeNull();
		expect(tile(/Jalapeños/).querySelector('.lucide-flame')).not.toBeNull();
		expect(tile(/Garlic aioli/).querySelector('.lucide-droplet')).not.toBeNull();
		expect(tile(/No sauce/).querySelector('.lucide-ban')).not.toBeNull();
	});

	it('ignores an option icon outside the map and uses the one inside it', async () => {
		const odd: MenuItem = {
			product_id: 'bowl',
			name: 'Grain Bowl',
			price: 10,
			groups: [{ id: 'base', name: 'Base', choose: 'one', icon: 'Trash2', options: [{ id: 'rice', name: 'Rice', icon: '<script>' }, { id: 'egg', name: 'Quinoa', icon: 'egg' }] }]
		};
		render(MenuOrder, { props: { items: [odd], checkout: true } });
		await fireEvent.click(btn('Choose options for Grain Bowl'));
		expect(tile(/Rice/).querySelector('.lucide-circle-dot')).not.toBeNull();
		expect(tile(/Quinoa/).querySelector('.lucide-egg-fried')).not.toBeNull();
	});

	it('lists what is chosen under the name, in menu order, with the running price', async () => {
		const { container } = await openBurger();
		const chosen = () => container.querySelector('[data-chosen]')!.textContent!.trim();
		expect(chosen()).toBe('Regular');
		await fireEvent.click(screen.getByLabelText(/Garlic aioli/));
		await fireEvent.click(screen.getByLabelText(/Extra cheese/));
		await fireEvent.click(screen.getByLabelText(/Large/));
		expect(chosen()).toBe('Large · Extra cheese · Garlic aioli');
		expect(chosen()).not.toContain('Bacon');
		expect(container.querySelector('[data-chosen]')!.parentElement!.textContent).toContain('$15.49'); // 11.99 + 2 + 1 + 0.5
		expect(btn(/^Add · \$15\.49$/)).toBeTruthy();
	});

	it('says when a capped group is full, and not before', async () => {
		await openBurger();
		for (const o of [/Avocado/, /Extra cheese/]) await fireEvent.click(screen.getByLabelText(o));
		expect(screen.queryByText(/picked the max/)).toBeNull();
		await fireEvent.click(screen.getByLabelText(/Bacon/));
		expect(screen.getByText("You've picked the max of 3. Untick one to swap it.")).toBeTruthy();
		await fireEvent.click(screen.getByLabelText(/Bacon/));
		expect(screen.queryByText(/picked the max/)).toBeNull();
	});

	it('moves and selects radio tiles with the arrow keys, wrapping, and focuses the choice', async () => {
		await openBurger();
		const regular = screen.getByLabelText(/Regular/) as HTMLInputElement;
		const large = screen.getByLabelText(/Large/) as HTMLInputElement;
		expect(regular.type).toBe('radio');
		expect(screen.getByRole('radiogroup', { name: 'Size' })).toBeTruthy();
		await fireEvent.keyDown(regular, { key: 'ArrowRight' });
		expect(large.checked).toBe(true);
		expect(document.activeElement).toBe(large);
		await fireEvent.keyDown(large, { key: 'ArrowDown' });
		expect((screen.getByLabelText(/Regular/) as HTMLInputElement).checked).toBe(true);
		await fireEvent.keyDown(screen.getByLabelText(/Regular/), { key: 'ArrowUp' });
		expect((screen.getByLabelText(/Large/) as HTMLInputElement).checked).toBe(true);
		expect(btn(/^Add · \$13\.99$/)).toBeTruthy();
	});

	it('shows a designed tile, not an empty box, when the item has no photo', async () => {
		const { container } = await openBurger();
		const tileEl = container.querySelector('[data-fallback]')!;
		expect(tileEl.textContent).toContain('Double Smash Burger');
		expect(tileEl.querySelector('.lucide-utensils-crossed')).not.toBeNull();
	});
});

describe('menu-order — streamed', () => {
	it('final streamed render equals the whole-spec render, with no error box', async () => {
		await expectStreamParity({
			ui: {
				type: 'menu-order',
				props: {
					title: 'Copper Griddle',
					currency: 'USD',
					featured: { id: 'smash-burger', reason: 'Our most ordered burger.' },
					fulfilment: ['pickup', 'delivery'],
					fee: { delivery: 3.99 },
					checkout: true,
					items: [
						burger,
						{ product_id: 'shoestring-fries', name: 'Shoestring Fries', price: 3.49, tags: ['vegan'] },
						{ name: 'Seasonal pie' },
						{ product_id: 'malted-shake' },
						fries
					]
				}
			}
		});
	});
});
