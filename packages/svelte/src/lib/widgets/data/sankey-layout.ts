// widgets/data/sankey-layout.ts: the pure half of the sankey widget. Model
// output in, a drawable graph, its figures and every on-plot position out;
// no DOM, never throws. Sankey.svelte only paints what this returns.
//
// sanitize: nodes are `{ name }`, a bare string, or `{ label }` / `{ id }`;
// names go through plain() and are matched exact first, then case-insensitive.
// Empty names are skipped, repeated names merge (first wins). A link endpoint
// that is an integer and not itself a name indexes the RAW nodes array. An
// endpoint not in `nodes` becomes a node. Values accept numeric strings with
// separators ("1,200"); missing, non-numeric, zero or negative values, missing
// endpoints, self-links and links that would close a cycle (walked in input
// order) are dropped and tallied for the footnote. Repeated pairs are summed.
//
// stats: total = out-flow of the start nodes (no incoming band). A node with
// outgoing bands that receives at least max(1, 0.5% of total) more than it
// sends has a remainder ("stop here"). Ends are end nodes and remainders.
//
// layout: d3-sankey's layout only (sankeyLeft: a node sits at its step count),
// in flow coordinates (u along the flow, v across), turned into screen space
// at the end. Horizontal: ranks left to right, plot max(160, densest rank x 40)
// tall. Vertical (orient "vertical", or a plot under 480px): ranks are rows at
// a 72px pitch, shrinking to 56px to fit the max height. Bands are one cubic
// pair each (control offset = curveness x rank gap), floored at 1px; nodes at
// 2px (narrow bars at 6px long). Labels are placed greedily, most important
// first (start nodes, the largest end, anything over 15% of the total), each in
// clear space or on a chip: name over `figure · percent`, else over the figure
// alone, else one line with the percent, else without. Wide: beside the bar on
// its half's side, else the other side, else (protected) a restacked column,
// else one line within 64px with a leader. Two chips from opposite sides of a
// gap keep 14px apart, and where they still stack each gets a tick to its own
// bar (R ranks share R - 1 gaps, so one gap holds two). Narrow: under the bar inside its slot of the row (it may run
// left of a bar with no room to its right), else one line in the band run with
// a leader. Else hidden; the node stays focusable. Remainder chips come last:
// beside or under the stub, else in clear space with a leader; wide always
// keeps the word (`55K stop here`, `55K stop`), only a narrow card may show the
// bare figure. Wide drops the percent on every label once a two-line label
// drops it (narrow: per row), so one card reads one format.
import { sankey, sankeyLeft } from 'd3-sankey';
import { finite, num, plain } from '../data-kit/format.js';

/** Band tint in % of the accent over the card: rest, by theme; focused; dimmed factor. */
export const BAND = { light: 33, dark: 32 } as const;
export const LIT = 90;
export const DIM = 0.5;
export const WIDE_MIN = 480;
export const SSR_WIDTH = 640;
export const LINE = 15;
export const PAD_X = 6;
const PAD_Y = 2;
export const H2 = 2 * LINE + 2 * PAD_Y;
export const H1 = LINE + 2 * PAD_Y;
const NODE_W = 10;
const BAR = 8;
const PITCH = 72;
const PITCH_MIN = 56;
const ROW_TAIL = 48;
const PER_NODE = 40;
const MIN_PLOT = 160;
const STUB = { h: 24, v: 16 };
const MIN_LABEL = 28;
const SIDE_GAP = 14;
const REACH = 64;
/** Narrow bars draw at least this long, so a tiny end reads as a node, not a stray mark. */
const MIN_BAR = 6;

export type Graph = {
	nodes: { name: string }[];
	links: { s: number; t: number; value: number }[];
	dropped: { value: number; loop: number; end: number };
	unlinked: string[];
};

function nameOf(raw: unknown): string {
	if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
		const o = raw as Record<string, unknown>;
		return plain(o.name ?? o.label ?? o.id);
	}
	return typeof raw === 'string' || typeof raw === 'number' ? plain(raw) : '';
}

/** A positive flow from a number or a numeric string ("1,200"), else undefined. */
export function flowValue(v: unknown): number | undefined {
	const n = typeof v === 'string' ? finite(v.replace(/[,\s]/g, '')) : finite(v);
	return n !== undefined && n > 0 ? n : undefined;
}

