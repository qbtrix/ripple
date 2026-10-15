<!--
  @file routes/docs/widgets/[type]/+page.svelte
  @description One generated widget reference page: type, category, description,
    then the Example: a props configurator over the spec the page previews (the
    manifest example, or its first pocket when the bare example renders nothing,
    see EMPTY_EXAMPLES; the controls then edit the widget's node inside the
    pocket), or a plain SpecExample when no prop can be modelled or the widget's
    node is not in that spec. The header's Copy spec button only shows in the
    plain case; the configurator carries its own, which copies the edited spec.
    The header also has Copy for your model, View as Markdown and Open in, as
    on the other docs pages, and shows the description's `code` spans as code.
    A site-only note (PAGE_NOTES) explains an example that hides something.
    Then one row of live previews per variant-like prop, the other pocket specs,
    and the Props / Events / Node fields tables, each only when it has rows. All
    copy comes from the manifest entry. Tables scroll inside their own box so a
    phone never scrolls sideways. Indexed by Pagefind (data-pagefind-body).
-->
<script lang="ts">
	import SpecExample from '$lib/site/SpecExample.svelte';
	import PropsConfigurator from '$lib/site/docs/PropsConfigurator.svelte';
	import VariantRow from '$lib/site/docs/VariantRow.svelte';
	import { configurableProps } from '$lib/site/docs/props.js';
	import { forYourModel, SITE_URL } from '$lib/site/docs/model.js';
	import { codeSpans } from '$lib/site/docs/widgets.js';
	import OpenIn from '../../OpenIn.svelte';

	let { data } = $props();

	// Categories whose widgets are page or panel sized and need the full column to read.
	const WIDE = new Set(['composite', 'data', 'layout', 'marketing', 'research', 'vertical']);
	const configurable = $derived(data.target !== null && configurableProps(data.props).length > 0);

	let copied = $state('');

	async function copy(text: string, what: string) {
		await navigator.clipboard.writeText(text);
		copied = what;
		setTimeout(() => (copied = ''), 1500);
	}
</script>

<svelte:head>
	<title>{data.type} widget · Ripple docs</title>
	<meta name="description" content={data.description} />
</svelte:head>

