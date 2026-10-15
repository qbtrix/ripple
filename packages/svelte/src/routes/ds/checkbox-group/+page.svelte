<!--
  routes/ds/checkbox-group/+page.svelte: the checkbox-group widget on /ds,
  for feeling the gliding highlight. Three bound panels: the hover glide
  between rows (80ms), merged backgrounds for adjacent checked items (a 160ms
  spring morph; hovering a checked row paints no second highlight), and
  disabled states. The highlight and focus ring come from the movingIndicator
  primitive (see /ds/moving-indicator). Copy names the springs by speed
  (fast, moderate), not by the token constant.
-->
<script lang="ts">
  import { Ripple } from '$lib/index.js';
  import Showcase from '../Showcase.svelte';

  const nav = [
    { href: '#glide', label: 'The glide' },
    { href: '#merge', label: 'Merged backgrounds' },
    { href: '#states', label: 'States' },
    { href: '/ds/moving-indicator', label: 'Moving indicator' },
    { href: '/ds/motion', label: 'Motion' }
  ];

  // ── 1. The gliding highlight ────────────────────────────────────
  // Hover down the list: one background element travels between rows on the
  // 80ms fast spring.
  const glideSpec = {
    version: '1.0' as const,
    state: { alerts: ['mentions'] },
    ui: {
      type: 'flex',
      props: { direction: 'column', gap: '14px' },
      children: [
        {
          type: 'text',
          props: { text: 'Move your cursor slowly down the rows: the highlight glides to follow it.', size: 'sm' },
          class: 'text-muted-foreground'
        },
        {
          type: 'checkbox-group',
          props: {
            label: 'Notify me about',
            options: [
              { value: 'mentions', label: 'Mentions & replies' },
              { value: 'assigned', label: 'Issues assigned to me' },
              { value: 'reviews', label: 'Review requests' },
              { value: 'deploys', label: 'Deploys to production' },
              { value: 'digest', label: 'Weekly digest' }
            ]
          },
          bind: 'alerts'
        },
        { type: 'text', props: { text: 'Subscribed: {state.alerts}', size: 'xs' }, class: 'text-muted-foreground' }
      ]
    }
  };

  // ── 2. Merged backgrounds ───────────────────────────────────────
  // Check adjacent rows and their backgrounds merge into one rounded shape; the
  // merge morphs on the 160ms moderate spring. Start with a run
  // already selected so the merged shape is visible on load.
  const mergeSpec = {
    version: '1.0' as const,
    state: { build: ['ssd', 'ram'] },
    ui: {
      type: 'flex',
      props: { direction: 'column', gap: '14px' },
      children: [
        {
          type: 'text',
          props: { text: 'Check two neighbouring rows and their backgrounds merge into one shape. Hover that merged block: no second highlight paints inside it, because the hover highlight tracks unchecked rows only.', size: 'sm' },
          class: 'text-muted-foreground'
        },
        {
          type: 'checkbox-group',
          props: {
            label: 'Add to this build',
            options: [
              { value: 'gpu', label: 'Discrete GPU' },
              { value: 'ssd', label: '2 TB NVMe SSD' },
              { value: 'ram', label: '64 GB RAM' },
              { value: 'wifi', label: 'Wi-Fi 7 card' },
              { value: 'warranty', label: '3-year warranty' }
            ]
          },
          bind: 'build'
        },
        { type: 'text', props: { text: 'In your build: {state.build}', size: 'xs' }, class: 'text-muted-foreground' }
      ]
    }
  };

  // ── 3. States ───────────────────────────────────────────────────
  // A fully-disabled group, plus a group with one disabled row, so the disabled
  // affordance (no glide, no toggle, dimmed) is visible next to a live one.
  const statesSpec = {
    version: '1.0' as const,
    state: { plan: ['pro'] },
    ui: {
      type: 'grid',
      props: { columns: 2, gap: '24px' },
      children: [
        {
          type: 'checkbox-group',
          props: {
            label: 'Add-ons (one not on your plan)',
            options: [
              { value: 'pro', label: 'Priority support' },
              { value: 'sso', label: 'Single sign-on' },
              { value: 'audit', label: 'Audit log' },
              { value: 'sla', label: 'Custom SLA', disabled: true }
            ]
          },
          bind: 'plan'
        },
        {
          type: 'checkbox-group',
          props: {
            label: 'Archived workspace (read-only)',
            disabled: true,
            options: ['Billing', 'Members', 'Integrations']
          }
        }
      ]
    }
  };
</script>

<Showcase slug="checkbox-group" {nav}>
  {#snippet intro()}
    <p>
      The <code>checkbox-group</code> widget is a list of checkboxes bound to one array in state. A single background
      element glides between rows as you hover, on a fast 80ms spring, and neighbouring checked rows merge into one
      shape on a moderate 160ms spring. Each demo below is a <code>&lt;Ripple&gt;</code> spec.
    </p>
  {/snippet}

  <section id="glide" class="showcase-section">
    <h2 class="showcase-section-title">The gliding highlight</h2>
    <p class="section-caption">The fast spring, 80ms.</p>
    <div class="showcase-item">
      <div class="showcase-item-demo">
        <Ripple spec={glideSpec} />
      </div>
    </div>
  </section>

  <section id="merge" class="showcase-section">
    <h2 class="showcase-section-title">Merged backgrounds for neighbouring picks</h2>
    <p class="section-caption">The moderate spring, 160ms.</p>
    <div class="showcase-item">
      <div class="showcase-item-demo">
        <Ripple spec={mergeSpec} />
      </div>
    </div>
  </section>

  <section id="states" class="showcase-section">
    <h2 class="showcase-section-title">Disabled group and disabled row</h2>
    <div class="showcase-item">
      <div class="showcase-item-demo">
        <Ripple spec={statesSpec} />
      </div>
    </div>
  </section>
</Showcase>
