// c4-diagram-live.test.ts — mounts the real C4Diagram (SvelteFlow + ELK) in
// jsdom and checks the live props reach the DOM: status rings on the node
// wrappers (planned included), the status legend, marker dots, controlled selection, the
// zoom-button report, the kind labels, keyboard activation doing exactly what a click does for
// every node type, `highlight` dimming what lies outside its reach and animating the edges inside
// it (still under reduced motion, in plain and semantic zoom), curved edges with arrowheads, and an
// untouched legacy render.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/svelte';
import C4Diagram from '../C4Diagram.svelte';
import type { C4Diagram as C4DiagramData } from '$lib/widgets/c4/types.js';

const diagram: C4DiagramData = {
  level: 'code',
  title: '',
  elements: [
    {
      id: 'ui',
      name: 'Editor parts',
      kind: 'component',
      technology: 'Svelte 5',
      containers: [
        { id: 'f.curve', name: 'CurveEditor.svelte', kind: 'code', technology: 'new file' },
        { id: 'f.index', name: 'index.ts', kind: 'code', technology: '64 lines' },
      ],
    },
  ],
  relationships: [],
};

const legacy: C4DiagramData = {
  level: 'context',
  title: 'Banking',
  elements: [
    { id: 'user', name: 'User', description: 'A customer' },
    { id: 'bank', name: 'Bank', technology: 'COBOL', external: true },
  ],
  relationships: [{ from: 'user', to: 'bank', label: 'Uses' }],
};

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

function wrapper(container: HTMLElement, id: string) {
  return container.querySelector(`.svelte-flow__node[data-id="${id}"]`);
}

