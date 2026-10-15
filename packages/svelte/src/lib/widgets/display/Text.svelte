<!--
  Text.svelte: a paragraph (or inline span) of body copy. Every size uses the UI
  sans (--font-sans); monospace is for code only. Bare URLs become links that
  route through the host's navigate action when there is one. A short value
  does not shrink in a flex row, so it never wraps onto two lines.
-->
<script lang="ts">
  import { safeUrl } from '@ripple-ui/core';
  import { getContext } from 'svelte';
  import { cn } from '$lib/utils.js';
  import { asText } from '$lib/widgets/text-coerce';
  import { linkifySegments } from './linkify.js';
  import type { EventDispatcher } from '@ripple-ui/core';
  import type { StateManager } from '../../core/state-manager.svelte.js';

  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    text?: string;
    size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl';
    weight?: 'normal' | 'medium' | 'semibold' | 'bold';
    color?: string;
    inline?: boolean;
  }

  let {
    id, class: className, style, text = '', size = 'base',
    weight = 'normal', color, inline = false
  }: Props = $props();

  // Host wiring — present when rendered inside a Ripple tree, absent for
  // standalone widget usage. When present, URL clicks route through the
  // `navigate` action so the host decides how to open them (in paw the host
  // opens external URLs in the system browser). With no host, the plain
  // `<a target="_blank">` fallback takes over.
  const events = getContext<EventDispatcher | undefined>('ui-events');
  const stateManager = getContext<StateManager | undefined>('ui-state');

  // Bare URLs in the text become clickable links; plain text is unchanged.
  const segments = $derived(linkifySegments(text));

  function handleLinkClick(e: MouseEvent, url: string): void {
    // Leave modified / non-primary clicks to the browser so open-in-new-tab,
    // middle-click, and the right-click menu keep working via the `<a href>`.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!events) return; // no host — native <a target="_blank"> handles it
    e.preventDefault();
    void events.dispatch({ action: 'navigate', url }, { state: stateManager?.state ?? {} });
  }

  const sizeClasses: Record<string, string> = {
    xs: 'text-xs text-muted-foreground',
    sm: 'text-sm text-muted-foreground',
    base: 'text-sm text-foreground',
    lg: 'text-base text-foreground',
    xl: 'text-lg text-foreground',
    '2xl': 'text-xl text-foreground',
    '3xl': 'text-2xl text-foreground',
  };

  const weightClasses: Record<string, string> = {
    normal: 'font-normal',
    medium: 'font-medium',
    semibold: 'font-semibold',
    bold: 'font-bold',
  };

  const styleString = $derived.by(() => {
    const styles: string[] = [];
    // `color` is string-typed, but a binding can deliver a number — coerce
    // before .startsWith (which exists only on strings) so a non-string color
    // never crashes SSR/prerender. asText('') for null/undefined short-circuits
    // both checks to false, matching the prior optional-chaining behavior.
    const colorText = asText(color);
    if (colorText.startsWith('#') || colorText.startsWith('rgb')) {
      styles.push(`color:${colorText}`);
    }
    if (style) {
      styles.push(...Object.entries(style).map(([k, v]) => `${k}:${v}`));
    }
    return styles.length > 0 ? styles.join(';') : undefined;
  });

  // A short value ("12 events") keeps its width in a flex row instead of being
  // squeezed onto two lines; longer copy still wraps.
  const short = $derived(String(text ?? '').length <= 24 ? 'shrink-0' : undefined);

  const linkClass = 'text-primary underline underline-offset-2 hover:text-primary/80 break-words';
</script>

{#snippet body()}{#each segments as seg}{#if seg.url}{@const url = seg.url}<a href={safeUrl(url)} target="_blank" rel="noopener noreferrer" class={linkClass} onclick={(e) => handleLinkClick(e, url)}>{seg.text}</a>{:else}{seg.text}{/if}{/each}{/snippet}

{#if inline}
  <span {id} class={cn('m-0', short, sizeClasses[size], weightClasses[weight], className)} style={styleString}>{@render body()}</span>
{:else}
  <p {id} class={cn('m-0', short, sizeClasses[size], weightClasses[weight], className)} style={styleString}>{@render body()}</p>
{/if}
