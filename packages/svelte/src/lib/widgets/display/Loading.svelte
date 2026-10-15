<!-- Loading.svelte: a spinner with a status label. A label the spec passes is
     shown (muted, centred under the spinner in the block form, beside it when
     inline); the built-in 'Loading…' default stays screen-reader only unless
     showLabel is set. The spinner stops under prefers-reduced-motion; the
     static glyph still reads as loading. -->
<script lang="ts">
  import { cn } from '$lib/utils.js';
  import LoaderIcon from '@lucide/svelte/icons/loader-2';

  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    size?: number;
    label?: string;
    inline?: boolean;
    showLabel?: boolean;
  }

  let {
    id, class: className, style,
    size = 16, label, inline = false, showLabel = label !== undefined && label !== ''
  }: Props = $props();

  const text = $derived(label || 'Loading…');

  const styleString = $derived(
    style ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
  );

  const wrapperClass = $derived(
    inline
      ? 'inline-flex items-center gap-2'
      : 'flex flex-col items-center justify-center gap-2 py-4 text-center'
  );
</script>

<span {id} class={cn(wrapperClass, className)} style={styleString} role="status" aria-live="polite">
  <LoaderIcon {size} class="animate-spin motion-reduce:animate-none text-muted-foreground" aria-hidden="true" />
  {#if showLabel}
    <span class="text-sm text-muted-foreground">{text}</span>
  {:else}
    <span class="sr-only">{text}</span>
  {/if}
</span>
