<!--
  @file routes/docs/OpenIn.svelte
  @description The docs page's "Open in" dropdown, next to Copy page / Copy for
    your model / View as Markdown: a disclosure button and a list of links that
    open a new chat in Claude, ChatGPT or PocketPaw, already asked to read this
    page's markdown (open-in.ts). Links open in a new tab with noopener. It
    closes on a pick, Escape (focus back to the button) or a click outside.
    Styled by the parent's .actions rules for the button; the list is its own.
-->
<script lang="ts">
	import { safeUrl } from '@ripple-ui/core';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { openInLinks, pagePrompt } from './open-in.js';

	let { markdownUrl, title }: { markdownUrl: string; title: string } = $props();

	const PAWOS: string = import.meta.env.PUBLIC_PAWOS_URL ?? '';
	const links = $derived(openInLinks(pagePrompt(markdownUrl, title), PAWOS));

	let open = $state(false);
	let root = $state<HTMLElement>();
	let button = $state<HTMLButtonElement>();

	function onKey(e: KeyboardEvent) {
		if (open && e.key === 'Escape') {
			open = false;
			button?.focus();
		}
	}
	function onPointer(e: PointerEvent) {
		if (open && root && !root.contains(e.target as Node)) open = false;
	}
</script>

<svelte:window onkeydown={onKey} onpointerdown={onPointer} />

<div class="open-in" bind:this={root}>
	<button type="button" bind:this={button} aria-expanded={open} aria-controls="open-in-list" onclick={() => (open = !open)}>
		Open in <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
	</button>
	{#if open}
		<ul id="open-in-list" class="list">
			{#each links as l (l.name)}
				<li>
					<a href={safeUrl(l.href)} target="_blank" rel="noopener noreferrer" onclick={() => (open = false)}>{l.name}</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.open-in {
		position: relative;
	}
	.open-in button {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.list {
		position: absolute;
		z-index: var(--z-drawer);
		top: calc(100% + 6px);
		left: 0;
		min-width: 160px;
		margin: 0;
		padding: 4px;
		list-style: none;
		border: 1px solid var(--site-line);
		border-radius: var(--radius-card);
		background: var(--site-panel, var(--card));
		box-shadow: var(--shadow-card);
	}
	.list a {
		display: block;
		padding: 8px 10px;
		border-radius: var(--radius-control);
		color: var(--site-ink);
		font: 500 13px/1.2 var(--font-sans);
		text-decoration: none;
	}
	.list a:hover {
		background: var(--site-hover);
	}
	.list a:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: -2px;
	}
</style>
