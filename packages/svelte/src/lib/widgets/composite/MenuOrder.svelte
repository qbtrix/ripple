<!--
  widgets/composite/MenuOrder.svelte — `menu-order`: order from a menu inside a
  chat card (design doc 2026-10-09 §3.3, §4). One node, four stages: menu,
  customise (option tiles, details below), details (pickup or delivery, name,
  contact) and review (lines, options, fee, total).

  Menu: the layout follows the photos that load. With none (the model-only
  chat case, or every photo failed) it is a grouped list: full-width category
  headings, then hairline rows (muted kind glyph, name and description
  clamped to 2 lines; every row has the price top-right on the name's first
  line with the control under it), two columns from 560px in a group of 2+.
  Any photo still loading or loaded gives photo cards in one auto-fill grid
  with no category headings (small groups would strand one card per row); a
  failed photo keeps its slot with the kind icon. Glyphs come from DISH: the
  generic kinds draw neutral dishes, never a specific food. The pick ("Picked
  for you") is a tinted row above the groups, its name on the rows' text edge,
  never listed twice. Chips show only for 2+ categories and 8+ items, and wrap.
  Placeholders show only while the spec streams in ('ui-streaming' is
  'active'); a settled card collapses a missing price and names a nameless
  item by its id in words. Price 0 is Free; the headline's "from" counts only
  prices above 0. A repeated product_id shares one
  cart line and only its first row is highlighted. One primary button per
  stage, in a sticky footer bar (hairline top, inset like the rows) that
  carries the item count and subtotal (the review adds the fee). A priced item
  that cannot be ordered shows its price like any other, with no control. Customise joins the stage rail only once an item with
  options is in play, so no skipped stage shows as done.

  Customise: the item's photo, or a tinted tile with its kind icon and name;
  a live line of what is chosen and the running price; then one card per
  option group. Every option is a tile with an icon inferred from its name
  (data-kit OPTION_ICONS / optionIconKey; an unknown name takes its group's
  icon, an `icon` outside the map is ignored), its price change as a pill and a
  check. Two or three short single choices sit in one segmented row (Size);
  other groups are a tile grid, two columns from 560px. Tiles wrap real radio
  and checkbox inputs, so labels, `disabled` and forms behave natively; arrow
  keys on a radio group move and select (handled here, so every browser and
  jsdom agree). A capped group shows "n of max" with dots and says when the
  cap is reached; a required group blocks "Add" and says why.

  Data rules: the model writes product ids, `featured` and `preset`; the
  server's hydration fills prices, photos, option groups, `fulfilment`, `fee`
  and `checkout: true`. Ordering controls exist only when `checkout` is true
  and the item has a product_id and a price, so a half-streamed or model-only
  card is display only. Photos go through PhotoTile (icon fallback); there are
  no links. The pure logic and the display-only money math live in
  ./menu-order.ts.

  Bind: `cart` ({ lines, fulfilment, total }, no customer details). Event:
  `on_checkout` (prop `oncheckout`) with the full Cart; the host turns it into
  its `checkout` event and does every network step. Nothing is seeded from a
  prop into $state: lines derive from `cart` (or `preset` until the first edit).
-->
<script lang="ts">
	import { getContext, tick } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { safeUrl } from '@ripple-ui/core';
	import Plus from '@lucide/svelte/icons/plus';
	import Minus from '@lucide/svelte/icons/minus';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import Store from '@lucide/svelte/icons/store';
	import Bike from '@lucide/svelte/icons/bike';
	import Check from '@lucide/svelte/icons/check';
	import UtensilsCrossed from '@lucide/svelte/icons/utensils-crossed';
	import Soup from '@lucide/svelte/icons/soup';
	import HandPlatter from '@lucide/svelte/icons/hand-platter';
	import {
		PhotoTile,
		SectionCard,
		StageRail,
		VerdictLine,
		MENU_ICONS,
		OPTION_ICONS,
		kindIcon,
		optionIconKey,
		money,
		plain,
		rise,
		slide
	} from '../data-kit/index.js';
	import type { Verdict } from '../data-kit/types.js';
	import {
		MAX_LINES,
		MAX_QTY,
		buildCart,
		chosenNames,
		cleanIds,
		clearGroup,
		contactErrors,
		defaultIds,
		deliveryFee,
		featuredOf,
		idWords,
		itemCount,
		lineKey,
		presetLines,
		subtotalOf,
		toFulfilment,
		toItems,
		toLines,
		toggleOption,
		totalOf,
		unitPrice,
		unmet
	} from './menu-order.js';
	import type { Cart, CartDraft, CartLine, Contact, Fulfilment, Group, Item, MenuItem, Option } from './menu-order.js';

	interface Props {
		title?: string;
		subtitle?: string;
		verdict?: Verdict;
		currency?: string;
		items?: MenuItem[];
		featured?: { id: string; reason?: string };
		preset?: Array<{ id: string; qty: number }>;
		fulfilment?: Fulfilment[];
		fee?: { delivery?: number } | number;
		checkout?: boolean;
		cart?: CartDraft;
		oncartchange?: (cart: CartDraft) => void;
		oncheckout?: (cart: Cart) => unknown;
		id?: string;
		class?: string;
	}

	let {
		title,
		subtitle,
		verdict,
		currency,
		items,
		featured,
		preset,
		fulfilment,
		fee,
		checkout = false,
		cart = $bindable(),
		oncartchange,
		oncheckout,
		id,
		class: className
	}: Props = $props();

	const uid = $props.id();

	type Stage = 'menu' | 'customise' | 'details' | 'review';
	const ORDER: Stage[] = ['menu', 'customise', 'details', 'review'];
	const LABELS: Record<Stage, string> = { menu: 'Menu', customise: 'Customise', details: 'Details', review: 'Review' };

	const PRIMARY =
		'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md bg-ripple-accent px-3.5 text-body-emph text-ripple-accent-foreground tabular-nums transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ripple-ring disabled:cursor-not-allowed disabled:opacity-50';
	const SECONDARY =
		'inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-ripple-border bg-ripple-surface px-2.5 text-callout font-medium text-ripple-surface-foreground transition-colors hover:bg-ripple-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ripple-ring disabled:cursor-not-allowed disabled:opacity-50';
	// Disabled keeps pointer events so the capped + still shows its "Up to" title.
	const STEP =
		'grid size-7 place-items-center rounded-md text-ripple-muted-foreground transition-colors hover:bg-ripple-muted hover:text-ripple-surface-foreground focus-visible:outline-2 focus-visible:outline-ripple-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ripple-muted-foreground';
	const QUIET =
		'inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-callout text-ripple-muted-foreground transition-colors hover:bg-ripple-muted hover:text-ripple-surface-foreground focus-visible:outline-2 focus-visible:outline-ripple-ring';

	// Kind glyphs: the shared map minus its specific foods for the generic kinds
	// (a burger beside sushi misleads); an unknown kind gets a plate, not a dot.
	const DISH = { ...MENU_ICONS, main: UtensilsCrossed, side: Soup };
	const glyph = (kind: unknown) => (typeof kind === 'string' && Object.hasOwn(DISH, kind) ? DISH[kind as keyof typeof DISH] : HandPlatter);

	// ── Menu data (derived from props; streaming-safe) ─────────────────────
	const menu = $derived(toItems(items));
	const cur = $derived(typeof currency === 'string' && currency.trim() ? currency : 'USD');
	const fmt = (v: number | undefined) => money(v, cur);
	const canOrder = (i: Item | undefined): i is Item => checkout === true && !!i?.product_id && i.price !== undefined;
	const orderable = $derived(menu.some(canOrder));
	const modes = $derived(toFulfilment(fulfilment));
	const feeAmount = $derived(deliveryFee(fee));
	const pick = $derived(featuredOf(menu, featured));
	const categories = $derived([...new Set(menu.map((i) => i.category).filter(Boolean))]);
	const itemOf = (pid: string) => menu.find((i) => i.product_id === pid);
	// Photo URLs that failed to load. A failed photo drops its tile; when no
	// photo is left loading or loaded the menu reads as a list, not a grid of
	// grey boxes. Pending counts as a photo so the images get to load at all.
	let failed = $state<string[]>([]);
	const hasPhoto = (i: Item) => {
		const u = safeUrl(i.image, { kind: 'resource' });
		return u !== undefined && !failed.includes(u);
	};
	const fail = (i: Item) => {
		const u = safeUrl(i.image, { kind: 'resource' });
		if (u && !failed.includes(u)) failed.push(u);
	};
	const photos = $derived(menu.some(hasPhoto));

	// Placeholders only while the spec is still streaming in. A settled card
	// (or a plain one) shows what it has: a missing price collapses, a missing
	// name reads as its id in words. Read the getter inside $derived, never at mount.
	const streamPhase = getContext<(() => 'active' | 'done' | undefined) | undefined>('ui-streaming');
	const streaming = $derived(streamPhase?.() === 'active');
	const label = (i: Item) => i.name || idWords(i.product_id ?? i.id) || 'Unnamed item';
	const priceText = (p: number) => (p === 0 ? 'Free' : fmt(p));

	const headline = $derived.by(() => {
		const prices = menu.map((i) => i.price).filter((p): p is number => p !== undefined);
		const parts = [`${menu.length} ${menu.length === 1 ? 'item' : 'items'}`];
		const real = prices.filter((p) => p > 0); // a free item or a credit is not a starting price
		if (real.length) parts.push(`from ${priceText(Math.min(...real))}`);
		else if (!prices.length && categories.length > 1) parts.push(`${categories.length} categories`);
		if (orderable) parts.push(modes.length > 1 ? 'pickup or delivery' : modes[0]);
		return menu.length ? parts.join(' · ') : '';
	});

	// ── Cart (derived from the bound value, or the preset until the first edit) ──
	const bound = $derived(cart !== null && typeof cart === 'object' ? cart : undefined);
	const lines = $derived(orderable ? toLines(bound ? bound.lines : presetLines(preset, menu), menu) : []);
	const mode = $derived<Fulfilment>(modes.includes(bound?.fulfilment as Fulfilment) ? (bound!.fulfilment as Fulfilment) : modes[0]);
	const count = $derived(itemCount(lines));
	const subtotal = $derived(subtotalOf(lines));
	// Display only: the store reprices every line and option at checkout.
	const total = $derived(totalOf(lines, mode, feeAmount));
	const full = $derived(lines.length >= MAX_LINES);
	const qtyOf = (item: Item) => lines.reduce((n, l) => (l.product_id === item.product_id ? n + l.qty : n), 0);
	// A repeated product_id shares its cart line: only the first row shows it as chosen.
	const chosen = (item: Item) => qtyOf(item) > 0 && menu.find((i) => i.product_id === item.product_id) === item;
	const optionNames = (line: CartLine) => chosenNames(itemOf(line.product_id)?.groups ?? [], line.option_ids).join(', ');

	function commit(raw: unknown, nextMode: Fulfilment = mode) {
		const next = toLines(raw, menu);
		const value: CartDraft = { lines: next, fulfilment: nextMode, total: totalOf(next, nextMode, feeAmount) };
		cart = value;
		oncartchange?.(value);
	}

	function stepLine(line: CartLine, delta: number) {
		const key = lineKey(line);
		const qty = Math.min(line.qty + delta, MAX_QTY);
		commit(qty < 1 ? lines.filter((l) => lineKey(l) !== key) : lines.map((l) => (lineKey(l) === key ? { ...l, qty } : l)));
	}

	/** Items without option groups step in place on the menu. */
	function stepItem(item: Item, delta: number) {
		const line = lines.find((l) => l.product_id === item.product_id);
		if (line) stepLine(line, delta);
		else if (delta > 0 && !full) commit([...lines, { product_id: item.product_id, qty: 1, option_ids: [] }]);
	}

	// ── Stages ──────────────────────────────────────────────────────────────
	let stage = $state<Stage>('menu');
	let dir = $state<1 | -1>(1);
	let filter = $state('');
	let draft = $state<{ pid: string; ids: string[]; qty: number; edit?: string } | null>(null);
	let contact = $state<Contact>({ name: '', email: '', phone: '', address: '' });
	let tried = $state(false);
	let placing = $state(false);

	const active = $derived(categories.includes(filter) ? filter : '');
	const shown = $derived(menu.filter((i) => (active ? i.category === active : i !== pick?.item)));
	// Chips only for a long menu; a short one reads by its group headings.
	const chips = $derived(categories.length > 1 && menu.length >= 8);
	// Groups under category headings ("All", 2+ categories), uncategorised last
	// as "Other"; one unnamed group otherwise. `start` runs the rise stagger on.
	const groups = $derived.by(() => {
		// Photo cards flow in one grid: a heading per small group strands cards.
		const sets = !active && !photos && categories.length > 1 ? [...categories, ''].map((c) => ({ name: c || 'Other', items: shown.filter((i) => i.category === c) })) : [{ name: '', items: shown }];
		let start = 0;
		return sets.filter((g) => g.items.length).map((g) => ({ ...g, start: (start += g.items.length) - g.items.length }));
	});
	const draftItem = $derived.by(() => {
		const d = draft;
		const item = d ? itemOf(d.pid) : undefined;
		return canOrder(item) ? item : undefined;
	});
	const draftIds = $derived(draftItem && draft ? cleanIds(draftItem.groups, draft.ids) : []);
	const blocker = $derived(draftItem ? unmet(draftItem.groups, draftIds) : undefined);
	const draftUnit = $derived(draftItem ? unitPrice(draftItem, draftIds) : undefined);
	const draftTotal = $derived(draftUnit === undefined ? undefined : draftUnit * (draft?.qty ?? 1));
	const draftNames = $derived(draftItem ? chosenNames(draftItem.groups, draftIds) : []);

	// Option icons: the option's own name, else its group's, else CircleDot.
	const groupIcon = (g: Group) => kindIcon(OPTION_ICONS, optionIconKey(g.name, g.icon));
	const optionIcon = (g: Group, o: Option) => kindIcon(OPTION_ICONS, optionIconKey(o.name, o.icon) ?? optionIconKey(g.name, g.icon));
	// Two or three short single choices read as one segmented row (Size).
	const segmented = (g: Group) => g.choose === 'one' && g.options.length >= 2 && g.options.length <= 3 && g.options.every((o) => o.name.length <= 16);
	const ARROWS: Record<string, 1 | -1> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
	const draftIsNew = $derived(
		!!draft && !draft.edit && !lines.some((l) => lineKey(l) === lineKey({ product_id: draft!.pid, option_ids: draftIds }))
	);
	const errors = $derived(contactErrors(contact, mode));
	const ready = $derived(Object.keys(errors).length === 0);

	// The stage actually shown: a stage whose inputs are gone falls back.
	const view = $derived.by<Stage>(() => {
		if (!orderable) return 'menu';
		if (stage === 'customise') return draftItem ? 'customise' : 'menu';
		if (stage !== 'menu' && lines.length === 0) return 'menu';
		if (stage === 'review' && !ready) return 'details';
		return stage;
	});
	const customising = $derived(view === 'customise' || lines.some((l) => (itemOf(l.product_id)?.groups.length ?? 0) > 0));
	const stages = $derived<Stage[]>(customising ? ORDER : ['menu', 'details', 'review']);

	let anchor = $state<HTMLElement>();

	function go(next: Stage) {
		dir = ORDER.indexOf(next) >= ORDER.indexOf(view) ? 1 : -1;
		stage = next;
		// A stage change in a long card can leave the visitor mid-scroll: bring
		// the rail back into view if it went above the fold (no-op if visible).
		void tick().then(() => anchor?.scrollIntoView?.({ block: 'nearest', behavior: prefersReducedMotion.current ? 'auto' : 'smooth' }));
	}

	function railTo(i: number) {
		const to = stages[i];
		if (to !== 'customise') return go(to);
		// Back to customise: reopen the latest line that has options.
		for (let j = lines.length - 1; j >= 0; j--) if (itemOf(lines[j].product_id)?.groups.length) return edit(lines[j]);
	}

	function open(item: Item) {
		if (!item.product_id) return;
		draft = { pid: item.product_id, ids: defaultIds(item.groups), qty: 1 };
		go('customise');
	}

	function edit(line: CartLine) {
		draft = { pid: line.product_id, ids: [...line.option_ids], qty: line.qty, edit: lineKey(line) };
		go('customise');
	}

	function choose(group: Group, optionId: string) {
		if (draft && draftItem) draft.ids = toggleOption(draftItem.groups, draftIds, group, optionId);
	}

	/** Arrow keys on a radio group: select the next/previous tile (wrapping) and focus it. */
	function arrow(e: KeyboardEvent, group: Group) {
		const step = ARROWS[e.key];
		const n = group.options.length;
		if (!step || !n || !(e.target instanceof HTMLInputElement)) return; // not from the Clear button
		e.preventDefault();
		const at = group.options.findIndex((o) => draftIds.includes(o.id));
		const next = ((at < 0 ? (step > 0 ? -1 : 0) : at) + step + n) % n;
		choose(group, group.options[next].id);
		(e.currentTarget as HTMLElement).querySelectorAll('input')[next]?.focus();
	}

	function clear(group: Group) {
		if (draft && draftItem) draft.ids = clearGroup(draftItem.groups, draftIds, group);
	}

	function saveDraft() {
		const d = draft;
		if (!d || !draftItem || blocker || (draftIsNew && full)) return;
		const rest = d.edit ? lines.filter((l) => lineKey(l) !== d.edit) : lines;
		commit([...rest, { product_id: d.pid, qty: d.qty, option_ids: draftIds }]);
		go(d.edit ? 'review' : 'menu');
		draft = null;
	}

	let form = $state<HTMLFormElement>();

	function toReview() {
		tried = true;
		if (ready) return go('review');
		void tick().then(() => form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
	}

	async function place() {
		if (placing || !ready || lines.length === 0) return;
		placing = true;
		try {
			await oncheckout?.(buildCart(lines, mode, contact, feeAmount));
		} finally {
			placing = false;
		}
	}
</script>

{#snippet price(item: Item, cls = 'text-body-emph')}
	{#if item.price !== undefined}
		<span class={['shrink-0 tabular-nums', cls]}>{priceText(item.price)}</span>
	{:else if streaming}
		<span class="mt-1 h-3.5 w-10 shrink-0 rounded bg-ripple-track" aria-hidden="true" data-placeholder></span>
	{/if}
{/snippet}

{#snippet name(item: Item, cls: string, level = 'h3')}
	{#if item.name || !streaming}
		<svelte:element
			this={level}
			class={['line-clamp-2 min-w-0 flex-1 text-pretty break-words', !item.name && !item.product_id && !item.id && 'text-ripple-muted-foreground italic', cls]}
			title={label(item)}>{label(item)}</svelte:element
		>
	{:else}
		<span class="mt-1 h-3.5 w-2/3 rounded bg-ripple-track" aria-hidden="true" data-placeholder></span>
	{/if}
{/snippet}

{#snippet tags(item: Item)}
	{#if item.tags.length}
		<ul class="flex flex-wrap gap-1" aria-label="Tags">
			{#each item.tags as t, j (`${t}:${j}`)}
				<li class="rounded bg-ripple-muted px-1.5 py-px text-caption-2 text-ripple-muted-foreground">{t}</li>
			{/each}
		</ul>
	{/if}
{/snippet}

{#snippet stepper(q: number, label: string, dec: () => void, inc: () => void, min = 0)}
	<div class="inline-flex h-7 items-center rounded-md border border-ripple-border bg-ripple-surface" role="group" aria-label="Quantity of {label}">
		<button type="button" class={STEP} aria-label="Remove one {label}" disabled={q <= min} onclick={dec}>
			<Minus size={14} strokeWidth={2} aria-hidden="true" />
		</button>
		<span class="min-w-6 text-center text-body-emph tabular-nums">{q}</span>
		<button type="button" class={STEP} aria-label="Add one {label}" title={q >= MAX_QTY ? `Up to ${MAX_QTY}` : undefined} disabled={q >= MAX_QTY} onclick={inc}>
			<Plus size={14} strokeWidth={2} aria-hidden="true" />
		</button>
	</div>
{/snippet}

{#snippet control(item: Item)}
	{#if canOrder(item)}
		{@const q = chosen(item) ? qtyOf(item) : 0}
		{#if item.groups.length}
			{#if q > 0}<span class="text-footnote font-medium tabular-nums text-ripple-muted-foreground">{q} in order</span>{/if}
			<button type="button" class={SECONDARY} disabled={full} aria-label="Choose options for {label(item)}" onclick={() => open(item)}>Choose</button>
		{:else if q > 0}
			{@render stepper(q, label(item), () => stepItem(item, -1), () => stepItem(item, 1))}
		{:else}
			<button type="button" class={SECONDARY} disabled={full} aria-label="Add {label(item)}" onclick={() => stepItem(item, 1)}>
				<Plus size={14} strokeWidth={2} aria-hidden="true" />Add
			</button>
		{/if}
	{/if}
{/snippet}

{#snippet card(item: Item)}
	<article
		class={[
			'flex gap-3 rounded-ripple border p-2 transition-colors @min-[560px]:flex-col @min-[560px]:gap-2',
			'border-ripple-border',
			chosen(item) ? 'bg-ripple-accent/8' : 'bg-ripple-surface'
		]}
	>
		<PhotoTile src={safeUrl(item.image, { kind: 'resource' })} ratio="4:3" icon={glyph(item.kind)} iconSize={24} class="w-24 shrink-0 self-start @min-[560px]:w-full" onerror={() => fail(item)} />
		<div class="flex min-w-0 flex-1 flex-col gap-1">
			<div class="flex items-start gap-2">
				{@render name(item, 'text-body-emph', 'h4')}
				{@render price(item)}
			</div>
			{#if item.description}<p class="line-clamp-2 text-callout text-pretty text-ripple-muted-foreground">{item.description}</p>{/if}
			{@render tags(item)}
			<div class="mt-auto flex items-center justify-end gap-2 pt-1 empty:hidden">{@render control(item)}</div>
		</div>
	</article>
{/snippet}

{#snippet row(item: Item, level: string)}
	{@const Glyph = glyph(item.kind)}
	<div
		class={[
			'relative grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2.5 px-2.5 py-2.5',
			chosen(item) && 'before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-ripple-accent'
		]}
	>
		<Glyph size={16} strokeWidth={1.75} class="mt-0.5 text-ripple-muted-foreground" aria-hidden="true" />
		<div class="flex min-w-0 flex-col gap-0.5">
			{@render name(item, 'text-body-emph', level)}
			{#if item.description}<p class="line-clamp-2 text-callout text-pretty text-ripple-muted-foreground">{item.description}</p>{/if}
			{#if item.tags.length}<div class="pt-1">{@render tags(item)}</div>{/if}
		</div>
		<div class="flex flex-col items-end gap-1.5 empty:hidden">
			{@render price(item)}
			{@render control(item)}
		</div>
	</div>
{/snippet}

{#snippet back(to: Stage, label: string)}
	<button type="button" class={[QUIET, '-ml-1.5 self-start']} onclick={() => go(to)}>
		<ChevronLeft size={14} strokeWidth={2} aria-hidden="true" />{label}
	</button>
{/snippet}

{#snippet field(key: keyof Contact, label: string, type: HTMLInputAttributes['type'], auto: HTMLInputAttributes['autocomplete'], max: number, wide = false)}
	{@const err = tried ? errors[key] : undefined}
	<label class={['flex min-w-0 flex-col gap-1', wide && '@min-[560px]:col-span-2']}>
		<span class="text-callout font-medium">{label}</span>
		<input
			{type}
			autocomplete={auto}
			maxlength={max}
			bind:value={contact[key]}
			aria-invalid={err ? 'true' : undefined}
			aria-describedby={err ? `${uid}-${key}-err` : undefined}
			class={[
				'h-8 min-w-0 rounded-md border bg-ripple-input px-2.5 text-body text-ripple-input-foreground outline-none focus-visible:ring-2 focus-visible:ring-ripple-ring',
				err ? 'border-ripple-error' : 'border-ripple-border'
			]}
		/>
		{#if err}<span id="{uid}-{key}-err" class="text-footnote text-ripple-error-text">{err}</span>{/if}
	</label>
{/snippet}

<div {id} class={['menu-order @container flex min-w-0 flex-col gap-3 text-ripple-surface-foreground', className]} data-stage={view}>
	{#if plain(title) || plain(subtitle) || plain(verdict?.text) || headline}
		<header class="flex flex-col gap-1">
			{#if plain(title)}<h2 class="text-title-3 font-semibold text-pretty">{plain(title)}</h2>{/if}
			{#if plain(subtitle)}<p class="text-callout text-ripple-muted-foreground">{plain(subtitle)}</p>{/if}
			{#if plain(verdict?.text)}
				<VerdictLine {verdict} class="mt-1" />
			{:else if headline}
				<p class="text-callout text-ripple-muted-foreground tabular-nums">{headline}</p>
			{/if}
		</header>
	{/if}

	{#if orderable}
		<span bind:this={anchor} class="-mb-3 block h-0 scroll-mt-16" aria-hidden="true"></span>
		<StageRail stages={stages.map((s) => LABELS[s])} current={stages.indexOf(view)} onselect={railTo} disabled={placing} />
	{/if}

	{#key view}
		<div class="flex min-w-0 flex-col gap-3" in:slide={{ dir }}>
			{#if view === 'menu'}
				{#if chips}
					<div class="flex flex-wrap gap-1.5" role="group" aria-label="Categories">
						{#each ['', ...categories] as c, i (`${c}:${i}`)}
							<button
								type="button"
								aria-pressed={active === c}
								title={c.length > 20 ? c : undefined}
								class={[
									'h-7 max-w-full truncate rounded-full border px-3 text-callout font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ripple-ring',
									active === c
										? 'border-ripple-accent bg-ripple-accent text-ripple-accent-foreground'
										: 'border-ripple-border text-ripple-muted-foreground hover:bg-ripple-muted hover:text-ripple-surface-foreground'
								]}
								onclick={() => (filter = c)}>{c.length > 20 ? `${c.slice(0, 19).trimEnd()}…` : c || 'All'}</button
							>
						{/each}
					</div>
				{/if}

				{#if menu.length === 0}
					<p class="rounded-ripple border border-dashed border-ripple-border px-3 py-6 text-center text-callout text-ripple-muted-foreground">
						No dishes yet. Ask for the menu.
					</p>
				{:else}
					{#if pick && !active}
						{@const f = pick.item}
						{@const shot = photos && hasPhoto(f)}
						<article class={['rounded-ripple bg-ripple-accent/8', shot ? 'grid gap-3 p-2 @min-[560px]:grid-cols-[2fr_3fr] @min-[560px]:p-3' : 'p-2.5']} aria-label="Picked for you">
							{#if shot}
								<PhotoTile src={safeUrl(f.image, { kind: 'resource' })} ratio="16:9" icon={glyph(f.kind)} iconSize={32} class="max-h-[200px] w-full self-center" onerror={() => fail(f)} />
							{/if}
							<div class={photos ? 'flex min-w-0 flex-1 flex-col gap-1' : 'grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2.5 gap-y-0.5'}>
								<p class={['text-caption-1 font-medium text-ripple-accent-text', !photos && 'col-span-2 col-start-2']}>Picked for you</p>
								{#if !photos}
									{@const Glyph = glyph(f.kind)}
									<Glyph size={16} strokeWidth={1.75} class="mt-0.5 text-ripple-muted-foreground" aria-hidden="true" />
								{/if}
								<div class="flex min-w-0 flex-col gap-0.5">
									{#if photos}
										<div class="flex items-start gap-2">
											{@render name(f, 'text-headline font-semibold')}
											{@render price(f, 'text-headline')}
										</div>
									{:else}
										{@render name(f, 'text-body-emph')}
									{/if}
									{#if pick.reason}
										<p class="text-callout text-pretty">{pick.reason}</p>
									{:else if f.description}
										<p class="line-clamp-2 text-callout text-pretty text-ripple-muted-foreground">{f.description}</p>
									{/if}
									{#if f.tags.length}<div class="pt-1">{@render tags(f)}</div>{/if}
									{#if photos}<div class="mt-auto flex items-center justify-end gap-2 pt-1 empty:hidden">{@render control(f)}</div>{/if}
								</div>
								{#if !photos}
									<div class="flex flex-col items-end gap-1.5 empty:hidden">
										{@render price(f)}
										{@render control(f)}
									</div>
								{/if}
							</div>
						</article>
					{/if}
					{#if groups.length}
						<div class="flex min-w-0 flex-col gap-3">
						{#each groups as g, gi (gi)}
							<section class="flex min-w-0 flex-col">
								{#if g.name}
									<h3 id="{uid}-cat{gi}" class="border-b border-ripple-border pb-1.5 text-subheadline font-semibold text-pretty">{g.name}</h3>
								{/if}
								{#if photos}
									<ul class={['grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2', g.name && 'pt-2']} aria-label={g.name ? undefined : 'Menu'} aria-labelledby={g.name ? `${uid}-cat${gi}` : undefined}>
										{#each g.items as item, i (item.key)}
											<li class="min-w-0" in:rise={{ index: g.start + i }}>{@render card(item)}</li>
										{/each}
									</ul>
								{:else}
									<ul class={['grid', g.items.length > 1 && '@min-[560px]:grid-cols-2 @min-[560px]:gap-x-6']} aria-label={g.name ? undefined : 'Menu'} aria-labelledby={g.name ? `${uid}-cat${gi}` : undefined}>
										{#each g.items as item, i (item.key)}
											<li class="min-w-0 border-t border-ripple-border first:border-t-0 @min-[560px]:nth-2:border-t-0" in:rise={{ index: g.start + i }}>
												{@render row(item, g.name ? 'h4' : 'h3')}
											</li>
										{/each}
									</ul>
								{/if}
							</section>
						{/each}
						</div>
					{/if}
					{#if full}
						<p class="text-footnote text-ripple-warning-text">This order has {MAX_LINES} lines, the most one order can hold.</p>
					{/if}
				{/if}
			{:else if view === 'customise' && draftItem && draft}
				{@const item = draftItem}
				{@const KindIcon = glyph(item.kind)}
				{@render back(draft.edit ? 'review' : 'menu', draft.edit ? 'Review' : 'Menu')}
				<div class="flex flex-col gap-3 @min-[720px]:grid @min-[720px]:grid-cols-[1fr_2fr] @min-[720px]:items-start">
					<div class="flex gap-3 @min-[720px]:sticky @min-[720px]:top-2 @min-[720px]:flex-col">
						{#if safeUrl(item.image, { kind: 'resource' })}
							<PhotoTile src={safeUrl(item.image, { kind: 'resource' })} ratio="4:3" icon={KindIcon} iconSize={28} class="w-24 shrink-0 self-start @min-[720px]:w-full" />
						{:else}
							<div
								class="grid aspect-square w-16 shrink-0 content-center justify-items-center gap-2 self-start rounded-ripple bg-ripple-accent/8 text-ripple-accent-text ring-1 ring-ripple-accent/15 ring-inset @min-[720px]:aspect-[4/3] @min-[720px]:w-full"
								aria-hidden="true"
								data-fallback
							>
								<KindIcon class="size-7 @min-[720px]:size-12" strokeWidth={1.5} />
								<span class="hidden max-w-full truncate px-3 text-headline text-ripple-surface-foreground @min-[720px]:block">{item.name}</span>
							</div>
						{/if}
						<div class="flex min-w-0 flex-1 flex-col gap-1">
							<h3 class="text-title-3 font-semibold text-pretty">{item.name}</h3>
							{#if item.description}<p class="text-callout text-ripple-muted-foreground">{item.description}</p>{/if}
							<div class="mt-1 flex items-baseline gap-2 border-t border-ripple-border pt-2">
								<p class="min-w-0 flex-1 text-callout text-pretty" data-chosen>
									{draftNames.length ? draftNames.join(' · ') : 'As it comes'}
								</p>
								{#key draftTotal}
									<span class="shrink-0 text-headline tabular-nums" in:rise>{fmt(draftTotal)}</span>
								{/key}
							</div>
						</div>
					</div>
					<div class="flex min-w-0 flex-col gap-2">
						{#each item.groups as g, gi (`${g.key}:${gi}`)}
							{@const chosen = g.options.filter((o) => draftIds.includes(o.id)).length}
							{@const capped = g.choose === 'many' && g.max < g.options.length}
							{@const atMax = capped && chosen >= g.max}
							{@const GroupIcon = groupIcon(g)}
							{@const seg = segmented(g)}
							<div
								class="rounded-ripple border border-ripple-border bg-ripple-surface p-3"
								role={g.choose === 'one' ? 'radiogroup' : 'group'}
								aria-labelledby="{uid}-g{gi}"
								onkeydown={g.choose === 'one' ? (e) => arrow(e, g) : undefined}
							>
								<div class="mb-2.5 flex min-h-6 items-center gap-2">
									<span class="grid size-6 shrink-0 place-items-center rounded-md bg-ripple-muted text-ripple-muted-foreground" aria-hidden="true">
										<GroupIcon size={14} strokeWidth={1.75} />
									</span>
									<h4 id="{uid}-g{gi}" class="min-w-0 truncate text-body-emph">{g.name || 'Options'}</h4>
									<span
										class={[
											'ml-auto inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-footnote tabular-nums',
											atMax ? 'bg-ripple-accent/15 text-ripple-surface-foreground' : 'bg-ripple-muted text-ripple-muted-foreground'
										]}
									>
										<span>{g.required ? 'Required' : 'Optional'}{g.choose === 'many' ? ` · ${chosen} of ${g.max}` : ''}</span>
										{#if capped && g.max <= 6}
											<span class="flex gap-0.5" aria-hidden="true">
												{#each { length: g.max }, d (d)}
													<span class={['size-1.5 rounded-full transition-colors', d < chosen ? 'bg-ripple-accent' : 'bg-ripple-muted-foreground/35']}></span>
												{/each}
											</span>
										{/if}
									</span>
									{#if !g.required && g.choose === 'one' && chosen > 0}
										<button type="button" class={[QUIET, '-my-1 h-6']} onclick={() => clear(g)}>Clear</button>
									{/if}
								</div>
								<ul class={['grid gap-1.5', seg ? ['grid-cols-2', 'grid-cols-3'][g.options.length - 2] : '@min-[560px]:grid-cols-2']}>
									{#each g.options as o, oi (`${o.id}:${oi}`)}
										{@const on = draftIds.includes(o.id)}
										{@const off = g.choose === 'many' && !on && atMax}
										{@const OptIcon = optionIcon(g, o)}
										<li class="min-w-0">
											<label
												class={[
													'relative flex h-full rounded-ripple border transition-[background-color,border-color,box-shadow] duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ripple-ring',
													seg ? 'flex-col items-center gap-1 px-2 pt-3 pb-2.5 text-center' : 'items-center gap-2.5 p-2 pr-2.5',
													on ? 'border-ripple-accent bg-ripple-accent/8 ring-1 ring-ripple-accent' : 'border-ripple-border',
													!on && !off && 'hover:border-ripple-accent/50 hover:bg-ripple-muted/50',
													off ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
												]}
											>
												<input
													type={g.choose === 'one' ? 'radio' : 'checkbox'}
													name="{uid}-{g.key}"
													value={o.id}
													checked={on}
													disabled={off}
													class="sr-only"
													onchange={() => choose(g, o.id)}
												/>
												<span
													class={[
														'grid shrink-0 place-items-center rounded-md transition-colors',
														seg ? 'size-9' : 'size-8',
														on ? 'bg-ripple-accent text-ripple-accent-foreground' : 'bg-ripple-muted text-ripple-muted-foreground'
													]}
													aria-hidden="true"
												>
													<OptIcon size={seg ? 18 : 16} strokeWidth={1.75} />
												</span>
												<span class={['min-w-0 text-body leading-tight', seg ? 'font-medium' : 'flex-1']}>{o.name}</span>
												{#if o.delta}
													<span
														class={[
															'shrink-0 rounded-full px-1.5 py-px text-footnote tabular-nums',
															on ? 'bg-ripple-accent/15 text-ripple-surface-foreground' : 'bg-ripple-muted text-ripple-muted-foreground'
														]}>{money(o.delta, cur, { sign: true })}</span
													>
												{/if}
												<span
													class={[
														'grid size-[18px] shrink-0 place-items-center border transition-colors',
														g.choose === 'one' ? 'rounded-full' : 'rounded-[5px]',
														seg && 'absolute top-1.5 right-1.5 size-4',
														on ? 'border-ripple-accent bg-ripple-accent text-ripple-accent-foreground' : 'border-ripple-border bg-ripple-surface',
														seg && !on && 'opacity-0'
													]}
													aria-hidden="true"
												>
													{#if on}<Check size={seg ? 11 : 12} strokeWidth={3} />{/if}
												</span>
											</label>
										</li>
									{/each}
								</ul>
								{#if atMax}
									<p class="mt-2 text-footnote text-ripple-muted-foreground" role="status">
										You've picked the max of {g.max}. Untick one to swap it.
									</p>
								{/if}
							</div>
						{/each}
						<div class="flex items-center justify-between gap-2 rounded-ripple border border-ripple-border bg-ripple-surface px-3 py-2">
							<span class="text-callout font-medium">Quantity</span>
							{@render stepper(draft.qty, item.name, () => draft && (draft.qty = Math.max(1, draft.qty - 1)), () => draft && (draft.qty = Math.min(MAX_QTY, draft.qty + 1)), 1)}
						</div>
						{#if blocker}
							<p class="text-callout text-ripple-warning-text" role="status">{blocker.name || 'This choice'} is required. Pick one to add this.</p>
						{:else if draftIsNew && full}
							<p class="text-callout text-ripple-warning-text" role="status">This order has {MAX_LINES} lines, the most one order can hold.</p>
						{/if}
					</div>
				</div>
			{:else if view === 'details'}
				{@render back('menu', 'Menu')}
				<form bind:this={form} id="{uid}-details" class="flex flex-col gap-3" novalidate onsubmit={(e) => (e.preventDefault(), toReview())}>
					{#if modes.length > 1}
						<div class="grid grid-cols-2 gap-1 rounded-ripple bg-ripple-muted p-1" role="radiogroup" aria-label="Pickup or delivery">
							{#each modes as m (m)}
								<label
									class={[
										'flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-callout font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ripple-ring',
										mode === m ? 'bg-ripple-surface text-ripple-surface-foreground ring-1 ring-ripple-border' : 'text-ripple-muted-foreground hover:text-ripple-surface-foreground'
									]}
								>
									<input type="radio" class="sr-only" name="{uid}-mode" value={m} checked={mode === m} onchange={() => commit(lines, m)} />
									{#if m === 'pickup'}
										<Store size={14} strokeWidth={1.75} aria-hidden="true" />Pickup
									{:else}
										<Bike size={14} strokeWidth={1.75} aria-hidden="true" />Delivery
										{#if feeAmount}<span class="font-normal tabular-nums">{money(feeAmount, cur, { sign: true })}</span>{/if}
									{/if}
								</label>
							{/each}
						</div>
					{:else}
						<p class="flex items-center gap-1.5 text-callout text-ripple-muted-foreground">
							{#if mode === 'pickup'}<Store size={14} strokeWidth={1.75} aria-hidden="true" />Pickup only{:else}<Bike
									size={14}
									strokeWidth={1.75}
									aria-hidden="true"
								/>Delivery only{/if}
						</p>
					{/if}
					<div class="grid gap-2 @min-[560px]:grid-cols-2">
						{@render field('name', 'Name', 'text', 'name', 80, true)}
						{@render field('email', 'Email', 'email', 'email', 120)}
						{@render field('phone', 'Phone', 'tel', 'tel', 30)}
						{#if mode === 'delivery'}{@render field('address', 'Delivery address', 'text', 'street-address', 200, true)}{/if}
					</div>
				</form>
			{:else if view === 'review'}
				{@render back('details', 'Details')}
				<div class="grid gap-2 @min-[720px]:grid-cols-[3fr_2fr] @min-[720px]:items-start">
					<SectionCard title="Your order">
						<ul class="flex flex-col divide-y divide-ripple-border">
							{#each lines as line (lineKey(line))}
								{@const opts = optionNames(line)}
								<li class="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
									<div class="min-w-0 flex-1">
										<p class="text-body-emph">{line.name}</p>
										{#if opts}<p class="text-footnote text-ripple-muted-foreground">{opts}</p>{/if}
										<div class="mt-1.5 flex items-center gap-1">
											{@render stepper(line.qty, line.name, () => stepLine(line, -1), () => stepLine(line, 1))}
											{#if itemOf(line.product_id)?.groups.length}
												<button type="button" class={QUIET} aria-label="Edit {line.name}" onclick={() => edit(line)}>Edit</button>
											{/if}
										</div>
									</div>
									<span class="shrink-0 text-body-emph tabular-nums">{fmt(line.unit_price * line.qty)}</span>
								</li>
							{/each}
						</ul>
					</SectionCard>
					<div class="flex min-w-0 flex-col gap-2">
						<SectionCard title={mode === 'delivery' ? 'Delivery' : 'Pickup'}>
							{#snippet aside()}
								<button type="button" class={[QUIET, '-my-1 h-6']} onclick={() => go('details')}>Change</button>
							{/snippet}
							<p class="text-body-emph">{contact.name.trim()}</p>
							{#each [contact.email, contact.phone, mode === 'delivery' ? contact.address : ''].filter((s) => s.trim()) as s, i (i)}
								<p class="truncate text-callout text-ripple-muted-foreground">{s.trim()}</p>
							{/each}
						</SectionCard>
						<SectionCard title="Total">
							<dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-callout tabular-nums">
								<dt class="text-ripple-muted-foreground">Subtotal</dt>
								<dd class="text-right">{fmt(subtotal)}</dd>
								{#if mode === 'delivery'}
									<dt class="text-ripple-muted-foreground">Delivery fee</dt>
									<dd class="text-right">{feeAmount ? fmt(feeAmount) : 'Free'}</dd>
								{/if}
								<dt class="text-headline">Total</dt>
								<dd class="text-right text-headline">{fmt(total)}</dd>
							</dl>
							<p class="mt-2 text-footnote text-ripple-muted-foreground">The restaurant confirms the final price at payment.</p>
						</SectionCard>
					</div>
				</div>
			{/if}
		</div>
	{/key}

	{#if orderable && (count > 0 || view !== 'menu')}
		<div class="sticky bottom-0 z-10 flex items-center gap-3 rounded-b-ripple border-t border-ripple-border bg-ripple-surface px-2.5 py-1.5 text-ripple-surface-foreground">
			<p class="min-w-0 flex-1 truncate text-callout" aria-live="polite">
				{#if count > 0}
					<span class="font-medium tabular-nums">{count} {count === 1 ? 'item' : 'items'}</span><span class="text-ripple-muted-foreground"
						>{' · '}</span
					><span class="tabular-nums">{fmt(subtotal)}</span>
				{:else}
					<span class="text-ripple-muted-foreground">Nothing added yet</span>
				{/if}
			</p>
			{#if view === 'menu'}
				<button type="button" class={PRIMARY} onclick={() => go('details')}>Checkout</button>
			{:else if view === 'customise'}
				<button type="button" class={PRIMARY} disabled={!!blocker || (draftIsNew && full)} onclick={saveDraft}>
					{draft?.edit ? 'Update' : 'Add'} · {fmt(draftTotal)}
				</button>
			{:else if view === 'details'}
				<button type="submit" form="{uid}-details" class={PRIMARY}>Review order</button>
			{:else}
				<button type="button" class={PRIMARY} disabled={placing} onclick={place}>{placing ? 'Opening payment…' : 'Continue to payment'}</button>
			{/if}
		</div>
	{/if}
</div>
