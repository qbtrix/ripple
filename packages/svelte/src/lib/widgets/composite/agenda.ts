// widgets/composite/agenda.ts: the data side of the agenda widget. Reads model
// items (possibly half-streamed) into a clean list with unique ids and sane
// minutes, works out each item's start time from the meeting start and the
// running total, and moves items for reordering.
//
// Invariants:
// - Every reader survives `{}` and junk; items cap at 30, minutes at 1..240.
// - Functions return new arrays; the bound value is never mutated in place.
import { finite, plain } from '../data-kit/format.js';
import { list, rec } from './recipe.js';
import { hhmm, toMin } from './week-schedule.js';

export const MAX_ITEMS = 30;

export interface AgendaItem {
	id: string;
	title: string;
	owner: string;
	minutes: number;
	notes: string;
	done: boolean;
}

export const clampMinutes = (v: unknown, fallback = 5) => {
	const n = finite(v);
	return n === undefined ? fallback : Math.min(Math.max(Math.round(n), 1), 240);
};

export function readItems(v: unknown): AgendaItem[] {
	const seen = new Set<string>();
	return list(v)
		.slice(0, MAX_ITEMS)
		.map((x, i) => {
			const r = rec(x);
			let id = plain(r.id).trim() || `i${i}`;
			if (seen.has(id)) id = `${id}-${i}`;
			seen.add(id);
			return {
				id,
				title: plain(r.title).trim().slice(0, 120) || 'Untitled',
				owner: plain(r.owner).trim().slice(0, 40),
				minutes: clampMinutes(r.minutes),
				notes: plain(r.notes).trim().slice(0, 400),
				done: r.done === true
			};
		});
}

/** A bound value back to clean items, or undefined when nothing is bound. */
export const toItems = (v: unknown): AgendaItem[] | undefined => (Array.isArray(v) ? readItems(v) : undefined);

export const startMin = (v: unknown) => toMin(v);

/** Each item's start: a clock time from `start`, else an offset like "+0:15". */
export function startLabels(items: AgendaItem[], start: number | undefined): string[] {
	let at = 0;
	return items.map((it) => {
		const label = start === undefined ? `+${Math.floor(at / 60)}:${String(at % 60).padStart(2, '0')}` : hhmm(start + at);
		at += it.minutes;
		return label;
	});
}

export function move<T>(arr: T[], from: number, to: number): T[] {
	if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
	const next = [...arr];
	const [x] = next.splice(from, 1);
	next.splice(to, 0, x);
	return next;
}

/** Seconds as "4:05". */
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export const initials = (name: string) =>
	name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0].toUpperCase())
		.join('');
