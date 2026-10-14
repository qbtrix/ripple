// src/lib/vendor-modules.d.ts
// Ambient declarations for third-party packages that ship no TypeScript types.
// Qr.svelte `await import`s `qrcode-svg` at runtime; under `strict`/`noImplicitAny`
// svelte-check flags the untyped module, and there is no @types package, so it
// is declared here as `any`.

declare module 'qrcode-svg';
