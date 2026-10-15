<!--
  OrgChart: "who reports to whom, and where does this person sit?"

  A summary line (`7 people · 3 levels`) over one of three layouts, picked by
  fit in org-chart-layout.ts from the measured body width (the data, not a
  breakpoint, sets how wide a chart is): `tree` (boxes and lines), `stacked`
  (an all-leaf team stacks in one column under its manager) and `list` (the
  indented outline, always fits; under 480px, past 24 people, or too wide).
  The root is the size container; the list's indent step grows at 480px.

  Tree connectors are CSS borders on nested ul/li, and every li gets the exact
  width the fit formula used, so stubs, bars and spines meet with no gap and a
  bar runs from the first child's centre to the last child's. The selected
  person's path from the root is the only accent: stubs, a bar overlay from the
  parent's centre to the child's, and the spine rows above it (`.oc-trail`).

  List rows are 44px; managers end with a direct-report count (`5 direct`,
  the number alone on a row too narrow to keep the name) and a chevron.
  Expansion is internal UI state, never written to the bound value. Indent
  stops after LIST_INDENT_CAP levels: deeper rows sit at their parent's
  indent, hang off its avatar column (`.oc-cap`) and lead with who they
  report to, so truncation eats the title, never the parent's name.

  Selection only when wired: with `onchange` (NodeRenderer passes it for
  `bind` or `on_change`) each person with an id is a button with aria-pressed
  and emits its original id; without it nothing hovers or takes focus.
  Avatars are display/Avatar (name tints, safe URLs, initials on failure).
-->
<script module lang="ts">
  // Public type, module scope so svelte-package emits it in the .d.ts.
  export type Node = {
    id: string | number;
    name: string;
    title?: string;
    avatar?: string;
    children?: Node[];
  };
</script>

<script lang="ts">
  import { safeStyle, safeUrl } from '@ripple-ui/core';
  import { prefersReducedMotion } from 'svelte/motion';
  import { quintOut } from 'svelte/easing';
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
  import { cn } from '$lib/utils.js';
  import Avatar from '../display/Avatar.svelte';
  import {
    CARD_W,
    LIST_INDENT_CAP,
    STACK_INDENT,
    defaultOpen,
    isStack,
    nodeWidth,
    normalize,
    pickMode,
    selectedPath,
    summary,
    type Person
  } from './org-chart-layout.js';

  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    /** Root node with nested children. */
    root?: Node | null;
    /** Selected node id. */
    value?: string | number | null;
    onchange?: (id: string | number) => void;
  }

  let { id, class: className, style, root = null, value = null, onchange }: Props = $props();

  const styleString = $derived(
    style ? safeStyle(Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';')) : undefined
  );

  const forest = $derived(normalize(root));
  const label = $derived(summary(forest));
  let bodyW = $state(0);
  const mode = $derived(pickMode(forest, bodyW));
  const chart = $derived(mode === 'list' ? null : mode);
  const interactive = $derived(typeof onchange === 'function');
  const path = $derived(selectedPath(forest, value));
  const selKey = $derived(path.at(-1));
  const onPath = $derived(new Set(path));
  const defaults = $derived(defaultOpen(forest, path));
  let toggled = $state<Record<string, boolean>>({});
  /** Row width under which the count drops its word to keep the name. */
  const COUNT_WORD_MIN = 250;
  const countWord = (level: number) =>
    bodyW - Math.min(level, LIST_INDENT_CAP) * (bodyW >= 480 ? 20 : 16) >= COUNT_WORD_MIN;
  const isOpen = (p: Person) => p.children.length > 0 && (toggled[p.key] ?? defaults.has(p.key));

  /** Index of the child on the selected path, or -1. */
  function pathChild(p: Person): number {
    if (!onPath.has(p.key) || p.key === selKey) return -1;
    return p.children.findIndex((c) => onPath.has(c.key));
  }

  /** Accent bar from the parent's centre to the on-path child's centre. */
  function barPath(p: Person, mode: 'tree' | 'stacked'): { left: number; width: number } | null {
    const at = pathChild(p);
    if (at < 0) return null;
    const widths = p.children.map((c) => nodeWidth(c, mode));
    const total = widths.reduce((a, b) => a + b, 0);
    const before = widths.slice(0, at).reduce((a, b) => a + b, 0);
    const from = total / 2;
    const to = before + widths[at] / 2;
    return from === to ? null : { left: Math.min(from, to), width: Math.abs(to - from) };
  }

  function srSuffix(p: Person, parent: string): string {
    const n = p.children.length;
    return (
      (parent ? `, reports to ${parent}` : '') +
      (n ? `, ${n} direct ${n === 1 ? 'report' : 'reports'}` : '') +
      (p.more ? `, ${p.more} more not shown` : '')
    );
  }

  function fullText(p: Person): string {
    return p.title ? `${p.name}, ${p.title}` : p.name;
  }

  /** Disclosure: height and opacity, 160ms; opacity only under reduced motion. */
  function reveal(node: HTMLElement) {
    const still = prefersReducedMotion.current;
    const h = node.offsetHeight;
    return {
      duration: still ? 0 : 160,
      easing: quintOut,
      css: (t: number) => `overflow:hidden;height:${t * h}px;opacity:${t}`
    };
  }
