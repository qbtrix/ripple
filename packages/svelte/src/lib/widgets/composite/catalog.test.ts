// widgets/composite/catalog.test.ts: the three catalog data widgets
// (place-results, product-grid, media-grid): reading model rows, sort and
// filter, registry and manifest wiring, the ask hook, the bound list, safe
// images, streamed parity and junk props.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import Ripple from '$lib/Ripple.svelte';
import { expectStreamParity } from '$lib/streaming/__fixtures__/stream-parity.js';
import { manifestEntries } from '$lib/manifest/index.js';
import { getBindContract } from '@ripple-ui/core';
import { getWidget, hasWidget } from '../index.js';
import PlaceResults, { readPlaces, viewOf as placeView } from './PlaceResults.svelte';
import ProductGrid, { compareText, readProducts, viewOf as productView } from './ProductGrid.svelte';
import MediaGrid, { readItems } from './MediaGrid.svelte';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

const PLACES = [
	{ id: 'a', name: 'Blue Door', kind: 'cafe', rating: 4.2, price: 2, distance: '900 m', open: true, lat: 40.1, lng: -73.1 },
	{ id: 'b', name: 'Morning Loaf', kind: 'bakery', rating: 4.8, price: 1, distance: 0.3, open: false, lat: 40.2, lng: -73.2 },
	{ id: 'c', name: 'Night Owl', kind: 'bar', price: 3, distance: '1.2 km', open: true }
];
const PRODUCTS = [
	{ id: 'x', name: 'Quietline', brand: 'Sonora', category: 'Over-ear', price: 229, was: 299, rating: 4.6 },
	{ id: 'y', name: 'Pulse Buds', brand: 'Arcwave', category: 'Earbuds', price: 79, was: 99, rating: 4.1 },
	{ id: 'z', name: 'Studio One', brand: 'Arcwave', category: 'Over-ear', price: 149 }
];
const ITEMS = [
	{ id: 'd1', title: 'Deep Blue', genres: ['Nature'], year: 2021, minutes: 94, blurb: 'Kelp.' },
	{ id: 'd2', title: 'Salt and Ice', genres: ['Climate'], episodes: 6 }
];
const names = (c: Element, sel: string) => [...c.querySelectorAll(sel)].map((n) => n.textContent?.trim());

describe('catalog: registry and manifest', () => {
	it.each([
		['place-results', ['places', 'place-list']],
		['product-grid', ['products', 'deals', 'shop-grid']],
		['media-grid', ['watchlist', 'podcasts', 'shows']]
	])('%s resolves with its aliases and its manifest example renders', (type, aliases) => {
		for (const t of [type, ...aliases]) expect(hasWidget(t) && getWidget(t) === getWidget(type)).toBe(true);
		const entry = manifestEntries.find((e) => e.type === type)!;
		expect(entry.description.length).toBeLessThan(200);
		const { container } = render(Ripple, { props: { spec: { state: {}, ui: entry.example } } });
		expect(container.querySelector(`[data-widget="${type}"]`)).not.toBeNull();
		expect(container.querySelectorAll('[data-place],[data-product],[data-item]')).toHaveLength(2);
	});

	it('media-grid binds value through onchange', () => {
		expect(getBindContract('media-grid')).toEqual({ prop: 'value', event: 'onchange' });
	});
});

