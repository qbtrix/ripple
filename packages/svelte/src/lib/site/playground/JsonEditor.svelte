<!--
  @file lib/site/playground/JsonEditor.svelte
  @description The playground's JSON editor: CodeMirror with JSON syntax,
    line numbers, bracket matching and folding (basicSetup), coloured with
    the site's code tokens (--code-key, --code-str, --code-lit, --code-punct)
    so it reads like the read-only pane in light and dark. CodeMirror is
    imported on mount, as in widgets/input/CodeEditor.svelte, so it stays out
    of /playground's first load; until it arrives the box says it is loading.
    `value` is read once at mount; every change goes to `onchange`. `invalid`
    and `describedby` reach the editable element for assistive tech.
-->
<script lang="ts">
	import { onMount, untrack } from 'svelte';

	let {
		value,
		onchange,
		invalid = false,
		describedby
	}: { value: string; onchange: (text: string) => void; invalid?: boolean; describedby?: string } = $props();

	let host = $state<HTMLDivElement>();
	let ready = $state(false);
	let view: { destroy(): void; focus(): void; dispatch(spec: unknown): void } | null = null;
	let ariaCompartment: { reconfigure(ext: unknown): unknown } | null = null;
	let ariaOf: ((attrs: Record<string, string>) => unknown) | null = null;

	const aria = (bad: boolean, by: string | undefined): Record<string, string> => ({
		'aria-label': 'Edit the JSON spec',
		'aria-multiline': 'true',
		...(bad ? { 'aria-invalid': 'true' } : {}),
		...(by ? { 'aria-describedby': by } : {})
	});

	onMount(() => {
		let cancelled = false;
		(async () => {
			const [{ EditorView, basicSetup }, { EditorState, Compartment }, { json }, { HighlightStyle, syntaxHighlighting }, { tags: t }] =
				await Promise.all([
					import('codemirror'),
					import('@codemirror/state'),
					import('@codemirror/lang-json'),
					import('@codemirror/language'),
					import('@lezer/highlight')
				]);
			if (cancelled || !host) return;

			const tokens = HighlightStyle.define([
				{ tag: t.propertyName, color: 'var(--code-key)', fontWeight: '550' },
				{ tag: t.string, color: 'var(--code-str)' },
				{ tag: [t.number, t.bool, t.null], color: 'var(--code-lit)', fontStyle: 'italic' },
				{ tag: [t.separator, t.brace, t.squareBracket, t.punctuation], color: 'var(--code-punct)' }
			]);
			const tint = (pct: number) => `color-mix(in oklch, var(--primary) ${pct}%, transparent)`;
			const theme = EditorView.theme({
				'&': { height: '100%', fontSize: '12.5px', color: 'var(--code-ink)', backgroundColor: 'transparent' },
				'&.cm-focused': { outline: 'none' },
				'.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6', overscrollBehavior: 'contain' },
				'.cm-content': { padding: '12px 0 24px', caretColor: 'var(--primary)' },
				'.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--primary)', borderLeftWidth: '2px' },
				'.cm-gutters': { backgroundColor: 'transparent', color: 'var(--site-soft)', border: 'none' },
				'.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 14px', fontVariantNumeric: 'tabular-nums' },
				'.cm-activeLine, .cm-activeLineGutter': { backgroundColor: tint(6) },
				'.cm-matchingBracket, &.cm-focused .cm-matchingBracket': { backgroundColor: tint(20), color: 'inherit' },
				'.cm-nonmatchingBracket, &.cm-focused .cm-nonmatchingBracket': { backgroundColor: 'color-mix(in oklch, var(--destructive) 25%, transparent)' },
				'.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': { backgroundColor: tint(22) },
				'.cm-foldPlaceholder': { backgroundColor: 'transparent', border: '1px solid var(--site-line)', color: 'var(--site-soft)' },
				'.cm-tooltip': { backgroundColor: 'var(--site-ground)', border: '1px solid var(--site-line)', color: 'var(--site-ink)' }
			});

			const ariaSlot = new Compartment();
			ariaCompartment = ariaSlot;
			ariaOf = (attrs) => EditorView.contentAttributes.of(attrs);
			const cm = new EditorView({
				parent: host,
				state: EditorState.create({
					doc: untrack(() => value),
					extensions: [
						basicSetup,
						json(),
						syntaxHighlighting(tokens),
						theme,
						EditorView.lineWrapping,
						ariaSlot.of(EditorView.contentAttributes.of(untrack(() => aria(invalid, describedby)))),
						EditorView.updateListener.of((u) => {
							if (u.docChanged) onchange(u.state.doc.toString());
						})
					]
				})
			});
			view = cm;
			ready = true;
			cm.focus();
		})();
		return () => {
			cancelled = true;
			view?.destroy();
			view = null;
		};
	});

	$effect(() => {
		const attrs = aria(invalid, describedby);
		if (ready && view && ariaCompartment && ariaOf) view.dispatch({ effects: ariaCompartment.reconfigure(ariaOf(attrs)) });
	});
</script>

<div class="editor" bind:this={host} data-ready={ready || undefined}>
	{#if !ready}<p class="loading">Loading the editor…</p>{/if}
</div>

<style>
	.editor {
		flex: 1;
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.editor > :global(.cm-editor) {
		flex: 1;
		min-height: 0;
	}
	.loading {
		margin: 0;
		padding: 16px 14px;
		font-size: 13px;
		color: var(--site-soft);
	}
</style>
