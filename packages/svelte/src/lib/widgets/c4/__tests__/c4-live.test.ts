// c4-live.test.ts — the live layer of the C4 widget: explicit `kind`, the node
// decoration behind `status`/`selectedId`, the legend's status list, the
// camera plan behind `focusId`/`follow`, ELK's edge routes with the rounded
// path drawn through them, and what keeps a live map cheap to redraw (the
// zoom variable's value, the size handed to SvelteFlow up front, the resize
// marks), the reach behind `highlight` (which elements and edges light, which dim), the curve
// behind `edgeShape: 'curved'`, and ELK's fan-out on a five-edge node. Pure functions, no DOM.

import { describe, it, expect } from 'vitest';
import type { Edge, Node } from '@xyflow/svelte';
import { getNodeType, computeElkLayout, computeElkGraph } from '../elk-layout.js';
import {
  curveEdge,
  decorateEdges,
  decorateNodes,
  linkKey,
  markResized,
  bundleEdges,
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

  it('lists added and removed after landed, and future after planned, each with its own label', () => {
    const status = { a: 'future', b: 'planned', c: 'removed', d: 'landed', e: 'added' } as const;
    expect(statusesPresent(status, ['a', 'b', 'c', 'd', 'e'])).toEqual(['landed', 'added', 'removed', 'planned', 'future']);
    expect([STATUS_LABELS.added, STATUS_LABELS.removed, STATUS_LABELS.future]).toEqual(['Added', 'Removed', 'Future']);
    expect(decorateNodes([node('c')], { status }).at(0)?.domAttributes).toEqual({ 'data-c4-status': 'removed' });
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
  it('marks curved edges, adds arrowheads and swaps the routeless fallback for a bezier', () => {
    const out = decorateEdges(edges, { curved: true });
    expect(out[0].data?.curved).toBe(true);
    expect(out[0].markerEnd).toBeTruthy();
    expect(out[3].type).toBe('default');
    const lit = decorateEdges(edges, { curved: true, reach });
    expect(lit[0].markerEnd).not.toEqual(out[0].markerEnd);
  });
});

describe('curveEdge', () => {
  // Down from (0,0), across, down into (200,200): the ports face down and up.
  const route = [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }];
  const label = { x: 10, y: 60, width: 60, height: 20 };

  it('sweeps one cubic between the ports, tangents along them, 45% of the gap out', () => {
    expect(curveEdge(route, { labelBox: label })).toEqual({ d: 'M 0 0 C 0 90 200 110 200 200', at: { x: 100, y: 100 } });
  });

  it('follows a port that faces sideways', () => {
    const side = [{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 100, y: 50 }];
    expect(curveEdge(side, {}).d).toBe('M 0 0 C 0 22.5 55 50 100 50');
  });

  it('bends once through the route midpoint when the sweep would cross a card', () => {
    // The route runs down to y=150, across, and down; the sweep would cut the card at the middle.
    const low = [{ x: 0, y: 0 }, { x: 0, y: 150 }, { x: 200, y: 150 }, { x: 200, y: 200 }];
    const card = { x: 70, y: 85, width: 60, height: 30 };
    expect(curveEdge(low, { labelBox: label, cards: [card] })).toEqual({
      d: 'M 0 0 C 0 67.5 5 105 50 150 C 95 195 200 177.5 200 200',
      at: { x: 50, y: 150 },
    });
  });

  it('runs to and from a bundle join along its direction', () => {
    const out = curveEdge(route, { from: { at: { x: 0, y: 40 }, dir: { x: 0, y: 1 } }, to: { at: { x: 200, y: 130 }, dir: { x: 0, y: 1 } } });
    expect(out.d).toBe('M 0 40 C 0 80.5 200 89.5 200 130');
  });

  it('keeps the label where the layout put it when a card sits on the midpoint', () => {
    // Above and right of the midpoint (100,100): clear of the sweep, under a label centred there.
    const card = { x: 110, y: 76, width: 30, height: 18 };
    expect(curveEdge(route, { labelBox: label, cards: [card] })).toEqual({ d: 'M 0 0 C 0 90 200 110 200 200', at: { x: 40, y: 70 } });
  });
});