// Each case mounts SvelteFlow and runs ELK; on a loaded machine that outlasts vitest's 5s default.
describe('C4Diagram live props', { timeout: 30000 }, () => {
  it('paints status on the node wrappers and lists it in the legend', async () => {
    const { container, getByText } = render(C4Diagram, {
      diagram,
      status: { 'f.curve': 'changing', ui: 'drift' },
    });
    await waitFor(() => expect(wrapper(container, 'f.curve')).not.toBeNull());
    expect(wrapper(container, 'f.curve')?.getAttribute('data-c4-status')).toBe('changing');
    expect(wrapper(container, 'ui')?.getAttribute('data-c4-status')).toBe('drift');
    expect(wrapper(container, 'f.index')?.hasAttribute('data-c4-status')).toBe(false);
    expect(getByText('Changing now')).toBeInTheDocument();
    expect(getByText('Drift')).toBeInTheDocument();
  });

  it('marks a planned node on its wrapper and gives it a dashed legend entry', async () => {
    const { container, getByText } = render(C4Diagram, {
      diagram,
      status: { 'f.curve': 'planned', 'f.index': 'landed' },
    });
    await waitFor(() => expect(wrapper(container, 'f.curve')).not.toBeNull());
    expect(wrapper(container, 'f.curve')?.getAttribute('data-c4-status')).toBe('planned');
    // A status, not the scope ghost: the two treatments stay independent.
    expect(wrapper(container, 'f.curve')?.hasAttribute('data-c4-ghost')).toBe(false);
    const items = [...container.querySelectorAll('[aria-label="Status legend"] [role="listitem"]')];
    expect(items.map((li) => li.textContent?.trim())).toEqual(['Landed', 'Planned']);
    expect(items[1].querySelector('[data-c4-swatch="planned"]')).not.toBeNull();
    expect(getByText('Planned')).toBeInTheDocument();
  });

  it('draws marker dots on the nodes they name, skipping ids not on the map', async () => {
    const { container, findByLabelText, queryByLabelText } = render(C4Diagram, {
      diagram,
      markers: {
        'f.curve': [{ id: 'dev', label: 'dev·ripple', color: 'var(--ripple-accent)' }],
        elsewhere: [{ id: 'rev', label: 'Reviewer', color: 'var(--ripple-info)' }],
      },
    });
    await waitFor(() => expect(wrapper(container, 'f.curve')).not.toBeNull());
    const dot = await findByLabelText('dev·ripple');
    expect(dot.closest('.svelte-flow__node-toolbar')?.getAttribute('data-id')).toBe('f.curve');
    expect(queryByLabelText('Reviewer')).toBeNull();
  });

  it('controls selection from selectedId', async () => {
    const { container, rerender } = render(C4Diagram, { diagram, selectedId: 'f.index' });
    await waitFor(() => expect(wrapper(container, 'f.index')?.classList.contains('selected')).toBe(true));
    expect(wrapper(container, 'f.curve')?.classList.contains('selected')).toBe(false);
    await rerender({ diagram, selectedId: 'f.curve' });
    await waitFor(() => expect(wrapper(container, 'f.curve')?.classList.contains('selected')).toBe(true));
    expect(wrapper(container, 'f.index')?.classList.contains('selected')).toBe(false);
  });

  it('reports a zoom-button press or a minimap gesture as a manual camera move', async () => {
    const onmanualcamera = vi.fn();
    const { container } = render(C4Diagram, { diagram, follow: true, focusId: 'f.curve', onmanualcamera });
    await waitFor(() => expect(container.querySelector('.svelte-flow__controls button')).not.toBeNull());
    await fireEvent.pointerDown(container.querySelector('.svelte-flow__controls button')!);
    expect(onmanualcamera).toHaveBeenCalledTimes(1);
    await fireEvent.wheel(container.querySelector('.svelte-flow__minimap')!);
    expect(onmanualcamera).toHaveBeenCalledTimes(2);
  });

  it('labels a kind: component boundary and code nodes', async () => {
    const { container, getAllByText } = render(C4Diagram, { diagram });
    await waitFor(() => expect(wrapper(container, 'ui')).not.toBeNull());
    expect(container.querySelector('.group-type')?.textContent).toBe('Component');
    expect(getAllByText('Code')).toHaveLength(2);
    expect(container.querySelector('.c4-header')).toBeNull();
  });

  it('routes a drillable component click to ondrilldown', async () => {
    const ondrilldown = vi.fn();
    const onclick = vi.fn();
    const drill: C4DiagramData = {
      level: 'component',
      title: '',
      elements: [{ id: 'craft', name: 'Craft Studio', kind: 'component', technology: 'Svelte 5', drillable: true }],
      relationships: [],
    };
    const { container } = render(C4Diagram, { diagram: drill, onclick, ondrilldown });
    await waitFor(() => expect(container.querySelector('.c4-component-node')).not.toBeNull());
    expect(container.querySelector('.c4-component-node .c4-node-drill')).not.toBeNull();
    await fireEvent.click(container.querySelector('.c4-component-node')!);
    expect(ondrilldown).toHaveBeenCalledWith('craft', 'code');
    expect(onclick).not.toHaveBeenCalled();
  });

  it('activates a focused node from the keyboard, drilling when drillable', async () => {
    const onclick = vi.fn();
    const ondrilldown = vi.fn();
    const keyed: C4DiagramData = {
      level: 'component',
      title: '',
      elements: [
        { id: 'craft', name: 'Craft Studio', kind: 'component', drillable: true },
        { id: 'stores', name: 'Stores', kind: 'component' },
      ],
      relationships: [],
    };
    const { container } = render(C4Diagram, { diagram: keyed, onclick, ondrilldown });
    await waitFor(() => expect(wrapper(container, 'stores')).not.toBeNull());
    await fireEvent.keyDown(wrapper(container, 'craft')!, { key: 'Enter' });
    expect(ondrilldown).toHaveBeenCalledWith('craft', 'code');
    await fireEvent.keyDown(wrapper(container, 'stores')!, { key: ' ' });
    expect(onclick).toHaveBeenCalledWith('stores');
  });

  it('renders a legacy diagram as before: header, shape legend, no live attributes', async () => {
    const { container, getByText } = render(C4Diagram, { diagram: legacy });
    await waitFor(() => expect(wrapper(container, 'user')).not.toBeNull());
    expect(getByText('Banking')).toBeInTheDocument();
    expect(getByText('Person')).toBeInTheDocument();
    expect(container.querySelector('[data-c4-status]')).toBeNull();
    expect(container.querySelector('[data-c4-dim]')).toBeNull();
    expect(container.querySelector('[marker-end]')).toBeNull();
    expect(container.querySelector('.svelte-flow__node-toolbar')).toBeNull();
    expect(wrapper(container, 'user')?.classList.contains('svelte-flow__node-person')).toBe(true);
  });
});

