// showcase.test.ts — The site-only showcase previews: every key is a real
// manifest widget, every spec contains that widget (the root unless listed in
// NOT_ROOT) and passes the bound spec audit (schema, catalog, actions, props
// and the rest; not futureDate, since gantt and calendar plan ahead), and the
// widget page previews the showcase spec in place of the manifest example.
// Every asset URL is same-origin or on a host the site CSP allows. Rendering
// is covered by widgets.test.ts, which renders every page's
// pageSpecs(...).example.
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

const entry = (type: string) => manifestEntries.find((e) => e.type === type);
const cases = Object.entries(SHOWCASE).map(([type, spec]) => ({ type, spec }));

describe('widget showcase specs', () => {
	it('covers at least the wave-1 polished widgets', () => {
		expect(Object.keys(SHOWCASE)).toEqual(
			expect.arrayContaining(['gantt', 'treemap', 'workflow', 'bulk-action-bar', 'calendar', 'invoice-layout'])
		);
	});

	it.each(cases)('$type is a manifest widget with a valid spec rooted at it', ({ type, spec }) => {
		expect(entry(type), `${type} is not in the manifest`).toBeDefined();
		expect(spec.version).toBe('1.0');
		if (NOT_ROOT[type]) expect(findNode(spec, type)).not.toBeNull();
		else expect(spec.ui).toMatchObject({ type });
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

	it('the page previews the showcase spec, not the manifest example', () => {
		const gantt = entry('gantt')!;
		expect(pageSpecs(gantt).example).toBe(SHOWCASE.gantt);
		expect(pageSpecs(gantt).example).not.toEqual(exampleSpec(gantt));
	});
});
