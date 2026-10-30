<!-- discover/LiveFrame.svelte — a Discover item's live page (a site, a game, a
     tool) inside the detail view. It starts as the poster (ItemArt) and loads
     nothing: the iframe is created only when the visitor presses "Load site",
     "Play" or "Open tool", so a catalogue page never pulls in a stranger's
     page on view. Sites get a Desktop / Phone width toggle once loaded (phone
     is a 390px centred frame). "Open full screen" always links to the page.
     Only an http(s) url is framed or linked; anything else leaves the poster.

     Server-safe: nothing touches window. The load button is drawn after
     mount, so with JS off the poster and the "Open full screen" link are what
     shows, and the link works.

     Sandbox: allow-scripts allow-forms allow-popups allow-pointer-lock.
     allow-same-origin is left out on purpose. Items live on their own origin
     (*.pawsites.workers.dev), but the url is listing data: if one ever named
     the embedding origin, scripts plus same-origin would let the page remove
     its own sandbox and reach the host. Without it the page runs in an opaque
     origin, so localStorage, sessionStorage, cookies and IndexedDB throw; a
     page that needs them works through "Open full screen". The link is
     user-submitted content, so it carries
     rel="nofollow ugc noopener noreferrer". -->
<script lang="ts">
  import { safeUrl } from '@ripple-ui/core';
  import { onMount } from 'svelte';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import Monitor from '@lucide/svelte/icons/monitor';
  import Play from '@lucide/svelte/icons/play';
  import Smartphone from '@lucide/svelte/icons/smartphone';
  import { Button } from '../components/ui/button/index.js';
  import { cn } from '$lib/utils.js';
  import ItemArt from './ItemArt.svelte';
  import { httpUrl } from './item.js';
  import type { DiscoverKind } from './types.js';

  let {
    url,
    title,
    kind,
    poster = null,
    tint,
    initial,
    class: className,
  }: {
    /** The live page. Only http(s) is framed. */
    url: string;
    /** The item's title: the iframe's accessible name and the poster's alt. */
    title: string;
    kind: DiscoverKind;
    /** The preview picture shown until the page loads. */
    poster?: string | null;
    /** The placeholder's tint and glyph when there is no poster (tintFor / initialFor). */
    tint: string;
    initial: string;
    class?: string;
  } = $props();

  /** Fixed, never bound to a prop: see the header for why allow-same-origin is absent. */
  const FRAME_SANDBOX = 'allow-scripts allow-forms allow-popups allow-pointer-lock';
  const LOAD_LABEL: Partial<Record<DiscoverKind, string>> = { site: 'Load site', game: 'Play', tool: 'Open tool' };

  const src = $derived(httpUrl(url));
  const loadLabel = $derived(LOAD_LABEL[kind] ?? 'Load');
  let ready = $state(false);
  let loaded = $state(false);
  let phone = $state(false);

  onMount(() => {
    ready = true;
  });
</script>

<div class={cn('flex flex-col gap-2', className)} data-testid="discover-live-frame">
  {#if loaded && src}
    <div
      class={cn(
        'overflow-hidden rounded-[10px] border border-border bg-background',
        phone ? 'mx-auto aspect-[390/844] max-h-[75vh] w-[390px] max-w-full' : 'aspect-video w-full',
      )}
    >
      <iframe
        class="block h-full w-full border-0"
        src={safeUrl(src, { kind: 'resource' })}
        {title}
        sandbox={FRAME_SANDBOX}
        allow="fullscreen; gamepad; autoplay"
        loading="lazy"
        referrerpolicy="no-referrer"
        data-testid="discover-live-iframe"
      ></iframe>
    </div>
  {:else}
    <div class="relative">
      <ItemArt imageUrl={poster} {title} {tint} {initial} />
      {#if ready && src}
        <div class="absolute inset-0 grid place-items-center">
          <Button size="lg" class="rounded-full px-5 shadow-md" aria-label={`${loadLabel}: ${title}`} onclick={() => (loaded = true)}>
            <Play class="size-4" aria-hidden="true" />{loadLabel}
          </Button>
        </div>
      {/if}
    </div>
  {/if}
  {#if src}
    <div class="flex flex-wrap items-center justify-between gap-2">
      {#if kind === 'site' && loaded}
        <div class="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Preview width">
          <Button size="xs" variant={phone ? 'ghost' : 'secondary'} aria-pressed={!phone} onclick={() => (phone = false)}>
            <Monitor aria-hidden="true" />Desktop
          </Button>
          <Button size="xs" variant={phone ? 'secondary' : 'ghost'} aria-pressed={phone} onclick={() => (phone = true)}>
            <Smartphone aria-hidden="true" />Phone
          </Button>
        </div>
      {:else}
        <span></span>
      {/if}
      <Button
        variant="link"
        size="sm"
        href={safeUrl(src)}
        target="_blank"
        rel="nofollow ugc noopener noreferrer"
        aria-label={`Open ${title} full screen (opens in a new tab)`}
      >
        <ExternalLink aria-hidden="true" />Open full screen
      </Button>
    </div>
  {/if}
</div>
