// manifest/entries/place-results.ts: the LLM-facing entry for the
// place-results data widget (aliases places, place-list). The model lists
// places; the widget owns covers, sorting, the Open now filter and the map.
// No bound field; `on_choose` fires on "Tell me more".
import type { WidgetManifestEntry } from '../index.js';

export const placeResultsEntry: WidgetManifestEntry = {
  type: 'place-results',
  category: 'composite',
  description:
    'Place search results (cafes, restaurants, parks): cards with rating, price, distance, open now, sort and filter, and a numbered-pin map when lat/lng are given.',
  props: {
    title: { type: 'string', required: false, description: 'e.g. "Coffee near Union Square".' },
    query: { type: 'string', required: false, description: 'What was searched, shown under the title.' },
    places: {
      type: 'Array<{ id?: string; name: string; kind: "cafe" | "restaurant" | "bar" | "bakery" | "shop" | "park" | "museum" | "hotel" | "other"; rating?: number; reviews?: number; price?: 1 | 2 | 3 | 4; distance?: string | number; walkMinutes?: number; open?: boolean; hours?: string; address?: string; tags?: string[]; blurb?: string; lat?: number; lng?: number }>',
      required: true,
      description: 'Up to 20. `rating` 0 to 5, `price` 1 to 4 ($ to $$$$), `distance` like "0.4 km" (or km as a number). Give lat/lng to get the map. No images or links.',
    },
    showMap: { type: 'boolean', required: false, description: 'Default true when any place has lat/lng.' },
  },
  events: {
    on_choose: {
      type: 'EventAction | EventAction[]',
      required: false,
      description: 'Fires with { id, name, text } on "Tell me more", e.g. { action: "emit", target: "ask", value: { text: "Tell me more about this place" } }.',
    },
  },
  example: {
    type: 'place-results',
    props: {
      title: 'Coffee near Harbor Square',
      query: 'quiet cafes with wifi',
      places: [
        { id: 'p1', name: 'Blue Door Coffee', kind: 'cafe', rating: 4.7, reviews: 812, price: 2, distance: '350 m', walkMinutes: 4, open: true, hours: 'Until 6 pm', tags: ['wifi', 'quiet'], blurb: 'Bright corner room with long tables and single-origin pour-overs.', lat: 40.7359, lng: -73.9911 },
        { id: 'p2', name: 'Morning Loaf', kind: 'bakery', rating: 4.5, reviews: 403, price: 1, distance: '0.6 km', walkMinutes: 8, open: false, hours: 'Opens 7 am', tags: ['pastries'], lat: 40.7381, lng: -73.9873 },
      ],
    },
  },
};
