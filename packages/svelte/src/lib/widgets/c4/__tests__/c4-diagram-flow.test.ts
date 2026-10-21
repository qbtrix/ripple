// c4-diagram-flow.test.ts — mounts the real C4Diagram (SvelteFlow + ELK) in jsdom and plays a flow
// over it: a message lights its ends and its edge, swaps the label for a badge and runs a marker
// along the edge's own path (the other way for a reply), an implied message draws a dashed hop, a
// process pulses its element, a note dims nothing, reduced motion parks the marker and drops the
// pulse, an out-of-range step shows nothing, a click on a connection asks for its step, stepping
// never runs ELK, and without `flow` the map is left exactly as it was.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/svelte';
import ELK from 'elkjs/lib/elk.bundled.js';
import C4Diagram from '../C4Diagram.svelte';
import { hopPoints, markFlow, onScreen } from '../live.js';
import type { C4Diagram as C4DiagramData, C4Flow } from '$lib/widgets/c4/types.js';

const motion = vi.hoisted(() => ({ reduce: false }));
vi.mock('svelte/motion', async (orig) => ({
  ...(await orig<typeof import('svelte/motion')>()),
  prefersReducedMotion: {
    get current() {
      return motion.reduce;
    },
  },
}));
afterEach(() => {
  motion.reduce = false;
});

// a → b → c → d in a line, plus z off to the side calling c.
const chain: C4DiagramData = {
  level: 'container',
  title: '',
  elements: ['a', 'b', 'c', 'd', 'z'].map((id) => ({ id, name: id.toUpperCase(), kind: 'container' as const })),
  relationships: [
    { from: 'a', to: 'b', label: 'ab' },
    { from: 'b', to: 'c', label: 'bc' },
    { from: 'c', to: 'd', label: 'cd' },
    { from: 'z', to: 'c', label: 'zc' },
  ],
};
const flow: C4Flow = {
  id: 'checkout',
  name: 'Checkout',
  steps: [
    { from: 'b', to: 'c', label: 'place order', technology: 'HTTPS' },
    { from: 'c', to: 'b', label: 'order id', reverse: true },
    { from: 'a', to: 'd', label: 'side channel', implied: true },
    { at: 'c', label: 'reserve stock' },
    { note: 'The order is now pending.' },
  ],
};

const wrapper = (c: HTMLElement, id: string) => c.querySelector(`.svelte-flow__node[data-id="${id}"]`);
const edgeOf = (c: HTMLElement, from: string, to: string) =>
  [...c.querySelectorAll<SVGGElement>('.svelte-flow__edge')].find((g) => g.getAttribute('aria-label') === `Edge from ${from} to ${to}`);
const dimmed = (c: HTMLElement) => ['a', 'b', 'c', 'd', 'z'].filter((id) => wrapper(c, id)?.hasAttribute('data-c4-dim'));
const live = (c: HTMLElement) => c.querySelector('[aria-live="polite"].c4-flow-live')?.textContent?.trim();
const motionOf = (g: Element | undefined) => g?.querySelector('.c4-flow-marker animateMotion');

async function mount(props: Record<string, unknown>) {
  const r = render(C4Diagram, { diagram: chain, ...props });
  await waitFor(() => expect(edgeOf(r.container, 'z', 'c')).toBeTruthy());
  return r;
}