export function sanitize(rawNodes: unknown, rawLinks: unknown): Graph {
	const rn: unknown[] = Array.isArray(rawNodes) ? rawNodes : [];
	const rl: unknown[] = Array.isArray(rawLinks) ? rawLinks : [];
	const names: string[] = [];
	const exact = new Map<string, number>();
	const lower = new Map<string, number>();
	const find = (n: string) => exact.get(n) ?? lower.get(n.toLowerCase());
	const add = (n: string) => {
		exact.set(n, names.length);
		if (!lower.has(n.toLowerCase())) lower.set(n.toLowerCase(), names.length);
		return names.push(n) - 1;
	};
	for (const r of rn) {
		const n = nameOf(r);
		if (n && find(n) === undefined) add(n);
	}
	const listed = names.length;
	const endpoint = (v: unknown): string => {
		if (typeof v === 'number' && Number.isInteger(v) && find(String(v)) === undefined) return nameOf(rn[v]);
		return typeof v === 'string' || typeof v === 'number' ? plain(v) : '';
	};

	const links: Graph['links'] = [];
	const pair = new Map<string, number>();
	const next: number[][] = [];
	const reaches = (from: number, to: number) => {
		const seen = new Set<number>();
		const stack = [from];
		while (stack.length) {
			const at = stack.pop()!;
			if (at === to) return true;
			if (seen.has(at)) continue;
			seen.add(at);
			stack.push(...(next[at] ?? []));
		}
		return false;
	};
	const dropped = { value: 0, loop: 0, end: 0 };
	for (const l of rl) {
		const o = (l && typeof l === 'object' ? l : {}) as Record<string, unknown>;
		const value = flowValue(o.value);
		if (value === undefined) {
			dropped.value++;
			continue;
		}
		const sn = endpoint(o.source);
		const tn = endpoint(o.target);
		if (!sn || !tn) {
			dropped.end++;
			continue;
		}
		let s = find(sn);
		let t = find(tn);
		if (s !== undefined ? s === t : t === undefined && sn.toLowerCase() === tn.toLowerCase()) {
			dropped.loop++;
			continue;
		}
		const key = `${s}>${t}`;
		if (s !== undefined && t !== undefined) {
			if (pair.has(key)) {
				links[pair.get(key)!].value += value;
				continue;
			}
			if (reaches(t, s)) {
				dropped.loop++;
				continue;
			}
		}
		s ??= add(sn);
		t ??= add(tn);
		pair.set(`${s}>${t}`, links.length);
		(next[s] ??= []).push(t);
		links.push({ s, t, value });
	}

	const used = new Set(links.flatMap((l) => [l.s, l.t]));
	const remap = new Map<number, number>();
	const nodes: Graph['nodes'] = [];
	names.forEach((name, i) => {
		if (used.has(i)) remap.set(i, nodes.push({ name }) - 1);
	});
	return {
		nodes,
		links: links.map((l) => ({ s: remap.get(l.s)!, t: remap.get(l.t)!, value: l.value })),
		dropped,
		unlinked: names.slice(0, listed).filter((_, i) => !used.has(i))
	};
}

export type Stats = {
	inn: number[];
	out: number[];
	value: number[];
	rem: number[];
	total: number;
	starts: number[];
	ends: { i: number; value: number }[];
	largestEnd: number;
};

export function stats(g: Graph): Stats {
	const inn = g.nodes.map(() => 0);
	const out = g.nodes.map(() => 0);
	for (const l of g.links) {
		out[l.s] += l.value;
		inn[l.t] += l.value;
	}
	const starts = g.nodes.flatMap((_, i) => (inn[i] === 0 ? [i] : []));
	const total = starts.reduce((a, i) => a + out[i], 0);
	const floor = Math.max(1, 0.005 * total);
	const rem = inn.map((v, i) => (out[i] > 0 && v - out[i] >= floor ? v - out[i] : 0));
	const ends = g.nodes.flatMap((_, i) => (out[i] === 0 ? [{ i, value: inn[i] }] : rem[i] ? [{ i, value: rem[i] }] : []));
	let largestEnd = -1;
	for (let i = 0; i < g.nodes.length; i++) if (out[i] === 0 && (largestEnd < 0 || inn[i] > inn[largestEnd])) largestEnd = i;
	return { inn, out, value: inn.map((v, i) => Math.max(v, out[i])), rem, total, starts, ends, largestEnd };
}

/** Figures on the plot: compact at 10,000 and up, grouped below. */
export const fmt = (v: number) => (v >= 10000 ? num(v, { compact: true }) : num(v));
/** Figures in the readout and accessible names: always whole. */
export const full = (v: number) => num(v);
export function pct(v: number, of: number): string {
	if (!(of > 0)) return '';
	const p = (v / of) * 100;
	return p > 0 && p < 0.5 ? '<1%' : `${Math.round(p)}%`;
}

export function summary(g: Graph, st: Stats): string {
	if (!g.links.length) return '';
	const from = `${fmt(st.total)} from ${st.starts.length === 1 ? g.nodes[st.starts[0]].name : `${st.starts.length} sources`}`;
	if (st.ends.length === 1) return `${from} · all end at ${g.nodes[st.ends[0].i].name}`;
	const best = st.ends.reduce((a, e) => (e.value > a.value ? e : a));
	return `${from} · most end at ${g.nodes[best.i].name} (${fmt(best.value)}, ${pct(best.value, st.total)})`;
}

