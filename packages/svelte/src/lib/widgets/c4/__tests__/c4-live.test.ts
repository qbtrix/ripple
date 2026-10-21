// c4-live.test.ts — the live layer of the C4 widget: explicit `kind`, the node
// decoration behind `status`/`selectedId`, the legend's status list, the
// camera plan behind `focusId`/`follow`, ELK's edge routes with the rounded
// path drawn through them, and what keeps a live map cheap to redraw (the
// zoom variable's value, the size handed to SvelteFlow up front, the resize
// marks), and the reach behind `highlight` (which elements and edges light, which dim). Pure
// functions, no DOM.

import { describe, it, expect } from 'vitest';
import type { Edge, Node } from '@xyflow/svelte';
import { getNodeType, computeElkLayout, computeElkGraph } from '../elk-layout.js';
import {
  decorateEdges,
  decorateNodes,
  linkKey,
  markResized,
  reachSet,
  nodeSetKey,
  planCamera,
  presized,
  roundedPath,
  statusesPresent,
  zoomVar,
  STATUS_LABELS,
} from '../live.js';
import type { C4Diagram, C4System, C4Component } from '$lib/widgets/c4/types.js';

const node = (id: string, extra: Partial<Node> = {}): Node => ({
  id,
  type: 'system',
  position: { x: 0, y: 0 },
  data: {},
  ...extra,
});

// Runs ELK; on a loaded machine that outlasts vitest's 5s default.
describe('getNodeType with an explicit kind', { timeout: 30000 }, () => {
  it('maps each kind to its node type', () => {
    expect(getNodeType({ id: 'p', name: 'P', kind: 'person', technology: 'x' } as C4System)).toBe('person');
    expect(getNodeType({ id: 's', name: 'S', kind: 'system' })).toBe('system');
    expect(getNodeType({ id: 'c', name: 'C', kind: 'container' })).toBe('container');
    expect(getNodeType({ id: 'k', name: 'K', kind: 'component', technology: 'Svelte' })).toBe('component');
    expect(getNodeType({ id: 'f', name: 'f.ts', kind: 'code' })).toBe('component');
  });

  it('keeps boundaries and database/queue shapes', () => {
    const boundary: C4System = { id: 'b', name: 'B', kind: 'container', containers: [{ id: 'x', name: 'X', kind: 'component' }] };
    expect(getNodeType(boundary)).toBe('group');
    expect(getNodeType({ id: 'd', name: 'D', kind: 'container', type: 'database' })).toBe('database');
  });

  it('leaves inference untouched without a kind', () => {
    const plain: C4Component = { id: 'auth', name: 'Auth', technology: 'Python', type: 'service' };
    expect(getNodeType(plain)).toBe('system');
    expect(getNodeType({ id: 'u', name: 'User' })).toBe('person');
  });

  it('nests code inside a component boundary through containers', async () => {
    const diagram: C4Diagram = {
      level: 'code',
      title: '',
      elements: [
        {
          id: 'ui', name: 'Editor parts', kind: 'component',
          containers: [
            { id: 'f1', name: 'CurveEditor.svelte', kind: 'code' },
            { id: 'f2', name: 'index.ts', kind: 'code' },
          ],
        },
      ],
      relationships: [],
    };
    const pos = await computeElkLayout(diagram);
    const box = pos.get('ui')!;
    for (const id of ['f1', 'f2']) {
      const p = pos.get(id)!;
      expect(p.x).toBeGreaterThanOrEqual(box.x);
      expect(p.y).toBeGreaterThan(box.y);
      expect(p.x + p.width).toBeLessThanOrEqual(box.x + box.width);
    }
  });
});

describe('decorateNodes', () => {
  const nodes = [node('a'), node('b', { selected: true }), node('c')];

  it('returns the very same nodes when no live input is given', () => {
    expect(decorateNodes(nodes, {})).toBe(nodes);
  });

  it('marks status on the wrapper and keeps untouched nodes by identity', () => {
    const out = decorateNodes(nodes, { status: { a: 'changing' } });
    expect(out[0].domAttributes).toEqual({ 'data-c4-status': 'changing' });
    expect(out[1]).toBe(nodes[1]);
    expect(out[2]).toBe(nodes[2]);
  });

  it('controls selection from selectedId', () => {
    const out = decorateNodes(nodes, { selectedId: 'c' });
    expect(out.map((n) => !!n.selected)).toEqual([false, false, true]);
    expect(out[0]).toBe(nodes[0]);
  });

  it('an empty selectedId string clears every selection', () => {
    const out = decorateNodes(nodes, { selectedId: '' });
    expect(out.some((n) => n.selected)).toBe(false);
  });
});

