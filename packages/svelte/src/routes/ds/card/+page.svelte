<!--
  routes/ds/card/+page.svelte: the Card widget on /ds, rendered as a Svelte
  component: the four variants, both densities, an interactive card, and the
  header and footer snippet slots on their own and together.
-->
<script lang="ts">
  import Card from '$lib/widgets/layout/Card.svelte';
  import Stat from '$lib/widgets/display/Stat.svelte';
  import Showcase from '../Showcase.svelte';

  const nav = [
    { href: '#variants', label: 'Variants' },
    { href: '#density', label: 'Density' },
    { href: '#interactive', label: 'Interactive' },
    { href: '#header-slot', label: 'Header slot' },
    { href: '#footer-slot', label: 'Footer slot' },
    { href: '#full', label: 'Full composition' }
  ];
  let clicks = $state(0);
</script>

<Showcase slug="card" {nav}>
  {#snippet intro()}
    <p>
      The <code>card</code> widget groups related content under an optional title and description. Pick a
      <code>variant</code> and a <code>density</code>, make it <code>interactive</code> to turn the whole card into a
      button, and put a stat or actions in its <code>header</code> and <code>footer</code> slots.
    </p>
  {/snippet}

  <section id="variants" class="showcase-section">
    <h2 class="showcase-section-title">Variants</h2>
    <div class="grid-2">
      <div class="showcase-item">
        <h3 class="showcase-item-title">default</h3>
        <div class="showcase-item-demo">
          <Card title="Default" description="Border on the card surface">
            <p class="body-text">Standard card, no extra fill.</p>
          </Card>
        </div>
      </div>

      <div class="showcase-item">
        <h3 class="showcase-item-title">muted</h3>
        <div class="showcase-item-demo">
          <Card variant="muted" title="Muted" description="Border on a muted fill">
            <p class="body-text">Subdued background, low emphasis.</p>
          </Card>
        </div>
      </div>

      <div class="showcase-item">
        <h3 class="showcase-item-title">outlined</h3>
        <div class="showcase-item-demo">
          <Card variant="outlined" title="Outlined" description="A hairline border">
            <p class="body-text">Hairline border, lightest treatment.</p>
          </Card>
        </div>
      </div>

      <div class="showcase-item">
        <h3 class="showcase-item-title">selected</h3>
        <div class="showcase-item-demo">
          <Card variant="selected" title="Selected" description="A brand ring marks it as picked">
            <p class="body-text">Primary ring overlay signals selection.</p>
          </Card>
        </div>
      </div>
    </div>
  </section>

  <section id="density" class="showcase-section">
    <h2 class="showcase-section-title">Density</h2>
    <div class="grid-2">
      <div class="showcase-item">
        <h3 class="showcase-item-title">compact (the default)</h3>
        <div class="showcase-item-demo">
          <Card title="Compact card" description="Tighter padding">
            <p class="body-text">Suits lists and dense dashboards.</p>
          </Card>
        </div>
      </div>

      <div class="showcase-item">
        <h3 class="showcase-item-title">comfortable</h3>
        <div class="showcase-item-demo">
          <Card density="comfortable" title="Comfortable card" description="More padding">
            <p class="body-text">More breathing room for content-heavy layouts.</p>
          </Card>
        </div>
      </div>
    </div>
  </section>

  <section id="interactive" class="showcase-section">
    <h2 class="showcase-section-title">Interactive</h2>
    <div class="showcase-item">
      <h3 class="showcase-item-title">interactive with onclick (renders as a &lt;button&gt;)</h3>
      <div class="showcase-item-demo">
        <Card
          title="Interactive"
          description="Clickable + keyboard focusable"
          interactive
          onclick={() => clicks++}
        >
          Click it, or tab to it and press Enter or Space. Pressed {clicks} {clicks === 1 ? 'time' : 'times'}.
        </Card>
      </div>
    </div>
  </section>

  <section id="header-slot" class="showcase-section">
    <h2 class="showcase-section-title">With header slot</h2>
    <div class="showcase-item">
      <h3 class="showcase-item-title">A stat on the right of the header</h3>
      <div class="showcase-item-demo">
        <Card title="Monthly revenue" description="Last 30 days">
          {#snippet header()}
            <Stat value={12450.32} format="currency" deltaPercent={3.4} direction="up-good" size="sm" align="right" />
          {/snippet}
          <p class="body-text">Revenue grew in three of the last four weeks, led by annual plans.</p>
        </Card>
      </div>
    </div>
  </section>

  <section id="footer-slot" class="showcase-section">
    <h2 class="showcase-section-title">With footer slot</h2>
    <div class="showcase-item">
      <h3 class="showcase-item-title">A note in the footer</h3>
      <div class="showcase-item-demo">
        <Card title="Active users" description="Rolling 7-day window">
          <p class="body-text">1,284 people used the app this week, 9% more than last week.</p>
          {#snippet footer()}
            <span class="text-xs text-muted-foreground">Updated 2m ago · Source: analytics</span>
          {/snippet}
        </Card>
      </div>
    </div>
  </section>

  <section id="full" class="showcase-section">
    <h2 class="showcase-section-title">Full composition</h2>
    <div class="showcase-item">
      <h3 class="showcase-item-title">Header stat, body and footer together</h3>
      <div class="showcase-item-demo">
        <Card title="Monthly revenue" description="Last 30 days">
          {#snippet header()}
            <Stat value={12450.32} format="currency" deltaPercent={-2.1} direction="up-good" size="sm" align="right" />
          {/snippet}
          <p class="body-text">Revenue grew in three of the last four weeks, led by annual plans.</p>
          {#snippet footer()}
            <span class="text-xs text-muted-foreground">Updated 2m ago</span>
          {/snippet}
        </Card>
      </div>
    </div>
  </section>
</Showcase>

<style>
  .body-text {
    font-size: 0.8125rem;
    color: var(--muted-foreground);
    margin: 0;
  }
</style>