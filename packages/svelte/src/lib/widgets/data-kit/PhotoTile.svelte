<!--
  widgets/data-kit/PhotoTile.svelte — every photo in the data widgets (design
  doc 2026-10-09 §2.5). A fixed aspect box (4:3, 1:1, 16:9) so nothing shifts;
  the box is a muted skeleton until the image loads; a missing, refused or
  failed `src` shows the icon tile instead (the item's kind icon on
  --ripple-muted). A broken image is never shown.
  Invariant: the only `src` sink is `safeUrl(src, { kind: 'resource' })`
  inline on the <img> (security/url-sinks.test.ts audits that), and the <img>
  renders only when that call returns a URL. Width comes from the caller's
  class (`w-24`, `w-full`); a hero adds `max-h-[200px]`. A caller with a
  better fallback than the icon (link-preview's domain letter) passes the
  `fallback` snippet; it fills the box in place of the icon. `onload` and
  `onerror` tell the caller how the photo went (menu-order drops failed tiles).
-->
<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { safeUrl } from '@ripple-ui/core';
	import { FALLBACK_ICON } from './icons.js';

	type Ratio = '4:3' | '1:1' | '16:9' | 'auto';

	interface Props {
		src?: unknown;
		alt?: string;
		ratio?: Ratio;
		icon?: LucideIcon;
		iconSize?: number;
		class?: string;
		id?: string;
		/** Inline style for the box (the image atom passes its width, height and radius). */
		style?: string;
		fit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
		/** Show the alt text under the fallback icon. */
		caption?: boolean;
		/** Replaces the icon tile when the image is missing, refused or failed. */
		fallback?: Snippet;
		onload?: () => void;
		onerror?: () => void;
	}

	let { src, alt = '', ratio = '1:1', icon, iconSize = 20, class: className, id, style, fit = 'cover', caption = false, fallback, onload, onerror }: Props = $props();

	// 'auto' leaves the box to its own width/height (the image atom); the fallback then keeps a floor height, and its floor width never exceeds the track it sits in.
	const RATIO: Record<Ratio, string> = { '4:3': 'aspect-[4/3]', '1:1': 'aspect-square', '16:9': 'aspect-video', auto: '' };

	// Keyed by URL, so a src that changes (a streamed placeholder swapped for
	// the hydrated photo) starts over as loading instead of inheriting a state.
	let loadedUrl = $state<string>();
	let failedUrl = $state<string>();

	const url = $derived(safeUrl(src, { kind: 'resource' }));
	const showImage = $derived(url !== undefined && failedUrl !== url);
	const phase = $derived(!showImage ? 'fallback' : loadedUrl === url ? 'loaded' : 'loading');
	const Icon = $derived(icon ?? FALLBACK_ICON);
</script>

<div {id} {style} class={['relative overflow-hidden rounded-md bg-ripple-muted', RATIO[ratio] ?? RATIO['1:1'], ratio === 'auto' && phase === 'fallback' && 'min-h-24 min-w-[min(6rem,100%)]', className]} data-state={phase}>
	{#if showImage}
		<img
			src={safeUrl(src, { kind: 'resource' })}
			{alt}
			loading="lazy"
			decoding="async"
			style:object-fit={fit}
			class={['block size-full transition-opacity duration-150 ease-ripple-out', phase === 'loaded' ? 'opacity-100' : 'opacity-0']}
			onload={() => ((loadedUrl = url), onload?.())}
			onerror={() => ((failedUrl = url), onerror?.())}
		/>
	{:else if fallback}
		{@render fallback()}
	{:else if alt}
		<div class="flex size-full flex-col items-center justify-center gap-1.5 p-2 text-ripple-muted-foreground" role="img" aria-label={alt}>
			<Icon size={iconSize} strokeWidth={1.75} aria-hidden="true" />
			{#if caption}<span class="line-clamp-2 max-w-full text-center text-xs" aria-hidden="true">{alt}</span>{/if}
		</div>
	{:else}
		<div class="grid size-full place-items-center text-ripple-muted-foreground" aria-hidden="true">
			<Icon size={iconSize} strokeWidth={1.75} />
		</div>
	{/if}
</div>
