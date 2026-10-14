// Heatmap.test.ts: the rendered heatmap in jsdom. Rows read top to bottom in
// the order given, arrow keys rove one tab stop and drive the readout, the
// hidden table carries every value, and a grid with no values is an empty state.
import { render, fireEvent } from '@testing-library/svelte';
import { describe, expect, test } from 'vitest';
import Heatmap from './Heatmap.svelte';

const cells = [
	{ x: 'Mon', y: 'Week 1', value: 12 },
	{ x: 'Tue', y: 'Week 1', value: 18 },
	{ x: 'Mon', y: 'Week 2', value: 22 },
	{ x: 'Tue', y: 'Week 2', value: 25 }
];

describe('heatmap', () => {
	test('rows read top to bottom in the order given, cells left to right', () => {
		const { container } = render(Heatmap, { props: { cells, title: 'Engagement Matrix' } });
		expect([...container.querySelectorAll('.hm-y')].map((e) => e.textContent)).toEqual(['Week 1', 'Week 2']);
		expect([...container.querySelectorAll('.hm-cell')].map((e) => e.getAttribute('data-value'))).toEqual(['12', '18', '22', '25']);
	});

	test('the readout names the peak at rest and follows arrow keys from one tab stop', async () => {
		const { container, getByRole } = render(Heatmap, { props: { cells, title: 'Engagement Matrix' } });
		const readout = () => container.querySelector('.hm-readout')!.textContent!.replace(/\s+/g, ' ').trim();
		expect(readout()).toBe('Highest: Week 2 · Tue, 25');
		const grid = getByRole('application', { name: 'Engagement Matrix, heatmap, use arrow keys' });
		expect(container.querySelectorAll('[tabindex]')).toHaveLength(1);
		await fireEvent.focus(grid);
		expect(readout()).toBe('Week 1 · Mon: 12');
		await fireEvent.keyDown(grid, { key: 'ArrowRight' });
		expect(readout()).toBe('Week 1 · Tue: 18');
		await fireEvent.keyDown(grid, { key: 'ArrowDown' });
		expect(readout()).toBe('Week 2 · Tue: 25');
		await fireEvent.keyDown(grid, { key: 'Home' });
		expect(readout()).toBe('Week 2 · Mon: 22');
		expect(container.querySelector('.hm-cell.is-active')?.getAttribute('data-value')).toBe('22');
		await fireEvent.blur(grid);
		expect(readout()).toBe('Highest: Week 2 · Tue, 25');
	});

	test('tooltip false keeps the peak line and drops the tab stop', () => {
		const { container } = render(Heatmap, { props: { cells, tooltip: false } });
		expect(container.querySelectorAll('[tabindex]')).toHaveLength(0);
		expect(container.querySelector('.hm-readout')!.textContent).toContain('Highest:');
	});

	test('the hidden table carries every value and names empty cells', () => {
		const { container } = render(Heatmap, {
			props: { cells: [...cells, { x: 'Wed', y: 'Week 1', value: null }] as never, title: 'T' }
		});
		const table = container.querySelector('table')!;
		expect(table.querySelector('caption')!.textContent).toBe('T');
		expect([...table.querySelectorAll('thead th')].map((e) => e.textContent)).toEqual(['Mon', 'Tue', 'Wed']);
		expect([...table.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((e) => e.textContent))).toEqual([
			['Week 1', '12', '18', 'No data'],
			['Week 2', '22', '25', 'No data']
		]);
		expect(container.querySelector('.hm-legend')!.textContent).toContain('No data');
	});

	test('no values is a designed empty state; unplaceable entries are counted', () => {
		const { container } = render(Heatmap, { props: { cells: [{ x: 'a', value: 3 }] as never } });
		expect(container.textContent).toContain('No data to show');
		expect(container.textContent).toContain('1 cell skipped (no row or column)');
		expect(container.querySelector('.hm-legend')).toBeNull();
	});

	test('forwards id and data-ripple-node on the root', () => {
		const { container } = render(Heatmap, { props: { cells, id: 'hm1' } });
		const root = container.querySelector('#hm1')!;
		expect(root.getAttribute('data-ripple-node')).toBe('hm1');
	});
});
