<!--
  WorkflowNode.svelte: one step card on the workflow canvas.

  A token card (raised fill, 1px border) with a 28px icon tile at the leading
  edge, a label clamped to two lines (full text on hover) and, for any status
  but idle, a 16px status badge on the trailing corner so status never rides on
  colour alone. The icon comes from closed maps (workflowIcon): a model-written
  icon string is never printed. Only the trigger's tile wears the accent; a
  running step adds an accent ring. Handles are the ones layout.ts placed (an
  exit per condition branch, entries), drawn as small dots under the line ends.
-->
<script lang="ts">
  import { safeStyle } from '@ripple-ui/core';
  import { Handle, Position } from '@xyflow/svelte';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import OctagonAlert from '@lucide/svelte/icons/octagon-alert';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import Clock from '@lucide/svelte/icons/clock';
  import { ICON, workflowIcon } from '../data-kit/icons.js';
  import type { PlacedNode } from './layout.js';

  let { data }: { data: { node: PlacedNode } } = $props();

  const SIDE = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left } as const;
  // Node status onto the shared status tones; idle draws nothing (absence is calm).
  const STATUS = {
    success: { Icon: CircleCheck, tone: 'success', word: 'done' },
    error: { Icon: OctagonAlert, tone: 'error', word: 'failed' },
    running: { Icon: LoaderCircle, tone: 'accent', word: 'running' },
    waiting: { Icon: Clock, tone: 'warning', word: 'waiting' },
  } as const;

  const node = $derived(data.node);
  const Icon = $derived(workflowIcon(node.type, node.icon));
  const status = $derived(node.status === 'idle' ? undefined : STATUS[node.status]);
  const typeWord = $derived(node.type[0].toUpperCase() + node.type.slice(1));
</script>

<div
  class="wf-node"
  class:wf-running={node.status === 'running'}
  class:wf-trigger={node.type === 'trigger'}
  title={node.label || typeWord}
>
  <span class="wf-tile" aria-hidden="true"><Icon {...ICON.row} /></span>
  <span class="wf-label" class:wf-empty={!node.label}>{node.label || typeWord}</span>
  {#if status}
    <span class="wf-badge wf-{status.tone}" title={status.word}>
      <status.Icon size={14} strokeWidth={2} aria-hidden="true" />
    </span>
  {/if}
  {#each node.handles as h (h.id)}
    <Handle
      id={h.id}
      type={h.type}
      position={SIDE[h.side]}
      isConnectable={false}
      class="wf-handle"
      style={safeStyle(h.side === 'top' || h.side === 'bottom' ? `left:${h.pct}%` : `top:${h.pct}%`)}
    />
  {/each}
</div>

<style>
  .wf-node {
    position: relative;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px 0 10px;
    border-radius: var(--ripple-radius, 10px);
    border: 1px solid var(--ripple-border);
    background: var(--wf-card);
    color: var(--ripple-surface-foreground);
    transition: border-color 0.15s var(--ripple-ease-out), box-shadow 0.15s var(--ripple-ease-out);
  }

  .wf-node:hover {
    border-color: var(--ripple-control-border);
  }

  /* A 1.5px live ring: the 1px border in accent plus half a pixel outside it. */
  .wf-running {
    border-color: var(--ripple-accent);
    box-shadow: 0 0 0 0.5px var(--ripple-accent);
  }

  .wf-tile {
    flex: none;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: calc(var(--ripple-radius, 10px) * 0.7);
    background: var(--ripple-muted);
    color: var(--ripple-muted-foreground);
  }

  .wf-trigger .wf-tile {
    background: var(--ripple-accent);
    color: var(--ripple-accent-foreground);
  }

  .wf-label {
    flex: 1;
    min-width: 0;
    font-size: var(--text-callout, 12px);
    line-height: var(--lh-callout, 15px);
    font-weight: var(--weight-medium, 500);
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow-wrap: anywhere;
  }

  .wf-empty {
    color: var(--ripple-muted-foreground);
    font-weight: var(--weight-regular, 400);
  }

  .wf-badge {
    position: absolute;
    top: -7px;
    right: -7px;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    background: var(--wf-ground);
    box-shadow: 0 0 0 1px var(--ripple-border);
  }

  .wf-success { color: var(--ripple-success-text); }
  .wf-error { color: var(--ripple-error-text); }
  .wf-warning { color: var(--ripple-warning-text); }
  .wf-accent { color: var(--ripple-accent-text); }

  .wf-accent :global(svg) {
    animation: wf-spin 1.1s linear infinite;
  }

  @keyframes wf-spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .wf-accent :global(svg) { animation: none; }
    .wf-node { transition: none; }
  }

  /* Anchors for edges, not connectors (nothing is connectable): a 4px dot where
     a line leaves, nothing where it arrives, so a connector reads as one line. */
  .wf-node :global(.wf-handle) {
    width: 4px;
    height: 4px;
    min-width: 0;
    min-height: 0;
    background: var(--ripple-control-border);
    border: 0;
    border-radius: 999px;
    cursor: default;
  }

  .wf-node :global(.wf-handle.target) {
    opacity: 0;
  }
</style>