// One element of every node type, every drillable flag on, so a keyboard path that drills where
// the click does not (or passes another level) shows up.
const everyType = (level: C4DiagramData['level']): C4DiagramData => ({
  level,
  title: '',
  elements: [
    { id: 'p', name: 'Person', kind: 'person', drillable: true },
    { id: 's', name: 'System', kind: 'system', drillable: true },
    {
      id: 'g',
      name: 'Boundary',
      kind: 'system',
      containers: [
        { id: 'c', name: 'Container', kind: 'container', drillable: true },
        { id: 'db', name: 'Store', kind: 'container', type: 'database', drillable: true },
        { id: 'q', name: 'Queue', kind: 'container', type: 'queue', drillable: true },
      ],
    },
    { id: 'cmp', name: 'Component', kind: 'component', drillable: true },
    { id: 'file', name: 'a.ts', kind: 'code', drillable: true },
  ],
  relationships: [],
});

const TYPES = { p: 'person', s: 'system', g: 'group', c: 'container', db: 'database', q: 'queue', cmp: 'component', file: 'component' };
const CLICKABLE = '.c4-node, .c4-database-node, .c4-queue-node, .group-label, .c4-code-node';

describe('C4Diagram keyboard activation', { timeout: 60000 }, () => {
  for (const level of ['context', 'container', 'component'] as const) {
    it(`does what a click does for every node type on a ${level} diagram`, async () => {
      const onclick = vi.fn();
      const ondrilldown = vi.fn();
      const { container } = render(C4Diagram, { diagram: everyType(level), onclick, ondrilldown });
      await waitFor(() => expect(wrapper(container, 'file')).not.toBeNull());
      const take = () => {
        const out = [...onclick.mock.calls.map((c) => ['click', ...c]), ...ondrilldown.mock.calls.map((c) => ['drill', ...c])];
        onclick.mockClear();
        ondrilldown.mockClear();
        return out;
      };

      const byClick: Record<string, unknown[]> = {};
      for (const [id, type] of Object.entries(TYPES)) {
        const w = wrapper(container, id)!;
        expect(w.classList.contains(`svelte-flow__node-${type}`), id).toBe(true);
        await fireEvent.click(w.querySelector(CLICKABLE)!);
        byClick[id] = take();
        await fireEvent.keyDown(w, { key: 'Enter' });
        expect(take(), `${id} Enter`).toEqual(byClick[id]);
        await fireEvent.keyDown(w, { key: ' ' });
        expect(take(), `${id} Space`).toEqual(byClick[id]);
      }

      const step = level === 'context' ? 'container' : level === 'container' ? 'component' : 'code';
      expect(byClick).toEqual({
        p: [['drill', 'p', step]],
        s: [['drill', 's', step]],
        g: [['click', 'g']],
        c: [['drill', 'c', level === 'container' ? 'component' : 'code']],
        db: [['click', 'db']],
        q: [['click', 'q']],
        cmp: [['drill', 'cmp', 'code']],
        file: [['drill', 'file', 'code']],
      });
    });
  }
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
    { from: 'z', to: 'c', label: 'zc', style: 'async' },
  ],
};
const edgeOf = (container: HTMLElement, from: string, to: string) =>
  [...container.querySelectorAll<SVGGElement>('.svelte-flow__edge')].find((g) => g.getAttribute('aria-label') === `Edge from ${from} to ${to}`);
