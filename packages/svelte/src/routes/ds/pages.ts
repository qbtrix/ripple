// routes/ds/pages.ts: the focused /ds/<slug> pages, in the order the /ds hub
// lists them. One source for the hub card (title, caption) and for each page's
// h1, <title> ("<title> · Ripple design system") and meta description, so the
// card and the page it opens can't drift apart. pages.test.ts checks every
// entry has a route and every route renders through Showcase.svelte.

export interface DsPage {
	slug: string;
	title: string;
	/** One line on the hub card. */
	caption: string;
	/** The page's meta description and default intro. */
	description: string;
}

export const DS_PAGES: DsPage[] = [
	{ slug: 'button', title: 'Button', caption: 'Every variant, size and state.', description: 'The Button widget in every variant, size and state: icons, loading, disabled, full width and inside a card.' },
	{ slug: 'card', title: 'Card', caption: 'Card variants and composition.', description: 'The Card widget: its variants, density, an interactive card, and the header and footer slots.' },
	{ slug: 'stat', title: 'Stat', caption: 'The metric display widget.', description: 'The Stat widget: sizes, number formats, which direction counts as good, alignment and use inside a card.' },
	{ slug: 'checkbox-group', title: 'Checkbox group', caption: 'The gliding hover highlight.', description: 'The checkbox-group widget: a hover highlight that glides between rows, merged backgrounds for neighbouring picks, and disabled states.' },
	{ slug: 'moving-indicator', title: 'Moving indicator', caption: 'One primitive behind segmented controls and lists.', description: 'The movingIndicator action: one highlight that springs to the active item, driving a segmented control by selection and a checkbox group by hover.' },
	{ slug: 'motion', title: 'Motion', caption: 'The node-level motion field and the animate action.', description: 'The motion field any spec node can carry: scroll entrances, hover and tap springs, the reveal and parallax widgets, and the animate action.' },
	{ slug: 'effects', title: 'Effects', caption: 'Marquee, beams, shimmer, aurora, spotlight.', description: 'The effect widgets: marquee, border beam, shimmer, animated beam, aurora, spotlight, bento grid and text effects, all plain CSS or SVG.' },
	{ slug: 'marketing', title: 'Marketing blocks', caption: 'Navbar to footer, composed into one page.', description: 'The marketing widgets composed into one landing page from a single spec, with a theme block setting the brand colour, heading font and logo.' },
	{ slug: 'ai', title: 'Agent display', caption: 'Streamed text, tool calls, reasoning, approval gates.', description: 'Widgets that show an agent at work: streamed text, tool calls, reasoning traces and approval gates.' },
	{ slug: 'spec', title: 'Spec composition', caption: 'Cards, charts and stats from one JSON spec.', description: 'Cards, stats and charts composed from JSON specs, with slots that route a child into a card header or footer.' },
	{ slug: 'data-kit', title: 'Data kit', caption: 'Status pills, stat chips, photo tiles, formatters.', description: 'The Svelte parts the data widgets share: status pills, stat chips, section cards, photo tiles, a stage rail, row motion and formatters.' },
	{ slug: 'shell', title: 'Shell', caption: 'Sidebar rows, panel headers, key hints.', description: 'App shell parts for Svelte: sidebar rows and section headers, a side panel header, key hints and a segmented control with badges.' },
	{ slug: 'feature', title: 'Feature page parts', caption: 'Page header, empty state, inline alerts.', description: 'Parts for a feature page in Svelte: a page header with toolbar, empty states, inline alerts, form fields, filters and a dialog.' },
	{ slug: 'call', title: 'Call parts', caption: 'Control bar, tiles, dock and incoming call card.', description: 'Parts for a call screen in Svelte: control buttons and bars, participant tiles, a floating dock, incoming call cards and a bottom sheet.' },
	{ slug: 'apps', title: 'App widgets', caption: 'Notes, music, weather, schedules, places, products, drawings.', description: 'Widgets that stand for a small app: notes, music, weather, schedules, places, products and drawings, each rendered from its docs example.' }
];

/** The entry for a slug; throws so a typo fails the build instead of shipping a blank title. */
export function dsPage(slug: string): DsPage {
	const page = DS_PAGES.find((p) => p.slug === slug);
	if (!page) throw new Error(`No /ds page "${slug}" in DS_PAGES`);
	return page;
}
