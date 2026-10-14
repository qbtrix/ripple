<!-- src/lib/widgets/display/Progress.svelte
     Horizontal progress bar. The shadcn <Progress> wrapper forwards only
     value/max/class, so a display:contents element (no layout box) carries
     id + data-ripple-node for editor selection. With `label`, a row above the
     bar shows the label left and the percent right in tabular figures; without
     it the bar lays out exactly as a bare bar. -->
<script lang="ts">
  import { cn } from '$lib/utils.js';
  import { Progress } from '$lib/components/ui/progress/index.js';

  interface Props {
    id?: string;
    value?: number;
    max?: number;
    /** Bar color override */
    color?: string;
    /** Height variant */
    variant?: 'default' | 'thin' | 'thick';
    /** Optional label row above the bar (label left, percent right). */
    label?: string;
    class?: string;
    style?: Record<string, string>;
  }

  let {
    id, value = 0, max = 100, color, variant = 'default', label,
    class: className, style
  }: Props = $props();

  const variantClass = $derived({
    'default': '',
    'thin': 'h-0.5',
    'thick': 'h-2',
  }[variant]);

  const percent = $derived(
    max > 0 && Number.isFinite(value) ? Math.round(Math.min(100, Math.max(0, (value / max) * 100))) : 0
  );

  const styleString = $derived.by(() => {
    const s: string[] = [];
    if (color) s.push(`--progress-color:${color}`);
    if (style) s.push(...Object.entries(style).map(([k, v]) => `${k}:${v}`));
    return s.length > 0 ? s.join(';') : undefined;
  });
</script>

{#snippet bar()}
  <Progress
    {value}
    {max}
    class={cn(variantClass, color ? '[&_[data-slot=progress-indicator]]:bg-[var(--progress-color)]' : '', className)}
    style={styleString}
  />
{/snippet}

<!-- display:contents wrapper generates no layout box; it exists only to carry
     the node id for editor selection. A labelled bar gets one block box so the
     label row and the bar stay together inside a row layout. -->
<div {id} data-ripple-node={id} style="display: contents">
  {#if label}
    <div class="w-full min-w-0">
      <div class="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span class="min-w-0 truncate font-medium">{label}</span>
        <span class="shrink-0 tabular-nums text-muted-foreground">{percent}%</span>
      </div>
      {@render bar()}
    </div>
  {:else}
    {@render bar()}
  {/if}
</div>
