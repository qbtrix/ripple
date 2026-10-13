// @file manifest/craft.ts
// @description Craft data the build loop, the manifest build and the hosts
//   share, so no copy of it drifts:
//   - `CHECK_IDS`: every audit check id a waiver may name (the pure spec
//     audit's reports and the render page audit's counts).
//   - `waivers`: reviewed exceptions, keyed by widget type and check id, for
//     faults a widget has by design (a sideways scroller). No DOM selectors
//     here; the page audit maps a waiver to its elements. A waived item leaves
//     the fault count but stays in the round record and in telemetry.
//   - `DATA_PROPS`: per widget, the props that carry the user's data (values,
//     rows, amounts, dates). The manifest build stamps them `data: true`; the
//     data guard compares them. Layout props are never listed.
//   Zod-free and import-free, so `./manifest` stays slim
//   (headless/slim.imports.test.ts guards that).

/** A reviewed exception: items of `check` on `widget` do not count as faults. */
export interface Waiver {
	widget: string;
	/** One of `CHECK_IDS`. */
	check: string;
	reason: string;
	/** ISO date after which the waiver no longer applies. */
	until?: string;
}

/** Pure spec audit checks (specAudit report order), then render page checks. */
export const CHECK_IDS = [
	'schema',
	'catalog',
	'action',
	'envelope',
	'leftover',
	'each',
	'bind',
	'expr',
	'props',
	'twoControls',
	'size',
	'futureDate',
	'notRendered',
	'themeNotApplied',
	'errorBoxes',
	'consoleErrors',
	'overflow',
	'clippedText',
	'emptyContainers',
	'badText'
] as const;

export const waivers: readonly Waiver[] = [
	{
		widget: 'weather-forecast',
		check: 'overflow',
		reason: 'the hourly strip is a designed sideways scroller; its hours past the edge are meant to scroll'
	},
	{
		widget: 'data-grid',
		check: 'overflow',
		reason: 'a wide table scrolls sideways inside its own frame on a phone instead of squeezing its columns'
	}
];

/** Widget type to the props that hold the user's data. */
export const DATA_PROPS: Readonly<Record<string, readonly string[]>> = {
	agenda: ['start', 'items'],
	'bill-split': ['subtotal', 'tax', 'tip_percent', 'people'],
	calendar: ['events'],
	chart: ['data'],
	'comparison-table': ['rows'],
	'data-grid': ['rows'],
	funnel: ['data'],
	gantt: ['tasks'],
	gauge: ['value', 'max'],
	'growth-projection': ['initial', 'deposit', 'rate', 'years', 'goal', 'inflation'],
	'habit-tracker': ['habits'],
	heatmap: ['cells'],
	'invoice-lines': ['lines', 'subtotal', 'total'],
	itinerary: ['budget', 'days'],
	'kv-table': ['rows'],
	'meal-plan': ['days'],
	metric: ['value', 'trend'],
	'pricing-table': ['tiers'],
	progress: ['value', 'max'],
	'progress-ring': ['value', 'max'],
	'range-bar': ['min', 'max', 'current'],
	recipe: ['minutes', 'serves', 'kcal', 'protein_g', 'ingredients'],
	sparkline: ['values'],
	stat: ['value', 'delta', 'deltaPercent'],
	table: ['rows'],
	timeline: ['events'],
	'weather-forecast': ['now', 'days', 'hourly'],
	'week-schedule': ['events']
};
