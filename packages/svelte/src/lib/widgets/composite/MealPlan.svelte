<!--
  widgets/composite/MealPlan.svelte — `meal-plan`: a week of meals from one
  recipe library. The model writes `recipes` once and `days[{day, meals[{slot,
  recipe}]}]` pointing at them by id; the widget does the design: "Cooking for
  [stepper] people", a Plan / Shopping list switch, the daily averages against
  `goal` (value / goal, the goal word), and the week as day rows.

  Layout (one DOM, CSS-only): under 540px container width, and at any width
  with more than four slots, each day is a disclosure row (label, a pill only
  when the day misses, totals, then a full-width meter against the goal so the
  goal tick sits at one x on every row, then the meal names clamped to two
  lines); the first day starts open, one open at a time, and a one-day plan is
  simply open. At 540px and up with four slots or fewer the same rows are a
  days-by-slots grid with every day shown and a three-line day cell; there
  the swap control is pinned top-right and a float spacer keeps it beside the
  name's first line only, so the second line gets the full cell width. Every meal row ends in the same swap control (a native
  select, disabled with a title when the slot has no alternative). Tapping a
  meal opens its Recipe inline under the day, scaled to `people`.

  Invariants:
  - `people` is the one bound field (bind contract `people` / `onpeoplechange`).
    `days` (a swap writes a NEW array) and `got` (ticked shopping keys) are
    Svelte-side $bindables with change callbacks, held as Edits so a host
    re-sending the original spec does not undo them. The switch and the open
    day are view state, never written to the spec.
  - Collapsed meal lists and the hidden view are hidden by a class, never the
    `hidden` attribute: tests find swaps by name (`Swap Mon Dinner`) and read
    shopping amounts in jsdom, where Tailwind does not apply.
  - Everything derives from props (rules in recipe.ts). Nutrition is per
    serving, so day totals are per person; quantities scale by people / serves.
  - Status colour appears only in pills; meters, ticks and the switch use the
    one accent.
