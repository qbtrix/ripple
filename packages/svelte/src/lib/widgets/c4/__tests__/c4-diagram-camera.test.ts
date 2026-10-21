// c4-diagram-camera.test.ts — the semantic camera moves once per layout: when the diagram and the
// focus change together (a live run's new file), it holds until the new layout lands instead of
// first aiming at where the focus's ancestor sat in the old one. A drill that turns follow off
// still moves it to what the drill opened; follow turning off alone (a pan) leaves it where it is.
// A played flow step frames its elements when they are off screen (always, in jsdom's 0x0 view),
// as a cut under reduced motion, and the step showing at mount keeps the first fit.
// SvelteFlow's setViewport and fitView are spied through a partial mock of @xyflow/svelte; everything else is
// the real SvelteFlow and ELK.

import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import C4Diagram from '../C4Diagram.svelte';
import type { C4Diagram as C4DiagramData, C4Element, C4Flow } from '$lib/widgets/c4/types.js';

const setViewport = vi.fn();
const fitView = vi.fn();
const motion = vi.hoisted(() => ({ reduce: false }));
vi.mock('svelte/motion', async (orig) => ({
  ...(await orig<typeof import('svelte/motion')>()),
  prefersReducedMotion: {
    get current() {
      return motion.reduce;
    },
  },
}));
vi.mock('@xyflow/svelte', async (importOriginal) => {
  const xy = await importOriginal<typeof import('@xyflow/svelte')>();
  return {
    ...xy,
    useSvelteFlow: () => {
      const flow = xy.useSvelteFlow();
      return new Proxy(flow, {
        get: (target, key, receiver) =>
          key === 'setViewport'
            ? (...args: Parameters<typeof flow.setViewport>) => {
                setViewport(...args);
                return target.setViewport(...args);
              }
            : key === 'fitView'
              ? (...args: Parameters<typeof flow.fitView>) => {
                  fitView(...args);
                  return target.fitView(...args);
                }
              : Reflect.get(target, key, receiver),
      });
    },
  };
});

const component = (id: string, files: string[]): C4Element => ({
  id,
  name: id,
  kind: 'component',
  children: files.map((f) => ({ id: f, name: f, kind: 'code' as const })),
});
const app = (files: Record<string, string[]>): C4DiagramData => ({
  level: 'context',
  title: '',
  elements: [{ id: 'app', name: 'App', kind: 'container', children: Object.entries(files).map(([id, f]) => component(id, f)) }],
  relationships: [],
});

describe('C4Diagram semantic camera', { timeout: 30000 }, () => {
  beforeEach(() => setViewport.mockClear());

  it('holds while a new layout computes, then moves once', async () => {
    const before = app({ a: ['a/1.ts'], b: ['b/1.ts'] });
    const { container, rerender } = render(C4Diagram, {
      diagram: before, expanded: ['app', 'a'], follow: true, focusId: 'a/1.ts',
    });
    await waitFor(() => expect(setViewport).toHaveBeenCalled());
    setViewport.mockClear();

    // A new file under b, and the focus on it: b opens, a closes.
    await rerender({ diagram: app({ a: ['a/1.ts'], b: ['b/1.ts', 'b/2.ts'] }), expanded: ['app', 'b'], follow: true, focusId: 'b/2.ts' });
    await tick();
    expect(setViewport).not.toHaveBeenCalled();
    await waitFor(() => expect(container.querySelector('.svelte-flow__node[data-id="b/2.ts"]')).not.toBeNull());
    await waitFor(() => expect(setViewport).toHaveBeenCalledTimes(1));
  });

  it('moves to what a drill opened, and stays put when follow just turns off', async () => {
    const diagram = app({ a: ['a/1.ts'], b: ['b/1.ts'] });
    const { container, rerender } = render(C4Diagram, { diagram, expanded: ['app', 'a'], follow: true, focusId: 'a/1.ts' });
    await waitFor(() => expect(setViewport).toHaveBeenCalled());

    // A drill into b: follow goes off and b opens as the scope.
    setViewport.mockClear();
    await rerender({ diagram, expanded: ['app', 'b'], scopeId: 'b', follow: false, focusId: 'a/1.ts' });
    await waitFor(() => expect(container.querySelector('.svelte-flow__node[data-id="b/1.ts"]')).not.toBeNull());
    await waitFor(() => expect(setViewport).toHaveBeenCalledTimes(1));

    // Follow back on, then off with nothing else changing (what a pan does): no move for the release.
    await rerender({ diagram, expanded: ['app', 'b'], scopeId: 'b', follow: true, focusId: 'b/1.ts' });
    await new Promise((r) => setTimeout(r, 50));
    setViewport.mockClear();
    await rerender({ diagram, expanded: ['app', 'b'], scopeId: 'b', follow: false, focusId: 'b/1.ts' });
    await new Promise((r) => setTimeout(r, 200));
    expect(setViewport).not.toHaveBeenCalled();
  });
});

const line: C4DiagramData = {
  level: 'container',
  title: '',
  elements: ['a', 'b', 'c'].map((id) => ({ id, name: id, kind: 'container' as const })),
  relationships: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
};
const walk: C4Flow = { id: 'walk', name: 'Walk', steps: [{ from: 'a', to: 'b', label: 'go' }, { at: 'c', label: 'stop' }, { note: 'done' }] };
const framed = () => fitView.mock.calls.filter(([o]) => o?.nodes).map(([o]) => [o.nodes.map((n: { id: string }) => n.id), o.duration]);

describe('C4Diagram flow camera', { timeout: 30000 }, () => {
  beforeEach(() => {
    fitView.mockClear();
    motion.reduce = false;
  });

  it('frames an off-screen step on the ripple curve, and leaves the first step to the first fit', async () => {
    const { container, rerender } = render(C4Diagram, { diagram: line, flow: walk, step: 0 });
    await waitFor(() => expect(container.querySelector('.c4-flow-marker')).not.toBeNull());
    await new Promise((r) => setTimeout(r, 50));
    expect(framed()).toEqual([]);
    await rerender({ diagram: line, flow: walk, step: 1 });
    await waitFor(() => expect(framed()).toEqual([[['c'], 560]]));
    // A note has no elements: the camera stays.
    await rerender({ diagram: line, flow: walk, step: 2 });
    await new Promise((r) => setTimeout(r, 50));
    expect(framed()).toHaveLength(1);
  });

  it('cuts instead of easing under reduced motion', async () => {
    motion.reduce = true;
    const { container, rerender } = render(C4Diagram, { diagram: line, flow: walk, step: 1 });
    await waitFor(() => expect(container.querySelector('[data-c4-dim]')).not.toBeNull());
    await new Promise((r) => setTimeout(r, 50));
    await rerender({ diagram: line, flow: walk, step: 0 });
    await waitFor(() => expect(framed()).toEqual([[['a', 'b'], 0]]));
  });
});
