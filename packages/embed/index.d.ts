// index.d.ts: the public types of @ripple-ui/embed, hand-written so the package
// ships with no dependency on the Svelte renderer's or the engine's types.
// src/types.check.ts fails `bun run check` if src/index.ts drifts from them.

/** A Ripple spec: `{ version, state?, ui }` or an intent spec. */
export type Spec = Record<string, unknown>;
export type Theme = 'light' | 'dark';

/** What a card's actions hand to the host (`emit`, `navigate`, `toast`, `api`, ...). */
export interface RippleEvent {
	type: 'api' | 'run_source' | 'call_binding' | 'invoke_tool' | 'navigate' | 'toast' | 'emit' | 'pin' | 'unpin' | 'animate';
	url?: string;
	method?: string;
	body?: Record<string, unknown>;
	headers?: Record<string, string>;
	source?: string;
	binding?: string;
	path?: string;
	params?: Record<string, unknown>;
	tool?: string;
	args?: Record<string, unknown>;
	target?: string;
	motion?: unknown;
	message?: string;
	variant?: 'default' | 'success' | 'error' | 'warning' | 'info';
	name?: string;
	payload?: unknown;
}

/** Return `{ ok, data }` from an `api` event to feed its `on_success` / `on_error` chain. */
export type RippleEventResult = { ok: boolean; data?: unknown; error?: { message: string; status?: number; body?: unknown } };

export interface MountOptions {
	/** Default 'light'. Drives the colour tokens and every `dark:` style. */
	theme?: Theme;
	onEvent?: (event: RippleEvent) => void | Promise<RippleEventResult | void>;
	/** Updates are frames of a spec still arriving; call finish() when it is complete. */
	streaming?: boolean;
}

export interface RippleEmbed {
	/** Resolves once the first paint is on screen (after the spec's widget chunks load). */
	readonly ready: Promise<void>;
	/** Swap the spec in place; the card's state survives. While streaming, a string is parsed as partial JSON. */
	update(spec: Spec | string): void;
	setTheme(theme: Theme): void;
	/** Marks a streamed spec complete. */
	finish(): void;
	/** Unmounts and empties the shadow root. */
	destroy(): void;
}

/**
 * Renders `spec` inside an open shadow root on `el`. Mounting again on the same
 * element replaces the previous card.
 */
export function mount(el: HTMLElement, spec: Spec | string, options?: MountOptions): RippleEmbed;
