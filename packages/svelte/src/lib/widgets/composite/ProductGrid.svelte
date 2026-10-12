<!--
  widgets/composite/ProductGrid.svelte: `product-grid` (aliases `products`,
  `deals`, `shop-grid`). A shop shelf: the model lists products, the widget
  owns the cards (generated cover, price, was-price and computed discount,
  rating, spec chips), sorting, category chips and a Compare tray.

  Invariants:
  - Product rows are $derived from props (streamed ends equal to whole).
    Only sort, category and the compare picks are $state.
  - The cover is generated from `color` or the name. An `image` draws over
    it only through safeUrl(kind resource) and is dropped on a load error.
  - No links out. `on_choose` (as `onchoose`) fires with { id, name, text }
    on Choose, and with { ids, names, text: "Compare A and B" } from the tray.
-->
<script module lang="ts">
	import { finite, money } from '../data-kit/index.js';
	import { compact, rows, text, within, words } from './cover-art.js';

	export const MAX_PRODUCTS = 24;
	export const MAX_COMPARE = 3;
	export type SortKey = 'featured' | 'price' | 'discount' | 'rating';

	export interface Product {
		key: string;
		name: string;
		brand: string;
		category: string;
		price?: number;
		was?: number;
		off?: number;
		rating?: number;
		reviews?: number;
		badge: string;
		color: unknown;
		image: string;
		specs: string[];
	}

	export function readProducts(v: unknown): Product[] {
		return rows<Record<string, unknown>>(v, MAX_PRODUCTS)
			.map((r) => {
				const price = within(r.price, 0, 1e9);
				const wasIn = within(r.was ?? r.original_price, 0, 1e9);
				const was = price !== undefined && wasIn !== undefined && wasIn > price ? wasIn : undefined;
				return {
					key: r.key,
					name: text(r.name ?? r.title, 80),
					brand: text(r.brand, 40),
					category: text(r.category, 30),
					price,
					was,
					off: was ? Math.round((1 - price! / was) * 100) : undefined,
					rating: within(r.rating, 0, 5),
					reviews: within(r.reviews, 0, 1e9),
					badge: text(r.badge, 24),
					color: r.color,
					image: typeof r.image === 'string' ? r.image : '',
					specs: words(r.specs, 3, 28)
				};
			})
			.filter((p) => p.name);
	}

	const last = (n: number | undefined, asc: boolean) => (n === undefined ? Infinity : asc ? n : -n);

	export function viewOf(list: Product[], sort: SortKey, category: string | null): Product[] {
		const out = category ? list.filter((p) => p.category === category) : [...list];
		if (sort === 'price') out.sort((a, b) => last(a.price, true) - last(b.price, true));
		if (sort === 'discount') out.sort((a, b) => last(a.off, false) - last(b.off, false));
		if (sort === 'rating') out.sort((a, b) => last(a.rating, false) - last(b.rating, false));
		return out;
	}

	export const compareText = (names: string[]) =>
		`Compare ${names.length > 2 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join(' and ')}`;

	export const priceOf = (n: number | undefined, currency: unknown) => (finite(n) === undefined ? '' : money(n, currency));
	export { compact };
</script>

<script lang="ts">
	import { safeStyle, safeUrl } from '@ripple-ui/core';
	import Star from '@lucide/svelte/icons/star';
	import Check from '@lucide/svelte/icons/check';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import Scale from '@lucide/svelte/icons/scale';
	import { grad, initials, paletteFor } from './cover-art.js';

	interface Props {
		id?: string;
		class?: string;
		style?: string | Record<string, string>;
		title?: string;
		currency?: string;
		products?: unknown[];
		/** Category chips. Default true; shown when there are two or more categories. */
		filters?: boolean;
		onchoose?: (v: { id?: string; name?: string; ids?: string[]; names?: string[]; text: string }) => void;
	}

	let { id, class: className, style, title, currency = 'USD', products, filters = true, onchoose }: Props = $props();

	const SORTS: [SortKey, string][] = [['featured', 'Featured'], ['price', 'Price'], ['discount', 'Discount'], ['rating', 'Rating']];

	let sort = $state<SortKey>('featured');
	let category = $state<string | null>(null);
	let picks = $state<string[]>([]);
	let broken = $state<Record<string, boolean>>({});

	const rootStyle = $derived(
		style && typeof style === 'object' ? safeStyle(Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';')) : safeStyle(typeof style === 'string' ? style : '')
	);
	const heading = $derived(text(title, 80));
	const cur = $derived(typeof currency === 'string' && /^[A-Z]{3}$/i.test(currency) ? currency.toUpperCase() : 'USD');
	const list = $derived(readProducts(products));
	const categories = $derived([...new Set(list.map((p) => p.category).filter(Boolean))]);
	const view = $derived(viewOf(list, sort, category));
	const picked = $derived(picks.map((k) => list.find((p) => p.key === k)).filter((p): p is Product => !!p));

	function togglePick(key: string) {
		picks = picks.includes(key) ? picks.filter((k) => k !== key) : picks.length < MAX_COMPARE ? [...picks, key] : picks;
	}

	const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ripple-ring';
	const chip = 'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-footnote font-medium transition-colors duration-150 motion-reduce:transition-none';
	const chipOff = 'border-ripple-border bg-ripple-surface text-ripple-foreground hover:bg-ripple-muted';
	const chipOn = 'border-ripple-accent bg-ripple-accent/10 text-ripple-accent';
