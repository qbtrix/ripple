<!-- src/lib/widgets/display/Kbd.svelte -->
<script lang="ts">
  import { cn } from '$lib/utils.js';

  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    keys: string | string[];
    separator?: string;
  }

  let { id, class: className, style, keys, separator = '+' }: Props = $props();

  const styleString = $derived(
    style ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
  );

  const list = $derived(Array.isArray(keys) ? keys : [keys]);

  const baseClass =
    // A keycap: 1px rim with a 2px darker bottom edge, one fixed height so a chord lines up.
    'inline-flex h-5 min-w-5 items-center justify-center px-1.5 rounded-[5px] border border-ripple-border border-b-2 border-b-ripple-track bg-ripple-surface text-[11px] font-mono leading-none text-ripple-surface-foreground';
</script>

<span {id} class={cn('inline-flex items-center gap-1', className)} style={styleString}>
  {#each list as key, i (i)}
    <kbd class={baseClass}>{key}</kbd>
    {#if i < list.length - 1}
      <span class="text-[11px] text-muted-foreground">{separator}</span>
    {/if}
  {/each}
</span>
