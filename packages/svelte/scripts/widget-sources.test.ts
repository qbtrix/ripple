// scripts/widget-sources.test.ts: holds widget-sources.ts to the live eager
// registry. If a widget is added in a shape the parser does not understand,
// or a barrel points somewhere unexpected, this fails before @ripple-ui/embed
// ships a lazy map that is missing a type or loads the wrong component.
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { getWidget, getWidgetTypes } from '../src/lib/widgets/index.js';
import { widgetSources } from './widget-sources.js';

describe('widgetSources', () => {
	const sources = widgetSources(resolve(__dirname, '../src/lib/widgets'));

	it('covers exactly the registered widget types', () => {
		expect(Object.keys(sources).sort()).toEqual(getWidgetTypes().sort());
	});

	it('points every type at the file whose default export is the registered component', async () => {
		const wrong: string[] = [];
		for (const [type, file] of Object.entries(sources)) {
			const mod = await import(/* @vite-ignore */ file);
			if (mod.default !== getWidget(type)) wrong.push(`${type} -> ${file}`);
		}
		expect(wrong).toEqual([]);
	}, 60_000);
});