-->
<script lang="ts">
	import { safeStyle } from '@ripple-ui/core';
	import type { LucideIcon } from '@lucide/svelte';
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Dumbbell from '@lucide/svelte/icons/dumbbell';
	import Flame from '@lucide/svelte/icons/flame';
	import { safeArray } from '$lib/utils/safe-props.js';
	import { AISLE_ICONS, MEAL_ICONS, SectionCard, StatChip, StatusPill, VerdictLine, holds, kindIcon, nextEdit, num, plain, rise } from '../data-kit/index.js';
	import type { Edit } from '../data-kit/edit.js';
	import type { Verdict } from '../data-kit/types.js';
	import Segmented from '../input/Segmented.svelte';
	import Recipe, { stepper } from './Recipe.svelte';
	import {
		SLOTS,
		dayLabel,
		dayTotals,
		findRecipe,
		goalCheck,
		humanRef,
		list,
		positive,
		qtyLabel,
		readLibrary,
		rec,
		shoppingList,
		slotLabel,
		swapMeal,
		type Goal,
		type PlanDay,
		type RecipeData
	} from './recipe.js';

	interface Props {
		id?: string;
		class?: string;
		style?: string | Record<string, string>;
		title?: string;
		subtitle?: string;
		verdict?: Verdict;
		/** People cooked for. Bindable; scales the shopping list. */
		people?: number;
		/** Per person per day. */
		goal?: Goal;
		/** The library every meal points into. */
		recipes?: RecipeData[];
		/** The week. Bindable: a swap writes a new array. */
		days?: PlanDay[];
		/** Ticked shopping-list keys (`name|unit`). Bindable. */
		got?: string[];
		onpeoplechange?: (people: number) => void;
		ondayschange?: (days: PlanDay[]) => void;
		ongotchange?: (got: string[]) => void;
	}

	let {
		id,
		class: className,
		style,
		title,
		subtitle,
		verdict,
		people = $bindable(),
		goal,
		recipes,
		days = $bindable(),
		got = $bindable(),
		onpeoplechange,
		ondayschange,
		ongotchange
	}: Props = $props();

	const MAX_PEOPLE = 99;
	const uid = $props.id();

	const rootStyle = $derived(
		style && typeof style === 'object'
			? safeStyle(Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';'))
			: safeStyle(typeof style === 'string' ? style : '')
	);

	const heading = $derived(plain(title));
	const sub = $derived(plain(subtitle));
	const count = $derived(Math.max(1, Math.min(Math.round(positive(people) ?? 1), MAX_PEOPLE)));
	const lib = $derived(readLibrary(safeArray<unknown>(recipes, { widget: 'meal-plan', key: 'recipes' })));
	const incomingDays = $derived(safeArray<unknown>(days, { widget: 'meal-plan', key: 'days' }));
	// Swaps and ticks are Edits (data-kit/edit.ts): a host that re-renders the same
	// spec (say on a people change) re-sends the original days, which must not
	// undo a swap. Plain $state.raw: nothing inside them is mutated.
	let daysEdit = $state.raw<Edit<unknown[]> | null>(null);
	let gotEdit = $state.raw<Edit<string[]> | null>(null);
	const dayList = $derived(holds(daysEdit, incomingDays) ? daysEdit.value : incomingDays);
	const gotList = $derived(holds(gotEdit, got) ? gotEdit.value : list(got));
	const goalObj = $derived(rec(goal));

	/** Swap choices per slot: recipes of that kind, plus kind-less ones (refs are unique). */
	function choices(slot: string, current: (typeof lib)[number]) {
		const opts = lib.filter((r) => !r.kind || r.kind === slot);
		return opts.some((o) => o.ref === current.ref) ? opts : [current, ...opts];
	}

	const view = $derived(
		dayList.map((raw, di) => {
			const d = rec(raw);
			const meals = list(d.meals).flatMap((rm, mi) => {
				const m = rec(rm);
				const ref = plain(m.recipe);
				const recipe = findRecipe(lib, ref);
				const slot = plain(m.slot).toLowerCase() || recipe?.kind || (ref ? 'other' : '');
				if (!slot) return [];
				const name = recipe?.name ?? humanRef(ref || slotLabel(slot));
				return [{ key: `${m.id ?? ''}:${mi}`, mi, slot, ref, recipe, name, opts: recipe ? choices(slot, recipe) : [] }];
			});
			// Protein leads the day when the goal names it; calories otherwise.
			const t = dayTotals(raw, lib);
			const byProtein = goalCheck(t.protein, goalObj.protein_g, 'floor');
			const check = byProtein ?? goalCheck(t.kcal, goalObj.kcal, 'target');
			const ratio = byProtein ? t.protein! / positive(goalObj.protein_g)! : check ? t.kcal! / positive(goalObj.kcal)! : undefined;
			return { key: `${d.id ?? ''}:${di}`, di, label: dayLabel(raw, di), meals, kcal: t.kcal, protein: t.protein, check, ratio };
		})
	);

	/** Slot columns in meal order, then any slot the model invented, as written. */
	const slots = $derived.by(() => {
		const used = new Set(view.flatMap((d) => d.meals.map((m) => m.slot)));
		return [...SLOTS.filter((s) => used.has(s)), ...[...used].filter((s) => !(SLOTS as readonly string[]).includes(s))];
	});
	// The days-by-slots grid only reads with four columns or fewer.
	const grid = $derived(slots.length > 0 && slots.length <= 4);
	// A one-day plan has nothing to collapse: its day renders open, no disclosure.
	const single = $derived(view.length === 1);
	const canSwap = $derived(view.some((d) => d.meals.some((m) => m.opts.length > 1)));

	const mean = (xs: (number | undefined)[]) => {
		const ok = xs.filter((x): x is number => x !== undefined);
		return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : undefined;
	};
	const avgProtein = $derived(mean(view.map((d) => d.protein)));
	const avgKcal = $derived(mean(view.map((d) => d.kcal)));
	const proteinCheck = $derived(goalCheck(avgProtein, goalObj.protein_g, 'floor'));
	const kcalCheck = $derived(goalCheck(avgKcal, goalObj.kcal, 'target'));

	const shop = $derived(shoppingList(dayList, lib, count));
	const shopCount = $derived(shop.reduce((n, g) => n + g.items.length, 0));
	const gotSet = $derived(new Set(gotList.filter((k): k is string => typeof k === 'string')));
	const gotCount = $derived(shop.reduce((n, g) => n + g.items.filter((i) => gotSet.has(i.key)).length, 0));

	// View state: the switch, the one open day (first by default), the open meal.
	let tab = $state<'plan' | 'shop'>('plan');
	let openDay = $state<number | null>(0);
	let openAt = $state<string | null>(null);

	function setPeople(n: number) {
		people = n;
		onpeoplechange?.(n);
	}

	function swap(di: number, mi: number, ref: string) {
		const next = swapMeal(dayList, di, mi, ref) as PlanDay[];
		daysEdit = nextEdit(daysEdit, incomingDays, next);
		days = next;
		ondayschange?.(next);
	}

	function toggleGot(key: string) {
		const next = gotSet.has(key) ? [...gotSet].filter((k) => k !== key) : [...gotSet, key];
		gotEdit = nextEdit(gotEdit, got, next);
		got = next;
		ongotchange?.(next);
	}

	const g0 = (v: number | undefined) => (v === undefined ? undefined : Math.round(v));
	const people$ = (n: number) => (n === 1 ? '1 person' : `${n} people`);
	const totals = (d: (typeof view)[number]) =>
		[d.protein !== undefined && `${num(g0(d.protein))} g protein`, d.kcal !== undefined && `${num(g0(d.kcal))} kcal`].filter(Boolean) as string[];
	// Collapsed summary: the separator stays on the name before it (never starts a
	// line) and a hyphenated name does not split at its hyphen.
	const summary = (names: string[]) => names.map((n) => n.replaceAll('-', '\u2011')).join('\u00a0· ');
	const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ripple-ring';
	// Meter scale runs to 120% so an overshoot shows past the goal tick.
	const SCALE = 1.2;
