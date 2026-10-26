<!--
  widgets/composite/PlaceResults.svelte: `place-results` (aliases `places`,
  `place-list`). Search results for cafes, restaurants, parks and the like:
  the model lists places, the widget owns the cards, sorting, the Open now
  filter and a map whose numbered pins follow the cards.

  Invariants:
  - Every place row is $derived from props, so a streamed card ends equal to
    a whole one. Only the visitor's sort, filter and selection are $state.
  - Covers are generated from `kind` (no images, no links out).
  - Pin numbers are card positions in the current view, so card 2 is pin 2.
    Selecting a card colours its pin and a pin click selects (and scrolls to)
    its card.
  - The map shows only when some place has coordinates, unless `showMap` is
    false. It uses the map widget, so the host's default tiles apply.
  - `on_choose` (as `onchoose`) fires on "Tell me more" with { id, name, text }.
-->
<script module lang="ts">
	import { finite } from '../data-kit/index.js';
	import { PALETTE, compact, rows, text, within, words } from './cover-art.js';

	export const MAX_PLACES = 20;
	export const KINDS = ['cafe', 'restaurant', 'bar', 'bakery', 'shop', 'park', 'museum', 'hotel', 'other'] as const;
	export type Kind = (typeof KINDS)[number];
	export const KIND_LABEL: Record<Kind, string> = {
		cafe: 'Cafe', restaurant: 'Restaurant', bar: 'Bar', bakery: 'Bakery', shop: 'Shop', park: 'Park', museum: 'Museum', hotel: 'Hotel', other: 'Place'
	};
	export const KIND_PALETTE: Record<Kind, [string, string]> = {
		cafe: PALETTE.amber, restaurant: PALETTE.orange, bar: PALETTE.violet, bakery: PALETTE.rose, shop: PALETTE.blue,
		park: PALETTE.green, museum: PALETTE.slate, hotel: PALETTE.teal, other: PALETTE.slate
	};
	export type SortKey = 'best' | 'rating' | 'distance' | 'price';

	export interface Place {
		key: string;
		name: string;
		kind: Kind;
		rating?: number;
		reviews?: number;
		price?: number;
		distance?: string;
		km?: number;
		walk?: number;
		open?: boolean;
		hours: string;
		address: string;
		tags: string[];
		blurb: string;
		lat?: number;
		lng?: number;
	}

	const toKind = (v: unknown): Kind => {
		const k = typeof v === 'string' ? v.toLowerCase().trim() : '';
		return (KINDS as readonly string[]).includes(k) ? (k as Kind) : k === 'coffee' || k === 'coffee shop' ? 'cafe' : 'other';
	};

	/** "0.4 km", "350 m", "1.2 mi" or a bare number of km, to a label and a km figure for sorting. */
	function readDistance(v: unknown): { distance?: string; km?: number } {
		const n = finite(v);
		if (n !== undefined && n >= 0) return { distance: n < 1 ? `${Math.round(n * 1000)} m` : `${Number(n.toFixed(1))} km`, km: n };
		const s = text(v, 16);
		const m = /^([\d.]+)\s*(km|m|mi)?\b/i.exec(s);
		if (!m) return s ? { distance: s } : {};
		const x = Number(m[1]);
		const unit = (m[2] ?? 'km').toLowerCase();
		return { distance: s, km: unit === 'm' ? x / 1000 : unit === 'mi' ? x * 1.609 : x };
	}

	export function readPlaces(v: unknown): Place[] {
		return rows<Record<string, unknown>>(v, MAX_PLACES)
			.map((r) => {
				const lat = within(r.lat, -90, 90);
				const lng = within(r.lng ?? r.lon, -180, 180);
				const price = within(r.price, 1, 4);
				return {
					key: r.key,
					name: text(r.name ?? r.title, 80),
					kind: toKind(r.kind ?? r.type),
					rating: within(r.rating, 0, 5),
					reviews: within(r.reviews, 0, 1e9),
					price: price === undefined ? undefined : Math.round(price),
					...readDistance(r.distance),
					walk: within(r.walkMinutes, 0, 600),
					open: typeof r.open === 'boolean' ? r.open : undefined,
					hours: text(r.hours, 40),
					address: text(r.address, 120),
					tags: words(r.tags, 4),
					blurb: text(r.blurb, 240),
					...(lat !== undefined && lng !== undefined ? { lat, lng } : {})
				};
			})
			.filter((p) => p.name);
	}

	const last = (n: number | undefined, asc: boolean) => (n === undefined ? Infinity : asc ? n : -n);

	/** Sorted and filtered copy. Places with no figure for the key go last; ties keep model order. */
	export function viewOf(list: Place[], sort: SortKey, openOnly: boolean): Place[] {
		const out = openOnly ? list.filter((p) => p.open === true) : [...list];
		if (sort === 'rating') out.sort((a, b) => last(a.rating, false) - last(b.rating, false));
		if (sort === 'distance') out.sort((a, b) => last(a.km ?? a.walk, true) - last(b.km ?? b.walk, true));
		if (sort === 'price') out.sort((a, b) => last(a.price, true) - last(b.price, true));
		return out;
	}

	export const reviewsLabel = (n: number) => compact(n);
