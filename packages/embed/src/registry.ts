// src/registry.ts: the lazy widget registry the embed build swaps in for the
// Svelte package's eager one (svelte/src/lib/widgets/index.ts, see
// vite.config.ts). Same exported functions, so Ripple.svelte and
// validate-catalog-bound.ts use it unchanged.
// - Each widget type loads its own chunk on first use. getWidget() on a known
//   type that has not loaded yet starts the load and returns Pending; the loaded
//   map is a SvelteMap, so NodeRenderer's $derived(getWidget(type)) re-runs and
//   swaps in the real widget when the chunk lands. That on-miss path is what
//   covers types no pre-walk can see: streamed frames, intent layouts, organisms.
// - preloadWidgets(specTypes(spec)) fetches everything a spec names in parallel,
//   so mount() can wait for it and paint once, without a parent-then-child waterfall.
// - A failed chunk is reported once and the type falls back to the renderer's
//   "not in the catalog" box rather than spinning forever.
import type { Component } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { loaders as builtIn } from 'virtual:ripple-widget-loaders';
import Pending from './Pending.svelte';

type Loader = () => Promise<{ default: Component<any> }>;
const loaders = builtIn as Record<string, Loader>;
const loaded = new SvelteMap<string, Component<any>>();
const inflight = new Map<string, Promise<void>>();
const failed = new Set<string>();
const custom = new Set<string>();
const removed = new Set<string>();

const lazy = (type: string) => Object.hasOwn(loaders, type) && !removed.has(type) && !custom.has(type);

function load(type: string): Promise<void> {
	if (!lazy(type) || loaded.has(type) || failed.has(type)) return Promise.resolve();
	let p = inflight.get(type);
	if (!p) {
		p = loaders[type]().then(
			(m) => {
				if (lazy(type)) loaded.set(type, m.default);
			},
			(err) => {
				failed.add(type);
				loaded.delete(type);
				console.warn(`[ripple-embed] could not load widget "${type}"`, err);
			}
		);
		inflight.set(type, p);
	}
	return p;
}

export function getWidget(type: string): Component<any> | undefined {
	const c = loaded.get(type);
	if (c || !lazy(type) || failed.has(type)) return c;
	void load(type);
	return Pending;
}

export function registerWidget(type: string, component: Component<any>): void {
	removed.delete(type);
	custom.add(type);
	loaded.set(type, component);
}

export function unregisterWidget(type: string): void {
	custom.delete(type);
	removed.add(type);
	loaded.delete(type);
}

export function hasWidget(type: string): boolean {
	return custom.has(type) || lazy(type);
}

export function getWidgetTypes(): string[] {
	return [...new Set([...Object.keys(loaders), ...custom])].filter(hasWidget);
}

export function resetRegistry(): void {
	for (const type of custom) loaded.delete(type);
	custom.clear();
	removed.clear();
}

/** Every string `type` anywhere in a spec, keyed or nested, that names a lazy widget. */
export function specTypes(spec: unknown, out = new Set<string>()): Set<string> {
	if (Array.isArray(spec)) for (const v of spec) specTypes(v, out);
	else if (spec && typeof spec === 'object') {
		for (const [k, v] of Object.entries(spec)) {
			if (k === 'type' && typeof v === 'string') {
				if (lazy(v)) out.add(v);
			} else specTypes(v, out);
		}
	}
	return out;
}

/** Loads the given widget types in parallel. Never rejects. */
export function preloadWidgets(types: Iterable<string>): Promise<void> {
	return Promise.all([...types].map(load)).then(() => undefined);
}
