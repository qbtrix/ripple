<!--
  src/lib/widgets/vertical/AuditLog.svelte: who did what, to what, when, and
  how risky, as one row per event on a timeline rail. All parsing lives in
  audit-log-data.ts; this file only paints rows.

  Anatomy: a summary line (count with its noun, date span, the shared zone),
  an optional filter bar (severity toggles, type and person selects, "Showing
  n of m"), day or week groups newest first, and rows in the model's order.
  Each row reads as a sentence (actor, action, target) with the time and type
  on a muted meta line; a severity badge sits on the rail as icon shape plus
  status ink, never colour alone. Past 20 rows a "Show N more" button reveals
  the rest.

  Layout keys off the widget's own width (container query): under 480px the
  time joins the meta line and the details chevron ends it; from 480px time
  gets a right column and the chevron its own. Colours are --ripple-* tokens
  only, so the host theme and Ripple's light/dark switch recolour everything.

  Invariants: expanded state is keyed by the row's unique key (two rows may
  share an id); selectedId compares as strings; an entry's `action` is text,
  never dispatched.
-->
<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import * as Select from '$lib/components/ui/select/index.js';
	import { ACTOR_ICONS } from '../data-kit/icons.js';
	import { STATUS_CLASS, STATUS_ICONS } from '../data-kit/status.js';
	import {
		SEVERITIES,
		SEVERITY_STATUS,
		SEVERITY_WORD,
		breakable,
		capitalize,
		effectiveGroupBy,
		facets,
		flag,
		groupEntries,
		mixedZones,
		normalizeEntries,
		rowTime,
		spokenTime,
		summaryLine,
		type Row,
		type Severity
	} from './audit-log-data.js';

	type Entry = {
		id: string | number;
		actor: string;
		actorIcon?: string;
		action: string;
		target?: string;
		timestamp?: string;
		type?: string;
		details?: string | Record<string, unknown>;
		severity?: Severity;
	};

	interface Props {
		id?: string;
		class?: string;
		style?: Record<string, string>;
		entries?: Entry[];
		/** Allow expanding details. */
		showDetails?: boolean;
		/** Group rows by timestamp day or week. Default 'none'. */
		groupBy?: 'none' | 'day' | 'week';
		/** Show the filter bar (severity, type, person). */
		showFilters?: boolean;
		/** Highlighted entry id. */
		selectedId?: string | number;
		onSelectId?: (id: string | number) => void;
	}

	let {
		id,
		class: className,
		style,
		entries = [],
		showDetails = true,
		groupBy = 'none',
		showFilters = false,
		selectedId,
		onSelectId
	}: Props = $props();

	const LIMIT = 20;
	const ALL = '__all';
	const uid = $props.id();

	const styleString = $derived(
		style && typeof style === 'object' ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
	);

	const rows = $derived(normalizeEntries(entries));
	const detailsOn = $derived(flag(showDetails, true));
	const filtersOn = $derived(flag(showFilters, false));
	const mode = $derived(effectiveGroupBy(rows, groupBy));
	const summary = $derived(summaryLine(rows));
	const withZone = $derived(mixedZones(rows));
	const years = $derived(new Set(rows.map((r) => r.stamp.day?.slice(0, 4)).filter(Boolean)));

	// ---- Filters ------------------------------------------------------------
	let pressed = $state<Severity[]>([]);
	let typeSel = $state(ALL);
	let actorSel = $state(ALL);
	let showAll = $state(false);
	let expanded = $state<Set<string>>(new Set());

	const sevCounts = $derived(
		SEVERITIES.map((s) => ({ s, n: rows.filter((r) => r.severity === s).length })).filter((x) => x.n > 0)
	);
	const types = $derived(facets(rows.map((r) => r.type)));
	const actors = $derived(facets(rows.map((r) => r.actor)));
	const showSev = $derived(sevCounts.length > 1);
	const showTypes = $derived(types.length > 1);
	const showActors = $derived(actors.length > 1);
	const anyFacet = $derived(filtersOn && (showSev || showTypes || showActors));
	const active = $derived(pressed.length > 0 || typeSel !== ALL || actorSel !== ALL);

	const filtered = $derived(
		rows.filter(
			(r) =>
				(pressed.length === 0 || (r.severity !== undefined && pressed.includes(r.severity))) &&
				(typeSel === ALL || r.type.toLowerCase() === typeSel) &&
				(actorSel === ALL || r.actor.toLowerCase() === actorSel)
		)
	);

	const groups = $derived(groupEntries(filtered, mode));
	const hidden = $derived(showAll ? 0 : Math.max(0, filtered.length - LIMIT));
	const shown = $derived.by(() => {
		if (showAll) return groups.map((g) => ({ ...g, total: g.rows.length }));
		let left = LIMIT;
		const out = [];
		for (const g of groups) {
			if (left <= 0) break;
			out.push({ ...g, total: g.rows.length, rows: g.rows.slice(0, left) });
			left -= g.rows.length;
		}
		return out;
	});

	function toggleSeverity(s: Severity) {
		pressed = pressed.includes(s) ? pressed.filter((x) => x !== s) : [...pressed, s];
		showAll = false;
	}

	function clearFilters() {
		pressed = [];
		typeSel = ALL;
		actorSel = ALL;
		showAll = false;
	}

	function toggleDetails(key: string) {
		const next = new Set(expanded);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		expanded = next;
	}

	// ---- Rows ---------------------------------------------------------------
	const timeOf = (r: Row) => rowTime(r.stamp, { inDay: mode === 'day', withZone, withYear: years.size > 1 });

	const isSelected = (r: Row) =>
		selectedId !== undefined && selectedId !== null && r.id !== undefined && String(selectedId) === String(r.id);

	function rowName(r: Row): string {
		const sentence = [r.actor || 'Unknown', r.action, r.target].filter(Boolean).join(' ');
		return [sentence, r.severity && SEVERITY_WORD[r.severity].toLowerCase(), spokenTime(r.stamp)].filter(Boolean).join(', ');
	}

	// Interactive attrs only when the host listens; a spread keeps the static a11y check honest.
	const interactive = (r: Row) =>
		onSelectId && r.id !== undefined ? { role: 'button' as const, tabindex: 0, 'aria-label': rowName(r) } : {};

	function select(r: Row) {
		if (onSelectId && r.id !== undefined) onSelectId(r.id);
	}

	function selectKey(r: Row, e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			select(r);
		}
	}

	const reveal = () => ({ duration: prefersReducedMotion.current ? 0 : 150, easing: cubicOut });
	const typeLabel = $derived(typeSel === ALL ? 'All types' : capitalize(types.find((t) => t.toLowerCase() === typeSel) ?? ''));
	const actorLabel = $derived(actorSel === ALL ? 'Everyone' : (actors.find((a) => a.toLowerCase() === actorSel) ?? ''));
	const TRIGGER = 'h-7 w-auto max-w-[12rem] gap-1 text-[length:var(--text-callout)]';
