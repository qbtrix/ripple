<!--
  routes/ds/button/+page.svelte: the Button widget on /ds, rendered as a Svelte
  component: every variant and size, leading and trailing icons, a loading
  state you can trigger, disabled, full width, the link variant and a dialog
  style footer inside a Card.
-->
<script lang="ts">
  import Button from '$lib/widgets/input/Button.svelte';
  import Card from '$lib/widgets/layout/Card.svelte';
  import { Plus, ArrowRight, Trash2, Check, Settings } from '@lucide/svelte';
  import Showcase from '../Showcase.svelte';

  const nav = [
    { href: '#variants', label: 'Variants' },
    { href: '#sizes', label: 'Sizes' },
    { href: '#icons', label: 'Icons' },
    { href: '#loading', label: 'Loading' },
    { href: '#disabled', label: 'Disabled' },
    { href: '#full-width', label: 'Full width and link' },
    { href: '#in-card', label: 'In a card' }
  ];

  let isLoading = $state<boolean>(false);

  function handleLoadingClick() {
    isLoading = true;
    setTimeout(() => {
      isLoading = false;
    }, 1500);
  }
</script>

<Showcase slug="button" {nav}>
  {#snippet intro()}
    <p>
      The <code>button</code> widget runs an action when pressed. Pick a <code>variant</code> for its weight on the
      page and a <code>size</code>; add leading or trailing icons, a loading state while work runs, or
      <code>disabled</code> while it can't act.
    </p>
  {/snippet}

  <section id="variants" class="showcase-section">
    <h2 class="showcase-section-title">Variants</h2>
    <div class="showcase-item">
      <div class="showcase-item-demo">
        <div class="flex flex-wrap items-center gap-3">
          <Button variant="default" label="Default" />
          <Button variant="secondary" label="Secondary" />
          <Button variant="outline" label="Outline" />
          <Button variant="ghost" label="Ghost" />
          <Button variant="link" label="Link" />
          <Button variant="destructive" label="Destructive" />
        </div>
      </div>
    </div>
  </section>

  <section id="sizes" class="showcase-section">
    <h2 class="showcase-section-title">Sizes</h2>
    <div class="showcase-item">
      <div class="showcase-item-demo">
        <div class="flex flex-wrap items-center gap-3">
          <Button size="sm" label="Small" />
          <Button size="md" label="Medium" />
          <Button size="lg" label="Large" />
          <Button size="icon" aria-label="Add">
            {#snippet leading()}<Plus size={16} />{/snippet}
          </Button>
        </div>
        <p class="mt-2 text-xs text-muted-foreground">
          sm, md, lg and icon (icon only, so give it an aria-label)
        </p>
      </div>
    </div>
  </section>

  <section id="icons" class="showcase-section">
    <h2 class="showcase-section-title">Leading and trailing icons</h2>
    <div class="showcase-item">
      <div class="showcase-item-demo">
        <div class="flex flex-wrap items-center gap-3">
          <Button label="Add item">
            {#snippet leading()}<Plus size={16} />{/snippet}
          </Button>

          <Button label="Continue" variant="secondary">
            {#snippet trailing()}<ArrowRight size={16} />{/snippet}
          </Button>

          <Button label="Delete" variant="destructive">
            {#snippet leading()}<Trash2 size={16} />{/snippet}
            {#snippet trailing()}<ArrowRight size={16} />{/snippet}
          </Button>

          <Button label="Confirm" variant="outline">
            {#snippet leading()}<Check size={16} />{/snippet}
          </Button>

          <Button label="Settings" variant="ghost">
            {#snippet leading()}<Settings size={16} />{/snippet}
          </Button>
        </div>
      </div>
    </div>
  </section>

  <section id="loading" class="showcase-section">
    <h2 class="showcase-section-title">Loading</h2>
    <div class="showcase-item">
      <h3 class="showcase-item-title">Press it: the spinner runs for 1.5 seconds</h3>
      <div class="showcase-item-demo">
        <div class="flex items-center gap-4">
          <Button
            label="Save changes"
            loading={isLoading}
            onclick={handleLoadingClick}
          />
          <span class="text-xs text-muted-foreground">
            {isLoading ? 'Saving…' : 'Idle. Press the button.'}
          </span>
        </div>
      </div>
    </div>
  </section>

  <section id="disabled" class="showcase-section">
    <h2 class="showcase-section-title">Disabled, every variant</h2>
    <div class="showcase-item">
      <div class="showcase-item-demo">
        <div class="flex flex-wrap items-center gap-3">
          <Button variant="default" label="Default" disabled />
          <Button variant="secondary" label="Secondary" disabled />
          <Button variant="outline" label="Outline" disabled />
          <Button variant="ghost" label="Ghost" disabled />
          <Button variant="link" label="Link" disabled />
          <Button variant="destructive" label="Destructive" disabled />
        </div>
      </div>
    </div>
  </section>

  <section id="full-width" class="showcase-section">
    <h2 class="showcase-section-title">Full width and link</h2>
    <div class="grid-2">
      <div class="showcase-item">
        <h3 class="showcase-item-title">Full width (class="w-full")</h3>
        <div class="showcase-item-demo">
          <Button class="w-full" label="Get started" variant="default">
            {#snippet trailing()}<ArrowRight size={16} />{/snippet}
          </Button>
        </div>
      </div>

      <div class="showcase-item">
        <h3 class="showcase-item-title">Link variant</h3>
        <div class="showcase-item-demo">
          <div class="flex flex-col gap-2">
            <Button variant="link" label="Learn more" />
            <Button variant="link" label="View documentation">
              {#snippet trailing()}<ArrowRight size={14} />{/snippet}
            </Button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section id="in-card" class="showcase-section">
    <h2 class="showcase-section-title">In a card</h2>
    <div class="showcase-item">
      <h3 class="showcase-item-title">A dialog style footer: Cancel and Create</h3>
      <div class="showcase-item-demo">
        <div class="max-w-sm">
          <Card title="Create project" description="Name it and choose a template">
            <div class="flex justify-end gap-2">
              <Button variant="ghost" label="Cancel" />
              <Button variant="default" label="Create">
                {#snippet leading()}<Plus size={16} />{/snippet}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  </section>
</Showcase>
