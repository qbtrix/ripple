<!--
  @file lib/site/SeoHead.svelte
  @description A page's own head text: <title>, the meta description and their
    Open Graph twins (og:title, og:description; Twitter cards fall back to
    these). Every public page renders one instead of writing the tags itself.
    The URL-derived tags (canonical, og:url, og:image, twitter:card, noindex)
    live in routes/+layout.svelte, which knows the path.
-->
<script lang="ts">
	let { title, description }: { title: string; description: string } = $props();
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
</svelte:head>
