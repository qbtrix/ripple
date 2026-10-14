<!--
  src/lib/widgets/display/Chip.svelte
  origin: slev12397/beautiful-ui@ff0f74d components/atoms/Chip.tsx

  A tag (registered as both `chip` and `tag`). Source geometry: rounded-md,
  tight padding, 11/12px medium, borderless tint that carries the tone. Text
  uses the readable -text tokens (accent and status), never a fill token.
  Not a code token: the source's monospace identity stays with Code and Kbd.

  A closable chip's X is its own small square hit area with a hover wash, so
  it reads as "remove" and never fires the body click. A long label wraps
  inside the card. With no children and no
  label (after coercing numbers) the chip renders nothing, so a bad spec
  never leaves an empty tint or a bare X. The children branch gates on
  `children` alone; NodeRenderer passes it only when the node has kids.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils.js';
  import XIcon from '@lucide/svelte/icons/x';
  import { asText } from '$lib/widgets/text-coerce';

  type Variant = 'default' | 'primary' | 'success' | 'warning' | 'destructive';
  type Size = 'sm' | 'md';

  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    label?: string;
    variant?: Variant;
    size?: Size;
    closable?: boolean;
    onclose?: () => void;
    /** Body click — wired by NodeRenderer when spec uses `on_click`. */
    onclick?: (e: MouseEvent) => void;
    children?: Snippet;
    hasChildren?: boolean;
  }

  let {
    id, class: className, style, label,
    variant = 'default', size = 'md', closable = false, onclose, onclick,
    children, hasChildren = false
  }: Props = $props();

  const styleString = $derived(
    style ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
  );

  // Bindings deliver numbers as readily as strings; `42` is a label, '' is not.
  const text = $derived(asText(label));

  // Borderless tints, per the source. The accent tint takes
  // text-ripple-accent-text: the raw accent is a fill (3 to 4:1 as text on
  // these tints), and --ripple-accent-foreground is the on-fill colour (white
  // on a 10% tint). The -text token reaches 4.5:1 on every ground, at rest
  // and under the hover wash.
  const variantClass = $derived(
    variant === 'primary' ? 'bg-ripple-accent/10 text-ripple-accent-text'
    : variant === 'success' ? 'bg-ripple-success/10 text-ripple-success-text'
    : variant === 'warning' ? 'bg-ripple-warning/10 text-ripple-warning-text'
    : variant === 'destructive' ? 'bg-ripple-error/10 text-ripple-error-text'
    : 'bg-ripple-muted text-ripple-muted-foreground'
  );

  const sizeClass = $derived(
    size === 'sm' ? 'text-[11px] px-1.5 py-0.5 gap-1' : 'text-[12px] px-2 py-0.5 gap-1.5'
  );
  // The X sits in the right padding, so the chip keeps its outer rhythm.
  const closeClass = $derived(
    cn(
      'inline-grid shrink-0 place-items-center rounded-[4px] p-0.5 opacity-70 transition-[opacity,background-color] duration-150 ease-ripple-out',
      'hover:opacity-100 hover:bg-current/15 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ripple-ring',
      size === 'sm' ? '-my-0.5 -mr-1' : '-my-0.5 -mr-1.5'
    )
  );
  const base = 'inline-flex max-w-full min-w-0 items-center rounded-md font-medium leading-[1.25] text-left [overflow-wrap:anywhere]';
  const show = $derived(!!children || text.trim() !== '');

  const iconSize = $derived(size === 'sm' ? 10 : 12);
</script>

{#if !show}
  <!-- No label and no children: nothing to show. -->
{:else if onclick}
  <button
    type="button"
    {id}
    onclick={(e) => {
      // Don't fire body click when the close X is clicked.
      if ((e.target as HTMLElement).closest('[data-chip-close]')) return;
      onclick?.(e);
    }}
    class={cn(
      base, 'cursor-pointer transition-colors duration-150 ease-ripple-out hover:brightness-95',
      variantClass, sizeClass, className
    )}
    style={styleString}
  >
    {#if children}
      {@render children()}
    {:else}
      <span class="min-w-0">{text}</span>
    {/if}
    {#if closable}
      <span
        role="button"
        tabindex="-1"
        data-chip-close
        class={closeClass}
        aria-label={text ? `Remove ${text}` : 'Remove'}
        onclick={(e) => { e.stopPropagation(); onclose?.(); }}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onclose?.(); } }}
      >
        <XIcon size={iconSize} />
      </span>
    {/if}
  </button>
{:else}
  <span
    {id}
    class={cn(base, variantClass, sizeClass, className)}
    style={styleString}
  >
    {#if children}
      {@render children()}
    {:else}
      <span class="min-w-0">{text}</span>
    {/if}
    {#if closable}
      <button
        type="button"
        class={closeClass}
        aria-label={text ? `Remove ${text}` : 'Remove'}
        onclick={() => onclose?.()}
      >
        <XIcon size={iconSize} />
      </button>
    {/if}
  </span>
{/if}
