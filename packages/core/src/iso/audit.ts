/**
 * @file iso/audit.ts
 * @description Machine gates for iso drawings. Each check returns
 * `{ check, count, items }`; a count of 0 is a pass. Pure, no DOM: the input
 * is the SVG string our own kit writes (absolute M/L/Z paths, `cx/cy/r` dots,
 * `<g data-item>` per part), so the same audit runs in node, in tests and, later,
 * in the browser on a live scene.
 *
 * - `supports`: every solid rests on another solid or the ground, through a
 *   chain of touching solids, or is marked floating (labels, flows). A solid
 *   with no shape fails too: "not measured" must never read as a pass. Each
 *   solid is an extrusion (closed rings in a frame's u,v plane swept along its
 *   axis), which covers plates, tubes, cylinders and boxes exactly; contact is
 *   measured from points sampled on one solid's edges to the other's signed
 *   distance, both ways (ponytail: edge samples, so a touch is found to about
 *   `spacing`; add cap samples if a figure ever rests a big face on a small one
 *   with no edge inside it).
 * - `looseEnds`: every open line end that is not marked free lands within
 *   `tolerance` viewBox px of another stroke or a dot, or is hidden under a fill
 *   painted after it. A short straight mark (a tick) needs only one rooted end.
 *
 * Shapes reach the reader as `data-shape` on a solid's group (`shapeAttr`
 * writes it; `data-ground`, `data-floating` mark the special cases); a figure
 * writes them only when it renders for an audit. The method follows Anatomy's audit
 * and line-ends scripts (MIT, see THIRD_PARTY_NOTICES.md); the code is our own.
 */

import type { AuditReport } from "../core/audit-report.js";
import type { Flat, Point3 } from "./kit.js";
import { axisFrame, pointOf, type Frame } from "./solids.js";

export type { AuditReport } from "../core/audit-report.js";

/** A solid as closed rings (holes wound the other way) in F's u,v plane, swept along F.a from s0 to s1. */
export interface Extrusion {
  F: Frame;
  rings: Flat[][];
  s0: number;
  s1: number;
}

export interface AuditSolid {
  id: string;
  /** Missing means the figure did not measure this solid. */
  shape?: Extrusion;
  ground?: boolean;
  floating?: boolean;
}

/** An axis-aligned world box as an extrusion. */
export const boxShape = (min: Point3, max: Point3): Extrusion => ({
  F: axisFrame([0, 0, 0], "z"),
  rings: [[[min[0], min[1]], [max[0], min[1]], [max[0], max[1]], [min[0], max[1]]]],
  s0: min[2],
  s1: max[2],
});

const hundredth = (v: number) => Math.round(v * 100) / 100;

/** The `data-shape` attribute a figure writes on a solid's group for `readSvg`. */
export function shapeAttr({ F, rings, s0, s1 }: Extrusion) {
  const head = [...F.o, ...F.a, ...F.u, ...F.v, s0, s1].map(hundredth).join(" ");
  return ` data-shape="${[head, ...rings.map((r) => r.flat().map(hundredth).join(" "))].join("|")}"`;
}

function parseShape(text: string): Extrusion | undefined {
  const [head, ...rings] = text.split("|").map((part) => part.split(" ").map(Number));
  if (!head || head.length !== 14 || head.some(Number.isNaN)) return undefined;
  const v3 = (i: number) => head.slice(i, i + 3) as Point3;
  return {
    F: { o: v3(0), a: v3(3), u: v3(6), v: v3(9) },
    s0: head[12]!,
    s1: head[13]!,
    rings: rings.map((r) => Array.from({ length: r.length / 2 }, (_, i) => [r[2 * i]!, r[2 * i + 1]!] as Flat)),
  };
}

export type Mark =
  | { kind: "stroke"; item: string; subpaths: Array<{ points: Flat[]; closed: boolean }>; check: boolean; free?: "start" | "end" | "both" }
  | { kind: "fill"; item: string; subpaths: Flat[][] }
  | { kind: "dot"; item: string; c: Flat; r: number };

