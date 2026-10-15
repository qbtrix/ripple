<!--
  routes/ds/apps/+page.svelte: the app-like composite widgets a model fills with
  data (notes, music, weather, week, agenda, places, products, posters) plus the
  drawing widgets (iso-scene, figure), each rendered live from the example on its
  manifest entry, so the demos cannot drift from the docs. The captions are
  plain-language, site-only lines (the manifest descriptions are written for a
  model and carry schema shorthand). Composites stay out of the /ds atoms grid
  on purpose; this page is linked from the hub.
-->
<script lang="ts">
	import { Ripple } from '$lib/index.js';
	import { manifestEntries } from '$lib/manifest/index.js';
	import Showcase from '../Showcase.svelte';

	const CAPTIONS: Record<string, string> = {
		notes: 'A notepad: write notes in place, filter by #tag, pin, edit, and delete with undo.',
		'music-player': 'A music player whose sounds are made in the browser: play, skip, shuffle, repeat, seek and volume.',
		'weather-forecast': 'A forecast card with the weather now, the days ahead, animated icons and a C/F switch.',
		'week-schedule': 'A week calendar that lays events out as blocks on a days-by-hours grid.',
		agenda: 'A meeting agenda with start times, a time-share bar, reordering and a run mode with a countdown.',
		'place-results': 'Place search results with ratings, prices, sorting, filters, and a numbered map when places have coordinates.',
		'product-grid': 'A product grid with prices, discounts, ratings and a tray to compare two or three.',
		'media-grid': 'A poster grid for films, series, podcasts or books, with genres and a My list view.',
		'iso-scene': 'A live isometric drawing of a machine built from a parts list, with sliders and readouts.',
		figure: 'A hand-built live isometric figure from a small catalog, with sliders and numbered labels.'
	};
	const apps = Object.keys(CAPTIONS).flatMap((type) => {
		const e = manifestEntries.find((m) => m.type === type);
		return e ? [{ type, caption: CAPTIONS[type], spec: { version: '1.0', state: {}, ui: e.example } }] : [];
	});
</script>

<Showcase slug="apps" nav={apps.map((a) => ({ href: `#${a.type}`, label: a.type }))}>
	{#snippet intro()}
		<p>
			Widgets that stand for a small app. The model writes the data; each one here is rendered from the example on its
			docs page.
		</p>
	{/snippet}

	{#each apps as a (a.type)}
		<section id={a.type} class="showcase-section">
			<h2 class="showcase-section-title"><a href="/docs/widgets/{a.type}"><code>{a.type}</code></a></h2>
			<p class="section-caption">{a.caption}</p>
			<div class="app-demo">
				<svelte:boundary>
					<Ripple spec={a.spec} />
					{#snippet failed()}<p class="section-caption">This example did not render.</p>{/snippet}
				</svelte:boundary>
			</div>
		</section>
	{/each}
</Showcase>

<style>
	.app-demo {
		max-width: 720px;
		color: var(--foreground);
	}
</style>
