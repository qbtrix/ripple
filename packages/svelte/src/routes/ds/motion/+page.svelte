<!--
  routes/ds/motion/+page.svelte: the motion primitive on /ds. Specs that
  exercise the node-level `motion` field: staggered fade-up cards
  (motion.inView with per-card transition.delay in seconds), a spring hover CTA
  (motion.hover/tap), the `reveal` and `parallax` sugar widgets (parallax runs
  on motion.scroll and is padded for its drift), and a button whose `animate`
  action ({ action, target, motion }) pulses a card by id through the shared
  withMotion engine, with no host code. The page lists the last few events it
  received under that demo. One <Ripple {spec} /> a panel.
-->
<script lang="ts">
  import { Ripple } from '$lib/index.js';
  import type { RippleEvent } from '@ripple-ui/core';
  import Showcase from '../Showcase.svelte';

  // The events the specs hand to the host (the `animate` action), newest first.
  let events = $state<string[]>([]);
  function handleEvent(event: RippleEvent) {
    events = [`${event.type}${event.name ? ` · ${event.name}` : ''}`, ...events].slice(0, 3);
  }

  const nav = [
    { href: '#stagger', label: 'Staggered scroll' },
    { href: '#hover', label: 'Spring hover' },
    { href: '#reveal', label: 'reveal' },
    { href: '#parallax', label: 'parallax' },
    { href: '#animate', label: 'animate action' }
  ];

  // ── 1. Staggered fade-up on scroll ──────────────────────────────
  // Each card carries an inView motion (fade + rise) plus a per-card delay so
  // the row cascades in. The cascade is the increasing transition.delay (in
  // SECONDS) across the four cards, not the parent-orchestrated `stagger`
  // field. inView arms the full from-state, so each card fades AND rises.
  const STEPS = [
    { n: '01', title: 'Describe', body: 'Tell the agent what you want in plain language.' },
    { n: '02', title: 'Generate', body: 'Ripple compiles a spec into live Svelte UI.' },
    { n: '03', title: 'Refine', body: 'Keep editing by chat; the spec re-renders in place.' },
    { n: '04', title: 'Ship', body: 'Put it on a page. Your brand, your domain.' },
  ];

  const staggerSpec = {
    version: '1.0' as const,
    ui: {
      type: 'flex',
      props: { direction: 'column', gap: '12px' },
      children: [
        { type: 'text', props: { text: 'Scroll so this row enters the viewport: the cards fade and rise in sequence.', size: 'sm' }, class: 'text-muted-foreground' },
        {
          type: 'grid',
          props: { columns: 4, gap: '12px' },
          children: STEPS.map((s, i) => ({
            type: 'card',
            props: { title: `${s.n} · ${s.title}` },
            // inView fade-up; the delay cascades 0 → 0.36s across the four cards.
            motion: {
              inView: { opacity: 0, y: 28, once: true, amount: 0.2 },
              transition: { preset: 'smooth', delay: i * 0.12 },
            },
            children: [{ type: 'text', props: { text: s.body, size: 'sm' }, class: 'text-muted-foreground' }],
          })),
        },
      ],
    },
  };

  // ── 2. Magnetic / spring hover CTA (bouncy preset) ──────────────
  // hover lifts + scales, tap presses in. The `bouncy` spring overshoots so the
  // button feels magnetic. Two buttons: the primary CTA and a ghost.
  const magneticCtaSpec = {
    version: '1.0' as const,
    ui: {
      type: 'flex',
      props: { gap: '16px', align: 'center', wrap: 'wrap' },
      class: 'py-6',
      children: [
        {
          type: 'button',
          props: { label: 'Start building', size: 'lg' },
          motion: {
            hover: { y: -4, scale: 1.06 },
            tap: { scale: 0.95 },
            transition: { preset: 'bouncy' },
          },
        },
        {
          type: 'button',
          props: { label: 'See a demo', variant: 'outline', size: 'lg' },
          motion: {
            hover: { y: -2, scale: 1.03 },
            tap: { scale: 0.97 },
            transition: { preset: 'snappy' },
          },
        },
        { type: 'text', props: { text: 'Hover and press: the spring overshoots on the way up and presses in on tap.', size: 'sm' }, class: 'text-muted-foreground' },
      ],
    },
  };

  // ── 3. `reveal` sugar widget ────────────────────────────────────
  // The author writes { type: 'reveal' } — it desugars to an inView motion.
  // Four entrances: up, left, right and a plain fade.
  const revealSpec = {
    version: '1.0' as const,
    ui: {
      type: 'flex',
      props: { direction: 'column', gap: '16px' },
      children: [
        {
          type: 'grid',
          props: { columns: 2, gap: '16px' },
          children: [
            {
              type: 'reveal',
              props: { direction: 'up' },
              children: [{ type: 'card', props: { title: 'reveal, up' }, children: [{ type: 'text', props: { text: 'Rises 24px into view.', size: 'sm' } }] }],
            },
            {
              type: 'reveal',
              props: { direction: 'left' },
              children: [{ type: 'card', props: { title: 'reveal, left' }, children: [{ type: 'text', props: { text: 'Slides in from the left.', size: 'sm' } }] }],
            },
            {
              type: 'reveal',
              props: { direction: 'right' },
              children: [{ type: 'card', props: { title: 'reveal, right' }, children: [{ type: 'text', props: { text: 'Slides in from the right.', size: 'sm' } }] }],
            },
            {
              type: 'reveal',
              props: { direction: 'fade' },
              children: [{ type: 'card', props: { title: 'reveal, fade' }, children: [{ type: 'text', props: { text: 'Pure opacity fade, no travel.', size: 'sm' } }] }],
            },
          ],
        },
      ],
    },
  };

  // ── 4. `parallax` sugar widget ──────────────────────────────────
  // Contents drift vertically as the page scrolls. Sugar over a scroll motion.
  const parallaxSpec = {
    version: '1.0' as const,
    ui: {
      type: 'flex',
      props: { direction: 'column', gap: '8px' },
      children: [
        {
          type: 'parallax',
          props: { distance: 50 },
          // Room for the 50px drift either way, so the card never clips.
          class: 'py-14',
          children: [
            {
              type: 'card',
              props: { title: 'I drift on scroll' },
              children: [{ type: 'text', props: { text: 'As you scroll the page, this card drifts vertically relative to the flow. Scroll up and down to feel the depth.', size: 'sm' }, class: 'text-muted-foreground' }],
            },
          ],
        },
      ],
    },
  };

  // ── 5. The `animate` action ─────────────────────────────────────
  // on_click fires the `animate` action against a target widget BY ID. The
  // runtime locates that node (id: 'animate-target') and pulses it via the
  // shared withMotion engine — so the click VISIBLY moves the badge on screen
  // with no host code. The host (this page) ALSO receives the event via onEvent
  // and echoes it below, proving the action both animates AND round-trips.
  //
  // AUTHORED PER THE AnimateHandler SCHEMA: `{ action, target, motion }`. The
  // earlier `{ action: 'animate', name: 'pulse' }` was wrong — `name` is not a
  // field, so target + motion arrived undefined and nothing animated.
  const animateActionSpec = {
    version: '1.0' as const,
    ui: {
      type: 'flex',
      props: { direction: 'column', gap: '16px', align: 'start' },
      children: [
        {
          type: 'button',
          props: { label: 'Fire animate action', icon: 'sparkles' },
          // Pulse the target: pop up + scale, bouncy spring on the return.
          on_click: {
            action: 'animate',
            target: 'animate-target',
            motion: { enter: { scale: 1.35, y: -14 }, transition: { preset: 'bouncy' } },
          },
          // also give the button itself a tactile hover so the trigger feels alive
          motion: { hover: { scale: 1.04 }, tap: { scale: 0.96 }, transition: { preset: 'snappy' } },
        },
        // The animation target. Its id is what the `animate` action above resolves
        // and pulses. A small card so the motion is unmistakable on screen.
        {
          type: 'card',
          id: 'animate-target',
          props: { title: 'Pulse me', description: 'Click the button: this card pops up, then settles back.' },
          class: 'inline-block',
        },
        { type: 'text', props: { text: 'The animate action finds this card by its id and pulses it, with no host code. The page also receives the event and lists it below.', size: 'sm' }, class: 'text-muted-foreground' },
      ],
    },
  };
