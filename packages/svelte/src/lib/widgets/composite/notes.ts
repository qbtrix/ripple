// widgets/composite/notes.ts: the plain logic behind the notes widget: the
// normaliser that turns model props (or a bound value) into a clean NotesValue,
// inline `#tag` parsing, the tag list, filtering and the relative-time label.
//
// Invariants:
// - Everything is plain text. Caps hold here, not in the markup: 50 notes,
//   title 80, text 2000, 8 tags of 24 chars per note.
// - A tag is lowercase letters, digits, `-` or `_` after a `#` that starts a
//   word; parsing strips it from the text so the card shows it as a chip.
// - Ids are unique; an id-less note gets `n${index + 1}`, so a streamed note
//   keeps its id as the rest of the array arrives.
import { plain } from '../data-kit/format.js';
import { list, rec } from './recipe.js';

export const MAX_NOTES = 50;
export const MAX_TITLE = 80;
export const MAX_TEXT = 2000;
export const MAX_TAGS = 8;
export const MAX_TAG = 24;

export const NOTE_COLORS = ['plain', 'yellow', 'blue', 'green', 'pink'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export interface Note {
	id: string;
	title: string;
	text: string;
	tags: string[];
	pinned: boolean;
	color: NoteColor;
	/** Epoch ms of the visitor's last save. Model notes have none. */
	at?: number;
}

export interface NotesValue {
	notes: Note[];
}

const TAG_RE = /(^|\s)#([\p{L}\p{N}_-]+)[ \t]?/gu;

export function cleanTag(v: unknown): string {
	const t = (typeof v === 'string' ? v : '').trim().replace(/^#/, '').toLowerCase();
	return /^[\p{L}\p{N}_-]+$/u.test(t) ? t.slice(0, MAX_TAG) : '';
}

export function cleanTags(raw: Iterable<unknown>, max = MAX_TAGS): string[] {
	return [...new Set([...raw].map(cleanTag).filter(Boolean))].slice(0, max);
}

/** Pull `#tags` out of a line of writing: the text without them, and the tags. */
export function parseTags(s: string): { text: string; tags: string[] } {
	const tags: string[] = [];
	const text = s
		.replace(TAG_RE, (_m, lead: string, tag: string) => {
			tags.push(tag);
			return lead;
		})
		.replace(/[ \t]{2,}/g, ' ')
		.replace(/ +([,.;:!?])/g, '$1')
		.replace(/[ \t]+$/gm, '')
		.trim();
	return { text, tags: cleanTags(tags) };
}

const isColor = (v: unknown): v is NoteColor => (NOTE_COLORS as readonly unknown[]).includes(v);

/** The first free `nN` id. */
export function nextNoteId(notes: readonly { id: string }[]): string {
	const used = new Set(notes.map((n) => n.id));
	let n = notes.length + 1;
	while (used.has(`n${n}`)) n++;
	return `n${n}`;
}

/** Up to 50 notes with a title or text and unique ids. Strings are text-only notes. */
export function readNotes(raw: unknown): Note[] {
	const out: Note[] = [];
	const ids = new Set<string>();
	list(raw).forEach((r, i) => {
		if (out.length >= MAX_NOTES) return;
		const n = typeof r === 'string' ? { text: r } : rec(r);
		const title = plain(n.title).slice(0, MAX_TITLE);
		const text = plain(n.text).slice(0, MAX_TEXT);
		if (!title && !text) return;
		let id = typeof n.id === 'string' || typeof n.id === 'number' ? String(n.id).trim() : '';
		if (!id) id = `n${i + 1}`;
		if (ids.has(id)) id = `${id}-${i}`;
		ids.add(id);
		const at = typeof n.at === 'number' && Number.isFinite(n.at) ? n.at : undefined;
		out.push({
			id,
			title,
			text,
			tags: cleanTags(list(n.tags)),
			pinned: n.pinned === true,
			color: isColor(n.color) ? n.color : 'plain',
			...(at === undefined ? {} : { at })
		});
	});
	return out;
}

/** A bound or edited value, cleaned; undefined when it carries no notes key. */
export function toValue(raw: unknown): NotesValue | undefined {
	const r = rec(raw);
	return Array.isArray(r.notes) ? { notes: readNotes(r.notes) } : undefined;
}

/** Pinned first, otherwise array order (newest first, since new notes go on top). */
export const ordered = (notes: readonly Note[]): Note[] => [...notes.filter((n) => n.pinned), ...notes.filter((n) => !n.pinned)];

/** Tags on notes (most used first), then the suggested ones. */
export function allTags(notes: readonly Note[], suggested: unknown): string[] {
	const count = new Map<string, number>();
	for (const n of notes) for (const t of n.tags) count.set(t, (count.get(t) ?? 0) + 1);
	const used = [...count.keys()].sort((a, b) => count.get(b)! - count.get(a)!);
	return cleanTags([...used, ...list(suggested)], 24);
}

export function matches(n: Note, tag: string, query: string): boolean {
	if (tag && !n.tags.includes(tag)) return false;
	const q = query.trim().toLowerCase();
	return !q || `${n.title}\n${n.text}\n${n.tags.join(' ')}`.toLowerCase().includes(q);
}

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function ago(at: number, now: number): string {
	const s = Math.max(0, Math.round((now - at) / 1000));
	if (s < 60) return 'just now';
	if (s < 3600) return `${Math.floor(s / 60)} min ago`;
	if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
	return `${Math.floor(s / 86400)} d ago`;
}

/** A note's writing as the editor shows it: tags back at the end as `#tag`. */
export const asDraft = (n: Note): { title: string; text: string } => ({
	title: n.title,
	text: [n.text, n.tags.map((t) => `#${t}`).join(' ')].filter(Boolean).join(n.text ? '\n' : '')
});

/** Editor writing to note fields, or null when there is nothing written. */
export function fromDraft(title: string, text: string): Pick<Note, 'title' | 'text' | 'tags'> | null {
	const a = parseTags(title);
	const b = parseTags(text);
	const t = a.text.slice(0, MAX_TITLE);
	const x = b.text.slice(0, MAX_TEXT);
	const tags = cleanTags([...a.tags, ...b.tags]);
	if (!t && !x && !tags.length) return null;
	return { title: t, text: x, tags };
}
