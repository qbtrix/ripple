<!--
  C4LiveLayer.svelte — the half of C4Diagram's live layer that needs the
  SvelteFlow context, so it must render inside <SvelteFlow>. It moves the
  camera (planCamera: refit on a new node set, follow the focus) and pins
  marker dots to their nodes with NodeToolbar, which draws in screen space, so
  a dot stays the same size at every zoom.

  It also mirrors the zoom into --c4-zoom / data-c4-far / data-c4-near on the flow root, which
  the node cards use to stay legible when zoomed out. Each write restyles the
  whole map, so it writes only a change the cards can see, and holds still
  while a camera move it started is flying.

  The refit on a new node set is also what keeps the legacy drill-down fitted:
  C4Diagram keeps SvelteFlow mounted across diagram swaps, so its `fitView`
  prop only fires once.

  A played flow step (`flowStep`: a key per step, its drawn element ids) frames those elements when
  one is off screen (onScreen), on the ripple curve or as a cut under reduced motion; on screen, or
  for the step already showing when the map first settles, the camera stays put.

  Semantic zoom passes `frame` instead: a box from ELK's final layout and a
  signature. The camera eases (the ripple curve, instant under reduced motion)
  to that box whenever the signature changes, except when follow has just
  turned off: a user who took the camera keeps it. Fitting ELK's box rather
  than measured nodes means a node still growing on screen frames correctly.
