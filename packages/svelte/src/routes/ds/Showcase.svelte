<!--
  @file routes/ds/Showcase.svelte
  @description The shell every /ds/<slug> page renders through: the <title>
    ("<title> · Ripple design system") and meta description from pages.ts, a
    back link to /ds, the h1 on the hub's display scale, the intro (a snippet,
    or the page's description), the in-page nav pills, then the page body.
    It also owns the shared section styles the pages use, as :global classes
    under .showcase so they reach markup rendered through the children snippet
    without leaking to any other route: showcase-section, showcase-section-title,
    section-caption, showcase-item, showcase-item-title, showcase-item-demo,
    event-log, and the grid-2 and grid-3 layouts (one column below 640px).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { dsPage } from './pages.js';

	let {
		slug,
		nav = [],
		intro,
		children
	}: { slug: string; nav?: { href: string; label: string }[]; intro?: Snippet; children: Snippet } = $props();

	const page = $derived(dsPage(slug));
</script>

<svelte:head>
	<title>{page.title} · Ripple design system</title>
	<meta name="description" content={page.description} />
</svelte:head>

<main class="showcase">
	<header class="showcase-header">
		<a class="back" href="/ds">Design system</a>
		<h1>{page.title}</h1>
		<div class="lede">
			{#if intro}{@render intro()}{:else}<p>{page.description}</p>{/if}
		</div>
		{#if nav.length}
			<nav class="showcase-nav" aria-label="On this page">
				{#each nav as n (n.href)}<a href={n.href}>{n.label}</a>{/each}
			</nav>
		{/if}
	</header>
	{@render children()}
</main>

<style>
	.showcase {
		box-sizing: border-box;
		width: 100%;
		max-width: var(--site-max);
		margin: 0 auto;
		padding: 0 var(--site-gutter) 72px;
		font-family: var(--font-sans);
		color: var(--site-ink);
	}
	.showcase-header {
		padding: clamp(28px, 5vw, 48px) 0 8px;
		margin-bottom: 16px;
	}
	.back {
		font-size: 14px;
		color: var(--primary-ink);
		text-underline-offset: 3px;
	}
	h1 {
		margin: 8px 0 0;
		font-family: var(--font-display);
		font-size: clamp(2rem, 4vw, 2.75rem);
		font-weight: 650;
		line-height: 1.05;
		letter-spacing: -0.03em;
	}
	.lede {
		max-width: 68ch;
		margin-top: 12px;
		font-size: 16px;
		line-height: 1.55;
		color: var(--site-soft);
	}
	.lede :global(p) {
		margin: 0 0 8px;
	}
	.showcase-nav {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 16px;
	}
	.showcase-nav a {
		padding: 5px 12px;
		border: 1px solid var(--site-line);
		border-radius: 999px;
		background: var(--site-panel, var(--card));
		font-size: 13px;
		font-weight: 500;
		color: var(--site-ink);
		text-decoration: none;
		transition: border-color 0.15s;
	}
	.showcase-nav a:hover {
		border-color: color-mix(in oklch, var(--site-ink) 28%, transparent);
	}
	.showcase :global(a:focus-visible) {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}
	.showcase :global(.lede code),
	.showcase :global(.section-caption code),
	.showcase :global(.showcase-section-title code) {
		font-family: var(--font-mono);
		font-size: 0.9em;
	}

	/* Shared section styles for the pages' own markup. */
	.showcase :global(.showcase-section) {
		margin-top: 40px;
	}
	.showcase :global(.showcase-section-title) {
		margin: 0 0 12px;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--site-line);
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 650;
		letter-spacing: -0.02em;
	}
	.showcase :global(.showcase-section-title a) {
		color: var(--primary-ink);
		text-underline-offset: 3px;
	}
	.showcase :global(.section-caption) {
		max-width: 68ch;
		margin: -4px 0 12px;
		font-size: 14px;
		line-height: 1.5;
		color: var(--site-soft);
	}
	.showcase :global(.showcase-item) {
		min-width: 0;
		border: 1px solid var(--site-line);
		border-radius: var(--radius-card);
		overflow: hidden;
		background: var(--site-panel, var(--card));
	}
	.showcase :global(.showcase-item-title) {
		margin: 0;
		padding: 8px 14px;
		border-bottom: 1px solid var(--site-line);
		font-family: var(--font-sans);
		font-size: 13px;
		font-weight: 600;
		color: var(--site-soft);
	}
	.showcase :global(.showcase-item-demo) {
		min-width: 0;
		padding: 20px;
		background: var(--background);
		color: var(--foreground);
	}
	.showcase :global(.event-log) {
		margin: 8px 0 0;
		font-size: 13px;
		color: var(--site-soft);
	}
	.showcase :global(.grid-2),
	.showcase :global(.grid-3) {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
	}
	.showcase :global(.grid-3) {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	@media (max-width: 639px) {
		.showcase {
			padding-inline: 16px;
		}
		.showcase :global(.grid-2),
		.showcase :global(.grid-3) {
			grid-template-columns: minmax(0, 1fr);
		}
		.showcase :global(.showcase-item-demo) {
			padding: 14px;
		}
	}
</style>
