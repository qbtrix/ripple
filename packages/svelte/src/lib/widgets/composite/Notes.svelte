<!--
  widgets/composite/Notes.svelte: `notes`: a notepad, not a form. The model
  seeds notes (title, text, tags, pinned, a palette colour) and suggested
  tags; the visitor writes straight into a quiet "Write a note…" line that
  opens into a borderless title + body. Enter on the title or Cmd/Ctrl+Enter
  saves, leaving the writing area with something in it saves, Esc cancels.
  `#tag` anywhere becomes a chip. Notes sit in a grid of soft cards, pinned
  first; click one to edit it in place; pin and delete show on hover or focus,
  and delete offers Undo for a few seconds instead of a confirm. Tag chips
  filter the list; a search box appears past six notes.

  Invariants:
  - `value` ({ notes }) is the bound field (default `value` / `onchange`). The
    shown value is the bound value, else a local Edit (data-kit/edit.ts) while
    it holds against the raw props, else the props, as in HabitTracker.
  - Plain text only: note content is interpolated, never rendered as HTML.
    Caps (50 notes, title 80, text 2000) live in notes.ts.
  - No storage: notes live in the value; a reload starts from the props.
  - Container queries only: one column, two from 400px, three from 720px.
-->
<script lang="ts">
	import { safeStyle } from '@ripple-ui/core';
	import Pin from '@lucide/svelte/icons/pin';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { holds, nextEdit, plain } from '../data-kit/index.js';
	import type { Edit } from '../data-kit/edit.js';
	import {
		MAX_NOTES,
		NOTE_COLORS,
		ago,
		allTags,
		asDraft,
		fromDraft,
		matches,
		nextNoteId,
		ordered,
		parseTags,
		readNotes,
		toValue,
		type Note,
		type NoteColor,
		type NotesValue
	} from './notes.js';

	interface Props {
		id?: string;
		class?: string;
		style?: string | Record<string, string>;
		title?: string;
		/** Seed notes. `color` is one of plain, yellow, blue, green, pink. */
		notes?: Array<{ id?: string; title?: string; text: string; tags?: string[]; pinned?: boolean; color?: NoteColor }>;
		/** Suggested tags shown as chips. */
		tags?: string[];
		/** The writing line's prompt. Default "Write a note…". */
		placeholder?: string;
		/** Two-way bindable: the notes. */
		value?: NotesValue;
		onchange?: (value: NotesValue) => void;
	}

	let { id, class: className, style, title, notes, tags, placeholder, value = $bindable(), onchange }: Props = $props();

	const rootStyle = $derived(
		style && typeof style === 'object'
			? safeStyle(Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';'))
			: safeStyle(typeof style === 'string' ? style : '')
	);
	const heading = $derived(plain(title));
	const prompt = $derived(plain(placeholder).slice(0, 80) || 'Write a note…');

	// ── The value on show: bound value, else a holding edit, else the props ──
	const fromProps = $derived({ notes: readNotes(notes) });
	const incoming = $derived({ notes });
	let edit = $state.raw<Edit<NotesValue> | null>(null);
	const bound = $derived(toValue(value));
	const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
	const current = $derived.by(() => {
		if (bound && !(edit && same(bound, edit.value))) return bound;
		return holds(edit, incoming) ? edit.value : fromProps;
	});

	function commit(next: Note[]) {
		const clean = toValue({ notes: next })!;
		edit = nextEdit(edit, incoming, clean);
		value = clean;
		onchange?.(clean);
	}

	// ── Clock for "just now" ────────────────────────────────────────────────
	let now = $state(0);
	$effect(() => {
		now = Date.now();
		const timer = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(timer);
	});

	// ── Filter and search ───────────────────────────────────────────────────
	/** Filter chips: tags in use. The editor also offers the model's suggestions. */
	const tagList = $derived(allTags(current.notes, []));
	const suggestions = $derived(allTags(current.notes, tags));
	let picked = $state('');
	const activeTag = $derived(tagList.includes(picked) ? picked : '');
	let query = $state('');
	const searching = $derived(current.notes.length > 6);
	const shown = $derived(ordered(current.notes).filter((n) => matches(n, activeTag, searching ? query : '')));
	const full = $derived(current.notes.length >= MAX_NOTES);

	let announce = $state('');

	// ── Writing ─────────────────────────────────────────────────────────────
	interface Draft {
		title: string;
		text: string;
		color: NoteColor;
	}
	let draft = $state<Draft>({ title: '', text: '', color: 'plain' });
	let writing = $state(false);
	const composerOpen = $derived(writing || !current.notes.length || !!draft.title || !!draft.text);
	let titleEl = $state<HTMLInputElement>();

	function saveDraft(keepWriting: boolean) {
		const fields = fromDraft(draft.title, draft.text);
		if (fields && !full) {
			const tagsWithFilter = activeTag && !fields.tags.includes(activeTag) ? [...fields.tags, activeTag] : fields.tags;
			const note: Note = { id: nextNoteId(current.notes), ...fields, tags: tagsWithFilter, pinned: false, color: draft.color, at: Date.now() };
			now = note.at!;
			commit([note, ...current.notes]);
			announce = 'Note saved.';
		}
		draft = { title: '', text: '', color: 'plain' };
		writing = keepWriting;
		if (keepWriting) titleEl?.focus();
	}

	function cancelDraft() {
		draft = { title: '', text: '', color: 'plain' };
		writing = false;
		(document.activeElement as HTMLElement | null)?.blur();
	}

	// ── Editing in place ────────────────────────────────────────────────────
	let editing = $state<string | null>(null);
	let editDraft = $state<Draft>({ title: '', text: '', color: 'plain' });

	function startEdit(n: Note) {
		editing = n.id;
		editDraft = { ...asDraft(n), color: n.color };
	}

	function saveEdit(refocus = false) {
		const n = current.notes.find((x) => x.id === editing);
		editing = null;
		if (!n) return;
		if (refocus) focusCard(n.id);
		const fields = fromDraft(editDraft.title, editDraft.text);
		if (!fields) return remove(n);
		const next = { ...n, ...fields, color: editDraft.color };
		if (same({ ...next, at: 0 }, { ...n, at: 0 })) return;
		next.at = now = Date.now();
		commit(current.notes.map((x) => (x.id === n.id ? next : x)));
		announce = 'Note updated.';
	}

	let root = $state<HTMLElement>();
	const focusCard = (nid: string | null) =>
		queueMicrotask(() =>
			[...(root?.querySelectorAll<HTMLElement>('[data-note]') ?? [])]
				.find((el) => el.dataset.note === nid)
				?.querySelector<HTMLElement>('[data-slot="open"]')
				?.focus()
		);

	function cancelEdit() {
		const was = editing;
		editing = null;
		focusCard(was);
	}

	// ── Pin, delete, undo ───────────────────────────────────────────────────
	const label = (n: Note) => n.title || n.text.split('\n')[0].slice(0, 40) || 'note';

	function togglePin(n: Note) {
		commit(current.notes.map((x) => (x.id === n.id ? { ...x, pinned: !x.pinned } : x)));
		announce = n.pinned ? `Unpinned ${label(n)}.` : `Pinned ${label(n)}.`;
	}

	let undo = $state<{ note: Note; index: number } | null>(null);
	let undoTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => () => clearTimeout(undoTimer));

	function remove(n: Note) {
		const index = current.notes.findIndex((x) => x.id === n.id);
		if (index < 0) return;
		commit(current.notes.filter((x) => x.id !== n.id));
		undo = { note: n, index };
		clearTimeout(undoTimer);
		undoTimer = setTimeout(() => (undo = null), 6000);
		announce = `Deleted ${label(n)}. Undo is available.`;
	}

	function restore() {
		if (!undo) return;
		const { note, index } = undo;
		undo = null;
		clearTimeout(undoTimer);
		if (current.notes.length >= MAX_NOTES || current.notes.some((x) => x.id === note.id)) return;
		const next = [...current.notes];
		next.splice(Math.min(index, next.length), 0, note);
		commit(next);
		announce = `Restored ${label(note)}.`;
	}

	// ── Shared editor keys ──────────────────────────────────────────────────
	function editorKeys(e: KeyboardEvent, save: (keep: boolean) => void, cancel: () => void) {
		if (e.isComposing) return;
		const field = (e.target as HTMLElement).dataset.field;
		if (e.key === 'Escape') {
			e.preventDefault();
			cancel();
		} else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			save(true);
		} else if (e.key === 'Enter' && field === 'title' && !e.shiftKey) {
			e.preventDefault();
			save(true);
		}
	}

	/** Leaving the writing area saves (or closes it when empty). */
	function leaving(e: FocusEvent, save: () => void) {
		const to = e.relatedTarget as Node | null;
		if (!(e.currentTarget as HTMLElement).contains(to)) save();
	}

	const focusOnMount = (node: HTMLElement) => node.focus();
	const keepFocus = (e: PointerEvent) => e.preventDefault();

	const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ripple-ring';
	const TINT: Record<NoteColor, string> = {
		plain: 'bg-ripple-surface border-ripple-border',
		yellow: 'bg-ripple-warning/12 border-ripple-warning/30',
		blue: 'bg-ripple-info/10 border-ripple-info/30',
		green: 'bg-ripple-success/10 border-ripple-success/30',
		pink: 'bg-ripple-error/8 border-ripple-error/25'
	};
	const DOT: Record<NoteColor, string> = {
		plain: 'bg-ripple-surface',
		yellow: 'bg-ripple-warning',
		blue: 'bg-ripple-info',
		green: 'bg-ripple-success',
		pink: 'bg-ripple-error'
	};
	const colorName = (c: NoteColor) => c[0].toUpperCase() + c.slice(1);
	const chip = 'inline-flex h-7 items-center rounded-full px-2.5 text-footnote transition-colors duration-150 motion-reduce:transition-none';
	const tagSpan = 'rounded-full bg-ripple-surface-foreground/[0.06] px-2 py-0.5 text-caption-1 text-ripple-muted-foreground';
