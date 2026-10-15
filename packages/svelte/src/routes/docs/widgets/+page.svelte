<!--
  @file routes/docs/widgets/+page.svelte
  @description The widget reference index: every manifest category in reading
    order with its count, each a compact list of type (mono) and one-line
    description, with `backtick` spans shown as code. A filter box narrows the
    lists by type or description and hides empty categories; without JS every
    row shows. The layout's rail lists the categories (+page.server.ts).
    Plain lists, no live renders, so this page ships no widget JS.
-->
<script lang="ts">
	import { codeSpans } from '$lib/site/docs/widgets.js';

	let { data } = $props();
	const total = $derived(data.categories.reduce((n, c) => n + c.widgets.length, 0));

	let filter = $state('');
	const q = $derived(filter.trim().toLowerCase());
	const shown = $derived(
		data.categories
			.map((c) => ({
				...c,
				widgets: q ? c.widgets.filter((w) => `${w.type} ${w.description}`.toLowerCase().includes(q)) : c.widgets
			}))
			.filter((c) => c.widgets.length)
	);
	const matches = $derived(shown.reduce((n, c) => n + c.widgets.length, 0));
</script>

<svelte:head>
	<title>Widgets · Ripple docs</title>
	<meta name="description" content="Every Ripple widget type by category, with props, events and a live example." />
</svelte:head>

<article class="doc" data-pagefind-body>
	<h1>Widgets</h1>
	<p class="lede">
		{total} widget types by category. Each page shows a live example, the spec behind it, and the props the widget
		takes. Generated from the widget manifest.
	</p>

	<div class="filter" data-pagefind-ignore>
		<input type="search" bind:value={filter} placeholder="Filter widgets" aria-label="Filter widgets by type or description" autocomplete="off" spellcheck="false" />
		<span class="matches" aria-live="polite">{q ? `${matches} of ${total}` : ''}</span>
	</div>

	{#each shown as c (c.id)}
		<section aria-labelledby={c.id}>
			<h2 id={c.id}>{c.title} <span class="count">{c.widgets.length}</span></h2>
			<ul>
				{#each c.widgets as w (w.type)}
					<li>
						<a href="/docs/widgets/{w.type}"><code>{w.type}</code></a>
						<span class="desc"
							>{#each codeSpans(w.description) as p, i (i)}{#if p.code}<code class="inline">{p.text}</code
								>{:else}{p.text}{/if}{/each}</span
						>
					</li>
				{/each}
			</ul>
		</section>
	{:else}
		<p class="none">No widget matches "{filter}".</p>
	{/each}
</article>

<style>
	.doc {
		min-width: 0;
		font-size: 16px;
		line-height: 1.6;
	}
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 2rem;
		font-weight: 650;
		line-height: 1.15;
		letter-spacing: -0.02em;
	}
	.lede {
		margin: 10px 0 0;
		max-width: 70ch;
		font-size: 17px;
		color: var(--site-soft);
	}
	h2 {
		margin: 44px 0 8px;
		font-family: var(--font-display);
		font-size: 1.3rem;
		font-weight: 650;
		line-height: 1.25;
		scroll-margin-top: calc(var(--site-topbar) + 24px);
	}
	.count {
		margin-left: 6px;
		font-family: var(--font-sans);
		font-size: 15px;
		font-weight: 400;
		color: var(--site-soft);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--site-line);
	}
	li {
		display: grid;
		grid-template-columns: minmax(0, 200px) minmax(0, 1fr);
		gap: 16px;
		padding: 8px 0;
		border-bottom: 1px solid var(--site-line);
		font-size: 15px;
	}
	a {
		align-self: start;
		color: var(--primary-ink);
		text-underline-offset: 3px;
		overflow-wrap: anywhere;
	}
	a:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}
	code {
		font: 0.93em var(--font-mono);
		font-variant-ligatures: none;
	}
	.desc {
		color: var(--site-soft);
		overflow-wrap: anywhere;
	}
	code.inline {
		padding: 0 4px;
		border: 1px solid var(--code-line);
		border-radius: 4px;
		background: var(--code-bg);
		font-size: 0.85em;
	}
	.filter {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 24px;
	}
	.filter input {
		box-sizing: border-box;
		width: min(100%, 320px);
		min-height: 36px;
		padding: 0 12px;
		border: 1px solid var(--site-line);
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--site-ink);
		font: 15px var(--font-sans);
	}
	.filter input:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}
	.matches,
	.none {
		font-size: 14px;
		color: var(--site-soft);
	}
	.none {
		margin-top: 32px;
	}
	@media (max-width: 559.98px) {
		li {
			grid-template-columns: minmax(0, 1fr);
			gap: 2px;
		}
	}
</style>
