<!--
  widgets/composite/FlashcardDeck.svelte: `flashcard-deck`, a study deck in one
  card. Reveal first, then grade: the action row holds `Show answer` until the
  card is flipped, then `Missed it` and `Got it` in the same place. A one-line
  progress rail and `N / M` are the only counts during play; the card is a
  raised object with sheets peeking below while cards remain. The end of a
  pass is a score screen with the cards to practise, `Practise missed` (a
  re-deal of only those) and Restart. Keys on the root: Space or Enter reveal,
  Left or 1 marks missed, Right or 2 marks got it, H opens the hint.

  Invariants:
  - `score` is the one bound field (bind contract `score` / `onscorechange`):
    the number of cards known since the last restart, written by the widget.
    `oncomplete` fires from the handler that records the last mark, once per
    pass, with `{ score, total }`.
  - The deal derives from `cards` until the visitor re-deals, so a streamed
    deck ends equal to a whole one. `shuffle` is seeded from the cards' text
    and the pass number, never Math.random, so server, client and two mounts
    agree on the order.
  - Each card is its own node ({#key pos}), so marking a flipped card never
    rotates back over the next card's answer.
  - The card's min height comes from the longest face in the whole deck, so
    the action row stays put from card to card in a typical deck.
  - Rows without a usable front are skipped, counted on the first card's
    position line and warned once. Front and back take a string or a number;
    hint and category take a string only. Objects never print.
  - Reduced motion turns the 3D flip into a cross-fade (CSS only).
-->
<script module lang="ts">
	export interface DeckCard {
		id?: string;
		front: string;
		back: string;
		hint?: string;
		category?: string;
	}
	export type Mark = 'got' | 'missed';

	/** A seeded Fisher-Yates: the same seed gives the same order everywhere. */
	export function shuffled<T>(items: readonly T[], seed: string): T[] {
		let h = 2166136261;
		for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
		const rand = () => {
			h = (h + 0x6d2b79f5) | 0;
			let t = Math.imul(h ^ (h >>> 15), 1 | h);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
		const out = [...items];
		for (let i = out.length - 1; i > 0; i--) {
			const j = Math.floor(rand() * (i + 1));
			[out[i], out[j]] = [out[j], out[i]];
		}
		return out;
	}

	function rec(v: unknown): Record<string, unknown> {
		return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
	}

	/** Visible text tier of one face: short words go big, paragraphs go body size. */
	function tier(text: string): string {
		if (text.length <= 24) return 'text-title-1 font-semibold';
		if (text.length <= 90) return 'text-title-3 font-semibold text-balance';
		return 'text-body max-w-[60ch] text-pretty';
	}

	const SHOW_MISSED = 6;
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import { safeStyle } from '@ripple-ui/core';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import Lightbulb from '@lucide/svelte/icons/lightbulb';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Repeat from '@lucide/svelte/icons/repeat';
	import Layers from '@lucide/svelte/icons/layers';
	import { safeArray } from '$lib/utils/safe-props.js';
	import { VerdictLine, plain, rise } from '../data-kit/index.js';
	import type { Verdict } from '../data-kit/types.js';

	interface Props {
		id?: string;
		class?: string;
		style?: string | Record<string, string>;
		title?: string;
		subtitle?: string;
		verdict?: Verdict;
		cards?: DeckCard[];
		/** Deal in a seeded shuffled order (a new order on every restart). */
		shuffle?: boolean;
		/** Cards known since the last restart. Written by the widget; bindable. */
		score?: number;
		onscorechange?: (score: number) => void;
		/** Fires at the end of every pass. */
		oncomplete?: (result: { score: number; total: number }) => void;
	}

	let {
		id,
		class: className,
		style,
		title,
		subtitle,
		verdict,
		cards,
		shuffle = false,
		score = $bindable(),
		onscorechange,
		oncomplete
	}: Props = $props();

	const rootStyle = $derived(
		style && typeof style === 'object'
			? safeStyle(Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';'))
			: safeStyle(typeof style === 'string' ? style : '')
	);

	const heading = $derived(plain(title));
	const sub = $derived(plain(subtitle));

	/** Face text: a string or a finite number. Anything else counts as absent. */
	const face = (v: unknown) => (typeof v === 'string' ? plain(v) : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
	/** Labels (hint, category): strings only, so a stray number or object never prints. */
	const label = (v: unknown) => (typeof v === 'string' ? plain(v) : '');

	const rows = $derived(safeArray<unknown>(cards, { widget: 'flashcard-deck', key: 'cards' }));
	const list = $derived(
		rows.flatMap((raw, i) => {
			const c = rec(raw);
			const front = face(c.front);
			if (!front) return [];
			return [{ key: `${c.id ?? ''}:${i}`, front, back: face(c.back), hint: label(c.hint), category: label(c.category) }];
		})
	);
	const skipped = $derived(rows.length - list.length);

	// One warning per message per instance: cards re-derive on every streamed chunk.
	const warned = new Set<string>();
	$effect(() => {
		if (!skipped) return;
		const msg = `[Ripple] <flashcard-deck> skipped ${skipped} of ${rows.length} cards with no usable front.`;
		if (warned.has(msg)) return;
		warned.add(msg);
		console.warn(msg);
	});

	/** Min-height tier from the longest face in the deck, so cards do not change height. */
	const height = $derived.by(() => {
		const longest = list.reduce((m, c) => Math.max(m, c.front.length + c.hint.length, c.back.length), 0);
		return longest <= 40 ? 'sm' : longest <= 160 ? 'md' : 'lg';
	});

	/** Card indices of a re-deal ("Practise missed"); null deals the whole deck. */
	let practise = $state<number[] | null>(null);
	/** Passes since mount; seeds the shuffle so each pass gets a new order. */
	let pass = $state(0);
	let results = $state<Mark[]>([]);
	let known = $state<number[]>([]);
	let flipped = $state(false);
	let hintOpen = $state(false);
	let showAllMissed = $state(false);

	let root = $state<HTMLDivElement>();
	let showBtn = $state<HTMLButtonElement>();
	let gotBtn = $state<HTMLButtonElement>();

	const order = $derived.by(() => {
		const base = practise ? practise.filter((i) => i < list.length) : list.map((_, i) => i);
		return shuffle === true ? shuffled(base, `${pass}|${list.map((c) => c.front).join('|')}`) : base;
	});
	const pos = $derived(results.length);
	const done = $derived(order.length > 0 && pos >= order.length);
	const cardAt = $derived(order[pos] as number | undefined);
	const card = $derived(cardAt === undefined ? undefined : list[cardAt]);
	const got = $derived(results.filter((r) => r === 'got').length);
	const unknown = $derived(list.flatMap((_, i) => (known.includes(i) ? [] : [i])));
	const missedShown = $derived(showAllMissed ? unknown : unknown.slice(0, SHOW_MISSED));
	/** Sheets peeking below the card: one while another card follows, two while two or more do. */
	const sheets = $derived(Math.min(2, Math.max(0, order.length - pos - 1)));

	function writeScore(v: number) {
		score = v;
		onscorechange?.(v);
	}

	function reset() {
		results = [];
		flipped = false;
		hintOpen = false;
		showAllMissed = false;
	}

	/** Focus follows the action row: the button under the keyboard is replaced, so focus must not fall to body. */
	async function refocus(target: () => HTMLElement | null | undefined) {
		await tick();
		target()?.focus();
	}

	function reveal(fromKey = false) {
		if (!card || flipped) return;
		const move = fromKey || (showBtn !== undefined && document.activeElement === showBtn);
		flipped = true;
		hintOpen = false;
		if (move) refocus(() => gotBtn);
	}

	function mark(m: Mark) {
		if (cardAt === undefined || done || !flipped) return;
		const hadFocus = !!root && root.contains(document.activeElement);
		const i = cardAt;
		results = [...results, m];
		flipped = false;
		hintOpen = false;
		if (m === 'got' && !known.includes(i)) {
			known = [...known, i];
			writeScore(known.length);
		}
		if (results.length >= order.length) oncomplete?.({ score: known.length, total: list.length });
		if (hadFocus) refocus(() => showBtn ?? root?.querySelector<HTMLElement>('[data-slot="score"] button'));
	}

	function practiseMissed() {
		practise = unknown;
		pass += 1;
		reset();
	}

	function restart() {
		practise = null;
		pass += 1;
		reset();
		if (known.length) {
			known = [];
			writeScore(0);
		}
	}

	function onRootKey(e: KeyboardEvent) {
		if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || !card || done) return;
		const k = e.key;
		if ((k === ' ' || k === 'Enter') && !flipped && !(e.target instanceof HTMLButtonElement)) {
			e.preventDefault();
			reveal(true);
		} else if (flipped && (k === 'ArrowLeft' || k === '1')) {
			e.preventDefault();
			mark('missed');
		} else if (flipped && (k === 'ArrowRight' || k === '2')) {
			e.preventDefault();
			mark('got');
		} else if ((k === 'h' || k === 'H') && card.hint && !flipped) {
			e.preventDefault();
			hintOpen = true;
		}
	}

	// A listener, not an attribute: the root is a plain container, not a control.
	$effect(() => {
		const el = root;
		if (!el) return;
		el.addEventListener('keydown', onRootKey);
		return () => el.removeEventListener('keydown', onRootKey);
	});

	const live = $derived(
		done ? `Deck complete. ${known.length} of ${list.length} known.` : card && flipped ? `Answer: ${card.back || 'No answer given'}` : ''
	);

	const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ripple-ring';
	const btnBase =
		'inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-body-emph transition-[background-color,opacity,transform] duration-150 active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0';
	const neutralBtn = [btnBase, 'border border-ripple-border bg-ripple-surface hover:bg-ripple-muted', focusRing];
	const primaryBtn = [btnBase, 'bg-ripple-accent text-ripple-accent-foreground hover:opacity-90', focusRing];
	const kbd = 'keyhint ml-1 rounded px-1 text-caption-1 font-normal tabular-nums opacity-70';
	const textWrap = 'whitespace-pre-line [overflow-wrap:anywhere]';
</script>

<div {id} bind:this={root} class={['@container text-ripple-surface-foreground', className]} style={rootStyle} data-widget="flashcard-deck">
	<div class="flex flex-col gap-3 @min-[480px]:gap-4">
		{#if heading || sub || practise}
			<header class="flex min-w-0 flex-col gap-0.5">
				{#if heading}<h2 class="line-clamp-2 text-title-3 font-semibold text-pretty" title={heading}>{heading}</h2>{/if}
				{#if sub}<p class="text-callout text-ripple-muted-foreground text-pretty">{sub}</p>{/if}
				{#if practise}
					<p class="text-callout text-ripple-muted-foreground tabular-nums" data-slot="meta">Practising {order.length} missed</p>
				{/if}
			</header>
		{/if}

		<VerdictLine {verdict} />

		{#if !list.length}
			<p class="flex h-16 items-center gap-2 text-callout text-ripple-muted-foreground">
				<Layers size={16} strokeWidth={1.75} aria-hidden="true" class="shrink-0" />No cards yet. Ask for a deck.
			</p>
		{:else if done}
			<section class="grid gap-6 @min-[480px]:grid-cols-2 @min-[480px]:gap-8" aria-label="Score" data-slot="score" in:rise={{ index: 0 }}>
				<div class="flex min-w-0 flex-col items-start gap-3">
					<p class="text-caption-1 font-medium tracking-[0.04em] text-ripple-muted-foreground uppercase">Cards known</p>
					<p class="tabular-nums" data-slot="total">
						<span class="text-[44px] leading-none font-semibold">{known.length}</span>
						<span class="text-title-2 text-ripple-muted-foreground">/ {list.length}</span>
					</p>
					<div class="flex h-1.5 w-full max-w-60 overflow-hidden rounded-full bg-ripple-track" aria-hidden="true">
						<div class="h-full rounded-full bg-ripple-accent" style:width="{(known.length / list.length) * 100}%"></div>
					</div>
					{#if practise}
						<p class="text-callout text-ripple-muted-foreground tabular-nums">This round: {got} of {order.length}</p>
					{/if}
					<div class="mt-1 flex w-full max-w-72 flex-col gap-2">
						{#if unknown.length}
							<button type="button" class={primaryBtn} onclick={practiseMissed}>
								<Repeat size={16} strokeWidth={2} aria-hidden="true" />Practise missed ({unknown.length})
							</button>
							<button type="button" class={neutralBtn} onclick={restart}>
								<RotateCcw size={16} strokeWidth={1.75} aria-hidden="true" />Restart
							</button>
						{:else}
							<button type="button" class={primaryBtn} onclick={restart}>
								<RotateCcw size={16} strokeWidth={2} aria-hidden="true" />Restart
							</button>
						{/if}
					</div>
				</div>

				<div class="flex min-w-0 flex-col gap-2">
					{#if unknown.length}
						<p class="text-caption-1 font-medium tracking-[0.04em] text-ripple-muted-foreground uppercase">To practise</p>
						<ul class="flex flex-col divide-y divide-ripple-border" data-slot="missed">
							{#each missedShown as i, k (list[i].key)}
								<li class="flex items-start gap-2.5 py-2.5 first:pt-0" in:rise={{ index: k }}>
									<span class="mt-px grid size-6 shrink-0 place-items-center rounded-md bg-ripple-error/12 text-ripple-error-text">
										<X size={14} strokeWidth={2} aria-hidden="true" />
									</span>
									<span class="min-w-0 flex-1">
										<span class={['block text-body-emph', textWrap]}>{list[i].front}</span>
										<span class={['block text-callout text-ripple-muted-foreground', textWrap]}>{list[i].back || 'No answer given'}</span>
									</span>
								</li>
							{/each}
						</ul>
						{#if unknown.length > missedShown.length}
							<button
								type="button"
								class={['inline-flex min-h-6 items-center self-start rounded-md text-callout font-medium text-ripple-accent-text hover:underline', focusRing]}
								onclick={() => (showAllMissed = true)}
							>
								Show {unknown.length - missedShown.length} more
							</button>
						{/if}
					{:else}
						<p class="flex items-center gap-2 rounded-md bg-ripple-success/12 px-3 py-2.5 text-body-emph text-ripple-success-text">
							<Check size={16} strokeWidth={2} aria-hidden="true" />Every card known.
						</p>
					{/if}
				</div>
			</section>
		{:else if card}
			<div class="mx-auto flex w-full flex-col gap-3 @min-[480px]:max-w-[560px] @min-[480px]:gap-4">
				<div class="flex h-7 items-center gap-3">
					<ol class="rail flex min-w-0 flex-1 flex-nowrap" style:--n={order.length} aria-label="Progress" data-slot="dots">
						{#each order as _, k (k)}
							{@const r = results[k]}
							<li
								class={[
									'h-1 min-w-0.5 flex-1 basis-0 first:rounded-l-full last:rounded-r-full',
									r === 'got'
										? 'bg-ripple-success'
										: r === 'missed'
											? 'bg-ripple-error'
											: k === pos
												? 'bg-ripple-accent'
												: 'bg-ripple-track'
								]}
								data-mark={r ?? (k === pos ? 'now' : 'todo')}
								aria-current={k === pos ? 'step' : undefined}
							>
								<span class="sr-only">Card {k + 1}: {r === 'got' ? 'got it' : r === 'missed' ? 'missed' : k === pos ? 'current' : 'to do'}</span>
							</li>
						{/each}
					</ol>
					{#if card.hint}
						<button
							type="button"
							class={[
								'inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-footnote text-ripple-muted-foreground transition-colors hover:bg-ripple-muted hover:text-ripple-surface-foreground aria-pressed:text-ripple-warning-text',
								flipped && 'invisible',
								focusRing
							]}
							aria-label="Show hint"
							aria-pressed={hintOpen}
							disabled={flipped}
							onclick={() => (hintOpen = !hintOpen)}
						>
							<Lightbulb size={14} strokeWidth={1.75} aria-hidden="true" />Hint
						</button>
					{/if}
					<span class="shrink-0 text-footnote text-ripple-muted-foreground tabular-nums" data-slot="position"
						>{pos + 1} / {order.length}{#if skipped && pos === 0 && !practise}<span>{` · ${skipped} skipped`}</span>{/if}</span
					>
				</div>

				<div class="deck-stack" data-sheets={sheets}>
					<!-- A new card is a new node, so it never un-flips on screen (that would flash its answer). -->
					{#key pos}
						<button
							type="button"
							class={['deck-card block w-full rounded-ripple', focusRing]}
							data-flipped={flipped}
							onclick={() => (flipped ? (flipped = false) : reveal())}
							in:rise
						>
							<span class={['deck-inner', `deck-h-${height}`]} data-height={height}>
								<span
									class={[
										'deck-face deck-front flex flex-col justify-center gap-3 rounded-ripple border border-ripple-border bg-ripple-raised p-5',
										card.front.length > 90 ? 'items-start text-left' : 'items-center text-center'
									]}
									aria-hidden={flipped}
								>
									{#if card.category}
										<span
											class="max-w-full truncate text-caption-1 font-medium tracking-[0.04em] text-ripple-muted-foreground uppercase"
											title={card.category}>{card.category}</span
										>
									{/if}
									<span class={[tier(card.front), textWrap]} data-slot="front">{card.front}</span>
									{#if hintOpen && card.hint}
										<span class={['flex items-start gap-1.5 text-callout text-ripple-muted-foreground', textWrap]} data-slot="hint"
											><Lightbulb size={14} strokeWidth={1.75} aria-hidden="true" class="mt-0.5 shrink-0 text-ripple-warning-text" />{card.hint}</span
										>
									{/if}
								</span>
								<span
									class={[
										'deck-face deck-back flex flex-col justify-center gap-2 rounded-ripple border border-ripple-accent/40 bg-[color-mix(in_oklab,var(--ripple-accent)_8%,var(--ripple-raised))] p-5',
										card.back.length > 90 ? 'items-start text-left' : 'items-center text-center'
									]}
									aria-hidden={!flipped}
								>
									<span class={['line-clamp-2 max-w-full text-callout text-ripple-muted-foreground', textWrap]} title={card.front}>{card.front}</span>
									{#if card.back}
										<span class={[tier(card.back), textWrap]} data-slot="back">{card.back}</span>
									{:else}
										<span class="text-callout text-ripple-muted-foreground" data-slot="back">No answer given</span>
									{/if}
								</span>
							</span>
						</button>
					{/key}
				</div>

				<div class="grid h-11 grid-cols-2 gap-2">
					{#if !flipped}
						<button type="button" bind:this={showBtn} class={[primaryBtn, 'col-span-2']} onclick={() => reveal()}>
							Show answer<kbd class={kbd} aria-hidden="true">Space</kbd>
						</button>
					{:else}
						<button type="button" class={neutralBtn} onclick={() => mark('missed')}>
							<X size={16} strokeWidth={2} aria-hidden="true" class="text-ripple-error-text" />Missed it<kbd class={kbd} aria-hidden="true">←</kbd>
						</button>
						<button type="button" bind:this={gotBtn} class={neutralBtn} onclick={() => mark('got')}>
							<Check size={16} strokeWidth={2} aria-hidden="true" class="text-ripple-success-text" />Got it<kbd class={kbd} aria-hidden="true">→</kbd>
						</button>
					{/if}
				</div>
			</div>
		{/if}

		<p class="sr-only" aria-live="polite">{live}</p>
	</div>
</div>

<style>
	/* 2px gaps while every segment stays at least 6px wide, closing to 0 for long decks. */
	.rail {
		gap: clamp(0px, calc((100% - var(--n) * 6px) / max(var(--n) - 1, 1)), 2px);
	}
	.keyhint {
		display: none;
		font-family: inherit;
	}
	@container (min-width: 480px) {
		@media (hover: hover) and (pointer: fine) {
			.keyhint {
				display: inline;
			}
		}
	}

	/* Sheets peek straight down below the card while more cards remain; never hit-tested. */
	.deck-stack {
		position: relative;
		isolation: isolate;
		padding-bottom: 12px;
	}
	.deck-stack::before,
	.deck-stack::after {
		content: '';
		position: absolute;
		display: none;
		pointer-events: none;
		border: 1px solid var(--ripple-border);
		border-radius: var(--ripple-radius);
		background: var(--ripple-raised);
	}
	.deck-stack::before {
		inset: 12px 8px 6px;
		z-index: -1;
	}
	.deck-stack::after {
		inset: 18px 16px 0;
		z-index: -2;
	}
	.deck-stack[data-sheets='1']::before,
	.deck-stack[data-sheets='2']::before,
	.deck-stack[data-sheets='2']::after {
		display: block;
	}

	.deck-card {
		perspective: 1200px;
		cursor: pointer;
	}
	.deck-inner {
		display: grid;
		transform-style: preserve-3d;
		transition: transform 450ms var(--ripple-ease-out);
	}
	.deck-h-sm {
		min-height: 200px;
	}
	.deck-h-md {
		min-height: 240px;
	}
	.deck-h-lg {
		min-height: 280px;
	}
	@container (min-width: 480px) {
		.deck-h-sm {
			min-height: 240px;
		}
		.deck-h-md {
			min-height: 280px;
		}
	}
	.deck-card[data-flipped='true'] .deck-inner {
		transform: rotateY(180deg);
	}
	.deck-face {
		grid-area: 1 / 1;
		min-width: 0;
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
		box-shadow:
			0 1px 2px color-mix(in oklab, var(--ripple-surface-foreground) 8%, transparent),
			0 8px 24px -12px color-mix(in oklab, var(--ripple-surface-foreground) 18%, transparent);
		transition: box-shadow 200ms var(--ripple-ease-out);
	}
	@media (hover: hover) {
		.deck-card:hover .deck-face {
			box-shadow:
				0 1px 2px color-mix(in oklab, var(--ripple-surface-foreground) 10%, transparent),
				0 12px 28px -12px color-mix(in oklab, var(--ripple-surface-foreground) 26%, transparent);
		}
	}
	.deck-back {
		transform: rotateY(180deg);
	}
	@media (prefers-reduced-motion: reduce) {
		.deck-inner,
		.deck-card[data-flipped='true'] .deck-inner,
		.deck-back {
			transform: none;
			transition: none;
		}
		.deck-face {
			transition: opacity 160ms ease-out;
		}
		.deck-back,
		.deck-card[data-flipped='true'] .deck-front {
			opacity: 0;
		}
		.deck-card[data-flipped='true'] .deck-back {
			opacity: 1;
		}
	}
</style>
