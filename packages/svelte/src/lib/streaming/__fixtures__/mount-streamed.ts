// @file streaming/__fixtures__/mount-streamed.ts
// @description Test-only helper: mount a spec the way a model delivers it,
//   through streamSpec() in small chunks, and record every node error box that
//   appears on the way. NodeRenderer's per-node <svelte:boundary> turns a widget
//   throw into an error box, and a later chunk can clear it, so asserting on the
//   finished render alone misses a mid-stream crash. `errors` holds the text of
//   each box seen at any point, deduplicated. The box is matched by its role and
//   title: its `data-ripple-node-error` attribute carries the node id, and Svelte
//   drops the attribute for a node without one.
//   By default the stream is cut once per partial-parse state (see stateCuts), so
//   every value is seen opened or truncated before it completes, and no render is
//   spent on a prefix that parses the same as the last. Each render here costs
//   ~10 ms under jsdom, so the cut count is what sets a streamed test's runtime.
//   Pass `chunkSize` for fixed-size slices instead (coarser, for very large specs).
//   Lives under __fixtures__ so package.json keeps it out of the published files.
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { expect, vi } from 'vitest';
import Ripple from '$lib/Ripple.svelte';
import { streamSpec } from '$lib/streaming/index.js';
import { parsePartialSpec } from '$lib/streaming/json-parse.js';

/** Every prefix length at which the partial parse reaches a new state: a
 *  container opens, a key's value first shows (a 1-char string, a number or a
 *  literal), an expression or enum value is released. Strings are compared by
 *  empty / non-empty only, so a string growing one char at a time is one state,
 *  seen truncated; its completion shows at the next cut or in the final parse.
 *  Every JSON token boundary that changes what the renderer gets is hit. */
export function stateCuts(json: string): number[] {
	const shape = (n: number) =>
		JSON.stringify(parsePartialSpec(json.slice(0, n)).value, (_k, v) => (typeof v === 'string' ? (v ? 's' : '') : v));
	const cuts: number[] = [];
	let last = shape(0);
	for (let n = 1; n < json.length; n++) {
		const now = shape(n);
		if (now !== last) cuts.push(n);
		last = now;
	}
	return [...cuts, json.length];
}

/** Yields `json` cut at stateCuts(), or in `size`-char slices when `size` is
 *  given, with a macrotask between chunks so each partial spec renders. */
export async function* chunked(json: string, size?: number) {
	let from = 0;
	const ends = size ? Array.from({ length: Math.ceil(json.length / size) }, (_, i) => Math.min((i + 1) * size, json.length)) : stateCuts(json);
	for (const to of ends) {
		yield json.slice(from, to);
		from = to;
		await new Promise((r) => setTimeout(r, 0));
	}
}

export async function mountStreamed(
	spec: object,
	{ chunkSize, props = {} }: { chunkSize?: number; props?: Record<string, unknown> } = {}
) {
	const store = streamSpec(chunked(JSON.stringify(spec), chunkSize), { throttleMs: 0 });
	const result = render(Ripple, { props: { streaming: store, ...props } });
	const seen = new Set<string>();
	const scan = () => {
		for (const el of result.container.querySelectorAll('[role="alert"]')) {
			const text = el.textContent?.replace(/\s+/g, ' ').trim() ?? '';
			if (text.includes('This widget hit an error')) seen.add(text);
		}
	};
	const observer = new MutationObserver(scan);
	observer.observe(result.container, { subtree: true, childList: true });
	await vi.waitFor(() => expect(store.done).toBe(true), { timeout: 10_000 });
	await tick();
	scan();
	observer.disconnect();
	expect(store.error).toBeNull();
	// Not the whole render result: its type names Ripple's Props, which the
	// packaged .d.ts cannot reference.
	return { container: result.container, errors: [...seen] };
}
