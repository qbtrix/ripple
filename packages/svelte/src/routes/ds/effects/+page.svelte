<!--
  routes/ds/effects/+page.svelte: the effect widgets on /ds (marquee,
  border-beam, shimmer, animated-beam, aurora, spotlight, bento-grid,
  text-effect), one labelled <Ripple {spec} /> each. All pure CSS or SVG and
  SSR-safe; none of them uses the motion engine. Upstream credits for the
  ports live in packages/svelte/NOTICE, not in page copy. /ds/premium
  redirects here.
-->
<script lang="ts">
  import { Ripple } from '$lib/index.js';
  import Showcase from '../Showcase.svelte';

  // 1 ── marquee: seamless scrolling row, pauses on hover
  const marqueeSpec = {
    version: '1.0' as const,
    ui: {
      type: 'marquee',
      props: { duration: 22, pauseOnHover: true },
      class: 'py-2',
      children: [
        { type: 'badge', props: { text: 'Brightline', variant: 'secondary' } },
        { type: 'badge', props: { text: 'Corvo', variant: 'secondary' } },
        { type: 'badge', props: { text: 'Helio Cells', variant: 'secondary' } },
        { type: 'badge', props: { text: 'Northgrid', variant: 'secondary' } },
        { type: 'badge', props: { text: 'Stratum', variant: 'secondary' } },
        { type: 'badge', props: { text: 'Lumen', variant: 'secondary' } },
        { type: 'badge', props: { text: 'Fernhill', variant: 'secondary' } },
      ],
    },
  };

  // 2 ── border-beam — gradient beam orbiting a card border
  const borderBeamSpec = {
    version: '1.0' as const,
    ui: {
      type: 'border-beam',
      props: { duration: 7, size: 2 },
      class: 'rounded-xl border bg-card p-6 max-w-sm',
      children: [
        { type: 'flex', props: { direction: 'column', gap: '4px' }, children: [
          { type: 'heading', props: { text: 'Pro plan', level: 4 } },
          { type: 'text', props: { text: 'A beam orbits the border to draw the eye to the featured card.', size: 'sm' }, class: 'text-muted-foreground' },
        ] },
      ],
    },
  };

  // 3 ── shimmer — moving highlight band swept across a label
  const shimmerSpec = {
    version: '1.0' as const,
    ui: {
      type: 'shimmer',
      props: { duration: 2.4, width: '120px' },
      class: 'text-xl font-semibold inline-block',
      children: [{ type: 'text', props: { text: 'Get early access' } }],
    },
  };

  // 4 ── animated-beam — SVG curve with a flowing gradient pulse
  const animatedBeamSpec = {
    version: '1.0' as const,
    ui: {
      type: 'flex',
      props: { direction: 'column', gap: '6px' },
      children: [
        { type: 'animated-beam', props: { duration: 4, curvature: -50 }, class: 'h-24 text-muted-foreground' },
        { type: 'text', props: { text: 'A gradient pulse flows along the curve to suggest a connection or data flow.', size: 'sm' }, class: 'text-muted-foreground' },
      ],
    },
  };

  // 5 ── aurora — soft drifting multi-gradient backdrop behind content
  const auroraSpec = {
    version: '1.0' as const,
    ui: {
      type: 'aurora',
      props: { speed: 12 },
      class: 'min-h-[260px] flex items-center justify-center p-12 rounded-xl border',
      children: [
        { type: 'flex', props: { direction: 'column', gap: '8px', align: 'center' }, children: [
          { type: 'heading', props: { text: 'Sites that move', level: 2 } },
          { type: 'text', props: { text: 'A drifting aurora makes a great hero backdrop.', size: 'sm' } },
        ] },
      ],
    },
  };

  // 6 ── spotlight — radial highlight that follows the cursor on hover
  const spotlightSpec = {
    version: '1.0' as const,
    ui: {
      type: 'spotlight',
      props: { size: '360px' },
      class: 'rounded-xl border bg-card p-10 flex items-center justify-center min-h-[200px]',
      children: [
        { type: 'flex', props: { direction: 'column', gap: '6px', align: 'center' }, children: [
          { type: 'heading', props: { text: 'Hover to light it up', level: 3 } },
          { type: 'text', props: { text: 'Move your cursor across the card: a radial highlight tracks it.', size: 'sm' }, class: 'text-muted-foreground' },
        ] },
      ],
    },
  };

  // 7 ── bento-grid — bento/masonry feature grid with spanning cells
  const bentoGridSpec = {
    version: '1.0' as const,
    ui: {
      type: 'bento-grid',
      props: {
        columns: 3,
        items: [
          { title: 'Edge-fast', description: 'Served from the closest edge node, worldwide.', span: 2 },
          { title: 'White-label', description: 'Your brand, end to end.', span: 1 },
          { title: 'No infra', description: 'We host it.', span: 1 },
          { title: 'Edit by chat', description: 'Change anything just by asking; the spec re-renders in place.', span: 2 },
        ],
      },
    },
  };

  // 8 ── text-effect — staggered per-word / per-char text reveal
  const textEffectSpec = {
    version: '1.0' as const,
    ui: {
      type: 'flex',
      props: { direction: 'column', gap: '14px', align: 'start' },
      children: [
        { type: 'text-effect', props: { text: 'Build. Brand. Ship.', effect: 'gradient', by: 'word' }, class: 'text-4xl font-bold' },
        { type: 'text-effect', props: { text: 'Describe it and it appears', effect: 'fade-in', by: 'char', stagger: 0.02 }, class: 'text-xl font-medium' },
        { type: 'text-effect', props: { text: 'Get early access', effect: 'shimmer', by: 'word' }, class: 'text-lg font-semibold' },
      ],
    },
  };

  // Drives the labeled grid below. Each entry is rendered through its own
  // isolated <Ripple> instance.
  const demos = [
    { id: 'marquee', label: 'marquee', note: 'A seamless scrolling row that pauses on hover.', spec: marqueeSpec },
    { id: 'border-beam', label: 'border-beam', note: 'Gradient beam orbiting a card border.', spec: borderBeamSpec },
    { id: 'shimmer', label: 'shimmer', note: 'Highlight band swept across a label.', spec: shimmerSpec },
    { id: 'animated-beam', label: 'animated-beam', note: 'SVG curve with a flowing gradient pulse.', spec: animatedBeamSpec },
    { id: 'aurora', label: 'aurora', note: 'Drifting multi-gradient backdrop.', spec: auroraSpec },
    { id: 'spotlight', label: 'spotlight', note: 'Radial highlight following the cursor.', spec: spotlightSpec },
    { id: 'bento-grid', label: 'bento-grid', note: 'Masonry feature grid with spanning cells.', spec: bentoGridSpec },
    { id: 'text-effect', label: 'text-effect', note: 'A staggered reveal, by word or by character.', spec: textEffectSpec },
  ];
</script>

<Showcase slug="effects" nav={demos.map((d) => ({ href: `#${d.id}`, label: d.label }))}>
  {#snippet intro()}
    <p>
      Widgets for marketing pages and hero sections. Each one is plain CSS or SVG, renders on the server, and needs no
      script to look finished. Each demo below is its own <code>&lt;Ripple&gt;</code> spec. Hover the
      <code>marquee</code>, <code>spotlight</code> and <code>border-beam</code> to see them react.
    </p>
  {/snippet}

  {#each demos as d (d.id)}
    <section id={d.id} class="showcase-section">
      <h2 class="showcase-section-title"><code>{d.label}</code></h2>
      <p class="section-caption">{d.note}</p>
      <div class="showcase-item">
        <div class="showcase-item-demo effect-demo">
          <Ripple spec={d.spec} />
        </div>
      </div>
    </section>
  {/each}
</Showcase>

<style>
  .effect-demo {
    overflow: hidden;
  }
</style>
