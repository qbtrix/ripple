// widgets/composite/catalog.ssr.test.ts: place-results, product-grid and
// media-grid render through svelte/server: cards, generated covers and
// computed badges ship in the HTML, and the map is left to mount time.
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import PlaceResults from './PlaceResults.svelte';
import ProductGrid from './ProductGrid.svelte';
import MediaGrid from './MediaGrid.svelte';

describe('catalog widgets SSR', () => {
	it('place-results renders cards with pin numbers and an open pill', () => {
		const { body } = render(PlaceResults, {
			props: { title: 'Coffee', places: [{ name: 'Blue Door', kind: 'cafe', rating: 4.7, price: 2, open: true, lat: 1, lng: 2 }, { name: 'Loaf', kind: 'bakery' }] }
		});
		expect(body).toContain('Coffee');
		expect(body.match(/data-place=/g)).toHaveLength(2);
		expect(body).toMatch(/data-slot="pin-number"[^>]*>1</);
		expect(body).toContain('data-slot="map"');
		expect(body).toMatch(/data-slot="open"[^>]*>\s*Open/);
	});

	it('product-grid renders the discount and the struck was-price', () => {
		const { body } = render(ProductGrid, { props: { products: [{ name: 'Quietline', brand: 'Sonora', price: 77, was: 100 }] } });
		expect(body).toMatch(/data-slot="discount"[^>]*>-23%</);
		expect(body).toContain('$100.00');
		expect(body).toContain('>S<');
	});

	it('media-grid renders square posters for podcasts and the list count', () => {
		const { body } = render(MediaGrid, { props: { kind: 'podcasts', items: [{ title: 'Deep Time' }], value: { saved: [] } } });
		expect(body).toContain('aspect-square');
		expect(body).toContain('Deep Time');
		expect(body).toContain('My list (0)');
	});
});
