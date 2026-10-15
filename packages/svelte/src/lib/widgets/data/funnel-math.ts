// widgets/data/funnel-math.ts: the pure half of the funnel widget. It turns
// model-written stages into display rows (sanitize, order, step rates, the
// previous-stage ghost, the worst step) and the words around them (counts,
// rates, the summary line). No DOM, never throws.
//
// Invariants:
// - The worst step is the lowest step rate under 100% (earliest on ties),
//   only when two or more rates exist.
// - Rates, ghosts, the worst step and the summary are computed on the
//   DISPLAYED order. A row without a number (`n/a`) is skipped by all of them:
//   the next numbered stage compares to the last numbered one before it, and
//   is marked `skipped` so the UI names that base instead of `previous`.
// - A rate exists only when both values are numbers and the previous one is
//   above 0; otherwise it is undefined, never NaN or Infinity.
// - Bar and ghost widths are percent of the largest drawn value, unclamped
//   below (the component sets a 3px floor for any value above 0).
import { finite, num, plain } from '../data-kit/format.js';

export type FunnelSort = 'none' | 'descending' | 'ascending';

export type FunnelRow = {
	label: string;
	/** True when the label was empty and `label` is the `Stage N` fallback. */
	unnamed: boolean;
	value: number | undefined;
	/** value / previous numbered value, when that is above 0. */
	rate?: number;
	/** Label of that previous numbered stage, set with `rate`. */
	from?: string;
	/** True when `from` is not the row directly above (n/a rows sit between). */
	skipped?: boolean;
	/** The lowest step rate under 100% (earliest on ties), when two or more rates exist. */
	worst: boolean;
	/** Bar width, percent of the widest stage. */
	pct: number;
	/** Previous stage's width when it was larger; the gap is the loss. */
	ghostPct?: number;
};

export const MIN_HEIGHT = 120;
export const NAME_CAP = 24;
export const COMPACT_FROM = 100_000;

/** A count from a number or a numeric string with grouping (`"5,000"`); negatives clamp to 0. */
export function parseValue(v: unknown): number | undefined {
	const n = finite(typeof v === 'string' ? v.replace(/[\s,_]/g, '') : v);
	return n === undefined ? undefined : Math.max(0, n);
}

/** `height` as a max: a number or `"300px"`, at least MIN_HEIGHT; absent or junk means no cap. */
export function parseHeight(v: unknown): number | undefined {
	const n = finite(typeof v === 'string' ? v.trim().replace(/px$/i, '') : v);
	return n === undefined ? undefined : Math.max(MIN_HEIGHT, n);
}

export function parseSort(v: unknown): FunnelSort {
	return v === 'descending' || v === 'ascending' ? v : 'none';
}

/** `**Viewed plans**` reads `Viewed plans`; any other value or entry shape is coerced, never thrown on. */
function stageOf(d: unknown): { label: string; value: number | undefined } | undefined {
	if (!d || typeof d !== 'object' || Array.isArray(d)) return undefined;
	const o = d as Record<string, unknown>;
	return { label: plain(o.label), value: parseValue(o.value) };
}

/** Display rows from raw `data`: non-objects skipped, sorted, rated. */
export function funnelRows(data: readonly unknown[], sort: FunnelSort = 'none'): FunnelRow[] {
	const stages = data.map(stageOf).filter((s) => s !== undefined);
	if (sort !== 'none') {
		const dir = sort === 'descending' ? -1 : 1;
		// Stable; rows without a number go last.
		stages.sort((a, b) =>
			a.value === undefined ? (b.value === undefined ? 0 : 1) : b.value === undefined ? -1 : dir * (a.value - b.value)
		);
	}
	const max = Math.max(0, ...stages.map((s) => s.value ?? 0));
	const pctOf = (v: number) => (max > 0 ? Math.round((v / max) * 100_000) / 1000 : 0);
	let prev: number | undefined;
	let prevLabel = '';
	let prevAt = -1;
	const rows: FunnelRow[] = stages.map((s, i) => {
		const row: FunnelRow = {
			label: s.label || `Stage ${i + 1}`,
			unnamed: !s.label,
			value: s.value,
			worst: false,
			pct: s.value === undefined ? 0 : pctOf(s.value)
		};
		if (s.value !== undefined) {
			if (prev !== undefined && prev > 0) {
				row.rate = s.value / prev;
				row.from = prevLabel;
				if (prevAt !== i - 1) row.skipped = true;
			}
			if (prev !== undefined && prev > s.value) row.ghostPct = pctOf(prev);
			prev = s.value;
			prevLabel = row.label;
			prevAt = i;
		}
		return row;
	});
	const rated = rows.filter((r) => r.rate !== undefined);
	if (rated.length >= 2) {
		let worst: FunnelRow | undefined;
		for (const r of rated) if (r.rate! < 1 && (!worst || r.rate! < worst.rate!)) worst = r;
		if (worst) worst.worst = true;
	}
	return rows;
}

