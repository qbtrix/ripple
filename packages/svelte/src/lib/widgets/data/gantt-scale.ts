// widgets/data/gantt-scale.ts: the pure half of the gantt widget. It turns a
// model's task list into rows the Svelte side can draw, and a date range plus
// tick labels that fit a given track width. No DOM, never throws.
//
// Rules a reader must not break:
// - Every task stays a row. A row with an unparseable start or end keeps its
//   name and has no dates (the widget shows a "No dates" chip); it is left out
//   of the range. Reversed dates are swapped. Empty names read "Untitled task".
// - Dates are ISO days or datetimes only (format.ts dateKey), computed and
//   labelled in UTC so no timezone moves a day.
// - Progress: a number or numeric string with an optional %, clamped 0-100;
//   anything else is "no progress" (absent is not 0%).
// - Dependencies: comma list or array of ids. A repeated id resolves to its
//   first row; unknown ids, self references and edges that close a cycle drop.
// - The tick unit starts from viewMode and steps up (day, week, month,
//   quarter, year) until labels sit at least minGap px apart, so the range
//   always fits the width and nothing scrolls sideways.
import { dateKey, finite, plain } from '../data-kit/format.js';

export type ViewMode = 'Quarter Day' | 'Half Day' | 'Day' | 'Week' | 'Month' | 'Year';

export interface GanttRow {
	/** Original task object, handed back to onclick. */
	task: unknown;
	id: string;
	name: string;
	untitled: boolean;
	start?: number;
	end?: number;
	milestone: boolean;
	progress?: number;
	/** Indexes of predecessor rows. */
	deps: number[];
}

export interface Range {
	min: number;
	max: number;
}

export interface Tick {
	/** 0..1 along the range. */
	x: number;
	text: string;
	/** Right-aligned on its tick (the last label, where left-aligned would run off the track). */
	end?: boolean;
}

const DAY = 86_400_000;
const HOUR = 3_600_000;

export function parseProgress(v: unknown): number | undefined {
	const n = finite(typeof v === 'string' ? v.trim().replace(/%$/, '') : v);
	return n === undefined ? undefined : Math.min(100, Math.max(0, n));
}

function depIds(v: unknown): string[] {
	const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : typeof v === 'number' ? [v] : [];
	return list.map((d) => String(d).trim()).filter(Boolean);
}

export function parseTasks(tasks: readonly unknown[]): GanttRow[] {
	const rows: GanttRow[] = tasks.map((task) => {
		const t = (task && typeof task === 'object' ? task : {}) as Record<string, unknown>;
		const name = plain(t.name);
		let start = dateKey(t.start);
		let end = dateKey(t.end);
		if (start === undefined || end === undefined) start = end = undefined;
		else if (end < start) [start, end] = [end, start];
		return {
			task,
			id: t.id === undefined || t.id === null ? '' : String(t.id).trim(),
			name: name || 'Untitled task',
			untitled: !name,
			start,
			end,
			milestone: start !== undefined && start === end,
			progress: parseProgress(t.progress),
			deps: []
		};
	});

	const first = new Map<string, number>();
	rows.forEach((r, i) => {
		if (r.id && !first.has(r.id)) first.set(r.id, i);
	});
	// Does row `from` reach row `to` by following predecessors?
	const reaches = (from: number, to: number, seen = new Set<number>()): boolean => {
		if (from === to) return true;
		if (seen.has(from)) return false;
		seen.add(from);
		return rows[from].deps.some((d) => reaches(d, to, seen));
	};
	rows.forEach((r, i) => {
		const t = (r.task && typeof r.task === 'object' ? r.task : {}) as Record<string, unknown>;
		for (const id of depIds(t.dependencies)) {
			const d = first.get(id);
			if (d === undefined || d === i || r.deps.includes(d) || reaches(d, i)) continue;
			r.deps.push(d);
		}
	});
	return rows;
}

