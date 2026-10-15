<!--
  SourcesBar.svelte: the "where did this come from" row at the foot of a
  research answer. Closed, one quiet row names the sources: a stack of up to
  three marks (+N pill), the count in words, then the names, ellipsized. Under
  480px of bar width the names drop to a second line under the count so the
  first name stays readable; marks, pill, count and chevron never shrink.
  Opened (native <details>, works with JavaScript off), a numbered list with
  name, domain and a new-tab link per source; past 5 sources it goes two
  columns once the bar itself is 640px wide (container query on the root).
  Domains ellipsize in the middle so the top-level part stays visible.

  Data rules (names, links, count, grammar) live in ./sources.ts; this file
  only lays them out. Marks are the shadcn Avatar primitives: a supplied
  favicon shows only once it loads, so a CSP-blocked or refused one keeps the
  initial on its name tint. `color` tints the mark, never fills it solid.

  Share and copy sit OUTSIDE <summary> (interactive content in a summary is
  invalid), anchored to the summary row's inline end. They report success only
  after the clipboard write resolves, through a polite live region and the
  ui-events toast. With `onclick` the summary is a plain button the host owns
  and there is no disclosure. The root forwards `id` as data-ripple-node.
-->
<script lang="ts">
  import { safeUrl, safeStyle } from '@ripple-ui/core';
  import type { EventDispatcher } from '@ripple-ui/core';
  import { getContext, tick } from 'svelte';
  import { cn } from '$lib/utils.js';
  import { uniqueKeys } from '$lib/utils/safe-props.js';
  import * as Avatar from '$lib/components/ui/avatar/index.js';
  import type { StateManager } from '$lib/core/state-manager.svelte.js';
  import { nameTint } from '$lib/widgets/data-kit/tint.js';
  import { num } from '$lib/widgets/data-kit/format.js';
  import { copyText, sourcesModel, summaryName, type SourceView } from './sources.js';
  import Share2Icon from '@lucide/svelte/icons/share-2';
  import CopyIcon from '@lucide/svelte/icons/copy';
  import CheckIcon from '@lucide/svelte/icons/check';
  import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
  import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';

  interface SourceRef {
    name: string;
    color?: string;
    favicon?: string;
    url?: string;
  }

  interface Props {
    /** Spec node id, forwarded by NodeRenderer for editor selection. */
    id?: string;
    /** Array of source references */
    sources: SourceRef[];
    /** Override display count (defaults to the listed sources) */
    count?: number;
    /** Label text (defaults to "source" / "sources") */
    label?: string;
    /** Show share action */
    share?: boolean;
    /** Show copy action */
    copy?: boolean;
    class?: string;
    onclick?: (e?: unknown) => void;
  }

  let {
    id, sources = [], count, label,
    share = true, copy = true, class: className, onclick
  }: Props = $props();

  const MARKS = 3;
  const model = $derived(sourcesModel(sources, count, label));
  const items = $derived(model.items);
  const keys = $derived(uniqueKeys(items, (s) => s.href ?? s.name));
  const marks = $derived(items.slice(0, MARKS));
  const plus = $derived(model.displayCount - marks.length);
  const names = $derived(items.map((s) => s.name).join(', '));
  const countText = $derived(`${num(model.displayCount)} ${model.label}`);
  const a11yName = $derived(summaryName(model, MARKS));
  const showShare = $derived(share !== false && items.length > 0);
  const showCopy = $derived(copy !== false && items.length > 0);
  const actions = $derived((showShare ? 1 : 0) + (showCopy ? 1 : 0));

  const eventDispatcher = getContext<EventDispatcher | undefined>('ui-events');
  const stateManager = getContext<StateManager | undefined>('ui-state');
  const streamPhase = getContext<(() => 'active' | 'done' | undefined) | undefined>('ui-streaming');
  const streaming = $derived(streamPhase?.() === 'active');

  let status = $state('');
  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  function markStyle(s: SourceView): string {
    const tint = nameTint(s.name);
    return s.color
      ? `${tint};background-color:color-mix(in oklab, ${s.color} 28%, var(--ripple-surface));color:var(--ripple-surface-foreground);box-shadow:inset 0 0 0 1px color-mix(in oklab, var(--ripple-surface-foreground) 30%, transparent)`
      : tint;
  }

  async function report(ok: boolean) {
    const message = ok ? 'Sources copied' : 'Could not copy sources';
    status = '';
    await tick();
    status = message;
    eventDispatcher?.dispatch(
      { action: 'toast', message, variant: ok ? 'success' : 'error' },
      { state: stateManager?.state ?? {} }, undefined
    );
  }

  async function handleCopy() {
    let ok = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyText(items));
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (ok) {
      copied = true;
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => (copied = false), 1500);
    }
    await report(ok);
  }

  async function handleShare() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ text: copyText(items) });
        return;
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return;
      }
    }
    await handleCopy();
  }
