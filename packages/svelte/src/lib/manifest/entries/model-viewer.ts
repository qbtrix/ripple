// manifest/entries/model-viewer.ts — the LLM-facing entry for `model-viewer`:
// a 3D model by built-in `asset` id (preferred) or raw `src`, with optional
// numbered labels on the asset's named anchors. `on_select` fires with
// { anchor, label } when a label is opened.
import type { WidgetManifestEntry } from '../index.js';

export const modelViewerEntry: WidgetManifestEntry = {
  type: 'model-viewer',
  category: 'media',
  description:
    'A 3D model the reader can orbit: a built-in model by `asset` id, or a GLB/GLTF `src`. Optional numbered labels on named points of the model.',
  props: {
    asset: {
      type: 'string',
      required: false,
      description: 'Built-in model id from the catalog, e.g. "plane". Wins over `src`. An unknown id shows a quiet "not available" box.',
    },
    src: {
      type: 'string',
      required: false,
      description: 'GLB or GLTF model URL, when no `asset` fits.',
    },
    annotations: {
      type: 'Array<{ anchor?: string; position?: string; normal?: string; label?: string; note?: string }>',
      required: false,
      description:
        "Up to 12 numbered labels. On an `asset`, `anchor` names one of its points (unknown anchors are dropped); `label` defaults to the anchor's label. Raw `position` ('x y z' metres) only for `src` models. Plain text: label up to 40 chars, note up to 280.",
    },
    focus: {
      type: 'string',
      required: false,
      description: 'Anchor whose note is open at start.',
    },
    poster: {
      type: 'string',
      required: false,
      description: 'Image shown before the model loads.',
    },
    alt: {
      type: 'string',
      required: false,
      description: 'Accessible description of the model.',
    },
    cameraControls: {
      type: 'boolean',
      required: false,
      description: 'Allow mouse / touch orbit and zoom. Default true.',
    },
    autoRotate: {
      type: 'boolean',
      required: false,
      description: 'Slowly rotate the model when idle. Default false.',
    },
    ar: {
      type: 'boolean',
      required: false,
      description: 'Enable the "View in your space" AR affordance where supported.',
    },
    environmentImage: {
      type: 'string',
      required: false,
      description: 'URL of an HDR / image-based lighting environment.',
    },
    exposure: {
      type: 'number',
      required: false,
      description: 'Scene exposure (1 = neutral).',
    },
    shadowIntensity: {
      type: 'number',
      required: false,
      description: 'Strength of the contact shadow under the model (0 to 1).',
    },
  },
  events: {
    on_select: {
      type: 'EventAction | EventAction[]',
      required: false,
      description: 'Fires with { anchor, label } when the reader opens a label by its pin or its line in the list.',
    },
  },
  example: {
    type: 'model-viewer',
    props: {
      src: 'https://modelviewer.dev/shared-assets/models/Astronaut.glb',
      alt: 'A 3D model of an astronaut',
      cameraControls: true,
      annotations: [
        { position: '0 1.75 0.1', label: 'Helmet', note: 'Holds air at a steady pressure.' },
        { position: '0.3 1.1 0.15', label: 'Chest pack' },
      ],
    },
  },
};
