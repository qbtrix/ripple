<!--
  src/deferred/DashboardRenderer.svelte: stands in for the renderer's DashboardRenderer in the embed
  build (vite.config.ts redirects Ripple.svelte's import here), so it and the
  layouts and widgets it imports statically load only when a spec needs them.
-->
<script lang="ts">
	let props: Record<string, any> = $props();
</script>

{#await import('$lib/intent/DashboardRenderer.svelte') then m}
	<m.default {...props as any} />
{/await}
