// workflow/layout.ts: everything the Workflow widget decides before drawing,
// as pure functions so layout.test.ts can pin it.
//
// sanitizeWorkflow narrows model data once (type, status, label, duplicate ids,
// dangling edges). planWorkflow lays the graph out for a measured card width:
// left-to-right columns at 480px and up, one top-to-bottom spine below that (or
// when the columns would shrink past readable and the spine shows more). The
// zoom never goes above 1 or below MIN_ZOOM, and the top-to-bottom spine always
// draws at 1, so labels stay at their design size at phone width; a graph that
// still does not fit pans inside a capped canvas, unless the reader cannot pan
// (interactive false), in which case the canvas grows instead.
//
// Edges: back edges (cycles) are found by DFS before layering, so a loop never
// inflates depths. An edge to the very next column/row draws as a plain step;
// any other edge (a back edge, or one that skips a column/row) is a "loop" that
// runs in an outside lane (below the graph in LR, right of the spine in TB) and
// comes back in through the target's normal entry, so it never crosses a node.
// Forward loops share a lane per fan-out (or fan-in) and read as one bus; a back
// edge keeps its own. A condition spreads its exits across its exit side:
// yes-like labels first, no-like second, the rest after; unlabelled first and
// second branches read "Yes" and "No".
import { asText } from '$lib/widgets/text-coerce';
import type { Direction, WfEdge, WfNode, WorkflowNodeStatus, WorkflowNodeType } from './types.js';

export const NODE_H = 48;
export const PAD = 16;
export const TB_CHIP = 12; // TB chip centre below its exit
export const MIN_H = 120;
export const MAX_H = 560;
export const MIN_ZOOM = 0.8;
export const TB_BELOW = 480;
const LR_W = 192;
const TB_MAX_W = 280;
const TB_MIN_W = 160;
const LR_GAP = 48; // between columns: node width + 48
const LR_GAP_LABELLED = 120; // room for a branch chip
const LR_ROW_GAP = 24;
const TB_GAP = 24; // between rows
const TB_GAP_LABELLED = 56; // chips under the exits, then the turns
const TB_TURN_Y = 42; // where a plain edge turns, below the chips
const TB_LOOP_Y = 30; // where a loop turns for the lane, below the chips (6px lower per earlier loop)
const LOOP_OFFSETS = [14, 24, 34, 44, 54];

