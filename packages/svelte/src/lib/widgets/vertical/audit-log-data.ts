// widgets/vertical/audit-log-data.ts: the pure half of audit-log. It turns the
// model's `entries` into rows the template only paints: plain text, a known
// severity (or none), a deduped type, a unique key, a parsed time and a details
// shape. Nothing here throws; bad items are skipped, bad fields degrade.
//
// Time is read with one regex, never `Date` parsing: YYYY-MM-DD, an optional
// [T ]HH:MM[:SS[.sss]] and an optional zone (Z, UTC, GMT, +HH:MM, +HHMM). Day
// keys and labels come from the written digits formatted in UTC, so an offset
// never moves a row to another day, and an impossible day (2026-02-31) fails
// the round trip and stays as written. Anything else is kept raw.
//
// Grouping keeps the model's row order inside a group, puts groups newest
// first, and sends rows with no usable date to a last "No exact date" group.
// When no row has a date, grouping is off.
import { plain } from '../data-kit/format.js';
import { safeArray, uniqueKeys } from '$lib/utils/safe-props.js';
import type { Status } from '../data-kit/types.js';

export type Severity = 'destructive' | 'warning' | 'success' | 'info';
export type ActorIconKey = 'user' | 'users' | 'bot' | 'cog' | 'server' | 'key' | 'shield' | 'mail';

export const SEVERITIES: readonly Severity[] = ['destructive', 'warning', 'success', 'info'];
export const SEVERITY_WORD: Record<Severity, string> = {
	destructive: 'Destructive',
	warning: 'Warning',
	success: 'Success',
	info: 'Info'
};
export const SEVERITY_STATUS: Record<Severity, Status> = {
	destructive: 'bad',
	warning: 'warn',
	success: 'good',
	info: 'info'
};

const SEVERITY_ALIAS: Record<string, Severity> = {
	destructive: 'destructive',
	error: 'destructive',
	critical: 'destructive',
	danger: 'destructive',
	fatal: 'destructive',
	warning: 'warning',
	warn: 'warning',
	success: 'success',
	ok: 'success',
	done: 'success',
	info: 'info',
	notice: 'info'
};

const ACTOR_ICON_KEYS: readonly ActorIconKey[] = ['user', 'users', 'bot', 'cog', 'server', 'key', 'shield', 'mail'];

export interface Stamp {
	raw: string;
	/** YYYY-MM-DD, only when the day is real. */
	day?: string;
	/** HH:MM as written (24 h). */
	time?: string;
	/** 'UTC' or 'UTC+05:30'. */
	zone?: string;
}

export type Details =
	| { kind: 'text'; text: string }
	| { kind: 'fields'; change?: { from: string; to: string }; fields: [string, string][] }
	| { kind: 'json'; text: string };

export interface Row {
	key: string;
	id: string | number | undefined;
	actor: string;
	actorIcon?: ActorIconKey;
	action: string;
	target: string;
	type: string;
	severity?: Severity;
	stamp: Stamp;
	details?: Details;
}

/** `true` / `"true"` and `false` / `"false"`; anything else is the default. */
export function flag(v: unknown, fallback: boolean): boolean {
	if (v === true || v === 'true') return true;
	if (v === false || v === 'false') return false;
	return fallback;
}

export function toSeverity(v: unknown): Severity | undefined {
	return typeof v === 'string' ? SEVERITY_ALIAS[v.trim().toLowerCase()] : undefined;
}

const STAMP = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:\s*(Z|UTC|GMT|[+-]\d{2}:?\d{2}))?)?$/i;

export function parseStamp(v: unknown): Stamp {
	const raw = typeof v === 'number' ? String(v) : plain(v);
	const m = STAMP.exec(raw);
	if (!m) return { raw };
	const [, y, mo, d, hh, mm, z] = m;
	const day = `${y}-${mo}-${d}`;
	const t = Date.UTC(+y, +mo - 1, +d);
	if (new Date(t).toISOString().slice(0, 10) !== day) return { raw };
	if (hh !== undefined && (+hh > 23 || +mm > 59)) return { raw };
	const out: Stamp = { raw, day };
	if (hh !== undefined) out.time = `${hh}:${mm}`;
	if (z) out.zone = zoneName(z);
	return out;
}

function zoneName(z: string): string {
	if (/^(z|utc|gmt)$/i.test(z)) return 'UTC';
	const digits = z.replace(':', '');
	if (/^[+-]0000$/.test(digits)) return 'UTC';
	return `UTC${digits.slice(0, 3)}:${digits.slice(3)}`;
}

