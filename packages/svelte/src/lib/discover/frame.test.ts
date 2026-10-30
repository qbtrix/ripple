// discover/frame.test.ts — the live frame's sandbox rule: allow-same-origin only
// for https on a subdomain of LIVE_FRAME_TRUSTED_HOST_SUFFIX; look-alikes, http,
// the bare domain, other hosts and junk keep the opaque sandbox. Pure, no DOM.
import { describe, expect, it } from 'vitest';
import { LIVE_FRAME_TRUSTED_HOST_SUFFIX, frameSandbox, isTrustedFrameHost } from './frame.js';

const BASE = 'allow-scripts allow-forms allow-popups allow-pointer-lock';

describe('frameSandbox', () => {
  it('the suffix is a dotted subdomain match', () => {
    expect(LIVE_FRAME_TRUSTED_HOST_SUFFIX).toBe('.pawsites.workers.dev');
  });

  it.each(['https://snake.pawsites.workers.dev', 'https://a.b.pawsites.workers.dev/play?x=1', 'https://SNAKE.PAWSITES.WORKERS.DEV/'])('%s keeps its origin', (url) => {
    expect(isTrustedFrameHost(url)).toBe(true);
    expect(frameSandbox(url)).toBe(`${BASE} allow-same-origin`);
  });

  it.each([
    'https://pawsites.workers.dev.evil.com/',
    'https://evilpawsites.workers.dev/',
    'https://pawsites.workers.dev/',
    'http://x.pawsites.workers.dev/',
    'https://x.pawsites.workers.dev@evil.com/',
    'https://example.com/',
    'https://pocketpaw.xyz/',
    'javascript:alert(1)//.pawsites.workers.dev',
    'not a url',
    '',
    null,
    undefined,
  ])('%s stays opaque', (url) => {
    expect(isTrustedFrameHost(url)).toBe(false);
    expect(frameSandbox(url)).toBe(BASE);
  });
});
