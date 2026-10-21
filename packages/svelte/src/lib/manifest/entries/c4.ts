import type { WidgetManifestEntry } from '../index.js';

export const c4Entry: WidgetManifestEntry = {
  type: 'c4',
  category: 'data',
  description: 'C4 architecture diagram (Context / Container / Component / Code): ELK auto-layout, drill-down, live status rings, reach highlighting, curved edges, flow playback and in-place zoom down to code.',
  props: {
    diagram: {
      type: '{ title: string; level: "context" | "container" | "component" | "code"; description?: string; elements: Array<{ id: string; name: string; kind?: "person" | "system" | "container" | "component" | "code"; type?: string; description?: string; technology?: string; external?: boolean; drillable?: boolean; children?: Element[]; code?: { startLine: number; before: string[]; after?: string[]; changed?: [number, number]; language?: string } }>; relationships: Array<{ from: string; to: string; label?: string; technology?: string; style?: "sync" | "async" | "event" }> }',
      required: true,
      description: 'C4 diagram definition. `kind` sets the shape; without it the shape is inferred from the fields present. type "database" or "queue" draws those shapes. An empty title hides the header.',
    },
    status: {
      type: 'Record<string, "changing" | "changed" | "landed" | "drift" | "failed" | "planned" | "future" | "removed">',
      required: false,
      description: 'Live state per element id, drawn as a ring and listed in the legend. "planned" is a dashed blueprint for something not built yet, "future" a dotted one further out, and "removed" a ghost of an element that is gone (for a before/after comparison).',
    },
    markers: {
      type: 'Record<string, Array<{ id: string; label: string; color: string }>>',
      required: false,
      description: 'Dots per element id: who or what is working there. color is any CSS colour or var(--token).',
    },
    focusId: { type: 'string', required: false, description: 'Element the camera frames while follow is true.' },
    follow: { type: 'boolean', required: false, description: 'Keep the camera on focusId.' },
    selectedId: { type: 'string', required: false, description: 'Controlled selection. Leave unset to let clicks select.' },
    expanded: {
      type: 'string[]',
      required: false,
      description: 'Element ids drawn open on one canvas (semantic zoom). Passing it, even empty, turns the mode on; a code element with `code` opens as a code panel.',
    },
    scopeId: { type: 'string', required: false, description: 'Semantic zoom: the element being looked inside; everything outside it is ghosted.' },
    highlight: {
      type: '{ id: string; reach?: "in" | "out" | "both"; depth?: number }',
      required: false,
      description: 'Light one element\'s reach and dim the rest. reach follows relationships upstream (in), downstream (out) or both (default), up to depth hops (default 3); edges inside it take the accent and animate, still under reduced motion. An id not on the map changes nothing.',
    },
    edgeShape: {
      type: '"orthogonal" | "curved"',
      required: false,
      description: 'How edges draw along the layout\'s routes: orthogonal with rounded corners (default), or smooth curves with arrowheads.',
    },
    flow: {
      type: '{ id: string; name: string; description?: string; steps: Array<{ from: string; to: string; label: string; technology?: string; reverse?: boolean; implied?: boolean } | { at: string; label: string } | { note: string }> }',
      required: false,
      description: 'A data flow played over the map one step at a time (pair with step). A message lights its two ends and relationship and runs a marker along it; reverse means the model draws the relationship to → from; implied (no relationship) draws a dashed hop. A process pulses its element; a note dims nothing.',
    },
    step: { type: 'number', required: false, description: 'Index of the flow\'s current step. Out of range, or without flow, no step is shown.' },
  },
  events: {
    on_step: {
      type: 'EventAction',
      required: false,
      description: 'Fires with the index of the next step on a clicked connection (the onstep prop), e.g. { action: "set", target: "step", value: "{event}" }.',
    },
  },
  example: {
    type: 'c4',
    props: {
      diagram: {
        title: 'E-Banking System',
        level: 'context',
        description: 'System context for the e-banking platform.',
        elements: [
          { id: 'user', name: 'User', kind: 'person', description: 'A customer.' },
          { id: 'system', name: 'E-Banking System', kind: 'system', description: 'Account management.' },
          { id: 'bank', name: 'Bank', kind: 'system', external: true, description: 'Upstream banking system.' },
        ],
        relationships: [
          { from: 'user', to: 'system', label: 'Uses' },
          { from: 'system', to: 'bank', label: 'API calls' },
        ],
      },
    },
  },
};