function utc(day: string): number {
	const [y, m, d] = day.split('-').map(Number);
	return Date.UTC(y, m - 1, d);
}

function fmt(day: string, opts: Intl.DateTimeFormatOptions): string {
	return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(utc(day));
}

/** "Sat, Mar 14, 2026" */
export function dayHeading(day: string): string {
	return fmt(day, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/** "May 3" or, with year, "May 3, 2026". */
export function monthDay(day: string, withYear = false): string {
	return fmt(day, withYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });
}

/** "May 3, 2026", "May 2 – 3, 2026", "Apr 28 – May 3, 2026", "Dec 29, 2025 – Jan 4, 2026". */
export function dayRange(a: string, b: string): string {
	if (a === b) return monthDay(a, true);
	const [ya, ma] = a.split('-');
	const [yb, mb] = b.split('-');
	if (ya !== yb) return `${monthDay(a, true)} – ${monthDay(b, true)}`;
	if (ma !== mb) return `${monthDay(a)} – ${monthDay(b, true)}`;
	return `${monthDay(a)} – ${Number(b.slice(8))}, ${yb}`;
}

function addDays(day: string, n: number): string {
	return new Date(utc(day) + n * 86_400_000).toISOString().slice(0, 10);
}

/** The Monday that starts the week holding `day`. */
export function weekStart(day: string): string {
	return addDays(day, -((new Date(utc(day)).getUTCDay() + 6) % 7));
}

export function weekHeading(monday: string): string {
	return dayRange(monday, addDays(monday, 6));
}

/** A plain object (not an array, not null) or undefined. */
function record(v: unknown): Record<string, unknown> | undefined {
	return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

const ACRONYMS = new Set(['id', 'ip', 'url', 'uri', 'api', 'sso', 'mfa', 'ssh', 'dns', 'sku']);

/** `approvedBy` → "Approved by", `request_id` → "Request ID". */
export function humanizeKey(k: string): string {
	const words = k
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[_-]+/g, ' ')
		.trim()
		.toLowerCase()
		.split(/\s+/)
		.map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w));
	const s = words.join(' ');
	return s.charAt(0).toUpperCase() + s.slice(1);
}

function scalar(v: unknown): v is string | number | boolean | null {
	return v === null || ['string', 'number', 'boolean'].includes(typeof v);
}

function show(v: string | number | boolean | null): string {
	if (v === null) return 'None';
	if (typeof v === 'boolean') return v ? 'Yes' : 'No';
	return String(v);
}

/** The details shape, or undefined when there is nothing to show. */
export function toDetails(v: unknown): Details | undefined {
	if (v === undefined || v === null) return undefined;
	if (typeof v === 'string') return v.trim() ? { kind: 'text', text: v.trim() } : undefined;
	if (typeof v === 'number' || typeof v === 'boolean') return { kind: 'text', text: String(v) };
	if (Array.isArray(v)) return v.length ? { kind: 'json', text: json(v) } : undefined;
	const o = record(v);
	if (!o) return undefined;
	const keys = Object.keys(o);
	if (!keys.length) return undefined;
	if (!keys.every((k) => scalar(o[k]))) return { kind: 'json', text: json(o) };
	const pair = 'from' in o && 'to' in o ? ['from', 'to'] : 'before' in o && 'after' in o ? ['before', 'after'] : undefined;
	const change = pair
		? { from: show(o[pair[0]] as string | number | boolean | null), to: show(o[pair[1]] as string | number | boolean | null) }
		: undefined;
	const fields = keys
		.filter((k) => !pair?.includes(k))
		.map((k) => [humanizeKey(k), show(o[k] as string | number | boolean | null)] as [string, string]);
	return { kind: 'fields', change, fields };
}

function json(v: unknown): string {
	try {
		return JSON.stringify(v) ?? '';
	} catch {
		return String(v);
	}
}

const BOT_NAME = /^(system|automation|scheduler)$|bot$/i;

export function actorIconKey(name: string, explicit: unknown): ActorIconKey | undefined {
	if (typeof explicit === 'string' && (ACTOR_ICON_KEYS as readonly string[]).includes(explicit)) return explicit as ActorIconKey;
	return BOT_NAME.test(name) ? 'bot' : undefined;
}

