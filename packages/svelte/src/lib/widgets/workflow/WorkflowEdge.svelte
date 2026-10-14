<!--
  WorkflowEdge.svelte: the one edge type of the workflow canvas.

  LR: a plain edge (target in the next column) runs straight out of its exit to
  its own channel in the column gap, across to the target's row and straight in,
  so the edges of a fan-out or fan-in never overlap; its chip rides the last run.
  TB rows: a plain edge drops from its exit, turns below its chip (each edge of
  a fan-out or fan-in at its own height) and drops into the target; the chip
  sits just under the exit. A loop (a back edge, or one that skips a column or
  row) runs in its own outside lane layout.ts reserved for it, so it never
  crosses a node or a label; a skip enters its target's top, a back edge its
  side. The spine plans every route whole (branch lane, rail, back lane) in
  layout.ts; here its ends only snap to the drawn handles.
  A back edge is dashed. Chips are one line, clamped
  with the full text on hover. Colours come from the --xy-* tokens Workflow.svelte
  maps to ripple tokens; an animated edge marks live flow in the accent and stops
  under reduced motion.
-->
<script lang="ts">
  import { safeStyle } from '@ripple-ui/core';
  import { BaseEdge, EdgeLabel, getSmoothStepPath, type EdgeProps } from '@xyflow/svelte';
  import { dropRoute, loopRoute, roundedPath, stepRoute, type PlacedEdge } from './layout.js';
  import type { Direction } from './types.js';

  let { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }: EdgeProps = $props();

  const edge = $derived((data as { edge: PlacedEdge; direction: Direction }).edge);
  const dir = $derived((data as { edge: PlacedEdge; direction: Direction }).direction);

  const route = $derived.by(() => {
    const s = { x: sourceX, y: sourceY };
    const t = { x: targetX, y: targetY };
    // The spine plans the whole route; its ends snap to the drawn handles.
    if (edge.points) {
      const p = edge.points.map((q) => ({ ...q }));
      const n = p.length - 1;
      if (n === 1) return { path: roundedPath([s, t]), x: edge.at!.x, y: edge.at!.y };
      p[1].x = s.x;
      if (p[n - 1].x === p[n].x) p[n - 1].x = t.x;
      else p[n - 1].y = t.y;
      p[0] = s;
      p[n] = t;
      return { path: roundedPath(p), x: edge.at!.x, y: edge.at!.y };
    }
    if (edge.loop) {
      const r = loopRoute(dir, s, t, edge.lane, edge.chan, edge.turn, edge.chipY, edge.sideExit, !edge.back);
      const at = edge.at ?? r.label;
      return { path: roundedPath(r.points), x: at.x, y: at.y };
    }
    if (dir === 'LR' && targetX > sourceX + edge.chan + 4) {
      const r = stepRoute(s, t, edge.chan);
      return { path: roundedPath(r.points), x: r.label.x, y: r.label.y };
    }
    // TB: a labelled edge turns below its chip, and the chip sits under the exit.
    if (dir === 'TB' && targetY > sourceY + edge.turn + 4) {
      const path = roundedPath(dropRoute(s, t, edge.turn));
      return edge.label ? { path, x: sourceX, y: sourceY + edge.chipY } : { path, x: (sourceX + targetX) / 2, y: (sourceY + targetY) / 2 };
    }
    // Model positions can put a target behind its source: the library's step routing copes.
    const [path, x, y] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8 });
    return { path, x, y };
  });
</script>

<BaseEdge
  {id}
  path={route.path}
  labelX={route.x}
  labelY={route.y}
  {markerEnd}
  class={['wf-edge', edge.back && 'wf-back', edge.animated && 'wf-live'].filter(Boolean).join(' ')}
/>
{#if edge.label}
  <EdgeLabel x={route.x} y={route.y} class="wf-chip" style={safeStyle(`max-width:${edge.chip}px`)} title={edge.label}>
    <span>{edge.label}</span>
  </EdgeLabel>
{/if}
