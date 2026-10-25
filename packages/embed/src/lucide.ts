// src/lucide.ts: what `import * as icons from '@lucide/svelte'` becomes in the
// embed build (vite.config.ts rewrites it). Widgets that pick an icon by name
// (Icon, DropdownMenu, Sidebar, ...) index that namespace, which made Rollup
// ship every lucide icon in the first load. This object answers the same
// lookups, but each icon is its own chunk that loads on first render.
// Names are lucide's exports: canonical (ChevronRight), renamed aliases
// (Edit), and the Lucide-prefixed / Icon-suffixed forms of each. Named imports
// (`import { X } from '@lucide/svelte'`) are untouched and tree-shake as usual.
import type { Component } from 'svelte';
import { icons as loaders } from 'virtual:ripple-lucide-icons';
import { lazyComponent } from './lazy-component.js';

const made = new Map<string, Component<any>>();

function canonical(name: string): string | null {
	if (Object.hasOwn(loaders, name)) return name;
	const bare = name.replace(/^Lucide/, '').replace(/Icon$/, '');
	return Object.hasOwn(loaders, bare) ? bare : null;
}

function component(name: string): Component<any> | undefined {
	const key = canonical(name);
	if (!key) return undefined;
	let c = made.get(key);
	if (!c) made.set(key, (c = lazyComponent(loaders[key])));
	return c;
}

const icons: Record<string, Component<any>> = new Proxy({} as Record<string, Component<any>>, {
	get: (_, k) => (typeof k === 'string' ? component(k) : undefined),
	has: (_, k) => typeof k === 'string' && canonical(k) !== null,
	ownKeys: () => Object.keys(loaders),
	getOwnPropertyDescriptor: (_, k) =>
		typeof k === 'string' && canonical(k) ? { value: component(k), enumerable: true, configurable: true } : undefined
});

export default icons;
