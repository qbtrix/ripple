<!--
  @file routes/live/+page.svelte
  @description /live, the site's one gallery ("Gallery" in the nav), laid out
    like Paw OS Discover: a compact hero (lib/discover's DiscoverHeader) with
    lede, a one-line legend for the three tile tags (Recorded, Hand-written,
    Widget demo) and filter chips (All plus gallery.ts GROUPS; the choice kept
    in `?group=`, the chip row fades at its edge on a phone), then one titled
    section of tiles (GalleryGrid) per group.
    Items come from gallery.ts, one card per widget type: the runs, then the
    widget demos no run covers. A plain click opens the item in place with a "Back to
    gallery" button, focus moving to the item's heading (not the button, so a
    mouse click shows no ring): a run replays in Player (it streams into <Ripple> and
    ends as a working card), a demo's component from ./demos renders live
    (lazy-loaded, so the grid's bundle stays small). The card's href
    `?s=<key>` is the deep link, read after mount since the page is
    prerendered, and browser Back returns to the grid (shallow pushState). No
    model is called at runtime. A return from the store's checkout (`?order=`
    or `?cancelled=1`, checkout.readReturn) shows OrderReceipt above and opens
    the menu-order demo. Old /showcase URLs redirect here (routes/showcase). A
    quiet credit to Anatomy sits under any section with an iso drawing and
    under an opened one.

  Look: the site's tokens and fonts under the shared top bar and footer from
    +layout.svelte. The local --line, --panel and --ink-soft are read by
    OrderReceipt.
-->
<script lang="ts">
	import SeoHead from '$lib/site/SeoHead.svelte';
	import { onMount, tick, type Component } from 'svelte';
	import { pushState, replaceState } from '$app/navigation';
	import DiscoverHeader from '$lib/discover/DiscoverHeader.svelte';
	import GalleryGrid from './GalleryGrid.svelte';
	import { galleryItems, GROUPS, isoKeys, itemByKey, liveRuns, resolveKey } from './gallery.js';
	import { readReturn } from './checkout.js';
	import OrderReceipt from './OrderReceipt.svelte';
	import Player from './Player.svelte';

	const STORE_URL: string = import.meta.env.PUBLIC_STORE_URL;
	const demoModules = import.meta.glob<{ default: Component }>('./demos/*.svelte');

	const BLURBS: Record<string, string> = {
		Do: 'Plans, bookings and orders that get something done.',
		Learn: 'Explainers, a 3D model, calculators and cards to practise.',
		Play: 'Small games, built from the same spec.',
		Track: 'Dashboards, timers and trackers that keep state.',
		Flows: 'Step by step forms chained in the spec.',
		Drawings: 'Animated drawings of how things work, with notes on the parts.'
	};
	const groups = ['All', ...GROUPS];
	const count = (g: string) => (g === 'All' ? galleryItems.length : galleryItems.filter((i) => i.group === g).length);

	let group = $state('All');
	const sections = $derived(GROUPS.filter((g) => group === 'All' || g === group).map((g) => ({ g, items: galleryItems.filter((i) => i.group === g) })));
	const gridUrl = () => (group === 'All' ? '/live' : `/live?group=${encodeURIComponent(group)}`);

	let openKey = $state<string | null>(null);
	let receipt = $state<{ order: string | null; mock: boolean; cancelled: boolean } | null>(null);
	let heading = $state<HTMLHeadingElement>();
	const open = $derived(itemByKey(openKey));
	const run = $derived(open?.kind === 'run' ? liveRuns.find((s) => s.id === open.key) : undefined);
	const demo = $derived(open?.kind === 'demo' ? demoModules[`./demos/${open.id}.svelte`]?.() : undefined);

	/** The open item's key from the URL; a pruned demo's key gives way to its run's. */
	const keyIn = (search: string) => {
		const key = new URLSearchParams(search).get('s');
		return key && itemByKey(key) ? resolveKey(key) : null;
	};
	const groupIn = (search: string) => {
		const g = new URLSearchParams(search).get('group');
		return g && groups.includes(g) ? g : 'All';
	};

	async function show(key: string | null) {
		openKey = key;
		if (key) {
			window.scrollTo({ top: 0 });
			await tick();
			heading?.focus({ preventScroll: true });
		}
	}

	function choose(g: string) {
		group = g;
		replaceState(gridUrl(), {});
	}

	/** True while the open item came from a card click, so Back can pop that entry. */
	let pushed = false;

	function openItem(item: { href: string; id: string }) {
		const it = galleryItems.find((i) => i.id === item.id);
		if (!it) return;
		pushState(it.href, {});
		pushed = true;
		show(it.key);
	}

	/** Back to the grid, with focus on the card that was open. */
	function toGrid() {
		const id = open?.id;
		openKey = null;
		pushed = false;
		tick().then(() => id && document.getElementById(`g-${id}`)?.closest('a')?.focus());
	}

	function closeItem() {
		if (pushed) return history.back();
		replaceState(gridUrl(), {});
		toGrid();
	}

	function onPop() {
		group = groupIn(location.search);
		const key = keyIn(location.search);
		if (key) show(key);
		else if (openKey) toGrid();
	}

	function dismissReceipt() {
		receipt = null;
		replaceState(openKey ? `?s=${openKey}` : gridUrl(), {});
	}

	onMount(() => {
		group = groupIn(location.search);
		receipt = readReturn(location.search);
		show(keyIn(location.search) ?? (receipt ? 'demo-menu-order' : null));
	});