const TYPES: readonly WorkflowNodeType[] = ['trigger', 'action', 'condition', 'approval', 'connector', 'output'];
const STATUSES: readonly WorkflowNodeStatus[] = ['idle', 'running', 'success', 'error', 'waiting'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Model data in, a tidy graph out: one pass, no throws, no blank ids. */
export function sanitizeWorkflow(nodes: unknown, edges: unknown): { nodes: WfNode[]; edges: WfEdge[] } {
  const out: WfNode[] = [];
  const seen = new Set<string>();
  for (const [i, raw] of (Array.isArray(nodes) ? nodes : []).entries()) {
    if (!isObj(raw)) continue;
    const id = asText(raw.id).trim() || `node-${i}`;
    if (seen.has(id)) continue; // duplicate id: the first one wins
    seen.add(id);
    const type = TYPES.find((t) => t === asText(raw.type).trim().toLowerCase()) ?? 'action';
    const status = STATUSES.find((t) => t === asText(raw.status).trim().toLowerCase()) ?? 'idle';
    const pos = isObj(raw.position) && finite(raw.position.x) && finite(raw.position.y) ? { x: raw.position.x, y: raw.position.y } : undefined;
    out.push({
      id,
      type,
      label: asText(raw.label).trim(),
      icon: typeof raw.icon === 'string' ? raw.icon : undefined,
      status,
      position: pos,
    });
  }
  const outEdges: WfEdge[] = [];
  for (const raw of Array.isArray(edges) ? edges : []) {
    if (!isObj(raw)) continue;
    const from = asText(raw.from).trim();
    const to = asText(raw.to).trim();
    if (!seen.has(from) || !seen.has(to)) continue; // an end that does not exist
    outEdges.push({ from, to, label: asText(raw.label).trim(), animated: raw.animated === true });
  }
  return { nodes: out, edges: outEdges };
}

/** 0 yes-like, 1 no-like, 2 anything else. */
export function branchRank(label: string): number {
  if (/^(yes|true|approved?|pass(ed)?|ok)\b/i.test(label)) return 0;
  if (/^(no|false|declined?|rejected?|fail(ed)?)\b/i.test(label)) return 1;
  return 2;
}

export interface PlacedHandle {
  id: string;
  type: 'source' | 'target';
  side: 'top' | 'right' | 'bottom' | 'left';
  /** Offset along the side, 0..100. */
  pct: number;
}

export interface PlacedNode extends WfNode {
  x: number;
  y: number;
  w: number;
  h: number;
  handles: PlacedHandle[];
}

export interface PlacedEdge extends WfEdge {
  id: string;
  sourceHandle: string;
  targetHandle: string;
  /** Enters the target from the outside lane (back edge or skip). */
  loop: boolean;
  /** A back edge closes a cycle. */
  back: boolean;
  offset: number;
  /** A loop's outside lane: y below the nodes in LR, x right of the spine in TB. */
  lane: number;
  /** TB: how far below the exit the edge turns (0: halfway). */
  turn: number;
  /** Max chip width, so a condition's chips share its exit side. */
  chip: number;
}

export interface WorkflowPlan {
  direction: Direction;
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  bounds: { x: number; y: number; w: number; h: number };
  zoom: number;
  height: number;
  viewport: { x: number; y: number; zoom: number };
  /** True when the whole graph shows at zoom 1: no zoom controls needed. */
  fitsAtOne: boolean;
}

interface Graph {
  nodes: WfNode[];
  edges: WfEdge[];
  out: Map<string, WfEdge[]>;
  back: Set<WfEdge>;
  depth: Map<string, number>;
  slot: Map<WfEdge, { i: number; k: number }>;
}

/** Exit order, default branch labels, back edges and longest-path depth. */
function analyse(nodes: WfNode[], rawEdges: WfEdge[]): Graph {
  const type = new Map(nodes.map((n) => [n.id, n.type]));
  const out = new Map<string, WfEdge[]>(nodes.map((n) => [n.id, []]));
  for (const e of rawEdges) out.get(e.from)!.push({ ...e });
  const slot = new Map<WfEdge, { i: number; k: number }>();
  for (const [id, list] of out) {
    if (type.get(id) === 'condition') {
      list.sort((a, b) => branchRank(a.label) - branchRank(b.label));
      if (list.length >= 2) {
        if (!list[0].label) list[0].label = 'Yes';
        if (!list[1].label) list[1].label = 'No';
      }
      list.forEach((e, i) => slot.set(e, { i, k: list.length }));
    } else list.forEach((e) => slot.set(e, { i: 0, k: 1 }));
  }
  const edges = [...out.values()].flat();

  // Back edges: DFS from the roots, then from anything left (an all-cycle graph).
  const back = new Set<WfEdge>();
  const state = new Map<string, 1 | 2>(); // 1 on the stack, 2 done
  const visit = (id: string) => {
    state.set(id, 1);
    for (const e of out.get(id)!) {
      const s = state.get(e.to);
      if (s === 1) back.add(e);
      else if (!s) visit(e.to);
    }
    state.set(id, 2);
  };
  const hasIn = new Set(rawEdges.map((e) => e.to));
  for (const n of nodes) if (!hasIn.has(n.id) && !state.has(n.id)) visit(n.id);
  for (const n of nodes) if (!state.has(n.id)) visit(n.id);

  // Longest-path depth over the forward edges (Kahn).
  const depth = new Map(nodes.map((n) => [n.id, 0]));
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of edges) if (!back.has(e)) indeg.set(e.to, indeg.get(e.to)! + 1);
  const queue = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of out.get(id)!) {
      if (back.has(e)) continue;
      depth.set(e.to, Math.max(depth.get(e.to)!, depth.get(id)! + 1));
      indeg.set(e.to, indeg.get(e.to)! - 1);
      if (indeg.get(e.to) === 0) queue.push(e.to);
    }
  }
  return { nodes, edges, out, back, depth, slot };
}

/** Top-to-bottom order that keeps each branch contiguous (DFS-flavoured topological sort). */
function spineOrder(g: Graph): string[] {
  const indeg = new Map(g.nodes.map((n) => [n.id, 0]));
  for (const e of g.edges) if (!g.back.has(e)) indeg.set(e.to, indeg.get(e.to)! + 1);
  const stack = g.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id).toReversed();
  const order: string[] = [];
  while (stack.length) {
    const id = stack.pop()!;
    order.push(id);
    const ready: string[] = [];
    for (const e of g.out.get(id)!) {
      if (g.back.has(e)) continue;
      indeg.set(e.to, indeg.get(e.to)! - 1);
      if (indeg.get(e.to) === 0) ready.push(e.to);
    }
    stack.push(...ready.toReversed());
  }
  for (const n of g.nodes) if (!order.includes(n.id)) order.push(n.id);
  return order;
}

