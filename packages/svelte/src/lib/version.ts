/**
 * @file version.ts
 * @description Single source of truth for the Ripple library version, as a
 *   plain TS constant. The manifest used to read this via
 *   `import pkg from '../../../package.json'`, but the manifest is a CLIENT
 *   module (the visual editor is its first browser consumer), and pulling the
 *   project-root package.json into the client path trips Vite's
 *   `server.fs.allow` guard and 500s `vite dev` (most visible in a worktree
 *   checkout). A plain constant works in BOTH places the version is needed: the
 *   browser bundle AND the out-of-Vite bun build script
 *   (scripts/build-manifest.ts) — unlike a Vite `define`, which would be
 *   undefined under bun. version.test.ts asserts this stays in lockstep with
 *   package.json so a release bump can't silently drift.
 * Released versions: svelte 0.8.2 with core 0.6.0, embed 0.1.0 and react 0.1.0. A bump
 *   changes this constant and packages/svelte/package.json together.
 */

export const RIPPLE_VERSION = '0.8.2';
