# @ripple-ui/embed

Ripple for any web page. One ES module renders a Ripple JSON spec as a live,
interactive card inside a shadow root. It works from React, Vue, Angular or
plain HTML, and it needs no Svelte or Tailwind: the Svelte renderer, its styles
and its fonts are compiled in.

## Install

```bash
npm install @ripple-ui/embed
```

Or skip the install and import it from a CDN:

```js
import { mount } from 'https://cdn.jsdelivr.net/npm/@ripple-ui/embed@0.1.0/dist/ripple-embed.js';
```

## Usage

```js
import { mount } from '@ripple-ui/embed';

const card = mount(document.getElementById('card'), spec, {
  theme: 'dark',                         // 'light' (default) or 'dark'
  onEvent: (e) => console.log(e),        // emit, navigate, toast, api, ...
});
await card.ready;                        // first paint is on screen
card.update(nextSpec);                   // swaps in place; what the user typed survives
card.setTheme('light');
card.destroy();
```

Streaming a spec from a model: mount with `{ streaming: true }`, call
`card.update(textSoFar)` with the partial JSON (or a partial object) as it
arrives, and `card.finish()` when the stream ends. Nodes that are still
incomplete show a quiet placeholder.

The card lives in an open shadow root on the element you pass, so your page's
CSS can't reach it and its styles can't leak out. The only things added to
`document.head` are the three `@font-face` rules and the CSS `@property`
registrations, because shadow roots ignore those.

## What loads

`dist/` is one small entry plus lazy chunks loaded by relative URL, so the
folder works from any path or CDN. The first load is the engine plus the
widgets the spec actually uses; every other widget stays on the server.
Measured in Chromium (gzip of the JS fetched; fonts are separate woff2 files):

| Spec | First load |
|---|---|
| Engine alone | 147 KB |
| Overlays: tooltip, dropdown, alert | 178 KB |
| Attention explainer: markdown, heatmap, table | 182 KB |
| Same, once markdown renders math and mermaid (ripple-iui#268) | 445 KB |
| Workflow diagram (xyflow) | 267 KB |
| Simple card: chart, text, input, button | 367 KB (echarts is about 200 KB of it) |
| Fonts (Inter, plus JetBrains Mono when code shows) | 47 to 87 KB |

`examples/smoke.mjs` in the repo measures these again.

## Notes

- A Vite production build works as is (checked with Vite 7 against the packed
  tarball). `vite dev` needs one line: its dependency optimizer pre-bundles the
  package into `node_modules/.vite/deps`, where the relative font URLs no
  longer resolve, so the card falls back to system fonts. Exclude the package
  from pre-bundling (also when you use it through `@ripple-ui/react`):

  ```js
  // vite.config.js
  export default defineConfig({
    optimizeDeps: { exclude: ['@ripple-ui/embed'] }
  });
  ```

  If another bundler's dev server mangles the chunk or font URLs, exclude the
  package from its pre-bundling the same way.
- The Chart widget's echarts build includes the series it draws (bar, line,
  pie, candlestick, heatmap, gauge, radar). A `themeOverrides` option that
  needs another echarts component is ignored here.
- `dist/THIRD_PARTY_LICENSES.txt` lists every bundled npm package and font
  with its licence.

React users: [`@ripple-ui/react`](../react) wraps this in a component.
Svelte users: use [`@ripple-ui/svelte`](../svelte) directly.
