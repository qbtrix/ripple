// widgets/composite/Figure.test.ts: the `figure` widget in jsdom and on the
// server: unknown ids get the quiet placeholder, the heart loads with its
// sliders, readouts and pins, a slider writes the bound value, labels are
// capped and plain text, and a streamed card ends equal to a whole one.
// The server render lives in Figure.ssr.test.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import Ripple from '$lib/Ripple.svelte';
import Figure from './Figure.svelte';
import { domShape } from '../../streaming/__fixtures__/stream-parity.js';
import { mountStreamed } from '../../streaming/__fixtures__/mount-streamed.js';

afterEach(cleanup);

const loaded = async (c: HTMLElement) => vi.waitFor(() => expect(c.querySelector('[data-slot="params"]')).not.toBeNull());

describe('figure', () => {
	it('renders a quiet placeholder for an unknown id', () => {
		const { container } = render(Figure, { props: { figure: 'unicorn' } });
		expect(container.querySelector('[data-slot="placeholder"]')).not.toBeNull();
		expect(container.querySelector('[data-slot="figure-stage"]')).toBeNull();
	});

	it('loads the heart: sliders, readouts, pins on anchors, plain-text labels', async () => {
		const labels = [
			{ anchor: 'left-ventricle', note: 'Pumps to the body.' },
			{ anchor: 'mitral', label: '<b>Mitral</b>' },
			{ anchor: 'nowhere', label: 'Ghost' },
			...Array.from({ length: 12 }, () => ({ anchor: 'aorta' }))
		];
		const { container } = render(Figure, { props: { figure: 'heart', params: { bpm: 120 }, labels, caption: 'A heart.' } });
		await loaded(container);
		expect(container.querySelector('[data-slot="title"]')!.textContent).toBe('How a heart pumps');
		const bpm = container.querySelector<HTMLInputElement>('[data-slot="param"][data-key="bpm"]')!;
		expect(bpm.value).toBe('120');
		expect(container.querySelector('[data-slot="readout"][data-key="output"]')!.textContent).toBe('8.4 L/min');
		expect(container.querySelectorAll('[data-slot="label"]')).toHaveLength(10);
		// The unknown anchor keeps its list row but gets no pin.
		expect(container.querySelectorAll('[data-slot="pin"]')).toHaveLength(9);
		expect(container.querySelector('[data-slot="labels"]')!.innerHTML).toContain('&lt;b&gt;Mitral&lt;/b&gt;');
		expect(container.querySelector('svg.iso-svg')).not.toBeNull();
	});

	it('a slider writes the bound value and the readout follows', async () => {
		const onchange = vi.fn();
		const { container } = render(Figure, { props: { figure: 'heart', onchange } });
		await loaded(container);
		const bpm = container.querySelector<HTMLInputElement>('[data-slot="param"][data-key="bpm"]')!;
		await fireEvent.input(bpm, { target: { value: '100' } });
		expect(onchange).toHaveBeenLastCalledWith({ bpm: 100, stroke: 70 });
		await vi.waitFor(() => expect(container.querySelector('[data-slot="readout"][data-key="output"]')!.textContent).toBe('7.0 L/min'));
	});

	it('streams to the same card as a whole spec', async () => {
		// The drawing itself moves with time, so compare the card around it once both have loaded.
		const spec = { ui: { type: 'figure', props: { figure: 'heart', caption: 'Two pumps.', labels: [{ anchor: 'aorta', note: 'Out to the body.' }] } } };
		const streamed = await mountStreamed(spec);
		expect(streamed.errors).toEqual([]);
		const whole = render(Ripple, { props: { spec } });
		await loaded(streamed.container);
		await loaded(whole.container);
		const shape = (c: HTMLElement) => {
			const clone = c.cloneNode(true) as HTMLElement;
			clone.querySelectorAll('[data-slot="figure-stage"]').forEach((s) => s.replaceChildren());
			clone.querySelectorAll('[data-slot="readout"]').forEach((r) => (r.textContent = ''));
			return domShape(clone);
		};
		expect(shape(streamed.container)).toBe(shape(whole.container));
	});
});
