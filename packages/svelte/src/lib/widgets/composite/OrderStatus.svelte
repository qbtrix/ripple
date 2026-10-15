<!--
  @file OrderStatus.svelte
  @description `order-status`: where an order is, when it arrives and whether
  anything went wrong, in a chat card. Top to bottom: eyebrow (order id),
  status headline (a success check when finished, an error pill when failed or
  cancelled), the when line (label word plus ETA), tracking, a progress rail,
  the map with From / To, the updates list and the actions. One frame, no
  inner boxes, tokens only; the root is an inline-size container and every
  layout switch keys on the card's own width (tracking moves beside the
  headline from 480px; from 560px the rail names every step and the map sits
  beside the places; under 560px the rail is markers plus "Step N of M").

  The pure rules (status aliases, step states, headline, ETA label, event and
  action hygiene, finite points) live in order-status-data.ts. A failed step
  becomes the active one; a failed or cancelled default pipeline hides the rail.

  Map: composes `map` with the host's default tiles (no preset of its own),
  route and destination in the accent, origin neutral, the courier in the
  accent unless the host gives `tracker.color`. It frames the whole trip with
  32px padding at mount and refits only when origin or destination move; a
  single point is centre plus street zoom. The route is latched: an empty
  `route` (a tracker API's final state) keeps the last one drawn, and a null
  `tracker` drops the courier marker. The map block never depends on step
  state, so a polling host never remounts it.
-->
<script lang="ts">
  import { safeStyle, safeUrl } from '@ripple-ui/core';
  import { getContext, untrack } from 'svelte';
  import Check from '@lucide/svelte/icons/check';
  import X from '@lucide/svelte/icons/x';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import Package from '@lucide/svelte/icons/package';
  import MapPin from '@lucide/svelte/icons/map-pin';
  import { cn } from '$lib/utils.js';
  import { safeArray, uniqueKeys } from '$lib/utils/safe-props.js';
  import { resolveIcon } from '$lib/widgets/display/Icon.svelte';
  import Map from '$lib/widgets/data/Map.svelte';
  import StatusPill from '../data-kit/StatusPill.svelte';
  import { plain } from '../data-kit/format.js';
  import {
    EVENT_FOLD,
    cleanActions,
    cleanEvents,
    cleanPlace,
    cleanTracking,
    etaLabel,
    headline,
    point,
    progress,
    type CleanAction,
    type DefaultStatus,
    type LatLng,
    type StepState
  } from './order-status-data.js';
  import type { EventHandler, EventHandlerOrArray } from '@ripple-ui/core';
  import type { EventDispatcher } from '@ripple-ui/core';
  import type { StateManager } from '$lib/core/state-manager.svelte.js';
  import { asText } from '$lib/widgets/text-coerce';

  type TilePreset = 'osm' | 'carto-voyager' | 'carto-light' | 'carto-dark' | 'osm-hot' | 'custom';

  interface Step {
    id: string;
    label: string;
    description?: string;
    completedAt?: string;
    current?: boolean;
    failed?: boolean;
  }

  interface Tracking {
    carrier: string;
    number: string;
    url?: string;
  }

  interface Place {
    name?: string;
    address?: string;
    lat?: number;
    lng?: number;
  }

  interface Tracker {
    lat: number;
    lng: number;
    heading?: number;
    label?: string;
    color?: string;
  }

  interface OrderEvent {
    time: string;
    label: string;
    location?: string;
    icon?: string;
  }

  interface Action {
    id?: string;
    label: string;
    icon?: string;
    variant?: 'default' | 'outline' | 'ghost';
    actions?: EventHandlerOrArray;
  }

  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    title?: string;
    orderId: string;
    status?: DefaultStatus;
    steps?: Step[];
    /** ID of the active step (when using custom `steps`). */
    currentStep?: string;
    eta?: string;
    tracking?: Tracking;
    origin?: Place;
    destination?: Place;
    tracker?: Tracker;
    route?: LatLng[];
    showMap?: boolean;
    mapHeight?: string | number;
    /** Tile preset; unset uses the host's map default (setMapDefaultTiles). */
    mapTiles?: TilePreset;
    /** Auto-pan the map to follow the tracker. Default false. */
    followTracker?: boolean;
    events?: OrderEvent[];
    actions?: Action[];
    onaction?: (id: string) => void;
  }

  let {
    id,
    class: className,
    style,
    title,
    orderId,
    status,
    steps,
    currentStep,
    eta,
    tracking,
    origin,
    destination,
    tracker,
    route,
    showMap,
    mapHeight,
    mapTiles,
    followTracker = false,
    events: rawEvents = [],
    actions: rawActions = [],
    onaction
  }: Props = $props();

  const styleString = $derived(
    style ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
  );

  const eventDispatcher = getContext<EventDispatcher | undefined>('ui-events');
  const stateManager = getContext<StateManager | undefined>('ui-state');

  // Header ------------------------------------------------------------------
  const p = $derived(progress(steps, status, currentStep));
  const head = $derived(headline(title, p));
  const order = $derived(asText(orderId).trim());
  const etaText = $derived(plain(eta));
  const whenLabel = $derived(etaLabel(p));
  const track = $derived(cleanTracking(tracking));

  // Rail --------------------------------------------------------------------
  const STATE_WORD: Record<StepState, string> = { done: 'done', active: 'current', pending: 'not started', failed: 'failed' };
  const stepKeys = $derived(uniqueKeys(p.steps, (s) => s.id));
  const focus = $derived(p.active >= 0 ? p.steps[p.active] : undefined);
  /** Connector after step i: accent once step i is done, dotted after a failure, else a track. */
  const lineOf = (i: number) => (p.states[i] === 'done' ? 'done' : p.bad && i >= p.active ? 'dotted' : 'todo');

  // Places and map -------------------------------------------------------------
  const from = $derived(cleanPlace(origin, 'Origin'));
  const to = $derived(cleanPlace(destination, 'Destination'));
  const courier = $derived(point(tracker));
  const routePts = $derived(
    safeArray<unknown>(route, { widget: 'order-status', key: 'route' })
      .map(point)
      .filter((q): q is LatLng => q !== undefined)
  );
  const hasPoint = $derived(Boolean(courier || from?.at || to?.at || routePts.length > 0));
  // An explicit false hides it; otherwise it shows whenever there is something to draw.
  const computedShowMap = $derived(showMap !== false && hasPoint);

  const mapMarkers = $derived.by(() => {
    const m: { id: string; lat: number; lng: number; label: string; color: string }[] = [];
    if (from?.at) m.push({ id: 'origin', lat: from.at[0], lng: from.at[1], label: from.name || 'Origin', color: 'var(--ripple-muted-foreground)' });
    if (to?.at) m.push({ id: 'destination', lat: to.at[0], lng: to.at[1], label: to.name || 'Destination', color: 'var(--ripple-accent)' });
    return m;
  });

  // A tracking API may send an empty route once the trip ends; keep drawing
  // the last one it sent. ponytail: never cleared, so a new destination without
  // a new route keeps the old line; clear on tripKey change if a host does that.
  let lastRoute: LatLng[] = [];
  const tripRoute = $derived.by<LatLng[]>(() => {
    if (routePts.length > 0) lastRoute = routePts;
    return lastRoute;
  });

  // Stroke colour is set in CSS (.rorder-map path): Leaflet writes `color` into
  // an SVG attribute, where var() does not resolve.
  const mapPaths = $derived.by(() => {
    if (tripRoute.length > 1) return [{ id: 'route', points: tripRoute, weight: 4, dashed: true, animate: true }];
    if (from?.at && to?.at) return [{ id: 'route', points: [from.at, to.at], weight: 3, dashed: true, animate: true }];
    return [];
  });

  const mapTrackers = $derived.by(() => {
    if (!courier || !tracker) return [];
    const color = asText(tracker.color).trim();
    return [
      {
        id: 'courier',
        lat: courier[0],
        lng: courier[1],
        heading: tracker.heading,
        label: plain(tracker.label) || 'Courier',
        color: color || 'var(--ripple-accent)',
        follow: followTracker
      }
    ];
  });

  // Frame the whole trip: origin, destination, route and courier. Keyed on the
  // origin/destination coordinates only (a string, so an equal value stops
  // here), so courier polling never refits over the visitor's pan and zoom.
  const tripKey = $derived(JSON.stringify([from?.at, to?.at]));
  const tripBounds = $derived.by<[LatLng, LatLng] | undefined>(() => {
    void tripKey;
    return untrack(() => {
      const pts: LatLng[] = [...tripRoute];
      if (from?.at) pts.push(from.at);
      if (to?.at) pts.push(to.at);
      if (courier) pts.push(courier);
      if (pts.length < 2) return undefined;
      const lats = pts.map((q) => q[0]);
      const lngs = pts.map((q) => q[1]);
      const sw: LatLng = [Math.min(...lats), Math.min(...lngs)];
      const ne: LatLng = [Math.max(...lats), Math.max(...lngs)];
      // A single spot has no extent; center + zoom handles that.
      return sw[0] === ne[0] && sw[1] === ne[1] ? undefined : [sw, ne];
    });
  });

  const mapCenter = $derived<LatLng>(courier ?? to?.at ?? from?.at ?? tripRoute[0] ?? [0, 0]);
  const listed = $derived([from?.listed && from, to?.listed && to].some(Boolean));

  // Updates and actions --------------------------------------------------------
  const events = $derived(cleanEvents(rawEvents));
  let showAll = $state(false);
  const shown = $derived(showAll ? events : events.slice(0, EVENT_FOLD));
  const folded = $derived(events.length - EVENT_FOLD);
  const actions = $derived(cleanActions<EventHandlerOrArray>(rawActions));

  function fireAction(a: CleanAction<EventHandlerOrArray>) {
    if (a.actions && eventDispatcher) {
      const handlers = Array.isArray(a.actions) ? a.actions : [a.actions];
      void eventDispatcher.dispatch(handlers as EventHandler[], { state: stateManager?.state ?? {} }, a.id);
      return;
    }
    if (a.id) onaction?.(a.id);
  }
