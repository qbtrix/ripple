// figures/heart/index.ts: the `heart` figure module the `figure` widget loads
// lazily: its meta (title, sliders, readouts, named anchors in percent of the
// figure box) and `mount`, which draws it live into a host element.
import type { FigureMeta } from '../types.js';
import { PARAMS } from './model.js';
import { ANCHORS, mount } from './figure.js';

export const meta: FigureMeta = {
	id: 'heart',
	title: 'How a heart pumps',
	params: PARAMS.map(({ key, label, min, max, step, unit, value }) => ({ key, label, min, max, step, unit, value })),
	readouts: [
		{ key: 'bpm', label: 'Heart rate', unit: 'bpm' },
		{ key: 'output', label: 'Cardiac output', unit: 'L/min' },
		{ key: 'phase', label: 'Phase' }
	],
	anchors: ANCHORS
};

export { mount };
