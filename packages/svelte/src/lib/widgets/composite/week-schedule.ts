// widgets/composite/week-schedule.ts: the data side of the week-schedule
// widget. Reads model events (possibly half-streamed) into clean blocks on a
// day column and a minute range, lays overlapping blocks side by side in
// lanes, and picks each block's colour from a fixed palette.
//
// Invariants:
// - Every reader survives `{}` and junk. Events cap at 60; an event whose day
//   or start cannot be read is left out, never guessed.
// - Colours are palette constants keyed by name; a model colour that is not a
//   key falls back to a hash of the title, so model text never reaches CSS.
import { plain } from '../data-kit/format.js';
import { list, rec } from './recipe.js';

export const MAX_EVENTS = 60;
export const DEFAULT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const PALETTE: Record<string, string> = {
	blue: '#3b82f6',
	green: '#16a34a',
	orange: '#f97316',
	purple: '#8b5cf6',
	pink: '#ec4899',
	teal: '#0d9488',
	red: '#ef4444',
	yellow: '#ca8a04',
	gray: '#64748b'
};
const AUTO = ['blue', 'green', 'orange', 'purple', 'pink', 'teal'];

export function colorOf(color: unknown, title: string): string {
	const k = plain(color).trim().toLowerCase();
	if (PALETTE[k]) return PALETTE[k];
	let h = 0;
	for (const c of title) h = (h * 31 + c.charCodeAt(0)) | 0;
	return PALETTE[AUTO[Math.abs(h) % AUTO.length]];
}

/** "9:30", "09:30", "2pm", "2:15 PM" → minutes after midnight. */
export function toMin(v: unknown): number | undefined {
	const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*([ap]\.?m\.?)?$/i.exec(plain(v).trim());
	if (!m) return undefined;
	let h = +m[1];
	const min = +(m[2] ?? 0);
	const ap = m[3]?.[0].toLowerCase();
	if (ap === 'p' && h < 12) h += 12;
	if (ap === 'a' && h === 12) h = 0;
	if (h > 24 || min > 59) return undefined;
	return h * 60 + min;
}

export const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function duration(min: number): string {
	const h = Math.floor(min / 60);
	const m = min % 60;
	return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

export function readDayNames(v: unknown): string[] {
	const names = list(v)
		.map((d) => plain(d).trim().slice(0, 16))
		.filter(Boolean)
		.slice(0, 14);
	return names.length ? names : DEFAULT_DAYS;
}

/** Which column a model `day` belongs to: exact name, first three letters, or a 0-based index. */
export function dayIndex(day: unknown, days: string[]): number {
	if (typeof day === 'number') return Number.isInteger(day) && day >= 0 && day < days.length ? day : -1;
	const s = plain(day).trim().toLowerCase();
	if (!s) return -1;
	const exact = days.findIndex((d) => d.toLowerCase() === s);
	if (exact >= 0) return exact;
	return s.length >= 3 ? days.findIndex((d) => d.toLowerCase().slice(0, 3) === s.slice(0, 3)) : -1;
}

/** The column for today in the visitor's week, or -1 when today is not shown. */
export const todayIndex = (days: string[], now: Date) => dayIndex(WEEK[now.getDay()], days);

export interface Block {
	id: string;
	day: number;
	start: number;
	end: number;
	title: string;
	place: string;
	color: string;
}

export function readEvents(v: unknown, days: string[], from: number, to: number): Block[] {
	const out: Block[] = [];
	const seen = new Set<string>();
	list(v)
		.slice(0, MAX_EVENTS)
		.forEach((x, i) => {
			const r = rec(x);
			const day = dayIndex(r.day, days);
			let start = toMin(r.start);
			if (day < 0 || start === undefined) return;
			let end = toMin(r.end);
			if (end === undefined || end <= start) end = start + 30;
			start = Math.max(start, from);
			end = Math.min(end, to);
			if (end <= start) return;
			const title = plain(r.title).trim().slice(0, 80) || 'Untitled';
			let id = plain(r.id).trim() || `e${i}`;
			if (seen.has(id)) id = `${id}-${i}`;
			seen.add(id);
			out.push({ id, day, start, end, title, place: plain(r.place).trim().slice(0, 80), color: colorOf(r.color, title) });
		});
	return out.sort((a, b) => a.day - b.day || a.start - b.start || b.end - a.end);
}

/** Lanes for one day's blocks: overlapping blocks share a cluster and sit side by side. */
export function lanes(blocks: Block[]): Map<string, { lane: number; of: number }> {
	const out = new Map<string, { lane: number; of: number }>();
	const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
	let cluster: Block[] = [];
	let ends: number[] = [];
	let clusterEnd = -1;
	const flush = () => {
		for (const b of cluster) out.get(b.id)!.of = ends.length;
		cluster = [];
		ends = [];
	};
	for (const b of sorted) {
		if (b.start >= clusterEnd) flush();
		let lane = ends.findIndex((e) => e <= b.start);
		if (lane < 0) lane = ends.push(b.end) - 1;
		else ends[lane] = b.end;
		out.set(b.id, { lane, of: 1 });
		cluster.push(b);
		clusterEnd = Math.max(clusterEnd, b.end);
	}
	flush();
	return out;
}