/** Ranks (column in LR, row in TB) and cross-axis positions, before handles. */
function place(g: Graph, dir: Direction): { rank: Map<string, number>; cross: Map<string, number> } {
  const rank = new Map<string, number>();
  const cross = new Map<string, number>();
  if (dir === 'TB') {
    spineOrder(g).forEach((id, i) => (rank.set(id, i), cross.set(id, 0)));
    return { rank, cross };
  }
  const index = new Map(g.nodes.map((n, i) => [n.id, i]));
  const layers: string[][] = [];
  for (const n of g.nodes) (layers[g.depth.get(n.id)!] ??= []).push(n.id);
  const inEdges = new Map<string, WfEdge[]>();
  for (const e of g.edges) if (!g.back.has(e)) (inEdges.get(e.to) ?? inEdges.set(e.to, []).get(e.to)!).push(e);
  const orderIn = new Map<string, number>();
  for (const layer of layers) {
    if (!layer) continue;
    // Barycenter-lite: follow the parent's order, then the exit slot, then input order.
    const key = (id: string) =>
      Math.min(Infinity, ...(inEdges.get(id) ?? []).map((e) => (orderIn.get(e.from) ?? 0) * 1000 + g.slot.get(e)!.i));
    layer.sort((a, b) => (key(a) === key(b) ? index.get(a)! - index.get(b)! : key(a) - key(b)));
    layer.forEach((id, i) => {
      orderIn.set(id, i);
      rank.set(id, g.depth.get(id)!);
      cross.set(id, i - (layer.length - 1) / 2);
    });
  }
  return { rank, cross };
}

