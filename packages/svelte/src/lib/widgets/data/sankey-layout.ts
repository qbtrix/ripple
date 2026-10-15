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
// labels: name over figure (`value · percent`), then (wide) name over value
// over percent, then one line (`API 99K · 99%`); only then the value alone, then
// compact. A name keeps at least 6 characters, its ellipsis included; a name and
// its figure always show together or not at all. Protected labels (a start, the
// largest end, over 15% of the total) are placed first. Bar rects are rounded
// to 0.01px so float noise never puts a bar outside its own slot. Wide:
// every label sits just before its own bar, right-aligned, so a column gap
// holds one rank's labels (rank 0 gets a gutter sized to its labels). A rank
// packs its labels by node centre; a label pushed off its bar's middle first
// collapses the smallest two-line label near it to one line, then hides the
// smallest unprotected one; a label's centre stays within OFF of its bar's
// middle (as near as the plot's edge allows). Narrow: under its own bar, covering the bar's left
// edge, inside its slot of the row; protected labels go first and keep room
// for the neighbours still to come. Remainder figures are protected too, with
// one wording per layout (`35 stop here` wide, else `35 stop`); a stub with no
// spot for it keeps its bare figure, drawn without a chip. Beside the stub's free
// end, else under, over or on it; when no spot is clear, the zone's labels
// narrow, collapse or hide around the spot that costs them least.
import { sankey, sankeyLeft } from 'd3-sankey';
import { finite, num, plain } from '../data-kit/format.js';

/** Band tint in % of the accent over the card: rest, by theme; focused; dimmed factor. */
export const BAND = { light: 33, dark: 32 } as const;
export const LIT = 90;
/** Remainder stub: % of the card's ink over the card, by theme (dark needs more to show). */
export const STUB_INK = { light: 18, dark: 26 } as const;
/** The scroll fade's height; a plot that overflows its max by no more than this grows instead. */
export const FADE = 24;
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
/** Wide: how far a label's centre may sit from its bar's middle. */
const OFF = 10;
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
		links: links.map((l) => ({
			s: remap.get(l.s)!,
			t: remap.get(l.t)!,
			value: l.value
		})),
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
	return {
		inn,
		out,
		value: inn.map((v, i) => Math.max(v, out[i])),
		rem,
		total,
		starts,
		ends,
		largestEnd
	};
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
	/** The name as drawn ('' when a protected label keeps only its figure), or the remainder text. */
	text: string;
	/** The figure as drawn: `85 · 71%`, else `85`, else compact; never empty on a shown node label. */
	fig: string;
};
export type Layout = {
	vertical: boolean;
	W: number;
	H: number;
	nodes: LNode[];
	links: LLink[];
	stubs: LStub[];
	labels: Label[];
};
export type Measure = (text: string, bold?: boolean) => number;
/** Text width at the callout size before (or without) a real measure: SSR and jsdom. */
export const guess: Measure = (t, bold) => t.length * (bold ? 6.9 : 6.5);

/** Node label figure: `value · percent of the start total` (start nodes: the value alone). */
export function nodeFigure(st: Stats, i: number): string {
	const v = st.value[i];
	return st.inn[i] === 0 ? fmt(v) : `${fmt(v)} · ${pct(v, st.total)}`;
}

/** Label forms, best first: name over figure, then (wide only) name over value
 * over percent, then one line; only then does the figure lose its percent, then
 * go compact, before a label hides. A figure is never drawn without its name. */
const LADDER = ['two', 'three', 'one', 'val', 'cval', 'oneV', 'oneC'] as const;
type Kind = (typeof LADDER)[number];
type Form = {
	lines: 1 | 2 | 3;
	h: number;
	w: number;
	need: number;
	fig: string;
};
const HIDDEN = 20;
const cost = (k: Kind | null) => (k === null ? HIDDEN : LADDER.indexOf(k));
type Placed = { i: number; k: Kind; r: Rect; f: Form; align: Label['align'] };
type Pass = { out: Placed[]; score: number };