function nodeParts(st: Stats, i: number): string[] {
	return [
		st.inn[i] ? `${full(st.inn[i])} in` : '',
		st.out[i] ? `${full(st.out[i])} out` : '',
		st.rem[i] ? `${full(st.rem[i])} stop here` : ''
	].filter(Boolean);
}
export const nodeReadout = (g: Graph, st: Stats, i: number) => [g.nodes[i].name, ...nodeParts(st, i)].join(' · ');
export const nodeName = (g: Graph, st: Stats, i: number) => [g.nodes[i].name, ...nodeParts(st, i)].join(', ');
export function linkReadout(g: Graph, st: Stats, k: number): string {
	const l = g.links[k];
	const s = g.nodes[l.s].name;
	return `${s} → ${g.nodes[l.t].name} · ${full(l.value)} · ${pct(l.value, st.value[l.s])} of ${s}`;
}
export function restReadout(g: Graph, st: Stats): string {
	if (!g.links.length) return '';
	const k = g.links.reduce((b, l, i) => (l.value > g.links[b].value ? i : b), 0);
	const l = g.links[k];
	const s = g.nodes[l.s].name;
	return `Largest flow: ${s} → ${g.nodes[l.t].name}, ${full(l.value)} (${pct(l.value, st.value[l.s])} of ${s})`;
}

export function footnote(g: Graph): string {
	const { value, loop, end } = g.dropped;
	const n = value + loop + end;
	const why = [value && `${value} without a value`, loop && `${loop} looping back`, end && `${end} missing an end`].filter(Boolean);
	return [
		n ? `${n} ${n === 1 ? 'flow' : 'flows'} not drawn: ${why.join(', ')}` : '',
		g.unlinked.length ? `Not linked: ${g.unlinked.join(', ')}` : ''
	]
		.filter(Boolean)
		.join(' · ');
}

/** Max plot height: a number or numeric string, clamped to 160-720; else 320. */
export function parseHeight(v: unknown): number {
	const n = typeof v === 'string' ? finite(v.replace(/px$/i, '')) : finite(v);
	return n === undefined ? 320 : Math.min(720, Math.max(160, n));
}
export function parseCurve(v: unknown): number {
	const n = finite(v);
	return n === undefined ? 0.5 : Math.min(1, Math.max(0, n));
}

export type Rect = { x: number; y: number; w: number; h: number };
export type LNode = Rect & { i: number };
export type LLink = { k: number; s: number; t: number; d: string };
export type LStub = { i: number; d: string; box: Rect };
export type Label = Rect & {
	key: string;
	kind: 'node' | 'stub';
	i: number;
	lines: 0 | 1 | 2;
	align: 'start' | 'end';
	text: string;
	/** The figure as drawn: `85 · 71%`, or the value alone where the percent has no room. */
	fig: string;
	/** A leader from the anchor (bar or stub) to a chip placed away from it: x1, y1, x2, y2. */
	lead?: [number, number, number, number];
	/** Wide: the column gap the chip sits in, and whether its anchor is on the gap's left. */
	side?: { gap: number; right: boolean };
};
export type Layout = { vertical: boolean; W: number; H: number; nodes: LNode[]; links: LLink[]; stubs: LStub[]; labels: Label[] };
export type Measure = (text: string, bold?: boolean) => number;
/** Text width at the callout size before (or without) a real measure: SSR and jsdom. */
export const guess: Measure = (t, bold) => t.length * (bold ? 6.9 : 6.5);

/** Node label lines: name over figure (start nodes: the figure alone). */
export function nodeFigure(st: Stats, i: number): string {
	const v = st.value[i];
	return st.inn[i] === 0 ? fmt(v) : `${fmt(v)} · ${pct(v, st.total)}`;
}

