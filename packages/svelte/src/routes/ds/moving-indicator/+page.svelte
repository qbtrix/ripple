<!--
  routes/ds/moving-indicator/+page.svelte: the generic movingIndicator
  primitive on /ds ("a highlight springs to the active item among its
  siblings"). One primitive, two widgets, two active sources side by side: a
  segmented control where the pill follows the selection, and a checkbox group
  where the highlight follows hover over unselected rows. Each indicator is a
  single `use:movingIndicator` element.
-->
<script lang="ts">
  import { Ripple } from '$lib/index.js';
  import Showcase from '../Showcase.svelte';
  import SegmentedControl from './SegmentedControl.svelte';

  const nav = [
    { href: '#segmented', label: 'Segmented control (selection)' },
    { href: '#checkbox', label: 'Checkbox group (hover)' },
    { href: '/ds/checkbox-group', label: 'Checkbox group' },
    { href: '/ds/motion', label: 'Motion' }
  ];

  // ── Consumer 1: segmented control (active = SELECTION) ──────────────
  let viewMode = $state('Board');
  let range = $state('30 days');
  let density = $state('Comfortable');

  // ── Consumer 2: checkbox group (active = HOVER) ─────────────────────
  // A declarative Ripple spec for the same widget the primitive drives. It
  // starts with a contiguous run selected so the merged block is visible and a
  // hover over a checked row shows no second highlight.
  const checkboxSpec = {
    version: '1.0' as const,
    state: { scopes: ['repo', 'workflow'] },
    ui: {
      type: 'flex',
      props: { direction: 'column', gap: '14px' },
      children: [
        {
          type: 'text',
          props: { text: 'Hover a checked row: no second highlight paints inside the selection. Hover an unchecked row: the highlight glides to it.', size: 'sm' },
          class: 'text-muted-foreground'
        },
        {
          type: 'checkbox-group',
          props: {
            label: 'Token scopes',
            options: [
              { value: 'repo', label: 'Repository access' },
              { value: 'workflow', label: 'Workflow runs' },
              { value: 'packages', label: 'Package registry' },
              { value: 'webhooks', label: 'Webhook delivery' },
              { value: 'snippets', label: 'Snippet read and write' }
            ]
          },
          bind: 'scopes'
        },
        { type: 'text', props: { text: 'Granted: {state.scopes}', size: 'xs' }, class: 'text-muted-foreground' }
      ]
    }
  };
</script>

<Showcase slug="moving-indicator" {nav}>
  {#snippet intro()}
    <p>
      <code>movingIndicator</code> is a Svelte action: a highlight springs to the active item among its siblings. Put it
      on a highlight element, tell it the container, how to find the items, and which one is active. It measures that
      item's box and glides the highlight there on the fast 80ms spring. The two demos below run the same action; one
      calls the <strong>selected</strong> item active, the other the <strong>hovered</strong> one.
    </p>
  {/snippet}

  <section id="segmented" class="showcase-section">
    <h2 class="showcase-section-title">Segmented control: active is the selection</h2>
    <p class="section-caption">
      Click a segment or move with the arrow keys. The pill glides to the selection: <code>movingIndicator</code> with
      <code>axis: 'x'</code> and the selected index as active.
    </p>
    <div class="showcase-item">
      <div class="showcase-item-demo demo-stack">
        <SegmentedControl
          label="View"
          segments={['Board', 'Timeline', 'Calendar', 'Table']}
          bind:value={viewMode}
        />
        <SegmentedControl
          label="Date range"
          segments={['7 days', '30 days', '90 days', 'Year']}
          bind:value={range}
        />
        <SegmentedControl
          label="Row density"
          segments={['Compact', 'Comfortable', 'Spacious']}
          bind:value={density}
        />
        <p class="readout">
          View <strong>{viewMode}</strong> · Range <strong>{range}</strong> ·
          Density <strong>{density}</strong>
        </p>
      </div>
    </div>
  </section>

  <section id="checkbox" class="showcase-section">
    <h2 class="showcase-section-title">Checkbox group: active is the hovered row</h2>
    <p class="section-caption">
      The same action drives the hover highlight, which tracks unchecked rows only. Two rows start checked as one merged
      block.
    </p>
    <div class="showcase-item">
      <div class="showcase-item-demo">
        <Ripple spec={checkboxSpec} />
      </div>
    </div>
  </section>
</Showcase>

<style>
  .demo-stack {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .readout {
    font-size: 0.8rem;
    color: var(--muted-foreground);
    margin: 0.25rem 0 0;
  }
</style>