-->
<script lang="ts">
  import { safeStyle } from '@ripple-ui/core';
  import {
    NodeToolbar,
    Position,
    getViewportForBounds,
    useNodesInitialized,
    useStore,
    useSvelteFlow,
    useViewportInitialized,
  } from '@xyflow/svelte';
  import { untrack } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { FIT_MIN_ZOOM, MOVE_MS, onScreen, planCamera, rippleEase, zoomVar, type CameraState, type Rect } from './live.js';
  import type { C4Marker } from './types.js';

  interface Props {
    /** nodeSetKey of the rendered nodes. */
    ids: string;
    focusId?: string;
    follow?: boolean;
    markers?: Record<string, C4Marker[]>;
    /** Semantic zoom's camera: frame `rect` when `key` changes. */
    frame?: { key: string; rect: Rect | null; follow: boolean };
    /** The current flow step: framed when its elements are off screen. */
    flowStep?: { key: string; ids: string[] };
  }

  let { ids, focusId, follow, markers, frame, flowStep }: Props = $props();

  /** Below this zoom the cards keep only name and technology (data-c4-far):
   *  the 11px lines would read under 10px, and the counter-scaled name needs
   *  their room inside the fixed ELK box. */
  const FAR_ZOOM = 0.9;
  /** From this zoom up a quiet (curved) map shows every edge label (data-c4-near). */
  const NEAR_ZOOM = 1.2;

  const flow = useSvelteFlow();
  const store = useStore();
  const initialized = useNodesInitialized();
  const viewportReady = useViewportInitialized();

  // DOM sync: the node cards read the zoom from CSS, so names counter-scale
  // and stay legible when the map is zoomed out. --c4-zoom is inherited by
  // every node, so each write restyles the whole map: write it only when the
  // value the cards can see changes (zoomVar clamps to their range), and not
  // while a camera move this layer started is flying (xyflow eases zoom out and
  // back in, crossing many values); the move's final zoom is written on landing.
  let written = '';
  let flying = $state(false);
  let flyTimer: ReturnType<typeof setTimeout> | undefined;
  function fly(duration: number) {
    clearTimeout(flyTimer);
    flying = duration > 0;
    // A timer, not the move's promise: xyflow never settles a move a newer one interrupts.
    if (flying) flyTimer = setTimeout(() => (flying = false), duration + 40);
  }
  $effect(() => () => clearTimeout(flyTimer));
  $effect(() => {
    const el = store.domNode;
    const zoom = store.viewport.zoom;
    if (!el || flying) return;
    const next = `${zoomVar(zoom)}|${zoom < FAR_ZOOM}|${zoom >= NEAR_ZOOM}`;
    if (next === written) return;
    written = next;
    el.style.setProperty('--c4-zoom', zoomVar(zoom));
    el.toggleAttribute('data-c4-far', zoom < FAR_ZOOM);
    el.toggleAttribute('data-c4-near', zoom >= NEAR_ZOOM);
  });
  // The last camera input, kept outside reactivity: it is only compared.
  let prev: CameraState | null = null;

  // Escape hatch by design: this drives a third-party camera from props.
  // It waits for SvelteFlow to measure the current nodes: a fit queued while a
  // new level's nodes are still unadopted resolves against an empty set and
  // parks the camera on the origin.
  $effect(() => {
    if (frame) return;
    const next: CameraState = { ids, focusId, follow };
    if (!initialized.current) return;
    const move = planCamera(prev, next);
    prev = next;
    if (!move) return;
    const duration = move.animate && !prefersReducedMotion.current ? 650 : 0;
    fly(duration);
    void flow.fitView(
      move.nodeId
        ? { nodes: [{ id: move.nodeId }], padding: 0.35, minZoom: FIT_MIN_ZOOM, maxZoom: 1, duration }
        : { padding: 0.1, minZoom: FIT_MIN_ZOOM, maxZoom: 1, duration }
    );
  });

  // Semantic camera (see the header).
  let prevFrame: { key: string; follow: boolean } | null = null;
  $effect(() => {
    if (!frame || !viewportReady.current) return;
    const { key, rect, follow: following } = frame;
    const first = prevFrame === null;
    const letGo = !!prevFrame?.follow && !following;
    const same = prevFrame?.key === key;
    prevFrame = { key, follow: following };
    if (!rect || (!first && (letGo || same))) return;
    const vp = getViewportForBounds(rect, store.width, store.height, FIT_MIN_ZOOM, 1, 0.08);
    const duration = first || prefersReducedMotion.current ? 0 : MOVE_MS;
    fly(duration);
    void flow.setViewport(vp, { duration, ease: rippleEase });
  });

  // Flow step camera (see the header). null: not yet observed.
  let seenStep: string | undefined | null = null;
  $effect(() => {
    const s = flowStep;
    if (!initialized.current) return;
    const first = seenStep === null;
    if (!first && s?.key === seenStep) return;
    seenStep = s?.key;
    if (first || !s?.ids.length) return;
    const visible = untrack(() => {
      const boxes = s.ids.flatMap((id) => {
        const n = flow.getInternalNode(id);
        return n ? [{ ...n.internals.positionAbsolute, width: n.measured.width ?? 0, height: n.measured.height ?? 0 }] : [];
      });
      return onScreen(boxes, store.viewport, store.width, store.height);
    });
    if (visible) return;
    const duration = prefersReducedMotion.current ? 0 : MOVE_MS;
    fly(duration);
    void flow.fitView({ nodes: s.ids.map((id) => ({ id })), padding: 0.35, minZoom: FIT_MIN_ZOOM, maxZoom: 1, duration, ease: rippleEase });
  });

  const onMap = $derived.by(() => {
    if (!markers) return [];
    const present = new Set(ids.split('\n'));
    return Object.entries(markers).filter(([id, list]) => list.length > 0 && present.has(id));
  });
</script>

{#each onMap as [nodeId, list] (nodeId)}
  <NodeToolbar {nodeId} isVisible position={Position.Top} align="end" offset={-7}>
    <span class="c4-markers" role="list" aria-label="Here now">
      {#each list as m (m.id)}
        <span
          class="c4-marker"
          role="listitem"
          aria-label={m.label}
          title={m.label}
          style={safeStyle(`background: ${m.color}`)}
        ></span>
      {/each}
    </span>
  </NodeToolbar>
{/each}

<style>
  .c4-markers {
    display: flex;
    gap: 3px;
    padding-right: 12px;
    pointer-events: auto;
  }

  .c4-marker {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    box-shadow: 0 0 0 2px var(--ripple-popover);
  }
</style>