</script>

{#snippet place(pl: NonNullable<typeof from>, word: string, kind: 'origin' | 'destination')}
  <div class="rorder-place">
    {#if kind === 'origin'}<Package size={14} strokeWidth={1.75} class="rorder-place-icon" aria-hidden="true" />{:else}<MapPin size={14} strokeWidth={1.75} class="rorder-place-icon" aria-hidden="true" />{/if}
    <div class="rorder-place-text">
      <span class="rorder-place-word text-caption-2">
        {word}
        {#if computedShowMap && pl.at}<span class={cn('rorder-place-dot', `rorder-place-dot-${kind}`)} aria-hidden="true"></span>{/if}
      </span>
      <span class="rorder-place-name text-body-emph" title={pl.name}>{pl.name}</span>
      {#if pl.address}<span class="rorder-place-addr text-callout" title={pl.address}>{pl.address}</span>{/if}
    </div>
  </div>
{/snippet}

<div {id} class={cn('rorder', className)} style={styleString}>
  <header class="rorder-header">
    <div class="rorder-head">
      <p class="rorder-eyebrow text-caption-1">{order ? `Order ${order}` : 'Order'}</p>
      <div class="rorder-headline">
        {#if p.finished}<CircleCheck size={16} strokeWidth={2} class="rorder-done-icon" aria-hidden="true" />{/if}
        <h2 class="rorder-title text-title-3 font-semibold text-pretty" title={head}>{head}</h2>
        {#if p.bad}<StatusPill status="bad" label={p.bad === 'cancelled' ? 'Cancelled' : 'Failed'} class="rorder-pill" />{/if}
      </div>
      {#if etaText}
        <p class="rorder-when">
          <span class="rorder-when-label text-callout">{whenLabel}</span>
          <span class="rorder-when-value text-body-emph">{etaText}</span>
        </p>
      {/if}
    </div>
    {#if track}
      <div class="rorder-tracking">
        <span class="rorder-tracking-label text-caption-1">Tracking</span>
        <span class="rorder-tracking-line text-callout">
          {#if track.carrier}<span class="rorder-carrier">{track.carrier}</span><span class="rorder-sep" aria-hidden="true"> · </span>{/if}
          {#if track.url && safeUrl(track.url)}
            <a href={safeUrl(track.url)} target="_blank" rel="noopener noreferrer" class="rorder-tracking-num">
              {track.number}<ExternalLink size={12} strokeWidth={2} class="rorder-ext" aria-hidden="true" /><span class="sr-only"> (opens in a new tab)</span>
            </a>
          {:else}
            <span class="rorder-tracking-num">{track.number}</span>
          {/if}
        </span>
      </div>
    {/if}
  </header>

  {#if p.showRail}
    <div class="rorder-progress">
      <ol class="rorder-steps" aria-label="Progress" style={safeStyle(`--rorder-n:${p.steps.length}`)}>
        {#each p.steps as s, i (stepKeys[i])}
          {@const st = p.states[i]}
          <li class={cn('rorder-step', `rorder-step-${st}`)} aria-current={st === 'active' || st === 'failed' ? 'step' : undefined}>
            <span class="rorder-step-pip" aria-hidden="true">
              {#if st === 'done'}
                <Check size={12} strokeWidth={3} />
              {:else if st === 'failed'}
                <X size={12} strokeWidth={3} />
              {:else if st === 'active'}
                <span class="rorder-step-pulse"></span>
              {/if}
            </span>
            {#if i < p.steps.length - 1}<span class="rorder-step-line" data-line={lineOf(i)} aria-hidden="true"></span>{/if}
            <span class="rorder-step-text">
              <span class="rorder-step-label" title={s.label}>{s.label}</span>
              <span class="sr-only">, {STATE_WORD[st]}</span>
              {#if s.completedAt}<span class="rorder-step-time">{s.completedAt}</span>{/if}
            </span>
          </li>
        {/each}
      </ol>
      {#if focus}
        <p class="rorder-step-summary text-callout" aria-hidden="true">
          <span class="rorder-muted">Step {p.active + 1} of {p.steps.length}</span>
          <span class="rorder-muted"> · </span>
          <span class="rorder-step-summary-label">{focus.label}</span>
          {#if focus.completedAt}<span class="rorder-muted"> · {focus.completedAt}</span>{/if}
        </p>
        {#if focus.description}<p class="rorder-step-desc text-callout">{focus.description}</p>{/if}
      {/if}
    </div>
  {/if}

  {#if computedShowMap || listed}
    <div class={cn('rorder-mid', computedShowMap && 'rorder-mid-with-map')}>
      {#if computedShowMap}
        <div class="rorder-map" role="region" aria-label="Map of the delivery route">
          <Map
            tiles={mapTiles}
            center={mapCenter}
            zoom={14}
            bounds={tripBounds}
            boundsPadding={32}
            height={mapHeight ?? 'var(--rorder-map-h)'}
            markers={mapMarkers}
            paths={mapPaths}
            trackers={mapTrackers}
            showAttribution={true}
            showControls={true}
            interactive={true}
          />
        </div>
      {/if}
      {#if listed}
        <div class="rorder-places">
          {#if from?.listed}{@render place(from, 'From', 'origin')}{/if}
          {#if to?.listed}{@render place(to, 'To', 'destination')}{/if}
        </div>
      {/if}
    </div>
  {/if}

  {#if events.length > 0}
    <section class="rorder-updates">
      <h3 class="rorder-updates-title text-caption-2">Updates</h3>
      <ol class="rorder-events">
        {#each shown as ev, i (ev.key)}
          {@const Glyph = resolveIcon(ev.icon)}
          <li class={cn('rorder-event', i === 0 && 'rorder-event-latest')}>
            <span class={cn('rorder-event-mark', Glyph && 'rorder-event-mark-icon')} aria-hidden="true">
              {#if Glyph}<Glyph size={10} strokeWidth={2.25} />{/if}
            </span>
            <div class="rorder-event-body">
              <span class="rorder-event-label text-callout">{ev.label}</span>
              {#if ev.time}<span class="rorder-event-time text-caption-1">{ev.time}</span>{/if}
              {#if ev.time && ev.location}<span class="rorder-event-sep text-caption-1" aria-hidden="true"> · </span>{/if}
              {#if ev.location}<span class="rorder-event-loc text-caption-1">{ev.location}</span>{/if}
            </div>
          </li>
        {/each}
      </ol>
      {#if folded > 0}
        <button type="button" class="rorder-fold text-callout" aria-expanded={showAll} onclick={() => (showAll = !showAll)}>
          {showAll ? 'Show fewer' : `Show ${folded} earlier ${folded === 1 ? 'update' : 'updates'}`}
        </button>
      {/if}
    </section>
  {/if}

  {#if actions.length > 0}
    <div class="rorder-actions">
      {#each actions as a (a.key)}
        {@const Glyph = resolveIcon(a.icon)}
        <button type="button" class={cn('rorder-btn', `rorder-btn-${a.variant}`)} title={a.label} onclick={() => fireAction(a)}>
          {#if Glyph}<Glyph size={14} strokeWidth={2} aria-hidden="true" />{/if}
          <span class="rorder-btn-label">{a.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .rorder {
    container: rorder / inline-size;
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 100%;
    min-width: 0;
    color: var(--ripple-surface-foreground);
    --rorder-map-h: 180px;
  }
  .rorder p,
  .rorder h2,
  .rorder h3 {
    margin: 0;
  }
  .rorder-muted {
    color: var(--ripple-muted-foreground);
  }

  /* Header ---------------------------------------------------------------- */
  .rorder-header {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--ripple-border);
  }
  .rorder-head {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .rorder-eyebrow {
    color: var(--ripple-muted-foreground);
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .rorder-headline {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 8px;
    min-width: 0;
  }
  .rorder-headline :global(.rorder-done-icon) {
    flex-shrink: 0;
    color: var(--ripple-success);
  }
  .rorder-title {
    flex: 0 1 auto;
    min-width: 0;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .rorder-headline :global(.rorder-pill) {
    flex-shrink: 0;
  }
  .rorder-when {
    overflow-wrap: anywhere;
  }
  .rorder-when-label {
    color: var(--ripple-muted-foreground);
    margin-right: 4px;
  }
  .rorder-tracking {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .rorder-tracking-label {
    color: var(--ripple-muted-foreground);
  }
  .rorder-tracking-line {
    overflow-wrap: anywhere;
  }
  .rorder-tracking-num {
    font-variant-numeric: tabular-nums;
  }
  a.rorder-tracking-num {
    color: var(--ripple-accent-text);
    text-decoration: none;
    border-radius: 2px;
  }
  a.rorder-tracking-num:hover {
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  a.rorder-tracking-num:focus-visible {
    outline: 2px solid var(--ripple-ring);
    outline-offset: 2px;
  }
  a.rorder-tracking-num :global(.rorder-ext) {
    display: inline;
    margin-left: 3px;
    vertical-align: -1px;
  }
  .rorder-sep {
    color: var(--ripple-muted-foreground);
  }

  /* Rail -------------------------------------------------------------------- */
  .rorder-progress {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .rorder-steps {
    display: grid;
    grid-template-columns: repeat(var(--rorder-n), minmax(0, 1fr));
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .rorder-step {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 0 3px;
    text-align: center;
  }
  .rorder-step-pip {
    position: relative;
    z-index: 1;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    border-radius: 9999px;
    background: var(--ripple-surface);
    box-shadow: inset 0 0 0 1.5px var(--ripple-control-border);
    color: var(--ripple-accent-foreground);
  }
  .rorder-step-done .rorder-step-pip {
    background: var(--ripple-accent);
    box-shadow: none;
  }
  .rorder-step-active .rorder-step-pip {
    box-shadow: inset 0 0 0 2px var(--ripple-accent);
  }
  .rorder-step-failed .rorder-step-pip {
    background: var(--ripple-error);
    color: var(--ripple-error-foreground);
    box-shadow: none;
  }
  .rorder-step-pulse {
    width: 6px;
    height: 6px;
    border-radius: 9999px;
    background: var(--ripple-accent);
    animation: rorder-pulse 2s ease-out infinite;
  }
  @keyframes rorder-pulse {
    0% {
      box-shadow: 0 0 0 0 color-mix(in oklab, var(--ripple-accent) 50%, transparent);
    }
    70%,
    100% {
      box-shadow: 0 0 0 5px transparent;
    }
  }
  /* From this marker's centre to the next one's, with a 4px gap each side. */
  .rorder-step-line {
    position: absolute;
    top: 9px;
    left: calc(50% + 14px);
    right: calc(-50% + 14px);
    height: 2px;
    border-radius: 1px;
    background: var(--ripple-track);
  }
  .rorder-step-line[data-line='done'] {
    background: var(--ripple-accent);
  }
  .rorder-step-line[data-line='dotted'] {
    height: 0;
    background: none;
    border-top: 2px dotted var(--ripple-control-border);
  }
  .rorder-step-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    max-width: 100%;
  }
  .rorder-step-label {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
    font-size: var(--text-caption-2);
    line-height: 1.3;
    font-weight: 500;
    color: var(--ripple-surface-foreground);
  }
  .rorder-step-pending .rorder-step-label {
    color: var(--ripple-muted-foreground);
  }
  .rorder-step-active .rorder-step-label,
  .rorder-step-failed .rorder-step-label {
    font-weight: 600;
  }
  .rorder-step-time {
    font-size: var(--text-caption-1);
    line-height: 1.3;
    color: var(--ripple-muted-foreground);
    font-variant-numeric: tabular-nums;
  }
  .rorder-step-summary {
    display: none;
    overflow-wrap: anywhere;
  }
  .rorder-step-summary-label {
    font-weight: 500;
  }
  .rorder-step-desc {
    color: var(--ripple-muted-foreground);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    overflow: hidden;
    text-wrap: pretty;
  }

  /* Map and places ---------------------------------------------------------- */
  .rorder-mid {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }
  .rorder-map {
    min-width: 0;
  }
  /* Leaflet writes path colour as an SVG attribute; CSS wins over it. */
  .rorder-map :global(.leaflet-overlay-pane path) {
    stroke: var(--ripple-accent);
  }
  .rorder-places {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  .rorder-place {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    min-width: 0;
  }
  .rorder-place :global(.rorder-place-icon) {
    flex-shrink: 0;
    margin-top: 1px;
    color: var(--ripple-muted-foreground);
  }
  .rorder-place-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .rorder-place-word {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--ripple-muted-foreground);
  }
  .rorder-place-dot {
    width: 6px;
    height: 6px;
    border-radius: 9999px;
  }
  .rorder-place-dot-origin {
    background: var(--ripple-muted-foreground);
  }
  .rorder-place-dot-destination {
    background: var(--ripple-accent);
  }
  .rorder-place-name,
  .rorder-place-addr {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .rorder-place-addr {
    color: var(--ripple-muted-foreground);
  }

  /* Updates ----------------------------------------------------------------- */
  .rorder-updates {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }
  .rorder-updates-title {
    color: var(--ripple-muted-foreground);
  }
  .rorder-events {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-self: stretch;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .rorder-event {
    position: relative;
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr);
    column-gap: 10px;
  }
  /* The rail: from under this marker to the next one. */
  .rorder-event:not(:last-child)::before {
    content: '';
    position: absolute;
    left: 7.5px;
    top: 18px;
    bottom: -9px;
    width: 1px;
    background: var(--ripple-border);
  }
  .rorder-event-mark {
    position: relative;
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    margin-top: 1px;
  }
  .rorder-event-mark::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 9999px;
    background: var(--ripple-muted-foreground);
  }
  .rorder-event-latest .rorder-event-mark::before {
    background: var(--ripple-accent);
  }
  .rorder-event-mark-icon {
    border-radius: 9999px;
    background: var(--ripple-muted-foreground);
    color: var(--ripple-surface);
  }
  .rorder-event-mark-icon::before {
    display: none;
  }
  .rorder-event-latest .rorder-event-mark-icon {
    background: var(--ripple-accent);
    color: var(--ripple-accent-foreground);
  }
  .rorder-event-body {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .rorder-event-label {
    display: block;
    color: var(--ripple-surface-foreground);
    line-height: 18px;
  }
  .rorder-event-time,
  .rorder-event-sep,
  .rorder-event-loc {
    color: var(--ripple-muted-foreground);
  }
  .rorder-event-time {
    font-variant-numeric: tabular-nums;
  }
  .rorder-fold {
    padding: 2px 0;
    border: 0;
    border-radius: 4px;
    background: none;
    font: inherit;
    font-size: var(--text-callout);
    font-weight: 500;
    color: var(--ripple-accent-text);
    cursor: pointer;
  }
  .rorder-fold:hover {
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .rorder-fold:focus-visible {
    outline: 2px solid var(--ripple-ring);
    outline-offset: 2px;
  }

  /* Actions ----------------------------------------------------------------- */
  .rorder-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    min-width: 0;
  }
  .rorder-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    height: 40px;
    padding: 0 14px;
    border: 1px solid transparent;
    border-radius: var(--ripple-radius);
    background: transparent;
    font: inherit;
    font-size: var(--text-body);
    font-weight: 500;
    color: var(--ripple-surface-foreground);
    cursor: pointer;
    transition:
      background-color 150ms var(--ripple-ease-out),
      border-color 150ms var(--ripple-ease-out);
  }
  .rorder-btn :global(svg) {
    flex-shrink: 0;
  }
  .rorder-btn-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rorder-btn:focus-visible {
    outline: 2px solid var(--ripple-ring);
    outline-offset: 2px;
  }
  .rorder-btn-default {
    background: var(--ripple-accent);
    color: var(--ripple-accent-foreground);
  }
  .rorder-btn-default:hover {
    background: color-mix(in oklab, var(--ripple-accent) 88%, var(--ripple-surface-foreground));
  }
  .rorder-btn-outline {
    border-color: var(--ripple-control-border);
  }
  .rorder-btn-outline:hover,
  .rorder-btn-ghost:hover {
    background: var(--ripple-muted);
  }
  .rorder-btn:active {
    transform: translateY(0.5px);
  }

  /* Narrow card: markers only on the rail, then "Step N of M". -------------- */
  @container rorder (max-width: 559px) {
    .rorder-step {
      padding: 0;
    }
    .rorder-step-line {
      left: calc(50% + 13px);
      right: calc(-50% + 13px);
    }
    .rorder-step-text {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .rorder-step-summary {
      display: block;
    }
  }

  @container rorder (min-width: 480px) {
    .rorder-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, max-content);
      column-gap: 24px;
      align-items: start;
    }
    .rorder-tracking {
      max-width: 17rem;
      align-items: flex-end;
      text-align: right;
      padding-top: 2px;
    }
  }

  @container rorder (min-width: 560px) {
    .rorder {
      gap: 16px;
    }
    .rorder-btn {
      height: 36px;
    }
    .rorder-map {
      --rorder-map-h: 240px;
    }
    .rorder-mid-with-map {
      display: grid;
      grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
      gap: 20px;
      align-items: start;
    }
    .rorder-mid:not(.rorder-mid-with-map) .rorder-places {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 20px;
    }
    .rorder-event-body {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      column-gap: 16px;
      align-items: baseline;
    }
    .rorder-event-time {
      grid-column: 2;
      grid-row: 1;
      text-align: right;
      white-space: nowrap;
    }
    .rorder-event-label {
      grid-column: 1;
      grid-row: 1;
    }
    .rorder-event-loc {
      grid-column: 1;
      grid-row: 2;
    }
    .rorder-event-sep {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .rorder-step-pulse {
      animation: none;
    }
    .rorder-map :global(.rmap-path-animated) {
      animation: none;
    }
    .rorder-btn {
      transition: none;
    }
  }
</style>
