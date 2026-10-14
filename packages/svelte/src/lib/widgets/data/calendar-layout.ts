// widgets/data/calendar-layout.ts: the data side of the `calendar` widget.
// Pure and DOM-free: it reads model events into clean day ranges, picks the
// period the card opens on, lists the weeks to draw, cuts events into
// per-week segments with stable lanes, and groups the agenda. Calendar.svelte
// only lays out what this returns.
//
// Invariants:
// - Days are integers (days since 1970-01-01, UTC), built from the ISO
//   string's own digits, so no timezone can move an event to another day.
// - Nothing here throws. A start that is not an ISO day ("next Tuesday",
//   "2026-02-31") is kept in `undated`, never dropped silently. Events cap at
//   MAX_EVENTS.
// - Colours are a 3- or 6-digit hex or a palette constant; any other model
//   text falls back to the title hash, so model text never reaches CSS.
// - Weeks start on Sunday for every locale.
import { plain } from '../data-kit/format.js';
import { colorOf } from '../composite/week-schedule.js';
import { uniqueKeys } from '$lib/utils/safe-props.js';

export const MAX_EVENTS = 300;
const DAY_MS = 86_400_000;

export type View = 'month' | 'week';

export interface CalEvent {
	key: string;
	/** The model's object, handed back to on_select untouched. */
	raw: unknown;
	/** Plain title; '' when the model gave none. */
	title: string;
	start: number;
	/** Inclusive last day. */
	end: number;
	/** 'H:MM' from the string's digits when the start carries a time. */
	time?: string;
	minutes: number;
	color: string;
}

export interface Parsed {
	events: CalEvent[];
	undated: { key: string; title: string }[];
	capped: boolean;
}

// ── Days ────────────────────────────────────────────────────────────────────
const ISO = /^\s*(\d{4})-(\d{2})-(\d{2})(?:$|[T ](\d{2}):(\d{2}))?/;

/** An ISO day (and time) from a string's digits, or undefined. */
export function readDay(v: unknown): { day: number; time?: string; minutes: number } | undefined {
	if (typeof v !== 'string') return undefined;
	const m = ISO.exec(v);
	if (!m) return undefined;
	const [y, mo, d] = [+m[1], +m[2] - 1, +m[3]];
	const t = Date.UTC(y, mo, d);
	const back = new Date(t);
	// Date.UTC rolls 2026-02-31 over to March 3; the round trip catches it.
	if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo || back.getUTCDate() !== d) return undefined;
	const h = m[4] === undefined ? undefined : +m[4];
	const min = m[5] === undefined ? 0 : +m[5];
	const timed = h !== undefined && h < 24 && min < 60;
	return { day: t / DAY_MS, time: timed ? `${h}:${m[5]}` : undefined, minutes: timed ? h * 60 + min : -1 };
}

export const dayDate = (day: number) => new Date(day * DAY_MS);
export const isoOf = (day: number) => dayDate(day).toISOString().slice(0, 10);
/** 0 = Sunday. 1970-01-01 was a Thursday. */
export const weekday = (day: number) => (((day + 4) % 7) + 7) % 7;
/** The visitor's calendar day for a clock reading. */
export const localDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS;

export function monthStart(day: number): number {
	const d = dayDate(day);
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / DAY_MS;
}
export function monthEnd(day: number): number {
	const d = dayDate(day);
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0) / DAY_MS;
}
export const weekStart = (day: number) => day - weekday(day);

/** First and last day of the period holding `day`. */
export function period(day: number, view: View): [number, number] {
	return view === 'week' ? [weekStart(day), weekStart(day) + 6] : [monthStart(day), monthEnd(day)];
}

/** The period `delta` steps from the one starting at `start`. */
export function shiftPeriod(start: number, view: View, delta: number): number {
	if (view === 'week') return start + 7 * delta;
	const d = dayDate(start);
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1) / DAY_MS;
}

const overlaps = (e: CalEvent, from: number, to: number) => e.start <= to && e.end >= from;

