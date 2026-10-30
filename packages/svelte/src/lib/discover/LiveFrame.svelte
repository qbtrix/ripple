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

     Sandbox (frameSandbox in frame.ts): allow-scripts allow-forms
     allow-popups allow-pointer-lock, plus allow-same-origin only for an https
     page on a subdomain of LIVE_FRAME_TRUSTED_HOST_SUFFIX
     (.pawsites.workers.dev). Scripts plus same-origin only escape the sandbox
     when the page shares the host's origin; each published site is its own
     subdomain on a registrable domain apart from the website and the app, so
     it keeps its own origin and storage (games save scores). Any other host
     runs opaque, where storage throws; it still works through "Open full
     screen". The link is user-submitted content, so it carries
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
  import { frameSandbox } from './frame.js';
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

  const LOAD_LABEL: Partial<Record<DiscoverKind, string>> = { site: 'Load site', game: 'Play', tool: 'Open tool' };

  const src = $derived(httpUrl(url));
  // From the url, never a prop: see the header.
  const sandbox = $derived(frameSandbox(src));
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
        {sandbox}
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
          <Button
            size="xs"
            variant={phone ? 'ghost' : 'secondary'}
            class={phone ? 'text-muted-foreground' : 'text-foreground'}
            aria-pressed={!phone}
            onclick={() => (phone = false)}
          >
            <Monitor aria-hidden="true" />Desktop
          </Button>
          <Button
            size="xs"
            variant={phone ? 'secondary' : 'ghost'}
            class={phone ? 'text-foreground' : 'text-muted-foreground'}
            aria-pressed={phone}
            onclick={() => (phone = true)}
          >
            <Smartphone aria-hidden="true" />Phone
          </Button>
        </div>
      {:else}
        <span></span>
      {/if}
      <Button
        variant="ghost"
        size="sm"
        class="text-foreground"
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
