// discover/frame.ts — the sandbox LiveFrame puts on a live page. Every page
// gets allow-scripts allow-forms allow-popups allow-pointer-lock. A page on a
// trusted host (https, hostname ending in LIVE_FRAME_TRUSTED_HOST_SUFFIX) also
// gets allow-same-origin, so it keeps its own storage: games save scores in
// localStorage. Scripts plus same-origin only escape the sandbox when the
// framed page shares the embedder's origin; each published site is its own
// subdomain of pawsites.workers.dev, a registrable domain apart from
// pocketpaw.xyz and the app, so its origin is never the host's. Any other
// host stays opaque.

/** Hostname suffix whose pages keep their own origin in the frame. The leading dot
 *  makes it a subdomain match: the bare domain and look-alikes do not qualify. */
export const LIVE_FRAME_TRUSTED_HOST_SUFFIX = '.pawsites.workers.dev';

const BASE_SANDBOX = 'allow-scripts allow-forms allow-popups allow-pointer-lock';

/** True when `url` is https on a subdomain of the trusted suffix. */
export function isTrustedFrameHost(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname.endsWith(LIVE_FRAME_TRUSTED_HOST_SUFFIX);
  } catch {
    return false;
  }
}

/** The iframe sandbox for a live page at `url`. */
export const frameSandbox = (url: string | null | undefined): string =>
  isTrustedFrameHost(url) ? `${BASE_SANDBOX} allow-same-origin` : BASE_SANDBOX;
