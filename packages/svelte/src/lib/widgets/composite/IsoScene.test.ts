// widgets/composite/IsoScene.test.ts: the iso-scene data widget in jsdom:
// caps and quiet skips, plain text only, sliders writing the bound value and
// moving readouts, and stream parity through the registry.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import IsoScene, { toParams } from './IsoScene.svelte';
import { ISO_SCENES, heartScene } from './iso-scenes.js';
import { expectStreamParity } from '../../streaming/__fixtures__/stream-parity.js';

afterEach(() => cleanup());

describe('iso-scene', () => {
	it('caps parts, params and labels and skips unknown kinds quietly', () => {
		const parts = [{ id: 'x', kind: 'svg', svg: '<script>' }, ...Array.from({ length: 180 }, (_, i) => ({ id: `b${i}`, kind: 'box', at: [i, 0, 0] }))];
		const params = Array.from({ length: 9 }, (_, i) => ({ key: `p${i}`, label: 'P', min: 0, max: 1, value: 0 }));
		const labels = Array.from({ length: 14 }, (_, i) => ({ part: `b${i}`, label: `L${i}` }));
		const { container } = render(IsoScene, { props: { parts, params, labels } });
		expect(container.querySelectorAll('[data-part]')).toHaveLength(150);
		expect(container.querySelectorAll('[data-slot="param"]')).toHaveLength(6);
		expect(container.querySelectorAll('[data-slot="pin"]')).toHaveLength(10);
		expect(container.innerHTML).not.toContain('<script');
	});

	it('rejects bad param keys and clamps values', () => {
		const out = toParams([{ key: 'a b', min: 0, max: 1 }, { key: 'ok', min: 10, max: 1, value: 1e12 }]);
		expect(out).toHaveLength(1);
		expect(out[0]!.value).toBe(out[0]!.max);
	});

	it('a slider writes value and moves readouts', async () => {
		const onchange = vi.fn();
		const { container } = render(IsoScene, { props: { ...heartScene, onchange } });
		const readout = () => container.querySelector('[data-slot="readout"]')!.textContent;
		expect(readout()).toBe('5.0 L/min');
		const slider = container.querySelector('[data-slot="param"]') as HTMLInputElement;
		await fireEvent.input(slider, { target: { value: '120' } });
		expect(onchange).toHaveBeenLastCalledWith({ rate: 120 });
		expect(readout()).toBe('8.4 L/min');
	});

	it('label text and titles stay plain', () => {
		const { container } = render(IsoScene, {
			props: { title: '<img src=x onerror=alert(1)>Gears', parts: [{ id: 'a', kind: 'plate', label: '<b>x</b>' }], labels: [{ part: 'a', label: '<i>A</i>' }] }
		});
		expect(container.querySelector('img,b,i')).toBeNull();
		expect(container.querySelector('[data-slot="title"]')!.textContent).toContain('Gears');
	});

	// A whole scene is redrawn per streamed frame, so these get bigger chunks and room under a loaded run.
	it.each(Object.entries(ISO_SCENES))('the %s scene streams to the same card as a whole spec', async (_name, props) => {
		await expectStreamParity({ ui: { type: 'iso-scene', props } }, { chunkSize: 160 });
	}, 30_000);
});
