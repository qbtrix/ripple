# Third-party notices

Ripple is MIT licensed (see `LICENSE`). It includes code from the projects
below. Each section names the files that carry that code and reproduces the
upstream licence in full, as the licence requires.

Other credits kept next to what they cover:

- `packages/svelte/NOTICE`: beautiful-ui and the other MIT design sources
  behind the Svelte component skin.
- `packages/svelte/static/models/CREDITS.md`: author, licence and source for
  every 3D model in `static/models` (CC0, public domain, one CC BY 4.0).
- `packages/svelte/static/fonts/OFL-*.txt`: the SIL Open Font License for each
  bundled font.

## Anatomy

- Source: https://github.com/wheresryan22/anatomy (commit 689dcf9)
- Project page: https://skills.wheresryan.sh/anatomy
- Copyright (c) 2026 Ryan, MIT License (full text below)

Files derived from it:

- `packages/core/src/iso/kit.ts`: the camera, projection, extruded solids,
  outlines and SVG helpers are ported from `kit/iso-kit.ts`; the `ISO_CSS`
  selector structure is ported from `kit/iso.css`.
- `packages/core/src/iso/solids.ts`: frame, light, band, hull, prism and
  sphere are ported from `kit/lathe.mjs` (cone and gear ring are new).
- `packages/core/src/iso/scene.ts` and `packages/core/src/iso/enrich.ts` are
  new code built on the two files above; `enrich.ts` follows Anatomy's craft
  rules for detail.
- `packages/svelte/src/lib/widgets/composite/IsoScene.svelte`: the `soft`
  look's theme tokens are taken from `kit/iso.css`.
- `packages/svelte/src/lib/figures/*` draw with the kit above.

```
MIT License

Copyright (c) 2026 Ryan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## ZzFX

- Source: https://github.com/KilledByAPixel/ZzFX (v1.4.0)
- Copyright (c) 2019 - Frank Force, MIT License (full text below)

Files derived from it:

- `packages/svelte/src/lib/sound/zzfx.ts`: the sample builder, vendored and
  typed.

```
ZzFX MIT License

Copyright (c) 2019 - Frank Force

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
