<!--
  src/deferred/OrganismRenderer.svelte: stands in for NodeRenderer's OrganismRenderer in the embed
  build (vite.config.ts redirects NodeRenderer.svelte's import here), so it, the organisms and the
  widgets they import statically load only when a spec needs them.
-->
<script lang="ts">
	let props: Record<string, unknown> = $props();
</script>

{#await import('$lib/organisms/OrganismRenderer.svelte') then m}
	<m.default {...props as never} />
{/await}
