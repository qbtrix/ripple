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
// 2px (narrow bars at 6px long).
//
// labels: name over `value · percent` (one unit: whole or left to the
// readout; never the value without its percent), else name over value over
// percent, else one line; a name keeps at least 6 characters, its ellipsis
// included. Wide: every label sits just before its own bar, right-aligned, so
// a column gap holds one rank's labels (rank 0 gets a gutter sized to its
// labels). A rank packs its labels by node centre; a label pushed off its
// bar's middle first collapses the smallest multi-line label near it to one
// line (figure kept), then hides the smallest unprotected one (protected:
// starts, the largest end, over 15% of the total). Narrow: under its own bar,
// from the bar's left edge, inside its slot of the row (never under another
// bar); else hidden, the node still focusable. Remainder figures (`35 stop
// here`, narrow `35 stop`) sit at the stub's free end or just under or over it
// (narrow: after the name, on its line), only beside a shown name and never on
// a leader; else the readout carries them.
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
/** Wide label spacing: to its own bar, and to the bars of the rank before. */
const NEAR = 3;
const FAR = 6;
const GAP = 2;
const NAME_MIN = 6;
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
	/** 0 hidden, 1 one line, 2 name over figure, 3 name over value over percent. */
	lines: 0 | 1 | 2 | 3;
	align: 'start' | 'end';
	text: string;
	/** The figure as drawn, always whole (`85 · 71%`), or '' when it is left to the readout. */
	fig: string;
};
export type Layout = { vertical: boolean; W: number; H: number; nodes: LNode[]; links: LLink[]; stubs: LStub[]; labels: Label[] };
export type Measure = (text: string, bold?: boolean) => number;
/** Text width at the callout size before (or without) a real measure: SSR and jsdom. */
export const guess: Measure = (t, bold) => t.length * (bold ? 6.9 : 6.5);

/** Node label figure: `value · percent of the start total` (start nodes: the value alone). */
export function nodeFigure(st: Stats, i: number): string {
	const v = st.value[i];
	return st.inn[i] === 0 ? fmt(v) : `${fmt(v)} · ${pct(v, st.total)}`;
}

