// widgets/vertical/bulk-action-bar.ts: the pure half of BulkActionBar. Props are
// model output, so the count, noun and actions are normalised here before the
// component sees them, and the inline-versus-More split is a fixed rule on label
// length and container width (no measuring of rendered text). Everything here
// returns a value and never throws.
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

/**
 * Which actions sit in the row and which go to More. Wide: labels up to 24
 * characters, at most 4 inline. Narrow: labels up to 14, at most 4 columns, so
 * 3 plus More once there are 5 or more actions.
 */
export function splitActions(actions: BulkAction[], wide: boolean): { inline: BulkAction[]; menu: BulkAction[] } {
	const limit = wide ? 24 : 14;
	const max = !wide && actions.length >= 5 ? 3 : 4;
	const inline: BulkAction[] = [];
	const menu: BulkAction[] = [];
	for (const a of actions) (inline.length < max && a.label.length <= limit ? inline : menu).push(a);
	return { inline, menu };
}
