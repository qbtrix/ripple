// discover/sections.ts — the catalogue copy and grouping every Discover page
// shares: the type tabs, the audience chips, the section titles and blurbs
// (with the product name passed in: the app says "Paw", the website "Paw OS"),
// which section each item lands in, which filter a section's "All …" link
// sets, and the heading over an item page's related items. Pure, so the app
// and the website render the same sections in the same order without copying
// the rules.

import { isStudioKind } from './item.js';
import type { DiscoverKind } from './types.js';

export type DiscoverSectionKey = 'picks' | 'studio' | 'shop' | 'design' | 'everyone' | 'play' | 'site' | 'more';
export type DiscoverAudience = 'shop' | 'design' | 'everyone' | 'fun';

export interface DiscoverSectionCopy {
  title: string;
  blurb: string;
  /** The "see all" label. */
  more: string;
}

/** The type tabs, in display order. 'all' clears the kind filter. */
export const DISCOVER_TYPES: readonly { value: DiscoverKind | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'tool', label: 'Tools' },
  { value: 'game', label: 'Games' },
  { value: 'site', label: 'Sites' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'music', label: 'Music' },
];

/** Who an item is for: the audience chips and the publish fields share these labels. */
export const DISCOVER_AUDIENCES: readonly { value: DiscoverAudience; label: string }[] = [
  { value: 'shop', label: 'For my shop' },
  { value: 'design', label: 'For designers' },
  { value: 'everyone', label: 'Everyday tools' },
  { value: 'fun', label: 'Just for fun' },
];

/** Section copy with the product's name injected: "Paw" in the app, "Paw OS" on the website. */
export function discoverSections(brand: string): Record<DiscoverSectionKey, DiscoverSectionCopy> {
  return {
    picks: { title: 'Staff picks', blurb: `Picked by us from what people make with ${brand}.`, more: 'All staff picks' },
    studio: { title: 'Made in Paw Studio', blurb: 'Images, videos and songs. Open one with its recipe and make your own.', more: 'All Paw Studio work' },
    shop: { title: 'For your shop', blurb: 'Print it, share it, put it on the counter.', more: 'All shop tools' },
    design: { title: 'For designers', blurb: 'Small helpers for people who make things.', more: 'All design tools' },
    everyone: { title: 'Everyday tools', blurb: 'Quick answers, no sign-up.', more: 'All everyday tools' },
    play: { title: 'Play', blurb: `Small games, each made with ${brand} in an afternoon.`, more: 'All games' },
    site: { title: 'Start from a site', blurb: "Live websites with a helper that answers customers. Claim one and it's yours.", more: 'All sites' },
    more: { title: 'More to try', blurb: `Everything else made with ${brand}.`, more: 'See everything' },
  };
}

/** The minimum an item needs to be grouped. The app's and the website's item types both fit. */
export interface GroupableItem {
  featured: boolean;
  kind: string;
  audiences?: readonly string[];
}

const hasAudience = (it: GroupableItem, a: DiscoverAudience): boolean => it.audiences?.includes(a) ?? false;

const SECTION_RULES: readonly { key: DiscoverSectionKey; match: (it: GroupableItem) => boolean }[] = [
  { key: 'picks', match: (it) => it.featured },
  // Before the audience rules, so a studio item never lands in a tools section.
  { key: 'studio', match: (it) => isStudioKind(it.kind as DiscoverKind) },
  { key: 'shop', match: (it) => it.kind === 'tool' && hasAudience(it, 'shop') },
  { key: 'design', match: (it) => hasAudience(it, 'design') },
  { key: 'everyone', match: (it) => hasAudience(it, 'everyone') },
  { key: 'play', match: (it) => it.kind === 'game' },
  { key: 'site', match: (it) => it.kind === 'site' },
  // A tool aimed only at 'fun' (or no one) would otherwise vanish.
  { key: 'more', match: () => true },
];

/** Each item lands in its FIRST matching section, in input order; empty sections are dropped. */
export function groupSections<T extends GroupableItem>(items: readonly T[]): { key: DiscoverSectionKey; items: T[] }[] {
  const out = SECTION_RULES.map((r) => ({ key: r.key, items: [] as T[] }));
  for (const it of items) out[SECTION_RULES.findIndex((r) => r.match(it))].items.push(it);
  return out.filter((s) => s.items.length > 0);
}

/** The filter a section's "All …" link sets, or null when no filter shows exactly that section. */
export function sectionFilter(key: DiscoverSectionKey): { kind?: DiscoverKind; audience?: DiscoverAudience } | null {
  switch (key) {
    case 'shop':
      return { kind: 'tool', audience: 'shop' };
    case 'design':
    case 'everyone':
      return { audience: key };
    case 'play':
      return { kind: 'game' };
    case 'site':
      return { kind: 'site' };
    default:
      return null;
  }
}

const RELATED: Record<DiscoverKind, string> = {
  site: 'More sites',
  game: 'More games',
  tool: 'More tools',
  image: 'More images',
  video: 'More videos',
  music: 'More music',
};

/** The heading over an item page's related items. Unknown kinds read "More like this". */
export const relatedHeading = (kind: string): string => (Object.hasOwn(RELATED, kind) ? RELATED[kind as DiscoverKind] : 'More like this');