</script>

<script lang="ts">
	import { safeStyle } from '@ripple-ui/core';
	import Coffee from '@lucide/svelte/icons/coffee';
	import Utensils from '@lucide/svelte/icons/utensils-crossed';
	import Wine from '@lucide/svelte/icons/wine';
	import Croissant from '@lucide/svelte/icons/croissant';
	import ShoppingBag from '@lucide/svelte/icons/shopping-bag';
	import Trees from '@lucide/svelte/icons/trees';
	import Landmark from '@lucide/svelte/icons/landmark';
	import Bed from '@lucide/svelte/icons/bed-double';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Star from '@lucide/svelte/icons/star';
	import Footprints from '@lucide/svelte/icons/footprints';
	import MapView from '../data/Map.svelte';
	import { grad } from './cover-art.js';

	interface Props {
		id?: string;
		class?: string;
		style?: string | Record<string, string>;
		title?: string;
		query?: string;
		places?: unknown[];
		showMap?: boolean;
		onchoose?: (v: { id: string; name: string; text: string }) => void;
	}

	let { id, class: className, style, title, query, places, showMap, onchoose }: Props = $props();

	const ICONS = { cafe: Coffee, restaurant: Utensils, bar: Wine, bakery: Croissant, shop: ShoppingBag, park: Trees, museum: Landmark, hotel: Bed, other: MapPin };
	const SORTS: [SortKey, string][] = [['best', 'Best match'], ['rating', 'Rating'], ['distance', 'Distance'], ['price', 'Price']];
	const uid = $props.id();

	let sort = $state<SortKey>('best');
	let openOnly = $state(false);
	let selected = $state<string | null>(null);

	const rootStyle = $derived(
		style && typeof style === 'object' ? safeStyle(Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';')) : safeStyle(typeof style === 'string' ? style : '')
	);
	const heading = $derived(text(title, 80));
	const sub = $derived(text(query, 120));
	const list = $derived(readPlaces(places));
	const view = $derived(viewOf(list, sort, openOnly));
	const anyOpen = $derived(list.some((p) => p.open !== undefined));
	const located = $derived(view.map((p, i) => ({ p, n: i + 1 })).filter(({ p }) => p.lat !== undefined));
	const mapOn = $derived(showMap !== false && list.some((p) => p.lat !== undefined));
	const ACCENT = '#1877f2';
	const markers = $derived(
		located.map(({ p, n }) => ({ id: p.key, lat: p.lat!, lng: p.lng!, label: String(n), color: selected === p.key ? ACCENT : '#64748b' }))
	);
	const bounds = $derived.by(() => {
		const pts = located.map(({ p }) => [p.lat!, p.lng!] as [number, number]);
		if (!pts.length) return undefined;
		const lats = pts.map((x) => x[0]);
		const lngs = pts.map((x) => x[1]);
		const pad = 0.002;
		return [
			[Math.min(...lats) - pad, Math.min(...lngs) - pad],
			[Math.max(...lats) + pad, Math.max(...lngs) + pad]
		] as [[number, number], [number, number]];
	});

	function pick(key: string, scroll = false) {
		selected = selected === key && !scroll ? null : key;
		if (scroll) document.getElementById(`${uid}-${key}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}

	const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ripple-ring';
	const chip = 'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-footnote font-medium transition-colors duration-150 motion-reduce:transition-none';
	const chipOff = 'border-ripple-border bg-ripple-surface text-ripple-foreground hover:bg-ripple-muted';
	const chipOn = 'border-ripple-accent bg-ripple-accent/10 text-ripple-accent';
</script>

<div {id} class={['@container flex w-full flex-col gap-3 text-ripple-foreground', className]} style={rootStyle} data-widget="place-results">
	{#if heading || sub}
		<header class="flex flex-col gap-0.5">
			{#if heading}<h2 class="text-title-3 font-semibold text-pretty">{heading}</h2>{/if}
			<p class="text-footnote text-ripple-muted-foreground">
				{#if sub}{sub} · {/if}{list.length} {list.length === 1 ? 'place' : 'places'}
			</p>
		</header>
	{/if}

	{#if list.length > 1}
		<div class="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Sort and filter places" data-slot="controls">
			<div class="flex flex-wrap gap-1.5" role="group" aria-label="Sort by">
				{#each SORTS as [k, label] (k)}
					<button type="button" class={[chip, sort === k ? chipOn : chipOff, focusRing]} aria-pressed={sort === k} onclick={() => (sort = k)}>{label}</button>
				{/each}
			</div>
			{#if anyOpen}
				<span class="mx-1 hidden h-5 w-px bg-ripple-border @min-[420px]:block" aria-hidden="true"></span>
				<button type="button" class={[chip, openOnly ? chipOn : chipOff, focusRing]} aria-pressed={openOnly} onclick={() => (openOnly = !openOnly)} data-slot="open-filter">
					<span class="size-2 rounded-full bg-emerald-500" aria-hidden="true"></span>Open now
				</button>
			{/if}
		</div>
	{/if}

	<div class={['grid gap-3', mapOn && '@min-[760px]:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]']}>
		{#if mapOn}
			<div class="overflow-hidden rounded-ripple border border-ripple-border @min-[760px]:sticky @min-[760px]:top-2 @min-[760px]:order-2 @min-[760px]:self-start" data-slot="map">
				<MapView {markers} {bounds} boundsPadding={24} height="clamp(220px, 34vh, 380px)" showControls={false} onmarkerclick={(k) => pick(k, true)} />
			</div>
		{/if}

		<ol class="grid content-start gap-2.5 @min-[560px]:max-@min-[760px]:grid-cols-2" aria-label="Places" data-slot="list">
			{#each view as p, i (p.key)}
				{@const Icon = ICONS[p.kind]}
				{@const on = selected === p.key}
				<li id="{uid}-{p.key}" class="min-w-0">
					<article
						class={[
							'group relative flex h-full gap-3 rounded-ripple border bg-ripple-surface p-3 transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none',
							on ? 'border-ripple-accent shadow-[0_0_0_3px_color-mix(in_oklab,var(--ripple-accent)_18%,transparent)]' : 'border-ripple-border hover:border-ripple-surface-foreground/20'
						]}
						data-place={p.key}
						data-selected={on || undefined}
					>
						<button type="button" class={['absolute inset-0 rounded-ripple', focusRing]} aria-label="Show {p.name} on the map" aria-pressed={on} onclick={() => pick(p.key)}></button>
						<div class="pointer-events-none relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl @min-[420px]:size-20" style:background-image={grad(KIND_PALETTE[p.kind])} aria-hidden="true" data-slot="cover">
							<span class="pr-sheen absolute inset-0"></span>
							<Icon size={26} strokeWidth={1.5} class="relative text-white drop-shadow" />
							<span class={['absolute top-1 left-1 grid size-5 place-items-center rounded-full text-[11px] font-semibold tabular-nums', on ? 'bg-ripple-accent text-white' : 'bg-white/90 text-slate-800']} data-slot="pin-number">{i + 1}</span>
						</div>
						<div class="pointer-events-none flex min-w-0 flex-1 flex-col gap-1">
							<div class="flex items-start justify-between gap-2">
								<h3 class="truncate text-callout font-semibold" data-slot="name">{p.name}</h3>
								{#if p.open !== undefined}
									<span class={['shrink-0 rounded-full px-2 py-0.5 text-caption-1 font-medium', p.open ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400' : 'bg-ripple-muted text-ripple-muted-foreground']} data-slot="open">
										{p.open ? 'Open' : 'Closed'}
									</span>
								{/if}
							</div>
							<p class="flex flex-wrap items-center gap-x-1.5 text-footnote text-ripple-muted-foreground" data-slot="meta">
								{#if p.rating !== undefined}
									<span class="inline-flex items-center gap-0.5 font-medium text-ripple-foreground tabular-nums"><Star size={13} class="fill-amber-400 text-amber-400" aria-hidden="true" />{p.rating.toFixed(1)}</span>
									{#if p.reviews !== undefined}<span class="tabular-nums">({reviewsLabel(p.reviews)})</span>{/if}
									<span aria-hidden="true">·</span>
								{/if}
								{#if p.price}<span aria-label="Price level {p.price} of 4"><span class="text-ripple-foreground">{'$'.repeat(p.price)}</span><span class="opacity-40">{'$'.repeat(4 - p.price)}</span></span><span aria-hidden="true">·</span>{/if}
								<span>{KIND_LABEL[p.kind]}</span>
							</p>
							{#if p.distance || p.walk !== undefined || p.hours}
								<p class="flex flex-wrap items-center gap-x-2 text-footnote text-ripple-muted-foreground" data-slot="where">
									{#if p.distance}<span class="inline-flex items-center gap-1"><MapPin size={12} aria-hidden="true" />{p.distance}</span>{/if}
									{#if p.walk !== undefined}<span class="inline-flex items-center gap-1"><Footprints size={12} aria-hidden="true" />{p.walk} min walk</span>{/if}
									{#if p.hours}<span>{p.hours}</span>{/if}
								</p>
							{/if}
							{#if p.blurb}<p class="line-clamp-2 text-footnote text-ripple-foreground/80" data-slot="blurb">{p.blurb}</p>{/if}
							<div class="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
								{#each p.tags as t (t)}
									<span class="rounded-full bg-ripple-muted px-2 py-0.5 text-caption-1 text-ripple-muted-foreground">{t}</span>
								{/each}
								{#if onchoose}
									<button
										type="button"
										class={['pointer-events-auto relative ml-auto rounded-full px-2.5 py-1 text-footnote font-medium text-ripple-accent hover:bg-ripple-accent/10', focusRing]}
										onclick={() => onchoose?.({ id: p.key, name: p.name, text: `Tell me more about ${p.name}` })}
										data-slot="choose">Tell me more</button
									>
								{/if}
							</div>
						</div>
					</article>
				</li>
			{:else}
				<li class="rounded-ripple border border-dashed border-ripple-border p-6 text-center text-callout text-ripple-muted-foreground">
					{list.length ? 'Nothing open right now.' : 'No places yet.'}
				</li>
			{/each}
		</ol>
	</div>
</div>

<style>
	.pr-sheen {
		background:
			radial-gradient(circle at 25% 20%, rgb(255 255 255 / 0.4), transparent 50%),
			repeating-linear-gradient(45deg, rgb(255 255 255 / 0.07) 0 6px, transparent 6px 14px);
	}
</style>
