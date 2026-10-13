// manifest/entries/figure.ts: the LLM-facing entry for `figure`, a curated
// hand-built isometric figure picked by id (catalog in lib/figures). The model
// sets the id, starting slider values, up to 10 plain-text labels on the
// figure's named anchors, and a caption. Ids: heart, bike-gears, ion-thruster. No markup, no URLs.
import type { WidgetManifestEntry } from '../index.js';

export const figureEntry: WidgetManifestEntry = {
	type: 'figure',
	category: 'composite',
	description: 'A hand-built live isometric figure picked by id (heart, bike-gears, ion-thruster), with sliders, live readouts and numbered labels on its named parts. Bind value.',
	props: {
		figure: {
			type: '"heart" | "bike-gears" | "ion-thruster"',
			required: true,
			description:
				'Figure id. "heart" is a beating heart as two pumps: sliders bpm (40-180) and stroke (50-110 ml). "bike-gears" is a bicycle drivetrain on a stand: sliders cadence (40-120 rpm), ring (34 or 50 teeth) and gear (1-7, 1 = the 28-tooth cog, 7 = the 11); readouts gear ratio, metres per pedal turn and km/h. "ion-thruster" is a gridded xenon ion thruster cut in half on a thrust stand: sliders voltage (600-1800 V on the grids) and flow (0.5-3 mg/s of xenon); readouts exhaust speed km/s, thrust mN and power kW.'
		},
		params: { type: 'Record<string, number>', required: false, description: 'Starting slider values, e.g. { "bpm": 120 }. Clamped to each slider.' },
		labels: {
			type: 'Array<{ anchor: string; label?: string; note?: string }>',
			required: false,
			description:
				'Up to 10 numbered pins, plain text. heart anchors: right-atrium, right-ventricle, left-atrium, left-ventricle, tricuspid, mitral, pulmonary-valve, aortic-valve, aorta, vena-cava, pulmonary-artery, pulmonary-veins, lungs, body. bike-gears anchors: chainring, crank, pedal, chain, cassette, rear-derailleur, front-derailleur, jockey-wheels, rear-hub, wheel. ion-thruster anchors: xenon-tank, flow-controller, power-unit, discharge-chamber, magnets, cathode, plasma, screen-grid, accel-grid, neutraliser, ion-beam, thrust-dial.'
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
