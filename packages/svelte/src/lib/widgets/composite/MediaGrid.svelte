<!--
  widgets/composite/MediaGrid.svelte: `media-grid` (aliases `watchlist`,
  `podcasts`, `shows`). A shelf of documentaries, films, series, podcasts,
  books or albums: the model lists items, the widget owns generated poster
  art, genre filters, an "Add to list" toggle with a My list view, and a
  details panel.

  Invariants:
  - Item rows are $derived from props (streamed ends equal to whole). Only
    the genre, the view, the open panel and the saved ids are $state.
  - `value` ({ saved: ids }) is the bound field (default value / onchange),
    written on Add / Remove only; a bound value is read until the visitor
    changes the list.
  - Posters are generated (gradient, pattern, title type). An `image` draws
    over one only through safeUrl(kind resource) and is dropped on error.
  - Shape: 2:3 for documentary, film, series and book; square for podcast
    and album. No links out; `on_choose` fires with { id, name, text }.
-->
<script module lang="ts">
	import { finite } from '../data-kit/index.js';
	import { rows, text, within, words } from './cover-art.js';

	export const MAX_ITEMS = 24;
	export const KINDS = ['documentary', 'film', 'series', 'podcast', 'book', 'album'] as const;
	export type Kind = (typeof KINDS)[number];
	export interface MediaValue {
		saved: string[];
	}

	export interface Item {
		key: string;
		title: string;
		by: string;
		year?: number;
		minutes?: number;
		episodes?: number;
		rating?: number;
		genres: string[];
		blurb: string;
		color: unknown;
		image: string;
	}

	export const toKind = (v: unknown): Kind => {
		const k = typeof v === 'string' ? v.toLowerCase().replace(/s$/, '') : '';
		return (KINDS as readonly string[]).includes(k) ? (k as Kind) : k === 'movie' ? 'film' : k === 'show' ? 'series' : 'documentary';
	};

	export function readItems(v: unknown): Item[] {
		return rows<Record<string, unknown>>(v, MAX_ITEMS)
			.map((r) => {
				const rating = within(r.rating, 0, 10);
				return {
					key: r.key,
					title: text(r.title ?? r.name, 80),
					by: text(r.by ?? r.author ?? r.host ?? r.director ?? r.artist, 60),
					year: within(r.year, 1800, 2200),
					minutes: within(r.minutes, 1, 6000),
					episodes: within(r.episodes, 1, 100000),
					rating: rating === undefined ? undefined : rating > 5 ? rating / 2 : rating,
					genres: words(r.genres, 4),
					blurb: text(r.blurb ?? r.description, 400),
					color: r.color,
					image: typeof r.image === 'string' ? r.image : ''
				};
			})
			.filter((i) => i.title);
	}

	export const savedOf = (v: unknown): string[] =>
		v && typeof v === 'object' && Array.isArray((v as MediaValue).saved) ? (v as MediaValue).saved.filter((s): s is string => typeof s === 'string') : [];

	export function metaOf(i: Item): string {
		const len = i.episodes !== undefined ? `${i.episodes} ${i.episodes === 1 ? 'episode' : 'episodes'}` : i.minutes !== undefined ? (i.minutes >= 90 ? `${Math.floor(i.minutes / 60)} h ${i.minutes % 60} min` : `${i.minutes} min`) : '';
		return [i.year, len].filter((x) => finite(x) !== undefined || (typeof x === 'string' && x)).join(' · ');
	}
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import { safeStyle, safeUrl } from '@ripple-ui/core';
	import Star from '@lucide/svelte/icons/star';
	import Bookmark from '@lucide/svelte/icons/bookmark';
	import BookmarkCheck from '@lucide/svelte/icons/bookmark-check';
	import X from '@lucide/svelte/icons/x';
	import Clapperboard from '@lucide/svelte/icons/clapperboard';
	import Film from '@lucide/svelte/icons/film';
	import Tv from '@lucide/svelte/icons/tv';
	import Mic from '@lucide/svelte/icons/mic';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Disc3 from '@lucide/svelte/icons/disc-3';
	import { grad, paletteFor } from './cover-art.js';

	interface Props {
		id?: string;
		class?: string;
		style?: string | Record<string, string>;
		title?: string;
		kind?: string;
		items?: unknown[];
		value?: MediaValue;
		onchange?: (value: MediaValue) => void;
		onchoose?: (v: { id: string; name: string; text: string }) => void;
	}

	let { id, class: className, style, title, kind, items, value = $bindable(), onchange, onchoose }: Props = $props();

	const ICONS = { documentary: Clapperboard, film: Film, series: Tv, podcast: Mic, book: BookOpen, album: Disc3 };
	const NOUN: Record<Kind, [string, string]> = {
		documentary: ['documentary', 'documentaries'], film: ['film', 'films'], series: ['series', 'series'],
		podcast: ['podcast', 'podcasts'], book: ['book', 'books'], album: ['album', 'albums']
	};
	const uid = $props.id();

	let genre = $state<string | null>(null);
	let mine = $state(false);
	let open = $state<string | null>(null);
	let local = $state<string[] | null>(null);
	let closeBtn = $state<HTMLButtonElement>();
	let opener: HTMLElement | null = null;
	let broken = $state<Record<string, boolean>>({});

	const rootStyle = $derived(
		style && typeof style === 'object' ? safeStyle(Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';')) : safeStyle(typeof style === 'string' ? style : '')
	);
	const k = $derived(toKind(kind));
	const square = $derived(k === 'podcast' || k === 'album');
	const heading = $derived(text(title, 80));
	const list = $derived(readItems(items));
	const saved = $derived(local ?? savedOf(value));
	const genres = $derived([...new Set(list.flatMap((i) => i.genres))].slice(0, 12));
	const view = $derived(list.filter((i) => (!mine || saved.includes(i.key)) && (!genre || i.genres.includes(genre))));
	const current = $derived(list.find((i) => i.key === open));

	function toggleSave(key: string) {
		const next = saved.includes(key) ? saved.filter((s) => s !== key) : [...saved, key];
		local = next;
		value = { saved: next };
		onchange?.({ saved: next });
	}

	async function show(key: string, e: MouseEvent) {
		opener = e.currentTarget as HTMLElement;
		open = key;
		await tick();
		closeBtn?.focus();
	}
	function close() {
		open = null;
		opener?.focus();
	}

	const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ripple-ring';
	const chip = 'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-footnote font-medium transition-colors duration-150 motion-reduce:transition-none';
	const chipOff = 'border-ripple-border bg-ripple-surface text-ripple-foreground hover:bg-ripple-muted';
	const chipOn = 'border-ripple-accent bg-ripple-accent/10 text-ripple-accent';
