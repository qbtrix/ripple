<!-- 2026-06-27: forward node id — bind id + data-ripple-node on root for editor selection (SP-0 id-forwarding codemod). -->
<script lang="ts">
  import { safeStyle } from '@ripple-ui/core';
  import { cn } from '$lib/utils.js';

  interface Props {
    /** Spec node id, forwarded by NodeRenderer for editor selection. */
    id?: string;
    /** Callout title (optional) */
    title?: string;
    /** Body text */
    text: string;
    /** Variant determines left border color and icon */
    variant?: 'info' | 'success' | 'warning' | 'insight';
    class?: string;
  }

  let { id, title, text, variant = 'info', class: className }: Props = $props();

  const config: Record<string, { border: string; bg: string; icon: string }> = {
    info:    { border: 'var(--ripple-info)', bg: 'color-mix(in oklab, var(--ripple-info) 7%, transparent)', icon: 'i' },
    success: { border: 'var(--ripple-success)', bg: 'color-mix(in oklab, var(--ripple-success) 7%, transparent)',  icon: '\u2713' },
    warning: { border: 'var(--ripple-warning)', bg: 'color-mix(in oklab, var(--ripple-warning) 7%, transparent)', icon: '!' },
    insight: { border: 'var(--ripple-accent)', bg: 'color-mix(in oklab, var(--ripple-accent) 7%, transparent)', icon: '\u2726' },
  };

  const c = $derived(config[variant] ?? config.info);
</script>

<div
  {id}
  data-ripple-node={id}
  class={cn('rcall', className)}
  style={safeStyle(`border-left-color:${c.border}; background:${c.bg}`)}
>
  <span class="rcall-icon" style={safeStyle(`color:${c.border}`)}>{c.icon}</span>
  <div class="rcall-body">
    {#if title}
      <span class="rcall-title">{title}</span>
    {/if}
    <p class="rcall-text">{text}</p>
  </div>
</div>

<style>
  .rcall {
    display: flex;
    gap: 10px;
    padding: 10px 14px;
    border-left: 3px solid;
    border-radius: 0 8px 8px 0;
    align-items: flex-start;
  }
  .rcall-icon {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
    background: var(--background);
    border: 1.5px solid currentColor;
    margin-top: 1px;
  }
  .rcall-body {
    min-width: 0;
  }
  .rcall-title {
    display: block;
    font-size: 13px;
    font-weight: 700;
    color: var(--foreground);
    margin-bottom: 2px;
  }
  .rcall-text {
    font-size: 12px;
    line-height: 1.5;
    color: color-mix(in oklab, var(--foreground) 80%, transparent);
    margin: 0;
  }
</style>
