<!--
  routes/ds/feature/+page.svelte: the feature-page parts on /ds. PageHeader
  (leading, actions, toolbar, both title sizes, titleTrailing), Segmented
  option counts, class and leading dots, EmptyState (sizes, error tone, icon,
  actions), InlineAlert (four tones, actions, dismiss, role override), Search
  in filter mode, the success and warning Badge variants, Dialog.Content
  overlayClass, PanelHeader closeTitle, and the Label and Textarea primitives.
  Imports from `$lib/ui` and `$lib/primitives` directly, like a hand-written
  caller. Demo sources are fictional (Brightline, Corvo).
-->
<script lang="ts">
  import { PageHeader, EmptyState, InlineAlert, Segmented, Search, PanelHeader, Dialog } from '$lib/ui/index.js';
  import { Button, Label, Textarea, Badge } from '$lib/primitives/index.js';
  import BotIcon from '@lucide/svelte/icons/bot';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import Showcase from '../Showcase.svelte';

  let source = $state('all');
  let dense = $state(false);
  let dismissed = $state<string[]>([]);
  let bio = $state('');
  let log = $state('');
  let filter = $state('');
  let category = $state('all');
  let dialogOpen = $state(false);
  const nav = [
    { href: '#page-header', label: 'Page header' },
    { href: '#empty-states', label: 'Empty states' },
    { href: '#alerts', label: 'Inline alerts' },
    { href: '#fields', label: 'Fields' },
    { href: '#filters', label: 'Filters and dialog' }
  ];
  const dots: Record<string, string> = { chat: 'bg-ripple-info', tool: 'bg-ripple-warning', error: 'bg-ripple-error' };
  const tones = ['info', 'success', 'warning', 'error'] as const;
  const copy: Record<(typeof tones)[number], [string, string]> = {
    info: ['Syncing calendars', 'Events from Brightline Calendar appear in a minute or two.'],
    success: ['Agent saved', 'Changes apply to the next run.'],
    warning: ['Token expires soon', 'Reconnect Corvo Meet before Friday to keep recordings.'],
    error: ['Could not load meetings', 'The server did not answer. Your data is safe.'],
  };
</script>

