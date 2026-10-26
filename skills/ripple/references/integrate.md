# Wiring Ripple into an app

Read this when a spec has to render inside an app, not only in `render.mjs`. Pick the package by the app's
framework, and never add Svelte to an app that is not Svelte.

| App | Package | Render |
|---|---|---|
| Svelte 5 | `@ripple-ui/svelte` (needs Tailwind v4) | `<Ripple {spec} />` |
| React 18 or later | `@ripple-ui/react` | `<Ripple spec={spec} />` |
| Plain HTML, Vue, Angular, anything else | `@ripple-ui/embed` | `mount(element, spec)` |

React and the embed carry the Svelte renderer, its styles and its fonts compiled in, inside a shadow root, so the
app needs no Svelte and no Tailwind. Install steps, including where the packages come from while they are not on
the npm registry: https://ripple.pocketpaw.xyz/docs/getting-started/install.md

## Svelte

```svelte
<script>
  import { Ripple } from '@ripple-ui/svelte';
  import { streamSpec } from '@ripple-ui/svelte/streaming';
  let store = $state.raw(null);
  // store = streamSpec(response.body) while the model writes
</script>

<Ripple {spec} onEvent={(e) => console.log(e.type, e)} />
<!-- streaming: <Ripple streaming={store} /> -->
```

Tailwind must scan the package: `@source "../node_modules/@ripple-ui/svelte/dist";` in the app's CSS, relative to
that file. Validate a finished spec with `specIssues` and `formatSpecIssues` from `@ripple-ui/svelte`.

## React

```tsx
import { Ripple } from '@ripple-ui/react';

<Ripple spec={spec} theme="dark" onEvent={(e) => console.log(e.type, e)} />;
// streaming: spec={textSoFar} streaming, then streaming={false} when the model is done
```

A new `spec` updates the card in place and keeps what the user typed. It is SSR-safe (the module is
`'use client'` for the Next.js app router).

## Any other page: the embed

```js
import { mount } from '@ripple-ui/embed';

const card = mount(document.querySelector('#card'), spec, { theme: 'light', onEvent: (e) => console.log(e) });
await card.ready;      // first paint is on screen
card.update(nextSpec); // swaps in place; what the user typed survives
card.setTheme('dark');
card.destroy();
```

Streaming: `mount(el, '', { streaming: true })`, then `card.update(textSoFar)` with the partial JSON as it
arrives and `card.finish()` when the stream ends.

## Events

The spec never calls the app. Local actions (`set`, `toggle`, `push`, `remove`) run inside the card; `api`,
`navigate`, `toast` and `emit` arrive at `onEvent`, and the app decides what to do. Same in all three packages.
