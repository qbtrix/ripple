<!--
  widgets/data/Kanban.svelte: `kanban`, where each piece of work stands and how
  much sits in each stage. The model writes columns and cards; grouping, text
  hygiene and moves live in kanban-board.ts.

  Layout (container queries only): from 480px of its own width the lanes are a
  grid of quiet fills that share the width down to 160px and wrap to further
  rows (7 lanes at about 580px go 3 + 3 + 1), cards the lightest bordered boxes
  with the badge on a meta row under the full-width title; an empty lane keeps
  a 40px slot. Below 480px the lanes stack as sections set apart by extra space
  and a full rule, rows split by lighter hairlines, an empty lane collapses to
  its header and the badge trails the title. An empty board keeps its lanes
  (blank slots in wide) plus one centred "No cards yet".
  Each lane shows 4 cards, then "Show N more". The header count always counts
  every card in the lane.

  Moves are opt-in: only with `onchange` (bind or on_change) does a card get a
  Move menu (pointer, keyboard, touch) and native drag as a pointer extra.
  Without it there is no draggable attribute and no move button. A move
  changes only that card's `columnKey` (found by array index, never by id),
  fires onchange(full array) and onmove({ id, from, to }), announces itself in
  a live region and returns focus to the card's Move button.

  Invariants: no card is ever dropped (unmatched statuses go to `Other`);
  model colours reach the DOM only through style: directives after
  dotColour() validates them; the root style goes through safeStyle.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { safeStyle } from '@ripple-ui/core';
	import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import NodeRenderer from '$lib/components/NodeRenderer.svelte';
	import { safeArray, uniqueKeys } from '$lib/utils/safe-props.js';
	import { buildBoard, cardTitle, moveCard, text, type KanbanCard, type Lane } from './kanban-board.js';

	type Column = { id: string; title: string; color?: string; accentClass?: string };

	interface Props {
		id?: string;
		class?: string;
		style?: string | Record<string, string>;
		columns?: Column[];
		/** Card list. Bind via `bind: "<state-path>"` to receive the moved list. */
		value?: KanbanCard[];
		/** Field on card identifying which column it belongs to. */
		columnKey?: string;
		/** Card field used as the displayed title. */
		titleKey?: string;
		/** Optional secondary field shown below title. */
		descriptionKey?: string;
		/** Optional badge field shown in card. */
		badgeKey?: string;
		/** Optional spec to render inside each card; receives `card` in loop context. */
		cardTemplate?: any;
		onchange?: (next: KanbanCard[]) => void;
		onmove?: (info: { id: unknown; from: string; to: string }) => void;
	}

	let {
		id,
		class: className,
		style,
		columns = [],
		value = [],
		columnKey = 'status',
		titleKey = 'title',
		descriptionKey = 'description',
		badgeKey,
		cardTemplate,
		onchange,
		onmove
	}: Props = $props();

	const CAP = 4;

	const rootStyle = $derived(
		style && typeof style === 'object'
			? safeStyle(Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';'))
			: safeStyle(typeof style === 'string' ? style : undefined)
	);
	const cards = $derived(safeArray<KanbanCard>(value, { widget: 'kanban', key: 'value' }));
	const cols = $derived(safeArray<Column>(columns, { widget: 'kanban', key: 'columns' }));
	const colKey = $derived(typeof columnKey === 'string' && columnKey ? columnKey : 'status');
	const board = $derived(buildBoard(cols, cards, colKey));
	const laneKeys = $derived(uniqueKeys(board, (l) => l.key));
	const movable = $derived(typeof onchange === 'function');
	const targets = $derived(board.filter((l) => !l.other));
	const isTemplate = $derived(
		cardTemplate != null && typeof cardTemplate === 'object' && !Array.isArray(cardTemplate) && typeof cardTemplate.type === 'string'
	);

	let expanded = $state<Record<string, boolean>>({});
	let announce = $state('');
	let dragging = $state<number | null>(null);
	let hover = $state<string | null>(null);
	const moveRefs: Record<number, HTMLButtonElement | null> = $state({});

	function nameOf(card: KanbanCard): string {
		return cardTitle(card, titleKey) || 'Untitled card';
	}

	function badgeOf(card: KanbanCard): string {
		return badgeKey ? text(card[badgeKey]) : '';
	}

	function descOf(card: KanbanCard): string {
		return text(card[descriptionKey]);
	}

	function cardLabel(card: KanbanCard): string {
		return [nameOf(card), badgeOf(card), descOf(card)].filter(Boolean).join(', ');
	}

	function laneLabel(l: Lane): string {
		const n = l.items.length;
		return `${l.title}, ${n} ${n === 1 ? 'card' : 'cards'}`;
	}

	function move(index: number, to: Lane, focus = true) {
		const card = cards[index];
		if (!card || !to.id || !onchange) return;
		const raw = card[colKey];
		const from = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
		if (board.find((l) => l.items.some((it) => it.index === index)) === to) return;
		onchange(moveCard(cards, index, colKey, to.id));
		onmove?.({ id: card.id, from, to: to.id });
		announce = `Moved ${nameOf(card)} to ${to.title}.`;
		if (focus) restoreFocus(index);
	}

	async function restoreFocus(index: number) {
		await tick();
		const l = board.find((x) => x.items.some((it) => it.index === index));
		if (l && l.items.findIndex((it) => it.index === index) >= CAP) expanded[l.key] = true;
		await tick();
		moveRefs[index]?.focus();
	}

	function onDragStart(e: DragEvent, index: number) {
		dragging = index;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', String(index));
		}
	}

	function onDragOver(e: DragEvent, l: Lane) {
		if (dragging == null || l.other) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		hover = l.key;
	}

	function onDrop(e: DragEvent, l: Lane) {
		e.preventDefault();
		const index = dragging;
		dragging = null;
		hover = null;
		if (index != null) move(index, l, false);
	}

	function onDragLeave(l: Lane) {
		if (hover === l.key) hover = null;
	}

	function onDragEnd() {
		dragging = null;
		hover = null;
	}
