<!--
  widgets/data/Calendar.svelte: the `calendar` widget. A month (or week) of
  model events in a chat card, and a day picker. All parsing, the opening
  period, week segments, lanes and the agenda come from calendar-layout.ts
  (pure, unit tested); this file only lays them out.

  Opening period: `value` if it is an ISO day, else today's period when it has
  events, else the next event's, else the latest event's, else today's. It is
  recomputed when `value` or the events change, until the reader navigates.
  Today is read from the visitor's clock after mount.

  Layout switches on the widget's own width (container query, 520px):
  - wide (the base, what jsdom sees): only the weeks the month touches; each
    week row is as tall as its lanes (cap 3 in month view, then "+N more"),
    single-day events are chips, multi-day events one bar per week segment;
  - narrow: 40px rows with up to 3 colour dots per day, then a hairline and
    an agenda listing every event in the shown period, grouped by day. The
    agenda opens with the selected day's group, else today's, flush at its
    top edge (never a cut row there); only the bottom edge fades.

  Chips are one line with an ellipsis, in month and week view alike: timed
  events lead with the time in the chip's own ink, lighter and in tabular
  figures ("9:30 Design review"); when columns are under about 110px a
  whole-hour time drops its ":00". Date-only events and spans show the title
  alone. A span segment that continues from an earlier week has squared left
  corners and a leading chevron; one that runs on has squared right corners
  and a trailing chevron. Chips and bars sit above the day hairlines.
  Weekday label, numeral and chip text share one left inset (--cal-inset).

  UI words ("Today", the count, "All day") come from words() in the locale.

  Invariants:
  - Structure is an APG grid: gridcells hold a day button and, beside it,
    event buttons; never a button inside a button. One roving tab stop.
  - Event colours are hex or palette constants from calendar-layout.ts, used
    only through color-mix against the surface tokens.
  - on_change gets the ISO day; on_select gets the model's own event object.
  - The root forwards `id` and data-ripple-node for the visual editor.
