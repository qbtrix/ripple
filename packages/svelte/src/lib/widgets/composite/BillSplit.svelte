<!--
  widgets/composite/BillSplit.svelte: `bill-split`, "dinner for 4 came to
  $186.40, split it with tip and let me adjust who had drinks". The model
  writes the bill, the tip and the people; the widget does the maths (in
  ./bill-split.ts) and the layout: a verdict, a controls band (bill, tip
  chips plus a custom percent), one row per person with the share in a
  right-aligned column, and a totals foot whose amounts sit on that same
  right edge. The card shell is the only frame; hairlines separate the rest.
  Below 480px of card width each person is a two-line block.

  Invariants:
  - `value` ({ subtotal, tip_percent, people: [{ id, name, extras }] }) is
    the bound field (default `value` / `onchange`). Nothing is seeded from a
    prop into $state: the shown bill is the bound value, else a local Edit
    (data-kit/edit.ts) while it holds against the props, else the props. A
    bound value that is not an object is ignored.
  - A half-typed number lives in `draft` with its raw text; the field echoes
    that text while typing (so it is never reformatted mid-keystroke), the
    totals move live, and it commits on `change`. At rest every money field
    shows the currency's own decimals.
  - Amounts are minor units of the currency (`minorDigits`), so yen shares
    add up to the yen total on screen.
  - Row keys are `${id}:${i}`; new people get the next free `pN` id, so the
    markup has no generated ids (stream parity compares it).
