// widgets/vertical/saved-views.ts: the pure half of SavedViews. `views` is model
// output, so it is normalised here once (bare strings, missing ids or labels,
// string counts, "yes" for pinned, nulls) before the component sees it. Also
// holds the default-selection rule (value, else the first pinned view, else the
// first view), the count-based collapse past COLLAPSE_AT views, and the count
// text. Everything here returns a value and never throws.
import { finite, num, plain } from '../data-kit/format.js';
import { safeArray } from '$lib/utils/safe-props.js';

export type SavedView = { id: string; label: string; icon?: string; pinned: boolean; count?: number };

/** More views than this collapse to the first COLLAPSE_AT - 1, plus the selected one. */
export const COLLAPSE_AT = 8;

/** true, "true" and "yes" (any case) mean pinned; nothing else does. */
export function isPinned(v: unknown): boolean {
	if (v === true) return true;
	return typeof v === 'string' && /^(true|yes)$/i.test(v.trim());
}

/** A whole count >= 0, or undefined (negative, NaN and words show no count). */
export function sanitizeCount(v: unknown): number | undefined {
	const n = finite(v);
	return n === undefined || n < 0 ? undefined : Math.round(n);
}

function idText(v: unknown): string {
	return typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';
}

export function normalizeViews(v: unknown): SavedView[] {
	const out: SavedView[] = [];
	for (const raw of safeArray(v, { widget: 'saved-views', key: 'views' })) {
		if (typeof raw === 'string' || typeof raw === 'number') {
			const label = plain(raw);
			if (label) out.push({ id: String(raw).trim(), label, pinned: false });
			continue;
		}
		if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue;
		const o = raw as Record<string, unknown>;
		const label = plain(o.label ?? '');
		const id = idText(o.id) || label;
		if (!id) continue;
		const icon = typeof o.icon === 'string' && o.icon.trim() ? o.icon.trim() : undefined;
		out.push({ id, label: label || id, icon, pinned: isPinned(o.pinned), count: sanitizeCount(o.count) });
	}
	return out;
}

/** Index of the selected view: the first matching `value`, else the first pinned, else 0; -1 when empty. */
export function selectedIndex(views: readonly SavedView[], value: unknown): number {
	if (!views.length) return -1;
	const want = idText(value);
	const hit = want ? views.findIndex((v) => v.id === want) : -1;
	if (hit >= 0) return hit;
	const pinned = views.findIndex((v) => v.pinned);
	return pinned >= 0 ? pinned : 0;
}

/** Indexes to render: all, or (past COLLAPSE_AT, folded) the first COLLAPSE_AT - 1 plus the selected one. */
export function visibleIndexes(total: number, selected: number, expanded: boolean): number[] {
	const all = Array.from({ length: total }, (_, i) => i);
	if (expanded || total <= COLLAPSE_AT) return all;
	const head = all.slice(0, COLLAPSE_AT - 1);
	return selected >= head.length ? [...head, selected] : head;
}

/** "2,847" below 10,000; "12.4K", "1M" from there. */
export function countText(n: number): string {
	return n < 10_000 ? num(n, { digits: 0 }) : num(n, { compact: true });
}

/** "Closed, 2,847 items, pinned": label, then the full count, then pinned. */
export function viewName(v: SavedView): string {
	const parts = [v.label];
	if (v.count !== undefined) parts.push(`${num(v.count, { digits: 0 })} ${v.count === 1 ? 'item' : 'items'}`);
	if (v.pinned) parts.push('pinned');
	return parts.join(', ');
}
