// figures/tokamak/index.ts: the `tokamak` figure module the `figure` widget
// loads lazily: its meta (title, sliders, readouts, named anchors in percent
// of the figure box) and `mount`. Nothing runs at import: the anchors are
// computed when first read.
import type { FigureMeta } from '../types.js';
import { PARAMS } from './model.js';
import { anchorsOf, mount } from './figure.js';

export const meta: FigureMeta = {
	id: 'tokamak',
	title: 'How a fusion reactor works',
	params: PARAMS,
	readouts: [
		{ key: 'temperature', label: 'Plasma core', unit: 'million °C' },
		{ key: 'fusion', label: 'Fusion power', unit: 'MW' },
		{ key: 'gain', label: 'Gain Q' }
	],
	get anchors() {
		return anchorsOf();
	}
};

export { mount };
