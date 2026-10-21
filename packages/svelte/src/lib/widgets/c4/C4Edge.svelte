<!--
  C4Edge.svelte — the SvelteFlow edge for a C4 relationship that ELK routed: an orthogonal polyline
  through ELK's points with rounded corners, the label at the box ELK reserved (beside the line,
  clear of nodes). With `data.curved` it sweeps one cubic between the ports instead, label on its
  midpoint, bending once through the route's midpoint where the sweep would cross a card in
  `data.avoid` (curveEdge). C4Diagram only uses it when a route exists; otherwise edges stay smoothstep (a
  bezier when curved).

  `data.dim` (set while a highlight's reach leaves this edge out) dims its labels with it. A curved
  edge in a bundle (`data.joinIn` / `joinOut`) runs to the join; the bundle's lead also draws the
  trunk and the count, whose hover opens it (`c4-onjoin` context). Labels carry the edge's id and ends.

  Semantic zoom adds two things through `data`: `items` (the relationships an aggregated edge
  stands for), which turns the middle label into a hover target listing them, and `tail` / `head`
  port badges where the edge meets an expanded boundary. A ghosted edge (both ends outside the
  scope) dims its labels with it. Without them the edge renders as it always did.
-->
<script lang="ts">
  import { getContext } from 'svelte';
  import { BaseEdge, EdgeLabel, type EdgeProps } from '@xyflow/svelte';
  import C4PortBadge from './C4PortBadge.svelte';
  import { curveEdge, roundedPath, EDGE_STROKE, type Join } from './live.js';
  import type { C4PortView } from './types.js';

  type Point = { x: number; y: number };
  type Box = Point & { width: number; height: number };
  type Badge = { box: Box; text: string };

  let { id, source, target, data, label, style, markerEnd, interactionWidth }: EdgeProps = $props();

  const points = $derived((data?.points as Point[] | undefined) ?? []);
  const box = $derived(data?.labelBox as Box | undefined);
  const items = $derived(data?.items as C4PortView['items'] | undefined);
  const tail = $derived(data?.tail as Badge | undefined);
  const head = $derived(data?.head as Badge | undefined);
  const ghost = $derived(!!data?.ghost);
  const dim = $derived(data?.dim ? '' : undefined);
  // A closed bundle's join stands in for this edge's end at the hub.
  const shut = (j: unknown) => (j && !(j as Join).open ? (j as Join) : undefined);
  const jin = $derived(shut(data?.joinIn));
  const jout = $derived(shut(data?.joinOut));
  const curve = $derived(
    data?.curved
      ? curveEdge(points, { labelBox: box, cards: (data.avoid as Box[] | undefined) ?? [], from: jout, to: jin })
      : null
  );
  // The lead of each bundle draws its trunk and count (the count stays while open, so its hover can end).
  const leads = $derived(
    (['joinIn', 'joinOut'] as const).map((k) => data?.[k] as Join | undefined).filter((j): j is Join => !!j?.lead)
  );
  const onjoin = getContext<((key: string | null) => void) | undefined>('c4-onjoin') ?? (() => {});
  const path = $derived(curve ? curve.d : roundedPath(points, 8));
  // On the sweep, its midpoint; else ELK's label box, else the route's middle point.
  const at = $derived(
    curve?.at ?? (box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : points[Math.floor(points.length / 2)])
  );
  // A label the layout wrapped (taller than one line, on a dense level) keeps its laid-out size.
  const wrap = $derived(!!box && box.height > 20);
  const centre = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
</script>

<BaseEdge {id} {path} {style} markerEnd={jin ? undefined : markerEnd} {interactionWidth} />
{#each leads as j (j.key)}
  {#if !j.open}
    {@const [a, b] = j.key.startsWith('in') ? [j.at, j.end] : [j.end, j.at]}
    <path class="c4-trunk" d="M {a.x} {a.y} L {b.x} {b.y}" style:stroke={EDGE_STROKE} stroke-width="1.25" fill="none" marker-end={j.key.startsWith('in') ? markerEnd : undefined} />
  {/if}
  <EdgeLabel x={j.at.x} y={j.at.y} class="c4-badge-label">
    <span class="c4-join-badge" role="note" aria-label="{j.count} connections" onpointerenter={() => onjoin(j.key)} onpointerleave={() => onjoin(null)}>{j.count}</span>
  </EdgeLabel>
{/each}

{#if label && at}
  <EdgeLabel
    x={at.x}
    y={at.y}
    selectEdgeOnClick={!items}
    class={[ghost && 'c4-ghost-label', wrap && 'c4-wrap-label']}
    data-c4-dim={dim}
    data-c4-edge={id}
    data-c4-ends="{source} {target}"
    data-c4-reach={data?.reach ? '' : undefined}
  >
    {#if items}
      <C4PortBadge port={{ text: String(label), items }} plain />
    {:else}
      {label}
    {/if}
  </EdgeLabel>
{/if}

{#each [tail, head] as badge, i (i)}
  {#if badge && items}
    <EdgeLabel
      x={centre(badge.box).x}
      y={centre(badge.box).y}
      class={ghost ? 'c4-badge-label c4-ghost-label' : 'c4-badge-label'}
      data-c4-dim={dim}
    >
      <C4PortBadge port={{ text: badge.text, items }} />
    </EdgeLabel>
  {/if}
{/each}
