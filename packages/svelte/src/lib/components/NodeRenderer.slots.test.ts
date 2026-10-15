// NodeRenderer.slots.test.ts: `slot` children land in the widget's named slot,
// and an absent named slot never clobbers a data prop of the same name. Several
// widgets take `actions` (or `footer`) as model data; NodeRenderer passes a slot
// snippet only when that slot has children, so the model's array survives.

import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, test } from 'vitest';
import { manifestEntries } from '$lib/manifest/index.js';
import Ripple from '$lib/Ripple.svelte';
import type { UINode } from '@ripple-ui/core';

function renderSpec(ui: UINode) {
  return render(Ripple, { props: { spec: { ui } } });
}

test('children without slot go to the default body', () => {
  const { container } = renderSpec({
    type: 'card',
    props: { title: 'T' },
    children: [{ type: 'text', props: { text: 'body content' } }],
  });
  const body = container.querySelector('[data-slot="card-body"]');
  expect(body).not.toBeNull();
  expect(body!.textContent).toContain('body content');
});

test('child with slot="header" lands in card-header, not card-body', () => {
  const { container } = renderSpec({
    type: 'card',
    props: { title: 'T' },
    children: [
      { type: 'stat', props: { value: 42 }, slot: 'header' },
      { type: 'text', props: { text: 'body content' } },
    ],
  });
  const header = container.querySelector('[data-slot="card-header"]');
  const body = container.querySelector('[data-slot="card-body"]');
  expect(header?.textContent).toContain('42');
  expect(body?.textContent).toContain('body content');
  expect(body?.textContent ?? '').not.toContain('42');
});

test('child with slot="footer" lands in card-footer', () => {
  const { container } = renderSpec({
    type: 'card',
    props: { title: 'T' },
    children: [
      { type: 'text', props: { text: 'meta' }, slot: 'footer' },
      { type: 'text', props: { text: 'body' } },
    ],
  });
  const footer = container.querySelector('[data-slot="card-footer"]');
  expect(footer?.textContent).toContain('meta');
});

test('multiple children with same slot all render in that slot', () => {
  const { container } = renderSpec({
    type: 'card',
    props: {},
    children: [
      { type: 'text', props: { text: 'h1' }, slot: 'header' },
      { type: 'text', props: { text: 'h2' }, slot: 'header' },
      { type: 'text', props: { text: 'body' } },
    ],
  });
  const header = container.querySelector('[data-slot="card-header"]');
  expect(header?.textContent).toContain('h1');
  expect(header?.textContent).toContain('h2');
});

test('unknown slot on a widget that lacks that slot is dropped silently', () => {
  const { container } = renderSpec({
    type: 'card',
    props: {},
    children: [
      { type: 'text', props: { text: 'ghost' }, slot: 'sidebar' },
      { type: 'text', props: { text: 'body' } },
    ],
  });
  const body = container.querySelector('[data-slot="card-body"]');
  expect(body?.textContent).toContain('body');
  expect(body?.textContent ?? '').not.toContain('ghost');
});

test('existing no-slot specs render identically (regression guard)', () => {
  const { container } = renderSpec({
    type: 'card',
    props: { title: 'Hello' },
    children: [{ type: 'text', props: { text: 'world' } }],
  });
  expect(container.querySelector('[data-slot="card-header"]')?.textContent).toContain('Hello');
  expect(container.querySelector('[data-slot="card-body"]')?.textContent).toContain('world');
});

const mount = async (ui: Record<string, unknown>) => {
	const { container } = render(Ripple, { props: { spec: { version: '1.0', state: {}, ui } as never } });
	await tick();
	return container;
};

const buttonNames = (c: HTMLElement) =>
	[...c.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '');

describe('slot snippets never clobber data props', () => {
	test('bulk-action-bar keeps its actions array', async () => {
		const example = manifestEntries.find((e) => e.type === 'bulk-action-bar')!.example!;
		const c = await mount(example as Record<string, unknown>);
		const names = buttonNames(c);
		for (const label of ['Assign role', 'Send email', 'Delete']) expect(names).toContain(label);
	});

	test('entity-detail keeps its actions array', async () => {
		const c = await mount({
			type: 'entity-detail',
			props: { title: 'Northwind', actions: [{ id: 'edit', label: 'Edit record' }, { id: 'share', label: 'Share record' }] }
		});
		const names = buttonNames(c);
		expect(names).toContain('Edit record');
		expect(names).toContain('Share record');
	});

	test('report-layout keeps its footer string', async () => {
		const c = await mount({ type: 'report-layout', props: { title: 'Quarterly report', footer: 'Internal use only.' } });
		expect(c.textContent).toContain('Internal use only.');
	});

	test('page-header still renders slot: "actions" children', async () => {
		const c = await mount({
			type: 'page-header',
			props: { title: 'Projects' },
			children: [{ type: 'button', slot: 'actions', props: { label: 'New project' } }]
		});
		expect(c.textContent).toContain('New project');
	});
});

// An empty slot passes nothing, so a data prop that shares a slot's name
// (invoice-layout's `actions` array) reaches the widget instead of being
// overwritten with undefined.
test('an actions array prop survives when the node has no actions-slot children', () => {
  const { container } = renderSpec({
    type: 'invoice-layout',
    props: {
      from: { name: 'Sender' },
      billTo: { name: 'Buyer' },
      invoiceNumber: 'N-1',
      issueDate: 'May 1, 2026',
      lines: [{ description: 'Work', total: 10 }],
      actions: [{ id: 'pay', label: 'Pay invoice' }],
    },
  });
  const buttons = [...container.querySelectorAll('button')].map((b) => b.textContent?.trim());
  expect(buttons).toContain('Pay invoice');
});

test('actions-slot children still win over nothing and render as the snippet', () => {
  const { container } = renderSpec({
    type: 'page-header',
    props: { title: 'Title' },
    children: [{ type: 'text', props: { text: 'slot action' }, slot: 'actions' }],
  });
  expect(container.textContent).toContain('slot action');
});

test('a slot-named array on a snippet widget renders without an error box', () => {
  const { container } = renderSpec({
    type: 'empty-state',
    id: 'es',
    props: { title: 'Nothing here', actions: [{ label: 'x' }] },
  });
  expect(container.textContent).toContain('Nothing here');
  expect(container.querySelector('[data-ripple-node-error]')).toBeNull();
});
