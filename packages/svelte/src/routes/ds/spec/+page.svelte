<!--
  routes/ds/spec/+page.svelte: cards, stats and charts composed from JSON specs
  on /ds: a KPI row, area, line and bar charts in cards with a stat routed into
  the card header by `slot: 'header'`, a sparkline and a donut. The series are
  deterministic (no Math.random), so the prerendered page and the hydrated one
  draw the same lines.
-->
<script lang="ts">
  import Ripple from '$lib/Ripple.svelte';
  import Showcase from '../Showcase.svelte';

  // Repeatable wiggle in [0, 1) so the demo series look organic but never change.
  const wiggle = (i: number) => ((i * 37) % 11) / 11;

  // 30-day revenue series (trending up)
  const revenueSeries = Array.from({ length: 30 }, (_, i) => ({
    label: `Day ${i + 1}`,
    value: 8000 + Math.round(Math.sin(i / 5) * 800 + i * 140 + wiggle(i) * 400),
  }));

  // hourly p95 latency (ms), trending up: bad for down-good
  const latencySeries = Array.from({ length: 24 }, (_, i) => ({
    label: `${i}:00`,
    value: 140 + Math.round(Math.cos(i / 4) * 30 + i * 1.8 + wiggle(i) * 14),
  }));

  // weekly signups (bar)
  const signupsSeries = [
    { label: 'Mon', value: 32 },
    { label: 'Tue', value: 41 },
    { label: 'Wed', value: 38 },
    { label: 'Thu', value: 57 },
    { label: 'Fri', value: 64 },
    { label: 'Sat', value: 29 },
    { label: 'Sun', value: 18 }
  ];

  // error-rate share (donut)
  const errorShare = [
    { label: '5xx', value: 4 },
    { label: '4xx', value: 38 },
    { label: 'Timeout', value: 12 },
    { label: 'OK', value: 946 }
  ];

  const revenueCardSpec = {
    ui: {
      type: 'card',
      props: { title: 'Monthly revenue', description: 'Last 30 days' },
      children: [
        {
          type: 'stat',
          slot: 'header',
          props: {
            value: 12450.32, format: 'currency',
            deltaPercent: 3.4, direction: 'up-good',
            size: 'sm', align: 'right'
          }
        },
        {
          type: 'chart',
          props: { type: 'area', data: revenueSeries, height: 120, tooltip: false }
        },
        {
          type: 'text',
          slot: 'footer',
          props: { text: 'Updated 2m ago', class: 'text-xs text-muted-foreground' }
        }
      ]
    }
  };

  const latencyCardSpec = {
    ui: {
      type: 'card',
      props: { title: 'p95 latency', description: 'Last hour' },
      children: [
        {
          type: 'stat',
          slot: 'header',
          props: {
            value: 187, deltaPercent: 12.4, direction: 'down-good',
            size: 'sm', align: 'right'
          }
        },
        {
          type: 'chart',
          props: { type: 'line', data: latencySeries, height: 120, tooltip: false }
        }
      ]
    }
  };

  const signupsCardSpec = {
    ui: {
      type: 'card',
      props: { title: 'Signups this week', description: 'Daily total' },
      children: [
        {
          type: 'stat',
          slot: 'header',
          props: { value: 279, deltaPercent: 18.2, direction: 'up-good', size: 'sm', align: 'right' }
        },
        {
          type: 'chart',
          props: { type: 'bar', data: signupsSeries, height: 140, tooltip: true, colors: ['var(--primary)'] }
        }
      ]
    }
  };

  const errorShareCardSpec = {
    ui: {
      type: 'card',
      props: { title: 'Response mix', description: 'Last 24h' },
      children: [
        {
          type: 'chart',
          props: { type: 'donut', data: errorShare, height: 180, tooltip: true }
        }
      ]
    }
  };

  const kpiRowSpec = {
    ui: {
      type: 'grid',
      props: { columns: 3, gap: 3 },
      children: [
        { type: 'stat', props: { label: 'Revenue', value: 12450, format: 'currency', deltaPercent: 3.4, direction: 'up-good' } },
        { type: 'stat', props: { label: 'Signups', value: 247, deltaPercent: 18.2, direction: 'up-good' } },
        { type: 'stat', props: { label: 'Churn', value: 0.034, format: 'percent', deltaPercent: -0.8, direction: 'down-good' } }
      ]
    }
  };

  const sparkCardSpec = {
    ui: {
      type: 'card',
      props: { title: 'Active sessions', description: 'Real-time' },
      children: [
        {
          type: 'stat',
          slot: 'header',
          props: { value: 1284, deltaPercent: 2.1, direction: 'up-good', size: 'sm', align: 'right' }
        },
        {
          type: 'chart',
          props: { type: 'sparkline', data: revenueSeries.slice(-20), height: 40, tooltip: false }
        }
      ]
    }
  };
</script>

<Showcase slug="spec">
  {#snippet intro()}
    <p>
      Cards, stats and charts rendered from declarative JSON specs, the shape an agent emits. A child with
      <code>slot: 'header'</code> or <code>slot: 'footer'</code> lands in the card's header or footer instead of its
      body.
    </p>
  {/snippet}

  <section class="showcase-section">
    <h2 class="showcase-section-title">KPI row</h2>
    <Ripple spec={kpiRowSpec} />
  </section>

  <section class="showcase-section">
    <h2 class="showcase-section-title">Area chart in a card</h2>
    <p class="section-caption">Revenue, where up is good.</p>
    <Ripple spec={revenueCardSpec} />
  </section>

  <section class="showcase-section">
    <h2 class="showcase-section-title">Line chart in a card</h2>
    <p class="section-caption">Latency, where down is good.</p>
    <Ripple spec={latencyCardSpec} />
  </section>

  <section class="showcase-section">
    <h2 class="showcase-section-title">Bar chart in a card</h2>
    <p class="section-caption">Weekly signups in one series colour.</p>
    <Ripple spec={signupsCardSpec} />
  </section>

  <section class="showcase-section grid-2">
    <div>
      <h2 class="showcase-section-title">Sparkline in a card</h2>
      <Ripple spec={sparkCardSpec} />
    </div>
    <div>
      <h2 class="showcase-section-title">Donut in a card</h2>
      <Ripple spec={errorShareCardSpec} />
    </div>
  </section>
</Showcase>
