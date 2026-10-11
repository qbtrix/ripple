// widgets/media/ModelViewer.test.ts — the `model-viewer` widget in jsdom: the
// lazy-load placeholder, `asset` resolution against a fixture catalog (the real
// one is mocked out), the quiet placeholder for unknown assets and load errors,
// labelled pins and the list under the viewer, camera aim on open, Esc, `focus`,
// on_select, reduced motion, and stream parity. `<model-viewer>` is a stub
// element here, so pins are plain slotted DOM; real rendering is checked by eye.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { expectStreamParity } from '$lib/streaming/__fixtures__/stream-parity.js';
import ModelViewer from './ModelViewer.svelte';
import { getModelAssetBase, resolveModelAsset, setModelAssetBase } from './model-asset-types.js';

const motion = vi.hoisted(() => ({ current: false }));
vi.mock('svelte/motion', async (orig) => ({ ...(await orig<object>()), prefersReducedMotion: motion }));
vi.mock('@google/model-viewer', () => ({}));
vi.mock('./model-assets.js', () => ({
	MODEL_ASSETS: {
		plane: {
			id: 'plane',
			title: 'Small plane',
			file: 'plane.glb',
			poster: 'plane.webp',
			orbit: '0deg 75deg 6m',
			license: 'CC0-1.0',
			author: 'Test',
			source: 'https://example.com/plane',
			tags: ['vehicle'],
			anchors: [
				{ name: 'nose', label: 'Nose', position: '0 0.5 2', orbit: '0deg 80deg 3m' },
				{ name: 'left-wing', label: 'Left wing', position: '-3 0.6 0', normal: '0 1 0' },
				{ name: 'tail', label: 'Tail', position: '0 1.2 -2.5' }
			]
		},
		astronaut: {
			id: 'astronaut',
			title: 'Astronaut',
			file: 'astronaut.glb',
			license: 'CC-BY-4.0',
			author: 'Test',
			source: 'https://example.com/astronaut',
			tags: ['people'],
			anchors: [{ name: 'helmet', label: 'Helmet', position: '0 1.75 0.1' }]
		}
	}
}));

afterEach(() => {
	cleanup();
	motion.current = false;
});

const viewerOf = (c: Element) => c.querySelector('model-viewer') as HTMLElement | null;
const pins = (c: Element) => [...c.querySelectorAll<HTMLButtonElement>('[data-slot="pin"]')];
const NOTES = [
	{ anchor: 'nose', note: 'Points into the wind.' },
	{ anchor: 'left-wing', label: 'Port wing', note: 'Makes the lift.' },
	{ anchor: 'rudder', note: 'Not an anchor of this model.' },
	{ position: '9 9 9', label: 'Raw point' }
];

describe('ModelViewer loading', () => {
	it('renders a loading placeholder before the viewer module resolves', () => {
		const { container } = render(ModelViewer, { props: { src: 'https://example.com/model.glb', alt: 'A model' } });
		const loading = container.querySelector('.ripple-model-viewer-loading');
		expect(loading).not.toBeNull();
		expect(loading!.getAttribute('aria-busy')).toBe('true');
	});
});

describe('model asset base', () => {
	afterEach(() => setModelAssetBase(''));
	it('defaults to the public site and always ends with a slash', () => {
		expect(getModelAssetBase()).toBe('https://ripple.pocketpaw.xyz/models/');
		setModelAssetBase('/models');
		expect(getModelAssetBase()).toBe('/models/');
		expect(resolveModelAsset('nope', {})).toBeNull();
		expect(resolveModelAsset('toString', {})).toBeNull();
	});
});