</script>

<div {id} data-ripple-node={id} data-widget="audit-log" class={cn('al', className)} style={styleString}>
	{#if rows.length === 0}
		<p class="al-empty text-body text-ripple-muted-foreground">No events yet</p>
	{:else}
		<p class="al-summary text-callout text-ripple-muted-foreground">{summary}</p>

		{#if anyFacet}
			<div class="al-filters" role="group" aria-label="Filter events">
				{#if showSev}
					{#each sevCounts as { s, n } (s)}
						{@const st = SEVERITY_STATUS[s]}
						{@const Icon = STATUS_ICONS[st]}
						{@const on = pressed.includes(s)}
						<button
							type="button"
							class={['al-toggle text-callout', on ? [STATUS_CLASS[st].tint, STATUS_CLASS[st].text, 'is-on'] : 'text-ripple-surface-foreground']}
							aria-pressed={on}
							onclick={() => toggleSeverity(s)}
						>
							<Icon size={14} strokeWidth={2} aria-hidden="true" class={['shrink-0', STATUS_CLASS[st].text]} />
							<span>{SEVERITY_WORD[s]}</span>
							<span class={['al-num', !on && 'text-ripple-muted-foreground']}>{n}</span>
						</button>
					{/each}
				{/if}
				{#if showTypes}
					<Select.Root type="single" bind:value={typeSel} onValueChange={() => (showAll = false)}>
						<Select.Trigger size="sm" class={TRIGGER} aria-label="Type">
							<span class="truncate">{typeLabel}</span>
						</Select.Trigger>
						<Select.Content>
							<Select.Item value={ALL}>All types</Select.Item>
							{#each types as t (t.toLowerCase())}
								<Select.Item value={t.toLowerCase()}>{capitalize(t)}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				{/if}
				{#if showActors}
					<Select.Root type="single" bind:value={actorSel} onValueChange={() => (showAll = false)}>
						<Select.Trigger size="sm" class={TRIGGER} aria-label="Person">
							<span class="truncate">{actorLabel}</span>
						</Select.Trigger>
						<Select.Content>
							<Select.Item value={ALL}>Everyone</Select.Item>
							{#each actors as a (a.toLowerCase())}
								<Select.Item value={a.toLowerCase()}>{a}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				{/if}
				{#if active}
					<span class="al-showing text-callout text-ripple-muted-foreground">Showing {filtered.length} of {rows.length}</span>
					<button type="button" class="al-link text-callout" onclick={clearFilters}>Clear</button>
				{/if}
			</div>
		{/if}

		{#if filtered.length === 0}
			<p class="al-empty text-body text-ripple-muted-foreground">
				No events match these filters
				<button type="button" class="al-link text-callout" onclick={clearFilters}>Clear</button>
			</p>
		{:else}
			{#each shown as g (g.key)}
				<section class="al-group">
					{#if g.label}
						<h3 class="al-head text-callout" id="{uid}-g-{g.key}">
							<span>{g.label}</span>
							<span class="al-num text-ripple-muted-foreground">{g.total} {g.total === 1 ? 'event' : 'events'}</span>
						</h3>
					{/if}
					<ul
						class="al-list"
						aria-labelledby={g.label ? `${uid}-g-${g.key}` : undefined}
						aria-label={g.label ? undefined : 'Events'}
					>
						{#each g.rows as row (row.key)}
							{@const st = row.severity ? SEVERITY_STATUS[row.severity] : 'neutral'}
							{@const SevIcon = STATUS_ICONS[st]}
							{@const ActorIcon = row.actorIcon ? ACTOR_ICONS[row.actorIcon] : undefined}
							{@const time = timeOf(row)}
							{@const hasDetails = detailsOn && !!row.details}
							{@const isOpen = hasDetails && expanded.has(row.key)}
							{@const panelId = `${uid}-d-${row.key}`}
							<li class={['al-row', isSelected(row) && 'is-selected']}>
								<span class="al-badge" aria-hidden="true">
									{#if row.severity}
										<SevIcon size={14} strokeWidth={2} class={STATUS_CLASS[st].text} />
									{:else}
										<span class="al-dot"></span>
									{/if}
								</span>
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class={['al-main', onSelectId && row.id !== undefined && 'is-interactive']}
									{...interactive(row)}
									onclick={onSelectId ? () => select(row) : undefined}
									onkeydown={onSelectId ? (e) => selectKey(row, e) : undefined}
								>
									<p class="al-sentence text-body">
										{#if ActorIcon}<ActorIcon size={14} strokeWidth={2} aria-hidden="true" class="mr-1 inline align-[-2px] text-ripple-muted-foreground" />{/if}{#if row.actor}<span class="text-body-emph">{row.actor}</span>{:else}<span class="al-unknown text-ripple-muted-foreground">Unknown</span>{/if}{#if row.action}{' '}{row.action}{/if}{#if row.target}{' '}<span class="al-target">{#each breakable(row.target) as part, i}{#if i > 0}<wbr />{/if}{part}{/each}</span>{/if}{#if row.severity}<span class="sr-only">, {SEVERITY_WORD[row.severity]}</span>{/if}
									</p>
									{#if time || row.type}
										<p class={['al-meta text-callout text-ripple-muted-foreground', !row.type && 'is-time-only']}>
											{#if time}<span class="al-meta-time al-num" title={row.stamp.raw}>{time}</span>{/if}{#if time && row.type}<span class="al-meta-time" aria-hidden="true"> · </span>{/if}{#if row.type}<span>{capitalize(row.type)}</span>{/if}
										</p>
									{/if}
								</div>
								{#if time}
									<span class="al-time al-num text-callout text-ripple-muted-foreground" title={row.stamp.raw} aria-hidden="true">{time}</span>
								{/if}
								{#if hasDetails}
									<button
										type="button"
										class={['al-chev text-ripple-muted-foreground', isOpen && 'is-open']}
										aria-expanded={isOpen}
										aria-controls={panelId}
										aria-label={isOpen ? 'Hide details' : 'Show details'}
										onclick={(e) => {
											e.stopPropagation();
											toggleDetails(row.key);
										}}
									>
										<span class="al-chev-icon"><ChevronDown size={16} strokeWidth={2} aria-hidden="true" /></span>
									</button>
								{/if}
								{#if isOpen && row.details}
									{@const d = row.details}
									<div class="al-details text-callout" id={panelId} transition:slide={reveal()}>
										{#if d.kind === 'text'}
											<p class="al-details-text text-body">{d.text}</p>
										{:else if d.kind === 'json'}
											<pre class="al-json">{d.text}</pre>
										{:else}
											{#if d.change}
												<p class="al-change text-body">
													<s class="text-ripple-muted-foreground">{d.change.from}</s>
													<span class="text-ripple-muted-foreground" aria-label="changed to">→</span>
													<span>{d.change.to}</span>
												</p>
											{/if}
											{#if d.fields.length}
												<dl class="al-fields">
													{#each d.fields as [label, value], i (i)}
														<dt class="text-ripple-muted-foreground">{label}</dt>
														<dd class="text-body">{value}</dd>
													{/each}
												</dl>
											{/if}
										{/if}
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/each}
			{#if hidden > 0}
				<button type="button" class="al-more text-callout" onclick={() => (showAll = true)}>Show {hidden} more</button>
			{/if}
		{/if}
	{/if}
</div>

<style>
	.al {
		container-type: inline-size;
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-width: 0;
		color: var(--ripple-surface-foreground);
	}

	.al p {
		margin: 0;
	}

	.al-num {
		font-variant-numeric: tabular-nums;
	}

	.al-empty {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 48px;
	}

	/* ---- filter bar ---- */
	.al-filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}

	.al-toggle {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 28px;
		padding: 0 8px;
		border: 1px solid var(--ripple-border);
		border-radius: calc(var(--ripple-radius) - 2px);
		font-weight: 500;
		white-space: nowrap;
		cursor: pointer;
		transition: background-color 120ms var(--ripple-ease-out);
	}

	.al-toggle:hover:not(.is-on) {
		background: color-mix(in oklab, var(--ripple-track) 50%, transparent);
	}

	.al-toggle.is-on {
		border-color: transparent;
	}

	.al-link {
		padding: 2px 4px;
		border-radius: 4px;
		color: var(--ripple-accent-text);
		font-weight: 500;
		cursor: pointer;
	}

	.al-link:hover {
		text-decoration: underline;
	}

	.al-toggle:focus-visible,
	.al-link:focus-visible,
	.al-chev:focus-visible,
	.al-more:focus-visible,
	.al-main.is-interactive:focus-visible {
		outline: 2px solid var(--ripple-ring);
		outline-offset: 1px;
	}

	/* ---- groups and rail ---- */
	.al-group {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.al-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		margin: 0;
		font-weight: 500;
		color: var(--ripple-surface-foreground);
	}

	.al-head .al-num {
		font-weight: 400;
		white-space: nowrap;
	}

	.al-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.al-row {
		--pad: 6px;
		--mid: calc(var(--pad) + 8px);
		position: relative;
		display: grid;
		grid-template-columns: 24px minmax(0, 1fr) auto;
		column-gap: 8px;
		padding: var(--pad);
		margin-inline: calc(var(--pad) * -1);
		border-radius: calc(var(--ripple-radius) - 2px);
	}

	/* One 1px line through every badge centre, from the first row to the last. */
	.al-row::before {
		content: '';
		position: absolute;
		left: calc(var(--pad) + 11.5px);
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--ripple-border);
	}

	.al-row:first-child::before {
		top: var(--mid);
	}

	.al-row:last-child::before {
		bottom: auto;
		height: var(--mid);
	}

	.al-row:only-child::before {
		display: none;
	}

	.al-row.is-selected {
		background: color-mix(in oklab, var(--ripple-accent) 8%, transparent);
		box-shadow: inset 2px 0 0 var(--ripple-accent);
	}

	.al-badge {
		position: relative;
		z-index: 1;
		grid-column: 1;
		grid-row: 1;
		justify-self: center;
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		margin-top: -2px;
		border-radius: 999px;
		background: var(--ripple-surface);
	}

	.al-row.is-selected .al-badge {
		background: color-mix(in oklab, var(--ripple-accent) 8%, var(--ripple-surface));
	}

	.al-dot {
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: var(--ripple-muted-foreground);
	}

	.al-main {
		grid-column: 2;
		grid-row: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		border-radius: 4px;
	}

	.al-main.is-interactive {
		cursor: pointer;
	}

	.al-main.is-interactive:hover {
		background: color-mix(in oklab, var(--ripple-track) 50%, transparent);
	}

	.al-sentence {
		overflow-wrap: anywhere;
	}

	.al-unknown {
		font-style: italic;
	}

	.al-target {
		display: inline-block;
		max-width: 100%;
		padding: 0 4px;
		border-radius: 4px;
		background: color-mix(in oklab, var(--ripple-track) 55%, transparent);
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: var(--text-callout);
		line-height: var(--lh-body);
		overflow-wrap: anywhere;
		vertical-align: bottom;
	}

	.al-time {
		display: none;
	}

	.al-chev {
		grid-column: 3;
		grid-row: 1;
		align-self: end;
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		margin-bottom: -4px;
		border-radius: 4px;
		cursor: pointer;
	}

	.al-chev:hover {
		background: color-mix(in oklab, var(--ripple-track) 50%, transparent);
		color: var(--ripple-surface-foreground);
	}

	.al-chev-icon {
		display: grid;
		transition: transform 150ms var(--ripple-ease-out);
	}

	.al-chev.is-open .al-chev-icon {
		transform: rotate(180deg);
	}

	.al-details {
		grid-column: 2 / -1;
		grid-row: 2;
		max-height: 240px;
		overflow-y: auto;
		margin-top: 6px;
		padding: 8px 10px;
		border-radius: 4px;
		background: color-mix(in oklab, var(--ripple-track) 30%, transparent);
		overflow-wrap: anywhere;
	}

	.al-details-text {
		white-space: pre-wrap;
	}

	.al-json {
		margin: 0;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: var(--text-callout);
		line-height: var(--lh-callout);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.al-change {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 6px;
		margin-bottom: 6px;
	}

	.al-change:last-child {
		margin-bottom: 0;
	}

	.al-fields {
		display: grid;
		grid-template-columns: minmax(0, max-content) minmax(0, 1fr);
		gap: 4px 12px;
		margin: 0;
	}

	.al-fields dd {
		margin: 0;
		overflow-wrap: anywhere;
	}

	.al-more {
		width: 100%;
		height: 32px;
		border-radius: calc(var(--ripple-radius) - 2px);
		background: color-mix(in oklab, var(--ripple-track) 50%, transparent);
		color: var(--ripple-surface-foreground);
		font-weight: 500;
		cursor: pointer;
	}

	.al-more:hover {
		background: var(--ripple-track);
	}

	@media (prefers-reduced-motion: reduce) {
		.al-chev-icon,
		.al-toggle {
			transition: none;
		}
	}

	/* Wide card: time gets its own right column, the chevron its own. */
	@container (min-width: 480px) {
		.al-row {
			grid-template-columns: 24px minmax(0, 1fr) auto 24px;
		}

		.al-time {
			display: block;
			grid-column: 3;
			grid-row: 1;
			white-space: nowrap;
			text-align: right;
			line-height: var(--lh-body);
		}

		.al-meta-time,
		.al-meta.is-time-only {
			display: none;
		}

		.al-chev {
			grid-column: 4;
			align-self: start;
			margin: -4px 0 0;
		}
	}
</style>