</script>

<Showcase slug="motion" {nav}>
  {#snippet intro()}
    <p>
      Every node in a spec can carry a <code>motion</code> field next to <code>props</code>, <code>class</code> and
      <code>style</code>: entrances when it scrolls into view, springs on hover and tap, and drift on scroll, with no
      per-widget wiring. Each demo below is a JSON spec rendered through <code>&lt;Ripple&gt;</code>. Scroll, hover and
      click to see it move.
    </p>
  {/snippet}

  <section id="stagger" class="showcase-section">
    <h2 class="showcase-section-title">Staggered fade-up on scroll: <code>motion.inView</code></h2>
    <div class="showcase-item">
      <div class="showcase-item-demo">
        <Ripple spec={staggerSpec} />
      </div>
    </div>
  </section>

  <section id="hover" class="showcase-section">
    <h2 class="showcase-section-title">Spring hover: <code>motion.hover</code> and <code>tap</code></h2>
    <div class="showcase-item">
      <div class="showcase-item-demo">
        <Ripple spec={magneticCtaSpec} />
      </div>
    </div>
  </section>

  <section id="reveal" class="showcase-section">
    <h2 class="showcase-section-title">The <code>reveal</code> widget</h2>
    <p class="section-caption">Shorthand for a scroll entrance: wrap any node and pick a direction.</p>
    <div class="showcase-item">
      <div class="showcase-item-demo">
        <Ripple spec={revealSpec} />
      </div>
    </div>
  </section>

  <section id="parallax" class="showcase-section">
    <h2 class="showcase-section-title">The <code>parallax</code> widget</h2>
    <p class="section-caption">Shorthand for a scroll-linked drift: the card drifts up to 50px either way as the page scrolls.</p>
    <div class="showcase-item">
      <div class="showcase-item-demo">
        <Ripple spec={parallaxSpec} />
      </div>
    </div>
  </section>

  <section id="animate" class="showcase-section">
    <h2 class="showcase-section-title">The <code>animate</code> action</h2>
    <div class="showcase-item">
      <div class="showcase-item-demo">
        <Ripple spec={animateActionSpec} onEvent={handleEvent} />
      </div>
    </div>
    <p class="event-log" aria-live="polite">
      Events the page received: {events.length ? events.join(', ') : 'none yet. Press the button.'}
    </p>
  </section>
</Showcase>
