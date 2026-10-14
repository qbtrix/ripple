<!--
  WorkflowEdge.svelte: the one edge type of the workflow canvas.

  A plain edge (target in the next column or row) is a rounded step from the
  exit handle to the entry handle. A loop (a back edge, or one that skips a
  column or row) runs in the outside lane layout.ts reserved for it, so it never
  crosses a node or a label; a back edge is dashed. The label is a surface
  chip (two lines at most, full text on hover): in TB just under its exit, in
  LR on the step or, for a loop, on its lane. Colours come from the --xy-* tokens
  Workflow.svelte maps to ripple tokens; an animated edge marks live flow in the
  accent and stops under reduced motion.
-->
<script lang="ts">
  import { BaseEdge, EdgeLabel, getSmoothStepPath, type EdgeProps } from '@xyflow/svelte';
  import { loopRoute, roundedPath, TB_CHIP, type PlacedEdge } from './layout.js';
  import type { Direction } from './types.js';

  let { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }: EdgeProps = $props();

  const edge = $derived((data as { edge: PlacedEdge; direction: Direction }).edge);
  const dir = $derived((data as { edge: PlacedEdge; direction: Direction }).direction);

  const route = $derived.by(() => {
    if (edge.loop) {
      const r = loopRoute(dir, { x: sourceX, y: sourceY }, { x: targetX, y: targetY }, edge.lane, edge.offset, edge.turn);
      return { path: roundedPath(r.points), x: r.label.x, y: r.label.y };
    }
    // TB: a labelled edge turns below its chip, and the chip sits under the exit.
    const stepPosition = dir === 'TB' && edge.turn && targetY > sourceY ? Math.min(0.9, edge.turn / (targetY - sourceY)) : undefined;
    const [path, x, y] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8, stepPosition });
    return dir === 'TB' && edge.label ? { path, x: sourceX, y: sourceY + TB_CHIP } : { path, x, y };
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
