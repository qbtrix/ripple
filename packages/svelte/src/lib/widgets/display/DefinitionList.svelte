<!--
  DefinitionList.svelte: term/definition pairs, inline (two columns) or
  stacked (term above). An empty definition renders a muted 'Not set', so its
  term never reads as an orphaned heading.
-->
<script lang="ts">
  import { cn } from '$lib/utils.js';

  interface Item {
    term: string;
    definition: string;
  }

  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    items?: Item[];
    /** Layout: "stacked" (term above definition) or "inline" (term/definition in two columns). */
    layout?: 'stacked' | 'inline';
  }

  let {
    id, class: className, style,
    items = [], layout = 'inline'
  }: Props = $props();

  const styleString = $derived(
    style ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
  );
</script>

{#snippet def(text: string)}
  {#if String(text ?? '').trim()}<dd>{text}</dd>{:else}<dd class="text-muted-foreground">Not set</dd>{/if}
{/snippet}

<dl
  {id}
  class={cn(
    'text-sm',
    layout === 'inline'
      ? 'grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2'
      : 'flex flex-col gap-3',
    className
  )}
  style={styleString}
>
  {#each items as item}
    {#if layout === 'inline'}
      <dt class="font-medium text-muted-foreground">{item.term}</dt>
      {@render def(item.definition)}
    {:else}
      <div class="flex flex-col gap-0.5">
        <dt class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.term}</dt>
        {@render def(item.definition)}
      </div>
    {/if}
  {/each}
</dl>