/** Lay the graph out in one direction at a given TB width. Pure geometry. */
export function layoutWorkflow(nodes: WfNode[], rawEdges: WfEdge[], dir: Direction, tbWidth = TB_MAX_W) {
  const g = analyse(nodes, rawEdges);
  const usePositions = modelPositionsUsable(nodes);
  const { rank, cross } = usePositions ? { rank: new Map<string, number>(), cross: new Map<string, number>() } : place(g, dir);

  // Edge kinds first: loops decide the TB lane room and the row gap.
  const isLoop = (e: WfEdge) => !usePositions && (g.back.has(e) || rank.get(e.to)! - rank.get(e.from)! !== 1);
  // Loops share a lane as a bus: a fan-out by source, else a fan-in by target;
  // a back edge keeps its own lane so a cycle never hides inside a bus.
  const fwd = g.edges.filter((e) => isLoop(e) && !g.back.has(e));
  const tally = (k: (e: WfEdge) => string) => fwd.reduce((m, e) => m.set(k(e), (m.get(k(e)) ?? 0) + 1), new Map<string, number>());
  const bySource = tally((e) => e.from);
  const byTarget = tally((e) => e.to);
  const laneOf = new Map<string, number>();
  const laneKey = (e: WfEdge, i: number) =>
    g.back.has(e) ? `b${i}` : bySource.get(e.from)! > 1 ? `s${e.from}` : byTarget.get(e.to)! > 1 ? `t${e.to}` : `e${i}`;
  const placedEdges: PlacedEdge[] = g.edges.map((e, i) => {
    const s = g.slot.get(e)!;
    const back = g.back.has(e);
    const loop = isLoop(e);
    const key = loop ? laneKey(e, i) : '';
    if (loop && !laneOf.has(key)) laneOf.set(key, LOOP_OFFSETS[laneOf.size % LOOP_OFFSETS.length]);
    return {
      ...e,
      id: `e-${e.from}-${e.to}-${i}`,
      sourceHandle: s.k > 1 ? `out-${s.i}` : 'out',
      targetHandle: 'in',
      loop,
      back,
      offset: loop ? laneOf.get(key)! : 0,
      lane: 0,
      turn: 0,
      chip: 112,
    };
  });
  const laneRoom = laneOf.size ? LOOP_OFFSETS[Math.min(laneOf.size, LOOP_OFFSETS.length) - 1] + 8 : 0;
  const w = dir === 'TB' ? Math.round(Math.max(TB_MIN_W, Math.min(TB_MAX_W, tbWidth - laneRoom))) : LR_W;
  const h = NODE_H;
  // Per-rank gaps: wide only after a rank whose exits carry chips (or start loops, in TB).
  const ranks = Math.max(-1, ...rank.values()) + 1;
  const wide = new Set(placedEdges.filter((e) => (e.label && !(dir === 'LR' && e.loop)) || (dir === 'TB' && e.loop)).map((e) => rank.get(e.from)!));
  const start: number[] = [];
  for (let r = 0, at = 0; r < ranks; r++) {
    start[r] = at;
    at += (dir === 'TB' ? h : w) + (wide.has(r) ? (dir === 'TB' ? TB_GAP_LABELLED : LR_GAP_LABELLED) : dir === 'TB' ? TB_GAP : LR_GAP);
  }
  // TB: chips sit just under their exit, narrow enough to share the side; a
  // later loop from the same node turns higher, so lanes never cross.
  const seenLoops = new Map<string, number>();
  const loopsFrom = new Map<string, number>();
  for (const e of placedEdges) if (e.loop) loopsFrom.set(e.from, (loopsFrom.get(e.from) ?? 0) + 1);
  placedEdges.forEach((e, i) => {
    const s = g.slot.get(g.edges[i])!;
    if (dir === 'TB') e.chip = s.k > 1 ? Math.max(40, Math.floor(w / (s.k + 1))) : Math.min(220, w - 24);
    if (dir === 'TB' && e.loop) {
      // The leftmost exit turns lowest and takes the inner lane, so lanes never cross.
      const j = seenLoops.get(e.from) ?? 0;
      seenLoops.set(e.from, j + 1);
      e.turn = Math.min(50, TB_LOOP_Y + 6 * (loopsFrom.get(e.from)! - 1 - j));
    } else if (dir === 'TB') e.turn = e.label ? TB_TURN_Y : 0;
  });

  // Handles: an exit per condition slot (or one) and one entry, only where an edge uses them.
  const handles = new Map<string, PlacedHandle[]>(nodes.map((n) => [n.id, []]));
  placedEdges.forEach((e, i) => {
    const s = g.slot.get(g.edges[i])!;
    const src = handles.get(e.from)!;
    if (!src.some((x) => x.id === e.sourceHandle))
      src.push({ id: e.sourceHandle, type: 'source', side: dir === 'TB' ? 'bottom' : 'right', pct: ((s.i + 1) / (s.k + 1)) * 100 });
    const tgt = handles.get(e.to)!;
    // TB: a step with one way in enters straight below its exit, so it never
    // reads as the continuation of a sibling branch.
    const only = dir === 'TB' && !e.loop && placedEdges.filter((x) => x.to === e.to).length === 1;
    if (!tgt.some((x) => x.id === 'in')) tgt.push({ id: 'in', type: 'target', side: dir === 'TB' ? 'top' : 'left', pct: only ? ((s.i + 1) / (s.k + 1)) * 100 : 50 });
  });

  const placed: PlacedNode[] = nodes.map((n) => {
    const r = rank.get(n.id)!;
    const at = usePositions ? n.position! : dir === 'TB' ? { x: 0, y: start[r] } : { x: start[r], y: cross.get(n.id)! * (h + LR_ROW_GAP) };
    return { ...n, x: at.x, y: at.y, w, h, handles: handles.get(n.id)! };
  });

  // Bounds, then each loop's outside lane: below the graph in LR, right of the
  // spine in TB (one lane per bus, so a bus reads as one line).
  const edge = (f: (n: PlacedNode) => number, pick: (...v: number[]) => number) => (placed.length ? pick(...placed.map(f)) : 0);
  const x0 = edge((n) => n.x, Math.min);
  const y0 = edge((n) => n.y, Math.min);
  let x1 = edge((n) => n.x + n.w, Math.max);
  let y1 = edge((n) => n.y + n.h, Math.max);
  for (const e of placedEdges) {
    if (!e.loop) continue;
    if (dir === 'TB') {
      e.lane = w + e.offset;
      x1 = Math.max(x1, e.lane + 4);
    } else {
      e.lane = Math.max(...placed.map((n) => n.y + n.h)) + e.offset;
      y1 = Math.max(y1, e.lane + 12);
    }
  }
  return { nodes: placed, edges: placedEdges, bounds: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, positioned: usePositions };
}

/** One orthogonal polyline with rounded corners (SVG path data). */
export function roundedPath(points: { x: number; y: number }[], r = 8): string {
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = [points[i - 1], points[i], points[i + 1]];
    const k = Math.min(r, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
    const ux = Math.sign(b.x - a.x), uy = Math.sign(b.y - a.y), vx = Math.sign(c.x - b.x), vy = Math.sign(c.y - b.y);
    d += ` L${b.x - ux * k},${b.y - uy * k} Q${b.x},${b.y} ${b.x + vx * k},${b.y + vy * k}`;
  }
  const last = points[points.length - 1];
  return d + ` L${last.x},${last.y}`;
}