type Kind = 'two' | 'three' | 'one' | 'name' | 'short';
type Form = { lines: 1 | 2 | 3; h: number; w: number; fig: string };

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

	// A node label in one form at a width, or null when it does not fit. The
	// figure is one unit: whole or not at all. The name keeps NAME_MIN characters
	// (the ellipsis is one of them).
	const form = (i: number, kind: Kind, avail: number): Form | null => {
		const name = g.nodes[i].name;
		const fig = nodeFigure(st, i);
		const [v, p] = fig.split(' · ');
		const nm = m(name, true);
		const least = name.length > NAME_MIN ? m(`${name.slice(0, NAME_MIN - 1)}…`, true) : nm;
		const f = (lines: Form['lines'], need: number, w: number, keep = true): Form | null => {
			need = Math.max(MIN_LABEL, need + 2 * PAD_X);
			return avail < need ? null : { lines, h: lines * LINE + 2 * PAD_Y, w: Math.min(w + 2 * PAD_X, avail), fig: keep ? fig : '' };
		};
		if (kind === 'two') return f(2, Math.max(least, m(fig)), Math.max(nm, m(fig)));
		if (kind === 'three') return p ? f(3, Math.max(least, m(v), m(p)), Math.max(nm, m(v), m(p))) : null;
		if (kind === 'one') return f(1, least + 4 + m(fig), nm + 4 + m(fig));
		// A protected label, wide, would rather lose name than vanish.
		return f(1, kind === 'name' ? least : 0, nm, false);
	};

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
	// Wide: every label sits before its own bar, so the first rank's labels get a
	// gutter sized to them, capped at an even share of the width.
	let gutter = 0;
	if (vertical) {
		const pitch = (R - 1) * PITCH + ROW_TAIL > o.maxH ? Math.max(PITCH_MIN, (o.maxH - ROW_TAIL) / (R - 1)) : PITCH;
		H = (R - 1) * pitch + ROW_TAIL;
		span = (R - 1) * pitch + BAR;
		cross = W;
	} else {
		H = Math.max(MIN_PLOT, densest * PER_NODE);
		span = W;
		cross = H;
		const need = Math.max(MIN_LABEL, ...g.nodes.flatMap((_, i) => (depth[i] ? [] : [form(i, 'two', Infinity)?.w ?? 0])));
		gutter = Math.max(0, Math.min((W - R * NODE_W) / R, need)) + NEAR;
	}
	const thick = vertical ? BAR : NODE_W;
	const res = sankey()
		.nodeAlign(sankeyLeft)
		.nodeWidth(thick)
		.nodePadding(vertical ? 14 : 20)
		.extent([
			[gutter, 0],
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

	const protect = (i: number) => st.inn[i] === 0 || i === st.largestEnd || st.value[i] > 0.15 * st.total;
	const labels: Label[] = g.nodes.map((nd, i) => ({ key: `n${i}`, kind: 'node', i, x: 0, y: 0, w: 0, h: 0, lines: 0, align: 'start', text: nd.name, fig: '' }));
	const tips: Label[] = [];
	const put = (lb: Label, r: Rect, f: { lines: Label['lines']; fig: string }, align: Label['align']) => Object.assign(lb, r, f, { align });
	const shown = () => [...labels, ...tips].filter((l) => l.lines);
	const clear = (r: Rect, among: Rect[]) =>
		among.every((p) => r.x + r.w <= p.x - 2 || p.x + p.w <= r.x - 2 || r.y + r.h <= p.y - 2 || p.y + p.h <= r.y - 2);
	const edge = (d: number, side: 'x0' | 'x1') => res.nodes.find((q) => q.depth === d)?.[side];
	const stubLabel = (i: number): Label => {
		const lb: Label = { key: `s${i}`, kind: 'stub', i, x: 0, y: 0, w: 0, h: H1, lines: 0, align: 'start', text: '', fig: fmt(st.rem[i]) };
		tips.push(lb);
		return lb;
	};
	const stopTexts = (i: number) => {
		const f = fmt(st.rem[i]);
		return W >= WIDE_MIN ? [`${f} stop here`, `${f} stop`] : [`${f} stop`];
	};

	if (!vertical) {
		// Wide: rank r's labels sit in the zone just before its bars (rank 0: the
		// gutter), right-aligned NEAR its bar and FAR from the bars before it, so
		// each column gap holds one rank's labels. A rank packs its labels top to
		// bottom by node centre; one pushed off its own bar collapses its cluster's
		// smallest multi-line label to one line, then hides the smallest unprotected.
		for (let r = 0; r < R; r++) {
			const items = nodes.filter((q) => depth[q.i] === r).toSorted((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
			const hi = edge(r, 'x0')! - NEAR;
			const lo = r ? edge(r - 1, 'x1')! + FAR : 0;
			const blocks = stubs.filter((s) => depth[s.i] === r - 1).map((s) => s.box);
			// A remainder stub of the rank before, beside the label, narrows its zone.
			const from = (y: number, h: number) => Math.max(lo, ...blocks.filter((b) => b.y < y + h + 2 && y < b.y + b.h + 2).map((b) => b.x + b.w + 2));
			const kind = new Map<number, Kind | null>();
			const ladder = (i: number, ks: Kind[], avail: number) => ks.find((k) => form(i, k, avail)) ?? null;
			const last = (i: number): Kind[] => (protect(i) ? ['name', 'short'] : ['name']);
			for (const q of items) kind.set(q.i, ladder(q.i, ['two', 'three', ...last(q.i)], hi - lo));
			for (let guard = 0; guard < 8 * items.length + 8; guard++) {
				const vis = items.filter((q) => kind.get(q.i));
				const fs = vis.map((q) => form(q.i, kind.get(q.i)!, hi - lo)!);
				const ys = pack(
					vis.map((q) => q.y + q.h / 2),
					fs.map((f) => f.h),
					H
				);
				const narrowed = vis.findIndex((q, k) => !form(q.i, kind.get(q.i)!, hi - from(ys[k], fs[k].h)));
				if (narrowed >= 0) {
					const q = vis[narrowed];
					const k = kind.get(q.i)!;
					const avail = hi - from(ys[narrowed], fs[narrowed].h);
					const seq: Kind[] = k === 'one' ? ['one', ...last(q.i)] : ['two', 'three', ...last(q.i)];
					kind.set(q.i, ladder(q.i, seq.slice(seq.indexOf(k) + 1), avail));
					continue;
				}
				// A label must span its own bar's middle, or it reads as a neighbour's.
				const off = vis.findIndex((q, k) => ys[k] > q.y + q.h / 2 + 1 || ys[k] + fs[k].h < q.y + q.h / 2 - 1 || ys[k] < 0);
				if (off >= 0) {
					let a = off;
					let b = off;
					while (a > 0 && ys[a] - ys[a - 1] - fs[a - 1].h < GAP + 0.5) a--;
					while (b < vis.length - 1 && ys[b + 1] - ys[b] - fs[b].h < GAP + 0.5) b++;
					const cl = vis.slice(a, b + 1).toSorted((p, q) => st.value[p.i] - st.value[q.i] || p.i - q.i);
					// A collapse keeps the figure; a label only loses it to width.
					const one = (i: number) => ladder(i, ['one'], hi - lo);
					const tall = cl.find((q) => form(q.i, kind.get(q.i)!, hi - lo)!.lines > 1 && one(q.i));
					if (tall) {
						kind.set(tall.i, one(tall.i));
						continue;
					}
					// Past the plot's height even a protected label goes, but never a start.
					const drop = cl.find((q) => !protect(q.i)) ?? (ys[0] < 0 ? cl.find((q) => st.inn[q.i] > 0) : undefined);
					if (drop) {
						kind.set(drop.i, null);
						continue;
					}
				}
				vis.forEach((q, k) => {
					const f = form(q.i, kind.get(q.i)!, hi - from(ys[k], fs[k].h))!;
					put(labels[q.i], { x: hi - f.w, y: ys[k], w: f.w, h: f.h }, f, 'end');
				});
				break;
			}
		}
		// Remainder figures at the stub's free end, else just under or over the
		// stub, else left to the readout.
		for (const s of stubs) {
			const lb = stubLabel(s.i);
			if (!labels[s.i].lines) continue;
			const b = s.box;
			const bound = (edge(depth[s.i] + 1, 'x0') ?? W) - NEAR;
			// Clear of every other bar by 6px, so the figure never reads as a neighbour's.
			const others = nodes.filter((q) => q.i !== s.i).map((q) => ({ x: q.x - 4, y: q.y - 4, w: q.w + 8, h: q.h + 8 }));
			found: for (const text of stopTexts(s.i)) {
				const w = m(text) + 2 * PAD_X;
				const spots = [
					...nudges(b.h / 2 + 8).map((dy) => ({ x: b.x + b.w + 4, y: b.y + b.h / 2 - H1 / 2 + dy })),
					{ x: b.x + 2, y: b.y + b.h + 2 },
					{ x: b.x + 2, y: b.y - H1 - 2 }
				];
				for (const { x, y } of spots) {
					const r = { x, y: Math.min(H - H1, Math.max(0, y)), w, h: H1 };
					if (x + w > bound || !clear(r, shown()) || !clear(r, others)) continue;
					put(lb, r, { lines: 1, fig: lb.fig }, 'start');
					lb.text = text;
					break found;
				}
			}
		}
	} else {
		// Narrow: each label under its own bar, inside its slot of the row (from the
		// previous bar's end to the next bar's start, so never under a neighbour),
		// from the bar's left edge, or ending at the slot's end when that is short.
		// Two lines, else value and percent on their own lines when the row is tall
		// enough, else the name alone; else hidden, the node still focusable.
		const rows = new Map<number, LNode[]>();
		for (const q of nodes) rows.set(depth[q.i], [...(rows.get(depth[q.i]) ?? []), q]);
		for (const [k, row] of rows) rows.set(k, row.toSorted((a, b) => a.x - b.x));
		const slot = (q: LNode) => {
			const row = rows.get(depth[q.i])!;
			const k = row.indexOf(q);
			return [k > 0 ? row[k - 1].x + row[k - 1].w + 4 : 0, k < row.length - 1 ? row[k + 1].x - 4 : W];
		};
		const limit = (q: LNode) => (depth[q.i] < R - 1 ? edge(depth[q.i] + 1, 'x0')! : H) - 2;
		// Left to right in a row, so a label shifted left never meets its neighbour's.
		for (const q of nodes.toSorted((a, b) => a.y - b.y || a.x - b.x)) {
			const [from, hi] = slot(q);
			const prev = labels.filter((lb) => lb.lines && nodes[lb.i].y === q.y).reduce((e, lb) => Math.max(e, lb.x + lb.w + 4), 0);
			const lo = Math.max(from, prev);
			const y = q.y + q.h + 4;
			for (const kind of ['two', 'three', 'name'] as const) {
				const f = form(q.i, kind, hi - lo);
				if (!f || y + f.h > limit(q)) continue;
				const x = Math.max(lo, Math.min(q.x, hi - f.w));
				put(labels[q.i], { x, y, w: f.w, h: f.h }, f, q.x - x > f.w / 2 ? 'end' : 'start');
				break;
			}
		}
		// Remainder figures after the name on the label's first line, just left of
		// the stub where there is room, never past the slot; else the readout.
		for (const s of stubs) {
			const lb = stubLabel(s.i);
			const own = labels[s.i];
			if (!own.lines) continue;
			const end = slot(nodes[s.i])[1];
			const after = own.x + own.w + 4;
			found: for (const text of stopTexts(s.i)) {
				const w = m(text) + 2 * PAD_X;
				for (const x of [s.box.x - 4 - w, s.box.x + s.box.w + 4, after]) {
					const r = { x, y: own.y, w, h: H1 };
					if (x < after || x + w > end || !clear(r, shown())) continue;
					put(lb, r, { lines: 1, fig: lb.fig }, 'start');
					lb.text = text;
					break found;
				}
			}
		}
	}
	return { vertical, W, H, nodes, links, stubs, labels: [...labels, ...tips] };
}

/** Vertical offsets 0, -4, 4, -8, 8 ... up to `reach`. */
function nudges(reach: number): number[] {
	const out = [0];
	for (let k = 4; k <= reach; k += 4) out.push(-k, k);
	return out;
}
const r2 = (v: number) => Math.round(v * 100) / 100;
/** Top edges for labels of heights `hs` near centres `mids`, in order, GAP apart, inside 0-H when they fit. */
function pack(mids: number[], hs: number[], H: number): number[] {
	const ys = mids.map((c, k) => Math.min(H - hs[k], Math.max(0, c - hs[k] / 2)));
	for (let k = 1; k < ys.length; k++) ys[k] = Math.max(ys[k], ys[k - 1] + hs[k - 1] + GAP);
	for (let k = ys.length - 1; k >= 0; k--) ys[k] = Math.min(ys[k], k < ys.length - 1 ? ys[k + 1] - GAP - hs[k] : H - hs[k]);
	return ys;
}
