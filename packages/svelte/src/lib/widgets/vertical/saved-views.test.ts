// widgets/vertical/saved-views.test.ts: unit coverage for SavedViews' pure half
// (normaliser, pinned and count parsing, default selection, collapse slice).
import { describe, expect, it } from 'vitest';
import { COLLAPSE_AT, countText, isPinned, normalizeViews, sanitizeCount, selectedIndex, viewName, visibleIndexes } from './saved-views.js';

const ODD = [
	{ id: 'open', label: 'Open', count: '8', pinned: 'yes' },
	{ label: 'No id here', count: 12 },
	{ id: 'label-missing', count: 5 },
	{ id: 'zero', label: 'Waiting', count: 0 },
	{ id: 'neg', label: 'Refunds', count: -3 },
	{ id: 'nan', label: 'Snoozed', count: 'lots' },
	{ id: 'icon-bad', label: 'Starred', icon: 'sparkle-unicorn', count: 2 },
	{ id: 'open', label: 'Open (copy)', count: 8 },
	'Archived',
	{ id: 'md', label: '**Urgent** bugs', count: 1.5 },
	null,
	{ id: '', label: '', count: 7 }
];

describe('normalizeViews', () => {
	const out = normalizeViews(ODD);

	it('drops null and empty items, keeps the rest in order', () => {
		expect(out.map((v) => v.id)).toEqual(['open', 'No id here', 'label-missing', 'zero', 'neg', 'nan', 'icon-bad', 'open', 'Archived', 'md']);
	});

	it('fills a missing id from the label and a missing label from the id', () => {
		expect(out[1]).toMatchObject({ id: 'No id here', label: 'No id here' });
		expect(out[2]).toMatchObject({ id: 'label-missing', label: 'label-missing' });
	});

	it('turns a bare string into a view and strips markdown from labels', () => {
		expect(out[8]).toEqual({ id: 'Archived', label: 'Archived', pinned: false });
		expect(out[9].label).toBe('Urgent bugs');
	});

	it('parses counts: "8" is 8, 0 stays, 1.5 rounds, negative and words drop', () => {
		expect(out.map((v) => v.count)).toEqual([8, 12, 5, 0, undefined, undefined, 2, 8, undefined, 2]);
	});

	it('never throws on junk input', () => {
		expect(normalizeViews(undefined)).toEqual([]);
		expect(normalizeViews('nope')).toEqual([]);
		expect(normalizeViews([[], 3, true])).toEqual([{ id: '3', label: '3', pinned: false }]);
	});
});

describe('isPinned / sanitizeCount', () => {
	it('reads true, "true", "yes" in any case as pinned and nothing else', () => {
		for (const v of [true, 'true', 'YES', ' yes ']) expect(isPinned(v)).toBe(true);
		for (const v of [false, 'no', 1, null, undefined, 'pinned']) expect(isPinned(v)).toBe(false);
	});

	it('keeps whole counts >= 0', () => {
		expect(sanitizeCount('8')).toBe(8);
		expect(sanitizeCount(-1)).toBeUndefined();
		expect(sanitizeCount(NaN)).toBeUndefined();
		expect(sanitizeCount(0)).toBe(0);
	});
});

describe('selectedIndex', () => {
	const views = normalizeViews([{ id: 'a', label: 'A' }, { id: 'b', label: 'B', pinned: true }, { id: 'a', label: 'A2' }]);

	it('selects the first view whose id matches value', () => {
		expect(selectedIndex(views, 'a')).toBe(0);
	});

	it('falls back to the first pinned view for a missing or unknown value', () => {
		expect(selectedIndex(views, null)).toBe(1);
		expect(selectedIndex(views, 'deleted-view')).toBe(1);
	});

	it('falls back to the first view when none is pinned, -1 when empty', () => {
		expect(selectedIndex(normalizeViews(['x', 'y']), undefined)).toBe(0);
		expect(selectedIndex([], 'x')).toBe(-1);
	});
});

describe('visibleIndexes', () => {
	it('shows everything up to COLLAPSE_AT', () => {
		expect(visibleIndexes(COLLAPSE_AT, 0, false)).toHaveLength(COLLAPSE_AT);
	});

	it('folds to the first seven plus a later selected view', () => {
		expect(visibleIndexes(14, 9, false)).toEqual([0, 1, 2, 3, 4, 5, 6, 9]);
		expect(visibleIndexes(30, 2, false)).toEqual([0, 1, 2, 3, 4, 5, 6]);
		expect(visibleIndexes(30, 2, true)).toHaveLength(30);
	});
});

describe('countText / viewName', () => {
	it('groups below 10,000 and compacts from there', () => {
		expect(countText(2847)).toBe('2,847');
		expect(countText(12_400)).toBe('12.4K');
		expect(countText(1_000_000)).toBe('1M');
		expect(countText(0)).toBe('0');
	});

	it('names a view with its full count and pin', () => {
		expect(viewName({ id: 'c', label: 'Closed', count: 2847, pinned: false })).toBe('Closed, 2,847 items');
		expect(viewName({ id: 'c', label: 'One', count: 1, pinned: true })).toBe('One, 1 item, pinned');
		expect(viewName({ id: 'c', label: 'Bare', pinned: false })).toBe('Bare');
	});
});
