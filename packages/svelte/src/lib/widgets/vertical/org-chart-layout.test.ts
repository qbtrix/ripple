// org-chart-layout.test.ts: the org chart's pure half against the seven
// worst-case specs in __fixtures__/org-chart (normalization, the fit ladder at
// the harness's content widths, selection and default expansion), plus one
// jsdom check that selection buttons exist only when something listens.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import OrgChart from './OrgChart.svelte';
import {
	columns,
	defaultOpen,
	normalize,
	pickMode,
	selectedPath,
	stats,
	summary,
	type Person
} from './org-chart-layout.js';
import s01 from './__fixtures__/org-chart/01-typical.json';
import s02 from './__fixtures__/org-chart/02-few-one-person.json';
import s03 from './__fixtures__/org-chart/03-wide-team.json';
import s04 from './__fixtures__/org-chart/04-deep-selected.json';
import s05 from './__fixtures__/org-chart/05-long-text.json';
import s06 from './__fixtures__/org-chart/06-messy-fields.json';
import s07 from './__fixtures__/org-chart/07-large-org.json';

const tree = (spec: { ui: { props: { root: unknown } } }) => normalize(spec.ui.props.root);
const flat = (ps: Person[]): Person[] => ps.flatMap((p) => [p, ...flat(p.children)]);
const byKey = (ps: Person[], key: string) => flat(ps).find((p) => p.key === key)!;
const leaf = (n: number, pre = 'p') => Array.from({ length: n }, (_, i) => ({ id: `${pre}${i}`, name: `Person ${i}` }));

describe('fit ladder at the harness widths', () => {
	const modes = (spec: Parameters<typeof tree>[0]) => [290, 328, 590, 688].map((w) => pickMode(tree(spec), w));
	it.each([
		['01 typical', s01, ['list', 'list', 'tree', 'tree']],
		['02 one person', s02, ['list', 'list', 'tree', 'tree']],
		['03 wide team', s03, ['list', 'list', 'stacked', 'stacked']],
		['04 deep', s04, ['list', 'list', 'list', 'list']],
		// 6 people, 4 leaves: the brief guessed list, the ladder's own rules give stacked then tree.
		['05 long text', s05, ['list', 'list', 'stacked', 'tree']],
		['06 messy', s06, ['list', 'list', 'list', 'list']],
		['07 large', s07, ['list', 'list', 'list', 'list']]
	] as const)('%s', (_, spec, want) => {
		expect(modes(spec)).toEqual(want);
	});

	it('counts columns the way the brief does', () => {
		expect(columns(tree(s01)[0], 'tree')).toBe(3);
		expect(columns(tree(s03)[0], 'tree')).toBe(12);
		expect(columns(tree(s03)[0], 'stacked')).toBe(3);
		expect(columns(tree(s04)[0], 'stacked')).toBe(6);
	});

	it('is a list before measurement, past 24 people, and for a stacked column over 8', () => {
		expect(pickMode(tree(s01), 0)).toBe('list');
		const big = normalize({ id: 'r', name: 'Root', children: [{ id: 'a', name: 'A', children: leaf(23) }] });
		expect(stats(big).people).toBe(25);
		expect(pickMode(big, 4000)).toBe('list');
		const flatTeam = normalize({ id: 'r', name: 'Root', children: leaf(14) });
		expect(pickMode(flatTeam, 720)).toBe('list');
		const eight = normalize({ id: 'r', name: 'Root', children: leaf(8) });
		expect(pickMode(eight, 590)).toBe('stacked');
	});
});

