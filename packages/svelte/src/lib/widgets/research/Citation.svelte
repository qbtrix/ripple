<!--
  Citation.svelte — inline source citation chip.
  Modified: 2026-06-09 — a11y fix: bundle role/tabindex/onkeydown into a derived
  `interactive` spread so the element is a coherent keyboard-accessible button only
  when clickable (fixes a11y_no_noninteractive_tabindex). Recipe 2.
  Modified: 2026-06-27 — forward node id (bind id + data-ripple-node on the root)
  for editor selection (SP-0 id-forwarding codemod).
-->
<script lang="ts">
  import { safeUrl, safeStyle } from '@ripple-ui/core';
  import { cn } from '$lib/utils.js';
  import { nameTint } from '$lib/widgets/data-kit/tint.js';
  import { asText } from '$lib/widgets/text-coerce';

  interface Props {
    /** Spec node id, forwarded by NodeRenderer for editor selection. */
    id?: string;
    /** Source/publisher name */
    source: string;
    /** Letter-tile fill when there is no favicon (default: a tint from the source name) */
    color?: string;
    /** Favicon URL; without one the source's first letter shows in a small tile */
    favicon?: string;
    /** Optional superscript citation number */
    number?: number;
    /** Link URL */
    url?: string;
    class?: string;
    onclick?: (e?: unknown) => void;
  }

  let {
    id, source, color, favicon, number,
    url, class: className, onclick
  }: Props = $props();

  // Only a favicon the spec supplies: deriving one from the source name would
  // send every cited domain to an outside service, and CSPs block it anyway.
  const iconSrc = $derived(favicon);
  const letter = $derived(asText(source).trim().charAt(0).toUpperCase());
  const tileStyle = $derived(color ? `background:${color};color:#fff` : nameTint(asText(source)));
  let iconError = $state(false);

  const safeLink = $derived(safeUrl(url));
  const handler = $derived(onclick ?? (safeLink ? () => window.open(safeLink, '_blank', 'noopener,noreferrer') : undefined));
  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handler?.(e);
    }
  }
  const interactive = $derived(
    handler ? { role: 'button', tabindex: 0, onclick: handler, onkeydown: handleKey } : {}
  );
</script>

<span {id} data-ripple-node={id} class={cn('rcite', className)} {...interactive}>
  {#if iconSrc && !iconError}
    <img src={safeUrl(iconSrc, { kind: 'resource' })} alt="" class="rcite-favicon" onerror={() => iconError = true} />
  {:else if letter}
    <span class="rcite-letter" aria-hidden="true" style={safeStyle(tileStyle)}>{letter}</span>
  {/if}
  <span class="rcite-name">{source}{#if number != null}<sup class="rcite-num">{number}</sup>{/if}</span>
</span>

<style>
  .rcite {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 6px;
    border-radius: 4px;
    background: color-mix(in oklab, var(--muted) 50%, transparent);
    font-size: 11px;
    line-height: 1.4;
    vertical-align: baseline;
    white-space: nowrap;
    transition: background 0.15s;
  }
  .rcite[role='button'] {
    cursor: pointer;
  }
  .rcite[role='button']:hover {
    background: var(--muted);
  }
  .rcite-letter {
    display: inline-grid;
    place-items: center;
    width: 12px;
    height: 12px;
    border-radius: 3px;
    font-size: 8px;
    font-weight: 700;
    line-height: 1;
    flex-shrink: 0;
  }
  .rcite-favicon {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    flex-shrink: 0;
    object-fit: contain;
  }
  .rcite-name {
    color: var(--muted-foreground);
    font-weight: 500;
  }
  .rcite-num {
    font-size: 9px;
    color: var(--muted-foreground);
    margin-left: 1px;
    top: -0.4em;
  }
</style>
