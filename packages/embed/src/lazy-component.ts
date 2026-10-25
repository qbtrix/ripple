// src/lazy-component.ts: turns a dynamic import into a component that can be
// used before it has loaded. The result is a Svelte 5 component function that
// renders Lazy.svelte with `load` added to whatever props the caller passes
// (a Proxy, so the caller's props stay reactive). Call it once per target and
// keep the result: a fresh function per render would remount every time.
import type { Component } from 'svelte';
import Lazy from './Lazy.svelte';

type Load = () => Promise<{ default: Component<any> }>;

export function lazyComponent(load: Load): Component<any> {
	return ((anchor: unknown, props: Record<PropertyKey, unknown>) =>
		(Lazy as unknown as (a: unknown, p: object) => unknown)(
			anchor,
			new Proxy(props, {
				get: (t, k) => (k === 'load' ? load : Reflect.get(t, k)),
				has: (t, k) => k === 'load' || Reflect.has(t, k),
				ownKeys: (t) => [...new Set([...Reflect.ownKeys(t), 'load'])],
				getOwnPropertyDescriptor: (t, k) =>
					k === 'load' ? { value: load, enumerable: true, configurable: true } : Reflect.getOwnPropertyDescriptor(t, k)
			})
		)) as unknown as Component<any>;
}