</script>

<svelte:window onpopstate={onPop} />

<SeoHead title="Gallery · Ripple" description="What Ripple can render: recorded model runs replayed as they stream, hand-written card specs and live widget demos, from trip plans and bookings to games, trackers, step-by-step flows and annotated drawings." />

{#snippet credit()}
	<p class="credit">Isometric drawings inspired by <a href="https://skills.wheresryan.sh/anatomy" rel="noopener">Anatomy</a> by Ryan.</p>
{/snippet}

<main class="live">
	{#if receipt}
		<OrderReceipt storeUrl={STORE_URL} {...receipt} ondismiss={dismissReceipt} />
	{/if}

	{#if open}
		<div class="run-head">
			<button type="button" class="back" onclick={closeItem}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"
					><path d="M15 18l-6-6 6-6" /></svg
				>
				Back to gallery
			</button>
			<h1 tabindex="-1" bind:this={heading}>{open.title}</h1>
			<span class="tag">{open.tag}</span>
		</div>
		{#if run}
			{#key run.id}<Player {run} storeUrl={STORE_URL} />{/key}
		{:else if demo}
			{#await demo then mod}
				<div class="demo"><mod.default /></div>
			{/await}
		{/if}
		{#if isoKeys.has(open.key)}{@render credit()}{/if}
	{:else}
		<DiscoverHeader as="h1" title="What Ripple" accent="can render" class="hero">
			<p class="lede">Recorded model runs, hand-written card specs and live widget demos. Each one opens here.</p>
			<dl class="legend">
				<div><dt>Recorded</dt><dd>a model's real output, replayed as it streamed</dd></div>
				<div><dt>Hand-written</dt><dd>a card spec we wrote, streamed the same way</dd></div>
				<div><dt>Widget demo</dt><dd>a widget rendered live on the page, not replayed</dd></div>
			</dl>
			<div class="filters" role="group" aria-label="Filter by group">
				{#each groups as g (g)}
					<button type="button" class="chip" aria-pressed={group === g} onclick={() => choose(g)}>
						{g}<span class="n">{count(g)}</span>
					</button>
				{/each}
			</div>
		</DiscoverHeader>
		<div class="sections">
			{#each sections as { g, items } (g)}
				<GalleryGrid {items} label="{g} gallery" title={g} blurb={BLURBS[g]} onopen={openItem} />
				{#if items.some((i) => isoKeys.has(i.key))}{@render credit()}{/if}
			{/each}
		</div>
	{/if}
</main>

<style>
	.live {
		--panel: var(--card);
		--ink-soft: var(--site-soft);
		--line: var(--site-line);
		box-sizing: border-box;
		width: 100%;
		max-width: var(--site-max);
		margin: 0 auto;
		padding: 0 var(--site-gutter) 72px;
		font-family: var(--font-sans);
		color: var(--site-ink);
		overflow-x: clip;
	}
	/* DiscoverHeader, sized for the site: compact, no 100vh. */
	.live :global(.hero) {
		max-width: none;
		padding: clamp(28px, 5vw, 48px) 0 32px;
	}
	/* A grid item would grow to the chip row's width on a phone. */
	.live :global(.hero > *) {
		min-width: 0;
	}
	.live :global(.hero h1) {
		margin: 0;
		font-family: var(--font-display);
		letter-spacing: -0.03em;
		font-size: clamp(1.9rem, 3.6vw, 2.6rem);
		font-weight: 600;
		line-height: 1.08;
		text-wrap: balance;
	}
	.sections {
		display: flex;
		flex-direction: column;
		gap: 48px;
	}
	/* Credit under the Drawings tiles and an opened drawing: quiet, one line. */
	.credit {
		margin: -32px 0 0;
		font-size: 12px;
		color: var(--site-soft);
	}
	.run-head ~ .credit {
		margin-top: 16px;
	}
	.credit a {
		color: inherit;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(2rem, 4vw, 2.75rem);
		font-weight: 650;
		line-height: 1.05;
		letter-spacing: -0.03em;
	}
	.lede {
		margin: 0;
		max-width: 64ch;
		font-size: 16px;
		line-height: 1.55;
		color: var(--site-soft);
	}
	/* Discover's filter chips: small pills, the selected one filled. */
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 32px;
		padding: 0 12px;
		border: 1px solid var(--site-line);
		border-radius: 999px;
		background: transparent;
		color: var(--site-ink);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s;
	}
	.chip:hover {
		background: var(--site-hover);
	}
	.chip[aria-pressed='true'] {
		border-color: transparent;
		background: var(--site-pressed);
	}
	.chip:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}
	.n {
		font-family: var(--font-mono);
		font-size: 11.5px;
		color: var(--site-soft);
	}
	/* A demo brings its own centred, padded column; align it under the head. */
	.demo :global(> :first-child) {
		max-width: none;
		margin-inline: 0;
		padding-top: 0;
		padding-inline: 0;
	}
	.run-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 14px;
		padding: 20px 0 16px;
	}
	.run-head h1 {
		font-size: clamp(1.5rem, 3vw, 2rem);
		outline: none;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 20px;
		margin: 0;
		font-size: 13px;
		line-height: 1.45;
		color: var(--site-soft);
	}
	.legend dt {
		display: inline;
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--site-ink);
	}
	.legend dt::after {
		content: ': ';
	}
	.legend dd {
		display: inline;
		margin: 0;
	}
	.tag {
		padding: 2px 8px;
		border: 1px solid var(--site-line);
		border-radius: 999px;
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--site-soft);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		padding: 0 14px 0 10px;
		border: 1px solid var(--site-line);
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--site-ink);
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
	}
	.back:hover {
		background: var(--site-hover);
	}
	.back:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}
	@media (max-width: 639px) {
		.live {
			padding-inline: 16px;
		}
		.run-head {
			flex-direction: column;
			align-items: flex-start;
		}
		/* One sideways row; the fade at the right edge says there is more. */
		.filters {
			flex-wrap: nowrap;
			overflow-x: auto;
			scrollbar-width: none;
			padding: 4px 32px 4px 4px;
			margin: -4px;
			mask-image: linear-gradient(to right, #000 calc(100% - 40px), transparent);
		}
		.filters::-webkit-scrollbar {
			display: none;
		}
		.chip {
			flex: none;
			min-height: 44px;
		}
	}
</style>
