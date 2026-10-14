<!-- GlassCard.svelte — Glass morphism container widget for Ripple.
     Created: Phase 4 of paw-os-ui migration.
     Extracted liquid glass CSS from paw-enterprise OS layout into a reusable widget.
     Props: opacity, blur, tint, borderGlow for full glass customization.
     Updated 2026-06-09 (a11y): optional onclick uses a conditional-spread so the
     card is a plain element with no handler and a keyboard-operable role="button"
     (Enter/Space) when one is passed. Replaces the dead svelte-ignore. -->
<script lang="ts">
  import { safeStyle } from '@ripple-ui/core';
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils.js';

  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    children?: Snippet;
    title?: string;
    description?: string;
    opacity?: number;    // Glass opacity 0-100, default 38
    blur?: number;       // Blur px, default 8
    tint?: string;       // Tint colour; without one the card is a light glass of the surface with surface ink
    borderGlow?: boolean; // Enable reflex border glow, default true
    onclick?: (e?: unknown) => void;
  }

  let {
    id, class: className, style, children, title, description,
    opacity = 38, blur = 8, tint, borderGlow = true, onclick
  }: Props = $props();

  const glassStyle = $derived.by(() => {
    const base: Record<string, string> = {
      'backdrop-filter': `blur(${blur}px) saturate(150%)`,
      '-webkit-backdrop-filter': `blur(${blur}px) saturate(150%)`,
      'border-radius': '12px',
    };
    // A supplied tint keeps the dark glass with white ink; the default is the surface's own glass.
    if (tint) {
      base['background-color'] = `color-mix(in srgb, ${tint} ${opacity}%, transparent)`;
      base['border'] = '1px solid rgba(255, 255, 255, 0.12)';
    }
    if (borderGlow) {
      base['box-shadow'] = [
        'inset 0 0 0 1px color-mix(in srgb, #fff 10%, transparent)',
        'inset 2px 1px 0px -1px color-mix(in srgb, #fff 30%, transparent)',
        'inset -1.5px -1px 0px -1px color-mix(in srgb, #fff 20%, transparent)',
        'inset -2px -6px 1px -5px color-mix(in srgb, #fff 40%, transparent)',
        'inset -1px 2px 3px -1px color-mix(in srgb, #000 20%, transparent)',
        '0px 3px 10px 0px color-mix(in srgb, #000 12%, transparent)',
      ].join(', ');
    }
    // Merge user style
    if (style) Object.assign(base, style);
    return safeStyle(Object.entries(base).map(([k, v]) => `${k}:${v}`).join(';'));
  });

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onclick?.(e); }
  }
  const interactive = $derived(
    onclick ? { role: 'button', tabindex: 0, onclick, onkeydown: handleKey } : {}
  );
</script>

<div {id} class={cn('ripple-glass-card', tint && 'glass-tinted', className)} style={glassStyle} {...interactive}>
  {#if title || description}
    <div class="glass-card-header">
      {#if title}
        <h3 class="glass-card-title">{title}</h3>
      {/if}
      {#if description}
        <p class="glass-card-desc">{description}</p>
      {/if}
    </div>
  {/if}
  <div class="glass-card-content">
    {@render children?.()}
  </div>
</div>

<style>
  .ripple-glass-card {
    background-color: color-mix(in oklab, var(--ripple-surface) 55%, white);
    border: 1px solid var(--ripple-border);
    color: var(--ripple-surface-foreground);
    overflow: hidden;
  }
  :global(.dark) .ripple-glass-card {
    background-color: color-mix(in oklab, var(--ripple-surface) 90%, white);
  }
  .glass-tinted { color: rgba(255, 255, 255, 0.92); }
  .glass-card-header {
    padding: 16px 16px 0;
  }
  .glass-card-title {
    font-size: 14px;
    font-weight: 600;
    color: inherit;
    margin: 0 0 4px;
  }
  .glass-card-desc {
    font-size: 12px;
    color: var(--ripple-muted-foreground);
    margin: 0;
    line-height: 1.4;
  }
  .glass-tinted .glass-card-desc { color: rgba(255, 255, 255, 0.6); }
  .glass-card-content {
    padding: 16px;
  }
</style>
