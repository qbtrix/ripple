<!--
  widgets/composite/PipelineDashboard.svelte: `pipeline-dashboard` (aliases
  `sales-dashboard`, `funnel-dashboard`). One chat card that answers: how close
  are we to the target, where do things stall, who carries it, which deals
  matter and what just happened. The domain may be sales, hiring or a
  fundraiser; every data rule lives in pipeline-dashboard.ts.

  Frame: the host card is the only frame. A header (h3 title, muted subtitle,
  plain period text), then sections in one column split by hairlines, each
  under an h4 label row: quota, funnel (or conversion when there is no usable
  funnel), leaderboard, deals, recent activity. A section with no data renders
  nothing; with no data at all one muted line says so.

  Leaderboard: at 480px and up the sublabel sits on the name line and wraps
  under the name when both cannot fit, so it never squeezes the name. The
  delta stacks under the value at every width, as plain muted signed text
  (no arrow, no pill), so two money figures never sit side by side.

  Never put `text-body` and a `text-ripple-*` colour through one cn() call:
  tailwind-merge reads both as colours and drops the size.

  Colour: one accent. Only the quota fill, the funnel's own bars and worst
  step, the lowest conversion rate (accent ink) and the success line at or
  past target carry colour. No pace judgement: the widget has no pace data.

  Layout follows the root's own width (container query at 480px): the period
  moves beside the title, leaderboard sublabels move onto the name line,
  activity times move into a right column, and the deals
  table replaces its stacked rows (Table layout="stack"). Lists cap at 5 reps,
  6 deals and 4 events behind a Show more button; nothing scrolls inside.
  The root forwards `id` and data-ripple-node for the visual editor.
-->
<script lang="ts">
	import { safeStyle, safeUrl } from '@ripple-ui/core';
	import Check from '@lucide/svelte/icons/check';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import { cn } from '$lib/utils.js';
	import Icon, { iconExists } from '$lib/widgets/display/Icon.svelte';
	import Avatar from '$lib/widgets/display/Avatar.svelte';
	import Funnel from '$lib/widgets/data/Funnel.svelte';
	import Table from '$lib/widgets/data/Table.svelte';
	import Delta from '$lib/widgets/data-kit/Delta.svelte';
	import { plain } from '$lib/widgets/data-kit/format.js';
	import {
		funnelStages,
		moreLabel,
		readCurrency,
		readDeals,
		readLeaders,
		readQuota,
		readRates,
		readTicker,
		usableFunnel,
		type Leader
	} from './pipeline-dashboard.js';

	interface Props {
		id?: string;
		class?: string;
		style?: Record<string, string> | string;
		title?: string;
		subtitle?: string;
		period?: string;
		quota?: { label?: string; current: number; target: number; currency?: string; period?: string };
		funnel?: { stages: Array<{ label: string; value: number; color?: string }>; title?: string };
		conversion?: Array<{ from: string; to: string; rate: number }>;
		leaderboard?: { title?: string; items: Array<Record<string, unknown>> };
		deals?: { title?: string; columns: Array<{ key: string; label: string; align?: 'left' | 'right' | 'center' }>; rows: Record<string, unknown>[] };
		ticker?: Array<{ time: string; label: string; actor?: string; icon?: string }>;
	}

	let { id, class: className, style, title, subtitle, period, quota, funnel, conversion, leaderboard, deals, ticker }: Props = $props();

	const CAP = { leaders: 5, deals: 6, events: 4 };

	const rootStyle = $derived(
		style && typeof style === 'object'
			? safeStyle(Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';'))
			: safeStyle(typeof style === 'string' ? style : '')
	);
	const heading = $derived(plain(title));
	const sub = $derived(plain(subtitle));
	const per = $derived(plain(period));

	const q = $derived(readQuota(quota));
	const stages = $derived(funnelStages(funnel));
	const funnelTitle = $derived(plain((funnel as { title?: unknown } | undefined)?.title) || 'Pipeline');
	const rates = $derived(usableFunnel(stages) ? [] : readRates(conversion));
	const board = $derived(leaderboard && typeof leaderboard === 'object' ? leaderboard : undefined);
	const leaders = $derived(readLeaders(board?.items, readCurrency(quota?.currency)));
	const d = $derived(readDeals(deals, readCurrency(quota?.currency)));
	const events = $derived(readTicker(ticker));
	const empty = $derived(!q && !stages.length && !rates.length && !leaders.length && !d.rows.length && !events.length);

	let open = $state({ leaders: false, deals: false, events: false });
	const cut = <T,>(list: T[], key: keyof typeof CAP) => (open[key] ? list : list.slice(0, CAP[key]));

	const leaderText = (l: Leader) => [l.rank, l.name || 'Unnamed', l.value ?? 'n/a', l.delta, l.sublabel].filter(Boolean).join(', ');

	const sec = 'flex min-w-0 flex-col gap-3 border-t border-ripple-border pt-4 first:border-t-0 first:pt-0';
	const row = 'border-b border-ripple-border last:border-b-0';
