---
title: Install
description: Add @ripple-ui/svelte to a Svelte 5 app and point Tailwind v4 at its widgets.
order: 1
---

Ripple renders a JSON UI spec as a live Svelte 5 interface. You render with `@ripple-ui/svelte`. The engine underneath, `@ripple-ui/core`, is its dependency. Until both are on the npm registry, you point your package manager at the core tarball too, as "Add the package" shows.

## Set up with a coding agent

If you work with Claude Code, Cursor, Codex or another coding agent, paste this prompt and it does the steps on this page and the next two, then checks its work:

```text
{{SETUP_PROMPT}}
```

The rest of this page is the same setup by hand.

## Add the package

The packages are not on the npm registry yet, so install them from the [GitHub release](https://github.com/qbtrix/ripple-iui/releases/tag/v0.8.1). `@ripple-ui/svelte` depends on `@ripple-ui/core`, and a package manager would look for that on the registry, so point it at the release tarball too.

With npm, install both in one command:

```bash
npm install https://github.com/qbtrix/ripple-iui/releases/download/v0.8.1/ripple-ui-core-0.6.0.tgz https://github.com/qbtrix/ripple-iui/releases/download/v0.8.1/ripple-ui-svelte-0.8.1.tgz
```

With Bun, add an override for core to `package.json` first:

```json
{
  "overrides": {
    "@ripple-ui/core": "https://github.com/qbtrix/ripple-iui/releases/download/v0.8.1/ripple-ui-core-0.6.0.tgz"
  }
}
```

Then add the Svelte package:

```bash
bun add https://github.com/qbtrix/ripple-iui/releases/download/v0.8.1/ripple-ui-svelte-0.8.1.tgz
```

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
