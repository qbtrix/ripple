// workflow/layout.ts: everything the Workflow widget decides before drawing,
// as pure functions so layout.test.ts can pin it.
//
// sanitizeWorkflow narrows model data once (type, status, label, duplicate ids,
// dangling edges). planWorkflow lays the graph out for a measured card width.
// Below 480px: one top-to-bottom spine at zoom 1, so labels keep their design
// size at phone width. From 480px: the first of standard columns, compact
// columns, or rows with same-depth siblings side by side that fits at the
// readable floor (MIN_ZOOM); when none fits, the centred spine, panning top to
// bottom. Zoom never goes above 1 or below the floor. A reader who cannot pan
// (interactive false) gets a canvas that grows instead. Whenever overlays show,
// the canvas keeps a strip under it for the zoom pill and minimap (the minimap
// only while its marks stay readable).
//
// Spine: each branch is one contiguous group, indented a level, in exit order,
// and a step branches meet at waits below all of them. A branching step drops one
// trunk down its left edge and each branch peels into the top of its first step,
// label on the peel; skips share a rail right of the column per target and land
// on top; only a back edge enters a side. Every exit is on the bottom edge, and
// one node width serves the whole column.
//
// Columns (LR) and rows (TB beside each other): back edges (cycles) are found by
// DFS before layering, so a loop never inflates depths. An only child lines up
// with its parent. An edge to the very next column/row draws as a plain step
// (a row gap it bends across is at least 40px); any other edge (a back edge, or
// one that skips) is a loop in its own outside lane, so it never crosses a node.
// In LR each edge of a fan-out (or fan-in) turns in its own channel of the
// column gap. A condition orders its exits yes-like, no-like, the rest.
// Unlabelled first and second branches read "Yes" and "No"; later ones no chip.
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
const TB_MAX_W = 280; // the spine
const TB_WIDE_MAX = 360; // layered rows in a wide card
const TB_MIN_W = 160;
const TB_COL_GAP = 24; // between siblings in a layered row
const TB_GAP = 24; // between rows
const TB_BEND_GAP = 40; // between rows an edge bends across
const INDENT = 24; // spine: one branch level
const TRUNK = 14; // spine: a branching step's trunk, in from its left edge
const CHIP_H = 18; // a one-line chip, border included, plus a hair
const TB_CHIP = 16; // first chip centre below its exit: 8px clear of the handle
const LANE0 = 14; // first outside lane from the graph
const LANE_STEP = 8; // between lanes
const CHAN0 = 12; // LR: first channel after the exit, so an edge runs straight out first
const CHAN_STEP = 6;
/** Bottom room kept clear for the overlays at the initial view. */
const GUTTER = { controls: 40, minimap: 92 };

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
  /** TB loop: the lane's side, and whether it leaves from the source's side (no turn below). */
  side: 'L' | 'R';
  sideExit: boolean;
  /** Absolute chip centre, when the layout places it (a side-exit loop's chip, in a row gap on its lane). */
  at?: { x: number; y: number };
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
  /** Spine: the whole route, absolute; the drawn line snaps its ends to the handles. */
  points?: { x: number; y: number }[];
  /** Spine trunk: starts where the previous branch peeled off, so the shared trunk is drawn once. */
  joined?: boolean;
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
  /** A strip under the graph (inside `height`) where the overlays sit. */
  gutter: number;
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

/** Ranks (column in LR, row in TB) and cross-axis positions, before handles. */
function place(g: Graph): { rank: Map<string, number>; cross: Map<string, number> } {
  const rank = new Map<string, number>();
  const cross = new Map<string, number>();
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
    // A node that is the only child of its only parent sits in line with it;
    // the rest keep the centred spread. No two in a layer closer than one slot.
    const parent = (id: string) => (inEdges.get(id)?.length === 1 ? inEdges.get(id)![0].from : undefined);
    layer.forEach((id, i) => {
      const p = parent(id);
      const sole = p !== undefined && cross.has(p) && layer.filter((x) => (inEdges.get(x) ?? []).some((e) => e.from === p)).length === 1;
      const want = sole ? cross.get(p)! : i - (layer.length - 1) / 2;
      orderIn.set(id, i);
      rank.set(id, g.depth.get(id)!);
      cross.set(id, i ? Math.max(want, cross.get(layer[i - 1])! + 1) : want);
    });
  }
  return { rank, cross };
}

