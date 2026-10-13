// figures/bike-gears/index.ts: the `bike-gears` figure module the `figure`
// widget loads lazily: its meta (title, sliders, readouts, named anchors in
// percent of the figure box) and `mount`. Nothing runs at import: the anchors
// are computed when first read.
import type { FigureMeta } from '../types.js';
import { PARAMS } from './model.js';
import { anchorsOf, mount } from './figure.js';

export const meta: FigureMeta = {
	id: 'bike-gears',
	title: 'How bike gears work',
	params: PARAMS,
	readouts: [
		{ key: 'gear', label: 'Gear' },
		{ key: 'ratio', label: 'Gear ratio' },
		{ key: 'metres', label: 'Per pedal turn', unit: 'm' },
		{ key: 'speed', label: 'Speed', unit: 'km/h' }
	],
	get anchors() {
		return anchorsOf();
	}
};

export { mount };
