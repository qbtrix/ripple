<!--
  widgets/composite/Agenda.svelte: `agenda`: a meeting run sheet the model
  fills with timed items. Each item shows its start time (from `start` plus
  the minutes before it), owner and notes; a share bar shows how the time
  splits. The visitor ticks items done, reorders them (drag, or the up and
  down buttons), edits an item's minutes by pressing them, and can run the
  meeting: the current item lights up and counts down, Next closes it.

  Invariants:
  - `value` (the items array) is the bound field, default `value` /
    `onchange`. The shown list is the bound value, else a local Edit
    (data-kit/edit.ts) while it holds against the raw props, else the props.
  - The run clock is local state, not part of the value; it ticks only while
    running and its interval is cleared on pause and teardown.
  - No storage: a reload starts from the props.
-->
<script lang="ts">
	import { safeStyle } from '@ripple-ui/core';
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import Pause from '@lucide/svelte/icons/pause';
	import Play from '@lucide/svelte/icons/play';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import SkipForward from '@lucide/svelte/icons/skip-forward';
	import { holds, nextEdit, plain } from '../data-kit/index.js';
	import type { Edit } from '../data-kit/edit.js';
	import { PALETTE, hhmm } from './week-schedule.js';
	import { clampMinutes, initials, mmss, move, readItems, startLabels, startMin, toItems, type AgendaItem } from './agenda.js';
	import { playCue } from '../../sound/index.js';

	interface Props {
		id?: string;
		class?: string;
		style?: string | Record<string, string>;
		title?: string;
		/** Meeting start, "HH:MM". Without it items show offsets (+0:15). */
		start?: string;
		items?: Array<{ id?: string; title: string; owner?: string; minutes: number; notes?: string; done?: boolean }>;
		/** Two-way bindable: the items as edited (order, minutes, done). */
		value?: AgendaItem[];
		onchange?: (value: AgendaItem[]) => void;
		/** A soft chime when the running item's time is up. Default true. */
		sound?: boolean;
	}

	let { id, class: className, style, title, start, items, value = $bindable(), onchange, sound = true }: Props = $props();

	const rootStyle = $derived(
		style && typeof style === 'object'
			? safeStyle(Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';'))
			: safeStyle(typeof style === 'string' ? style : '')
	);
	const heading = $derived(plain(title).trim());
	const t0 = $derived(startMin(start));

	// ── The list on show: bound value, else a holding edit, else the props ──
	const fromProps = $derived(readItems(items));
	let edit = $state.raw<Edit<AgendaItem[]> | null>(null);
	const bound = $derived(toItems(value));
	const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
	const current = $derived.by(() => {
		if (bound && !(edit && same(bound, edit.value))) return bound;
		return holds(edit, items) ? edit.value : fromProps;
	});

	function commit(next: AgendaItem[]) {
		edit = nextEdit(edit, items, next);
		value = next;
		onchange?.(next);
	}

	const total = $derived(current.reduce((n, it) => n + it.minutes, 0));
	const doneCount = $derived(current.filter((it) => it.done).length);
	const starts = $derived(startLabels(current, t0));
	const COLORS = Object.values(PALETTE).slice(0, 8);
	const tone = (i: number) => COLORS[i % COLORS.length];

	// ── Run mode ────────────────────────────────────────────────────────────
	let running = $state(false);
	let started = $state(false);
	let elapsed = $state(0);
	const activeIdx = $derived(started ? current.findIndex((it) => !it.done) : -1);
	const active = $derived(current[activeIdx]);
	const left = $derived(active ? active.minutes * 60 - elapsed : 0);

	$effect(() => {
		if (!running) return;
		const timer = setInterval(() => {
			elapsed += 1;
			if (sound && active && active.minutes * 60 === elapsed) playCue('phase');
		}, 1000);
		return () => clearInterval(timer);
	});
	$effect(() => {
		if (started && activeIdx < 0) running = false;
	});

	let announce = $state('');

	function toggleRun() {
		if (!started) {
			started = true;
			elapsed = 0;
		}
		running = !running;
		announce = running ? `Running: ${active?.title ?? ''}` : 'Paused';
	}
	function reset() {
		running = false;
		started = false;
		elapsed = 0;
	}
	function next() {
		if (!active) return;
		const nextItem = current[activeIdx + 1];
		setDone(active.id, true);
		elapsed = 0;
		announce = nextItem ? `Next: ${nextItem.title}` : 'Agenda finished';
	}

	function setDone(itemId: string, done: boolean) {
		if (active?.id === itemId) elapsed = 0;
		commit(current.map((it) => (it.id === itemId ? { ...it, done } : it)));
	}

	function shift(i: number, by: number) {
		const to = i + by;
		if (to < 0 || to >= current.length) return;
		commit(move(current, i, to));
		announce = `${current[i].title} moved to position ${to + 1} of ${current.length}`;
		const key = `${current[to]?.id}:${by}`;
		requestAnimationFrame(() => [...document.querySelectorAll<HTMLElement>('[data-agenda-move]')].find((el) => el.dataset.agendaMove === key)?.focus());
	}

	// ── Drag to reorder ─────────────────────────────────────────────────────
	let dragFrom = $state(-1);
	let dragOver = $state(-1);
	function drop(i: number) {
		if (dragFrom >= 0) commit(move(current, dragFrom, i));
		dragFrom = dragOver = -1;
	}

	// ── Minutes, edited inline on press ─────────────────────────────────────
	let editing = $state<string | null>(null);
	function setMinutes(itemId: string, raw: string) {
		editing = null;
		const it = current.find((x) => x.id === itemId);
		const m = clampMinutes(raw, it?.minutes);
		if (it && m !== it.minutes) commit(current.map((x) => (x.id === itemId ? { ...x, minutes: m } : x)));
	}
	const focusOnMount = (node: HTMLInputElement) => {
		node.focus();
		node.select();
	};

	const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ripple-ring';
	const ghost = ['grid size-7 place-items-center rounded-md text-ripple-muted-foreground hover:bg-ripple-muted hover:text-ripple-surface-foreground disabled:opacity-30 disabled:hover:bg-transparent', focusRing];
