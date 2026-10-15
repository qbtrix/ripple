<!--
  routes/ds/stat/+page.svelte: the Stat widget on /ds, rendered as a Svelte
  component: sizes, number formats, the direction matrix (which sign of change
  reads as good), with and without a label, alignment, and a stat in a Card
  header.
-->
<script lang="ts">
  import Stat from '$lib/widgets/display/Stat.svelte';
  import Card from '$lib/widgets/layout/Card.svelte';
  import Showcase from '../Showcase.svelte';

  const nav = [
    { href: '#sizes', label: 'Sizes' },
    { href: '#formats', label: 'Formats' },
    { href: '#direction-matrix', label: 'Direction' },
    { href: '#labeled', label: 'Label' },
    { href: '#alignment', label: 'Alignment' },
    { href: '#card-composition', label: 'In a card' }
  ];
</script>

<Showcase slug="stat" {nav}>
  {#snippet intro()}
    <p>
      The <code>stat</code> widget shows one number with an optional label and change. Set a <code>format</code>
      (number, currency, percent or compact), a <code>deltaPercent</code>, and a <code>direction</code> that says
      whether a rise is good or bad, so the change is coloured green or red for the right reason.
    </p>
  {/snippet}

  <section id="sizes" class="showcase-section">
    <h2 class="showcase-section-title">Sizes</h2>
    <p class="section-caption">The same value at sm, md and lg: currency, a rise, and up counts as good.</p>
    <div class="grid-3">
      <div class="showcase-item">
        <h3 class="showcase-item-title">sm</h3>
        <div class="showcase-item-demo">
          <Stat value={12450} format="currency" deltaPercent={3.4} direction="up-good" size="sm" />
        </div>
      </div>
      <div class="showcase-item">
        <h3 class="showcase-item-title">md (default)</h3>
        <div class="showcase-item-demo">
          <Stat value={12450} format="currency" deltaPercent={3.4} direction="up-good" size="md" />
        </div>
      </div>
      <div class="showcase-item">
        <h3 class="showcase-item-title">lg</h3>
        <div class="showcase-item-demo">
          <Stat value={12450} format="currency" deltaPercent={3.4} direction="up-good" size="lg" />
        </div>
      </div>
    </div>
  </section>

  <section id="formats" class="showcase-section">
    <h2 class="showcase-section-title">Formats</h2>
    <p class="section-caption">number, currency in USD and INR, percent and compact.</p>
    <div class="grid-3">
      <div class="showcase-item">
        <h3 class="showcase-item-title">number</h3>
        <div class="showcase-item-demo">
          <Stat label="Count" value={1234} format="number" deltaPercent={5.2} direction="up-good" />
        </div>
      </div>
      <div class="showcase-item">
        <h3 class="showcase-item-title">currency, USD</h3>
        <div class="showcase-item-demo">
          <Stat label="Revenue" value={1234.5} format="currency" currency="USD" deltaPercent={2.8} direction="up-good" />
        </div>
      </div>
      <div class="showcase-item">
        <h3 class="showcase-item-title">currency, INR</h3>
        <div class="showcase-item-demo">
          <Stat label="Revenue" value={1234.5} format="currency" currency="INR" locale="en-IN" deltaPercent={2.8} direction="up-good" />
        </div>
      </div>
      <div class="showcase-item">
        <h3 class="showcase-item-title">percent</h3>
        <div class="showcase-item-demo">
          <Stat label="Conversion" value={0.125} format="percent" deltaPercent={-1.3} direction="up-good" />
        </div>
      </div>
      <div class="showcase-item">
        <h3 class="showcase-item-title">compact</h3>
        <div class="showcase-item-demo">
          <Stat label="Impressions" value={1234567} format="compact" deltaPercent={11.4} direction="up-good" />
        </div>
      </div>
    </div>
  </section>

  <section id="direction-matrix" class="showcase-section">
    <h2 class="showcase-section-title">Direction matrix</h2>
    <p class="section-caption">
      Each row is a <code>direction</code>, each column a sign of change. With <code>up-good</code> a rise is
      green; with <code>down-good</code> (latency, churn) a fall is green; <code>auto</code> treats a rise as good.
    </p>
    <div class="matrix-scroll">
    <div class="matrix-grid">
      <!-- Header row -->
      <div class="matrix-axis-label"></div>
      <div class="matrix-col-label">positive (+3.4%)</div>
      <div class="matrix-col-label">negative (-2.1%)</div>
      <div class="matrix-col-label">zero (0%)</div>

      <!-- auto -->
      <div class="matrix-row-label">auto</div>
      <div class="showcase-item">
        <div class="showcase-item-demo">
          <Stat value={9200} format="number" deltaPercent={3.4} direction="auto" size="sm" />
        </div>
      </div>
      <div class="showcase-item">
        <div class="showcase-item-demo">
          <Stat value={9200} format="number" deltaPercent={-2.1} direction="auto" size="sm" />
        </div>
      </div>
      <div class="showcase-item">
        <div class="showcase-item-demo">
          <Stat value={9200} format="number" deltaPercent={0} direction="auto" size="sm" />
        </div>
      </div>

      <!-- up-good -->
      <div class="matrix-row-label">up-good</div>
      <div class="showcase-item">
        <div class="showcase-item-demo">
          <Stat value={9200} format="number" deltaPercent={3.4} direction="up-good" size="sm" />
        </div>
      </div>
      <div class="showcase-item">
        <div class="showcase-item-demo">
          <Stat value={9200} format="number" deltaPercent={-2.1} direction="up-good" size="sm" />
        </div>
      </div>
      <div class="showcase-item">
        <div class="showcase-item-demo">
          <Stat value={9200} format="number" deltaPercent={0} direction="up-good" size="sm" />
        </div>
      </div>

      <!-- down-good -->
      <div class="matrix-row-label">down-good</div>
      <div class="showcase-item">
        <div class="showcase-item-demo">
          <Stat value={9200} format="number" deltaPercent={3.4} direction="down-good" size="sm" />
        </div>
      </div>
      <div class="showcase-item">
        <div class="showcase-item-demo">
          <Stat value={9200} format="number" deltaPercent={-2.1} direction="down-good" size="sm" />
        </div>
      </div>
      <div class="showcase-item">
        <div class="showcase-item-demo">
          <Stat value={9200} format="number" deltaPercent={0} direction="down-good" size="sm" />
        </div>
      </div>
    </div>
    </div>
  </section>

  <section id="labeled" class="showcase-section">
    <h2 class="showcase-section-title">With and without a label</h2>
    <div class="grid-2">
      <div class="showcase-item">
        <h3 class="showcase-item-title">with label</h3>
        <div class="showcase-item-demo">
          <Stat label="Revenue" value={48200} format="currency" deltaPercent={7.1} direction="up-good" />
        </div>
      </div>
      <div class="showcase-item">
        <h3 class="showcase-item-title">no label</h3>
        <div class="showcase-item-demo">
          <Stat value={48200} format="currency" deltaPercent={7.1} direction="up-good" />
        </div>
      </div>
    </div>
  </section>

  <section id="alignment" class="showcase-section">
    <h2 class="showcase-section-title">Alignment</h2>
    <p class="section-caption">Each stat sits in a narrow dashed box so you can see which edge it hugs.</p>
    <div class="grid-2">
      <div class="showcase-item">
        <h3 class="showcase-item-title">align="left" (default)</h3>
        <div class="showcase-item-demo">
          <div class="w-full max-w-60 border border-dashed border-border/50 rounded p-2">
            <Stat label="Latency" value={142} format="number" deltaPercent={-8.3} direction="down-good" align="left" />
          </div>
        </div>
      </div>
      <div class="showcase-item">
        <h3 class="showcase-item-title">align="right"</h3>
        <div class="showcase-item-demo">
          <div class="w-full max-w-60 border border-dashed border-border/50 rounded p-2">
            <Stat label="Latency" value={142} format="number" deltaPercent={-8.3} direction="down-good" align="right" />
          </div>
        </div>
      </div>
    </div>
  </section>

  <section id="card-composition" class="showcase-section">
    <h2 class="showcase-section-title">Card composition</h2>
    <p class="section-caption">A right-aligned stat in the card header, body text, and a note in the footer.</p>
    <div class="showcase-item">
      <h3 class="showcase-item-title">Stat in the header, note in the footer</h3>
      <div class="showcase-item-demo">
        <Card title="Active users" description="Rolling 7-day window">
          {#snippet header()}
            <Stat value={3847} format="compact" deltaPercent={12.6} direction="up-good" size="sm" align="right" />
          {/snippet}
          <p class="m-0 text-sm text-muted-foreground">Most new users came from the weekly digest email.</p>
          {#snippet footer()}
            <span class="text-xs text-muted-foreground">Updated 4m ago · Source: analytics</span>
          {/snippet}
        </Card>
      </div>
    </div>
  </section>
</Showcase>

<style>
  .matrix-scroll {
    overflow-x: auto;
  }
  .matrix-grid {
    display: grid;
    grid-template-columns: 6rem repeat(3, minmax(9rem, 1fr));
    gap: 0.5rem;
    align-items: center;
  }
  .matrix-col-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--site-soft);
    text-align: center;
    padding-bottom: 0.25rem;
  }
  .matrix-row-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--site-soft);
    font-family: var(--font-mono);
  }
</style>
