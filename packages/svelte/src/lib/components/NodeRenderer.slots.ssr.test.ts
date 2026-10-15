// src/lib/components/NodeRenderer.slots.ssr.test.ts
// Server render of a snippet-typed slot name that a model filled with data.
// The renderer passes an empty slot through as the model's value, so the
// widget must guard with typeof before {@render}, or the node shows an error.
import { render as renderToString } from 'svelte/server';
import { expect, it } from 'vitest';
import Ripple from '$lib/Ripple.svelte';

it('empty-state with an actions array renders on the server without an error box', () => {
  const { body } = renderToString(Ripple, {
    props: { spec: { ui: { type: 'empty-state', id: 'es', props: { title: 'Nothing here', actions: [{ label: 'x' }] } } } },
  });
  expect(body).toContain('Nothing here');
  expect(body).not.toContain('data-ripple-node-error');
});
