// Chart.redraw.test.ts: the echarts-backed data widgets (chart, sankey), the
// native gantt and heatmap, and the DOM treemap and funnel redraw when their
// props change after mount: state behind `data` changes, a streamed spec delivers
// title/data in later chunks, or type/title are swapped on the live component.
// The chart libs are mocked (jsdom has no canvas), so every echarts assertion
// reads the option handed to the instance's update call. The instance itself
// must be created once and updated in place, then disposed on unmount. The DOM
// widgets (treemap, funnel, heatmap, gantt) are checked by reading what they render.
// Sankey also paints its title and labels in the element's text colour and
// redraws when the root theme class flips.

import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import Ripple from '$lib/Ripple.svelte';
import { streamSpec } from '$lib/streaming/index.js';
import Chart from './Chart.svelte';
import Heatmap from './Heatmap.svelte';
import Treemap from './Treemap.svelte';
import Sankey from './Sankey.svelte';
import Funnel from './Funnel.svelte';
import GanttChart from './GanttChart.svelte';

const ec = vi.hoisted(() => ({ init: vi.fn(), setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() }));
vi.mock('echarts', () => ({
	init: (...args: unknown[]) => {
		ec.init(...args);
		return { setOption: ec.setOption, resize: ec.resize, dispose: ec.dispose };
	}
}));

/** ResizeObserver that reports a laid-out box as soon as it observes, so the
 *  widgets' "init once the element has a size" path runs in jsdom. */
class SizedResizeObserver {
	constructor(private cb: ResizeObserverCallback) {}
	observe() {
		this.cb([{ contentRect: { width: 300, height: 200 } } as ResizeObserverEntry], this as never);
	}
	disconnect() {}
	unobserve() {}
}

