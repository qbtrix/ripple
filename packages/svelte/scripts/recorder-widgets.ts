// scripts/recorder-widgets.ts — Which manifest widgets record-scenario.ts shows
// the model. The full manifest is ~250 KB, so the recorder sends the primitive
// CATEGORIES whole and everything else by name: the data widgets the CARD SHAPE
// rules route to (DATA_WIDGETS), and every other widget a /live gallery run or
// widget demo uses (GALLERY_WIDGETS: figures, iso drawings, the app cards, the
// research pieces the Pocket boards demo is built from). recorder-widgets.test.ts
// fails when the gallery uses a widget the model cannot see, since a recording
// of that example could never pick it. Kept out of record-scenario.ts, which
// runs on import.

export const CATEGORIES = new Set(['layout', 'display', 'input', 'data', 'control', 'overlay', 'interactive']);

export const DATA_WIDGETS = new Set([
	'itinerary', 'booking', 'menu-order', 'growth-projection', 'bill-split', 'recipe', 'meal-plan', 'interval-workout', 'flashcard-deck',
	'word-guess', 'quiz', 'memory-match', 'habit-tracker', 'focus-timer', 'notes', 'board-game',
	'comparison-layout', 'exec-dashboard', 'entity-detail', 'timeline', 'kv-table', 'model-viewer'
]);

export const GALLERY_WIDGETS = new Set([
	'figure', 'iso-scene', 'place-results', 'product-grid', 'week-schedule', 'agenda', 'weather-forecast', 'music-player', 'media-grid',
	'order-status', 'audit-log', 'tool-call', 'approval-gate', 'terminal', 'ripple-frame',
	'company-header', 'ticker', 'range-bar', 'analyst-bar', 'callout', 'news-card', 'source-card', 'citation', 'sources-bar', 'discover-card', 'follow-up'
]);

/** True when the recorder offers this widget (extra: the run's --widgets). */
export const offered = (w: { type: string; category: string }, extra: Set<string> = new Set()) =>
	CATEGORIES.has(w.category) || DATA_WIDGETS.has(w.type) || GALLERY_WIDGETS.has(w.type) || extra.has(w.type);