export function layout(
	g: Graph,
	st: Stats,
	o: {
		width: number;
		maxH: number;
		vertical: boolean;
		curve: number;
		measure?: Measure;
	}
): Layout {
	const W = Math.max(1, o.width);
	const memo = new Map<string, number>();
	const raw = o.measure ?? guess;
	const m: Measure = (t, bold) => {
		const k = `${bold ? 1 : 0}${t}`;
		let w = memo.get(k);
		if (w === undefined) memo.set(k, (w = raw(t, bold)));
		return w;
	};
	const n = g.nodes.length;
	const vertical = o.vertical;
	if (!n) return { vertical, W, H: 0, nodes: [], links: [], stubs: [], labels: [] };

	const protect = (i: number) => st.inn[i] === 0 || i === st.largestEnd || st.value[i] > 0.15 * st.total;
	const figOf = (i: number, kind: Kind) => {
		const v = st.value[i];
		const p = st.inn[i] ? pct(v, st.total) : '';
		if (kind === 'two' || kind === 'three' || kind === 'one') return p ? `${fmt(v)} · ${p}` : fmt(v);
		return kind === 'val' || kind === 'oneV' ? fmt(v) : num(v, { compact: true });
	};
	const linesOf = (kind: Kind): 1 | 2 | 3 => (kind === 'three' ? 3 : kind === 'two' || kind === 'val' || kind === 'cval' ? 2 : 1);
	// A node label in one form at a width, or null when it does not fit. The
	// figure stays on one line; a shown name keeps NAME_MIN characters (the
	// ellipsis is one of them).
	const form = (i: number, kind: Kind, avail: number): Form | null => {
		const name = g.nodes[i].name;
		const fig = figOf(i, kind);
		// Three lines only when there is a percent to give its own line, and only wide.
		if (kind === 'three' && (vertical || !fig.includes(' · '))) return null;
		const fw = kind === 'three' ? Math.max(...fig.split(' · ').map((x) => m(x))) : m(fig);
		const nm = m(name, true);
		const least = name.length > NAME_MIN ? m(`${name.slice(0, NAME_MIN - 1)}…`, true) : nm;
		const lines = linesOf(kind);
		const [need, w] = lines > 1 ? [Math.max(least, fw), Math.max(nm, fw)] : [least + 4 + fw, nm + 4 + fw];
		const least2 = Math.max(MIN_LABEL, need + 2 * PAD_X);
		if (avail < least2) return null;
		return {
			lines,
			h: lines * LINE + 2 * PAD_Y,
			w: Math.min(w + 2 * PAD_X, avail),
			need: least2,
			fig
		};
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
	let need = 0;
	if (vertical) {
		const pitch = (R - 1) * PITCH + ROW_TAIL > o.maxH ? Math.max(PITCH_MIN, (o.maxH - ROW_TAIL) / (R - 1)) : PITCH;
		H = (R - 1) * pitch + ROW_TAIL;
		span = (R - 1) * pitch + BAR;
		cross = W;
	} else {
		H = Math.max(MIN_PLOT, densest * PER_NODE);
		span = W;
		cross = H;
		need = Math.max(MIN_LABEL, ...g.nodes.flatMap((_, i) => (depth[i] ? [] : [form(i, 'two', Infinity)?.w ?? 0])));
		gutter = Math.max(0, Math.min((W - R * NODE_W) / R, need)) + NEAR;
	}
	const thick = vertical ? BAR : NODE_W;
	const run = (gut: number) =>
		sankey()
			.nodeAlign(sankeyLeft)
			.nodeWidth(thick)
			.nodePadding(vertical ? 14 : 20)
			.extent([
				[gut, 0],
				[span, cross]
			])({
			nodes: g.nodes.map(() => ({})),
			links: g.links.map((l) => ({ source: l.s, target: l.t, value: l.value }))
		});
	let res = run(gutter);
	if (!vertical) {
		// A start bar shorter than a two-line label may collapse to one line to
		// stay on its bar; the gutter makes room for that line when it can.
		const tight = res.nodes.flatMap((d, i) => (!depth[i] && d.y1 - d.y0 < H2 ? [form(i, 'one', Infinity)?.w ?? 0] : []));
		const wider = Math.max(0, Math.min((W - R * NODE_W) / R, Math.max(need, ...tight))) + NEAR;
		if (wider > gutter) res = run((gutter = wider));
	}

	// Flow coordinates (u along, v across) to screen.
	const P = (u: number, v: number) => (vertical ? `${r2(v)},${r2(u)}` : `${r2(u)},${r2(v)}`);
	const box = (u0: number, u1: number, v0: number, v1: number): Rect =>
		vertical ? { x: r2(v0), y: r2(u0), w: r2(v1 - v0), h: r2(u1 - u0) } : { x: r2(u0), y: r2(v0), w: r2(u1 - u0), h: r2(v1 - v0) };

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
		return [
			{
				i,
				d: `M${P(d.x1, top)}L${P(e, mid - t)}L${P(e, mid + t)}L${P(d.x1, bot)}Z`,
				box: box(d.x1, e, top, bot)
			}
		];
	});

	const fresh = () =>
		g.nodes.map((nd, i): Label => ({
			key: `n${i}`,
			kind: 'node',
			i,
			x: 0,
			y: 0,
			w: 0,
			h: 0,
			lines: 0,
			align: 'start',
			text: nd.name,
			fig: ''
		}));
	const freshTips = () =>
		stubs.map((s): Label => ({
			key: `s${s.i}`,
			kind: 'stub',
			i: s.i,
			x: 0,
			y: 0,
			w: 0,
			h: H1,
			lines: 0,
			align: 'start',
			text: '',
			fig: fmt(st.rem[s.i])
		}));
	let labels = fresh();
	let tips = freshTips();
	// One wording per layout (`stop here`, else `stop`); a stub with no spot for
	// it keeps its bare figure, drawn without a chip against the stub.
	let word = '';
	const clear = (r: Rect, among: Rect[]) =>
		among.every((p) => r.x + r.w <= p.x - 2 || p.x + p.w <= r.x - 2 || r.y + r.h <= p.y - 2 || p.y + p.h <= r.y - 2);
	const edge = (d: number, side: 'x0' | 'x1') => res.nodes.find((q) => q.depth === d)?.[side];
	const stopTexts = (i: number) => {
		const f = fmt(st.rem[i]);
		return word ? [`${f} ${word}`, f] : [f];
	};
	// Remainder figures are protected: each takes the first spot clear of bars,
	// other figures and labels; failing that, the spot that costs the labels of
	// its zone least (they narrow, collapse or hide around it). `spots` lists a
	// stub's candidate chips in preference order; `pass` lays the zone's labels
	// out around a set of chips.
	const placeStubs = (zone: LStub[], pass: (chips: Rect[]) => Pass, spots: (s: LStub, w: number) => Rect[], others: Rect[]) => {
		const chips: Rect[] = [];
		let best = pass(chips);
		for (const s of zone) {
			let pick: { r: Rect; text: string; res: Pass } | null = null;
			const near = others.filter((_, k) => nodes[k].i !== s.i);
			// The bare figure only when the worded one has no spot at all, never on score.
			found: for (const text of stopTexts(s.i)) {
				if (pick) break;
				for (const r of spots(s, m(text) + 2 * PAD_X)) {
					if (!clear(r, near) || !clear(r, chips)) continue;
					if (
						clear(
							r,
							best.out.map((p) => p.r)
						)
					) {
						pick = { r, text, res: best };
						break found;
					}
					const res = pass([...chips, r]);
					if (!pick || res.score < pick.res.score) pick = { r, text, res };
				}
			}
			if (!pick) continue;
			chips.push(pick.r);
			best = pick.res;
			Object.assign(tips[stubs.indexOf(s)], pick.r, {
				lines: 1,
				text: pick.text,
				align: 'start'
			});
		}
		for (const p of best.out)
			Object.assign(labels[p.i], p.r, {
				lines: p.f.lines,
				fig: p.f.fig,
				align: p.align,
				text: g.nodes[p.i].name
			});
	};
	// Half a rung for each name cut short, so a figure prefers a spot that leaves names whole.
	const clipped = (out: Placed[]) => out.filter((p) => p.f.w < form(p.i, p.k, Infinity)!.w - 0.5).length / 2;
	// Bars of every node, 4px out, so a figure never reads as a neighbour's.
	const bars = nodes.map((q) => ({
		x: q.x - 4,
		y: q.y - 4,
		w: q.w + 8,
		h: q.h + 8
	}));

	const placeAll = () => {
		if (!vertical) {
			// Wide: rank r's labels sit in the zone just before its bars (rank 0: the
			// gutter), right-aligned NEAR its bar and FAR from the bars before it, so
			// each column gap holds one rank's labels, and the remainder figures of
			// rank r - 1. A rank packs its labels top to bottom by node centre; one
			// pushed off its own bar collapses its cluster's smallest two-line label to
			// one line, then hides the smallest unprotected one.
			for (let r = 0; r < R; r++) {
				const items = nodes.filter((q) => depth[q.i] === r).toSorted((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
				const hi = edge(r, 'x0')! - NEAR;
				const lo = r ? edge(r - 1, 'x1')! + FAR : 0;
				// ponytail: a hairline stub (under 4px) may sit under a chip; it shows nothing a reader could see.
				const stubBoxes = stubs.filter((s) => depth[s.i] === r - 1 && s.box.h >= 4).map((s) => s.box);
				const pass = (chips: Rect[]): Pass => {
					const blocks = [...stubBoxes, ...chips];
					// A stub or remainder figure of the rank before, beside the label, narrows its zone.
					const from = (y: number, h: number) =>
						Math.max(lo, ...blocks.filter((b) => b.y < y + h + 2 && y < b.y + b.h + 2).map((b) => b.x + b.w + 2));
					const kind = new Map<number, Kind | null>();
					const pick = (i: number, ks: readonly Kind[], avail: number) => ks.find((k) => form(i, k, avail)) ?? null;
					for (const q of items) kind.set(q.i, pick(q.i, LADDER, hi - lo));
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
							const seq = LADDER;
							kind.set(q.i, pick(q.i, seq.slice(seq.indexOf(kind.get(q.i)!) + 1), hi - from(ys[narrowed], fs[narrowed].h)));
							continue;
						}
						// A label must span its own bar's middle, or it reads as a neighbour's.
						// Its centre within OFF of the bar's middle, or it reads as the row above or below.
						// (A bar at the plot's edge: centred as near its middle as the plot allows.)
						const off = vis.findIndex(
							(q, k) => Math.abs(ys[k] + fs[k].h / 2 - Math.min(H - fs[k].h / 2, Math.max(fs[k].h / 2, q.y + q.h / 2))) > OFF || ys[k] < 0
						);
						if (off >= 0) {
							let a = off;
							let b = off;
							while (a > 0 && ys[a] - ys[a - 1] - fs[a - 1].h < GAP + 0.5) a--;
							while (b < vis.length - 1 && ys[b + 1] - ys[b] - fs[b].h < GAP + 0.5) b++;
							const cl = vis.slice(a, b + 1).toSorted((p, q) => st.value[p.i] - st.value[q.i] || p.i - q.i);
							// A collapse keeps name and figure, one line shorter: three to two, two to one.
							const shorter = (i: number) => {
								const lines = form(i, kind.get(i)!, hi - lo)!.lines;
								return pick(
									i,
									LADDER.filter((k) => linesOf(k) < lines && linesOf(k) >= lines - 1),
									hi - lo
								);
							};
							const tall = cl.find((q) => shorter(q.i));
							if (tall) {
								kind.set(tall.i, shorter(tall.i));
								continue;
							}
							// Past the plot's height even a protected label goes, but never a start.
							const drop = cl.find((q) => !protect(q.i)) ?? (ys[0] < 0 ? cl.find((q) => st.inn[q.i] > 0) : undefined);
							if (drop) {
								kind.set(drop.i, null);
								continue;
							}
						}
						const out = vis.map((q, k): Placed => {
							const f = form(q.i, kind.get(q.i)!, hi - from(ys[k], fs[k].h))!;
							return {
								i: q.i,
								k: kind.get(q.i)!,
								r: { x: hi - f.w, y: ys[k], w: f.w, h: f.h },
								f,
								align: 'end'
							};
						});
						return {
							out,
							score: items.reduce((a, q) => a + cost(kind.get(q.i) ?? null), 0) + clipped(out)
						};
					}
					return { out: [], score: items.length * HIDDEN };
				};
				// Remainder figures: at the stub's free end, else just under or over the
				// stub, else on the stub itself; never past this rank's bars.
				const spots = (s: LStub, w: number): Rect[] => {
					const b = s.box;
					const bound = hi;
					const at = (x: number, y: number) => ({
						x,
						y: Math.min(H - H1, Math.max(0, y)),
						w,
						h: H1
					});
					return [
						...nudges(b.h / 2 + 8).map((dy) => at(b.x + b.w + 4, b.y + b.h / 2 - H1 / 2 + dy)),
						at(b.x + 2, b.y + b.h + 2),
						at(b.x + 2, b.y - H1 - 2),
						at(b.x + 2, b.y + b.h / 2 - H1 / 2)
					].filter((r) => r.x + r.w <= bound);
				};
				placeStubs(
					stubs.filter((s) => depth[s.i] === r - 1),
					pass,
					spots,
					bars
				);
			}
		} else {
			// Narrow: each label under its own bar, inside its slot of the row (from the
			// previous bar's end to the next bar's start, so never under a neighbour),
			// covering the bar's left edge, shifted left only when it must. A row
			// places protected labels first, then by size, each between the labels and
			// remainder figures already placed beside it and short of the least room
			// its neighbours still to come need; a label that fits no form is hidden,
			// the node still focusable.
			const rows = new Map<number, LNode[]>();
			for (const q of nodes) rows.set(depth[q.i], [...(rows.get(depth[q.i]) ?? []), q]);
			for (const [k, row] of rows)
				rows.set(
					k,
					row.toSorted((a, b) => a.x - b.x)
				);
			const slot = (q: LNode) => {
				const row = rows.get(depth[q.i])!;
				const k = row.indexOf(q);
				return [k > 0 ? row[k - 1].x + row[k - 1].w + 4 : 0, k < row.length - 1 ? row[k + 1].x - 4 : W];
			};
			const limit = (q: LNode) => (depth[q.i] < R - 1 ? edge(depth[q.i] + 1, 'x0')! : H) - 2;
			// The least room a label needs: its smallest form when its slot holds one, else none.
			const least = (q: LNode) => {
				const [a, b] = slot(q);
				const named = Math.min(...(['cval', 'oneC'] as const).map((k) => form(q.i, k, b - a)?.need ?? Infinity));
				return named < Infinity ? named : 0;
			};
			// Where a label still to come can start: its slot, past the labels placed on its left.
			const startOf = (p: LNode, out: Placed[]) =>
				Math.max(slot(p)[0], ...out.filter((d) => nodes[d.i].x < p.x).map((d) => d.r.x + d.r.w + 4));
			for (const row of rows.values()) {
				const order = row.toSorted((a, b) => Number(protect(b.i)) - Number(protect(a.i)) || st.value[b.i] - st.value[a.i] || a.x - b.x);
				const pass = (chips: Rect[]): Pass => {
					const out: Placed[] = [];
					let score = 0;
					for (const q of order) {
						const [from, to] = slot(q);
						const y = q.y + q.h + 4;
						let got: Placed | null = null;
						let k: Kind | null = null;
						for (const kind of LADDER) {
							const h = linesOf(kind) * LINE + 2 * PAD_Y;
							if (y + h > limit(q)) continue;
							const near = (r: Rect) => r.y < y + h + 2 && y < r.y + r.h + 2;
							const obs = [...out.map((p) => ({ r: p.r, at: nodes[p.i].x })), ...chips.map((r) => ({ r, at: r.x + r.w / 2 }))].filter((p) =>
								near(p.r)
							);
							// Neighbours still to come keep the least room they need.
							const owed = order.slice(order.indexOf(q) + 1).filter((p) => least(p) > 0);
							const lo = Math.max(
								from,
								...obs.filter((p) => p.at < q.x).map((p) => p.r.x + p.r.w + 4),
								// A neighbour on the left yields only up to this label's own bar.
								...owed.filter((p) => p.x < q.x).map((p) => Math.min(q.x, Math.max(p.x + 4, startOf(p, out) + least(p)) + 4))
							);
							const hi = Math.min(
								to,
								...obs.filter((p) => p.at >= q.x).map((p) => p.r.x - 4),
								...owed.filter((p) => p.x > q.x).map((p) => Math.min(p.x, slot(p)[1] - least(p)) - 4)
							);
							if (lo > q.x || hi < q.x + 4) continue;
							// From the bar's own left edge when the form fits there, so the room
							// before the bar stays with the neighbour; else shifted left in the slot.
							const f = form(q.i, kind, hi - q.x) ?? form(q.i, kind, hi - lo);
							if (!f) continue;
							const x = Math.max(lo, Math.min(q.x, hi - f.w));
							got = {
								i: q.i,
								k: kind,
								r: { x, y, w: f.w, h: f.h },
								f,
								align: q.x - x > f.w / 2 ? 'end' : 'start'
							};
							k = kind;
							break;
						}
						score += cost(k);
						if (got) out.push(got);
					}
					return { out, score: score + clipped(out) };
				};
				// Remainder figures: beside the stub on the label line, else under the
				// stub's tapered end (stepping down while the row has room), else on the
				// stub itself; never past the plot or into the next row.
				const spots = (s: LStub, w: number): Rect[] => {
					const b = s.box;
					const q = nodes[s.i];
					const lim = limit(q);
					const mid = Math.min(W - w, Math.max(0, b.x + b.w / 2 - w / 2));
					const out: Rect[] = [{ x: b.x + b.w + 4, y: q.y + q.h + 4, w, h: H1 }];
					for (let y = b.y + b.h + 2; y + H1 <= lim; y += 4) out.push({ x: mid, y, w, h: H1 });
					out.push({ x: mid, y: b.y + b.h / 2 - H1 / 2, w, h: H1 });
					return out.filter((r) => r.x >= 0 && r.x + r.w <= W && r.y >= 0 && r.y + r.h <= lim);
				};
				placeStubs(
					stubs.filter((s) => row.some((q) => q.i === s.i)),
					pass,
					spots,
					bars
				);
			}
		}
	};
	// The longest wording that hides the fewest labels (a protected one costs most);
	// a bare remainder figure costs more than a hidden small label.
	let best: { score: number; labels: Label[]; tips: Label[] } | null = null;
	for (const w of [...(vertical ? ['stop'] : ['stop here', 'stop']), '']) {
		word = w;
		labels = fresh();
		tips = freshTips();
		placeAll();
		const score =
			labels.reduce((a, l) => a + (l.lines ? 0 : protect(l.i) ? 100 : 10), 0) +
			tips.reduce((a, t) => a + (!t.lines ? 50 : t.text === t.fig ? 20 : 0), 0);
		if (!best || score < best.score) best = { score, labels, tips };
		if (!score) break;
	}
	({ labels, tips } = best!);
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
