<!--
  src/Embed.svelte: the host shell mount() renders inside each shadow root. Not
  a renderer: it wraps the one <Ripple> and points bits-ui portals (tooltips,
  menus, popovers) at a node inside the shadow root, so floating layers get the
  embed's styles instead of landing unstyled in document.body. Everything it
  shows comes from `ctl` (a Controller from index.svelte.ts), whose fields are
  reactive, so update()/setTheme()/finish() change the card in place and the
  card's state survives a spec swap.
-->
<script lang="ts">
	import { BitsConfig } from 'bits-ui';
	import Ripple from '$lib/Ripple.svelte';
	import type { Controller } from './controller.svelte.js';

	let { ctl }: { ctl: Controller } = $props();
	let portal = $state<HTMLElement>();
</script>

<div class="ripple-embed-root" class:dark={ctl.theme === 'dark'}>
	{#if portal}
		<BitsConfig defaultPortalTo={portal}>
			{#if ctl.stream}
				<Ripple streaming={ctl.stream} onEvent={ctl.onEvent} />
			{:else}
				<Ripple spec={ctl.spec as never} onEvent={ctl.onEvent} />
			{/if}
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
