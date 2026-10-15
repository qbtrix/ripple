// manifest/entries/iso-scene.ts: the LLM-facing entry for the iso-scene data
// widget (aliases iso, isometric). The model lists parts, motions over a few
// params, readouts and labels; Ripple draws and animates them. No SVG, no URLs.
// `value` is the bound field (the param values); no events.
import type { WidgetManifestEntry } from '../index.js';

export const isoSceneEntry: WidgetManifestEntry = {
  type: 'iso-scene',
  category: 'composite',
  description:
    'Live isometric drawing of a machine from a parts list that spins, slides, swings, pulses or flows, with sliders, readouts and labels. Aim for 12-30 parts; detail is added automatically.',
  props: {
    title: { type: 'string', required: false, description: 'Up to 80 characters.' },
    caption: { type: 'string', required: false, description: 'One plain sentence under the drawing. Up to 200 characters.' },
    look: { type: '"soft" | "color"', required: false, description: 'soft (default): Blueprint look, blue-grey parts in four soft tones, navy ink (white in dark), flows in brand blue, colors as faint tints. color: saturated fills.' },
    detail: { type: '"auto" | "none"', required: false, description: 'auto (default) adds small parts that belong to yours: feet, hubs, bolts, spider arms, pins, collars, clamps. none draws only what you wrote.' },
    scale: { type: 'number', required: false, description: 'Zoom, 0.4 to 2.5. Default 1 (fits the drawing).' },
    params: {
      type: 'Array<{ key: string; label: string; min: number; max: number; step?: number; unit?: string; value: number }>',
      required: false,
      description: 'Up to 6 sliders. `key` is an identifier that speeds and readouts can use, e.g. "cadence / 60".',
    },
    parts: {
      type: 'Array<{ id: string; kind: "slab" | "box" | "cylinder" | "disc" | "gear" | "tube" | "sphere" | "cone" | "rod" | "arrow" | "plate" | "chain"; at?: [x, y, z]; w?: number; d?: number; h?: number; r?: number; teeth?: number; axis?: "x" | "y" | "z"; path?: [x, y, z][]; from?: [x, y, z]; to?: [x, y, z]; around?: [string, string]; label?: string; detail?: "knob" | "none"; ghost?: boolean; texture?: "guilloche" | "ribs"; color?: "neutral" | "accent" | "red" | "blue" | "green" | "amber" | "metal"; on?: string }>',
      required: true,
      description:
        'Up to 150; aim for 12-30. Units are free (keep the scene within about 300 across); z is up. `at` is the centre. slab/box/plate: w, d, h (slab r rounds corners, plate shows `label`, `texture` decorates a plate or slab top). cylinder/disc/gear/cone: r, h along `axis` (default z). tube: `path` points, r. rod and arrow: from, to. chain: `around` two gear ids; it wraps both and moves with the one that spins. `on`: id of a parent part this one moves with. `ghost: true` draws a housing see-through; a solid that holds a moving part is see-through unless `ghost: false`. `detail: "knob"` knurls a knob, "none" skips added detail. Unknown kinds are skipped.',
    },
    motions: {
      type: 'Array<{ part: string; kind: "spin" | "slide" | "swing" | "pulse" | "flow" | "link"; axis?: "x" | "y" | "z"; speed?: number | string; range?: number | [number, number]; phase?: number; from?: string; to?: string; driven?: string; throw?: number }>',
      required: false,
      description:
        'Up to 20. speed is turns or cycles per second, a number or an expression over params written without braces, e.g. "cadence / 60". range: swing degrees (default 25), slide distance (8), pulse growth 0..0.6 (0.12); or [min, max] to move between the two. phase 0..1. flow animates tubes, rods and arrows. link: a rod whose ends ride the parts `from` and `to` (crank pin to piston). A slide with `driven`: id of a spinning crank, and `throw`: crank radius, follows that crank instead of its own speed.',
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
  pockets: [
    {
      name: 'Bicycle drivetrain on a stand',
      description: 'About 15 parts: frame tubes, chainring, cog, a chain around both, cranks and pedals.',
      state: { bike: {} },
      ui: {
        type: 'iso-scene',
        bind: 'state.bike',
        props: {
          title: 'Bicycle drivetrain',
          params: [{ key: 'cadence', label: 'Cadence', min: 30, max: 120, step: 5, unit: 'rpm', value: 80 }],
          parts: [
            { id: 'base', kind: 'slab', at: [50, 0, -16], w: 200, d: 64, h: 4, r: 6 },
            { id: 'stand', kind: 'box', at: [0, -12, 2], w: 8, d: 8, h: 32, color: 'metal' },
            { id: 'chainstay', kind: 'rod', from: [0, -9, 30], to: [110, -9, 30], r: 2.6, color: 'accent' },
            { id: 'seat-tube', kind: 'rod', from: [0, -9, 30], to: [-14, -9, 92], r: 2.6, color: 'accent' },
            { id: 'seat-stay', kind: 'rod', from: [110, -9, 30], to: [-12, -9, 84], r: 2.2, color: 'accent' },
            { id: 'down-tube', kind: 'rod', from: [0, -9, 30], to: [70, -9, 96], r: 2.8, color: 'accent' },
            { id: 'ring', kind: 'gear', at: [0, 0, 30], r: 22, h: 3, teeth: 40, axis: 'y', color: 'metal' },
            { id: 'cog', kind: 'gear', at: [110, 0, 30], r: 9, h: 3, teeth: 16, axis: 'y', color: 'metal' },
            { id: 'chain', kind: 'chain', around: ['ring', 'cog'], r: 1.4 },
            { id: 'crank', kind: 'rod', from: [0, 8, 30], to: [0, 8, -2], r: 2.4, color: 'metal', on: 'ring' },
            { id: 'pedal', kind: 'box', at: [0, 14, -2], w: 10, d: 12, h: 3, on: 'crank' },
            { id: 'crank-back', kind: 'rod', from: [0, -14, 30], to: [0, -14, 62], r: 2.4, color: 'metal', on: 'ring' },
            { id: 'pedal-back', kind: 'box', at: [0, -20, 62], w: 10, d: 12, h: 3, on: 'crank-back' },
            { id: 'derailleur', kind: 'box', at: [112, 6, 12], w: 8, d: 4, h: 12, color: 'metal' },
            { id: 'axle', kind: 'cylinder', at: [110, -4, 30], r: 2, h: 22, axis: 'y', on: 'cog' },
          ],
          motions: [
            { part: 'ring', kind: 'spin', axis: 'y', speed: 'cadence / 60' },
            { part: 'cog', kind: 'spin', axis: 'y', speed: 'cadence / 60 * 2.5' },
          ],
          readouts: [{ label: 'Road speed', value: 'cadence * 2.1 * 2.5 * 60 / 1000', unit: 'km/h', decimals: 1 }],
          labels: [
            { part: 'ring', label: 'Chainring', note: '40 teeth' },
            { part: 'cog', label: 'Rear cog', note: '16 teeth, 2.5 turns per pedal turn' },
            { part: 'chain', label: 'Chain' },
          ],
        },
      },
    },
    {
      name: 'Hand water pump',
      description: 'About 15 parts: a see-through barrel, a piston on a link rod from the handle, check valve, spout and bucket.',
      state: { pump: {} },
      ui: {
        type: 'iso-scene',
        bind: 'state.pump',
        props: {
          title: 'Hand water pump',
          params: [{ key: 'rate', label: 'Strokes', min: 10, max: 60, step: 5, unit: '/min', value: 30 }],
          parts: [
            { id: 'base', kind: 'slab', at: [10, 0, -2], w: 130, d: 70, h: 4, r: 6 },
            { id: 'pedestal', kind: 'box', at: [0, 0, 6], w: 34, d: 34, h: 12, color: 'metal' },
            { id: 'barrel', kind: 'cylinder', at: [0, 0, 40], r: 14, h: 56, ghost: true },
            { id: 'valve', kind: 'disc', at: [0, 0, 16], r: 10, h: 2 },
            { id: 'piston', kind: 'cylinder', at: [0, 0, 40], r: 12, h: 8, color: 'amber' },
            { id: 'cap', kind: 'disc', at: [0, 0, 69.5], r: 16, h: 3, color: 'metal' },
            { id: 'post', kind: 'box', at: [-28, 0, 76], w: 5, d: 5, h: 10, color: 'metal' },
            { id: 'handle', kind: 'rod', from: [-28, 0, 82], to: [-88, 0, 96], r: 2.4, color: 'metal' },
            { id: 'nose', kind: 'rod', from: [-28, 0, 82], to: [0, 0, 82], r: 2.4, color: 'metal', on: 'handle' },
            { id: 'grip', kind: 'cylinder', at: [-88, 0, 96], r: 3, h: 12, axis: 'y', detail: 'knob', on: 'handle' },
            { id: 'pump-rod', kind: 'rod', from: [0, 0, 44], to: [0, 0, 82], r: 1.6 },
            { id: 'spout', kind: 'tube', path: [[14, 0, 58], [36, 0, 58], [42, 0, 50]], r: 3.5, color: 'blue' },
            { id: 'water', kind: 'arrow', from: [42, 0, 46], to: [44, 0, 24], color: 'blue' },
            { id: 'bucket', kind: 'cylinder', at: [46, 0, 10], r: 11, h: 20, color: 'blue' },
          ],
          motions: [
            { part: 'handle', kind: 'swing', axis: 'y', range: 12, speed: 'rate / 60' },
            { part: 'piston', kind: 'slide', axis: 'z', range: [-8, 8], speed: 'rate / 60', phase: 0.5 },
            { part: 'pump-rod', kind: 'link', from: 'piston', to: 'nose' },
            { part: 'valve', kind: 'swing', axis: 'x', range: 18, speed: 'rate / 60' },
            { part: 'spout', kind: 'flow', speed: 'rate / 60' },
            { part: 'water', kind: 'flow', speed: 'rate / 60' },
          ],
          readouts: [{ label: 'Water per minute', value: 'rate * 0.4', unit: 'L', decimals: 1 }],
          labels: [
            { part: 'handle', label: 'Handle', note: 'push down to lift the piston' },
            { part: 'piston', label: 'Piston', note: 'lifts water up the barrel' },
            { part: 'valve', label: 'Check valve', note: 'keeps water from falling back' },
          ],
        },
      },
    },
  ],
};
