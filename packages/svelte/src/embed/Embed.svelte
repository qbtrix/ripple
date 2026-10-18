<!--
  embed/Embed.svelte: the host shell the standalone embed mounts inside its
  shadow root. Not a renderer: it wraps the one <Ripple> and points bits-ui
  portals (tooltips, menus, popovers) at a node inside the shadow root, so
  floating layers get the embed's styles instead of landing unstyled in
  document.body. `update` is exported so mount() can swap the spec in place.
-->
<script lang="ts">
	import { BitsConfig } from 'bits-ui';
	import { Ripple } from '$lib/index.js';

	let { spec: initial, theme = 'light' }: { spec: object; theme?: 'light' | 'dark' } = $props();

	// svelte-ignore state_referenced_locally
	let spec = $state.raw(initial);
	let portal = $state<HTMLElement>();

	export function update(next: object) {
		spec = next;
	}
</script>

<div class="ripple-embed-root {theme === 'dark' ? 'dark' : ''}">
	{#if portal}
		<BitsConfig defaultPortalTo={portal}>
			<Ripple {spec} />
		</BitsConfig>
	{/if}
	<div bind:this={portal}></div>
</div>

<style>
	.ripple-embed-root {
		font-family: var(--font-sans);
		color: var(--foreground);
		-webkit-font-smoothing: antialiased;
	}
</style>