/** Points along an M/L/Q/C path, so a test can check where a drawn curve actually goes. */
function sample(d: string, steps = 16): { x: number; y: number }[] {
  const tok = d.split(' ');
  const pts: { x: number; y: number }[] = [];
  let at = { x: 0, y: 0 };
  for (let i = 0; i < tok.length; ) {
    const c = tok[i++];
    const num = () => Number(tok[i++]);
    if (c === 'M') (at = { x: num(), y: num() }), pts.push(at);
    else if (c === 'L') {
      const to = { x: num(), y: num() };
      for (let s = 1; s <= steps; s++) pts.push({ x: at.x + ((to.x - at.x) * s) / steps, y: at.y + ((to.y - at.y) * s) / steps });
      at = to;
    } else if (c === 'Q') {
      const [k, to] = [{ x: num(), y: num() }, { x: num(), y: num() }];
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const m = (a: number, b: number, e: number) => (1 - t) ** 2 * a + 2 * (1 - t) * t * b + t ** 2 * e;
        pts.push({ x: m(at.x, k.x, to.x), y: m(at.y, k.y, to.y) });
      }
      at = to;
    } else if (c === 'C') {
      const [k1, k2, to] = [{ x: num(), y: num() }, { x: num(), y: num() }, { x: num(), y: num() }];
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const m = (a: number, b: number, c2: number, e: number) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c2 + t ** 3 * e;
        pts.push({ x: m(at.x, k1.x, k2.x, to.x), y: m(at.y, k1.y, k2.y, to.y) });
      }
      at = to;
    }
  }
  return pts;
}

describe('bundleEdges', () => {
  const down = (sx: number, tx: number) => [{ x: sx, y: 0 }, { x: sx, y: 100 }, { x: tx, y: 100 }, { x: tx, y: 300 }];
  const into = (i: number, extra: Record<string, unknown> = {}): Edge => ({
    id: `s${i}-hub`, source: `s${i}`, target: 'hub', type: 'c4', data: { points: down(i * 100, 190 + i * 5), curved: true, ...extra },
  });
  const four = [0, 1, 2, 3].map((i) => into(i));
  const joinIn = (e: Edge) => e.data?.joinIn as { key: string; at: { x: number; y: number }; end: { x: number; y: number }; count: number; lead: boolean; open: boolean };

  it('joins four or more edges into one hub 70px before it, one of them leading', () => {
    const out = bundleEdges(four);
    expect(out.map((e) => joinIn(e).count)).toEqual([4, 4, 4, 4]);
    expect(out.map((e) => joinIn(e).lead)).toEqual([true, false, false, false]);
    expect(joinIn(out[0])).toMatchObject({ end: { x: 197.5, y: 300 }, at: { x: 197.5, y: 230 }, open: false });
    expect(new Set(out.map((e) => joinIn(e).key)).size).toBe(1);
  });

  it('leaves fewer than four alone and returns the same array when nothing bundles', () => {
    const three = four.slice(0, 3);
    expect(bundleEdges(three)).toBe(three);
  });

  it('opens a bundle when hovered or wholly inside the reach; an edge inside it alone draws whole', () => {
    const key = joinIn(bundleEdges(four)[0]).key;
    expect(bundleEdges(four, key).every((e) => joinIn(e).open)).toBe(true);
    expect(bundleEdges(four.map((e) => ({ ...e, data: { ...e.data, reach: true } }))).every((e) => joinIn(e).open)).toBe(true);
    const one = bundleEdges([into(0, { reach: true }), ...four.slice(1)]);
    expect(one.map((e) => [joinIn(e).open, joinIn(e).lead, joinIn(e).count])).toEqual([[true, false, 3], [false, true, 3], [false, false, 3], [false, false, 3]]);
  });
});