export function layout(
	g: Graph,
	st: Stats,
	o: { width: number; maxH: number; vertical: boolean; curve: number; measure?: Measure }
): Layout {
	const W = Math.max(1, o.width);
	const m = o.measure ?? guess;
	const n = g.nodes.length;
	const vertical = o.vertical;
	if (!n) return { vertical, W, H: 0, nodes: [], links: [], stubs: [], labels: [] };

	// Ranks: longest path from a start node (what sankeyLeft places by).
	const depth = g.nodes.map(() => 0);
	for (let pass = 0, moved = true; moved && pass < n; pass++) {
		moved = false;
		for (const l of g.links) if (depth[l.t] < depth[l.s] + 1) ((depth[l.t] = depth[l.s] + 1), (moved = true));
	}
	const R = Math.max(...depth) + 1;
	const densest = Math.max(...Array.from({ length: R }, (_, r) => depth.filter((d) => d === r).length));
	let H: number;
	let span: number;
	let cross: number;
	if (vertical) {
		const pitch = (R - 1) * PITCH + ROW_TAIL > o.maxH ? Math.max(PITCH_MIN, (o.maxH - ROW_TAIL) / (R - 1)) : PITCH;
		H = (R - 1) * pitch + ROW_TAIL;
		span = (R - 1) * pitch + BAR;
		cross = W;
	} else {
		H = Math.max(MIN_PLOT, densest * PER_NODE);
		span = W;
		cross = H;
	}
	const thick = vertical ? BAR : NODE_W;
	const res = sankey()
		.nodeAlign(sankeyLeft)
		.nodeWidth(thick)
		.nodePadding(vertical ? 14 : 20)
		.extent([
			[0, 0],
			[span, cross]
		])({ nodes: g.nodes.map(() => ({})), links: g.links.map((l) => ({ source: l.s, target: l.t, value: l.value })) });

	// Flow coordinates (u along, v across) to screen.
	const P = (u: number, v: number) => (vertical ? `${r2(v)},${r2(u)}` : `${r2(u)},${r2(v)}`);
	const box = (u0: number, u1: number, v0: number, v1: number): Rect =>
		vertical ? { x: v0, y: u0, w: v1 - v0, h: u1 - u0 } : { x: u0, y: v0, w: u1 - u0, h: v1 - v0 };

	const nodes: LNode[] = res.nodes.map((d, i) => {
		const mid = (d.y0 + d.y1) / 2;
		const h = Math.max(vertical ? MIN_BAR : 2, d.y1 - d.y0);
		const c = Math.min(cross - h / 2, Math.max(h / 2, mid));
		return { i, ...box(d.x0, d.x1, c - h / 2, c + h / 2) };
	});
	const links: LLink[] = res.links.map((l, k) => {
		const u0 = l.source.x1;
		const u1 = l.target.x0;
		const h = Math.max(1, l.width) / 2;
		const c = o.curve * (u1 - u0);
		const [a, b] = [l.y0, l.y1];
		return {
			k,
			s: l.source.index,
			t: l.target.index,
			d: `M${P(u0, a - h)}C${P(u0 + c, a - h)} ${P(u1 - c, b - h)} ${P(u1, b - h)}L${P(u1, b + h)}C${P(u1 - c, b + h)} ${P(u0 + c, a + h)} ${P(u0, a + h)}Z`
		};
	});
	const stubLen = vertical ? STUB.v : STUB.h;
	const stubs: LStub[] = res.nodes.flatMap((d, i) => {
		if (!st.rem[i]) return [];
		const ky = (d.y1 - d.y0) / st.value[i];
		const top = d.y0 + st.out[i] * ky;
		const bot = d.y1;
		const mid = (top + bot) / 2;
		const t = (bot - top) / 6;
		const e = d.x1 + stubLen;
		return [{ i, d: `M${P(d.x1, top)}L${P(e, mid - t)}L${P(e, mid + t)}L${P(d.x1, bot)}Z`, box: box(d.x1, e, top, bot) }];
	});

	// Labels, most important first, then the remainder chips. Obstacles: every
	// bar and placed chip (wide, the stubs too; narrow, a chip may cover the stub
	// under its own bar). Wide, one column gap holds chips from one side only
	// where they would share a band of height, so a chip always reads as its own
	// bar's. Narrow, a chip stays in its bar's slot of the row (between the
	// neighbouring bars), else sits in the band run with a leader to its bar.
	const protect = (i: number) => st.inn[i] === 0 || i === st.largestEnd || st.value[i] > 0.15 * st.total;
	const placed: Rect[] = [...nodes.map(({ x, y, w, h }) => ({ x, y, w, h })), ...(vertical ? [] : stubs.map((s) => s.box))];
	const clear = (r: Rect, among: Rect[]) =>
		among.every((p) => r.x + r.w <= p.x - 2 || p.x + p.w <= r.x - 2 || r.y + r.h <= p.y - 2 || p.y + p.h <= r.y - 2);
	const free = (r: Rect) => r.y >= 0 && r.y + r.h <= H && r.x >= -0.5 && r.x + r.w <= W + 0.5 && clear(r, placed);
	const rankEdge = (d: number, side: 'x0' | 'x1') => res.nodes.find((q) => q.depth === d)?.[side];
	const labels: Label[] = [];
	const rectOf = new Map<Label, Rect>();
	const sideOf = new Map<Label, { gap: number; right: boolean }>();
	// Wide: a chip never stacks over or under one from the other side of its gap
	// (x ranges overlapping, y ranges within `gapY`); side by side is fine. A
	// remainder chip, tied to its grey stub, only needs to keep clear.
	const owned = (r: Rect, gap: number, right: boolean, gapY = SIDE_GAP) => {
		for (const [lb, s] of sideOf)
			if (
				lb.lines &&
				s.gap === gap &&
				s.right !== right &&
				r.x < lb.x + lb.w + 8 &&
				lb.x < r.x + r.w + 8 &&
				r.y < lb.y + lb.h + gapY &&
				lb.y < r.y + r.h + gapY
			)
				return false;
		return true;
	};
	// Wide: the gap a chip's centre sits in, and whether its anchor is on the gap's left.
	const sideAt = (r: Rect, ax: number) => {
		const cx = r.x + r.w / 2;
		const gap = res.nodes.reduce((k, q) => Math.max(k, q.x0 <= cx ? q.depth : 0), 0);
		return { gap, right: ax <= cx };
	};
	const put = (label: Label, r: Rect, patch: Partial<Label>, side?: { gap: number; right: boolean }) => {
		Object.assign(label, r, patch);
		placed.push(r);
		rectOf.set(label, r);
		if (side) {
			sideOf.set(label, side);
			label.side = side;
		}
	};
	const order = [...g.nodes.keys()].toSorted((a, b) => Number(protect(b)) - Number(protect(a)) || st.value[b] - st.value[a] || a - b);
	const nudges = (reach: number) => {
		const out = [0];
		for (let k = 4; k <= reach; k += 4) out.push(-k, k);
		return out;
	};
	const leadTo = (ax: number, ay: number, r: Rect): [number, number, number, number] => {
		const [px, py] = near(ax, ay, r);
		return [r2(ax), r2(ay), r2(px), r2(py)];
	};
	// Wide fallback: chip spots within REACH of a bar edge on that edge's side, nearest first.
	const around = (ax: number, ay: number, w: number, h: number, right: boolean, reach = REACH) => {
		const out: [number, Rect, number][] = [];
		const [lo, hi] = right ? [ax + 2, W - w] : [0, ax - 2 - w];
		for (let x = Math.max(lo, ax - reach - w); x <= Math.min(hi, ax + reach); x += 4)
			for (let y = Math.max(0, ay - reach - h); y <= Math.min(H - h, ay + reach); y += 4) {
				const r = { x, y, w, h };
				const [px, py] = near(ax, ay, r);
				const dd = Math.hypot(px - ax, py - ay);
				if (dd <= reach) out.push([dd, r, ax]);
			}
		return out;
	};
	// A leader that runs under no other chip (sampled every 3px).
	const unblocked = (lead: Label['lead']) => {
		if (!lead) return true;
		const [x1, y1, x2, y2] = lead;
		const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 3);
		for (let k = 1; k < steps; k++) {
			const [x, y] = [x1 + ((x2 - x1) * k) / steps, y1 + ((y2 - y1) * k) / steps];
			if (labels.some((lb) => lb.lines && x > lb.x + 1 && x < lb.x + lb.w - 1 && y > lb.y + 1 && y < lb.y + lb.h - 1)) return false;
		}
		return true;
	};
	const rows = new Map<number, LNode[]>();
	for (const q of nodes) rows.set(depth[q.i], [...(rows.get(depth[q.i]) ?? []), q]);
	for (const [k, row] of rows) rows.set(k, row.toSorted((a, b) => a.x - b.x));

	// A bar's slot of its row: from the previous bar's end to the next bar's start.
	const slot = (own: LNode) => {
		const row = rows.get(depth[own.i])!;
		const k = row.indexOf(own);
		return [k > 0 ? row[k - 1].x + row[k - 1].w + 6 : 0, k < row.length - 1 ? row[k + 1].x - 6 : W];
	};
	// Narrow fallback: one-line chip spots in a row's band run, nearest an anchor
	// first. In the row's label band (first H2 under the bars) a chip must reach
	// into its own bar's slot and never span a whole other bar, or it would read
	// as that neighbour's.
	const runSpots = (own: LNode, ax: number, ay: number, w: number, ys: number[]) => {
		const [lo, hi] = slot(own);
		const row = rows.get(depth[own.i])!;
		const band = own.y + own.h + 4 + H2;
		const out: [number, Rect][] = [];
		for (const y of ys)
			for (const x of sweep(ax, 0, W - w)) {
				const r = { x, y, w, h: H1 };
				if (y < band && (r.x >= hi || r.x + r.w <= lo || row.some((q) => q !== own && r.x <= q.x && q.x + q.w <= r.x + r.w))) continue;
				const [px, py] = near(ax, ay, r);
				out.push([Math.hypot(px - ax, py - ay), r]);
			}
		return out.toSorted((p, q) => p[0] - q[0]);
	};
	type Entry = { label: Label; mid: number; edge: number; toRight: boolean; gap: number; avail: number; w1: number };
	const cols = new Map<string, Entry[]>();
	// A protected wide label with no room near its node: restack its column top to
	// bottom in node order (one line for the newcomer), if that clears everything else.
	const restack = (col: Entry[], add: Entry) => {
		const members = [...col.filter((e) => e.label.lines), add].toSorted((a, b) => a.mid - b.mid);
		const own = new Set(members.map((e) => rectOf.get(e.label)));
		const others = placed.filter((p) => !own.has(p));
		const hs = members.map((e) => (e === add ? H1 : e.label.h));
		const ys = members.map((e, k) => e.mid - hs[k] / 2);
		for (let k = 0; k < ys.length; k++) ys[k] = Math.max(ys[k], k ? ys[k - 1] + hs[k - 1] + 4 : 0);
		for (let k = ys.length - 1; k >= 0; k--) ys[k] = Math.min(ys[k], k < ys.length - 1 ? ys[k + 1] - 4 - hs[k] : H - hs[k]);
		const rects = members.map((e, k) => {
			const w = e === add ? Math.min(e.w1, e.avail) : e.label.w;
			return { x: e.toRight ? e.edge : e.edge - w, y: ys[k], w, h: hs[k] };
		});
		if (ys[0] < 0 || !rects.every((r) => clear(r, others) && owned(r, add.gap, add.toRight))) return;
		placed.splice(0, placed.length, ...others, ...rects);
		members.forEach((e, k) => {
			Object.assign(e.label, rects[k], e === add ? { lines: 1, align: e.toRight ? 'start' : 'end' } : {});
			rectOf.set(e.label, rects[k]);
			sideOf.set(e.label, { gap: e.gap, right: e.toRight });
			e.label.side = { gap: e.gap, right: e.toRight };
		});
	};
	const seen = new Set<number>();
	for (const i of order) {
		seen.add(i);
		const d = res.nodes[i];
		const name = g.nodes[i].name;
		const fig = nodeFigure(st, i);
		const val = fmt(st.value[i]);
		// Two lines (full figure, then the value alone), then one line (the same two figures).
		const forms = [
			{ lines: 2, fig, w: Math.max(m(name, true), m(fig)) + 2 * PAD_X, min: m(fig) + 2 * PAD_X, h: H2 },
			{ lines: 2, fig: val, w: Math.max(m(name, true), m(val)) + 2 * PAD_X, min: m(val) + 2 * PAD_X, h: H2 },
			{ lines: 1, fig, w: m(name, true) + 4 + m(fig) + 2 * PAD_X, min: m(fig) + 2 * PAD_X + 24, h: H1 },
			{ lines: 1, fig: val, w: m(name, true) + 4 + m(val) + 2 * PAD_X, min: m(val) + 2 * PAD_X + 24, h: H1 }
		] as const;
		const w1 = forms[3].w;
		const label: Label = { key: `n${i}`, kind: 'node', i, x: 0, y: 0, w: 0, h: 0, lines: 0, align: 'start', text: name, fig: val };
		labels.push(label);
		if (vertical) {
			// Under the bar, inside its slot of the row; a short slot lets the chip run
			// left of the bar. One-line chips may take a second tier in the slot.
			const nb = nodes[i];
			const [lo, hi] = slot(nb);
			const y0 = nb.y + nb.h + 4;
			// One-line tiers: under the bar, under a one-line chip, under a two-line chip, under two one-line chips.
			const tiers = [y0, y0 + H1 + 2, y0 + H2 + 2, y0 + 2 * (H1 + 2)];
			near: for (const f of forms) {
				const w = Math.min(f.w, hi - lo);
				if (w < Math.max(MIN_LABEL, f.min)) continue;
				const x = Math.max(lo, Math.min(nb.x, hi - w));
				for (const y of f.lines === 2 ? [y0] : tiers) {
					const r = { x, y, w, h: f.h };
					if (free(r)) {
						put(label, r, { lines: f.lines, fig: f.fig, align: x < nb.x - 0.5 ? 'end' : 'start' });
						break near;
					}
				}
			}
			if (label.lines) continue;
			// Else one line anywhere in the row's band run, nearest the bar, with a
			// leader; a protected label then shortens its name (ellipsis) to fit.
			const widths: [number, string][] = [
				[forms[2].w, fig],
				[forms[3].w, val]
			];
			if (protect(i)) for (let w = forms[3].w - 8; w >= forms[3].min; w -= 8) widths.push([w, val]);
			const [ax, ay] = [nb.x + nb.w / 2, nb.y + nb.h];
			// A leader may cross another chip only for a protected label, as a last resort.
			far: for (const strict of protect(i) ? [true, false] : [true])
				for (const [wf, ff] of widths)
					for (const [dd, r] of runSpots(nb, ax, ay, Math.min(wf, W), tiers)) {
						const over = r.x < nb.x + nb.w && nb.x < r.x + r.w;
						const lead = (over && r.y === y0) || dd < 6 ? undefined : leadTo(ax, ay, r);
						if (free(r) && (!strict || unblocked(lead))) {
							put(label, r, { lines: 1, fig: ff, align: 'start', lead });
							break far;
						}
					}
			continue;
		}
		const pref = (d.x0 + d.x1) / 2 < W / 2;
		const mid = (d.y0 + d.y1) / 2;
		const reach = (d.y1 - d.y0) / 2 + 10;
		// The preferred side first (left half: right of the bar), then the other side.
		const sides = [pref, !pref].flatMap((toRight) => {
			const avail = toRight ? (rankEdge(d.depth + 1, 'x0') ?? W) - d.x1 - 12 : d.x0 - (rankEdge(d.depth - 1, 'x1') ?? 0) - 12;
			if (avail < MIN_LABEL) return [];
			const entry: Entry = { label, mid, edge: toRight ? d.x1 + 6 : d.x0 - 6, toRight, gap: toRight ? d.depth : d.depth - 1, avail, w1 };
			if (toRight === pref) {
				const key = `${d.depth}${toRight}`;
				cols.set(key, [...(cols.get(key) ?? []), entry]);
			}
			return [entry];
		});
		// The other side's gap is a neighbour rank's home when that rank labels into
		// it; while a protected label there is still to come, leave the gap to it.
		const home = (e: Entry) =>
			res.nodes.some(
				(q) =>
					q.depth === (e.toRight ? d.depth + 1 : d.depth - 1) &&
					(q.x0 + q.x1) / 2 < W / 2 !== e.toRight &&
					protect(q.index) &&
					!seen.has(q.index)
			);
		// Each form on the preferred side, then the other side, before collapsing
		// further; the other side's home gap only once collapsing has failed.
		wide: for (const yieldHome of [true, false])
			for (const f of forms)
				for (const entry of sides) {
					const { toRight, avail } = entry;
					if (toRight !== pref && yieldHome && home(entry)) continue;
					const w = Math.min(f.w, avail);
					if (w < f.min) continue;
					const c0 = Math.min(H - f.h / 2, Math.max(f.h / 2, mid));
					for (const dy of nudges(reach)) {
						const r = { x: toRight ? entry.edge : entry.edge - w, y: c0 + dy - f.h / 2, w, h: f.h };
						if (free(r) && owned(r, entry.gap, toRight)) {
							put(label, r, { lines: f.lines, fig: f.fig, align: toRight ? 'start' : 'end' }, { gap: entry.gap, right: toRight });
							break wide;
						}
					}
				}
		const col = cols.get(`${d.depth}${pref}`);
		const entry = col?.at(-1);
		if (!label.lines && protect(i) && col && entry?.label === label) restack(col.slice(0, -1), entry);
		// Else one line in clear space beside the bar, with a leader back to it.
		far: for (const strict of label.lines ? [] : protect(i) ? [true, false] : [true])
			for (const f of forms.slice(2))
				for (const [, r, ax] of nearest(around(d.x1, mid, f.w, H1, true), around(d.x0, mid, f.w, H1, false))) {
					const side = sideAt(r, ax);
					const lead = leadTo(ax, mid, r);
					// Last resort for a protected label: any clear spot with a leader.
					if (free(r) && (!strict || (owned(r, side.gap, side.right) && unblocked(lead)))) {
						put(label, r, { lines: 1, fig: f.fig, align: 'start', lead }, side);
						break far;
					}
				}
	}

	// Wide: two node chips from opposite sides of one gap, stacked within a chip's
	// height (the one gap R ranks must share), each get a tick to their own bar.
	const tick = (lb: Label) => {
		if (lb.lead || !lb.side) return;
		const d = res.nodes[lb.i];
		const ax = lb.side.right ? d.x1 : d.x0;
		const ay = Math.min(d.y1, Math.max(d.y0, lb.y + lb.h / 2));
		lb.lead = [r2(ax), r2(ay), r2(lb.side.right ? lb.x : lb.x + lb.w), r2(Math.min(lb.y + lb.h, Math.max(lb.y, ay)))];
	};
	const sided = labels.filter((lb) => lb.lines && lb.side);
	for (const a of sided)
		for (const b of sided)
			if (
				a !== b &&
				a.side!.gap === b.side!.gap &&
				a.side!.right &&
				!b.side!.right &&
				a.x < b.x + b.w + 8 &&
				b.x < a.x + a.w + 8 &&
				a.y < b.y + b.h + H2 &&
				b.y < a.y + a.h + H2
			) {
				tick(a);
				tick(b);
			}

	// Remainder figures, after every node label. Wide always keeps the word.
	for (const s of stubs) {
		const f = fmt(st.rem[s.i]);
		// The bare figure only in a narrow card's crowded row.
		const texts = W < WIDE_MIN ? [`${f} stop`, f] : vertical ? [`${f} stop`] : [`${f} stop here`, `${f} stop`];
		const label: Label = { key: `s${s.i}`, kind: 'stub', i: s.i, x: 0, y: 0, w: 0, h: H1, lines: 0, align: 'start', text: '', fig: f };
		labels.push(label);
		const b = s.box;
		const d = res.nodes[s.i];
		const room = vertical ? W : (rankEdge(d.depth + 1, 'x0') ?? W) - 6;
		const tryAt = (r: Rect, text: string, align: 'start' | 'end', lead?: Label['lead']) => {
			const at = vertical ? undefined : lead ? sideAt(r, b.x + b.w) : { gap: d.depth, right: true };
			if (!free(r) || (!lead && r.x + r.w > room + 0.5) || (at && !owned(r, at.gap, at.right, 8))) return false;
			put(label, r, { lines: 1, align, text, lead }, at);
			return true;
		};
		// Near: beside the stub, else just below (or, wide, above) it.
		const spots = (text: string, w: number): [Rect, 'start' | 'end'][] =>
			vertical
				? [
						[{ x: b.x + b.w + 4, y: b.y + 2, w, h: H1 }, 'start'],
						[{ x: Math.max(0, b.x + b.w - w), y: b.y + b.h + 2, w, h: H1 }, 'end'],
						[{ x: Math.min(b.x, W - w), y: b.y + b.h + 2, w, h: H1 }, 'start']
					]
				: [
						...nudges(b.h / 2 + 12).map((dy): [Rect, 'start'] => [
							{ x: b.x + b.w + 4, y: Math.min(H - H1, Math.max(0, b.y + b.h / 2 - H1 / 2 + dy)), w, h: H1 },
							'start'
						]),
						[{ x: b.x + 4, y: b.y + b.h + 2, w, h: H1 }, 'start'],
						[{ x: b.x + 4, y: b.y - H1 - 2, w, h: H1 }, 'start']
					];
		const done = texts.some((text) => spots(text, m(text) + 2 * PAD_X).some(([r, align]) => tryAt(r, text, align)));
		if (done) continue;
		// Far: clear space in the band run (narrow) or beside the bar (wide), with a
		// leader to the stub that crosses no chip; only then one that does, further out.
		far: for (const strict of [true, false])
			for (const text of texts) {
				const w = m(text) + 2 * PAD_X;
				const [ax, ay] = vertical ? [b.x + b.w / 2, b.y + b.h] : [b.x + b.w, b.y + b.h / 2];
				const cands = vertical
					? runSpots(nodes[s.i], ax, ay, w, [0, 1, 2, 3].map((t) => b.y + 2 + t * (H1 + 2)))
					: nearest(around(b.x, ay, w, H1, true, strict ? REACH : 3 * REACH));
				for (const [, r] of cands) {
					const lead = leadTo(ax, ay, r);
					if ((!strict || unblocked(lead)) && tryAt(r, text, 'start', lead)) break far;
				}
			}
	}

	// One figure format per card (narrow: per row): when a two-line label had to
	// drop its percent, every label drops it. A collapsed one-line chip doesn't count.
	const ranks = new Map<number, Label[]>();
	for (const lb of labels) {
		const k = vertical ? depth[lb.i] : 0;
		if (lb.kind === 'node' && lb.lines && st.inn[lb.i]) ranks.set(k, [...(ranks.get(k) ?? []), lb]);
	}
	for (const group of ranks.values()) {
		if (!group.some((lb) => lb.lines === 2 && lb.fig !== nodeFigure(st, lb.i))) continue;
		for (const lb of group) {
			if (lb.fig !== nodeFigure(st, lb.i)) continue;
			const val = fmt(st.value[lb.i]);
			const name = g.nodes[lb.i].name;
			const w = Math.min(lb.w, (lb.lines === 2 ? Math.max(m(name, true), m(val)) : m(name, true) + 4 + m(val)) + 2 * PAD_X);
			if (lb.lead) lb.lead[2] = Math.min(lb.x + (lb.align === 'end' ? lb.w - w : 0) + w - 3, lb.lead[2]);
			if (lb.align === 'end') lb.x += lb.w - w;
			lb.w = w;
			lb.fig = val;
		}
	}
	return { vertical, W, H, nodes, links, stubs, labels };
}

const r2 = (v: number) => Math.round(v * 100) / 100;
/** x positions from lo to hi in 4px steps, nearest `at` first. */
function sweep(at: number, lo: number, hi: number): number[] {
	const out: number[] = [];
	for (let x = lo; x <= hi + 0.01; x += 4) out.push(x);
	if (hi > lo) out.push(hi);
	return out.toSorted((a, b) => Math.abs(a - at) - Math.abs(b - at));
}
/** The point of a chip nearest an anchor (3px in from its ends). */
const near = (ax: number, ay: number, r: Rect) => [Math.min(r.x + r.w - 3, Math.max(r.x + 3, ax)), Math.min(r.y + r.h, Math.max(r.y, ay))];
const nearest = (...sets: [number, Rect, number][][]) => sets.flat().toSorted((a, b) => a[0] - b[0]);