// ── Events ──────────────────────────────────────────────────────────────────
/** A safe CSS colour: hex as given, palette names, else the title hash. */
export function eventColor(color: unknown, title: string): string {
	if (typeof color === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color.trim())) return color.trim().toLowerCase();
	return colorOf(color, title);
}

export function parseEvents(v: unknown): Parsed {
	const all = Array.isArray(v) ? v : [];
	const items = all.slice(0, MAX_EVENTS).map((x) => (x !== null && typeof x === 'object' ? (x as Record<string, unknown>) : {}));
	const keys = uniqueKeys(items, (r, i) => (r.id === undefined || r.id === null ? `i${i}` : r.id));
	const events: CalEvent[] = [];
	const undated: Parsed['undated'] = [];
	items.forEach((r, i) => {
		const title = plain(r.title).slice(0, 200);
		const s = readDay(r.start);
		if (!s) {
			undated.push({ key: keys[i], title });
			return;
		}
		const e = readDay(r.end);
		let [start, end] = [s.day, e ? e.day : s.day];
		if (end < start) [start, end] = [end, start];
		events.push({ key: keys[i], raw: all[i], title, start, end, time: s.time, minutes: s.minutes, color: eventColor(r.color, title) });
	});
	return { events, undated, capped: all.length > MAX_EVENTS };
}

// ── Which period opens ──────────────────────────────────────────────────────
/** First day of the period the card opens on (brief 3.1, five rungs). */
export function openPeriod(events: CalEvent[], value: unknown, view: View, today: number): number {
	const at = (day: number) => period(day, view)[0];
	const v = readDay(value);
	if (v) return at(v.day);
	if (!events.length) return at(today);
	const [from, to] = period(today, view);
	if (events.some((e) => overlaps(e, from, to))) return at(today);
	const ahead = events.filter((e) => e.start >= today);
	if (ahead.length) return at(Math.min(...ahead.map((e) => e.start)));
	return at(Math.max(...events.map((e) => e.start)));
}

/** Sundays of the weeks the period touches: 4 to 6 for a month, 1 for a week. */
export function weeksOf(start: number, view: View): number[] {
	if (view === 'week') return [weekStart(start)];
	const first = weekStart(monthStart(start));
	const last = monthEnd(start);
	const out: number[] = [];
	for (let w = first; w <= last; w += 7) out.push(w);
	return out;
}

// ── Week segments and lanes ─────────────────────────────────────────────────
export interface Segment {
	ev: CalEvent;
	col: number;
	span: number;
	lane: number;
	/** The event started before this week (square left end, no edge). */
	before: boolean;
	/** The event runs on past this week (square right end). */
	after: boolean;
}

export interface WeekLayout {
	segments: Segment[];
	/** Lanes drawn (visible ones only). */
	lanes: number;
	/** Hidden events per weekday column. */
	more: number[];
	/** Every event touching each day, in lane order (dots, counts). */
	days: CalEvent[][];
}

const byDayOrder = (a: CalEvent, b: CalEvent) =>
	a.start - b.start || b.end - b.start - (a.end - a.start) || a.minutes - b.minutes;

/** Segments for one week; lanes longest first, then by start. Lanes at or past `cap` are hidden. */
export function layoutWeek(events: CalEvent[], sunday: number, cap = Infinity): WeekLayout {
	const sat = sunday + 6;
	const segs = events
		.filter((e) => overlaps(e, sunday, sat))
		.map((ev) => {
			const s = Math.max(ev.start, sunday);
			const e = Math.min(ev.end, sat);
			return { ev, col: s - sunday, span: e - s + 1, lane: 0, before: ev.start < sunday, after: ev.end > sat };
		})
		.sort((a, b) => b.span - a.span || a.col - b.col || a.ev.minutes - b.ev.minutes);
	// Each lane is a row of 7 taken flags; a segment takes the first lane free across its days.
	const taken: boolean[][] = [];
	for (const s of segs) {
		const cols = Array.from({ length: s.span }, (_, i) => s.col + i);
		let lane = taken.findIndex((row) => cols.every((c) => !row[c]));
		if (lane < 0) lane = taken.push(Array(7).fill(false)) - 1;
		for (const c of cols) taken[lane][c] = true;
		s.lane = lane;
	}
	const more = [0, 0, 0, 0, 0, 0, 0];
	const days: CalEvent[][] = [[], [], [], [], [], [], []];
	const ordered = [...segs].sort((a, b) => a.lane - b.lane);
	for (const s of ordered) {
		for (let c = s.col; c < s.col + s.span; c++) {
			days[c].push(s.ev);
			if (s.lane >= cap) more[c]++;
		}
	}
	const shown = segs.filter((s) => s.lane < cap);
	return { segments: shown, lanes: Math.min(taken.length, cap), more, days };
}

