<!--
  @file routes/labs/c4-flow/+page.svelte
  @description Unlisted bench for C4Diagram flow playback: a fictional bakery's order flow played
    over its container map, with the transport a host draws (back, play, next, the step count and
    the current step's text). Clicking a connection jumps to its step through `onstep`. Play is
    always user-started. noindex: it is a workbench, not a page.
-->
<script lang="ts">
	import { C4Diagram } from '$lib/widgets/c4/index.js';
	import type { C4Diagram as C4DiagramData, C4Flow } from '$lib/widgets/c4/types.js';

	const diagram: C4DiagramData = {
		level: 'container',
		title: 'Crumb & Co. ordering',
		elements: [
			{ id: 'buyer', name: 'Customer', kind: 'person' },
			{ id: 'shop', name: 'Storefront', kind: 'container', technology: 'SvelteKit' },
			{ id: 'orders', name: 'Orders API', kind: 'container', technology: 'Go' },
			{ id: 'db', name: 'Orders DB', kind: 'container', type: 'database', technology: 'Postgres' },
			{ id: 'oven', name: 'Bake queue', kind: 'container', type: 'queue' },
			{ id: 'pay', name: 'Payments', kind: 'system', external: true },
		],
		relationships: [
			{ from: 'buyer', to: 'shop', label: 'Orders on' },
			{ from: 'shop', to: 'orders', label: 'Calls', technology: 'JSON' },
			{ from: 'orders', to: 'db', label: 'Reads and writes' },
			{ from: 'orders', to: 'pay', label: 'Charges' },
			{ from: 'orders', to: 'oven', label: 'Queues bakes', style: 'async' },
		],
	};

	const flow: C4Flow = {
		id: 'checkout',
		name: 'Checkout',
		steps: [
			{ from: 'buyer', to: 'shop', label: 'Places an order' },
			{ from: 'shop', to: 'orders', label: 'POST /orders', technology: 'JSON' },
			{ at: 'orders', label: 'Checks stock' },
			{ from: 'orders', to: 'pay', label: 'Charges the card' },
			{ from: 'pay', to: 'orders', label: 'Charge id', reverse: true },
			{ from: 'orders', to: 'db', label: 'Saves the order' },
			{ from: 'orders', to: 'oven', label: 'Queues the bake' },
			{ from: 'oven', to: 'buyer', label: 'Ready text', implied: true },
			{ note: 'The order is paid and baking.' },
		],
	};

	let step = $state(0);
	let playing = $state(false);
	const last = flow.steps.length - 1;
	const current = $derived(flow.steps[step]);
	const text = $derived('note' in current ? current.note : current.label);

	$effect(() => {
		if (!playing) return;
		const t = setInterval(() => (step < last ? step++ : (playing = false)), 1600);
		return () => clearInterval(t);
	});
</script>

<svelte:head>
	<title>Ripple · C4 flow</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="bench">
	<h1>C4 flow playback</h1>
	<p class="lede">{flow.name}: step through the order, or click a connection to jump to its step.</p>
	<div class="map">
		<C4Diagram {diagram} {flow} {step} onstep={(n) => (step = n)} edgeShape="curved" />
	</div>
	<div class="transport" role="group" aria-label="Flow transport">
		<button type="button" disabled={step === 0} onclick={() => step--}>Back</button>
		<button type="button" aria-pressed={playing} onclick={() => (playing = !playing)}>{playing ? 'Pause' : 'Play'}</button>
		<button type="button" disabled={step === last} onclick={() => step++}>Next</button>
		<span class="count">Step {step + 1} of {last + 1}</span>
		<span class="text">{text}</span>
	</div>
</main>

<style>
	.bench {
		max-width: var(--site-max);
		margin: 0 auto;
		padding: 48px var(--site-gutter) 96px;
	}
	h1 {
		margin: 0;
		font: 600 28px/1.15 var(--font-display);
		letter-spacing: -0.02em;
		color: var(--site-ink);
	}
	.lede {
		margin: 10px 0 24px;
		font-size: 15px;
		color: var(--site-soft);
	}
	.map {
		height: min(70vh, 640px);
		display: flex;
	}
	.transport {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-top: 16px;
		font: 13px/1.4 var(--font-sans);
		color: var(--site-soft);
	}
	.transport button {
		height: 32px;
		padding: 0 12px;
		border: 1px solid var(--site-line);
		border-radius: 999px;
		background: transparent;
		color: var(--site-ink);
		font: inherit;
		cursor: pointer;
	}
	.transport button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.count {
		font-variant-numeric: tabular-nums;
	}
	.text {
		color: var(--site-ink);
	}
</style>
