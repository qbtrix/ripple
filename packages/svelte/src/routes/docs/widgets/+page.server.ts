// /docs/widgets: the category index, built from the widget manifest at prerender,
// plus the category anchors for the layout's "On this page" rail.
import { widgetCategories } from '$lib/site/docs/widgets.js';

export const load = () => {
	const categories = widgetCategories();
	// The docs layout's "On this page" rail reads `headings`: here, the categories.
	const headings = categories.map((c) => ({ id: c.id, text: `${c.title} (${c.widgets.length})`, depth: 2 as const }));
	return { categories, headings };
};
