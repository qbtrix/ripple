// figures/fission-reactor/index.ts: the `fission-reactor` figure module the
// `figure` widget loads lazily: its meta (title, sliders, readouts, named
// anchors in percent of the figure box) and `mount`. Nothing runs at import:
// the anchors are computed when first read.
import type { FigureMeta } from '../types.js';
import { PARAMS } from './model.js';
import { anchorsOf, mount } from './figure.js';

export const meta: FigureMeta = {
	id: 'fission-reactor',
	title: 'How a nuclear fission reactor works',
	params: PARAMS,
	readouts: [
		{ key: 'thermal', label: 'Thermal power', unit: 'MW' },
		{ key: 'electric', label: 'Electric power', unit: 'MW' },
		{ key: 'coolant', label: 'Coolant temperature', unit: '°C' }
	],
	get anchors() {
		return anchorsOf();
	}
};

export { mount };
