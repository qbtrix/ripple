<!--
  src/Pending.svelte: what a widget renders as while its lazy chunk is still
  loading (see registry.ts). Takes and ignores the widget's props. A short,
  quiet block so a late chunk does not jolt the layout much; mount() preloads
  every type a spec names, so this mostly shows for streamed or derived nodes.
-->
<script lang="ts">
	let { ..._rest }: Record<string, unknown> = $props();
</script>

<div class="ripple-embed-pending" aria-busy="true"></div>

<style>
	.ripple-embed-pending {
		min-height: 1.25rem;
		border-radius: 0.375rem;
		background: color-mix(in oklab, var(--muted, #8884) 60%, transparent);
	}
</style>
