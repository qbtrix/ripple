// craft.test.ts: core's craft data against the full manifest. Every waived
// widget and every DATA_PROPS widget and prop exists here, and the built
// manifest carries the waivers and stamps exactly the listed props `data: true`.
import { describe, it, expect } from 'vitest';
import { DATA_PROPS, waivers } from '@ripple-ui/core/manifest';
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
    expect(flagged.sort()).toEqual(listed.sort());
    expect(manifestEntries.some((e) => Object.values(e.props).some((s) => s.data))).toBe(false); // entries stay unstamped
  });
});
