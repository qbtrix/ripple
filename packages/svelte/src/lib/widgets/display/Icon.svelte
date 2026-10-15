<!--
  src/lib/widgets/display/Icon.svelte: a lucide icon by kebab-case slug. An
  unknown slug renders an empty box of the same size. `resolveIcon` is the one
  slug lookup, exported so a widget can tell a known slug from an unknown one.
-->
<script lang="ts" module>
  import type { Component } from 'svelte';
  import * as iconMap from '@lucide/svelte';
  import { asText } from '$lib/widgets/text-coerce';

  // `name` is string-typed but a binding can deliver a non-string: coerce
  // before .split so the icon lookup never crashes the canvas.
  function pascalCase(slug: unknown): string {
    return asText(slug)
      .split(/[-_]/g)
      .filter(Boolean)
      .map((p) => p[0]?.toUpperCase() + p.slice(1).toLowerCase())
      .join('');
  }

  const lookup = iconMap as unknown as Record<string, Component>;

  /** The lucide component for a slug ("chevron-right"), or null when there is none. */
  export function resolveIcon(name: unknown): Component | null {
    if (!name) return null;
    const p = pascalCase(name);
    // Exact PascalCase first, then the "Icon" suffix variant (lucide v0 export style).
    return (p && (lookup[p] ?? lookup[`${p}Icon`])) || null;
  }
</script>

<script lang="ts">
  import { safeStyle } from '@ripple-ui/core';
  import { cn } from '$lib/utils.js';

  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    /** Lucide icon slug (kebab-case), e.g. "chevron-right". */
    name: string;
    size?: number;
    strokeWidth?: number;
    color?: string;
  }

  let { id, class: className, style, name, size = 16, strokeWidth = 2, color }: Props = $props();

  const styleString = $derived(
    style ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
  );

  const IconComponent = $derived(resolveIcon(name));
</script>

{#if IconComponent}
  <IconComponent {id} class={cn(className)} style={styleString} {size} {strokeWidth} {color} />
{:else}
  <span
    {id}
    class={cn('inline-block', className)}
    style={safeStyle(`width:${size}px;height:${size}px;${styleString ?? ''}`)}
    aria-hidden="true"
  ></span>
{/if}
