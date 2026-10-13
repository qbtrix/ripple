// craft.test.ts: core's craft data against the full manifest. Every waived
// widget, every DATA_PROPS widget and prop, and every intent's widget and key
// prop exists here; the built manifest carries the waivers, the intents and the
// craft rules and lenses, and stamps exactly the listed props `data: true`.
import { describe, it, expect } from 'vitest';
import { DATA_PROPS, craft, intents, waivers } from '@ripple-ui/core/manifest';
import { buildManifest, manifestEntries } from './index.js';

const byType = new Map(manifestEntries.map((e) => [e.type, e]));

describe('craft data in the manifest', () => {
  it('every waiver names a manifest widget', () => {
    expect(waivers.filter((w) => !byType.has(w.widget)).map((w) => w.widget)).toEqual([]);
  });

  it('every data prop names a manifest widget and one of its props', () => {
    const ghosts = Object.entries(DATA_PROPS).flatMap(([type, props]) =>
      props.filter((p) => !byType.get(type)?.props[p]).map((p) => `${type}.${p}`)
    );
    expect(ghosts).toEqual([]);
  });

  it('the built manifest carries the waivers and flags exactly the data props', () => {
    const built = buildManifest();
    expect(built.waivers).toEqual(waivers);
    const flagged = built.widgets.flatMap((w) =>
      Object.entries(w.props).filter(([, s]) => s.data).map(([p]) => `${w.type}.${p}`)
    );
    const listed = Object.entries(DATA_PROPS).flatMap(([t, props]) => props.map((p) => `${t}.${p}`));
    expect(flagged.toSorted()).toEqual(listed.toSorted());
    expect(manifestEntries.some((e) => Object.values(e.props).some((s) => s.data))).toBe(false); // entries stay unstamped
  });

  it('every intent names a manifest widget and its real props or events', () => {
    const ghosts = intents.flatMap((i) => {
      const e = byType.get(i.widget);
      if (!e) return [i.widget];
      return i.props.filter((p) => !e.props[p] && !e.events?.[p]).map((p) => `${i.widget}.${p}`);
    });
    expect(ghosts).toEqual([]);
  });

  it('the built manifest carries the intents and the craft rules and lenses', () => {
    const built = buildManifest();
    expect(built.intents).toEqual(intents);
    expect(built.craft).toEqual(craft);
  });
});