describe('place-results', () => {
	it('reads rows leniently and sorts with missing figures last', () => {
		const list = readPlaces([...PLACES, null, { kind: 'cafe' }, { name: 'X', kind: 'coffee', price: 9, lat: 200, lng: 1 }]);
		expect(list.map((p) => p.key)).toEqual(['a', 'b', 'c', 'r5']);
		expect(list[3]).toMatchObject({ kind: 'cafe', price: undefined });
		expect(list[3].lat).toBeUndefined();
		expect(list[1]).toMatchObject({ distance: '300 m', km: 0.3 });
		expect(placeView(list, 'rating', false).map((p) => p.key)).toEqual(['b', 'a', 'c', 'r5']);
		expect(placeView(list, 'distance', false).map((p) => p.key)).toEqual(['b', 'a', 'c', 'r5']);
		expect(placeView(list, 'price', true).map((p) => p.key)).toEqual(['a', 'c']);
	});

	it('sorts, filters Open now, selects a card and asks', async () => {
		const onchoose = vi.fn();
		const { container } = render(PlaceResults, { props: { places: PLACES, onchoose } });
		expect(container.querySelector('[data-slot="map"]')).not.toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Rating' }));
		expect(names(container, '[data-slot="name"]')).toEqual(['Morning Loaf', 'Blue Door', 'Night Owl']);
		await fireEvent.click(screen.getByRole('button', { name: /Open now/ }));
		expect(names(container, '[data-slot="name"]')).toEqual(['Blue Door', 'Night Owl']);
		const card = screen.getByRole('button', { name: 'Show Blue Door on the map' });
		await fireEvent.click(card);
		expect(card.getAttribute('aria-pressed')).toBe('true');
		expect(container.querySelector('[data-place="a"]')?.hasAttribute('data-selected')).toBe(true);
		await fireEvent.click(screen.getAllByRole('button', { name: 'Tell me more' })[0]);
		expect(onchoose).toHaveBeenCalledWith({ id: 'a', name: 'Blue Door', text: 'Tell me more about Blue Door' });
	});

	it('hides the map without coordinates or when showMap is false', () => {
		const { container, unmount } = render(PlaceResults, { props: { places: [PLACES[2]] } });
		expect(container.querySelector('[data-slot="map"]')).toBeNull();
		unmount();
		const r = render(PlaceResults, { props: { places: PLACES, showMap: false } });
		expect(r.container.querySelector('[data-slot="map"]')).toBeNull();
	});
});

