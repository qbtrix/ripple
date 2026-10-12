<!--
  widgets/composite/WeekSchedule.svelte: `week-schedule`: a week calendar the
  model fills with events. Days are columns, hours are rows, and each event is
  a coloured block placed by its start and end; overlapping events share the
  column side by side. A red line marks the current time when today is shown.
  Pressing a block opens its details (time, length, place) under the grid.

  Invariants:
  - `value` is the selected event id (default `value` / `onchange` bind). The
    shown selection is the bound value when one is bound, else local state.
  - Today and the time line come from the visitor's clock, re-read after mount
    and every minute, so a prerendered page catches up.
  - Below 560px the grid hides and a day-by-day list shows the same events.
    Same data, container queries only.
-->
<script lang="ts">
	import { safeStyle } from '@ripple-ui/core';
	import Clock from '@lucide/svelte/icons/clock';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import X from '@lucide/svelte/icons/x';
	import { plain } from '../data-kit/index.js';
	import { duration, hhmm, lanes, readDayNames, readEvents, todayIndex, type Block } from './week-schedule.js';

	interface Props {
		id?: string;
		class?: string;
		style?: string | Record<string, string>;
		title?: string;
		/** First hour on the grid, 0 to 23. Default 7. */
		startHour?: number;
		/** Last hour on the grid, 1 to 24. Default 21. */
		endHour?: number;
		/** Column names. Default Mon to Sun. */
		days?: string[];
		events?: Array<{ id?: string; day: string; start: string; end: string; title: string; place?: string; color?: string }>;
		/** Two-way bindable: the selected event id. */
		value?: string | null;
		onchange?: (value: string | null) => void;
	}

	let { id, class: className, style, title, startHour, endHour, days, events, value = $bindable(), onchange }: Props = $props();

	const rootStyle = $derived(
		style && typeof style === 'object'
			? safeStyle(Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';'))
			: safeStyle(typeof style === 'string' ? style : '')
	);
	const heading = $derived(plain(title).trim());
	const h0 = $derived.by(() => {
		const n = Math.trunc(Number(startHour));
		return Number.isFinite(n) && n >= 0 && n <= 23 ? n : 7;
	});
	const h1 = $derived.by(() => {
		const n = Math.trunc(Number(endHour));
		return Number.isFinite(n) && n > h0 && n <= 24 ? n : Math.max(21, h0 + 1);
	});
	const from = $derived(h0 * 60);
	const to = $derived(h1 * 60);
	const hours = $derived(Array.from({ length: h1 - h0 }, (_, i) => h0 + i));
	const cols = $derived(readDayNames(days));
	const blocks = $derived(readEvents(events, cols, from, to));
	const byDay = $derived(cols.map((_, d) => blocks.filter((b) => b.day === d)));
	const placed = $derived(byDay.map((bs) => lanes(bs)));
	const totalMin = $derived(blocks.reduce((n, b) => n + b.end - b.start, 0));

	// ── The visitor's clock ─────────────────────────────────────────────────
	let now = $state(new Date());
	$effect(() => {
		now = new Date();
		const timer = setInterval(() => (now = new Date()), 60_000);
		return () => clearInterval(timer);
	});
	const today = $derived(todayIndex(cols, now));
	const nowMin = $derived(now.getHours() * 60 + now.getMinutes());
	const showNow = $derived(today >= 0 && nowMin >= from && nowMin <= to);

	// ── Selection ───────────────────────────────────────────────────────────
	let local = $state<string | null>(null);
	const selId = $derived(value !== undefined ? value : local);
	const sel = $derived(blocks.find((b) => b.id === selId));

	function pick(b: Block | null) {
		const next = b && b.id !== selId ? b.id : null;
		local = next;
		value = next;
		onchange?.(next);
	}

	const pctTop = (m: number) => ((m - from) / (to - from)) * 100;
	const span = (b: Block) => `${hhmm(b.start)} to ${hhmm(b.end)}`;
	function place(b: Block, d: number) {
		const p = placed[d].get(b.id) ?? { lane: 0, of: 1 };
		return `top:${pctTop(b.start)}%;height:${((b.end - b.start) / (to - from)) * 100}%;left:${(p.lane / p.of) * 100}%;width:${100 / p.of}%;--ev:${b.color}`;
	}
	const hourLabel = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;

	const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ripple-ring';
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && sel && pick(null)} />

