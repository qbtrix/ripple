// widgets/vertical/bulk-action-bar.ts: the pure half of BulkActionBar. Props are
// model output, so the count, noun and actions are normalised here before the
// component sees them, and the inline-versus-More split is a fixed rule on label
// length, an estimated width per character and the bar's measured width (no
// measuring of rendered text). Everything here returns a value and never throws.
import { asText } from '@ripple-ui/core';
import { finite, num } from '../data-kit/format.js';
import { safeArray } from '$lib/utils/safe-props.js';

export type BulkAction = { id: string; label: string; icon?: string; destructive: boolean; disabled: boolean };

/** Container width (px) at and above which the bar is one row. */
export const WIDE_AT = 520;

/** A whole, positive selection count, or 0 (the bar then renders nothing). */
export function sanitizeCount(v: unknown): number {
	const n = finite(v);
	return n === undefined ? 0 : Math.max(0, Math.round(n));
}

/** "1 category", "12,480 categories", "1,000,000 boxes": three rules on the last word. */
export function countLabel(count: number, noun: unknown): { count: string; rest: string } {
	const word = asText(noun).trim() || 'item';
	return { count: num(count, { digits: 0 }), rest: `${count === 1 ? word : pluralize(word)} selected` };
}

export function pluralize(word: string): string {
	if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + 'ies';
	if (/(s|x|z|ch|sh)$/i.test(word)) return word + 'es';
	return word + 's';
}

/** Drop blank labels, fall back id to label, and move destructive actions last. */
export function normalizeActions(v: unknown): BulkAction[] {
	const out: BulkAction[] = [];
	for (const raw of safeArray<Record<string, unknown>>(v, { widget: 'bulk-action-bar', key: 'actions' })) {
		if (!raw || typeof raw !== 'object') continue;
		const label = asText(raw.label).trim();
		if (!label) continue;
		const icon = typeof raw.icon === 'string' ? raw.icon : undefined;
		out.push({
			id: asText(raw.id).trim() || label,
			label,
			icon,
			destructive: raw.variant === 'destructive',
			disabled: raw.disabled === true
		});
	}
	return [...out.filter((a) => !a.destructive), ...out.filter((a) => a.destructive)];
}

// Estimated pixel costs at the bar's sizes (13px labels at about 7px a character;
// 12px narrow labels at about 6.5px). Estimates only: the wide row is nowrap, so a
// miss shows up as an overflow in the audit rather than a silent wrap.
const CH = 7;
const BTN = 44; // 8px padding each side, 16px icon, 6px icon gap, 6px row gap
const MORE = BTN + 4 * CH;
const DIVIDER = 13;
const ROW_CHROME = 28; // bar padding, border, and the gap between count and actions
const NARROW_CH = 6.5;

/**
 * Which actions sit in the row and which go to More. `width` is the bar's own
 * width (0 = not measured, SSR or jsdom: the wide rule with no budget),
 * `leadChars` the length of the count line and `wordChars` its longest word.
 *
 * Both sizes hold at most 4 controls, so 3 actions plus More whenever anything
 * overflows; a disabled action keeps its slot.
 * Wide (>= WIDE_AT): labels up to 24 characters, in order, while their
 * estimated width fits beside the count. The count shrinks and wraps first: it
 * is budgeted only a quarter of the bar (or its longest word, if wider), so a
 * wider bar never shows fewer actions than the narrow one.
 * Narrow: labels up to 14 characters whose longest word fits a quarter-width
 * column.
 */
export function splitActions(
	actions: BulkAction[],
	width = 0,
	leadChars = 0,
	wordChars = 0
): { inline: BulkAction[]; menu: BulkAction[] } {
	if (width > 0 && width < WIDE_AT) {
		const maxWord = Math.floor(((width - ROW_CHROME) / 4 - 8) / NARROW_CH);
		const max = actions.length >= 5 ? 3 : 4;
		const fits = (a: BulkAction) => a.label.length <= 14 && a.label.split(/\s+/).every((w) => w.length <= maxWord);
		const inline: BulkAction[] = [];
		const menu: BulkAction[] = [];
		for (const a of actions) (inline.length < max && fits(a) ? inline : menu).push(a);
		return { inline, menu };
	}
	const room = width === 0 ? Infinity : width - ROW_CHROME - (36 + CH * Math.min(leadChars, Math.max(wordChars, (width / 4 - 36) / CH)));
	const all = pack(actions, room, 4);
	return all.menu.length ? pack(actions, room - MORE, 3) : all;
}

/** Up to `max` labels of 24 characters or fewer, in order, until the budget runs out. */
function pack(actions: BulkAction[], budget: number, max: number): { inline: BulkAction[]; menu: BulkAction[] } {
	const inline: BulkAction[] = [];
	const menu: BulkAction[] = [];
	let used = 0;
	let full = false;
	for (const a of actions) {
		const cost = BTN + a.label.length * CH + (a.destructive && !inline.some((b) => b.destructive) ? DIVIDER : 0);
		if (!full && inline.length < max && a.label.length <= 24) {
			if (used + cost <= budget) {
				inline.push(a);
				used += cost;
				continue;
			}
			full = true;
		}
		menu.push(a);
	}
	return { inline, menu };
}
