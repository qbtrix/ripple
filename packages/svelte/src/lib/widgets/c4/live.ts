// live.ts — the pure half of C4Diagram's live layer: how `status` and
// `selectedId` decorate SvelteFlow nodes, which statuses the legend lists,
// where the camera goes when the node set, the focus or follow mode changes,
// the rounded or curved path C4Edge draws (and how curved edges bundle at a hub), the stroke each
// relationship style gets (both the plain and the semantic-zoom graph use it), and the reach
// behind `highlight` (which elements and relationships light, how edges inside and outside it
// draw), and where a played flow step lands on the edges (markFlow). No DOM, no Svelte: C4Diagram,
// C4LiveLayer and C4Edge call these, tests call them direct.
//
// Invariant: with no live input, decorateNodes, decorateEdges and markFlow return the SAME array and
// objects they were given, so a diagram without the live props renders exactly as it did
// before they existed.

import type { Edge, EdgeMarker, MarkerType, Node, Position } from '@xyflow/svelte';
import type { C4Reach, C4Relationship, C4Status } from './types.js';

/** Legend order: what needs attention first; `planned` (not built yet) last. */
export const STATUS_ORDER: C4Status[] = ['failed', 'changing', 'drift', 'changed', 'landed', 'planned'];

export const STATUS_LABELS: Record<C4Status, string> = {
  failed: 'Failed check',
  changing: 'Changing now',
  drift: 'Drift',
  changed: 'Changed',
  landed: 'Landed',
  planned: 'Planned',
};

export interface LiveInput {
  status?: Record<string, C4Status>;
  /** When defined, selection is controlled: exactly this node is selected. */
  selectedId?: string;
}

export function decorateNodes(nodes: Node[], live: LiveInput): Node[] {
  const { status, selectedId } = live;
  if (!status && selectedId === undefined) return nodes;
  return nodes.map((n) => {
    const st = status?.[n.id];
    const selected = selectedId === undefined ? !!n.selected : n.id === selectedId;
    if (!st && selected === !!n.selected) return n;
    return {
      ...n,
      selected,
      ...(st ? { domAttributes: { ...n.domAttributes, 'data-c4-status': st } } : {}),
    };
  });
}

/** The statuses present on the given node ids, in legend order. */
export function statusesPresent(status: Record<string, C4Status> | undefined, ids: Iterable<string>): C4Status[] {
  if (!status) return [];
  const seen = new Set<C4Status>();
  for (const id of ids) {
    const st = status[id];
    if (st) seen.add(st);
  }
  return STATUS_ORDER.filter((s) => seen.has(s));
}

/** A stable key for a node set: changes only when ids are added or removed. */
export function nodeSetKey(nodes: readonly { id: string }[]): string {
  return nodes.map((n) => n.id).sort().join('\n');
}

export interface CameraState {
  /** nodeSetKey of the rendered nodes. */
  ids: string;
  focusId?: string;
  follow?: boolean;
}

/** fitView all nodes (no nodeId) or frame one; animate or jump. */
export interface CameraMove {
  nodeId?: string;
  animate: boolean;
}

/**
 * Where the camera goes after a change. A new node set (a level swap, a first
 * layout) always refits, instantly: gliding between unrelated layouts reads as
 * flying through nothing. Within one node set the camera moves only while
 * following: to a new focus, or back to the focus when follow turns on.
 * A focus that is not in the node set fits everything instead.
 */
export function planCamera(prev: CameraState | null, next: CameraState): CameraMove | null {
  const inView = !!next.focusId && next.ids.split('\n').includes(next.focusId);
  const target = next.follow && inView ? next.focusId : undefined;
  if (!prev || prev.ids !== next.ids) return { nodeId: target, animate: false };
  if (!next.follow) return null;
  if (prev.follow && prev.focusId === next.focusId) return null;
  return { nodeId: target, animate: true };
}

/**
 * An SVG path through orthogonal points with rounded corners. Each corner's
 * radius shrinks to half the shorter neighbouring segment, so short jogs stay
 * clean instead of overshooting.
 */
