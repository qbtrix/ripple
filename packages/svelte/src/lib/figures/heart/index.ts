// figures/heart/index.ts: the `heart` figure module the `figure` widget loads
// lazily: its meta (title, sliders, readouts, named anchors in percent of the
// figure box) and `mount`, which draws it live into a host element. Nothing
// runs at import: the anchors are computed when first read.
import type { FigureMeta } from '../types.js';
import { PARAMS } from './model.js';
import { anchorsOf, mount } from './figure.js';

export const meta: FigureMeta = {
	id: 'heart',
	title: 'How a heart pumps',
	params: PARAMS,
	readouts: [
		{ key: 'bpm', label: 'Heart rate', unit: 'bpm' },
		{ key: 'output', label: 'Cardiac output', unit: 'L/min' },
		{ key: 'pressure', label: 'Aortic pressure', unit: 'mmHg' },
		{ key: 'phase', label: 'Phase' }
	],
	/** Computed on first read, so importing this module does no work. */
	get anchors() {
		return anchorsOf();
	}
};

export { mount };