</script>

<div {id} class={['@container flex w-full flex-col gap-3 text-ripple-foreground', className]} style={rootStyle} data-widget="product-grid">
	{#if heading}
		<header class="flex flex-col gap-0.5">
			<h2 class="text-title-3 font-semibold text-pretty">{heading}</h2>
			<p class="text-footnote text-ripple-muted-foreground">{list.length} {list.length === 1 ? 'product' : 'products'}</p>
		</header>
	{/if}

	{#if list.length > 1}
		<div class="flex flex-col gap-2" data-slot="controls">
			{#if filters && categories.length > 1}
				<div class="flex gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="Category">
					<button type="button" class={[chip, 'shrink-0', !category ? chipOn : chipOff, focusRing]} aria-pressed={!category} onclick={() => (category = null)}>All</button>
					{#each categories as c (c)}
						<button type="button" class={[chip, 'shrink-0', category === c ? chipOn : chipOff, focusRing]} aria-pressed={category === c} onclick={() => (category = category === c ? null : c)}>{c}</button>
					{/each}
				</div>
			{/if}
			<div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Sort by">
				<span class="mr-1 text-footnote text-ripple-muted-foreground">Sort</span>
				{#each SORTS as [k, label] (k)}
					<button type="button" class={[chip, 'h-7 px-2.5', sort === k ? chipOn : chipOff, focusRing]} aria-pressed={sort === k} onclick={() => (sort = k)}>{label}</button>
				{/each}
			</div>
		</div>
	{/if}

	<ul class="grid grid-cols-2 gap-2.5 @min-[620px]:grid-cols-3 @min-[900px]:grid-cols-4" aria-label="Products" data-slot="grid">
		{#each view as p (p.key)}
			{@const pal = paletteFor(p.color, p.brand || p.name)}
			{@const inTray = picks.includes(p.key)}
			<li class="min-w-0">
				<article class={['flex h-full flex-col overflow-hidden rounded-ripple border bg-ripple-surface transition-colors duration-150 motion-reduce:transition-none', inTray ? 'border-ripple-accent' : 'border-ripple-border']} data-product={p.key}>
					<div class="relative aspect-[4/3] overflow-hidden" style:background-image={grad(pal)} data-slot="cover">
						<span class="pg-sheen absolute inset-0" aria-hidden="true"></span>
						<span class="absolute inset-0 grid place-items-center text-[clamp(1.75rem,9cqi,2.75rem)] font-semibold tracking-tight text-white/90 drop-shadow-sm" aria-hidden="true">{initials(p.brand || p.name)}</span>
						{#if p.image && !broken[p.key]}
							<img src={safeUrl(p.image, { kind: 'resource' })} alt="" class="absolute inset-0 size-full object-cover" loading="lazy" referrerpolicy="no-referrer" onerror={() => (broken[p.key] = true)} />
						{/if}
						{#if p.badge}<span class="absolute top-2 left-2 rounded-full bg-white/95 px-2 py-0.5 text-caption-1 font-semibold text-slate-900 shadow-sm" data-slot="badge">{p.badge}</span>{/if}
						{#if p.off}<span class="absolute top-2 right-2 rounded-full bg-rose-600 px-2 py-0.5 text-caption-1 font-semibold text-white tabular-nums shadow-sm" data-slot="discount">-{p.off}%</span>{/if}
					</div>
					<div class="flex flex-1 flex-col gap-1.5 p-3">
						{#if p.brand}<p class="truncate text-caption-1 font-medium tracking-wide text-ripple-muted-foreground uppercase">{p.brand}</p>{/if}
						<h3 class="line-clamp-2 text-callout leading-snug font-semibold" data-slot="name">{p.name}</h3>
						{#if p.rating !== undefined}
							<p class="flex items-center gap-1 text-footnote text-ripple-muted-foreground" data-slot="rating">
								<Star size={13} class="fill-amber-400 text-amber-400" aria-hidden="true" />
								<span class="font-medium text-ripple-foreground tabular-nums">{p.rating.toFixed(1)}</span>
								{#if p.reviews !== undefined}<span class="tabular-nums">({compact(p.reviews)})</span>{/if}
							</p>
						{/if}
						{#if p.specs.length}
							<div class="flex flex-wrap gap-1">
								{#each p.specs as s (s)}<span class="rounded-md bg-ripple-muted px-1.5 py-0.5 text-caption-1 text-ripple-muted-foreground">{s}</span>{/each}
							</div>
						{/if}
						<p class="mt-auto flex flex-wrap items-baseline gap-x-1.5 pt-1" data-slot="price">
							<span class="text-title-3 font-semibold tabular-nums">{priceOf(p.price, cur) || 'See price'}</span>
							{#if p.was}<s class="text-footnote text-ripple-muted-foreground tabular-nums" aria-label="was {priceOf(p.was, cur)}">{priceOf(p.was, cur)}</s>{/if}
						</p>
						<div class="flex items-center gap-1.5">
							<button
								type="button"
								class={['inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-footnote font-medium transition-colors duration-150 disabled:opacity-40 motion-reduce:transition-none', inTray ? chipOn : chipOff, focusRing]}
								aria-pressed={inTray}
								aria-label="Compare {p.name}"
								disabled={!inTray && picks.length >= MAX_COMPARE}
								onclick={() => togglePick(p.key)}
								data-slot="compare"
							>
								{#if inTray}<Check size={14} aria-hidden="true" />{:else}<Plus size={14} aria-hidden="true" />{/if}Compare
							</button>
							{#if onchoose}
								<button
									type="button"
									class={['ml-auto inline-flex h-8 items-center rounded-full bg-ripple-accent px-3 text-footnote font-semibold text-ripple-accent-foreground hover:opacity-90', focusRing]}
									aria-label="Choose {p.name}"
									onclick={() => onchoose?.({ id: p.key, name: p.name, text: `I'll take the ${p.name}` })}
									data-slot="choose">Choose</button
								>
							{/if}
						</div>
					</div>
				</article>
			</li>
		{:else}
			<li class="col-span-full rounded-ripple border border-dashed border-ripple-border p-6 text-center text-callout text-ripple-muted-foreground">No products yet.</li>
		{/each}
	</ul>

	{#if picked.length}
		<div class="sticky bottom-2 z-10 flex flex-wrap items-center gap-2 rounded-ripple border border-ripple-border bg-ripple-surface/95 p-2 shadow-lg backdrop-blur" role="region" aria-label="Compare tray" data-slot="tray">
			<Scale size={16} class="ml-1 text-ripple-muted-foreground" aria-hidden="true" />
			{#each picked as p (p.key)}
				<span class="inline-flex max-w-44 items-center gap-1 rounded-full bg-ripple-muted py-0.5 pr-1 pl-2.5 text-footnote">
					<span class="truncate">{p.name}</span>
					<button type="button" class={['grid size-5 place-items-center rounded-full hover:bg-ripple-border', focusRing]} aria-label="Remove {p.name} from compare" onclick={() => togglePick(p.key)}><X size={12} aria-hidden="true" /></button>
				</span>
			{/each}
			<span class="text-caption-1 text-ripple-muted-foreground">{picked.length < 2 ? 'Pick one more' : `${picked.length} of ${MAX_COMPARE}`}</span>
			<button
				type="button"
				class={['ml-auto inline-flex h-8 items-center rounded-full bg-ripple-accent px-3 text-footnote font-semibold text-ripple-accent-foreground disabled:opacity-40', focusRing]}
				disabled={picked.length < 2 || !onchoose}
				onclick={() => onchoose?.({ ids: picked.map((p) => p.key), names: picked.map((p) => p.name), text: compareText(picked.map((p) => p.name)) })}
				data-slot="compare-go">Compare {picked.length}</button
			>
		</div>
	{/if}
</div>

<style>
	.pg-sheen {
		background:
			radial-gradient(circle at 20% 15%, rgb(255 255 255 / 0.4), transparent 50%),
			repeating-linear-gradient(-45deg, rgb(255 255 255 / 0.06) 0 8px, transparent 8px 18px);
	}
</style>
