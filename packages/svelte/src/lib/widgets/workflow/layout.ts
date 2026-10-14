// workflow/layout.ts: everything the Workflow widget decides before drawing,
// as pure functions so layout.test.ts can pin it.
//
// sanitizeWorkflow narrows model data once (type, status, label, duplicate ids,
// dangling edges). planWorkflow lays the graph out for a measured card width:
// left-to-right columns at 480px and up (a compact column set when only that
// fits at the readable floor, else the reader pans at the floor), one
// top-to-bottom spine below 480px, or when the reader cannot pan and the columns
// would not fit. The zoom never goes above 1 or below MIN_ZOOM, and the spine
// always draws at 1, so labels stay at their design size at phone width; a
// reader who cannot pan gets a canvas that grows instead. The minimap and zoom
// controls get a bottom gutter, so they never cover a node at the initial view.
//
// Edges: back edges (cycles) are found by DFS before layering, so a loop never
// inflates depths. An edge to the very next column/row draws as a plain step;
// any other edge (a back edge, or one that skips a column/row) is a "loop" that
// runs in an outside lane (below the graph in LR, right of the spine in TB) and
// comes back in through the target's normal entry, so it never crosses a node.
// Every loop gets its own lane (shorter spans inside), so no two loops share a
// line. In LR each edge of a fan-out (or fan-in) turns in its own channel of the
// column gap, so siblings never run on top of each other. A condition spreads its
// exits across its exit side: plain exits first, loops last (toward their lane);
// within those, yes-like labels first, no-like second, the rest after.
// Unlabelled first and second branches read "Yes" and "No", later ones their
// number, so every exit carries a one-line chip.
import { asText } from '$lib/widgets/text-coerce';
import type { Direction, WfEdge, WfNode, WorkflowNodeStatus, WorkflowNodeType } from './types.js';

export const NODE_H = 48;
export const PAD = 16;
export const MIN_H = 120;
export const MAX_H = 560;
export const MIN_ZOOM = 0.8;
export const TB_BELOW = 480;
/** Column width and gaps in LR: the standard set, and a compact one tried when the standard will not fit. */
export const LR_STANDARD = { w: 192, gap: 48, labelled: 136 };
export const LR_COMPACT = { w: 144, gap: 32, labelled: 96 };
const LR_ROW_GAP = 24;
const TB_MAX_W = 280;
const TB_MIN_W = 160;
const TB_GAP = 24; // between rows
const CHIP_H = 16; // a one-line chip, border included
const TB_CHIP = 16; // first chip centre below its exit: 8px clear of the handle
const LANE0 = 14; // first outside lane from the graph
const LANE_STEP = 8; // between lanes
const CHAN0 = 12; // LR: first channel after the exit, so an edge runs straight out first
const CHAN_STEP = 6;
/** Bottom room kept clear for the overlays at the initial view. */
const GUTTER = { controls: 36, minimap: 96 };

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
  /** A loop's outside lane: y below the nodes in LR, x right of the spine in TB. */
  lane: number;
  /** LR: how far past the exit the edge turns (its own channel in the gap). */
  chan: number;
  /** TB: how far below the exit the edge turns (0: halfway). */
  turn: number;
  /** TB: chip centre below the exit. */
  chipY: number;
  /** Max chip width, so chips never touch. */
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
  showControls: boolean;
  showMinimap: boolean;
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
        list.forEach((e, i) => (e.label ||= String(i + 1)));
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