describe('normalize', () => {
	it('degrades every messy field in spec 06 visibly', () => {
		const f = tree(s06);
		const people = flat(f);
		expect(f[0].name).toBe('Priya Raman');
		expect(f[0].avatar).toBeUndefined();
		const numeric = byKey(f, '0.0');
		expect([numeric.id, numeric.name, numeric.title]).toEqual([7, '42', '2026']);
		expect(byKey(f, '0.1')).toMatchObject({ name: 'Quentin Blake-Ford', id: undefined });
		expect(people.filter((p) => p.id === 'dup').map((p) => p.name)).toEqual(['Rina Sato', 'Sven Larsen']);
		expect(byKey(f, '0.2').children).toEqual([]);
		expect(byKey(f, '0.2').avatar).toBe('https://example.com/avatars/rina-sato.jpg');
		expect(byKey(f, '0.3').children.map((c) => [c.name, c.unnamed, c.title])).toEqual([
			['Viktor Hale', false, ''],
			['Unnamed', true, 'Name missing']
		]);
		expect(byKey(f, '0.4')).toMatchObject({ name: 'Unnamed', unnamed: true, title: '' });
		expect(people).toHaveLength(8);
		expect(people.every((p) => !/undefined|object Object/.test(p.name + p.title))).toBe(true);
	});

	it('handles empty, scalar and array roots', () => {
		expect(normalize(null)).toEqual([]);
		expect(normalize('Ada')).toEqual([]);
		expect(normalize([{ id: 1, name: 'Ada' }])).toHaveLength(1);
		const forest = normalize([{ id: 1, name: 'Ada', children: leaf(3) }, null, { id: 2, name: 'Ben', children: leaf(4, 'q') }]);
		expect(forest.map((p) => p.key)).toEqual(['0', '1']);
		expect(summary(forest)).toBe('9 people · 2 teams');
	});

	it('cuts past 16 levels with a count and never loops on shared references', () => {
		let chain: Record<string, unknown> = { id: 'n20', name: 'Last' };
		for (let i = 19; i >= 0; i--) chain = { id: `n${i}`, name: `Level ${i}`, children: [chain] };
		const f = normalize(chain);
		expect(stats(f)).toMatchObject({ people: 21, levels: 16, cut: true });
		expect(byKey(f, ['0', ...Array(15).fill('0')].join('.')).more).toBe(5);
		expect(pickMode(f, 4000)).toBe('list');

		const loop: Record<string, unknown> = { id: 'a', name: 'Ada' };
		loop.children = [{ id: 'b', name: 'Ben', children: [loop] }];
		expect(stats(normalize(loop)).people).toBe(2);
	});

	it('writes the summary line', () => {
		expect(summary(tree(s01))).toBe('6 people · 3 levels');
		expect(summary(tree(s02))).toBe('1 person');
		expect(summary(tree(s07))).toBe('44 people · 4 levels');
	});
});

describe('selection and expansion', () => {
	it('matches by String(id), first in reading order', () => {
		expect(selectedPath(tree(s06), '7')).toEqual(['0', '0.0']);
		expect(selectedPath(tree(s06), 'dup')).toEqual(['0', '0.2']);
		expect(selectedPath(tree(s01), null)).toEqual([]);
		expect(selectedPath(tree(s01), 'nobody')).toEqual([]);
	});

	it('opens everything up to 24 people', () => {
		const f = tree(s04);
		const open = defaultOpen(f, selectedPath(f, 'l4'));
		expect(flat(f).filter((p) => p.children.length).every((p) => open.has(p.key))).toBe(true);
	});

	it('past 24 opens the root, its reports and the selected path only', () => {
		const f = tree(s07);
		const path = selectedPath(f, 'p24');
		const sel = byKey(f, path.at(-1)!);
		expect(sel.depth).toBe(3);
		const open = defaultOpen(f, path);
		const managers = flat(f).filter((p) => p.children.length);
		const expected = managers.filter((p) => p.depth <= 1 || path.slice(0, -1).includes(p.key)).map((p) => p.key);
		expect([...open].sort()).toEqual(expected.sort());
		expect(managers.some((p) => !open.has(p.key))).toBe(true);
	});
});

describe('OrgChart component', () => {
	it('has no selection buttons without onchange', () => {
		const { container } = render(OrgChart, { props: { root: s01.ui.props.root } });
		expect(container.querySelectorAll('[aria-pressed]')).toHaveLength(0);
		expect(container.textContent).toContain('6 people · 3 levels');
	});

	it('emits the original id when a person is clicked', async () => {
		const onchange = vi.fn();
		const { container } = render(OrgChart, { props: { root: s06.ui.props.root as never, value: '7', onchange } });
		const picks = [...container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')];
		const selected = picks.filter((b) => b.getAttribute('aria-pressed') === 'true');
		expect(selected).toHaveLength(1);
		await fireEvent.click(selected[0]);
		expect(onchange).toHaveBeenCalledWith(7);
		// The person without an id is shown but not selectable.
		expect(container.textContent).toContain('Quentin Blake-Ford');
		expect(picks.some((b) => b.textContent?.includes('Quentin'))).toBe(false);
	});

	it('shows a designed empty state', () => {
		const { container } = render(OrgChart, { props: { root: null } });
		expect(container.textContent?.trim()).toBe('No people to show');
	});
});