{#snippet table(id: string, title: string, list: typeof data.props)}
	{#if list.length}
		<h2 {id}>{title}</h2>
		<div class="table-wrap">
			<table>
				<thead>
					<tr><th>Name</th><th>Type</th><th>Required</th><th>Description</th></tr>
				</thead>
				<tbody>
					{#each list as row (row.name)}
						<tr>
							<td><code>{row.name}</code></td>
							<td><code class="type">{row.type}</code></td>
							<td>{row.required ? 'Yes' : 'No'}</td>
							<td>{row.description}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
{/snippet}

<article class="doc" data-pagefind-body>
	<header class="head">
		<p class="crumbs">
			<a href="/docs/widgets">Widgets</a> / <a href="/docs/widgets#{data.category.id}">{data.category.title}</a>
		</p>
		<h1>{data.type}</h1>
		<p class="lede">
			{#each codeSpans(data.description) as p, i (i)}{#if p.code}<code>{p.text}</code>{:else}{p.text}{/if}{/each}
		</p>
		{#if data.staticSafe}
			<p class="badge">Renders without JS</p>
		{/if}
		<div class="actions" data-pagefind-ignore>
			{#if !configurable}
				<button type="button" onclick={() => copy(JSON.stringify(data.example, null, 2), 'spec')}
					>{copied === 'spec' ? 'Copied' : 'Copy spec'}</button
				>
			{/if}
			<button type="button" onclick={() => copy(forYourModel(data.markdown), 'model')}
				>{copied === 'model' ? 'Copied' : 'Copy for your model'}</button
			>
			<a href="/docs/widgets/{data.type}.md">View as Markdown</a>
			<OpenIn markdownUrl="{SITE_URL}/docs/widgets/{data.type}.md" title="{data.type} widget" />
			<a href={data.source} rel="noopener">Source on GitHub</a>
		</div>
		<span class="sr-only" aria-live="polite">{copied ? 'Copied to clipboard' : ''}</span>
	</header>

	<h2 id="example">Example</h2>
	{#if data.note}
		<p class="note">
			{#each codeSpans(data.note) as p, i (i)}{#if p.code}<code>{p.text}</code>{:else}{p.text}{/if}{/each}
		</p>
	{/if}
	{#if configurable}
		<PropsConfigurator spec={data.example} rows={data.props} path={data.target ?? []} wide={WIDE.has(data.category.id)} />
	{:else}
		<SpecExample spec={data.example} />
	{/if}

	{#each data.axes as axis (axis.name)}
		{@const title = data.headings.find((h) => h.id === `axis-${axis.name}`)?.text}
		<h2 id="axis-{axis.name}">{title}</h2>
		<p class="note">The example with only <code>{axis.name}</code> changed.</p>
		<VariantRow spec={data.example} {axis} />
	{/each}

	{#each data.interactive as s, i (s.name)}
		<h2 id="interactive-{i}">{s.name}</h2>
		{#if s.description}<p>{s.description}</p>{/if}
		<SpecExample spec={s.spec} />
	{/each}

	{@render table('props', 'Props', data.props)}
	{@render table('events', 'Events', data.events)}
	{@render table('node-fields', 'Node fields', data.nodeFields)}

	{#if data.prev || data.next}
		<nav class="pager" aria-label="Previous and next {data.category.title} widget" data-pagefind-ignore>
			{#if data.prev}
				<a class="prev" href="/docs/widgets/{data.prev}"><span>Previous</span><code>{data.prev}</code></a>
			{/if}
			{#if data.next}
				<a class="next" href="/docs/widgets/{data.next}"><span>Next</span><code>{data.next}</code></a>
			{/if}
		</nav>
	{/if}
</article>

<style>
	.doc {
		min-width: 0;
		font-size: 16px;
		line-height: 1.6;
	}
	.crumbs {
		margin: 0 0 8px;
		font-size: 14px;
		color: var(--site-soft);
	}
	.crumbs a {
		color: var(--site-soft);
		text-underline-offset: 3px;
	}
	.crumbs a:hover {
		color: var(--site-ink);
	}
	h1 {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 1.9rem;
		font-weight: 600;
		line-height: 1.2;
		letter-spacing: -0.01em;
		overflow-wrap: anywhere;
	}
	.lede {
		margin: 10px 0 0;
		max-width: 70ch;
		font-size: 17px;
		color: var(--site-soft);
		overflow-wrap: anywhere;
	}
	.badge {
		display: inline-block;
		margin: 14px 0 0;
		padding: 2px 9px;
		border: 1px solid var(--site-line);
		border-radius: 999px;
		font-size: 13px;
		color: var(--site-soft);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 18px;
		padding-bottom: 24px;
		border-bottom: 1px solid var(--site-line);
	}
	.actions button,
	.actions a,
	.actions :global(.open-in > button) {
		padding: 6px 11px;
		border: 1px solid var(--site-line);
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--site-soft);
		font: 500 13px/1.2 var(--font-sans);
		text-decoration: none;
		cursor: pointer;
		transition:
			color 0.15s,
			background 0.15s;
	}
	.actions button:hover,
	.actions a:hover,
	.actions :global(.open-in > button:hover) {
		color: var(--site-ink);
		background: var(--site-hover);
	}
	:is(a, button):focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}
	h2 {
		margin: 48px 0 12px;
		font-family: var(--font-display);
		font-size: 1.45rem;
		font-weight: 650;
		line-height: 1.25;
		letter-spacing: -0.01em;
	}
	.table-wrap {
		overflow-x: auto;
		margin: 16px 0;
		background: var(--scroll-hint);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 15px;
	}
	th,
	td {
		padding: 8px 12px;
		border-bottom: 1px solid var(--site-line);
		text-align: left;
		vertical-align: top;
	}
	th {
		font-weight: 600;
		white-space: nowrap;
	}
	td:last-child {
		min-width: 220px;
	}
	code {
		padding: 1px 5px;
		border: 1px solid var(--code-line);
		border-radius: 5px;
		background: var(--code-bg);
		font: 0.875em var(--font-mono);
		font-variant-ligatures: none;
	}
	/* Long union types wrap; a bordered box would break into ragged pieces. */
	code.type {
		padding: 0;
		border: 0;
		background: none;
		color: var(--site-soft);
	}
	td:nth-child(2) {
		min-width: 140px;
	}
	.pager {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		margin-top: 56px;
		padding-top: 24px;
		border-top: 1px solid var(--site-line);
	}
	.pager a {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		padding: 10px 14px;
		border: 1px solid var(--site-line);
		border-radius: var(--radius-card);
		color: var(--site-ink);
		text-decoration: none;
		transition: background 0.15s;
	}
	.pager a:hover {
		background: var(--site-hover);
	}
	.pager span {
		font-size: 13px;
		color: var(--site-soft);
	}
	.next {
		margin-left: auto;
		align-items: flex-end !important;
	}
	.note {
		margin: 0 0 12px;
		max-width: 70ch;
		color: var(--site-soft);
	}
	.note code {
		padding: 0;
		border: 0;
		background: none;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