</script>

{#snippet mark(s: SourceView, size: 'md' | 'sm')}
  <Avatar.Root class={cn('after:hidden', size === 'md' ? 'size-5 ring-2 ring-ripple-surface not-first:-ms-1' : 'size-4')}>
    {#if safeUrl(s.favicon, { kind: 'resource' })}
      <Avatar.Image src={safeUrl(s.favicon, { kind: 'resource' })} alt="" class="bg-ripple-surface" />
    {/if}
    <Avatar.Fallback
      class={cn('font-semibold leading-none shadow-[inset_0_0_0_1px_var(--ripple-border)]', size === 'md' ? 'text-[10px]' : 'text-[9px]')}
      style={safeStyle(markStyle(s))}
    >{s.initial}</Avatar.Fallback>
  </Avatar.Root>
{/snippet}

{#snippet row(disclosure: boolean)}
  <span class="rsbar-stack" aria-hidden="true">
    {#each marks as s, i (keys[i])}{@render mark(s, 'md')}{/each}
    {#if plus > 0}<span class="rsbar-plus text-caption-2">+{num(plus)}</span>{/if}
  </span>
  <span class="rsbar-count text-body-emph">{countText}</span>
  <span class="rsbar-dot text-callout" aria-hidden="true">·</span>
  <span class="rsbar-names text-callout" aria-hidden="true">{names}</span>
  {#if disclosure}
    <span class="rsbar-chev" aria-hidden="true"><ChevronDownIcon size={14} /></span>
  {/if}
{/snippet}

<div {id} data-ripple-node={id} class={cn('rsbar', className)} data-actions={actions}>
  {#if items.length === 0 && streaming}
    <span class="rsbar-skeleton -space-x-1" aria-hidden="true"><span></span><span></span><span></span></span>
  {:else if items.length === 0}
    <p class="rsbar-empty text-callout">{model.countOnly ? countText : 'No sources'}</p>
  {:else if onclick}
    <button type="button" class="rsbar-summary" aria-label={a11yName} onclick={(e) => onclick?.(e)}>
      {@render row(false)}
    </button>
  {:else}
    <details class="rsbar-details">
      <summary class="rsbar-summary" aria-label={a11yName}>{@render row(true)}</summary>
      <ol class="rsbar-list" data-cols={items.length > 5 ? 2 : 1}>
        {#each items as s, i (keys[i])}
          <li>
            {#if s.href}
              {@const cut = Math.max(0, (s.host ?? '').lastIndexOf('.'))}
              <a class="rsbar-item rsbar-link" href={safeUrl(s.href, { kind: 'link' })} target="_blank" rel="noopener noreferrer" title={s.title}>
                <span class="rsbar-idx text-callout">{i + 1}</span>
                {@render mark(s, 'sm')}
                <span class="rsbar-name text-body">{s.name}<span class="sr-only">, {s.host} (opens in a new tab)</span></span>
                <!-- Split so the domain ellipsizes in the middle; read whole from the sr-only text above. -->
                <span class="rsbar-host text-callout" aria-hidden="true"><span class="rsbar-host-head">{(s.host ?? '').slice(0, cut || undefined)}</span>{cut ? (s.host ?? '').slice(cut) : ''}</span>
                <span class="rsbar-out" aria-hidden="true"><ArrowUpRightIcon size={12} /></span>
              </a>
            {:else}
              <span class="rsbar-item" title={s.title}>
                <span class="rsbar-idx text-callout">{i + 1}</span>
                {@render mark(s, 'sm')}
                <span class="rsbar-name text-body">{s.name}</span>
              </span>
            {/if}
          </li>
        {/each}
      </ol>
      {#if model.unlisted > 0}
        <p class="rsbar-more text-callout">and {num(model.unlisted)} more not listed</p>
      {/if}
    </details>
  {/if}

  {#if actions > 0}
    <div class="rsbar-actions">
      {#if showShare}
        <button type="button" class="rsbar-btn" aria-label="Share sources" title="Share sources" onclick={handleShare}>
          <Share2Icon size={14} aria-hidden="true" />
        </button>
      {/if}
      {#if showCopy}
        <button type="button" class="rsbar-btn" aria-label="Copy sources" title="Copy sources" onclick={handleCopy}>
          {#if copied}<CheckIcon size={14} aria-hidden="true" />{:else}<CopyIcon size={14} aria-hidden="true" />{/if}
        </button>
      {/if}
    </div>
  {/if}
  <span class="sr-only" role="status" aria-live="polite">{status}</span>
</div>

<style>
  .rsbar {
    --rsbar-row: 36px;
    container-type: inline-size;
    position: relative;
    inline-size: 100%;
    min-inline-size: 0;
    color: var(--ripple-surface-foreground);
  }

  /* The summary row: marks, count and actions keep their size; names shrink. */
  .rsbar-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-block-size: var(--rsbar-row);
    inline-size: 100%;
    padding: 0 4px;
    border: 0;
    border-radius: var(--ripple-radius);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
    user-select: none; /* a click otherwise parks a caret in the names and Chrome drops their ellipsis */
    list-style: none;
    transition: background-color 150ms var(--ripple-ease-out);
  }
  .rsbar-summary::-webkit-details-marker { display: none; }
  .rsbar-summary::marker { content: ''; }
  @media (hover: hover) {
    .rsbar-summary:hover { background: color-mix(in oklab, var(--ripple-track) 45%, transparent); }
  }
  .rsbar-summary:focus-visible,
  .rsbar-btn:focus-visible,
  .rsbar-link:focus-visible {
    outline: 2px solid var(--ripple-ring);
    outline-offset: 2px;
  }
  .rsbar[data-actions='1'] .rsbar-summary { padding-inline-end: 36px; }
  .rsbar[data-actions='2'] .rsbar-summary { padding-inline-end: 66px; }

  .rsbar-stack {
    display: inline-flex;
    align-items: center;
    flex: none;
    min-inline-size: max-content;
  }
  .rsbar-plus {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    block-size: 20px;
    min-inline-size: 20px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--ripple-track);
    color: var(--ripple-surface-foreground);
    box-shadow: 0 0 0 2px var(--ripple-surface);
    font-variant-numeric: tabular-nums;
    position: relative;
    margin-inline-start: -4px;
    flex: none;
  }

  .rsbar-count {
    flex: none;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .rsbar-names {
    flex: 0 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ripple-muted-foreground);
  }
  .rsbar-dot { flex: none; color: var(--ripple-muted-foreground); }
  .rsbar-chev {
    display: inline-flex;
    flex: none;
    color: var(--ripple-muted-foreground);
    transition: transform 150ms var(--ripple-ease-out);
  }
  .rsbar-details[open] .rsbar-chev { transform: rotate(180deg); }

  .rsbar-actions {
    position: absolute;
    inset-block-start: 0;
    inset-inline-end: 0;
    block-size: var(--rsbar-row);
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .rsbar-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 28px;
    block-size: 28px;
    border: 0;
    border-radius: calc(var(--ripple-radius) - 2px);
    background: transparent;
    color: var(--ripple-muted-foreground);
    cursor: pointer;
    transition: background-color 150ms var(--ripple-ease-out), color 150ms var(--ripple-ease-out);
  }
  /* 36px hit area on a 28px button; the last one stops at the bar's edge so nothing scrolls sideways. */
  .rsbar-btn::before { content: ''; position: absolute; inset: -4px; }
  .rsbar-btn:last-child::before { inset-inline-end: 0; }
  .rsbar-btn:hover { background: var(--ripple-track); color: var(--ripple-surface-foreground); }
  .rsbar-btn:active { transform: scale(0.96); }

  .rsbar-empty {
    display: flex;
    align-items: center;
    min-block-size: 32px;
    margin: 0;
    padding: 0 4px;
    color: var(--ripple-muted-foreground);
  }
  .rsbar-skeleton { display: inline-flex; align-items: center; block-size: var(--rsbar-row); padding: 0 4px; }
  .rsbar-skeleton > span {
    inline-size: 20px;
    block-size: 20px;
    border-radius: 999px;
    background: var(--ripple-track);
    box-shadow: 0 0 0 2px var(--ripple-surface);
  }

  /* Open list */
  .rsbar-list {
    margin: 2px 0 0;
    padding: 0;
    list-style: none;
    animation: rsbar-fade 150ms var(--ripple-ease-out);
  }
  .rsbar-list > li {
    break-inside: avoid;
    border-block-start: 1px solid var(--ripple-border);
  }
  .rsbar-item {
    display: flex;
    align-items: center;
    gap: 8px;
    min-block-size: 32px;
    padding: 0 4px;
    min-inline-size: 0;
    color: inherit;
    text-decoration: none;
    border-radius: calc(var(--ripple-radius) - 2px);
  }
  /* Linked row: the name keeps its full width while the domain still has 8ch;
     past that the name ellipsizes, so every row keeps a domain end like "re….org". */
  .rsbar-link {
    display: grid;
    grid-template-columns: auto auto minmax(0, max-content) minmax(8ch, 1fr) auto;
    column-gap: 8px;
    transition: background-color 150ms var(--ripple-ease-out);
  }
  .rsbar-link:hover,
  .rsbar-link:focus-visible { background: color-mix(in oklab, var(--ripple-track) 45%, transparent); }
  .rsbar-link:hover .rsbar-name,
  .rsbar-link:focus-visible .rsbar-name { color: var(--ripple-accent-text); }
  .rsbar-idx {
    flex: none;
    inline-size: 2ch;
    text-align: end;
    color: var(--ripple-muted-foreground);
    font-variant-numeric: tabular-nums;
  }
  .rsbar-name {
    position: relative;
    flex: 0 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rsbar-host {
    display: flex;
    justify-content: flex-end;
    min-inline-size: 0;
    white-space: nowrap;
    color: var(--ripple-muted-foreground);
  }
  .rsbar-host-head {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rsbar-out {
    display: inline-flex;
    flex: none;
    color: var(--ripple-muted-foreground);
  }
  .rsbar-more {
    margin: 0;
    padding: 6px 4px 2px calc(2ch + 12px);
    border-block-start: 1px solid var(--ripple-border);
    color: var(--ripple-muted-foreground);
  }

  /* Narrow bar: names take their own line under the count, running under the chevron. */
  @container (max-width: 479px) {
    .rsbar-summary {
      display: grid;
      grid-template-columns: auto 1fr auto;
      grid-template-areas: 'stack count chev' 'stack names names';
      column-gap: 8px;
      min-block-size: 44px;
      padding-block: 4px;
    }
    .rsbar-stack { grid-area: stack; }
    .rsbar-count { grid-area: count; }
    .rsbar-names { grid-area: names; }
    .rsbar-chev { grid-area: chev; }
    .rsbar-dot { display: none; }
    .rsbar-actions { block-size: 44px; }
  }
  @container (min-width: 640px) {
    .rsbar-list[data-cols='2'] { columns: 2; column-gap: 24px; }
  }

  @keyframes rsbar-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .rsbar-list { animation: none; }
    .rsbar-chev,
    .rsbar-summary,
    .rsbar-btn,
    .rsbar-link { transition: none; }
  }
</style>