describe('ModelViewer', () => {
	beforeAll(() => {
		if (!customElements.get('model-viewer')) customElements.define('model-viewer', class extends HTMLElement {});
	});

	it('resolves an asset against the base, and asset wins over src', () => {
		const { container } = render(ModelViewer, { props: { asset: 'plane', src: 'https://example.com/other.glb' } });
		const v = viewerOf(container)!;
		expect(v.getAttribute('src')).toBe('https://ripple.pocketpaw.xyz/models/plane.glb');
		expect(v.getAttribute('poster')).toBe('https://ripple.pocketpaw.xyz/models/plane.webp');
		expect(v.getAttribute('camera-orbit')).toBe('0deg 75deg 6m');
	});

	it('shows a quiet placeholder for an unknown asset, with no src fallback', () => {
		const { container } = render(ModelViewer, { props: { asset: 'zeppelin', src: 'https://example.com/z.glb' } });
		expect(viewerOf(container)).toBeNull();
		expect(screen.getByText('3D model not available')).toBeTruthy();
	});

	it('shows the same placeholder when the model fails to load', async () => {
		const { container } = render(ModelViewer, { props: { src: 'https://example.com/broken.glb' } });
		viewerOf(container)!.dispatchEvent(new CustomEvent('error', { detail: { type: 'loadfailure' } }));
		await tick();
		expect(viewerOf(container)).toBeNull();
		expect(screen.getByText('3D model not available')).toBeTruthy();
	});

	it('pins anchors as hotspots with default or custom labels, dropping unknown anchors and raw points', () => {
		const { container } = render(ModelViewer, { props: { asset: 'plane', annotations: NOTES } });
		const p = pins(container);
		expect(p.map((b) => b.getAttribute('slot'))).toEqual(['hotspot-nose', 'hotspot-left-wing']);
		expect(p[0].getAttribute('data-position')).toBe('0 0.5 2');
		expect(p[0].getAttribute('data-normal')).toBe('0 1 0');
		expect(p.map((b) => b.getAttribute('aria-label'))).toEqual(['1. Nose', '2. Port wing']);
		const legend = screen.getByRole('list', { name: 'Labelled points' });
		expect(legend.textContent).toContain('Port wing');
	});

	it('honours raw positions on a src model only when they are three numbers', () => {
		const { container } = render(ModelViewer, {
			props: {
				src: 'https://example.com/a.glb',
				annotations: [{ position: '0 1.75 0.1', label: 'Helmet' }, { position: '1 2' }, { anchor: 'nose' }]
			}
		});
		expect(pins(container).map((b) => b.getAttribute('data-position'))).toEqual(['0 1.75 0.1']);
	});

	it('opens a note on click: camera aims, on_select fires; click again and Esc close', async () => {
		const onselect = vi.fn();
		const { container } = render(ModelViewer, { props: { asset: 'plane', annotations: NOTES, onselect } });
		const v = viewerOf(container)!;
		await fireEvent.click(pins(container)[0]);
		expect(screen.getByText('Points into the wind.')).toBeTruthy();
		expect(v.getAttribute('camera-target')).toBe('0m 0.5m 2m');
		expect(v.getAttribute('camera-orbit')).toBe('0deg 80deg 3m');
		expect(onselect).toHaveBeenCalledWith({ anchor: 'nose', label: 'Nose' });
		const items = screen.getAllByRole('button', { name: /Port wing/ }).filter((b) => b.dataset.slot === 'legend-item');
		await fireEvent.click(items[0]);
		expect(pins(container)[1].getAttribute('aria-expanded')).toBe('true');
		expect(v.getAttribute('camera-orbit')).toBe('0deg 75deg 6m');
		await fireEvent.click(items[0]);
		expect(container.querySelector('[data-slot="note"]')).toBeNull();
		expect(v.hasAttribute('camera-target')).toBe(false);
		await fireEvent.click(pins(container)[0]);
		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(container.querySelector('[data-slot="note"]')).toBeNull();
		expect(onselect).toHaveBeenCalledTimes(3);
	});

	it('focus opens a note at start without firing on_select', () => {
		const onselect = vi.fn();
		render(ModelViewer, { props: { asset: 'plane', annotations: NOTES, focus: 'left-wing', onselect } });
		expect(screen.getByText('Makes the lift.')).toBeTruthy();
		expect(onselect).not.toHaveBeenCalled();
	});

	it('turns off auto-rotate and jumps the camera under reduced motion', async () => {
		motion.current = true;
		const { container } = render(ModelViewer, { props: { asset: 'plane', annotations: NOTES, autoRotate: true } });
		const v = viewerOf(container)! as HTMLElement & { jumpCameraToGoal: () => void };
		v.jumpCameraToGoal = vi.fn();
		expect(v.hasAttribute('auto-rotate')).toBe(false);
		await fireEvent.click(pins(container)[0]);
		await Promise.resolve();
		await tick();
		expect(v.jumpCameraToGoal).toHaveBeenCalled();
	});

	it('keeps the same element and src while annotations stream in', async () => {
		const { container, rerender } = render(ModelViewer, { props: { asset: 'plane' } });
		const v = viewerOf(container);
		await rerender({ asset: 'plane', annotations: NOTES.slice(0, 1) });
		await rerender({ asset: 'plane', annotations: NOTES, focus: 'nose' });
		expect(viewerOf(container)).toBe(v);
		expect(v!.getAttribute('src')).toBe('https://ripple.pocketpaw.xyz/models/plane.glb');
		expect(pins(container)).toHaveLength(2);
	});

	it('streams to the same render as the whole spec', async () => {
		await expectStreamParity({
			ui: { type: 'model-viewer', props: { asset: 'plane', alt: 'A small plane', annotations: NOTES, focus: 'nose' } }
		});
	});
});
