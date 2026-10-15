// org-chart-layout.ts: the pure half of OrgChart.svelte. It normalizes the
// model's `root` into a clean tree (never throws), picks a layout by fit, and
// works out selection and default expansion. No DOM, no Svelte.
//
// Layout is a fit ladder, not a breakpoint: an org chart's width need comes
// from the data (14 direct reports overflow any card), so the component
// measures its body width and asks pickMode. `tree` puts every leaf in its own
// column; `stacked` stacks a manager's all-leaf team in one column under it;
// `list` is the indented outline and always fits. The px widths here are the
// same constants the component writes into its CSS, so the formula and the
// drawn tree cannot drift apart.
//
// Keys are path-based ("0.2.1"), so duplicate, missing or half-streamed ids
// never collide. Selection matches String(value) === String(id), first person
// in reading order wins.
import { safeUrl } from '@ripple-ui/core';
import { safeArray } from '$lib/utils/safe-props.js';
import { asText } from '$lib/widgets/text-coerce';
import { plain } from '$lib/widgets/data-kit/format.js';

export type Id = string | number;
export type Mode = 'tree' | 'stacked' | 'list';
export type Person = {
	key: string;
	/** Original id, or undefined when missing (shown, never selectable). */
	id: Id | undefined;
	/** Display name; 'Unnamed' when empty. */
	name: string;
	unnamed: boolean;
	title: string;
	/** A safe URL, or undefined (initials then). */
	avatar: string | undefined;
	children: Person[];
	/** People below this one cut by the depth guard. */
	more: number;
	depth: number;
};

export const CARD_W = 152;
export const GAP = 16;
export const UNIT = CARD_W + GAP;
/** A stacked team's column sits this far right of its manager's card. */
export const STACK_INDENT = 16;
export const MAX_DEPTH = 16;
export const CHART_MAX_PEOPLE = 24;
export const CHART_MIN_WIDTH = 480;
export const MAX_STACK = 8;
/** List rows stop indenting past this many levels below the root. */
export const LIST_INDENT_CAP = 5;

function idOf(v: unknown): Id | undefined {
	if (typeof v === 'number' && Number.isFinite(v)) return v;
	if (typeof v === 'string' && v.trim() !== '') return v;
	return undefined;
}