const labelOf = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll('.svelte-flow__edge-label')].find((l) => l.textContent?.trim() === text);
const dimmed = (el: Element | null | undefined) => !!el?.hasAttribute('data-c4-dim');

describe('C4Diagram highlight', { timeout: 30000 }, () => {
  it('dims what lies outside the reach and animates the edges inside it', async () => {
    const { container } = render(C4Diagram, { diagram: chain, highlight: { id: 'b', reach: 'out', depth: 1 } });
    await waitFor(() => expect(edgeOf(container, 'b', 'c')).toBeTruthy());
    expect(['a', 'b', 'c', 'd', 'z'].map((id) => dimmed(wrapper(container, id)))).toEqual([true, false, false, true, true]);
    expect(edgeOf(container, 'b', 'c')!.classList.contains('animated')).toBe(true);
    expect(dimmed(edgeOf(container, 'b', 'c'))).toBe(false);
    for (const [f, t] of [['a', 'b'], ['c', 'd'], ['z', 'c']]) {
      expect(dimmed(edgeOf(container, f, t)), `${f}→${t}`).toBe(true);
      // An async edge outside the reach stops moving too: only reach edges animate.
      expect(edgeOf(container, f, t)!.classList.contains('animated'), `${f}→${t}`).toBe(false);
    }
    expect(dimmed(labelOf(container, 'ab'))).toBe(true);
    expect(dimmed(labelOf(container, 'bc'))).toBe(false);
  });

  it('follows the reach direction and moves with the prop', async () => {
    const { container, rerender } = render(C4Diagram, { diagram: chain, highlight: { id: 'c', reach: 'in' } });
    await waitFor(() => expect(wrapper(container, 'a')).not.toBeNull());
    await waitFor(() => expect(dimmed(wrapper(container, 'd'))).toBe(true));
    expect(['a', 'b', 'c', 'z'].map((id) => dimmed(wrapper(container, id)))).toEqual([false, false, false, false]);
    await rerender({ diagram: chain, highlight: undefined });
    await waitFor(() => expect(container.querySelector('[data-c4-dim]')).toBeNull());
    expect(container.querySelector('.svelte-flow__edge.c4-reach')).toBeNull();
    // Without a highlight the async edge animates as it always did; an id not on the map is no highlight.
    expect(edgeOf(container, 'z', 'c')!.classList.contains('animated')).toBe(true);
    await rerender({ diagram: chain, highlight: { id: 'gone' } });
    expect(container.querySelector('[data-c4-dim]')).toBeNull();
  });

  it('animates nothing under reduced motion but keeps the accent', async () => {
    motion.reduce = true;
    const { container } = render(C4Diagram, { diagram: chain, highlight: { id: 'b', reach: 'out', depth: 1 } });
    await waitFor(() => expect(edgeOf(container, 'b', 'c')).toBeTruthy());
    expect(dimmed(wrapper(container, 'a'))).toBe(true);
    expect(container.querySelector('.svelte-flow__edge.animated')).toBeNull();
    expect(edgeOf(container, 'b', 'c')!.querySelector('.svelte-flow__edge-path')?.getAttribute('style')).toContain('var(--ripple-accent)');
  });

  it('lights the drawn ancestor of a hidden element and the aggregated edge it rides', async () => {
    const nested: C4DiagramData = {
      level: 'context',
      title: '',
      elements: [
        { id: 'pe', name: 'Paw Enterprise', kind: 'system', children: [{ id: 'craft', name: 'Craft', kind: 'component' }] },
        { id: 'rp', name: 'Ripple', kind: 'system', children: [{ id: 'ui', name: 'Editor parts', kind: 'component' }] },
        { id: 'kb', name: 'Knowledge base', kind: 'system' },
      ],
      relationships: [
        { from: 'craft', to: 'ui', label: 'uses parts' },
        { from: 'kb', to: 'pe', label: 'indexes' },
      ],
    };
    const { container } = render(C4Diagram, { diagram: nested, expanded: [], highlight: { id: 'craft', reach: 'out' } });
    await waitFor(() => expect(edgeOf(container, 'pe', 'rp')).toBeTruthy());
    expect(['pe', 'rp', 'kb'].map((id) => dimmed(wrapper(container, id)))).toEqual([false, false, true]);
    expect(edgeOf(container, 'pe', 'rp')!.classList.contains('animated')).toBe(true);
    expect(dimmed(edgeOf(container, 'kb', 'pe'))).toBe(true);
  });
});

