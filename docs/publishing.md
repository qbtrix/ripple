<!-- docs/publishing.md: how @ripple-ui/core and @ripple-ui/svelte get to npm.
     The manual first publish (owner steps, exact commands) and the CI path
     both pack through scripts/pack-release.mjs, so this doc and that script's
     header must agree on the publish shape. -->
# Publishing `@ripple-ui/core` and `@ripple-ui/svelte`

Two packages, always in this order: `@ripple-ui/core` first, then
`@ripple-ui/svelte`, which depends on it. Current versions: core `0.6.0`,
svelte `0.8.1`. On 2026-10-15 both names were 404 on npm.

## Why you publish a tarball, not the package folder

In git, `packages/svelte/package.json` depends on `"@ripple-ui/core":
"file:../core"`. That has to stay: hosts that link a ripple checkout
(paw-sites, paw-enterprise) resolve core through it, and `workspace:*` broke
them once (see CLAUDE.md). Published to npm, though, `file:../core` points at
nothing and every outside install fails.

`scripts/pack-release.mjs` (also `bun run pack:release`) fixes that at pack
time only. It:

1. rewrites core's exports without the `source` conditions (they point at
   `src/`, which is not shipped) and sets svelte's core dependency to
   `^<core version>`,
2. copies `THIRD_PARTY_NOTICES.md` into core,
3. runs `npm pack --ignore-scripts` for core, then svelte,
4. writes both `package.json` files back byte for byte (also on Ctrl-C),
5. opens each tarball and fails if its `package.json` has a `file:`,
   `link:` or `workspace:` dependency, keeps a `source` condition, or names an
   export or required file (LICENSE, notices, `dist/manifest.json`, ...) that
   is not inside.

Lifecycle scripts are skipped on purpose, so the result is the same whatever
your npm config says (`ignore-scripts=true` would otherwise silently drop
core's notices file). Never run `npm publish` inside `packages/svelte`: that
publishes the `file:` dependency.

`packages/svelte/scripts/pack-release.test.ts` runs the rewrite and the
tarball check against the real manifests in CI.

## First publish (owner, by hand)

From the repo root on an up-to-date `main`:

```bash
# 0. Names still free? Both should print a 404.
npm view @ripple-ui/core
npm view @ripple-ui/svelte
```

A 404 means no package exists, not that the scope is yours. Create the
organization `ripple-ui` at https://www.npmjs.com/org/create (free plan, public
packages). If the name is taken, stop: every import path in the docs, the site
and the skill says `@ripple-ui`.

```bash
# 1. Log in (2FA prompts on publish if your account has it on).
npm login
npm whoami

# 2. Build, pack and check both tarballs into release/.
bun install --frozen-lockfile
bun run build
bun run pack:release
#   ok  @ripple-ui/core@0.6.0    .../release/ripple-ui-core-0.6.0.tgz    228 files, ~263 kB packed
#   ok  @ripple-ui/svelte@0.8.1  .../release/ripple-ui-svelte-0.8.1.tgz  1812 files, ~1.6 MB packed
git status --short   # package.json files unchanged; the build always bumps the
                     # generatedAt stamp in packages/svelte/static/manifest.json,
                     # git checkout that file to clear it

# 3. Optional rehearsal, no upload.
npm publish --dry-run --access public ./release/ripple-ui-core-0.6.0.tgz

# 4. Publish, core first. Keep the ./ prefix: without it npm reads
#    release/x.tgz as a GitHub repo shorthand.
npm publish --access public ./release/ripple-ui-core-0.6.0.tgz
npm publish --access public ./release/ripple-ui-svelte-0.8.1.tgz

# 5. Verify.
npm view @ripple-ui/core version            # 0.6.0
npm view @ripple-ui/svelte version          # 0.8.1
npm view @ripple-ui/svelte dependencies     # '@ripple-ui/core': '^0.6.0', no file:
```

Clean-room check after publishing (any empty folder outside the repo):

```bash
npm init -y && npm install @ripple-ui/svelte svelte@5
node -e "import('@ripple-ui/core').then(m => console.log(Object.keys(m).length))"
```

npm never lets a version be published twice. A mistake means bumping the
version and publishing again; `npm unpublish` within 72 hours frees nothing,
the version number stays burned.

## Later releases

1. Bump `version` in the package(s) that changed. If core changes, bump core
   and publish it before svelte; svelte's `^` range then picks it up.
2. Same commands as above, or run the `release-manifest` workflow by hand with
   `publish_npm: true`. The workflow packs through the same script, publishes
   whichever version is not on npm yet, and attaches both tarballs and the
   manifests to a GitHub release. It needs an `NPM_TOKEN` repo secret: a
   granular access token, read and write on the `@ripple-ui` scope only, with
   an expiry. A plain tag push builds the release but does not publish to npm.
3. Provenance is off: the workflow publishes with `bun publish`, which has no
   `--provenance`.

## What depends on the publish

- **The site's install line.** The landing page copies `bun add
  @ripple-ui/svelte` (`packages/svelte/src/routes/+page.svelte`, `INSTALL`),
  and both READMEs say the same. Until the publish, that command fails.
- **The install docs page** (`packages/svelte/src/docs/getting-started/install.md`)
  still installs from the GitHub release tarballs and says the packages are
  not on npm yet. After the publish, change it to `npm install
  @ripple-ui/svelte` (core comes along as a dependency) and drop the tarball
  URLs.
- **The ripple skill.** `skills/ripple/scripts/build.mjs` loads
  `@ripple-ui/core/build` from the caller's project first and falls back to a
  ripple checkout. Once core is on npm, `npm i @ripple-ui/core` in any project
  is enough for it.
- **Hosts.** paw-enterprise and pocketpaw can drop their `file:../ripple`
  links for npm versions, which retires the build-then-reinstall loop. That is
  a separate change in each host.
