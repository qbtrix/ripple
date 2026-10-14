// widgets/data/kanban-board.test.ts: grouping, text and move rules for the
// kanban widget, driven by the worst-case specs (05 messy fields, 06 no columns).
import { describe, expect, it } from 'vitest';
import { buildBoard, cardTitle, dotColour, moveCard, norm, text } from './kanban-board.js';

const spec05Columns = [
	{ id: 'backlog', title: 'Backlog' },
	{ id: 'in-progress', title: 'In Progress', color: '#ff0000' },
	{ id: 'review', color: 'green' },
	{ id: 'done', title: 'Done', color: 'not-a-colour' },
	{ id: 'done', title: 'Shipped' }
];
const spec05Cards = [
	{ id: 1, title: 'Write onboarding checklist', status: 'backlog', owner: 'Lea' },
	{ id: 2, title: '', status: 'backlog' },
	{ id: 3, name: 'Draft pricing FAQ', status: 'In Progress' },
	{ id: 4, title: '**Fix** the export button', status: 'in_progress', owner: 3 },
	{ id: 5, title: 12345, status: 'review', description: { text: 'an object' } },
	{ id: 5, title: 'Second card with id 5', status: 'review', owner: '' },
	{ id: 6, title: 'Card whose status matches no column', status: 'blocked' },
	{ id: 7, title: 'Card with no status at all' },
	{ title: 'Card with no id', status: 'done' },
	{ id: 8, title: 'Null description', status: 'done', description: null }
];

describe('kanban-board', () => {
	it('matches statuses case- and separator-blind', () => {
		expect(norm('In Progress')).toBe('in-progress');
		expect(norm(' in_progress ')).toBe('in-progress');
	});

	it('places every card of spec 05 and never drops one', () => {
		const lanes = buildBoard(spec05Columns, spec05Cards, 'status');
		expect(lanes.map((l) => l.title)).toEqual(['Backlog', 'In Progress', 'Review', 'Done', 'Shipped', 'Other']);
		expect(lanes.map((l) => l.items.length)).toEqual([2, 2, 2, 2, 0, 2]);
		expect(lanes.reduce((n, l) => n + l.items.length, 0)).toBe(spec05Cards.length);
		expect(lanes[5].other).toBe(true);
		expect(lanes[5].id).toBeUndefined();
		expect(lanes[1].items.map((it) => it.index)).toEqual([2, 3]);
	});

	it('tames lane colours: status words to tokens, raw colours mixed, junk dropped', () => {
		const lanes = buildBoard(spec05Columns, [], 'status');
		expect(lanes[1].dot).toBe('color-mix(in oklab, #ff0000 75%, var(--ripple-surface))');
		expect(lanes[2].dot).toBe('var(--ripple-success)');
		expect(lanes[3].dot).toBeUndefined();
		expect(lanes[0].dot).toBeUndefined();
		expect(dotColour('Gray')).toBe('var(--ripple-muted-foreground)');
		expect(dotColour('AMBER')).toBe('var(--ripple-warning)');
		expect(dotColour('red;background:url(x)')).toBeUndefined();
		expect(dotColour(42)).toBeUndefined();
	});

	it('omits Other when every card matches', () => {
		const lanes = buildBoard([{ id: 'a', title: 'A' }], [{ status: 'a' }], 'status');
		expect(lanes.map((l) => l.title)).toEqual(['A']);
	});

	it('derives lanes from the data when columns are empty (spec 06)', () => {
		const cards = [
			{ id: 'r1', stage: 'Sourcing' },
			{ id: 'r4', stage: 'Interviewing' },
			{ id: 'r6', stage: 'Offer' },
			{ id: 'r7', stage: 'offer' },
			{ id: 'r8' },
			{ id: 'r9', stage: 'phone_screen' }
		];
		const lanes = buildBoard([], cards, 'stage');
		expect(lanes.map((l) => [l.title, l.items.length])).toEqual([
			['Sourcing', 1],
			['Interviewing', 1],
			['Offer', 2],
			['Phone screen', 1],
			['Other', 1]
		]);
		expect(lanes[2].id).toBe('Offer');
	});

	it('survives junk input', () => {
		expect(buildBoard(undefined, 'nope', 'status')).toEqual([]);
		expect(buildBoard([null, 3, { id: 'a' }], [null, 7], 'status').map((l) => [l.title, l.items.length])).toEqual([
			['A', 0],
			['Other', 2]
		]);
	});

	it('reads card text through plain() and the title fallbacks', () => {
		expect(cardTitle(spec05Cards[1], 'title')).toBe('');
		expect(cardTitle(spec05Cards[2], 'title')).toBe('Draft pricing FAQ');
		expect(cardTitle(spec05Cards[3], 'title')).toBe('Fix the export button');
		expect(cardTitle(spec05Cards[4], 'title')).toBe('12345');
		expect(text({ text: 'x' })).toBe('');
		expect(text(null)).toBe('');
		expect(text(Number.NaN)).toBe('');
		expect(text(3)).toBe('3');
	});

	it('moves one card by index, leaving a twin with the same id alone', () => {
		const next = moveCard(spec05Cards, 4, 'status', 'done');
		expect(next[4].status).toBe('done');
		expect(next[5].status).toBe('review');
		expect(next).toHaveLength(spec05Cards.length);
		expect(spec05Cards[4].status).toBe('review');
	});
});
