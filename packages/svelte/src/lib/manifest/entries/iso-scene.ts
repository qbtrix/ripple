// manifest/entries/iso-scene.ts: the LLM-facing entry for the iso-scene data
// widget (aliases iso, isometric). The model lists parts, motions over a few
// params, readouts and labels; Ripple draws and animates them. No SVG, no URLs.
// `value` is the bound field (the param values); no events.
import type { WidgetManifestEntry } from '../index.js';

export const isoSceneEntry: WidgetManifestEntry = {
  type: 'iso-scene',
  category: 'composite',
  description:
    'Live isometric drawing of a machine or system from a parts list: gears, tubes, slabs that spin, slide, swing, pulse or flow, with param sliders, readouts and numbered labels. Bind value.',
  props: {
    title: { type: 'string', required: false, description: 'Up to 80 characters.' },
    caption: { type: 'string', required: false, description: 'One plain sentence under the drawing. Up to 200 characters.' },
    scale: { type: 'number', required: false, description: 'Zoom, 0.4 to 2.5. Default 1 (fits the drawing).' },
    params: {
      type: 'Array<{ key: string; label: string; min: number; max: number; step?: number; unit?: string; value: number }>',
      required: false,
      description: 'Up to 6 sliders. `key` is an identifier that speeds and readouts can use, e.g. "cadence / 60".',
    },
    parts: {
      type: 'Array<{ id: string; kind: "slab" | "box" | "cylinder" | "disc" | "gear" | "tube" | "sphere" | "cone" | "rod" | "arrow" | "plate"; at?: [x, y, z]; w?: number; d?: number; h?: number; r?: number; teeth?: number; axis?: "x" | "y" | "z"; path?: [x, y, z][]; from?: [x, y, z]; to?: [x, y, z]; label?: string; color?: "neutral" | "accent" | "red" | "blue" | "green" | "amber" | "metal"; on?: string }>',
      required: true,
      description:
        'Up to 150. Units are free (keep the scene within about 300 across); z is up. `at` is the centre. slab/box/plate: w, d, h (slab r rounds corners, plate shows `label`). cylinder/disc/gear/cone: r, h along `axis` (default z). tube: `path` points, r. rod and arrow: from, to. `on`: id of a parent part this one moves with. Unknown kinds are skipped.',
    },
    motions: {
      type: 'Array<{ part: string; kind: "spin" | "slide" | "swing" | "pulse" | "flow"; axis?: "x" | "y" | "z"; speed: number | string; range?: number; phase?: number }>',
      required: false,
      description:
        'Up to 20. speed is turns or cycles per second, a number or an expression over params written without braces, e.g. "cadence / 60". range: swing degrees (default 25), slide distance (8), pulse growth 0..0.6 (0.12). phase 0..1. flow animates tubes, rods and arrows.',
    },
    readouts: {
      type: 'Array<{ label: string; value: string | number; unit?: string; decimals?: number }>',
      required: false,
      description: 'Up to 4 live numbers, each an expression over params without braces, e.g. "rate * 70 / 1000".',
    },
    labels: {
      type: 'Array<{ part?: string; at?: [x, y, z]; label: string; note?: string }>',
      required: false,
      description: 'Up to 10 numbered pins on a part (they follow it) or a point, listed with their notes under the drawing.',
    },
    value: { type: 'Record<string, number>', required: false, description: 'Two-way bind with `bind: "{state.scene}"`: the param values, written when a slider moves.' },
  },
  example: {
    type: 'iso-scene',
    bind: 'state.gears',
    props: {
      title: 'Two gears',
      params: [{ key: 'speed', label: 'Input speed', min: 10, max: 120, step: 5, unit: 'rpm', value: 40 }],
      parts: [
        { id: 'base', kind: 'slab', at: [20, 0, -4], w: 120, d: 60, h: 4, r: 6 },
        { id: 'big', kind: 'gear', at: [0, 0, 6], r: 30, h: 6, teeth: 30, color: 'metal' },
        { id: 'small', kind: 'gear', at: [44, 0, 6], r: 15, h: 6, teeth: 15, color: 'accent' },
      ],
      motions: [
        { part: 'big', kind: 'spin', speed: 'speed / 60' },
        { part: 'small', kind: 'spin', speed: 'speed / 60 * -2', phase: 0.03 },
      ],
      readouts: [{ label: 'Output speed', value: 'speed * 2', unit: 'rpm', decimals: 0 }],
      labels: [
        { part: 'big', label: 'Driver', note: '30 teeth' },
        { part: 'small', label: 'Driven', note: '15 teeth, twice as fast' },
      ],
    },
  },
};
