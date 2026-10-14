// widgets/data/treemap.ts: the pure half of the treemap widget. `sanitize`
// turns the model's untrusted node tree into one the layout can trust, `layout`
// runs d3's squarify over it and returns one flat list of rectangles, and the
// formatters print the numbers. Treemap.svelte draws the result as DOM tiles.
//
// Sanitize rules: a value comes through `finite()` ("45" counts, junk drops);
// a node with kept children takes their sum and ignores its own value; a node
// that sums to 0 or less drops, and so does a group whose children all drop;
// a blank name reads "Unnamed". Node `color` is ignored: one hue is the design.
//
// Captions: only a group directly under the current root gets one (zoom
// shows deeper ones), and only when its box is big enough and, given a
// `measure`, its whole `name · share` line fits the width. A caption that would
// not draw reserves no space. Nested groups get a wider gap so nesting reads.
//
// Colour: top-level tiles (children of the current root) are ranked by value
// onto RAMP, the percent of --ripple-accent mixed into --ripple-surface;
// descendants inherit their top-level step. Hover adds LIFT. Ink on a tile is
// --ripple-surface-foreground; the value line is that ink at INK_ALPHA percent.
// status-text.test.ts measures every step plus LIFT against both inks at 4.5:1,
// so change these numbers only with that test.
import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';
import { finite, plain } from '../data-kit/format.js';

export const RAMP = [56, 46, 37, 29, 22, 16] as const;
export const LIFT = 8;
export const INK_ALPHA = 80;

/** Gap between tiles, px; top-level siblings get a wider one so groups read. */
export const GAP = 2;
export const TOP_GAP = 4;
/** Gap between the children of a nested group that itself holds groups. */
export const NEST_GAP = 4;
/** Caption strip on a group tall enough to pay for it. */
export const CAPTION = 20;
export const CAPTION_MIN_HEIGHT = 64;
export const CAPTION_MIN_WIDTH = 64;
const MAX_DEPTH = 8;

export type TreeNode = { id: string; name: string; value: number; children?: TreeNode[] };

export type Rect = {
	id: string;
	name: string;
	value: number;
	/** Depth below the current root: 1 is a top-level tile. */
	depth: number;
	group: boolean;
	/** Caption strip drawn (groups only). */
	caption: boolean;
	x0: number;
	y0: number;
	x1: number;
	y1: number;
	/** Index into RAMP, shared by a top-level tile and its descendants. */
	step: number;
	/** Top-level ancestor (itself at depth 1); clicking a nested tile zooms here. */
	top: string;
	parentName?: string;
	parentValue?: number;
};

function clean(raw: unknown, id: string, depth: number): TreeNode | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const n = raw as Record<string, unknown>;
	const name = plain(n.name) || 'Unnamed';
	const kids = Array.isArray(n.children) && depth < MAX_DEPTH ? n.children : [];
	if (kids.length) {
		const children = kids.map((c, i) => clean(c, `${id}.${i}`, depth + 1)).filter((c): c is TreeNode => !!c);
		const value = children.reduce((s, c) => s + c.value, 0);
		return children.length && value > 0 ? { id, name, value, children } : undefined;
	}
	const value = finite(n.value);
	return value !== undefined && value > 0 ? { id, name, value } : undefined;
}

/** The model's node list as a tree with summed values and stable path ids. */
export function sanitize(data: unknown): TreeNode[] {
	if (!Array.isArray(data)) return [];
	return data.map((n, i) => clean(n, String(i), 0)).filter((n): n is TreeNode => !!n);
}

/** The node at a path of ids, or undefined once the path no longer exists. */
export function find(nodes: TreeNode[], id: string): TreeNode | undefined {
	for (const n of nodes) {
		if (n.id === id) return n;
		if (n.children && id.startsWith(n.id + '.')) return find(n.children, id);
	}
	return undefined;
}

/** Share of a total: whole percent from 10%, one decimal below, "<1%" under 1%, never "0%". */
export function share(value: number, total: number): string {
	if (!(total > 0) || !(value > 0)) return '<1%';
	const p = (value / total) * 100;
	if (p < 1) return '<1%';
	if (p < 9.95) return `${Number(p.toFixed(1))}%`;
	return `${Math.round(p)}%`;
}

/** What a leaf tile has room for: name plus value line, name only, or nothing. */
export function labelTier(w: number, h: number): 'full' | 'name' | 'none' {
	if (w >= 64 && h >= 40) return 'full';
	if (w >= 48 && h >= 24) return 'name';
	return 'none';
}

/** Text width in px at the caption font; layout uses it to keep only captions that fit. */
export type Measure = (text: string) => number;

/** The caption line a group shows. */
export const captionText = (name: string, value: number, total: number) => `${name} · ${share(value, total)}`;

/**
 * Squarified layout of `nodes` in a w x h box, flattened, root excluded.
 * `inset` is the caption's right padding; with `measure` a caption that does
 * not fit on one line is dropped before layout, so it reserves no strip.
 */
export function layout(nodes: TreeNode[], w: number, h: number, measure?: Measure, inset = 6): Rect[] {
	if (!nodes.length || !(w > 0) || !(h > 0)) return [];
	const total = nodes.reduce((s, n) => s + n.value, 0);
	// 2px left pad, the inset on the right, 2px slack for rounding.
	const hasCaption = (d: { depth: number; x0: number; x1: number; y0: number; y1: number; data: TreeNode }) =>
		d.depth === 1 &&
		d.y1 - d.y0 >= CAPTION_MIN_HEIGHT &&
		d.x1 - d.x0 >= CAPTION_MIN_WIDTH &&
		(!measure || measure(captionText(d.data.name, d.data.value, total)) + inset + 4 <= d.x1 - d.x0);
	const tree = hierarchy<TreeNode>({ id: '', name: '', value: 0, children: nodes })
		.sum((d) => (d.children ? 0 : d.value))
		.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
	const root = treemap<TreeNode>()
		.size([w, h])
		.tile(treemapSquarify)
		.paddingInner((d) => (d.depth === 0 ? TOP_GAP : d.depth > 1 && d.children?.some((c) => c.children) ? NEST_GAP : GAP))
		// d3 sets a node's own box before it asks for its padding, so the
		// caption can depend on the group's height in one pass.
		.paddingTop((d) => (hasCaption(d) ? CAPTION : 0))(tree);

	const step = new Map<string, number>();
	root.children?.forEach((c, i) => step.set(c.data.id, Math.min(i, RAMP.length - 1)));
	const out: Rect[] = [];
	for (const d of root.descendants()) {
		if (d.depth === 0) continue;
		const top = d.ancestors().find((a) => a.depth === 1)!;
		const group = !!d.children;
		out.push({
			id: d.data.id,
			name: d.data.name,
			value: d.value ?? 0,
			depth: d.depth,
			group,
			caption: group && hasCaption(d),
			x0: d.x0,
			y0: d.y0,
			x1: d.x1,
			y1: d.y1,
			step: step.get(top.data.id) ?? RAMP.length - 1,
			top: top.data.id,
			parentName: d.depth > 1 ? d.parent!.data.name : undefined,
			parentValue: d.depth > 1 ? d.parent!.value : undefined
		});
	}
	return out;
}
