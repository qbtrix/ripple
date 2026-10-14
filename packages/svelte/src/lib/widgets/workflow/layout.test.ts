// workflow/layout.test.ts: the workflow widget's data and layout rules
// (sanitising, direction choice, zoom floor, positions-all-or-none, condition
// exits, loops) and its closed icon maps. Rendering is checked by eye through
// the ripple skill's render loop, not here.
import { describe, expect, it } from 'vitest';
import { branchRank, modelPositionsUsable, planWorkflow, sanitizeWorkflow, MIN_ZOOM, MAX_H } from './layout.js';
import { WORKFLOW_ICONS, WORKFLOW_TYPE_ICONS, workflowIcon } from '../data-kit/icons.js';

const chain = (n: number) =>
  sanitizeWorkflow(
    Array.from({ length: n }, (_, i) => ({ id: `n${i}`, type: i === 0 ? 'trigger' : 'action', label: `Step ${i}` })),
    Array.from({ length: n - 1 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` })),
  );
const plan = (g: ReturnType<typeof sanitizeWorkflow>, width: number, interactive = true, fitView = true) =>
  planWorkflow(g.nodes, g.edges, { width, interactive, fitView });

describe('sanitizeWorkflow', () => {
  it('narrows types, statuses and labels, keeps the first duplicate, drops dangling edges', () => {
    const g = sanitizeWorkflow(
      [
        { id: '1', label: 'Lead captured' },
        { id: '2', type: 'webhook', label: 'Enrich', status: 'done' },
        { id: '3', type: 'condition', label: 42 },
        { id: '4', type: 'action', label: '', status: 'running' },
        { id: '4', type: 'output', label: 'Duplicate', status: 'success' },
        { id: '5', type: 'OUTPUT', label: 'Assign' },
        null,
      ],
      [
        { from: '1', to: '2' },
        { from: '3', to: '4', label: true },
        { from: '4', to: 'ghost' },
        { from: 'missing', to: '5' },
      ],
    );
    expect(g.nodes.map((n) => [n.id, n.type, n.status, n.label])).toEqual([
      ['1', 'action', 'idle', 'Lead captured'],
      ['2', 'action', 'idle', 'Enrich'],
      ['3', 'condition', 'idle', '42'],
      ['4', 'action', 'running', ''],
      ['5', 'output', 'idle', 'Assign'],
    ]);
    expect(g.edges.map((e) => `${e.from}>${e.to}:${e.label}`)).toEqual(['1>2:', '3>4:true']);
  });

  it('survives non-array input', () => {
    expect(sanitizeWorkflow(undefined, 'x')).toEqual({ nodes: [], edges: [] });
    expect(plan(sanitizeWorkflow([], []), 360).nodes).toEqual([]);
  });
});

describe('direction and zoom', () => {
  it('runs top to bottom on one spine below 480px, at zoom 1', () => {
    const p = plan(chain(3), 340);
    expect(p.direction).toBe('TB');
    expect(p.zoom).toBe(1);
    expect(new Set(p.nodes.map((n) => n.x)).size).toBe(1);
    expect(p.nodes.every((n) => n.x + n.w <= 340 - 32)).toBe(true);
  });

  it('runs left to right at 480px and up, and the canvas hugs a short chain', () => {
    const p = plan(chain(3), 720);
    expect(p.direction).toBe('LR');
    expect(p.zoom).toBe(1);
    expect(p.height).toBeLessThanOrEqual(140);
    expect(p.fitsAtOne).toBe(true);
  });

  it('never fits below the readable floor; a big graph pans in a capped canvas', () => {
    const p = plan(chain(21), 720);
    expect(p.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(p.height).toBeLessThanOrEqual(MAX_H);
    expect(p.fitsAtOne).toBe(false);
  });

  it('grows the canvas instead of panning when the reader cannot pan', () => {
    const p = plan(chain(12), 360, false);
    expect(p.height).toBeGreaterThan(MAX_H);
    expect(p.zoom).toBe(1);
  });

  it('cuts a panning spine in a row gap, and a lone step hugs its padding', () => {
    const p = plan(chain(21), 360);
    const room = p.height - p.gutter;
    expect(p.nodes.some((n) => p.viewport.y + n.y < room && p.viewport.y + n.y + n.h > room)).toBe(false);
    expect(plan(sanitizeWorkflow([{ id: 'a', label: 'A' }], []), 720).height).toBe(80);
  });

  it('plans for 720 before the card is measured', () => {
    expect(plan(chain(3), 0).direction).toBe('LR');
  });
});

describe('positions', () => {
  it('honours model positions only when all are present and none overlap', () => {
    const base = sanitizeWorkflow(
      [
        { id: 'a', label: 'A', position: { x: 0, y: 0 } },
        { id: 'b', label: 'B', position: { x: 300, y: 0 } },
      ],
      [],
    );
    expect(modelPositionsUsable(base.nodes)).toBe(true);
    const overlap = sanitizeWorkflow(
      [
        { id: 'a', label: 'A', position: { x: 0, y: 0 } },
        { id: 'b', label: 'B', position: { x: 10, y: 5 } },
      ],
      [],
    );
    expect(modelPositionsUsable(overlap.nodes)).toBe(false);
    const partial = sanitizeWorkflow([{ id: 'a', label: 'A', position: { x: 0, y: 0 } }, { id: 'b', label: 'B' }], []);
    expect(modelPositionsUsable(partial.nodes)).toBe(false);
  });

  it('auto-layout never stacks two nodes on one spot', () => {
    const g = sanitizeWorkflow(
      [
        { id: 's', type: 'trigger', label: 'Filed', position: { x: 0, y: 0 } },
        { id: 'c', type: 'condition', label: 'Over?', position: { x: 10, y: 5 } },
        { id: 'm', label: 'Manager', position: { x: 4000, y: -2500 } },
        { id: 'p', label: 'Pay', position: { x: 20, y: 10 } },
        { id: 'r', type: 'output', label: 'Reject' },
      ],
      [
        { from: 's', to: 'c' },
        { from: 'c', to: 'm', label: 'approved' },
        { from: 'c', to: 'r', label: 'declined' },
        { from: 'c', to: 'p', label: 'under limit' },
        { from: 'm', to: 'p' },
      ],
    );
    for (const width of [340, 960]) {
      const spots = plan(g, width, false).nodes.map((n) => `${n.x},${n.y}`);
      expect(new Set(spots).size).toBe(spots.length);
    }
  });
});

describe('conditions and loops', () => {
  it('orders exits yes-like, no-like, rest, with one handle each, and names unlabelled branches', () => {
    expect([branchRank('approved'), branchRank('No, needs review'), branchRank('under limit')]).toEqual([0, 1, 2]);
    const g = sanitizeWorkflow(
      [{ id: 'c', type: 'condition', label: 'Check' }, { id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'd', label: 'D' }],
      [
        { from: 'c', to: 'd', label: 'later' },
        { from: 'c', to: 'b', label: 'declined' },
        { from: 'c', to: 'a', label: 'approved' },
      ],
    );
    const p = plan(g, 720);
    expect(p.edges.map((e) => [e.to, e.sourceHandle])).toEqual([
      ['a', 'out-0'],
      ['b', 'out-1'],
      ['d', 'out-2'],
    ]);
    const c = p.nodes.find((n) => n.id === 'c')!;
    expect(c.handles.filter((h) => h.type === 'source').map((h) => Math.round(h.pct))).toEqual([25, 50, 75]);

    const bare = sanitizeWorkflow([{ id: 'c', type: 'condition', label: 'Ok?' }, { id: 'a', label: 'A' }, { id: 'b', label: 'B' }], [
      { from: 'c', to: 'a' },
      { from: 'c', to: 'b' },
    ]);
    expect(plan(bare, 720).edges.map((e) => e.label)).toEqual(['Yes', 'No']);
  });

  it('gives every fan-out exit its own channel in columns, and its own indented group on the spine', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const g = sanitizeWorkflow(
      [{ id: 'v', type: 'condition', label: 'Valid?' }, ...ids.map((id) => ({ id, label: id })), { id: 'm', label: 'Merge' }],
      [...ids.map((id) => ({ from: 'v', to: id })), ...ids.map((id) => ({ from: id, to: 'm' }))],
    );
    const p = plan(g, 720);
    expect(p.direction).toBe('LR');
    const out = p.edges.filter((e) => e.from === 'v');
    expect(out.map((e) => e.label)).toEqual(['Yes', 'No', '', '']);
    expect(new Set(out.map((e) => e.chan)).size).toBe(out.length);
    const into = p.edges.filter((e) => e.to === 'm');
    expect(new Set(into.map((e) => e.chan)).size).toBe(into.length);
    // On the narrow spine each branch is its own indented group, in exit order,
    // with its own exit and (past the first) its own lane into its top; the
    // fan-in shares one rail; every exit is on the bottom.
    const tb = plan(g, 360);
    const at = (id: string) => tb.nodes.find((n) => n.id === id)!;
    expect(['v', ...ids, 'm'].map((id) => at(id).y)).toEqual(['v', ...ids, 'm'].map((id) => at(id).y).sort((p, q) => p - q));
    const indent = at('a').x - at('v').x;
    expect(indent).toBeGreaterThanOrEqual(24);
    expect(ids.every((id) => at(id).x === at('v').x + indent) && at('m').x === at('v').x).toBe(true);
    const fan = tb.edges.filter((e) => e.from === 'v');
    expect(new Set(fan.map((e) => e.sourceHandle)).size).toBe(fan.length);
    expect(fan.every((e) => e.targetHandle === 'in')).toBe(true);
    const lanes = fan.filter((e) => e.lane);
    expect(lanes.length).toBe(fan.length - 1);
    expect(new Set(lanes.map((e) => e.lane)).size).toBe(lanes.length);
    expect(lanes.every((e) => e.lane < at('a').x)).toBe(true);
    // Farther branches leave further left, so no two branch lines cross.
    const exitX = (e: (typeof fan)[number]) => e.points![0].x;
    const byRow = fan.toSorted((p, q) => at(p.to).y - at(q.to).y);
    expect(byRow.map(exitX)).toEqual(byRow.map(exitX).toSorted((p, q) => q - p));
    const fanIn = tb.edges.filter((e) => e.to === 'm');
    expect(new Set(fanIn.map((e) => e.lane)).size).toBe(1);
    expect(fanIn.every((e) => e.lane > at('a').x + at('a').w && e.targetHandle === 'in')).toBe(true);
    expect(tb.nodes.flatMap((n) => n.handles).filter((h) => h.type === 'source').every((h) => h.side === 'bottom')).toBe(true);
    expect(new Set(tb.nodes.map((n) => n.w)).size).toBe(1);
  });

  it('draws each branch before the step they meet at, each labelled just under its own exit', () => {
    const g = sanitizeWorkflow(
      [{ id: 'c', type: 'condition', label: 'Clear?' }, { id: 'r', label: 'Review' }, { id: 's', label: 'Set up' }],
      [
        { from: 'c', to: 's', label: 'yes, all checks clear' },
        { from: 'c', to: 'r', label: 'no, needs a human review' },
        { from: 'r', to: 's' },
      ],
    );
    const p = plan(g, 360);
    const at = (id: string) => p.nodes.find((n) => n.id === id)!;
    // The no branch sits right under its condition, indented; the join waits below it.
    expect([at('c').y < at('r').y, at('r').y < at('s').y]).toEqual([true, true]);
    expect([at('r').x - at('c').x, at('s').x - at('c').x]).toEqual([24, 0]);
    const yes = p.edges.find((e) => e.to === 's' && e.from === 'c')!;
    const no = p.edges.find((e) => e.to === 'r')!;
    // Two exits, two chips under the condition, none on the join's way in.
    expect(yes.sourceHandle).not.toBe(no.sourceHandle);
    for (const e of [yes, no]) {
      expect(e.at!.y).toBeGreaterThan(at('c').y + at('c').h);
      expect(e.at!.y).toBeLessThan(at('r').y);
      expect(e.at!.x).toBe(e.points![0].x);
    }
    // The yes lane runs down the gutter, clear of the review step, into the join's top.
    expect(yes.lane).toBeLessThan(at('r').x);
    expect(yes.targetHandle).not.toBe(p.edges.find((e) => e.from === 'r')!.targetHandle);
  });

  it('reserves a strip under the graph for the overlays, and only when they show', () => {
    // A tall spine would draw hairline marks in the minimap, so only the pill shows.
    const big = planWorkflow(chain(21).nodes, chain(21).edges, { width: 720, interactive: true, fitView: true, minimap: true });
    expect([big.showMinimap, big.showControls]).toEqual([false, true]);
    expect(big.height).toBeLessThanOrEqual(MAX_H);
    expect(plan(chain(21), 720).gutter).toBeGreaterThanOrEqual(30);
    expect(plan(chain(3), 720).gutter).toBe(0);
  });

  it('puts siblings side by side in a wide card when the columns will not fit', () => {
    const g = sanitizeWorkflow(
      ['t', 'a', 'c', 'y', 'n', 'p', 'o'].map((id) => ({ id, type: id === 'c' ? 'condition' : 'action', label: id })),
      [['t', 'a'], ['a', 'c'], ['c', 'y'], ['c', 'n'], ['y', 'p'], ['p', 'o']].map(([from, to]) => ({ from, to })),
    );
    const p = plan(g, 623);
    expect(p.direction).toBe('TB');
    expect(p.zoom).toBe(1);
    const y = p.nodes.find((n) => n.id === 'y')!, n = p.nodes.find((n) => n.id === 'n')!;
    expect(y.y).toBe(n.y);
    expect(y.x).toBeLessThan(n.x);
    // An only child lines up under its parent, not under the gap between siblings.
    const at = (id: string) => p.nodes.find((x) => x.id === id)!;
    expect([at('p').x, at('o').x]).toEqual([y.x, y.x]);
  });

  it('a cycle does not inflate depth, and its back edge runs in an outside lane', () => {
    const g = sanitizeWorkflow(
      [{ id: 'm', label: 'Merge' }, { id: 'q', type: 'condition', label: 'Match?' }, { id: 'r', label: 'Retry' }, { id: 'p', type: 'output', label: 'Publish' }],
      [
        { from: 'm', to: 'q' },
        { from: 'q', to: 'p', label: 'yes' },
        { from: 'q', to: 'r', label: 'no' },
        { from: 'r', to: 'm', label: 'loop' },
      ],
    );
    const p = plan(g, 720);
    const xs = new Set(p.nodes.map((n) => n.x));
    expect(xs.size).toBe(3); // m | q | p,r
    const back = p.edges.find((e) => e.from === 'r')!;
    expect(back).toMatchObject({ back: true, loop: true });
    expect(back.lane).toBeGreaterThan(Math.max(...p.nodes.map((n) => n.y + n.h)));
  });
});

describe('workflow icons', () => {
  it('honours whitelisted names only and falls back to the type icon', () => {
    expect(workflowIcon('action', 'credit-card')).toBe(WORKFLOW_ICONS['credit-card']);
    expect(workflowIcon('output', 'megaphone')).toBe(WORKFLOW_TYPE_ICONS.output);
    expect(workflowIcon('condition', '🚀')).toBe(WORKFLOW_TYPE_ICONS.condition);
    expect(workflowIcon('trigger', 'constructor')).toBe(WORKFLOW_TYPE_ICONS.trigger);
    expect(workflowIcon('trigger', 42)).toBe(WORKFLOW_TYPE_ICONS.trigger);
  });
});
