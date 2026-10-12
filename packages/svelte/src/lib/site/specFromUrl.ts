// lib/site/specFromUrl.ts — Reads and writes the spec a playground link carries.
// `?spec=<url-encoded JSON>` or `?s=<base64url JSON>` (spec wins if both).
// The encoded value is size-capped BEFORE decoding, the result goes through
// JSON.parse only (never eval) and must be an object with a `ui` or `intent`
// (parseSpec, which the playground's JSON editor uses too).
// specFromUrl returns null when the URL carries neither param, so the caller
// keeps its default; an error string when it carries a bad one, for an inline
// message. shareLink is the way back: minified, UTF-8, base64url, as `?s=`;
// null when that is over the cap specFromUrl enforces.

export const SPEC_URL_MAX = 64 * 1024;

export type SpecFromUrl = { text: string } | { error: string } | null;

function fromBase64Url(value: string): string {
	const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
	return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function specFromUrl(search: string): SpecFromUrl {
	const params = new URLSearchParams(search);
	const plain = params.get('spec');
	const packed = plain == null ? params.get('s') : null;
	const raw = plain ?? packed;
	if (raw == null) return null;
	if (!raw.trim()) return { error: 'The link has an empty spec.' };
	if (raw.length > SPEC_URL_MAX) return { error: `The linked spec is over ${SPEC_URL_MAX / 1024} KB, so it was not loaded.` };

	let text: string;
	try {
		text = packed != null ? fromBase64Url(packed.trim()) : raw;
	} catch {
		return { error: 'The linked spec is not valid base64url, so it was not loaded.' };
	}
	const parsed = parseSpec(text);
	if ('error' in parsed) return { error: `The linked ${parsed.json ? 'JSON' : 'spec'} is ${parsed.error}` };
	return { text: JSON.stringify(parsed.spec, null, 2) };
}

/** JSON text to a Ripple spec object, or why not (lower case, to follow "is"); `json` when it parsed. */
export function parseSpec(text: string): { spec: Record<string, unknown> } | { error: string; json: boolean } {
	let spec: unknown;
	try {
		spec = JSON.parse(text);
	} catch (e) {
		return { error: `not valid JSON: ${e instanceof Error ? e.message : String(e)}`, json: false };
	}
	if (spec === null || typeof spec !== 'object' || Array.isArray(spec) || !('ui' in spec || 'intent' in spec)) {
		return { error: 'not a Ripple spec (it needs a "ui" or an "intent").', json: true };
	}
	return { spec: spec as Record<string, unknown> };
}

function toBase64Url(text: string): string {
	let bin = '';
	for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A link to `base` (its query and hash replaced) that opens `spec`; null when too large for one. */
export function shareLink(spec: unknown, base: string): string | null {
	const packed = toBase64Url(JSON.stringify(spec));
	if (packed.length > SPEC_URL_MAX) return null;
	const url = new URL(base);
	url.search = `?s=${packed}`;
	url.hash = '';
	return url.href;
}
