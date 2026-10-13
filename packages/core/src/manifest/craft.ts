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
//   - `lenses` and `rules` (shipped together as `craft`): the critic's 11
//     lenses and the skill's craft rules, each rule with its lens and, when one
//     exists, the check that catches it. Prompts and critic issues cite rule
//     ids; the skill's craft.md carries the same ids (svelte's
//     skill-widgets.test.ts fails on drift either way).
//   - `intents`: what a visitor asks for, mapped to the widget that answers it,
//     with its key props and prompt hints. Hosts match `ask` against messages.
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

/** One of the critic's 11 ways of looking at a rendered card. */
export interface Lens {
	id: string;
	question: string;
}

/** A craft rule from the skill's craft.md, cited by id in prompts and critic issues. */
export interface CraftRule {
	/** Kebab id; craft.md carries it as `rule:<id>`. */
	id: string;
	/** The rule in one sentence. */
	text: string;
	/** The `lenses` id a critic looks through to catch it. */
	lens: string;
	/** The `CHECK_IDS` check that catches it mechanically, when one does. */
	check?: string;
}

export const lenses: readonly Lens[] = [
	{ id: 'archetype', question: "Is this the right archetype and widget for the card's one question?" },
	{ id: 'answer', question: 'Does the answer lead, so a reader gets the point in one second?' },
	{ id: 'data-truth', question: 'Is every given fact still there and unchanged, and do the words agree with the data?' },
	{ id: 'dates', question: 'Is every invented date on or before today, unless it is a forecast that says it is a sample?' },
	{ id: 'numbers', question: 'Is every number rounded, carrying its unit or currency, and the same wherever it repeats?' },
	{ id: 'layout', question: 'Does the card read at 360 px and at 720 px with nothing cut, squeezed or past its edge?' },
	{ id: 'hierarchy', question: 'Is there one heading per section and one primary action, with each value outweighing its label?' },
	{ id: 'density', question: 'Is every element bound to real data or an action, with no dead region and no filler?' },
	{ id: 'states', question: 'Do empty, error and edge cases show something honest instead of a blank, NaN or raw JSON?' },
	{ id: 'themes', question: 'Does the card read in light and in dark, on theme tokens rather than hex or decorative tints?' },
	{
		id: 'interaction',
		question: 'Do inputs bind to state and outputs derive from it, with only real actions and validation before side effects?'
	}
];

