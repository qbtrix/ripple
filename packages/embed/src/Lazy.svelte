<!--
  src/Lazy.svelte: renders the component `load` resolves to, passing every
  other prop through. lazy-component.ts binds `load` so the result can stand
  in anywhere a component is expected (lucide icons looked up by name).
-->
<script lang="ts">
	import type { Component } from 'svelte';

	let { load, ...rest }: { load: () => Promise<{ default: Component<any> }> } & Record<string, unknown> = $props();
</script>

{#await load() then m}
	<m.default {...rest} />
{/await}