-->
<script lang="ts">
	import { safeStyle } from '@ripple-ui/core';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import Copy from '@lucide/svelte/icons/copy';
	import Check from '@lucide/svelte/icons/check';
	import { StatusPill, VerdictLine, finite, holds, money, nextEdit, num, plain, rise } from '../data-kit/index.js';
	import type { Edit } from '../data-kit/edit.js';
	import type { Verdict } from '../data-kit/types.js';
	import { MAX_PEOPLE, MIN_PEOPLE, clampTip, countPeople, minorDigits, nextId, split, toTipOptions, toValue } from './bill-split.js';
	import type { BillValue, Person } from './bill-split.js';

	interface Props {
		id?: string;
		class?: string;
		style?: string | Record<string, string>;
		title?: string;
		/** ISO 4217, default USD. */
		currency?: string;
		/** The bill before tip (and before tax). */
		subtotal?: number;
		/** Added on top of the subtotal, shared in proportion to what each person had. */
		tax?: number;
		/** Percent of the subtotal: 18 means 18%. */
		tip_percent?: number;
		tip_options?: number[];
		people?: Array<{ id: string; name: string; extras?: number }>;
		extras_label?: string;
		note?: string;
		/** Two-way bindable: the bill as the visitor has edited it. */
		value?: BillValue;
		onchange?: (value: BillValue) => void;
	}

	let {
		id,
		class: className,
		style,
		title,
		currency = 'USD',
		subtotal,
		tax,
		tip_percent,
		tip_options,
		people,
		extras_label,
		note,
		value = $bindable(),
		onchange
	}: Props = $props();

	const uid = $props.id();

	const rootStyle = $derived(
		style && typeof style === 'object'
			? safeStyle(Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';'))
			: safeStyle(typeof style === 'string' ? style : '')
	);
	const heading = $derived(plain(title));
	const footnote = $derived(plain(note));
	const extrasWord = $derived(plain(extras_label) || 'Drinks');
	const digits = $derived(minorDigits(currency));
	const unit = $derived(10 ** digits);
	const fmt = (m: number) => money(m / unit, currency);
	const fixed = (n: number) => n.toFixed(digits);
	// The currency's own symbol for the field prefixes ('$', '¥', '€').
	const symbol = $derived(fmt(0).replace(/[\d\s.,]/g, '') || '$');
	const options = $derived(toTipOptions(tip_options));
	const sent = $derived(countPeople(people));

	// ── The bill on show: bound value, else a holding edit, else the props ──
	const seed = $derived(toValue({ subtotal, tip_percent, people }));
	let edit = $state.raw<Edit<BillValue> | null>(null);
	const bound = $derived(value !== null && typeof value === 'object' ? toValue(value) : undefined);
	// A bound value the host set wins; an echo of our own edit does not, so
	// new props from the model can still replace a stale edit.
	const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
	const current = $derived.by(() => {
		if (bound && !(edit && same(bound, edit.value))) return bound;
		return holds(edit, seed) ? edit.value : seed;
	});

	// A half-typed number: 'subtotal', 'tip' or a person's id, with the raw text.
	let draft = $state<{ key: string; value: number; text: string } | null>(null);
	const shown = $derived.by(() => {
		if (!current || !draft) return current;
		const d = draft;
		if (d.key === 'subtotal') return { ...current, subtotal: Math.max(0, d.value) };
		if (d.key === 'tip') return { ...current, tip_percent: clampTip(d.value) ?? current.tip_percent };
		return { ...current, people: current.people.map((p) => (p.id === d.key ? { ...p, extras: Math.max(0, d.value) } : p)) };
	});
	const result = $derived(shown ? split(shown, tax, digits) : undefined);
	// Nobody had extras (committed, so the rows do not flip while typing): quiet `+ Drinks`.
	const quiet = $derived(!!current && current.people.every((p) => p.extras === 0));

	/** What a field shows: the draft text while typing, else the value at rest. */
	const fieldText = (key: string, rest: string) => (draft?.key === key ? draft.text : rest);
	const tipText = (t: number) => String(+t.toFixed(2));
	/** A field's text at rest; quiet extras at 0 show their `+ Drinks` placeholder instead. */
	const restText = (key: string, v: number) => (key === 'tip' ? tipText(v) : quiet && key !== 'subtotal' && !v ? '' : fixed(v));

	function commit(next: BillValue) {
		const clean = toValue(next)!;
		edit = nextEdit(edit, seed, clean);
		value = clean;
		onchange?.(clean);
	}

	const withPeople = (list: Person[]) => current && commit({ ...current, people: list });

	function onDraft(key: string, e: Event & { currentTarget: HTMLInputElement }) {
		const v = e.currentTarget.valueAsNumber;
		if (Number.isFinite(v)) draft = { key, value: v, text: e.currentTarget.value };
	}

	function onCommit(key: string, e: Event & { currentTarget: HTMLInputElement }) {
		const v = finite(e.currentTarget.valueAsNumber);
		draft = null;
		if (!current) return;
		const was = key === 'subtotal' ? current.subtotal : key === 'tip' ? current.tip_percent : (current.people.find((p) => p.id === key)?.extras ?? 0);
		const next = v === undefined ? was : key === 'tip' ? (clampTip(v) ?? was) : Math.max(0, v);
		// Svelte skips the DOM when the rest text did not change ("186.4" typed over "186.40"), so set it here.
		e.currentTarget.value = restText(key, next);
		if (v === undefined) return;
		if (key === 'subtotal') commit({ ...current, subtotal: v });
		else if (key === 'tip') commit({ ...current, tip_percent: v });
		else withPeople(current.people.map((p) => (p.id === key ? { ...p, extras: v } : p)));
	}

	function rename(pid: string, e: Event & { currentTarget: HTMLInputElement }) {
		if (!current) return;
		const name = e.currentTarget.value.trim();
		const i = current.people.findIndex((p) => p.id === pid);
		withPeople(current.people.map((p, j) => (j === i ? { ...p, name: name || `Person ${i + 1}` } : p)));
	}

	function addPerson() {
		if (!current || current.people.length >= MAX_PEOPLE) return;
		const n = current.people.length + 1;
		withPeople([...current.people, { id: nextId(current.people.map((p) => p.id)), name: `Person ${n}`, extras: 0 }]);
	}

	function removePerson(pid: string) {
		if (!current || current.people.length <= MIN_PEOPLE) return;
		withPeople(current.people.filter((p) => p.id !== pid));
	}

	// ── What the reader sees ────────────────────────────────────────────────
	const verdict = $derived.by((): Verdict | undefined => {
		if (!result?.shares.length) return undefined;
		if (result.shares.length === 1) return { text: 'Add someone to split with', status: 'info' };
		const amounts = result.shares.map((s) => s.cents);
		const lo = Math.min(...amounts);
		const hi = Math.max(...amounts);
		if (lo === hi) return { text: `Everyone pays ${fmt(lo)}`, status: 'good' };
		if (hi - lo === 1) return { text: `Everyone pays ${fmt(lo)} or ${fmt(hi)}`, status: 'good' };
		return { text: `Shares range from ${fmt(lo)} to ${fmt(hi)}`, status: 'info' };
	});

	const addedWord = $derived(!result ? '' : result.tip && result.tax ? 'tip and tax' : result.tax ? 'tax' : 'tip');

	const summary = $derived(
		result && shown
			? [
					heading || 'Bill split',
					`Bill ${fmt(result.subtotal + result.tax)}${result.tax ? ` (tax ${fmt(result.tax)})` : ''}, tip ${num(shown.tip_percent)}% ${fmt(result.tip)}, total ${fmt(result.total)}`,
					...result.shares.map((s) => `${s.name}: ${fmt(s.cents)}`)
				].join('\n')
			: ''
	);

	let copied = $state(false);
	async function copy() {
		try {
			await navigator.clipboard?.writeText(summary);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {
			copied = false;
		}
	}

	// Tip chips: equal cells, one row up to 4; 5 or 6 take 3 columns when narrow, one row when wide.
	const CHIP_COLS = ['grid-cols-1', 'grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'grid-cols-3 @min-[480px]:grid-cols-5', 'grid-cols-3 @min-[480px]:grid-cols-6'];

	const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ripple-ring';
	const label = 'text-footnote text-ripple-muted-foreground';
	const box =
		'flex h-8 min-w-0 items-center gap-1 rounded-md border border-ripple-control-border bg-ripple-input px-2 text-callout text-ripple-input-foreground transition-colors focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-ripple-ring motion-reduce:transition-none';
	const field =
		'w-full min-w-0 bg-transparent text-right tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
	const chip =
		'flex h-8 min-w-0 flex-col items-center justify-center rounded-md border px-1 text-callout font-medium tabular-nums transition-colors @min-[480px]:h-11 motion-reduce:transition-none';
	const action =
		'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-ripple-border bg-ripple-surface px-2.5 text-callout font-medium transition-colors hover:bg-ripple-muted disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-ripple-surface motion-reduce:transition-none';
</script>

<div {id} class={['@container text-ripple-surface-foreground', className]} style={rootStyle} data-widget="bill-split">
	<div class="flex flex-col gap-3">
		{#if heading}<h2 class="text-title-3 font-semibold text-pretty">{heading}</h2>{/if}

		{#if shown && result}
			<VerdictLine {verdict} />

			<div class="grid gap-3 @min-[480px]:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] @min-[480px]:gap-5" data-slot="inputs">
				<div class="flex items-center justify-between gap-3 @min-[480px]:flex-col @min-[480px]:items-stretch @min-[480px]:justify-start @min-[480px]:gap-1">
					<label for="{uid}-subtotal" class={[label, 'flex @min-[480px]:min-h-8 @min-[480px]:items-center']}>Bill before tip</label>
					<div class={[box, 'w-36 @min-[480px]:h-11 @min-[480px]:w-full @min-[480px]:text-headline']}>
						<span class="text-ripple-muted-foreground" aria-hidden="true">{symbol}</span>
						<input
							id="{uid}-subtotal"
							type="number"
							inputmode="decimal"
							min="0"
							step={1 / unit}
							value={fieldText('subtotal', fixed(shown.subtotal))}
							class={field}
							oninput={(e) => onDraft('subtotal', e)}
							onchange={(e) => onCommit('subtotal', e)}
						/>
					</div>
				</div>
				<div class="flex min-w-0 flex-col gap-1">
					<div class="flex min-h-8 items-center justify-between gap-3">
						<span id="{uid}-tip" class={label}>Tip</span>
						<div class={[box, 'w-20']}>
							<input
								id="{uid}-tip-custom"
								type="number"
								inputmode="decimal"
								min="0"
								max="100"
								step="0.5"
								value={fieldText('tip', tipText(shown.tip_percent))}
								aria-label="Custom tip percent"
								class={field}
								oninput={(e) => onDraft('tip', e)}
								onchange={(e) => onCommit('tip', e)}
							/>
							<span class="text-ripple-muted-foreground" aria-hidden="true">%</span>
						</div>
					</div>
					<div class={['grid gap-1.5', CHIP_COLS[options.length]]} role="group" aria-labelledby="{uid}-tip">
						{#each options as t (t)}
							{@const on = shown.tip_percent === t}
							<button
								type="button"
								class={[
									chip,
									focusRing,
									on ? 'border-ripple-accent bg-ripple-accent text-ripple-accent-foreground' : 'border-ripple-control-border bg-ripple-surface hover:bg-ripple-muted'
								]}
								aria-pressed={on}
								onclick={() => current && commit({ ...current, tip_percent: t })}
								>{num(t)}%<span
									class={['hidden text-caption-1 font-normal @min-[480px]:block', on ? 'text-ripple-accent-foreground' : 'text-ripple-muted-foreground']}
									aria-hidden="true">{fmt(Math.round((result.subtotal * t) / 100))}</span
								></button
							>
						{/each}
					</div>
				</div>
			</div>

			{#if result.over}
				<p class="flex flex-wrap items-center gap-2 text-footnote text-ripple-muted-foreground" data-slot="over">
					<StatusPill status="warn" label="Adjusted" />
					<span>{extrasWord} add up to more than the bill, so the bill counts as {fmt(result.subtotal)}.</span>
				</p>
			{/if}

			<ul
				class="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 divide-y divide-ripple-border border-y border-ripple-border @min-[480px]:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
				aria-label="Who pays what"
				data-slot="people"
			>
				{#each result.shares as s, i (`${s.id}:${i}`)}
					<li class="col-span-full grid min-h-11 grid-cols-subgrid items-center gap-y-1 py-2" in:rise={{ index: 0 }} data-person={s.id}>
						<div class="col-start-1 row-start-1 min-w-0 @min-[480px]:row-span-2">
							<label for="{uid}-name-{i}" class="sr-only">Name of person {i + 1}</label>
							<input
								id="{uid}-name-{i}"
								type="text"
								value={s.name}
								title={s.name}
								maxlength="40"
								class={[
									'h-7 w-full min-w-0 truncate rounded-sm border-b border-ripple-control-border bg-transparent text-body-emph outline-none hover:border-ripple-surface-foreground',
									focusRing
								]}
								onchange={(e) => rename(s.id, e)}
							/>
						</div>

						<div class="col-start-1 row-start-2 flex min-w-0 items-center gap-2 @min-[480px]:col-start-2 @min-[480px]:row-span-2 @min-[480px]:row-start-1">
							{#if !quiet}
								<label for="{uid}-extras-{i}" class={[label, 'max-w-24 truncate']} title={extrasWord}>{extrasWord}</label>
							{/if}
							<div
								class={[
									box,
									'w-24 shrink-0',
									quiet && 'w-28 border-transparent bg-transparent px-1 hover:bg-ripple-muted focus-within:border-ripple-control-border focus-within:bg-ripple-input'
								]}
							>
								<span class={['text-ripple-muted-foreground', quiet && 'hidden']} aria-hidden="true">{symbol}</span>
								<input
									id="{uid}-extras-{i}"
									aria-label="{extrasWord} for {s.name}"
									type="number"
									inputmode="decimal"
									min="0"
									step={1 / unit}
									placeholder={quiet ? `+ ${extrasWord}` : undefined}
									value={fieldText(s.id, restText(s.id, s.extras))}
									class={[field, quiet && 'text-left text-ellipsis placeholder:text-ripple-muted-foreground']}
									oninput={(e) => onDraft(s.id, e)}
									onchange={(e) => onCommit(s.id, e)}
								/>
							</div>
						</div>

						<p
							class={[
								'col-span-2 col-start-2 row-start-1 justify-self-end text-headline whitespace-nowrap tabular-nums @min-[480px]:col-span-1 @min-[480px]:col-start-3',
								!s.cents && 'text-ripple-muted-foreground',
								s.added > 0 ? '@min-[480px]:self-end' : '@min-[480px]:row-span-2'
							]}
							data-slot="pays"
						>
							{fmt(s.cents)}
						</p>
						{#if s.added > 0}
							<p class="col-start-2 row-start-2 justify-self-end text-caption-1 whitespace-nowrap text-ripple-muted-foreground tabular-nums @min-[480px]:col-start-3 @min-[480px]:self-start">
								incl. {fmt(s.added)} {addedWord}
							</p>
						{/if}

						<button
							type="button"
							class={[
								'col-start-3 row-start-2 grid size-8 place-items-center rounded-md text-ripple-muted-foreground transition-colors hover:bg-ripple-muted hover:text-ripple-surface-foreground disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none @min-[480px]:col-start-4 @min-[480px]:row-span-2 @min-[480px]:row-start-1',
								focusRing
							]}
							aria-label="Remove {s.name}"
							disabled={result.shares.length <= MIN_PEOPLE}
							onclick={() => removePerson(s.id)}
						>
							<X size={14} strokeWidth={2} aria-hidden="true" />
						</button>
					</li>
				{/each}
			</ul>

			{#if sent > MAX_PEOPLE}
				<p class="-mt-1 text-footnote text-ripple-muted-foreground">Showing the first {MAX_PEOPLE} of {sent} people</p>
			{/if}

			<div class="flex flex-col gap-1 text-callout tabular-nums @min-[480px]:pr-11" aria-live="polite" aria-label="Totals" data-slot="totals">
				<p class="flex justify-between gap-3"><span class="text-ripple-muted-foreground">Bill</span><span>{fmt(result.subtotal)}</span></p>
				{#if result.tax}
					<p class="flex justify-between gap-3"><span class="text-ripple-muted-foreground">Tax</span><span>{fmt(result.tax)}</span></p>
				{/if}
				<p class="flex justify-between gap-3"><span class="text-ripple-muted-foreground">Tip {num(shown.tip_percent)}%</span><span>{fmt(result.tip)}</span></p>
				<p class="mt-1 flex justify-between gap-3 text-body-emph"><span>Total</span><span>{fmt(result.total)}</span></p>
			</div>

			<div class="flex items-center justify-between gap-2">
				<button
					type="button"
					class={[action, focusRing]}
					disabled={result.shares.length >= MAX_PEOPLE}
					title={result.shares.length >= MAX_PEOPLE ? `${MAX_PEOPLE} people is the most` : undefined}
					onclick={addPerson}
				>
					<Plus size={14} strokeWidth={2} aria-hidden="true" />Add person
				</button>
				<button type="button" class={[action, focusRing]} onclick={copy}>
					{#if copied}<Check size={14} strokeWidth={2} aria-hidden="true" />Copied{:else}<Copy size={14} strokeWidth={2} aria-hidden="true" />Copy summary{/if}
				</button>
			</div>

			{#if footnote}<p class="text-footnote text-pretty text-ripple-muted-foreground">{footnote}</p>{/if}
		{:else}
			<div class="flex flex-col gap-3" aria-busy="true" data-slot="pending">
				<div class="h-5 w-48 rounded bg-ripple-track"></div>
				<div class="flex flex-col divide-y divide-ripple-border border-y border-ripple-border">
					<div class="flex h-11 items-center justify-between"><div class="h-3.5 w-24 rounded bg-ripple-track"></div><div class="h-3.5 w-14 rounded bg-ripple-track"></div></div>
					<div class="flex h-11 items-center justify-between"><div class="h-3.5 w-20 rounded bg-ripple-track"></div><div class="h-3.5 w-14 rounded bg-ripple-track"></div></div>
				</div>
				<p class="text-callout text-ripple-muted-foreground">Waiting for the bill and who is splitting it.</p>
			</div>
		{/if}
	</div>
</div>
