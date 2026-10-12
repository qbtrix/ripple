// manifest/entries/product-grid.ts: the LLM-facing entry for the
// product-grid data widget (aliases products, deals, shop-grid). The model
// lists products; the widget owns covers, discount badges, sort, category
// chips and the Compare tray. No bound field; `on_choose` fires on Choose
// and on Compare.
import type { WidgetManifestEntry } from '../index.js';

export const productGridEntry: WidgetManifestEntry = {
  type: 'product-grid',
  category: 'composite',
  description:
    'Product grid for shopping and deals: cards with price, was-price and discount badge, rating, spec chips, sort, category chips and a pick-2-or-3 Compare tray.',
  props: {
    title: { type: 'string', required: false, description: 'e.g. "Headphone deals this week".' },
    currency: { type: 'string', required: false, description: 'ISO code. Default "USD".' },
    products: {
      type: 'Array<{ id?: string; name: string; brand?: string; category?: string; price: number; was?: number; rating?: number; reviews?: number; badge?: string; color?: "blue" | "violet" | "teal" | "green" | "amber" | "rose" | "orange" | "slate"; image?: string; specs?: string[] }>',
      required: true,
      description: 'Up to 24. `was` above `price` shows a strike-through and a computed discount. `badge` like "Best seller". Up to 3 short `specs`. Covers are generated; skip `image`.',
    },
    filters: { type: 'boolean', required: false, description: 'Category chips built from the data. Default true.' },
  },
  events: {
    on_choose: {
      type: 'EventAction | EventAction[]',
      required: false,
      description: 'Fires with { id, name, text } on Choose and { ids, names, text: "Compare A and B" } from the Compare tray. May emit ask.',
    },
  },
  example: {
    type: 'product-grid',
    props: {
      title: 'Headphone deals',
      currency: 'USD',
      products: [
        { id: 'h1', name: 'Quietline 700', brand: 'Sonora', category: 'Over-ear', price: 229, was: 299, rating: 4.6, reviews: 2140, badge: 'Best seller', color: 'slate', specs: ['30 h battery', 'ANC'] },
        { id: 'h2', name: 'Pulse Buds', brand: 'Arcwave', category: 'Earbuds', price: 79, was: 99, rating: 4.3, reviews: 860, color: 'violet', specs: ['IPX4', '8 h'] },
      ],
    },
  },
};