export interface Drawing {
  solids: AuditSolid[];
  /** Everything painted, in paint order. */
  marks: Mark[];
}

export interface Unsupported {
  id: string;
  /** World units to the nearest supported solid (null: the solid has no box). */
  gap: number | null;
  nearest: string;
}

export interface LooseEnd {
  id: string;
  end: "start" | "end";
  at: Flat;
  /** viewBox px to the nearest stroke or dot. */
  gap: number;
}

// ---- reading our own SVG -------------------------------------------------------

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const opacityOf = (tag: string) => Number(attr(tag, "style")?.match(/opacity:\s*([\d.]+)/)?.[1] ?? 1);

function subpathsOf(d: string) {
  const out: Array<{ points: Flat[]; closed: boolean }> = [];
  for (const [, cmd, x, y] of d.matchAll(/([MLZ])\s*(?:(-?[\d.]+)[\s,]+(-?[\d.]+))?/g)) {
    if (cmd === "M") out.push({ points: [[Number(x), Number(y)]], closed: false });
    else if (cmd === "L") out[out.length - 1]?.points.push([Number(x), Number(y)]);
    else if (out.length) out[out.length - 1]!.closed = true;
  }
  return out;
}

/** The solids and marks of an SVG string written by the iso kit. */
export function readSvg(svg: string): Drawing {
  const solids: AuditSolid[] = [];
  const marks: Mark[] = [];
  const stack: string[] = [];
  const counts = new Map<string, number>();
  const item = () => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const id = attr(stack[i]!, "data-item");
      if (id) return id;
    }
    return "";
  };
  const opacity = (tag: string) => stack.reduce((a, g) => a * opacityOf(g), opacityOf(tag));
  for (const [tag, close, name] of svg.matchAll(/<(\/?)(g|path|circle)\b[^>]*>/g) as Iterable<[string, string, string]>) {
    if (name === "g") {
      if (close) {
        stack.pop();
        continue;
      }
      stack.push(tag);
      if (!/class="iso-solid\b/.test(tag)) continue;
      const id = item() || "solid";
      const n = counts.get(id) ?? 0;
      counts.set(id, n + 1);
      const shape = attr(tag, "data-shape");
      solids.push({
        id: `${id}/${n}`,
        ...(shape ? { shape: parseShape(shape) } : {}),
        ground: attr(tag, "data-ground") !== undefined,
        floating: attr(tag, "data-floating") !== undefined,
      });
      continue;
    }
    if (name === "circle") {
      const [cx, cy, r] = ["cx", "cy", "r"].map((k) => Number(attr(tag, k)));
      marks.push({ kind: "dot", item: item(), c: [cx!, cy!], r: r! });
      continue;
    }
    const cls = attr(tag, "class") ?? "";
    const d = attr(tag, "d") ?? "";
    if (/\biso-(fill|shade|top)\b/.test(cls)) marks.push({ kind: "fill", item: item(), subpaths: subpathsOf(d).map((s) => s.points) });
    else if (/\biso-line\b/.test(cls)) {
      const free = attr(tag, "data-free");
      marks.push({
        kind: "stroke",
        item: item(),
        subpaths: subpathsOf(d),
        check: !/\biso-(edge|crease|bevel)\b/.test(cls) && opacity(tag) >= 0.3,
        ...(free === undefined ? {} : { free: free === "" ? ("both" as const) : (free as "start" | "end") }),
      });
    }
  }
  return { solids, marks };
}

// ---- supports ------------------------------------------------------------------

const sub3 = (a: Point3, b: Point3): Point3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: Point3, b: Point3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Signed distance from a world point to an extrusion (negative inside). */
function distanceTo({ F, rings, s0, s1 }: Extrusion, q: Point3) {
  const d = sub3(q, F.o);
  const p: Flat = [dot3(d, F.u), dot3(d, F.v)];
  let flat = Infinity;
  for (const ring of rings) for (let i = 0; i < ring.length; i++) flat = Math.min(flat, segmentDistance(p, ring[i]!, ring[(i + 1) % ring.length]!));
  if (insideFill(p, rings)) flat = -flat;
  const axial = Math.max(s0 - dot3(d, F.a), dot3(d, F.a) - s1);
  return flat <= 0 && axial <= 0 ? Math.max(flat, axial) : Math.hypot(Math.max(flat, 0), Math.max(axial, 0));
}

