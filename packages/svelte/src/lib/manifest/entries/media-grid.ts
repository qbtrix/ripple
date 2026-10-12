// manifest/entries/media-grid.ts: the LLM-facing entry for the media-grid
// data widget (aliases watchlist, podcasts, shows). The model lists items;
// the widget owns generated posters, genre chips, the My list toggle and a
// details panel. `value` ({ saved: ids }) is the bound field; `on_choose`
// fires on "Tell me more".
import type { WidgetManifestEntry } from '../index.js';

export const mediaGridEntry: WidgetManifestEntry = {
  type: 'media-grid',
  category: 'composite',
  description:
    'Poster grid for documentaries, films, series, podcasts, books or albums: generated posters, genre chips, Add to list with a My list view, details on click. Bind value.',
  props: {
    title: { type: 'string', required: false, description: 'e.g. "Nature documentaries".' },
    kind: { type: '"documentary" | "film" | "series" | "podcast" | "book" | "album"', required: false, description: 'Sets the poster shape (square for podcast and album). Default "documentary".' },
    items: {
      type: 'Array<{ id?: string; title: string; by?: string; year?: number; minutes?: number; episodes?: number; rating?: number; genres?: string[]; blurb?: string; color?: "blue" | "violet" | "teal" | "green" | "amber" | "rose" | "orange" | "slate"; image?: string }>',
      required: true,
      description: 'Up to 24. `by` is the director, host or author. `rating` 0 to 5. Posters are generated from the title; skip `image`.',
    },
    value: { type: '{ saved: string[] }', required: false, description: 'Ids on the visitor\'s list. Use top-level `bind`.' },
  },
  events: {
    on_choose: {
      type: 'EventAction | EventAction[]',
      required: false,
      description: 'Fires with { id, name, text } on "Tell me more" in the details panel. May emit ask.',
    },
  },
  example: {
    type: 'media-grid',
    bind: '{state.list}',
    props: {
      title: 'Ocean documentaries',
      kind: 'documentary',
      items: [
        { id: 'd1', title: 'The Deep Blue Hours', by: 'Mara Ellison', year: 2021, minutes: 94, rating: 4.5, genres: ['Nature', 'Ocean'], blurb: 'A year with the night feeders of a kelp forest.', color: 'teal' },
        { id: 'd2', title: 'Salt and Ice', by: 'Tomas Reyes', year: 2019, minutes: 82, rating: 4.2, genres: ['Climate'], color: 'blue' },
      ],
    },
  },
};
