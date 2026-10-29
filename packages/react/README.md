# @ripple-ui/react

A React component that renders a Ripple JSON spec as a live, interactive card.
It is a thin wrapper over [`@ripple-ui/embed`](../embed), so it needs no Svelte
or Tailwind in your app.

## Install

```bash
npm install @ripple-ui/react
```

React 18 or later is a peer dependency.

## Usage

```tsx
import { Ripple } from '@ripple-ui/react';

export function Answer({ spec, dark }) {
  return (
    <Ripple
      spec={spec}
      theme={dark ? 'dark' : 'light'}
      onEvent={(e) => e.type === 'emit' && console.log(e.payload)}
    />
  );
}
```

- A new `spec` updates the card in place, so what the user typed survives.
- Streaming: pass the partial JSON text (or object) as `spec` with
  `streaming`, and set `streaming={false}` when the model is done.
- It is SSR-safe. The server renders an empty div and the card mounts in the
  browser. With the Next.js app router the module is already marked
  `'use client'`.

## Vite

In `vite dev`, Vite pre-bundles `@ripple-ui/embed` and the card's font URLs
stop resolving, so it falls back to system fonts. Production builds are fine.
Exclude the embed from pre-bundling:

```js
// vite.config.js
export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: ['@ripple-ui/embed'] }
});
```

## Size

The component itself is under 1 KB. The card's first load comes from the
embed: about 150 KB gzip for the engine, plus only the widgets the spec uses
(a chart, text, input and button card is 367 KB). See the
[embed README](../embed#what-loads) for the table.
