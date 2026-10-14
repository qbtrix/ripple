<!--
  widgets/composite/StandupBoard.svelte: `standup-board`, one day's team
  standup as a read-and-unblock card. It answers, in order: who is stuck, on
  what, and is everyone else fine. The model writes people (name, role,
  yesterday, today, blocker, status); the viewer can mark a blocker resolved.

  Layout: a verdict line and the open-blocker count up top, then people in
  groups (blocked, on track, done, away). Every row sits on one grid: avatar
  track | name track | Today | Yesterday (520px and up) | chevron, so names and
  updates start on one x. Blocked people are always expanded, with a 32px
  avatar, a two-line person block and the blocker sentence on a red rule.
  With 5 or more people every on-track and done row is one quiet line (24px
  avatar, name, updates clamped to one line in muted ink) that expands on tap;
  the chevron shows only when the clamp hides something. Below 520px of the
  card's own width a row's Today and Yesterday sit under the name in a
  label | text grid. Container queries only.

  Invariants:
  - `value` ({ resolved: person ids }) is the bound field (default `value` /
    `onchange`). The shown value is the bound value, else a local Edit
    (data-kit/edit.ts) while it holds against the raw people, else none.
  - The open count and the verdict are derived (standup-board.ts), never
    stored; the model's people are never edited.
  - Rows group by the model's status, not by resolved, so a resolved row stays
    where the pointer is and its Undo stays reachable.
  - Whether a row collapses depends on the head count only, never on how long
    its text is. Whether it is a button depends on having any text, never on a
    layout measurement (jsdom and SSR have none).
