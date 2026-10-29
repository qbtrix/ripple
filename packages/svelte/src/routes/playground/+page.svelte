<!--
  @file routes/playground/+page.svelte
  @description /playground: ask for a tool, watch its spec stream into a UI,
    then edit the JSON and watch the UI follow. The chat is the landing's
    (pawbar/Chat.svelte, ChatSession, the recorded answer pool minus the store
    demo, the card policy). Default build: every answer is a recording replayed
    locally at 1.5 times its recorded pace, typed text included, and the page says so;
    no model is called and nothing is fetched. PUBLIC_PAWBAR_LIVE=1 (with the
    endpoint, widget id and site key) switches to the Paw Bar API with the
    recordings as the fallback; typed text then follows the landing's rule
    (Paw OS unless typedStaysLocal). No store host here: a live card's
    checkout or booking is only recorded.
    Layout: 1280 and up, chat | preview | JSON in three columns with drag
    grips; 1024 to 1279, chat | preview over JSON; under 1024 one column
    where the card renders inline in the chat and its JSON opens as a bottom
    sheet (a native <dialog>). The chat fills the screen under the site bar
    and scrolls itself; the welcome sits in its `top` snippet (two prompts
    under 1024, so its actions stay above the composer). The column title is
    the page's h1, as the welcome goes after the first turn. From 1024 every
    card is a chip in the thread and the chip picks which version the panes
    show (versions.svelte.ts).
    The visitor's own spec is one version (OWN): a ?spec= / ?s= link
    (lib/site/specFromUrl.ts, read in onMount since the page is prerendered)
    opens as "Shared spec", and an edit in the JSON pane (or "Paste or edit a
    spec", which starts from EXAMPLE) renders as "Your spec" on every valid
    keystroke. It is rendered as given, not through the chat's card policy; a
    bad link says why and leaves the page empty.
    Keys (keys.ts): Esc stops, / focuses the composer, Ctrl/Cmd+B hides the
    chat, Ctrl/Cmd+J toggles the JSON; Ctrl/Cmd+K stays docs search.
-->
<script lang="ts">
	import SeoHead from '$lib/site/SeoHead.svelte';
	import { onMount, tick } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import type { RippleEvent, TerminalResult } from '$lib/index.js';
	import { parseSpec, specFromUrl } from '$lib/site/specFromUrl.js';
	import JsonPane from '$lib/site/playground/JsonPane.svelte';
	import PreviewPane from '$lib/site/playground/PreviewPane.svelte';
	import { shortcut } from '$lib/site/playground/keys.js';
	import {
		byteLength,
		currentVersion,
		OWN,
		ownVersion,
		ReplayVersion,
		versionsOf,
		type Pick,
		type Version
	} from '$lib/site/playground/versions.svelte.js';
	import Chat from '../pawbar/Chat.svelte';
	import { Card, ChatSession, pawbarTransport, pawosBase, typedStaysLocal, type Transport } from '../pawbar/session.svelte.js';
	import { answerPool, cardChunks, findScenario, pickScenario, recordedEvents } from '../pawbar/recorded.js';
	import { replay } from '../live/replay.js';
	import type { Scenario } from '../live/scenarios.js';

	// Opt-in: vite.config.ts defines these only when PUBLIC_PAWBAR_LIVE=1.
	const ENDPOINT: string = import.meta.env.PUBLIC_PAWBAR_ENDPOINT ?? '';
	const WIDGET_ID: string = import.meta.env.PUBLIC_PAWBAR_WIDGET_ID ?? '';
	const SITE_KEY: string = import.meta.env.PUBLIC_PAWBAR_SITE_KEY ?? '';
	const LIVE = import.meta.env.PUBLIC_PAWBAR_LIVE === '1' && Boolean(ENDPOINT && WIDGET_ID && SITE_KEY);
	const PAWOS_URL = pawosBase(import.meta.env.PUBLIC_PAWOS_URL ?? '');
	const TYPED_LOCAL = !LIVE || typedStaysLocal(ENDPOINT, import.meta.env.PUBLIC_TYPED_LOCAL ?? '');

	const EXAMPLE = JSON.stringify(
		{
			version: '1.0',
			state: { username: 'there' },
			ui: {
				type: 'flex',
				props: { direction: 'column', gap: '16px' },
				children: [
					{ type: 'heading', props: { text: 'Hello, Ripple!', level: 2 } },
					{ type: 'text', props: { text: 'Edit this JSON and the UI follows as you type.', size: 'sm' } },
					{
						type: 'grid',
						props: { columns: 3, gap: 3 },
						children: [
							{ type: 'stat', props: { label: 'Revenue', value: 12450, format: 'currency', deltaPercent: 3.4, direction: 'up-good' } },
							{ type: 'stat', props: { label: 'Signups', value: 247, deltaPercent: 18.2, direction: 'up-good' } },
							{ type: 'stat', props: { label: 'Churn', value: 0.034, format: 'percent', deltaPercent: -0.8, direction: 'down-good' } }
						]
					},
					{ type: 'input', bind: '{state.username}', props: { label: 'Your name', placeholder: 'Type something' } },
					{ type: 'text', props: { text: 'Hello, {state.username}!', size: 'sm' } },
					{ type: 'button', props: { label: 'Click me', variant: 'default' }, on_click: [{ action: 'toast', message: 'Hello from Ripple!' }] }
				]
			}
		},
		null,
		2
	);

	// The recorded order demo checks out with an `api` action, which the card policy refuses.
	const pool = answerPool.filter((s) => !s.needsStore);
	const intro = (message: string) =>
		findScenario(message, pool)
			? 'This is a recorded answer to a request like yours, played back a little faster than it was recorded.'
			: 'Nothing recorded matches that yet, so this plays the recorded bill splitter.';
	const recorded =
		(fixed?: string): Transport =>
		(message, signal) =>
			recordedEvents(pickScenario(message, pool), { speed: 1.5, signal, intro: fixed ?? intro(message) });
	const session = LIVE
		? new ChatSession(pawbarTransport({ endpoint: ENDPOINT, widgetId: WIDGET_ID, siteKey: SITE_KEY }).send, recorded('Here is a saved answer that fits.'))
		: new ChatSession(recorded());

	const wide = new MediaQuery('min-width: 1024px', false);
	const three = new MediaQuery('min-width: 1280px', false);

	let chat = $state<{ ask: (text: string) => Promise<void>; focus: () => void }>();
	let jsonPane = $state<{ edit: () => void }>();
	let sheetPane = $state<{ edit: () => void }>();
	let pick = $state<Pick>(null);
	let own = $state.raw<Version | null>(null);
	let urlError = $state<string | null>(null);
	let showChat = $state(true);
	let showJson = $state(true);
	let morePrompts = $state(false);
	/** Null until dragged: 400 from 1280, 360 below (CSS). */
	let chatW = $state<number | null>(null);
	let jsonW = $state(440);
	let jsonH = $state<number | null>(null);
	let sheet = $state<HTMLDialogElement>();
	let sheetOpen = $state(false);
	let sheetVersion = $state.raw<Version | null>(null);
	let work = $state<HTMLElement>();

	const versions = $derived<Version[]>([...(own ? [own] : []), ...versionsOf(session.turns)]);
	const current = $derived(currentVersion(versions, pick));

	// Replay in the preview: a fresh stream of the shown version, its own Version.
	let replaying = $state.raw<{ of: string; version: ReplayVersion; abort: AbortController } | null>(null);
	const shown = $derived(replaying && replaying.of === current?.id ? replaying.version : current);

	const scenarioOf = (v: Version | null): Scenario | undefined => (v && v.id !== OWN ? pool.find((s) => s.title === v.title) : undefined);
	const total = $derived.by(() => {
		const s = !LIVE || shown instanceof ReplayVersion ? scenarioOf(shown) : undefined;
		if (!s) return null;
		return byteLength(cardChunks(s.fixture).map((c) => c.text).join(''));
	});

	function stopReplay() {
		replaying?.abort.abort();
		replaying = null;
	}

	function startReplay() {
		const v = current;
		if (!v?.spec) return;
		replaying?.abort.abort();
		const abort = new AbortController();
		const s = scenarioOf(v);
		// A recording replays the chunks the chat streamed (same size and lines); anything else in even slices.
		const text = JSON.stringify(v.spec);
		const chunks = s
			? cardChunks(s.fixture)
			: Array.from({ length: Math.ceil(text.length / 64) }, (_, i) => ({ t: i * 30, text: text.slice(i * 64, i * 64 + 64) }));
		const fixture = { id: v.id, title: v.title, prompt: '', model: '', recordedAt: '', chunks };
		replaying = { of: v.id, version: new ReplayVersion(v, replay(fixture, { speed: 1.5, signal: abort.signal }), abort.signal), abort };
	}

	function pickVersion(id: string) {
		stopReplay();
		pick = { id, count: versions.length };
	}

	/** The JSON pane's editor: a valid spec becomes the visitor's own version and takes the panes. */
	function edit(text: string): string | null {
		const r = parseSpec(text);
		if ('error' in r) return `This is ${r.error}`;
		stopReplay();
		own = ownVersion(r.spec, text, 'Your spec');
		pick = { id: OWN, count: versionsOf(session.turns).length + 1 };
		return null;
	}

	function hostEvent(v: Version, e: RippleEvent) {
		if (v instanceof Card) session.hostEvent(v, e);
	}

	function complete(v: Version, r: TerminalResult) {
		if (v instanceof Card) session.flowComplete(v, r);
	}

	function openSheet(v: Version | null) {
		sheetVersion = v;
		sheetOpen = true;
		sheet?.showModal();
	}

	async function pasteSpec() {
		if (wide.current) {
			showJson = true;
			await tick();
			jsonPane?.edit();
		} else {
			openSheet(own);
			await tick();
			sheetPane?.edit();
		}
	}

	async function onkey(e: KeyboardEvent) {
		const s = shortcut(e);
		if (!s || sheet?.open) return;
		if (s === 'stop') {
			if (session.busy) session.stop();
			else if (replaying?.version.status === 'streaming') stopReplay();
			else return;
		} else if (s === 'focus') {
			e.preventDefault();
			showChat = true;
			await tick();
			chat?.focus();
			return;
		} else if (s === 'chat') {
			if (!wide.current) return;
			showChat = !showChat;
		} else if (s === 'json') {
			if (wide.current) showJson = !showJson;
			else openSheet(current);
		}
		e.preventDefault();
	}

	/** Pointer and arrow-key resizing for a grip; `sign` -1 when dragging toward the start grows the pane. */
	function grip(get: () => number, set: (n: number) => void, min: () => number, max: () => number, axis: 'x' | 'y', sign: 1 | -1) {
		const clamp = (n: number) => Math.round(Math.min(max(), Math.max(min(), n)));
		return {
			onpointerdown(e: PointerEvent) {
				const el = e.currentTarget as HTMLElement;
				const from = axis === 'x' ? e.clientX : e.clientY;
				const start = get();
				el.setPointerCapture(e.pointerId);
				const move = (m: PointerEvent) => set(clamp(start + sign * ((axis === 'x' ? m.clientX : m.clientY) - from)));
				const up = () => {
					el.removeEventListener('pointermove', move);
					el.removeEventListener('pointerup', up);
					el.removeEventListener('pointercancel', up);
				};
				el.addEventListener('pointermove', move);
				el.addEventListener('pointerup', up);
				el.addEventListener('pointercancel', up);
				e.preventDefault();
			},
			onkeydown(e: KeyboardEvent) {
				const back = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
				const fwd = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
				if (e.key !== back && e.key !== fwd) return;
				e.preventDefault();
				set(clamp(get() + sign * (e.key === fwd ? 24 : -24)));
			}
		};
	}

	const chatGrip = grip(() => chatW ?? (three.current ? 400 : 360), (n) => (chatW = n), () => 300, () => 560, 'x', 1);
	const jsonGrip = grip(() => Math.min(jsonW, Math.max(320, (work?.clientWidth ?? 1200) - 480)), (n) => (jsonW = n), () => 320, () => Math.max(320, (work?.clientWidth ?? 1200) - 480), 'x', -1);
	const splitGrip = grip(
		() => jsonH ?? Math.round((work?.clientHeight ?? 600) * 0.4),
		(n) => (jsonH = n),
		() => 120,
		() => Math.max(120, (work?.clientHeight ?? 600) - 200),
		'y',
		-1
	);

	// "Try another": recordings the conversation has not answered with yet.
	const answered = $derived(new Set(versionsOf(session.turns).map((v) => v.title)));
	const tryAnother = $derived(
		session.turns.length
			? pool
					.filter((s) => !answered.has(s.title))
					.slice(0, 3)
					.map((s) => ({ id: s.id, title: s.title, prompt: s.fixture.prompt }))
			: []
	);

	onMount(() => {
		const linked = specFromUrl(location.search);
		if (linked && 'text' in linked) own = ownVersion(JSON.parse(linked.text), linked.text, 'Shared spec');
		else if (linked) urlError = linked.error;
		return () => {
			session.stop();
			replaying?.abort.abort();
		};
	});
</script>

<svelte:window onkeydown={onkey} />

<SeoHead title="Playground: ask for a tool, watch Ripple build it" description="Ask for a small tool and watch its Ripple spec stream into a working UI, with the JSON beside it line by line. Edit the JSON and the UI follows. Answers are recorded model output, replayed in your browser." />

{#snippet paneTools()}
	{#if wide.current && !showChat}
		<button type="button" class="pane-tool" title="Show the chat (Ctrl+B)" onclick={() => (showChat = true)}>Chat</button>
	{/if}
	{#if wide.current && !showJson}
		<button type="button" class="pane-tool" title="Show the JSON (Ctrl+J)" onclick={() => (showJson = true)}>JSON</button>
	{/if}
{/snippet}

{#snippet welcome()}
	<div class="top">
		{#if urlError}<p class="url-error" role="alert">{urlError}</p>{/if}
		{#if own}
			<p class="own-note">
				{own.title === 'Shared spec' ? 'Opened the spec from your link.' : 'Your edited spec.'} It is in the preview{wide.current ? '' : ' below'}, and the chat
				works as usual.
				{#if wide.current && current?.id !== OWN}
					<button type="button" class="more inline" onclick={() => pickVersion(OWN)}>Show it again</button>
				{/if}
			</p>
			{#if !wide.current}
				<div class="inline-preview">
					<PreviewPane version={own} active onevent={hostEvent}>
						{#snippet tools()}<button type="button" class="pane-tool" onclick={() => openSheet(own)}>JSON</button>{/snippet}
					</PreviewPane>
				</div>
			{/if}
		{/if}
		{#if !session.turns.length}
			<div class="welcome">
				<h2>Ask for a tool. Watch it build.</h2>
				<p>
					The answer is a Ripple spec, and the UI renders while the JSON is still arriving. Then edit the JSON and the UI follows. {LIVE
						? 'Answers come from a live model.'
						: 'Every answer here is a recorded model run, replayed in your browser; nothing is sent anywhere.'}
				</p>
				<ul class="prompts" aria-label="Recorded requests" data-all={morePrompts || undefined}>
					{#each morePrompts ? pool : pool.slice(0, 3) as s (s.id)}
						<li>
							<button type="button" class="prompt" disabled={session.busy} onclick={() => chat?.ask(s.fixture.prompt)}>
								<span class="prompt-top"><span class="prompt-title">{s.title}</span><span class="prompt-cat">{s.category}</span></span>
								<span class="prompt-text">{s.fixture.prompt}</span>
							</button>
						</li>
					{/each}
				</ul>
				<p class="welcome-actions">
					<button type="button" class="more" aria-expanded={morePrompts} onclick={() => (morePrompts = !morePrompts)}>
						{morePrompts ? 'Fewer' : `All ${pool.length} recordings`}
					</button>
					<button type="button" class="more" aria-haspopup={wide.current ? undefined : 'dialog'} onclick={pasteSpec}>Paste or edit a spec</button>
				</p>
			</div>
		{/if}
	</div>
{/snippet}

<div
	class="pg"
	data-chat={showChat || undefined}
	data-json={showJson || undefined}
	style:--chat-w={chatW == null ? null : `${chatW}px`}
	style:--json-w="{jsonW}px"
	style:--json-h={jsonH == null ? null : `${jsonH}px`}
>
	<section class="chat-col" aria-label="Chat">
		<header class="col-head">
			<h1 class="col-title">Playground</h1>
			<span class="mode">{LIVE ? 'Live model' : 'Recorded answers'}</span>
			<button type="button" class="pane-tool hide-chat" title="Hide the chat (Ctrl+B)" onclick={() => (showChat = false)}>Hide</button>
		</header>
		<Chat
			bind:this={chat}
			{session}
			suggestions={tryAnother}
			typedLocal={TYPED_LOCAL}
			pawosUrl={PAWOS_URL}
			top={welcome}
			chips={wide.current ? { viewing: current?.id ?? null, pick: (card) => pickVersion(card.id) } : null}
			onspec={wide.current ? undefined : (card) => openSheet(card)}
		/>
	</section>

	<!-- svelte-ignore a11y_no_noninteractive_tabindex (a focusable separator is the ARIA window-splitter pattern) -->
	<div
		class="grip grip-chat"
		role="separator"
		aria-orientation="vertical"
		aria-label="Resize the chat"
		aria-valuenow={chatW ?? (three.current ? 400 : 360)}
		aria-valuemin={300}
		aria-valuemax={560}
		tabindex="0"
		{...chatGrip}
	></div>

	<div class="work" bind:this={work}>
		<div class="preview">
			<PreviewPane version={shown} active={wide.current} {total} onreplay={startReplay} onevent={hostEvent} oncomplete={complete} tools={paneTools} />
		</div>
		{#if three.current}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (window splitter) -->
			<div
				class="grip grip-json"
				role="separator"
				aria-orientation="vertical"
				aria-label="Resize the JSON"
				aria-valuenow={jsonW}
				tabindex="0"
				{...jsonGrip}
			></div>
		{:else}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (window splitter) -->
			<div
				class="grip grip-json"
				role="separator"
				aria-orientation="horizontal"
				aria-label="Resize the JSON"
				aria-valuenow={jsonH ?? undefined}
				tabindex="0"
				{...splitGrip}
			></div>
		{/if}
		<div class="json">
			<JsonPane bind:this={jsonPane} version={shown} onhide={() => (showJson = false)} onedit={edit} seed={EXAMPLE} />
		</div>
	</div>
</div>

<dialog
	class="sheet"
	bind:this={sheet}
	aria-label="JSON spec"
	onclose={() => {
		sheetOpen = false;
		sheetVersion = null;
	}}
>
	<div class="sheet-inner">
		{#if sheetOpen}<JsonPane bind:this={sheetPane} version={sheetVersion} sheet onedit={edit} seed={EXAMPLE} />{/if}
		<form method="dialog" class="sheet-foot"><button class="sheet-close">Close</button></form>
	</div>
</dialog>

<style>
	/* Phones and tablets: one column, the chat filling the screen under the bar. */
	.pg {
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		max-width: 760px;
		height: calc(100dvh - var(--site-topbar) - env(safe-area-inset-top, 0px));
		min-height: 420px;
		margin: 0 auto;
		padding: 8px var(--site-gutter) 12px;
	}
	.chat-col {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		min-width: 0;
	}
	.chat-col :global(.chat) {
		flex: 1;
		min-height: 0;
	}
	.work,
	.grip,
	.col-head .hide-chat {
		display: none;
	}
	.col-head {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 36px;
	}
	.col-title {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
	}
	.mode {
		font-size: 13px;
		color: var(--site-soft);
	}
	.top {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.welcome h2 {
		margin: 8px 0 6px;
		font-size: 28px;
		line-height: 1.15;
		letter-spacing: -0.01em;
		text-wrap: balance;
	}
	.welcome p {
		margin: 0 0 16px;
		max-width: 52ch;
		color: var(--site-soft);
		line-height: 1.55;
	}
	.prompts {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
	}
	.prompt {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 100%;
		min-height: 44px;
		padding: 10px 14px;
		border: 1px solid var(--site-line);
		border-radius: var(--radius-card);
		background: transparent;
		color: var(--site-ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition: background 0.15s;
	}
	.prompt:hover:not(:disabled) {
		background: var(--site-hover);
	}
	.prompt:disabled {
		cursor: default;
		color: var(--site-soft);
	}
	.prompt-top {
		display: flex;
		justify-content: space-between;
		gap: 12px;
	}
	.prompt-title {
		font-size: 14px;
		font-weight: 600;
	}
	.prompt-cat {
		font-size: 12.5px;
		color: var(--site-soft);
	}
	.prompt-text {
		font-size: 13.5px;
		line-height: 1.45;
		color: var(--site-soft);
		overflow-wrap: anywhere;
	}
	.welcome .welcome-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 16px;
		margin: 6px 0 0;
	}
	.more {
		min-height: 44px;
		padding: 0 4px;
		border: 0;
		background: none;
		color: var(--primary-ink);
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
	}
	.more.inline {
		min-height: 0;
		margin: 0 0 0 4px;
		padding: 0;
		font-size: inherit;
	}
	.own-note,
	.url-error {
		margin: 0;
		padding: 10px 14px;
		border: 1px solid var(--site-line);
		border-radius: var(--radius-control);
		font-size: 14px;
		line-height: 1.5;
	}
	.url-error {
		border-color: color-mix(in oklch, var(--destructive) 45%, transparent);
	}
	.inline-preview {
		border: 1px solid var(--site-line);
		border-radius: var(--radius-card);
		overflow: hidden;
	}
	.pane-tool {
		min-height: 32px;
		padding: 0 10px;
		border: 0;
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--site-soft);
		font: inherit;
		font-size: 12.5px;
		cursor: pointer;
	}
	.pane-tool:hover {
		background: var(--site-hover);
		color: var(--site-ink);
	}
	.prompt:focus-visible,
	.more:focus-visible,
	.pane-tool:focus-visible,
	.grip:focus-visible,
	.sheet-close:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	/* From 1024: a fixed-height workspace under the top bar, each column scrolling on its own. */
	@media (min-width: 1024px) {
		.pg {
			display: grid;
			grid-template-columns: minmax(0, 1fr);
			max-width: none;
			height: calc(100dvh - var(--site-topbar));
			margin: 0;
			padding: 0;
			border-bottom: 1px solid var(--site-line);
		}
		.pg[data-chat] {
			grid-template-columns: var(--chat-w, 360px) 0 minmax(0, 1fr);
		}
		.chat-col {
			display: none;
		}
		.pg[data-chat] .chat-col {
			display: flex;
		}
		.chat-col :global(.chat) {
			padding: 16px 16px 12px;
		}
		.col-head {
			min-height: 44px;
			padding: 0 6px 0 16px;
			border-bottom: 1px solid var(--site-line);
		}
		.col-head .hide-chat {
			display: inline-block;
			margin-left: auto;
		}
		.work {
			display: grid;
			grid-template-rows: minmax(0, 1fr);
			min-width: 0;
			min-height: 0;
			border-left: 1px solid var(--site-line);
		}
		.pg[data-chat] .grip-chat {
			display: block;
		}
		.preview,
		.json {
			min-width: 0;
			min-height: 0;
		}
		.json {
			display: none;
		}
		/* 1024 to 1279: the JSON under the preview, both in view while it streams. */
		.pg[data-json] .work {
			grid-template-rows: minmax(0, 1fr) 0 var(--json-h, 40%);
		}
		.pg[data-json] .json {
			display: block;
			border-top: 1px solid var(--site-line);
		}
		.pg[data-json] .grip-json {
			display: block;
		}
	}
	@media (min-width: 1280px) {
		.pg[data-chat] {
			grid-template-columns: var(--chat-w, 400px) 0 minmax(0, 1fr);
		}
		.pg[data-json] .work {
			grid-template-rows: minmax(0, 1fr);
			/* The JSON never takes more than the preview's 480px leaves (1280 with the chat open: 400). */
			grid-template-columns: minmax(480px, 1fr) 0 min(var(--json-w), calc(100% - 480px));
		}
		.pg[data-json] .json {
			border-top: 0;
			border-left: 1px solid var(--site-line);
		}
	}

	/* Grips: zero-width tracks with a wider invisible hit area over the border. */
	.grip {
		position: relative;
		z-index: 2;
		touch-action: none;
	}
	.grip::after {
		content: '';
		position: absolute;
		inset: 0 -4px;
		cursor: col-resize;
	}
	.grip:hover::after,
	.grip:focus-visible::after {
		background: color-mix(in oklch, var(--primary) 35%, transparent);
		inset: 0 -1px;
	}
	.grip[aria-orientation='horizontal']::after {
		inset: -4px 0;
		cursor: row-resize;
	}
	.grip[aria-orientation='horizontal']:hover::after,
	.grip[aria-orientation='horizontal']:focus-visible::after {
		inset: -1px 0;
	}

	/* Phone bottom sheet for a card's JSON. */
	.sheet {
		width: 100%;
		max-width: 760px;
		max-height: min(80dvh, 720px);
		margin: auto auto 0;
		padding: 0;
		border: 1px solid var(--site-line);
		border-bottom: 0;
		border-radius: var(--radius-card) var(--radius-card) 0 0;
		background: var(--site-ground);
		color: var(--site-ink);
	}
	.sheet::backdrop {
		background: color-mix(in oklch, black 40%, transparent);
	}
	.sheet-inner {
		display: flex;
		flex-direction: column;
		height: min(80dvh, 720px);
	}
	.sheet-inner > :global(:first-child) {
		flex: 1;
		min-height: 0;
	}
	.sheet-foot {
		display: flex;
		justify-content: flex-end;
		padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px));
		border-top: 1px solid var(--site-line);
		margin: 0;
	}
	.sheet-close {
		min-height: 44px;
		padding: 0 18px;
		border: 1px solid var(--site-line);
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--site-ink);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	/* Under 1024 two prompts, so the welcome's actions stay in view above the composer. */
	@media (max-width: 1023px) {
		.prompts:not([data-all]) li:nth-child(n + 3) {
			display: none;
		}
	}
	@media (max-width: 639px) {
		.pg {
			padding-inline: 16px;
		}
	}
</style>