describe('statusesPresent', () => {
  it('lists the statuses on the given ids in legend order', () => {
    const status = { a: 'landed', b: 'failed', c: 'drift', z: 'changing' } as const;
    expect(statusesPresent(status, ['a', 'b', 'c'])).toEqual(['failed', 'drift', 'landed']);
    expect(statusesPresent(undefined, ['a'])).toEqual([]);
  });

  it('lists planned last, with its own label', () => {
    const status = { a: 'planned', b: 'landed', c: 'failed' } as const;
    expect(statusesPresent(status, ['a', 'b', 'c'])).toEqual(['failed', 'landed', 'planned']);
    expect(STATUS_LABELS.planned).toBe('Planned');
    expect(decorateNodes([node('a')], { status }).at(0)?.domAttributes).toEqual({ 'data-c4-status': 'planned' });
  });
});

describe('planCamera', () => {
  const ids = nodeSetKey([{ id: 'b' }, { id: 'a' }]);
  const other = nodeSetKey([{ id: 'x' }]);

  it('keys a node set independent of order', () => {
    expect(ids).toBe(nodeSetKey([{ id: 'a' }, { id: 'b' }]));
  });

  it('fits everything on the first layout without follow (the legacy fit)', () => {
    expect(planCamera(null, { ids })).toEqual({ nodeId: undefined, animate: false });
  });

  it('refits instantly when the node set changes, framing the focus when following', () => {
    expect(planCamera({ ids: other }, { ids, follow: true, focusId: 'a' })).toEqual({ nodeId: 'a', animate: false });
    expect(planCamera({ ids: other }, { ids, follow: false, focusId: 'a' })).toEqual({ nodeId: undefined, animate: false });
  });

  it('glides to a new focus within the same node set while following', () => {
    expect(planCamera({ ids, follow: true, focusId: 'a' }, { ids, follow: true, focusId: 'b' })).toEqual({ nodeId: 'b', animate: true });
  });

  it('stays put when nothing it follows changed, or follow is off', () => {
    expect(planCamera({ ids, follow: true, focusId: 'a' }, { ids, follow: true, focusId: 'a' })).toBeNull();
    expect(planCamera({ ids, follow: true, focusId: 'a' }, { ids, follow: false, focusId: 'b' })).toBeNull();
  });

  it('returns to the focus when follow turns back on', () => {
    expect(planCamera({ ids, follow: false, focusId: 'a' }, { ids, follow: true, focusId: 'a' })).toEqual({ nodeId: 'a', animate: true });
  });

  it('fits everything when the focus is not on this map', () => {
    expect(planCamera({ ids, follow: true, focusId: 'a' }, { ids, follow: true, focusId: 'zz' })).toEqual({ nodeId: undefined, animate: true });
  });
});

