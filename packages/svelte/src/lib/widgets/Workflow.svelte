<!--
  Workflow.svelte: a small automation graph (trigger, steps, conditions,
  outputs) drawn inside a chat card with @xyflow/svelte.

  The model fills `nodes` and `edges`; layout.ts sanitises them once and plans
  the drawing for the measured card width: columns left to right at 480px and
  up, one top-to-bottom spine below that, zoom held between 0.8 and 1, canvas
  height following the graph (120 to 560px; it grows instead when the reader
  cannot pan). Theming is the --xy-* to --ripple-* token map shared in spirit
  with the C4 diagram, so it follows the host's light or dark theme; colorMode is
  never set. The widget behaves like a card, not an editor: wheel and touch
  scroll the page, nodes do not drag, the minimap shows only for a big graph in
  a wide card, and the zoom pill only when something does not fit. The title row
  carries a status count in place of a legend.
-->
<script lang="ts">
  import { SvelteFlow, Background, BackgroundVariant, Controls, MiniMap, Position } from '@xyflow/svelte';
  import type { Node, Edge, NodeTypes, EdgeTypes, Viewport } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';

  import { WorkflowNode, WorkflowEdge } from './workflow/index.js';
  import { planWorkflow, sanitizeWorkflow, MIN_ZOOM } from './workflow/layout.js';
  import type { WorkflowNodeData, WorkflowEdgeData } from './workflow/types.js';
  import { asText } from '$lib/widgets/text-coerce';

  interface Props {
    nodes?: WorkflowNodeData[];
    edges?: WorkflowEdgeData[];
    title?: string;
    interactive?: boolean;
    minimap?: boolean;
    fitView?: boolean;
    class?: string;
  }

  let {
    nodes: inputNodes = [],
    edges: inputEdges = [],
    title = '',
    interactive = true,
    minimap = false,
    fitView = true,
    class: className = '',
  }: Props = $props();

  const nodeTypes: NodeTypes = { workflowNode: WorkflowNode as any };
  const edgeTypes: EdgeTypes = { workflow: WorkflowEdge as any };

  let width = $state(0);

  const graph = $derived(sanitizeWorkflow(inputNodes, inputEdges));
  const plan = $derived(planWorkflow(graph.nodes, graph.edges, { width, interactive: interactive !== false, fitView: fitView !== false }));

  const flowNodes = $derived(
    plan.nodes.map((n): Node => {
      const typeWord = n.type;
      return {
        id: n.id,
        type: 'workflowNode',
        position: { x: n.x, y: n.y },
        width: n.w,
        height: n.h,
        data: { node: n },
        sourcePosition: plan.direction === 'TB' ? Position.Bottom : Position.Right,
        targetPosition: plan.direction === 'TB' ? Position.Top : Position.Left,
        draggable: false,
        selectable: false,
        connectable: false,
        ariaLabel: `${n.label || typeWord}, ${typeWord}, ${n.status}`,
      };
    }),
  );

  const flowEdges = $derived(
    plan.edges.map((e): Edge => ({
      id: e.id,
      source: e.from,
      target: e.to,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      type: 'workflow',
      data: { edge: e, direction: plan.direction },
      selectable: false,
      focusable: false,
    })),
  );

  // The viewport follows the plan (a new width, direction or graph).
  let viewport = $state<Viewport>({ x: 0, y: 0, zoom: 1 });
  $effect(() => {
    viewport = { ...plan.viewport };
  });

  const showMinimap = $derived(minimap === true && plan.nodes.length >= 12 && width >= 560);
  const showControls = $derived(interactive !== false && !plan.fitsAtOne);

  // Title-row count in place of a legend, only when some step is not idle.
  const count = $derived.by(() => {
    const by = (s: string) => plan.nodes.filter((n) => n.status === s).length;
    const parts = [
      { text: `${by('error')} failed`, n: by('error'), error: true },
      { text: `${by('running')} running`, n: by('running'), error: false },
      { text: `${by('waiting')} waiting`, n: by('waiting'), error: false },
    ].filter((p) => p.n > 0);
    const active = parts.length > 0 || by('success') > 0;
    return active ? { steps: `${plan.nodes.length} ${plan.nodes.length === 1 ? 'step' : 'steps'}`, parts } : undefined;
  });
  const heading = $derived(asText(title).trim());
