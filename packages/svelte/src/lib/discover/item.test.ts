// discover/item.test.ts — the date and creator helpers in item.ts: absolute,
// fixed-locale UTC dates (the server and any browser print the same text, so
// hydration never rewrites a card), the "updated" rule (only when it is more
// than a day after the first publish), and avatar initials.
import { describe, expect, it } from 'vitest';
import { creatorInitials, formatDiscoverDate, publishedDate, updatedDate } from './item.js';
import type { DiscoverItem } from './types.js';

const base: DiscoverItem = { id: 'a', kind: 'tool', mediaKind: null, title: 'A', desc: '', imageUrl: null, remixCount: 0, featured: false };

describe('formatDiscoverDate', () => {
  it('prints a short English date in UTC', () => {
    expect(formatDiscoverDate('2026-10-22T10:00:00Z')).toBe('Oct 22, 2026');
    // 23:30 UTC is the next day in IST and the previous evening in PST; UTC wins.
    expect(formatDiscoverDate('2026-10-22T23:30:00Z')).toBe('Oct 22, 2026');
    expect(formatDiscoverDate('2026-10-23T01:00:00+05:30')).toBe('Oct 22, 2026');
  });

  it('returns null for missing or unparseable input', () => {
    expect(formatDiscoverDate(null)).toBeNull();
    expect(formatDiscoverDate(undefined)).toBeNull();
    expect(formatDiscoverDate('')).toBeNull();
    expect(formatDiscoverDate('not a date')).toBeNull();
  });
});

describe('publishedDate and updatedDate', () => {
  it('publishes from createdAt, falling back to updatedAt', () => {
    expect(publishedDate({ ...base, createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-03-04T00:00:00Z' })).toBe('Jan 2, 2026');
    expect(publishedDate({ ...base, updatedAt: '2026-03-04T00:00:00Z' })).toBe('Mar 4, 2026');
    expect(publishedDate(base)).toBeNull();
  });

  it('shows an update only more than a day after the first publish', () => {
    const created = '2026-10-01T00:00:00Z';
    expect(updatedDate({ ...base, createdAt: created, updatedAt: '2026-10-01T20:00:00Z' })).toBeNull();
    expect(updatedDate({ ...base, createdAt: created, updatedAt: '2026-10-02T00:00:00Z' })).toBeNull();
    expect(updatedDate({ ...base, createdAt: created, updatedAt: '2026-10-02T00:00:01Z' })).toBe('Oct 2, 2026');
    expect(updatedDate({ ...base, updatedAt: '2026-10-09T00:00:00Z' })).toBeNull();
    expect(updatedDate({ ...base, createdAt: created, updatedAt: 'garbage' })).toBeNull();
  });
});

describe('creatorInitials', () => {
  it.each([
    ['Asha Rao', 'AR'],
    ['asha', 'A'],
    ['  Mary Ann  Lee ', 'ML'],
    ['', ''],
  ])('%s -> %s', (name, want) => {
    expect(creatorInitials(name)).toBe(want);
  });
});
