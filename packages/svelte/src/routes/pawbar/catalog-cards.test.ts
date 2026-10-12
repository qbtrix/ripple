// routes/pawbar/catalog-cards.test.ts: the landing's card policy on the
// catalog widgets (place-results, product-grid, media-grid): realistic cards
// pass, `on_choose` may emit ask, and an `image` takes the URL rules.
import { describe, expect, it } from 'vitest';
import { refuseCard } from './card-policy.js';

const ask = { action: 'emit', target: 'ask', value: { text: 'Tell me more about this one' } };
const cards = {
	places: { ui: { type: 'place-results', on_choose: ask, props: { title: 'Coffee', places: [{ name: 'Blue Door Coffee', kind: 'cafe', rating: 4.7, reviews: 812, price: 2, distance: '350 m', walkMinutes: 4, open: true, tags: ['wifi'], lat: 40.73, lng: -73.99 }] } } },
	products: { ui: { type: 'product-grid', on_choose: ask, props: { title: 'Deals', currency: 'USD', products: [{ name: 'Quietline 700', brand: 'Sonora', price: 229, was: 299, badge: 'Best seller', image: 'https://images.unsplash.com/photo-1.jpg', specs: ['ANC'] }] } } },
	media: { state: { list: { saved: [] } }, ui: { type: 'media-grid', bind: '{state.list}', on_choose: ask, props: { kind: 'podcast', items: [{ title: 'Deep Time', by: 'Ana Ruiz', episodes: 42, genres: ['Science'] }] } } }
};

describe('card policy: catalog widgets', () => {
	it.each(Object.entries(cards))('a realistic %s card passes', (_n, card) => {
		expect(refuseCard(card)).toBeNull();
	});

	it.each(['javascript:alert(1)', 'data:text/html,x', '//evil.example/x.png', '{state.u}'])('refuses image %s', (image) => {
		const card = structuredClone(cards.products);
		card.ui.props.products[0].image = image;
		expect(refuseCard(card)).not.toBeNull();
		const media = structuredClone(cards.media) as { ui: { props: { items: Record<string, unknown>[] } } };
		media.ui.props.items[0].image = image;
		expect(refuseCard(media)).not.toBeNull();
	});

	it('refuses an ask with built text', () => {
		const card = structuredClone(cards.places) as { ui: { on_choose: unknown } };
		card.ui.on_choose = { ...ask, value: { text: '{item.name}' } };
		expect(refuseCard(card)).not.toBeNull();
	});
});