-->
<script lang="ts">
	import { safeStyle, safeUrl } from '@ripple-ui/core';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Moon from '@lucide/svelte/icons/moon';
	import OctagonAlert from '@lucide/svelte/icons/octagon-alert';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import Segmented from '../input/Segmented.svelte';
	import { STATUS_CLASS, STATUS_WORDS, dateLabel, holds, nextEdit, plain, rise } from '../data-kit/index.js';
	import type { Edit } from '../data-kit/edit.js';
	import type { Verdict } from '../data-kit/types.js';
	import {
		deriveVerdict,
		initials,
		manyBlocked,
		nameHue,
		openBlocked,
		ordered,
		readPeople,
		toValue,
		type Person,
		type StandupStatus,
		type StandupValue
	} from './standup-board.js';

	interface Props {
		id?: string;
		class?: string;
		style?: string | Record<string, string>;
		/** Card title. Default "Standup". */
		team?: string;
		/** ISO day ("2026-10-14") or free text. */
		date?: string;
		/** One sentence; derived from the people when missing. */
		summary?: string;
		people?: unknown[];
		/** Accepted in place of `people`. */
		members?: unknown[];
		/** Two-way bindable: ids of people whose blocker the viewer resolved. */
		value?: StandupValue;
		onchange?: (value: StandupValue) => void;
	}

	let { id, class: className, style, team, date, summary, people, members, value = $bindable(), onchange }: Props = $props();

	const rootStyle = $derived(
		style && typeof style === 'object'
			? safeStyle(Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';'))
			: safeStyle(typeof style === 'string' ? style : '')
	);
	const title = $derived(plain(team) || 'Standup');
	const day = $derived(dateLabel(date, 'en-GB').replace(',', ''));

	const read = $derived(readPeople(people, members));
	const all = $derived(read.people);
	const total = $derived(all.length);

	// ── Resolved: bound value, else a holding edit, else none ───────────────
	const incoming = $derived({ people, members });
	let edit = $state.raw<Edit<StandupValue> | null>(null);
	const bound = $derived(toValue(value));
	const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
	const resolved = $derived.by(() => {
		if (bound && !(edit && same(bound, edit.value))) return bound.resolved;
		return holds(edit, incoming) ? edit.value.resolved : [];
	});

	const open = $derived(openBlocked(all, resolved).length);
	const blockedCount = $derived(all.filter((p) => p.status === 'blocked').length);
	const awayCount = $derived(all.filter((p) => p.status === 'away').length);
	const verdict = $derived<Required<Verdict> | undefined>(plain(summary) ? { text: plain(summary), status: open ? 'bad' : 'good' } : deriveVerdict(all, resolved));
	const many = $derived(manyBlocked(blockedCount, total));
	const compact = $derived(total > 4);

	// ── Filter ──────────────────────────────────────────────────────────────
	let filter = $state<'all' | 'blocked'>('all');
	const showFilter = $derived(blockedCount > 0 && total >= 5 && (open > 0 || filter === 'blocked'));
	const view = $derived(filter === 'blocked' && blockedCount ? 'blocked' : 'all');

	const GROUPS: { key: StandupStatus; label: string }[] = [
		{ key: 'blocked', label: 'Blocked' },
		{ key: 'on-track', label: 'On track' },
		{ key: 'done', label: 'Done' },
		{ key: 'away', label: 'Away' }
	];
	const groups = $derived.by(() => {
		const rows = ordered(all).filter((p) => view === 'all' || p.status === 'blocked');
		return GROUPS.map((g) => ({ ...g, people: rows.filter((p) => p.status === g.key) })).filter((g) => g.people.length);
	});

	// ── Expand and fold ─────────────────────────────────────────────────────
	let expanded = $state<Record<string, boolean>>({});
	let unfolded = $state<Record<string, boolean>>({});
	/** Whether a shut row's clamp hides anything (measured; absent until mounted). */
	let more = $state<Record<string, boolean>>({});
	const collapsed = (p: Person) => compact && (p.status === 'on-track' || p.status === 'done');

	/**
	 * Marks `more[id]` when a `[data-clamp]` cell in the row is cut off or
	 * hidden by the layout. `key` is "<id> <shut>", so it re-checks on every
	 * fold change as well as on resize.
	 */
	function clampWatch(node: HTMLElement, key: string) {
		const id = key.split(' ')[0];
		const check = () => {
			const cells = [...node.querySelectorAll<HTMLElement>('[data-clamp]')];
			if (!cells.length) return;
			const m = cells.some((el) => !el.getClientRects().length || el.scrollWidth > el.clientWidth + 1);
			if (more[id] !== m) more[id] = m;
		};
		check();
		const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check);
		ro?.observe(node);
		return { update: check, destroy: () => ro?.disconnect() };
	}

	// ── Resolve ─────────────────────────────────────────────────────────────
	let announce = $state('');
	const firstOf = (p: Person) => p.name.split(/\s+/)[0];

	function toggleResolved(p: Person) {
		const was = resolved.includes(p.id);
		const next = { resolved: was ? resolved.filter((x) => x !== p.id) : [...resolved, p.id] };
		edit = nextEdit(edit, incoming, next);
		value = next;
		onchange?.(next);
		const left = openBlocked(all, next.resolved).length;
		announce = `${firstOf(p)}'s blocker ${was ? 'reopened' : 'resolved'}. ${left ? `${left} open ${left === 1 ? 'blocker' : 'blockers'}` : 'No open blockers'}.`;
	}

	const meta = $derived(
		[total > 2 ? `${total} people` : '', awayCount ? `${awayCount} away` : ''].filter(Boolean).join(' · ')
	);

	const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ripple-ring';
	// One grid for every row and the column header: avatar | name | Today | (Yesterday) | chevron.
	const grid =
		'grid-cols-[2rem_6rem_minmax(0,1fr)_1rem] gap-x-2 @min-[520px]:grid-cols-[2rem_8.5rem_minmax(0,1fr)_minmax(0,1fr)_1rem] @min-[520px]:gap-x-3';
	const textLine = 'min-w-0 text-callout text-pretty [overflow-wrap:break-word]';
	const noUpdate = 'italic text-ripple-muted-foreground';
	const nameWrap = '[overflow-wrap:break-word] hyphens-auto';
</script>

