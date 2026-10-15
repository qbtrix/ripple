// figures/rocket-engine/index.ts: the `rocket-engine` figure module the
// `figure` widget loads lazily: its meta (title, sliders, readouts, named
// anchors in percent of the figure box) and `mount`. Nothing runs at import:
// the anchors are computed when first read.
import type { FigureMeta } from '../types.js';
import { PARAMS } from './model.js';
import { anchorsOf, mount } from './figure.js';

export const meta: FigureMeta = {
	id: 'rocket-engine',
	title: 'Inside a rocket engine',
	params: PARAMS,
	readouts: [
		{ key: 'thrust', label: 'Thrust', unit: 'kN' },
		{ key: 'pressure', label: 'Chamber pressure', unit: 'bar' },
		{ key: 'rpm', label: 'Turbopump', unit: 'rpm' }
	],
	get anchors() {
		return anchorsOf();
	}
};

export { mount };