</script>

{#snippet poster(i: Item, big: boolean)}
	{@const Icon = ICONS[k]}
	<div class={['relative overflow-hidden rounded-xl text-white shadow-sm', square ? 'aspect-square' : 'aspect-[2/3]']} style:background-image={grad(paletteFor(i.color, i.title))} data-slot="poster">
		<span class="mg-pattern absolute inset-0" aria-hidden="true"></span>
		<span class="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" aria-hidden="true"></span>
		<Icon size={big ? 18 : 14} strokeWidth={1.75} class="absolute top-2.5 left-2.5 opacity-80" aria-hidden="true" />
		<span class={['absolute inset-x-2.5 bottom-2.5 flex flex-col gap-0.5', big && 'inset-x-4 bottom-4']} aria-hidden="true">
			<span class={['line-clamp-3 leading-[1.05] font-bold tracking-tight text-balance drop-shadow', big ? 'text-title-2' : 'text-[clamp(0.95rem,4.2cqi,1.2rem)]']}>{i.title}</span>
			{#if i.by}<span class="truncate text-caption-1 opacity-85">{i.by}</span>{/if}
		</span>
		{#if i.image && !broken[i.key]}
			<img src={safeUrl(i.image, { kind: 'resource' })} alt="" class="absolute inset-0 size-full object-cover" loading="lazy" referrerpolicy="no-referrer" onerror={() => (broken[i.key] = true)} />
		{/if}
	</div>
{/snippet}

<div {id} class={['@container relative flex w-full flex-col gap-3 text-ripple-foreground', className]} style={rootStyle} data-widget="media-grid" data-kind={k}>
	<header class="flex flex-wrap items-end justify-between gap-2">
		<div class="flex min-w-0 flex-col gap-0.5">
			{#if heading}<h2 class="text-title-3 font-semibold text-pretty">{heading}</h2>{/if}
			<p class="text-footnote text-ripple-muted-foreground">{list.length} {NOUN[k][list.length === 1 ? 0 : 1]}</p>
		</div>
		<div class="inline-flex rounded-full bg-ripple-muted p-0.5" role="group" aria-label="View">
			<button type="button" class={['h-7 rounded-full px-3 text-footnote font-medium', !mine ? 'bg-ripple-surface shadow-sm' : 'text-ripple-muted-foreground', focusRing]} aria-pressed={!mine} onclick={() => (mine = false)}>All</button>
			<button type="button" class={['h-7 rounded-full px-3 text-footnote font-medium tabular-nums', mine ? 'bg-ripple-surface shadow-sm' : 'text-ripple-muted-foreground', focusRing]} aria-pressed={mine} onclick={() => (mine = true)} data-slot="my-list">My list ({saved.length})</button>
		</div>
	</header>

	{#if genres.length > 1}
		<div class="flex gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="Genre">
			<button type="button" class={[chip, !genre ? chipOn : chipOff, focusRing]} aria-pressed={!genre} aria-label="All genres" onclick={() => (genre = null)}>All</button>
			{#each genres as g (g)}
				<button type="button" class={[chip, genre === g ? chipOn : chipOff, focusRing]} aria-pressed={genre === g} onclick={() => (genre = genre === g ? null : g)}>{g}</button>
			{/each}
		</div>
	{/if}

	<ul class={['grid gap-x-3 gap-y-4', square ? 'grid-cols-2 @min-[520px]:grid-cols-3 @min-[820px]:grid-cols-4' : 'grid-cols-2 @min-[460px]:grid-cols-3 @min-[720px]:grid-cols-4 @min-[960px]:grid-cols-5']} aria-label={NOUN[k][1]} data-slot="grid">
		{#each view as i (i.key)}
			{@const on = saved.includes(i.key)}
			<li class="@container flex min-w-0 flex-col gap-1.5" data-item={i.key}>
				<div class="relative">
					<button type="button" class={['block w-full rounded-xl text-left transition-transform duration-150 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0', focusRing]} aria-label="Details for {i.title}" aria-haspopup="dialog" onclick={(e) => show(i.key, e)}>
						{@render poster(i, false)}
					</button>
					<button
						type="button"
						class={['absolute top-1.5 right-1.5 grid size-8 place-items-center rounded-full backdrop-blur transition-colors', on ? 'bg-white text-ripple-accent' : 'bg-black/35 text-white hover:bg-black/50', focusRing]}
						aria-pressed={on}
						aria-label={on ? `Remove ${i.title} from my list` : `Add ${i.title} to my list`}
						onclick={() => toggleSave(i.key)}
						data-slot="save"
					>
						{#if on}<BookmarkCheck size={16} aria-hidden="true" />{:else}<Bookmark size={16} aria-hidden="true" />{/if}
					</button>
				</div>
				<div class="flex min-w-0 flex-col px-0.5">
					<h3 class="truncate text-callout font-semibold" data-slot="title">{i.title}</h3>
					<p class="flex items-center gap-1.5 text-footnote text-ripple-muted-foreground">
						{#if i.rating !== undefined}<span class="inline-flex items-center gap-0.5 font-medium text-ripple-foreground tabular-nums"><Star size={12} class="fill-amber-400 text-amber-400" aria-hidden="true" />{i.rating.toFixed(1)}</span>{/if}
						<span class="truncate tabular-nums">{metaOf(i) || i.genres[0] || ''}</span>
					</p>
				</div>
			</li>
		{:else}
			<li class="col-span-full rounded-ripple border border-dashed border-ripple-border p-6 text-center text-callout text-ripple-muted-foreground">
				{mine ? 'Nothing on your list yet. Tap the bookmark on a poster to add it.' : 'Nothing here yet.'}
			</li>
		{/each}
	</ul>

	{#if current}
		{@const on = saved.includes(current.key)}
		<div class="absolute inset-0 z-20 flex justify-end rounded-ripple bg-black/30" data-slot="drawer-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && close()}>
			<div
				class="flex h-full w-full max-w-sm flex-col gap-3 overflow-y-auto rounded-ripple border border-ripple-border bg-ripple-surface p-4 shadow-xl"
				role="dialog"
				aria-modal="true"
				aria-labelledby="{uid}-dt"
				tabindex="-1"
				onkeydown={(e) => e.key === 'Escape' && close()}
				data-slot="drawer"
			>
				<div class="flex items-start justify-between gap-2">
					<h3 id="{uid}-dt" class="text-title-3 font-semibold text-pretty">{current.title}</h3>
					<button bind:this={closeBtn} type="button" class={['grid size-8 shrink-0 place-items-center rounded-full hover:bg-ripple-muted', focusRing]} aria-label="Close details" onclick={close}><X size={16} aria-hidden="true" /></button>
				</div>
				<div class="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-3">
					{@render poster(current, false)}
					<dl class="flex flex-col gap-1 text-footnote">
						{#if current.by}<dt class="text-ripple-muted-foreground">By</dt><dd class="font-medium">{current.by}</dd>{/if}
						{#if metaOf(current)}<dt class="text-ripple-muted-foreground">Length</dt><dd class="tabular-nums">{metaOf(current)}</dd>{/if}
						{#if current.rating !== undefined}<dt class="text-ripple-muted-foreground">Rating</dt><dd class="inline-flex items-center gap-1 tabular-nums"><Star size={12} class="fill-amber-400 text-amber-400" aria-hidden="true" />{current.rating.toFixed(1)} / 5</dd>{/if}
					</dl>
				</div>
				{#if current.genres.length}
					<div class="flex flex-wrap gap-1">{#each current.genres as g (g)}<span class="rounded-full bg-ripple-muted px-2 py-0.5 text-caption-1 text-ripple-muted-foreground">{g}</span>{/each}</div>
				{/if}
				{#if current.blurb}<p class="text-callout text-ripple-foreground/85" data-slot="blurb">{current.blurb}</p>{/if}
				<div class="mt-auto flex flex-wrap gap-2 pt-1">
					<button type="button" class={['inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-footnote font-semibold', on ? chipOn : chipOff, focusRing]} aria-pressed={on} onclick={() => toggleSave(current.key)}>
						{#if on}<BookmarkCheck size={15} aria-hidden="true" />On my list{:else}<Bookmark size={15} aria-hidden="true" />Add to list{/if}
					</button>
					{#if onchoose}
						<button type="button" class={['inline-flex h-9 items-center rounded-full bg-ripple-accent px-3.5 text-footnote font-semibold text-ripple-accent-foreground', focusRing]} onclick={() => onchoose?.({ id: current.key, name: current.title, text: `Tell me more about ${current.title}` })} data-slot="choose">Tell me more</button>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.mg-pattern {
		background:
			radial-gradient(circle at 80% 10%, rgb(255 255 255 / 0.35), transparent 45%),
			radial-gradient(circle, rgb(255 255 255 / 0.12) 1px, transparent 1.5px) 0 0 / 10px 10px;
	}
</style>