function isObj(v: unknown): v is Record<string, unknown> {
	return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function make(name: string, title: string, id: Id | undefined, avatar: unknown, key: string, depth: number): Person {
	const src = typeof avatar === 'string' ? safeUrl(avatar, { kind: 'resource' }) : '';
	return { key, id, name: name || 'Unnamed', unnamed: !name, title, avatar: src || undefined, children: [], more: 0, depth };
}

function countBelow(kids: unknown[], seen: WeakSet<object>): number {
	let n = 0;
	for (const k of kids) {
		if (typeof k === 'string') n += plain(k) ? 1 : 0;
		else if (isObj(k) && !seen.has(k)) {
			seen.add(k);
			n += 1 + countBelow(safeArray(k.children), seen);
		}
	}
	return n;
}

function person(raw: unknown, key: string, depth: number, ancestors: Set<object>): Person | null {
	if (typeof raw === 'string') {
		const name = plain(raw);
		return name ? make(name, '', undefined, undefined, key, depth) : null;
	}
	// A child that is its own ancestor is a loop: nothing new to show.
	if (!isObj(raw) || ancestors.has(raw)) return null;
	const p = make(plain(raw.name), plain(raw.title), idOf(raw.id), raw.avatar, key, depth);
	const kids = safeArray(raw.children);
	if (depth + 1 >= MAX_DEPTH) {
		p.more = countBelow(kids, new WeakSet([raw, ...ancestors]));
		return p;
	}
	ancestors.add(raw);
	for (const k of kids) {
		const c = person(k, `${key}.${p.children.length}`, depth + 1, ancestors);
		if (c) p.children.push(c);
	}
	ancestors.delete(raw);
	return p;
}

/** The model's `root` as a forest: [] when empty, several roots for an array. */
export function normalize(root: unknown): Person[] {
	const tops = Array.isArray(root) ? root : isObj(root) ? [root] : [];
	const out: Person[] = [];
	for (const t of tops) {
		const p = person(t, String(out.length), 0, new Set());
		if (p) out.push(p);
	}
	return out;
}

function walk(forest: Person[], fn: (p: Person) => void) {
	for (const p of forest) {
		fn(p);
		walk(p.children, fn);
	}
}

export function stats(forest: Person[]): { people: number; levels: number; cut: boolean } {
	let people = 0;
	let levels = 0;
	let cut = false;
	walk(forest, (p) => {
		people += 1 + p.more;
		levels = Math.max(levels, p.depth + 1);
		if (p.more) cut = true;
	});
	return { people, levels, cut };
}

export function summary(forest: Person[]): string {
	const { people, levels } = stats(forest);
	if (people === 0) return '';
	if (people === 1) return '1 person';
	if (forest.length > 1) return `${people} people · ${forest.length} teams`;
	return `${people} people · ${levels} ${levels === 1 ? 'level' : 'levels'}`;
}

/** A manager whose two or more reports are all leaves: one column in `stacked`. */
export function isStack(p: Person): boolean {
	return p.children.length >= 2 && p.children.every((c) => c.children.length === 0 && c.more === 0);
}

/** Columns a subtree needs in a chart mode. */
export function columns(p: Person, mode: 'tree' | 'stacked'): number {
	if (p.children.length === 0) return 1;
	if (mode === 'stacked' && isStack(p)) return 1;
	return p.children.reduce((n, c) => n + columns(c, mode), 0);
}

/** Width in px a subtree takes when drawn; the component sets exactly this. */
export function nodeWidth(p: Person, mode: 'tree' | 'stacked'): number {
	if (p.children.length === 0) return UNIT;
	if (mode === 'stacked' && isStack(p)) return UNIT + STACK_INDENT;
	return p.children.reduce((n, c) => n + nodeWidth(c, mode), 0);
}

function longestStack(forest: Person[]): number {
	let n = 0;
	walk(forest, (p) => {
		if (isStack(p)) n = Math.max(n, p.children.length);
	});
	return n;
}

/** The first layout that fits `width` px of content. 0 (not measured yet) is `list`. */
export function pickMode(forest: Person[], width: number): Mode {
	const { people, cut } = stats(forest);
	if (people === 0 || cut || people > CHART_MAX_PEOPLE || width < CHART_MIN_WIDTH) return 'list';
	const w = (mode: 'tree' | 'stacked') => forest.reduce((n, p) => n + nodeWidth(p, mode), 0);
	if (w('tree') <= width) return 'tree';
	if (w('stacked') <= width && longestStack(forest) <= MAX_STACK) return 'stacked';
	return 'list';
}

/** Keys from the root down to the selected person (inclusive), or []. */
export function selectedPath(forest: Person[], value: unknown): string[] {
	if (typeof value !== 'string' && typeof value !== 'number') return [];
	const want = String(value);
	if (want === '') return [];
	const find = (ps: Person[], trail: string[]): string[] | null => {
		for (const p of ps) {
			const here = [...trail, p.key];
			if (p.id !== undefined && String(p.id) === want) return here;
			const hit = find(p.children, here);
			if (hit) return hit;
		}
		return null;
	};
	return find(forest, []) ?? [];
}

/**
 * Managers open by default in the list: all of them up to CHART_MAX_PEOPLE;
 * past that the roots and their direct reports, plus every ancestor of the
 * selected person.
 */
export function defaultOpen(forest: Person[], path: string[]): Set<string> {
	const all = stats(forest).people <= CHART_MAX_PEOPLE;
	const open = new Set(path.slice(0, -1));
	walk(forest, (p) => {
		if (p.children.length && (all || p.depth <= 1)) open.add(p.key);
	});
	return open;
}