/**
 * `0%`, `<0.1%`, `4.2%`, `62%`, `185%`, `>999%`. `precise` keeps one decimal up
 * to 100% (the summary's `10.5%`). A rate that is not exactly 100% never prints
 * as `100%` (`<100%`, `>100%`), so a real loss or gain never reads as none.
 */
export function formatRate(r: number, precise = false): string {
	const p = r * 100;
	if (p === 0) return '0%';
	if (p !== 100 && Math.round(p) === 100 && !(precise && p < 99.95)) return p < 100 ? '<100%' : '>100%';
	if (p < 0.1) return '<0.1%';
	if (p < (precise ? 99.95 : 9.95)) return `${num(p, { digits: 1 })}%`;
	if (Math.round(p) > 999) return '>999%';
	return `${num(p, { digits: 0 })}%`;
}

/** The rate spoken: `45 percent`, `under 0.1 percent`. */
export function spokenRate(r: number): string {
	return formatRate(r).replace('<', 'under ').replace('>', 'over ').replace('%', ' percent');
}

/** One count format for the whole column: compact once the largest is 100,000 or more. */
export function countFormat(rows: readonly FunnelRow[]): (v: number | undefined) => string {
	const compact = rows.some((r) => (r.value ?? 0) >= COMPACT_FROM);
	return (v) => (v === undefined ? 'n/a' : num(v, compact ? { compact: true } : {}));
}

// Words a cut name should not end on (`Saw the poster at the…` reads `Saw the poster…`).
const TAIL = /\s+(?:a|an|and|at|by|for|from|in|of|on|or|the|to|with)$/i;

/** At most NAME_CAP characters, cut at the last word boundary when there is one, never on a small joining word. */
export function capName(s: string): string {
	if (s.length <= NAME_CAP) return s;
	const cut = s.slice(0, NAME_CAP - 1);
	const space = cut.lastIndexOf(' ');
	let out = (space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, '');
	while (TAIL.test(out)) out = out.replace(TAIL, '');
	return `${out}…`;
}

/**
 * The summary line: `10.5% of Leads reached Closed`, plus the worst step as a
 * separate `drop` sentence (three or more stages):
 * `Biggest drop: Proposal to Closed (38% carried on)`. Stage names are never
 * shortened here: the summary is prose and wraps. Fallbacks: under two
 * numbered stages none; all zero `Nothing recorded yet`; a rate above 100% (or
 * a zero first stage) `<n> stages · largest: <name>, <count>`.
 */
export function funnelSummary(rows: readonly FunnelRow[]): { text: string; drop?: string } | undefined {
	const numbered = rows.filter((r) => r.value !== undefined);
	if (numbered.length < 2) return undefined;
	if (numbered.every((r) => r.value === 0)) return { text: 'Nothing recorded yet' };
	const first = numbered[0];
	const last = numbered[numbered.length - 1];
	const count = countFormat(rows);
	const overall = first.value! > 0 ? last.value! / first.value! : Infinity;
	const largest = numbered.reduce((a, b) => (b.value! > a.value! ? b : a));
	const text =
		overall <= 1
			? `${formatRate(overall, true)} of ${first.label} reached ${last.label}`
			: `${rows.length} stages · largest: ${largest.label}, ${count(largest.value)}`;
	const worst = rows.length >= 3 ? rows.find((r) => r.worst) : undefined;
	return worst
		? {
				text,
				drop: `Biggest drop: ${worst.from} to ${worst.label} (${formatRate(worst.rate!)} carried on)`
			}
		: { text };
}

/** The rate's base in words: `previous`, or the stage's name when n/a rows sit between. */
export function rateBase(r: FunnelRow): string {
	return r.skipped ? r.from! : 'previous';
}

/** Accessible name per row: `Proposal, 280, 45 percent of previous, biggest drop`. */
export function rowName(r: FunnelRow, count: (v: number | undefined) => string): string {
	if (r.value === undefined) return `${r.label}, no count`;
	const parts = [r.label, count(r.value)];
	if (r.rate !== undefined) parts.push(`${spokenRate(r.rate)} of ${rateBase(r)}`);
	if (r.worst) parts.push('biggest drop');
	return parts.join(', ');
}
