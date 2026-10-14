<!--
  WorkflowEdge.svelte: the one edge type of the workflow canvas.

  LR: a plain edge (target in the next column) runs straight out of its exit to
  its own channel in the column gap, across to the target's row and straight in,
  so the edges of a fan-out or fan-in never overlap; its chip rides the last run.
  TB: a plain edge is a rounded step that turns below its exit's chip, which
  sits just under the exit. A loop (a back edge, or one that skips a column or
  row) runs in its own outside lane layout.ts reserved for it, so it never
  crosses a node or a label; a back edge is dashed. Chips are one line, clamped
  with the full text on hover. Colours come from the --xy-* tokens Workflow.svelte
  maps to ripple tokens; an animated edge marks live flow in the accent and stops
  under reduced motion.
-->
<script lang="ts">
  import { BaseEdge, EdgeLabel, getSmoothStepPath, type EdgeProps } from '@xyflow/svelte';
  import { loopRoute, roundedPath, stepRoute, type PlacedEdge } from './layout.js';
  import type { Direction } from './types.js';

  let { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }: EdgeProps = $props();

  const edge = $derived((data as { edge: PlacedEdge; direction: Direction }).edge);
  const dir = $derived((data as { edge: PlacedEdge; direction: Direction }).direction);

  const route = $derived.by(() => {
    const s = { x: sourceX, y: sourceY };
    const t = { x: targetX, y: targetY };
    if (edge.loop) {
      const r = loopRoute(dir, s, t, edge.lane, edge.chan, edge.turn, edge.chipY);
      return { path: roundedPath(r.points), x: r.label.x, y: r.label.y };
    }
    if (dir === 'LR') {
      const r = stepRoute(s, t, edge.chan);
      return { path: roundedPath(r.points), x: r.label.x, y: r.label.y };
    }
    // TB: a labelled edge turns below its chip, and the chip sits under the exit.
    const stepPosition = edge.turn && targetY > sourceY ? Math.min(0.9, edge.turn / (targetY - sourceY)) : undefined;
    const [path, x, y] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8, stepPosition });
    return edge.label ? { path, x: sourceX, y: sourceY + edge.chipY } : { path, x, y };
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
  <EdgeLabel x={route.x} y={route.y} class="wf-chip" style="max-width:{edge.chip}px" title={edge.label}>
    <span>{edge.label}</span>
  </EdgeLabel>
{/if}