/**
 * Lay the graph out in one direction. Pure geometry. TB is one spine unless
 * `layered`, which puts same-depth siblings side by side (wide cards). `tbWidth`
 * is the room TB has; `lr` the LR column set.
 */
export function layoutWorkflow(
  nodes: WfNode[],
  rawEdges: WfEdge[],
  dir: Direction,
  opts: { tbWidth?: number; lr?: typeof LR_STANDARD; layered?: boolean } = {},
) {
  const tbWidth = opts.tbWidth ?? TB_MAX_W;
  const lrSet = opts.lr ?? LR_STANDARD;
  const g = analyse(nodes, rawEdges);
  const usePositions = modelPositionsUsable(nodes);
  if (dir === 'TB' && !opts.layered && !usePositions) return layoutSpine(g, tbWidth);
  const { rank, cross } = usePositions ? { rank: new Map<string, number>(), cross: new Map<string, number>() } : place(g);
  const isLoop = (e: WfEdge) => !usePositions && (g.back.has(e) || rank.get(e.to)! - rank.get(e.from)! !== 1);

  // TB lane side: right for back edges and a condition's skips that rank with or
  // after its plain exits; left for a single-exit step's skips (fan-ins) and a
  // condition's skips that rank before every plain exit (so yes stays first).
  const multi = (e: WfEdge) => g.slot.get(e)!.k > 1;
  const plainMin = new Map<string, number>();
  for (const e of g.edges) if (!isLoop(e)) plainMin.set(e.from, Math.min(plainMin.get(e.from) ?? 9, branchRank(e.label)));
  const sideOf = (e: WfEdge): 'L' | 'R' =>
    dir === 'LR' || g.back.has(e) ? 'R' : !multi(e) ? 'L' : branchRank(e.label) < (plainMin.get(e.from) ?? -1) ? 'L' : 'R';

  // One lane per loop and side: shortest spans innermost; loops whose rank spans overlap never share.
  const span = (e: WfEdge) => {
    const a = rank.get(e.from) ?? 0, b = rank.get(e.to) ?? 0;
    return [Math.min(a, b), Math.max(a, b)] as const;
  };
  const laneIdx = new Map<WfEdge, number>();
  const taken = { L: [] as (readonly [number, number])[][], R: [] as (readonly [number, number])[][] };
  for (const e of g.edges.filter(isLoop).sort((a, b) => span(a)[1] - span(a)[0] - (span(b)[1] - span(b)[0]))) {
    const [lo, hi] = span(e);
    const t = taken[sideOf(e)];
    let L = 0;
    while (t[L]?.some(([a, b]) => a <= hi && lo <= b)) L++;
    (t[L] ??= []).push([lo, hi]);
    laneIdx.set(e, L);
  }
  const roomOf = (n: number) => (n ? LANE0 + LANE_STEP * (n - 1) + 8 : 0);
  const laneRoom = roomOf(taken.L.length) + roomOf(taken.R.length);

  // Exit slots. LR: a condition's plain exits first, then its loops, inner lane
  // first, so a loop never crosses a sibling exit on its way to the lane below.
  // TB: yes-like, no-like, the rest; within a rank, left loops (outer lane
  // first), plain exits, right loops (inner lane first), so no exit crosses another.
  const group = (e: WfEdge) => (!isLoop(e) ? 1 : sideOf(e) === 'L' ? 0 : 2);
  const exit = new Map<WfEdge, { i: number; k: number }>();
  for (const list of g.out.values()) {
    if (list.length < 2 || g.slot.get(list[0])!.k < 2) list.forEach((e) => exit.set(e, { i: 0, k: 1 }));
    else if (dir === 'LR') {
      const loops = list.filter(isLoop).sort((a, b) => laneIdx.get(a)! - laneIdx.get(b)!);
      [...list.filter((e) => !isLoop(e)), ...loops].forEach((e, i) => exit.set(e, { i, k: list.length }));
    } else {
      const lane = (e: WfEdge) => (group(e) === 0 ? -laneIdx.get(e)! : group(e) === 2 ? laneIdx.get(e)! : 0);
      list
        .toSorted((a, b) => branchRank(a.label) - branchRank(b.label) || group(a) - group(b) || lane(a) - lane(b))
        .forEach((e, i) => exit.set(e, { i, k: list.length }));
    }
  }

  const widest = Math.max(1, ...layerSizes(rank));
  const w =
    dir === 'LR'
      ? lrSet.w
      : Math.floor(Math.max(TB_MIN_W, Math.min(TB_WIDE_MAX, (tbWidth - laneRoom - (widest - 1) * TB_COL_GAP) / widest)));
  const h = NODE_H;

  const placedEdges: PlacedEdge[] = g.edges.map((e, i) => {
    const x = exit.get(e)!;
    const tbLoop = dir === 'TB' && isLoop(e);
    const side = sideOf(e);
    const sideExit = tbLoop && x.k === 1;
    return {
      ...e,
      id: `e-${e.from}-${e.to}-${i}`,
      sourceHandle: sideExit ? `out-${side.toLowerCase()}` : x.k > 1 ? `out-${x.i}` : 'out',
      targetHandle: tbLoop ? `in-${side.toLowerCase()}` : 'in',
      loop: isLoop(e),
      side,
      sideExit,
      back: g.back.has(e),
      lane: 0,
      chan: CHAN0,
      turn: 0,
      chipY: TB_CHIP,
      chip: 112,
    };
  });
  const slotOf = (i: number) => exit.get(g.edges[i])!;
  const all = placedEdges.map((_, i) => i);
  const plain = all.filter((i) => !placedEdges[i].loop);
  // The edges a plain edge must not overlap: its fan-out, else its fan-in.
  const groupOf = (i: number, d: (i: number) => number) => {
    const out = plain.filter((j) => placedEdges[j].from === placedEdges[i].from);
    if (out.length > 1) return out.sort((a, b) => d(b) - d(a));
    const into = plain.filter((j) => placedEdges[j].to === placedEdges[i].to);
    return into.length > 1 ? into.sort((a, b) => d(a) - d(b)) : [i];
  };

  // TB: chips just under their exits (every other chip one chip lower when two
  // or more share the side, so they never touch), then each loop turns below
  // the chips, the leftmost lowest so lanes never cross, then the plain exits,
  // each of a fan-out or fan-in at its own height.
  const gapAfter: number[] = [];
  const colX = (id: string) => (cross.get(id) ?? 0) * (w + TB_COL_GAP);
  if (dir === 'TB') {
    const dx = (i: number) => {
      const e = placedEdges[i], s = slotOf(i);
      return Math.abs(colX(e.to) + w / 2 - (colX(e.from) + (w * (s.i + 1)) / (s.k + 1)));
    };
    for (const id of g.out.keys()) {
      const mine = all.filter((i) => placedEdges[i].from === id && !placedEdges[i].sideExit);
      // Chips sit just under their exits; one that would overlap the chip to its
      // left drops a full chip height (plus a gap) below it.
      let prev: { c: number; half: number; low: boolean } | undefined;
      for (const i of mine.toSorted((a, b) => slotOf(a).i - slotOf(b).i)) {
        const s = slotOf(i), e = placedEdges[i];
        const c = (w * (s.i + 1)) / (s.k + 1);
        e.chip = s.k > 1 ? Math.max(28, Math.min(Math.floor((2 * w) / (s.k + 1)) - 6, 2 * Math.min(c, w - c) + 16)) : Math.min(220, w - 24);
        if (!e.label) continue;
        const half = Math.min(e.chip, e.label.length * 6 + 12) / 2;
        const low = !!prev && !prev.low && c - prev.c < prev.half + half + 4;
        e.chipY = TB_CHIP + (low ? CHIP_H + 4 : 0);
        prev = { c, half, low };
      }
      const chipBottom = Math.max(0, ...mine.filter((i) => placedEdges[i].label).map((i) => placedEdges[i].chipY + CHIP_H / 2));
      // Loops turn below the chips: right-going ones leftmost lowest, left-going ones leftmost highest.
      const loops = mine.filter((i) => placedEdges[i].loop).sort((a, b) => slotOf(a).i - slotOf(b).i);
      const left = loops.filter((i) => placedEdges[i].side === 'L');
      const right = loops.filter((i) => placedEdges[i].side === 'R');
      const base = Math.max(14, chipBottom + 6);
      left.forEach((i, j) => (placedEdges[i].turn = base + 6 * j));
      right.forEach((i, j) => (placedEdges[i].turn = base + 6 * (right.length - 1 - j)));
      const band = Math.max(left.length, right.length);
      for (const i of mine) {
        if (placedEdges[i].loop) continue;
        const grp = groupOf(i, dx);
        if (placedEdges[i].label || grp.length > 1) placedEdges[i].turn = base + 6 * band + 2 + 6 * grp.indexOf(i);
      }
      const r = rank.get(id);
      if (r !== undefined) gapAfter[r] = Math.max(gapAfter[r] ?? TB_GAP, ...mine.map((i) => (placedEdges[i].turn ? placedEdges[i].turn + 18 : TB_GAP)));
    }
    // A plain edge that has to bend gets room for both corners.
    for (const i of plain) {
      const e = placedEdges[i], s = slotOf(i);
      if (Math.abs(colX(e.to) + w / 2 - (colX(e.from) + (w * (s.i + 1)) / (s.k + 1))) > 1)
        gapAfter[rank.get(e.from)!] = Math.max(gapAfter[rank.get(e.from)!] ?? TB_GAP, TB_BEND_GAP);
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
  const SIDE = { L: 'left', R: 'right' } as const;
  placedEdges.forEach((e, i) => {
    const s = slotOf(i);
    const src = handles.get(e.from)!;
    if (!src.some((x) => x.id === e.sourceHandle))
      src.push(
        e.sideExit
          ? { id: e.sourceHandle, type: 'source', side: SIDE[e.side], pct: 50 }
          : { id: e.sourceHandle, type: 'source', side: dir === 'TB' ? 'bottom' : 'right', pct: ((s.i + 1) / (s.k + 1)) * 100 },
      );
    const tgt = handles.get(e.to)!;
    if (tgt.some((x) => x.id === e.targetHandle)) return;
    if (e.targetHandle !== 'in') return void tgt.push({ id: e.targetHandle, type: 'target', side: SIDE[e.side], pct: 50 });
    tgt.push({ id: 'in', type: 'target', side: dir === 'TB' ? 'top' : 'left', pct: 50 });
  });
  // A side with both a way in and a way out: in above, out below.
  for (const list of handles.values())
    for (const side of ['left', 'right'] as const) {
      const on = list.filter((x) => x.side === side);
      if (on.some((x) => x.type === 'source') && on.some((x) => x.type === 'target')) on.forEach((x) => (x.pct = x.type === 'target' ? 30 : 70));
    }

  const placed: PlacedNode[] = nodes.map((n) => {
    const r = rank.get(n.id)!;
    const at = usePositions ? n.position! : dir === 'TB' ? { x: colX(n.id), y: start[r] } : { x: start[r], y: cross.get(n.id)! * (h + LR_ROW_GAP) };
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
    for (const id of g.out.keys()) {
      const gap = (gapAfter[rank.get(id)!] ?? lrSet.gap) - 10;
      const loops = all.filter((i) => placedEdges[i].from === id && placedEdges[i].loop).sort((a, b) => slotOf(b).i - slotOf(a).i);
      loops.forEach((i, j) => (placedEdges[i].chan = Math.min(gap, 8 + CHAN_STEP * j)));
      for (const i of plain.filter((j) => placedEdges[j].from === id)) {
        const grp = groupOf(i, dy);
        const step = Math.min(CHAN_STEP, (gap - CHAN0) / Math.max(1, grp.length - 1 + loops.length));
        placedEdges[i].chan = Math.round(Math.min(gap, CHAN0 + step * (grp.indexOf(i) + loops.length)));
        placedEdges[i].chip = Math.max(28, gap - placedEdges[i].chan - 2);
      }
    }
  }

  // Bounds, then each loop's own outside lane: below the graph in LR, right of it in TB.
  const edge = (f: (n: PlacedNode) => number, pick: (...v: number[]) => number) => (placed.length ? pick(...placed.map(f)) : 0);
  let x0 = edge((n) => n.x, Math.min);
  const y0 = edge((n) => n.y, Math.min);
  let x1 = edge((n) => n.x + n.w, Math.max);
  let y1 = edge((n) => n.y + n.h, Math.max);
  const [left, right, bottom] = [x0, x1, y1];
  const at = new Map(placed.map((n) => [n.id, n]));
  placedEdges.forEach((e, i) => {
    if (!e.loop) return;
    const offset = LANE0 + LANE_STEP * laneIdx.get(g.edges[i])!;
    if (dir === 'TB') {
      e.lane = e.side === 'L' ? left - offset : right + offset;
      let reach = 4;
      if (e.sideExit && e.label) {
        // The chip rides its lane in the row gap nearest the middle of the run.
        const [a, b] = [at.get(e.from)!.y, at.get(e.to)!.y].sort((p, q) => p - q);
        const gaps = start.slice(1).map((y, r) => y - (gapAfter[r] ?? TB_GAP) / 2).filter((y) => y > a + h && y < b);
        const mid = (a + b + h) / 2;
        const y = gaps.length ? gaps.reduce((p, q) => (Math.abs(q - mid) < Math.abs(p - mid) ? q : p)) : mid;
        e.at = { x: e.lane, y };
        e.chip = 112;
        reach = Math.min(e.chip, e.label.length * 6 + 12) / 2 + 2;
      }
      if (e.side === 'L') x0 = Math.min(x0, e.lane - reach);
      else x1 = Math.max(x1, e.lane + reach);
    } else {
      e.lane = bottom + offset;
      y1 = Math.max(y1, e.lane + 12);
    }
  });
  return { nodes: placed, edges: placedEdges, bounds: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, positioned: usePositions };
}

/**
 * The spine: one column, top to bottom, for a narrow card (or a wide one where
 * nothing else fits). Each branch is one contiguous group, indented a level, in
 * exit order; a step two or more branches meet at (a join) waits until every
 * branch is drawn and goes back to the outer level. A branching step sends one
 * trunk down its left edge, beside its indented branches, and each branch peels
 * off it into the top of its first step, the label on the peel. A skip lands on
 * its target through a rail right of the column (every skip into one target
 * shares it) and in at the top; only a back edge enters a step's side. Every
 * source handle is on the bottom edge.
 */
function layoutSpine(g: Graph, avail: number) {
  const { nodes } = g;
  const fwd = new Map(nodes.map((n) => [n.id, g.out.get(n.id)!.filter((e) => !g.back.has(e))]));
  const into = new Map<string, WfEdge[]>(nodes.map((n) => [n.id, []]));
  for (const e of g.edges) if (!g.back.has(e)) into.get(e.to)!.push(e);
  const branching = (id: string) => fwd.get(id)!.length > 1;
  const index = new Map(nodes.map((n, i) => [n.id, i]));

  // Order: topological; among the ready steps the deepest branch first, branches
  // in exit order, so a branch never interleaves with another and a join comes last.
  type Scope = (readonly [number, number])[];
  const scope = new Map<string, Scope>();
  const row = new Map<string, number>();
  const order: string[] = [];
  const waiting = new Map(nodes.map((n) => [n.id, into.get(n.id)!.length]));
  const first = (a: string, b: string) => {
    const A = scope.get(a)!, B = scope.get(b)!;
    for (let k = 0; k < Math.min(A.length, B.length); k++) {
      const d = A[k][0] - B[k][0] || A[k][1] - B[k][1];
      if (d) return d;
    }
    return B.length - A.length || index.get(a)! - index.get(b)!;
  };
  const ready = nodes.filter((n) => !waiting.get(n.id)).map((n) => n.id);
  for (const id of ready) scope.set(id, []);
  while (ready.length) {
    const id = ready.sort(first).shift()!;
    row.set(id, order.length);
    order.push(id);
    for (const e of fwd.get(id)!) {
      waiting.set(e.to, waiting.get(e.to)! - 1);
      if (waiting.get(e.to)) continue;
      // A step's scope is what every way into it shares.
      const ways = into.get(e.to)!.map((x) => {
        const s = scope.get(x.from)!;
        return branching(x.from) ? [...s, [row.get(x.from)!, fwd.get(x.from)!.indexOf(x)] as const] : s;
      });
      let n = Math.min(...ways.map((w) => w.length));
      for (let k = 0; k < n; k++) if (ways.some((w) => w[k][0] !== ways[0][k][0] || w[k][1] !== ways[0][k][1])) n = k;
      scope.set(e.to, ways[0].slice(0, n));
      ready.push(e.to);
    }
  }
  const depth = (id: string) => scope.get(id)!.length;
  const deepest = Math.max(0, ...order.map(depth));

  // Edge kinds. A trunk edge only while every step it passes sits deeper than its source.
  const r = (id: string) => row.get(id)!;
  const passes = (e: WfEdge) => order.slice(r(e.from) + 1, r(e.to)).every((id) => depth(id) > depth(e.from));
  const trunk = (e: WfEdge) => !g.back.has(e) && branching(e.from) && r(e.to) > r(e.from) && passes(e);
  const railed = new Set(g.edges.filter((e) => !g.back.has(e) && !trunk(e) && r(e.to) - r(e.from) > 1).map((e) => e.to));
  type Kind = 'trunk' | 'drop' | 'rail' | 'back';
  const kindOf = (e: WfEdge): Kind => (g.back.has(e) ? 'back' : trunk(e) ? 'trunk' : railed.has(e.to) ? 'rail' : 'drop');
  const kinds = new Map(g.edges.map((e) => [e, kindOf(e)]));

  // Rows: room in each gap for the exits that turn below the upper step (a chip
  // under the exit, then the turn) and the peels into the lower one.
  const turnBelow = (e: WfEdge) => (e.label ? 28 : 10);
  const peelAbove = (e: WfEdge) => (kinds.get(e) === 'trunk' && e.label ? 17 : 12);
  const ys: number[] = [];
  for (let i = 0, y = 0; i < order.length; i++) {
    ys[i] = y;
    if (i === order.length - 1) break;
    const straight = (e: WfEdge) => kinds.get(e) === 'drop' && depth(e.from) === depth(e.to);
    const up = Math.max(0, ...g.out.get(order[i])!.filter((e) => kinds.get(e) !== 'trunk').map((e) => (e.label ? 28 : straight(e) ? 0 : 10)));
    const down = Math.max(0, ...into.get(order[i + 1])!.filter((e) => kinds.get(e) === 'trunk' || kinds.get(e) === 'rail').map((e) => peelAbove(e) + (kinds.get(e) === 'trunk' && e.label ? 9 : 0)));
    y += NODE_H + Math.max(TB_GAP, up + down + 8);
  }
  const top = (id: string) => ys[r(id)];

  // Right-hand lanes: one per rail (target) and per back edge, never sharing a stretch.
  const runs: { key: WfEdge | string; a: number; b: number }[] = [];
  for (const t of railed) {
    const from = into.get(t)!.filter((e) => kinds.get(e) === 'rail');
    runs.push({ key: t, a: Math.min(...from.map((e) => top(e.from) + NODE_H + turnBelow(e))), b: top(t) - 12 });
  }
  for (const e of g.back) runs.push({ key: e, a: top(e.to) + NODE_H / 2, b: top(e.from) + NODE_H + turnBelow(e) });
  const laneOf = new Map<WfEdge | string, number>();
  const used: [number, number][][] = [];
  for (const run of runs.sort((p, q) => p.b - p.a - (q.b - q.a))) {
    let k = 0;
    while (used[k]?.some(([a, b]) => a <= run.b + 6 && run.a <= b + 6)) k++;
    (used[k] ??= []).push([run.a, run.b]);
    laneOf.set(run.key, k);
  }
  const laneRoom = used.length ? LANE0 + LANE_STEP * (used.length - 1) + 4 : 0;
  // One node width for the whole column.
  const w = Math.round(Math.max(TB_MIN_W, Math.min(TB_MAX_W, avail - INDENT * deepest - laneRoom)));
  const h = NODE_H;
  const right = INDENT * deepest + w;
  const laneX = (key: WfEdge | string) => right + LANE0 + LANE_STEP * laneOf.get(key)!;
  const at = new Map(nodes.map((n) => [n.id, { x: INDENT * depth(n.id), y: top(n.id) }]));

  // Handles: trunk at the left of the bottom edge, every other exit at its middle
  // (a back edge right of middle when the middle is taken); entries on top, a back edge's on the right.
  const handles = new Map<string, PlacedHandle[]>(nodes.map((n) => [n.id, []]));
  const add = (id: string, hd: PlacedHandle) => handles.get(id)!.some((x) => x.id === hd.id) || handles.get(id)!.push(hd);
  const midTaken = (id: string) => g.out.get(id)!.some((e) => kinds.get(e) === 'drop' || kinds.get(e) === 'rail');
  const est = (label: string) => label.length * 6 + 12;
  const placedEdges: PlacedEdge[] = g.edges.map((e, i) => {
    const kind = kinds.get(e)!;
    const s = at.get(e.from)!, t = at.get(e.to)!;
    const bottom = s.y + h, tc = t.x + w / 2;
    const exitPct = kind === 'trunk' ? (TRUNK / w) * 100 : kind === 'back' && midTaken(e.from) ? 80 : 50;
    const ex = s.x + (w * exitPct) / 100;
    const sourceHandle = kind === 'trunk' ? 'out-t' : kind === 'back' && midTaken(e.from) ? 'out-b' : 'out';
    const targetHandle = kind === 'back' ? 'in-r' : 'in';
    add(e.from, { id: sourceHandle, type: 'source', side: 'bottom', pct: exitPct });
    add(e.to, kind === 'back' ? { id: 'in-r', type: 'target', side: 'right', pct: 50 } : { id: 'in', type: 'target', side: 'top', pct: 50 });
    const turn = bottom + turnBelow(e);
    let points: { x: number; y: number }[];
    let chipAt = { x: ex, y: bottom + 14 };
    let chip = 2 * Math.min(ex - s.x, s.x + w - ex) - 8;
    if (kind === 'trunk') {
      const x = s.x + TRUNK, py = t.y - peelAbove(e);
      points = [{ x, y: bottom }, { x, y: py }, { x: tc, y: py }, { x: tc, y: t.y }];
      chip = t.x + w - 8 - (x + 6);
      chipAt = { x: x + 6 + Math.min(chip, est(e.label)) / 2, y: py };
    } else if (kind === 'rail') {
      const x = laneX(e.to), py = t.y - 12;
      points = [{ x: ex, y: bottom }, { x: ex, y: turn }, { x, y: turn }, { x, y: py }, { x: tc, y: py }, { x: tc, y: t.y }];
    } else if (kind === 'back') {
      const x = laneX(e), my = t.y + h / 2;
      points = [{ x: ex, y: bottom }, { x: ex, y: turn }, { x, y: turn }, { x, y: my }, { x: t.x + w, y: my }];
    } else points = Math.abs(ex - tc) < 1 ? [{ x: ex, y: bottom }, { x: tc, y: t.y }] : [{ x: ex, y: bottom }, { x: ex, y: turn }, { x: tc, y: turn }, { x: tc, y: t.y }];
    return {
      ...e,
      id: `e-${e.from}-${e.to}-${i}`,
      sourceHandle,
      targetHandle,
      loop: kind === 'rail' || kind === 'back',
      side: 'R',
      sideExit: false,
      at: chipAt,
      back: kind === 'back',
      lane: kind === 'rail' ? laneX(e.to) : kind === 'back' ? laneX(e) : 0,
      chan: 0,
      turn: 0,
      chipY: 0,
      chip: Math.max(28, chip),
      points,
    };
  });
  // Each trunk edge after the first starts at the previous peel (just above its corner), so no stretch is drawn twice.
  for (const id of order) {
    const peels = placedEdges.filter((e) => e.from === id && e.sourceHandle === 'out-t').sort((a, b) => r(a.to) - r(b.to));
    peels.forEach((e, k) => k && ((e.points![0].y = peels[k - 1].points![1].y - 8), (e.joined = true)));
  }
  const placed: PlacedNode[] = nodes.map((n) => ({ ...n, ...at.get(n.id)!, w, h, handles: handles.get(n.id)! }));
  const x1 = used.length ? right + LANE0 + LANE_STEP * (used.length - 1) + 2 : right;
  const y1 = order.length ? ys[order.length - 1] + h : 0;
  return { nodes: placed, edges: placedEdges, bounds: { x: 0, y: 0, w: x1, h: y1 }, positioned: false };
}

/** How many nodes share each rank. */
function layerSizes(rank: Map<string, number>): number[] {
  const n: number[] = [];
  for (const r of rank.values()) n[r] = (n[r] ?? 0) + 1;
  return n.filter(Boolean);
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

/** A TB plain edge: down to its turn (halfway when 0), across, down into the target. */
export function dropRoute(s: { x: number; y: number }, t: { x: number; y: number }, turn: number) {
  if (Math.abs(t.x - s.x) < 1) return [s, t];
  const y = s.y + (turn || (t.y - s.y) / 2);
  return [s, { x: s.x, y }, { x: t.x, y }, t];
}

/**
 * A loop's route from the exit point to the entry point through its lane, and
 * where its label chip sits. LR: out to its channel, down to the lane below,
 * along it, up the gap before the target. TB: down to its turn (or straight out
 * of a side exit), across to its lane beside the spine, along it, and straight
 * into the target's side.
 */
export function loopRoute(
  dir: Direction,
  s: { x: number; y: number },
  t: { x: number; y: number },
  lane: number,
  chan: number,
  turn: number,
  chipY = TB_CHIP,
  sideExit = false,
) {
  if (dir === 'LR') {
    const out = s.x + chan;
    const into = t.x - 12;
    const pts = [s, { x: out, y: s.y }, { x: out, y: lane }, { x: into, y: lane }, { x: into, y: t.y }, t];
    return { points: pts, label: { x: (out + into) / 2, y: lane } };
  }
  // TB: the target is entered from its side, so the line ends in its own node.
  if (sideExit) return { points: [s, { x: lane, y: s.y }, { x: lane, y: t.y }, t], label: { x: lane, y: (s.y + t.y) / 2 } };
  const down = s.y + turn;
  const pts = [s, { x: s.x, y: down }, { x: lane, y: down }, { x: lane, y: t.y }, t];
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
    layout = layoutWorkflow(nodes, edges, 'TB', { tbWidth: avail });
  } else {
    // A wide card takes the first of these that fits at the readable floor:
    // standard columns, compact columns, then rows with siblings side by side.
    // When none fits, the centred spine, which pans top to bottom (or grows when
    // the reader cannot pan); siblings stack, so nothing crops sideways.
    const options: [Direction, () => ReturnType<typeof layoutWorkflow>][] = [
      ['LR', () => lr],
      ['LR', () => layoutWorkflow(nodes, edges, 'LR', { lr: LR_COMPACT })],
      ['TB', () => layoutWorkflow(nodes, edges, 'TB', { tbWidth: avail, layered: true })],
    ];
    const fits = options.map(([d, make]) => [d, make()] as const).find(([, l]) => fitOf(l) >= MIN_ZOOM);
    if (fits) (dir = fits[0]), (layout = fits[1]), (zoom = fitOf(layout));
    else {
      dir = 'TB';
      layout = layoutWorkflow(nodes, edges, 'TB', { tbWidth: avail });
      if (opts.interactive) zoom = Math.max(MIN_ZOOM, fitOf(layout));
    }
    // fitView false: draw at design size and let the reader pan.
    if (dir === 'LR' && !opts.fitView && opts.interactive) zoom = 1;
  }
  const b = layout.bounds;
  const content = b.h * zoom + 2 * PAD;
  const clamp = (v: number) => Math.round(opts.interactive ? Math.min(MAX_H, Math.max(MIN_H, v)) : Math.max(MIN_H, v));
  const fitsX = b.w * zoom <= avail + 0.5;
  const fitsAtOne = zoom === 1 && fitsX && content <= clamp(content) + 0.5;
  // Overlays sit in a strip under the graph, so neither ever covers a node.
  // The minimap only when its 120x80 box still draws each node as a readable mark.
  const mm = Math.min(120 / Math.max(1, b.w), 80 / Math.max(1, b.h));
  const showMinimap = opts.minimap === true && nodes.length >= 12 && W >= 560 && NODE_H * mm >= 4 && (layout.nodes[0]?.w ?? 0) * mm >= 12;
  const showControls = opts.interactive && !fitsAtOne;
  const gutter = showMinimap ? GUTTER.minimap : showControls ? GUTTER.controls : 0;
  const height = clamp(content + gutter);
  const room = height - gutter;
  const fitsY = content <= room + 0.5;
  // A graph that pans opens on its main line: the start for the flow axis, the
  // centre of the rows (or columns) across it, never past the graph's own edge.
  const keep = (v: number, size: number, lo: number, len: number) => Math.min(PAD - lo * zoom, Math.max(size - PAD - (lo + len) * zoom, v));
  const vx = fitsX ? (W - b.w * zoom) / 2 - b.x * zoom : dir === 'TB' ? keep(W / 2 - (layout.nodes[0]?.w ?? 0) * zoom / 2, W, b.x, b.w) : PAD - b.x * zoom;
  const vy = fitsY ? (room - b.h * zoom) / 2 - b.y * zoom : dir === 'LR' ? keep(room / 2 - (NODE_H * zoom) / 2, room, b.y, b.h) : PAD - b.y * zoom;
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
    gutter,
  };
}

/** Back-compat: positions only, as the widget used to expose. */
export function autoLayout(nodes: WfNode[], edges: WfEdge[], dir: Direction = 'LR'): Map<string, { x: number; y: number }> {
  return new Map(layoutWorkflow(nodes, edges, dir).nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
}
