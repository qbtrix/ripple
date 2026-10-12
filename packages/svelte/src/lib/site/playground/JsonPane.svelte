<!--
  @file lib/site/playground/JsonPane.svelte
  @description The playground's JSON spec pane for one version. The text is
    JsonLines with its `highlight` token colours (prefix-stable: a finished
    line is tokenised once) and its `caret` while streaming, line numbers from
    a CSS counter (never copied), and a short tint on each newly arrived
    line. It follows the tail through Tail: scroll up and it stops, and a Live
    button brings it back. The header says size, line count and status; Copy
    takes the whole spec, Share copies a ?s= link (shareLink in
    lib/site/specFromUrl, which reads it back) once the spec is final.
    `onedit` adds Edit (also exported as edit()): the text becomes a textarea seeded with the shown
    spec (or `seed` when nothing is shown, which renders at once), and every
    input goes to onedit, which renders it and returns why not when it is not
    a spec; that reason shows under the box and the last good render stays.
    Editing ends on Done, or when the pane moves to a version that is not the
    visitor's own (OWN), such as a new answer. `onhide` adds a Hide button
    (the column collapses); `sheet` drops the outer border for the phone
    bottom sheet.
-->
<script lang="ts">
	import JsonLines from '../JsonLines.svelte';
	import { prettyPrefix } from '../prettyPrefix.js';
	import { shareLink } from '../specFromUrl.js';
	import { Tail } from './tail.svelte.js';
	import { byteLength, formatBytes, OWN, type Version } from './versions.svelte.js';

	let {
		version,
		onhide,
		onedit,
		seed = '',
		sheet = false
	}: {
		version: Version | null;
		onhide?: () => void;
		/** Renders the edited text; returns why it is not a spec, or null. */
		onedit?: (text: string) => string | null;
		/** What Edit starts from when no version is shown. */
		seed?: string;
		sheet?: boolean;
	} = $props();

	const uid = $props.id();
	let editing = $state(false);
	let draft = $state('');
	let editError = $state<string | null>(null);

	const tail = new Tail();
	let pre = $state<HTMLPreElement>();
	let flash = $state<{ what: string; ok: boolean } | null>(null);
	let flashTimer: ReturnType<typeof setTimeout> | undefined;

	const text = $derived(editing ? draft : (version?.text ?? ''));
	const pretty = $derived(prettyPrefix(text));
	const lineCount = $derived(text ? pretty.split('\n').length : 0);
	const streaming = $derived(version?.status === 'streaming');
	const status = $derived(
		!version ? '' : version.status === 'streaming' ? 'Streaming' : version.status === 'final' ? 'Complete' : 'Left out'
	);

	// A new version starts followed; every text change sticks to the tail if still following.
	let shownId: string | undefined;
	$effect(() => {
		const id = version?.id;
		void text;
		if (!pre) return;
		if (id !== shownId) {
			shownId = id;
			tail.reset();
			pre.scrollTop = 0;
		}
		if (streaming) tail.stick(pre);
	});

	// Moving to anything but the visitor's own spec (a new answer, a chip) ends editing.
	let editedId: string | undefined;
	$effect.pre(() => {
		const id = version?.id;
		if (id === editedId) return;
		editedId = id;
		if (id !== OWN) editing = false;
	});

	/** Opens the editor (the page's "Paste a spec" calls it too). */
	export function edit() {
		draft = version?.spec ? JSON.stringify(version.spec, null, 2) : version?.text || seed;
		editError = null;
		editedId = version?.id;
		editing = true;
		if (!version && draft) editError = onedit?.(draft) ?? null;
	}

	function input(e: Event & { currentTarget: HTMLTextAreaElement }) {
		draft = e.currentTarget.value;
		editError = onedit?.(draft) ?? null;
	}

	function say(what: string, ok = true) {
		clearTimeout(flashTimer);
		flash = { what, ok };
		flashTimer = setTimeout(() => (flash = null), 1800);
	}

	async function copy() {
		if (!text) return;
		try {
			await navigator.clipboard.writeText(editing ? draft : version?.spec ? JSON.stringify(version.spec, null, 2) : pretty);
			say('Copied');
		} catch {
			say('Copy blocked', false);
		}
	}

	async function share() {
		if (!version?.spec) return;
		const link = shareLink(version.spec, location.href);
		if (!link) return say('Too large for a link', false);
		try {
			await navigator.clipboard.writeText(link);
			say('Link copied');
		} catch {
			say('Copy blocked', false);
		}
	}
</script>

