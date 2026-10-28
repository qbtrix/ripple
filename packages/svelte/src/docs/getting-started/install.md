---
title: Install
description: Add Ripple to a Svelte 5 app with @ripple-ui/svelte, to a React app with @ripple-ui/react, or to any page with @ripple-ui/embed.
order: 1
---

Ripple renders a JSON UI spec as a live interface. Pick the package by your app:

- **Svelte 5**: `@ripple-ui/svelte`, styled through your Tailwind v4. Most of this page.
- **React 18 or later**: `@ripple-ui/react`. See [React](#react).
- **Plain HTML, Vue, Angular or anything else**: `@ripple-ui/embed`. See [Any framework](#any-framework).

The React and embed packages carry the Svelte renderer, its styles and its fonts compiled in, so they need no Svelte and no Tailwind in your app.

For Svelte, the engine underneath, `@ripple-ui/core`, is a dependency. It installs with the package, so you add nothing extra.

## Set up with a coding agent

If you work with Claude Code, Cursor, Codex or another coding agent, paste this prompt and it does the steps on this page and the next two, then checks its work:

```text
{{SETUP_PROMPT}}
```

The rest of this page is the same setup by hand.

## Add the package

Install the package from the npm registry. `@ripple-ui/core`, the engine underneath, comes in as a dependency:

```bash
npm install @ripple-ui/svelte
```

With Bun:

```bash
bun add @ripple-ui/svelte
```

Each [GitHub release](https://github.com/qbtrix/ripple-iui/releases) also carries the package tarballs.

The only peer dependency is Svelte 5 (`^5.0.0`).

## Set up Tailwind

The widgets are styled with Tailwind CSS v4 classes, so your app needs Tailwind v4 (for example through `@tailwindcss/vite`). Tailwind skips `node_modules` when it scans for classes, so add an `@source` line that points at the package's `dist`. The path is relative to the CSS file it sits in.

If your app has no design tokens of its own, import `styles.css`. It brings in Tailwind itself, default shadcn-style colour tokens (light, plus a `.dark` class) and Ripple's theme, so don't also `@import "tailwindcss"`:

```css
/* src/app.css */
@import "@ripple-ui/svelte/styles.css";
@source "../node_modules/@ripple-ui/svelte/dist";
```

If you already define shadcn tokens (`--background`, `--primary`, `--card` and the rest), as a shadcn-svelte app does, keep your sheet and add only the theme:

```css
@import "tailwindcss";
@import "@ripple-ui/svelte/theme.css";
@source "../node_modules/@ripple-ui/svelte/dist";
```

`theme.css` adds the `--ripple-*` tokens and their utilities (`bg-ripple-surface`, `rounded-ripple`), which default to your shadcn tokens. To restyle Ripple without touching your own tokens, override a `--ripple-*` property, scoped if you like:

```css
.my-panel .ripple-root {
  --ripple-surface: transparent;
}
```

## Dark mode and per-spec themes

Ripple follows the `.dark` class on an ancestor, the same convention shadcn uses. A spec can also carry its own theme, which applies to that render only:

```json
{
  "theme": {
    "colors": { "primary": "#3b82f6" },
    "radius": "0.5rem"
  }
}
```

Colours accept hex, OKLCH or RGB strings. The theme is scoped to that render; light and dark still come from the `.dark` class. More in [Theming](/docs/guides/theming).

## Check it works

Render a one-widget spec anywhere in a page:

```svelte
<script lang="ts">
  import { Ripple } from '@ripple-ui/svelte';
</script>

<Ripple spec={{ version: '1.0', ui: { type: 'text', props: { text: 'Ripple is installed.' } } }} />
```

If the text shows up unstyled, Tailwind isn't scanning the package. Check the `@source` path against where your CSS file lives.

## React

```bash
npm install @ripple-ui/react
```

React 18 or later is a peer dependency. A new `spec` updates the card in place, so what the user typed survives. It is SSR-safe: the server renders an empty div and the card mounts in the browser.

```tsx
import { Ripple } from '@ripple-ui/react';

export function Answer({ spec, dark }) {
  return <Ripple spec={spec} theme={dark ? 'dark' : 'light'} onEvent={(e) => console.log(e.type, e)} />;
}
```

## Any framework

`@ripple-ui/embed` is one ES module that renders a spec inside a shadow root on the element you pass, so your page's CSS can't reach the card and its styles can't leak out.

```bash
npm install @ripple-ui/embed
```

```js
import { mount } from '@ripple-ui/embed';

const card = mount(document.querySelector('#card'), spec, { theme: 'dark', onEvent: (e) => console.log(e) });
await card.ready; // first paint is on screen
card.update(nextSpec); // swaps in place; what the user typed survives
card.destroy();
```

Like the Svelte package, both are on the npm registry.
