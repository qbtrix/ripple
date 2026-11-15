<!-- docs/publishing.md: how the five @ripple-ui packages get to npm.
     The manual first publish (owner steps, exact commands) and the CI path
     both pack through scripts/pack-release.mjs, so this doc and that script's
     header must agree on the publish shape. -->
# Publishing the `@ripple-ui` packages

Five packages, always in this order, each after what it depends on:

1. `@ripple-ui/core` `0.6.1-next.0` (pre-release; latest stable 0.6.0)
2. `@ripple-ui/svelte` `0.9.0-next.0` (pre-release; latest stable 0.8.2; depends on core)
3. `@ripple-ui/embed` `0.1.0` (bundles svelte and core, so it has no runtime
   dependencies; it still goes after them so the release is consistent)
4. `@ripple-ui/react` `0.1.0` (depends on embed)
5. `@ripple-ui/mcp` `0.1.0` (the `ripple_render` MCP server; no dependencies,
   no build, it loads the embed from a CDN at runtime)

On 2026-10-15 core and svelte were 404 on npm; embed and react are new.

## Why you publish a tarball, not the package folder

In git, `packages/svelte/package.json` depends on `"@ripple-ui/core":
"file:../core"`. That has to stay: hosts that link a ripple checkout
(paw-sites, paw-enterprise) resolve core through it, and `workspace:*` broke
them once (see CLAUDE.md). Published to npm, though, `file:../core` points at
nothing and every outside install fails.

`scripts/pack-release.mjs` (also `bun run pack:release`) fixes that at pack
time only. It:

1. rewrites core's exports without the `source` conditions (they point at
   `src/`, which is not shipped) and turns every `file:../<sibling>`
   dependency into `^<sibling version>` (svelte on core, react on embed, and
   embed's dev-only links),
2. copies `THIRD_PARTY_NOTICES.md` into core and embed, and svelte's
   `NOTICE` into embed (embed bundles that code),
3. runs `npm pack --ignore-scripts` for core, svelte, embed, react and mcp,
4. writes every `package.json` back byte for byte (also on Ctrl-C),
5. opens each tarball and fails if its `package.json` has a `file:`,
   `link:` or `workspace:` dependency, keeps a `source` condition, or names an
   export or required file (LICENSE, notices, `dist/manifest.json`, ...) that
   is not inside.

Lifecycle scripts are skipped on purpose, so the result is the same whatever
your npm config says (`ignore-scripts=true` would otherwise silently drop
core's notices file). Never run `npm publish` inside `packages/svelte` or
`packages/react`: that publishes the `file:` dependency.

`packages/svelte/scripts/pack-release.test.ts` runs the rewrite and the
tarball check against the real manifests in CI.

## First publish (owner, by hand)

From the repo root on an up-to-date `main`:

```bash
# 0. Names still free? Each should print a 404.
npm view @ripple-ui/core
npm view @ripple-ui/svelte
npm view @ripple-ui/embed
npm view @ripple-ui/react
npm view @ripple-ui/mcp
```

A 404 means no package exists, not that the scope is yours. Create the
organization `ripple-ui` at https://www.npmjs.com/org/create (free plan, public
packages). If the name is taken, stop: every import path in the docs, the site
and the skill says `@ripple-ui`.

```bash
# 1. Log in (2FA prompts on publish if your account has it on).
npm login
npm whoami

# 2. Build, pack and check every tarball into release/.
bun install --frozen-lockfile
bun run build
bun run pack:release
#   ok  @ripple-ui/core@0.6.1    .../release/ripple-ui-core-0.6.1.tgz    228 files, ~263 kB packed
#   ok  @ripple-ui/svelte@0.9.0  .../release/ripple-ui-svelte-0.9.0.tgz  1814 files, ~1.6 MB packed
#   ok  @ripple-ui/embed@0.1.0   .../release/ripple-ui-embed-0.1.0.tgz   2025 files, ~3.2 MB packed
#   ok  @ripple-ui/react@0.1.0   .../release/ripple-ui-react-0.1.0.tgz   5 files, ~3 kB packed
#   ok  @ripple-ui/mcp@0.1.0     .../release/ripple-ui-mcp-0.1.0.tgz     5 files
git status --short   # package.json files unchanged; the build always bumps the
                     # generatedAt stamp in packages/svelte/static/manifest.json,
                     # git checkout that file to clear it

# 3. Optional rehearsal, no upload.
npm publish --dry-run --access public ./release/ripple-ui-core-0.6.1.tgz

# 4. Publish in order. Keep the ./ prefix: without it npm reads
#    release/x.tgz as a GitHub repo shorthand.
npm publish --access public ./release/ripple-ui-core-0.6.1.tgz
npm publish --access public ./release/ripple-ui-svelte-0.9.0.tgz
npm publish --access public ./release/ripple-ui-embed-0.1.0.tgz
npm publish --access public ./release/ripple-ui-react-0.1.0.tgz
npm publish --access public ./release/ripple-ui-mcp-0.1.0.tgz

# 5. Verify.
npm view @ripple-ui/core version            # 0.6.1
npm view @ripple-ui/svelte version          # 0.9.0
npm view @ripple-ui/svelte dependencies     # '@ripple-ui/core': '^0.6.1', no file:
npm view @ripple-ui/embed version           # 0.1.0
npm view @ripple-ui/embed dependencies      # nothing: the renderer is bundled
npm view @ripple-ui/react dependencies      # '@ripple-ui/embed': '^0.1.0'
```

Clean-room check after publishing (any empty folder outside the repo):

```bash
npm init -y && npm install @ripple-ui/svelte svelte@5
node -e "import('@ripple-ui/core').then(m => console.log(Object.keys(m).length))"

# React, in a fresh Vite app: no svelte, echarts or bits-ui should appear.
npm install @ripple-ui/react react react-dom && ls node_modules | grep -i svelte
```

The embed also loads straight from a CDN once published:
`https://cdn.jsdelivr.net/npm/@ripple-ui/embed@0.1.0/dist/ripple-embed.js`.

npm never lets a version be published twice. A mistake means bumping the
version and publishing again; `npm unpublish` within 72 hours frees nothing,
the version number stays burned.

## Later releases

1. Bump `version` in the package(s) that changed. If core changes, bump core
   and publish it before svelte; svelte's `^` range then picks it up. The
   embed bundles svelte and core at build time, so a renderer fix reaches
   embed (and react) users only when embed is bumped and published too.
2. Same commands as above, or run the `release-manifest` workflow by hand with
   `publish_npm: true`. The workflow packs through the same script, publishes
   whichever version is still unpublished, in the order above, and attaches every tarball and the
   manifests to a GitHub release. It authenticates with npm trusted
   publishing (below), so there is no npm token in the repo. A plain tag push
   builds the release but does not publish to npm.
3. Pre-releases: give the version a suffix (`0.9.0-next.0`, `1.0.0-rc.1`) and
   dispatch the workflow with the matching tag (`v0.9.0-next.0`). Any version
   with a `-` publishes under its identifier as the npm dist-tag (`next`,
   `rc`), never `latest`, so `npm install @ripple-ui/svelte` keeps resolving
   the last stable; a host opts in with the exact version or `@next`. The tag
   makes a GitHub pre-release. A `^` range on a pre-release only matches
   pre-releases of that same version, so pin pre-releases exactly in hosts.
   To go stable, drop the suffix (`0.9.0`) and dispatch `v0.9.0`.
4. The workflow publishes with `npm publish --provenance` (npm pinned to
   11.21.2 on Node 24), so every CI release carries a signed provenance
   statement linking it to the commit and workflow run.

## Trusted publishing (CI auth)

The workflow gets a short-lived OIDC token from GitHub (`permissions:
id-token: write`) and npm swaps it for publish rights, only if the package has
a trusted publisher that matches. npm checks the tarball's
`repository.url` against this repo exactly, which is why every
`package.json` says `git+https://github.com/qbtrix/ripple.git`
(`pack-release.test.ts` fails if one drifts).

A package must exist on npm before it can get a trusted publisher, so a brand
new package is published by hand first (the steps above), then configured.

Per package, on npmjs.com: package page, **Settings**, **Trusted
publishing**, **GitHub Actions**:

| Field | Value |
|---|---|
| Organization or user | `qbtrix` |
| Repository | `ripple` |
| Workflow filename | `release-manifest.yml` |
| Environment name | `npm-publish` |
| Allowed actions | direct `npm publish` on |

The environment name ties publishing to the reviewer-gated `npm-publish`
environment, so a tag-push run (which also has `id-token: write`) cannot
publish. npm does not check the settings when you save them; a typo shows up
as an auth error on the next dispatch. A new trusted publisher that has not
published within 2 days expires, so add it right before the first dispatch.

After the first green CI publish: delete any `NPM_TOKEN` repo secret, and on
each package turn on **Require two-factor authentication and disallow
tokens**. That leaves two ways in: this workflow, and a person with 2FA.

## What depends on the publish

- **The site's install line.** The landing page copies `bun add
  @ripple-ui/svelte` (`packages/svelte/src/routes/+page.svelte`, `INSTALL`),
  and the READMEs say the same. With the packages published, that command works.
- **The install docs page** (`packages/svelte/src/docs/getting-started/install.md`)
  installs from npm with `npm install @ripple-ui/svelte` (core comes along as a
  dependency). Each GitHub release still carries the tarballs. The site footer
  links the npm package page.
- **The ripple skill.** `skills/ripple/scripts/build.mjs` loads
  `@ripple-ui/core/build` from the caller's project first and falls back to a
  ripple checkout. Once core is on npm, `npm i @ripple-ui/core` in any project
  is enough for it.
- **Hosts.** paw-enterprise and pocketpaw can drop their `file:../ripple`
  links for npm versions, which retires the build-then-reinstall loop. That is
  a separate change in each host.