</script>

{#snippet meter(d: (typeof view)[number])}
	{#if d.ratio !== undefined}
		<span class="relative block h-1 min-w-0 flex-1 rounded-full bg-ripple-muted" aria-hidden="true">
			<span class="absolute inset-y-0 left-0 rounded-full bg-ripple-accent" style:width="{(Math.min(Math.max(d.ratio, 0), SCALE) / SCALE) * 100}%"></span>
			<span class="absolute -inset-y-0.5 w-px bg-ripple-muted-foreground" style:left="{100 / SCALE}%"></span>
		</span>
	{/if}
{/snippet}

{#snippet miss(d: (typeof view)[number])}
	{#if d.check && d.check.status !== 'good'}<StatusPill status={d.check.status} label={d.check.word} class="shrink-0" />{/if}
{/snippet}

<div {id} class={['@container text-ripple-surface-foreground', className]} style={rootStyle} data-widget="meal-plan">
	<div class="flex flex-col gap-3">
		{#if heading || sub}
			<header class="flex min-w-0 flex-col gap-0.5">
				{#if heading}<h2 class="text-title-3 font-semibold text-pretty">{heading}</h2>{/if}
				{#if sub}<p class="text-callout text-pretty text-ripple-muted-foreground">{sub}</p>{/if}
			</header>
		{/if}

		<VerdictLine {verdict} />

		<div class="flex flex-col gap-2 @min-[540px]:flex-row @min-[540px]:items-center @min-[540px]:justify-between" data-slot="controls">
			<div class="flex items-center gap-2 text-callout">
				<span>Cooking for</span>
				{@render stepper(count, 1, MAX_PEOPLE, 'people', setPeople)}
				<span>{count === 1 ? 'person' : 'people'}</span>
			</div>
			<Segmented
				class="[&_[role=radiogroup]]:w-full @min-[540px]:[&_[role=radiogroup]]:w-fit"
				options={[
					{ value: 'plan', label: 'Plan' },
					{ value: 'shop', label: 'Shopping list', badge: shopCount || undefined }
				]}
				value={tab}
				onchange={(v) => (tab = v === 'shop' ? 'shop' : 'plan')}
			/>
		</div>

		<div class={['flex flex-col gap-3', tab !== 'plan' && 'hidden']} data-slot="plan">
			{#if avgProtein !== undefined || avgKcal !== undefined}
				<section class="flex flex-col gap-1.5" aria-labelledby="{uid}-avg" data-slot="totals">
					<h3 id="{uid}-avg" class="text-footnote text-ripple-muted-foreground">Daily average per person</h3>
					<div class="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2">
						{#if avgProtein !== undefined}
							{@const gp = positive(goalObj.protein_g)}
							<StatChip label="Protein" value={g0(avgProtein)} unit={gp ? `/ ${num(gp)} g` : 'g'} status={proteinCheck?.status} statusLabel={proteinCheck?.word} icon={Dumbbell} />
						{/if}
						{#if avgKcal !== undefined}
							{@const gk = positive(goalObj.kcal)}
							<StatChip label="Calories" value={g0(avgKcal)} unit={gk ? `/ ${num(gk)} kcal` : 'kcal'} status={kcalCheck?.status} statusLabel={kcalCheck?.word} icon={Flame} />
						{/if}
					</div>
				</section>
			{/if}

			{#if view.length}
				<div style:--slots={slots.length || 1} data-slot="week-grid">
					{#if grid}
						<div class="hidden gap-x-1 border-b border-ripple-border pb-1.5 @min-[540px]:grid @min-[540px]:grid-cols-[6.75rem_repeat(var(--slots),minmax(0,1fr))]" aria-hidden="true">
							<span></span>
							{#each slots as s (s)}
								{@const SlotIcon = kindIcon(MEAL_ICONS, s)}
								<span class="flex min-w-0 items-center gap-1.5 px-0.5 text-footnote text-ripple-muted-foreground">
									<SlotIcon size={14} strokeWidth={1.75} class="shrink-0" /><span class="truncate">{slotLabel(s)}</span>
								</span>
							{/each}
						</div>
					{/if}
					<ol class="divide-y divide-ripple-border" aria-label="Days">
						{#each view as d, di (d.key)}
							{@const open = single || openDay === d.di}
							{@const cells = slots.map((s) => d.meals.filter((m) => m.slot === s))}
							{@const sums = totals(d)}
							<li
								class={['flex flex-col py-2.5', grid && '@min-[540px]:grid @min-[540px]:grid-cols-[6.75rem_repeat(var(--slots),minmax(0,1fr))] @min-[540px]:items-start @min-[540px]:gap-x-1 @min-[540px]:py-2']}
								in:rise={{ index: di }}
								data-day={d.label}
							>
								<!-- Row header: a disclosure, or a plain header for a one-day plan. Hidden in the grid, which has its own. -->
								<svelte:element
									this={single ? 'div' : 'button'}
									class={['flex w-full min-w-0 items-start gap-2 rounded-md text-left', !single && focusRing, grid && '@min-[540px]:hidden']}
									{...single ? {} : { type: 'button', 'aria-expanded': open, 'aria-controls': `${uid}-day-${d.di}`, onclick: () => (openDay = open ? null : d.di) }}
								>
									<span class="flex min-w-0 flex-1 flex-col gap-1">
										<!-- Pill sits on the header line so every row's meter runs the full width with the goal tick at one x. -->
										<span class="flex min-w-0 items-center gap-2">
											<span class="min-w-0 flex-1 truncate text-callout font-medium" title={d.label}>{d.label}</span>
											{@render miss(d)}
											{#if sums.length}<span class="shrink-0 text-footnote text-ripple-muted-foreground tabular-nums" data-slot="day-totals">{sums.join(' · ')}</span>{/if}
										</span>
										{#if d.ratio !== undefined}<span class="flex">{@render meter(d)}</span>{/if}
										{#if !d.meals.length}
											<span class="text-footnote text-ripple-muted-foreground">Nothing planned</span>
										{:else if !open}
											{@const names = d.meals.map((m) => m.name)}
											<span class="line-clamp-2 text-footnote text-ripple-muted-foreground" title={names.join(' · ')} data-slot="summary">{summary(names)}</span>
										{/if}
									</span>
									{#if d.meals.length && !single}
										<ChevronDown
											size={16}
											strokeWidth={1.75}
											aria-hidden="true"
											class={['mt-px shrink-0 text-ripple-muted-foreground transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-180']}
										/>
									{/if}
								</svelte:element>
								{#if grid}
									<div class="hidden min-w-0 flex-col gap-1 py-1 pr-1 @min-[540px]:flex">
										<span class="flex min-w-0 items-center gap-1">
											<span class="min-w-0 flex-1 truncate text-callout font-medium" title={d.label}>{d.label}</span>
											{@render miss(d)}
										</span>
										{#if d.protein !== undefined || d.kcal !== undefined}
											<span class="truncate text-footnote text-ripple-muted-foreground tabular-nums">{[d.protein !== undefined && `${num(g0(d.protein))} g`, d.kcal !== undefined && `${num(g0(d.kcal))} kcal`].filter(Boolean).join(' · ')}</span>
										{/if}
										{#if d.ratio !== undefined}<span class="flex">{@render meter(d)}</span>{/if}
									</div>
								{/if}

								<div
									id="{uid}-day-{d.di}"
									class={['flex-col gap-0.5 pt-1.5', open && d.meals.length ? 'flex' : 'hidden', grid && '@min-[540px]:contents']}
									data-slot="meals"
								>
									{#each cells as cell, ci (slots[ci])}
										<div class={['min-w-0 flex-col gap-1', cell.length ? 'flex' : 'hidden', grid && d.meals.length && '@min-[540px]:flex']}>
											{#each cell as m (m.key)}
												{@const SlotIcon = kindIcon(MEAL_ICONS, m.slot)}
												{@const at = `${d.di}:${m.mi}`}
												{@const isOpen = openAt === at}
												<div
													class={[
														'flex min-w-0 items-center gap-1 rounded-md transition-colors @min-[540px]:gap-0.5 duration-150 motion-reduce:transition-none',
														grid && '@min-[540px]:relative @min-[540px]:block',
														isOpen ? 'bg-ripple-accent/8 ring-1 ring-ripple-accent' : m.recipe && 'hover:bg-ripple-muted'
													]}
													data-meal={m.recipe?.ref}
													data-slot={m.recipe ? undefined : 'meal-pending'}
												>
													{#if m.recipe}
														<button
															type="button"
															class={['flex min-w-0 flex-1 items-start gap-2 rounded-md px-1.5 py-1.5 text-left', focusRing, grid && '@min-[540px]:pr-0 @min-[540px]:pl-0.5']}
															aria-expanded={isOpen}
															aria-controls="{uid}-recipe-{d.di}"
															onclick={() => (openAt = isOpen ? null : at)}
														>
															{@render slotCol(SlotIcon, m.slot)}
															<span class="flex min-w-0 flex-1 flex-col">
																<span class="line-clamp-2 text-callout font-medium break-words" title={m.name}>{#if grid}<span class="hidden h-3 w-5 @min-[540px]:float-right @min-[540px]:block" aria-hidden="true"></span>{/if}{m.name}</span>
																{#if m.recipe.kcal !== undefined || m.recipe.protein !== undefined}
																	<span class={['text-footnote text-ripple-muted-foreground tabular-nums', grid && '@min-[540px]:hidden']}>
																		{[m.recipe.protein !== undefined && `${num(m.recipe.protein)} g protein`, m.recipe.kcal !== undefined && `${num(m.recipe.kcal)} kcal`].filter(Boolean).join(' · ')}
																	</span>
																{/if}
															</span>
														</button>
													{:else}
														<span class={['flex min-w-0 flex-1 items-start gap-2 px-1.5 py-1.5', grid && '@min-[540px]:pr-0 @min-[540px]:pl-0.5']}>
															{@render slotCol(SlotIcon, m.slot)}
															<span class="flex min-w-0 flex-1 flex-col">
																<span class="line-clamp-2 text-callout break-words text-ripple-muted-foreground" title={m.name}>{#if grid}<span class="hidden h-3 w-5 @min-[540px]:float-right @min-[540px]:block" aria-hidden="true"></span>{/if}{m.name}</span>
																<span class="text-footnote text-ripple-muted-foreground">Not in recipes</span>
															</span>
														</span>
													{/if}
													<label
														class={[
															grid && '@min-[540px]:absolute @min-[540px]:top-0.5 @min-[540px]:right-0 @min-[540px]:size-6',
															'relative grid size-7 shrink-0 place-items-center rounded-md text-ripple-muted-foreground transition-colors focus-within:outline-2 focus-within:outline-ripple-ring motion-reduce:transition-none',
															m.opts.length > 1 ? 'hover:bg-ripple-muted hover:text-ripple-surface-foreground' : 'opacity-40'
														]}
														title={m.opts.length > 1 ? 'Swap this meal' : m.recipe ? `No other ${m.slot} recipes` : 'Not in recipes'}
													>
														<ArrowLeftRight size={14} strokeWidth={1.75} aria-hidden="true" />
														<select
															class="absolute inset-0 size-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
															aria-label="Swap {d.label} {slotLabel(m.slot)}"
															disabled={m.opts.length < 2}
															value={m.recipe?.ref ?? ''}
															onchange={(e) => swap(d.di, m.mi, e.currentTarget.value)}
														>
															{#each m.opts as o (o.key)}
																<option value={o.ref}>{o.name}{o.protein !== undefined ? ` (${num(o.protein)} g protein)` : ''}</option>
															{:else}
																<option value="">{m.name}</option>
															{/each}
														</select>
													</label>
												</div>
											{/each}
											{#if !cell.length}<span class="px-1.5 py-1.5 text-footnote text-ripple-muted-foreground">None</span>{/if}
										</div>
									{/each}
								</div>
								{#if grid && !d.meals.length}
									<p class="hidden py-1 text-footnote text-ripple-muted-foreground @min-[540px]:col-[2/-1] @min-[540px]:block">Nothing planned</p>
								{/if}

								{#each d.meals as m (m.key)}
									{#if openAt === `${d.di}:${m.mi}` && m.recipe}
										<div id="{uid}-recipe-{d.di}" class="col-span-full mt-2 rounded-md bg-ripple-muted/60 p-3" in:rise>
											<Recipe
												embedded
												name={m.recipe.name}
												kind={m.recipe.raw.kind as never}
												image={m.recipe.raw.image as never}
												minutes={m.recipe.raw.minutes as never}
												serves={m.recipe.raw.serves as never}
												kcal={m.recipe.raw.kcal as never}
												protein_g={m.recipe.raw.protein_g as never}
												tags={m.recipe.raw.tags as never}
												ingredients={m.recipe.raw.ingredients as never}
												steps={m.recipe.raw.steps as never}
												goal={goal}
												servings={count}
												onclose={() => (openAt = null)}
											/>
										</div>
									{/if}
								{/each}
							</li>
						{/each}
					</ol>
				</div>
				{#if canSwap}<p class="text-footnote text-ripple-muted-foreground">Swap any meal; the shopping list follows.</p>{/if}
			{:else}
				<SectionCard title="Week" empty="No meals yet. Ask for a week of meals." />
			{/if}
		</div>

		<section class={['flex flex-col gap-2', tab !== 'shop' && 'hidden']} aria-label="Shopping list" data-slot="shopping-view">
			<p class="text-footnote text-ripple-muted-foreground tabular-nums">
				<span>For {people$(count)}</span>{#if shopCount}{' · '}<span>{gotCount ? `${gotCount} of ${shopCount} got` : `${shopCount} ${shopCount === 1 ? 'item' : 'items'}`}</span>{/if}
			</p>
			{#if shopCount}
				<div class="columns-1 gap-6 @min-[540px]:columns-2" data-slot="shopping">
					{#each shop as g (g.aisle)}
						{@const AisleIcon = kindIcon(AISLE_ICONS, g.aisle)}
						<section class="mb-4 min-w-0 break-inside-avoid" data-aisle={g.aisle}>
							<h4 class="mb-1 flex items-center gap-1.5 text-footnote font-medium text-ripple-muted-foreground">
								<AisleIcon size={14} strokeWidth={1.75} aria-hidden="true" />{slotLabel(g.aisle)}
								<span class="ml-auto tabular-nums">{g.items.length}</span>
							</h4>
							<ul class="flex flex-col divide-y divide-ripple-border">
								{#each g.items as it (it.key)}
									{@const ticked = gotSet.has(it.key)}
									{@const amount = qtyLabel(it.qty, it.unit)}
									<li>
										<button
											type="button"
											role="checkbox"
											aria-checked={ticked}
											class={['flex w-full items-start gap-2.5 rounded py-1.5 text-left', focusRing]}
											onclick={() => toggleGot(it.key)}
											data-item={it.key}
										>
											<span
												class={[
													'mt-px grid size-4 shrink-0 place-items-center rounded-[4px] border transition-colors duration-150 motion-reduce:transition-none',
													ticked ? 'border-ripple-accent bg-ripple-accent text-ripple-accent-foreground' : 'border-ripple-muted-foreground'
												]}
												aria-hidden="true"
											>
												{#if ticked}<Check size={11} strokeWidth={3} />{/if}
											</span>
											<span class={['min-w-0 flex-1 text-callout break-words', ticked && 'text-ripple-muted-foreground line-through']}>
												{it.name}{#if it.uses > 1}<span class="text-footnote text-ripple-muted-foreground">{` · ${it.uses} meals`}</span>{/if}
											</span>
											<span class={['shrink-0 text-callout tabular-nums', ticked ? 'text-ripple-muted-foreground' : 'font-medium']} data-slot="amount">{amount || 'to taste'}</span>
										</button>
									</li>
								{/each}
							</ul>
						</section>
					{/each}
				</div>
			{:else}
				<p class="text-callout text-ripple-muted-foreground">The list fills in as meals are planned.</p>
			{/if}
		</section>
	</div>
</div>

{#snippet slotCol(SlotIcon: LucideIcon, slot: string)}
	<span class={['flex w-[4.5rem] shrink-0 items-center gap-1.5 pt-px text-footnote text-ripple-muted-foreground', grid && '@min-[540px]:sr-only']}>
		<SlotIcon size={14} strokeWidth={1.75} aria-hidden="true" class="shrink-0" /><span class="truncate">{slotLabel(slot)}</span>
	</span>
{/snippet}