describe('C4Diagram edgeShape', { timeout: 30000 }, () => {
  it('draws curved edges with an arrowhead, and none by default', async () => {
    const { container, rerender } = render(C4Diagram, { diagram: chain, edgeShape: 'curved' });
    await waitFor(() => expect(edgeOf(container, 'a', 'b')).toBeTruthy());
    const path = () => edgeOf(container, 'a', 'b')!.querySelector('.svelte-flow__edge-path')!;
    expect(path().getAttribute('marker-end')).toMatch(/^url\(/);
    // One cubic between the ports, not the route's rounded corners.
    expect(path().getAttribute('d')).toMatch(/^M [\d.-]+ [\d.-]+ C /);
    await rerender({ diagram: chain, edgeShape: 'orthogonal' });
    await waitFor(() => expect(path().hasAttribute('marker-end')).toBe(false));
  });
});

// Five callers of one hub, plus a pair that stays a plain edge.
const fan: C4DiagramData = {
  level: 'container',
  title: '',
  elements: ['s1', 's2', 's3', 's4', 's5', 'hub', 'x', 'y'].map((id) => ({ id, name: id.toUpperCase(), kind: 'container' as const })),
  relationships: [...['s1', 's2', 's3', 's4', 's5'].map((from) => ({ from, to: 'hub', label: `${from} calls` })), { from: 'x', to: 'y', label: 'x calls' }],
};
const arrows = (container: HTMLElement) => container.querySelectorAll('.svelte-flow__edge [marker-end]').length;

describe('C4Diagram curved edges, bundled and quiet', { timeout: 30000 }, () => {
  it('joins a five-edge fan-in into one arrow with a count, opened by hovering the count', async () => {
    const { container, findByText } = render(C4Diagram, { diagram: fan, edgeShape: 'curved' });
    const badge = await findByText('5');
    expect(badge.closest('.c4-join-badge')).not.toBeNull();
    // One arrow for the bundle, one for x → y.
    expect(arrows(container)).toBe(2);
    await fireEvent.pointerEnter(badge.closest('.c4-join-badge')!);
    await waitFor(() => expect(arrows(container)).toBe(6));
  });

  it('opens the bundle when the hub is highlighted', async () => {
    const { container, findByText } = render(C4Diagram, { diagram: fan, edgeShape: 'curved', highlight: { id: 'hub' } });
    await findByText('5');
    // Each caller's own arrow, plus x → y.
    await waitFor(() => expect(arrows(container)).toBe(6));
  });

  it('keeps labels quiet until their edge or one of its ends is hovered', async () => {
    const { container } = render(C4Diagram, { diagram: fan, edgeShape: 'curved' });
    await waitFor(() => expect(labelOf(container, 'x calls')).toBeTruthy());
    expect(container.querySelector('.c4-canvas')!.hasAttribute('data-c4-quiet')).toBe(true);
    expect(labelOf(container, 'x calls')!.hasAttribute('data-c4-hot')).toBe(false);
    await fireEvent.pointerEnter(edgeOf(container, 'x', 'y')!);
    await waitFor(() => expect(labelOf(container, 'x calls')!.hasAttribute('data-c4-hot')).toBe(true));
    await fireEvent.pointerLeave(edgeOf(container, 'x', 'y')!);
    await fireEvent.pointerEnter(wrapper(container, 'y')!);
    await waitFor(() => expect(labelOf(container, 'x calls')!.hasAttribute('data-c4-hot')).toBe(true));
    expect(labelOf(container, 's1 calls')!.hasAttribute('data-c4-hot')).toBe(false);
  });
});