<div {id} class={['@container text-ripple-surface-foreground', className]} style={rootStyle} data-widget="week-schedule">
	<section class="flex flex-col gap-3 rounded-ripple border border-ripple-border bg-ripple-surface p-4" aria-label={heading || 'Week schedule'}>
		<header class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
			{#if heading}<h2 class="text-title-3 font-semibold text-pretty">{heading}</h2>{/if}
			<p class="text-footnote text-ripple-muted-foreground tabular-nums" data-slot="summary">
				{`${blocks.length} ${blocks.length === 1 ? 'event' : 'events'} · ${duration(totalMin)} booked`}
			</p>
		</header>

		<!-- Wide: the week grid. -->
		<div class="ws-wide hidden max-h-[34rem] overflow-auto rounded-md border border-ripple-border @min-[560px]:block" data-slot="grid">
			<div class="ws-grid" style="--cols:{cols.length};--rows:{hours.length}">
				<div class="ws-corner"></div>
				{#each cols as name, d (d)}
					<div class={['ws-head text-footnote font-medium', d === today ? 'text-ripple-accent' : 'text-ripple-muted-foreground']}>
						<span class={['rounded-full px-2 py-0.5', d === today && 'bg-ripple-accent text-ripple-accent-foreground']}>{name}</span>
					</div>
				{/each}
				<div class="ws-gutter" aria-hidden="true">
					{#each hours as h, i (h)}
						{#if i}<span class="text-caption-2 text-ripple-muted-foreground tabular-nums" style="top:{(i / hours.length) * 100}%">{hourLabel(h)}</span>{/if}
					{/each}
				</div>
				{#each cols as name, d (d)}
					<div class="ws-col" role="group" aria-label={name}>
						{#each byDay[d] as b (b.id)}
							<button
								type="button"
								class={['ws-ev', focusRing, b.end - b.start < 45 && 'ws-short', selId === b.id && 'ws-on']}
								style={place(b, d)}
								aria-pressed={selId === b.id}
								aria-label="{b.title}, {name} {span(b)}{b.place ? `, ${b.place}` : ''}"
								data-event={b.id}
								onclick={() => pick(b)}
							>
								<span class="ws-title">{b.title}</span>
								<span class="ws-time tabular-nums">{hhmm(b.start)}</span>
							</button>
						{/each}
						{#if showNow && d === today}
							<span class="ws-now" style="top:{pctTop(nowMin)}%" data-slot="now-line" aria-hidden="true"></span>
						{/if}
					</div>
				{/each}
			</div>
		</div>

		<!-- Narrow: day by day. -->
		<ol class="flex flex-col gap-3 @min-[560px]:hidden" data-slot="list">
			{#each cols as name, d (d)}
				{#if byDay[d].length}
					<li class="flex flex-col gap-1">
						<h3 class={['text-footnote font-semibold', d === today ? 'text-ripple-accent' : 'text-ripple-muted-foreground']}>{name}{d === today ? ' · Today' : ''}</h3>
						<ul class="flex flex-col gap-1">
							{#each byDay[d] as b (b.id)}
								<li>
									<button
										type="button"
										class={['ws-row flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-ripple-muted', focusRing, selId === b.id && 'bg-ripple-muted']}
										style="--ev:{b.color}"
										aria-pressed={selId === b.id}
										aria-label="{b.title}, {name} {span(b)}{b.place ? `, ${b.place}` : ''}"
										data-event={b.id}
										onclick={() => pick(b)}
									>
										<span class="w-11 shrink-0 text-footnote text-ripple-muted-foreground tabular-nums">{hhmm(b.start)}</span>
										<span class="ws-bar h-8 w-1 shrink-0 rounded-full"></span>
										<span class="min-w-0 flex-1">
											<span class="block truncate text-callout font-medium">{b.title}</span>
											<span class="block truncate text-caption-1 text-ripple-muted-foreground">{duration(b.end - b.start)}{b.place ? ` · ${b.place}` : ''}</span>
										</span>
									</button>
								</li>
							{/each}
						</ul>
					</li>
				{/if}
			{/each}
		</ol>

		{#if !blocks.length}
			<p class="py-2 text-callout text-ripple-muted-foreground">Nothing scheduled this week.</p>
		{/if}

		{#if sel}
			<div class="ws-detail flex items-start gap-3 rounded-md border border-ripple-border p-3" style="--ev:{sel.color}" data-slot="detail" aria-live="polite">
				<span class="ws-bar mt-1 h-10 w-1 shrink-0 rounded-full"></span>
				<div class="min-w-0 flex-1">
					<p class="text-body-emph">{sel.title}</p>
					<p class="flex items-center gap-1.5 text-footnote text-ripple-muted-foreground tabular-nums">
						<Clock size={13} aria-hidden="true" />{cols[sel.day]}, {span(sel)} · {duration(sel.end - sel.start)}
					</p>
					{#if sel.place}<p class="flex items-center gap-1.5 text-footnote text-ripple-muted-foreground"><MapPin size={13} aria-hidden="true" />{sel.place}</p>{/if}
				</div>
				<button type="button" class={['grid size-8 shrink-0 place-items-center rounded-md text-ripple-muted-foreground hover:bg-ripple-muted', focusRing]} aria-label="Close details" onclick={() => pick(null)}>
					<X size={16} aria-hidden="true" />
				</button>
			</div>
		{/if}
	</section>
</div>

<style>
	.ws-grid {
		display: grid;
		grid-template-columns: 3rem repeat(var(--cols), minmax(5.5rem, 1fr));
		grid-template-rows: auto calc(var(--rows) * 2.75rem);
		min-width: min-content;
	}
	.ws-corner,
	.ws-head {
		position: sticky;
		top: 0;
		z-index: 3;
		background: var(--color-ripple-surface, Canvas);
		border-bottom: 1px solid var(--color-ripple-border, rgb(127 127 127 / 0.25));
	}
	.ws-corner {
		left: 0;
		z-index: 4;
	}
	.ws-head {
		display: flex;
		justify-content: center;
		padding: 0.5rem 0;
	}
	.ws-gutter {
		position: sticky;
		left: 0;
		z-index: 2;
		background: var(--color-ripple-surface, Canvas);
	}
	.ws-gutter span {
		position: absolute;
		right: 0.375rem;
		transform: translateY(-50%);
	}
	.ws-col {
		position: relative;
		border-left: 1px solid var(--color-ripple-border, rgb(127 127 127 / 0.25));
		background-image: linear-gradient(to bottom, var(--color-ripple-border, rgb(127 127 127 / 0.25)) 1px, transparent 1px);
		background-size: 100% 2.75rem;
	}
	.ws-ev {
		position: absolute;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		overflow: hidden;
		padding: 0.25rem 0.375rem;
		border: 2px solid var(--color-ripple-surface, Canvas);
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--ev) 18%, var(--color-ripple-surface, Canvas));
		box-shadow: inset 3px 0 0 var(--ev);
		text-align: left;
		font-size: 0.75rem;
		line-height: 1.2;
		transition: background-color 150ms;
	}
	.ws-ev:hover,
	.ws-on {
		background: color-mix(in oklab, var(--ev) 32%, var(--color-ripple-surface, Canvas));
	}
	.ws-on {
		z-index: 1;
	}
	.ws-title {
		font-weight: 600;
		overflow: hidden;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}
	.ws-time {
		color: color-mix(in oklab, currentColor 65%, transparent);
	}
	.ws-short {
		flex-direction: row;
		align-items: center;
		gap: 0.375rem;
		padding-block: 0;
	}
	.ws-short .ws-title {
		-webkit-line-clamp: 1;
		line-clamp: 1;
	}
	.ws-now {
		position: absolute;
		left: -1px;
		right: 0;
		z-index: 2;
		height: 2px;
		background: #ef4444;
		pointer-events: none;
	}
	.ws-now::before {
		content: '';
		position: absolute;
		left: -4px;
		top: -3px;
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: #ef4444;
	}
	.ws-bar {
		background: var(--ev);
	}
	@media (prefers-reduced-motion: reduce) {
		.ws-ev {
			transition: none;
		}
	}
</style>