beforeEach(() => {
	vi.stubGlobal('ResizeObserver', SizedResizeObserver);
	for (const m of Object.values(ec)) m.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

const lastOption = () => ec.setOption.mock.lastCall![0];

async function* chunked(json: string, size = 6) {
	for (let i = 0; i < json.length; i += size) {
		yield json.slice(i, i + size);
		await new Promise((r) => setTimeout(r, 0));
	}
}

describe('chart', () => {
	test('redraws when the state behind its data changes', async () => {
		const spec = {
			state: { v: 1 },
			ui: {
				type: 'flex',
				children: [
					{ type: 'chart', props: { type: 'bar', data: [{ label: 'a', value: '{state.v}' }] } },
					{ type: 'button', props: { label: 'Bump' }, on_click: { action: 'set', target: 'v', value: 5 } }
				]
			}
		};
		const { container } = render(Ripple, { props: { spec } });
		await vi.waitFor(() => expect(ec.setOption).toHaveBeenCalled());
		expect(lastOption().series[0].data).toEqual([1]);

		const bump = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Bump')!;
		await fireEvent.click(bump);
		await tick();
		await vi.waitFor(() => expect(lastOption().series[0].data).toEqual([5]));
		expect(ec.init).toHaveBeenCalledTimes(1);
	});

	test('streamed: title and data that arrive after mount are all drawn once the stream is done', async () => {
		const spec = {
			ui: {
				type: 'chart',
				props: {
					type: 'bar',
					title: 'Revenue by quarter',
					data: [
						{ label: 'Q1', value: 10 },
						{ label: 'Q2', value: 20 },
						{ label: 'Q3', value: 30 }
					],
					colors: ['#111111']
				}
			}
		};
		const store = streamSpec(chunked(JSON.stringify(spec)), { throttleMs: 0 });
		render(Ripple, { props: { streaming: store } });
		await vi.waitFor(() => expect(store.done).toBe(true), { timeout: 5000 });
		await tick();
		expect(store.error).toBeNull();

		await vi.waitFor(() => expect(lastOption().title?.text).toBe('Revenue by quarter'));
		expect(lastOption().xAxis.data).toEqual(['Q1', 'Q2', 'Q3']);
		expect(lastOption().series[0].data).toEqual([10, 20, 30]);
		// The chart mounted mid-stream: it was drawn before its props were whole.
		expect(ec.setOption.mock.calls[0][0].title?.text).not.toBe('Revenue by quarter');
		expect(ec.init).toHaveBeenCalledTimes(1);
	});

	test('type and title changed after mount update the live chart in place', async () => {
		const data = [
			{ label: 'a', value: 1 },
			{ label: 'b', value: 2 }
		];
		const { rerender, unmount } = render(Chart, { props: { type: 'bar', title: 'Old', data } });
		await vi.waitFor(() => expect(ec.setOption).toHaveBeenCalled());
		expect(lastOption().series[0].type).toBe('bar');

		await rerender({ type: 'line', title: 'New', data });
		await vi.waitFor(() => expect(lastOption().series[0].type).toBe('line'));
		expect(lastOption().title.text).toBe('New');
		// Full replace, so a bar→line switch drops the old series config.
		expect(ec.setOption.mock.lastCall![1]).toBe(true);
		expect(ec.init).toHaveBeenCalledTimes(1);

		unmount();
		expect(ec.dispose).toHaveBeenCalledTimes(1);
	});
});

describe.each([
	[
		'sankey',
		Sankey,
		{ nodes: [{ name: 'a' }, { name: 'b' }], links: [{ source: 'a', target: 'b', value: 1 }] },
		{ nodes: [{ name: 'a' }, { name: 'b' }], links: [{ source: 'a', target: 'b', value: 9 }] },
		(o: any) => o.series[0].links.map((l: any) => l.value),
		[9]
	]
] as const)('%s', (_name, Widget, before, after, read, expected) => {
	test('redraws when its data prop changes after mount', async () => {
		const { rerender } = render(Widget as any, { props: before });
		await vi.waitFor(() => expect(ec.setOption).toHaveBeenCalled());
		await rerender(after);
		await vi.waitFor(() => expect(read(lastOption())).toEqual(expected));
		expect(ec.init).toHaveBeenCalledTimes(1);
	});
});

describe('sankey theme', () => {
	test('paints the title and labels in the text colour, unstroked, and redraws on a theme flip', async () => {
		const { container } = render(Sankey, {
			props: { title: 'Journey', nodes: [{ name: 'a' }, { name: 'b' }], links: [{ source: 'a', target: 'b', value: 1 }] }
		});
		(container.firstElementChild as HTMLElement).style.color = 'rgb(240, 240, 240)';
		document.documentElement.classList.add('dark');
		await vi.waitFor(() => expect(lastOption().title.textStyle.color).toBe('rgb(240, 240, 240)'));
		expect(lastOption().series[0].label).toMatchObject({ color: 'rgb(240, 240, 240)', textBorderWidth: 0 });
		document.documentElement.classList.remove('dark');
	});
});

describe('treemap', () => {
	test('redraws its tiles when its data prop changes after mount', async () => {
		const { container, rerender } = render(Treemap, { props: { data: [{ name: 'a', value: 1 }] } });
		const names = () => [...container.querySelectorAll('.tm-name')].map((n) => n.textContent);
		expect(names()).toEqual(['a']);
		await rerender({ data: [{ name: 'b', value: 9 }] });
		expect(names()).toEqual(['b']);
		expect(ec.init).not.toHaveBeenCalled();
	});
});

describe('heatmap', () => {
	test('redraws its cells when its cells prop changes after mount', async () => {
		// bind:clientWidth needs entries with a target; the sized stub has none.
		vi.unstubAllGlobals();
		const { container, rerender } = render(Heatmap, { props: { cells: [{ x: 'a', y: 'r', value: 1 }] } });
		const values = () => [...container.querySelectorAll('.hm-cell')].map((c) => c.getAttribute('data-value'));
		expect(values()).toEqual(['1']);
		await rerender({ cells: [{ x: 'a', y: 'r', value: 9 }, { x: 'b', y: 'r', value: 4 }] });
		expect(values()).toEqual(['9', '4']);
		expect(ec.init).not.toHaveBeenCalled();
	});
});

describe('funnel', () => {
	test('redraws its rows when its data prop changes after mount', async () => {
		const { container, rerender } = render(Funnel, { props: { data: [{ label: 'a', value: 1 }] } });
		const counts = () => [...container.querySelectorAll('.fn-count')].map((n) => n.textContent);
		expect(counts()).toEqual(['1']);
		await rerender({ data: [{ label: 'a', value: 9 }] });
		expect(counts()).toEqual(['9']);
		expect(ec.init).not.toHaveBeenCalled();
	});
});

describe('gantt', () => {
	test('redraws its rows when tasks change after mount', async () => {
		const t1 = [{ id: '1', name: 'Plan', start: '2026-01-01', end: '2026-01-05' }];
		const t2 = [...t1, { id: '2', name: 'Build', start: '2026-01-06', end: '2026-01-10', dependencies: '1' }];
		const { container, rerender } = render(GanttChart, { props: { tasks: t1 } });
		expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(1);
		await rerender({ tasks: t2 });
		const items = container.querySelectorAll('[role="listitem"]');
		expect(items).toHaveLength(2);
		expect(items[1].getAttribute('aria-label')).toBe('Build, Jan 6, 2026 to Jan 10, 2026, after Plan');
		expect(container.textContent).toContain('Jan 1 – Jan 10, 2026 · 2 tasks');
	});
});
