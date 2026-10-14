// widgets/data/kanban-board.ts: the pure half of the kanban widget. It turns
// model-written columns and cards into lanes, reads card text, tames a lane
// colour and performs a move. Nothing here throws or reads the DOM at module
// top level, so it runs the same under SSR, jsdom and the browser.
//
// Invariants:
// - Every card lands in exactly one lane. A card whose status matches no lane
//   (or has none) goes to a trailing `Other` lane that exists only when it has
//   cards. Lane counts always sum to the number of cards.
// - Cards are identified by their index in `value`, never by `id`, so two
//   cards sharing an id move independently.
// - Status matching is case- and separator-blind: "In Progress",
//   "in_progress" and "in-progress" are one lane.
import { finite, plain } from '../data-kit/format.js';

export type KanbanColumn = { id?: unknown; title?: unknown; color?: unknown; accentClass?: unknown };
export type KanbanCard = Record<string, unknown>;

export interface LaneItem {
	card: KanbanCard;
	/** Position in the original `value` array. */
	index: number;
}

export interface Lane {
	/** Unique render key. */
	key: string;
	/** The id a card moved here gets; undefined for `Other` (not a move target). */
	id: string | undefined;
	title: string;
	other: boolean;
	/** CSS colour for the dot, already tamed; undefined means no inline colour. */
	dot: string | undefined;
	/** Class for the dot (showcase `accentClass`). */
	dotClass: string | undefined;
	items: LaneItem[];
}

/** One lane id, case and separator blind. */
export function norm(v: string): string {
	return v
		.trim()
		.toLowerCase()
		.replace(/[\s_-]+/g, '-');
}

/** A lane title from a raw id: first letter upper-cased, `-`/`_` shown as spaces. */
export function titleFromId(v: string): string {
	const s = v.replace(/[-_]+/g, ' ').trim();
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Display text from a string or finite number; anything else is ''. */
export function text(v: unknown): string {
	if (typeof v === 'string') return plain(v);
	if (typeof v === 'number') return finite(v) === undefined ? '' : String(v);
	return '';
}

const TITLE_FALLBACKS = ['title', 'name', 'label', 'text'];

/** The card's title through titleKey, then title/name/label/text; '' when none. */
export function cardTitle(card: KanbanCard, titleKey: string): string {
	for (const k of [titleKey, ...TITLE_FALLBACKS]) {
		const t = text(card?.[k]);
		if (t) return t;
	}
	return '';
}

const STATUS_DOTS: Record<string, string> = {
	green: 'success',
	success: 'success',
	done: 'success',
	amber: 'warning',
	yellow: 'warning',
	orange: 'warning',
	warning: 'warning',
	red: 'error',
	error: 'error',
	danger: 'error',
	blue: 'info',
	info: 'info'
};
const NEUTRAL = new Set(['gray', 'grey', 'neutral']);
const CSS_COLOUR = /^(#[0-9a-f]{3,8}|(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([\d\s.,%/+-]+\)|[a-z]{3,24})$/i;

/** A lane colour as a CSS value: status words map to tokens, other valid colours are mixed toward the surface. */
export function dotColour(v: unknown): string | undefined {
	if (typeof v !== 'string') return undefined;
	const c = v.trim();
	const key = c.toLowerCase();
	if (STATUS_DOTS[key]) return `var(--ripple-${STATUS_DOTS[key]})`;
	if (NEUTRAL.has(key)) return 'var(--ripple-muted-foreground)';
	if (!CSS_COLOUR.test(c)) return undefined;
	if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && !CSS.supports('color', c)) return undefined;
	return `color-mix(in oklab, ${c} 75%, var(--ripple-surface))`;
}

function lane(key: string, id: string | undefined, title: string, col?: KanbanColumn): Lane {
	const dotClass = typeof col?.accentClass === 'string' && col.accentClass.trim() ? col.accentClass : undefined;
	return { key, id, title, other: false, dot: dotColour(col?.color), dotClass, items: [] };
}

/** Group cards into lanes (see the invariants above). */
export function buildBoard(columns: unknown, cards: unknown, columnKey: string): Lane[] {
	const cols = (Array.isArray(columns) ? columns : []).filter(
		(c): c is KanbanColumn => c != null && typeof c === 'object' && !Array.isArray(c)
	);
	const list = Array.isArray(cards) ? cards : [];
	const lanes: Lane[] = [];
	const byId = new Map<string, Lane>();
	const derive = cols.length === 0;

	cols.forEach((c, i) => {
		const raw = typeof c.id === 'string' || typeof c.id === 'number' ? String(c.id) : '';
		const title = text(c.title) || titleFromId(raw) || `Lane ${i + 1}`;
		const l = lane(`c${i}`, raw, title, c);
		lanes.push(l);
		const n = norm(raw);
		if (n && !byId.has(n)) byId.set(n, l);
	});

	const other: Lane = { ...lane('other', undefined, 'Other'), other: true };
	list.forEach((card, index) => {
		const c = (card != null && typeof card === 'object' ? card : {}) as KanbanCard;
		const raw = c[columnKey];
		const status = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
		const n = norm(status);
		let target = n ? byId.get(n) : undefined;
		if (!target && derive && n) {
			target = lane(`d${lanes.length}`, status.trim(), titleFromId(status) || status);
			lanes.push(target);
			byId.set(n, target);
		}
		(target ?? other).items.push({ card: c, index });
	});

	if (other.items.length) lanes.push(other);
	return lanes;
}

/** A new card array with only card `index` moved to lane `to`. */
export function moveCard(cards: KanbanCard[], index: number, columnKey: string, to: string): KanbanCard[] {
	return cards.map((c, i) => (i === index ? { ...c, [columnKey]: to } : c));
}