/** Lay the graph out in one direction at a given TB width (and LR column set). Pure geometry. */
export function layoutWorkflow(nodes: WfNode[], rawEdges: WfEdge[], dir: Direction, tbWidth = TB_MAX_W, lrSet = LR_STANDARD) {
  const g = analyse(nodes, rawEdges);
  const usePositions = modelPositionsUsable(nodes);
  const { rank, cross } = usePositions ? { rank: new Map<string, number>(), cross: new Map<string, number>() } : place(g, dir);
  const isLoop = (e: WfEdge) => !usePositions && (g.back.has(e) || rank.get(e.to)! - rank.get(e.from)! !== 1);

  // Exit slots: a condition's plain exits first, its loops last (toward the lane).
  const exit = new Map<WfEdge, { i: number; k: number }>();
  for (const list of g.out.values()) {
    if (list.length < 2 || g.slot.get(list[0])!.k < 2) list.forEach((e) => exit.set(e, { i: 0, k: 1 }));
    else [...list.filter((e) => !isLoop(e)), ...list.filter(isLoop)].forEach((e, i) => exit.set(e, { i, k: list.length }));
  }

  // One lane per loop: shortest spans innermost; loops whose rank spans overlap never share.
  const span = (e: WfEdge) => {
    const a = rank.get(e.from) ?? 0, b = rank.get(e.to) ?? 0;
    return [Math.min(a, b), Math.max(a, b)] as const;
  };
  const laneIdx = new Map<WfEdge, number>();
  const taken: (readonly [number, number])[][] = [];
  for (const e of g.edges.filter(isLoop).sort((a, b) => span(a)[1] - span(a)[0] - (span(b)[1] - span(b)[0]))) {
    const [lo, hi] = span(e);
    let L = 0;
    while (taken[L]?.some(([a, b]) => a <= hi && lo <= b)) L++;
    (taken[L] ??= []).push([lo, hi]);
    laneIdx.set(e, L);
  }
  const laneRoom = taken.length ? LANE0 + LANE_STEP * (taken.length - 1) + 8 : 0;
  const w = dir === 'TB' ? Math.round(Math.max(TB_MIN_W, Math.min(TB_MAX_W, tbWidth - laneRoom))) : lrSet.w;
  const h = NODE_H;

  const placedEdges: PlacedEdge[] = g.edges.map((e, i) => {
    const x = exit.get(e)!;
    return {
      ...e,
      id: `e-${e.from}-${e.to}-${i}`,
      sourceHandle: x.k > 1 ? `out-${x.i}` : 'out',
      targetHandle: 'in',
      loop: isLoop(e),
      back: g.back.has(e),
      lane: 0,
      chan: CHAN0,
      turn: 0,
      chipY: TB_CHIP,
      chip: 112,
    };
  });
  const slotOf = (i: number) => exit.get(g.edges[i])!;

  // TB: chips just under their exits (alternate chips one chip lower when three
  // or more share the side), then each loop turns below the chips, the leftmost
  // lowest so lanes never cross, then a labelled plain exit turns below the loops.
  const gapAfter: number[] = [];
  if (dir === 'TB') {
    for (const id of g.out.keys()) {
      const mine = placedEdges.map((e, i) => i).filter((i) => placedEdges[i].from === id);
      for (const i of mine) {
        const s = slotOf(i), e = placedEdges[i];
        e.chipY = TB_CHIP + (s.k >= 3 && s.i % 2 ? CHIP_H : 0);
        e.chip = s.k > 1 ? Math.max(28, Math.floor(((s.k >= 3 ? 2 : 1) * w) / (s.k + 1)) - 6) : Math.min(220, w - 24);
      }
      const chipBottom = Math.max(0, ...mine.filter((i) => placedEdges[i].label).map((i) => placedEdges[i].chipY + CHIP_H / 2));
      const loops = mine.filter((i) => placedEdges[i].loop).sort((a, b) => slotOf(a).i - slotOf(b).i);
      const base = Math.max(14, chipBottom + 6);
      loops.forEach((i, j) => (placedEdges[i].turn = base + 6 * (loops.length - 1 - j)));
      for (const i of mine) if (!placedEdges[i].loop && placedEdges[i].label) placedEdges[i].turn = base + 6 * loops.length + 2;
      const r = rank.get(id);
      if (r !== undefined) gapAfter[r] = Math.max(gapAfter[r] ?? TB_GAP, ...mine.map((i) => (placedEdges[i].turn ? placedEdges[i].turn + 18 : TB_GAP)));
    }
  } else {
    for (const e of placedEdges) if (e.label && !e.loop) gapAfter[rank.get(e.from)!] = lrSet.labelled;
  }
  const ranks = Math.max(-1, ...rank.values()) + 1;
  const start: number[] = [];
  for (let r = 0, at = 0; r < ranks; r++) {
    start[r] = at;
    at += (dir === 'TB' ? h : w) + (gapAfter[r] ?? (dir === 'TB' ? TB_GAP : lrSet.gap));
  }

  // Handles: an exit per condition slot (or one) and one entry, only where an edge uses them.
  const handles = new Map<string, PlacedHandle[]>(nodes.map((n) => [n.id, []]));
  placedEdges.forEach((e, i) => {
    const s = slotOf(i);
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

  // LR channels: loops leave first (lowest exit nearest), then a fan-out's edges
  // (the longest climb turns first) or a fan-in's (the longest climb turns last),
  // each in its own channel of the gap, so siblings never overlap.
  if (dir === 'LR' && !usePositions) {
    const at = new Map(placed.map((n) => [n.id, n]));
    const dy = (i: number) => {
      const s = at.get(placedEdges[i].from)!, t = at.get(placedEdges[i].to)!, x = slotOf(i);
      return Math.abs(t.y + h / 2 - (s.y + (h * (x.i + 1)) / (x.k + 1)));
    };
    const all = placedEdges.map((_, i) => i);
    const plain = all.filter((i) => !placedEdges[i].loop);
    for (const id of g.out.keys()) {
      const gap = (gapAfter[rank.get(id)!] ?? lrSet.gap) - 10;
      const loops = all.filter((i) => placedEdges[i].from === id && placedEdges[i].loop).sort((a, b) => slotOf(b).i - slotOf(a).i);
      loops.forEach((i, j) => (placedEdges[i].chan = Math.min(gap, 8 + CHAN_STEP * j)));
      const out = plain.filter((i) => placedEdges[i].from === id).sort((a, b) => dy(b) - dy(a));
      const fanIn = (i: number) => plain.filter((j) => placedEdges[j].to === placedEdges[i].to).sort((a, b) => dy(a) - dy(b));
      const group = out.length > 1 ? out : out.length === 1 ? fanIn(out[0]) : [];
      const step = Math.min(CHAN_STEP, (gap - CHAN0) / Math.max(1, group.length - 1 + loops.length));
      for (const i of out) {
        const k = Math.max(0, group.indexOf(i)) + loops.length;
        placedEdges[i].chan = Math.round(Math.min(gap, CHAN0 + step * k));
        placedEdges[i].chip = Math.max(28, gap + 10 - placedEdges[i].chan - 12);
      }
    }
  }

  // Bounds, then each loop's own outside lane: below the graph in LR, right of the spine in TB.
  const edge = (f: (n: PlacedNode) => number, pick: (...v: number[]) => number) => (placed.length ? pick(...placed.map(f)) : 0);
  const x0 = edge((n) => n.x, Math.min);
  const y0 = edge((n) => n.y, Math.min);
  let x1 = edge((n) => n.x + n.w, Math.max);
  let y1 = edge((n) => n.y + n.h, Math.max);
  const bottom = y1;
  placedEdges.forEach((e, i) => {
    if (!e.loop) return;
    const offset = LANE0 + LANE_STEP * laneIdx.get(g.edges[i])!;
    if (dir === 'TB') {
      e.lane = w + offset;
      x1 = Math.max(x1, e.lane + 4);
    } else {
      e.lane = bottom + offset;
      y1 = Math.max(y1, e.lane + 12);
    }
  });
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
 * An LR plain edge: straight out of its exit to its own channel, across to the
 * target's row, straight in. The chip rides the last run, on the target's row.
 */
export function stepRoute(s: { x: number; y: number }, t: { x: number; y: number }, chan: number) {
  if (Math.abs(t.y - s.y) < 1) return { points: [s, t], label: { x: (s.x + t.x) / 2, y: t.y } };
  const cx = s.x + chan;
  return { points: [s, { x: cx, y: s.y }, { x: cx, y: t.y }, t], label: { x: (cx + t.x) / 2, y: t.y } };
}

/**
 * A loop's route from the exit point to the entry point through its lane, and
 * where its label chip sits. LR: out to its channel, down to the lane below,
 * along it, up the gap before the target. TB: down to its turn, across to the
 * lane on the right, down it, back across the gap above the target.
 */
export function loopRoute(dir: Direction, s: { x: number; y: number }, t: { x: number; y: number }, lane: number, chan: number, turn: number, chipY = TB_CHIP) {
  if (dir === 'LR') {
    const out = s.x + chan;
    const into = t.x - 12;
    const pts = [s, { x: out, y: s.y }, { x: out, y: lane }, { x: into, y: lane }, { x: into, y: t.y }, t];
    return { points: pts, label: { x: (out + into) / 2, y: lane } };
  }
  const down = s.y + turn;
  const into = t.y - 12;
  const pts = [s, { x: s.x, y: down }, { x: lane, y: down }, { x: lane, y: into }, { x: t.x, y: into }, t];
  return { points: pts, label: { x: s.x, y: s.y + chipY } };
}

/** Model positions count only when every node has one and no two boxes overlap. */
export function modelPositionsUsable(nodes: WfNode[]): boolean {
  if (!nodes.length || nodes.some((n) => !n.position)) return false;
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i].position!, b = nodes[j].position!;
      if (Math.abs(a.x - b.x) < LR_STANDARD.w && Math.abs(a.y - b.y) < NODE_H) return false;
    }
  return true;
}

/**
 * The whole plan for a measured canvas width: direction, zoom, canvas height,
 * overlays and the initial viewport. `width` 0 (not measured yet, or jsdom)
 * plans for 720.
 */
export function planWorkflow(
  nodes: WfNode[],
  edges: WfEdge[],
  opts: { width: number; interactive: boolean; fitView: boolean; minimap?: boolean },
): WorkflowPlan {
  const W = opts.width > 0 ? opts.width : 720;
  const avail = W - 2 * PAD;
  // The reader who cannot pan gets a canvas that grows, so only width limits the fit.
  const fitOf = (l: { bounds: { w: number; h: number } }) =>
    Math.min(1, avail / l.bounds.w, opts.interactive ? (MAX_H - 2 * PAD) / l.bounds.h : 1);
  const lr = layoutWorkflow(nodes, edges, 'LR');

  let dir: Direction = 'LR';
  let layout = lr;
  let zoom = 1;
  if (lr.positioned) {
    // The model's own coordinates: fit them, at the readable floor unless the reader cannot pan.
    const fit = Math.min(1, avail / lr.bounds.w, opts.interactive ? (MAX_H - 2 * PAD) / lr.bounds.h : 1);
    zoom = opts.interactive ? Math.max(MIN_ZOOM, fit) : fit;
  } else if (W < TB_BELOW) {
    dir = 'TB';
    layout = layoutWorkflow(nodes, edges, 'TB', avail);
  } else {
    // Columns at 480px and up: standard, else compact if that fits at the floor,
    // else pan at the floor; only a reader who cannot pan falls back to the spine.
    const compact = fitOf(lr) >= MIN_ZOOM ? undefined : layoutWorkflow(nodes, edges, 'LR', avail, LR_COMPACT);
    if (!compact) zoom = fitOf(lr);
    else if (fitOf(compact) >= MIN_ZOOM) (layout = compact), (zoom = fitOf(compact));
    else if (opts.interactive) zoom = MIN_ZOOM;
    else (dir = 'TB'), (layout = layoutWorkflow(nodes, edges, 'TB', avail));
    // fitView false: draw at design size and let the reader pan.
    if (dir === 'LR' && !opts.fitView && opts.interactive) zoom = 1;
  }
  const b = layout.bounds;
  const content = b.h * zoom + 2 * PAD;
  const clamp = (v: number) => Math.round(opts.interactive ? Math.min(MAX_H, Math.max(MIN_H, v)) : Math.max(MIN_H, v));
  const fitsX = b.w * zoom <= avail + 0.5;
  const fitsAtOne = zoom === 1 && fitsX && content <= clamp(content) + 0.5;
  // Overlays get a bottom gutter, so neither covers a node at the initial view.
  const showMinimap = opts.minimap === true && nodes.length >= 12 && W >= 560;
  const showControls = opts.interactive && !fitsAtOne;
  const gutter = showMinimap ? GUTTER.minimap : showControls ? GUTTER.controls : 0;
  const height = clamp(content + gutter);
  const room = height - gutter;
  const fitsY = content <= room + 0.5;
  const vx = fitsX ? (W - b.w * zoom) / 2 - b.x * zoom : PAD - b.x * zoom;
  const vy = fitsY ? (room - b.h * zoom) / 2 - b.y * zoom : PAD - b.y * zoom;
  return {
    direction: dir,
    nodes: layout.nodes,
    edges: layout.edges,
    bounds: b,
    zoom,
    height,
    viewport: { x: Math.round(vx), y: Math.round(vy), zoom },
    fitsAtOne,
    showControls,
    showMinimap,
  };
}

/** Back-compat: positions only, as the widget used to expose. */
export function autoLayout(nodes: WfNode[], edges: WfEdge[], dir: Direction = 'LR'): Map<string, { x: number; y: number }> {
  return new Map(layoutWorkflow(nodes, edges, dir).nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
}
