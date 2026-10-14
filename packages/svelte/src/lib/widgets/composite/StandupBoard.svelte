<!--
  widgets/composite/StandupBoard.svelte: `standup-board`, one day's team
  standup as a read-and-unblock card. It answers, in order: who is stuck, on
  what, and is everyone else fine. The model writes people (name, role,
  yesterday, today, blocker, status); the viewer can mark a blocker resolved.

  Layout: a verdict line and the open-blocker count up top, then people in
  groups (blocked, on track, done, away). Blocked people are always expanded
  with the blocker sentence on a red rule; with more than 4 people the others
  collapse to one line that expands on tap. Below 520px of the card's own
  width each person stacks with inline "Today" / "Yesterday" labels; above it
  rows share a person | today | yesterday grid under one header row.
  Container queries only.

  Invariants:
  - `value` ({ resolved: person ids }) is the bound field (default `value` /
    `onchange`). The shown value is the bound value, else a local Edit
    (data-kit/edit.ts) while it holds against the raw people, else none.
  - The open count and the verdict are derived (standup-board.ts), never
    stored; the model's people are never edited.
  - Rows group by the model's status, not by resolved, so a resolved row stays
    where the pointer is and its Undo stays reachable.
-->
<script lang="ts">
	import { safeStyle, safeUrl } from '@ripple-ui/core';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Moon from '@lucide/svelte/icons/moon';
	import OctagonAlert from '@lucide/svelte/icons/octagon-alert';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import Segmented from '../input/Segmented.svelte';
	import { STATUS_CLASS, VerdictLine, dateLabel, holds, nextEdit, plain, rise } from '../data-kit/index.js';
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
	const verdict = $derived<Verdict | undefined>(plain(summary) ? { text: plain(summary), status: open ? 'bad' : 'good' } : deriveVerdict(all, resolved));
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
	const collapsible = (p: Person) => compact && (p.status === 'on-track' || p.status === 'done') && !!(p.today || p.yesterday);

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
	const cols = '@min-[520px]:grid @min-[520px]:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)_1rem] @min-[520px]:gap-x-3';
	const textLine = 'text-callout text-pretty [overflow-wrap:anywhere]';
	const noUpdate = 'italic text-ripple-muted-foreground';
</script>

