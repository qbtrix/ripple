// discover/sections.test.ts — the shared catalogue rules: the section copy with
// the brand injected, which section each item lands in (and in what order),
// the filter each section's "All …" link sets, and the related-items heading.
// Pure, no DOM.
import { describe, expect, it } from 'vitest';
import { DISCOVER_AUDIENCES, DISCOVER_TYPES, discoverSections, groupSections, relatedHeading, sectionFilter, type DiscoverSectionKey } from './sections.js';

const it_ = (id: string, kind: string, extra: { featured?: boolean; audiences?: string[] } = {}) => ({ id, kind, featured: false, ...extra });

describe('discoverSections', () => {
  it('injects the brand into the copy that names the product', () => {
    const app = discoverSections('Paw');
    const web = discoverSections('Paw OS');
    expect(app.picks.blurb).toBe('Picked by us from what people make with Paw.');
    expect(web.picks.blurb).toBe('Picked by us from what people make with Paw OS.');
    expect(web.play.blurb).toBe('Small games, each made with Paw OS in an afternoon.');
    expect(web.more.blurb).toBe('Everything else made with Paw OS.');
    expect(web.studio.title).toBe('Made in Paw Studio');
    expect(app.studio.title).toBe('Made in Paw Studio');
  });

  it('has copy for every section key', () => {
    const keys: DiscoverSectionKey[] = ['picks', 'studio', 'shop', 'design', 'everyone', 'play', 'site', 'more'];
    const s = discoverSections('Paw');
    expect(Object.keys(s).sort()).toEqual([...keys].sort());
    for (const k of keys) expect(s[k].title && s[k].blurb && s[k].more).toBeTruthy();
  });

  it('types and audiences match the app', () => {
    expect(DISCOVER_TYPES[0]).toEqual({ value: 'all', label: 'All' });
    expect(DISCOVER_AUDIENCES.map((a) => a.label)).toEqual(['For my shop', 'For designers', 'Everyday tools', 'Just for fun']);
  });
});

describe('groupSections', () => {
  it('puts each item in its first matching section, in rule order, dropping empty ones', () => {
    const items = [
      it_('fun-tool', 'tool', { audiences: ['fun'] }),
      it_('site', 'site'),
      it_('game', 'game'),
      it_('picked-video', 'video', { featured: true }),
      it_('video', 'video', { audiences: ['design'] }),
      it_('shop-tool', 'tool', { audiences: ['shop', 'design'] }),
      it_('design-game', 'game', { audiences: ['design'] }),
      it_('every-tool', 'tool', { audiences: ['everyone'] }),
      it_('no-audiences', 'tool'),
    ];
    const out = groupSections(items);
    expect(out.map((s) => [s.key, s.items.map((i) => i.id)])).toEqual([
      ['picks', ['picked-video']],
      ['studio', ['video']],
      ['shop', ['shop-tool']],
      ['design', ['design-game']],
      ['everyone', ['every-tool']],
      ['play', ['game']],
      ['site', ['site']],
      ['more', ['fun-tool', 'no-audiences']],
    ]);
  });

  it('a shop audience on a non-tool falls through', () => {
    expect(groupSections([it_('g', 'game', { audiences: ['shop'] })]).map((s) => s.key)).toEqual(['play']);
  });

  it('returns the consumer item type unchanged', () => {
    const [s] = groupSections([{ ...it_('x', 'site'), extra: 42 }]);
    expect(s.items[0].extra).toBe(42);
  });

  it('is empty for no items', () => {
    expect(groupSections([])).toEqual([]);
  });
});

describe('sectionFilter', () => {
  it('maps a section to the filter its "All …" link sets', () => {
    expect(sectionFilter('shop')).toEqual({ kind: 'tool', audience: 'shop' });
    expect(sectionFilter('design')).toEqual({ audience: 'design' });
    expect(sectionFilter('everyone')).toEqual({ audience: 'everyone' });
    expect(sectionFilter('play')).toEqual({ kind: 'game' });
    expect(sectionFilter('site')).toEqual({ kind: 'site' });
    for (const k of ['picks', 'studio', 'more'] as const) expect(sectionFilter(k)).toBeNull();
  });
});

describe('relatedHeading', () => {
  it('reads right for every kind, music included', () => {
    expect(relatedHeading('site')).toBe('More sites');
    expect(relatedHeading('game')).toBe('More games');
    expect(relatedHeading('tool')).toBe('More tools');
    expect(relatedHeading('image')).toBe('More images');
    expect(relatedHeading('video')).toBe('More videos');
    expect(relatedHeading('music')).toBe('More music');
  });

  it('falls back for unknown kinds, prototype keys included', () => {
    expect(relatedHeading('podcast')).toBe('More like this');
    expect(relatedHeading('constructor')).toBe('More like this');
  });
});
