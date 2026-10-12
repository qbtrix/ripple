---
title: Install
description: Add @ripple-ui/svelte to a Svelte 5 app and point Tailwind v4 at its widgets.
order: 1
---

Ripple renders a JSON UI spec as a live Svelte 5 interface. It ships as one package, `@ripple-ui/svelte`. The engine underneath, `@ripple-ui/core`, comes with it as a dependency, so you don't install it separately.

## Set up with a coding agent

If you work with Claude Code, Cursor, Codex or another coding agent, paste this prompt and it does the steps on this page and the next two, then checks its work:

```text
Add Ripple to this project: a model writes a UI as a JSON spec, and the app renders it live while the JSON streams in.

Read these first (agent-friendly markdown):
- https://ripple.pocketpaw.xyz/llms.txt (index of every page)
- https://ripple.pocketpaw.xyz/docs/getting-started/install.md
- https://ripple.pocketpaw.xyz/docs/getting-started/stream-a-spec.md
- https://ripple.pocketpaw.xyz/docs/guides/prompting.md

Steps:
1. Check the stack. The renderer needs Svelte 5 and Tailwind CSS v4. If this app is not Svelte 5, stop and tell me instead of adding Svelte (https://ripple.pocketpaw.xyz/docs/concepts/headless.md covers rendering elsewhere).
2. Install @ripple-ui/svelte with the package manager this repo already uses.
3. Styles: follow "Set up Tailwind" on the Install page. Choose styles.css or theme.css by whether the app already defines shadcn tokens, and write the @source path relative to the CSS file.
4. Smoke test: render {"version":"1.0","ui":{"type":"text","props":{"text":"Ripple is installed."}}} on a page. If it shows unstyled, fix the @source path before going on.
5. Streaming: add a server endpoint that streams the model's text and a page that passes the response body to streamSpec and renders <Ripple streaming={store}>, as on the Stream a spec page. Reuse the model SDK this repo already has; if there is none, ask me which provider to use. Keep API keys in server-side env vars.
6. System prompt: build it on the server from a manifest, as on the Prompting page. Start with the slim manifest (https://github.com/qbtrix/ripple-iui/releases/latest/download/manifest.slim.json) or trim @ripple-ui/svelte/manifest.json to the widgets we need. The model must reply with one JSON object: no prose, no code fences.
7. Validation: when a stream ends, check the spec with specIssues and formatSpecIssues from @ripple-ui/svelte. Send any issues back to the model and retry at most twice.

Rules: use only widgets, props and actions from the manifest. Never edit node_modules. Keep the change small and follow this repo's conventions.

Done when the smoke test renders styled, one request to the endpoint streams a UI that grows on screen, and the project's type check and tests pass. Then list the files you changed and anything you could not verify.
```

The rest of this page is the same setup by hand.

## Add the package

```bash
bun add @ripple-ui/svelte
```

npm, pnpm and yarn work the same way. The only peer dependency is Svelte 5 (`^5.0.0`).

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