{#snippet face(p: Person, small: boolean)}
	{@const src = safeUrl(p.avatar, { kind: 'resource' })}
	<Avatar.Root class={[small ? 'size-6 @min-[520px]:size-8' : 'size-8', p.status === 'away' && 'opacity-50']}>
		{#if src}<Avatar.Image {src} alt="" />{/if}
		<Avatar.Fallback class={['standup-initials font-semibold text-ripple-surface-foreground', small ? 'text-[10px] @min-[520px]:text-[11px]' : 'text-[11px]']} style="--h:{nameHue(p.name)}">{initials(p.name)}</Avatar.Fallback>
	</Avatar.Root>
{/snippet}

{#snippet nameRole(p: Person, line: boolean)}
	<span class="min-w-0 text-body leading-snug text-pretty [overflow-wrap:break-word]">
		<span class="font-semibold" data-slot="name">{p.name}</span>{' '}
		{#if p.role}
			<span class={['text-footnote text-ripple-muted-foreground @min-[520px]:block', line && 'hidden']} data-slot="role"><span class="@min-[520px]:hidden" aria-hidden="true">·&nbsp;</span>{p.role}</span>
		{/if}
	</span>
{/snippet}

{#snippet text(label: string, t: string, clamp: boolean, extra: string)}
	<span class={[clamp ? 'line-clamp-1 @min-[520px]:line-clamp-2' : 'block', textLine, extra]}>
		<span class={['mr-1 text-footnote font-medium text-ripple-muted-foreground @min-[520px]:sr-only', clamp && 'sr-only']}>{label}</span>
		{#if t}{t}{:else}<span class={noUpdate}>No update</span>{/if}
	</span>
{/snippet}

<div {id} class={['@container max-w-[760px] text-ripple-surface-foreground', className]} style={rootStyle} data-widget="standup-board">
	<div class="flex flex-col gap-3 rounded-ripple border border-ripple-border bg-ripple-surface p-4">
		<header class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1.5" data-slot="header">
			<h2 class="col-span-2 flex min-w-0 items-baseline justify-between gap-x-3 @min-[520px]:col-span-1 @min-[520px]:justify-start">
				<span class="text-headline font-semibold text-pretty [overflow-wrap:anywhere]">{title}</span>
				{#if day}<span class="shrink-0 text-footnote text-ripple-muted-foreground tabular-nums"><span class="hidden @min-[520px]:inline" aria-hidden="true">·&nbsp;</span>{day}</span>{/if}
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
					{#if verdict.status === 'good'}
						<p class="flex items-start gap-2 text-body-emph" data-status="good" data-slot="verdict">
							<CircleCheck size={16} strokeWidth={2} aria-hidden="true" class={['mt-[3px] shrink-0', STATUS_CLASS.good.text]} />
							<span class="min-w-0 text-pretty">{verdict.text}</span>
						</p>
					{:else}
						<VerdictLine {verdict} />
					{/if}
				</div>
			{/if}
		</header>

		{#if !total}
			<p class="text-callout text-ripple-muted-foreground">No one has posted an update yet.</p>
		{:else}
			<div class="flex flex-col border-t border-ripple-border pt-3">
				{#if showFilter}
					<div class="mb-1 self-start @min-[520px]:self-end" role="group" aria-label="Show people">
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
				<div class={['hidden pb-1 text-footnote text-ripple-muted-foreground', cols]} aria-hidden="true" data-slot="columns">
					<span></span><span>Today</span><span>Yesterday</span><span></span>
				</div>

				{#if view === 'blocked' && !open}
					<p class="py-2 text-callout text-ripple-muted-foreground">
						No open blockers.
						<button type="button" class={['font-medium text-ripple-accent underline-offset-2 hover:underline', focusRing]} onclick={() => (filter = 'all')}>Show everyone</button>
					</p>
				{/if}

				{#each groups as g (g.key)}
					<section aria-label={g.label} data-group={g.key}>
						{#if g.key !== 'blocked' && groups.length > 1}
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
								{@const canExpand = collapsible(p)}
								{@const shut = canExpand && !expanded[p.id]}
								{@const away = p.status === 'away'}
								{@const line = shut || away}
								{@const fold = isBlocked && compact && !unfolded[p.id]}
								{@const indent = isBlocked ? 'pl-3.5 @min-[520px]:pl-0' : 'pl-[2.625rem] @min-[520px]:pl-0'}
								{@const rowClass = [
									'w-full text-left',
									cols,
									line ? 'flex min-h-11 items-center gap-2.5 py-2 @min-[520px]:items-start' : 'flex flex-col gap-1.5 py-3',
									canExpand && ['rounded-md hover:bg-ripple-muted/60', focusRing]
								]}
								<li in:rise={{ index: i }} data-person={p.id} data-status={p.status} data-resolved={done || undefined}>
									{#snippet body()}
										<span class={['flex min-w-0 gap-2.5 @min-[520px]:col-start-1 @min-[520px]:row-start-1 @min-[520px]:row-span-2', line ? 'max-w-[55%] shrink-0 items-center @min-[520px]:max-w-none @min-[520px]:items-start' : 'items-start']}>
											{@render face(p, line)}
											<span class={['flex min-w-0 flex-1', line ? 'flex-wrap items-center gap-x-2' : 'flex-wrap items-start justify-between gap-x-3 gap-y-0.5 @min-[520px]:flex-col @min-[520px]:justify-start']}>
												{@render nameRole(p, line)}
												{#if isBlocked}
													<span class={['inline-flex shrink-0 items-center gap-1 text-footnote font-medium', done ? STATUS_CLASS.good.text : STATUS_CLASS.bad.text]} data-slot="mark">
														{#if done}<CircleCheck size={14} strokeWidth={2} aria-hidden="true" />Resolved{:else}<OctagonAlert size={14} strokeWidth={2} aria-hidden="true" />Blocked{/if}
													</span>
												{:else if away}
													<span class={['inline-flex shrink-0 items-center gap-1 text-footnote font-medium', STATUS_CLASS.neutral.text]} data-slot="mark">
														<Moon size={14} strokeWidth={2} aria-hidden="true" />Away
													</span>
												{/if}
											</span>
										</span>

										{#if isBlocked}
											<span class={['flex flex-wrap items-baseline justify-between gap-x-3 border-l-2 pl-3 @min-[520px]:col-span-2 @min-[520px]:col-start-2 @min-[520px]:row-start-2 @min-[520px]:mt-2', done ? 'border-ripple-border' : 'border-ripple-error']} data-slot="blocker">
												<span class={['min-w-0 flex-1 basis-48 text-pretty [overflow-wrap:anywhere]', done ? 'text-body text-ripple-muted-foreground line-through' : p.blocker ? 'text-body-emph' : 'text-body text-ripple-muted-foreground']}>{p.blocker || 'No detail given'}</span>
												<button
													type="button"
													class={['relative ml-auto shrink-0 rounded-sm px-1 text-callout font-medium text-ripple-accent after:absolute after:-inset-x-1 after:-inset-y-3 hover:underline underline-offset-2', focusRing]}
													aria-label={done ? `Undo resolving ${p.name}'s blocker` : `Resolve ${p.name}'s blocker`}
													onclick={() => toggleResolved(p)}>{done ? 'Undo' : 'Resolve'}</button>
											</span>
										{/if}

										{#if away}
											{#if p.today}<span class={['min-w-0 flex-1 text-ripple-muted-foreground @min-[520px]:col-start-2 @min-[520px]:row-start-1', textLine]}>{p.today}</span>{/if}
										{:else}
											{#if fold}
												<button
													type="button"
													class={['order-2 inline-flex min-h-8 items-center gap-1 self-start text-footnote font-medium text-ripple-muted-foreground @min-[520px]:hidden', indent, focusRing]}
													aria-expanded={false}
													onclick={() => (unfolded[p.id] = true)}
												>{many ? 'Today and yesterday' : 'Yesterday'}<ChevronRight size={14} strokeWidth={2} aria-hidden="true" /></button>
											{/if}
											{@render text('Today', p.today, shut, [
												'order-1 @min-[520px]:col-start-2 @min-[520px]:row-start-1',
												line ? 'min-w-0 flex-1 text-ripple-muted-foreground @min-[520px]:text-ripple-surface-foreground' : indent,
												fold && many && 'hidden @min-[520px]:block'
											].filter(Boolean).join(' '))}
											{@render text('Yesterday', p.yesterday, shut, [
												'order-3 @min-[520px]:col-start-3 @min-[520px]:row-start-1',
												line ? (shut ? 'hidden @min-[520px]:[display:-webkit-box]' : 'hidden @min-[520px]:block') : indent,
												fold && 'hidden @min-[520px]:block'
											].filter(Boolean).join(' '))}
										{/if}

										{#if canExpand}
											<ChevronRight size={16} strokeWidth={2} aria-hidden="true" class={['order-4 ml-auto shrink-0 text-ripple-muted-foreground transition-transform duration-150 motion-reduce:transition-none @min-[520px]:col-start-4 @min-[520px]:row-start-1 @min-[520px]:mt-0.5', !shut && 'rotate-90']} />
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
	:global(.standup-initials) {
		background-color: oklch(from var(--ripple-muted) l 0.045 var(--h));
	}
</style>
