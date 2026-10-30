// discover/href.ts — the public route for one Discover item: /discover/<slug>
// for every kind, so the website and the app agree on one URL per item. The
// old per-kind folders are kept as LEGACY_ITEM_PREFIXES for the website's
// redirects from the routes it used to serve. isPlainClick decides when a card
// link may be taken over to open an overlay instead.

import type { DiscoverKind } from './types.js';

/** Where items of each kind used to live, before every kind moved to /discover/. */
export const LEGACY_ITEM_PREFIXES: Readonly<Partial<Record<DiscoverKind, string>>> = Object.freeze({
  tool: '/free-tools/',
  game: '/play/',
  site: '/templates/',
});

/** The item's page. `kind` is kept so call sites read the same as before; every kind routes alike. */
export function itemHref(_kind: DiscoverKind, idOrSlug: string): string {
  return `/discover/${encodeURIComponent(idOrSlug)}`;
}

/** A plain primary-button click with no modifier: the one a card may take over to
 *  open an overlay. Ctrl/cmd/shift/alt-clicks and middle clicks keep the link. */
export function isPlainClick(e: Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'defaultPrevented'>): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented;
}
