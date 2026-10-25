<!--
  src/deferred/FlowRunner.svelte: stands in for the renderer's FlowRunner in the embed
  build (vite.config.ts redirects Ripple.svelte's import here), so it and the
  layouts and widgets it imports statically load only when a spec needs them.
-->
<script lang="ts">
	let props: Record<string, unknown> = $props();
</script>

{#await import('$lib/intent/FlowRunner.svelte') then m}
	<m.default {...props as never} />
{/await}
