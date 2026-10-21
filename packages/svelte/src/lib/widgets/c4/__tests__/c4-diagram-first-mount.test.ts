// c4-diagram-first-mount.test.ts — the first layout does not wait for the canvas to have a size: it
// lands while the canvas is 0x0, and the size arriving later neither blanks it nor runs ELK again.
// Its own file because Svelte builds one shared ResizeObserver for size bindings on first use: the
// recording observer below has to be installed before any C4Diagram in the file mounts.

import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import ELK from 'elkjs/lib/elk.bundled.js';
import C4Diagram from '../C4Diagram.svelte';
import type { C4Diagram as C4DiagramData } from '$lib/widgets/c4/types.js';

// Reports only when told to: the canvas mounts at 0x0 and is sized later.
const observers: { cb: ResizeObserverCallback; els: Element[] }[] = [];
globalThis.ResizeObserver = class {
  rec: { cb: ResizeObserverCallback; els: Element[] };
  constructor(cb: ResizeObserverCallback) {
    observers.push((this.rec = { cb, els: [] }));
  }
  observe(el: Element) {
    this.rec.els.push(el);
  }
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const diagram: C4DiagramData = {
  level: 'context',
  title: 'Banking',
  elements: [
    { id: 'user', name: 'User' },
    { id: 'bank', name: 'Bank', external: true },
  ],
  relationships: [{ from: 'user', to: 'bank', label: 'Uses' }],
};
const node = (c: HTMLElement, id: string) => c.querySelector(`.svelte-flow__node[data-id="${id}"]`);

describe('C4Diagram first mount', { timeout: 30000 }, () => {
  it('lays out while the canvas has no size, and keeps the layout when the size arrives', async () => {
    const elk = vi.spyOn(ELK.prototype, 'layout');
    const { container } = render(C4Diagram, { diagram });
    await waitFor(() => expect(node(container, 'bank')).not.toBeNull());
    const laid = elk.mock.calls.length;
    expect(laid).toBeGreaterThan(0);

    const flow = container.querySelector<HTMLElement>('.svelte-flow')!;
    expect(observers.some(({ els }) => els.includes(flow))).toBe(true);
    Object.defineProperties(flow, { clientWidth: { value: 800 }, clientHeight: { value: 480 } });
    for (const { cb, els } of observers) {
      const hit = els.filter((el) => el === flow);
      if (hit.length) cb(hit.map((target) => ({ target }) as unknown as ResizeObserverEntry), {} as ResizeObserver);
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(node(container, 'user')).not.toBeNull();
    expect(container.querySelector('.c4-loading')).toBeNull();
    expect(elk.mock.calls.length).toBe(laid);
    elk.mockRestore();
  });
});