/** Model entries in, renderable rows out. Non-object items are skipped. */
export function normalizeEntries(raw: unknown): Row[] {
	const items = safeArray(raw, { widget: 'audit-log', key: 'entries' }).filter(record) as Record<string, unknown>[];
	const keys = uniqueKeys(items, (e, i) => (e.id === undefined || e.id === null || e.id === '' ? `row-${i}` : e.id));
	return items.map((e, i) => {
		const actor = plain(e.actor);
		const id = typeof e.id === 'string' || typeof e.id === 'number' ? e.id : undefined;
		return {
			key: keys[i],
			id,
			actor,
			actorIcon: actorIconKey(actor, e.actorIcon),
			action: plain(e.action),
			target: typeof e.target === 'number' ? String(e.target) : plain(e.target),
			type: plain(e.type),
			severity: toSeverity(e.severity),
			stamp: parseStamp(e.timestamp),
			details: toDetails(e.details)
		};
	});
}

/** Distinct values, compared case-insensitively, first spelling wins. */
export function facets(values: string[]): string[] {
	const seen = new Map<string, string>();
	for (const v of values) if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
	return [...seen.values()];
}

/** "Auth" from "auth". */
export function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

export type GroupBy = 'none' | 'day' | 'week';

export interface Group {
	key: string;
	label: string;
	rows: Row[];
}

/** Grouping is on only for day/week with at least one dated row. */
export function effectiveGroupBy(rows: Row[], groupBy: unknown): GroupBy {
	if (groupBy !== 'day' && groupBy !== 'week') return 'none';
	return rows.some((r) => r.stamp.day) ? groupBy : 'none';
}

export function groupEntries(rows: Row[], groupBy: GroupBy): Group[] {
	if (groupBy === 'none') return [{ key: 'all', label: '', rows }];
	const map = new Map<string, Row[]>();
	const undated: Row[] = [];
	for (const r of rows) {
		if (!r.stamp.day) {
			undated.push(r);
			continue;
		}
		const k = groupBy === 'day' ? r.stamp.day : weekStart(r.stamp.day);
		map.set(k, [...(map.get(k) ?? []), r]);
	}
	const groups: Group[] = [...map.keys()]
		.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
		.map((k) => ({ key: k, label: groupBy === 'day' ? dayHeading(k) : weekHeading(k), rows: map.get(k)! }));
	if (undated.length) groups.push({ key: 'undated', label: 'No exact date', rows: undated });
	return groups;
}

/** One zone shared by every timed row ("UTC"), or undefined when mixed or absent. */
export function sharedZone(rows: Row[]): string | undefined {
	const zones = new Set(rows.filter((r) => r.stamp.time).map((r) => r.stamp.zone));
	if (zones.size !== 1) return undefined;
	return [...zones][0];
}

/** True when timed rows disagree on zone, so each row names its own. */
export function mixedZones(rows: Row[]): boolean {
	return new Set(rows.filter((r) => r.stamp.time).map((r) => r.stamp.zone ?? '')).size > 1;
}

/**
 * The row's time slot: "14:32" inside a day group, "May 3, 14:32" otherwise,
 * the date alone for a date-only stamp, the raw text when it did not parse.
 */
export function rowTime(s: Stamp, opts: { inDay: boolean; withZone: boolean; withYear: boolean }): string {
	if (!s.day) return s.raw;
	const zone = opts.withZone && s.zone ? ` ${s.zone}` : '';
	const time = s.time ? `${s.time}${zone}` : '';
	if (opts.inDay) return time;
	const date = monthDay(s.day, opts.withYear);
	return time ? `${date}, ${time}` : date;
}

/** For screen readers: "May 3 at 13:15 UTC". */
export function spokenTime(s: Stamp): string {
	if (!s.day) return s.raw;
	return s.time ? `${monthDay(s.day)} at ${s.time}${s.zone ? ` ${s.zone}` : ''}` : monthDay(s.day);
}

/** "4 events · May 2 – 3, 2026 · times in UTC" */
export function summaryLine(rows: Row[]): string {
	const parts = [`${rows.length} ${rows.length === 1 ? 'event' : 'events'}`];
	const days = rows.map((r) => r.stamp.day).filter((d): d is string => !!d).sort();
	if (days.length) parts.push(dayRange(days[0], days[days.length - 1]));
	const zone = sharedZone(rows);
	if (zone) parts.push(`times in ${zone}`);
	return parts.join(' · ');
}

/** "a / b" target pieces with a break opportunity after / : . @ - */
export function breakable(s: string): string[] {
	return s.split(/(?<=[/:.@-])/);
}