</script>

{#snippet avatar(p: Person, size: string)}
  <span class="contents" aria-hidden="true">
    <Avatar
      src={safeUrl(p.avatar, { kind: 'resource' })}
      alt={p.unnamed ? '' : p.name}
      class={cn(size, 'shrink-0 [&_[data-slot=avatar-fallback]]:text-[11px]')}
    />
  </span>
{/snippet}

{#snippet card(p: Person, parent: string)}
  {@const sel = p.key === selKey}
  {#snippet body()}
    {@render avatar(p, 'size-8')}
    <span class={cn('oc-clamp text-body-emph', p.unnamed && 'italic text-ripple-muted-foreground')}>{p.name}</span>
    {#if p.title}<span class="oc-clamp text-callout text-ripple-muted-foreground">{p.title}</span>{/if}
    <span class="sr-only">{srSuffix(p, parent)}</span>
  {/snippet}
  {#if interactive && p.id !== undefined}
    <button
      type="button"
      class="oc-card oc-hit"
      class:oc-sel={sel}
      aria-pressed={sel}
      title={fullText(p)}
      onclick={() => onchange?.(p.id as string | number)}>{@render body()}</button
    >
  {:else}
    <div class="oc-card" class:oc-sel={sel} title={fullText(p)}>{@render body()}</div>
  {/if}
{/snippet}

{#snippet tnode(p: Person, parent: string, m: 'tree' | 'stacked')}
  {@const at = pathChild(p)}
  <li class="oc-tli" class:oc-on={onPath.has(p.key)} style:width="{nodeWidth(p, m)}px">
    {@render card(p, parent)}
    {#if m === 'stacked' && isStack(p)}
      <ul class="oc-rail oc-stack">
        {#each p.children as c, i (c.key)}
          <li class:oc-through={i < at}>
            {#if i === at}<span class="oc-trail" aria-hidden="true"></span>{/if}
            {@render card(c, p.name)}
          </li>
        {/each}
      </ul>
    {:else if p.children.length}
      {@const bar = barPath(p, m)}
      <ul class="oc-kids" class:oc-on={at >= 0}>
        {#if bar}
          <span class="oc-barpath" aria-hidden="true" style:left="{bar.left}px" style:width="{bar.width}px"></span>
        {/if}
        {#each p.children as c (c.key)}{@render tnode(c, p.name, m)}{/each}
      </ul>
    {/if}
  </li>
{/snippet}

{#snippet lnode(p: Person, parent: string, level: number, rail: 0 | 1 | 2)}
  {@const sel = p.key === selKey}
  {@const open = isOpen(p)}
  {@const at = pathChild(p)}
  {@const deep = level > LIST_INDENT_CAP}
  {@const meta = deep && parent ? (p.title ? `Reports to ${parent} · ${p.title}` : `Reports to ${parent}`) : p.title}
  <li class:oc-through={rail === 1}>
    {#if rail === 2}<span class="oc-trail" aria-hidden="true"></span>{/if}
    <div class="oc-row" class:oc-sel={sel}>
      {#snippet body()}
        {@render avatar(p, 'size-7')}
        <span class="flex min-w-0 flex-1 flex-col">
          <span class={cn('truncate text-body-emph', p.unnamed && 'italic text-ripple-muted-foreground')}>{p.name}</span>
          {#if meta}<span class="truncate text-callout text-ripple-muted-foreground">{meta}</span>{/if}
          <span class="sr-only">{srSuffix(p, parent)}</span>
        </span>
      {/snippet}
      {#if interactive && p.id !== undefined}
        <button
          type="button"
          class="oc-pick oc-hit"
          aria-pressed={sel}
          title={fullText(p)}
          onclick={() => onchange?.(p.id as string | number)}>{@render body()}</button
        >
      {:else}
        <div class="oc-pick" title={fullText(p)}>{@render body()}</div>
      {/if}
      {#if p.children.length}
        <span class="oc-count text-callout tabular-nums" aria-hidden="true">{p.children.length}{#if countWord(level)}{' direct'}{/if}</span>
        <button
          type="button"
          class="oc-disc"
          aria-expanded={open}
          aria-label="{p.name}'s reports"
          onclick={() => (toggled[p.key] = !open)}
        >
          <ChevronRightIcon class="oc-chev size-4" aria-hidden="true" />
        </button>
      {/if}
    </div>
    {#if p.more}
      <p class="oc-more text-callout text-ripple-muted-foreground">+{p.more} more</p>
    {/if}
    {#if open}
      <ul class={cn('oc-sub', level < LIST_INDENT_CAP ? 'oc-rail' : 'oc-cap')} transition:reveal>
        {#each p.children as c, i (c.key)}
          {@render lnode(c, p.name, level + 1, level < LIST_INDENT_CAP ? (i < at ? 1 : i === at ? 2 : 0) : 0)}
        {/each}
      </ul>
    {/if}
  </li>
{/snippet}

<div
  {id}
  data-ripple-node={id}
  class={cn('oc @container w-full min-w-0', className)}
  style={styleString}
  style:--oc-card="{CARD_W}px"
  style:--oc-stack="{STACK_INDENT}px"
>
  {#if forest.length === 0}
    <p class="flex h-16 items-center justify-center text-callout text-ripple-muted-foreground">No people to show</p>
  {:else}
    <p class="mb-3 text-callout text-ripple-muted-foreground tabular-nums">{label}</p>
    <div class="w-full min-w-0" bind:clientWidth={bodyW}>
      {#if chart}
        <ul class="oc-tree">
          {#each forest as p (p.key)}{@render tnode(p, '', chart)}{/each}
        </ul>
      {:else}
        <ul class="oc-list">
          {#each forest as p (p.key)}{@render lnode(p, '', 0, 0)}{/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

<style>
  .oc {
    --oc-line: var(--ripple-control-border);
    --oc-accent: var(--ripple-accent);
  }
  :where(.oc) ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  :where(.oc) li {
    position: relative;
  }

  /* Chart: every li is exactly the width the fit formula used. */
  .oc-tree {
    display: flex;
    justify-content: center;
  }
  .oc-tli {
    display: flex;
    flex: none;
    flex-direction: column;
    align-items: center;
  }
  .oc-card {
    position: relative;
    z-index: 2;
    display: flex;
    width: var(--oc-card);
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px 12px;
    border: 1px solid var(--ripple-border);
    border-radius: calc(var(--ripple-radius) - 2px);
    background: transparent;
    text-align: center;
    color: inherit;
    font: inherit;
  }
  .oc-clamp {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
    max-width: 100%;
  }

  /* Tree connectors: a 12px stub down from the parent (ul::before), a bar made
     of each child's two halves, a 12px stub into each child (li::after). The
     first child has no left half and the last no right half, so the bar runs
     centre to centre; an only child is one straight 24px line. */
  .oc-kids {
    position: relative;
    display: flex;
    padding-top: 12px;
  }
  .oc-kids::before {
    content: '';
    position: absolute;
    top: 0;
    left: 50%;
    height: 12px;
    border-left: 1px solid var(--oc-line);
  }
  .oc-kids > li {
    padding-top: 12px;
  }
  .oc-kids > li::before,
  .oc-kids > li::after {
    content: '';
    position: absolute;
    top: 0;
    width: 50%;
    height: 12px;
    border-top: 1px solid var(--oc-line);
  }
  .oc-kids > li::before {
    right: 50%;
  }
  .oc-kids > li::after {
    left: 50%;
    border-left: 1px solid var(--oc-line);
  }
  .oc-kids > li:first-child::before,
  .oc-kids > li:last-child::after {
    border-top: 0;
  }
  .oc-kids.oc-on::before,
  .oc-kids > li.oc-on::after {
    border-left-color: var(--oc-accent);
  }
  .oc-barpath {
    position: absolute;
    z-index: 1;
    top: 12px;
    border-top: 1px solid var(--oc-accent);
  }

  /* Rails: a spine with an elbow into each row, shared by the stacked column
     and the list. --oc-x is the spine's offset from the li, --oc-mid the
     elbow's height. .oc-through accents a whole segment, .oc-trail draws the
     accented spine and elbow down to the on-path row. */
  .oc-rail > li::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: var(--oc-x);
    border-left: 1px solid var(--oc-line);
  }
  .oc-rail > li:last-child::before {
    bottom: auto;
    height: calc(var(--oc-mid) + 1px);
  }
  .oc-rail > li::after {
    content: '';
    position: absolute;
    top: var(--oc-mid);
    left: var(--oc-x);
    width: var(--oc-elbow);
    border-top: 1px solid var(--oc-line);
  }
  .oc-rail > li.oc-through::before {
    border-left-color: var(--oc-accent);
  }
  .oc-trail {
    position: absolute;
    z-index: 1;
    top: 0;
    left: var(--oc-x);
    width: var(--oc-elbow);
    height: calc(var(--oc-mid) + 1px);
    border-left: 1px solid var(--oc-accent);
    border-bottom: 1px solid var(--oc-accent);
  }
  /* Stacked column: the manager's card is centred in a li one indent wider,
     the spine hangs 8px inside the card's left edge, the cards sit one
     indent right of the manager's. */
  .oc-stack {
    align-self: stretch;
    padding-left: calc(var(--oc-stack) * 2);
    --oc-x: calc(var(--oc-stack) / -2);
    --oc-elbow: calc(var(--oc-stack) / 2);
    --oc-mid: calc(50% + 4px);
  }
  .oc-stack > li {
    padding-top: 8px;
  }

  /* List */
  .oc-list {
    --oc-i: 16px;
    --oc-g: 12px;
  }
  @container (min-width: 480px) {
    .oc-list {
      --oc-i: 20px;
      --oc-g: 14px;
    }
  }
  .oc-sub.oc-rail {
    padding-left: var(--oc-i);
    --oc-x: calc(var(--oc-g) - var(--oc-i));
    /* Ends on the avatar's edge: row border 1px + pick padding 8px. */
    --oc-elbow: calc(var(--oc-i) - var(--oc-g) + 9px);
    --oc-mid: 22px;
  }
  /* Past the indent cap: a stub in the avatar column (border 1 + padding 8 +
     half of 28) from the parent's avatar down to each child's; the rows paint
     over it, so it shows only in the gaps between avatars. */
  .oc-cap > li::before {
    content: '';
    position: absolute;
    z-index: 1;
    top: -8px;
    bottom: 0;
    left: 22.5px;
    border-left: 1px solid var(--oc-line);
  }
  .oc-cap > li:last-child::before {
    bottom: auto;
    height: 16px;
  }
  .oc-row {
    position: relative;
    z-index: 2;
    display: flex;
    height: 44px;
    align-items: center;
    border: 1px solid transparent;
    border-radius: calc(var(--ripple-radius) - 2px);
  }
  .oc-pick {
    display: flex;
    height: 100%;
    min-width: 0;
    flex: 1;
    align-items: center;
    gap: 10px;
    padding: 0 8px;
    border-radius: inherit;
    text-align: left;
    color: inherit;
    font: inherit;
  }
  .oc-count {
    flex: none;
    padding-left: 4px;
    color: var(--ripple-muted-foreground);
  }
  .oc-disc {
    display: grid;
    flex: none;
    width: 36px;
    height: 100%;
    place-items: center;
    border-radius: inherit;
    color: var(--ripple-muted-foreground);
  }
  .oc-disc :global(.oc-chev) {
    transition: transform 160ms var(--ripple-ease-out);
  }
  .oc-disc[aria-expanded='true'] :global(.oc-chev) {
    transform: rotate(90deg);
  }
  .oc-more {
    padding: 4px 8px 6px calc(var(--oc-i) + 8px);
  }

  /* States: hover only where something listens; selection is the accent. */
  .oc-hit,
  .oc-disc {
    cursor: pointer;
  }
  .oc-card.oc-hit:not(.oc-sel):hover,
  .oc-row:not(.oc-sel):has(.oc-hit:hover),
  .oc-disc:hover {
    background: color-mix(in oklab, var(--ripple-track) 45%, transparent);
  }
  .oc-card.oc-sel,
  .oc-row.oc-sel {
    border-color: var(--oc-accent);
    box-shadow: 0 0 0 0.5px var(--oc-accent);
    background: color-mix(in oklab, var(--ripple-accent) 8%, var(--ripple-surface));
  }
  .oc-hit:focus-visible,
  .oc-disc:focus-visible {
    outline: 2px solid var(--ripple-ring);
    outline-offset: -2px;
  }
  .oc-card.oc-hit:focus-visible {
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .oc-disc :global(.oc-chev) {
      transition: none;
    }
  }
</style>
