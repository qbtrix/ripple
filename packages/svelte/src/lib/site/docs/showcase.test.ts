// showcase.test.ts — The site-only showcase previews: every key is a real
// manifest widget, every spec's root is that widget and passes the bound
// spec audit (schema, catalog, actions, props and the rest; not futureDate,
// since gantt and calendar plan ahead), and the widget page previews the showcase spec in place of
// the manifest example. Rendering is covered by widgets.test.ts, which renders
// every page's pageSpecs(...).example.
import { describe, expect, it } from 'vitest';
import { manifestEntries } from '../../manifest/index.js';
import { getWidgetTypes } from '../../widgets/index.js';
import { specAudit } from '@ripple-ui/core';
import { SHOWCASE } from './showcase.js';
import { exampleSpec, pageSpecs } from './widgets.js';

const entry = (type: string) => manifestEntries.find((e) => e.type === type);
const cases = Object.entries(SHOWCASE).map(([type, spec]) => ({ type, spec }));

describe('widget showcase specs', () => {
	it('covers at least the wave-1 and wave-2 polished widgets', () => {
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
				'saved-views'
			])
		);
	});

	it.each(cases)('$type is a manifest widget with a valid spec rooted at it', ({ type, spec }) => {
		expect(entry(type), `${type} is not in the manifest`).toBeDefined();
		expect(spec.version).toBe('1.0');
		expect(spec.ui).toMatchObject({ type });
		const reports = specAudit(spec, { widgetTypes: getWidgetTypes(), widgets: manifestEntries });
		expect(reports.filter((r) => r.count || r.warnings?.length)).toEqual([]);
		expect(reports.map((r) => r.check)).toContain('props');
	});

	it('the page previews the showcase spec, not the manifest example', () => {
		const gantt = entry('gantt')!;
		expect(pageSpecs(gantt).example).toBe(SHOWCASE.gantt);
		expect(pageSpecs(gantt).example).not.toEqual(exampleSpec(gantt));
	});
});