<Showcase slug="feature" {nav}>
  {#snippet intro()}
    <p>
      Svelte components for the top and the edge cases of a feature page: <code>PageHeader</code> with actions and a
      toolbar, <code>EmptyState</code>, <code>InlineAlert</code>, form fields, a filter search, badges, a segmented
      control with dots and a <code>Dialog</code>. Import them from <code>@ripple-ui/svelte/ui</code> and
      <code>@ripple-ui/svelte/primitives</code>.
    </p>
  {/snippet}

  <div class="space-y-10 text-foreground">
  <section id="page-header" class="space-y-3">
    <h2 class="showcase-section-title">Page header</h2>
    <label class="flex items-center gap-2 text-sm text-muted-foreground">
      <input type="checkbox" bind:checked={dense} /> Compact header for dense tool pages (size="sm")
    </label>
    <PageHeader title="Meetings" subtitle="Recordings, notes and live calls" size={dense ? 'sm' : 'md'}>
      {#snippet leading()}
        <span class="inline-flex size-9 items-center justify-center rounded-ripple bg-ripple-accent/10 text-ripple-accent"><BotIcon size={18} /></span>
      {/snippet}
      {#snippet titleTrailing()}<Badge variant="warning">Beta</Badge>{/snippet}
      {#snippet actions()}
        <Button size="sm" onclick={() => (log = 'new meeting')}><PlusIcon size={14} /> New meeting</Button>
      {/snippet}
      {#snippet toolbar()}
        <div class="w-full max-w-64"><Search placeholder="Search meetings" /></div>
        <Segmented
          size="sm"
          value={source}
          options={[
            { value: 'all', label: 'All', badge: 24 },
            { value: 'recorded', label: 'Recorded', badge: 9 },
            { value: 'live', label: 'Live', badge: 0 },
          ]}
          onchange={(v) => (source = String(v))}
        />
      {/snippet}
    </PageHeader>
  </section>

  <section id="empty-states" class="space-y-3">
    <h2 class="showcase-section-title">Empty states</h2>
    <div class="grid gap-4 md:grid-cols-3">
    <EmptyState title="No agents yet" description="Create one, or import one from a file.">
      {#snippet icon()}<BotIcon size={20} />{/snippet}
      {#snippet actions()}
        <Button size="sm" onclick={() => (log = 'create agent')}>Create agent</Button>
        <Button size="sm" variant="outline" onclick={() => (log = 'import agent')}>Import</Button>
      {/snippet}
    </EmptyState>
    <EmptyState size="sm" icon="search" title="No matches" description="Try a shorter search." />
    <EmptyState tone="error" title="Could not load agents" description="Check your connection and try again.">
      {#snippet actions()}
        <Button size="sm" variant="outline" onclick={() => (log = 'retry')}>Retry</Button>
      {/snippet}
    </EmptyState>
    </div>
  </section>

  <section id="alerts" class="max-w-xl space-y-2">
    <h2 class="showcase-section-title">Inline alerts</h2>
    {#each tones as tone (tone)}
      {#if !dismissed.includes(tone)}
        {#if tone === 'error'}
          <InlineAlert {tone} title={copy[tone][0]} description={copy[tone][1]} ondismiss={() => (dismissed = [...dismissed, tone])}>
            {#snippet actions()}
              <Button size="xs" variant="outline" onclick={() => (log = 'retry meetings')}>Retry</Button>
            {/snippet}
          </InlineAlert>
        {:else}
          <InlineAlert {tone} title={copy[tone][0]} description={copy[tone][1]} ondismiss={() => (dismissed = [...dismissed, tone])} />
        {/if}
      {/if}
    {/each}
    {#if dismissed.length}
      <button type="button" class="text-sm underline" onclick={() => (dismissed = [])}>Show dismissed alerts</button>
    {/if}
  </section>

  <section id="fields" class="max-w-xl space-y-2">
    <h2 class="showcase-section-title">Label and textarea</h2>
    <Label for="demo-bio">Agent instructions</Label>
    <Textarea id="demo-bio" placeholder="What should this agent do?" bind:value={bio} />
    <p class="text-[12px] text-muted-foreground">{bio.length} characters</p>
  </section>

  <section id="filters" class="max-w-xl space-y-3" data-demo="filters-and-dialog">
    <h2 class="showcase-section-title">Filters, badges and a dialog</h2>
    <Search
      mode="filter"
      aria-label="Filter activity"
      autocomplete="off"
      spellcheck={false}
      placeholder="Filter activity"
      value={filter}
      oninput={(q) => (filter = q)}
    />
    <InlineAlert tone="warning" role="status" title="Paste can't be read" description="A warning that does not interrupt: it uses role=status, so screen readers announce it politely." />
    <div class="flex gap-2">
      <Badge variant="success">Live</Badge>
      <Badge variant="warning">Expiring</Badge>
      <Badge variant="destructive">Failed</Badge>
    </div>
    <Segmented
      size="sm"
      value={category}
      options={[
        { value: 'all', label: 'All' },
        { value: 'chat', label: 'Chat' },
        { value: 'tool', label: 'Tools' },
        { value: 'error', label: 'Errors', class: 'text-ripple-error-text' },
      ]}
      onchange={(v) => (category = String(v))}
    >
      {#snippet leading(opt)}
        {#if dots[String(opt.value)]}<span aria-hidden="true" class="size-1.5 rounded-full {dots[String(opt.value)]}"></span>{/if}
      {/snippet}
    </Segmented>
    <div class="overflow-hidden rounded-ripple ring-1 ring-ripple-border">
      <PanelHeader title="Thread" subtitle="3 replies" closeTitle="Close (Esc)" onclose={() => (log = 'close thread')} />
    </div>
    <Button size="sm" variant="outline" onclick={() => (dialogOpen = true)}>Open a stacked dialog</Button>
    <Dialog.Root bind:open={dialogOpen}>
      <Dialog.Content class="z-[100]" overlayClass="z-[100]">
        <Dialog.Title>Stacked dialog</Dialog.Title>
        <Dialog.Description>The dialog and its backdrop take an extra class (here z-[100]) so they stack above other overlays.</Dialog.Description>
      </Dialog.Content>
    </Dialog.Root>
  </section>

  <p class="event-log" aria-live="polite">Last action: {log || 'none yet. Press a button above.'}</p>
  </div>
</Showcase>
