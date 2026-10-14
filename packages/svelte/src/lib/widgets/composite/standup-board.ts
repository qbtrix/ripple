// widgets/composite/standup-board.ts: the pure half of the standup-board
// widget. It turns the model's people (forgiving about shape, synonyms and
// junk) into clean rows, orders them blocked, on track, done, away, derives
// the open-blocker count and the verdict sentence, and reads the bound value.
//
// Invariants:
// - A real blocker wins: blocker text makes a person blocked whatever their
//   status says. `status: 'blocked'` with no text is blocked with no detail.
// - The open count and the verdict are derived from people + resolved ids,
//   never stored. Resolving is an overlay: the model's people are not edited.
// - Ids are the slugified name, with -2, -3 on repeats, so `value.resolved`
//   survives a re-sent spec with the same people.
import { plain } from '../data-kit/format.js';
import type { Verdict } from '../data-kit/types.js';
import { list, rec } from './recipe.js';

export const MAX_PEOPLE = 20;

export type StandupStatus = 'blocked' | 'on-track' | 'done' | 'away';

export interface Person {
	id: string;
	name: string;
	role: string;
	avatar: string;
	yesterday: string;
	today: string;
	/** The blocker sentence, '' when blocked with no detail or not blocked. */
	blocker: string;
	status: StandupStatus;
}

export interface StandupValue {
	resolved: string[];
}

const NO_BLOCKER = new Set(['', 'none', 'n/a', 'na', '-', 'no', 'nope', 'nothing', 'no blockers', 'null']);
const SYNONYMS: Record<string, StandupStatus> = {
	blocked: 'blocked',
	stuck: 'blocked',
	'on-track': 'on-track',
	on_track: 'on-track',
	ontrack: 'on-track',
	'on track': 'on-track',
	ok: 'on-track',
	active: 'on-track',
	done: 'done',
	complete: 'done',
	completed: 'done',
	shipped: 'done',
	away: 'away',
	ooo: 'away',
	out: 'away',
	off: 'away',
	pto: 'away',
	leave: 'away'
};

/** A model status word onto the four; unknown or missing is on-track. */
export const toStandupStatus = (v: unknown): StandupStatus => SYNONYMS[plain(v).toLowerCase()] ?? 'on-track';

/** Blocker text that means "no blocker" ("none", "n/a", "-") reads as ''. */
export function blockerText(v: unknown): string {
	const t = plain(v);
	return NO_BLOCKER.has(t.toLowerCase().replace(/[.!]+$/, '')) ? '' : t;
}

export const slug = (name: string): string =>
	name
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '') || 'person';

/** People from `people` (or `members`), at most MAX_PEOPLE, plus how many more there were. */
export function readPeople(people: unknown, members?: unknown): { people: Person[]; more: number } {
	const raw = Array.isArray(people) ? people : list(members);
	const out: Person[] = [];
	const seen = new Map<string, number>();
	let more = 0;
	for (const r of raw) {
		const p = typeof r === 'string' ? { name: r } : rec(r);
		const name = plain(p.name);
		if (!name) continue;
		if (out.length >= MAX_PEOPLE) {
			more++;
			continue;
		}
		const base = slug(name);
		const n = (seen.get(base) ?? 0) + 1;
		seen.set(base, n);
		const blocker = blockerText(p.blocker ?? p.blockers);
		const said = toStandupStatus(p.status);
		out.push({
			id: n > 1 ? `${base}-${n}` : base,
			name,
			role: plain(p.role),
			avatar: typeof p.avatar === 'string' ? p.avatar.trim() : '',
			yesterday: plain(p.yesterday),
			today: plain(p.today),
			blocker,
			status: blocker ? 'blocked' : said
		});
	}
	return { people: out, more };
}

const ORDER: Record<StandupStatus, number> = { blocked: 0, 'on-track': 1, done: 2, away: 3 };

/** Blocked, on track, done, away; model order kept inside each group. */
export const ordered = (people: readonly Person[]): Person[] =>
	people
		.map((p, i) => [p, i] as const)
		.sort((a, b) => ORDER[a[0].status] - ORDER[b[0].status] || a[1] - b[1])
		.map(([p]) => p);

/** Blocked people whose blocker the viewer has not resolved. */
export const openBlocked = (people: readonly Person[], resolved: readonly string[]): Person[] =>
	people.filter((p) => p.status === 'blocked' && !resolved.includes(p.id));

/** The bound value, cleaned; undefined when it carries no resolved list. */
export function toValue(raw: unknown): StandupValue | undefined {
	const r = rec(raw);
	if (!Array.isArray(r.resolved)) return undefined;
	return { resolved: [...new Set(r.resolved.filter((v): v is string => typeof v === 'string' && v !== ''))] };
}

/** First and last initials, as AvatarGroup does. */
export function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (!parts.length) return '';
	const first = [...parts[0]][0] ?? '';
	const last = parts.length > 1 ? ([...parts[parts.length - 1]][0] ?? '') : '';
	return (first + last).toUpperCase();
}

/** A stable hue for a name's initials tint, never in the brand-blue band (200 to 280). */
export function nameHue(name: string): number {
	let h = 0;
	for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
	const free = 280; // 360 minus the 80-degree blue band
	const x = h % free;
	return x < 200 ? x : x + 80;
}

const firstName = (p: Person, all: readonly Person[]) => {
	const f = p.name.split(/\s+/)[0];
	return all.filter((q) => q.name.split(/\s+/)[0] === f).length > 1 ? p.name : f;
};

/** Up to six whole words, with a trailing ellipsis only when words were dropped. */
export function firstWords(text: string, n = 6): string {
	const words = text.split(/\s+/).filter(Boolean);
	const cut = words.slice(0, n).join(' ').replace(/[.,;:!?]+$/, '');
	return words.length > n ? `${cut}…` : cut;
}

const joinNames = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** The derived headline when the model wrote no summary. */
export function deriveVerdict(people: readonly Person[], resolved: readonly string[]): Verdict | undefined {
	if (!people.length) return undefined;
	const open = openBlocked(people, resolved);
	const silent = people.every((p) => !p.yesterday && !p.today && p.status !== 'blocked' && p.status !== 'away' && p.status !== 'done');
	if (silent) return { text: 'No updates yet.', status: 'neutral' };
	if (!open.length) return { text: 'Everyone is unblocked.', status: 'good' };
	if (open.length === 1) {
		const p = open[0];
		const who = firstName(p, people);
		return { text: p.blocker ? `${who} is blocked: ${firstWords(p.blocker)}.`.replace(/…\.$/, '…') : `${who} is blocked.`, status: 'bad' };
	}
	if (open.length <= 3) return { text: `${joinNames(open.map((p) => firstName(p, people)))} are blocked.`, status: 'bad' };
	const total = people.length;
	return { text: open.length === total ? `All ${total} are blocked.` : `${open.length} of ${total} are blocked.`, status: 'bad' };
}

/** The phone layout folds each blocked person's Today when this many are blocked. */
export const manyBlocked = (blocked: number, total: number) => blocked >= 4 || (total >= 5 && blocked * 2 >= total);
