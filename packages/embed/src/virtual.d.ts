// src/virtual.d.ts: types for the build-time modules vite.config.ts provides.
declare module 'virtual:ripple-widget-loaders' {
	import type { Component } from 'svelte';
	export const loaders: Record<string, () => Promise<{ default: Component<any> }>>;
}
declare module '*.css?inline' {
	const css: string;
	export default css;
}
declare module '*?embed-file' {
	const url: string;
	export default url;
}