describe('a five-edge node', { timeout: 30000 }, () => {
  // The showcase's banking containers: the API has five relationships, two in and three out.
  const banking: C4Diagram = {
    level: 'container',
    title: '',
    elements: [
      { id: 'customer', name: 'Personal Banking Customer', external: true },
      {
        id: 'bank', name: 'Internet Banking System',
        containers: [
          { id: 'web-app', name: 'Web Application', technology: 'Java + Spring MVC', type: 'webapp' },
          { id: 'spa', name: 'Single-Page App', technology: 'JavaScript + Angular', type: 'webapp' },
          { id: 'mobile-app', name: 'Mobile App', technology: 'Xamarin', type: 'mobile' },
          { id: 'api', name: 'API Application', technology: 'Java + Spring MVC', type: 'api' },
          { id: 'db', name: 'Database', technology: 'Oracle', type: 'database' },
        ],
      },
      { id: 'mainframe', name: 'Mainframe Banking System', external: true },
      { id: 'email', name: 'E-mail System', external: true },
    ],
    relationships: [
      { from: 'customer', to: 'web-app', label: 'Visits bigbank.com', technology: 'HTTPS' },
      { from: 'customer', to: 'spa', label: 'Uses' },
      { from: 'customer', to: 'mobile-app', label: 'Uses' },
      { from: 'web-app', to: 'spa', label: 'Delivers to browser' },
      { from: 'spa', to: 'api', label: 'Calls', technology: 'JSON/HTTPS' },
      { from: 'mobile-app', to: 'api', label: 'Calls', technology: 'JSON/HTTPS' },
      { from: 'api', to: 'db', label: 'Reads/writes', technology: 'JDBC' },
      { from: 'api', to: 'mainframe', label: 'Calls', technology: 'XML/HTTPS' },
      { from: 'api', to: 'email', label: 'Sends e-mail', style: 'async' },
    ],
  };
  const hub = [4, 5, 6, 7, 8];
  type Box = { x: number; y: number; width: number; height: number };
  const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  it('fans the ends apart on the node and keeps the label boxes from overlapping', async () => {
    const { routes } = await computeElkGraph(banking);
    const ends = hub.map((i) => {
      const pts = routes.get(i)!.points;
      const p = banking.relationships[i].from === 'api' ? pts[0] : pts.at(-1)!;
      return `${Math.round(p.x)},${Math.round(p.y)}`;
    });
    expect(new Set(ends).size).toBe(5);
    const boxes = [...routes.values()].map((r) => r.label!).filter(Boolean);
    expect(boxes).toHaveLength(9);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j]), `${i}/${j}`).toBe(false);
  });

  it('sweeps most edges, keeps every curve out of every card and every label clear', async () => {
    const { routes, positions } = await computeElkGraph(banking);
    // C4Diagram hands every curved edge the cards on the map (boundaries excluded: edges run inside them).
    const cards = [...positions].filter(([id]) => id !== 'bank').map(([, r]) => r);
    const inset = (b: Box): Box => ({ x: b.x + 1, y: b.y + 1, width: b.width - 2, height: b.height - 2 });
    const labels: Box[] = [];
    let swept = 0;
    for (const [i, r] of routes) {
      const { d, at } = curveEdge(r.points, { labelBox: r.label, cards });
      if (d.split(' C ').length === 2) swept++;
      for (const p of sample(d, 32)) {
        expect(cards.find((b) => overlaps(inset(b), { ...p, width: 0.01, height: 0.01 })), `edge ${i} at ${p.x},${p.y}`).toBeUndefined();
      }
      const box = { x: at!.x - r.label!.width / 2, y: at!.y - r.label!.height / 2, width: r.label!.width, height: r.label!.height };
      expect(cards.find((b) => overlaps(inset(b), box)), `label ${i}`).toBeUndefined();
      labels.push(box);
    }
    expect(swept).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) expect(overlaps(labels[i], labels[j]), `labels ${i}/${j}`).toBe(false);
  });
});
