// widgets/composite/StandupBoard.test.ts: the standup-board data widget: the
// normaliser and derivations in standup-board.ts (synonyms, junk blockers, ids,
// order, verdict), registry and bind-contract wiring, and the brief's states in
// jsdom: all clear, many blocked, two people, ten people, sparse data, away,
// resolve and undo (bound and unbound), the filter, expand, and junk props.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import Ripple from '$lib/Ripple.svelte';
import { expectStreamParity } from '$lib/streaming/__fixtures__/stream-parity.js';
import { getWidget, hasWidget } from '../index.js';
import { getBindContract } from '@ripple-ui/core';
import StandupBoard from './StandupBoard.svelte';
import {
	blockerText,
	deriveVerdict,
	blockedOn,
	initials,
	nameHue,
	openBlocked,
	ordered,
	readPeople,
	toStandupStatus,
	toValue
} from './standup-board.js';

afterEach(() => cleanup());

const SEVEN = () => [
	{ name: 'Aarav Mehta', role: 'Backend', yesterday: 'Shipped the export endpoint', today: 'Add pagination' },
	{ name: 'Lina Okafor', role: 'DevOps', yesterday: 'Set up the pipeline', today: 'Run the migration', blocker: 'Waiting on staging DB creds from the infra team.' },
	{ name: 'Mei Tanaka', yesterday: 'Built settings', today: 'Hook settings to the API' },
	{ name: 'Rui Santos', today: 'Back Monday', status: 'ooo' },
	{ name: 'Tomás Reyes', yesterday: 'Wired refunds', today: 'Test partial refunds', blocker: 'Sandbox returns 502 on every refund.' },
	{ name: 'Priya Nair', yesterday: 'Wrote test cases', today: 'Run regression', status: 'shipped' },
	{ name: 'Sam Lee', yesterday: 'Paired on refunds', today: 'Review PRs', blocker: 'none' }
];
const rendered = (props: Record<string, unknown>) => render(StandupBoard, { props }).container;
const order = (c: Element) => [...c.querySelectorAll('[data-person]')].map((e) => e.getAttribute('data-person'));
const count = (c: Element) => c.querySelector('[data-slot="count"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

describe('standup-board: normaliser', () => {
	it('maps status synonyms and treats junk blockers as absent', () => {
		expect(['on_track', 'ontrack', 'ok', 'active', 'nonsense', undefined].map(toStandupStatus)).toEqual(Array(6).fill('on-track'));
		expect(['complete', 'shipped'].map(toStandupStatus)).toEqual(['done', 'done']);
		expect(['ooo', 'out', 'OFF', 'pto', 'leave'].map(toStandupStatus)).toEqual(Array(5).fill('away'));
		expect(['', 'none', 'N/A', '-', 'no', 'None.'].map(blockerText)).toEqual(Array(6).fill(''));
		expect(blockerText('Need creds')).toBe('Need creds');
	});

	it('a real blocker wins over any status, away included; blocked with no text stays blocked', () => {
		const { people } = readPeople([
			{ name: 'A', status: 'away', blocker: 'Laptop died' },
			{ name: 'B', status: 'blocked' },
			{ name: 'C', status: 'done', blocker: 'n/a' }
		]);
		expect(people.map((p) => [p.status, p.blocker])).toEqual([
			['blocked', 'Laptop died'],
			['blocked', ''],
			['done', '']
		]);
	});

	it('accepts members and bare strings, drops empty names, coerces non-strings, slugs ids with repeats', () => {
		const { people } = readPeople(undefined, ['Lina Okafor', { name: '  ' }, { name: 42, today: { x: 1 } }, 'Lina Okafor', 'Tomás Reyes']);
		expect(people.map((p) => p.id)).toEqual(['lina-okafor', '42', 'lina-okafor-2', 'tomas-reyes']);
		expect(people[1].today).not.toContain('[object Object]');
	});

	it('caps at 20 and counts the rest', () => {
		const { people, more } = readPeople(Array.from({ length: 26 }, (_, i) => `Person ${i}`));
		expect([people.length, more]).toEqual([20, 6]);
	});

	it('orders blocked, on track, done, away and keeps model order inside a group', () => {
		expect(ordered(readPeople(SEVEN()).people).map((p) => p.name)).toEqual([
			'Lina Okafor',
			'Tomás Reyes',
			'Aarav Mehta',
			'Mei Tanaka',
			'Sam Lee',
			'Priya Nair',
			'Rui Santos'
		]);
	});

	it('derives the verdict by naming people, then by proportion', () => {
		const p = (n: number, of: number) => readPeople(Array.from({ length: of }, (_, i) => ({ name: `P${i} X`, today: 't', ...(i < n ? { blocker: `Thing ${i}` } : {}) }))).people;
		expect(deriveVerdict(readPeople(SEVEN()).people, [])?.text).toBe('Lina and Tomás are blocked.');
		expect(deriveVerdict(readPeople(SEVEN()).people, ['tomas-reyes'])?.text).toBe('Lina is blocked on staging DB creds.');
		expect(deriveVerdict(readPeople(SEVEN()).people, ['lina-okafor'])?.text).toBe('Tomás is blocked.');
		expect(deriveVerdict(p(3, 6), [])?.text).toBe('P0, P1 and P2 are blocked.');
		expect(deriveVerdict(p(5, 8), [])).toEqual({ text: '5 of 8 are blocked.', status: 'bad' });
		expect(deriveVerdict(p(0, 4), [])).toEqual({ text: 'Everyone is unblocked.', status: 'good' });
		expect(deriveVerdict(readPeople(['A', 'B']).people, [])?.text).toBe('No updates yet.');
	});

	it('the one-blocker verdict is a clean clause or just the name, never a cut sentence', () => {
		expect(blockedOn('Still waiting on the recruiting agency to confirm the third participant.')).toBe('the recruiting agency');
		expect(blockedOn('Waiting on staging database credentials from the infra team.')).toBe('staging database credentials');
		expect(blockedOn('Need API keys for the sandbox')).toBe('API keys');
		expect(blockedOn('Cannot get a production change window until the council signs off.')).toBe('');
		expect(blockedOn('Waiting on a very long list of many separate small things here')).toBe('');
	});

	it('counts open blockers from people and resolved ids only; away without text is not blocked', () => {
		const ps = readPeople(SEVEN()).people;
		expect(openBlocked(ps, []).length).toBe(2);
		expect(openBlocked(ps, ['lina-okafor']).length).toBe(1);
	});

	it('initials, a hue outside the blue band, and a clean value', () => {
		expect(initials('Lina Okafor')).toBe('LO');
		expect(initials('Mei')).toBe('M');
		for (const n of ['Lina', 'Tomás', 'Aarav', 'Mei', 'Priya', 'Rui', 'Sam', 'Zed', 'Ola']) {
			const h = nameHue(n);
			expect(h < 200 || h >= 280).toBe(true);
			expect(nameHue(n)).toBe(h);
		}
		expect(toValue({ resolved: ['a', 'a', 3, ''] })).toEqual({ resolved: ['a'] });
		expect(toValue({})).toBeUndefined();
	});
});

describe('standup-board: registry and bind contract', () => {
	it.each(['standup-board', 'standup', 'team-standup'])('%s is registered and binds value', (type) => {
		expect(hasWidget(type)).toBe(true);
		expect(getWidget(type)).toBe(getWidget('standup-board'));
		expect(getBindContract(type)).toMatchObject({ prop: 'value', event: 'onchange' });
	});
});

describe('standup-board: states', () => {
	it('normal: blocked first, count, verdict, groups, filter, one column header row', () => {
		const c = rendered({ team: 'Payments team', date: '2026-10-14', people: SEVEN() });
		expect(order(c)).toEqual(['lina-okafor', 'tomas-reyes', 'aarav-mehta', 'mei-tanaka', 'sam-lee', 'priya-nair', 'rui-santos']);
		expect(count(c)).toBe('2 open blockers');
		expect(c.querySelector('[data-slot="meta"]')?.textContent).toBe('7 people · 1 away');
		expect(screen.getByText('Lina and Tomás are blocked.')).toBeTruthy();
		expect(screen.getByText('Wed 14 Oct')).toBeTruthy();
		expect(screen.getByRole('radiogroup')).toBeTruthy();
		expect(c.querySelectorAll('[data-slot="columns"]').length).toBe(1);
		expect(c.textContent).not.toMatch(/\bnone\b/i);
		expect([...c.querySelectorAll('[data-slot="group"]')].map((h) => h.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['On track 3', 'Done 1', 'Away 1']);
	});

	it('all clear: no count, no filter, no red, success verdict', () => {
		const c = rendered({ people: SEVEN().map(({ blocker: _b, ...p }) => p) });
		expect(count(c)).toBeNull();
		expect(screen.queryByRole('radiogroup')).toBeNull();
		expect(c.querySelector('[data-slot="blocker"]')).toBeNull();
		expect(c.innerHTML).not.toContain('error');
		expect(screen.getByText('Everyone is unblocked.')).toBeTruthy();
		expect(c.textContent).not.toMatch(/\b0\b/);
	});

	it('many blocked: the proportion verdict', () => {
		const people = Array.from({ length: 8 }, (_, i) => ({ name: `Person ${i}`, today: 'Work', ...(i < 5 ? { blocker: `Problem ${i}` } : {}) }));
		rendered({ people });
		expect(screen.getByText('5 of 8 are blocked.')).toBeTruthy();
		expect(screen.getAllByText('Today and yesterday', { exact: false }).length).toBe(5);
	});

	it('two people: no filter, nobody collapses, no people count', () => {
		const c = rendered({ people: SEVEN().slice(0, 2) });
		expect(screen.queryByRole('radiogroup')).toBeNull();
		expect(c.querySelector('[aria-expanded]')).toBeNull();
		expect(c.querySelector('[data-slot="meta"]')).toBeNull();
		expect(count(c)).toBe('1 open blocker');
	});

	it('ten people: on-track rows collapse to buttons that expand', async () => {
		const people = Array.from({ length: 10 }, (_, i) => ({ name: `Person ${i}`, today: `Today ${i}`, yesterday: `Yesterday ${i}`, ...(i < 2 ? { blocker: `Problem ${i}` } : {}) }));
		const c = rendered({ people });
		const rows = c.querySelectorAll('li > button[aria-expanded="false"]');
		expect(rows.length).toBe(8);
		await fireEvent.click(rows[0]);
		expect(rows[0].getAttribute('aria-expanded')).toBe('true');
	});

	it('sparse: roster only, "No update", default title, no date', () => {
		const c = rendered({ people: ['Lina Okafor', 'Tomás Reyes', 'Mei'] });
		expect(c.querySelector('h2')?.textContent?.trim()).toBe('Standup');
		expect(screen.getAllByText('No update').length).toBe(6);
		expect(screen.getByText('No updates yet.')).toBeTruthy();
		expect(screen.getAllByText('LO').length).toBe(1);
	});

	it('away: moon and the today line only, never a no-update gap', () => {
		const c = rendered({ people: [{ name: 'Rui Santos', status: 'pto', today: 'Back Monday', yesterday: 'x' }, { name: 'Ola K', status: 'away' }] });
		const rui = c.querySelector('[data-person="rui-santos"]')!;
		expect(rui.textContent).toContain('Back Monday');
		expect(rui.textContent).not.toContain('x');
		expect(c.textContent).not.toContain('No update');
	});

	it('empty people: a one-line empty state', () => {
		rendered({ team: 'Ops', people: [] });
		expect(screen.getByText('No one has posted an update yet.')).toBeTruthy();
	});

	it('blocked with no detail says so in muted ink', () => {
		rendered({ people: [{ name: 'B Q', status: 'blocked' }] });
		expect(screen.getByText('No detail given')).toBeTruthy();
	});
});

describe('standup-board: resolve', () => {
	it('resolve strikes the sentence, updates the count and verdict in place, undo restores; props untouched', async () => {
		const people = SEVEN();
		const before = JSON.stringify(people);
		const onchange = vi.fn();
		const c = rendered({ people, onchange });
		await fireEvent.click(screen.getByRole('button', { name: "Resolve Lina Okafor's blocker" }));
		expect(onchange).toHaveBeenLastCalledWith({ resolved: ['lina-okafor'] });
		expect(count(c)).toBe('1 open blocker');
		expect(c.querySelector('[data-person="lina-okafor"]')?.getAttribute('data-resolved')).toBe('true');
		expect(order(c)[0]).toBe('lina-okafor');
		expect(screen.getByText(/Tomás is blocked/)).toBeTruthy();
		expect(c.querySelector('[aria-live]')?.textContent).toBe("Lina's blocker resolved. 1 open blocker.");
		await fireEvent.click(screen.getByRole('button', { name: "Resolve Tomás Reyes's blocker" }));
		expect(count(c)).toBeNull();
		expect(screen.getByText('Everyone is unblocked.')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: "Undo resolving Lina Okafor's blocker" }));
		expect(count(c)).toBe('1 open blocker');
		expect(JSON.stringify(people)).toBe(before);
	});

	it('a bound value drives resolved through state, and a re-sent spec keeps it', async () => {
		const spec = { state: { s: { resolved: ['tomas-reyes'] } }, ui: { type: 'standup-board', bind: '{state.s}', props: { people: SEVEN() } } };
		const { container } = render(Ripple, { props: { spec } });
		expect(count(container)).toBe('1 open blocker');
		await fireEvent.click(screen.getByRole('button', { name: "Resolve Lina Okafor's blocker" }));
		expect(count(container)).toBeNull();
	});

	it('the Blocked filter shows only blocked people and offers Show everyone once all are resolved', async () => {
		const c = rendered({ people: SEVEN() });
		await fireEvent.click(screen.getByRole('radio', { name: 'Blocked' }));
		expect(order(c)).toEqual(['lina-okafor', 'tomas-reyes']);
		await fireEvent.click(screen.getByRole('button', { name: "Resolve Lina Okafor's blocker" }));
		await fireEvent.click(screen.getByRole('button', { name: "Resolve Tomás Reyes's blocker" }));
		expect(order(c)).toEqual(['lina-okafor', 'tomas-reyes']);
		await fireEvent.click(screen.getByRole('button', { name: 'Show everyone' }));
		expect(order(c).length).toBe(7);
	});
});

describe('standup-board: streamed and junk', () => {
	it('a streamed spec renders the same as the whole one', async () => {
		await expectStreamParity({ ui: { type: 'standup-board', props: { team: 'Payments', people: SEVEN() } } });
	});

	it.each([[{ people: 'nope' }], [{ people: [null, 3, { name: { a: 1 } }] }], [{ people: [{ name: 'A', status: 7, blocker: 9 }] }], [{}]])('junk %j does not throw', (props) => {
		expect(() => rendered(props)).not.toThrow();
		expect(document.body.textContent).not.toContain('[object Object]');
	});
});