describe('C4Diagram flow playback', { timeout: 30000 }, () => {
  it('plays a message: its ends and edge light, a badge carries the label, a marker runs the path', async () => {
    const { container } = await mount({ flow, step: 0 });
    await waitFor(() => expect(dimmed(container)).toEqual(['a', 'd', 'z']));
    const edge = edgeOf(container, 'b', 'c')!;
    expect(edge.classList.contains('c4-reach')).toBe(true);
    const run = motionOf(edge)!;
    expect(run.getAttribute('path')).toBe(edge.querySelector('.svelte-flow__edge-path')!.getAttribute('d'));
    expect(run.getAttribute('keyPoints')).toBe('0;1');
    expect(run.getAttribute('keySplines')).toBe('0.23 1 0.32 1');
    expect(run.getAttribute('dur')).toBe('560ms');
    expect(container.querySelector('[data-c4-flow-label]')?.textContent?.trim()).toBe('place order');
    // The badge stands in for the relationship's own label.
    const labels = [...container.querySelectorAll('.svelte-flow__edge-label')].map((l) => l.textContent?.trim());
    expect(labels).not.toContain('bc');
    expect(container.querySelectorAll('.c4-flow-marker')).toHaveLength(1);
    expect(live(container)).toBe('B to C: place order');
  });

  it('runs a reply back along the relationship the model draws', async () => {
    const { container } = await mount({ flow, step: 1 });
    await waitFor(() => expect(motionOf(edgeOf(container, 'b', 'c'))).toBeTruthy());
    expect(motionOf(edgeOf(container, 'b', 'c'))!.getAttribute('keyPoints')).toBe('1;0');
    expect(live(container)).toBe('C to B: order id');
  });

  it('draws an implied message as a dashed hop between its ends', async () => {
    const { container } = await mount({ flow, step: 2 });
    await waitFor(() => expect(container.querySelector('.svelte-flow__edge.c4-flow-hop')).not.toBeNull());
    const hop = container.querySelector('.svelte-flow__edge.c4-flow-hop')!;
    expect(hop.getAttribute('aria-label')).toBe('Edge from a to d');
    expect(hop.querySelector('.svelte-flow__edge-path')?.getAttribute('style')).toContain('stroke-dasharray');
    expect(motionOf(hop)?.getAttribute('keyPoints')).toBe('0;1');
    expect(dimmed(container)).toEqual(['b', 'c', 'z']);
    // No model edge carries it: every relationship dims.
    expect(container.querySelectorAll('.svelte-flow__edge[data-c4-dim]')).toHaveLength(4);
  });

  it('pulses a process step and dims the rest, with no marker', async () => {
    const { container } = await mount({ flow, step: 3 });
    await waitFor(() => expect(wrapper(container, 'c')?.hasAttribute('data-c4-pulse')).toBe(true));
    expect(dimmed(container)).toEqual(['a', 'b', 'd', 'z']);
    expect(container.querySelector('.c4-flow-marker')).toBeNull();
    expect(container.querySelectorAll('[data-c4-pulse]')).toHaveLength(1);
    expect(live(container)).toBe('C: reserve stock');
  });

  it('dims nothing on a note, even over a highlight, and announces it', async () => {
    const { container } = await mount({ flow, step: 4, highlight: { id: 'a', reach: 'out', depth: 1 } });
    await waitFor(() => expect(live(container)).toBe('The order is now pending.'));
    expect(container.querySelector('[data-c4-dim]')).toBeNull();
    expect(container.querySelector('.c4-flow-marker, [data-c4-pulse], [data-c4-flow-label]')).toBeNull();
  });

  it('parks the marker at the receiving end and drops the pulse under reduced motion', async () => {
    motion.reduce = true;
    const { container, rerender } = await mount({ flow, step: 1 });
    await waitFor(() => expect(container.querySelector('.c4-flow-marker')).not.toBeNull());
    const marker = container.querySelector('.c4-flow-marker')!;
    expect(marker.querySelector('animateMotion')).toBeNull();
    // A reply lands back at the relationship's source: the start of its path.
    const d = edgeOf(container, 'b', 'c')!.querySelector('.svelte-flow__edge-path')!.getAttribute('d')!;
    const [, x, y] = d.match(/^M ([\d.-]+) ([\d.-]+)/)!;
    expect([marker.getAttribute('cx'), marker.getAttribute('cy')]).toEqual([x, y]);
    await rerender({ flow, step: 3 });
    await waitFor(() => expect(dimmed(container)).toEqual(['a', 'b', 'd', 'z']));
    expect(container.querySelector('[data-c4-pulse]')).toBeNull();
  });

  it('shows no step for an out-of-range step, or a step without a flow', async () => {
    const { container, rerender } = await mount({ flow, step: 9 });
    expect(container.querySelector('[data-c4-dim], .c4-flow-marker, [data-c4-flow-label]')).toBeNull();
    expect(live(container)).toBe('');
    await rerender({ flow: undefined, step: 0 });
    expect(container.querySelector('.c4-flow-live')).toBeNull();
    expect(container.querySelector('[data-c4-dim]')).toBeNull();
  });

  it('asks for the next step on a clicked connection', async () => {
    const onstep = vi.fn();
    const { container } = await mount({ flow, step: 0, onstep });
    await fireEvent.click(edgeOf(container, 'b', 'c')!);
    expect(onstep).toHaveBeenCalledWith(1);
    await fireEvent.click(edgeOf(container, 'z', 'c')!);
    expect(onstep).toHaveBeenCalledTimes(1);
  });

  it('runs no ELK while stepping', async () => {
    const elk = vi.spyOn(ELK.prototype, 'layout');
    const { container, rerender } = await mount({ flow, step: 0 });
    const laid = elk.mock.calls.length;
    expect(laid).toBeGreaterThan(0);
    for (const step of [1, 2, 3, 4, 9, 0]) {
      await rerender({ flow, step });
      await new Promise((r) => setTimeout(r, 30));
    }
    await waitFor(() => expect(motionOf(edgeOf(container, 'b', 'c'))).toBeTruthy());
    expect(elk.mock.calls.length).toBe(laid);
    elk.mockRestore();
  });

  it('leaves the map as it was without a flow, and returns to it when the flow goes', async () => {
    const { container, rerender } = await mount({});
    const html = () => container.innerHTML;
    const before = html();
    expect(container.querySelector('.c4-flow-live, .c4-flow-marker, [data-c4-pulse], [data-c4-flow-label]')).toBeNull();
    await rerender({ flow, step: 2 });
    await waitFor(() => expect(container.querySelector('.c4-flow-hop')).not.toBeNull());
    await rerender({ flow: undefined, step: undefined });
    await waitFor(() => expect(html()).toBe(before));
  });
});

describe('onScreen', () => {
  const box = { x: 100, y: 100, width: 50, height: 20 };
  it('holds the camera while a step is in view, and frames it once any part leaves', () => {
    expect(onScreen([box], { x: 0, y: 0, zoom: 1 }, 800, 600)).toBe(true);
    expect(onScreen([box], { x: -120, y: 0, zoom: 1 }, 800, 600)).toBe(false);
    expect(onScreen([box, { ...box, x: 790 }], { x: 0, y: 0, zoom: 1 }, 800, 600)).toBe(false);
    expect(onScreen([box], { x: 0, y: 0, zoom: 4 }, 800, 600)).toBe(true);
    expect(onScreen([box], { x: 0, y: 0, zoom: 6 }, 800, 600)).toBe(false);
  });
});

describe('markFlow', () => {
  it('returns the same edges with no step', () => {
    const edges = [{ id: 'e', source: 'a', target: 'b' }];
    expect(markFlow(edges, null, { source: 'a', target: 'b', a: { x: 0, y: 0, width: 10, height: 10 }, b: { x: 50, y: 0, width: 10, height: 10 } })).toBe(edges);
  });

  it('runs a hop from where the centre line leaves one box to where it meets the other', () => {
    expect(hopPoints({ x: 0, y: 0, width: 20, height: 10 }, { x: 100, y: 0, width: 20, height: 10 })).toEqual([
      { x: 20, y: 5 },
      { x: 100, y: 5 },
    ]);
  });
});