</script>

{#snippet label(text: string, count?: number)}
	<h4 class="m-0 text-caption-1 font-semibold uppercase tracking-[0.04em] text-ripple-muted-foreground [overflow-wrap:break-word]">
		{text}{#if count}<span class="font-normal tabular-nums">{' · '}{count}</span>{/if}
	</h4>
{/snippet}

{#snippet more(key: keyof typeof CAP, total: number, noun: string)}
	{#if total > CAP[key]}
		<button
			type="button"
			aria-expanded={open[key]}
			onclick={() => (open[key] = !open[key])}
			class="-mx-1.5 -my-1 inline-flex min-h-8 items-center self-start rounded-md px-1.5 text-callout font-medium text-ripple-muted-foreground transition-colors hover:bg-ripple-track hover:text-ripple-surface-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ripple-ring active:bg-ripple-border"
		>
			{open[key] ? 'Show fewer' : moreLabel(total, CAP[key], noun)}
		</button>
	{/if}
{/snippet}

<div {id} data-ripple-node={id} class={cn('@container flex w-full min-w-0 flex-col gap-4 text-ripple-surface-foreground', className)} style={rootStyle} data-widget="pipeline-dashboard">
	{#if heading || sub || per}
		<header class="flex min-w-0 flex-col gap-1 @min-[480px]:grid @min-[480px]:grid-cols-[minmax(0,1fr)_auto] @min-[480px]:items-baseline @min-[480px]:gap-x-4">
			{#if heading}<h3 class="m-0 text-title-3 font-semibold text-pretty [overflow-wrap:break-word]">{heading}</h3>{/if}
			{#if sub}<p class="m-0 text-callout text-pretty text-ripple-muted-foreground [overflow-wrap:break-word] @min-[480px]:col-start-1">{sub}</p>{/if}
			{#if per}<p class="m-0 text-callout text-ripple-muted-foreground @min-[480px]:col-start-2 @min-[480px]:row-start-1 @min-[480px]:max-w-[16rem] @min-[480px]:text-right">{per}</p>{/if}
		</header>
	{/if}

	{#if empty}
		<p class="m-0 text-callout text-ripple-muted-foreground">No pipeline data yet</p>
	{:else}
		<div class="flex min-w-0 flex-col gap-4 {heading || sub || per ? 'border-t border-ripple-border pt-4' : ''}">
			{#if q}
				<section class={sec} data-slot="quota">
					<h4 class="m-0 text-caption-1 font-semibold tracking-[0.04em] text-pretty text-ripple-muted-foreground [overflow-wrap:break-word]">
						<span class="uppercase">{q.label}</span>{#if q.period}<span class="font-normal tracking-normal">{' · '}{q.period}</span>{/if}
					</h4>
					<div class="flex items-baseline justify-between gap-3">
						<p class="m-0 min-w-0">
							<span class="whitespace-nowrap text-title-2 font-semibold tabular-nums">{q.current}</span>
							{#if q.target}<span class="whitespace-nowrap text-body text-ripple-muted-foreground tabular-nums">of {q.target}</span>{/if}
						</p>
						{#if q.pctText}<span class="shrink-0 text-title-3 font-semibold tabular-nums">{q.pctText}</span>{/if}
					</div>
					{#if q.pct !== undefined}
						<div
							role="progressbar"
							aria-label={q.label}
							aria-valuemin={0}
							aria-valuemax={100}
							aria-valuenow={Math.min(100, Math.round(q.pct))}
							aria-valuetext="{q.current} of {q.target}, {q.pctText?.replace('%', ' percent')}"
							class="h-2 overflow-hidden rounded-full bg-ripple-track"
						>
							<div class="h-full rounded-full bg-ripple-accent transition-[width] duration-200 ease-(--ripple-ease-out) motion-reduce:transition-none" style:width="{Math.min(100, q.pct)}%"></div>
						</div>
						{#if q.met}
							<p class="m-0 flex items-center gap-1 text-callout font-medium text-ripple-success-text" data-slot="quota-foot"><Check size={14} strokeWidth={2.5} aria-hidden="true" />{q.foot}</p>
						{:else}
							<p class="m-0 text-callout text-ripple-muted-foreground tabular-nums" data-slot="quota-foot">{q.foot}</p>
						{/if}
					{/if}
				</section>
			{/if}

			{#if stages.length}
				<section class={sec} data-slot="funnel">
					{@render label(funnelTitle)}
					<Funnel data={stages} />
				</section>
			{/if}

			{#if rates.length}
				<section class={sec} data-slot="conversion">
					{@render label('Conversion')}
					<ul class="m-0 flex list-none flex-col p-0">
						{#each rates as r (r.key)}
							<li class="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0 {row}">
								<span class="min-w-0 text-body [overflow-wrap:break-word]">
									{#if r.from && r.to}{r.from}<ArrowRight size={12} class="mx-1 inline-block align-[-1px] text-ripple-muted-foreground" aria-hidden="true" /><span class="sr-only">{' to '}</span>{r.to}{:else if r.from}From {r.from}{:else}To {r.to}{/if}
								</span>
								<span class="shrink-0 text-body font-medium tabular-nums {r.lowest ? 'text-ripple-accent-text' : ''}">{r.text}</span>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if leaders.length}
				<section class={sec} data-slot="leaderboard">
					{@render label(plain(board?.title) || 'Leaderboard', leaders.length)}
					<ol class="m-0 flex list-none flex-col p-0">
						{#each cut(leaders, 'leaders') as l (l.key)}
							<li aria-label={leaderText(l)} class="grid min-h-11 grid-cols-[1.5rem_1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 py-1.5 @min-[480px]:min-h-9 {row}">
								<span aria-hidden="true" class="justify-self-center tabular-nums" data-slot="rank">
									{#if l.rank <= 3}
										<span class="inline-flex size-5 items-center justify-center rounded-full bg-ripple-track text-footnote font-semibold">{l.rank}</span>
									{:else}
										<span class="text-footnote text-ripple-muted-foreground">{l.rank}</span>
									{/if}
								</span>
								<span aria-hidden="true" class="contents"><Avatar src={safeUrl(l.avatar, { kind: 'resource' })} alt={l.name} class="size-7 text-[11px]" /></span>
								<span aria-hidden="true" class="flex min-w-0 flex-col @min-[480px]:flex-row @min-[480px]:flex-wrap @min-[480px]:items-baseline @min-[480px]:gap-x-2">
									<span class="min-w-0 truncate text-body {l.name ? '' : 'pr-1 italic text-ripple-muted-foreground'}" title={l.name || undefined}>{l.name || 'Unnamed'}</span>
									{#if l.sublabel}<span class="min-w-0 text-callout text-ripple-muted-foreground [overflow-wrap:break-word] @min-[480px]:truncate" title={l.sublabel}>{l.sublabel}</span>{/if}
								</span>
								<span aria-hidden="true" class="flex flex-col items-end gap-0.5">
									{#if l.value}<span class="whitespace-nowrap text-body font-medium tabular-nums">{l.value}</span>{:else}<span class="text-callout text-ripple-muted-foreground">n/a</span>{/if}
									{#if l.delta}<Delta text={l.delta} dir={l.dir} sentiment="neutral" arrow={false} class="bg-transparent px-0 py-0" />{/if}
								</span>
							</li>
						{/each}
					</ol>
					{@render more('leaders', leaders.length, 'more')}
				</section>
			{/if}

			{#if d.rows.length}
				<section class={sec} data-slot="deals">
					{@render label(d.title || 'Deals', d.rows.length)}
					<Table layout="stack" columns={d.columns} rows={cut(d.rows, 'deals')} />
					{@render more('deals', d.rows.length, 'more')}
				</section>
			{/if}

			{#if events.length}
				<section class={sec} data-slot="activity">
					{@render label('Recent activity', events.length)}
					<ol class="m-0 flex list-none flex-col p-0">
						{#each cut(events, 'events') as e (e.key)}
							<li class="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3 py-2 first:pt-0 last:pb-0 @min-[480px]:grid-cols-[1rem_minmax(0,1fr)_auto] {row}">
								<span class="flex h-[1lh] items-center justify-center text-body text-ripple-muted-foreground" aria-hidden="true" data-slot="event-icon">
									{#if iconExists(e.icon)}<Icon name={e.icon} size={14} />{:else}<span class="size-1.5 rounded-full bg-ripple-muted-foreground"></span>{/if}
								</span>
								<div class="min-w-0">
									<p class="m-0 text-body text-pretty [overflow-wrap:break-word]">{e.label}</p>
									{#if e.actor || e.time}
										<p class="m-0 text-callout text-ripple-muted-foreground">
											{e.actor}{#if e.time}<span class="@min-[480px]:hidden">{e.actor ? ' · ' : ''}<span class="whitespace-nowrap">{e.time}</span></span>{/if}
										</p>
									{/if}
								</div>
								{#if e.time}<span class="hidden text-right text-callout whitespace-nowrap text-ripple-muted-foreground tabular-nums @min-[480px]:block">{e.time}</span>{/if}
							</li>
						{/each}
					</ol>
					{@render more('events', events.length, 'earlier')}
				</section>
			{/if}
		</div>
	{/if}
</div>