/** Earliest start to latest end over rows with dates, padded 4% a side. */
export function rangeOf(rows: readonly GanttRow[]): (Range & { start: number; end: number }) | undefined {
	let start = Infinity;
	let end = -Infinity;
	for (const r of rows) {
		if (r.start === undefined || r.end === undefined) continue;
		start = Math.min(start, r.start);
		end = Math.max(end, r.end);
	}
	if (start === Infinity) return undefined;
	// A lone milestone still needs a span to draw on: one day around it.
	const span = Math.max(end - start, DAY);
	const pad = span * 0.04 + (end === start ? DAY / 2 : 0);
	return { start, end, min: start - pad, max: end + pad };
}

export function frac(t: number, r: Range): number {
	return (t - r.min) / (r.max - r.min);
}

/** Duration-weighted percent over rows that carry progress, else undefined. */
export function overallPercent(rows: readonly GanttRow[]): number | undefined {
	let w = 0;
	let done = 0;
	let n = 0;
	let plainSum = 0;
	for (const r of rows) {
		if (r.progress === undefined) continue;
		n++;
		plainSum += r.progress;
		if (r.start !== undefined && r.end !== undefined) {
			w += r.end - r.start;
			done += (r.end - r.start) * r.progress;
		}
	}
	if (!n) return undefined;
	return Math.round(w > 0 ? done / w : plainSum / n);
}

// ---------- ticks ----------

type Unit = 'h6' | 'h12' | 'day' | 'week' | 'month' | 'quarter' | 'year';
const LADDER: Unit[] = ['h6', 'h12', 'day', 'week', 'month', 'quarter', 'year'];
const APPROX: Record<Unit, number> = {
	h6: 6 * HOUR,
	h12: 12 * HOUR,
	day: DAY,
	week: 7 * DAY,
	month: 30.44 * DAY,
	quarter: 91.31 * DAY,
	year: 365.25 * DAY
};

function baseUnit(mode: unknown, span: number): Unit {
	switch (mode) {
		case 'Quarter Day':
			return span < 4 * DAY ? 'h6' : 'day';
		case 'Half Day':
			return span < 4 * DAY ? 'h12' : 'day';
		case 'Week':
			return 'week';
		case 'Month':
			return 'month';
		case 'Year':
			return 'year';
		default:
			return 'day';
	}
}

function floorTo(t: number, u: Unit): number {
	const d = new Date(t);
	const y = d.getUTCFullYear();
	const m = d.getUTCMonth();
	if (u === 'h6' || u === 'h12') {
		const step = u === 'h6' ? 6 : 12;
		return Date.UTC(y, m, d.getUTCDate(), Math.floor(d.getUTCHours() / step) * step);
	}
	if (u === 'day') return Date.UTC(y, m, d.getUTCDate());
	if (u === 'week') return Date.UTC(y, m, d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
	if (u === 'month') return Date.UTC(y, m, 1);
	if (u === 'quarter') return Date.UTC(y, m - (m % 3), 1);
	return Date.UTC(y, 0, 1);
}

function stepFrom(t: number, u: Unit, k: number): number {
	const d = new Date(t);
	if (u === 'h6') return t + 6 * HOUR * k;
	if (u === 'h12') return t + 12 * HOUR * k;
	if (u === 'day') return t + DAY * k;
	if (u === 'week') return t + 7 * DAY * k;
	if (u === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1);
	if (u === 'quarter') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3 * k, 1);
	return Date.UTC(d.getUTCFullYear() + k, 0, 1);
}

/** Every boundary of `u` (every k-th) inside the range, capped so a bad input cannot loop. */
function boundaries(r: Range, u: Unit, k = 1): number[] {
	const out: number[] = [];
	let t = floorTo(r.min, u);
	if (t < r.min) t = stepFrom(t, u, 1);
	for (; t <= r.max && out.length < 500; t = stepFrom(t, u, k)) out.push(t);
	return out;
}

const fmt = (t: number, o: Intl.DateTimeFormatOptions) =>
	new Intl.DateTimeFormat('en-US', { ...o, timeZone: 'UTC' }).format(t);

/** "May 3", or "May 3, 2026" with the year. */
export function day(t: number, year = false): string {
	return fmt(t, year ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });
}

