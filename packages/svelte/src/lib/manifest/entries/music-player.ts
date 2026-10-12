// manifest/entries/music-player.ts: the LLM-facing entry for the
// music-player data widget (aliases music-playlist, focus-music). The model
// writes the playlist (a preset sound and a length per track); the widget
// generates the sound in the browser and owns the player. No audio URLs.
// `value` is the bound field (default value / onchange); no events.
import type { WidgetManifestEntry } from '../index.js';

export const musicPlayerEntry: WidgetManifestEntry = {
  type: 'music-player',
  category: 'composite',
  description:
    'Music player whose sounds are generated in the browser (no files or URLs): a playlist of preset tracks with play, skip, shuffle, repeat, seek and volume. Bind value.',
  props: {
    title: { type: 'string', required: false, description: 'e.g. "Focus mix". Up to 80 characters.' },
    tracks: {
      type: 'Array<{ id?: string; title: string; artist?: string; sound: "rain" | "brown-noise" | "white-noise" | "ocean" | "forest" | "lofi" | "drone" | "piano"; minutes?: number; color?: "blue" | "violet" | "teal" | "green" | "amber" | "rose" | "orange" | "slate" }>',
      required: true,
      description: 'Up to 30 tracks. `sound` picks the generated preset (unknown falls back to drone); `minutes` is the track length, 1 to 60, default 3; `color` tints the cover.',
    },
    autoplay: { type: 'boolean', required: false, description: 'Highlights Play. Sound still starts only when the visitor presses it.' },
    volume: { type: 'number', required: false, description: 'Starting volume, 0 to 1. Default 0.7.' },
    value: {
      type: '{ index: number; playing: boolean; shuffle: boolean; repeat: boolean }',
      required: false,
      description: 'Two-way bind with `bind: "{state.music}"`. Written on play, pause, track change and toggles. A restored value never starts sound.',
    },
  },
  example: {
    type: 'music-player',
    bind: '{state.music}',
    props: {
      title: 'Focus mix',
      tracks: [
        { title: 'Soft rain', sound: 'rain', minutes: 10 },
        { title: 'Late night keys', artist: 'Studio', sound: 'lofi', minutes: 4, color: 'violet' },
        { title: 'Still water', sound: 'ocean', minutes: 8 },
        { title: 'Slow piano', sound: 'piano', minutes: 5 },
      ],
    },
  },
};