describe('computeElkGraph routes', { timeout: 30000 }, () => {
  const diagram: C4Diagram = {
    level: 'component',
    title: '',
    elements: [
      {
        id: 'spa', name: 'SPA', kind: 'container',
        containers: [
          { id: 'craft', name: 'Craft', kind: 'component' },
          { id: 'stores', name: 'Stores', kind: 'component' },
        ],
      },
      { id: 'ui', name: 'Editor parts', kind: 'component', external: true },
    ],
    relationships: [
      { from: 'craft', to: 'ghost', label: 'dropped: unknown end' },
      { from: 'craft', to: 'stores', label: 'session state' },
      { from: 'craft', to: 'ui', label: 'uses parts' },
    ],
  };

  it('keys routes by relationship index and starts/ends them on the node boxes', async () => {
    const { positions, routes } = await computeElkGraph(diagram);
    expect(routes.has(0)).toBe(false);
    for (const [i, from, to] of [[1, 'craft', 'stores'], [2, 'craft', 'ui']] as const) {
      const route = routes.get(i)!;
      const [a, b] = [positions.get(from)!, positions.get(to)!];
      const start = route.points[0];
      const end = route.points.at(-1)!;
      // absolute coordinates: on the source box's border, and on the target's
      expect(start.x).toBeGreaterThanOrEqual(a.x - 0.5);
      expect(start.x).toBeLessThanOrEqual(a.x + a.width + 0.5);
      expect([a.y, a.y + a.height].some((y) => Math.abs(start.y - y) < 0.5) || [a.x, a.x + a.width].some((x) => Math.abs(start.x - x) < 0.5)).toBe(true);
      expect([b.y, b.y + b.height].some((y) => Math.abs(end.y - y) < 0.5) || [b.x, b.x + b.width].some((x) => Math.abs(end.x - x) < 0.5)).toBe(true);
      expect(route.label?.width).toBeGreaterThan(0);
    }
  });

  it('keeps computeElkLayout returning the positions map', async () => {
    const pos = await computeElkLayout(diagram);
    expect([...pos.keys()].sort()).toEqual(['craft', 'spa', 'stores', 'ui']);
  });
});

describe('roundedPath', () => {
  it('draws straight runs and rounds each corner', () => {
    expect(roundedPath([], 8)).toBe('');
    expect(roundedPath([{ x: 0, y: 0 }, { x: 0, y: 50 }], 8)).toBe('M 0 0 L 0 50');
    expect(roundedPath([{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 40, y: 50 }], 8)).toBe('M 0 0 L 0 42 Q 0 50 8 50 L 40 50');
  });

  it('shrinks the radius on a short jog', () => {
    expect(roundedPath([{ x: 0, y: 0 }, { x: 0, y: 6 }, { x: 30, y: 6 }], 8)).toBe('M 0 0 L 0 3 Q 0 6 3 6 L 30 6');
  });
});

describe('zoomVar', () => {
  it('clamps to the range the cards read and rounds to two decimals', () => {
    expect(zoomVar(0.15)).toBe('0.5');
    expect(zoomVar(1.3)).toBe('1');
    expect(zoomVar(0.734)).toBe('0.73');
    expect(zoomVar(0.7341)).toBe(zoomVar(0.7339));
  });
});

describe('presized', () => {
  it('gives the rounded size and the three handles every C4 node draws', () => {
    const { measured, handles } = presized({ width: 200.4, height: 109.6 });
    expect(measured).toEqual({ width: 200, height: 110 });
    expect(handles?.map(({ type, position, x, y }) => ({ type, position, x, y }))).toEqual([
      { type: 'target', position: 'top', x: 96, y: -4 },
      { type: 'target', position: 'left', x: -4, y: 51 },
      { type: 'source', position: 'bottom', x: 96, y: 106 },
    ]);
  });
});

const box = (width: number, height: number) => ({ x: 0, y: 0, width, height });

describe('markResized', () => {
  it('leaves a node whose size held, or that is new, as the same object', () => {
    const nodes = [node('a'), node('b')];
    const out = markResized(nodes, new Map([['a', box(200, 110)]]), new Map([['a', box(200, 110)], ['b', box(10, 10)]]), 'a');
    expect(out[0]).toBe(nodes[0]);
    expect(out[1]).toBe(nodes[1]);
  });

  it('marks a resized node to grow from its old size, keeping its own style and attributes', () => {
    const n = node('g', { style: 'width: 400px; height: 300px', domAttributes: { 'data-c4-ghost': '' } });
    const [out] = markResized([n], new Map([['g', box(200, 110)]]), new Map([['g', box(400, 300)]]), 'b');
    expect(out.style).toBe('width: 400px; height: 300px;--c4-from-w: 200px; --c4-from-h: 110px;');
    expect(out.domAttributes).toEqual({ 'data-c4-ghost': '', 'data-c4-resized': 'b' });
  });
});

// A diamond (a fans out to b and c, both feed d), a tail past it (d → e → f → g), and x, a second
// caller of b: a co-caller that `both` must not reach, since both is in ∪ out, not undirected.
const graph = [
  ['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd'], ['d', 'e'], ['e', 'f'], ['f', 'g'], ['x', 'b'],
].map(([from, to]) => ({ from, to }));
const sorted = (s: Set<string>) => [...s].sort();