// ── Agenda ──────────────────────────────────────────────────────────────────
export interface AgendaDay {
	day: number;
	events: CalEvent[];
	/** Spans that started earlier and still cover this day (week view note). */
	continuing: CalEvent[];
}

/**
 * Events in [from, to] grouped by day in date order. A span lists once, under
 * its first visible day. `everyDay` keeps days without events (week view).
 * Within a day: spans and all-day events first, then by time.
 */
export function agenda(events: CalEvent[], from: number, to: number, everyDay = false): AgendaDay[] {
	const groups = new Map<number, AgendaDay>();
	if (everyDay) for (let d = from; d <= to; d++) groups.set(d, { day: d, events: [], continuing: [] });
	const inside = events.filter((e) => overlaps(e, from, to)).sort(byDayOrder);
	for (const e of inside) {
		const d = Math.max(e.start, from);
		if (!groups.has(d)) groups.set(d, { day: d, events: [], continuing: [] });
		groups.get(d)!.events.push(e);
		if (everyDay) for (let c = d + 1; c <= Math.min(e.end, to); c++) groups.get(c)!.continuing.push(e);
	}
	const out = [...groups.values()].sort((a, b) => a.day - b.day);
	for (const g of out) g.events.sort((a, b) => Number(a.minutes >= 0) - Number(b.minutes >= 0) || a.minutes - b.minutes);
	return out;
}

/** Events touching [from, to]. */
export const countIn = (events: CalEvent[], from: number, to: number) => events.filter((e) => overlaps(e, from, to)).length;

/** Where to send a reader from an empty period: the next event after it, else the last one before it. */
export function nearest(events: CalEvent[], from: number, to: number): { dir: 'next' | 'last'; ev: CalEvent } | undefined {
	const after = events.filter((e) => e.start > to).sort((a, b) => a.start - b.start)[0];
	if (after) return { dir: 'next', ev: after };
	const before = events.filter((e) => e.end < from).sort((a, b) => b.start - a.start)[0];
	return before ? { dir: 'last', ev: before } : undefined;
}

// ── Formatting ──────────────────────────────────────────────────────────────
/** An Intl formatter in UTC days; a bad locale falls back to the runtime default. */
function formatter(locale: string | undefined, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
	try {
		return new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' });
	} catch {
		return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: 'UTC' });
	}
}

export function fmt(locale: string | undefined, opts: Intl.DateTimeFormatOptions): (day: number) => string {
	const f = formatter(locale, opts);
	return (day) => f.format(dayDate(day));
}

/**
 * A day range in the locale's own words via formatRange, so a German card
 * reads "16.-19. Nov." (with the locale's dash) instead of an English joiner.
 * The year is added when asked. Runtimes without formatRange get
 * "May 20 to 22". One day is just that day.
 */
export function rangeLabel(start: number, end: number, locale?: string, year = false): string {
	const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) };
	const f = formatter(locale, opts);
	if (start === end) return f.format(dayDate(start));
	try {
		return f.formatRange(dayDate(start), dayDate(end));
	} catch {
		const md = fmt(locale, { month: 'short', day: 'numeric' });
		const sameMonth = monthStart(start) === monthStart(end);
		const out = `${md(start)} to ${sameMonth ? fmt(locale, { day: 'numeric' })(end) : md(end)}`;
		return year ? `${out}, ${fmt(locale, { year: 'numeric' })(end)}` : out;
	}
}