</script>

{#snippet fields(d: Draft, save: (keep: boolean) => void, cancel: () => void, titleLabel: string, open: boolean, composer = false)}
	{@const live = parseTags(`${d.title} ${d.text}`).tags}
	<input
		class="w-full bg-transparent text-body-emph outline-none placeholder:font-normal placeholder:text-ripple-muted-foreground"
		data-field="title"
		aria-label={titleLabel}
		placeholder={composer ? prompt : 'Title'}
		maxlength={160}
		value={d.title}
		oninput={(e) => (d.title = e.currentTarget.value)}
		onkeydown={(e) => editorKeys(e, save, cancel)}
		{@attach (node) => {
			if (composer) titleEl = node;
			else node.focus();
		}}
	/>
	{#if open}
	<textarea
		class="notes-grow mt-1 max-h-72 min-h-12 w-full resize-none bg-transparent text-callout leading-relaxed outline-none placeholder:text-ripple-muted-foreground"
		data-field="text"
		aria-label="Note"
		placeholder="Add details. Type #tag to tag it."
		maxlength={2400}
		value={d.text}
		oninput={(e) => (d.text = e.currentTarget.value)}
		onkeydown={(e) => editorKeys(e, save, cancel)}
	></textarea>
	<div class="mt-2 flex flex-wrap items-center gap-1.5" data-slot="editor-foot">
		{#each live as t (t)}<span class="rounded-full bg-ripple-accent/12 px-2 py-0.5 text-caption-1 font-medium text-ripple-accent">#{t}</span>{/each}
		{#each suggestions.filter((t) => !live.includes(t)).slice(0, 4) as t (t)}
			<button
				type="button"
				class={['rounded-full border border-dashed border-ripple-border px-2 py-0.5 text-caption-1 text-ripple-muted-foreground hover:bg-ripple-muted', focusRing]}
				aria-label="Add tag {t}"
				onpointerdown={keepFocus}
				onclick={() => (d.text = `${d.text.trimEnd()}${d.text.trim() ? ' ' : ''}#${t}`)}>+ #{t}</button
			>
		{/each}
		<span class="ml-auto flex items-center gap-1.5" role="group" aria-label="Colour">
			{#each NOTE_COLORS as c (c)}
				<button
					type="button"
					class={['size-4 rounded-full border border-ripple-border', DOT[c], d.color === c && 'ring-2 ring-ripple-accent ring-offset-1 ring-offset-ripple-surface', focusRing]}
					aria-label={colorName(c)}
					aria-pressed={d.color === c}
					onpointerdown={keepFocus}
					onclick={() => (d.color = c)}
				></button>
			{/each}
			<button type="button" class={['ml-1 rounded-md px-2 py-1 text-footnote font-medium text-ripple-accent hover:bg-ripple-muted', focusRing]} onpointerdown={keepFocus} onclick={() => save(false)}>Done</button>
		</span>
	</div>
	{/if}
{/snippet}

<div {id} bind:this={root} class={['@container text-ripple-surface-foreground', className]} style={rootStyle} data-widget="notes">
	<div class="flex flex-col gap-3">
		{#if heading}<h2 class="text-title-3 font-semibold text-pretty">{heading}</h2>{/if}

		{#if full}
			<p class="rounded-ripple border border-dashed border-ripple-border px-3 py-2.5 text-callout text-ripple-muted-foreground" data-slot="full">
				This pad holds {MAX_NOTES} notes. Delete one to write another.
			</p>
		{:else}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class={[
					'rounded-ripple border px-3.5 shadow-sm transition-shadow duration-150 focus-within:shadow-md focus-within:ring-2 focus-within:ring-ripple-ring/40 motion-reduce:transition-none',
					composerOpen ? 'border-ripple-border py-3' : 'border-ripple-border/70 py-0',
					TINT[draft.color].split(' ')[0]
				]}
				data-slot="composer"
				data-open={composerOpen || undefined}
				onfocusin={() => (writing = true)}
				onfocusout={(e) => leaving(e, () => saveDraft(false))}
			>
				<div class={['flex gap-2', !composerOpen && 'h-11 items-center']}>
					{#if !composerOpen}<Plus size={16} strokeWidth={2} aria-hidden="true" class="shrink-0 text-ripple-muted-foreground" />{/if}
					<div class="min-w-0 flex-1">
						{@render fields(draft, saveDraft, cancelDraft, 'New note', composerOpen, true)}
					</div>
				</div>
			</div>
		{/if}

		{#if tagList.length || searching}
			<div class="flex flex-wrap items-center gap-1.5" data-slot="filters">
				{#if tagList.length}
					<div class="flex flex-wrap gap-1.5" role="group" aria-label="Filter by tag">
						{#each ['', ...tagList] as t (t)}
							<button
								type="button"
								class={[chip, focusRing, activeTag === t ? 'bg-ripple-surface-foreground text-ripple-surface' : 'bg-ripple-muted text-ripple-muted-foreground hover:text-ripple-surface-foreground']}
								aria-pressed={activeTag === t}
								onclick={() => (picked = t)}>{t ? `#${t}` : 'All'}</button
							>
						{/each}
					</div>
				{/if}
				{#if searching}
					<label class="ml-auto flex h-8 min-w-40 flex-1 items-center gap-1.5 rounded-full bg-ripple-muted px-3 text-ripple-muted-foreground focus-within:ring-2 focus-within:ring-ripple-ring/40 @min-[560px]:max-w-56">
						<Search size={14} strokeWidth={2} aria-hidden="true" class="shrink-0" />
						<input type="search" class="w-full bg-transparent text-footnote text-ripple-surface-foreground outline-none" placeholder="Search notes" aria-label="Search notes" bind:value={query} />
					</label>
				{/if}
			</div>
		{/if}

		{#if shown.length}
			<ul class="grid grid-cols-1 items-start gap-2.5 @min-[400px]:grid-cols-2 @min-[720px]:grid-cols-3" aria-label="Notes" data-slot="notes">
				{#each shown as n (n.id)}
					<li class={['notes-card relative rounded-ripple border shadow-xs transition-shadow duration-150 hover:shadow-md motion-reduce:transition-none', editing === n.id ? TINT[editDraft.color] : TINT[n.color]]} data-note={n.id} data-pinned={n.pinned || undefined}>
						{#if editing === n.id}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div class="p-3" data-slot="editor" onfocusout={(e) => leaving(e, () => saveEdit())}>
								{@render fields(editDraft, saveEdit, cancelEdit, `Edit ${label(n)}`, true)}
							</div>
						{:else}
							<div class="flex flex-col gap-1.5 p-3">
								<h3 class={['pr-14 text-body-emph break-words', !n.title && 'sr-only']}>
									<button type="button" class={['text-left after:absolute after:inset-0 after:rounded-ripple after:content-[\'\']', 'focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-ripple-ring']} data-slot="open" aria-label={n.title ? undefined : `Edit ${label(n)}`} onclick={() => startEdit(n)}>
										{n.title || 'Edit note'}
									</button>
								</h3>
								{#if n.text}
									<p class={['notes-clamp text-callout leading-relaxed whitespace-pre-line text-ripple-surface-foreground/80 break-words', !n.title && 'pr-12']} data-slot="text">{n.text}</p>
								{/if}
								{#if n.tags.length || n.at}
									<div class="mt-0.5 flex flex-wrap items-center gap-1">
										{#each n.tags as t (t)}<span class={tagSpan}>#{t}</span>{/each}
										{#if n.at && now}<span class="ml-auto text-caption-2 text-ripple-muted-foreground" data-slot="time">{ago(n.at, now)}</span>{/if}
									</div>
								{/if}
							</div>
							<div class="notes-actions absolute top-1.5 right-1.5 z-10 flex gap-0.5" data-on={n.pinned || undefined}>
								<button
									type="button"
									class={['notes-pin grid size-7 place-items-center rounded-md hover:bg-ripple-surface-foreground/[0.08]', n.pinned ? 'text-ripple-accent' : 'text-ripple-muted-foreground', focusRing]}
									aria-label="{n.pinned ? 'Unpin' : 'Pin'} {label(n)}"
									aria-pressed={n.pinned}
									onclick={() => togglePin(n)}
								>
									{#if n.pinned}<Pin size={14} strokeWidth={2} fill="currentColor" aria-hidden="true" />{:else}<Pin size={14} strokeWidth={1.75} aria-hidden="true" />{/if}
								</button>
								<button
									type="button"
									class={['notes-del grid size-7 place-items-center rounded-md text-ripple-muted-foreground hover:bg-ripple-surface-foreground/[0.08] hover:text-ripple-error-text', focusRing]}
									aria-label="Delete {label(n)}"
									onclick={() => remove(n)}
								>
									<Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
								</button>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{:else if current.notes.length}
			<p class="px-1 py-2 text-callout text-ripple-muted-foreground">No notes match{activeTag ? ` #${activeTag}` : ''}{query.trim() && searching ? ` "${query.trim()}"` : ''}.</p>
		{:else}
			<p class="px-1 text-callout text-ripple-muted-foreground" data-slot="empty">A blank page. Write the first thing on your mind.</p>
		{/if}

		{#if undo}
			<div class="flex items-center gap-3 self-center rounded-full bg-ripple-surface-foreground py-1 pr-1 pl-4 text-footnote text-ripple-surface shadow-md" role="status" data-slot="undo">
				<span>Note deleted</span>
				<button type="button" class={['rounded-full px-3 py-1 font-semibold hover:bg-ripple-surface/15', focusRing]} onclick={restore}>Undo</button>
			</div>
		{/if}

		<p class="sr-only" aria-live="polite">{announce}</p>
	</div>
</div>

<style>
	.notes-grow {
		field-sizing: content;
	}
	.notes-clamp {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		overflow: hidden;
	}
	.notes-actions .notes-del,
	.notes-actions:not([data-on]) .notes-pin {
		opacity: 0;
		transition: opacity 150ms;
	}
	:global(.notes-card:hover) .notes-actions button,
	.notes-actions:focus-within button {
		opacity: 1;
	}
	@media (hover: none) {
		.notes-actions button {
			opacity: 1 !important;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.notes-actions button {
			transition: none;
		}
	}
</style>
