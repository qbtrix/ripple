// utils/safe-color.ts: the colour allowlist for spec-controlled colour props.
// A colour from a spec is model output and may land in an attribute, a style
// declaration or a generator that concatenates strings (Qr), so only literals
// that cannot terminate either are let through: hex, rgb/rgba/hsl/hsla
// functional forms and bare keywords. Anything else falls back.
// `safeThemeColor` also admits a Ripple token reference, `var(--ripple-name)`,
// for widgets that paint through CSS (Gauge); Qr keeps the strict set because
// its generator cannot resolve a custom property.

export const COLOR_RE = /^(#[0-9a-f]{3,8}|[a-z]+|(rgb|rgba|hsl|hsla)\([0-9a-z%.,\s/]+\))$/i;
const TOKEN_RE = /^var\(--ripple-[a-z0-9-]+\)$/i;

export const safeColor = (raw: string | undefined, fallback: string): string =>
	raw && COLOR_RE.test(raw.trim()) ? raw.trim() : fallback;

/** A colour literal or a `var(--ripple-*)` token, else undefined. Never throws. */
export function safeThemeColor(raw: unknown): string | undefined {
	if (typeof raw !== 'string') return undefined;
	const c = raw.trim();
	return c && (COLOR_RE.test(c) || TOKEN_RE.test(c)) ? c : undefined;
}