function tickText(t: number, u: Unit, crossesYear: boolean, isFirstOfYear: boolean): string {
	const withYear = crossesYear && isFirstOfYear;
	if (u === 'h6' || u === 'h12') {
		const d = new Date(t);
		return d.getUTCHours() === 0 ? day(t) : `${String(d.getUTCHours()).padStart(2, '0')}:00`;
	}
	if (u === 'day') {
		const label = `${fmt(t, { weekday: 'short' })} ${new Date(t).getUTCDate()}`;
		return withYear ? `${label}, ${new Date(t).getUTCFullYear()}` : label;
	}
	if (u === 'week') return day(t, withYear);
	if (u === 'month') return withYear ? fmt(t, { month: 'short', year: 'numeric' }) : fmt(t, { month: 'short' });
	if (u === 'quarter') return `Q${Math.floor(new Date(t).getUTCMonth() / 3) + 1} ${new Date(t).getUTCFullYear()}`;
	return String(new Date(t).getUTCFullYear());
}

/** Rough label width in px at the 11px scale size, for the fit checks. */
export const labelPx = (text: string) => text.length * 5.8 + 4;

export interface Scale {
	labels: Tick[];
	/** Faint grid lines, 0..1; `major` ones sit under a label unit boundary. */
	lines: { x: number; major: boolean }[];
	unit: Unit;
}

/**
 * Tick labels and grid lines for a track `width` px wide. The label unit is
 * the first of (unit, 1) and (unit, 2) steps, from viewMode's unit upward,
 * whose labels sit at least `minGap` px apart (44 wide, 64 narrow) with no
 * label dropped for crowding, so spacing stays even. Labels sit left aligned
 * on their tick (right aligned at the end), never past either edge, at most
 * `maxLabels`. Lines: every base unit while 6px apart (minor), plus the
 * label unit's (major).
 */
export function scaleOf(
	r: Range,
	viewMode: unknown,
	width: number,
	opts: { minGap?: number; maxLabels?: number } = {}
): Scale {
	const minGap = opts.minGap ?? 44;
	const max = opts.maxLabels ?? Infinity;
	const w = Math.max(width, 1);
	const span = r.max - r.min;
	const pxPerMs = w / span;
	const base = baseUnit(viewMode, span);
	const crossesYear = new Date(r.min).getUTCFullYear() !== new Date(r.max).getUTCFullYear();

	const steps: [Unit, number][] = [];
	for (let i = LADDER.indexOf(base); i < LADDER.length; i++) steps.push([LADDER[i], 1], [LADDER[i], 2]);
	const yearPx = APPROX.year * pxPerMs;
	for (let k = 3; k <= 1000 && yearPx * (k - 1) < minGap * 2; k++) steps.push(['year', k]);

	let pick: { labels: Tick[]; unit: Unit; k: number } | undefined;
	for (const [unit, k] of steps) {
		if (APPROX[unit] * k * pxPerMs < minGap) continue;
		const out = labelsFor(r, unit, k, w, minGap, crossesYear);
		pick = { labels: out.labels, unit, k };
		if (!out.crowded && out.labels.length <= max) break;
	}
	pick ??= { labels: [], unit: 'year', k: 1 };
	const labels = pick.labels.length > max ? pick.labels.filter((_, i) => i % Math.ceil(pick.labels.length / max) === 0) : pick.labels;

	const major = boundaries(r, pick.unit, pick.k).map((t) => frac(t, r));
	const minor = APPROX[base] * pxPerMs >= 6 ? boundaries(r, base).map((t) => frac(t, r)) : [];
	const seen = new Set(major.map((x) => x.toFixed(6)));
	const lines = [
		...major.map((x) => ({ x, major: true })),
		...minor.filter((x) => !seen.has(x.toFixed(6))).map((x) => ({ x, major: false }))
	];
	return { labels, lines, unit: pick.unit };
}

