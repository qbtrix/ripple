<!-- discover/WhatsAppQrCard.svelte — the Discover hero's "Try one · no sign-up" widget:
     a working WhatsApp QR card for a shop counter. The app's /discover and the public
     Discover page both mount this one component (in DiscoverHeader's `aside`).

     The shop name, a calling code (Select; default read on mount from the host's
     `country`, then the browser's time zone, then its languages, else India) and the number build a wa.me link with an optional
     pre-filled message; a pasted "+44 7700 900123" picks the country itself. Until the
     number is valid the preview shows a placeholder and every export is disabled, so
     no QR ever points at a wrong number; the reason shows under the field (aria-live)
     once the field is left. The preview is the printed card as it downloads: white
     paper and dark ink in every theme (white/neutral classes, since paper is not
     themed), tilted like a card on a counter (flat with reduced motion).

     Server render: India and the example "Sharma Sweets" / "98765 43210", so a page
     with JS off shows a real example card and link. On mount the number is cleared
     and the country follows the host or the browser. All logic is in ./whatsapp-card; exports in
     ./whatsapp-card-export (PNG 300 dpi, SVG in mm, Print one 148 × 105 mm page).
     Host hooks: `oncopy`, `onopenlink`, `ondownload` replace the browser defaults
     (clipboard, a target=_blank link, an anchor download); the "Make a full menu or
     site" action renders only with `onmake` or `makeHref` (painted text-primary, the
     host's own accent, so it reads on a host whose ripple tokens are the light set);
     `brand` names the product.

     Collapsed on narrow: the card is a <details> whose summary is a one-line
     teaser ("Make a WhatsApp QR card for your shop" and a chevron). It sizes
     off its own box (container `qr-card`): under 30rem (a phone) the details
     start closed and the teaser opens them; from 30rem the teaser hides and
     the content shows with the details still closed, through
     ::details-content, so the server markup is the same at every width and
     hydration never jumps. Works with JS off. A browser without
     ::details-content keeps the teaser at every width; on mount, a wide one
     opens the details instead. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { safeUrl } from '@ripple-ui/core';
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Copy from '@lucide/svelte/icons/copy';
  import Download from '@lucide/svelte/icons/download';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import Printer from '@lucide/svelte/icons/printer';
  import QrCode from '@lucide/svelte/icons/qr-code';
  import { cn } from '$lib/utils.js';
  import { Badge } from '../components/ui/badge/index.js';
  import { Button } from '../components/ui/button/index.js';
  import { Input } from '../components/ui/input/index.js';
  import { Label } from '../components/ui/label/index.js';
  import * as Select from '../components/ui/select/index.js';
  import {
    DEFAULT_BRAND,
    DEFAULT_DIAL_ISO,
    DEFAULT_MESSAGE,
    DEFAULT_SHOP,
    DIAL_CODES,
    EXAMPLE_PHONE,
    MESSAGE_MAX,
    SHOP_MAX,
    cardFilename,
    cardFooter,
    cardLayout,
    checkPhone,
    browserTimeZone,
    defaultDialIso,
    dialCodeFor,
    splitInternational,
    waLink,
  } from './whatsapp-card.js';
  import { cardPng, cardSvgBlob, downloadBlob, printCard } from './whatsapp-card-export.js';

  let {
    brand = DEFAULT_BRAND,
    oncopy,
    onopenlink,
    ondownload,
    onmake,
    makeHref,
    country,
    class: className,
  }: {
    /** The product named in "Make a full menu or site with …" and on the card's foot. */
    brand?: string;
    /** Copy the wa.me link. Default: the clipboard API. */
    oncopy?: (text: string) => Promise<void> | void;
    /** Open the wa.me link ("Test it"). Default: a plain target=_blank link. */
    onopenlink?: (url: string) => void;
    /** Save a PNG or SVG. Default: an anchor download of a blob URL. */
    ondownload?: (blob: Blob, filename: string) => void;
    /** "Make a full menu or site", with the typed shop name. */
    onmake?: (shop: string) => void;
    /** The same action as a link, for a host without a callback. */
    makeHref?: string;
    /** The workspace or user country (ISO code or listed name), read on mount; it
     *  outranks the browser's time zone and languages for the default code. */
    country?: string;
    class?: string;
  } = $props();

  const uid = $props.id();

  let shop = $state(DEFAULT_SHOP);
  let iso = $state(DEFAULT_DIAL_ISO);
  let phone = $state(EXAMPLE_PHONE);
  let message = $state(DEFAULT_MESSAGE);
  let touched = $state(false);
  let copied = $state(false);
  let note = $state<string | null>(null);
  let details = $state<HTMLDetailsElement>();

  /** Width (px) of the card's own box from which it shows in full: 30rem. */
  const FULL_FROM = 480;

  onMount(() => {
    iso = defaultDialIso(navigator.languages, { country, timeZone: browserTimeZone() });
    phone = '';
    // Without ::details-content the CSS cannot show a closed card's body, so a
    // wide card opens itself. Browsers that have it never change state here.
    const box = details?.parentElement;
    if (details && box && !CSS.supports?.('selector(::details-content)') && box.clientWidth >= FULL_FROM) details.open = true;
  });

  const dial = $derived(dialCodeFor(iso));
  const check = $derived(checkPhone(dial.code, phone));
  const link = $derived(check.ok ? waLink(check.digits, message) : null);
  const layout = $derived(check.ok && link ? cardLayout({ shop, line: check.line, link, brand }) : null);
  const error = $derived(!check.ok && touched ? check.error : null);

  /** A pasted or typed international number picks its country. */
  function onPhoneInput(e: Event & { currentTarget: HTMLInputElement }) {
    const split = splitInternational(e.currentTarget.value, iso);
    if (!split) return;
    iso = split.iso;
    phone = split.national;
  }

  const save = (blob: Blob, filename: string) => (ondownload ?? downloadBlob)(blob, filename);

  async function savePng() {
    if (!layout) return;
    note = null;
    try {
      save(await cardPng(layout), cardFilename(shop, 'png'));
    } catch {
      note = "Couldn't make the PNG. Try the SVG or Print.";
    }
  }
  function saveSvg() {
    if (layout) save(cardSvgBlob(layout), cardFilename(shop, 'svg'));
  }
  function print() {
    if (layout) printCard(layout, `${shop.trim() || 'Shop'} WhatsApp QR card`);
  }
  async function copy(text: string) {
    note = null;
    try {
      await (oncopy ?? ((t: string) => navigator.clipboard.writeText(t)))(text);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      note = "Couldn't copy the link.";
    }
  }
</script>

<div class={cn('@container/qr-card w-full min-w-0 justify-self-center', className)} data-testid="discover-qr-card">
<details class="qr-details group/qr mx-auto w-full max-w-[440px]" bind:this={details} data-testid="discover-qr-details">
  <summary
    class="qr-teaser flex cursor-pointer list-none items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground shadow-sm select-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none group-open/qr:mb-3 [&::-webkit-details-marker]:hidden"
    data-testid="discover-qr-teaser"
  >
    <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground" aria-hidden="true"><QrCode class="size-4" /></span>
    <span class="min-w-0 flex-1 text-callout font-medium text-foreground">Make a WhatsApp QR card for your shop</span>
    <ChevronDown
      class="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open/qr:rotate-180 motion-reduce:transition-none"
      aria-hidden="true"
    />
  </summary>
<div class="relative w-full pt-3">
  <Badge class="absolute top-0 left-6 z-10 uppercase">Try one · no sign-up</Badge>
  <div class="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
    <div>
      <h2 class="text-title-3 font-semibold text-foreground">WhatsApp QR card</h2>
      <p class="text-subheadline text-muted-foreground">Customers scan it and land in your WhatsApp chat.</p>
    </div>

    <div class="grid items-start gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <div class="flex min-w-0 flex-col gap-1.5">
        <Label for="{uid}-shop">Shop name</Label>
        <Input id="{uid}-shop" bind:value={shop} maxlength={SHOP_MAX} placeholder="Your shop name" />
      </div>
      <div class="flex min-w-0 flex-col gap-1.5">
        <Label for="{uid}-phone">WhatsApp number</Label>
        <div class="flex gap-1.5">
          <Select.Root type="single" value={iso} onValueChange={(v) => (iso = v)}>
            <Select.Trigger class="w-[5.5rem] shrink-0 tabular-nums" aria-label={`Country code, ${dial.name}`} data-testid="discover-qr-country">
              {dial.iso} +{dial.code}
            </Select.Trigger>
            <Select.Content class="max-h-72">
              {#each DIAL_CODES as d (d.iso)}
                <Select.Item value={d.iso} label={`${d.name} +${d.code}`}>{d.name} <span class="text-muted-foreground tabular-nums">+{d.code}</span></Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          <Input
            id="{uid}-phone"
            class="min-w-0 tabular-nums"
            bind:value={phone}
            oninput={onPhoneInput}
            onblur={() => (touched = true)}
            inputmode="tel"
            autocomplete="tel-national"
            maxlength={24}
            placeholder={EXAMPLE_PHONE}
            aria-invalid={error ? true : undefined}
            aria-describedby="{uid}-phone-note"
          />
        </div>
        <p id="{uid}-phone-note" class={cn(error ? 'text-footnote text-ripple-error-text' : 'sr-only')} aria-live="polite">{error ?? ''}</p>
      </div>
    </div>

    <div class="flex flex-col gap-1.5">
      <Label for="{uid}-message">First message <span class="font-normal text-muted-foreground">optional</span></Label>
      <Input id="{uid}-message" bind:value={message} maxlength={MESSAGE_MAX} placeholder="What customers send when they scan" />
    </div>

    <div
      class="relative mx-auto grid aspect-[1.75/1] w-full -rotate-1 grid-cols-[1fr_auto] items-center gap-3.5 rounded-md border border-neutral-200 bg-white px-5 pt-4 pb-7 text-neutral-900 shadow-md transition-transform duration-150 hover:rotate-0 motion-reduce:rotate-0 motion-reduce:transition-none sm:w-[88%]"
      aria-live="polite"
      data-testid="discover-qr-preview"
    >
      <div class="min-w-0">
        <div class="text-title-3 font-bold! break-words sm:text-title-2" data-testid="discover-qr-shop">{shop.trim() || 'Your shop'}</div>
        <div class="mt-1.5 text-callout text-neutral-800 tabular-nums" data-testid="discover-qr-line">
          {check.ok ? check.line : 'Add your WhatsApp number'}
        </div>
        <div class="mt-3 text-footnote font-bold text-neutral-900">Scan to order on WhatsApp →</div>
      </div>
      {#if layout}
        <svg
          class="size-20 bg-white text-neutral-900 sm:size-24"
          viewBox="0 0 {layout.qr.path.size} {layout.qr.path.size}"
          shape-rendering="crispEdges"
          role="img"
          aria-label={`QR code that opens a WhatsApp chat with ${check.ok ? check.line : ''}`}
          data-testid="discover-qr-code"
        >
          <path d={layout.qr.path.d} fill="currentColor" />
        </svg>
      {:else}
        <div
          class="grid size-20 place-items-center rounded-sm border-2 border-dashed border-neutral-300 bg-neutral-50 px-1 text-center text-caption-1 text-neutral-600 sm:size-24"
          data-testid="discover-qr-placeholder"
        >
          QR appears when the number is complete
        </div>
      {/if}
      <div class="absolute bottom-1.5 left-5 text-caption-1 text-neutral-500">{cardFooter(brand)}</div>
    </div>

    <div class="flex flex-wrap gap-2">
      <Button disabled={!layout} onclick={() => void savePng()} data-testid="discover-qr-png"><Download />Download PNG</Button>
      <Button variant="outline" disabled={!layout} onclick={saveSvg} data-testid="discover-qr-svg">SVG</Button>
      <Button variant="outline" disabled={!layout} onclick={print} data-testid="discover-qr-print"><Printer />Print</Button>
    </div>
    {#if note}<p class="text-footnote text-ripple-error-text" role="status">{note}</p>{/if}

    {#if link}
      <div class="flex min-w-0 items-center gap-1 rounded-lg bg-muted px-2.5 py-1 text-footnote">
        <span class="min-w-0 flex-1 truncate text-muted-foreground" title={link} data-testid="discover-qr-link">{link}</span>
        <Button variant="ghost" size="icon-xs" aria-label="Copy the WhatsApp link" onclick={() => void copy(link)}>
          {#if copied}<Check />{:else}<Copy />{/if}
        </Button>
        {#if onopenlink}
          <Button variant="ghost" size="xs" onclick={() => onopenlink(link)}><ExternalLink />Test it</Button>
        {:else}
          <Button variant="ghost" size="xs" href={safeUrl(link)} target="_blank" rel="noopener noreferrer"><ExternalLink />Test it</Button>
        {/if}
      </div>
    {/if}

    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-footnote text-muted-foreground">
      <span>Free · runs in your browser</span>
      {#if onmake}
        <Button variant="link" size="xs" class="h-auto px-0 text-primary" onclick={() => onmake(shop)}>Make a full menu or site with {brand}</Button>
      {:else if makeHref}
        <Button variant="link" size="xs" class="h-auto px-0 text-primary" href={safeUrl(makeHref)}>Make a full menu or site with {brand}</Button>
      {/if}
    </div>
  </div>
</div>
</details>
</div>

<style>
  /* From 30rem of the card's own box: no teaser, the body shows while the
     details stay closed (so the server markup never changes with width). */
  @container qr-card (min-width: 30rem) {
    @supports selector(::details-content) {
      .qr-details > summary {
        display: none;
      }
      .qr-details::details-content {
        content-visibility: visible;
      }
    }
  }
</style>