/** World points on every edge of an extrusion, about `spacing` apart. */
function samplesOf({ F, rings, s0, s1 }: Extrusion, spacing: number) {
  const ring2: Flat[] = [];
  for (const ring of rings)
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / spacing));
      for (let j = 0; j < n; j++) ring2.push([a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n]);
    }
  const layers = Math.max(1, Math.ceil((s1 - s0) / spacing));
  const out: Point3[] = [];
  for (let k = 0; k <= layers; k++) for (const [x, y] of ring2) out.push(pointOf(F, s0 + ((s1 - s0) * k) / layers, x, y));
  return out;
}

/**
 * Solids nothing holds up. `touch`: largest gap, in world units, that still
 * counts as resting; `spacing`: edge sample step, in world units.
 */
export function supports(solids: AuditSolid[], { touch = 0.5, spacing = 1 } = {}): AuditReport<Unsupported> {
  const nodes = solids
    .filter((s) => s.shape && !s.floating)
    .map((s) => {
      const pts = samplesOf(s.shape!, spacing);
      const lo = [0, 1, 2].map((i) => pts.reduce((m, p) => Math.min(m, p[i]!), Infinity));
      const hi = [0, 1, 2].map((i) => pts.reduce((m, p) => Math.max(m, p[i]!), -Infinity));
      return { s, pts, lo, hi };
    });
  type Node = (typeof nodes)[number];
  const memo = new Map<string, number>();
  const gapOf = (a: Node, b: Node) => {
    const boxGap = Math.hypot(...[0, 1, 2].map((i) => Math.max(0, a.lo[i]! - b.hi[i]!, b.lo[i]! - a.hi[i]!)));
    if (boxGap > touch) return boxGap;
    const key = a.s.id < b.s.id ? `${a.s.id} ${b.s.id}` : `${b.s.id} ${a.s.id}`;
    let gap = memo.get(key);
    if (gap === undefined) {
      gap = Infinity;
      for (const p of a.pts) if ((gap = Math.min(gap, distanceTo(b.s.shape!, p))) <= 0) break;
      if (gap > 0) for (const p of b.pts) if ((gap = Math.min(gap, distanceTo(a.s.shape!, p))) <= 0) break;
      memo.set(key, (gap = Math.max(0, gap)));
    }
    return gap;
  };
  const held = new Set(nodes.filter((n) => n.s.ground));
  const queue = [...held];
  while (queue.length) {
    const a = queue.pop()!;
    for (const b of nodes) if (!held.has(b) && gapOf(a, b) <= touch) held.add(b), queue.push(b);
  }
  const items: Unsupported[] = solids.filter((s) => !s.shape && !s.floating).map((s) => ({ id: s.id, gap: null, nearest: "" }));
  for (const node of nodes) {
    if (held.has(node)) continue;
    let gap = Infinity;
    let nearest = "";
    for (const h of held) {
      const g = gapOf(node, h) > touch ? Math.max(0, node.pts.reduce((m, p) => Math.min(m, distanceTo(h.s.shape!, p)), Infinity)) : gapOf(node, h);
      if (g < gap) (gap = g), (nearest = h.s.id);
    }
    items.push({ id: node.s.id, gap: hundredth(gap), nearest });
  }
  return { check: "supports", count: items.length, items };
}

// ---- loose ends ----------------------------------------------------------------

function segmentDistance(p: Flat, a: Flat, b: Flat) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const span = dx * dx + dy * dy;
  const t = span > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / span)) : 0;
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}