function labelsFor(r: Range, unit: Unit, k: number, w: number, minGap: number, crossesYear: boolean) {
	const labels: Tick[] = [];
	let crowded = false;
	let lastEnd = -Infinity;
	let lastYear = NaN;
	for (const t of boundaries(r, unit, k)) {
		const year = new Date(t).getUTCFullYear();
		const text = tickText(t, unit, crossesYear, year !== lastYear && labels.length > 0);
		const x = frac(t, r);
		const px = x * w;
		const lw = labelPx(text);
		const end = px + lw > w;
		if (end && px - lw < 0) continue;
		const prev = labels.length ? labels[labels.length - 1].x * w : -Infinity;
		if ((end ? px - lw : px) < lastEnd || px - prev < minGap) {
			// A crowded last label at the edge is just dropped; one mid-track means the step is too fine.
			if (!end) crowded = true;
			continue;
		}
		labels.push(end ? { x, text, end } : { x, text });
		lastEnd = px + (end ? 0 : lw) + 8;
		lastYear = year;
	}
	return { labels, crowded };
}

/**
 * Where the Today label goes: right of the line, or left (`end`) when that
 * hides fewer tick labels; the tick labels it would touch drop out.
 */
export function placeToday(labels: readonly Tick[], today: number, w: number): { labels: Tick[]; end: boolean } {
	const tw = labelPx('Today');
	const px = today * w;
	const span = (l: Tick) => {
		const from = l.x * w - (l.end ? labelPx(l.text) : 0);
		return [from, from + labelPx(l.text)];
	};
	const keep = (from: number, to: number) => labels.filter((l) => {
		const [a, b] = span(l);
		return b + 4 <= from || a >= to + 4;
	});
	const right = px + tw <= w ? keep(px, px + tw) : undefined;
	const left = px - tw >= 0 ? keep(px - tw, px) : undefined;
	if (right && (!left || right.length >= left.length)) return { labels: right, end: false };
	return { labels: left ?? keep(px, px + tw), end: !!left };
}

/** "May 10 – 24", "May 10 – Jun 2", "Dec 7, 2026 – Jan 4, 2027"; one day reads "May 24". */
export function rowDates(a: number, b: number): string {
	const da = new Date(a);
	const db = new Date(b);
	if (Math.floor(a / DAY) === Math.floor(b / DAY)) return day(a);
	if (da.getUTCFullYear() !== db.getUTCFullYear()) return `${day(a, true)} – ${day(b, true)}`;
	if (da.getUTCMonth() === db.getUTCMonth()) return `${day(a)} – ${db.getUTCDate()}`;
	return `${day(a)} – ${day(b)}`;
}

/** "May 3 – May 31, 2026" or "Mar 1, 2025 – Feb 29, 2028". */
export function spanText(a: number, b: number): string {
	if (Math.floor(a / DAY) === Math.floor(b / DAY)) return day(a, true);
	const sameYear = new Date(a).getUTCFullYear() === new Date(b).getUTCFullYear();
	return `${day(a, !sameYear)} – ${day(b, true)}`;
}

export function percentText(p: number | undefined): string {
	return p === undefined ? '' : p >= 100 ? 'Done' : `${Math.round(p)}%`;
}

/** "Development, May 10 to May 24, 60 percent done, after Design". */
export function rowLabel(r: GanttRow, rows: readonly GanttRow[]): string {
	const parts = [r.name];
	if (r.start === undefined || r.end === undefined) parts.push('no dates');
	else if (r.milestone) parts.push(`${day(r.start, true)}, milestone`);
	else parts.push(`${day(r.start, true)} to ${day(r.end, true)}`);
	if (r.progress !== undefined) parts.push(r.progress >= 100 ? 'done' : `${Math.round(r.progress)} percent done`);
	if (r.deps.length) parts.push(`after ${r.deps.map((d) => rows[d].name).join(' and ')}`);
	return parts.join(', ');
}

/** Narrow meta: "After Design" or "After Design +1". */
export function afterText(r: GanttRow, rows: readonly GanttRow[]): string {
	if (!r.deps.length) return '';
	return `After ${rows[r.deps[0]].name}${r.deps.length > 1 ? ` +${r.deps.length - 1}` : ''}`;
}
