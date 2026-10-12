// manifest/entries/figure.ts: the LLM-facing entry for `figure`, a curated
// hand-built isometric figure picked by id (catalog in lib/figures). The model
// sets the id, starting slider values, up to 10 plain-text labels on the
// figure's named anchors, and a caption. No markup, no URLs.
import type { WidgetManifestEntry } from '../index.js';

export const figureEntry: WidgetManifestEntry = {
	type: 'figure',
	category: 'composite',
	description: 'A hand-built live isometric figure picked by id ("heart": how a heart pumps), with sliders, live readouts and numbered labels on its named parts. Bind value.',
	props: {
		figure: { type: '"heart"', required: true, description: 'Figure id. "heart" is a beating heart as two pumps: sliders bpm (40-180) and stroke (50-110 ml).' },
		params: { type: 'Record<string, number>', required: false, description: 'Starting slider values, e.g. { "bpm": 120 }. Clamped to each slider.' },
		labels: {
			type: 'Array<{ anchor: string; label?: string; note?: string }>',
			required: false,
			description:
				'Up to 10 numbered pins, plain text. heart anchors: right-atrium, right-ventricle, left-atrium, left-ventricle, tricuspid, mitral, pulmonary-valve, aortic-valve, aorta, vena-cava, pulmonary-artery, pulmonary-veins, lungs, body.'
		},
		caption: { type: 'string', required: false, description: 'One or two plain sentences under the figure.' },
		value: { type: 'Record<string, number>', required: false, description: 'Two-way bind with `bind: "{state.figure}"`: the slider values, written when one moves.' }
	},
	example: {
		type: 'figure',
		bind: '{state.figure}',
		props: {
			figure: 'heart',
			params: { bpm: 72 },
			labels: [
				{ anchor: 'right-ventricle', note: 'Pumps oxygen-poor blood to the lungs.' },
				{ anchor: 'left-ventricle', note: 'Pumps oxygen-rich blood to the whole body.' },
				{ anchor: 'mitral', label: 'Mitral valve', note: 'Opens while the left ventricle fills.' }
			],
			caption: 'Move the heart rate and watch the output change.'
		}
	}
};