/** Nonzero winding over every ring of one path: the kit reverses hole rings, so holes stay open. */
function insideFill(p: Flat, rings: Flat[][]) {
  let wind = 0;
  for (const ring of rings)
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const side = (b[0] - a[0]) * (p[1] - a[1]) - (p[0] - a[0]) * (b[1] - a[1]);
      if (a[1] <= p[1]) {
        if (b[1] > p[1] && side > 0) wind++;
      } else if (b[1] <= p[1] && side < 0) wind--;
    }
  return wind !== 0;
}

const lengthOf = (pts: Flat[]) => pts.reduce((n, p, i) => (i ? n + Math.hypot(p[0] - pts[i - 1]![0], p[1] - pts[i - 1]![1]) : 0), 0);

/**
 * Open line ends that land on nothing. `tolerance`: viewBox px an end may miss
 * by; `root`: px a short mark's rooted end may miss by; `mark`: longest
 * straight line, in px, treated as a mark.
 */
export function looseEnds(marks: Mark[], { tolerance = 1, root = 2, mark = 7 } = {}): AuditReport<LooseEnd> {
  const reach = Math.max(tolerance, root);
  const covers = marks.map((m, i) => {
    if (m.kind !== "fill") return null;
    const pts = m.subpaths.flat();
    if (!pts.length) return null;
    const xs = pts.map(([x]) => x);
    const ys = pts.map(([, y]) => y);
    return { i, rings: m.subpaths, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as const };
  }).filter((c) => c !== null);

  const items: LooseEnd[] = [];
  marks.forEach((line, li) => {
    if (line.kind !== "stroke" || !line.check) return;
    for (const sub of line.subpaths) {
      const pts = sub.points;
      if (sub.closed || pts.length < 2) continue;
      const first = pts[0]!;
      const last = pts[pts.length - 1]!;
      const length = lengthOf(pts);
      if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.05 || length < 0.2) continue;
      // Distance along the own path to each vertex, to skip the segments the end sits on.
      const along = pts.map((_, i) => lengthOf(pts.slice(0, i + 1)));
      const gapAt = (end: "start" | "end", p: Flat) => {
        if (line.free === "both" || line.free === end) return 0;
        if (covers.some((c) => c.i > li && p[0] >= c.box[0] && p[0] <= c.box[2] && p[1] >= c.box[1] && p[1] <= c.box[3] && insideFill(p, c.rings))) return 0;
        let best = Infinity;
        for (const m of marks) {
          if (m.kind === "dot") {
            const d = Math.hypot(p[0] - m.c[0], p[1] - m.c[1]);
            best = Math.min(best, Math.max(0, d - m.r));
          } else if (m.kind === "stroke")
            for (const s of m.subpaths) {
              const own = s === sub;
              const n = s.points.length;
              for (let i = 0; i < n - 1 + (s.closed ? 1 : 0); i++) {
                if (own) {
                  const from = end === "start" ? along[i]! : length - along[i + 1]!;
                  if (from < 2 * reach) continue;
                }
                best = Math.min(best, segmentDistance(p, s.points[i]!, s.points[(i + 1) % n]!));
              }
            }
        }
        return best;
      };
      const gaps = { start: gapAt("start", first), end: gapAt("end", last) };
      const straight = pts.every((q) => segmentDistance(q, first, last) < 0.15);
      let bad: Array<"start" | "end">;
      if (straight && length <= mark) bad = Math.min(gaps.start, gaps.end) <= root ? [] : (["start", "end"] as const).filter((e) => gaps[e] > 0);
      else bad = (["start", "end"] as const).filter((e) => gaps[e] > tolerance);
      for (const end of bad) items.push({ id: line.item, end, at: end === "start" ? first : last, gap: hundredth(gaps[end]) });
    }
  });
  return { check: "loose-ends", count: items.length, items };
}

/** Both checks on one kit SVG string. */
export function auditSvg(svg: string, options: { touch?: number; tolerance?: number } = {}): [AuditReport<Unsupported>, AuditReport<LooseEnd>] {
  const { solids, marks } = readSvg(svg);
  return [supports(solids, { touch: options.touch }), looseEnds(marks, { tolerance: options.tolerance })];
}