export function roundedPath(points: readonly { x: number; y: number }[], radius: number): string {
  if (points.length === 0) return '';
  const n = (v: number) => Math.round(v * 100) / 100;
  let d = `M ${n(points[0].x)} ${n(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = [points[i - 1], points[i], points[i + 1]];
    const r = Math.min(radius, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
    const inX = b.x - Math.sign(b.x - a.x) * r;
    const inY = b.y - Math.sign(b.y - a.y) * r;
    const outX = b.x + Math.sign(c.x - b.x) * r;
    const outY = b.y + Math.sign(c.y - b.y) * r;
    d += ` L ${n(inX)} ${n(inY)} Q ${n(b.x)} ${n(b.y)} ${n(outX)} ${n(outY)}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${n(last.x)} ${n(last.y)}`;
}

/** Edge strokes on ripple tokens, as strings: SvelteFlow takes an edge's style inline. */
export const EDGE_STROKE = 'color-mix(in oklab, var(--ripple-muted-foreground) 55%, transparent)';
export const EVENT_STROKE = 'color-mix(in oklab, var(--ripple-warning) 70%, transparent)';

/** How a relationship style draws: sync solid, async dashed and animated, event dashed in the warning tone. */
export function edgeLook(style?: C4Relationship['style']): { style: string; animated: boolean } {
  if (style === 'event') return { style: `stroke: ${EVENT_STROKE}; stroke-width: 1.25px; stroke-dasharray: 4 4;`, animated: false };
  if (style === 'async') return { style: `stroke: ${EDGE_STROKE}; stroke-width: 1.25px; stroke-dasharray: 8 4;`, animated: true };
  return { style: `stroke: ${EDGE_STROKE}; stroke-width: 1.25px;`, animated: false };
}

/** One style for an edge that stands for several relationships: theirs if they all share it, else sync. */
export function sharedStyle(styles: readonly (C4Relationship['style'] | undefined)[]): C4Relationship['style'] {
  const first = styles[0] ?? 'sync';
  return styles.every((s) => (s ?? 'sync') === first) ? first : 'sync';
}

/** A relationship's key in a reach's `links`; semantic edges carry the keys of everything they lift. */
export const linkKey = (from: string, to: string) => `${from}\n${to}`;

export interface ReachSet {
  /** Elements reached, the start included. */
  ids: Set<string>;
  /** Relationships walked (linkKey). */
  links: Set<string>;
}

/**
 * What a highlight on `id` reaches: relationships followed upstream (`in`), downstream (`out`) or
 * both (in plus out, never sideways to a co-caller), up to `depth` hops. Breadth-first, so each
 * element counts at its shortest distance and a cycle ends.
 */
export function reachSet(
  relationships: readonly Pick<C4Relationship, 'from' | 'to'>[],
  id: string,
  reach: C4Reach = 'both',
  depth = 3
): ReachSet {
  const out: ReachSet = { ids: new Set([id]), links: new Set() };
  const walk = (near: 'from' | 'to', far: 'from' | 'to') => {
    const seen = new Set([id]);
    let front = [id];
    for (let d = 0; d < depth && front.length; d++) {
      const at = new Set(front);
      front = [];
      for (const r of relationships) {
        if (!at.has(r[near])) continue;
        out.links.add(linkKey(r.from, r.to));
        if (!seen.has(r[far])) (seen.add(r[far]), front.push(r[far]));
      }
    }
    for (const s of seen) out.ids.add(s);
  };
  if (reach !== 'in') walk('from', 'to');
  if (reach !== 'out') walk('to', 'from');
  return out;
}

/** Drawn ids a reach lights: each reached element and every element above it (`pathOf`), so a
 *  lit card's boundaries stay lit and a hidden element lights its drawn ancestor. */
export function litIds(reached: Iterable<string>, pathOf: (id: string) => readonly string[]): Set<string> {
  const lit = new Set<string>();
  for (const id of reached) for (const p of pathOf(id)) lit.add(p);
  return lit;
}

export const REACH_STROKE = 'var(--ripple-accent)';
// Plain token colours: xyflow builds a marker's id from its colour, so no spaces or color-mix().
// Sized in user space, so a reach edge's heavier stroke does not grow its arrowhead.
const ARROW = { type: 'arrowclosed' as MarkerType, width: 28, height: 28, markerUnits: 'userSpaceOnUse' };
const EDGE_ARROW: EdgeMarker = { ...ARROW, color: 'var(--ripple-muted-foreground)' };
const REACH_ARROW: EdgeMarker = { ...ARROW, color: REACH_STROKE };

export interface EdgeDecoration {
  /** The highlight's reach: edges inside it light and animate, the rest dim and hold still. */
  reach?: ReachSet | null;
  /** edgeShape 'curved': C4Edge draws a curve, every edge gets an arrowhead. */
  curved?: boolean;
  /** Curved only: the cards on the map (absolute), which a curve tightens its bends to clear. */
  avoid?: readonly Rect[];
  /** Reduced motion: nothing animates; the accent stays. */
  still?: boolean;
}

export function decorateEdges(edges: Edge[], { reach, curved, still, avoid }: EdgeDecoration): Edge[] {
  if (!reach && !curved) return edges;
  return edges.map((e) => {
    const links = (e.data?.links as string[] | undefined) ?? [linkKey(e.source, e.target)];
    const inside = reach ? links.some((k) => reach.links.has(k)) : undefined;
    const next: Edge = { ...e, data: { ...e.data } };
    if (curved) {
      next.data!.curved = true;
      if (avoid) next.data!.avoid = avoid;
      next.markerEnd = inside ? REACH_ARROW : EDGE_ARROW;
      if (e.type === 'smoothstep') next.type = 'default';
    }
    if (inside) {
      next.data!.reach = true;
      next.animated = !still;
      next.class = typeof e.class === 'string' && e.class ? `${e.class} c4-reach` : 'c4-reach';
      // Swap the colour and weight only, so a dashed (async, event) edge keeps its dash.
      next.style = `${e.style ?? ''} stroke: ${REACH_STROKE}; stroke-width: 2px;`.trim();
    } else if (inside === false) {
      next.animated = false;
      next.data!.dim = true;
      next.domAttributes = { ...e.domAttributes, 'data-c4-dim': '' };
    }
    return next;
  });
}

type Pt = { x: number; y: number };

const inBox = (p: Pt, r: Rect) => p.x > r.x + 1 && p.x < r.x + r.width - 1 && p.y > r.y + 1 && p.y < r.y + r.height - 1;
const boxesMeet = (a: Rect, b: Rect) => a.x < b.x + b.width - 1 && b.x + 1 < a.x + a.width && a.y < b.y + b.height - 1 && b.y + 1 < a.y + a.height;
const unit = (p: Pt, q: Pt) => {
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  return { x: (q.x - p.x) / len, y: (q.y - p.y) / len };
};
type Cubic = [Pt, Pt, Pt, Pt];
const onCubic = ([p0, p1, p2, p3]: Cubic, t: number): Pt => {
  const [a, b, c, d] = [(1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3];
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
};
/** A cubic from `a` leaving along `u` to `b` arriving along `v`, each control point 45% of the gap out. */
const sweep = (a: Pt, u: Pt, b: Pt, v: Pt): Cubic => {
  const out = 0.45 * Math.abs(u.x * (b.x - a.x) + u.y * (b.y - a.y));
  const into = 0.45 * Math.abs(v.x * (b.x - a.x) + v.y * (b.y - a.y));
  return [a, { x: a.x + u.x * out, y: a.y + u.y * out }, { x: b.x - v.x * into, y: b.y - v.y * into }, b];
};
/** The point a fraction `f` of the way along a polyline. */
function along(points: readonly Pt[], f: number): Pt {
  const lens = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  let left = lens.reduce((a, b) => a + b, 0) * f;
  for (let i = 0; i < lens.length; i++) {
    if (left <= lens[i]) return { x: points[i].x + (points[i + 1].x - points[i].x) * (left / (lens[i] || 1)), y: points[i].y + (points[i + 1].y - points[i].y) * (left / (lens[i] || 1)) };
    left -= lens[i];
  }
  return points[points.length - 1];
}

export interface CurveInput {
  /** The label box the layout reserved beside the route. */
  labelBox?: Rect;
  /** Cards on the map (absolute): the sweep may not cross one, nor its label sit on one. */
  cards?: readonly Rect[];
  /** A bundle join standing in for the route's start or end: the edge leaves or arrives there along `dir`. */
  from?: { at: Pt; dir: Pt };
  to?: { at: Pt; dir: Pt };
}

/**
 * edgeShape 'curved': one cubic from the source port to the target port (or a bundle's join), leaving
 * and entering along the route's end segments with each control point 45% of the gap out, the arc of
 * a hand-drawn arrow; the label sits on its midpoint. If that sweep would cross a card, the curve bends
 * once instead, through a point of the route (ELK kept it clear; the middle first), with one smooth
 * tangent there: an S with one bump at most. If a card sits under the label's spot, the label keeps
 * the box the layout reserved.
 */
export function curveEdge(points: readonly Pt[], { labelBox, cards = [], from, to }: CurveInput): { d: string; at?: Pt } {
  const reserved = labelBox && { x: labelBox.x + labelBox.width / 2, y: labelBox.y + labelBox.height / 2 };
  if (points.length < 2) return { d: '', at: reserved };
  const n = (v: number) => Math.round(v * 100) / 100;
  const a = from?.at ?? points[0];
  const b = to?.at ?? points[points.length - 1];
  const u = from?.dir ?? unit(points[0], points[1]);
  const v = to?.dir ?? unit(points[points.length - 2], points[points.length - 1]);
  // ponytail: every sample scans every card (edges x cards x tries); a spatial index if a large curved map lags.
  const crossings = (c: Cubic) => Array.from({ length: 31 }, (_, i) => onCubic(c, (i + 1) / 32)).filter((p) => cards.some((r) => inBox(p, r))).length;
  let parts: Cubic[] = [sweep(a, u, b, v)];
  let mid = onCubic(parts[0], 0.5);
  if (crossings(parts[0])) {
    // Through one point of the route, the middle first: the first that clears, else the one that crosses least.
    const m = unit(a, b);
    const tries = [0.5, 0.35, 0.65, 0.25, 0.75].map((f) => {
      const w = along(points, f);
      const c: Cubic[] = [sweep(a, u, w, m), sweep(w, m, b, v)];
      return { w, c, n: crossings(c[0]) + crossings(c[1]) };
    });
    const best = tries.find((t) => t.n === 0) ?? tries.reduce((x, y) => (y.n < x.n ? y : x));
    [parts, mid] = [best.c, best.w];
  }
  const pt = (p: Pt) => `${n(p.x)} ${n(p.y)}`;
  const d = `M ${pt(a)}${parts.map((c) => ` C ${pt(c[1])} ${pt(c[2])} ${pt(c[3])}`).join('')}`;
  const at = { x: n(mid.x), y: n(mid.y) };
  if (!labelBox) return { d, at };
  const there = { x: at.x - labelBox.width / 2, y: at.y - labelBox.height / 2, width: labelBox.width, height: labelBox.height };
  return { d, at: cards.some((c) => boxesMeet(there, c)) ? reserved : at };
}

/** A message step as C4Edge draws it: a marker running the route (`back`: target to source). A new
 *  `key` restarts the marker; `still` puts it at the end. */
export interface FlowMark {
  key: number;
  back: boolean;
  still: boolean;
}

export const FLOW_HOP = 'c4-flow-hop';

/** A straight hop between two boxes, from where the centre line leaves one to where it meets the other. */
export function hopPoints(a: Rect, b: Rect): Pt[] {
  const [ca, cb] = [a, b].map((r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 }));
  const [dx, dy] = [cb.x - ca.x, cb.y - ca.y];
  const out = (r: Rect) => Math.min(0.5, r.width / 2 / Math.abs(dx), r.height / 2 / Math.abs(dy));
  const [ta, tb] = [out(a), out(b)];
  return [{ x: ca.x + dx * ta, y: ca.y + dy * ta }, { x: cb.x - dx * tb, y: cb.y - dy * tb }];
}

/**
 * A message step on the map: on the first routed edge inside the step's reach (decorateEdges marked
 * it), else on a dashed hop appended between the step's two drawn ends (an implied hop, or a pair
 * with no routed edge), its marker running from the step's sender. No mark: the same array.
 */
export function markFlow(
  edges: Edge[],
  mark: FlowMark | null,
  hop?: { source: string; target: string; a: Rect; b: Rect }
): Edge[] {
  if (!mark) return edges;
  const i = edges.findIndex((e) => e.type === 'c4' && e.data?.reach);
  if (i >= 0) return edges.map((e, j) => (j === i ? { ...e, data: { ...e.data, flow: mark } } : e));
  if (!hop) return edges;
  const points = hopPoints(hop.a, hop.b);
  const mid = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
  return [
    ...edges,
    {
      id: FLOW_HOP,
      source: hop.source,
      target: hop.target,
      type: 'c4',
      selectable: false,
      class: 'c4-reach c4-flow-hop',
      style: `stroke: ${REACH_STROKE}; stroke-width: 2px; stroke-dasharray: 6 5;`,
      // A zero-size label box at the middle: without one the label would sit on the hop's end.
      data: { points, labelBox: { ...mid, width: 0, height: 0 }, reach: true, flow: { ...mark, back: false } },
    },
  ];
}

/** A bundle's meeting point: `at` is the join, `end` the hub's port, `dir` the way the trunk runs (into the hub for a fan-in). */
export interface Join {
  key: string; at: Pt; end: Pt; dir: Pt;
  /** Edges joined (all of them once open). */
  count: number;
  /** The edge that draws the trunk and the count. */
  lead: boolean;
  /** This edge drawn whole: the count is hovered, the whole bundle is inside the reach, or this edge is. */
  open: boolean;
}
export const BUNDLE_MIN = 4;
export const JOIN_GAP = 70;

/**
 * Curved maps: four or more routed edges entering one node from the same side (or leaving one) meet a
 * trunk JOIN_GAP from it (less when the edges are short), so they arrive as one arrow with a count.
 * Each edge carries `joinIn` / `joinOut`; nothing bundles, the same array comes back.
 */
export function bundleEdges(edges: Edge[], open?: string | null): Edge[] {
  const side = (p: Pt, q: Pt) => (Math.abs(q.x - p.x) > Math.abs(q.y - p.y) ? (q.x > p.x ? 'r' : 'l') : q.y > p.y ? 'd' : 'u');
  const groups = new Map<string, { kind: 'joinIn' | 'joinOut'; members: { e: Edge; end: Pt; far: Pt; dir: Pt }[] }>();
  for (const e of edges) {
    const pts = e.data?.points as Pt[] | undefined;
    if (!pts || pts.length < 2) continue;
    const [first, second, before, last] = [pts[0], pts[1], pts[pts.length - 2], pts[pts.length - 1]];
    for (const [kind, key, end, far, dir] of [
      ['joinIn', `in ${e.target} ${side(before, last)}`, last, first, unit(before, last)],
      ['joinOut', `out ${e.source} ${side(first, second)}`, first, last, unit(first, second)],
    ] as const) {
      const g = groups.get(key) ?? { kind, members: [] };
      g.members.push({ e, end, far, dir });
      groups.set(key, g);
    }
  }
  const joins = new Map<Edge, Partial<Record<'joinIn' | 'joinOut', Join>>>();
  for (const [key, { kind, members }] of groups) {
    if (members.length < BUNDLE_MIN) continue;
    const dir = members[0].dir;
    const end = { x: members.reduce((s, m) => s + m.end.x, 0) / members.length, y: members.reduce((s, m) => s + m.end.y, 0) / members.length };
    const gap = Math.min(JOIN_GAP, ...members.map((m) => Math.abs(dir.x * (m.end.x - m.far.x) + dir.y * (m.end.y - m.far.y)) / 2));
    const sign = kind === 'joinIn' ? -1 : 1;
    const at = { x: end.x + sign * dir.x * gap, y: end.y + sign * dir.y * gap };
    const isOpen = open === key || members.every((m) => !!m.e.data?.reach);
    const rest = isOpen ? members : members.filter((m) => !m.e.data?.reach);
    members.forEach((m) =>
      joins.set(m.e, { ...joins.get(m.e), [kind]: { key, at, end, dir, count: rest.length, lead: m === (rest[0] ?? members[0]), open: isOpen || !!m.e.data?.reach } })
    );
  }
  if (joins.size === 0) return edges;
  return edges.map((e) => (joins.has(e) ? { ...e, data: { ...e.data, ...joins.get(e) } } : e));
}

/** A CSS cubic-bezier() as a function of progress t in [0, 1]: Newton steps, bisection fallback. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const ax = 3 * x1 - 3 * x2 + 1;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;
  const ay = 3 * y1 - 3 * y2 + 1;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;
  const x = (s: number) => ((ax * s + bx) * s + cx) * s;
  const y = (s: number) => ((ay * s + by) * s + cy) * s;
  const dx = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let s = t;
    for (let i = 0; i < 8; i++) {
      const err = x(s) - t;
      if (Math.abs(err) < 1e-6) return y(s);
      const d = dx(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    let lo = 0;
    let hi = 1;
    s = t;
    while (hi - lo > 1e-6) {
      if (x(s) < t) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return y(s);
  };
}

/**
 * The --c4-zoom a card can see. Every reader clamps it into [0.5, 1] (names) or [0.6, 1]
 * (technology, edge labels), so outside [0.5, 1] it changes nothing on screen; two decimals keep a
 * camera ease from rewriting it, and restyling the whole map, on every frame.
 */
export function zoomVar(zoom: number): string {
  return String(Math.round(Math.min(1, Math.max(0.5, zoom)) * 100) / 100);
}

/** The lowest zoom a fit goes to: names counter-scale down to here (zoomVar), so cards stay legible; a
 *  map bigger than that is framed at this zoom and panned. */
export const FIT_MIN_ZOOM = 0.5;

/** --ripple-ease-out's control points: the camera, the layout and a flow's marker all move on it. */
export const RIPPLE_CURVE = [0.23, 1, 0.32, 1] as const;
/** The camera's curve: the same as --ripple-ease-out, so camera and layout move as one. */
export const rippleEase = cubicBezier(...RIPPLE_CURVE);
/** How long a layout move, a camera move and a flow marker's run take. */
export const MOVE_MS = 560;

export type Rect = { x: number; y: number; width: number; height: number };

/**
 * What SvelteFlow would otherwise measure, given up front: a node's size (its wrapper is sized to
 * the ELK box; rounded as offsetWidth rounds, so the first measure finds no change) and the three
 * handles every C4 node renders (target top and left, source bottom; 6px plus a 1px border, centred
 * on the edge). Without `measured`, SvelteFlow drops a node's handle bounds on every new nodes array,
 * leaving every edge unplaceable, so each layout remounted every edge; without `handles`, a new
 * node's first measure is one more whole-map pass.
 */
export function presized(box: { width: number; height: number }): Pick<Node, 'measured' | 'handles'> {
  const w = Math.round(box.width);
  const h = Math.round(box.height);
  const s = 8;
  const at = (type: 'source' | 'target', position: string, x: number, y: number) =>
    ({ type, position: position as Position, x: x - s / 2, y: y - s / 2, width: s, height: s });
  return {
    measured: { width: w, height: h },
    handles: [at('target', 'top', w / 2, 0), at('target', 'left', 0, h / 2), at('source', 'bottom', w / 2, h)],
  };
}

/**
 * Nodes whose box changed size between two layouts, marked to grow from the old size: their card
 * and status ring animate (C4Diagram's c4-size / c4-ring keyframes; `turn` alternates the name so
 * every move restarts them) while the SvelteFlow wrapper takes the new size at once. Sizing the
 * wrapper itself would make SvelteFlow re-measure it, and re-lay every edge, on every frame.
 */
export function markResized(
  nodes: Node[],
  prev: ReadonlyMap<string, Rect>,
  next: ReadonlyMap<string, Rect>,
  turn: 'a' | 'b'
): Node[] {
  return nodes.map((n) => {
    const a = prev.get(n.id);
    const b = next.get(n.id);
    if (!a || !b || (a.width === b.width && a.height === b.height)) return n;
    return {
      ...n,
      style: `${n.style ? `${n.style};` : ''}--c4-from-w: ${a.width}px; --c4-from-h: ${a.height}px;`,
      domAttributes: { ...n.domAttributes, 'data-c4-resized': turn },
    };
  });
}

export function unionRect(rects: Iterable<Rect>): Rect | null {
  let out: Rect | null = null;
  for (const r of rects) {
    if (!out) {
      out = { ...r };
      continue;
    }
    const x = Math.min(out.x, r.x);
    const y = Math.min(out.y, r.y);
    out = {
      x,
      y,
      width: Math.max(out.x + out.width, r.x + r.width) - x,
      height: Math.max(out.y + out.height, r.y + r.height) - y,
    };
  }
  return out;
}