<section class="pane" data-sheet={sheet || undefined} aria-label="JSON spec">
	<header class="head">
		<h2 class="title" data-streaming={streaming || undefined}>JSON spec{#if status}<span class="sr-only">, {status}</span>{/if}</h2>
		{#if version}
			<span class="meta" title={status}>{formatBytes(byteLength(text))} · {lineCount} lines</span>
		{/if}
		<span class="tools">
			{#if flash}<span class="flash" data-ok={flash.ok} role="status">{flash.what}</span>{/if}
			{#if onedit}
				{#if editing}
					<button type="button" class="tool" onclick={() => (editing = false)}>Done</button>
				{:else}
					<button type="button" class="tool" disabled={streaming} title="Edit or paste a spec and see it render" onclick={edit}>Edit</button>
				{/if}
			{/if}
			<button type="button" class="tool" disabled={!text} onclick={copy}>Copy</button>
			<button type="button" class="tool" disabled={!version?.spec} title="Copy a link that opens this spec" onclick={share}>Share</button>
			{#if onhide}
				<button type="button" class="tool" title="Hide the JSON (Ctrl+J)" onclick={onhide}>Hide</button>
			{/if}
		</span>
	</header>
	<div class="body">
		{#if editing}
			<textarea
				class="code edit"
				aria-label="Edit the JSON spec"
				aria-invalid={editError ? true : undefined}
				aria-describedby={editError ? `${uid}-error` : undefined}
				placeholder="Paste a Ripple spec"
				spellcheck="false"
				autocomplete="off"
				value={draft}
				oninput={input}
			></textarea>
			{#if editError}<p class="edit-error" id="{uid}-error">{editError} The preview keeps the last spec that worked.</p>{/if}
		{:else if version && text}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (a scrolling region must be reachable by keyboard) -->
			<pre
				class="code"
				data-streaming={streaming || undefined}
				tabindex="0"
				aria-label="JSON spec text"
				bind:this={pre}
				onscroll={() => pre && tail.onScroll(pre)}><JsonLines {text} highlight caret={streaming} /></pre>
			{#if streaming && !tail.following}
				<button type="button" class="live" onclick={() => pre && tail.resume(pre)}>
					<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 3v9m-4-4 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
					Live
				</button>
			{/if}
		{:else}
			<p class="empty">{version ? 'Waiting for the first bytes.' : 'The spec appears here as it streams, line by line.'}</p>
		{/if}
	</div>
</section>

<style>
	.pane {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		height: 100%;
		background: var(--code-bg);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		padding: 0 6px 0 14px;
		border-bottom: 1px solid var(--site-line);
		font-size: 12.5px;
		color: var(--site-soft);
		white-space: nowrap;
	}
	.title {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
		color: var(--site-ink);
	}
	.meta {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.title {
		display: inline-flex;
		align-items: center;
		gap: 7px;
	}
	.title[data-streaming]::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--primary);
		animation: pulse 1.4s ease-in-out infinite;
	}
	.tools {
		display: flex;
		align-items: center;
		gap: 2px;
		margin-left: auto;
	}
	.flash {
		margin-right: 6px;
		color: var(--site-ink);
	}
	.flash[data-ok='false'] {
		color: var(--site-soft);
	}
	.tool {
		min-height: 32px;
		padding: 0 10px;
		border: 0;
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--site-soft);
		font: inherit;
		font-size: 12.5px;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s;
	}
	.tool:hover:not(:disabled) {
		background: var(--site-hover);
		color: var(--site-ink);
	}
	.tool:disabled {
		cursor: default;
		color: var(--site-soft);
		background: none;
	}
	.tool:focus-visible,
	.live:focus-visible,
	.code:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: -2px;
	}
	.body {
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
	}
	.code {
		flex: 1;
		min-width: 0;
		margin: 0;
		padding: 12px 14px 24px 52px;
		overflow: auto;
		overscroll-behavior: contain;
		font-family: var(--font-mono);
		font-size: 12.5px;
		line-height: 1.6;
		color: var(--code-ink);
		counter-reset: ln;
	}
	/* Line numbers: a counter in a pseudo-element, so selecting the code never copies them. */
	.code :global(.ln) {
		position: relative;
		counter-increment: ln;
	}
	.code :global(.ln)::before {
		content: counter(ln);
		position: absolute;
		left: -46px;
		width: 30px;
		text-align: right;
		text-indent: 0;
		color: var(--site-soft);
		font-variant-numeric: tabular-nums;
		user-select: none;
	}
	/* JsonLines' caret, after the last token while the spec streams. */
	.code :global(.json-caret) {
		display: inline-block;
		width: 7px;
		height: 1.15em;
		margin-left: 1px;
		vertical-align: -0.2em;
		background: var(--primary);
		animation: blink 1s steps(1) infinite;
	}
	/* New lines arrive with a short tint; unchanged lines are reused, so only they animate. */
	.code[data-streaming] :global(.ln) {
		animation: arrive 450ms var(--ease-out-quart);
	}
	.edit {
		resize: none;
		border: 0;
		border-radius: 0;
		padding-left: 14px;
		background: transparent;
	}
	.body:has(.edit) {
		flex-direction: column;
	}
	.edit-error {
		margin: 0;
		padding: 8px 14px;
		border-top: 1px solid color-mix(in oklch, var(--destructive) 45%, transparent);
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--site-ink);
		overflow-wrap: anywhere;
	}
	.live {
		position: absolute;
		right: 14px;
		bottom: 12px;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 32px;
		padding: 0 12px;
		border: 1px solid var(--site-line);
		border-radius: var(--radius-control);
		background: var(--site-ground);
		color: var(--primary-ink);
		font: inherit;
		font-size: 12.5px;
		font-weight: 600;
		box-shadow: var(--shadow-card);
		cursor: pointer;
	}
	.empty {
		margin: 0;
		padding: 16px 14px;
		font-size: 13px;
		color: var(--site-soft);
	}
	@keyframes arrive {
		from {
			background: color-mix(in oklch, var(--primary) 8%, transparent);
		}
	}
	@keyframes pulse {
		50% {
			opacity: 0.35;
		}
	}
	@keyframes blink {
		50% {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.code[data-streaming] :global(.ln),
		.code :global(.json-caret),
		.title[data-streaming]::before {
			animation: none;
		}
	}
</style>