-->
<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { safeStyle } from '@ripple-ui/core';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { safeArray } from '$lib/utils/safe-props.js';
	import {
		agenda,
		countIn,
		dayDate,
		fmt,
		isoOf,
		layoutWeek,
		localDay,
		monthStart,
		nearest,
		openPeriod,
		parseEvents,
		period,
		rangeLabel,
		readDay,
		shiftPeriod,
		weekday,
		weeksOf,
		words,
		MAX_EVENTS,
		type CalEvent
	} from './calendar-layout.js';

	type Event = { id: string | number; title: string; start: string; end?: string; color?: string };

	interface Props {
		id?: string;
		class?: string;
		style?: string | Record<string, string>;
		events?: Event[];
		view?: 'month' | 'week';
		/** ISO date for the focused day. Bind via `bind: "<state-path>"`. */
		value?: string | null;
		locale?: string;
		onchange?: (iso: string) => void;
		onselect?: (event: Event) => void;
	}

	let { id, class: className, style, events: rawEvents = [], view = 'month', value = null, locale, onchange, onselect }: Props = $props();

	const rootStyle = $derived(
		style && typeof style === 'object'
			? safeStyle(Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';'))
			: safeStyle(typeof style === 'string' ? style : '')
	);
	const loc = $derived(typeof locale === 'string' && locale.trim() ? locale.trim() : undefined);
	const mode = $derived<'month' | 'week'>(view === 'week' ? 'week' : 'month');
	const parsed = $derived(parseEvents(safeArray(rawEvents, { widget: 'calendar', key: 'events' })));
	const events = $derived(parsed.events);

	// ── Clock, selection, period ────────────────────────────────────────────
	let now = $state(new Date());
	$effect(() => {
		now = new Date();
	});
	const today = $derived(localDay(now));

	/** Day picked by a tap or key (null: follow `value`). */
	let picked = $state<number | null>(null);
	/** Period start chosen by navigation (null: the opening rule). */
	let navigated = $state<number | null>(null);
	$effect(() => {
		void value;
		untrack(() => {
			picked = null;
			navigated = null;
		});
	});

	const selected = $derived(picked ?? readDay(value)?.day ?? null);
	const anchor = $derived(navigated ?? openPeriod(events, value, mode, today));
	const range = $derived(period(anchor, mode));
	const weeks = $derived(weeksOf(anchor, mode));
	const cap = $derived(mode === 'month' ? 3 : Infinity);
	let expanded = $state<number | null>(null);
	const layouts = $derived(weeks.map((w) => layoutWeek(events, w, w === expanded ? Infinity : cap)));
	const agendaDays = $derived(agenda(events, range[0], range[1], mode === 'week'));
	const count = $derived(countIn(events, range[0], range[1]));
	const jump = $derived(count ? undefined : nearest(events, range[0], range[1]));
	const showsToday = $derived(today >= range[0] && today <= range[1]);
	const inPeriod = (d: number) => d >= range[0] && d <= range[1];

	// ── Labels (every Intl call goes through fmt's try/catch) ───────────────
	const F = $derived({
		month: fmt(loc, { month: 'long', year: 'numeric' }),
		monthName: fmt(loc, { month: 'long' }),
		short: fmt(loc, { weekday: 'short' }),
		narrow: fmt(loc, { weekday: 'narrow' }),
		long: fmt(loc, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
		head: fmt(loc, { weekday: 'short', month: 'short', day: 'numeric' }),
		md: fmt(loc, { month: 'short', day: 'numeric' }),
		year: fmt(loc, { year: 'numeric' })
	});
	// 2026-02-01 is a Sunday.
	const SUNDAY = 20485;
	const weekdays = $derived([0, 1, 2, 3, 4, 5, 6].map((i) => ({ short: F.short(SUNDAY + i), narrow: F.narrow(SUNDAY + i) })));
	const heading = $derived(mode === 'month' ? F.month(anchor) : rangeLabel(range[0], range[1], loc, true));
	const W = $derived(words(loc));
	const countLabel = $derived(count ? W.count(count) : W.none);
	const plural = (n: number) => `${n} ${n === 1 ? 'event' : 'events'}`;

	const titleOf = (e: CalEvent) => e.title || 'Untitled event';
	const whenOf = (e: CalEvent) =>
		e.end > e.start ? rangeLabel(e.start, e.end, loc) : `${F.md(e.start)}${e.time ? ` at ${e.time}` : ''}`;
	const nameOf = (e: CalEvent) => `${titleOf(e)}, ${whenOf(e)}`;
	const metaOf = (e: CalEvent) => (e.end > e.start ? rangeLabel(e.start, e.end, loc) : e.time ?? W.allDay);
	const undatedLine = $derived.by(() => {
		const u = parsed.undated;
		if (!u.length) return '';
		const n = `${plural(u.length)} without a date`;
		return u.length > 2 ? n : `${n}: ${u.map((x) => x.title || 'Untitled event').join(', ')}`;
	});
	const undatedTitles = $derived(parsed.undated.map((x) => x.title || 'Untitled event').join(', '));
	const emptyLine = $derived.by(() => {
		if (count || !events.length) return '';
		return mode === 'month' ? `No events in ${F.monthName(anchor)}.` : 'No events this week.';
	});

	// ── Actions ─────────────────────────────────────────────────────────────
	let rootEl: HTMLDivElement | undefined = $state();
	let agendaEl: HTMLElement | undefined = $state();
	let focusDay = $state<number | null>(null);
	const tabDay = $derived.by(() => {
		for (const d of [focusDay, selected, today]) if (d !== null && inPeriod(d)) return d;
		return range[0];
	});

	function go(start: number) {
		navigated = start;
		expanded = null;
	}
	function shift(delta: number) {
		go(shiftPeriod(anchor, mode, delta));
	}

	/** Scroll the agenda to a day's group; `fallback` scrolls to the top when the day has none. */
	function scrollAgenda(day: number | null, fallback = true): boolean {
		const el = agendaEl;
		if (!el || el.scrollHeight <= el.clientHeight) return false;
		const group = day === null ? null : el.querySelector<HTMLElement>(`[data-agenda-day="${day}"]`);
		if (!group && !fallback) return false;
		let top = group ? group.offsetTop : 0;
		// Near the end the pane cannot scroll that far: stop on a row edge so no cut row sits under the hairline.
		const max = el.scrollHeight - el.clientHeight;
		if (top > max) {
			const edges = [...el.querySelectorAll<HTMLElement>('[data-agenda-day], .cal-row')].map((n) => n.offsetTop);
			top = Math.max(0, ...edges.filter((t) => t <= max));
		}
		el.scrollTo({ top, behavior: 'auto' });
		return !!group;
	}

	// A new period mounts a new agenda: open it on the selected day, else today.
	$effect(() => {
		if (!agendaEl) return;
		const [sel, t] = untrack(() => [selected, today]);
		if (!scrollAgenda(sel, false)) scrollAgenda(t, false);
	});

	async function pick(day: number) {
		picked = day;
		focusDay = day;
		if (!inPeriod(day)) go(period(day, mode)[0]);
		onchange?.(isoOf(day));
		await tick();
		scrollAgenda(day);
	}

	function select(e: CalEvent) {
		onselect?.(e.raw as Event);
	}

	async function onDayKey(e: KeyboardEvent, day: number) {
		const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
		let next: number | undefined;
		if (e.key in step) next = day + step[e.key];
		else if (e.key === 'Home') next = day - weekday(day);
		else if (e.key === 'End') next = day + 6 - weekday(day);
		else if (e.key === 'PageUp' || e.key === 'PageDown') {
			const d = new Date(day * 86_400_000);
			const m = d.getUTCMonth() + (e.key === 'PageUp' ? -1 : 1);
			const target = new Date(Date.UTC(d.getUTCFullYear(), m, 1));
			const last = new Date(Date.UTC(d.getUTCFullYear(), m + 1, 0)).getUTCDate();
			target.setUTCDate(Math.min(d.getUTCDate(), last));
			next = target.getTime() / 86_400_000;
		}
		if (next === undefined) return;
		e.preventDefault();
		focusDay = next;
		if (!inPeriod(next)) go(period(next, mode)[0]);
		await tick();
		rootEl?.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus();
	}

	const segStyle = (col: number, span: number, lane: number, color: string) =>
		safeStyle(`grid-column:${col + 1} / span ${span};grid-row:${lane + 2};--ev:${color}`);
	const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ripple-ring';
</script>

<div
	{id}
	data-ripple-node={id}
	bind:this={rootEl}
	class={['cal text-ripple-surface-foreground', mode === 'week' && 'cal--week', className]}
	style={rootStyle}
	data-widget="calendar"
>
	<header class="cal-head">
		<div class="min-w-0">
			<h2 class="text-headline truncate" aria-live="polite">{heading}</h2>
			<p class="text-callout text-ripple-muted-foreground tabular-nums" data-slot="count">{countLabel}</p>
		</div>
		<div class="cal-nav">
			{#if !showsToday}
				<button type="button" class={['cal-today text-callout', focusRing]} onclick={() => go(period(today, mode)[0])}>{W.today}</button>
			{/if}
			<button type="button" class={['cal-icon', focusRing]} onclick={() => shift(-1)} aria-label={mode === 'month' ? 'Previous month' : 'Previous week'}>
				<ChevronLeftIcon size={16} aria-hidden="true" />
			</button>
			<button type="button" class={['cal-icon', focusRing]} onclick={() => shift(1)} aria-label={mode === 'month' ? 'Next month' : 'Next week'}>
				<ChevronRightIcon size={16} aria-hidden="true" />
			</button>
		</div>
	</header>

	{#key `${mode}${anchor}`}
		<div class="cal-body">
			<div role="grid" aria-label={heading} class="cal-grid">
				<div role="row" class="cal-weekdays">
					{#each weekdays as w, i (i)}
						<div role="columnheader" class="text-caption-2 text-ripple-muted-foreground" aria-label={F.short(SUNDAY + i)}>
							<span class="cal-wd-short" aria-hidden="true">{w.short}</span><span class="cal-wd-narrow" aria-hidden="true">{w.narrow}</span>
						</div>
					{/each}
				</div>
				{#each weeks as sunday, wi (sunday)}
					{@const L = layouts[wi]}
					<div role="row" class="cal-week" style={safeStyle(`--n:${Math.max(1, L.lanes + (L.more.some(Boolean) ? 1 : 0))}`)}>
						{#each [0, 1, 2, 3, 4, 5, 6] as c (c)}
							{@const day = sunday + c}
							{@const dayEvents = L.days[c]}
							{@const outside = mode === 'month' && monthStart(day) !== anchor}
							<div role="gridcell" class="cal-cell" aria-selected={selected === day}>
								<span
									class={['cal-bg', selected === day && 'cal-bg--sel']}
									style={safeStyle(`grid-column:${c + 1}`)}
									aria-hidden="true"
								></span>
								<button
									type="button"
									class={['cal-day', focusRing, outside && 'cal-day--out', today === day && 'cal-day--today']}
									style={safeStyle(`grid-column:${c + 1}`)}
									tabindex={tabDay === day ? 0 : -1}
									data-day={day}
									aria-label="{F.long(day)}, {dayEvents.length ? W.count(dayEvents.length) : W.none}"
									aria-current={today === day ? 'date' : undefined}
									onclick={() => pick(day)}
									onkeydown={(e) => onDayKey(e, day)}
									onfocus={() => (focusDay = day)}
								>
									<span class="cal-num tabular-nums">{dayDate(day).getUTCDate()}</span>
									<span class="cal-dots" aria-hidden="true">
										{#each dayEvents.slice(0, 3) as ev (ev.key)}<span class="cal-dot" style={safeStyle(`--ev:${ev.color}`)}></span>{/each}
									</span>
								</button>
								{#each L.segments.filter((s) => s.col === c) as s (s.ev.key)}
									<button
										type="button"
										class={['cal-chip', focusRing, s.span > 1 && 'cal-chip--bar', s.before && 'cal-chip--before', s.after && 'cal-chip--after']}
										style={segStyle(s.col, s.span, s.lane, s.ev.color)}
										title={s.ev.time && s.ev.end === s.ev.start ? `${s.ev.time} ${titleOf(s.ev)}` : nameOf(s.ev)}
										aria-label={nameOf(s.ev)}
										onclick={() => select(s.ev)}
									>{#if s.before}<ChevronLeftIcon size={12} class="cal-cont" aria-hidden="true" />{/if}{#if s.ev.time && s.ev.end === s.ev.start}{@const [h, mm] = s.ev.time.split(':')}<span class="cal-time tabular-nums">{h}<span class={mm === '00' ? 'cal-min0' : undefined}>:{mm}</span></span>{' '}{/if}<span class={['cal-chip-title', !s.ev.title && 'cal-untitled']}>{titleOf(s.ev)}</span>{#if s.after}<ChevronRightIcon size={12} class="cal-cont cal-cont--end" aria-hidden="true" />{/if}</button>
								{/each}
								{#if L.more[c]}
									<button
										type="button"
										class={['cal-more text-caption-2', focusRing]}
										style={safeStyle(`grid-column:${c + 1};grid-row:${L.lanes + 2}`)}
										aria-label="{L.more[c]} more on {F.long(day)}"
										onclick={() => (expanded = sunday)}
									>+{L.more[c]} more</button>
								{/if}
							</div>
						{/each}
					</div>
				{/each}
			</div>

			<div class="cal-agenda" bind:this={agendaEl} data-slot="agenda">
				{#if selected !== null && inPeriod(selected) && !agendaDays.some((g) => g.day === selected && g.events.length)}
					<p class="cal-nothing text-callout text-ripple-muted-foreground">Nothing on {F.head(selected)}</p>
				{/if}
				{#each agendaDays as g (g.day)}
					<section class={['cal-group', selected === g.day && 'cal-group--sel']} data-agenda-day={g.day}>
						<h3 class={['cal-group-head text-callout', g.day === today ? 'text-ripple-accent-text' : 'text-ripple-muted-foreground']}>
							{g.day === today ? W.today : F.head(g.day)}{#if !g.events.length}<span class="cal-group-empty">{g.continuing.length ? `${titleOf(g.continuing[0])} continues` : 'No events'}</span>{/if}
						</h3>
						{#if g.events.length}
							<ul>
								{#each g.events as ev (ev.key)}
									<li>
										<button type="button" class={['cal-row', focusRing]} style={safeStyle(`--ev:${ev.color}`)} title={titleOf(ev)} aria-label={nameOf(ev)} onclick={() => select(ev)}>
											<span class="cal-bar" aria-hidden="true"></span>
											<span class={['cal-row-title text-body', !ev.title && 'cal-untitled']}>{titleOf(ev)}</span>
											<span class="cal-row-meta text-callout tabular-nums">{metaOf(ev)}</span>
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					</section>
				{/each}
			</div>
		</div>
	{/key}

	{#if emptyLine || undatedLine || parsed.capped}
		<div class="cal-foot text-callout text-ripple-muted-foreground">
			{#if emptyLine}
				<p>
					{emptyLine}
					{#if jump}
						<button type="button" class={['cal-link', focusRing]} onclick={() => go(period(jump.ev.start, mode)[0])}>
							{jump.dir === 'next' ? 'Next' : 'Last'}: {F.md(jump.ev.start)}, {titleOf(jump.ev)}
						</button>
					{/if}
				</p>
			{/if}
			{#if undatedLine}<p title={undatedTitles}>{undatedLine}</p>{/if}
			{#if parsed.capped}<p>Showing the first {MAX_EVENTS} events</p>{/if}
		</div>
	{/if}
</div>

<style>
	.cal {
		/* Chip tint; dark surfaces need more of the event colour to read. */
		--cal-tint: 16%;
		/* One left inset for weekday label, numeral and chip text. */
		--cal-inset: 0.5rem;
		container: cal / inline-size;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 0;
	}
	.cal-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.cal-nav {
		display: flex;
		align-items: center;
		gap: 0.125rem;
		flex-shrink: 0;
	}
	.cal-icon,
	.cal-today {
		display: grid;
		place-items: center;
		min-width: 2rem;
		height: 2rem;
		border-radius: calc(var(--ripple-radius) - 2px);
		color: var(--ripple-muted-foreground);
		transition: background-color 150ms var(--ripple-ease-out), color 150ms var(--ripple-ease-out);
	}
	.cal-today {
		padding-inline: 0.625rem;
		font-weight: 500;
		color: var(--ripple-accent-text);
	}
	.cal-icon:hover,
	.cal-today:hover {
		background: var(--ripple-track);
		color: var(--ripple-surface-foreground);
	}
	.cal-body {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		animation: cal-in 150ms var(--ripple-ease-out);
	}
	:global(.dark) .cal,
	:global([data-theme='dark']) .cal {
		--cal-tint: 26%;
	}
	@keyframes cal-in {
		from {
			opacity: 0;
		}
	}

	/* ── Grid (wide is the base) ─────────────────────────────────────────── */
	.cal-weekdays,
	.cal-week {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
	}
	.cal-weekdays > div {
		padding: 0 0 0.25rem var(--cal-inset);
	}
	.cal-wd-narrow {
		display: none;
	}
	.cal-week {
		grid-template-rows: 1.5rem repeat(var(--n), 1.25rem) minmax(0.375rem, 1fr);
		row-gap: 2px;
		min-height: 3.5rem;
		border-top: 1px solid var(--ripple-border);
	}
	.cal--week .cal-week {
		min-height: 7.5rem;
	}
	.cal-cell {
		display: contents;
	}
	.cal-bg {
		grid-row: 1 / -1;
		border-left: 1px solid var(--ripple-border);
		pointer-events: none;
	}
	.cal-cell:first-child .cal-bg {
		border-left-color: transparent;
	}
	.cal-bg--sel {
		box-shadow: inset 0 0 0 1.5px var(--ripple-ring);
		border-radius: 2px;
	}
	.cal-day {
		grid-row: 1;
		display: flex;
		align-items: center;
		justify-content: flex-start;
		padding: 0.125rem 0.25rem 0 var(--cal-inset);
		border-radius: 2px;
		font-size: var(--text-callout);
		line-height: 1;
	}
	/* Digits sit on the inset; the pill padding hangs outside it. */
	.cal-num {
		display: grid;
		place-items: center;
		height: 1.375rem;
		padding-inline: 0.25rem;
		margin-left: -0.25rem;
		border-radius: 999px;
		transition: background-color 150ms var(--ripple-ease-out);
	}
	.cal-day:hover .cal-num {
		background: var(--ripple-track);
	}
	.cal-day--out .cal-num {
		color: var(--ripple-muted-foreground);
	}
	.cal-day--today .cal-num,
	.cal-day--today:hover .cal-num {
		min-width: 1.375rem;
		padding-inline: 0.125rem;
		margin-left: -0.3125rem;
		background: var(--ripple-accent);
		color: var(--ripple-accent-foreground);
		font-weight: 600;
	}
	.cal-dots {
		display: none;
	}
	.cal-chip {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		min-width: 0;
		margin-inline: 2px;
		padding: 0 0.3125rem 0 calc(var(--cal-inset) - 2px);
		border-radius: 4px;
		font-size: var(--text-caption-2);
		line-height: 1.25rem;
		font-weight: 500;
		text-align: left;
		white-space: nowrap;
		overflow: hidden;
		background: color-mix(in oklab, var(--ev) var(--cal-tint), var(--ripple-surface));
		color: color-mix(in oklab, var(--ev) 40%, var(--ripple-surface-foreground));
		box-shadow: inset 3px 0 0 color-mix(in oklab, var(--ev) 70%, var(--ripple-surface-foreground));
		/* Above the day hairlines painted by later cells. */
		z-index: 1;
		transition: background-color 150ms var(--ripple-ease-out);
	}
	.cal-chip:hover {
		background: color-mix(in oklab, var(--ev) calc(var(--cal-tint) + 12%), var(--ripple-surface));
	}
	.cal-chip--before {
		margin-left: 0;
		border-top-left-radius: 0;
		border-bottom-left-radius: 0;
		box-shadow: none;
	}
	.cal-chip :global(.cal-cont) {
		flex-shrink: 0;
		margin-left: -0.125rem;
		opacity: 0.8;
	}
	.cal-chip :global(.cal-cont--end) {
		margin-left: auto;
		margin-right: -0.125rem;
	}
	.cal-chip--after {
		margin-right: 0;
		border-top-right-radius: 0;
		border-bottom-right-radius: 0;
	}
	.cal-chip-title {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	/* Same ink as the title (4.5:1, measured); set apart by weight only. */
	.cal-time {
		flex-shrink: 0;
		font-weight: 400;
	}
	@container cal (max-width: 779px) {
		.cal-min0 {
			display: none;
		}
	}
	.cal-untitled {
		font-style: italic;
		opacity: 0.8;
	}
	.cal-more {
		justify-self: start;
		margin-inline: 2px;
		padding: 0 0.375rem;
		border-radius: 4px;
		color: var(--ripple-muted-foreground);
		white-space: nowrap;
	}
	.cal-more:hover {
		background: var(--ripple-track);
		color: var(--ripple-surface-foreground);
	}

	/* ── Agenda (narrow only) ────────────────────────────────────────────── */
	.cal-agenda {
		display: none;
		position: relative;
		max-height: 18rem;
		overflow-y: auto;
		overscroll-behavior: contain;
		/* A hairline under the grid; groups scroll flush to it. Only the
		   bottom fades, and its padding lets the last row clear the fade. */
		padding-top: 0.25rem;
		padding-bottom: 1.5rem;
		border-top: 1px solid var(--ripple-border);
		mask-image: linear-gradient(to bottom, #000 calc(100% - 1.5rem), transparent);
	}
	.cal-nothing {
		padding: 0.25rem 0.5rem 0.5rem;
	}
	.cal-group + .cal-group {
		margin-top: 0.25rem;
	}
	.cal-group-head {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 1.5rem;
		padding: 0 0.5rem;
		border-radius: 4px;
		font-weight: 500;
		transition: background-color 150ms var(--ripple-ease-out);
	}
	.cal-group--sel .cal-group-head {
		background: color-mix(in oklab, var(--ripple-track) 30%, transparent);
	}
	.cal-group-empty {
		min-width: 0;
		font-weight: 400;
		color: var(--ripple-muted-foreground);
	}
	.cal-row {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		width: 100%;
		min-height: 2rem;
		padding: 0 0.5rem;
		border-radius: 4px;
		text-align: left;
		transition: background-color 150ms var(--ripple-ease-out);
	}
	.cal-row:hover {
		background: var(--ripple-track);
	}
	.cal-bar {
		flex-shrink: 0;
		width: 3px;
		height: 1rem;
		border-radius: 2px;
		background: color-mix(in oklab, var(--ev) 70%, var(--ripple-surface-foreground));
	}
	.cal-row-title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cal-row-meta {
		flex-shrink: 0;
		color: var(--ripple-muted-foreground);
	}

	.cal-foot {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
		margin-top: 0.25rem;
	}
	.cal-foot p {
		text-wrap: pretty;
	}
	.cal-link {
		color: var(--ripple-accent-text);
		font-weight: 500;
		text-decoration: underline;
		text-underline-offset: 2px;
		text-decoration-color: color-mix(in oklab, currentColor 40%, transparent);
	}

	/* ── Narrow: dots in the grid, agenda below ──────────────────────────── */
	@container cal (max-width: 519px) {
		.cal-wd-short {
			display: none;
		}
		.cal-wd-narrow {
			display: inline;
		}
		.cal-weekdays > div {
			padding: 0 0 0.25rem;
			text-align: center;
		}
		.cal-week,
		.cal--week .cal-week {
			grid-template-rows: 2.5rem;
			min-height: 0;
			row-gap: 0;
		}
		.cal-bg {
			border-left: 0;
		}
		.cal-chip,
		.cal-more {
			display: none;
		}
		.cal-day {
			flex-direction: column;
			align-items: center;
			justify-content: flex-start;
			gap: 3px;
			padding: 0.125rem 0 0;
		}
		.cal-num,
		.cal-day--today .cal-num {
			width: 1.75rem;
			height: 1.75rem;
			margin-left: 0;
			padding-inline: 0;
		}
		.cal-dots {
			display: flex;
			gap: 3px;
			height: 6px;
		}
		.cal-dot {
			width: 6px;
			height: 6px;
			border-radius: 999px;
			background: color-mix(in oklab, var(--ev) 70%, var(--ripple-surface-foreground));
		}
		.cal-body {
			gap: 0.75rem;
		}
		.cal-agenda {
			display: block;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.cal-body {
			animation: none;
		}
		.cal-icon,
		.cal-today,
		.cal-num,
		.cal-chip,
		.cal-more,
		.cal-group-head,
		.cal-row {
			transition: none;
		}
	}
</style>