describe('reachSet', () => {
  it('follows relationships downstream for out, to the depth cap', () => {
    expect(sorted(reachSet(graph, 'a', 'out', 1).ids)).toEqual(['a', 'b', 'c']);
    expect(sorted(reachSet(graph, 'a', 'out', 3).ids)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(sorted(reachSet(graph, 'a', 'out', 1).links)).toEqual([linkKey('a', 'b'), linkKey('a', 'c')].sort());
  });

  it('follows relationships upstream for in', () => {
    expect(sorted(reachSet(graph, 'd', 'in', 1).ids)).toEqual(['b', 'c', 'd']);
    expect(sorted(reachSet(graph, 'd', 'in', 3).ids)).toEqual(['a', 'b', 'c', 'd', 'x']);
  });

  it('takes both as in plus out, so a co-caller sibling stays out', () => {
    expect(sorted(reachSet(graph, 'b', 'both', 1).ids)).toEqual(['a', 'b', 'd', 'x']);
    expect(sorted(reachSet(graph, 'b', 'both', 3).ids)).toEqual(['a', 'b', 'd', 'e', 'f', 'x']);
    expect(reachSet(graph, 'b', 'both', 3).links.has(linkKey('a', 'c'))).toBe(false);
  });

  it('defaults to both at depth 3 and stops on a cycle', () => {
    expect(sorted(reachSet(graph, 'b').ids)).toEqual(['a', 'b', 'd', 'e', 'f', 'x']);
    const loop = [{ from: 'p', to: 'q' }, { from: 'q', to: 'r' }, { from: 'r', to: 'p' }];
    expect(sorted(reachSet(loop, 'p', 'out', 50).ids)).toEqual(['p', 'q', 'r']);
    expect(reachSet(loop, 'p', 'out', 50).links.size).toBe(3);
  });
});

describe('decorateEdges', () => {
  const edge = (source: string, target: string, extra: Partial<Edge> = {}): Edge => ({
    id: `${source}-${target}`, source, target, type: 'c4', style: 'stroke: x;', animated: false, data: { points: [] }, ...extra,
  });
  const edges = [edge('a', 'b'), edge('b', 'd', { animated: true }), edge('x', 'b'), edge('c', 'd', { type: 'smoothstep', data: undefined })];
  const reach = reachSet(graph, 'a', 'out', 2);

  it('returns the same array with no reach and the default shape', () => {
    expect(decorateEdges(edges, {})).toBe(edges);
    expect(decorateEdges(edges, { reach: null })).toBe(edges);
  });

  it('lights and animates the edges inside the reach, dims and stills the rest', () => {
    const out = decorateEdges(edges, { reach });
    const [ab, bd, xb, cd] = out;
    for (const e of [ab, bd, cd]) {
      expect(e.animated, e.id).toBe(true);
      expect(e.class, e.id).toContain('c4-reach');
      expect(e.style, e.id).toContain('var(--ripple-accent)');
      expect(e.domAttributes, e.id).toBeUndefined();
    }
    expect(xb.animated).toBe(false);
    expect(xb.domAttributes).toEqual({ 'data-c4-dim': '' });
    expect(xb.data?.dim).toBe(true);
  });

  it('keeps the accent, and a dash, but animates nothing when still', () => {
    const out = decorateEdges([...edges, edge('a', 'c', { style: 'stroke: x; stroke-dasharray: 4 4;' })], { reach, still: true });
    expect(out.some((e) => e.animated)).toBe(false);
    expect(out[0].style).toContain('var(--ripple-accent)');
    expect(out[4].style).toContain('stroke-dasharray: 4 4');
  });

  it('reads an aggregated edge as inside when any relationship behind it is', () => {
    const lifted = edge('pe', 'rp', { data: { links: [linkKey('q', 'z'), linkKey('a', 'b')] } });
    expect(decorateEdges([lifted], { reach })[0].class).toContain('c4-reach');
    const other = edge('pe', 'rp', { data: { links: [linkKey('q', 'z')] } });
    expect(decorateEdges([other], { reach })[0].domAttributes).toEqual({ 'data-c4-dim': '' });
  });
});