export const rules: readonly CraftRule[] = [
	// 0. The data is the user's
	{ id: 'data-fixed', lens: 'data-truth', text: 'Never change the data to make a widget look right.' },
	{ id: 'no-future-dates', lens: 'dates', check: 'futureDate', text: 'Invented dates are never after today.' },
	{ id: 'invented-not-false', lens: 'data-truth', text: 'Invented is fine, false is not.' },
	// 1. Choose before you build
	{ id: 'archetype-first', lens: 'archetype', text: "Name the card's one question, then its archetype, then its widget." },
	{ id: 'data-widget-alone', lens: 'archetype', check: 'twoControls', text: 'A data widget stands alone.' },
	{ id: 'booking-widget', lens: 'archetype', text: 'A booking is a `booking`.' },
	{ id: 'primitives-fallback', lens: 'archetype', text: 'Primitive trees are the fallback, not the default.' },
	// 2. Layout and width
	{ id: 'reads-at-phone', lens: 'layout', check: 'overflow', text: 'The card must read at 360 px and at 720 px.' },
	{ id: 'tile-rows-wrap', lens: 'layout', text: 'Tile rows wrap.' },
	{ id: 'no-truncation', lens: 'layout', check: 'clippedText', text: 'Truncation is a fault, not a style.' },
	{ id: 'nothing-past-card', lens: 'layout', check: 'overflow', text: 'Nothing pokes past the card.' },
	{
		id: 'designed-scroll',
		lens: 'layout',
		check: 'overflow',
		text: "A designed sideways scroll is the widget's, not yours, and the audit still counts it."
	},
	{ id: 'inputs-full-row', lens: 'layout', text: 'Inputs get a full row or a 2-column grid.' },
	// 3. Hierarchy
	{ id: 'answer-leads', lens: 'answer', text: 'The answer leads.' },
	{ id: 'one-primary-action', lens: 'hierarchy', text: 'One primary action per card.' },
	{ id: 'one-heading-per-section', lens: 'hierarchy', text: 'One heading per section, most important section first.' },
	{ id: 'colour-is-data', lens: 'themes', text: 'Colour encodes data or state only.' },
	// 4. Density and fill
	{ id: 'every-element-bound', lens: 'density', text: 'Every element is bound to a data field or an action.' },
	{ id: 'no-dead-region', lens: 'density', check: 'emptyContainers', text: 'No dead region.' },
	{ id: 'dashboards-not-stat-rows', lens: 'density', text: 'Dashboards are more than a stat row.' },
	{ id: 'phone-tiles-pair', lens: 'layout', text: 'On a phone, tiles pair up.' },
	// 5. Numbers, money and units
	{ id: 'numbers-in-stat', lens: 'numbers', text: 'Every computed or decimal number goes in a `stat`.' },
	{ id: 'money-has-currency', lens: 'numbers', text: 'Money carries its currency everywhere.' },
	{ id: 'missing-shows-dash', lens: 'numbers', check: 'badText', text: 'Missing numbers show a dash, never NaN.' },
	{ id: 'one-number-one-value', lens: 'numbers', text: 'One number, one value.' },
	{ id: 'size-worst-case', lens: 'numbers', text: 'Size for the worst case.' },
	// 6. Empty, loading, error and edge states
	{ id: 'empty-rows', lens: 'states', text: 'A data widget with 0 rows passes the checks and shows a blank card.' },
	{ id: 'widget-error', lens: 'states', check: 'errorBoxes', text: 'A widget that throws shows "This widget hit an error" inside the card.' },
	{ id: 'unknown-widget', lens: 'states', check: 'catalog', text: 'An unknown widget type renders a red box naming it.' },
	{ id: 'no-raw-json', lens: 'states', check: 'badText', text: 'Raw JSON must never reach the reader.' },
	{ id: 'choice-once', lens: 'states', text: 'Show each choice once.' },
	// 7. Tone and colour tokens
	{ id: 'theme-not-hex', lens: 'themes', text: 'Use the theme, not hex.' },
	{ id: 'both-themes', lens: 'themes', text: 'Check both themes.' },
	{ id: 'charts-on-canvas', lens: 'layout', text: 'Charts draw on canvas, so look at every chart in the screenshot.' },
	// 8. Interaction and state
	{ id: 'bind-derive', lens: 'interaction', text: 'Bind inputs, derive outputs.' },
	{ id: 'lists-fresh', lens: 'interaction', text: 'Lists keep their numbers fresh.' },
	{ id: 'real-actions', lens: 'interaction', check: 'action', text: 'Only real actions.' },
	{ id: 'validate-first', lens: 'interaction', text: 'Validate before side effects.' },
	{ id: 'small-expressions', lens: 'interaction', check: 'expr', text: 'Expressions are small.' },
	// 9. Words and data truth
	{ id: 'fictional-names', lens: 'data-truth', text: 'Fictional names and sample data.' },
	{ id: 'labels-are-words', lens: 'hierarchy', text: 'Labels are words, not identifiers.' },
	{ id: 'data-agrees', lens: 'data-truth', text: 'The data agrees with itself.' },
	{ id: 'sample-says-so', lens: 'data-truth', text: 'Weather and other made-up live data say so.' },
	{ id: 'words-not-bent', lens: 'data-truth', text: 'Words never get bent to fit either.' },
	// 10. Spec hygiene
	{ id: 'keys-in-order', lens: 'states', text: 'Keys in order: type, props, then bind and handlers, then children.' },
	{ id: 'leave-out-defaults', lens: 'density', check: 'size', text: 'Leave out defaults; repeat with `each` over state.' },
	{ id: 'same-site-links', lens: 'interaction', check: 'schema', text: 'Same-site links only.' },
	{ id: 'bulk-data-from-host', lens: 'density', check: 'size', text: 'Bulk data comes from the host, not typed into the spec.' }
];

/** The craft data the manifest ships as `craft`. */
export const craft = { rules, lenses } as const;

/**
 * What a visitor asks for, mapped to the widget that answers it. `ask` holds
 * the words and phrases a message carries (matched by hosts such as
 * pocketpaw's widget picker), `props` the widget's key props, `hints` steering
 * text for the prompt. A hint-only entry has an empty `ask`.
 */
export interface Intent {
	widget: string;
	ask: readonly string[];
	props: readonly string[];
	hints: readonly string[];
}