</script>

<div {id} class={['@container text-ripple-surface-foreground', className]} style={safeStyle(rootStyle)} data-widget="agenda">
	<section class="flex flex-col gap-3 rounded-ripple border border-ripple-border bg-ripple-surface p-4" aria-label={heading || 'Agenda'}>
		<header class="flex flex-wrap items-start justify-between gap-3">
			<div class="min-w-0">
				{#if heading}<h2 class="text-title-3 font-semibold text-pretty">{heading}</h2>{/if}
				<p class="text-footnote text-ripple-muted-foreground tabular-nums" data-slot="meta">
					{t0 !== undefined ? `${hhmm(t0)} to ${hhmm(t0 + total)} · ` : ''}{total} min · {doneCount} of {current.length} done
				</p>
			</div>
			{#if current.length}
				<div class="flex items-center gap-1.5">
					{#if started}
						<button type="button" class={ghost} aria-label="Reset the run" onclick={reset}><RotateCcw size={15} aria-hidden="true" /></button>
						<button type="button" class={['inline-flex h-8 items-center gap-1.5 rounded-full border border-ripple-border px-3 text-footnote font-medium hover:bg-ripple-muted disabled:opacity-40', focusRing]} disabled={!active} onclick={next}>
							<SkipForward size={14} aria-hidden="true" />Next
						</button>
					{/if}
					<button
						type="button"
						class={['inline-flex h-8 items-center gap-1.5 rounded-full bg-ripple-accent px-3 text-footnote font-semibold text-ripple-accent-foreground disabled:opacity-40', focusRing]}
						disabled={started && !active}
						onclick={toggleRun}
						data-slot="run"
					>
						{#if running}<Pause size={14} aria-hidden="true" />Pause{:else}<Play size={14} aria-hidden="true" />{started ? (active ? 'Resume' : 'Done') : 'Start meeting'}{/if}
					</button>
				</div>
			{/if}
		</header>

		{#if current.length}
			<div class="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true" data-slot="share">
				{#each current as it, i (it.id)}
					<span
						class={['ag-seg h-full transition-opacity', it.done && 'opacity-30', i === activeIdx && 'ag-seg-on']}
						style={safeStyle(`flex-grow:${it.minutes};background:${tone(i)}`)}
						title="{it.title}: {it.minutes} min"
					></span>
				{/each}
			</div>

			<ol class="flex flex-col" data-slot="items">
				{#each current as it, i (it.id)}
					{@const on = i === activeIdx}
					<li
						class={['ag-row relative grid items-start gap-x-2.5 rounded-md px-1.5 py-2.5', on && 'bg-ripple-muted', dragOver === i && dragFrom !== i && 'ag-drop']}
						data-item={it.id}
						data-done={it.done || undefined}
						aria-current={on ? 'step' : undefined}
						ondragover={(e) => {
							if (dragFrom < 0) return;
							e.preventDefault();
							dragOver = i;
						}}
						ondrop={(e) => {
							e.preventDefault();
							drop(i);
						}}
					>
						<span class={['pt-0.5 text-footnote tabular-nums', on ? 'font-semibold text-ripple-accent' : 'text-ripple-muted-foreground']} data-slot="start">{starts[i]}</span>
						<button
							type="button"
							class={['grid size-6 place-items-center rounded-full border-2 transition-colors', focusRing, it.done ? 'border-transparent text-white' : 'border-ripple-border hover:border-ripple-muted-foreground']}
							style={safeStyle(it.done ? `background:${tone(i)}` : `border-color:${on ? tone(i) : ''}`)}
							aria-pressed={it.done}
							aria-label="{it.title}, {it.done ? 'done' : 'not done'}"
							onclick={() => setDone(it.id, !it.done)}
						>
							{#if it.done}<Check size={14} strokeWidth={3} aria-hidden="true" />{/if}
						</button>
						<div class="min-w-0">
							<p class={['text-body-emph text-pretty', it.done && 'text-ripple-muted-foreground line-through decoration-1']}>{it.title}</p>
							{#if it.owner || it.notes}
								<div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
									{#if it.owner}
										<span class="inline-flex items-center gap-1.5 text-footnote text-ripple-muted-foreground">
											<span class="grid size-5 place-items-center rounded-full text-[0.625rem] font-semibold text-white" style={safeStyle(`background:${tone(i)}`)} aria-hidden="true">{initials(it.owner)}</span>{it.owner}
										</span>
									{/if}
									{#if it.notes}<span class="line-clamp-2 text-footnote text-ripple-muted-foreground">{it.notes}</span>{/if}
								</div>
							{/if}
							{#if on}
								<p class={['mt-1 text-footnote font-semibold tabular-nums', left < 0 ? 'text-ripple-error-text' : 'text-ripple-accent']} data-slot="countdown" aria-live="off">
									{left >= 0 ? `${mmss(left)} left` : `${mmss(-left)} over`}
								</p>
							{/if}
						</div>
						<div class="flex items-center gap-0.5">
							{#if editing === it.id}
								<input
									class={['h-7 w-14 rounded-md border border-ripple-border bg-ripple-surface px-1.5 text-right text-footnote tabular-nums', focusRing]}
									inputmode="numeric"
									aria-label="Minutes for {it.title}"
									value={it.minutes}
									onkeydown={(e) => {
										if (e.key === 'Enter') setMinutes(it.id, e.currentTarget.value);
										else if (e.key === 'Escape') editing = null;
									}}
									onblur={(e) => editing === it.id && setMinutes(it.id, e.currentTarget.value)}
									{@attach focusOnMount}
								/>
							{:else}
								<button
									type="button"
									class={['h-7 rounded-full px-2 text-footnote font-medium tabular-nums hover:bg-ripple-muted', focusRing]}
									aria-label="{it.minutes} minutes, change"
									onclick={() => (editing = it.id)}
									data-slot="minutes">{it.minutes} min</button
								>
							{/if}
							<span class="ag-move flex items-center">
								<button type="button" class={ghost} aria-label="Move {it.title} up" disabled={i === 0} data-agenda-move="{it.id}:-1" onclick={() => shift(i, -1)}>
									<ChevronUp size={15} aria-hidden="true" />
								</button>
								<button type="button" class={ghost} aria-label="Move {it.title} down" disabled={i === current.length - 1} data-agenda-move="{it.id}:1" onclick={() => shift(i, 1)}>
									<ChevronDown size={15} aria-hidden="true" />
								</button>
								<span
									class="hidden cursor-grab px-0.5 text-ripple-muted-foreground @min-[480px]:inline"
									draggable="true"
									role="presentation"
									title="Drag to reorder"
									ondragstart={(e) => {
										dragFrom = i;
										e.dataTransfer?.setData('text/plain', it.id);
									}}
									ondragend={() => (dragFrom = dragOver = -1)}><GripVertical size={15} aria-hidden="true" /></span
								>
							</span>
						</div>
						{#if on && active}
							<span class="absolute inset-x-1.5 bottom-0 h-0.5 overflow-hidden rounded-full bg-ripple-border" aria-hidden="true">
								<span class="block h-full transition-[width] duration-1000 ease-linear" style={safeStyle(`width:${Math.min((elapsed / (active.minutes * 60)) * 100, 100)}%;background:${tone(i)}`)}></span>
							</span>
						{/if}
					</li>
				{/each}
			</ol>
		{:else}
			<p class="py-2 text-callout text-ripple-muted-foreground">No items yet.</p>
		{/if}

		<p class="sr-only" aria-live="polite">{announce}</p>
	</section>
</div>

<style>
	.ag-row {
		grid-template-columns: 3rem 1.5rem minmax(0, 1fr) auto;
	}
	.ag-row + .ag-row {
		border-top: 1px solid var(--color-ripple-border, rgb(127 127 127 / 0.2));
	}
	.ag-drop {
		box-shadow: inset 0 2px 0 var(--color-ripple-accent, #1877f2);
	}
	.ag-seg {
		min-width: 3px;
	}
	.ag-seg-on {
		outline: 2px solid var(--color-ripple-surface-foreground, currentColor);
		outline-offset: -2px;
	}
	@container (max-width: 380px) {
		.ag-row {
			grid-template-columns: 2.6rem 1.5rem minmax(0, 1fr) auto;
		}
		.ag-move {
			flex-direction: column;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.ag-row *,
		.ag-seg {
			transition: none !important;
		}
	}
</style>
