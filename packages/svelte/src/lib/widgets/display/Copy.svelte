<!-- src/lib/widgets/display/Copy.svelte
     Copy-to-clipboard atom: the value sits in a monospace code well (one line,
     truncated with the full text in a title) and the copy button is pinned to
     the well's right end, so a reader sees WHAT they copy, not a lone button.
     `label` names the button; it collapses to the icon under 360px container
     width so the value keeps the room. -->
<script lang="ts">
  import { cn } from '$lib/utils.js';
  import CopyIcon from '@lucide/svelte/icons/copy';
  import CheckIcon from '@lucide/svelte/icons/check';

  type Size = 'sm' | 'md';

  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    value: string;
    label?: string;
    size?: Size;
  }

  let { id, class: className, style, value, label, size = 'md' }: Props = $props();

  const styleString = $derived(
    style ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
  );

  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    return () => {
      if (timer) clearTimeout(timer);
    };
  });

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => (copied = false), 1500);
    } catch (e) {
      console.warn('[ripple/copy] clipboard write failed:', e);
    }
  }

  const sm = $derived(size === 'sm');
  const iconSize = $derived(sm ? 12 : 14);
</script>

<div
  {id}
  class={cn(
    '@container/copy flex w-full max-w-full min-w-0 items-center rounded-md border border-border bg-muted/60',
    sm ? 'h-8 gap-1 pl-2.5 pr-1' : 'h-9 gap-2 pl-3 pr-1',
    className
  )}
  style={styleString}
>
  <code
    class={cn('min-w-0 flex-1 truncate font-mono text-foreground', sm ? 'text-[12px]' : 'text-[13px]')}
    title={value}
  >{value}</code>
  <button
    type="button"
    class={cn(
      'inline-flex shrink-0 items-center gap-1.5 rounded text-muted-foreground transition-colors',
      'hover:bg-background hover:text-foreground active:scale-[0.97]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
      sm ? 'h-6 px-1.5 text-[11px]' : 'h-7 px-2 text-xs font-medium',
      copied && 'text-ripple-success-text hover:text-ripple-success-text'
    )}
    onclick={copy}
    aria-label={copied ? 'Copied' : (label ? `Copy ${label}` : 'Copy to clipboard')}
  >
    {#if copied}
      <CheckIcon size={iconSize} />
    {:else}
      <CopyIcon size={iconSize} />
    {/if}
    {#if label}
      <span class="hidden @[360px]/copy:inline">{copied ? 'Copied' : label}</span>
    {/if}
  </button>
</div>