/**
 * A loop's route from the exit point to the entry point through its lane, and
 * where its label chip sits. LR: down the gap after the source, along the lane
 * below, up the gap before the target. TB: across the gap below the source,
 * down the lane on the right, back across the gap above the target.
 */
export function loopRoute(dir: Direction, s: { x: number; y: number }, t: { x: number; y: number }, lane: number, offset: number, turn = TB_LOOP_Y) {
  if (dir === 'LR') {
    const out = s.x + 8 + offset / 2;
    const into = t.x - 12;
    const pts = [s, { x: out, y: s.y }, { x: out, y: lane }, { x: into, y: lane }, { x: into, y: t.y }, t];
    return { points: pts, label: { x: (out + into) / 2, y: lane } };
  }
  const down = s.y + turn;
  const into = t.y - 12;
  const pts = [s, { x: s.x, y: down }, { x: lane, y: down }, { x: lane, y: into }, { x: t.x, y: into }, t];
  return { points: pts, label: { x: s.x, y: s.y + TB_CHIP } };
}

/** Model positions count only when every node has one and no two boxes overlap. */
export function modelPositionsUsable(nodes: WfNode[]): boolean {
  if (!nodes.length || nodes.some((n) => !n.position)) return false;
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i].position!, b = nodes[j].position!;
      if (Math.abs(a.x - b.x) < LR_W && Math.abs(a.y - b.y) < NODE_H) return false;
    }
  return true;
}

/**
 * The whole plan for a measured canvas width: direction, zoom, canvas height and
 * the initial viewport. `width` 0 (not measured yet, or jsdom) plans for 720.
 */
export function planWorkflow(
  nodes: WfNode[],
  edges: WfEdge[],
  opts: { width: number; interactive: boolean; fitView: boolean },
): WorkflowPlan {
  const W = opts.width > 0 ? opts.width : 720;
  const avail = W - 2 * PAD;
  const lr = layoutWorkflow(nodes, edges, 'LR');
  const tb = () => layoutWorkflow(nodes, edges, 'TB', avail);

  let dir: Direction = 'LR';
  let layout = lr;
  let zoom = 1;
  if (lr.positioned) {
    // The model's own coordinates: fit them, at the readable floor unless the reader cannot pan.
    const fit = Math.min(1, avail / lr.bounds.w, opts.interactive ? (MAX_H - 2 * PAD) / lr.bounds.h : 1);
    zoom = opts.interactive ? Math.max(MIN_ZOOM, fit) : fit;
  } else if (W < TB_BELOW) {
    dir = 'TB';
    layout = tb();
  } else {
    const fit = Math.min(1, avail / lr.bounds.w, (MAX_H - 2 * PAD) / lr.bounds.h);
    if (fit >= MIN_ZOOM) zoom = fit;
    else {
      // Columns would shrink past readable: take the spine if it shows more
      // (or always, when the reader cannot pan sideways).
      const t = tb();
      const lrShown = avail / (lr.bounds.w * MIN_ZOOM);
      const tbShown = (MAX_H - 2 * PAD) / t.bounds.h;
      if (!opts.interactive || tbShown >= lrShown) {
        dir = 'TB';
        layout = t;
      } else zoom = MIN_ZOOM;
    }
    // fitView false: draw at design size and let the reader pan.
    if (dir === 'LR' && !opts.fitView && opts.interactive) zoom = 1;
  }
  const b = layout.bounds;
  const content = b.h * zoom + 2 * PAD;
  const height = Math.round(opts.interactive ? Math.min(MAX_H, Math.max(MIN_H, content)) : Math.max(MIN_H, content));
  const fitsX = b.w * zoom <= avail + 0.5;
  const fitsY = content <= height + 0.5;
  const vx = fitsX ? (W - b.w * zoom) / 2 - b.x * zoom : PAD - b.x * zoom;
  const vy = fitsY ? (height - b.h * zoom) / 2 - b.y * zoom : PAD - b.y * zoom;
  return {
    direction: dir,
    nodes: layout.nodes,
    edges: layout.edges,
    bounds: b,
    zoom,
    height,
    viewport: { x: Math.round(vx), y: Math.round(vy), zoom },
    fitsAtOne: zoom === 1 && fitsX && fitsY,
  };
}

/** Back-compat: positions only, as the widget used to expose. */
export function autoLayout(nodes: WfNode[], edges: WfEdge[], dir: Direction = 'LR'): Map<string, { x: number; y: number }> {
  return new Map(layoutWorkflow(nodes, edges, dir).nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
}
