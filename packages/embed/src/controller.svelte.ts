// src/controller.svelte.ts: the reactive state one mounted embed renders from.
// index.svelte.ts writes these fields (update, setTheme, finish); Embed.svelte
// reads them, so every change applies in place without a remount. Stream is the
// minimal StreamSpecStore Ripple's `streaming` prop reads: the latest frame and
// whether the stream has ended.
import type { OnEventCallback } from '@ripple-ui/core';

export type Theme = 'light' | 'dark';
export type Spec = Record<string, unknown>;

export class Stream {
	current = $state.raw<Spec | null>(null);
	done = $state(false);
	error = null;
	cancel() {
		this.done = true;
	}
}

export class Controller {
	spec = $state.raw<Spec>({});
	theme = $state<Theme>('light');
	stream = $state.raw<Stream | null>(null);
	onEvent?: OnEventCallback;
}
