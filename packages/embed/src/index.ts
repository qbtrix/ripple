// src/index.ts: the @ripple-ui/embed entry (dist/ripple-embed.js).
//   import { mount } from '@ripple-ui/embed';
//   const card = mount(el, spec, { theme: 'dark', onEvent });
//   card.update(next); card.setTheme('light'); card.destroy();
// - The card renders inside an open shadow root on `el`, so host CSS and the
//   embed's Tailwind never meet. The host gets data-theme, which drives both the
//   colour tokens and every `dark:` utility (embed.css).
// - mount() returns at once; the card paints after the widget chunks the spec
//   names have loaded (`ready` resolves then). Types that show up later
//   (streamed, derived by an intent layout) load on first render instead.
// - update(spec) swaps the spec in place: Ripple keeps its state store and only
//   pushes changed `state` keys, so what the user typed survives.
// - Streaming: mount with { streaming: true }, then update() with the spec so
//   far, as an object or as the raw partial JSON text; finish() ends the stream.
// - Shadow roots ignore @font-face and @property, so those go to document.head,
//   once per page. The fonts resolve next to this module wherever it is served.
import { mount as svelteMount, unmount } from 'svelte';
import type { OnEventCallback } from '@ripple-ui/core';
import { parsePartialSpec } from '$lib/streaming/json-parse.js';
import Embed from './Embed.svelte';
import css from './embed.css?inline';
import { addShadowCss, attachShadowCss } from './shadow-css.js';
import { preloadWidgets, specTypes } from './registry.js';
import { Controller, Stream, type Spec, type Theme } from './controller.svelte.js';
import inter from '../../svelte/static/fonts/inter-latin-wght-normal.woff2?embed-file';
import mono from '../../svelte/static/fonts/jetbrains-mono-latin-wght-normal.woff2?embed-file';
import display from '../../svelte/static/fonts/bricolage-grotesque-latin-wght-normal.woff2?embed-file';

export type { Spec, Theme };

export interface MountOptions {
	theme?: Theme;
	/** Every event the card emits (emit, navigate, toast, api, ...). Return a value to chain `api` results. */
	onEvent?: OnEventCallback;
	/** Treat updates as frames of a spec still arriving: incomplete nodes show placeholders until finish(). */
	streaming?: boolean;
}

export interface RippleEmbed {
	/** Resolves once the first paint is on screen. */
	readonly ready: Promise<void>;
	/** Swap the spec in place. While streaming, a string is parsed as partial JSON. */
	update(spec: Spec | string): void;
	setTheme(theme: Theme): void;
	/** Marks a streamed spec complete. */
	finish(): void;
	destroy(): void;
}

let fontsAdded = false;
function addFonts() {
	if (fontsAdded) return;
	fontsAdded = true;
	const face = (family: string, url: string, weight: string) =>
		`@font-face{font-family:'${family}';src:url('${new URL(url, import.meta.url).href}') format('woff2');font-weight:${weight};font-style:normal;font-display:swap}`;
	const style = document.createElement('style');
	style.dataset.rippleEmbed = 'fonts';
	style.textContent =
		face('Inter Variable', inter, '100 900') +
		face('JetBrains Mono Variable', mono, '100 800') +
		face('Bricolage Grotesque Variable', display, '200 800');
	document.head.append(style);
	addShadowCss(css, { liftFonts: false });
}

const live = new WeakMap<HTMLElement, RippleEmbed>();

function toSpec(next: Spec | string): Spec | null {
	if (typeof next !== 'string') return next;
	return (parsePartialSpec(next).value as Spec | null) ?? null;
}

export function mount(el: HTMLElement, spec: Spec | string, opts: MountOptions = {}): RippleEmbed {
	live.get(el)?.destroy();
	addFonts();
	const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
	root.replaceChildren();
	const detachCss = attachShadowCss(root);

	const ctl = new Controller();
	ctl.onEvent = opts.onEvent;
	const setTheme = (theme: Theme) => {
		ctl.theme = theme;
		el.dataset.theme = theme;
		el.style.colorScheme = theme;
	};
	setTheme(opts.theme ?? 'light');
	const first = toSpec(spec);
	if (opts.streaming) {
		ctl.stream = new Stream();
		ctl.stream.current = first;
	} else ctl.spec = first ?? {};

	let app: Record<string, unknown> | null = null;
	let destroyed = false;
	let seq = 0;
	const ready = preloadWidgets(specTypes(first)).then(() => {
		if (!destroyed) app = svelteMount(Embed, { target: root, props: { ctl } });
	});

	const handle: RippleEmbed = {
		ready,
		update(next) {
			const value = toSpec(next);
			if (ctl.stream) {
				// Frames apply at once; widgets they introduce load on first render.
				if (value) ctl.stream.current = value;
				void preloadWidgets(specTypes(value));
				return;
			}
			if (!value) return;
			// A whole spec waits for its new widget chunks, so it swaps in one paint.
			// The latest update wins if an earlier one is still loading.
			const mine = ++seq;
			void preloadWidgets(specTypes(value)).then(() => {
				if (mine === seq && !destroyed) ctl.spec = value;
			});
		},
		setTheme,
		finish() {
			if (ctl.stream) ctl.stream.done = true;
		},
		destroy() {
			if (destroyed) return;
			destroyed = true;
			if (app) void unmount(app);
			detachCss();
			root.replaceChildren();
			delete el.dataset.theme;
			el.style.colorScheme = '';
			if (live.get(el) === handle) live.delete(el);
		}
	};
	live.set(el, handle);
	return handle;
}
