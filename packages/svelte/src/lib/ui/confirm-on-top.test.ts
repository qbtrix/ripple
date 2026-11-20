// @file ui/confirm-on-top.test.ts
// @description The shared ConfirmDialog paints above every other overlay. A host mounts it once at
//   startup, so its portal is the earliest node in <body>; at the shared z-50 any Dialog or Sheet
//   opened later paints over it, and a confirm asked from inside one shows a dimmed screen with no
//   question. Both of its layers (the box via `class`, the scrim via `overlayClass`) must sit above
//   z-50. jsdom resolves no Tailwind, so this scans the class strings (as overlay-theme.test.ts does).
import { test, expect } from 'vitest';

async function read(path: string): Promise<string> {
  // @ts-ignore ripple's tsconfig has no node types.
  const { readFileSync } = await import('node:fs');
  return readFileSync(path, 'utf8');
}

const z = (classes: string): number => Number(classes.match(/\bz-\[?(\d+)\]?/)?.[1] ?? 0);

test('ConfirmDialog lifts its box and its scrim above the z-50 overlays', async () => {
  const src = await read('src/lib/components/ui/confirm-dialog/confirm-dialog.svelte');
  const content = src.match(/<Dialog\.Content\s+([^>]*)>/)?.[1] ?? '';
  const box = content.match(/\bclass="([^"]*)"/)?.[1] ?? '';
  const scrim = content.match(/\boverlayClass="([^"]*)"/)?.[1] ?? '';
  expect(z(box)).toBeGreaterThan(50);
  expect(z(scrim)).toBeGreaterThan(50);
});

test('the overlays a confirm opens from stay at z-50', async () => {
  for (const path of ['src/lib/components/ui/dialog/dialog-content.svelte', 'src/lib/components/ui/sheet/sheet-content.svelte']) {
    expect(await read(path)).toMatch(/\bz-50\b/);
  }
});