describe('product-grid', () => {
	it('computes discounts, ignores a was below price, sorts', () => {
		const list = readProducts([...PRODUCTS, { name: 'Odd', price: 50, was: 40 }]);
		expect(list.map((p) => p.off)).toEqual([23, 20, undefined, undefined]);
		expect(list[3].was).toBeUndefined();
		expect(productView(list, 'price', null).map((p) => p.key)).toEqual(['r3', 'y', 'z', 'x']);
		expect(productView(list, 'discount', 'Over-ear').map((p) => p.key)).toEqual(['x', 'z']);
		expect(compareText(['A', 'B'])).toBe('Compare A and B');
		expect(compareText(['A', 'B', 'C'])).toBe('Compare A, B and C');
	});

	it('filters by category, builds a Compare tray capped at three, and asks', async () => {
		const onchoose = vi.fn();
		const { container } = render(ProductGrid, { props: { products: [...PRODUCTS, { id: 'w', name: 'Fourth', price: 5 }], onchoose } });
		await fireEvent.click(screen.getByRole('button', { name: 'Earbuds' }));
		expect(names(container, '[data-slot="name"]')).toEqual(['Pulse Buds']);
		await fireEvent.click(screen.getByRole('button', { name: 'All' }));
		for (const n of ['Quietline', 'Pulse Buds', 'Studio One']) await fireEvent.click(screen.getByRole('button', { name: `Compare ${n}` }));
		expect((screen.getByRole('button', { name: 'Compare Fourth' }) as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.click(container.querySelector('[data-slot="compare-go"]')!);
		expect(onchoose).toHaveBeenLastCalledWith({ ids: ['x', 'y', 'z'], names: ['Quietline', 'Pulse Buds', 'Studio One'], text: 'Compare Quietline, Pulse Buds and Studio One' });
		await fireEvent.click(screen.getByRole('button', { name: 'Choose Studio One' }));
		expect(onchoose).toHaveBeenLastCalledWith({ id: 'z', name: 'Studio One', text: "I'll take the Studio One" });
	});

	it('draws an https image through safeUrl and never a javascript: one; a broken image falls back', async () => {
		const { container } = render(ProductGrid, { props: { products: [{ id: 'a', name: 'A', price: 1, image: 'javascript:alert(1)' }, { id: 'b', name: 'B', price: 1, image: 'https://images.unsplash.com/x.jpg' }] } });
		const imgs = [...container.querySelectorAll('img')];
		expect(imgs.map((i) => i.getAttribute('src') ?? '')).not.toContain('javascript:alert(1)');
		const good = imgs.find((i) => i.getAttribute('src')?.startsWith('https://'))!;
		await fireEvent.error(good);
		expect(container.querySelector('[data-product="b"] img')).toBeNull();
	});
});

describe('media-grid', () => {
	it('reads items and halves a 10-point rating', () => {
		expect(readItems([{ title: 'A', rating: 8 }, { title: '' }, 'x'])).toMatchObject([{ key: 'r0', rating: 4 }]);
	});

	it('saves to my list, filters by genre, opens details and asks', async () => {
		const onchange = vi.fn();
		const onchoose = vi.fn();
		const { container } = render(MediaGrid, { props: { items: ITEMS, value: { saved: ['d2'] }, onchange, onchoose } });
		expect(screen.getByRole('button', { name: 'My list (1)' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Add Deep Blue to my list' }));
		expect(onchange).toHaveBeenLastCalledWith({ saved: ['d2', 'd1'] });
		await fireEvent.click(screen.getByRole('button', { name: 'Remove Salt and Ice from my list' }));
		await fireEvent.click(screen.getByRole('button', { name: 'My list (1)' }));
		expect(names(container, '[data-slot="title"]')).toEqual(['Deep Blue']);
		await fireEvent.click(screen.getByRole('button', { name: 'All' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Climate' }));
		expect(names(container, '[data-slot="title"]')).toEqual(['Salt and Ice']);
		await fireEvent.click(screen.getByRole('button', { name: 'Details for Salt and Ice' }));
		const dialog = screen.getByRole('dialog', { name: 'Salt and Ice' });
		expect(dialog.textContent).toContain('6 episodes');
		await fireEvent.click(screen.getByRole('button', { name: 'Tell me more' }));
		expect(onchoose).toHaveBeenCalledWith({ id: 'd2', name: 'Salt and Ice', text: 'Tell me more about Salt and Ice' });
		await fireEvent.keyDown(dialog, { key: 'Escape' });
		expect(screen.queryByRole('dialog')).toBeNull();
	});
});

describe('catalog: streaming and junk', () => {
	it.each([
		// Without coordinates: Leaflet's DOM depends on its async mount, and the map has its own tests.
		['place-results', { title: 'Coffee', places: [...PLACES.map(({ lat: _a, lng: _b, ...p }) => p), {}, 'x'] }],
		['product-grid', { title: 'Deals', products: [...PRODUCTS, { name: 'Half' }] }],
		['media-grid', { title: 'Docs', kind: 'podcast', items: [...ITEMS, {}] }]
	])('%s streams and ends equal to the whole render', async (type, props) => {
		await expectStreamParity({ state: {}, ui: { type, props } });
	});

	it.each([
		[PlaceResults, { places: 'x', title: 7, showMap: 'yes' }],
		[PlaceResults, { places: [null, 3, { name: { a: 1 }, tags: 'x', rating: 'NaN' }] }],
		[ProductGrid, { products: {}, currency: 5, filters: 'no' }],
		[ProductGrid, { products: [{ name: 'A', price: 'free', specs: 'x', image: 7 }] }],
		[MediaGrid, { items: 'x', kind: 9, value: 'z' }],
		[MediaGrid, { items: [{ title: 'A', genres: 'x' }], value: { saved: [1, 'a'] } }]
	])('junk props render without throwing (%#)', (C, props) => {
		const { container } = render(C as never, { props: props as never });
		expect(container.querySelector('[data-widget]')).not.toBeNull();
	});
});
