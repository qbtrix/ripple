// src/index.tsx: <Ripple>, the React face of @ripple-ui/embed. It renders one
// div and mounts the embed into it (shadow root inside), so React never touches
// the card's DOM.
// - SSR-safe: nothing here reads window at import; the embed is dynamic-imported
//   in an effect, so a server render is just the empty div.
// - StrictMode-safe: the mount, destroy, mount sequence is guarded by a
//   cancelled flag checked after the async import.
// - Props after mount: a new `spec` calls update() (state survives), `theme`
//   calls setTheme(), `streaming` going false calls finish(). `onEvent` is read
//   through a ref, so an inline arrow does not remount anything.
'use client';
import { useEffect, useRef, type CSSProperties } from 'react';
import type { MountOptions, RippleEmbed, Spec, Theme } from '@ripple-ui/embed';

export type { RippleEvent, RippleEventResult, Spec, Theme } from '@ripple-ui/embed';

export interface RippleProps {
	/** The spec, or while `streaming`, the spec so far (an object or the raw partial JSON text). */
	spec: Spec | string;
	theme?: Theme;
	onEvent?: MountOptions['onEvent'];
	/** The spec is still arriving; set it to false when the stream ends. */
	streaming?: boolean;
	className?: string;
	style?: CSSProperties;
}

// One import for the page, shared by every <Ripple> (and StrictMode's second effect run).
let embed: Promise<typeof import('@ripple-ui/embed')> | undefined;
const loadEmbed = () => (embed ??= import('@ripple-ui/embed'));

export function Ripple({ spec, theme = 'light', onEvent, streaming = false, className, style }: RippleProps) {
	const el = useRef<HTMLDivElement>(null);
	const card = useRef<RippleEmbed | null>(null);
	const latest = useRef({ spec, theme, onEvent, streaming });
	latest.current = { spec, theme, onEvent, streaming };

	useEffect(() => {
		let cancelled = false;
		let handle: RippleEmbed | null = null;
		void loadEmbed().then(({ mount }) => {
			if (cancelled || !el.current) return;
			const now = latest.current;
			handle = mount(el.current, now.spec, {
				theme: now.theme,
				streaming: now.streaming,
				onEvent: (e) => latest.current.onEvent?.(e)
			});
			card.current = handle;
		});
		return () => {
			cancelled = true;
			handle?.destroy();
			card.current = null;
		};
	}, []);

	useEffect(() => card.current?.update(spec), [spec]);
	useEffect(() => card.current?.setTheme(theme), [theme]);
	useEffect(() => {
		if (!streaming) card.current?.finish();
	}, [streaming]);

	return <div ref={el} className={className} style={style} data-ripple="" />;
}
