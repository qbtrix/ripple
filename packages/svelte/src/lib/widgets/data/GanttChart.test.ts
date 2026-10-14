// GanttChart.test.ts: the gantt widget in the DOM. Messy model rows degrade
// visibly (spec 05 of the polish brief), the empty state, clickable rows, id
// forwarding, and the bar colours measured against the card in both themes.
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GanttChart from './GanttChart.svelte';
import { contrast, mix, toRgb, type Lab } from '../../ui/__fixtures__/contrast.js';

afterEach(() => cleanup());

const ODD = [
	{ id: 'a', name: 'Survey vendors', start: '2026-09-01', end: '2026-09-09' },
	{ id: 'b', name: 'Shortlist', start: '2026-09-08', end: '2026-09-12', progress: '60%' },
	{ id: 'c', name: 'Negotiate terms', start: '2026-09-21', end: '2026-09-14', progress: 140, dependencies: 'b, z' },
	{ id: 'd', name: 'Sign contract', start: 'next Tuesday', end: '2026-09-25', progress: 0, dependencies: 'c' },
	{ id: 'e', name: '', start: '2026-09-22', end: '2026-09-30', progress: -10 },
	{ id: 'c', name: 'Onboard vendor', start: '2026-09-28T09:00:00Z', end: '2026-10-09', progress: 10, dependencies: 'c' },
	{ id: 'f', name: 'Go-live check', start: '2026-10-09', end: '2026-10-09' }
];

describe('gantt', () => {
	it('keeps every messy row and never prints NaN or Invalid Date', () => {
		const { container } = render(GanttChart, { props: { tasks: ODD as never } });
		const items = container.querySelectorAll('[role="listitem"]');
		expect(items).toHaveLength(7);
		const text = container.textContent ?? '';
		expect(text).not.toMatch(/NaN|Invalid Date|undefined/);
		expect(text).toContain('No dates');
		expect(text).toContain('Untitled task');
		expect(items[1].getAttribute('aria-label')).toContain('60 percent done');
		expect(items[2].getAttribute('aria-label')).toBe(
			'Negotiate terms, Sep 14, 2026 to Sep 21, 2026, done, after Shortlist'
		);
		expect(items[4].getAttribute('aria-label')).toContain('0 percent done');
		expect(items[5].getAttribute('aria-label')).toContain('after Negotiate terms');
		expect(container.querySelectorAll('.g-diamond')).toHaveLength(1);
	});

	it('shows a designed empty state for missing or junk tasks', () => {
		for (const tasks of [[], undefined, 'soon', { a: 1 }]) {
			const { container } = render(GanttChart, { props: { tasks: tasks as never } });
			expect(container.textContent).toContain('No tasks to show');
			cleanup();
		}
	});

	it('leaves the percent out of the summary when no task has progress', () => {
		const { container } = render(GanttChart, {
			props: { tasks: [{ id: 'k', name: 'Kickoff workshop', start: '2026-06-08', end: '2026-06-10' }] }
		});
		expect(container.querySelector('.g-summary')?.textContent).toBe('Jun 8 – Jun 10, 2026 · 1 task');
	});

	it('makes rows buttons only when onclick is set, and hands back the task', async () => {
		const onclick = vi.fn();
		const tasks = ODD.slice(0, 2);
		const { container } = render(GanttChart, { props: { tasks, onclick } });
		const buttons = container.querySelectorAll('button');
		expect(buttons).toHaveLength(2);
		await fireEvent.click(buttons[1]);
		expect(onclick).toHaveBeenCalledWith(tasks[1]);
		cleanup();
		const plain = render(GanttChart, { props: { tasks } });
		expect(plain.container.querySelectorAll('button')).toHaveLength(0);
	});

	it('forwards the node id on its root', () => {
		const { container } = render(GanttChart, { props: { id: 'n-gantt', tasks: ODD.slice(0, 1) } });
		const root = container.querySelector('#n-gantt');
		expect(root?.getAttribute('data-ripple-node')).toBe('n-gantt');
	});
});

// Site theme tokens: warm light card and dark card, brand accent #1877F2.
const hex = (h: string): Lab => {
	const dec = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
	const [r, g, b] = [1, 3, 5].map((i) => dec(parseInt(h.slice(i, i + 2), 16) / 255));
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
	];
};

it('bars read on the card in both themes: tint 1.4:1, solid accent 3:1', async () => {
	// @ts-ignore vitest empties .svelte?raw; read the file the way status-text.test.ts reads theme.css.
	const { readFileSync } = await import('node:fs');
	const src: string = readFileSync('src/lib/widgets/data/GanttChart.svelte', 'utf8');
	const m = src.match(/background: color-mix\(in oklab, var\(--ripple-accent\) (\d+)%, var\(--ripple-surface\)\)/);
	expect(m).not.toBeNull();
	const p = Number(m![1]) / 100;
	const accent = hex('#1877f2');
	for (const card of ['#efeee8', '#1d1d1a', '#ffffff']) {
		const c = toRgb(hex(card));
		expect(contrast(toRgb(mix(accent, hex(card), p)), c)).toBeGreaterThanOrEqual(1.4);
		expect(contrast(toRgb(accent), c)).toBeGreaterThanOrEqual(3);
	}
	// The solid part sits under 3:1 on the tint, so a card-coloured notch separates them.
	expect(src).toMatch(/\.g-done \{[^}]*box-shadow: 2px 0 0 var\(--ripple-surface\)/);
});
