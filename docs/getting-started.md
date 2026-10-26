# Getting started

This page moved to the docs site: https://ripple.pocketpaw.xyz/docs/getting-started/install

Source: [`packages/svelte/src/docs/getting-started/install.md`](../packages/svelte/src/docs/getting-started/install.md)

Pick the package by your app:

- Svelte 5: `@ripple-ui/svelte`, `<Ripple {spec} />`. Needs Tailwind v4.
- React 18 or later: `@ripple-ui/react`, `<Ripple spec={spec} />`. https://ripple.pocketpaw.xyz/docs/getting-started/install#react
- Plain HTML, Vue, Angular or anything else: `@ripple-ui/embed`, `mount(document.querySelector('#card'), spec)`. https://ripple.pocketpaw.xyz/docs/getting-started/install#any-framework

React and the embed need no Svelte and no Tailwind. Package READMEs: [`packages/react`](../packages/react/README.md), [`packages/embed`](../packages/embed/README.md).

Then: https://ripple.pocketpaw.xyz/docs/getting-started/render-a-spec and https://ripple.pocketpaw.xyz/docs/getting-started/stream-a-spec
