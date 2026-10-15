// showcase.test.ts — The site-only showcase previews: every key is a real
// manifest widget, every spec contains that widget (the root unless listed in
// NOT_ROOT) and passes the bound spec audit (schema, catalog, actions, props
// and the rest; not futureDate, since gantt and calendar plan ahead), and the
// widget page previews the showcase spec in place of the manifest example,
// which a root showcase must not repeat. The wave-4 samples' arithmetic
// matches the verdict text they print.
// Every asset URL is same-origin or on a host the site CSP allows, and every
// local media file exists under static/. Rendering is covered by
// widgets.test.ts, which renders every page's pageSpecs(...).example.
import { describe, expect, it } from 'vitest';
import { manifestEntries } from '../../manifest/index.js';
import { getWidgetTypes } from '../../widgets/index.js';
import { specAudit } from '@ripple-ui/core';
import { SHOWCASE } from './showcase.js';
import { exampleSpec, pageSpecs } from './widgets.js';
import { findNode } from './props.js';

/** Showcases whose widget is not the root, and why. */
const NOT_ROOT: Record<string, string> = { toast: 'needs a button that fires the toast action' };
/**
 * Props a showcase may set that the manifest entry does not document. Split reads its panes from
 * `start` and `end` only (its manifest example's children never reach them), and documenting them
 * would grow the manifest the chat prompt carries.
 */
const UNDOCUMENTED: Record<string, string[]> = { split: ['start', 'end'] };
const ALLOWED_HOSTS = ['images.unsplash.com', 'i.pravatar.cc', 'example.com'];

const staticFiles = new Set(Object.keys(import.meta.glob('/static/**/*.{jpg,mp4,mp3,m4a,svg,glb}', { query: '?url' })));
const entry = (type: string) => manifestEntries.find((e) => e.type === type);
// Typed views of the wave-4 samples whose arithmetic the verdict text quotes.
type Cost = { cost?: number };
type Trip = { state: { days: { stops: Cost[] }[] }; ui: { props: { budget: number; legs: Cost[] } } };
type MealPlan = { ui: { props: { recipes: { id: string; protein_g: number }[]; days: { meals: { recipe: string }[] }[] } } };
type Gauge = { ui: { props: { value: number; max: number } } };
const costs = (xs: Cost[]) => xs.reduce((n, x) => n + (x.cost ?? 0), 0);
const cases = Object.entries(SHOWCASE).map(([type, spec]) => ({ type, spec }));

describe('widget showcase specs', () => {
	it('covers the wave-1 to wave-3 and preview-polish widgets', () => {
		expect(Object.keys(SHOWCASE)).toEqual(
			expect.arrayContaining([
				'gantt',
				'treemap',
				'workflow',
				'bulk-action-bar',
				'calendar',
				'invoice-layout',
				'heatmap',
				'audit-log',
				'funnel',
				'kanban',
				'menu-order',
				'saved-views',
				'image',
				'avatar',
				'avatar-group',
				'parallax',
				'marquee',
				'quote',
				'soul-status',
				'breadcrumb',
				'split',
				'code-editor',
				'toast',
				'map',
				'video',
				'audio',
				'embed',
				'model-viewer',
				'location-picker',
				'citation',
				'company-header',
				'ticker',
				'news-card',
				'source-card',
				'sources-bar',
				'discover-card',
				'logo-cloud',
				'gauge',
				'order-status',
				'org-chart',
				'pipeline-dashboard',
				'sankey'
			])
		);
	});

	it('covers the wave-4 widgets', () => {
		expect(Object.keys(SHOWCASE)).toEqual(
			expect.arrayContaining(['itinerary', 'meal-plan', 'weather-forecast', 'bill-split', 'quiz', 'flashcard-deck'])
		);
	});

	it('wave-4 sample numbers add up to what their verdicts say', () => {
		const trip: Trip = JSON.parse(JSON.stringify(SHOWCASE.itinerary));
		const spend = trip.state.days.reduce((n, d) => n + costs(d.stops), 0) + costs(trip.ui.props.legs);
		expect(spend - trip.ui.props.budget).toBeCloseTo(120, -1); // "About €120 over budget"

		const plan: MealPlan = JSON.parse(JSON.stringify(SHOWCASE['meal-plan']));
		const protein = new Map(plan.ui.props.recipes.map((r) => [r.id, r.protein_g]));
		const perDay = plan.ui.props.days.map((d) => d.meals.reduce((n, m) => n + (protein.get(m.recipe) ?? 0), 0));
		expect(Math.round(perDay.reduce((a, b) => a + b, 0) / perDay.length / 10) * 10).toBe(150); // "About 150 g protein"

		const gauge: Gauge = JSON.parse(JSON.stringify(SHOWCASE.gauge));
		expect(gauge.ui.props.value).toBeLessThanOrEqual(gauge.ui.props.max);
	});

	it.each(cases)('$type is a manifest widget with a valid spec rooted at it', ({ type, spec }) => {
		expect(entry(type), `${type} is not in the manifest`).toBeDefined();
		expect(spec.version).toBe('1.0');
		if (NOT_ROOT[type]) expect(findNode(spec, type)).not.toBeNull();
		else {
			expect(spec.ui).toMatchObject({ type });
			expect(spec.ui, `${type} repeats the manifest example`).not.toEqual(entry(type)?.example);
		}
		const reports = specAudit(spec, { widgetTypes: getWidgetTypes(), widgets: manifestEntries });
		const allowed = UNDOCUMENTED[type] ?? [];
		const problems = reports
			.map((r) => ({ ...r, warnings: r.warnings?.filter((w) => !allowed.some((name) => w.path.endsWith(`/props/${name}`))) }))
			.filter((r) => r.count || r.warnings?.length);
		expect(problems).toEqual([]);
		expect(reports.map((r) => r.check)).toContain('props');
	});

	it.each(cases)('$type loads assets only from the site or a CSP-allowed host', ({ spec }) => {
		const urls = JSON.stringify(spec).match(/https?:\/\/[^"'\s)]+/g) ?? [];
		for (const url of urls) expect(ALLOWED_HOSTS, url).toContain(new URL(url).hostname);
	});

	it('loads media only from static/ or hosts the site CSP allows', () => {
		const allowed = ['https://i.pravatar.cc/', 'https://images.unsplash.com/'];
		const urls = JSON.stringify(SHOWCASE).match(/"(?:src|poster|href)":"[^"]*"/g) ?? [];
		expect(urls.length).toBeGreaterThan(5);
		for (const pair of urls) {
			const url = pair.slice(pair.indexOf(':') + 2, -1);
			if (url.startsWith('/')) {
				if (/\.[a-z0-9]+$/.test(url)) expect(staticFiles.has(`/static${url}`), url).toBe(true);
			} else expect(allowed.some((h) => url.startsWith(h)), url).toBe(true);
		}
	});

	it('the page previews the showcase spec, not the manifest example', () => {
		const gantt = entry('gantt')!;
		expect(pageSpecs(gantt).example).toBe(SHOWCASE.gantt);
		expect(pageSpecs(gantt).example).not.toEqual(exampleSpec(gantt));
	});
});
