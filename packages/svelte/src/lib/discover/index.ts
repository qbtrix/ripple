// discover/index.ts — the `./discover` export subpath: a server-renderable
// Discover library for a public catalogue. The cards (tile, row, art), the
// item view (ItemDetail with its live frame and media player), the page
// layout around them (header, search, chips, type bar, sections, skeleton,
// empty state, publish band), the hero's WhatsApp QR card (WhatsAppQrCard,
// the one stateful widget: a form, rendering an example card on the server),
// the shared catalogue copy and grouping, the item type they render, and the
// route helper for an item's own page. Pure components: props in, markup out;
// every control works by callback or as a plain link.

export { default as DiscoverTile } from './DiscoverTile.svelte';
export { default as DiscoverRow } from './DiscoverRow.svelte';
export { default as ItemArt } from './ItemArt.svelte';
export { default as DetailMedia } from './DetailMedia.svelte';
export { default as ItemDetail } from './ItemDetail.svelte';
export { default as LiveFrame } from './LiveFrame.svelte';
export { default as DiscoverHeader } from './DiscoverHeader.svelte';
export { default as DiscoverSearch } from './DiscoverSearch.svelte';
export { default as DiscoverChips } from './DiscoverChips.svelte';
export { default as DiscoverFilters } from './DiscoverFilters.svelte';
export { default as DiscoverSection } from './DiscoverSection.svelte';
export { default as DiscoverGrid } from './DiscoverGrid.svelte';
export { default as DiscoverSkeleton } from './DiscoverSkeleton.svelte';
export { default as DiscoverEmpty } from './DiscoverEmpty.svelte';
export { default as DiscoverPublish } from './DiscoverPublish.svelte';
export { default as WhatsAppQrCard } from './WhatsAppQrCard.svelte';
export { itemHref, isPlainClick, LEGACY_ITEM_PREFIXES } from './href.js';
export { tintFor, initialFor, CARD_PALETTE } from './art.js';
export {
  isStudioKind,
  httpUrl,
  primaryFor,
  mediaFor,
  rendererFor,
  usageLabel,
  showUsage,
  remixLabel,
  usedLabel,
  type DiscoverPrimary,
  type DiscoverRenderer,
} from './item.js';
export {
  DISCOVER_TYPES,
  DISCOVER_AUDIENCES,
  discoverSections,
  groupSections,
  sectionFilter,
  relatedHeading,
  type DiscoverSectionKey,
  type DiscoverAudience,
  type DiscoverSectionCopy,
  type GroupableItem,
} from './sections.js';
export { LIVE_FRAME_TRUSTED_HOST_SUFFIX, frameSandbox, isTrustedFrameHost } from './frame.js';
export { DISCOVER_VIEWS, type DiscoverView, type DiscoverOption } from './layout.js';
export type { DiscoverItem, DiscoverKind, DiscoverMediaKind, StudioKind } from './types.js';
