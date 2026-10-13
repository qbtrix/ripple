// figures/ion-thruster/index.ts: the `ion-thruster` figure module the `figure`
// widget loads lazily: its meta (title, sliders, readouts, named anchors in
// percent of the figure box) and `mount`. Nothing runs at import: the anchors
// are computed when first read.
import type { FigureMeta } from '../types.js';
import { PARAMS } from './model.js';
import { anchorsOf, mount } from './figure.js';

export const meta: FigureMeta = {
	id: 'ion-thruster',
	title: 'How a plasma thruster works',
	params: PARAMS,
	readouts: [
		{ key: 'speed', label: 'Exhaust speed', unit: 'km/s' },
		{ key: 'thrust', label: 'Thrust', unit: 'mN' },
		{ key: 'power', label: 'Power', unit: 'kW' }
	],
	get anchors() {
		return anchorsOf();
	}
};

export { mount };