</script>

<div class="workflow-widget {className}">
  {#if heading || count}
    <div class="wf-head">
      {#if heading}<h3 class="wf-title">{heading}</h3>{/if}
      {#if count}
        <p class="wf-count">
          <span>{count.steps}</span>
          {#each count.parts as p (p.text)}
            <span aria-hidden="true">·</span><span class:wf-count-error={p.error}>{p.text}</span>
          {/each}
        </p>
      {/if}
    </div>
  {/if}
  <div
    class="wf-canvas"
    class:wf-static={interactive === false}
    style:height="{plan.height}px"
    bind:clientWidth={width}
  >
    <SvelteFlow
      nodes={flowNodes}
      edges={flowEdges}
      {nodeTypes}
      {edgeTypes}
      bind:viewport
      fitViewOptions={{ padding: '16px', minZoom: MIN_ZOOM, maxZoom: 1 }}
      panOnDrag={interactive !== false}
      panOnScroll={false}
      zoomOnScroll={false}
      preventScrolling={false}
      zoomOnPinch={interactive !== false}
      zoomOnDoubleClick={false}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      minZoom={0.5}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1.25} />
      {#if showControls}
        <Controls showLock={false} position="bottom-right" orientation="horizontal" />
      {/if}
      {#if showMinimap}
        <MiniMap position="bottom-left" width={120} height={80} nodeBorderRadius={4} />
      {/if}
    </SvelteFlow>
  </div>
</div>

<style>
  .workflow-widget {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    container-type: inline-size;
  }

  .wf-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    column-gap: 12px;
    row-gap: 2px;
  }

  .wf-title {
    margin: 0;
    min-width: 0;
    font-size: var(--text-headline, 13px);
    line-height: var(--lh-headline, 16px);
    font-weight: var(--weight-semibold, 600);
    color: var(--ripple-surface-foreground);
    overflow-wrap: anywhere;
  }

  .wf-count {
    margin: 0 0 0 auto;
    display: flex;
    gap: 5px;
    font-size: var(--text-caption-1, 10px);
    line-height: var(--lh-caption, 13px);
    color: var(--ripple-muted-foreground);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .wf-count-error {
    color: var(--ripple-error-text);
    font-weight: var(--weight-medium, 500);
  }

  /* A narrow card: the count drops under the title instead of squeezing it. */
  @container (max-width: 420px) {
    .wf-head {
      flex-direction: column;
      align-items: flex-start;
    }
    .wf-count {
      margin-left: 0;
    }
  }

  /* SvelteFlow's theme variables mapped to ripple tokens (the C4 diagram's map),
     so the canvas follows the host's light or dark theme. */
  .wf-canvas {
    width: 100%;
    position: relative;
    overflow: hidden;
    border-radius: var(--ripple-radius, 10px);
    border: 1px solid var(--ripple-border);
    /* An opaque ground for things that sit on the canvas (cards, chips,
       controls) over a possibly translucent host card; cards lift one step. */
    --wf-ground: oklch(from var(--ripple-surface-foreground) calc(1.13 - l * 0.96) calc(c * 0.5) h);
    --wf-card: linear-gradient(color-mix(in oklab, var(--ripple-surface) 86%, white) 0 0), var(--wf-ground);
    --xy-background-pattern-color: color-mix(in oklab, var(--ripple-surface-foreground) 8%, transparent);
    --xy-edge-stroke: var(--ripple-control-border);
    --xy-edge-stroke-width: 1.5;
    --xy-edge-label-background-color: var(--wf-ground);
    --xy-edge-label-color: var(--ripple-muted-foreground);
    --xy-controls-button-background-color: transparent;
    --xy-controls-button-background-color-hover: var(--ripple-muted);
    --xy-controls-button-color: var(--ripple-muted-foreground);
    --xy-controls-button-color-hover: var(--ripple-surface-foreground);
    --xy-controls-button-border-color: transparent;
    --xy-controls-box-shadow: none;
    --xy-minimap-background-color: var(--wf-ground);
    --xy-minimap-mask-background-color: color-mix(in oklab, var(--ripple-surface-foreground) 7%, transparent);
    --xy-minimap-mask-stroke-color: var(--ripple-border);
    --xy-minimap-node-background-color: color-mix(in oklab, var(--ripple-muted-foreground) 45%, transparent);
    --xy-minimap-node-stroke-color: transparent;
    --xy-background-color: transparent;
    --xy-attribution-background-color: transparent;
    --xy-connectionline-stroke: var(--ripple-muted-foreground);
    --xy-edge-stroke-selected: var(--ripple-accent);
    --xy-node-color: var(--ripple-surface-foreground);
    --xy-node-background-color: transparent;
    --xy-node-border: none;
    --xy-node-group-background-color: transparent;
    --xy-node-boxshadow-hover: none;
    --xy-node-boxshadow-selected: none;
    --xy-handle-background-color: var(--wf-ground);
    --xy-handle-border-color: var(--ripple-control-border);
    --xy-selection-background-color: color-mix(in oklab, var(--ripple-accent) 8%, transparent);
    --xy-selection-border: 1px dotted color-mix(in oklab, var(--ripple-accent) 60%, transparent);
    --xy-resize-background-color: var(--ripple-accent);
  }

  .wf-canvas :global(.svelte-flow),
  .wf-canvas :global(.svelte-flow__background) {
    background: transparent;
  }

  .wf-canvas :global(.svelte-flow__node) {
    border-radius: var(--ripple-radius, 10px);
    cursor: default;
  }

  .wf-canvas :global(.svelte-flow__node:focus) {
    outline: none;
  }

  .wf-canvas :global(.svelte-flow__node:focus-visible) {
    outline: 2px solid var(--ripple-ring);
    outline-offset: 2px;
  }

  .wf-static :global(.svelte-flow__pane) {
    cursor: default;
  }

  .wf-canvas :global(.wf-edge) {
    stroke-width: 1.5px;
  }

  .wf-canvas :global(.wf-back) {
    stroke-dasharray: 5 4;
  }

  .wf-canvas :global(.wf-live) {
    stroke: var(--ripple-accent);
    stroke-dasharray: 6 4;
    animation: wf-flow 0.8s linear infinite;
  }

  .wf-canvas :global(.wf-chip) {
    padding: 1px 5px;
    border-radius: 7px;
    text-align: center;
    border: 1px solid var(--ripple-border);
    background: var(--wf-ground);
    color: var(--ripple-muted-foreground);
    font-size: var(--text-caption-1, 10px);
    line-height: var(--lh-caption, 13px);
    font-weight: var(--weight-medium, 500);
    cursor: default;
  }

  .wf-canvas :global(.wf-chip span) {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    overflow-wrap: break-word;
  }

  .wf-canvas :global(.svelte-flow__controls) {
    display: flex;
    padding: 2px;
    gap: 2px;
    border: 1px solid var(--ripple-border);
    border-radius: 999px;
    background: var(--wf-ground);
    overflow: hidden;
  }

  .wf-canvas :global(.svelte-flow__controls-button) {
    width: 24px;
    height: 24px;
    padding: 5px;
    border-radius: 999px;
  }

  .wf-canvas :global(.svelte-flow__controls-button:focus-visible) {
    outline: 2px solid var(--ripple-ring);
    outline-offset: -2px;
  }

  .wf-canvas :global(.svelte-flow__minimap) {
    border: 1px solid var(--ripple-border);
    border-radius: 8px;
    overflow: hidden;
  }

  @keyframes wf-flow {
    to {
      stroke-dashoffset: -10;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .wf-canvas :global(.wf-live) {
      animation: none;
    }
  }
</style>