{#snippet face(p: Person, small: boolean)}
	{@const src = safeUrl(p.avatar, { kind: 'resource' })}
	<Avatar.Root class={['col-start-1 row-start-1', small ? 'size-6 self-center' : 'size-8 self-start', p.status === 'away' && 'opacity-50']}>
		{#if src}<Avatar.Image {src} alt="" />{/if}
		<Avatar.Fallback class={['standup-initials font-semibold text-ripple-surface-foreground', small ? 'text-[10px]' : 'text-[11px]']} style="--h:{nameHue(p.name)}">{initials(p.name)}</Avatar.Fallback>
	</Avatar.Root>
{/snippet}

{#snippet mark(p: Person, done: boolean, awayBadge: boolean)}
	{#if p.status === 'blocked'}
		<span class={['inline-flex shrink-0 items-center gap-1 text-footnote font-medium', done ? STATUS_CLASS.good.text : STATUS_CLASS.bad.text]} data-slot="mark">
			{#if done}<CircleCheck size={14} strokeWidth={2} aria-hidden="true" />Resolved{:else}<OctagonAlert size={14} strokeWidth={2} aria-hidden="true" />Blocked{/if}
		</span>
	{:else if awayBadge}
		<span class={['inline-flex shrink-0 items-center gap-1 text-footnote font-medium', STATUS_CLASS.neutral.text]} data-slot="mark">
			<Moon size={14} strokeWidth={2} aria-hidden="true" />Away
		</span>
	{/if}
{/snippet}

{#snippet pair(label: string, t: string, col: string, hide: boolean)}
	<span class={hide ? 'hidden @min-[520px]:contents' : 'contents'}>
		<span class="text-footnote font-medium text-ripple-muted-foreground @min-[520px]:sr-only">{label}</span>
		<span class={[textLine, col, '@min-[520px]:row-start-1']}>{#if t}{t}{:else}<span class={noUpdate}>No update</span>{/if}</span>
	</span>
{/snippet}

<div {id} class={['@container max-w-[760px] text-ripple-surface-foreground', className]} style={rootStyle} data-widget="standup-board">
	<div class="flex flex-col gap-3 rounded-ripple border border-ripple-border bg-ripple-surface p-4">
		<header class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1.5" data-slot="header">
			<h2 class="col-span-2 flex min-w-0 items-baseline justify-between gap-x-3 @min-[520px]:col-span-1 @min-[520px]:flex-wrap @min-[520px]:justify-start @min-[520px]:gap-x-2">
				<span class="text-headline font-semibold text-pretty [overflow-wrap:anywhere]">{title}</span>
				{#if day}<span class="shrink-0 text-footnote text-ripple-muted-foreground tabular-nums">{day}</span>{/if}
			</h2>
			{#if total && (open || meta)}
				<p class="col-span-2 row-start-3 flex items-baseline justify-between gap-x-3 @min-[520px]:col-span-1 @min-[520px]:col-start-2 @min-[520px]:row-span-2 @min-[520px]:row-start-1 @min-[520px]:flex-col @min-[520px]:items-end @min-[520px]:gap-y-1.5" data-slot="hero">
					{#if open}
						<span class="flex items-baseline gap-1.5" data-slot="count">
							<span class="text-title-2 font-semibold tabular-nums">{open}</span>
							<span class="text-callout">open {open === 1 ? 'blocker' : 'blockers'}</span>
						</span>
					{/if}
					{#if meta}<span class="text-footnote text-ripple-muted-foreground tabular-nums" data-slot="meta">{meta}</span>{/if}
				</p>
			{/if}
			{#if verdict}
				<div class="col-span-2 row-start-2 @min-[520px]:col-span-1">
					<p class="flex items-start gap-1.5 text-body-emph" data-status={verdict.status} data-slot="verdict">
						<span class="flex h-[1lh] w-5 shrink-0 items-center justify-center" aria-hidden="true">
							{#if verdict.status === 'good'}
								<CircleCheck size={16} strokeWidth={2} class={STATUS_CLASS.good.text} />
							{:else}
								<span class={['size-2 rounded-full', STATUS_CLASS[verdict.status].fill]}></span>
							{/if}
						</span>
						<span class="min-w-0 text-pretty"><span class="sr-only">{STATUS_WORDS[verdict.status]}: </span>{verdict.text}</span>
					</p>
				</div>
			{/if}
		</header>

		{#if !total}
			<p class="text-callout text-ripple-muted-foreground">No one has posted an update yet.</p>
		{:else}
			<div class="flex flex-col border-t border-ripple-border pt-3">
				<div class={['items-center pb-1 text-footnote text-ripple-muted-foreground @min-[520px]:grid', grid, showFilter ? 'flex' : 'hidden']} data-slot="columns">
					{#if showFilter}
						<div class="col-span-2 col-start-1 row-start-1 justify-self-start @min-[640px]:col-span-2 @min-[640px]:col-start-4 @min-[640px]:justify-self-end" role="group" aria-label="Show people">
							<Segmented
								size="sm"
								options={[
									{ value: 'all', label: 'All' },
									{ value: 'blocked', label: 'Blocked' }
								]}
								value={view}
								onchange={(v) => (filter = v === 'blocked' ? 'blocked' : 'all')}
							/>
						</div>
					{/if}
					<span class="hidden @min-[520px]:col-start-3 @min-[520px]:row-start-1 @min-[520px]:block" aria-hidden="true">Today</span>
					<span class="hidden @min-[520px]:col-start-4 @min-[520px]:row-start-1 @min-[520px]:block" aria-hidden="true">Yesterday</span>
				</div>

				{#if view === 'blocked' && !open}
					<p class="py-2 text-callout text-ripple-muted-foreground">
						No open blockers.
						<button type="button" class={['font-medium text-ripple-accent-text underline-offset-2 hover:underline', focusRing]} onclick={() => (filter = 'all')}>Show everyone</button>
					</p>
				{/if}

				{#each groups as g (g.key)}
					{@const headed = g.key !== 'blocked' && groups.length > 1}
					<section aria-label={g.label} data-group={g.key}>
						{#if headed}
							<h3 class="mt-2 flex items-center gap-2 py-1.5 text-footnote font-medium text-ripple-muted-foreground" data-slot="group">
								{#if g.key === 'done'}<CircleCheck size={14} strokeWidth={2} aria-hidden="true" class={STATUS_CLASS.good.text} />{/if}
								{#if g.key === 'away'}<Moon size={14} strokeWidth={2} aria-hidden="true" />{/if}
								<span class={g.key === 'done' ? STATUS_CLASS.good.text : ''}>{g.label}</span>
								<span class="tabular-nums">{g.people.length}</span>
								<span class="h-px flex-1 bg-ripple-border" aria-hidden="true"></span>
							</h3>
						{/if}
						<ul class="flex flex-col">
							{#each g.people as p, i (p.id)}
								{@const isBlocked = p.status === 'blocked'}
								{@const done = resolved.includes(p.id)}
								{@const folds = collapsed(p)}
								{@const canExpand = folds && !!(p.today || p.yesterday)}
								{@const shut = folds && !expanded[p.id]}
								{@const away = p.status === 'away'}
								{@const line = shut || away}
								{@const small = line || folds}
								{@const fold = isBlocked && compact && !unfolded[p.id]}
								{@const rowClass = [
									'grid w-full text-left',
									grid,
									line ? 'min-h-11 content-center items-baseline py-2' : 'items-start py-3',
									canExpand && ['rounded-md hover:bg-ripple-muted/60', focusRing]
								]}
								<li in:rise={{ index: i }} data-person={p.id} data-status={p.status} data-resolved={done || undefined} use:clampWatch={`${p.id} ${shut}`}>
									{#snippet body()}
										{@render face(p, small)}

										{#if line}
											<span class={['col-start-2 row-start-1 min-w-0 truncate text-body leading-6', nameWrap]}>
												<span class="font-semibold" data-slot="name">{p.name}</span>
												{#if p.role}<span class="ml-1.5 hidden text-footnote text-ripple-muted-foreground @min-[520px]:inline" data-slot="role">{p.role}</span>{/if}
												{#if away && !headed}<span class="ml-1.5">{@render mark(p, done, true)}</span>{/if}
											</span>
											{#if away}
												{#if p.today}<span class={['col-start-3 row-start-1 min-w-0 truncate text-callout leading-6 text-ripple-muted-foreground']}>{p.today}</span>{/if}
											{:else}
												<span class={['col-start-3 row-start-1 min-w-0 truncate text-callout leading-6 text-ripple-muted-foreground']} data-clamp={p.today ? '' : undefined}>{#if p.today}{p.today}{:else}<span class="italic">No update</span>{/if}</span>
												<span class={['col-start-4 row-start-1 hidden min-w-0 truncate text-callout leading-6 text-ripple-muted-foreground @min-[520px]:block']} data-clamp={p.yesterday ? '' : undefined}>{#if p.yesterday}{p.yesterday}{:else}<span class="italic">No update</span>{/if}</span>
											{/if}
										{:else}
											<span
												class={[
													'row-start-1 flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 @min-[520px]:col-[2/3] @min-[520px]:flex-col @min-[520px]:justify-start @min-[520px]:pr-1',
													canExpand ? 'col-[2/-2]' : 'col-[2/-1]',
													isBlocked && '@min-[520px]:row-span-2'
												]}
											>
												<span class={['flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-body leading-snug @min-[520px]:flex-col @min-[520px]:items-start', nameWrap]}>
													<span class="font-semibold" data-slot="name">{p.name}</span>
													{#if p.role}<span class="text-footnote text-ripple-muted-foreground" data-slot="role">{p.role}</span>{/if}
												</span>
												{@render mark(p, done, away && !headed)}
											</span>

											{#if isBlocked}
												<span class={['col-[2/-1] row-start-2 mt-1.5 flow-root border-l-2 pl-3 text-body @min-[520px]:col-[3/-1] @min-[520px]:mt-2', done ? 'border-ripple-border' : 'border-ripple-error']} data-slot="blocker">
													<span class={['text-pretty [overflow-wrap:break-word]', done ? 'text-body text-ripple-muted-foreground line-through' : p.blocker ? 'text-body-emph' : 'text-body text-ripple-muted-foreground']}>{p.blocker || 'No detail given'}</span>
													<button
														type="button"
														class={['relative float-right ml-3 rounded-sm px-1 text-callout leading-(--lh-body) font-medium text-ripple-accent-text after:absolute after:-inset-x-1 after:-inset-y-3 hover:underline underline-offset-2', focusRing]}
														aria-label={done ? `Undo resolving ${p.name}'s blocker` : `Resolve ${p.name}'s blocker`}
														onclick={() => toggleResolved(p)}>{done ? 'Undo' : 'Resolve'}</button>
												</span>
											{/if}

											<span class={['col-[2/-1] mt-1.5 grid grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-x-2 gap-y-1 @min-[520px]:contents', isBlocked ? 'row-start-3' : 'row-start-2']}>
												{@render pair('Today', p.today, '@min-[520px]:col-start-3', fold && many)}
												{@render pair('Yesterday', p.yesterday, '@min-[520px]:col-start-4', fold)}
												{#if fold}
													<button
														type="button"
														class={['col-span-2 inline-flex min-h-8 items-center gap-1 justify-self-start text-footnote font-medium text-ripple-muted-foreground @min-[520px]:hidden', focusRing]}
														aria-expanded={false}
														onclick={() => (unfolded[p.id] = true)}
													>{many ? 'Today and yesterday' : 'Yesterday'}<ChevronRight size={14} strokeWidth={2} aria-hidden="true" /></button>
												{/if}
											</span>
										{/if}

										{#if canExpand}
											<ChevronRight
												size={16}
												strokeWidth={2}
												aria-hidden="true"
												class={['col-start-4 row-start-1 self-center justify-self-end text-ripple-muted-foreground transition-transform duration-150 motion-reduce:transition-none @min-[520px]:col-start-5', !shut && 'rotate-90', shut && !more[p.id] && 'invisible']}
											/>
										{/if}
									{/snippet}
									{#if canExpand}
										<button type="button" class={rowClass} aria-expanded={!shut} onclick={() => (expanded[p.id] = !expanded[p.id])}>{@render body()}</button>
									{:else}
										<div class={rowClass}>{@render body()}</div>
									{/if}
								</li>
							{/each}
						</ul>
					</section>
				{/each}

				{#if read.more}
					<p class="pt-2 text-footnote text-ripple-muted-foreground">and {read.more} more</p>
				{/if}
			</div>
		{/if}

		<p class="sr-only" aria-live="polite">{announce}</p>
	</div>
</div>

<style>
	/* The initials tint keeps each person's hue in both themes: lightness comes
	   from the opaque ink (dark ink, light disc; light ink, dark disc), never
	   from --ripple-muted, which hosts may make translucent. */
	:global(.standup-initials) {
		background-color: oklch(from var(--ripple-surface-foreground) clamp(0.32, calc(1.15 - l), 0.9) 0.045 var(--h));
	}
</style>