// ponytail: per-figure keywords (heart, tokamak, ...) stay in the host's
// overlay; add a `figure` key here when a second host needs them.
export const intents: readonly Intent[] = [
	{
		widget: 'menu-order',
		ask: ['order', 'burger', 'pizza', 'food', 'menu', 'takeaway', 'delivery', 'toppings', 'crust'],
		props: ['items', 'featured', 'verdict'],
		hints: ['Food orders always use menu-order (pizza, burgers, takeaway), never a form.']
	},
	{
		widget: 'booking',
		ask: ['book', 'booking', 'table', 'appointment', 'reservation', 'reserve', 'slot', 'slots', 'dentist', 'haircut'],
		props: ['services', 'days', 'party', 'preferred', 'verdict'],
		hints: ['Write services and days only when it is not a table (a dentist, a haircut), slot start like "2026-10-14T09:00". When the message already names a picked slot, the visitor confirmed it on the card: confirm it in text, never send them back to the card, no new booking card.']
	},
	{
		widget: 'comparison-layout',
		ask: ['compare', 'comparison', 'pick', 'vs', 'versus', 'choose', 'which', 'laptop', 'laptops', 'headphones', 'tablet', 'tablets', 'phone', 'side by side'],
		props: ['items', 'features', 'winner', 'picks', 'verdict', 'currency', 'chosen', 'on_choose'],
		hints: []
	},
	{
		widget: 'notes',
		ask: ['notes', 'note', 'notepad', 'jot', 'ideas', 'memo', 'scratchpad'],
		props: ['notes', 'tags'],
		hints: []
	},
	{
		widget: 'music-player',
		ask: ['music', 'playlist', 'songs', 'song', 'sounds', 'focus music', 'tracks', 'lofi', 'rain', 'calm'],
		props: ['tracks'],
		hints: []
	},
	{
		widget: 'map',
		ask: ['map', 'directions', 'route', 'where', 'walking', 'walk', 'near', 'nearby', 'distance', 'location'],
		props: ['center', 'zoom', 'markers', 'route', 'height'],
		hints: []
	},
	{
		widget: 'model-viewer',
		ask: ['3d', 'model', 'rotate', 'annotate', 'label its parts', 'spin', 'explore'],
		props: ['asset', 'annotations'],
		hints: []
	},
	{
		widget: 'interval-workout',
		ask: ['workout', 'yoga', 'hiit', 'exercise', 'stretch', 'stretching', 'pose', 'training', 'circuit'],
		props: ['exercises', 'workSec', 'restSec', 'rounds', 'verdict'],
		hints: []
	},
	{
		widget: 'meal-plan',
		ask: ['meal plan', 'meals', 'diet', 'protein', 'calories', 'kcal', 'nutrition', 'week of meals'],
		props: ['recipes', 'days', 'people', 'verdict'],
		hints: []
	},
	{
		widget: 'recipe',
		ask: ['recipe', 'cook', 'cooking', 'dinner', 'ingredients', 'dish', 'bake', 'vegetarian'],
		props: ['name', 'serves', 'ingredients', 'steps', 'kcal', 'protein_g', 'verdict'],
		hints: []
	},
	{
		widget: 'itinerary',
		ask: ['trip', 'travel', 'itinerary', 'getaway', 'vacation', 'holiday', 'weekend away', 'days in', 'visit'],
		props: ['days', 'budget', 'packing', 'verdict'],
		hints: []
	},
	{
		widget: 'flashcard-deck',
		ask: ['flashcards', 'flashcard', 'flash cards', 'study cards', 'vocabulary', 'memorize', 'learn words'],
		props: ['cards', 'verdict'],
		hints: []
	},
	{
		widget: 'quiz',
		ask: ['quiz', 'trivia', 'questions', 'test me', 'score'],
		props: ['questions'],
		hints: []
	},
	{
		widget: 'memory-match',
		ask: ['memory', 'match', 'matching', 'pairs', 'pairing', 'memory game'],
		props: ['pairs'],
		hints: []
	},
	{
		widget: 'word-guess',
		ask: ['word', 'guess', 'guessing', 'wordle', 'letter'],
		props: ['answer', 'hint'],
		hints: []
	},
	{
		widget: 'board-game',
		ask: ['tic-tac-toe', 'tic tac toe', 'connect four', 'connect-four', 'noughts', 'board game', 'play against'],
		props: ['game', 'difficulty'],
		hints: []
	},
	{
		widget: 'habit-tracker',
		ask: ['habit', 'habits', 'streak', 'daily', 'track my', 'weekly target'],
		props: ['habits'],
		hints: []
	},
	{
		widget: 'focus-timer',
		ask: ['focus', 'pomodoro', 'timer', 'concentrate', 'deep work'],
		props: ['focus_min', 'short_break_min', 'goal_rounds', 'task'],
		hints: []
	},
	{
		widget: 'bill-split',
		ask: ['split', 'bill', 'tip', 'share the cost', 'each person', 'owe'],
		props: ['subtotal', 'people', 'tip_percent', 'tax'],
		hints: []
	},
	{
		widget: 'growth-projection',
		ask: ['savings', 'save', 'invest', 'interest', 'compound', 'grow', 'growth', 'retirement', 'deposit'],
		props: ['deposit', 'rate', 'years', 'initial', 'goal', 'verdict'],
		hints: ['It has its own deposit, rate and years controls; never add inputs around it.']
	},
	{
		widget: 'figure',
		ask: [],
		props: ['figure', 'labels', 'caption'],
		hints: ['When a figure exists for the subject, use it: pick anchors and write notes; it is hand-built and best, ahead of an iso-scene, a model-viewer or an illustration.']
	},
	{
		widget: 'iso-scene',
		ask: ['how does', 'how do', 'how it works', 'show how', 'machine', 'mechanism', 'gears', 'gear', 'engine', 'pump', 'piston', 'drivetrain', 'pulley', 'lever', 'jack', 'crane', 'winch', 'hoist', 'animated drawing', 'animated diagram'],
		props: ['parts', 'motions', 'params', 'readouts', 'labels'],
		hints: ['When the visitor asks how a physical mechanism works (a pulley, lever, jack, crane, pump, engine, lock, clock), the card is this drawing (or a figure when one exists), never a calculator, form or number inputs; add a calculator after the drawing only if they ask for one. Draw the real machine in 12-30 parts, like the example: a base plate, the frame or body that holds it (posts, casing, stays), each moving part of the mechanism (gears, cranks, levers, pistons, valves), the rods and tubes that connect them, motions on the moving parts driven by 1-3 params, 2-3 readouts computed from the params, 3-6 labels. ripple adds rims, bevels, corner screws on plates, gear spokes and tube highlights itself, so spend no parts on bolts, screws or trim. Give a housing ghost:true so the inside shows, run a chain around two gears, and link a rod between a crank pin and a piston. Write it compact: short ids, whole numbers, no default restated, no at on a rod or tube (their points are then world points), no comments. Use it over an illustration for a machine or mechanism (an illustration stays for flat diagrams), and use a figure instead when one exists for the subject.']
	},
	{
		widget: 'illustration',
		ask: ['draw', 'drawing', 'picture', 'diagram', 'illustrate', 'animated', 'how does', 'how do', 'explain'],
		props: ['svg', 'title', 'annotations'],
		hints: []
	},
	{
		widget: 'invoice-layout',
		ask: ['invoice', 'bill client', 'billing', 'receipt', 'hours of', 'line items', 'bill a client'],
		props: ['from', 'billTo', 'invoiceNumber', 'issueDate', 'lines', 'summary'],
		hints: ['An invoice or quote is an invoice-layout (from, billTo, invoiceNumber, issueDate, lines [{description, quantity, unitPrice}], total), never a table of inputs; summary rows use value.']
	},
	{
		widget: 'checklist-layout',
		ask: ['checklist', 'due diligence', 'compliance', 'packing', 'study plan', 'tick off', 'audit', 'privacy check', 'packing list'],
		props: ['items', 'groupBy', 'title'],
		hints: ['Use for any list of items with statuses and progress, never a select per row: items [{id, label, state: pending|in-progress|done|blocked|skipped, due?}], showProgress true.']
	},
	{
		widget: 'exec-dashboard',
		ask: ['dashboard', 'financial summary', 'sales', 'kpis', 'kpi', 'revenue', 'quarterly', 'profit', 'report'],
		props: ['rows', 'measures', 'dimensions', 'x', 'split', 'verdict'],
		hints: ['A financial summary, KPIs or revenue is an exec-dashboard of raw rows and measures, never hand-built stat tiles.']
	},
	{
		widget: 'form-layout',
		ask: ['survey', 'form', 'feedback', 'questionnaire', 'signup', 'sign up'],
		props: ['sections', 'submitLabel'],
		hints: ['A survey, feedback form or questionnaire is a form-layout with sections [{id, title}] and a form inside holding the questions.']
	},
	{
		widget: 'stat',
		ask: [],
		props: ['value', 'label', 'format', 'decimals', 'currency'],
		hints: ['Round numbers before writing them (whole numbers for counts, 1 decimal for hours): an average of fixed data is its rounded number, never a division.']
	},
	{
		widget: 'table',
		ask: [],
		props: ['rows', 'columns'],
		hints: ['Keep cells to short phrases; put explanations in a callout or text below.']
	},
	{
		widget: 'todo-list',
		ask: ['todo', 'to-do', 'to do', 'tasks', 'task list'],
		props: ['title'],
		hints: []
	},
	{
		widget: 'timeline',
		ask: ['timeline', 'milestones', 'schedule', 'roadmap', 'phases', 'history'],
		props: ['events'],
		hints: []
	},
	{
		widget: 'calendar',
		ask: ['calendar', 'month', 'events', 'dates'],
		props: ['events', 'view'],
		hints: []
	},
	{
		widget: 'drawing-canvas',
		ask: ['drawing pad', 'sketch', 'canvas', 'paint', 'brush', 'doodle'],
		props: ['width', 'height'],
		hints: []
	},
	{
		widget: 'rating',
		ask: ['rating', 'ratings', 'stars', 'star'],
		props: ['label', 'max'],
		hints: []
	},
	{
		widget: 'pros-cons',
		ask: ['pros', 'cons', 'pros and cons', 'tradeoffs'],
		props: ['pros', 'cons'],
		hints: []
	},
	{
		widget: 'kanban',
		ask: ['kanban', 'board', 'backlog', 'columns'],
		props: ['columns', 'value'],
		hints: []
	},
	{
		widget: 'data-grid',
		ask: ['filter', 'sort', 'sorted', 'catalog', 'spreadsheet'],
		props: ['columns', 'rows', 'searchable', 'defaultSort'],
		hints: []
	},
	{
		widget: 'steps',
		ask: ['step by step', 'steps', 'how to', 'guide me'],
		props: ['steps'],
		hints: []
	},
	{
		widget: 'progress-ring',
		ask: ['goal', 'progress', 'percent done'],
		props: ['value', 'max', 'label'],
		hints: []
	},
	{
		widget: 'weather-forecast',
		ask: ['weather', 'forecast', 'temperature', 'rain'],
		props: ['place', 'unit', 'now', 'days', 'hourly', 'note'],
		hints: []
	},
	{
		widget: 'week-schedule',
		ask: ['weekly schedule', 'timetable', 'week calendar', 'classes'],
		props: ['events'],
		hints: ['events start and end "HH:MM", color one per kind of event; bind a state key.']
	},
	{
		widget: 'agenda',
		ask: ['agenda', 'meeting', 'run of show'],
		props: ['title', 'start', 'items'],
		hints: ['start "HH:MM", minutes per item; bind a state key.']
	},
	{
		widget: 'place-results',
		ask: ['restaurant', 'cafe', 'coffee', 'places', 'near me', 'bars'],
		props: ['places'],
		hints: ['places rows also take reviews?, price? (1 to 4), distance? ("350 m"), walkMinutes?, open?, hours?, tags?, blurb?, lat?, lng? (lat/lng add a map). Generic sample names unless a tool found real places. on_choose may emit ask {text}.']
	},
	{
		widget: 'product-grid',
		ask: ['deals', 'products', 'shopping', 'browse', 'buy'],
		props: ['products'],
		hints: ['products rows also take color? (blue|violet|teal|green|amber|rose|orange|slate) and up to 3 short specs, never an image. Generic names, never a real brand with a price. on_choose may emit ask {text}.']
	},
	{
		widget: 'media-grid',
		ask: ['documentaries', 'films', 'movies', 'podcasts', 'books to read', 'reading list', 'novels', 'watch', 'listen'],
		props: ['kind', 'items'],
		hints: ['items rows also take blurb? and color? (blue|violet|teal|green|amber|rose|orange|slate), never an image; bind a state key. on_choose may emit ask {text}.']
	}
];