</script>

<div {id} class={['kb', className]} style={rootStyle}>
	<div class="kb-board">
		{#each board as l, li (laneKeys[li])}
			{@const open = !!expanded[l.key]}
			{@const shown = open ? l.items : l.items.slice(0, CAP)}
			{@const keys = uniqueKeys(shown, (it) => it.index)}
			<section
				class="kb-lane"
				aria-label={laneLabel(l)}
				data-empty={l.items.length === 0 ? '' : undefined}
				data-other={l.other ? '' : undefined}
				data-hover={hover === l.key ? '' : undefined}
				ondragover={movable ? (e) => onDragOver(e, l) : undefined}
				ondragleave={movable ? () => onDragLeave(l) : undefined}
				ondrop={movable ? (e) => onDrop(e, l) : undefined}
			>
				<div class="kb-head" aria-hidden="true">
					{#if l.dot || l.dotClass}
						<span class={['kb-dot', l.dotClass]} style:background-color={l.dot}></span>
					{/if}
					<span class="kb-title text-callout" title={l.title}>{l.title}</span>
					<span class="kb-count text-callout">{l.items.length}</span>
				</div>

				{#if l.items.length === 0}
					<p class="kb-empty text-footnote" aria-hidden={cards.length ? undefined : 'true'}>
						{cards.length ? 'No cards' : ''}
					</p>
				{:else}
					<div class="kb-cards" role="list">
						{#each shown as it, k (keys[k])}
							{@const title = cardTitle(it.card, titleKey)}
							{@const badge = badgeOf(it.card)}
							{@const desc = descOf(it.card)}
							<div
								class="kb-card"
								role="listitem"
								aria-label={cardLabel(it.card)}
								draggable={movable ? 'true' : undefined}
								data-dragging={dragging === it.index ? '' : undefined}
								ondragstart={movable ? (e) => onDragStart(e, it.index) : undefined}
								ondragend={movable ? onDragEnd : undefined}
							>
								{#if isTemplate}
									<div class="kb-tpl">
										<NodeRenderer node={cardTemplate} loopContext={{ card: it.card, item: it.card }} />
									</div>
								{:else}
									<span class={['kb-name text-body', !title && 'kb-untitled']} title={title || undefined}
										>{title || 'Untitled card'}</span
									>
									{#if badge}<span class="kb-badge text-caption-2" title={badge}>{badge}</span>{/if}
									{#if desc}<span class="kb-desc text-footnote">{desc}</span>{/if}
								{/if}
								{#if movable}
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											{#snippet child({ props })}
												<button
													{...props}
													type="button"
													class="kb-move"
													aria-label={`Move ${nameOf(it.card)}`}
													title="Move to…"
													bind:this={moveRefs[it.index]}
												>
													<ArrowRightLeft size={14} aria-hidden="true" />
												</button>
											{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end" sideOffset={4} class="w-48">
											<DropdownMenu.Group>
												<DropdownMenu.GroupHeading class="text-callout text-ripple-muted-foreground font-medium"
													>Move to</DropdownMenu.GroupHeading
												>
												{#each targets as t, ti (laneKeys[board.indexOf(t)] ?? ti)}
													{#if t !== l}
														<DropdownMenu.Item onSelect={() => move(it.index, t)}>
															<span class="min-w-0 truncate">{t.title}</span>
														</DropdownMenu.Item>
													{/if}
												{/each}
											</DropdownMenu.Group>
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								{/if}
							</div>
						{/each}
					</div>
					{#if l.items.length > CAP}
						<button
							type="button"
							class="kb-more text-callout"
							aria-expanded={open}
							onclick={() => (expanded[l.key] = !open)}
						>
							{open ? 'Show less' : `Show ${l.items.length - CAP} more`}
						</button>
					{/if}
				{/if}
			</section>
		{/each}
	</div>
	{#if cards.length === 0}
		<p class="kb-none text-footnote">No cards yet</p>
	{/if}
	<p class="kb-sr" aria-live="polite">{announce}</p>
</div>

<style>
	.kb {
		container: kb / inline-size;
		min-width: 0;
		color: var(--ripple-surface-foreground);
	}

	/* Narrow (default): lanes stack as sections, cards are hairline rows. */
	.kb-board {
		display: flex;
		flex-direction: column;
	}

	.kb-lane {
		min-width: 0;
		padding: 0.625rem 0;
		transition:
			background-color 150ms var(--ripple-ease-out),
			box-shadow 150ms var(--ripple-ease-out);
	}

	.kb-lane + .kb-lane {
		padding-top: 1.25rem;
		border-top: 1px solid var(--ripple-border);
	}

	.kb-lane[data-hover] {
		box-shadow: inset 0 0 0 1px var(--ripple-accent);
		background-color: color-mix(in oklab, var(--ripple-accent) 6%, var(--ripple-muted));
	}

	.kb-head {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		min-width: 0;
	}

	.kb-dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 9999px;
	}

	.kb-title {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 500;
	}

	.kb-count {
		flex: none;
		color: var(--ripple-muted-foreground);
		font-variant-numeric: tabular-nums;
	}

	.kb-lane[data-empty] .kb-title,
	.kb-lane[data-other] .kb-title {
		color: var(--ripple-muted-foreground);
	}

	.kb-empty {
		display: none;
		margin: 0;
		color: var(--ripple-muted-foreground);
	}

	.kb-cards {
		display: flex;
		flex-direction: column;
		margin-top: 0.25rem;
	}

	.kb-card {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		grid-template-areas: 'name badge move' 'desc desc desc';
		align-items: start;
		row-gap: 0.125rem;
		min-width: 0;
		padding: 0.5rem 0;
		container-type: inline-size;
		transition: opacity 150ms var(--ripple-ease-out);
	}

	/* Row hairlines sit a step lighter than the section rule. */
	.kb-card + .kb-card {
		border-top: 1px solid color-mix(in oklab, var(--ripple-border) 55%, transparent);
	}

	.kb-card[draggable='true'] {
		cursor: grab;
	}

	.kb-card[data-dragging] {
		opacity: 0.5;
	}

	.kb-tpl {
		grid-area: name / name / desc / badge;
		min-width: 0;
	}

	.kb-name {
		grid-area: name;
		min-width: 0;
		font-weight: 500;
		overflow-wrap: anywhere;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
	}

	.kb-untitled {
		font-style: italic;
		font-weight: 400;
		color: var(--ripple-muted-foreground);
	}

	.kb-badge {
		grid-area: badge;
		max-width: 50cqi;
		margin: 1px 0 0 0.5rem;
		padding: 0.0625rem 0.4375rem;
		border-radius: 9999px;
		background: var(--ripple-muted);
		color: var(--ripple-muted-foreground);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.kb-desc {
		grid-area: desc;
		min-width: 0;
		color: var(--ripple-muted-foreground);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.kb-move {
		grid-area: move;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		margin: -4px -4px -4px 0.25rem;
		border: 0;
		border-radius: calc(var(--ripple-radius) - 2px);
		background: transparent;
		color: var(--ripple-muted-foreground);
		cursor: pointer;
		transition:
			color 150ms var(--ripple-ease-out),
			background-color 150ms var(--ripple-ease-out);
	}

	.kb-move:hover,
	.kb-move[data-state='open'] {
		color: var(--ripple-surface-foreground);
		background: var(--ripple-muted);
	}

	.kb-move:focus-visible,
	.kb-more:focus-visible {
		outline: 2px solid var(--ripple-ring);
		outline-offset: 1px;
		color: var(--ripple-surface-foreground);
	}

	.kb-more {
		margin-top: 0.25rem;
		padding: 0.25rem 0;
		border: 0;
		background: none;
		font-family: inherit;
		font-weight: 500;
		color: var(--ripple-accent-text);
		cursor: pointer;
		border-radius: 4px;
	}

	.kb-more:hover {
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.kb-none {
		margin: 0.5rem 0 0;
		text-align: center;
		color: var(--ripple-muted-foreground);
	}

	.kb-sr {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}

	/* Wide: a grid of quiet lane fills that wraps, cards are bordered boxes. */
	@container kb (min-width: 480px) {
		.kb-board {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
			column-gap: 0.75rem;
			row-gap: 1.25rem;
			align-items: start;
		}

		.kb-lane {
			padding: 0.5rem;
			border-radius: calc(var(--ripple-radius) + 2px);
			background: var(--ripple-muted);
		}

		.kb-lane + .kb-lane {
			padding-top: 0.5rem;
			border-top: 0;
		}

		.kb-head {
			padding: 0.125rem 0.25rem 0.375rem;
		}

		.kb-empty {
			display: flex;
			align-items: center;
			justify-content: center;
			height: 40px;
		}

		.kb-cards {
			gap: 0.5rem;
			margin-top: 0;
		}

		.kb-card {
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas: 'name move' 'badge badge' 'desc desc';
			padding: 0.5rem 0.625rem;
			border: 1px solid var(--ripple-border);
			border-radius: var(--ripple-radius);
			/* The lightest plane in light: at or above the card frame, never between it and the lane. */
			background: color-mix(in oklab, var(--ripple-surface) 40%, white);
		}

		:global(.dark) .kb-card,
		:global([data-theme='dark']) .kb-card {
			background: color-mix(in oklab, var(--ripple-surface) 82%, white);
		}

		.kb-tpl {
			grid-area: 1 / 1 / -1 / 2;
		}

		.kb-badge {
			justify-self: start;
			max-width: 100%;
			margin: 0.1875rem 0 0;
		}

		.kb-card + .kb-card {
			border-top-color: var(--ripple-border);
		}

		.kb-name {
			-webkit-line-clamp: 3;
			line-clamp: 3;
		}

		.kb-desc {
			white-space: normal;
			display: -webkit-box;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 2;
			line-clamp: 2;
		}

		.kb-more {
			padding: 0.25rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.kb-lane,
		.kb-card,
		.kb-move {
			transition: none;
		}
	}
</style>
