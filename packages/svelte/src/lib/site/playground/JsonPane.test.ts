// lib/site/playground/JsonPane.test.ts — The JSON pane's Code/Tree switch.
// A stream shows only code (no switch); a complete spec offers Tree, which
// renders a collapsible tree, and the choice holds for the next spec.

import { fireEvent, render } from '@testing-library/svelte';
import { expect, test } from 'vitest';
import JsonPane from './JsonPane.svelte';
import type { Version } from './versions.svelte.js';

const spec = { ui: { type: 'flex', children: [{ type: 'card', children: [{ type: 'text', props: { text: 'deep' } }] }] } };
const v = (id: string, status: Version['status']): Version => ({
	id,
	title: id,
	status,
	spec: status === 'final' ? spec : null,
	text: JSON.stringify(spec),
	reason: null,
	store: null
});

test('a stream has no Tree; a complete spec switches to a tree and keeps it for the next one', async () => {
	const view = render(JsonPane, { version: v('a', 'streaming') });
	expect(view.queryByRole('button', { name: 'Tree' })).toBeNull();
	expect(view.queryByRole('tree')).toBeNull();

	await view.rerender({ version: v('a', 'final') });
	await fireEvent.click(view.getByRole('button', { name: 'Tree' }));
	expect(view.getByRole('tree')).toBeTruthy();
	expect(view.getByRole('button', { name: 'Tree' }).getAttribute('aria-pressed')).toBe('true');

	await view.rerender({ version: v('b', 'final') });
	expect(view.getByRole('tree')).toBeTruthy();

	await view.rerender({ version: v('c', 'streaming') });
	expect(view.queryByRole('tree')).toBeNull();
});
