<!--
  routes/ds/apps/+page.svelte — The app-like composite widgets a model fills with
  data (notes, music, weather, week, agenda, places, products, posters) plus the
  drawing widgets (iso-scene, figure), each rendered live from the example on its
  manifest entry, so this page cannot drift from the docs. Composites stay out of
  the /ds atoms grid on purpose; this page is linked from its Primitive pages list.
-->
<script lang="ts">
	import { Ripple } from '$lib/index.js';
	import { manifestEntries } from '$lib/manifest/index.js';

	const TYPES = ['notes', 'music-player', 'weather-forecast', 'week-schedule', 'agenda', 'place-results', 'product-grid', 'media-grid', 'iso-scene', 'figure'];
	const apps = TYPES.flatMap((type) => {
		const e = manifestEntries.find((m) => m.type === type);
		return e ? [{ type, description: e.description.split(/(?<=\.)\s/)[0], spec: { version: '1.0', state: {}, ui: e.example } }] : [];
	});
</script>

<svelte:head>
	<title>App widgets · Ripple design system</title>
</svelte:head>

<main class="showcase">
	<header class="showcase-header">
		<h1>App widgets</h1>
		<p>Widgets that stand for a small app. The model writes the data; each one here is rendered from the example on its docs page.</p>
	</header>
	{#each apps as a (a.type)}
		<section id={a.type} class="showcase-section">
			<h2 class="showcase-section-title"><a href="/docs/widgets/{a.type}"><code>{a.type}</code></a></h2>
			<p class="section-caption">{a.description}</p>
			<div class="showcase-item-demo">
				<svelte:boundary>
					<Ripple spec={a.spec} />
					{#snippet failed()}<p>This example did not render.</p>{/snippet}
				</svelte:boundary>
			</div>
		</section>
	{/each}
</main>

<style>
	.showcase {
		box-sizing: border-box;
		width: 100%;
		max-width: var(--site-max);
		margin: 0 auto;
		padding: 32px var(--site-gutter) 72px;
	}
	.showcase-header p,
	.section-caption {
		color: var(--muted-foreground);
		max-width: 64ch;
	}
	.showcase-section {
		margin-top: 40px;
	}
	.showcase-section-title {
		font-size: 1rem;
		margin-bottom: 4px;
	}
	.showcase-item-demo {
		margin-top: 12px;
		max-width: 720px;
	}
</style>
