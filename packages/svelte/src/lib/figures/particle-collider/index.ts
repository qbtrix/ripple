// figures/particle-collider/index.ts: the `particle-collider` figure module the
// `figure` widget loads lazily: its meta (title, sliders, readouts, named
// anchors in percent of the figure box) and `mount`. Nothing runs at import:
// the anchors are computed when first read.
import type { FigureMeta } from '../types.js';
import { PARAMS } from './model.js';
import { anchorsOf, mount } from './figure.js';

export const meta: FigureMeta = {
	id: 'particle-collider',
	title: 'How a particle collider works',
	params: PARAMS,
	readouts: [
		{ key: 'speed', label: 'Speed', unit: '% of light' },
		{ key: 'field', label: 'Dipole field', unit: 'T' },
		{ key: 'energy', label: 'Collision energy', unit: 'TeV' },
		{ key: 'collisions', label: 'Collisions a second' }
	],
	get anchors() {
		return anchorsOf();
	}
};

export { mount };
