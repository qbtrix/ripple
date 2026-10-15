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
// 2px. Labels are placed greedily, most important first (start nodes, the
// largest end, anything over 15% of the total), each in clear space or on a
// chip: name over `figure · percent`, else over the figure alone, else one
// line (wide: nudged near its node, a protected one restacks its column;
// narrow: a second tier under the row), else hidden (its node stays focusable).
import { sankey, sankeyLeft } from 'd3-sankey';
import { finite, num, plain } from '../data-kit/format.js';

/** Band tint in % of the accent over the card: rest, by theme; focused; dimmed factor. */
export const BAND = { light: 30, dark: 32 } as const;
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
		const h = Math.max(2, d.y1 - d.y0);
		return { i, ...box(d.x0, d.x1, mid - h / 2, mid + h / 2) };
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

	// Labels, most important first. Obstacles: wide, the stubs; narrow, the bars
	// (a stub runs down under its bar, where labels sit on chips anyway).
	const protect = (i: number) => st.inn[i] === 0 || i === st.largestEnd || st.value[i] > 0.15 * st.total;
	const placed: Rect[] = vertical ? nodes.map(({ x, y, w, h }) => ({ x, y, w, h })) : stubs.map((s) => s.box);
	const clear = (r: Rect, among: Rect[]) =>
		among.every((p) => r.x + r.w <= p.x - 2 || p.x + p.w <= r.x - 2 || r.y + r.h <= p.y - 2 || p.y + p.h <= r.y - 2);
	const free = (r: Rect) => r.y >= 0 && r.y + r.h <= H && r.x >= 0 && r.x + r.w <= W + 0.5 && clear(r, placed);
	const rankEdge = (d: number, side: 'x0' | 'x1') => res.nodes.find((q) => q.depth === d)?.[side];
	const labels: Label[] = [];
	const rectOf = new Map<Label, Rect>();
	const order = [...g.nodes.keys()].toSorted((a, b) => Number(protect(b)) - Number(protect(a)) || st.value[b] - st.value[a] || a - b);
	const nudges = (reach: number) => {
		const out = [0];
		for (let k = 4; k <= reach; k += 4) out.push(-k, k);
		return out;
	};
	type Entry = { label: Label; mid: number; edge: number; toRight: boolean; avail: number; w1: number };
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
		if (ys[0] < 0 || !rects.every((r) => clear(r, others))) return;
		placed.splice(0, placed.length, ...others, ...rects);
		members.forEach((e, k) => {
			Object.assign(e.label, rects[k], e === add ? { lines: 1, align: e.toRight ? 'start' : 'end' } : {});
			rectOf.set(e.label, rects[k]);
		});
	};
	for (const i of order) {
		const d = res.nodes[i];
		const name = g.nodes[i].name;
		const fig = nodeFigure(st, i);
		const val = fmt(st.value[i]);
		// Two lines with the full figure, two with the value alone, one line (name and value).
		const forms = [
			{ lines: 2, fig, w: Math.max(m(name, true), m(fig)) + 2 * PAD_X, min: m(fig) + 2 * PAD_X, h: H2 },
			{ lines: 2, fig: val, w: Math.max(m(name, true), m(val)) + 2 * PAD_X, min: m(val) + 2 * PAD_X, h: H2 },
			{ lines: 1, fig: val, w: m(name, true) + 4 + m(val) + 2 * PAD_X, min: m(val) + 2 * PAD_X + 24, h: H1 }
		] as const;
		const w1 = forms[2].w;
		const label: Label = { key: `n${i}`, kind: 'node', i, x: 0, y: 0, w: 0, h: 0, lines: 0, align: 'start', text: name, fig: val };
		labels.push(label);
		const take = (r: Rect, form: (typeof forms)[number], align: 'start' | 'end') => {
			Object.assign(label, r, { lines: form.lines, fig: form.fig, align });
			placed.push(r);
			rectOf.set(label, r);
		};
		if (vertical) {
			// Under the bar up to the next bar in the row; else one line on a second tier when the pitch has room.
			const nb = nodes[i];
			const right = Math.min(W, ...nodes.filter((q) => depth[q.i] === depth[i] && q.x > nb.x).map((q) => q.x - 6));
			const room = right - nb.x;
			for (const f of forms.slice(0, 2)) {
				const r = { x: nb.x, y: nb.y + nb.h + 4, w: Math.min(f.w, room), h: H2 };
				if (r.w >= Math.max(MIN_LABEL, f.min) && free(r)) {
					take(r, f, 'start');
					break;
				}
			}
			const w = Math.min(w1, W);
			const low = { x: Math.max(0, Math.min(nb.x, W - w)), y: nb.y + nb.h + 6 + H2, w, h: H1 };
			if (!label.lines && free(low)) take(low, forms[2], 'start');
			continue;
		}
		const toRight = (d.x0 + d.x1) / 2 < W / 2;
		const avail = toRight ? (rankEdge(d.depth + 1, 'x0') ?? W) - d.x1 - 12 : d.x0 - (rankEdge(d.depth - 1, 'x1') ?? 0) - 12;
		if (avail < MIN_LABEL) continue;
		const mid = (d.y0 + d.y1) / 2;
		const entry: Entry = { label, mid, edge: toRight ? d.x1 + 6 : d.x0 - 6, toRight, avail, w1 };
		const key = `${d.depth}${toRight}`;
		const col = cols.get(key) ?? [];
		cols.set(key, [...col, entry]);
		const reach = (d.y1 - d.y0) / 2 + 10;
		place: for (const f of forms) {
			const w = Math.min(f.w, avail);
			if (w < f.min) continue;
			const c0 = Math.min(H - f.h / 2, Math.max(f.h / 2, mid));
			for (const dy of nudges(reach)) {
				const r = { x: toRight ? entry.edge : entry.edge - w, y: c0 + dy - f.h / 2, w, h: f.h };
				if (free(r)) {
					take(r, f, toRight ? 'start' : 'end');
					break place;
				}
			}
		}
		if (!label.lines && protect(i)) restack(col, entry);
	}

	// Remainder figures, after every node label.
	for (const s of stubs) {
		const f = fmt(st.rem[s.i]);
		const texts = vertical ? [`${f} stop`, f] : [`${f} stop here`, `${f} stop`, f];
		const label: Label = { key: `s${s.i}`, kind: 'stub', i: s.i, x: 0, y: 0, w: 0, h: H1, lines: 0, align: 'start', text: '', fig: f };
		labels.push(label);
		const b = s.box;
		const room = vertical ? W : (rankEdge(res.nodes[s.i].depth + 1, 'x0') ?? W) - 6;
		find: for (const text of texts) {
			const w = m(text) + 2 * PAD_X;
			const spots: [Rect, 'start' | 'end'][] = vertical
				? [
						[{ x: b.x + b.w + 4, y: b.y + 2, w, h: H1 }, 'start'],
						[{ x: b.x + b.w - w, y: b.y + b.h + 2, w, h: H1 }, 'end']
					]
				: nudges(b.h / 2 + 8).map((dy) => [{ x: b.x + b.w + 4, y: b.y + b.h / 2 - H1 / 2 + dy, w, h: H1 }, 'start']);
			for (const [r, align] of spots) {
				if (r.x + r.w > room || !free(r)) continue;
				Object.assign(label, r, { lines: 1, align, text });
				placed.push(r);
				break find;
			}
		}
	}
	return { vertical, W, H, nodes, links, stubs, labels };
}

const r2 = (v: number) => Math.round(v * 100) / 100;
